// server/routes/products.js
// ═══════════════════════════════════════════════════════════════
// CRUD de productos y categorías para QuickPOS.
// Todas las rutas requieren JWT (tenant aislado automáticamente).
// Soporta delta sync: GET /products?since=ISO_DATE
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { supabase } from '../services/db.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import logger from '../middleware/logger.js';

export const productsRouter = Router();

// Todas las rutas requieren auth
productsRouter.use(jwtAuth);

// ── GET /api/pos/products ────────────────────────────────────
// ?since=ISO_DATE  → solo productos modificados después de esa fecha
// ?status=active   → filtrar por status (default: todos)
productsRouter.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('products')
      .select('id, category_id, name, description, sku, emoji, price, cost, tax_type, tag, track_stock, stock, stock_alert, featured, status, sort_order, metadata, updated_at')
      .eq('tenant_id', req.user.tenant_id)
      .order('sort_order', { ascending: true });

    if (req.query.since) {
      query = query.gte('updated_at', req.query.since);
    }
    if (req.query.status) {
      query = query.eq('status', req.query.status);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ ok: true, products: data, server_ts: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, 'Error listando productos');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/pos/products ───────────────────────────────────
productsRouter.post('/', async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'Solo admin puede crear productos.' });
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .insert({ ...req.body, tenant_id: req.user.tenant_id })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ ok: true, product: data });
  } catch (err) {
    logger.error({ err }, 'Error creando producto');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

// ── PUT /api/pos/products/:id ────────────────────────────────
productsRouter.put('/:id', async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.user.tenant_id)
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, product: data });
  } catch (err) {
    logger.error({ err }, 'Error actualizando producto');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/pos/categories ──────────────────────────────────
productsRouter.get('/categories', async (req, res) => {
  try {
    let query = supabase
      .from('categories')
      .select('id, name, emoji, sort_order, active, created_at')
      .eq('tenant_id', req.user.tenant_id)
      .order('sort_order', { ascending: true });

    if (req.query.since) {
      // categories no tiene updated_at, usar created_at como fallback
      query = query.gte('created_at', req.query.since);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ ok: true, categories: data, server_ts: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, 'Error listando categorías');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/pos/categories ─────────────────────────────────
productsRouter.post('/categories', async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
    return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
  }

  try {
    const { data, error } = await supabase
      .from('categories')
      .insert({ ...req.body, tenant_id: req.user.tenant_id })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ ok: true, category: data });
  } catch (err) {
    logger.error({ err }, 'Error creando categoría');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});
