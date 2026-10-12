import { useMemo, useState } from 'react';
import { Empty } from './ui.jsx';

/**
 * เลือกว่ายาตัวไหน "นับ" หรือ "ตัด" จาก KPI — สีเขียว = นับ, สีแดง = ตัด (เหมือนบัญชียา)
 * drugs  = [{ item_code, item_name, n }]   (เฉพาะยาที่มีในข้อมูลเดือนนั้น)
 * value  = Set ของ item_code ที่ตัด
 * locked = Set ของ item_code ที่ถูกตัดแบบ "ทุกเดือน" (ล็อก — กรณีข้อมูลเก่า)
 */
export default function DrugPicker({ drugs, value, onChange, locked = new Set(), maxHeight = 520 }) {
  const [tab, setTab] = useState('all');
  const [term, setTerm] = useState('');
  const isCut = (c) => locked.has(c) || value.has(c);

  const counts = useMemo(() => {
    let cut = 0; let cutN = 0; let totalN = 0;
    for (const d of drugs) { totalN += d.n; if (isCut(d.item_code)) { cut++; cutN += d.n; } }
    return { all: drugs.length, cut, keep: drugs.length - cut, cutN, totalN };
  }, [drugs, value, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = term.trim().toLowerCase();
  const list = useMemo(() => drugs.filter((d) => {
    if (tab === 'cut' && !isCut(d.item_code)) return false;
    if (tab === 'keep' && isCut(d.item_code)) return false;
    return !t || d.item_code.toLowerCase().includes(t) || (d.item_name || '').toLowerCase().includes(t);
  }), [drugs, tab, t, value, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (codes, cut) => {
    const s = new Set(value);
    codes.forEach((c) => { if (!locked.has(c)) { if (cut) s.add(c); else s.delete(c); } });
    onChange(s);
  };

  const TABS = [['all', 'ทั้งหมด', counts.all], ['keep', 'นับ', counts.keep], ['cut', 'ตัดออก', counts.cut]];
  const pct = counts.totalN ? ((counts.cutN / counts.totalN) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {TABS.map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${tab === k ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {label} <span className={`ml-1 tabular-nums ${k === 'cut' && n ? 'text-red-600' : k === 'keep' && n ? 'text-emerald-600' : ''}`}>{n.toLocaleString()}</span>
            </button>
          ))}
        </div>
        <input className="input w-64" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ค้นหายา (ชื่อ / รหัส)" />
        <div className="ml-auto text-xs text-slate-500">
          ตัดออกจาก KPI <b className="tabular-nums text-slate-800">{counts.cutN.toLocaleString()}</b> จาก {counts.totalN.toLocaleString()} order ({pct}%)
        </div>
      </div>

      {list.length > 1 && (term || tab !== 'all') && (
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>ที่แสดง {list.length.toLocaleString()} รายการ:</span>
          <button type="button" className="text-red-600 hover:underline" onClick={() => set(list.map((d) => d.item_code), true)}>ตัดทั้งหมดที่แสดง</button>
          <button type="button" className="text-emerald-700 hover:underline" onClick={() => set(list.map((d) => d.item_code), false)}>นับทั้งหมดที่แสดง</button>
        </div>
      )}

      {list.length === 0 ? <Empty>ไม่พบรายการยา</Empty> : (
        <ul className="divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 bg-white" style={{ maxHeight }}>
          {list.map((d) => {
            const lock = locked.has(d.item_code);
            const cut = isCut(d.item_code);
            return (
              <li key={d.item_code} className={`flex items-center gap-4 border-l-4 px-4 py-2.5 ${cut ? 'border-l-red-400 bg-red-50/30' : 'border-l-emerald-400'}`}>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-medium ${cut ? 'text-slate-500' : 'text-slate-800'}`} title={d.item_name}>{d.item_name || '(ไม่มีชื่อ)'}</div>
                  <div className="text-xs text-slate-400">{d.item_code}</div>
                </div>
                <div className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-500">{d.n.toLocaleString()} order</div>
                <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-200 text-xs font-medium">
                  <button type="button" disabled={lock} onClick={() => set([d.item_code], false)}
                    className={`px-3 py-1.5 transition ${!cut ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>นับ</button>
                  <button type="button" disabled={lock} onClick={() => set([d.item_code], true)}
                    className={`px-3 py-1.5 transition ${cut ? 'bg-red-500 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>{lock ? 'ตัด (ทุกเดือน)' : 'ตัด'}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}