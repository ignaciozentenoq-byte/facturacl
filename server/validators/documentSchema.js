// server/validators/documentSchema.js
// ═══════════════════════════════════════════════════════════════
// Schemas Zod para validar documentos DTE antes de enviarlos
// a Koywe. Cubre boletas (37/41), facturas (2/32) y NC (16).
//
// Principios:
//   • Validación en servidor — nunca confiar solo en el cliente
//   • Mensajes de error en español, accionables
//   • Cuadratura tributaria verificada ($5 tolerancia por redondeo)
//   • RUT validado con módulo 11
//   • account_id SIEMPRE viene del servidor, nunca del payload
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { isValidRut, formatRut } from './rut.js';

// ── Tipos de documento soportados ────────────────────────────

export const DOC_TYPES = {
  FACTURA_ELECTRONICA: '2',
  NOTA_CREDITO:        '16',
  BOLETA_ELECTRONICA:  '37',
  BOLETA_EXENTA:       '41',
  // Podría incluirse '32' (factura exenta) en el futuro
};

const VALID_DOC_TYPES = Object.values(DOC_TYPES);

/** Tipos que requieren datos del receptor */
const REQUIRES_RECEIVER = [DOC_TYPES.FACTURA_ELECTRONICA, DOC_TYPES.NOTA_CREDITO];

/** Tipos exentos de IVA */
const EXEMPT_TYPES = [DOC_TYPES.BOLETA_EXENTA];

// ── Zod custom types ─────────────────────────────────────────

const RutField = z
  .string({ required_error: 'El RUT es requerido' })
  .min(1, 'El RUT no puede estar vacío')
  .transform(formatRut)
  .refine(isValidRut, { message: 'RUT inválido (dígito verificador incorrecto)' });

const PositiveInt = z
  .number()
  .int('La cantidad debe ser un número entero')
  .positive('La cantidad debe ser mayor a 0');

const NonNegativeAmount = z
  .number()
  .nonnegative('El monto no puede ser negativo');

const PositiveAmount = z
  .number()
  .positive('El monto debe ser mayor a 0');

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe estar en formato YYYY-MM-DD');

// ── Detail (ítem de línea) ────────────────────────────────────

export const DetailSchema = z.object({
  quantity:          PositiveInt,
  line_description:  z.string().min(1, 'La descripción es requerida').max(200, 'Máximo 200 caracteres'),
  unit_measure:      z.string().default('UN'),
  unit_price:        NonNegativeAmount,
  total_amount_line: NonNegativeAmount,
  total_taxes:       NonNegativeAmount.optional().default(0),
  taxes: z.array(z.object({
    tax_type_id:    z.string(),
    tax_percentage: z.number().min(0).max(100),
    tax_amount:     NonNegativeAmount,
  })).optional(),
});

// ── Reference (para nota de crédito) ─────────────────────────

export const ReferenceSchema = z.object({
  document_type_id: z.number().int().positive(),
  reference_number: z.string().min(1),
  reference_code:   z.number().int().default(1),
  description:      z.string().min(1).default('Anulacion'),
  reference_date:   IsoDate,
});

// ── Header del DTE ────────────────────────────────────────────

export const HeaderSchema = z.object({
  // Tipo de documento
  document_type_id:    z.enum(VALID_DOC_TYPES, {
    errorMap: () => ({ message: `Tipo de documento inválido. Valores: ${VALID_DOC_TYPES.join(', ')}` }),
  }),

  // Siempre emisión
  received_issued_flag: z.literal(1).default(1),

  // Fecha
  issue_date: IsoDate,

  // Emisor
  issuer_tax_id_code:  RutField,
  issuer_tax_id_type:  z.string().default('CL-RUT'),
  issuer_legal_name:   z.string().min(1, 'La razón social del emisor es requerida'),
  issuer_address:      z.string().optional(),
  issuer_district:     z.string().optional(),
  issuer_city:         z.string().optional(),
  issuer_country_id:   z.string().default('253'),
  issuer_activity:     z.string().optional(),

  // Receptor (opcionales en schema; se requieren por superRefine)
  receiver_tax_id_code: RutField.optional(),
  receiver_tax_id_type: z.string().default('CL-RUT').optional(),
  receiver_legal_name:  z.string().optional(),
  receiver_address:     z.string().optional(),
  receiver_district:    z.string().optional(),
  receiver_city:        z.string().optional(),
  receiver_country_id:  z.string().default('253').optional(),
  receiver_activity:    z.string().optional(),

  // Pago y moneda
  payment_conditions:  z.string().optional().default('0'),
  currency_id:         z.literal(39).default(39),
}).passthrough(); // Koywe puede requerir campos adicionales

