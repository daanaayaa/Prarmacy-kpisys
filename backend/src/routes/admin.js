import { Router } from 'express';
import multer from 'multer';
import { pool, query } from '../db.js';
import { readWorkbook, readSheet, norm } from '../lib/parse.js';
import { STEPS, OPS } from '../lib/steps.js';
import { listKpis } from '../services/kpiService.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

/* ================= KPI ================= */
r.get('/kpis', wrap(async (_req, res) => res.json({ kpis: await listKpis(), steps: STEPS })));

function kpiBody(b) {
  if (!b.name?.trim()) throw Object.assign(new Error('กรุณาใส่ชื่อ KPI'), { status: 400 });
  if (!STEPS.some((s) => s.key === b.step)) throw Object.assign(new Error('ขั้นตอนไม่ถูกต้อง'), { status: 400 });
  if (!OPS[b.operator]) throw Object.assign(new Error('เงื่อนไขไม่ถูกต้อง'), { status: 400 });
  const target = Number(b.target);
  if (!Number.isFinite(target)) throw Object.assign(new Error('Target ต้องเป็นตัวเลข'), { status: 400 });
  return [b.name.trim(), b.description || null, b.step, b.operator, target, b.unit === 'seconds' ? 'seconds' : 'minutes', b.floor_to_minute !== false,
    b.pass_rate_goal === '' || b.pass_rate_goal == null ? null : Number(b.pass_rate_goal), b.subgroup_id ? Number(b.subgroup_id) : null,
    !!b.is_primary, b.active !== false, Number(b.sort_order) || 100];
}
async function onlyOnePrimary(id, isPrimary) {
  if (isPrimary) await query('UPDATE kpi_definitions SET is_primary = FALSE WHERE id <> $1', [id]);
}
r.post('/kpis', wrap(async (req, res) => {
  const v = kpiBody(req.body);
  const { rows } = await query(
    `INSERT INTO kpi_definitions (name, description, step, operator, target, unit, floor_to_minute, pass_rate_goal, subgroup_id, is_primary, active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, v);
  await onlyOnePrimary(rows[0].id, v[9]);
  res.json({ id: rows[0].id });
}));
r.put('/kpis/:id', wrap(async (req, res) => {
  const v = kpiBody(req.body);
  const id = Number(req.params.id);
  await query(
    `UPDATE kpi_definitions SET name=$1, description=$2, step=$3, operator=$4, target=$5, unit=$6, floor_to_minute=$7, pass_rate_goal=$8,
       subgroup_id=$9, is_primary=$10, active=$11, sort_order=$12 WHERE id=$13`, [...v, id]);
  await onlyOnePrimary(id, v[9]);
  res.json({ ok: true });
}));
r.delete('/kpis/:id', wrap(async (req, res) => {
  await query('DELETE FROM kpi_definitions WHERE id=$1', [Number(req.params.id)]);
  res.json({ ok: true });
}));

/* ================= Subgroups ================= */
r.get('/subgroups', wrap(async (_req, res) => {
  const { rows } = await query(`SELECT s.*, (SELECT count(*) FROM subgroup_items i WHERE i.subgroup_id = s.id)::int AS item_count
                                  FROM subgroups s ORDER BY s.sort_order, s.id`);
  res.json(rows);
}));
function sgBody(b) {
  if (!b.name?.trim()) throw Object.assign(new Error('กรุณาใส่ชื่อ subgroup'), { status: 400 });
  const code = (b.code || b.name).trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_|_$/g, '') || 'GROUP';
  return [code, b.name.trim(), b.description || null, b.source_column?.trim() || null, b.color || '#2563eb', b.active !== false, Number(b.sort_order) || 100];
}
r.post('/subgroups', wrap(async (req, res) => {
  const v = sgBody(req.body);
  try {
    const { rows } = await query(`INSERT INTO subgroups (code,name,description,source_column,color,active,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, v);
    res.json({ id: rows[0].id });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'รหัส subgroup ซ้ำ' });
    throw e;
  }
}));

