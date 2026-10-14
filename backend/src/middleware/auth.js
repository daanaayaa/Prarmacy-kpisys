import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

// role ที่เข้าระบบได้ — เพิ่ม role ใหม่ที่นี่ที่เดียว (ต้องตรงกับค่าในคอลัมน์ users.role)
export const ALLOWED_ROLES = ['pharmacist'];

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!ALLOWED_ROLES.includes(payload.role)) {
      return res.status(403).json({ error: 'บัญชีนี้ยังไม่มีสิทธิ์ใช้งานระบบ' });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

// ใช้จำกัดสิทธิ์เฉพาะบาง route เมื่อมีหลาย role: router.post('/x', requireRole('admin'), ...)
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ error: 'ไม่มีสิทธิ์ทำรายการนี้' });