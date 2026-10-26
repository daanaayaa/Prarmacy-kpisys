import { Panel } from './ui.jsx';
import { MONTHS } from '../lib/format.js';

// เหตุผลที่ตัดข้อมูลออก (ตัวย่อสำหรับแสดงผล) — ลำดับตรงกับกฎใน backend/src/lib/rules.js
export const REASONS = [
  { key: 'LOCATION', label: 'Ward นอก รพ. (Airport / Rawai / Khaolak)', short: 'Ward ถูกตัดออก', tone: 'bg-slate-100 text-slate-700' },
  { key: 'NO_DISPENSE', label: 'ไม่มีเวลาเภสัชจ่ายยา', short: 'ไม่มีเวลาจ่ายยา', tone: 'bg-amber-50 text-amber-800' },
  { key: 'NO_ADMIN', label: 'ไม่มีเวลาพยาบาลให้ยา', short: 'ไม่มีเวลาพยาบาลให้ยา', tone: 'bg-rose-50 text-rose-700' },
  { key: 'NEG_TIME', label: 'ลำดับเวลาผิดปกติ (เวลาย้อนหลัง)', short: 'เวลาย้อนหลัง', tone: 'bg-violet-50 text-violet-700' },
  { key: 'OVER_LIMIT', label: 'สั่งยา → พยาบาลให้ยา นานเกินกำหนด', short: 'นานเกินกำหนด', tone: 'bg-orange-50 text-orange-700' },
  { key: 'DRUG', label: 'ยาที่เลือกตัดออก (มติคณะกรรมการ)', short: 'ยาที่เลือกตัดออก', tone: 'bg-blue-50 text-blue-700' },
];

const n = (v) => (v ? Number(v).toLocaleString() : '0');
const pctOf = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');

