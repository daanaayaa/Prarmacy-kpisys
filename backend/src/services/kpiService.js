import { query } from '../db.js';
import { STEPS, STEP_BY_KEY, OPS } from '../lib/steps.js';
import { MONTHS } from '../lib/format.js';

/* ---------- 1) คำนวณ duration ต่อแถว (ใช้ตอน import) ---------- */
const toSec = (s) => (s ? Date.parse(s.replace(' ', 'T') + 'Z') / 1000 : null);
const MAX_SEC = 24 * 3600;

/** ts = {t_order,t_prepare,...} -> { d:{ d_xxx: sec|null }, reasons:[] } */
export function computeDurations(ts) {
  const d = {};
  const reasons = [];
  for (const step of STEPS) {
    const a = toSec(ts[step.from]);
    const b = toSec(ts[step.to]);
    d[step.col] = null;
    if (a == null || b == null) continue; // ไม่มี timestamp -> ไม่คำนวณ
    const diff = Math.round(b - a);
    if (diff < 0) {
      if (step.key !== 'total') reasons.push(`NEG:${step.key}`);
      continue; // duration ติดลบ -> ไม่นำไปคำนวณ แต่ flag
    }
    if (diff > MAX_SEC && step.key !== 'total') reasons.push(`OVER24H:${step.key}`);
    d[step.col] = diff;
  }
  return { d, reasons };
}

/* ---------- 2) SQL builder สำหรับ KPI ---------- */
export function kpiParts(kpi) {
  const step = STEP_BY_KEY[kpi.step];
  if (!step) throw new Error(`unknown step ${kpi.step}`);
  const col = `o.${step.col}`;
  const op = OPS[kpi.operator] || '<=';
  const target = Number(kpi.target);
  let v = col;
  if (kpi.unit === 'minutes') v = kpi.floor_to_minute ? `floor(${col}/60.0)` : `(${col}/60.0)`;
  return { col, pass: `(${v} ${op} ${target})`, step };
}

export function statsSelect(kpi) {
  const { col, pass } = kpiParts(kpi);
  return `
    count(*)::int AS total_orders,
    count(${col})::int AS total,
    (count(*) FILTER (WHERE ${col} IS NOT NULL AND ${pass}))::int AS pass,
    (count(*) FILTER (WHERE ${col} IS NOT NULL AND NOT ${pass}))::int AS fail,
    (count(*) FILTER (WHERE ${col} IS NULL))::int AS missing,
    (count(*) FILTER (WHERE o.anomaly))::int AS anomalies,
    avg(${col})::float AS avg_sec,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ${col})::float AS median_sec,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY ${col})::float AS p90_sec`;
}

export function mapStats(r) {
  if (!r) return emptyStats();
  return { ...r, pct: r.total ? (r.pass / r.total) * 100 : null };
}
export const emptyStats = () => ({ total_orders: 0, total: 0, pass: 0, fail: 0, missing: 0, anomalies: 0, avg_sec: null, median_sec: null, p90_sec: null, pct: null });

/* ---------- 3) Filter ---------- */
// ยาที่ user เลือกตัดออก (drug_exclusions: month_key = 'YYYY-MM' หรือ '*' = ทุกเดือน)
export const DRUG_EXCL = `EXISTS (SELECT 1 FROM drug_exclusions de WHERE de.item_code = o.item_code AND de.month_key IN (to_char(o.order_date, 'YYYY-MM'), '*'))`;
// แถวที่ "ใช้ได้" = ผ่านกฎคัดกรองข้อมูลดิบ (excl_reason IS NULL) และไม่ใช่ยาที่ถูกตัดออก
export const USABLE = `(o.excl_reason IS NULL AND NOT ${DRUG_EXCL})`;

export function makeFilter(q, kpi, { ignoreMonth = false, ignoreSubgroup = false, includeExcluded = false } = {}) {
  const params = [];
  const conds = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  // KPI ทุกตัวคำนวณจากแถวที่ใช้ได้เท่านั้น (ยกเว้นตอนนับข้อมูลทั้งหมด includeExcluded)
  if (!includeExcluded) conds.push(USABLE);
  const year = parseInt(q.year, 10);
  const month = ignoreMonth ? 0 : parseInt(q.month, 10);
  if (year) {
    let from; let to;
    if (month >= 1 && month <= 12) {
      from = `${year}-${String(month).padStart(2, '0')}-01`;
      to = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    } else { from = `${year}-01-01`; to = `${year + 1}-01-01`; }
    conds.push(`o.order_date >= ${add(from)}::date AND o.order_date < ${add(to)}::date`);
  }
  if (q.ward && q.ward !== 'all') conds.push(`o.ward = ${add(q.ward)}`);
  const sg = (id) => `EXISTS (SELECT 1 FROM subgroup_items si WHERE si.item_code = o.item_code AND si.subgroup_id = ${add(Number(id))})`;
  if (!ignoreSubgroup) {
    if (q.subgroup && q.subgroup !== 'all') conds.push(sg(q.subgroup));
    if (kpi?.subgroup_id) conds.push(sg(kpi.subgroup_id));
  }
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params, and: (c) => `${conds.length ? 'WHERE ' + conds.join(' AND ') + ' AND ' : 'WHERE '}${c}` };
}

