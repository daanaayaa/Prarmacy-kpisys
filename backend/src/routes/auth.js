import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config.js';
import { ALLOWED_ROLES, requireAuth } from '../middleware/auth.js';

const router = Router();

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // กัน timing เมื่อไม่พบ username

// จำกัดการเดารหัส: ผิดครบ 5 ครั้งใน 15 นาที (ต่อ IP + username) ให้รอ
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map();
const isLocked = (key) => {
  const e = fails.get(key);
  if (!e) return false;
  if (Date.now() - e.first > WINDOW_MS) {
    fails.delete(key);
    return false;
  }
  return e.count >= MAX_FAILS;
};
const addFail = (key) => {
  const e = fails.get(key);
  if (!e || Date.now() - e.first > WINDOW_MS) fails.set(key, { count: 1, first: Date.now() });
  else e.count += 1;
};

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  fullName: u.full_name,
  role: u.role,
});

router.post('/login', async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (!username || !password) {
    return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
  }
  if (!JWT_SECRET) {
    console.error('[auth] JWT_SECRET is not set in backend/.env');
    return res.status(500).json({ error: 'ระบบยังตั้งค่าไม่ครบ กรุณาแจ้งผู้ดูแล' });
  }

  const key = `${req.ip}|${username.toLowerCase()}`;
  if (isLocked(key)) {
    return res.status(429).json({ error: 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' });
  }

  try {
    const { rows } = await query(
      `SELECT id, username, password_hash, full_name, role, is_active
         FROM users WHERE lower(username) = lower($1)`,
      [username]
    );
    const user = rows[0];
    const passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !passwordOk) {
      addFail(key);
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
    }
    if (!ALLOWED_ROLES.includes(user.role)) {
      return res.status(403).json({ error: 'บัญชีนี้ยังไม่มีสิทธิ์ใช้งานระบบ' });
    }

    fails.delete(key);
    query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]).catch(() => {});

    const token = jwt.sign(
      { sub: user.id, username: user.username, name: user.full_name, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
  }
});

// ตรวจ token + เช็คกับ DB ว่าบัญชียังใช้งานได้ (เรียกตอนเปิดหน้าเว็บ)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, username, full_name, role, is_active FROM users WHERE id = $1',
      [req.user.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active || !ALLOWED_ROLES.includes(user.role)) {
      return res.status(401).json({ error: 'บัญชีนี้ไม่สามารถใช้งานได้' });
    }
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('[auth] me error:', err);
    res.status(500).json({ error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' });
  }
});

export default router;