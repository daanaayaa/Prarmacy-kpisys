import { useMeta } from '../App.jsx';
import { api, qs } from '../lib/api.js';
import { Empty, ErrorBox, Loading, Panel, useAsync, useStored } from '../components/ui.jsx';
import Filters from '../components/Filters.jsx';
import PageHead from '../components/PageHead.jsx';
import { MissingAdminTable, QualityTable } from '../components/DataQuality.jsx';
import { MONTHS, dash, pct, targetLabel } from '../lib/format.js';

// วินาที -> HH:MM:SS (เช่น 00:02:56, 00:21:45)
const hms = (sec) => {
  if (sec == null || Number.isNaN(Number(sec))) return '-';
  const t = Math.max(0, Math.round(Number(sec)));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
};

const HEAD = (
  <tr className="bg-navy-900 text-white">
    <th className="sticky left-0 bg-navy-900 px-3 py-2 text-left text-xs font-semibold">Total</th>
    {MONTHS.map((m) => <th key={m} className="px-3 py-2 text-right text-xs font-semibold">{m}</th>)}
    <th className="bg-navy-700 px-3 py-2 text-right text-xs font-semibold">Year Total/Avg</th>
  </tr>
);

function KpiTable({ kpi, months, year, fromOrder = [], endKey, prev }) {
  const cols = [...months, year];
  const goal = kpi.pass_rate_goal;
  const u = kpi.unit === 'minutes' ? 'min' : 'sec';
  const avgCell = (s) => (_, i) => { const x = [...s.months, s.year][i]; return x?.n ? hms(x.avg_sec) : '-'; };
  const prevCols = prev ? [...prev.months, prev.total] : [];
  const AMBER = 'bg-amber-50';

  // [label, fn(c, i), cellClass, isPct, labelClass]
  const rows = [
    ['total order items', (c) => dash(c.total), 'font-medium'],
    [`> ${kpi.target} ${u} order items`, (c) => (c.total ? c.fail.toLocaleString() : '-'), 'text-red-600'],
    [`<= ${kpi.target} ${u} order items`, (c) => (c.total ? c.pass.toLocaleString() : '-')],
    ['%', (c) => (c.total ? pct(c.pct) : '-'), 'font-semibold', true],
    ...fromOrder.filter((s) => endKey === 'nurse' || s.key === endKey).map((s) => [s.label, avgCell(s), 'font-medium']),
    ...(prev ? [
      [`% ปี ${prev.year}`, (_, i) => { const p = prevCols[i]; return p?.total ? pct(p.pct) : '-'; }, `${AMBER} font-medium`, false, AMBER],
      [`Average ปี ${prev.year}`, (_, i) => { const p = prevCols[i]; return p?.total && p.avg_sec != null ? hms(p.avg_sec) : '-'; }, AMBER, false, AMBER],
    ] : []),
    ['Target', () => `${kpi.target}`, 'bg-emerald-50 text-emerald-800 font-medium', false, 'bg-emerald-50'],
  ];

  return (
    <Panel title={kpi.name} subtitle={`เกณฑ์ผ่าน ${targetLabel(kpi)}${goal != null ? ` · เป้า % ผ่าน ${goal}%` : ''}${kpi.subgroup_name ? ` · เฉพาะ ${kpi.subgroup_name}` : ''}`} className="overflow-hidden">
      <div className="-m-4 overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead>{HEAD}</thead>
          <tbody>
            {rows.map(([label, fn, cls = '', isPct, labelCls = 'bg-white']) => (
              <tr key={label} className="border-b border-slate-100">
                <td className={`sticky left-0 px-3 py-2 text-sm text-slate-700 ${labelCls}`}>{label}</td>
                {cols.map((c, i) => {
                  const txt = fn(c, i);
                  let tone = '';
                  if (isPct && c.total && goal != null) tone = c.pct >= goal ? 'text-emerald-600' : 'text-amber-600';
                  return <td key={i} className={`px-3 py-2 text-right text-sm tabular-nums ${i === 12 ? 'bg-blue-50/60 font-semibold' : ''} ${cls} ${tone} ${txt === '-' ? 'text-slate-300' : ''}`}>{txt}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function StepsTable({ steps }) {
  return (
    <Panel title="Process Time แต่ละขั้นตอน (เฉลี่ยรายเดือน)" subtitle="Doctor → Execute → Dispense → Administration" className="overflow-hidden">
      <div className="-m-4 overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead>{HEAD}</thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.key} className="border-b border-slate-100">
                <td className="sticky left-0 bg-white px-3 py-2 text-sm text-slate-700">{s.label}</td>
                {[...s.months, s.year].map((c, i) => (
                  <td key={i} className={`px-3 py-2 text-right text-sm tabular-nums ${i === 12 ? 'bg-blue-50/60 font-semibold' : ''} ${c.n ? '' : 'text-slate-300'}`}>{c.n ? hms(c.avg_sec) : '-'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function Report() {
  const { meta } = useMeta();
  const [f, setF] = useStored('report-filters', { year: meta.years[0] || '', subgroup: 'all', ward: 'all' });
  const query = qs(f);
  const { data, loading, error } = useAsync(() => (meta.years.length ? api(`/report?${query}`) : Promise.resolve([])), [query]);
  const Q = useAsync(() => (meta.years.length ? api(`/data-quality?${query}`) : Promise.resolve(null)), [query]);
  const exp = (format) => `/api/export?${qs({ ...f, type: 'report', format })}`;
  const steps = data?.[0]?.steps;

  return (
    <>
      <PageHead title="Monthly Report" subtitle="สรุปรายเดือน Jan–Dec ของปีที่เลือก (รูปแบบเดียวกับ Excel เดิม) — เดือนที่ไม่มีข้อมูลแสดงเป็น “-”">
        <a className="btn" href={exp('xlsx')}>Export Excel</a>
        <a className="btn" href={exp('csv')}>Export CSV</a>
      </PageHead>
      <Panel><Filters meta={meta} value={f} onChange={setF} showMonth={false} /></Panel>
      <ErrorBox error={error} />
      {loading && !data && <Loading />}
      {!meta.years.length && <Panel><Empty>ยังไม่มีข้อมูล — นำเข้าไฟล์ Excel ก่อน</Empty></Panel>}
      <QualityTable dq={Q.data} />
      {data?.map((d) => <KpiTable key={d.kpi.id} {...d} />)}
      {steps?.length > 0 && <StepsTable steps={steps} />}
      <MissingAdminTable dq={Q.data} />
    </>
  );
}