// src/lib/rut.js
// Misma lógica que server/validators/rut.js — reutilizable en cliente

export function cleanRut(rut) {
  return String(rut ?? '').replace(/\./g, '').replace(/\s+/g, '').toUpperCase().trim();
}

export function formatRut(rut) {
  rut = cleanRut(rut);
  if (!rut) return '';
  if (!rut.includes('-') && rut.length > 1) {
    rut = rut.slice(0, -1) + '-' + rut.slice(-1);
  }
  return rut;
}

export function isValidRut(rut) {
  const clean = formatRut(rut);
  if (!/^[0-9]+-[0-9K]$/.test(clean)) return false;
  const [body, dv] = clean.split('-');
  if (!body) return false;
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul  = mul === 7 ? 2 : mul + 1;
  }
  const mod      = 11 - (sum % 11);
  const expected = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod);
  return dv === expected;
}
