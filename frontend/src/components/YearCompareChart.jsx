import { Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MONTHS, mmss, num } from '../lib/format.js';

const NAVY = '#0b2a4a';
const GREY = '#94a3b8';
const BAR_CUR = '#7dd3c8';
const BAR_PREV = '#e2e8f0';
const tip = { fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' };

// ป้าย % มีขอบขาวรอบตัวเลข อ่านได้แม้ทับแท่ง
const PctLabel = ({ x, y, value }) =>
  value == null ? null : (
    <text x={x} y={y} dy={-9} textAnchor="middle" fontSize={11} fontWeight={700} fill={NAVY} stroke="#fff" strokeWidth={3} paintOrder="stroke">
      {Number(value).toFixed(1)}
    </text>
  );

// เลือก step ของแกนเวลาให้ได้ 4 ช่องพอดี (ตรงกับแกน % ที่มี 4 ช่อง)
const niceStep = (raw) => [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200].find((s) => s >= raw) || Math.ceil(raw / 50) * 50;

const f1 = (v) => (v == null ? '-' : Number(v).toFixed(1));

/**
 * cur / prev = รายการจาก /report ของ KPI เดียวกัน (ปีปัจจุบัน / ปีก่อน)
 */
export default function YearCompareChart({ cur, prev, year, kpi }) {
  const py = Number(year) - 1;
  const toMin = (sec) => (sec == null ? null : Math.round((sec / 60) * 100) / 100);
  const isMin = kpi.unit === 'minutes';
  const target = Number(kpi.target);
  const goal = kpi.pass_rate_goal != null ? Number(kpi.pass_rate_goal) : null;

  const data = MONTHS.map((m, i) => {
    const a = cur?.months?.[i];
    const b = prev?.months?.[i];
    return {
      x: m,
      avgCur: a?.total ? toMin(a.avg_sec) : null,
      avgPrev: b?.total ? toMin(b.avg_sec) : null,
      pctCur: a?.total && a.pct != null ? Number(a.pct) : null,
      pctPrev: b?.total && b.pct != null ? Number(b.pct) : null,
    };
  });

  const maxAvg = Math.max(isMin ? target : 0, 1, ...data.flatMap((d) => [d.avgCur || 0, d.avgPrev || 0]));
  const step = niceStep((maxAvg * 1.1) / 4);
  const top = step * 4;
  const minTicks = [0, 1, 2, 3, 4].map((i) => i * step);

  const fmtTip = (v, n) => (v == null ? '-' : String(n).startsWith('%') ? `${Number(v).toFixed(2)}%` : mmss(v * 60));

  // ---- ตารางตัวเลข ----
  const cols = [
    ...MONTHS.map((m, i) => ({ k: m, a: cur?.months?.[i], b: prev?.months?.[i] })),
    { k: 'ทั้งปี', a: cur?.year, b: prev?.year, total: true },
  ];
  const has = (c) => c?.total > 0;
  const pctTone = (v) => (v == null ? '' : goal == null ? 'text-slate-800' : v >= goal ? 'text-emerald-700' : 'text-amber-600');
  const rows = [
    { label: 'จำนวน order', cell: (c) => (has(c.a) ? num(c.a.total) : '-') },
    { label: 'เวลาเฉลี่ย', cell: (c) => (has(c.a) ? mmss(c.a.avg_sec) : '-') },
    { label: 'Median', cell: (c) => (has(c.a) ? mmss(c.a.median_sec) : '-') },
    {
      label: `% ผ่านเป้า ${year}`, strong: true,
      cell: (c) => f1(has(c.a) ? c.a.pct : null),
      tone: (c) => pctTone(has(c.a) ? c.a.pct : null),
    },
    { label: `% ผ่านเป้า ${py}`, muted: true, cell: (c) => f1(has(c.b) ? c.b.pct : null) },
  ];

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 22, right: 4, left: 0, bottom: 0 }} barGap={1} barCategoryGap="14%">
          <CartesianGrid yAxisId="pct" stroke="#e8edf3" vertical={false} />
          <XAxis dataKey="x" tick={{ fontSize: 11 }} tickMargin={6} axisLine={false} tickLine={false} />
          <YAxis yAxisId="pct" width={42} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tick={{ fontSize: 11, fill: NAVY }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="min" width={42} orientation="right" domain={[0, top]} ticks={minTicks} unit=" น." tick={{ fontSize: 11, fill: '#0f766e' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tip} formatter={fmtTip} />
          <Legend verticalAlign="top" align="right" height={26} iconType="circle" wrapperStyle={{ fontSize: 12 }} />

          <Bar yAxisId="min" dataKey="avgPrev" name={`เวลาเฉลี่ย ${py}`} fill={BAR_PREV} radius={[3, 3, 0, 0]} maxBarSize={26} />
          <Bar yAxisId="min" dataKey="avgCur" name={`เวลาเฉลี่ย ${year}`} fill={BAR_CUR} radius={[3, 3, 0, 0]} maxBarSize={26} />

          {isMin && (
            <ReferenceLine yAxisId="min" y={target} stroke="#059669" strokeWidth={1.5} strokeDasharray="6 4"
              label={{ value: `Target ${target} น.`, fontSize: 10, fill: '#059669', position: 'insideTopLeft' }} />
          )}

          <Line yAxisId="pct" dataKey="pctPrev" name={`% ผ่านเป้า ${py}`} stroke={GREY} strokeWidth={2} strokeDasharray="5 4"
            dot={{ r: 3, fill: GREY, stroke: '#fff', strokeWidth: 1 }} connectNulls />
          <Line yAxisId="pct" dataKey="pctCur" name={`% ผ่านเป้า ${year}`} stroke={NAVY} strokeWidth={2.5}
            dot={{ r: 4, fill: NAVY, stroke: '#fff', strokeWidth: 1.5 }} connectNulls>
            <LabelList dataKey="pctCur" content={PctLabel} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>

      {/* ตารางตัวเลขรายเดือน */}
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[760px] border-collapse text-xs tabular-nums">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium" />
              {cols.map((c) => (
                <th key={c.k} className={`px-1.5 py-2 text-center font-semibold ${c.total ? 'border-l border-slate-200 text-slate-700' : ''}`}>{c.k}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className={`sticky left-0 whitespace-nowrap bg-white px-3 py-1.5 text-left ${r.muted ? 'text-slate-400' : 'text-slate-600'} ${r.strong ? 'font-semibold text-slate-800' : ''}`}>{r.label}</td>
                {cols.map((c) => (
                  <td
                    key={c.k}
                    className={`px-1.5 py-1.5 text-center ${c.total ? 'border-l border-slate-200 bg-slate-50 font-semibold' : ''} ${r.muted ? 'text-slate-400' : r.strong ? 'font-semibold' : 'text-slate-700'} ${r.tone ? r.tone(c) : ''}`}
                  >
                    {r.cell(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}