// จัดลำดับ subgroup: รับ ids ตามลำดับใหม่ แล้วเรียง sort_order เป็น 10, 20, 30…
// (วางก่อน /subgroups/:id เพื่อไม่ให้ชนกัน)
r.put('/subgroups-order', wrap(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) return res.status(400).json({ error: 'ไม่พบรายการ' });
  const orders = ids.map((_, i) => (i + 1) * 10);
  await query(
    `UPDATE subgroups s SET sort_order = v.ord
       FROM unnest($1::int[], $2::int[]) AS v(id, ord)
      WHERE s.id = v.id`, [ids, orders]);
  res.json({ ok: true });
}));

r.put('/subgroups/:id', wrap(async (req, res) => {
  const v = sgBody(req.body);
  // v = [code, name, description, source_column, color, active, sort_order]
  await query(
    `UPDATE subgroups SET name=$1, description=$2, source_column=$3, color=$4, active=$5, sort_order=$6 WHERE id=$7`,
    [v[1], v[2], v[3], v[4], v[5], v[6], Number(req.params.id)]);
  res.json({ ok: true });
}));
r.delete('/subgroups/:id', wrap(async (req, res) => {
  const { rows } = await query('SELECT is_system FROM subgroups WHERE id=$1', [Number(req.params.id)]);
  if (rows[0]?.is_system) return res.status(400).json({ error: 'ลบ subgroup ระบบไม่ได้ (ปิดการใช้งานแทนได้)' });
  await query('DELETE FROM subgroups WHERE id=$1', [Number(req.params.id)]);
  res.json({ ok: true });
}));

