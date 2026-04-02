// server/routes/sales.js
// ═══════════════════════════════════════════════════════════════
// Registro de ventas para QuickPOS.
// POST /  → registrar venta (con items)
// GET  /  → listar ventas (con paginación y filtros)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { supabase } from '../services/db.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import logger from '../middleware/logger.js';

export const salesRouter = Router();

salesRouter.use(jwtAuth);

// ── POST /api/pos/sales ─────────────────────────────────────
// Registra una venta completa con sus items.
// Idempotente: si pos_sale_ref ya existe, retorna la existente.
salesRouter.post('/', async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const {
      pos_sale_ref,
      items,
      subtotal,
      discount_type,
      discount_value,
      discount_amount,
      net_amount,
      tax_amount,
      total,
      payment_method,
      notes,
      table_number,
      terminal_id,
      user_id,
      created_at,
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ ok: false, error: 'MISSING_ITEMS', message: 'Se requiere al menos un item' });
    }
    if (!total) {
      return res.status(400).json({ ok: false, error: 'MISSING_TOTAL', message: 'Total es obligatorio' });
    }

    // Idempotencia: si ya existe una venta con este pos_sale_ref, retornarla
    if (pos_sale_ref) {
      const { data: existing } = await supabase
        .from('sales')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('pos_sale_ref', pos_sale_ref)
        .maybeSingle();

      if (existing) {
        return res.status(200).json({ ok: true, sale_id: existing.id, idempotent: true });
      }
    }

    // Insertar venta
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({
        tenant_id:       tenantId,
        pos_sale_ref:    pos_sale_ref || null,
        terminal_id:     terminal_id || null,
        user_id:         user_id || req.user.id,
        subtotal:        subtotal || 0,
        discount_type:   discount_type || null,
        discount_value:  discount_value || 0,
        discount_amount: discount_amount || 0,
        net_amount:      net_amount || 0,
        tax_amount:      tax_amount || 0,
        total:           total,
        payment_status:  'completed',
        delivery_status: 'none',
        notes:           notes || null,
        table_number:    table_number || null,
        metadata:        { payment_method: payment_method || 'efectivo' },
        created_at:      created_at || new Date().toISOString(),
      })
      .select('id')
      .single();

    if (saleErr) {
      logger.error({ err: saleErr.message }, 'Error al guardar venta');
      return res.status(500).json({ ok: false, error: 'DB_ERROR', message: saleErr.message });
    }

    // Insertar items
    const saleItems = items.map(item => ({
      sale_id:    sale.id,
      tenant_id:  tenantId,
      product_id: item.product_id || null,
      name:       item.name,
      quantity:   item.qty || item.quantity || 1,
      unit_price: item.price || item.unit_price || 0,
      discount:   item.discount || 0,
      total:      (item.qty || item.quantity || 1) * (item.price || item.unit_price || 0),
    }));

    const { error: itemsErr } = await supabase
      .from('sale_items')
      .insert(saleItems);

    if (itemsErr) {
      logger.warn({ err: itemsErr.message, sale_id: sale.id }, 'Error al guardar items (venta sí guardada)');
    }

    logger.info({ sale_id: sale.id, items: items.length, total }, 'Venta registrada');
    res.status(201).json({ ok: true, sale_id: sale.id });

  } catch (err) {
    logger.error({ err: err.message }, 'Error inesperado en POST /sales');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/pos/sales ──────────────────────────────────────
// ?limit=50&offset=0  → paginación
// ?since=ISO_DATE     → ventas desde esa fecha
// ?date=YYYY-MM-DD    → ventas de un día específico
salesRouter.get('/', async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    let query = supabase
      .from('sales')
      .select('id, pos_sale_ref, subtotal, discount_amount, net_amount, tax_amount, total, payment_status, dte_status, notes, table_number, metadata, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.query.since) {
      query = query.gte('created_at', req.query.since);
    }
    if (req.query.date) {
      const dayStart = req.query.date + 'T00:00:00.000Z';
      const dayEnd   = req.query.date + 'T23:59:59.999Z';
      query = query.gte('created_at', dayStart).lte('created_at', dayEnd);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error({ err: error.message }, 'Error al listar ventas');
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }

    res.json({ ok: true, sales: data, total: count });

  } catch (err) {
    logger.error({ err: err.message }, 'Error inesperado en GET /sales');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/pos/sales/:id ──────────────────────────────────
// Detalle de una venta con sus items
salesRouter.get('/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;

    const { data: sale, error } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('id', req.params.id)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !sale) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    }

    res.json({ ok: true, sale });

  } catch (err) {
    logger.error({ err: err.message }, 'Error en GET /sales/:id');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
});
