import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql');

async function main() {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const applied = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    console.log('applying', f);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await client.query('COMMIT');
      applied.push(f);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  // 002 เพิ่มระบบคัดกรองข้อมูล: ตรวจข้อมูลเดิมใน DB ด้วยกฎใหม่หนึ่งครั้ง
  if (applied.includes('002_data_filter.sql')) {
    const { reclassifyAll } = await import('./services/filterService.js');
    const r = await reclassifyAll();
    console.log(`reclassified existing orders: checked ${r.checked}, flagged ${r.changed}`);
  }
  console.log('migration complete');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