r.get('/subgroups/:id/items', wrap(async (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const { rows } = await query(
    `SELECT i.item_code, i.source, d.item_name, d.generic_name FROM subgroup_items i LEFT JOIN drug_master d ON d.item_code = i.item_code
      WHERE i.subgroup_id = $1 AND (i.item_code ILIKE $2 OR d.item_name ILIKE $2 OR d.generic_name ILIKE $2)
      ORDER BY d.item_name NULLS LAST, i.item_code LIMIT ${limit} OFFSET ${offset}`, [Number(req.params.id), q]);
  const c = await query(
    `SELECT count(*)::int AS n FROM subgroup_items i LEFT JOIN drug_master d ON d.item_code = i.item_code
      WHERE i.subgroup_id = $1 AND (i.item_code ILIKE $2 OR d.item_name ILIKE $2 OR d.generic_name ILIKE $2)`, [Number(req.params.id), q]);
  res.json({ items: rows, total: c.rows[0].n });
}));
r.post('/subgroups/:id/items', wrap(async (req, res) => {
  const codes = [...new Set(String(req.body.codes || '').split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
  if (!codes.length) return res.status(400).json({ error: 'ไม่พบ item code' });
  const r1 = await query(`INSERT INTO subgroup_items (subgroup_id, item_code, source) SELECT $1, unnest($2::text[]), 'manual' ON CONFLICT DO NOTHING`, [Number(req.params.id), codes]);
  const known = await query('SELECT count(*)::int AS n FROM drug_master WHERE item_code = ANY($1)', [codes]);
  res.json({ added: r1.rowCount, unknownInDrugList: codes.length - known.rows[0].n });
}));
r.delete('/subgroups/:id/items', wrap(async (req, res) => {
  const codes = req.body.codes || [];
  await query('DELETE FROM subgroup_items WHERE subgroup_id=$1 AND item_code = ANY($2)', [Number(req.params.id), codes]);
  res.json({ ok: true });
}));

/* ================= Drug master (บัญชียา) ================= */
r.get('/drugs/summary', wrap(async (_req, res) => {
  const { rows } = await query(`SELECT (SELECT count(*) FROM drug_master)::int AS drugs,
    (SELECT count(DISTINCT item_code) FROM orders WHERE item_code NOT IN (SELECT item_code FROM drug_master))::int AS unmapped_order_items`);
  res.json(rows[0]);
}));

// ค้นหายาในบัญชียาแบบ autocomplete (ค้นจาก ItemCode / ชื่อยา / generic) — ใช้ในหน้า Subgroups
r.get('/drugs/search', wrap(async (req, res) => {
  const term = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20);
  if (term.length < 2) return res.json({ items: [] });
  const esc = term.replace(/[\\%_]/g, '\\$&'); // escape wildcard ของ LIKE
  const { rows } = await query(
    `SELECT item_code, item_name, generic_name FROM drug_master
      WHERE item_code ILIKE $1 OR item_name ILIKE $1 OR generic_name ILIKE $1
      ORDER BY (item_code ILIKE $2) DESC, (item_name ILIKE $2) DESC, item_name NULLS LAST, item_code
      LIMIT $3`,
    [`%${esc}%`, `${esc}%`, limit]);
  res.json({ items: rows });
}));

const isFlag = (v) => {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return !(s === '' || s === '-' || s === 'not had' || s === 'no' || s === 'n' || s === '0' || s === 'false');
};

r.post('/drugs/import', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์' });
  const wb = readWorkbook(req.file.buffer);
  const aliases = { code: ['itemcode', 'รหัสยา'] };
  const subgroups = (await query('SELECT id, code, name, source_column FROM subgroups WHERE source_column IS NOT NULL')).rows;
  // เลือกชีตที่มี ItemCode และมีคอลัมน์ flag ตรงกับ subgroup มากที่สุด
  let best = null;
  for (const name of wb.SheetNames) {
    const s = readSheet(wb, name, aliases);
    const codeIdx = s.headers.findIndex((h) => aliases.code.includes(norm(h)));
    if (codeIdx < 0) continue;
    const flagCols = subgroups.map((g) => ({ g, idx: s.headers.findIndex((h) => norm(h) === norm(g.source_column)) })).filter((x) => x.idx >= 0);
    const score = flagCols.length * 100000 + s.rows.length;
    if (!best || score > best.score) best = { name, s, codeIdx, flagCols, score };
  }
  if (!best) return res.status(400).json({ error: 'ไม่พบคอลัมน์ ItemCode ในไฟล์' });
  const { s, codeIdx, flagCols } = best;
  const find = (pred) => s.headers.findIndex((h) => pred(norm(h)));
  const nameIdx = find((h) => h.startsWith('itemname'));
  const genIdx = find((h) => h === 'genericname');
  const unitIdx = find((h) => h.startsWith('unit'));

  const seen = new Map();
  for (const row of s.rows) {
    const code = row[codeIdx] == null ? '' : String(row[codeIdx]).trim();
    if (!code) continue;
    seen.set(code, [code, nameIdx >= 0 ? row[nameIdx] : null, genIdx >= 0 ? row[genIdx] : null, unitIdx >= 0 ? row[unitIdx] : null, row]);
  }
  const list = [...seen.values()];
  const client = await pool.connect();
  const perGroup = {};
  try {
    await client.query('BEGIN');
    for (let i = 0; i < list.length; i += 1000) {
      const ch = list.slice(i, i + 1000);
      await client.query(
        `INSERT INTO drug_master (item_code, item_name, generic_name, unit)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
         ON CONFLICT (item_code) DO UPDATE SET item_name=EXCLUDED.item_name, generic_name=EXCLUDED.generic_name, unit=EXCLUDED.unit, updated_at=now()`,
        [ch.map((x) => x[0]), ch.map((x) => (x[1] == null ? null : String(x[1]))), ch.map((x) => (x[2] == null ? null : String(x[2]))), ch.map((x) => (x[3] == null ? null : String(x[3])))]);
    }
    for (const { g, idx } of flagCols) {
      const codes = list.filter((x) => isFlag(x[4][idx])).map((x) => x[0]);
      // สร้างสมาชิกจากไฟล์ใหม่ (source='import') — รายการที่เพิ่มเองด้วยมือ (manual) ไม่ถูกลบ
      await client.query(`DELETE FROM subgroup_items WHERE subgroup_id=$1 AND source='import'`, [g.id]);
      if (codes.length) await client.query(`INSERT INTO subgroup_items (subgroup_id, item_code, source) SELECT $1, unnest($2::text[]), 'import' ON CONFLICT DO NOTHING`, [g.id, codes]);
      perGroup[g.name] = codes.length;
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  res.json({ sheet: best.name, drugs: list.length, groups: perGroup, flagColumnsFound: flagCols.length });
}));

export default r;