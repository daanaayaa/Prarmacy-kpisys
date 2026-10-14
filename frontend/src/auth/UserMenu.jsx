import { ROLE_LABELS, useAuth } from './AuthContext';

// ปุ่มชื่อผู้ใช้ + ออกจากระบบ — วางใน header หรือ sidebar
// variant="dark" ใช้บนพื้นสีเข้ม (navy), variant="light" ใช้บนพื้นขาว
// stacked ใช้ใน sidebar แคบ (ปุ่มออกจากระบบอยู่ใต้ชื่อ)
export default function UserMenu({ variant = 'light', stacked = false }) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const dark = variant === 'dark';
  return (
    <div className={stacked ? 'space-y-2' : 'flex items-center gap-3'}>
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            dark ? 'bg-white/15 text-white' : 'bg-blue-100 text-blue-700'
          }`}
          aria-hidden="true"
        >
          {user.fullName?.trim()?.[0] ?? 'U'}
        </div>
        <div className="min-w-0 leading-tight">
          <p className={`truncate text-sm font-medium ${dark ? 'text-white' : 'text-slate-800'}`}>{user.fullName}</p>
          <p className={`truncate text-xs ${dark ? 'text-blue-200' : 'text-slate-500'}`}>
            {ROLE_LABELS[user.role] ?? user.role}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={logout}
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
          stacked ? 'w-full text-left' : 'ml-1'
        } ${dark ? 'text-blue-100 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        ออกจากระบบ
      </button>
    </div>
  );
}