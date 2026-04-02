// server/routes/tenants.js
// ═══════════════════════════════════════════════════════════════
// CRUD de tenants para el panel SaaS de QuickPOS.
// Solo accesible por usuarios con role admin/supervisor.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { supabase } from '../services/db.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import logger from '../middleware/logger.js';

export const tenantsRouter = Router();
tenantsRouter.use(jwtAuth);

// ── GET /api/pos/tenants ─────────────────────────────────────
tenantsRouter.get('/', async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, rut, legal_name, plan_id, status, active, mrr, email, phone, created_at, updated_at, settings')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Contar documentos por tenant
    const enriched = await Promise.all(data.map(async (t) => {
      const { count } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', t.id);
      return { ...t, dte_count: count || 0 };
    }));

    res.json({ ok: true, tenants: enriched });
  } catch (err) {
    logger.error({ err }, 'Error listando tenants');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/pos/tenants ────────────────────────────────────
tenantsRouter.post('/', async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }
  try {
    const { name, rut, legal_name, plan_id, email, phone } = req.body;
    const { data, error } = await supabase
      .from('tenants')
      .insert({
        name, rut: rut || '', legal_name: legal_name || name,
        plan_id: plan_id || 'basic', status: 'trial', active: true,
        mrr: 0, email: email || '', phone: phone || '',
        settings: {},
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ ok: true, tenant: data });
  } catch (err) {
    logger.error({ err }, 'Error creando tenant');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

// ── PUT /api/pos/tenants/:id ─────────────────────────────────
tenantsRouter.put('/:id', async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }
  try {
    const { data, error } = await supabase
      .from('tenants')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, tenant: data });
  } catch (err) {
    logger.error({ err }, 'Error actualizando tenant');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});
