
import pg from 'pg';
import { DATABASE_URL } from './config.js';

const { Pool, types } = pg;

// ป้องกัน PostgreSQL แปลงวันที่และเวลาเป็น timezone ของเครื่อง
types.setTypeParser(1114, (value) => value);
types.setTypeParser(1082, (value) => value);

// ตรวจสอบ Environment Variable
if (!DATABASE_URL) {
  console.error('[DB ERROR] DATABASE_URL is missing');
  throw new Error('DATABASE_URL is not configured');
}

// ตั้งค่า SSL สำหรับ Neon
const useSsl = /sslmode=require|neon\.tech/i.test(DATABASE_URL);

// สร้าง Connection Pool
export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 8,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ตรวจสอบข้อผิดพลาดจาก Pool
pool.on('error', (error) => {
  console.error('[DB POOL ERROR]', error.message);
});

// ฟังก์ชัน Query
export const query = (text, params = []) => {
  return pool.query(text, params);
};

// ฟังก์ชันทดสอบการเชื่อมต่อ
export const testConnection = async () => {
  const result = await pool.query('SELECT NOW() AS time');

  return {
    connected: true,
    time: result.rows[0].time,
  };
};

// ปิด Connection Pool เมื่อจำเป็น
export const closePool = async () => {
  await pool.end();
};
