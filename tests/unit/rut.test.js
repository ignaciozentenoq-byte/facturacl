// tests/unit/rut.test.js
import { describe, it, expect } from 'vitest';
import { cleanRut, formatRut, isValidRut } from '../../server/validators/rut.js';

describe('cleanRut', () => {
  it('quita puntos y espacios', () => {
    expect(cleanRut('76.399.932-7')).toBe('76399932-7');
    expect(cleanRut(' 76 399 932 7 ')).toBe('76399932-7');
  });
  it('normaliza a mayúsculas', () => {
    expect(cleanRut('12345678-k')).toBe('12345678-K');
  });
});

describe('formatRut', () => {
  it('agrega guion si no tiene', () => {
    expect(formatRut('763999327')).toBe('76399932-7');
  });
  it('deja el guion si ya existe', () => {
    expect(formatRut('76399932-7')).toBe('76399932-7');
  });
});

describe('isValidRut', () => {
  it('valida RUTs correctos', () => {
    expect(isValidRut('76399932-7')).toBe(true);
    expect(isValidRut('76.399.932-7')).toBe(true);
    expect(isValidRut('5126663-3')).toBe(true);
    expect(isValidRut('66666666-6')).toBe(true);
  });
  it('rechaza RUTs con DV incorrecto', () => {
    expect(isValidRut('76399932-1')).toBe(false);
    expect(isValidRut('76399932-0')).toBe(false);
  });
  it('rechaza formatos inválidos', () => {
    expect(isValidRut('')).toBe(false);
    expect(isValidRut('abc')).toBe(false);
    expect(isValidRut('1234')).toBe(false);
  });
  it('acepta dígito verificador K', () => {
    // Construir un RUT con DV=K
    // RUT 14.602.789-K es un RUT chileno válido con DV=K
    expect(isValidRut('14602789-K')).toBe(true);
    expect(isValidRut('14602789-k')).toBe(true); // lowercase también
  });
});
