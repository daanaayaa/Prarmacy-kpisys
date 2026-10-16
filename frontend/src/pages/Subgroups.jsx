import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useMeta } from '../App.jsx';
import { Badge, Empty, ErrorBox, Field, Loading, Panel } from '../components/ui.jsx';
import PageHead from '../components/PageHead.jsx';

const parseTokens = (text) =>
  text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean).map((code) => ({ code }));

function Highlight({ text, term }) {
  if (!text) return null;
  const i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-yellow-100 px-0.5 text-inherit">{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  );
}

const Chevron = ({ dir }) => (
  <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {dir === 'up' ? <path d="M2.5 7.5L6 4l3.5 3.5" /> : <path d="M2.5 4.5L6 8l3.5-3.5" />}
  </svg>
);

/* ---------- Dialog (แทน prompt / confirm ของเบราว์เซอร์) ---------- */
function Dialog({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[14vh]">
      <style>{`
        @keyframes dlg-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dlg-pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
        .dlg-fade { animation: dlg-fade .15s ease-out }
        .dlg-pop { animation: dlg-pop .18s ease-out }
        @media (prefers-reduced-motion: reduce) { .dlg-fade, .dlg-pop { animation: none } }
      `}</style>
      <div className="dlg-fade fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]" onMouseDown={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={title}
        className="dlg-pop relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------- เลือกสี: จุดสีเดียว กดแล้วเลือก ---------- */
function ColorDot({ value, onChange }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 rounded-lg border border-slate-300 bg-white py-1.5 pl-2 pr-4 text-sm text-slate-700 transition hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-200">
      <span className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-black/10" style={{ background: value }}>
        <input type="color" aria-label="สีประจำกลุ่ม" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
      กดเพื่อเปลี่ยนสี
    </label>
  );
}

/* ---------- Dialog: เพิ่ม Subgroup ---------- */
function AddGroupDialog({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr('กรุณาพิมพ์ชื่อกลุ่ม'); return; }
    setBusy(true); setErr(null);
    try {
      await onCreate({ name: name.trim(), color });
      onClose();
    } catch (ex) {
      setErr(ex?.message || 'เพิ่มกลุ่มไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <Dialog title="เพิ่มกลุ่มยาใหม่" onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="new-name" className="block text-sm font-medium text-slate-800">ชื่อกลุ่ม</label>
          <input id="new-name" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="เช่น Antibiotic, Chemotherapy" className="input mt-1.5 w-full py-2.5 text-base" />
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-800">สี</div>
          <ColorDot value={color} onChange={setColor} />
        </div>

        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn px-5 py-2.5" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary px-5 py-2.5" disabled={busy}>{busy ? 'กำลังเพิ่ม…' : 'เพิ่มกลุ่ม'}</button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- Dialog: ยืนยันลบ ---------- */
function DeleteGroupDialog({ group, onClose, onConfirm }) {
  return (
    <Dialog title={`ลบกลุ่ม “${group.name}” ?`}
      subtitle={`กลุ่มนี้มียา ${Number(group.item_count || 0).toLocaleString()} รายการ การลบไม่สามารถย้อนกลับได้`}
      onClose={onClose}>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn px-5 py-2.5" autoFocus onClick={onClose}>ยกเลิก</button>
        <button type="button" className="btn btn-danger px-5 py-2.5" onClick={onConfirm}>ลบกลุ่ม</button>
      </div>
    </Dialog>
  );
}

export default function Subgroups() {
  const { refresh } = useMeta();
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null);
  const [items, setItems] = useState({ items: [], total: 0 });
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef();

  // ---- เพิ่มยาเข้ากลุ่ม (search + chips) ----
  const inputRef = useRef();
  const [chips, setChips] = useState([]);   // [{ code, name?, generic? }]
  const [term, setTerm] = useState('');
  const [sugg, setSugg] = useState([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const load = async (keep) => {
    const [l, s] = await Promise.all([api('/subgroups'), api('/drugs/summary')]);
    setList(l); setSummary(s);
    const cur = l.find((x) => x.id === (keep ?? sel?.id)) || l[0];
    setSel(cur || null); setForm(cur ? { ...cur } : null);
  };
  useEffect(() => { load().catch(setError); }, []);
  const loadItems = () => (sel ? api(`/subgroups/${sel.id}/items?q=${encodeURIComponent(q)}&limit=100`).then((d) => { setItems(d); setPicked(new Set()); }).catch(setError) : null);
  useEffect(() => { const t = setTimeout(loadItems, 200); return () => clearTimeout(t); }, [sel?.id, q, list]);

  // เปลี่ยน subgroup แล้วล้างรายการที่ค้างอยู่
  useEffect(() => { setChips([]); setTerm(''); setSugg([]); setOpen(false); }, [sel?.id]);

  // ค้นหายาแบบ autocomplete
  useEffect(() => {
    const t0 = term.trim();
    if (!sel || t0.length < 2) { setSugg([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      api(`/drugs/search?q=${encodeURIComponent(t0)}&limit=8`)
        .then((d) => { if (!cancelled) { setSugg(Array.isArray(d) ? d : d.items || []); setActive(0); } })
        .catch(() => { if (!cancelled) setSugg([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [term, sel?.id]);

  const visible = sugg.filter((d) => !chips.some((c) => c.code === d.item_code));
  const showDrop = open && visible.length > 0 && term.trim().length >= 2;
  const act = Math.min(active, Math.max(visible.length - 1, 0));

  const addChips = (arr) => setChips((prev) => {
    const have = new Set(prev.map((c) => c.code));
    const next = [...prev];
    for (const c of arr) if (!have.has(c.code)) { have.add(c.code); next.push(c); }
    return next;
  });
  const removeChip = (code) => setChips((prev) => prev.filter((c) => c.code !== code));
  const pickSugg = (d) => {
    if (!d) return;
    addChips([{ code: d.item_code, name: d.item_name, generic: d.generic_name }]);
    setTerm(''); setSugg([]); setOpen(false);
    inputRef.current?.focus();
  };

  const onInputChange = (e) => {
    const v = e.target.value;
    if (/[,;]$/.test(v)) { addChips(parseTokens(v)); setTerm(''); return; }
    setTerm(v); setOpen(true);
  };
  const onInputKeyDown = (e) => {
    if (showDrop) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((act + 1) % visible.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((act - 1 + visible.length) % visible.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickSugg(visible[act]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    }
    if (e.key === 'Enter' && term.trim()) { e.preventDefault(); addChips(parseTokens(term)); setTerm(''); }
    else if (e.key === 'Backspace' && !term && chips.length) { setChips((prev) => prev.slice(0, -1)); }
  };
  const onInputPaste = (e) => {
    const text = e.clipboardData.getData('text');
    if (/[\n\r,;]/.test(text.trim())) { e.preventDefault(); addChips(parseTokens(text)); setTerm(''); }
  };

  const wrap = (fn) => async () => { setError(null); setMsg(null); try { await fn(); refresh(); } catch (e) { setError(e); } };

  const uploadDrugs = wrap(async () => {
    const file = fileRef.current.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    const r = await api('/drugs/import', { form: fd });
    setMsg(`นำเข้าบัญชียา ${r.drugs.toLocaleString()} รายการ (ชีต ${r.sheet}) · ` + Object.entries(r.groups).map(([k, v]) => `${k}: ${v}`).join(' · '));
    fileRef.current.value = ''; await load();
  });

  const saveGroup = wrap(async () => {
    await api(`/subgroups/${form.id}`, { method: 'PUT', body: { ...form, source_column: (form.source_column || '').trim() } });
    await load(form.id);
    setMsg('บันทึกแล้ว');
  });

  // สร้าง subgroup ใหม่จาก Dialog (โยน error กลับไปให้ Dialog แสดงเอง)
  const createGroup = async ({ name, color }) => {
    setError(null); setMsg(null);
    const r = await api('/subgroups', { method: 'POST', body: { name, color } });
    // เผื่อ backend รับแค่ชื่อตอนสร้าง → ตั้งสีต่อด้วย PUT
    const l = await api('/subgroups');
    const row = l.find((x) => x.id === r.id);
    if (row && row.color !== color) await api(`/subgroups/${r.id}`, { method: 'PUT', body: { ...row, color } });
    await load(r.id);
    refresh();
    setMsg(`เพิ่มกลุ่ม “${name}” แล้ว`);
  };

  const doDelete = wrap(async () => {
    await api(`/subgroups/${sel.id}`, { method: 'DELETE' });
    await load(null);
    setMsg('ลบกลุ่มแล้ว');
  });

  // เลื่อนลำดับ subgroup ขึ้น/ลง: สลับตำแหน่งแล้วส่งลำดับใหม่ไปครั้งเดียว
  const moveGroup = (idx, dir) => wrap(async () => {
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    const arr = [...list];
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    await api('/subgroups-order', { method: 'PUT', body: { ids: arr.map((g) => g.id) } });
    await load(sel?.id);
  });

  const addCodes = wrap(async () => {
    const r = await api(`/subgroups/${sel.id}/items`, { method: 'POST', body: { codes: chips.map((c) => c.code).join('\n') } });
    setChips([]); setTerm(''); setSugg([]); setOpen(false);
    setMsg(`เพิ่ม ${r.added} รายการ${r.unknownInDrugList ? ` (มี ${r.unknownInDrugList} code ที่ไม่อยู่ในบัญชียา)` : ''}`); await load(sel.id);
  });
  const removePicked = wrap(async () => { await api(`/subgroups/${sel.id}/items`, { method: 'DELETE', body: { codes: [...picked] } }); await load(sel.id); });

  if (!list) return <Loading />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const col = (form?.source_column || '').trim();

  return (
    <>
      <PageHead title="Subgroups & บัญชียา" subtitle="mapping ยาเข้ากลุ่มด้วย ItemCode (ไม่ใช้ชื่อยา) · เพิ่ม subgroup ใหม่ได้เอง">
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ เพิ่ม Subgroup</button>
      </PageHead>
      <ErrorBox error={error} />
      {msg && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</div>}

      <Panel title="นำเข้าบัญชียา" subtitle={`ในระบบ ${summary?.drugs?.toLocaleString() || 0} รายการ${summary?.unmapped_order_items ? ` · มี ${summary.unmapped_order_items} item code ใน order ที่ไม่อยู่ในบัญชียา` : ''}`}>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="text-sm" />
          <button className="btn" onClick={uploadDrugs}>นำเข้า / อัปเดตบัญชียา</button>
          <span className="text-xs text-slate-500">เลือกไฟล์ Excel บัญชียา แล้วกดนำเข้า ระบบจะจัดยาเข้ากลุ่ม HAD, Vital, Vaccine, Phlebitis… ให้อัตโนมัติ</span>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="รายการ Subgroup" subtitle="ลำดับในรายการนี้ = ลำดับที่แสดงในตัวกรอง · กด ↑ ↓ เพื่อจัดลำดับ">
          <ul className="-mx-2 space-y-0.5">
            {list.map((g, idx) => (
              <li key={g.id} className={`group flex items-center rounded-md ${sel?.id === g.id ? 'bg-blue-50' : 'hover:bg-slate-50'} ${g.active ? '' : 'opacity-50'}`}>
                <button
                  onClick={() => { setSel(g); setForm({ ...g }); setQ(''); }}
                  className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm ${sel?.id === g.id ? 'font-medium text-blue-800' : ''}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                  <span className="truncate">{g.name}</span>
                </button>
                <span className="pr-1.5 text-xs tabular-nums text-slate-500">{g.item_count}</span>
                {/* ปุ่มเลื่อนลำดับ: จอใหญ่แสดงตอน hover, จอเล็กแสดงตลอด */}
                <span className="flex pr-1 transition focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
                  <button type="button" disabled={idx === 0} onClick={moveGroup(idx, -1)} aria-label={`เลื่อน ${g.name} ขึ้น`}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-700 disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent">
                    <Chevron dir="up" />
                  </button>
                  <button type="button" disabled={idx === list.length - 1} onClick={moveGroup(idx, 1)} aria-label={`เลื่อน ${g.name} ลง`}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-700 disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent">
                    <Chevron dir="down" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {sel && form && (
          <div className="min-w-0 space-y-4">
            <Panel title={sel.name} subtitle={`code: ${sel.code}${sel.is_system ? ' · subgroup ระบบ' : ''}`}
              actions={<>{!sel.is_system && <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>ลบ</button>}<button className="btn btn-primary" onClick={saveGroup}>บันทึก</button></>}>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
                  <Field label="ชื่อกลุ่ม"><input className="input" value={form.name} onChange={set('name')} /></Field>
                  <Field label="สี"><ColorDot value={form.color || '#2563eb'} onChange={(c) => setForm({ ...form, color: c })} /></Field>
                  <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={!!form.active} onChange={set('active')} /> เปิดใช้งาน
                  </label>
                </div>

                {/* ตั้งค่าขั้นสูง: ซ่อนไว้ ผู้ใช้ทั่วไปไม่ต้องแตะ */}
                <details key={sel.id} className="group rounded-lg border border-slate-200 bg-slate-50/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm text-slate-600 hover:text-slate-800 [&::-webkit-details-marker]:hidden">
                    <span className="font-medium">ตั้งค่าขั้นสูง (สำหรับผู้ดูแลระบบ)</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {col ? `ดึงจากคอลัมน์ “${col}”` : 'ไม่ได้ตั้งค่า'}
                      <svg className="h-3.5 w-3.5 transition group-open:rotate-180" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4.5L6 8l3.5-3.5" /></svg>
                    </span>
                  </summary>
                  <div className="border-t border-slate-200 px-3 pb-3 pt-3">
                    <label htmlFor="source-column" className="block text-sm font-medium text-slate-800">ชื่อคอลัมน์ในไฟล์บัญชียา (Excel)</label>
                    <input id="source-column" className="input mt-1.5 w-full max-w-sm" placeholder="เช่น High Alert Drug"
                      value={form.source_column || ''} onChange={set('source_column')} />
                    <p className="mt-1.5 text-xs text-slate-500">ถ้ากรอก ระบบจะจัดยาเข้ากลุ่มนี้ให้อัตโนมัติทุกครั้งที่นำเข้าไฟล์ · ถ้าไม่ใช้ ปล่อยว่างไว้ แล้วเพิ่มยาเองด้านล่าง</p>
                  </div>
                </details>
              </div>
            </Panel>

            <Panel title={`ยาในกลุ่ม (${items.total.toLocaleString()})`}
              actions={<><input className="input w-56" placeholder="ค้นหา code / ชื่อยา" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className="btn btn-danger" disabled={!picked.size} onClick={removePicked}>เอาออก ({picked.size})</button></>}>
              <div className="max-h-[360px] overflow-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white"><tr><th className="th w-8" /><th className="th">ItemCode</th><th className="th">ชื่อยา</th><th className="th">Generic</th><th className="th">ที่มา</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.items.map((i) => (
                      <tr key={i.item_code}>
                        <td className="td"><input type="checkbox" checked={picked.has(i.item_code)} onChange={(e) => { const n = new Set(picked); e.target.checked ? n.add(i.item_code) : n.delete(i.item_code); setPicked(n); }} /></td>
                        <td className="td tabular-nums">{i.item_code}</td>
                        <td className="td max-w-[360px] truncate" title={i.item_name}>{i.item_name || <span className="text-slate-400">ไม่อยู่ในบัญชียา</span>}</td>
                        <td className="td text-slate-500">{i.generic_name}</td>
                        <td className="td whitespace-nowrap"><Badge tone={i.source === 'manual' ? 'blue' : 'slate'}>{i.source === 'manual' ? 'เพิ่มเอง' : 'จากบัญชียา'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {items.items.length === 0 && <Empty>ไม่มีรายการ</Empty>}
                {items.total > items.items.length && <p className="pt-2 text-center text-xs text-slate-400">แสดง {items.items.length} จาก {items.total.toLocaleString()} รายการ — ใช้ช่องค้นหาเพื่อกรอง</p>}
              </div>

              {/* ===== เพิ่มยาเข้ากลุ่ม ===== */}
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3">
                  <div className="text-sm font-semibold text-slate-800">เพิ่มยาเข้ากลุ่ม</div>
                  <div className="text-xs text-slate-500">ค้นหาด้วย ItemCode หรือชื่อยา แล้วเลือกจากรายการ </div>
                </div>

                <div className="relative">
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="9" cy="9" r="6" /><path d="M14 14l4 4" />
                  </svg>
                  <input
                    ref={inputRef}
                    value={term}
                    onChange={onInputChange}
                    onKeyDown={onInputKeyDown}
                    onPaste={onInputPaste}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
                    autoComplete="off"
                    placeholder="พิมพ์ ItemCode หรือชื่อยา เช่น 5114 หรือ diazepam"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  {showDrop && (
                    <ul className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5" role="listbox">
                      {visible.map((d, idx) => (
                        <li
                          key={d.item_code}
                          role="option"
                          aria-selected={idx === act}
                          onMouseDown={(e) => { e.preventDefault(); pickSugg(d); }}
                          onMouseEnter={() => setActive(idx)}
                          className={`flex cursor-pointer items-center justify-between gap-4 border-l-2 px-3 py-2 ${idx === act ? 'border-blue-500 bg-blue-50' : 'border-transparent'}`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-800"><Highlight text={d.item_name || '(ไม่มีชื่อ)'} term={term.trim()} /></div>
                            {d.generic_name && <div className="truncate text-xs text-slate-500"><Highlight text={d.generic_name} term={term.trim()} /></div>}
                          </div>
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-slate-600"><Highlight text={d.item_code} term={term.trim()} /></span>
                        </li>
                      ))}
                      <li className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">↑↓ เลือก · Enter / Tab เพิ่ม · Esc ปิด</li>
                    </ul>
                  )}
                </div>

                {chips.length > 0 && (
                  <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-auto">
                    {chips.map((c) => (
                      <span key={c.code} className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-200 bg-white py-1 pl-3 pr-1.5 text-xs shadow-sm">
                        {c.name && <span className="max-w-[240px] truncate font-medium text-slate-800" title={c.name}>{c.name}</span>}
                        <span className="font-mono tabular-nums text-slate-500">{c.code}</span>
                        <button type="button" onClick={() => removeChip(c.code)} aria-label={`เอา ${c.code} ออก`}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600">
                          <svg className="h-3 w-3" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">
                    {chips.length ? `เลือกไว้ ${chips.length} รายการ` : 'ยังไม่ได้เลือกรายการ'}
                    {chips.length > 0 && <button type="button" className="ml-3 text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline" onClick={() => setChips([])}>ล้างทั้งหมด</button>}
                  </span>
                  <button className="btn btn-primary" disabled={!chips.length} onClick={addCodes}>
                    {chips.length ? `เพิ่ม ${chips.length} รายการเข้ากลุ่ม` : 'เพิ่มเข้ากลุ่ม'}
                  </button>
                </div>
              </div>
            </Panel>
          </div>
        )}
      </div>

      {adding && <AddGroupDialog onClose={() => setAdding(false)} onCreate={createGroup} />}
      {confirmDel && sel && (
        <DeleteGroupDialog group={sel} onClose={() => setConfirmDel(false)} onConfirm={() => { setConfirmDel(false); doDelete(); }} />
      )}
    </>
  );
}