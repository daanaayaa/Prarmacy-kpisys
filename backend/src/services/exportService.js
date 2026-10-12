import XLSX from 'xlsx';
import { query } from '../db.js';
import { mmss, MONTHS } from '../lib/format.js';
import { STEPS } from '../lib/steps.js';
import { buildDashboard, buildReport } from './reportService.js';
import { makeFilter, getKpi, dataQuality, missingAdminByWard } from './kpiService.js';
import { REASONS } from '../lib/rules.js';

const p2 = (v) => (v == null ? '-' : Number(v.toFixed(2)));
const stat = (s) => [s.total, s.pass, s.fail, p2(s.pct), mmss(s.avg_sec), mmss(s.median_sec), mmss(s.p90_sec), s.missing, s.anomalies];
const STAT_HEAD = ['Total orders', 'Pass', 'Fail', 'KPI %', 'Average', 'Median', 'P90', 'Missing timestamp', 'Anomaly'];

export async function buildSheets(type, q) {
  if (type === 'report') {
    const rep = await buildReport(q);
    const sheets = rep.map(({ kpi, months, year, fromOrder = [], endKey, prev }) => {
      const cols = [...months, year];
      const unit = kpi.unit === 'minutes' ? 'min' : 'sec';
      const avgRow = (s) => [s.label, ...[...s.months, s.year].map((c) => (c.n ? mmss(c.avg_sec) : '-'))];
      const prevCols = prev ? [...prev.months, prev.total] : [];
      return {
        name: kpi.name,
        rows: [
          [`${kpi.name} — ${kpi.operator} ${kpi.target} ${unit}`],
          ['Total', ...MONTHS, 'Year Total/Avg'],
          ['total order items', ...cols.map((c) => c.total || '-')],
          [`> ${kpi.target} ${unit} order items`, ...cols.map((c) => (c.total ? c.fail : '-'))],
          [`<= ${kpi.target} ${unit} order items`, ...cols.map((c) => (c.total ? c.pass : '-'))],
          ['%', ...cols.map((c) => (c.total ? p2(c.pct) : '-'))],
          ...fromOrder.filter((s) => endKey === 'nurse' || s.key === endKey).map(avgRow),
          ...(prev ? [
            [`% ปี ${prev.year}`, ...prevCols.map((p) => (p?.total ? p2(p.pct) : '-'))],
            [`Average ปี ${prev.year}`, ...prevCols.map((p) => (p?.total && p.avg_sec != null ? p2(p.avg_sec / 60) : '-'))],
          ] : []),
          ['Target', ...cols.map(() => kpi.target)],
        ],
      };
    });
    const dq = await dataQuality(q);
    const dqCols = [...dq.months, dq.year];
    const dash0 = (v) => (v ? v : '-');
    sheets.push({
      name: 'Data quality',
      rows: [
        ['ข้อมูลที่ใช้คำนวณ KPI', ...MONTHS, 'Year Total'],
        ['ข้อมูลทั้งหมด (raw)', ...dqCols.map((c) => dash0(c.total))],
        ['ใช้ได้ (นำไปคำนวณ KPI)', ...dqCols.map((c) => dash0(c.usable))],
        ['ตัดออก', ...dqCols.map((c) => dash0(c.excluded))],
        ...Object.entries(REASONS).map(([k, label]) => [`  - ${label}`, ...dqCols.map((c) => dash0(c[k]))]),
        ['  - ยาที่เลือกตัดออก (committee)', ...dqCols.map((c) => dash0(c.DRUG))],
      ],
    });
    const miss = await missingAdminByWard(q);
    if (miss.length) {
      sheets.push({
        name: 'Missing admin by ward',
        rows: [['Ward (ไม่มีเวลาพยาบาลให้ยา)', ...MONTHS, 'Total'], ...miss.map((w) => [w.ward, ...w.months.map(dash0), w.total])],
      });
    }
    const st = rep[0]?.steps;
    if (st?.length) {
      sheets.push({
        name: 'Process steps',
        rows: [
          ['Total', ...MONTHS, 'Year Total/Avg'],
          ...st.map((s) => [s.label, ...[...s.months, s.year].map((c) => (c.n ? mmss(c.avg_sec) : '-'))]),
        ],
      });
    }
    return sheets;
  }

  if (type === 'orders') {
    const kpi = await getKpi(q.kpi);
    const F = makeFilter(q, kpi, { includeExcluded: q.all === '1' }); // all=1 -> รวมแถวที่ถูกตัดออก (ไว้ตรวจสอบ)
    const { rows } = await query(
      `SELECT o.excl_reason, o.t_order, o.vn_an, o.item_code, o.item_name, o.ward, o.room, o.order_by, o.t_prepare, o.t_verify, o.t_dispense, o.t_nurse, o.t_ipd,
              ${STEPS.map((s) => `o.${s.col}`).join(',')}, o.anomaly_reasons FROM orders o ${F.where} ORDER BY o.t_order LIMIT 200000`, F.params);
    const head = ['Excluded reason', 'Order time', 'VN/AN', 'Item code', 'Item name', 'Ward', 'Room', 'Order by', 'Prepare', 'Verify', 'Dispense', 'Nurse', 'IPD receive',
      ...STEPS.map((s) => s.label), 'Anomaly'];
    return [{ name: 'Orders', rows: [head, ...rows.map((r) => [r.excl_reason, r.t_order, r.vn_an, r.item_code, r.item_name, r.ward, r.room, r.order_by, r.t_prepare, r.t_verify,
      r.t_dispense, r.t_nurse, r.t_ipd, ...STEPS.map((s) => mmss(r[s.col])), r.anomaly_reasons])] }];
  }

  // dashboard
  const d = await buildDashboard(q);
  if (!d.kpi) return [{ name: 'Summary', rows: [['ยังไม่มี KPI']] }];
  const unit = d.kpi.unit === 'minutes' ? 'min' : 'sec';
  return [
    { name: 'Summary', rows: [[`KPI: ${d.kpi.name} (${d.kpi.operator} ${d.kpi.target} ${unit})`], STAT_HEAD, stat(d.card)] },
    { name: 'Monthly', rows: [['Month', ...STAT_HEAD], ...d.monthly.map((m) => [m.name, ...stat(m)])] },
    { name: 'Daily', rows: [['Date', ...STAT_HEAD], ...d.daily.map((m) => [m.day, ...stat(m)])] },
    { name: 'Process steps', rows: [['Step', 'N', 'Average', 'Median', 'P90'], ...d.steps.map((s) => [s.label, s.n, mmss(s.avg_sec), mmss(s.median_sec), mmss(s.p90_sec)])] },
    { name: 'All vs Subgroup', rows: [['Group', ...STAT_HEAD], ...d.compare.map((m) => [m.name, ...stat(m)])] },
    { name: 'Ward', rows: [['Ward', ...STAT_HEAD], ...d.wards.map((m) => [m.ward, ...stat(m)])] },
    { name: 'Distribution', rows: [['Bucket', 'Orders'], ...d.distribution.map((b) => [b.bucket, b.n])] },
    { name: 'Top slow', rows: [['Order time', 'Item', 'Ward', 'Duration'], ...d.top.map((t) => [t.t_order, t.item_name, t.ward, mmss(t.sec)])] },
  ];
}

export function sendExport(res, sheets, format, base) {
  if (format === 'csv') {
    const text = sheets.map((s) => `${sheets.length > 1 ? `# ${s.name}\n` : ''}${XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(s.rows))}`).join('\n\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
    return res.send('\uFEFF' + text);
  }
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const s of sheets) {
    let name = s.name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31) || 'Sheet';
    while (used.has(name)) name = name.slice(0, 28) + '_' + used.size;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), name);
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
  return res.send(buf);
}