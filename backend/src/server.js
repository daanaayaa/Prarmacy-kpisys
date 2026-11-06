
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { PORT } from './config.js';
import { query } from './db.js';

import authRoutes from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import analytics from './routes/analytics.js';
import importer from './routes/importer.js';
import admin from './routes/admin.js';
import filter from './routes/filter.js';

const app = express();

// ========================================
// 1. Basic Middleware
// ========================================

app.use(cors());

app.use(express.json({ limit: '2mb' }));

app.use(express.urlencoded({
  extended: true,
  limit: '2mb',
}));

// ========================================
// 2. Public Routes
// ไม่ต้องล็อกอิน
// ========================================

// Health Check + Database Check
app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');

    res.status(200).json({
      ok: true,
      database: 'connected',
      message: 'Pharmacy KPI API is running',
    });
  } catch (error) {
    console.error('[HEALTH CHECK ERROR]', error.message);

    res.status(500).json({
      ok: false,
      database: 'disconnected',
      message: 'Database connection failed',
    });
  }
});

// Login / Authentication
app.use('/api/auth', authRoutes);

// ========================================
// 3. Protected Routes
// ทุก API หลังจากนี้ต้อง Login ก่อน
// ========================================

app.use('/api', requireAuth);

app.use('/api/import', importer);

app.use('/api', analytics);

app.use('/api', filter);

app.use('/api', admin);

// ========================================
// 4. Frontend Static Files
// ใช้เฉพาะ Local Development
// บน Vercel ให้ Frontend Deploy แยก
// ========================================

if (process.env.VERCEL !== '1') {
  const currentDir = path.dirname(
    fileURLToPath(import.meta.url)
  );

  const dist = path.resolve(
    currentDir,
    '..',
    '..',
    'frontend',
    'dist'
  );

  if (fs.existsSync(dist)) {
    app.use(express.static(dist));

    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }
}

// ========================================
// 5. Not Found Handler
// ========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
  });
});

// ========================================
// 6. Global Error Handler
// ========================================

app.use((err, _req, res, _next) => {
  console.error('[SERVER ERROR]', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.status && err.status < 500
      ? err.message
      : 'Internal Server Error',
  });
});

// ========================================
// 7. Server Startup
// Local: เปิด Express Server
// Vercel: Export App ให้ Serverless
// ========================================

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
  });
}

// สำคัญ: Export Express App สำหรับ Vercel
export default app;