/** แถบสรุปบน Dashboard: ข้อมูลทั้งหมด / ใช้ได้ / ตัดออก ของเดือน (หรือทั้งปี) ที่เลือก + order ที่ไม่มีเวลาพยาบาลให้ยาแยกตาม ward */
export function QualityStrip({ dq, sel, label }) {
  if (!dq) return null;
  const c = sel >= 0 ? dq.months[sel] : dq.year;
  const wards = (dq.missingAdmin || [])
    .map((w) => ({ ward: w.ward, n: sel >= 0 ? w.months[sel] : w.total }))
    .filter((w) => w.n > 0)
    .sort((a, b) => b.n - a.n);
  const usablePct = c.total ? (c.usable / c.total) * 100 : 0;

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">คุณภาพข้อมูล · {label}</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))]">
          <div>
            <div className="text-xs font-medium text-slate-500">ข้อมูลทั้งหมด (raw)</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{n(c.total)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-emerald-700">ใช้ได้ (นำไปคำนวณ KPI)</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-emerald-700">{n(c.usable)}</span>
              <span className="text-sm tabular-nums text-slate-500">{pctOf(c.usable, c.total)}</span>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">ตัดออก</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-700">{n(c.excluded)}</div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${usablePct}%` }} />
        </div>
        {c.excluded > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {REASONS.filter((r) => c[r.key] > 0).map((r) => (
              <span key={r.key} title={r.label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${r.tone}`}>
                {r.short}<b className="tabular-nums">{n(c[r.key])}</b>
              </span>
            ))}
          </div>
        )}
        {wards.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="mb-2 text-xs font-medium text-slate-500">Order ที่ไม่มีเวลาพยาบาลให้ยา แยกตาม Ward <span className="text-slate-400">(รวม {n(c.NO_ADMIN)} order · นับเฉพาะกรณีไม่มีเวลาให้ยา)</span></div>
            <div className="flex flex-wrap gap-2">
              {wards.map((w) => (
                <span key={w.ward} className="inline-flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50/60 px-2.5 py-1 text-xs text-slate-700">
                  <span className="font-medium">{w.ward}</span>
                  <b className="tabular-nums text-rose-700">{n(w.n)}</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const HEAD = (first) => (
  <tr className="bg-navy-900 text-white">
    <th className="sticky left-0 bg-navy-900 px-3 py-2 text-left text-xs font-semibold">{first}</th>
    {MONTHS.map((m) => <th key={m} className="px-3 py-2 text-right text-xs font-semibold">{m}</th>)}
    <th className="bg-navy-700 px-3 py-2 text-right text-xs font-semibold">Year Total</th>
  </tr>
);
const Cell = ({ v, i, cls = '' }) => (
  <td className={`px-3 py-2 text-right text-sm tabular-nums ${i === 12 ? 'bg-blue-50/60 font-semibold' : ''} ${v ? cls : 'text-slate-300'}`}>{v ? Number(v).toLocaleString() : '-'}</td>
);

/** ตารางรายเดือนในหน้า Monthly Report */
export function QualityTable({ dq }) {
  if (!dq) return null;
  const cols = [...dq.months, dq.year];
  const rows = [
    { label: 'ข้อมูลทั้งหมด (raw)', get: (c) => c.total, cls: 'font-medium' },
    { label: 'ใช้ได้ (นำไปคำนวณ KPI)', get: (c) => c.usable, cls: 'font-semibold text-emerald-700', rowCls: 'bg-emerald-50/50' },
    { label: 'ตัดออก', get: (c) => c.excluded, cls: 'text-slate-700' },
    ...REASONS.map((r) => ({ label: `— ${r.label}`, get: (c) => c[r.key], cls: 'text-slate-500', sub: true })),
  ];
  return (
    <details open className="group overflow-hidden rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-4 px-4 py-3">
        <span className="text-sm font-semibold text-slate-800">จำนวนข้อมูลทั้งหมด / ใช้ได้</span>
        <span className="text-xs font-normal text-slate-500">
          ทั้งปี: ทั้งหมด {n(dq.year.total)} · ใช้ได้ <b className="text-emerald-700">{n(dq.year.usable)}</b> · ตัดออก {n(dq.year.excluded)}
        </span>
      </summary>
      <div className="overflow-x-auto border-t border-slate-100">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead>{HEAD('จำนวนข้อมูล')}</thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={`border-b border-slate-100 ${r.rowCls || ''}`}>
                <td className={`sticky left-0 px-3 py-2 text-sm ${r.sub ? 'bg-white pl-6 text-xs text-slate-500' : `${r.rowCls ? 'bg-emerald-50' : 'bg-white'} text-slate-700`}`}>{r.label}</td>
                {cols.map((c, i) => <Cell key={i} v={r.get(c)} i={i} cls={r.cls} />)}
              </tr>
            ))}
            <tr className="border-b border-slate-100">
              <td className="sticky left-0 bg-white px-3 py-2 text-sm text-slate-700">% ใช้ได้</td>
              {cols.map((c, i) => (
                <td key={i} className={`px-3 py-2 text-right text-sm tabular-nums ${i === 12 ? 'bg-blue-50/60 font-semibold' : ''} ${c.total ? '' : 'text-slate-300'}`}>{c.total ? pctOf(c.usable, c.total) : '-'}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Order ที่ไม่มีเวลาพยาบาลให้ยา แยกตาม Ward × เดือน (นับเฉพาะ NO_ADMIN) */
export function MissingAdminTable({ dq }) {
  const list = dq?.missingAdmin || [];
  if (!list.length) return null;
  const sum = (i) => list.reduce((a, w) => a + (i === 12 ? w.total : w.months[i]), 0);
  return (
    <Panel
      title="Order ที่ไม่มีเวลาพยาบาลให้ยา แยกตาม Ward"
      subtitle="นับเฉพาะ order ที่ไม่มีเวลาพยาบาลให้ยา (admin) เท่านั้น — ไม่รวม order ที่ถูกตัดด้วยเหตุผลอื่น เช่น ไม่มีเวลาจ่ายยา, Ward นอก รพ., เวลาย้อนหลัง, นานเกินกำหนด"
      className="overflow-hidden"
    >
      <div className="-m-4 overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead>{HEAD('Ward')}</thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.ward} className="border-b border-slate-100">
                <td className="sticky left-0 bg-white px-3 py-2 text-sm text-slate-700">{w.ward}</td>
                {[...w.months, w.total].map((v, i) => <Cell key={i} v={v} i={i} cls="text-rose-700" />)}
              </tr>
            ))}
            <tr className="bg-slate-50 font-medium">
              <td className="sticky left-0 bg-slate-50 px-3 py-2 text-sm text-slate-800">รวม</td>
              {Array.from({ length: 13 }, (_, i) => <Cell key={i} v={sum(i)} i={i} cls="text-slate-800" />)}
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}