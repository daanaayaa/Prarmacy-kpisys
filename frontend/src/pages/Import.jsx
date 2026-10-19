import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useMeta } from '../App.jsx';
import { Badge, ErrorBox } from '../components/ui.jsx';
import PageHead from '../components/PageHead.jsx';
import { MONTHS, mmss } from '../lib/format.js';
import { REASONS } from '../components/DataQuality.jsx';
import DrugPicker from '../components/DrugPicker.jsx';

const TS = ['t_order', 't_prepare', 't_verify', 't_dispense', 't_nurse', 't_ipd'];
const n = (v) => (v ?? 0).toLocaleString();

/** ตัวบอกขั้นตอน: เลือกไฟล์ → ตรวจผล → เลือกยา & บันทึก */
function Steps({ step }) {
  const items = ['เลือกไฟล์', 'ตรวจผลคัดกรอง', 'เลือกยา & บันทึก'];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {items.map((t, i) => {
        const state = i < step ? 'done' : i === step ? 'now' : 'todo';
        return (
          <li key={t} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${state === 'done' ? 'bg-emerald-500 text-white' : state === 'now' ? 'bg-navy-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{state === 'done' ? '✓' : i + 1}</span>
            <span className={state === 'todo' ? 'text-slate-400' : 'font-medium text-slate-800'}>{t}</span>
            {i < items.length - 1 && <span className="mx-1 text-slate-300">—</span>}
          </li>
        );
      })}
    </ol>
  );
}

