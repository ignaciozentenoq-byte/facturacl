// server/routes/health.js
// Health check para Railway / Azure / Docker
// GET /health → 200 { status: 'ok', ... }

import { Router } from 'express';
import { config } from '../config/index.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status:  'ok',
    service: 'facturacl',
    version: '2.0.0',
    env:     config.nodeEnv,
    ts:      new Date().toISOString(),
  });
});
