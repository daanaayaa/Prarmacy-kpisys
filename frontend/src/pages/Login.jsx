import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

/* ===== ค่าที่แก้เองได้ ===== */
const IT_PHONE = '1122';
const APP_VERSION = '3.4.1';
// ตัวเลขในการ์ดฝั่งซ้ายเป็นภาพตัวอย่างประกอบ ไม่ใช่ข้อมูลจริงของระบบ
const SAMPLE_STEPS = [
  { icon: 'doc', label: '1. แพทย์สั่งยา', avg: '3.2', color: 'text-cyan-300', dot: 'bg-cyan-400' },
  { icon: 'flask', label: '2. เภสัชกรจ่ายยา', avg: '6.5', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  { icon: 'heart', label: '3. พยาบาลให้ยา', avg: '4.1', color: 'text-cyan-300', dot: 'bg-cyan-400' },
];
const SAMPLE_BARS = [24, 33, 41, 49, 55, 42, 64];
const API_BASE = import.meta.env.VITE_API_URL || '';

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@500;600;700&family=Sarabun:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');
.kpi-login { font-family: 'Sarabun', 'Leelawadee UI', 'Noto Sans Thai', Tahoma, sans-serif; }
.kpi-login .kpi-head { font-family: 'Prompt', 'Sarabun', 'Leelawadee UI', Tahoma, sans-serif; }
.kpi-login .kpi-mono { font-family: 'JetBrains Mono', ui-monospace, Consolas, 'Courier New', monospace; }
`;

const ICONS = {
  user: ['M19 21a7 7 0 0 0-14 0', 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z'],
  lock: ['M5 11h14v10H5z', 'M8 11V7.5a4 4 0 0 1 8 0V11'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eyeOff: [
    'M3 3l18 18',
    'M10.6 6.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 4',
    'M6.5 6.9C3.7 8.7 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 3.5-.7',
    'M9.9 9.9a3 3 0 0 0 4.2 4.2',
  ],
  capsule: ['M8 9a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0z', 'M8 12h8'],
  bolt: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  chart: ['M4 20V11', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  doc: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
  flask: ['M9 3h6', 'M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3', 'M7.5 15h9'],
  heart: ['M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  alert: ['M12 8v5', 'M12 17h.01', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'],
  calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
};

const Icon = ({ name, className = 'h-5 w-5', strokeWidth = 1.8 }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {ICONS[name].map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);

// เช็กสถานะระบบจริงจาก /api/health
function useHealth() {
  const [status, setStatus] = useState('checking'); // checking | ok | down
  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch(`${API_BASE}/api/health`)
        .then((r) => alive && setStatus(r.ok ? 'ok' : 'down'))
        .catch(() => alive && setStatus('down'));
    check();
    const t = setInterval(check, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return status;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function Login() {
  const { login } = useAuth();
  const health = useHealth();
  const now = useClock();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = username.trim() !== '' && password !== '' && !busy;
  const dateText = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeText = `${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })} น.`;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
      setPassword('');
      setBusy(false);
    }
  };

  const statusUi = {
    ok: { text: 'Live System Online', pill: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', dot: 'bg-emerald-400' },
    down: { text: 'System Offline', pill: 'border-red-400/40 bg-red-400/10 text-red-300', dot: 'bg-red-400' },
    checking: { text: 'Checking...', pill: 'border-white/20 bg-white/5 text-white/60', dot: 'bg-white/50' },
  }[health];

  const inputClass =
    'h-14 w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 text-[15px] text-slate-900 placeholder:text-slate-400 ' +
    'transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/15';

  return (
    <div
      className="kpi-login relative min-h-screen overflow-hidden text-white"
      style={{
        backgroundColor: '#04122a',
        backgroundImage:
          'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(30,80,170,0.35), transparent 70%),' +
          'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '100% 100%, 28px 28px',
      }}
    >
      <style>{FONT_CSS}</style>
      <div className="relative mx-auto flex min-h-screen max-w-[1440px] flex-col justify-between gap-8 px-5 py-8 sm:px-10 lg:px-20 lg:py-14">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/60 bg-[#0b2447] text-cyan-300 shadow-[0_0_22px_rgba(34,211,238,0.35)]">
              <Icon name="capsule" className="h-6 w-6" strokeWidth={2} />
            </span>
            <div className="leading-tight">
              <div className="flex flex-wrap items-center gap-3">
                <p className="kpi-head text-lg font-bold sm:text-xl">Bangkok Hospital Siriroj</p>
                <span className={`flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs ${statusUi.pill}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusUi.dot}`} />
                  {statusUi.text}
                </span>
              </div>
              <p className="mt-1 text-sm text-white/55">ฝ่ายเภสัชกรรม • Pharmacy Division (BHS-RX)</p>
            </div>
          </div>
          <span className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/75 md:flex">
            <Icon name="bolt" className="h-4 w-4 text-cyan-300" />
            Integrated Pharmacy Dashboard Portal
          </span>
        </header>

        <main className="relative overflow-hidden rounded-[28px] border border-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] lg:grid lg:grid-cols-[1.4fr_1fr]">
          <span className="absolute inset-x-0 top-0 z-10 h-[3px] bg-gradient-to-r from-blue-600 via-sky-400 to-cyan-400" aria-hidden="true" />

          <section className="hidden flex-col bg-gradient-to-br from-[#0c2245] to-[#081a36] p-12 lg:flex">
            <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-sm text-cyan-300">
              <Icon name="chart" className="h-4 w-4" />
              ระบบติดตามระยะเวลาและประสิทธิภาพการจ่ายยา
            </span>

            <h1 className="kpi-head mt-6 text-3xl font-bold leading-tight xl:text-[40px]">
              Pharmacy{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Process Time KPI
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/80">
              ติดตามเวลาในแต่ละขั้นตอน ตั้งแต่แพทย์สั่งยาจนถึงพยาบาลให้ยาผู้ป่วย เพื่อดูว่ากระบวนการไหนต้องปรับปรุง
            </p>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="flex items-center gap-2.5 text-sm text-white/85">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  Workflow Process Overview
                </span>
              </div>

              <div className="relative grid grid-cols-3 py-7">
                <span className="absolute left-[16%] right-[16%] top-[58px] border-t border-dashed border-white/25" aria-hidden="true" />
                {SAMPLE_STEPS.map((s) => (
                  <div key={s.label} className="relative flex flex-col items-center text-center">
                    <span className="relative flex h-[60px] w-[60px] items-center justify-center rounded-full border-2 border-cyan-400/70 bg-[#0e2a55] text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.25)]">
                      <Icon name={s.icon} className="h-6 w-6" />
                      <span className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#0b1f40] ${s.dot}`} />
                    </span>
                    <p className="mt-3 text-sm text-white/90">{s.label}</p>
                    <p className={`kpi-mono mt-1 text-xs ${s.color}`}>avg {s.avg} นาที</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/10 pt-5">
                <div className="flex items-start justify-between gap-4 text-sm text-white/75">
                  
                  
                </div>
                <div className="mt-3 flex h-[70px] items-end gap-3" aria-hidden="true">
                  {SAMPLE_BARS.map((h, i) => (
                    <span
                      key={i}
                      className={`flex-1 rounded-md ${
                        i === SAMPLE_BARS.length - 1
                          ? 'bg-gradient-to-b from-sky-300 to-blue-600 shadow-[0_0_24px_rgba(56,189,248,0.55)] ring-1 ring-sky-300/60'
                          : 'bg-white/[0.14]'
                      }`}
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between gap-4 border-t border-white/10 pt-6 text-sm text-white/70">
              <span className="flex items-center gap-2.5">
                <span className={`h-2 w-2 rounded-full ${statusUi.dot}`} />
                {health === 'ok' ? 'เชื่อมต่อฐานข้อมูลของระบบแล้ว' : health === 'down' ? 'ยังเชื่อมต่อฐานข้อมูลไม่ได้' : 'กำลังตรวจสอบการเชื่อมต่อ'}
              </span>
              <span className="kpi-mono text-xs text-white/55">DB: {health === 'ok' ? 'Connected' : health === 'down' ? 'Offline' : '...'}</span>
            </div>
          </section>

          {/* ฝั่งขวา: ฟอร์มล็อกอิน */}
          <section className="flex flex-col bg-white p-8 text-slate-900 sm:p-12">
            {/* วันที่-เวลา (ใช้ดูรอบเวร) */}
            <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <Icon name="calendar" className="h-4 w-4 text-slate-400" />
                {dateText}
              </span>
              <span className="kpi-mono rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{timeText}</span>
            </div>

            {/* ฟอร์ม จัดกึ่งกลางแนวตั้ง */}
            <div className="my-auto py-10">
              <div className="mb-8 lg:hidden">
                <p className="kpi-head text-lg font-bold">
                  Pharmacy{' '}
                  <span className="bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">Process Time KPI</span>
                </p>
              </div>

              <h2 className="kpi-head text-3xl font-bold tracking-tight">เข้าสู่ระบบ</h2>
              <p className="mt-2 text-[15px] text-slate-500">เข้าสู่ระบบเพื่อดูรายงาน KPI ของแผนกเภสัชกรรม</p>

              <form onSubmit={onSubmit} className="mt-8 space-y-6" noValidate>
                {error && (
                  <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="username" className="mb-2 block text-sm font-semibold text-slate-800">
                    ชื่อผู้ใช้
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Icon name="user" className="h-5 w-5" />
                    </span>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoFocus
                      placeholder="กรอกชื่อผู้ใช้"
                      className={`${inputClass} pr-4`}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-800">
                    รหัสผ่าน
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Icon name="lock" className="h-5 w-5" />
                    </span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="กรอกรหัสผ่าน"
                      className={`${inputClass} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                      <Icon name={showPassword ? 'eyeOff' : 'eye'} className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="kpi-head flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:from-blue-700 hover:to-sky-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
                >
                  {busy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      กำลังเข้าสู่ระบบ
                    </>
                  ) : (
                    <>
                      เข้าสู่ระบบ
                      <Icon name="arrow" className="h-5 w-5" strokeWidth={2.2} />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* ข้อควรปฏิบัติสำหรับเครื่องที่ใช้ร่วมกันในหน่วยงาน */}
            <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
              <span className="mt-0.5 text-blue-600">
                <Icon name="shield" className="h-5 w-5" />
              </span>
              <div className="text-sm leading-relaxed">
                <p className="font-semibold text-slate-800">ข้อควรปฏิบัติ</p>
                <p className="text-slate-600">
                  ใช้ได้เฉพาะเจ้าหน้าที่ที่ได้รับสิทธิ์ ห้ามบอกรหัสผ่านผู้อื่น และกดออกจากระบบทุกครั้งเมื่อเลิกใช้งานบนเครื่องที่ใช้ร่วมกัน
                </p>
              </div>
            </div>
          </section>
        </main>

        {/* ส่วนท้าย */}
        <footer className="flex flex-col gap-2 border-t border-white/10 pt-6 text-sm text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2.5">
            <Icon name="lock" className="h-4 w-4" />
            สำหรับเจ้าหน้าที่ที่ได้รับสิทธิ์เท่านั้น • Hospital Information System Security Tier-3
          </span>
          <span>
            ศูนย์ประสานงาน IT โทร. <span className="font-semibold text-white/70">{IT_PHONE}</span> (24 ชม.) &nbsp;•&nbsp; BHS Version {APP_VERSION}
          </span>
        </footer>
      </div>
    </div>
  );
}