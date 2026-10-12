import XLSX from 'xlsx';

export const INVALID = Symbol('invalid');

/** field -> รายชื่อ header ที่ยอมรับ (normalize แล้ว) */
export const FIELD_ALIASES = {
  hn: ['hn'],
  vn_an: ['vnan', 'an', 'vn'],
  name: ['name', 'ชื่อ', 'patientname'],
  item_code: ['itemcode', 'รหัสยา'],
  item_name: ['itemname', 'ชื่อยา'],
  pn: ['pn'],
  order_by: ['orderby'],
  t_order: ['เวลาแพทย์สั่งตรวจ', 'เวลาแพทย์สั่ง', 'ordertime'],
  t_prepare: ['เวลาผชเภสัชจัดยา', 'เวลาผู้ช่วยเภสัชจัดยา'],
  t_verify: ['เวลาเภสัชตรวจยา'],
  t_dispense: ['เวลาเภสัชจ่ายยา'],
  t_nurse: ['เวลาพยาบาลให้ยา'],
  total: ['เวลารวม'],
  ward: ['wardlocation', 'ward', 'location'],
  room: ['room', 'ห้อง'],
  high_alert: ['highalertdrug'],
  t_ipd: ['เวลาบันทึกรับยาipd', 'เวลารับยาipd'],
};
export const FIELD_LABELS = {
  hn: 'HN', vn_an: 'VN/AN', name: 'ชื่อผู้ป่วย', item_code: 'Item Code *', item_name: 'Item Name', pn: 'PN', order_by: 'Order by',
  t_order: 'เวลาแพทย์สั่ง *', t_prepare: 'เวลา ผช.เภสัชจัดยา', t_verify: 'เวลาเภสัชตรวจยา', t_dispense: 'เวลาเภสัชจ่ายยา',
  t_nurse: 'เวลาพยาบาลให้ยา', total: 'เวลารวม', ward: 'Ward/Location', room: 'Room', high_alert: 'High_Alert_Drug', t_ipd: 'เวลาบันทึกรับยา IPD',
};
export const REQUIRED_FIELDS = ['item_code', 't_order'];

export const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\u0E01-\u0E59]/g, '');

export function readWorkbook(buffer) {
  return XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: true });
}

/** อ่านชีตเป็น rows[][] + หา header row อัตโนมัติ */
export function readSheet(wb, sheetName, aliasMap = FIELD_ALIASES) {
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const known = new Set(Object.values(aliasMap).flat());
  let headerRow = 0;
  let best = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const hits = (rows[i] || []).filter((c) => c != null && known.has(norm(c))).length;
    if (hits > best) { best = hits; headerRow = i; }
  }
  const headers = (rows[headerRow] || []).map((h, i) => (h == null || String(h).trim() === '' ? `(คอลัมน์ ${i + 1})` : String(h).trim()));
  return { rows: rows.slice(headerRow + 1), headers, headerRow, matched: best };
}

export function autoMapping(headers, aliasMap = FIELD_ALIASES) {
  const mapping = {};
  const used = new Set();
  for (const [field, aliases] of Object.entries(aliasMap)) {
    const idx = headers.findIndex((h, i) => !used.has(i) && aliases.includes(norm(h)));
    if (idx >= 0) { mapping[field] = idx; used.add(idx); }
  }
  return mapping;
}

const pad = (n) => String(n).padStart(2, '0');
const fmt = (y, mo, d, h, mi, s) => `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;
function valid(y, mo, d, h, mi, s) {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1;
}

/** แปลงค่าใน cell เป็น 'YYYY-MM-DD HH:MM:SS' | null (ว่าง) | INVALID */
export function parseDT(v) {
  if (v == null) return null;
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v);
    if (!p) return INVALID;
    const s = Math.round(p.S);
    return valid(p.y, p.m, p.d, p.H, p.M, 0) ? fmt(p.y, p.m, p.d, p.H, p.M, Math.min(59, s)) : INVALID;
  }
  const t = String(v).trim();
  if (!t || t === '-') return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  let y, mo, d, h, mi, s;
  if (m) { [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)]; }
  else {
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return INVALID;
    [d, mo, y, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
  }
  if (y > 2400) y -= 543; // พ.ศ. -> ค.ศ.
  return valid(y, mo, d, h, mi, s) ? fmt(y, mo, d, h, mi, s) : INVALID;
}

export function cleanStr(v) {
  if (v == null) return null;
  const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : String(v).trim();
  return s === '' ? null : s;
}
