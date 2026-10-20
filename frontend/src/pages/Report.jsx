import { useEffect, useRef, useState } from 'react';
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

// ---- Fit-to-width: ย่อ/ขยายตัวอักษรและ padding ตามความกว้างของ container ----
const BASE_WIDTH = 1100; // ความกว้างที่ใช้ฟอนต์ขนาดเต็ม
const BASE_FONT = 12; // px ที่ BASE_WIDTH
const MIN_FONT = 6.5;
const MAX_FONT = 14;

function useFitFont() {
  const ref = useRef(null);
  const [font, setFont] = useState(BASE_FONT);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const w = el.clientWidth || BASE_WIDTH;
      setFont(Math.min(MAX_FONT, Math.max(MIN_FONT, (BASE_FONT * w) / BASE_WIDTH)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, font];
}

// ตารางที่พอดีความกว้างเสมอ: ไม่มี scroll แนวนอน เห็นครบทุกคอลัมน์
function FitTable({ children }) {
  const [ref, font] = useFitFont();
  return (
    <div ref={ref} className="-m-4 overflow-hidden">
      <table className="w-full table-fixed border-collapse" style={{ fontSize: `${font}px` }}>
        <colgroup>
          <col style={{ width: '15%' }} />
          {MONTHS.map((m) => <col key={m} style={{ width: '6%' }} />)}
          <col style={{ width: '13%' }} />
        </colgroup>
        {children}
      </table>
    </div>
  );
}

const HEAD = (
  <tr className="bg-navy-900 text-white">
    <th className="bg-navy-900 px-[0.6em] py-[0.7em] text-left text-[0.95em] font-semibold">Total</th>
    {MONTHS.map((m) => <th key={m} className="px-[0.3em] py-[0.7em] text-right text-[0.95em] font-semibold">{m}</th>)}
    <th className="bg-navy-700 px-[0.4em] py-[0.7em] text-right text-[0.95em] font-semibold leading-tight">Year Total/Avg</th>
  </tr>
);

const LABEL_CLS = 'px-[0.6em] py-[0.7em] text-slate-700 break-words leading-tight';
const CELL_CLS = 'px-[0.3em] py-[0.7em] text-right tabular-nums';

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
      <FitTable>
        <thead>{HEAD}</thead>
        <tbody>
          {rows.map(([label, fn, cls = '', isPct, labelCls = 'bg-white']) => (
            <tr key={label} className="border-b border-slate-100">
              <td className={`${LABEL_CLS} ${labelCls}`}>{label}</td>
              {cols.map((c, i) => {
                const txt = fn(c, i);
                let tone = '';
                if (isPct && c.total && goal != null) tone = c.pct >= goal ? 'text-emerald-600' : 'text-amber-600';
                return <td key={i} className={`${CELL_CLS} ${i === 12 ? 'bg-blue-50/60 font-semibold' : ''} ${cls} ${tone} ${txt === '-' ? 'text-slate-300' : ''}`}>{txt}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </FitTable>
    </Panel>
  );
}

function StepsTable({ steps }) {
  return (
    <Panel title="Process Time แต่ละขั้นตอน (เฉลี่ยรายเดือน)" subtitle="Doctor → Execute → Dispense → Administration" className="overflow-hidden">
      <FitTable>
        <thead>{HEAD}</thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.key} className="border-b border-slate-100">
              <td className={`${LABEL_CLS} bg-white`}>{s.label}</td>
              {[...s.months, s.year].map((c, i) => (
                <td key={i} className={`${CELL_CLS} ${i === 12 ? 'bg-blue-50/60 font-semibold' : ''} ${c.n ? '' : 'text-slate-300'}`}>{c.n ? hms(c.avg_sec) : '-'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </FitTable>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const ICONS = {
  overview: (
    <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  process: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  missing: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" strokeLinejoin="round" />
      <path d="M12 10v4m0 3h.01" strokeLinecap="round" />
    </>
  ),
};

function TabIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
      {ICONS[name]}
    </svg>
  );
}

function TabBar({ tabs, value, onChange }) {
  const idx = Math.max(0, tabs.findIndex((t) => t.key === value));
  const refs = useRef([]);

  const onKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  };

  return (
    // sticky เฉพาะตัวแท็บ + พื้นหลังขาวทึบ (ไม่โปร่งใส) เพื่อไม่ให้เนื้อหาทะลุขึ้นมาซ้อน
    <div className="sticky top-2 z-30">
      <div
        role="tablist"
        aria-label="หัวข้อรายงาน"
        onKeyDown={onKeyDown}
        className="relative grid rounded-2xl border border-slate-200 bg-white p-1.5 shadow-md"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {/* indicator ที่เลื่อนตามแท็บ */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1.5 top-1.5 left-1.5 rounded-xl bg-gradient-to-b from-navy-700 to-navy-900 shadow-md shadow-navy-900/25 transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]"
          style={{
            width: `calc((100% - 0.75rem) / ${tabs.length})`,
            transform: `translateX(${idx * 100}%)`,
          }}
        />
        {tabs.map((t, i) => {
          const active = i === idx;
          return (
            <button
              key={t.key}
              ref={(el) => { refs.current[i] = el; }}
              role="tab"
              type="button"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(t.key)}
              className={`relative z-10 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                active ? 'text-white' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <TabIcon name={t.icon} />
              <span className="truncate">{t.label}</span>
              {t.badge != null && (
                <span
                  className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors sm:inline-block ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Report() {
  const { meta } = useMeta();
  const [f, setF] = useStored('report-filters', { year: meta.years[0] || '', subgroup: 'all', ward: 'all' });
  const [tab, setTab] = useStored('report-tab', 'process');
  const query = qs(f);
  const { data, loading, error } = useAsync(() => (meta.years.length ? api(`/report?${query}`) : Promise.resolve([])), [query]);
  const Q = useAsync(() => (meta.years.length ? api(`/data-quality?${query}`) : Promise.resolve(null)), [query]);
  const exp = (format) => `/api/export?${qs({ ...f, type: 'report', format })}`;
  const steps = data?.[0]?.steps;

  const processCount = (data?.length || 0) + (steps?.length ? 1 : 0);
  const tabs = [
    {
      key: 'overview',
      label: 'ภาพรวมข้อมูล',
      icon: 'overview',
      hint: 'จำนวนข้อมูลทั้งหมด · ใช้ได้ · ถูกตัดออก พร้อมเหตุผล',
    },
    {
      key: 'process',
      label: 'Process Time',
      icon: 'process',
      badge: processCount || null,
      hint: 'Process time 15–30 · PTTC / Total Process · Pharmacy Process · Process Time แต่ละขั้นตอน',
    },
    {
      key: 'missing',
      label: 'ข้อมูลไม่ครบ',
      icon: 'missing',
      hint: 'รายการที่ขาดข้อมูลเวลา (Admin) ซึ่งไม่ถูกนำไปคำนวณ KPI',
    },
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : 'process';
  const activeTab = tabs.find((t) => t.key === active);

  return (
    <>
      <style>{`
        @keyframes reportTabIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .report-tab-in { animation: reportTabIn .28s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .report-tab-in { animation: none; } }
      `}</style>

      <PageHead title="Monthly Report" subtitle="สรุปรายเดือน Jan–Dec ของปีที่เลือก (รูปแบบเดียวกับ Excel เดิม) — เดือนที่ไม่มีข้อมูลแสดงเป็น “-”">
        <a className="btn" href={exp('xlsx')}>Export Excel</a>
        <a className="btn" href={exp('csv')}>Export CSV</a>
      </PageHead>
      <Panel><Filters meta={meta} value={f} onChange={setF} showMonth={false} /></Panel>
      <ErrorBox error={error} />
      {!meta.years.length && <Panel><Empty>ยังไม่มีข้อมูล — นำเข้าไฟล์ Excel ก่อน</Empty></Panel>}

      {meta.years.length > 0 && (
        <>
          <TabBar tabs={tabs} value={active} onChange={setTab} />

          <div key={active} role="tabpanel" className="report-tab-in space-y-4">
            {/* hint อยู่ในพื้นที่เนื้อหา เลื่อนไปพร้อมกัน ไม่ sticky แล้ว */}
            <p className="px-2 text-xs text-slate-500">{activeTab.hint}</p>

            {active === 'overview' && <QualityTable dq={Q.data} />}

            {active === 'process' && (
              <>
                {loading && !data && <Loading />}
                {data?.map((d) => <KpiTable key={d.kpi.id} {...d} />)}
                {steps?.length > 0 && <StepsTable steps={steps} />}
              </>
            )}

            {active === 'missing' && <MissingAdminTable dq={Q.data} />}
          </div>
        </>
      )}
    </>
  );
}