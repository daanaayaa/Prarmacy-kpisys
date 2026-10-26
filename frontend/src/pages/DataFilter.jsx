import { useEffect, useMemo, useRef, useState } from 'react';
import { useMeta } from '../App.jsx';
import { api, qs } from '../lib/api.js';
import { Empty, ErrorBox, Field, Loading, Panel, useAsync } from '../components/ui.jsx';
import DrugPicker from '../components/DrugPicker.jsx';
import PageHead from '../components/PageHead.jsx';
import { MONTHS } from '../lib/format.js';

/* ───────── helpers: ค้นหา ward แบบคลุมเครือ ───────── */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** คะแนนความคล้าย: ยิ่งน้อยยิ่งตรง, null = ไม่เกี่ยว */
function score(query, name) {
  const q = norm(query);
  const n = norm(name);
  if (!q) return 0;
  if (n.startsWith(q)) return 0;
  if (n.includes(q)) return 1;
  // ตัวอักษรเรียงตามลำดับ (พิมพ์ย่อ เช่น "khk")
  let i = 0;
  for (const ch of n) if (ch === q[i]) i++;
  if (i === q.length && q.length >= 2) return 2;
  // พิมพ์ผิดเล็กน้อย — เทียบกับทุกช่วงของชื่อที่ยาวใกล้เคียงกัน
  if (q.length >= 3) {
    const tol = q.length >= 6 ? 2 : 1;
    let best = Infinity;
    for (let s = 0; s <= Math.max(0, n.length - q.length + 1); s++) {
      for (const len of [q.length - 1, q.length, q.length + 1]) {
        if (len < 2 || s + len > n.length) continue;
        best = Math.min(best, editDistance(q, n.slice(s, s + len)));
      }
    }
    if (best <= tol) return 3 + best;
  }
  return null;
}

