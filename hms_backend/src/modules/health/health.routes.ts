import { Router } from 'express';
import { pool } from '../../db/client';

export const healthRouter = Router();

// Liveness — process is up. No dependencies touched.
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hms_backend', time: new Date().toISOString() });
});

// Readiness — can we reach PostgreSQL? Returns 503 if not, so a load balancer can gate traffic.
healthRouter.get('/health/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready', db: 'up' });
  } catch {
    res.status(503).json({ error: { code: 'NOT_READY', message: 'Database unreachable' } });
  }
});
