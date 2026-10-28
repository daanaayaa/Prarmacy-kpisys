import { norm } from './parse.js';

/**
 * กฎคัดกรองข้อมูลดิบ — ใช้ที่เดียวทั้งตอน Import (preview/commit) และตอนตรวจข้อมูลเดิมใหม่ (reclassify)
 *
 * ลำดับการตรวจ (แถวหนึ่งมีเหตุผลเดียว ตามลำดับนี้):
 *  1) LOCATION    ward/location เป็น Airport / Rawai / Khaolak Clinic  (ตัดทุกเดือน)
 *  2) NO_DISPENSE ไม่มีเวลาเภสัชจ่ายยา
 *  3) NO_ADMIN    ไม่มีเวลาพยาบาลให้ยา (นับแยกตาม ward)
 *  4) NEG_TIME    เวลาย้อนหลัง (พยาบาลให้ยา/เภสัชจ่ายยา ก่อนเวลาแพทย์สั่ง) — คำนวณระยะเวลาไม่ได้
 *  5) OVER_LIMIT  แพทย์สั่ง → พยาบาลให้ยา นานตั้งแต่ N ชั่วโมงขึ้นไป (ค่าเริ่มต้น 8 ชม. — 7:59:59 ยังใช้)
 * ส่วน "ยาที่ user เลือกตัดออก" ทำตอนคำนวณ (ตาราง drug_exclusions) จึงแก้ได้ทันทีโดยไม่ต้อง import ใหม่
 */
export const REASONS = {
  DRUG: 'ยาที่เลือกตัดออก',
  LOCATION: 'ward นอกโรงพยาบาล (Airport / Rawai / Khaolak Clinic)',
  NO_DISPENSE: 'ไม่มีเวลาเภสัชจ่ายยา',
  NO_ADMIN: 'ไม่มีเวลาพยาบาลให้ยา',
  NEG_TIME: 'ลำดับเวลาผิดปกติ (เวลาย้อนหลัง)',
  OVER_LIMIT: 'แพทย์สั่ง → พยาบาลให้ยา นานเกินกำหนด',
};
// REASON_KEYS ใช้ตัวเดิม แต่ต้องไม่รวม DRUG เพราะ classCounts ใช้เฉพาะกฎข้อมูลดิบ
export const REASON_KEYS = Object.keys(REASONS).filter((k) => k !== 'DRUG');

export const DEFAULT_SETTINGS = {
  max_order_nurse_hours: 8,
  excluded_locations: ['airport', 'rawai', 'khaolak'],
};

const toSec = (s) => (s ? Date.parse(String(s).replace(' ', 'T').slice(0, 19) + 'Z') / 1000 : null);

export function isExcludedLocation(ward, settings = DEFAULT_SETTINGS) {
  const w = norm(ward);
  if (!w) return false;
  return (settings.excluded_locations || []).some((k) => {
    const n = norm(k);
    return n && w.includes(n);
  });
}

/** rec = { ward, t_order, t_dispense, t_nurse } -> reason | null (null = ใช้ได้) */
export function classify(rec, settings = DEFAULT_SETTINGS) {
  if (isExcludedLocation(rec.ward, settings)) return 'LOCATION';
  if (!rec.t_dispense) return 'NO_DISPENSE';
  if (!rec.t_nurse) return 'NO_ADMIN';
  const o = toSec(rec.t_order);
  const d = toSec(rec.t_dispense);
  const n = toSec(rec.t_nurse);
  if (o == null) return null; // ไม่มีเวลาสั่ง = error ตั้งแต่ตอน import อยู่แล้ว
  if (d < o || n < o) return 'NEG_TIME';
  const limit = Number(settings.max_order_nurse_hours ?? DEFAULT_SETTINGS.max_order_nurse_hours) * 3600;
  if (limit > 0 && n - o >= limit) return 'OVER_LIMIT';
  return null;
}
