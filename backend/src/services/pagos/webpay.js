// Webpay Plus (Transbank) vía API REST v1.2
// https://www.transbankdevelopers.cl/referencia/webpay
import { config } from '../../config.js';

// Credenciales públicas del ambiente de integración (publicadas por Transbank para pruebas)
const INTEGRACION = {
  url: 'https://webpay3gint.transbank.cl',
  codigoComercio: '597055555532',
  apiKey: '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C',
};
const PRODUCCION_URL = 'https://webpay3g.transbank.cl';
const RUTA = '/rswebpaytransaction/api/webpay/v1.2/transactions';

export class WebpayError extends Error {
  constructor(message, status, detalle) {
    super(message);
    this.status = status;
    this.detalle = detalle;
  }
}

function credenciales() {
  const { ambiente, codigoComercio, apiKey } = config.pagos.webpay;
  if (ambiente === 'integracion') return INTEGRACION;
  if (ambiente === 'produccion' && codigoComercio && apiKey) return { url: PRODUCCION_URL, codigoComercio, apiKey };
  return null;
}

export const webpayDisponible = () => Boolean(credenciales());
export const webpayEnPruebas = () => config.pagos.webpay.ambiente === 'integracion';

async function llamar(metodo, ruta, body) {
  const c = credenciales();
  if (!c) throw new WebpayError('Webpay no está configurado', 503);
  const res = await fetch(`${c.url}${RUTA}${ruta}`, {
    method: metodo,
    headers: {
      'Tbk-Api-Key-Id': c.codigoComercio,
      'Tbk-Api-Key-Secret': c.apiKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new WebpayError(`Webpay respondió ${res.status}: ${data.error_message ?? ''}`, 502, data);
  return data;
}

/** Crea la transacción. Devuelve { token, url } para redirigir al cliente (POST con token_ws). */
export function crearTransaccion({ ordenCompra, sesion, monto, urlRetorno }) {
  return llamar('POST', '', { buy_order: ordenCompra, session_id: sesion, amount: monto, return_url: urlRetorno });
}

/** Confirma (commit) la transacción al volver el cliente. Sólo aquí se concreta el cobro. */
export function confirmarTransaccion(token) {
  return llamar('PUT', `/${encodeURIComponent(token)}`);
}

export function estadoTransaccion(token) {
  return llamar('GET', `/${encodeURIComponent(token)}`);
}

export const esAprobada = (r) => r?.response_code === 0 && r?.status === 'AUTHORIZED';

/** Datos de la respuesta que se guardan (sin datos sensibles: sólo los 4 últimos dígitos). */
export const resumenRespuesta = (r) => ({
  status: r.status,
  response_code: r.response_code,
  authorization_code: r.authorization_code,
  payment_type_code: r.payment_type_code,
  installments_number: r.installments_number,
  card_last4: r.card_detail?.card_number,
  transaction_date: r.transaction_date,
  amount: r.amount,
  buy_order: r.buy_order,
});
