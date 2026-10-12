import { useEffect, useState } from 'react';

export function Panel({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      {label}
      {children}
    </label>
  );
}

export function Loading() {
  return <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>;
}
export function ErrorBox({ error }) {
  return error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{String(error.message || error)}</div> : null;
}
export function Empty({ children = 'ยังไม่มีข้อมูลในช่วงที่เลือก' }) {
  return <div className="py-8 text-center text-sm text-slate-400">{children}</div>;
}
export function Badge({ children, tone = 'slate' }) {
  const t = { slate: 'bg-slate-100 text-slate-600', green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700' }[tone];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}
export function Bar({ value, max = 100, color = '#2563eb' }) {
  const w = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full rounded bg-slate-100">
      <div className="h-1.5 rounded" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/** state ที่จำค่าไว้ใน sessionStorage เพื่อให้ filter ไม่หายเวลาเปลี่ยนหน้า */
export function useStored(key, initial) {
  const [v, setV] = useState(() => {
    try { return { ...initial, ...JSON.parse(sessionStorage.getItem(key) || '{}') }; } catch { return initial; }
  });
  useEffect(() => { sessionStorage.setItem(key, JSON.stringify(v)); }, [key, v]);
  return [v, setV];
}

export function useAsync(fn, deps) {
  const [state, set] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let alive = true;
    set((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => alive && set({ loading: false, data, error: null })).catch((error) => alive && set({ loading: false, data: null, error }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
