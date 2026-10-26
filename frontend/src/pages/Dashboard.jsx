import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar as RBar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMeta } from '../App.jsx';
import { api, qs } from '../lib/api.js';
import { Bar, Empty, ErrorBox, Field, Loading, Panel, useAsync, useStored } from '../components/ui.jsx';
import Filters from '../components/Filters.jsx';
import YearCompareChart from '../components/YearCompareChart.jsx';
import { MONTHS, dash, mmss, num, pct, targetLabel } from '../lib/format.js';

const FLOW = ['#0b2a4a', '#0d9488', '#f59e0b'];
const tip = { fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' };
const MIN_SAMPLE = 20; // กลุ่ม / ward ที่มี order น้อยกว่านี้จะแสดงจางลง (ตัวอย่างน้อย)
const RANK_GRID = 'grid grid-cols-[minmax(0,1.5fr)_56px_minmax(56px,1fr)_60px] items-center gap-3';
const ICON = {
  list: <path d="M6 7h12M6 12h12M6 17h8" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v5M12 16.2v.1" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  trend: <path d="M4 16l5-5 4 4 7-8M15 7h5v5" />,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
};

const longDur = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} ชม. ${Math.floor((sec % 3600) / 60)} น.` : mmss(sec));
const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));

const Section = ({ title, children }) => (
  <section className="space-y-3">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
    {children}
  </section>
);

const TONE = {
  emerald: { box: 'border-emerald-200 from-emerald-50', icon: '#059669', label: 'text-emerald-700' },
  blue: { box: 'border-blue-200 from-blue-50', icon: '#2563eb', label: 'text-blue-700' },
  amber: { box: 'border-amber-200 from-amber-50', icon: '#f59e0b', label: 'text-amber-700' },
  rose: { box: 'border-rose-200 from-rose-50', icon: '#e11d48', label: 'text-rose-700' },
};

function TakeCard({ tone, icon, label, value, sub }) {
  const t = TONE[tone];
  return (
    <div className={`flex min-w-0 items-center gap-4 rounded-xl border bg-gradient-to-br to-white p-4 shadow-sm ${t.box}`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: t.icon }}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{ICON[icon]}</svg>
      </span>
      <div className="min-w-0">
        <div className={`text-xs font-semibold uppercase tracking-wide ${t.label}`}>{label}</div>
        <div className="mt-0.5 text-2xl font-semibold leading-tight tabular-nums text-slate-900">{value}</div>
        <div className="mt-0.5 text-xs leading-snug text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function StatCard({ icon, color, cls, label, value, sub, foot }) {
  return (
    <div className={`flex min-w-0 flex-col justify-between rounded-xl border p-4 shadow-sm ${cls}`}>
      <div>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: color }}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{ICON[icon]}</svg>
          </span>
          <span className="truncate text-sm font-semibold" style={{ color }}>{label}</span>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <span className="text-3xl font-semibold leading-none tabular-nums text-slate-900">{value}</span>
          <span className="text-right text-xs leading-snug text-slate-500">{sub}</span>
        </div>
      </div>
      <div className="min-h-[2.25rem]">{foot}</div>
    </div>
  );
}

// แท่งสัดส่วนเล็ก ๆ ใต้การ์ด (มีขีดเป้าได้)
const MiniBar = ({ v, color, goal }) => (
  <div className="relative mt-3 h-1.5 rounded-full bg-white/80">
    <div className="h-full rounded-full" style={{ width: `${clamp(v)}%`, background: color }} />
    {goal != null && <span className="absolute -top-[3px] h-3 w-0.5 rounded bg-slate-800/70" style={{ left: `${clamp(goal)}%` }} title={`เป้า ${goal}%`} />}
  </div>
);

// แถวรายการติดตาม: ตัวเลขใหญ่ด้านซ้าย + คำอธิบาย + แท่งสัดส่วน (ใส่ children ได้)
function FollowRow({ color, cls, count, title, note, bar, children }) {
  return (
    <div className={`rounded-xl border p-3.5 ${cls}`}>
      <div className="flex items-start gap-3.5">
        <span className="flex h-12 min-w-[3.25rem] shrink-0 items-center justify-center rounded-xl px-2 text-lg font-semibold tabular-nums text-white shadow-sm" style={{ background: color }}>{count}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          {note && <div className="mt-0.5 text-xs text-slate-500">{note}</div>}
          {bar != null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
              <div className="h-full rounded-full" style={{ width: `${clamp(bar)}%`, background: color }} />
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ตารางอันดับ (กลุ่มยา / Ward): หัวตารางล็อก, เลื่อนในกรอบความสูงคงที่
// จอง scrollbar ไว้ทั้งสองฝั่ง (scrollbar-gutter) เพื่อให้คอลัมน์ตรงกัน
// rows = [{ key, name, total, pct }]
// goal = ถ้าส่งมา จะแสดงขีดเป้าบนแท่ง (ไม่มีคอลัมน์ vs เป้า)
function RankTable({ rows, goal }) {
  return (
    <div className="max-h-[340px] overflow-auto [scrollbar-gutter:stable]">
      <div className={`${RANK_GRID} sticky top-0 z-10 border-b border-slate-200 bg-white pb-1.5 text-[11px] font-medium text-slate-400`}>
        <span>ชื่อ</span>
        <span className="text-right">Orders</span>
        <span />
        <span className="text-right">% ผ่าน</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const few = r.total < MIN_SAMPLE;
          const v = r.pct == null ? 0 : clamp(r.pct);
          return (
            <li key={r.key} className={`${RANK_GRID} py-2 text-sm ${few ? 'opacity-50' : ''}`} title={few ? 'ตัวอย่างน้อย ควรตีความอย่างระมัดระวัง' : undefined}>
              <span className="truncate text-slate-800" title={r.name}>{r.name}</span>
              <span className="text-right text-xs tabular-nums text-slate-500">{dash(r.total)}</span>
              <div className="relative h-2 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-slate-500" style={{ width: `${v}%` }} />
                {goal != null && <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-slate-800/70" style={{ left: `${clamp(goal)}%` }} />}
              </div>
              <span className="text-right font-semibold tabular-nums text-slate-900">{pct(r.pct)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const SortBtn = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick}
    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${on ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
    {children}
  </button>
);

export default function Dashboard() {
  const { meta } = useMeta();
  const primary = meta.kpis.find((k) => k.is_primary) || meta.kpis[0];

  // year / subgroup / ward ใช้ร่วมกับหน้า Monthly Report (คีย์ 'shared-filters')
  // KPI เก็บแยกเฉพาะ Dashboard
  const [sh, setSh] = useStored('shared-filters', { year: meta.years[0] || '', subgroup: 'all', ward: 'all' });
  const [kpiSel, setKpiSel] = useStored('dash-kpi', primary?.id || '');
  const f = { year: sh.year, month: '', subgroup: sh.subgroup, ward: sh.ward, kpi: kpiSel };
  const setF = (n) => {
    setSh({ year: n.year, subgroup: n.subgroup, ward: n.ward });
    setKpiSel(n.kpi);
  };

  const [per, setPer] = useState(null); // null = เดือนล่าสุดที่มีข้อมูล, -1 = ทั้งปี, 0-11 = เดือน
  const [sortW, setSortW] = useState('orders'); // 'orders' = ตามจำนวน order, 'pct' = % ต่ำสุดก่อน
  const rq = qs({ year: f.year, subgroup: f.subgroup, ward: f.ward });
  const dq = qs(f);
  const prevYear = Number(f.year || meta.years[0]) - 1;
  const R = useAsync(() => (meta.years.length ? api(`/report?${rq}`) : Promise.resolve([])), [rq]);
  const D = useAsync(() => (meta.years.length && f.kpi !== '' ? api(`/dashboard?${dq}`) : Promise.resolve(null)), [dq]);
  const Q = useAsync(() => (meta.years.length ? api(`/data-quality?${rq}`) : Promise.resolve(null)), [rq]);
  const P = useAsync(
    () => (meta.years.length ? api(`/report?${qs({ year: prevYear, subgroup: f.subgroup, ward: f.ward })}`).catch(() => []) : Promise.resolve([])),
    [prevYear, f.subgroup, f.ward]
  );

  if (!meta.years.length) {
    return <Panel><Empty>ยังไม่มีข้อมูล — <Link className="text-blue-700 underline" to="/import">นำเข้าไฟล์ Excel</Link> ก่อน</Empty></Panel>;
  }

  const year = f.year || meta.years[0];
  const rep = R.data || [];
  const cur = rep.find((r) => String(r.kpi.id) === String(f.kpi)) || rep[0];
  const prevCur = (P.data || []).find((r) => String(r.kpi.id) === String(f.kpi)) || null;
  const d = D.data;
  const exp = (type, format) => `/api/export?${qs({ ...f, type, format })}`;

  let body = null;
  if (cur) {
    const kpi = cur.kpi;
    const goal = kpi.pass_rate_goal;
    const has = cur.months.map((m, i) => (m.total > 0 ? i : -1)).filter((i) => i >= 0);
    const sel = per === null ? (has.length ? has[has.length - 1] : -1) : per;
    const c = sel < 0 ? cur.year : cur.months[sel];
    const prevIdx = sel >= 0 ? has.filter((i) => i < sel).pop() : undefined;
    const pc = prevIdx != null ? cur.months[prevIdx] : null;
    const label = sel >= 0 ? `${MONTHS[sel]} ${year}` : `ทั้งปี ${year}`;
    const u = kpi.unit === 'minutes' ? 'min' : 'sec';
    const tgtSec = kpi.unit === 'minutes' ? kpi.target * 60 : kpi.target;
    const ok = c.pct != null && (goal == null || c.pct >= goal);
    const delta = (a, b, lowerBetter) => {
      if (!b || a == null) return null;
      const x = ((a - b) / b) * 100;
      const good = lowerBetter === undefined ? null : lowerBetter ? x <= 0 : x >= 0;
      return <div className="mt-2 text-xs text-slate-500"><span className={good === null ? 'text-slate-600' : good ? 'text-emerald-600' : 'text-rose-600'}>{x >= 0 ? '↑' : '↓'} {Math.abs(x).toFixed(0)}%</span> เทียบเดือนก่อน</div>;
    };

    // ข้อมูลสูญหายตามกฎคัดกรอง 3 ข้อ (ของเดือน/ทั้งปีที่เลือก)
    const qc = Q.data ? (sel >= 0 ? Q.data.months[sel] : Q.data.year) : null;
    const lost = qc ? [
      ['ไม่มีเวลาเภสัชจ่ายยา', qc.NO_DISPENSE],
      ['ไม่มีเวลาพยาบาลให้ยา (counting)', qc.NO_ADMIN],
      [`สั่งยา → พยาบาลให้ยา นานเกิน ${Q.data.maxHours} ชม.`, qc.OVER_LIMIT],
    ] : [];
    const lostTotal = lost.reduce((a, [, v]) => a + (v || 0), 0);
    const anomalies = c.anomalies || 0;
    const rawTotal = (c.total || 0) + lostTotal + anomalies;
    const cover = rawTotal ? ((c.total || 0) / rawTotal) * 100 : null;

    const steps = (cur.steps || []).map((s) => ({ label: s.label.replace(' (avg time)', ''), ...(sel < 0 ? s.year : s.months[sel]) }));
    const sum = steps.reduce((a, s) => a + (s.avg_sec || 0), 0);
    const longest = steps.filter((s) => s.n).sort((a, b) => b.avg_sec - a.avg_sec)[0];
    const shareOf = (s) => (sum && s.n ? (s.avg_sec / sum) * 100 : 0);

    const wards = d?.wards || [];
    const sortedWards = sortW === 'pct'
      ? [...wards].sort((a, b) => (a.total < MIN_SAMPLE) - (b.total < MIN_SAMPLE) || (a.pct ?? 101) - (b.pct ?? 101))
      : wards;
    const topMax = Math.max(1, ...(d?.top || []).map((t) => t.sec));
    const lowWard = wards.filter((w) => w.total >= 20 && w.pct != null).sort((a, b) => a.pct - b.pct)[0];

    const stepNames = steps.map((s) => s.label);
    const stepData = has.length
      ? [...has.map((i) => ({ x: MONTHS[i], i })), { x: 'ทั้งปี', i: -1 }].map((o) => {
          const r = { x: o.x };
          (cur.steps || []).forEach((x, k) => { const v = o.i < 0 ? x.year : x.months[o.i]; r[stepNames[k]] = v?.n ? Math.round((v.avg_sec / 60) * 100) / 100 : null; });
          return r;
        })
      : [];

    const avgOk = c.avg_sec != null && c.avg_sec <= tgtSec;

    body = (
      <div className="space-y-6">
        {/* ── 1. ภาพรวมผลงาน ── */}
        <Section title={`ภาพรวมผลงาน · ${label}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon="list" color="#e11d48" cls="border-rose-100 bg-rose-50" label="Total Orders" value={num(c.total)} sub={`ประเมินได้ ${label}`}
              foot={delta(c.total, pc?.total) || <div className="mt-2 text-xs text-slate-400">ไม่มีเดือนก่อนให้เทียบ</div>} />
            <StatCard icon="check" color="#059669" cls="border-emerald-100 bg-emerald-50" label={`≤ ${kpi.target} ${u}`} value={num(c.pass)}
              sub={<><b className="text-base text-emerald-700">{c.total ? pct((c.pass / c.total) * 100) : '-'}</b><br />ของทั้งหมด</>}
              foot={<MiniBar v={c.total ? (c.pass / c.total) * 100 : 0} color="#059669" goal={goal} />} />
            <StatCard icon="alert" color="#dc2626" cls="border-red-100 bg-red-50" label={`> ${kpi.target} ${u}`} value={num(c.fail)}
              sub={<><b className="text-base text-red-700">{c.total ? pct((c.fail / c.total) * 100) : '-'}</b><br />ของทั้งหมด</>}
              foot={<MiniBar v={c.total ? (c.fail / c.total) * 100 : 0} color="#dc2626" />} />
            <StatCard icon="clock" color="#2563eb" cls="border-blue-100 bg-blue-50" label="Average Time" value={mmss(c.avg_sec)} sub={`Median ${mmss(c.median_sec)}`}
              foot={<>
                {delta(c.avg_sec, pc?.avg_sec, true)}
                <div className={`mt-1 text-xs ${avgOk ? 'text-emerald-600' : 'text-slate-500'}`}>เป้าเฉลี่ย ≤ {mmss(tgtSec)}</div>
              </>} />
          </div>

          <div className="grid items-stretch gap-4 md:grid-cols-2">
            <Panel className="h-full" title="อัตราผ่านเกณฑ์เทียบเป้า" subtitle={`≤ ${kpi.target} ${u} · ${label}`}>
              <div className="flex flex-col items-center justify-center gap-7 py-2 md:min-h-[480px]">
                <div className="relative h-72 w-72 max-w-full shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{ v: c.pass || 0 }, { v: c.fail || 0 }]} dataKey="v" innerRadius="74%" outerRadius="98%" startAngle={90} endAngle={-270} stroke="none">
                        <Cell fill="#2563eb" /><Cell fill="#fecdd3" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-semibold tabular-nums text-slate-900">{pct(c.pct)}</span>
                    <span className="mt-1 text-sm text-slate-500">ผ่านเกณฑ์</span>
                  </div>
                </div>

                <div className="grid w-full max-w-md grid-cols-2 gap-2">
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-blue-50 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-slate-700"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />ผ่านเกณฑ์</span>
                    <b className="tabular-nums text-slate-900">{num(c.pass)}</b>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-slate-700"><span className="h-2.5 w-2.5 rounded-full bg-rose-300" />ไม่ผ่านเกณฑ์</span>
                    <b className="tabular-nums text-slate-900">{num(c.fail)}</b>
                  </div>
                </div>

                <div className="flex w-full max-w-md items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">เป้าหมาย <b className="ml-1 text-sm text-slate-800">{goal != null ? `≥ ${goal}%` : targetLabel(kpi)}</b></span>
                  {goal != null && c.pct != null && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {ok ? 'ถึงเป้าแล้ว' : `ต่ำกว่าเป้า ${(goal - c.pct).toFixed(1)} จุด`}
                    </span>
                  )}
                </div>
              </div>
            </Panel>

            <Panel className="h-full" title="รายการที่ต้องติดตาม" subtitle={label}>
              <div className="space-y-3">
                <FollowRow
                  color="#e11d48" cls="border-rose-100 bg-rose-50/60" count={num(c.fail || 0)}
                  title={`เกินเวลา (> ${kpi.target} ${u})`}
                  note={c.total ? `${pct((c.fail / c.total) * 100)} ของ order ที่ประเมินได้` : null}
                  bar={c.total ? (c.fail / c.total) * 100 : 0}
                />

                <FollowRow
                  color="#f59e0b" cls="border-amber-100 bg-amber-50/60" count={num(lostTotal)}
                  title="ข้อมูลสูญหาย (ไม่ครบตามกฎคัดกรอง)"
                  note={rawTotal ? `${pct((lostTotal / rawTotal) * 100)} ของ order ทั้งหมดในช่วงนี้` : null}
                >
                  <ul className="mt-3 space-y-2 border-t border-amber-100 pt-3">
                    {lost.map(([t, v]) => (
                      <li key={t}>
                        <div className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="min-w-0 text-slate-600">{t}</span>
                          <b className="shrink-0 tabular-nums text-slate-800">{num(v || 0)}</b>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/80">
                          <div className="h-full rounded-full bg-amber-400" style={{ width: `${lostTotal ? ((v || 0) / lostTotal) * 100 : 0}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </FollowRow>

                <FollowRow
                  color="#6366f1" cls="border-indigo-100 bg-indigo-50/60" count={num(anomalies)}
                  title="ข้อมูลผิดปกติ" note="เวลาย้อนหลัง / เกิน 24 ชม."
                />

                {cover != null && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium text-slate-600">ความครบถ้วนของข้อมูล</span>
                      <b className="text-sm tabular-nums text-slate-900">{pct(cover)}</b>
                    </div>
                    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="bg-blue-600" style={{ width: `${(c.total / rawTotal) * 100}%` }} title={`ประเมินได้ ${num(c.total)}`} />
                      <div className="bg-amber-400" style={{ width: `${(lostTotal / rawTotal) * 100}%` }} title={`สูญหาย ${num(lostTotal)}`} />
                      <div className="bg-indigo-500" style={{ width: `${(anomalies / rawTotal) * 100}%` }} title={`ผิดปกติ ${num(anomalies)}`} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-600" />ประเมินได้ {num(c.total)}</span>
                      <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" />สูญหาย {num(lostTotal)}</span>
                      <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-indigo-500" />ผิดปกติ {num(anomalies)}</span>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {pc?.pct != null && c.pct != null && (() => {
              const x = c.pct - pc.pct;
              return (
                <TakeCard
                  tone={x >= 0 ? 'emerald' : 'rose'} icon="trend" label="แนวโน้มเทียบเดือนก่อน"
                  value={`${x >= 0 ? '+' : ''}${x.toFixed(1)} `}
                  sub={`% ผ่านเกณฑ์ ${pct(pc.pct)} (${MONTHS[prevIdx]}) → ${pct(c.pct)}`}
                />
              );
            })()}
            {longest && (
              <TakeCard tone="amber" icon="clock" label="ขั้นตอนที่นานที่สุด" value={mmss(longest.avg_sec)} sub={`${longest.label} · ${shareOf(longest).toFixed(0)}% ของเวลารวม`} />
            )}
            {lowWard && (
              <TakeCard tone="rose" icon="alert" label="Ward ที่ควรปรับปรุง" value={pct(lowWard.pct)} sub={`${lowWard.ward} · % ผ่านต่ำสุด`} />
            )}
          </div>
        </Section>

        {/* ── 2. Process Time ── */}
        {steps.length > 0 && (
          <Section title="Process Time แต่ละขั้นตอน">
            <div className="grid gap-4 lg:grid-cols-12">
              <Panel title="สัดส่วนเวลาแต่ละขั้นตอน" subtitle={`เวลาเฉลี่ย · ${label}`} className="lg:col-span-5">
                <div className="space-y-4">
                  {steps.map((s, i) => (
                    <div key={s.label}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2 text-slate-700">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: FLOW[i % 3] }} />
                          <span className="truncate">{s.label}</span>
                        </span>
                        <span className="shrink-0">
                          <b className="tabular-nums text-slate-900">{s.n ? mmss(s.avg_sec) : '-'}</b>
                          {s.n > 0 && <span className="ml-1.5 text-xs text-slate-400">{shareOf(s).toFixed(0)}%</span>}
                        </span>
                      </div>
                      <div className="mt-1.5"><Bar value={shareOf(s)} color={FLOW[i % 3]} /></div>
                    </div>
                  ))}
                </div>
                {longest && (
                  <div className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-slate-600">
                    ใช้เวลานานที่สุด: <b className="text-blue-800">{longest.label}</b> ({shareOf(longest).toFixed(1)}% ของเวลารวม)
                  </div>
                )}
              </Panel>

              {stepNames.length > 0 && stepData.length > 1 && (
                <Panel title="แนวโน้มรายเดือน" subtitle="เวลาเฉลี่ย (นาที) · แท่งซ้อนตามลำดับขั้นตอน" className="lg:col-span-7">
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={stepData} margin={{ left: -10, right: 8 }}>
                      <CartesianGrid stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="x" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit=" น." />
                      <Tooltip contentStyle={tip} cursor={{ fill: '#f1f5f9' }} formatter={(v, n) => [mmss(v * 60), n]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {stepNames.map((n, k) => (
                        <RBar key={n} dataKey={n} stackId="steps" fill={FLOW[k % 3]} barSize={40} radius={k === stepNames.length - 1 ? [4, 4, 0, 0] : 0} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>
              )}
            </div>
          </Section>
        )}

        {/* ── 3. เปรียบเทียบ ── */}
        <Section title="เปรียบเทียบผลงาน">
          <Panel
            title={`${kpi.name} · ${year}`}
            subtitle={`เทียบกับปี ${Number(year) - 1} · เส้น = % ผ่านเป้า (แกนซ้าย) · แท่ง = เวลาเฉลี่ย (แกนขวา) · เส้นเขียว = Target`}
          >
            <YearCompareChart cur={cur} prev={prevCur} year={year} kpi={kpi} />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              className="h-full"
              title="เปรียบเทียบกลุ่มยา"
              subtitle={`ปี ${year} · ยา 1 ตัวอาจอยู่ได้หลายกลุ่ม`}
            >
              <RankTable
                goal={null}
                rows={(d?.compare || []).map((g) => ({ key: g.id, name: g.name, total: g.total, pct: g.pct }))}
              />
              {D.loading && !d && <Loading />}
              {d && (d.compare || []).length === 0 && <Empty />}
            </Panel>

            <Panel
              className="h-full"
              title="ผลงานแยกตาม Ward"
              subtitle={`ปี ${year} · ${wards.length} ward${goal != null ? ` · ขีดดำบนแท่ง = เป้า ${goal}%` : ''}`}
              actions={
                <div className="flex gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
                  <SortBtn on={sortW === 'orders'} onClick={() => setSortW('orders')}>ตามจำนวน order</SortBtn>
                  <SortBtn on={sortW === 'pct'} onClick={() => setSortW('pct')}>% ต่ำสุดก่อน</SortBtn>
                </div>
              }
            >
              <RankTable
                goal={goal}
                rows={sortedWards.map((w) => ({ key: w.ward, name: w.ward, total: w.total, pct: w.pct }))}
              />
              {D.loading && !d && <Loading />}
              {d && wards.length === 0 && <Empty />}
            </Panel>
          </div>
        </Section>

        {/* ── 4. รายการที่ต้องตรวจสอบ ── */}
        <Section title="รายการที่ต้องตรวจสอบ">
          <Panel title="รายการที่ใช้เวลานานที่สุด" subtitle={`10 อันดับ · ปี ${year} · อาจเป็น outlier ควรตรวจสอบก่อนสรุปผล`}>
            <ol className="grid xl:grid-cols-2 xl:gap-x-10">
              {(d?.top || []).map((t, i) => (
                <li key={t.id} className="border-b border-slate-100 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${i < 3 ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800" title={t.item_name}>{t.item_name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{t.ward}</span>
                        <span className="tabular-nums">{t.t_order.slice(0, 16)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="whitespace-nowrap text-base font-semibold tabular-nums text-slate-900">{longDur(t.sec)}</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-400" style={{ width: `${Math.max(3, (t.sec / topMax) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
            {D.loading && !d && <Loading />}
            {d && d.top.length === 0 && <Empty />}
          </Panel>
        </Section>
      </div>
    );
    body = { chips: has, label, node: body };
  }

  const chips = body?.chips || [];
  const active = body ? (per === null ? (chips.length ? chips[chips.length - 1] : -1) : per) : -1;

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-navy-900 px-6 py-5 text-white">
          <div>
            <div className="text-2xl font-semibold">Pharmacy Process Time Dashboard</div>
            <div className="mt-1 text-sm text-white/60">ถูกเวลา · ปลอดภัย · ผลลัพธ์ที่ดีขึ้น</div>
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1"><Filters meta={meta} value={f} onChange={setF} showMonth={false} showKpi /></div>
          <Field label="Month">
            <select className="input w-36" value={active} onChange={(e) => setPer(Number(e.target.value))} disabled={!chips.length}>
              <option value={-1}>ทั้งปี</option>
              {chips.map((i) => <option key={i} value={i}>{MONTHS[i]} {year}</option>)}
            </select>
          </Field>
          <div className="flex gap-2">
            <a className="btn" href={exp('dashboard', 'xlsx')}>Export Excel</a>
            <a className="btn" href={exp('dashboard', 'csv')}>Export CSV</a>
          </div>
        </div>
      </div>

      <ErrorBox error={R.error || D.error} />
      {R.loading && !R.data && <Loading />}
      {body?.node}
    </>
  );
}