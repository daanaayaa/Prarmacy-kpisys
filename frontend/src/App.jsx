import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './lib/api.js';
import { useAuth } from './auth/AuthContext.jsx';
import UserMenu from './auth/UserMenu.jsx';
import { ErrorBox, Loading } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Report from './pages/Report.jsx';
import ImportPage from './pages/Import.jsx';
import Subgroups from './pages/Subgroups.jsx';
import KpiAdmin from './pages/KpiAdmin.jsx';
import DataFilter from './pages/DataFilter.jsx';

const MetaCtx = createContext(null);
export const useMeta = () => useContext(MetaCtx);

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { to: '/report', label: 'Monthly Report', icon: 'M4 4h16v4H4V4zm0 6h16v4H4v-4zm0 6h16v4H4v-4z' },
  { to: '/import', label: 'Import Excel', icon: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3' },
  { to: '/filters', label: 'Data Filter', icon: 'M3 5h18l-7 8v6l-4-2v-4L3 5z' },
  { to: '/subgroups', label: 'Subgroups', icon: 'M4 6h16M4 12h16M4 18h10' },
  { to: '/kpis', label: 'KPI Settings', icon: 'M12 8a4 4 0 100 8 4 4 0 000-8zm8.5 4l1.5-1-2-3.5-1.8.5a7 7 0 00-1.5-.9L16 5h-4l-.7 2.1a7 7 0 00-1.5.9L8 7.5 6 11l1.5 1a7 7 0 000 1.9L6 15l2 3.5 1.8-.5c.5.4 1 .7 1.5.9L12 21h4l.7-2.1c.5-.2 1-.5 1.5-.9l1.8.5 2-3.5-1.5-1c.1-.6.1-1.300 0-1.900z' },
];

export default function App() {
  const { logout } = useAuth();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const refresh = useCallback(() => api('/meta').then(setMeta).catch(setError), []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <MetaCtx.Provider value={{ meta, refresh }}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col self-start bg-navy-900 text-blue-100 md:flex">
          <div className="shrink-0 border-b border-white/10 px-5 py-4">
            <div className="text-[11px] uppercase tracking-widest text-blue-300">Hospital Pharmacy</div>
            <div className="text-base font-semibold text-white">Process Time KPI</div>
          </div>
          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-3">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-white/15 font-medium text-white' : 'hover:bg-white/10'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="shrink-0 border-t border-white/10 p-3">
            <UserMenu variant="dark" stacked />
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <nav className="flex items-center gap-1 overflow-x-auto bg-navy-900 p-2 md:hidden">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} className={({ isActive }) => `whitespace-nowrap rounded px-3 py-1.5 text-xs text-white ${isActive ? 'bg-white/20' : ''}`}>{n.label}</NavLink>)}
            <button type="button" onClick={logout} className="ml-auto whitespace-nowrap rounded px-3 py-1.5 text-xs text-blue-200 hover:bg-white/10">ออกจากระบบ</button>
          </nav>
          <div className="mx-auto max-w-[1400px] space-y-4 p-5">
            {error && <ErrorBox error={error} />}
            {!meta && !error ? <Loading /> : meta && (
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/report" element={<Report />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/filters" element={<DataFilter />} />
                <Route path="/subgroups" element={<Subgroups />} />
                <Route path="/kpis" element={<KpiAdmin />} />
              </Routes>
            )}
          </div>
        </main>
      </div>
    </MetaCtx.Provider>
  );
}