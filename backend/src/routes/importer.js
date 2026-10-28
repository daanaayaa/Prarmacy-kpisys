import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { query } from '../db.js';
import { readWorkbook, readSheet, autoMapping, FIELD_LABELS, REQUIRED_FIELDS } from '../lib/parse.js';
import { analyzeSheet, countExisting, commitImport } from '../services/importService.js';
import { getSettings, expandAllMonths } from '../services/filterService.js';
import { REASONS } from '../lib/rules.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// ไฟล์ที่อัปโหลดเก็บชั่วคราวใน memory (30 นาที) ระหว่าง preview -> commit
const store = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of store) if (v.exp < now) store.delete(k); }, 60_000).unref();
const fixName = (n) => Buffer.from(n, 'latin1').toString('utf8'); // ชื่อไฟล์ภาษาไทยจาก multer

r.post('/upload', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์' });
  let wb;
  try { wb = readWorkbook(req.file.buffer); } catch { return res.status(400).json({ error: 'อ่านไฟล์ไม่ได้ (รองรับ .xls / .xlsx)' }); }
  const token = crypto.randomUUID();
  store.set(token, { wb, fileName: fixName(req.file.originalname), exp: Date.now() + 30 * 60_000 });
  const sheets = wb.SheetNames.map((name) => {
    const s = readSheet(wb, name);
    return { name, rows: s.rows.length, matched: s.matched };
  });
  const best = [...sheets].sort((a, b) => b.matched - a.matched || b.rows - a.rows)[0];
  res.json({ token, fileName: store.get(token).fileName, sheets, defaultSheet: best?.name, fields: FIELD_LABELS, required: REQUIRED_FIELDS });
}));

/**
 * body.excludeCodes (ไม่บังคับ) = ยาที่ผู้ใช้ติ๊กตัดอยู่ตอนนี้ -> ใช้นับ "ตัดยาก่อน"
 * ถ้าไม่ส่งมา (เช่น เปิด preview ครั้งแรก) ใช้ยาที่ตัดไว้แล้วของเดือนที่อยู่ในไฟล์แทน
 */
r.post('/preview', wrap(async (req, res) => {
  const { token, sheet, mapping, excludeCodes } = req.body || {};
  const s = store.get(token);
  if (!s) return res.status(410).json({ error: 'ไฟล์หมดอายุ กรุณาอัปโหลดใหม่' });
  const settings = await getSettings();

  // รอบแรก: อ่านไฟล์เพื่อรู้ว่ามีข้อมูลเดือนไหนบ้าง
  let a = analyzeSheet(s.wb, sheet, mapping, settings);
  const months = [...new Set(a.records.map((x) => x.order_date.slice(0, 7)))];
  await expandAllMonths(months); // ยาที่เคยตั้ง "ทุกเดือน" -> แตกเป็นรายเดือน ให้ติ๊กออก/เพิ่มของเดือนนี้ได้
  const ex = months.length ? (await query(`SELECT month_key, item_code FROM drug_exclusions WHERE month_key = ANY($1)`, [[...months, '*']])).rows : [];

  // ชุดยาที่ใช้ตัด: ที่ผู้ใช้ติ๊กอยู่ตอนนี้ หรือถ้ายังไม่ส่งมา ใช้ที่ตัดไว้แล้วในระบบ
  const chosen = Array.isArray(excludeCodes)
    ? [...new Set(excludeCodes.map((c) => String(c).trim()).filter(Boolean))]
    : [...new Set(ex.map((x) => x.item_code))];

  // รอบสอง: นับใหม่โดยตัดยาก่อน (ตัวเลขใน stats จะตรงกับที่ Dashboard คำนวณ)
  if (chosen.length && !a.missingRequired.length) a = analyzeSheet(s.wb, sheet, mapping, settings, chosen);

  const dupInDb = a.records.length ? await countExisting(a.records.map((x) => x.dedupe_key)) : 0;
  res.json({
    drugs: a.drugs, existingExclusions: ex, months, excludedCodes: chosen,
    sheet: a.sheet, headers: a.headers, mapping: a.mapping, missingRequired: a.missingRequired,
    stats: { ...a.stats, dupInDb, willImport: a.records.length - dupInDb },
    settings, reasons: REASONS,
    errors: a.errors.slice(0, 50),
    sample: a.records.slice(0, 8),
    anomalySample: a.records.filter((x) => x.anomaly).slice(0, 8),
  });
}));

r.post('/commit', wrap(async (req, res) => {
  const { token, sheet, mapping, mode, confirmOverwrite, excludeCodes, listedCodes } = req.body || {};
  const s = store.get(token);
  if (!s) return res.status(410).json({ error: 'ไฟล์หมดอายุ กรุณาอัปโหลดใหม่' });
  const a = analyzeSheet(s.wb, sheet, mapping, await getSettings(), Array.isArray(excludeCodes) ? excludeCodes : []);
  if (a.missingRequired.length) return res.status(400).json({ error: `ยังไม่ได้เลือกคอลัมน์ที่จำเป็น: ${a.missingRequired.join(', ')}` });
  const m = mode === 'overwrite' ? 'overwrite' : 'skip';
  if (m === 'overwrite') {
    const dup = await countExisting(a.records.map((x) => x.dedupe_key));
    if (dup > 0 && !confirmOverwrite) return res.status(409).json({ error: `มีข้อมูลซ้ำ ${dup} แถว ต้องยืนยันการ overwrite ก่อน` });
  }
  const result = await commitImport({ analysis: a, fileName: s.fileName, mode: m, drugExclusions: Array.isArray(excludeCodes) ? { codes: excludeCodes, listed: listedCodes } : null });
  store.delete(token);
  res.json({
    ...result,
    usable: a.stats.usable, excluded: a.stats.excluded, drugExcluded: a.stats.drugExcluded,
    classCounts: a.stats.classCounts, missingAdminByWard: a.stats.missingAdminByWard,
  });
}));

r.get('/history', wrap(async (_req, res) => {
  const { rows } = await query(`SELECT id, file_name, sheet_name, mode, total_rows, imported, updated, skipped, errors, anomalies, created_at,
    (summary->>'usable')::int AS usable, (summary->>'excluded')::int AS excluded,
    (SELECT count(*) FROM orders o WHERE o.import_id = b.id)::int AS rows_now FROM import_batches b ORDER BY id DESC LIMIT 100`);
  res.json(rows);
}));

// ลบข้อมูลทั้งหมดของ batch นั้น (rollback)
r.delete('/:id', wrap(async (req, res) => {
  await query('DELETE FROM import_batches WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
}));

export default r;