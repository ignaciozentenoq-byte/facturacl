// server/services/emissionWorker.js
// ═══════════════════════════════════════════════════════════════
// Worker de emisión de DTEs con cola de reintentos.
// Se ejecuta cada 2 minutos y reintenta los documentos pendientes.
// Soporta hasta 5 intentos con backoff exponencial.
// ═══════════════════════════════════════════════════════════════

import { supabase, saveDocument } from './db.js';
import { createDocument }         from './koyweClient.js';
import logger                     from '../middleware/logger.js';

const WORKER_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
const MAX_ATTEMPTS       = 5;

// ── Agregar a la cola ─────────────────────────────────────────

export async function enqueueDocument({ tenantId, saleId, terminalId, payload, posPayload }) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('emission_queue')
      .insert({
        tenant_id:      tenantId   ?? null,
        sale_id:        saleId     ?? null,
        terminal_id:    terminalId ?? null,
        payload:        payload,
        pos_sale_id:    posPayload?.pos_sale_id ?? null,
        status:         'pending',
        next_attempt_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error({ error: error.message }, 'Error agregando a cola de emisión');
      return null;
    }

    logger.info({ queue_id: data.id, pos_sale_id: posPayload?.pos_sale_id }, 'DTE agregado a cola');
    return data;
  } catch (err) {
    logger.error({ err: err.message }, 'Error inesperado en enqueue');
    return null;
  }
}

// ── Procesar cola ─────────────────────────────────────────────

async function processQueue() {
  if (!supabase) return;

  try {
    // Obtener items pendientes listos para reintentar
    const { data: items, error } = await supabase
      .from('emission_queue')
      .select('*')
      .in('status', ['pending'])
      .lte('next_attempt_at', new Date().toISOString())
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      logger.error({ error: error.message }, 'Error leyendo cola de emisión');
      return;
    }

    if (!items?.length) return;

    logger.info({ count: items.length }, 'Worker: procesando cola de emisión');

    for (const item of items) {
      await processItem(item);
    }

  } catch (err) {
    logger.error({ err: err.message }, 'Error inesperado en worker');
  }
}

async function processItem(item) {
  // Marcar como processing
  await supabase
    .from('emission_queue')
    .update({
      status:          'processing',
      attempts:        item.attempts + 1,
      last_attempt_at: new Date().toISOString(),
    })
    .eq('id', item.id);

  try {
    const data = await createDocument(item.payload);

    // Éxito — guardar documento y marcar como ok
    const doc = await saveDocument({
      tenantId:      item.tenant_id,
      saleId:        item.sale_id,
      terminalId:    item.terminal_id,
      koyweResponse: data,
      posPayload:    { pos_sale_id: item.pos_sale_id },
    });

    await supabase
      .from('emission_queue')
      .update({
        status:      'ok',
        document_id: doc?.id ?? null,
        updated_at:  new Date().toISOString(),
      })
      .eq('id', item.id);

    logger.info({
      queue_id:    item.id,
      document_id: doc?.id,
      pos_sale_id: item.pos_sale_id,
    }, 'Worker: DTE emitido correctamente');

  } catch (err) {
    const attempts      = item.attempts + 1;
    const failed        = attempts >= MAX_ATTEMPTS;
    // Backoff exponencial: 2min, 4min, 8min, 16min, 32min
    const nextMinutes   = Math.pow(2, attempts) * 1;
    const nextAttemptAt = new Date(Date.now() + nextMinutes * 60 * 1000).toISOString();

    await supabase
      .from('emission_queue')
      .update({
        status:          failed ? 'failed' : 'pending',
        error_message:   err.message,
        next_attempt_at: nextAttemptAt,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', item.id);

    logger.warn({
      queue_id:    item.id,
      attempts,
      failed,
      next:        nextAttemptAt,
      error:       err.message,
    }, `Worker: fallo en emisión (intento ${attempts}/${MAX_ATTEMPTS})`);
  }
}

// ── Iniciar worker ────────────────────────────────────────────

export function startEmissionWorker() {
  if (!supabase) {
    logger.warn('Worker de emisión desactivado — Supabase no configurado');
    return;
  }

  logger.info('Worker de emisión iniciado — intervalo: 2 minutos');

  // Ejecutar inmediatamente al iniciar
  processQueue();

  // Luego cada 2 minutos
  setInterval(processQueue, WORKER_INTERVAL_MS);
}
