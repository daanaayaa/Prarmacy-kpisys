import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { query } from '../db.js';
import { readPttcList } from '../lib/pttcList.js';
import { dataQuality, missingAdminByWard } from '../services/kpiService.js';
import {
  getSettings, saveSettings, reclassifyAll, drugCandidates, listDrugExclusions, setDrugExclusions, monthKeyOf, expandAllMonths,
} from '../services/filterService.js';
import { REASONS } from '../lib/rules.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
const pttcStore = new Map(); // token -> { red, green, ... } เก็บชั่วคราว 30 นาที
setInterval(() => { const now = Date.now(); for (const [k, v] of pttcStore) if (v.exp < now) pttcStore.delete(k); }, 60_000).unref();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

// จำนวนข้อมูลทั้งหมด / ใช้ได้ / ตัดออก (รายเดือน) + ข้อมูลที่ไม่มีเวลาพยาบาลให้ยาแยกตาม ward
r.get('/data-quality', wrap(async (req, res) => {
  const [quality, missingAdmin, settings] = await Promise.all([dataQuality(req.query), missingAdminByWard(req.query), getSettings()]);
  res.json({ ...quality, missingAdmin, reasons: REASONS, maxHours: settings.max_order_nurse_hours });
}));

r.get('/filter/settings', wrap(async (_req, res) => res.json({ settings: await getSettings(), reasons: REASONS })));

// แก้เกณฑ์ แล้วตรวจข้อมูลเดิมใหม่ทั้งหมดทันที
r.put('/filter/settings', wrap(async (req, res) => {
  await saveSettings(req.body || {});
  const result = await reclassifyAll();
  res.json({ settings: await getSettings(), ...result });
}));

r.post('/filter/reclassify', wrap(async (_req, res) => res.json(await reclassifyAll())));

r.get('/filter/drugs', wrap(async (req, res) => res.json(await drugCandidates(req.query))));
r.get('/filter/drug-exclusions', wrap(async (_req, res) => {
  await expandAllMonths(); // ยาที่เคยตั้ง "ทุกเดือน" -> แตกเป็นรายเดือน (ไม่มีรายการซ่อน/ล็อก)
  res.json(await listDrugExclusions());
}));
r.put('/filter/drug-exclusions', wrap(async (req, res) => {
  const { year, month, codes } = req.body || {};
  const key = req.body?.month_key || monthKeyOf(year, month);
  res.json(await setDrugExclusions(key, codes));
}));

/* ---- นำเข้ารายการยาจากสีในบัญชียา (คอลัมน์ PTTC: เขียว = นับ, แดง = ตัด) ---- */
r.post('/filter/pttc-list/upload', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์' });
  let list;
  try { list = readPttcList(req.file.buffer); } catch { return res.status(400).json({ error: 'อ่านไฟล์ไม่ได้ (รองรับ .xls / .xlsx)' }); }
  if (!list) return res.status(400).json({ error: 'ไม่พบคอลัมน์ ItemCode และ PTTC ในไฟล์' });
  if (!list.red.length && !list.green.length) return res.status(400).json({ error: 'ไม่พบสีเขียว/แดงในคอลัมน์ PTTC' });
  const token = crypto.randomUUID();
  pttcStore.set(token, { ...list, exp: Date.now() + 30 * 60_000 });
  res.json({ token, sheet: list.sheet, red: list.red.length, green: list.green.length, other: list.other, none: list.none });
}));

// ตั้งยาสีแดงเป็น "ตัดออก" ของเดือน/ทุกเดือน — mode: replace (แทนที่ทั้งชุด) | merge (เพิ่มรวมกับที่ตัดไว้)
r.post('/filter/pttc-list/apply', wrap(async (req, res) => {
  const { token, year, month, mode } = req.body || {};
  const s = pttcStore.get(token);
  if (!s) return res.status(410).json({ error: 'ไฟล์หมดอายุ กรุณาอัปโหลดใหม่' });
  if (!month) return res.status(400).json({ error: 'กรุณาเลือกเดือน' });
  const key = monthKeyOf(year, month);
  const prev = (await query('SELECT count(*)::int AS n FROM drug_exclusions WHERE month_key = $1', [key])).rows[0].n;
  if (mode === 'merge') {
    await query(`INSERT INTO drug_exclusions (month_key, item_code) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`, [key, s.red]);
  } else {
    await setDrugExclusions(key, s.red);
  }
  // ผลต่อข้อมูลที่มีอยู่ในช่วงนั้น: แถว "ที่ผ่านกฎข้อมูลดิบ" ซึ่งถูกตัดเพราะเป็นยาสีแดง
  const y = parseInt(year, 10); const m = parseInt(month, 10);
  const params = [s.red]; let where = 'o.excl_reason IS NULL AND o.item_code = ANY($1)';
  if (y) {
    const from = m ? `${y}-${String(m).padStart(2, '0')}-01` : `${y}-01-01`;
    const to = m ? (m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`) : `${y + 1}-01-01`;
    params.push(from, to); where += ' AND o.order_date >= $2::date AND o.order_date < $3::date';
  }
  const aff = (await query(`SELECT count(*)::int AS n FROM orders o WHERE ${where}`, params)).rows[0].n;
  const now = (await query('SELECT count(*)::int AS n FROM drug_exclusions WHERE month_key = $1', [key])).rows[0].n;
  res.json({ month_key: key, mode: mode === 'merge' ? 'merge' : 'replace', previous: prev, now, red: s.red.length, rowsAffected: aff });
}));

// แปลงยาที่ตัดแบบ "ทุกเดือน" ('*') เป็นรายเดือน (ทุกเดือนที่มีข้อมูล) แล้วลบ '*'
r.post('/filter/drug-exclusions/expand-all', wrap(async (_req, res) => {
  const ins = await query(
    `INSERT INTO drug_exclusions (month_key, item_code)
     SELECT m.k, e.item_code FROM drug_exclusions e
       CROSS JOIN (SELECT DISTINCT to_char(order_date, 'YYYY-MM') AS k FROM orders) m
      WHERE e.month_key = '*' ON CONFLICT DO NOTHING`);
  const del = await query(`DELETE FROM drug_exclusions WHERE month_key = '*'`);
  res.json({ added: ins.rowCount, removed: del.rowCount });
}));

export default r;