// ── Totales ───────────────────────────────────────────────────

export const TotalsSchema = z.object({
  net_amount:   NonNegativeAmount,
  taxes_amount: NonNegativeAmount,
  total_amount: PositiveAmount,
});

// ── Documento completo ────────────────────────────────────────

export const DocumentSchema = z
  .object({
    header:     HeaderSchema,
    details:    z.array(DetailSchema).min(1, 'Se requiere al menos un ítem'),
    totals:     TotalsSchema,
    references: z.array(ReferenceSchema).optional(),
  })
  .superRefine((doc, ctx) => {
    const type = doc.header.document_type_id;

    // ── Receptor requerido para facturas y NC ────────────────
    if (REQUIRES_RECEIVER.includes(type)) {
      if (!doc.header.receiver_tax_id_code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['header', 'receiver_tax_id_code'],
          message: 'El RUT del receptor es requerido para facturas y notas de crédito',
        });
      }
      if (!doc.header.receiver_legal_name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['header', 'receiver_legal_name'],
          message: 'La razón social del receptor es requerida para facturas y notas de crédito',
        });
      }
    }

    // ── Cuadratura tributaria ────────────────────────────────
    // Para tipos exentos no hay IVA — taxes_amount debe ser 0
    if (EXEMPT_TYPES.includes(type) && doc.totals.taxes_amount !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['totals', 'taxes_amount'],
        message: 'Los tipos exentos no deben incluir impuestos',
      });
    }

    // neto + iva ≈ total (tolerancia $5 por redondeo de enteros)
    const computed = Math.round(doc.totals.net_amount) + Math.round(doc.totals.taxes_amount);
    const declared = Math.round(doc.totals.total_amount);
    if (Math.abs(computed - declared) > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['totals'],
        message: `Los totales no cuadran: neto(${doc.totals.net_amount}) + iva(${doc.totals.taxes_amount}) = ${computed}, pero total declarado es ${declared}`,
      });
    }
  });

// ── Schema simplificado para QuickPOS (modo caja) ────────────
// La caja envía los datos mínimos; el servidor completa el resto
// con los datos del emisor y construye el documento completo.

export const PosDocumentSchema = z.object({
  // Tipo: solo boleta (37) o factura (2) desde caja
  document_type: z.enum(['37', '2'], {
    errorMap: () => ({ message: 'La caja solo puede emitir boletas (37) o facturas (2)' }),
  }),

  // Ítems de la venta
  items: z.array(z.object({
    description: z.string().min(1, 'La descripción es requerida').max(200),
    quantity:    PositiveInt,
    unit_price:  PositiveAmount,
  })).min(1, 'Se requiere al menos un ítem'),

  // Receptor (solo requerido si document_type = '2')
  receiver: z.object({
    rut:      RutField,
    name:     z.string().min(1),
    giro:     z.string().min(1),
    address:  z.string().optional(),
    district: z.string().optional(),
    city:     z.string().optional(),
  }).optional(),

  // Metadata opcional para trazabilidad
  pos_sale_id:   z.string().optional(), // ID de venta en QuickPOS
  pos_terminal:  z.string().optional(), // ID del terminal/caja
}).superRefine((doc, ctx) => {
  if (doc.document_type === '2' && !doc.receiver) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['receiver'],
      message: 'Los datos del receptor son requeridos para emitir una factura',
    });
  }
});
