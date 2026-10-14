import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const TOKEN_KEY = 'kpi_token';
const API_BASE = import.meta.env.VITE_API_URL || '';

// ชื่อ role ที่แสดงบนหน้าจอ — เพิ่ม role ใหม่ที่นี่
export const ROLE_LABELS = {
  pharmacist: 'เภสัชกร',
};

// "จดจำการเข้าสู่ระบบ" ติ๊ก -> เก็บใน localStorage (อยู่ต่อแม้ปิดเบราว์เซอร์)
// ไม่ติ๊ก -> เก็บใน sessionStorage (ปิดเบราว์เซอร์แล้วต้องล็อกอินใหม่)
const getToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
};
const saveToken = (token, remember) => {
  clearToken();
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
};

// ครอบ fetch ครั้งเดียว: แนบ token ให้ทุกคำสั่งที่ยิงไป /api/ ของโค้ดเดิมโดยไม่ต้องแก้ไฟล์อื่น
// และถ้า server ตอบ 401 (token หมดอายุ) จะพากลับหน้าล็อกอินอัตโนมัติ
if (typeof window !== 'undefined' && !window.__kpiFetchPatched) {
  window.__kpiFetchPatched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    const isApi = url.includes('/api/');
    const token = getToken();

    if (isApi && token) {
      const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      init = { ...init, headers };
    }

    const res = await originalFetch(input, init);

    if (isApi && res.status === 401 && !url.includes('/api/auth/login')) {
      clearToken();
      window.dispatchEvent(new Event('auth:expired'));
    }
    return res;
  };
}

// ปุ่ม/ลิงก์ดาวน์โหลด (เช่น Export Excel/CSV) ที่เป็น <a href="/api/..."> เบราว์เซอร์เปิดเองจะไม่มี token
// จึงดักการคลิก แล้วโหลดผ่าน fetch (ที่แนบ token ให้แล้ว) จากนั้นสั่งบันทึกไฟล์
function filenameFrom(res, href) {
  const cd = res.headers.get('Content-Disposition') || '';
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try { return decodeURIComponent(star[1]); } catch { /* ใช้แบบถัดไป */ }
  }
  const plain = cd.match(/filename="?([^";]+)"?/i);
  if (plain) return plain[1];
  const u = new URL(href, window.location.origin);
  return `${u.searchParams.get('type') || 'export'}.${u.searchParams.get('format') || 'xlsx'}`;
}

if (typeof window !== 'undefined' && !window.__kpiDownloadPatched) {
  window.__kpiDownloadPatched = true;

  document.addEventListener('click', async (e) => {
    const a = e.target.closest?.('a[href]');
    const href = a?.getAttribute('href');
    if (!href || !href.startsWith('/api/')) return;

    e.preventDefault();
    try {
      const res = await window.fetch(href);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filenameFrom(res, href);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    } catch (err) {
      alert(`ดาวน์โหลดไม่สำเร็จ: ${err.message}`);
    }
  });
}

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  // เปิดหน้าเว็บ: ถ้ามี token เก่า ให้ตรวจกับ server ก่อน
  useEffect(() => {
    if (!getToken()) return;
    fetch(`${API_BASE}/api/auth/me`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUser(d?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = useCallback(async (username, password, remember = false) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
    saveToken(data.token, remember);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}