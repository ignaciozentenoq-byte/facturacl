// server/services/emissionWorker.js
// ═══════════════════════════════════════════════════════════════
// Worker de emisión de DTEs con cola de reintentos robusta.
// Estados: pending → processing → emitted | failed | permanent_error
// Backoff progresivo: 30s → 1min → 5min → 15min → 30min
// Auditoría completa: request, response, error_code, error_detail
// ═══════════════════════════════════════════════════════════════

import { supabase, saveDocument } from './db.js';
import { createDocument }         from './koyweClient.js';
import logger                     from '../middleware/logger.js';

const WORKER_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
const MAX_ATTEMPTS       = 5;
let   _workerRunning     = false; // lock global de concurrencia

// Backoff progresivo en minutos por intento (3j)
const BACKOFF_MINUTES = [0.5, 1, 5, 15, 30];

// Errores permanentes — no reintentar (3k)
const PERMANENT_ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_RUT',
  'INVALID_PAYLOAD',
  'SCHEMA_ERROR',
];

// ── Determinar si el error es transitorio o permanente ────────
function isPermanentError(err) {
  const msg = err.message?.toLowerCase() ?? '';
  if (PERMANENT_ERROR_CODES.includes(err.code)) return true;
  if (msg.includes('rut inválido'))   return true;
  if (msg.includes('validation'))     return true;
  if (msg.includes('schema'))         return true;
  if (msg.includes('required field')) return true;
  // 4xx excepto 429 (rate limit) son permanentes
  if (err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 429) return true;
  return false;
}

// ── Agregar a la cola ─────────────────────────────────────────
export async function enqueueDocument({ tenantId, saleId, terminalId, payload, posPayload }) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('emission_queue')
      .insert({
        tenant_id:       tenantId   ?? null,
        sale_id:         saleId     ?? null,
        terminal_id:     terminalId ?? null,
        payload:         payload,
        request_payload: payload,   // auditoría (1g)
        pos_sale_id:     posPayload?.pos_sale_id ?? null,
        status:          'pending',
        attempts:        0,
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

  // Lock global — evitar concurrencia (3b)
  if (_workerRunning) {
    logger.debug('Worker: ya en ejecución, saltando ciclo');
    return;
  }
  _workerRunning = true;

  try {
    const now = new Date().toISOString();
    const { data: items, error } = await supabase
      .from('emission_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('next_attempt_at', now)
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(10);

    if (error) {
      logger.error({ error: error.message }, 'Error leyendo cola de emisión');
      return;
    }

    if (!items?.length) return;

    logger.info({ count: items.length }, 'Worker: procesando cola de emisión');

    // Procesar uno por uno (3c)
    for (const item of items) {
      await processItem(item);
    }

  } catch (err) {
    logger.error({ err: err.message }, 'Error inesperado en worker');
  } finally {
    _workerRunning = false; // siempre liberar lock
  }
}

// ── Procesar un item de la cola ───────────────────────────────
async function processItem(item) {
  const attempts = item.attempts + 1;
  const startedAt = new Date().toISOString();

  // Marcar como processing + lock por venta (3d)
  await supabase
    .from('emission_queue')
    .update({
      status:          'processing',
      attempts,
      last_attempt_at: startedAt,
      updated_at:      startedAt,
    })
    .eq('id', item.id);

  try {
    const data = await createDocument(item.payload);

    // Éxito — guardar documento en BD
    const doc = await saveDocument({
      tenantId:      item.tenant_id,
      saleId:        item.sale_id,
      terminalId:    item.terminal_id,
      koyweResponse: data,
      posPayload:    { pos_sale_id: item.pos_sale_id },
    });

    // Marcar como emitted con auditoría completa (1f, 1g)
    await supabase
      .from('emission_queue')
      .update({
        status:           'emitted',
        document_id:      doc?.id ?? null,
        response_payload: data,
        emitted_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .eq('id', item.id);

    logger.info({
      queue_id:    item.id,
      document_id: doc?.id,
      pos_sale_id: item.pos_sale_id,
      attempts,
    }, 'Worker: DTE emitido correctamente');

  } catch (err) {
    const permanent = isPermanentError(err); // (3k)

    // Backoff progresivo (3j)
    const backoffMin    = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
    const nextAttemptAt = new Date(Date.now() + backoffMin * 60 * 1000).toISOString();
    const finalFailed   = attempts >= MAX_ATTEMPTS || permanent;

    // Auditoría completa del error (1g)
    await supabase
      .from('emission_queue')
      .update({
        status:          finalFailed ? (permanent ? 'permanent_error' : 'failed') : 'pending',
        error_detail:    err.message,
        error_code:      err.code ?? err.statusCode?.toString() ?? 'UNKNOWN',
        next_attempt_at: nextAttemptAt,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', item.id);

    logger.warn({
      queue_id:    item.id,
      pos_sale_id: item.pos_sale_id,
      attempts,
      max:         MAX_ATTEMPTS,
      permanent,
      finalFailed,
      next:        nextAttemptAt,
      error:       err.message,
      code:        err.code,
    }, `Worker: fallo en emisión (intento ${attempts}/${MAX_ATTEMPTS})${permanent ? ' — error permanente' : ''}`);
  }
}

// ── Recuperar locks huérfanos al iniciar (3l) ─────────────────
async function recoverOrphanLocks() {
  if (!supabase) return;
  // Si quedaron en 'processing' de una sesión anterior, resetear a 'pending'
  const { data, error } = await supabase
    .from('emission_queue')
    .update({
      status:     'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'processing')
    .select('id');

  if (!error && data?.length) {
    logger.warn({ count: data.length }, 'Worker: locks huérfanos recuperados → pending');
  }
}

// ── Iniciar worker ────────────────────────────────────────────
export function startEmissionWorker() {
  if (!supabase) {
    logger.warn('Worker de emisión desactivado — Supabase no configurado');
    return;
  }

  logger.info('Worker de emisión iniciado — intervalo: 2 minutos, backoff progresivo');

  // Recuperar locks huérfanos de sesiones anteriores (3l)
  recoverOrphanLocks();

  // Ejecutar inmediatamente al iniciar
  processQueue();

  // Luego cada 2 minutos
  setInterval(processQueue, WORKER_INTERVAL_MS);
}
