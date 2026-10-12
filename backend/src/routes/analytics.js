import { Router } from 'express';
import { buildDashboard, buildReport, buildMeta } from '../services/reportService.js';
import { buildSheets, sendExport } from '../services/exportService.js';

const r = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

r.get('/meta', wrap(async (_req, res) => res.json(await buildMeta())));
r.get('/dashboard', wrap(async (req, res) => res.json(await buildDashboard(req.query))));
r.get('/report', wrap(async (req, res) => res.json(await buildReport(req.query))));
r.get('/export', wrap(async (req, res) => {
  const type = ['report', 'orders', 'dashboard'].includes(req.query.type) ? req.query.type : 'dashboard';
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const sheets = await buildSheets(type, req.query);
  sendExport(res, sheets, format, `pharmacy-kpi-${type}-${req.query.year || 'all'}`);
}));

export default r;
