import crypto from 'crypto';
import { pool, query } from '../db.js';
import { FIELD_ALIASES, REQUIRED_FIELDS, readSheet, autoMapping, parseDT, cleanStr, INVALID, FIELD_LABELS } from '../lib/parse.js';
import { computeDurations } from './kpiService.js';
import { maskName, maskId } from '../lib/mask.js';
import { STEPS } from '../lib/steps.js';
import { classify, REASON_KEYS, DEFAULT_SETTINGS } from '../lib/rules.js';

const TS_FIELDS = ['t_order', 't_prepare', 't_verify', 't_dispense', 't_nurse', 't_ipd'];

/** วิเคราะห์ชีต: แปลงทุกแถว ตรวจ error / duplicate / anomaly (ยังไม่เขียน DB) */
export function analyzeSheet(wb, sheetName, mappingIn, settings = DEFAULT_SETTINGS) {
  const { rows, headers, headerRow } = readSheet(wb, sheetName);
  const mapping = mappingIn && Object.keys(mappingIn).length ? mappingIn : autoMapping(headers);
  const missingRequired = REQUIRED_FIELDS.filter((f) => mapping[f] == null || mapping[f] === '');
  const out = { sheet: sheetName, headers, headerRow, mapping, missingRequired, records: [], errors: [], stats: {
    rows: rows.length, blank: 0, footer: 0, valid: 0, errors: 0, repeatedInFile: 0, anomalies: 0, missingByField: {},
    usable: 0, excluded: 0, verifyFilled: 0, classCounts: Object.fromEntries(REASON_KEYS.map((k) => [k, 0])), missingAdminByWard: [],
  } };
  if (missingRequired.length) return out;

  const get = (row, f) => (mapping[f] == null || mapping[f] === '' ? null : row[Number(mapping[f])] ?? null);
  const seen = new Map();
  TS_FIELDS.forEach((f) => { out.stats.missingByField[f] = 0; });
  let minD = null; let maxD = null;
  const adminMissing = new Map(); // ward -> จำนวนแถวที่ไม่มีเวลาพยาบาลให้ยา
  const drugMap = new Map();      // item_code -> ยาที่มีแถว "ใช้ได้" ในไฟล์ (ให้ user เลือกตัดก่อนบันทึก)

  rows.forEach((row, i) => {
    const rowNo = out.headerRow + 2 + i; // เลขแถวใน Excel
    if (!row || row.every((c) => c == null || String(c).trim() === '')) { out.stats.blank++; return; }
    // แถวท้ายรายงานของระบบ (เช่น "ผู้พิมพ์ ... WaitingTimeSTAT.rpt") ไม่ใช่ข้อมูล — ข้ามโดยไม่นับเป็น error
    if (row.some((c) => typeof c === 'string' && /ผู้พิมพ์|\.rpt\b/i.test(c))) { out.stats.footer++; return; }
    const errs = [];
    const badTs = [];
    const item_code = cleanStr(get(row, 'item_code'));
    if (!item_code) errs.push('ไม่มี item_code');
    const ts = {};
    for (const f of TS_FIELDS) {
      const v = parseDT(get(row, f));
      if (v === INVALID) {
        ts[f] = null;
        // เวลาสั่งยาผิดรูปแบบ = ระบุเดือนไม่ได้ จึงเป็น error; ช่องอื่นที่ผิดรูปแบบ (เช่นปี 1773) ถือว่าไม่มีข้อมูล และ flag ไว้
        if (f === 't_order') errs.push(`รูปแบบวันเวลาไม่ถูกต้อง (${FIELD_LABELS[f]})`); else badTs.push(f);
      } else ts[f] = v;
    }
    if (!ts.t_order && !errs.length) errs.push('ไม่มีเวลาแพทย์สั่ง');
    if (errs.length) { out.stats.errors++; out.errors.push({ row: rowNo, message: errs.join('; ') }); return; }

    const vn_an = cleanStr(get(row, 'vn_an'));
    const pn = cleanStr(get(row, 'pn'));
    // key = VN/AN + PN + item_code + เวลาสั่ง ; แถวที่ key ซ้ำกันในไฟล์เดียวกันถือเป็นรายการยาซ้ำจริง (นับทุกแถวเหมือน Excel เดิม)
    // จึงใส่ลำดับที่ซ้ำ (#n) ต่อท้าย key -> import ไฟล์เดิมซ้ำจะถูกตรวจจับเป็น duplicate ได้ถูกต้อง
    const base = [vn_an, pn, item_code, ts.t_order].join('|');
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    if (n > 0) out.stats.repeatedInFile++;
    const key = crypto.createHash('sha1').update(n ? `${base}#${n}` : base).digest('hex');

    TS_FIELDS.forEach((f) => { if (!ts[f]) out.stats.missingByField[f]++; });
    // เวลาเภสัชตรวจยาว่าง → ใช้เวลาเภสัชจ่ายยาแทน (เป็นขั้นตอนเดียวกัน)
    if (!ts.t_verify && ts.t_dispense) { ts.t_verify = ts.t_dispense; out.stats.verifyFilled++; }
    const { d, reasons } = computeDurations(ts);
    badTs.forEach((f) => reasons.push(`BADTS:${f}`));
    if (reasons.length) out.stats.anomalies++;
    const orderDate = ts.t_order.slice(0, 10);
    if (!minD || orderDate < minD) minD = orderDate;
    if (!maxD || orderDate > maxD) maxD = orderDate;

    const ward = cleanStr(get(row, 'ward'));
    const excl_reason = classify({ ward, ...ts }, settings);
    if (excl_reason) {
      out.stats.excluded++; out.stats.classCounts[excl_reason]++;
      if (excl_reason === 'NO_ADMIN') adminMissing.set(ward || '(ไม่ระบุ)', (adminMissing.get(ward || '(ไม่ระบุ)') || 0) + 1);
    } else {
      out.stats.usable++;
      const dm = drugMap.get(item_code) || { item_code, item_name: cleanStr(get(row, 'item_name')), n: 0 };
      dm.n++;
      drugMap.set(item_code, dm);
    }

    out.records.push({
      dedupe_key: key,
      hn: maskId(cleanStr(get(row, 'hn'))), vn_an: maskId(vn_an), patient_name: maskName(cleanStr(get(row, 'name'))),
      item_code, item_name: cleanStr(get(row, 'item_name')), pn, order_by: cleanStr(get(row, 'order_by')),
      ward, room: cleanStr(get(row, 'room')), excl_reason,
      high_alert_flag: /high/i.test(String(get(row, 'high_alert') ?? '')),
      total_src: cleanStr(get(row, 'total')),
      ...ts, order_date: orderDate, ...d,
      anomaly: reasons.length > 0, anomaly_reasons: reasons.length ? reasons.join(',') : null,
    });
    out.stats.valid++;
  });
  out.stats.dateFrom = minD; out.stats.dateTo = maxD;
  out.drugs = [...drugMap.values()].sort((a, b) => b.n - a.n || a.item_code.localeCompare(b.item_code));
  out.stats.missingAdminByWard = [...adminMissing].map(([ward, n]) => ({ ward, n })).sort((a, b) => b.n - a.n || a.ward.localeCompare(b.ward));
  return out;
}

