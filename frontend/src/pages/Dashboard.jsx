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
const RANK_GRID = 'grid grid-cols-[minmax(0,1.5fr)_56px_minmax(56px,1fr)_60px_52px] items-center gap-3';
const ICON = {
  list: <path d="M6 7h12M6 12h12M6 17h8" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v5M12 16.2v.1" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  trend: <path d="M4 16l5-5 4 4 7-8M15 7h5v5" />,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
};

const longDur = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} ชม. ${Math.floor((sec % 3600) / 60)} น.` : mmss(sec));

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
    <div className={`min-w-0 rounded-xl border p-4 ${cls}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: color }}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{ICON[icon]}</svg>
        </span>
        <span className="truncate text-sm font-semibold" style={{ color }}>{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{value}</span>
        <span className="text-right text-xs text-slate-500">{sub}</span>
      </div>
      {foot}
    </div>
  );
}

const Alert = ({ n, color, text }) => (
  <div className="flex items-center gap-3 border-b border-slate-100 py-2.5 first:pt-0 last:border-0">
    <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold text-white" style={{ background: color }}>{n}</span>
    <span className="text-sm text-slate-700">{text}</span>
  </div>
);

// ตารางอันดับ (กลุ่มยา / Ward): หัวตารางล็อก, เลื่อนในกรอบความสูงคงที่
// จอง scrollbar ไว้ทั้งสองฝั่ง (scrollbar-gutter) เพื่อให้คอลัมน์ตรงกัน
// rows = [{ key, name, total, pct }]
function RankTable({ rows, goal }) {
  return (
    <div className="max-h-[340px] overflow-auto [scrollbar-gutter:stable]">
      <div className={`${RANK_GRID} sticky top-0 z-10 border-b border-slate-200 bg-white pb-1.5 text-[11px] font-medium text-slate-400`}>
        <span>ชื่อ</span>
        <span className="text-right">Orders</span>
        <span />
        <span className="text-right">% ผ่าน</span>
        <span className="text-right">{goal != null ? 'vs เป้า' : ''}</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const few = r.total < MIN_SAMPLE;
          const v = r.pct == null ? 0 : Math.max(0, Math.min(100, Number(r.pct)));
          const diff = goal != null && r.pct != null ? Number(r.pct) - Number(goal) : null;
          const diffTone = diff == null ? '' : diff >= 0 ? 'text-emerald-600' : diff <= -10 ? 'text-rose-600' : 'text-slate-500';
          return (
            <li key={r.key} className={`${RANK_GRID} py-2 text-sm ${few ? 'opacity-50' : ''}`} title={few ? 'ตัวอย่างน้อย ควรตีความอย่างระมัดระวัง' : undefined}>
              <span className="truncate text-slate-800" title={r.name}>{r.name}</span>
              <span className="text-right text-xs tabular-nums text-slate-500">{dash(r.total)}</span>
              <div className="relative h-2 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-slate-500" style={{ width: `${v}%` }} />
                {goal != null && <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-slate-800/70" style={{ left: `${Math.min(100, Number(goal))}%` }} />}
              </div>
              <span className="text-right font-semibold tabular-nums text-slate-900">{pct(r.pct)}</span>
              <span className={`text-right text-xs tabular-nums ${diffTone}`}>{diff == null ? '' : `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}`}</span>
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
  const [f, setF] = useStored('dash-filters', { year: meta.years[0] || '', month: '', subgroup: 'all', ward: 'all', kpi: primary?.id || '' });
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
      ['ไม่มีเวลาพยาบาลให้ยา', qc.NO_ADMIN],
      [`สั่งยา → พยาบาลให้ยา นานเกิน ${Q.data.maxHours} ชม.`, qc.OVER_LIMIT],
    ] : [];
    const lostTotal = lost.reduce((a, [, v]) => a + (v || 0), 0);

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

    body = (
      <div className="space-y-6">
        {/* ── 1. ภาพรวมผลงาน ── */}
        <Section title={`ภาพรวมผลงาน · ${label}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon="list" color="#e11d48" cls="border-rose-100 bg-rose-50" label="Total Orders" value={num(c.total)} sub={`ประเมินได้ ${label}`} foot={delta(c.total, pc?.total)} />
            <StatCard icon="check" color="#059669" cls="border-emerald-100 bg-emerald-50" label={`≤ ${kpi.target} ${u}`} value={num(c.pass)} sub={<><b className="text-base text-emerald-700">{c.total ? pct((c.pass / c.total) * 100) : '-'}</b><br />ของทั้งหมด</>} />
            <StatCard icon="alert" color="#dc2626" cls="border-red-100 bg-red-50" label={`> ${kpi.target} ${u}`} value={num(c.fail)} sub={<><b className="text-base text-red-700">{c.total ? pct((c.fail / c.total) * 100) : '-'}</b><br />ของทั้งหมด</>} />
            <StatCard icon="clock" color="#2563eb" cls="border-blue-100 bg-blue-50" label="Average Time" value={mmss(c.avg_sec)} sub={`Median ${mmss(c.median_sec)}`} foot={delta(c.avg_sec, pc?.avg_sec, true)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="อัตราผ่านเกณฑ์เทียบเป้า" subtitle={`≤ ${kpi.target} ${u} · ${label}`}>
              <div className="relative">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={[{ v: c.pass || 0 }, { v: c.fail || 0 }]} dataKey="v" innerRadius={50} outerRadius={68} startAngle={90} endAngle={-270} stroke="none">
                      <Cell fill="#2563eb" /><Cell fill="#e2e8f0" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-semibold tabular-nums text-slate-800">{pct(c.pct)}</div>
              </div>
              <div className="text-center text-sm text-slate-500">เป้าหมาย {goal != null ? `≥ ${goal}%` : targetLabel(kpi)}</div>
              {goal != null && c.pct != null && (
                <div className={`mt-1 text-center text-xs font-medium ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {ok ? 'ถึงเป้าแล้ว' : `ต่ำกว่าเป้า ${(goal - c.pct).toFixed(1)} จุด`}
                </div>
              )}
            </Panel>

            <Panel title="รายการที่ต้องติดตาม" subtitle={label}>
              <Alert n={num(c.fail || 0)} color="#e11d48" text={`เกินเวลา (> ${kpi.target} ${u})`} />
              <Alert n={num(lostTotal)} color="#f59e0b" text={(
                <div>
                  <div>ข้อมูลสูญหาย (ไม่ครบตามกฎคัดกรอง)</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    {lost.map(([t, v]) => <span key={t}>{t} <b className="tabular-nums text-slate-700">{num(v || 0)}</b></span>)}
                  </div>
                </div>
              )} />
              <Alert n={num(c.anomalies || 0)} color="#6366f1" text="ข้อมูลผิดปกติ (เวลาย้อนหลัง / เกิน 24 ชม.)" />
              <a className="mt-2 block text-xs text-blue-700 underline" href={exp('orders', 'csv')}>ดาวน์โหลดรายการทั้งหมด (CSV)</a>
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
              subtitle={`ปี ${year} · ยา 1 ตัวอาจอยู่ได้หลายกลุ่ม${goal != null ? ` · ขีดดำบนแท่ง = เป้า ${goal}%` : ''}`}
            >
              <RankTable
                goal={goal}
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
              {(d?.top || []).map((t, i) => {
                const over = t.sec > tgtSec;
                const x = tgtSec > 0 ? t.sec / tgtSec : null;
                return (
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
                );
              })}
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