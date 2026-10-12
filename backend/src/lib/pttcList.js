import XLSX from 'xlsx';
import { norm } from './parse.js';

/** สีพื้นหลัง (hex rgb) -> 'red' | 'green' | 'other' | 'none' */
export function classifyFill(rgb) {
  if (!rgb) return 'none';
  const hex = String(rgb).replace(/^#/, '').slice(-6);
  if (!/^[0-9a-f]{6}$/i.test(hex)) return 'other';
  const r = parseInt(hex.slice(0, 2), 16); const g = parseInt(hex.slice(2, 4), 16); const b = parseInt(hex.slice(4, 6), 16);
  if (r > 235 && g > 235 && b > 235) return 'none'; // ขาว
  if (g > r + 30 && g > b + 30) return 'green';     // เช่น 008000
  if (r > g + 30 && r > b + 30 && g < 140) return 'red'; // เช่น 993300 (แดง/น้ำตาลแดง), FF0000
  return 'other';
}

/**
 * อ่านบัญชียา: คอลัมน์ PTTC ถูกระบายสี  เขียว = นับใน KPI, แดง = ตัดออก
 * คืน { sheet, red:[codes], green:[codes], other, none, names:{code:name} }
 */
export function readPttcList(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellStyles: true, cellDates: false });
  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet];
    if (!ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    let hdr = -1; let codeCol = -1; let pttcCol = -1; let nameCol = -1;
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 14) && hdr < 0; r++) {
      let c1 = -1; let c2 = -1; let c3 = -1;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        const n = norm(cell?.v);
        if (n === 'itemcode' || n === 'รหัสยา') c1 = c;
        if (n === 'pttc') c2 = c;
        if (n.startsWith('itemname')) c3 = c;
      }
      if (c1 >= 0 && c2 >= 0) { hdr = r; codeCol = c1; pttcCol = c2; nameCol = c3; }
    }
    if (hdr < 0) continue;
    const out = { sheet, red: [], green: [], other: 0, none: 0, names: {} };
    const seen = new Set();
    for (let r = hdr + 1; r <= range.e.r; r++) {
      const cc = ws[XLSX.utils.encode_cell({ r, c: codeCol })];
      const code = cc?.v == null ? '' : String(cc.v).trim().replace(/\.0$/, '');
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const pc = ws[XLSX.utils.encode_cell({ r, c: pttcCol })];
      const kind = classifyFill(pc?.s?.fgColor?.rgb);
      if (nameCol >= 0) out.names[code] = ws[XLSX.utils.encode_cell({ r, c: nameCol })]?.v ?? null;
      if (kind === 'red') out.red.push(code);
      else if (kind === 'green') out.green.push(code);
      else out[kind]++;
    }
    return out;
  }
  return null;
}