/* ---------- 4) KPI helpers ---------- */
export async function listKpis({ activeOnly = false } = {}) {
  const { rows } = await query(
    `SELECT k.*, k.target::float AS target, k.pass_rate_goal::float AS pass_rate_goal, s.name AS subgroup_name
       FROM kpi_definitions k LEFT JOIN subgroups s ON s.id = k.subgroup_id
      ${activeOnly ? 'WHERE k.active' : ''} ORDER BY k.sort_order, k.id`);
  return rows;
}
export async function getKpi(id) {
  const kpis = await listKpis({ activeOnly: true });
  return kpis.find((k) => String(k.id) === String(id)) || kpis.find((k) => k.is_primary) || kpis[0] || null;
}

/* ---------- 5) Analytics ---------- */
const monthIdx = (n) => Number(n) - 1;

export async function monthlyStats(q, kpi, opts = {}) {
  const F = makeFilter(q, kpi, { ignoreMonth: true, ...opts });
  const { rows } = await query(
    `SELECT extract(month FROM o.order_date)::int AS m, ${statsSelect(kpi)} FROM orders o ${F.where} GROUP BY 1`, F.params);
  const out = MONTHS.map((name, i) => ({ month: i + 1, name, ...emptyStats() }));
  for (const r of rows) out[monthIdx(r.m)] = { month: r.m, name: MONTHS[monthIdx(r.m)], ...mapStats(r) };
  return out;
}

export async function overallStats(q, kpi, opts = {}) {
  const F = makeFilter(q, kpi, opts);
  const { rows } = await query(`SELECT ${statsSelect(kpi)} FROM orders o ${F.where}`, F.params);
  return mapStats(rows[0]);
}

export async function yearStats(q, kpi) {
  const F = makeFilter(q, kpi, { ignoreMonth: true });
  const { rows } = await query(`SELECT ${statsSelect(kpi)} FROM orders o ${F.where}`, F.params);
  return mapStats(rows[0]);
}

export async function dailyStats(q, kpi) {
  const F = makeFilter(q, kpi);
  const { rows } = await query(
    `SELECT o.order_date::text AS day, ${statsSelect(kpi)} FROM orders o ${F.where} GROUP BY 1 ORDER BY 1`, F.params);
  return rows.map((r) => ({ day: r.day, ...mapStats(r) }));
}

export async function wardStats(q, kpi) {
  const F = makeFilter(q, kpi);
  const { rows } = await query(
    `SELECT coalesce(o.ward, '(ไม่ระบุ)') AS ward, ${statsSelect(kpi)} FROM orders o ${F.where} GROUP BY 1 ORDER BY total_orders DESC`, F.params);
  return rows.map((r) => ({ ward: r.ward, ...mapStats(r) }));
}

export async function stepStats(q, kpi) {
  const F = makeFilter(q, kpi);
  const sel = STEPS.map((s) => {
    const c = `o.${s.col}`;
    return `count(${c})::int AS ${s.key}_n, avg(${c})::float AS ${s.key}_avg,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ${c})::float AS ${s.key}_med,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY ${c})::float AS ${s.key}_p90`;
  }).join(',');
  const { rows } = await query(`SELECT ${sel} FROM orders o ${F.where}`, F.params);
  const r = rows[0] || {};
  return STEPS.map((s) => ({ key: s.key, label: s.label, short: s.short, n: r[`${s.key}_n`] || 0, avg_sec: r[`${s.key}_avg`], median_sec: r[`${s.key}_med`], p90_sec: r[`${s.key}_p90`] }));
}

export async function distribution(q, kpi) {
  const F = makeFilter(q, kpi);
  const { col } = kpiParts(kpi);
  const { rows } = await query(
    `SELECT CASE WHEN m <= 15 THEN 'le15' WHEN m <= 30 THEN 'le30' ELSE 'gt30' END AS b, count(*)::int AS n
       FROM (SELECT floor(${col}/60.0) AS m FROM orders o ${F.and(`${col} IS NOT NULL`)}) x GROUP BY 1`, F.params);
  const map = Object.fromEntries(rows.map((r) => [r.b, r.n]));
  return [
    { bucket: '≤ 15 นาที', n: map.le15 || 0 },
    { bucket: '16–30 นาที', n: map.le30 || 0 },
    { bucket: '> 30 นาที', n: map.gt30 || 0 },
  ];
}

