// server/services/db.js
// ═══════════════════════════════════════════════════════════════
// Cliente Supabase — único punto de acceso a la BD.
// Usa service_role key para acceso completo desde el servidor.
// NUNCA exponer esta key al frontend.
// ═══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { config }       from '../config/index.js';
import logger           from '../middleware/logger.js';
import { config } from '../config/index.js';

// ── Validar que las variables están configuradas ──────────────
if (!config.supabase?.url || !config.supabase?.serviceKey) {
  logger.warn('Supabase no configurado — BD desactivada. Agrega SUPABASE_URL y SUPABASE_SERVICE_KEY.');
}

// ── Cliente singleton ─────────────────────────────────────────
export const supabase = config.supabase?.url
  ? createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false },
    })
  : null;

// ── Helper para guardar un DTE emitido ───────────────────────
export async function saveDocument({ tenantId, saleId, terminalId, koyweResponse, posPayload }) {
  if (!supabase) return null;
   logger.info({ 
    supabaseUrl: config.supabase?.url ? 'OK' : 'FALTA',
    supabaseKey: config.supabase?.serviceKey ? 'OK' : 'FALTA',
    supabaseClient: supabase ? 'inicializado' : 'NULL',
  }, 'Intentando guardar DTE en BD');

  try {
    const header = koyweResponse.header ?? {};
    const totals = koyweResponse.totals ?? {};
    const elDoc  = koyweResponse.electronic_document ?? {};

    const { data, error } = await supabase
      .from('documents')
      .insert({
        tenant_id:          tenantId,
        sale_id:            saleId     ?? null,
        terminal_id:        terminalId ?? null,
        koywe_document_id:  koyweResponse.document_id ?? null,
        doc_number:         String(header.document_number ?? ''),
        type:               String(header.document_type_id ?? '37'),
        total:              Math.round(Number(totals.total_amount)  || 0),
        net_amount:         Math.round(Number(totals.net_amount)    || 0),
        tax_amount:         Math.round(Number(totals.taxes_amount)  || 0),
        status:             koyweResponse.result?.status === 0 ? 'ok' : 'pending',
        sii_status:         String(koyweResponse.result?.status ?? ''),
        sii_message:        koyweResponse.result?.error_message ?? null,
        receiver_rut:       header.receiver_tax_id_code ?? null,
        receiver_name:      header.receiver_legal_name  ?? null,
        receiver_activity:  header.receiver_activity    ?? null,
        receiver_address:   header.receiver_address     ?? null,
        receiver_district:  header.receiver_district    ?? null,
        receiver_city:      header.receiver_city        ?? null,
        pos_sale_id:        posPayload?.pos_sale_id     ?? null,
        xml_base64:         elDoc.document_xml          ?? null,
        pdf_base64:         elDoc.document_pdf          ?? null,
        raw_response:       koyweResponse,
        issued_at:          new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Error al guardar documento en BD');
      return null;
    }

    logger.info({ document_id: data.id, koywe_id: koyweResponse.document_id }, 'DTE guardado en BD');
    return data;

  } catch (err) {
    logger.error({ 
      err: err.message,
      stack: err.stack,
      supabaseUrl: config.supabase?.url ? 'configurado' : 'FALTA',
      supabaseKey: config.supabase?.serviceKey ? 'configurado' : 'FALTA',
    }, 'Error inesperado al guardar documento');
    return null;
  }
}

// ── Helper para buscar tenant por API key ─────────────────────
export async function getTenantByApiKey(keyHash) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('api_keys')
    .select('tenant_id, scope, active, tenants(*)')
    .eq('key_hash', keyHash)
    .eq('active', true)
    .single();

  if (error || !data) return null;
  return data;
}

// ── Helper para listar documentos de un tenant ────────────────
export async function getDocuments(tenantId, { limit = 50, offset = 0 } = {}) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('documents')
    .select('id, doc_number, type, total, net_amount, tax_amount, status, receiver_rut, receiver_name, pos_sale_id, issued_at')
    .eq('tenant_id', tenantId)
    .order('issued_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error({ error }, 'Error al listar documentos');
    return [];
  }

  return data;
}
