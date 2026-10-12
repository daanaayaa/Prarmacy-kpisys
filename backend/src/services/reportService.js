import { query } from '../db.js';
import * as K from './kpiService.js';
import { MONTHS } from '../lib/format.js';

export async function buildDashboard(q) {
  const kpi = await K.getKpi(q.kpi);
  if (!kpi) return { kpi: null };
  const [card, monthly, daily, wards, dist, top, steps, compare] = await Promise.all([
    K.overallStats(q, kpi), K.monthlyStats(q, kpi), K.dailyStats(q, kpi), K.wardStats(q, kpi),
    K.distribution(q, kpi), K.topSlow(q, kpi, 10), K.stepStats(q, kpi), K.compareSubgroups(q, kpi),
  ]);
  return { kpi, card, monthly, daily, wards, distribution: dist, top, steps, compare };
}

// เวลาเฉลี่ยจาก "เวลาสั่งยา" ไปแต่ละขั้นตอน (ตรงกับแถวใต้ % ในตาราง PTTC ของ Excel)
const FROM_ORDER = [
  { key: 'execute', label: 'Doctor to Execute', from: 't_order', to: 't_prepare' },
  { key: 'pharmacist', label: 'doctor to pharmacist (avg time)', from: 't_order', to: 't_dispense' },
  { key: 'nurse', label: 'Doctor to nurse (avg time)', from: 't_order', to: 't_nurse' },
];

async function monthlyAvgs(q, kpi, defs) {
  try {
    const F = K.makeFilter(q, kpi);
    const exprs = defs.map((d, i) => `EXTRACT(EPOCH FROM (o.${d.to}::timestamp - o.${d.from}::timestamp)) AS s${i}`).join(', ');
    const aggs = defs.map((_, i) => `(avg(s${i}) FILTER (WHERE s${i} >= 0))::float8 AS avg${i}, (count(s${i}) FILTER (WHERE s${i} >= 0))::int AS n${i}`).join(', ');
    const { rows } = await query(
      `SELECT m, GROUPING(m)::int AS g, ${aggs}
         FROM (SELECT EXTRACT(MONTH FROM o.order_date)::int AS m, ${exprs} FROM orders o ${F.where}) x
        GROUP BY ROLLUP (m)`, F.params);
    const pick = (r, i) => ({ avg_sec: r ? r[`avg${i}`] : null, n: r ? r[`n${i}`] : 0 });
    return defs.map((d, i) => ({
      key: d.key,
      label: d.label,
      months: Array.from({ length: 12 }, (_, k) => pick(rows.find((r) => r.g === 0 && r.m === k + 1), i)),
      year: pick(rows.find((r) => r.g === 1), i),
    }));
  } catch (e) {
    console.error('monthlyAvgs failed:', e.message);
    return [];
  }
}

// ผลต่างของค่าเฉลี่ย (hi - lo) เหมือนสูตรใน Excel
const cellDiff = (hi, lo) => (hi && lo && hi.n && lo.n && hi.avg_sec != null && lo.avg_sec != null
  ? { avg_sec: hi.avg_sec - lo.avg_sec, n: Math.min(hi.n, lo.n) }
  : { avg_sec: null, n: 0 });

// ตารางที่ 3: Doctor to Execute / Execute to Dispense / Dispense to Administration
//   Execute to Dispense        = doctor to pharmacist - Doctor to Execute
//   Dispense to Administration = Doctor to nurse - doctor to pharmacist
function buildSteps(fromOrder) {
  const fo = Object.fromEntries(fromOrder.map((s) => [s.key, s]));
  if (!fo.execute || !fo.pharmacist || !fo.nurse) return [];
  const diff = (key, label, hi, lo) => ({
    key, label,
    months: hi.months.map((m, i) => cellDiff(m, lo.months[i])),
    year: cellDiff(hi.year, lo.year),
  });
  return [
    { key: 'doctor_to_execute', label: 'Doctor to Execute (avg time)', months: fo.execute.months, year: fo.execute.year },
    diff('execute_to_dispense', 'Execute to Dispense (avg time)', fo.pharmacist, fo.execute),
    diff('dispense_to_administration', 'Dispense to Administration (avg time)', fo.nurse, fo.pharmacist),
  ];
}

export async function buildReport(q) {
  const kpis = (await K.listKpis({ activeOnly: true })).filter((k) => !q.kpi || String(k.id) === String(q.kpi));
  const primaryId = (kpis.find((k) => k.is_primary) || kpis[0])?.id;
  const y = Number(q.year);
  const out = [];
  for (const kpi of kpis) {
    const [months, year, fromOrder] = await Promise.all([
      K.monthlyStats(q, kpi), K.yearStats(q, kpi), monthlyAvgs(q, kpi, FROM_ORDER),
    ]);
    const steps = buildSteps(fromOrder);

    // KPI นี้จบที่ขั้นตอนไหน: เลือกขั้นที่ค่าเฉลี่ยใกล้ค่าเฉลี่ยของ KPI ที่สุด
    let endKey = 'nurse';
    if (year?.avg_sec != null) {
      let best = Infinity;
      for (const s of fromOrder) {
        const d = s.year.avg_sec == null ? Infinity : Math.abs(s.year.avg_sec - year.avg_sec);
        if (d < best) { best = d; endKey = s.key; }
      }
    }

    // แถว "% ปีก่อน" / "Average ปีก่อน" เฉพาะ KPI หลัก
    let prev = null;
    if (kpi.id === primaryId && y) {
      try {
        const pq = { ...q, year: String(y - 1) };
        const [pm, py] = await Promise.all([K.monthlyStats(pq, kpi), K.yearStats(pq, kpi)]);
        prev = { year: y - 1, months: pm, total: py };
      } catch (e) {
        console.error('prev year failed:', e.message);
      }
    }
    out.push({ kpi, months, year, steps, fromOrder, endKey, prev });
  }
  return out;
}

export async function buildMeta() {
  const [years, wards, subgroups, counts] = await Promise.all([
    query('SELECT DISTINCT extract(year FROM order_date)::int AS y FROM orders WHERE order_date IS NOT NULL ORDER BY y DESC'),
    query(`SELECT o.ward, count(*)::int AS n FROM orders o WHERE o.ward IS NOT NULL AND ${K.USABLE} GROUP BY o.ward ORDER BY n DESC`),
    query('SELECT id, code, name, color, active FROM subgroups WHERE active ORDER BY sort_order, id'),
    query(`SELECT (SELECT count(*) FROM orders)::int AS orders, (SELECT count(*) FROM orders o WHERE ${K.USABLE})::int AS usable, (SELECT count(*) FROM drug_master)::int AS drugs`),
  ]);
  return {
    years: years.rows.map((r) => r.y), wards: wards.rows.map((r) => r.ward), subgroups: subgroups.rows,
    kpis: await K.listKpis({ activeOnly: true }), counts: counts.rows[0], months: MONTHS,
  };
}