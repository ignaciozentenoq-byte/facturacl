// server/validators/rut.js
// ═══════════════════════════════════════════════════════════════
// Utilidades para RUT chileno.
// Compartidas entre servidor (validación Zod) y cliente (UI).
// ═══════════════════════════════════════════════════════════════

/**
 * Limpia un RUT: quita puntos, espacios y normaliza a mayúsculas.
 * Entrada:  "76.399.932-7" | "76399932-7" | " 76399932 7 "
 * Salida:   "76399932-7"
 */
export function cleanRut(rut) {
  return String(rut ?? '')
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Formatea un RUT asegurando el guion correcto.
 * Entrada:  "763999327"
 * Salida:   "76399932-7"
 */
export function formatRut(rut) {
  rut = cleanRut(rut);
  if (!rut) return '';
  if (!rut.includes('-') && rut.length > 1) {
    rut = rut.slice(0, -1) + '-' + rut.slice(-1);
  }
  return rut;
}

/**
 * Valida el dígito verificador de un RUT chileno.
 * @param   {string} rut - Puede estar con o sin puntos
 * @returns {boolean}
 */
export function isValidRut(rut) {
  const clean = formatRut(rut);

  // Formato básico: dígitos-[dígito|K]
  if (!/^[0-9]+-[0-9K]$/.test(clean)) return false;

  const [body, dv] = clean.split('-');

  // Cuerpo debe tener al menos 1 dígito
  if (!body || body.length === 0) return false;

  // Módulo 11
  let sum        = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum        += parseInt(body[i], 10) * multiplier;
    multiplier  = multiplier === 7 ? 2 : multiplier + 1;
  }

  const mod      = 11 - (sum % 11);
  const expected = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod);

  return dv === expected;
}
