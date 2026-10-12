import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORT } from './config.js';
import { query } from './db.js';
import analytics from './routes/analytics.js';
import importer from './routes/importer.js';
import admin from './routes/admin.js';
import filter from './routes/filter.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', async (_req, res) => {
  try { await query('SELECT 1'); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.use('/api/import', importer);
app.use('/api', analytics);
app.use('/api', filter);
app.use('/api', admin);

// production: เสิร์ฟ frontend ที่ build แล้ว
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
