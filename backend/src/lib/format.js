export function mmss(sec) {
  if (sec == null || Number.isNaN(Number(sec))) return '-';
  const s = Math.round(Number(sec)); // ปัดวินาทีเหมือน Excel (avg 25:01 / 04:33 ตรงกับไฟล์เดิม)
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
