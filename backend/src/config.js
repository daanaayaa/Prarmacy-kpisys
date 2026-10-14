import 'dotenv/config';

export const PORT = Number(process.env.PORT || 4000);
export const DATABASE_URL = process.env.DATABASE_URL || '';
export const MASK_PATIENT = (process.env.MASK_PATIENT ?? 'true') !== 'false';

// ระบบล็อกอิน: ใส่ JWT_SECRET ใน backend/.env (สุ่มยาวๆ ไม่ต่ำกว่า 32 ตัวอักษร)
export const JWT_SECRET = process.env.JWT_SECRET || '';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';