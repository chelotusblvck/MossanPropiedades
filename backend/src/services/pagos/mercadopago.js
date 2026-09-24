// Mercado Pago Checkout Pro: el pago llega a la cuenta Mercado Pago / Mercado Libre de la corredora.
// https://www.mercadopago.cl/developers/es/reference
import { config } from '../../config.js';

const API = 'https://api.mercadopago.com';

export class MercadoPagoError extends Error {
  constructor(message, status, detalle) {
    super(message);
    this.status = status;
    this.detalle = detalle;
  }
}

export const mercadoPagoDisponible = () => Boolean(config.pagos.mercadopago.accessToken);
export const mercadoPagoEnPruebas = () => config.pagos.mercadopago.accessToken.startsWith('TEST-');

async function llamar(metodo, ruta, body) {
  if (!mercadoPagoDisponible()) throw new MercadoPagoError('Mercado Pago no está configurado', 503);
  const res = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${config.pagos.mercadopago.accessToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new MercadoPagoError(`Mercado Pago respondió ${res.status}: ${data.message ?? ''}`, 502, data);
  return data;
}

/**
 * Crea una preferencia de pago (Checkout Pro). external_reference identifica nuestro registro de pago.
 * Mercado Pago sólo acepta notification_url / auto_return con URLs públicas HTTPS.
 */
export function crearPreferencia({ pagoId, titulo, monto, cliente, urlRetorno, urlNotificacion }) {
  const publica = urlRetorno.startsWith('https://');
  return llamar('POST', '/checkout/preferences', {
    items: [{ id: `pago-${pagoId}`, title: titulo.slice(0, 250), quantity: 1, unit_price: monto, currency_id: 'CLP' }],
    payer: { name: cliente.nombre, email: cliente.email },
    external_reference: `pago-${pagoId}`,
    back_urls: { success: urlRetorno, failure: urlRetorno, pending: urlRetorno },
    ...(publica ? { auto_return: 'approved', notification_url: urlNotificacion } : {}),
    statement_descriptor: config.marca.nombre.slice(0, 22),
    payment_methods: { installments: 1 },
  });
}

/** Consulta un pago directamente a la API (nunca se confía en los parámetros de la URL). */
export function obtenerPago(paymentId) {
  return llamar('GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
}

export const resumenPago = (p) => ({
  payment_id: p.id,
  status: p.status,
  status_detail: p.status_detail,
  payment_method_id: p.payment_method_id,
  payment_type_id: p.payment_type_id,
  transaction_amount: p.transaction_amount,
  currency_id: p.currency_id,
  date_approved: p.date_approved,
});
