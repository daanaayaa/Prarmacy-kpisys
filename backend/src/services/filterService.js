import { query } from '../db.js';
import { DEFAULT_SETTINGS, classify } from '../lib/rules.js';
import { DRUG_EXCL, USABLE } from './kpiService.js';

/* ---------- เกณฑ์การกรอง (app_settings) ---------- */
export async function getSettings() {
  const { rows } = await query(`SELECT key, value FROM app_settings WHERE key = ANY($1)`, [Object.keys(DEFAULT_SETTINGS)]);
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

export async function saveSettings(body) {
  const hours = Number(body.max_order_nurse_hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 72) throw Object.assign(new Error('จำนวนชั่วโมงต้องอยู่ระหว่าง 0–72'), { status: 400 });
  const raw = Array.isArray(body.excluded_locations) ? body.excluded_locations : String(body.excluded_locations || '').split(/[\n,;]+/);
  const locs = [...new Set(raw.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
  const up = (key, value) => query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [key, JSON.stringify(value)]);
  await up('max_order_nurse_hours', hours);
  await up('excluded_locations', locs);
}

/** ตรวจข้อมูลที่มีใน DB ใหม่ทั้งหมดด้วยเกณฑ์ปัจจุบัน (ใช้หลังแก้เกณฑ์ / หลัง migrate) */
export async function reclassifyAll() {
  const settings = await getSettings();
  const { rows } = await query('SELECT id, ward, t_order, t_dispense, t_nurse, excl_reason FROM orders');
  const ids = []; const reasons = [];
  for (const r of rows) {
    const next = classify(r, settings);
    if ((next || null) !== (r.excl_reason || null)) { ids.push(r.id); reasons.push(next); }
  }
  for (let i = 0; i < ids.length; i += 5000) {
    await query(
      `UPDATE orders o SET excl_reason = v.r FROM unnest($1::bigint[], $2::text[]) AS v(id, r) WHERE o.id = v.id`,
      [ids.slice(i, i + 5000), reasons.slice(i, i + 5000)]);
  }
  return { checked: rows.length, changed: ids.length };
}

/* ---------- ยาที่ตัดออกจาก KPI ---------- */
export const monthKeyOf = (year, month) => {
  if (!year || !month) return '*';
  return `${Number(year)}-${String(Number(month)).padStart(2, '0')}`;
};

/** ยาที่มีในข้อมูลเดือนนั้น (เฉพาะแถวที่ผ่านกฎข้อมูลดิบ) + สถานะว่าถูกตัดออกอยู่หรือไม่ */
export async function drugCandidates({ year, month, q, limit = 300 }) {
  const params = [];
  const conds = [`o.excl_reason IS NULL`];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  const y = parseInt(year, 10); const m = parseInt(month, 10);
  if (y) {
    const from = m ? `${y}-${String(m).padStart(2, '0')}-01` : `${y}-01-01`;
    const to = m ? (m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`) : `${y + 1}-01-01`;
    conds.push(`o.order_date >= ${add(from)}::date AND o.order_date < ${add(to)}::date`);
  }
  const term = String(q || '').trim();
  if (term) {
    const esc = term.replace(/[\\%_]/g, '\\$&');
    const p = add(`%${esc}%`);
    conds.push(`(o.item_code ILIKE ${p} OR o.item_name ILIKE ${p})`);
  }
  const key = monthKeyOf(y, m);
  const { rows } = await query(
    `SELECT o.item_code, max(o.item_name) AS item_name, count(*)::int AS n,
            (count(*) FILTER (WHERE ${DRUG_EXCL}))::int AS n_excluded,
            bool_or(EXISTS (SELECT 1 FROM drug_exclusions de WHERE de.item_code = o.item_code AND de.month_key = ${add(key)})) AS excluded_here,
            bool_or(EXISTS (SELECT 1 FROM drug_exclusions de WHERE de.item_code = o.item_code AND de.month_key = '*')) AS excluded_all
       FROM orders o WHERE ${conds.join(' AND ')}
      GROUP BY o.item_code ORDER BY n DESC, o.item_code LIMIT ${Math.min(Number(limit) || 300, 1000)}`, params);
  return { key, items: rows };
}

/**
 * ยาที่เคยตั้งแบบ "ทุกเดือน" (month_key = '*') -> แตกเป็นรายเดือน (ทุกเดือนที่มีข้อมูล + extraMonths) แล้วลบ '*'
 * ทำให้ทุกเดือนแก้ไขแยกกันได้ และไม่มีรายการ "ล็อก" อีกต่อไป
 */
export async function expandAllMonths(extraMonths = []) {
  const has = await query(`SELECT 1 FROM drug_exclusions WHERE month_key = '*' LIMIT 1`);
  if (!has.rowCount) return 0;
  await query(
    `INSERT INTO drug_exclusions (month_key, item_code)
     SELECT m.k, e.item_code FROM drug_exclusions e
       CROSS JOIN (SELECT DISTINCT to_char(order_date, 'YYYY-MM') AS k FROM orders UNION SELECT unnest($1::text[])) m
      WHERE e.month_key = '*' ON CONFLICT DO NOTHING`, [extraMonths]);
  const del = await query(`DELETE FROM drug_exclusions WHERE month_key = '*'`);
  return del.rowCount;
}

export async function listDrugExclusions() {
  const { rows } = await query(
    `SELECT e.month_key, e.item_code, coalesce(d.item_name, (SELECT max(o.item_name) FROM orders o WHERE o.item_code = e.item_code)) AS item_name
       FROM drug_exclusions e LEFT JOIN drug_master d ON d.item_code = e.item_code
      ORDER BY e.month_key DESC, item_name NULLS LAST, e.item_code`);
  return rows;
}

/** ตั้งรายการยาที่ตัดออกของ month_key นั้น (แทนที่ทั้งชุด) */
export async function setDrugExclusions(monthKey, codes) {
  if (monthKey !== '*' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) throw Object.assign(new Error('month_key ไม่ถูกต้อง'), { status: 400 });
  const list = [...new Set((codes || []).map((c) => String(c).trim()).filter(Boolean))];
  await query('DELETE FROM drug_exclusions WHERE month_key = $1', [monthKey]);
  if (list.length) await query(`INSERT INTO drug_exclusions (month_key, item_code) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`, [monthKey, list]);
  return { month_key: monthKey, count: list.length };
}

export async function usableCount() {
  const { rows } = await query(`SELECT count(*)::int AS total, (count(*) FILTER (WHERE ${USABLE}))::int AS usable FROM orders o`);
  return rows[0];
}