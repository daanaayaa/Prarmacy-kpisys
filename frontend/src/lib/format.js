export const mmss = (sec) => {
  if (sec == null) return '-';
  const s = Math.round(sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
export const minutes = (sec) => (sec == null ? null : Math.round((sec / 60) * 100) / 100);
export const pct = (v) => (v == null ? '-' : `${v.toFixed(2)}%`);
export const num = (v) => (v == null ? '-' : v.toLocaleString());
export const dash = (v) => (v ? v.toLocaleString() : '-');
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const targetLabel = (k) => `${k.operator} ${k.target} ${k.unit === 'minutes' ? 'นาที' : 'วินาที'}`;