/* ───────── 1. เกณฑ์คัดกรองข้อมูลดิบ ───────── */
function WardInput({ value, onChange, locations }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef();
  const inputRef = useRef();
  const listRef = useRef();

  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const covered = (name) => value.some((k) => name.toLowerCase().includes(k));
  const countOf = (kw) => locations.filter((l) => l.name.toLowerCase().includes(kw)).reduce((a, l) => a + (l.count || 0), 0);

  const options = useMemo(() => {
    const q = text.trim();
    const list = locations
      .map((l) => ({ ...l, s: score(q, l.name) }))
      .filter((l) => l.s !== null)
      .sort((a, b) => a.s - b.s || (b.count || 0) - (a.count || 0))
      .slice(0, q ? 12 : 30)
      .map((l) => ({ type: 'ward', name: l.name, count: l.count, done: covered(l.name) }));
    const kw = q.toLowerCase();
    const exact = locations.some((l) => l.name.toLowerCase() === kw);
    if (q && !exact && !value.includes(kw)) list.unshift({ type: 'kw', name: q });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, locations, value]);

  useEffect(() => setHi(0), [text]);

  // เลื่อนรายการตามปุ่มลูกศร
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-i="${hi}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  const add = (raw) => {
    const kw = String(raw).trim().toLowerCase();
    if (kw && !value.includes(kw)) onChange([...value, kw]);
    setText(''); setHi(0); inputRef.current?.focus();
  };
  const remove = (kw) => onChange(value.filter((x) => x !== kw));

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const o = options[hi];
      if (o && !o.done) add(o.name);
      else if (text.trim()) add(text);
    } else if (e.key === 'Backspace' && !text && value.length) remove(value[value.length - 1]);
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={boxRef}>
      <div
        className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"
        onClick={() => { inputRef.current?.focus(); setOpen(true); }}
      >
        {value.map((kw) => {
          const n = locations.length ? countOf(kw) : null;
          return (
            <span key={kw} className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 py-1 pl-3 pr-1.5 text-xs font-medium text-white">
              {kw}
              {n !== null && <span className="text-[11px] font-normal text-slate-300">{n.toLocaleString()} แถว</span>}
              <button type="button" className="flex h-4 w-4 items-center justify-center rounded-full text-slate-300 hover:bg-white/20 hover:text-white" onClick={(e) => { e.stopPropagation(); remove(kw); }} aria-label={`ลบ ${kw}`}>×</button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={value.length ? 'เพิ่ม ward…' : 'พิมพ์ชื่อ ward เช่น airport, rawai…'}
          className="min-w-[160px] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-slate-400"
        />
      </div>

      {/* รายการแนะนำ: อยู่ในการ์ด (ไม่ลอยทับ) ดันเนื้อหาด้านล่างลงไป */}
      {open && options.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
            <span>{text ? 'ชื่อที่คล้ายกัน' : 'Ward ในข้อมูลที่นำเข้า'}</span>
            <button type="button" className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)}>ปิด</button>
          </div>
          <ul ref={listRef} className="max-h-56 overflow-y-auto p-1">
            {options.map((o, i) => (
              <li key={o.type + o.name} data-i={i}>
                <button
                  type="button"
                  disabled={o.done}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => { e.preventDefault(); if (!o.done) add(o.name); }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === hi ? 'bg-blue-50' : ''} ${o.done ? 'cursor-default text-slate-400' : 'text-slate-800'}`}
                >
                  {o.type === 'kw' ? (
                    <span>เพิ่มคำว่า <b>“{o.name}”</b> <span className="text-xs text-slate-500">(ตัดทุก ward ที่มีคำนี้)</span></span>
                  ) : (
                    <>
                      <span className="truncate">{o.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">{o.done ? 'เลือกแล้ว' : `${(o.count || 0).toLocaleString()} แถว`}</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Rule({ no, title, desc }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[11px] font-semibold text-white">{no}</span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800">{title}</div>
        <div className="text-xs leading-relaxed text-slate-500">{desc}</div>
      </div>
    </li>
  );
}

function RulesPanel({ onSaved }) {
  const [s, setS] = useState(null);
  const [hours, setHours] = useState(8);
  const [kws, setKws] = useState([]);
  const [locations, setLocations] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const apply = (settings) => {
    setS(settings);
    setHours(Number(settings.max_order_nurse_hours));
    setKws((settings.excluded_locations || []).map((x) => String(x).toLowerCase()));
  };

  useEffect(() => {
    api('/filter/settings').then((r) => apply(r.settings)).catch(setError);
    // รายชื่อ ward จากข้อมูลที่นำเข้า (ถ้าเรียกไม่ได้ ยังพิมพ์คำเองได้ตามปกติ)
    api('/filter/locations')
      .then((r) => setLocations(Array.isArray(r) ? r : r.items || []))
      .catch(() => setLocations([]));
  }, []);

  const dirty = s && (Number(hours) !== Number(s.max_order_nurse_hours) || kws.join('|') !== (s.excluded_locations || []).join('|'));

  const save = async () => {
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await api('/filter/settings', { method: 'PUT', body: { max_order_nurse_hours: Number(hours), excluded_locations: kws.join('\n') } });
      apply(r.settings);
      setMsg(`บันทึกแล้ว — ตรวจข้อมูลเดิมใหม่ ${r.checked.toLocaleString()} แถว เปลี่ยนสถานะ ${r.changed.toLocaleString()} แถว`);
      onSaved?.();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const step = (d) => setHours((h) => Math.min(72, Math.max(1, Math.round((Number(h) + d) * 2) / 2)));

  return (
    <Panel title="เกณฑ์คัดกรองข้อมูลดิบ" subtitle="ระบบใช้เกณฑ์นี้อัตโนมัติทุกครั้งที่กด Import — ไม่ต้องกรองใน Excel ก่อน">
      <ErrorBox error={error} />
      {!s ? <Loading /> : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* ซ้าย: กฎทั้งหมด */}
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">สิ่งที่ระบบตัดออกให้อัตโนมัติ</div>
            <ol className="divide-y divide-slate-100">
              <Rule no="1" title="ไม่มีเวลาเภสัชจ่ายยา" desc="ตัดออกจากการคำนวณ" />
              <Rule no="2" title="ไม่มีเวลาพยาบาลให้ยา" desc="ตัดออก และนับเป็นข้อมูลสูญหายแยกตาม Ward" />
              <Rule no="3" title={`สั่งยา → พยาบาลให้ยา นานตั้งแต่ ${Number(hours)} ชม. ขึ้นไป`} desc={`ตัดออก — ถ้าไม่ถึง ${Number(hours)} ชม. (เช่น ${Math.max(0, Number(hours) - 1)}:59) ยังใช้`} />
              <Rule
                no="4"
                title="Ward / Location ภายนอก"
                desc={kws.length ? `ตัดทุกเดือน: ${kws.join(', ')}` : 'ยังไม่ได้ตั้งค่า ward ที่ตัดออก'}
              />
              <Rule no="5" title="เวลาเภสัชตรวจยาว่าง" desc="ใช้เวลาเภสัชจ่ายยาแทน (ขั้นตอนเดียวกัน)" />
            </ol>
          </div>

          {/* ขวา: ค่าที่แก้ได้ */}
          <div className="space-y-5 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
            <div>
              <div className="mb-1.5 text-sm font-medium text-slate-800">เวลาสั่งยา → พยาบาลให้ยา สูงสุด</div>
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <button type="button" className="h-10 w-10 text-lg text-slate-600 hover:bg-slate-50" onClick={() => step(-0.5)} aria-label="ลด">−</button>
                  <input
                    className="h-10 w-16 border-x border-slate-200 text-center text-sm font-semibold outline-none"
                    type="number" min="1" max="72" step="0.5" value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                  <button type="button" className="h-10 w-10 text-lg text-slate-600 hover:bg-slate-50" onClick={() => step(0.5)} aria-label="เพิ่ม">+</button>
                </div>
                <span className="text-sm text-slate-500">ชั่วโมง — ถึงค่านี้ขึ้นไปจะถูกตัด</span>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <div className="text-sm font-medium text-slate-800">Ward / Location ที่ตัดออกทุกเดือน</div>
                <div className="text-xs text-slate-400">{locations.length ? `${locations.length} ward ในข้อมูล` : 'พิมพ์คำที่พบในชื่อ ward'}</div>
              </div>
              <WardInput value={kws} onChange={setKws} locations={locations} />
              <p className="mt-1.5 text-xs text-slate-500">พิมพ์บางส่วนก็พอ ระบบจะแนะนำชื่อที่คล้ายกัน · ไม่สนตัวพิมพ์เล็กใหญ่ · กด Enter เพื่อเพิ่ม</p>
            </div>
          </div>
        </div>
      )}

      {msg && <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{msg}</div>}

      {dirty && (
        <div className="sticky bottom-3 mt-4 flex items-center justify-between gap-3 rounded-xl bg-navy-900 px-4 py-3 text-white shadow-lg">
          <div className="text-sm">แก้ไขเกณฑ์ · ยังไม่ได้บันทึก</div>
          <div className="flex gap-2">
            <button className="rounded-lg px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10" disabled={busy} onClick={() => apply(s)}>ยกเลิก</button>
            <button className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-navy-900 hover:bg-slate-100" disabled={busy} onClick={save}>
              {busy ? 'กำลังตรวจข้อมูลใหม่…' : 'บันทึก & ตรวจข้อมูลใหม่'}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** เดือนล่าสุดที่มีข้อมูลของปีที่เลือก (ค่าเริ่มต้น) */
function useLatestMonth(year) {
  const [month, setMonth] = useState('');
  useEffect(() => {
    let alive = true;
    if (!year) return undefined;
    api(`/data-quality?${qs({ year })}`).then((d) => {
      if (!alive) return;
      const last = [...d.months].reverse().find((m) => m.total > 0);
      setMonth((cur) => cur || String(last ? last.month : 1));
    }).catch(() => setMonth((cur) => cur || '1'));
    return () => { alive = false; };
  }, [year]);
  return [month, setMonth];
}

/* ───────── 2. เลือกยาที่ไม่นำมาคำนวณ KPI (รายเดือน) ───────── */
function DrugPanel() {
  const { meta } = useMeta();
  const fileRef = useRef();
  const [year, setYear] = useState(meta.years[0] || '');
  const [month, setMonth] = useLatestMonth(year);
  const [cut, setCut] = useState(null);      // Set ยาที่ตัดของเดือนนี้ (รวมที่ยังไม่บันทึก)
  const [base, setBase] = useState(new Set()); // ที่บันทึกไว้แล้ว
  const [up, setUp] = useState(null);        // ผลอ่านสีจากบัญชียา (รอยืนยัน)
  const [merge, setMerge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const key = month ? `${year}-${String(month).padStart(2, '0')}` : '';
  const scopeLabel = month ? `${MONTHS[month - 1]} ${year}` : '…';

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    setCut(null); setUp(null);
    api('/filter/drug-exclusions').then((rows) => {
      if (!alive) return;
      const s = new Set(rows.filter((r) => r.month_key === key).map((r) => r.item_code));
      setCut(new Set(s)); setBase(s);
    }).catch(setError);
    return () => { alive = false; };
  }, [key, tick]);

  const cand = useAsync(
    () => (year && month ? api(`/filter/drugs?${qs({ year, month, limit: 1000 })}`) : Promise.resolve({ items: [] })),
    [year, month, tick]
  );

  const changes = cut ? [...cut].filter((c) => !base.has(c)).length + [...base].filter((c) => !cut.has(c)).length : 0;

  const save = async () => {
    setBusy(true); setError(null); setMsg(null);
    try {
      await api('/filter/drug-exclusions', { method: 'PUT', body: { month_key: key, codes: [...cut] } });
      setMsg(`บันทึกแล้ว — ${scopeLabel} มีผลกับ Dashboard / Report ทันที`);
      setTick((t) => t + 1);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const pick = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true); setError(null); setMsg(null); setUp(null);
    try { const fd = new FormData(); fd.append('file', file); setUp(await api('/filter/pttc-list/upload', { form: fd })); } catch (err) { setError(err); } finally { setBusy(false); e.target.value = ''; }
  };
  const applyList = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api('/filter/pttc-list/apply', { method: 'POST', body: { token: up.token, year, month, mode: merge ? 'merge' : 'replace' } });
      setMsg(`ตั้งตามบัญชียาแล้ว — ${scopeLabel} ตัดออกจาก KPI ${r.rowsAffected.toLocaleString()} order`);
      setUp(null); setTick((t) => t + 1);
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <Panel title="ยาที่ไม่นำมาคำนวณ KPI" subtitle="เลือกเดือน แล้วกำหนดว่ายาแต่ละตัว นับ หรือ ตัด — มีผลกับ Dashboard / Report ทันที ไม่ต้อง import ใหม่">
      <ErrorBox error={error} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="ปี">
          <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>{meta.years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </Field>
        <Field label="เดือน">
          <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        </Field>
        <div className="ml-auto flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={pick} />
          <button className="btn" disabled={busy || !month} onClick={() => fileRef.current.click()} title="ยาสีแดงในคอลัมน์ PTTC = ตัด, สีเขียว = นับ">ตั้งตามบัญชียา (.xls)</button>
        </div>
      </div>

      {up && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
          <div className="text-slate-700">
            อ่านบัญชียาแล้ว: <b className="text-red-600">ตัด {up.red.toLocaleString()}</b> · <b className="text-emerald-700">นับ {up.green.toLocaleString()}</b> รายการ
            <span className="text-slate-500"> — ใช้กับ <b>{scopeLabel}</b></span>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} /> รวมกับที่ตัดไว้เดิม (ไม่แทนที่)</label>
          <div className="ml-auto flex gap-2">
            <button className="btn" disabled={busy} onClick={() => setUp(null)}>ยกเลิก</button>
            <button className="btn btn-primary" disabled={busy} onClick={applyList}>{busy ? 'กำลังตั้งค่า…' : 'ตั้งค่าตามบัญชียา'}</button>
          </div>
        </div>
      )}

      {msg && <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{msg}</div>}

      <div className="mt-4">
        {(!cut || (cand.loading && !cand.data)) && <Loading />}
        <ErrorBox error={cand.error} />
        {cut && cand.data && (cand.data.items.length === 0
          ? <Empty>ไม่มีข้อมูลยาของ {scopeLabel}</Empty>
          : <DrugPicker drugs={cand.data.items} value={cut} onChange={setCut} />)}
      </div>

      {changes > 0 && (
        <div className="sticky bottom-3 mt-4 flex items-center justify-between gap-3 rounded-xl bg-navy-900 px-4 py-3 text-white shadow-lg">
          <div className="text-sm">แก้ไข <b>{changes}</b> รายการ · ยังไม่ได้บันทึก ({scopeLabel})</div>
          <div className="flex gap-2">
            <button className="rounded-lg px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10" disabled={busy} onClick={() => setCut(new Set(base))}>ยกเลิก</button>
            <button className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-navy-900 hover:bg-slate-100" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          </div>
        </div>
      )}
    </Panel>
  );
}

export default function DataFilter() {
  const { meta, refresh } = useMeta();
  return (
    <>
      <PageHead title="Data Filter" subtitle="กำหนดวิธีคัดกรองข้อมูลดิบและยาที่ไม่นำมาคำนวณ KPI — แทนการกรองใน Excel" />
      {meta.years.length ? <DrugPanel /> : <Panel><Empty>ยังไม่มีข้อมูล — นำเข้าไฟล์ Excel ก่อน</Empty></Panel>}
      <RulesPanel onSaved={refresh} />
    </>
  );
}