export async function compareSubgroups(q, kpi) {
  const F = makeFilter(q, kpi, { ignoreSubgroup: true });
  const all = await query(`SELECT ${statsSelect(kpi)} FROM orders o ${F.where}`, F.params);
  const sub = await query(
    `SELECT s.id, s.name, s.color, ${statsSelect(kpi)}
       FROM orders o JOIN subgroup_items si ON si.item_code = o.item_code JOIN subgroups s ON s.id = si.subgroup_id AND s.active
       ${F.where} GROUP BY s.id, s.name, s.color, s.sort_order ORDER BY s.sort_order, s.id`, F.params);
  return [{ id: 'all', name: 'All Drugs', color: '#1d4ed8', ...mapStats(all.rows[0]) }, ...sub.rows.map((r) => ({ ...r, ...mapStats(r) }))];
}

/* ---------- 6) จำนวนข้อมูลทั้งหมด / ใช้ได้ / ตัดออก (รายเดือน) ---------- */
export const emptyQuality = () => ({ total: 0, usable: 0, excluded: 0, LOCATION: 0, NO_DISPENSE: 0, NO_ADMIN: 0, NEG_TIME: 0, OVER_LIMIT: 0, DRUG: 0 });

export async function dataQuality(q) {
  // ไม่ผูกกับ KPI/subgroup ของ KPI — นับตาม Year / Subgroup / Ward ที่เลือก
  const F = makeFilter(q, null, { ignoreMonth: true, includeExcluded: true });
  const { rows } = await query(
    `SELECT extract(month FROM o.order_date)::int AS m,
            count(*)::int AS total,
            (count(*) FILTER (WHERE ${USABLE}))::int AS usable,
            (count(*) FILTER (WHERE o.excl_reason = 'LOCATION'))::int AS "LOCATION",
            (count(*) FILTER (WHERE o.excl_reason = 'NO_DISPENSE'))::int AS "NO_DISPENSE",
            (count(*) FILTER (WHERE o.excl_reason = 'NO_ADMIN'))::int AS "NO_ADMIN",
            (count(*) FILTER (WHERE o.excl_reason = 'NEG_TIME'))::int AS "NEG_TIME",
            (count(*) FILTER (WHERE o.excl_reason = 'OVER_LIMIT'))::int AS "OVER_LIMIT",
            (count(*) FILTER (WHERE o.excl_reason IS NULL AND ${DRUG_EXCL}))::int AS "DRUG"
       FROM orders o ${F.where} GROUP BY ROLLUP (1)`, F.params);
  const fin = (r) => ({ ...r, excluded: r.total - r.usable });
  const months = MONTHS.map((name, i) => ({ month: i + 1, name, ...emptyQuality() }));
  let year = emptyQuality();
  for (const r of rows) {
    if (r.m == null) year = fin(r); else months[monthIdx(r.m)] = { month: r.m, name: MONTHS[monthIdx(r.m)], ...fin(r) };
  }
  return { months, year };
}

/** ข้อมูล "ไม่มีเวลาพยาบาลให้ยา" นับแยกตาม ward x เดือน (ไม่รวม ward นอกโรงพยาบาลที่ตัดออกอยู่แล้ว) */
export async function missingAdminByWard(q) {
  const F = makeFilter(q, null, { ignoreMonth: true, includeExcluded: true });
  const { rows } = await query(
    `SELECT coalesce(o.ward, '(ไม่ระบุ)') AS ward, extract(month FROM o.order_date)::int AS m, count(*)::int AS n
       FROM orders o ${F.and(`o.excl_reason = 'NO_ADMIN'`)} GROUP BY 1, 2`, F.params);
  const month = parseInt(q.month, 10);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.ward)) map.set(r.ward, { ward: r.ward, total: 0, months: Array(12).fill(0) });
    const w = map.get(r.ward);
    w.months[monthIdx(r.m)] = r.n;
  }
  const list = [...map.values()].map((w) => ({ ...w, total: month >= 1 && month <= 12 ? w.months[month - 1] : w.months.reduce((a, b) => a + b, 0) }));
  return list.filter((w) => w.total > 0).sort((a, b) => b.total - a.total || a.ward.localeCompare(b.ward));
}

export async function topSlow(q, kpi, limit = 10) {
  const F = makeFilter(q, kpi);
  const { col } = kpiParts(kpi);
  const { rows } = await query(
    `SELECT o.id, o.t_order, o.item_code, o.item_name, o.ward, o.order_by, o.vn_an, ${col} AS sec
       FROM orders o ${F.and(`${col} IS NOT NULL`)} ORDER BY ${col} DESC LIMIT ${Number(limit)}`, F.params);
  return rows;
}
