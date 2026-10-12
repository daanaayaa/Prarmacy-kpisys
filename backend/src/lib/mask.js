import { MASK_PATIENT } from '../config.js';

export function maskName(n) {
  if (!n) return '';
  const s = String(n).trim();
  if (!MASK_PATIENT) return s;
  return s.slice(0, 1) + '*****';
}
export function maskId(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (!MASK_PATIENT) return s;
  return '***' + s.slice(-3);
}
