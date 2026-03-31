// server/routes/health.js
import { Router } from 'express';
import { config } from '../config/index.js';

export const healthRouter = Router();

// Health check para Railway / Azure / Docker
healthRouter.get('/', (_req, res) => {
  res.json({
    status:  'ok',
    service: 'facturacl',
    version: '2.0.0',
    env:     config.nodeEnv,
    ts:      new Date().toISOString(),
  });
});

// Expone datos del emisor al frontend (sin credenciales)
healthRouter.get('/issuer', (_req, res) => {
  res.json({
    rut:       config.issuer.rut,
    legalName: config.issuer.legalName,
    activity:  config.issuer.activity,
    address:   config.issuer.address,
    district:  config.issuer.district,
    city:      config.issuer.city,
  });
});