function monthLabel(from, to) {
  if (!from) return '';
  const a = from.slice(0, 7); const b = (to || from).slice(0, 7);
  const fmt = (k) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
  return a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`;
}

/** หน้าต่างยืนยันแบบ modal (แทน window.confirm ของเบราว์เซอร์) */
function ConfirmDialog({ title, children, confirmLabel, busyLabel, busy, error, onConfirm, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[16vh]">
      <style>{`
        @keyframes dlg-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dlg-pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
        .dlg-fade { animation: dlg-fade .15s ease-out }
        .dlg-pop { animation: dlg-pop .18s ease-out }
        @media (prefers-reduced-motion: reduce) { .dlg-fade, .dlg-pop { animation: none } }
      `}</style>
      <div className="dlg-fade fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]" onMouseDown={() => { if (!busy) onClose(); }} aria-hidden="true" />
      <div role="alertdialog" aria-modal="true" aria-label={title}
        className="dlg-pop relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 5.5h13M8 5.5V4a1 1 0 011-1h2a1 1 0 011 1v1.5M5.5 5.5l.7 10a1.5 1.5 0 001.5 1.4h4.6a1.5 1.5 0 001.5-1.4l.7-10M8.5 9v4.5M11.5 9v4.5" />
            </svg>
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <div className="mt-1.5 text-sm leading-relaxed text-slate-600">{children}</div>
          </div>
        </div>

        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn px-5 py-2.5" autoFocus disabled={busy} onClick={onClose}>ยกเลิก</button>
          <button type="button" className="btn btn-danger px-5 py-2.5" disabled={busy} onClick={onConfirm}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ImportPage() {
  const { refresh } = useMeta();
  const fileRef = useRef();
  const [drag, setDrag] = useState(false);
  const [up, setUp] = useState(null);
  const [sheet, setSheet] = useState('');
  const [mapping, setMapping] = useState(null);
  const [pv, setPv] = useState(null);
  const [ex, setEx] = useState(new Set());
  const [locked, setLocked] = useState(new Set());
  const [mode, setMode] = useState('skip');
  const [confirm, setConfirm] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // ลบ batch: ใช้ modal แทน window.confirm
  const [delTarget, setDelTarget] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadHistory = () => api('/import/history').then(setHistory).catch(() => {});
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const preview = async (tok, sh, map) => {
    setBusy(true); setError(null);
    try {
      const r = await api('/import/preview', { method: 'POST', body: { token: tok, sheet: sh, mapping: map } });
      setPv(r); setMapping(r.mapping);
      if (r.missingRequired.length) setShowMap(true);
      setEx(new Set((r.existingExclusions || []).filter((e) => e.month_key !== '*').map((e) => e.item_code)));
      setLocked(new Set((r.existingExclusions || []).filter((e) => e.month_key === '*').map((e) => e.item_code)));
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setError(null); setResult(null); setPv(null); setShowMap(false);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api('/import/upload', { form: fd });
      setUp(r); setSheet(r.defaultSheet); setMode('skip'); setConfirm(false);
      await preview(r.token, r.defaultSheet, null);
    } catch (e) { setError(e); setBusy(false); }
  };

  const commit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api('/import/commit', { method: 'POST', body: {
        token: up.token, sheet, mapping, mode, confirmOverwrite: confirm,
        excludeCodes: [...ex], listedCodes: (pv?.drugs || []).map((d) => d.item_code),
      } });
      setResult(r); setUp(null); setPv(null); if (fileRef.current) fileRef.current.value = '';
      await loadHistory(); refresh();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const askRollback = (h) => { setDelErr(null); setDelTarget(h); };
  const closeRollback = () => { if (!delBusy) { setDelTarget(null); setDelErr(null); } };
  const confirmRollback = async () => {
    if (!delTarget) return;
    setDelBusy(true); setDelErr(null);
    try {
      await api(`/import/${delTarget.id}`, { method: 'DELETE' });
      const id = delTarget.id;
      setDelTarget(null);
      setNotice(`ลบข้อมูล batch #${id} เรียบร้อยแล้ว`);
      await loadHistory(); refresh();
    } catch (e) {
      setDelErr(e?.message || 'ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally { setDelBusy(false); }
  };

  const s = pv?.stats;
  const drugCut = (pv?.drugs || []).filter((d) => ex.has(d.item_code) || locked.has(d.item_code)).reduce((a, d) => a + d.n, 0);
  const blocked = !pv || pv.missingRequired.length > 0 || (mode === 'overwrite' && s?.dupInDb > 0 && !confirm) || (mode === 'skip' && s?.willImport === 0);
  const step = result ? 3 : s ? 2 : up ? 1 : 0;
  const mappedCount = mapping ? Object.keys(up?.fields || {}).filter((f) => mapping[f] != null && mapping[f] !== '').length : 0;
  const usablePct = s && s.valid ? (s.usable / s.valid) * 100 : 0;
  const reasonChips = s ? REASONS.filter((r) => r.key !== 'DRUG' && s.classCounts[r.key] > 0) : [];

  return (
    <>
      <PageHead title="Import Excel" subtitle="อัปโหลดไฟล์ข้อมูลดิบจากระบบได้เลย — ระบบคัดกรองให้อัตโนมัติ แล้วให้เลือกยาที่ไม่นำมาคิด KPI ก่อนบันทึก" />
      <Steps step={step} />
      <ErrorBox error={error} />

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800" role="status">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5" /></svg>
          {notice}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-emerald-900">บันทึกเรียบร้อย ✓</div>
              <div className="mt-1 text-sm text-emerald-900">
                ใช้คำนวณ KPI <b>{n(result.usable)}</b> รายการ · ตัดตามกฎคัดกรอง <b>{n(result.excluded)}</b> · ตัดยา <b>{result.drugsExcluded ?? 0}</b> รายการ
              </div>
              <div className="mt-0.5 text-xs text-emerald-800/80">
                เพิ่มใหม่ {n(result.imported)} · อัปเดต {n(result.updated)} · ข้ามซ้ำ {n(result.skipped)} · Error {result.errors} · ผิดปกติ {result.anomalies} (batch #{result.importId})
              </div>
            </div>
            <Link to="/dashboard" className="btn btn-primary">ไปดู Dashboard</Link>
          </div>
        </div>
      )}

      {/* ── 1. เลือกไฟล์ ── */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) { if (fileRef.current) fileRef.current.files = e.dataTransfer.files; upload(f); } }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${drag ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50'}`}>
        <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => upload(e.target.files[0])} />
        <div className="text-base font-medium text-slate-800">{busy && !pv ? 'กำลังอ่านไฟล์…' : up ? `ไฟล์: ${up.fileName}` : 'ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์'}</div>
        <div className="text-xs text-slate-500">{up ? 'คลิกเพื่อเลือกไฟล์อื่น' : 'รองรับ .xls / .xlsx — ไฟล์ข้อมูลดิบจากระบบ ไม่ต้องกรองใน Excel ก่อน'}</div>
      </label>

      {up && up.sheets.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">ชีตที่ใช้:</span>
          {up.sheets.map((sh) => (
            <button key={sh.name} onClick={() => { setSheet(sh.name); preview(up.token, sh.name, null); }}
              className={`rounded-full border px-3 py-1 ${sheet === sh.name ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-slate-300 bg-white text-slate-600'}`}>
              {sh.name} <span className="text-xs text-slate-400">({n(sh.rows)} แถว)</span>
            </button>
          ))}
        </div>
      )}

      {s && (
        <>
          {/* ── 2. สรุปผลคัดกรอง ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">ผลคัดกรองข้อมูล{s.dateFrom ? ` · ${monthLabel(s.dateFrom, s.dateTo)}` : ''}</h2>
              <span className="text-xs text-slate-400">ช่วงข้อมูล {s.dateFrom} ถึง {s.dateTo}</span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div><div className="text-xs text-slate-500">ข้อมูลทั้งหมดในไฟล์</div><div className="text-3xl font-semibold tabular-nums text-slate-900">{n(s.valid)}</div></div>
              <div><div className="text-xs text-emerald-700">ใช้ได้ (นำไปคำนวณ KPI)</div><div className="text-3xl font-semibold tabular-nums text-emerald-700">{n(s.usable)}</div></div>
              <div><div className="text-xs text-slate-500">ตัดออกตามกฎ</div><div className="text-3xl font-semibold tabular-nums text-slate-600">{n(s.excluded)}</div></div>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${usablePct}%` }} /></div>

            {reasonChips.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {reasonChips.map((r) => (
                  <span key={r.key} title={r.label} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${r.tone}`}>{r.short}<b className="tabular-nums">{n(s.classCounts[r.key])}</b></span>
                ))}
              </div>
            )}

            {s.missingAdminByWard?.length > 0 && (
              <details className="mt-4 rounded-lg bg-rose-50/50 px-4 py-2.5 text-sm">
                <summary className="cursor-pointer text-slate-700">ข้อมูลพยาบาลสูญหาย <b className="text-rose-700">{n(s.classCounts.NO_ADMIN)}</b> รายการ — ดูแยกตาม Ward</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.missingAdminByWard.map((w) => (
                    <span key={w.ward} className="inline-flex items-center gap-2 rounded-lg border border-rose-100 bg-white px-2.5 py-1 text-xs text-slate-700"><span className="font-medium">{w.ward}</span><b className="tabular-nums text-rose-700">{n(w.n)}</b></span>
                  ))}
                </div>
              </details>
            )}

            {/* แจ้งเตือนเฉพาะเรื่องที่ต้องตัดสินใจ */}
            {pv.missingRequired.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">ระบบหาคอลัมน์ที่จำเป็นไม่เจอ: <b>{pv.missingRequired.join(', ')}</b> — เปิด "ตรวจการจับคู่คอลัมน์" ด้านล่างเพื่อเลือกเอง</div>
            )}
            {s.errors > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">มี {n(s.errors)} แถวอ่านไม่ได้ (จะถูกข้าม) — ดูรายละเอียดด้านล่าง</div>
            )}
            {s.dupInDb > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div>พบ <b>{n(s.dupInDb)}</b> รายการที่มีอยู่ในระบบแล้ว</div>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2"><input type="radio" checked={mode === 'skip'} onChange={() => { setMode('skip'); setConfirm(false); }} /> ข้ามรายการที่ซ้ำ (แนะนำ)</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} /> เขียนทับข้อมูลเดิม</label>
                  {mode === 'overwrite' && <label className="flex items-center gap-2 text-amber-800"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> ยืนยันเขียนทับ {n(s.dupInDb)} รายการ</label>}
                </div>
              </div>
            )}

            {/* รายละเอียดเทคนิค — พับไว้ */}
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setShowMap((v) => !v)} className="text-blue-700 hover:underline">
                  {showMap ? 'ซ่อน' : 'ตรวจ'}การจับคู่คอลัมน์
                </button>
                <span className="text-xs text-slate-500">{pv.missingRequired.length === 0 ? `ระบบจับคู่ให้อัตโนมัติแล้ว ✓ (${mappedCount} ช่อง)` : 'ต้องเลือกคอลัมน์เพิ่ม'}</span>
              </div>
              {showMap && mapping && (
                <div className="grid gap-x-6 gap-y-2 rounded-lg bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(up.fields).map(([f, label]) => (
                    <label key={f} className="flex items-center justify-between gap-2 text-sm">
                      <span className={up.required.includes(f) && (mapping[f] == null || mapping[f] === '') ? 'text-red-600' : 'text-slate-700'}>{label}{up.required.includes(f) ? ' *' : ''}</span>
                      <select className="input w-52" value={mapping[f] ?? ''} onChange={(e) => {
                        const m = { ...mapping }; if (e.target.value === '') delete m[f]; else m[f] = Number(e.target.value);
                        setMapping(m); preview(up.token, sheet, m);
                      }}>
                        <option value="">— ไม่ใช้ —</option>
                        {pv.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}

              <details>
                <summary className="cursor-pointer text-slate-600 hover:text-slate-800">รายละเอียดเพิ่มเติม (ช่องเวลาที่ว่าง · ข้อมูลผิดปกติ · ตัวอย่างข้อมูล)</summary>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    {TS.map((f) => <Badge key={f} tone={s.missingByField[f] ? 'amber' : 'green'}>{pv.headers[mapping[f]] ?? f}: ว่าง {n(s.missingByField[f])}</Badge>)}
                  </div>
                  <div className="text-xs text-slate-500">
                    เวลาเภสัชตรวจยาว่าง ใช้เวลาจ่ายยาแทน {n(s.verifyFilled)} แถว · ข้อมูลผิดปกติ {n(s.anomalies)} · รายการซ้ำในไฟล์ {n(s.repeatedInFile)}{s.footer > 0 ? ` · ข้ามแถวท้ายรายงาน ${s.footer}` : ''}
                  </div>
                  {pv.errors.length > 0 && (
                    <div><div className="text-xs font-medium text-red-700">Error {n(s.errors)} แถว (แสดง {pv.errors.length} แรก)</div>
                      <ul className="mt-1 max-h-32 overflow-auto text-xs text-slate-600">{pv.errors.map((e) => <li key={e.row}>แถว {e.row}: {e.message}</li>)}</ul></div>
                  )}
                  {pv.anomalySample.length > 0 && (
                    <div><div className="text-xs font-medium text-amber-700">ข้อมูลผิดปกติ (ตัวอย่าง {pv.anomalySample.length} แถว)</div>
                      <ul className="mt-1 text-xs text-slate-600">{pv.anomalySample.map((a) => <li key={a.dedupe_key}>{a.t_order} · {a.item_name?.slice(0, 40)} · {a.anomaly_reasons}</li>)}</ul></div>
                  )}
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full min-w-[900px]">
                      <thead className="bg-slate-50"><tr>{['VN/AN', 'ชื่อ (mask)', 'ยา', 'Ward', 'สั่งยา', 'จ่ายยา', 'พยาบาลให้ยา', 'Order→Nurse'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {pv.sample.map((r) => (
                          <tr key={r.dedupe_key}>
                            <td className="td">{r.vn_an}</td><td className="td">{r.patient_name}</td>
                            <td className="td max-w-[240px] truncate" title={r.item_name}>{r.item_name}</td><td className="td">{r.ward}</td>
                            <td className="td tabular-nums">{r.t_order?.slice(5, 16)}</td><td className="td tabular-nums">{r.t_dispense?.slice(5, 16) || '-'}</td>
                            <td className="td tabular-nums">{r.t_nurse?.slice(5, 16) || '-'}</td><td className="td tabular-nums">{mmss(r.d_order_nurse)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            </div>
          </section>

          {/* ── 3. เลือกยา & บันทึก ── */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">เลือกยาที่ไม่นำมาคิด KPI</h2>
            <p className="mb-4 mt-0.5 text-xs text-slate-500">กด “ตัด” ที่ยาตามมติคณะกรรมการ — ข้อมูลจะเข้า Dashboard หลังตัดยาแล้วเท่านั้น และแก้ภายหลังได้ที่เมนู Data Filter</p>
            <DrugPicker drugs={pv.drugs || []} value={ex} onChange={setEx} locked={locked} maxHeight={420} />
            <div className="sticky bottom-3 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-900 px-5 py-3 text-white shadow-lg">
              <div className="text-sm">
                ใช้คำนวณ KPI จริง <b className="text-xl tabular-nums">{n(s.usable - drugCut)}</b> รายการ
                <span className="ml-2 text-xs text-slate-300">(ใช้ได้ {n(s.usable)} − ตัดยา {n(drugCut)})</span>
              </div>
              <button className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-navy-900 hover:bg-slate-100 disabled:opacity-50" disabled={busy || blocked} onClick={commit}>
                {busy ? 'กำลังบันทึก…' : `บันทึก ${n(mode === 'skip' ? s.willImport : s.willImport + s.dupInDb)} รายการ`}
              </button>
            </div>
          </section>
        </>
      )}

      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">ประวัติการ Import ({history.length})</summary>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50"><tr>{['เวลา', 'ไฟล์ / ชีต', 'โหมด', 'ทั้งหมด', 'ใช้ได้', 'เพิ่ม', 'อัปเดต', 'ข้าม', 'Error', 'ผิดปกติ', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="td whitespace-nowrap tabular-nums">{new Date(h.created_at).toLocaleString('th-TH')}</td>
                  <td className="td">{h.file_name} <span className="text-xs text-slate-400">/ {h.sheet_name}</span></td>
                  <td className="td">{h.mode === 'overwrite' ? <Badge tone="amber">overwrite</Badge> : <Badge>skip</Badge>}</td>
                  <td className="td tabular-nums">{h.total_rows}</td><td className="td tabular-nums text-emerald-700">{h.usable ?? '-'}</td><td className="td tabular-nums">{h.imported}</td>
                  <td className="td tabular-nums">{h.updated}</td><td className="td tabular-nums">{h.skipped}</td>
                  <td className="td tabular-nums">{h.errors}</td><td className="td tabular-nums">{h.anomalies}</td>
                  <td className="td text-right"><button className="btn btn-danger" onClick={() => askRollback(h)}>ลบ batch ({h.rows_now})</button></td>
                </tr>
              ))}
              {history.length === 0 && <tr><td className="td text-center text-slate-400" colSpan={11}>ยังไม่มีประวัติการ import</td></tr>}
            </tbody>
          </table>
        </div>
      </details>

      {delTarget && (
        <ConfirmDialog
          title={`ลบข้อมูล batch #${delTarget.id} ?`}
          confirmLabel="ลบข้อมูล"
          busyLabel="กำลังลบ…"
          busy={delBusy}
          error={delErr}
          onConfirm={confirmRollback}
          onClose={closeRollback}
        >
          <p>
            ข้อมูลที่นำเข้าจากไฟล์ <b className="text-slate-800">{delTarget.file_name}</b> จำนวน{' '}
            <b className="text-slate-800">{n(delTarget.rows_now)}</b> รายการ จะถูกลบออกจากระบบ
          </p>
          <p className="mt-2 text-red-600">การลบไม่สามารถย้อนกลับได้</p>
        </ConfirmDialog>
      )}
    </>
  );
}