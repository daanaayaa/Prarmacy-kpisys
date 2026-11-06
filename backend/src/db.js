import pg from 'pg';
import { DATABASE_URL } from './config.js';

pg.types.setTypeParser(1114, (v) => v);
pg.types.setTypeParser(1082, (v) => v);

console.log('[DATABASE CHECK]', {
  databaseUrlExists: Boolean(DATABASE_URL)
});

if (!DATABASE_URL) {
  console.error('[ERROR] ไม่พบ DATABASE_URL');
  process.exit(1);
}

const useSsl = /sslmode=require|neon\.tech/i.test(DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 8,
});

export const query = (text, params) => pool.query(text, params);