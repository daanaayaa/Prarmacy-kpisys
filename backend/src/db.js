import pg from 'pg';
import { DATABASE_URL } from './config.js';

// timestamp / date -> string เพื่อไม่ให้ driver แปลง timezone เอง
pg.types.setTypeParser(1114, (v) => v);
pg.types.setTypeParser(1082, (v) => v);

if (!DATABASE_URL) {
  console.error('\n[ERROR] ไม่พบ DATABASE_URL — คัดลอก backend/.env.example เป็น backend/.env แล้วใส่ connection string ของ Neon\n');
  process.exit(1);
}

const useSsl = /sslmode=require|neon\.tech/i.test(DATABASE_URL);
export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 8,
});

export const query = (text, params) => pool.query(text, params);