export async function countExisting(keys) {
  let n = 0;
  for (let i = 0; i < keys.length; i += 5000) {
    const { rows } = await query('SELECT count(*)::int AS n FROM orders WHERE dedupe_key = ANY($1)', [keys.slice(i, i + 5000)]);
    n += rows[0].n;
  }
  return n;
}

const COLS = ['import_id', 'dedupe_key', 'hn', 'vn_an', 'patient_name', 'item_code', 'item_name', 'pn', 'order_by', 'ward', 'room',
  'high_alert_flag', 'total_src', ...TS_FIELDS, 'order_date', ...STEPS.map((s) => s.col), 'anomaly', 'anomaly_reasons', 'excl_reason'];

/** drugExclusions = { codes: ยาที่เลือกตัด, listed: ยาทั้งหมดที่แสดงให้เลือก } -> ตั้งค่าตัดยาของทุกเดือนที่อยู่ในไฟล์ (ติ๊กออก = นำกลับมาคิด) */
export async function commitImport({ analysis, fileName, mode, drugExclusions = null }) {
  const client = await pool.connect();
  let imported = 0; let updated = 0; let skipped = 0;
  try {
    await client.query('BEGIN');
    const b = await client.query(
      `INSERT INTO import_batches (file_name, sheet_name, mode, total_rows, errors, anomalies, mapping, error_samples, summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [fileName, analysis.sheet, mode, analysis.stats.rows - analysis.stats.blank - analysis.stats.footer, analysis.stats.errors, analysis.stats.anomalies,
        JSON.stringify(analysis.mapping), JSON.stringify(analysis.errors.slice(0, 100)),
        JSON.stringify({ usable: analysis.stats.usable, excluded: analysis.stats.excluded, classCounts: analysis.stats.classCounts, missingAdminByWard: analysis.stats.missingAdminByWard })]);
    const importId = b.rows[0].id;
    const recs = analysis.records.map((r) => ({ ...r, import_id: importId }));
    const CH = 300;
    for (let i = 0; i < recs.length; i += CH) {
      const chunk = recs.slice(i, i + CH);
      const params = [];
      const values = chunk.map((r) => `(${COLS.map((c) => { params.push(r[c] ?? null); return `$${params.length}`; }).join(',')})`).join(',');
      const upd = COLS.filter((c) => c !== 'dedupe_key').map((c) => `${c}=EXCLUDED.${c}`).join(',');
      const sql = mode === 'overwrite'
        ? `INSERT INTO orders (${COLS.join(',')}) VALUES ${values} ON CONFLICT (dedupe_key) DO UPDATE SET ${upd} RETURNING (xmax = 0) AS inserted`
        : `INSERT INTO orders (${COLS.join(',')}) VALUES ${values} ON CONFLICT (dedupe_key) DO NOTHING RETURNING true AS inserted`;
      const res = await client.query(sql, params);
      const ins = res.rows.filter((r) => r.inserted).length;
      imported += ins;
      updated += res.rows.length - ins;
      skipped += chunk.length - res.rows.length;
    }
    await client.query('UPDATE import_batches SET imported=$2, updated=$3, skipped=$4 WHERE id=$1', [importId, imported, updated, skipped]);
    // บันทึกยาที่เลือกตัดออก ใน transaction เดียวกับข้อมูล — Dashboard/Report จะเห็นข้อมูลหลังตัดยาแล้วเท่านั้น
    let drugsExcluded = 0;
    if (drugExclusions) {
      const clean = (a) => [...new Set((Array.isArray(a) ? a : []).map((c) => String(c).trim()).filter(Boolean))];
      const codes = clean(drugExclusions.codes);
      const listed = clean(drugExclusions.listed);
      const months = [...new Set(analysis.records.map((r) => r.order_date.slice(0, 7)))];
      for (const m of months) {
        if (listed.length) await client.query('DELETE FROM drug_exclusions WHERE month_key = $1 AND item_code = ANY($2)', [m, listed]);
        if (codes.length) await client.query(`INSERT INTO drug_exclusions (month_key, item_code) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`, [m, codes]);
      }
      drugsExcluded = codes.length;
    }
    await client.query('COMMIT');
    return { importId, imported, updated, skipped, errors: analysis.stats.errors, anomalies: analysis.stats.anomalies, drugsExcluded };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
