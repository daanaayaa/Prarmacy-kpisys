import { useEffect, useRef, useState } from 'react';
import { useMeta } from '../App.jsx';
import { api, qs } from '../lib/api.js';
import { Empty, ErrorBox, Field, Loading, Panel, useAsync } from '../components/ui.jsx';
import DrugPicker from '../components/DrugPicker.jsx';
import PageHead from '../components/PageHead.jsx';
import { MONTHS } from '../lib/format.js';

const RULES = [
  ['1', 'ไม่มีเวลาเภสัชจ่ายยา (dispense)', 'ตัดออกจากการคำนวณ'],
  ['2', 'ไม่มีเวลาพยาบาลให้ยา (admin)', 'ตัดออก และนับเป็นข้อมูลสูญหายแยกตาม Ward'],
  ['3', 'แพทย์สั่ง → พยาบาลให้ยา นานตั้งแต่ N ชม.ขึ้นไป', 'ตัดออก (N ตั้งค่าได้ — 7:59 ชม. ยังใช้)'],
  ['4', 'Ward / Location ภายนอก (Airport / Rawai / Khaolak Clinic)', 'ตัดออกทุกเดือน'],
  ['5', 'เวลาเภสัชตรวจยาว่าง', 'ใช้เวลาเภสัชจ่ายยาแทน (ขั้นตอนเดียวกัน)'],
];

/* ───────── 1. เกณฑ์คัดกรองข้อมูลดิบ ───────── */
function RulesPanel({ onSaved }) {
  const [s, setS] = useState(null);
  const [hours, setHours] = useState('8');
  const [locs, setLocs] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/filter/settings').then((r) => {
      setS(r.settings); setHours(String(r.settings.max_order_nurse_hours)); setLocs((r.settings.excluded_locations || []).join('\n'));
    }).catch(setError);
  }, []);

  const dirty = s && (Number(hours) !== Number(s.max_order_nurse_hours) || locs.split(/[\n,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean).join('|') !== (s.excluded_locations || []).join('|'));

  const save = async () => {
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await api('/filter/settings', { method: 'PUT', body: { max_order_nurse_hours: Number(hours), excluded_locations: locs } });
      setS(r.settings); setLocs(r.settings.excluded_locations.join('\n'));
      setMsg(`บันทึกแล้ว — ตรวจข้อมูลเดิมใหม่ ${r.checked.toLocaleString()} แถว เปลี่ยนสถานะ ${r.changed.toLocaleString()} แถว`);
      onSaved?.();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <Panel title="เกณฑ์คัดกรองข้อมูลดิบ" subtitle="ระบบใช้เกณฑ์นี้อัตโนมัติทุกครั้งที่กด Import — ไม่ต้องกรองใน Excel ก่อน">
      <ErrorBox error={error} />
      <ol className="mb-4 grid gap-2 md:grid-cols-2">
        {RULES.map(([no, t, d]) => (
          <li key={no} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[11px] font-semibold text-white">{no}</span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800">{t}</div>
              <div className="text-xs text-slate-500">{d}</div>
            </div>
          </li>
        ))}
      </ol>
      {!s ? <Loading /> : (
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <Field label="ตัดออกเมื่อ สั่งยา → พยาบาลให้ยา ≥ (ชั่วโมง)">
            <input className="input w-32" type="number" min="1" max="72" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
          <Field label="Ward / Location ที่ตัดออกทุกเดือน (คำที่พบในชื่อ ward — บรรทัดละ 1 คำ ไม่สนตัวพิมพ์เล็กใหญ่)">
            <textarea className="input min-h-[84px] font-mono text-xs" value={locs} onChange={(e) => setLocs(e.target.value)} placeholder={'airport\nrawai\nkhaolak'} />
          </Field>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {msg && <span className="text-sm text-emerald-700">{msg}</span>}
        <button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? 'กำลังตรวจข้อมูลใหม่…' : 'บันทึกเกณฑ์ & ตรวจข้อมูลใหม่'}</button>
      </div>
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