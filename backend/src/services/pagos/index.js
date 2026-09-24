import { config } from '../../config.js';
import * as Reserva from '../../models/reserva.js';
import * as Propiedad from '../../models/propiedad.js';
import * as Pago from '../../models/pago.js';
import { hoyChile } from '../../lib/fechas.js';
import * as Webpay from './webpay.js';
import * as MP from './mercadopago.js';
import {
  notificarCambioEstado, notificarPagoRecibido, notificarPagoConProblema, notificarTransferenciaInformada,
} from '../email.js';

export class PagoError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const { siteUrl } = config;
const transferenciaDisponible = () => Boolean(config.pagos.transferencia.numeroCuenta);

export function metodosDisponibles() {
  const t = config.pagos.transferencia;
  return {
    webpay: { disponible: Webpay.webpayDisponible(), pruebas: Webpay.webpayEnPruebas() },
    mercadopago: { disponible: MP.mercadoPagoDisponible(), pruebas: MP.mercadoPagoEnPruebas() },
    transferencia: {
      disponible: transferenciaDisponible(),
      datos: transferenciaDisponible()
        ? { banco: t.banco, tipo_cuenta: t.tipoCuenta, numero_cuenta: t.numeroCuenta, titular: t.titular, rut: t.rut, email: t.email }
        : null,
    },
  };
}

/** ¿Se puede pagar esta reserva en línea ahora? */
function validarPagable(reserva) {
  if (!reserva) throw new PagoError('Reserva no encontrada', 404);
  if (reserva.estado_pago === 'pagado') throw new PagoError('Esta reserva ya está pagada', 409);
  if (reserva.estado_pago === 'cancelado') {
    throw new PagoError(reserva.motivo_cancelacion === 'vencida'
      ? 'Esta reserva venció por falta de pago y las fechas se liberaron. Puedes hacer una nueva reserva.'
      : 'Esta reserva fue cancelada', 409);
  }
  if (reserva.fecha_fin <= hoyChile()) throw new PagoError('Esta reserva ya terminó', 409);
  if (!(reserva.monto_total_clp > 0)) throw new PagoError('La reserva no tiene un monto a pagar. Contáctanos.', 409);
}

/** Datos que ve el cliente en la página de pago (el código en la URL es el secreto de acceso). */
export function datosPublicos(reserva) {
  const propiedad = Propiedad.obtener(reserva.propiedad_id);
  const ultimo = Pago.listarPorReserva(reserva.id)[0];
  return {
    reserva: {
      id: reserva.id,
      fecha_inicio: reserva.fecha_inicio,
      fecha_fin: reserva.fecha_fin,
      noches: reserva.noches,
      huespedes: reserva.huespedes,
      monto_total_clp: reserva.monto_total_clp,
      estado_pago: reserva.estado_pago,
      metodo_pago: reserva.metodo_pago,
      cliente_nombre: reserva.cliente_nombre,
      transferencia_informada: Boolean(reserva.transferencia_informada_en),
      vence_en: reserva.vence_en, // UTC
      motivo_cancelacion: reserva.motivo_cancelacion,
      terminada: reserva.fecha_fin <= hoyChile(),
    },
    propiedad: { id: propiedad.id, titulo: propiedad.titulo, comuna: propiedad.comuna, imagen: propiedad.imagenes?.[0] ?? null },
    ultimo_pago: ultimo ? { proveedor: ultimo.proveedor, estado: ultimo.estado } : null,
    metodos: metodosDisponibles(),
  };
}

/** Marca la reserva como pagada tras un pago aprobado y envía los avisos. */
function acreditar(reservaId, pago, metodo) {
  const resultado = Reserva.registrarPagoEnLinea(reservaId, metodo);
  const reserva = Reserva.obtener(reservaId);
  const propiedad = Propiedad.obtener(reserva.propiedad_id);
  if (resultado === 'pagada') {
    notificarCambioEstado(reserva, propiedad); // confirmación al cliente
    notificarPagoRecibido(reserva, propiedad, pago); // aviso a la corredora
  } else {
    // Pago cobrado sobre una reserva ya pagada o cancelada: la corredora debe devolverlo
    console.warn(`[pagos] Pago ${pago.id} aprobado sobre reserva ${reservaId} en estado "${resultado}"`);
    notificarPagoConProblema(reserva, propiedad, pago, resultado);
  }
  return resultado;
}

// ---------- Webpay ----------

export async function iniciarWebpay(reserva) {
  if (!Webpay.webpayDisponible()) throw new PagoError('El pago con Webpay no está habilitado', 503);
  validarPagable(reserva);
  const monto = reserva.monto_total_clp;
  const pago = Pago.crear({ reserva_id: reserva.id, proveedor: 'webpay', monto });
  const ordenCompra = `R${reserva.id}P${pago.id}`; // máx. 26 caracteres
  try {
    const { token, url } = await Webpay.crearTransaccion({
      ordenCompra,
      sesion: `reserva-${reserva.id}`,
      monto,
      urlRetorno: `${siteUrl}/api/pagos/webpay/retorno`,
    });
    Pago.actualizar(pago.id, { referencia: token, detalle: { buy_order: ordenCompra } });
    return { url, token };
  } catch (err) {
    Pago.finalizar(pago.id, 'rechazado', { error: err.message });
    throw new PagoError('No pudimos conectar con Webpay. Intenta nuevamente en unos minutos.', 502);
  }
}

/**
 * Retorno desde Webpay. Casos (según Transbank):
 *  - token_ws                         -> flujo normal: confirmar (commit)
 *  - TBK_TOKEN + TBK_ORDEN_COMPRA     -> el cliente anuló el pago
 *  - TBK_ORDEN_COMPRA sin tokens      -> tiempo agotado en el formulario
 *  - token_ws + TBK_TOKEN             -> error en el formulario de pago
 * Devuelve { codigo, resultado } para redirigir al cliente.
 */
export async function procesarRetornoWebpay(params) {
  const { token_ws: tokenWs, TBK_TOKEN: tbkToken, TBK_ORDEN_COMPRA: ordenCompra } = params;

  if (tokenWs && !tbkToken) {
    const pago = Pago.obtenerPorReferencia('webpay', tokenWs);
    if (!pago) return { codigo: null, resultado: 'error' };
    const reserva = Reserva.obtener(pago.reserva_id);
    // Recarga de la página de retorno: no se confirma dos veces
    if (pago.estado !== 'iniciado') return { codigo: reserva.codigo_pago, resultado: pago.estado === 'aprobado' ? 'aprobado' : 'rechazado' };

    // Si la reserva ya no acepta pagos NO confirmamos: sin commit, Transbank no cobra.
    // (Una reserva liberada por vencimiento con las fechas aún libres sí se acepta y se reactiva.)
    if (!Reserva.aceptaPago(reserva)) {
      Pago.finalizar(pago.id, 'anulado', { motivo: `reserva en estado ${reserva.estado_pago}` });
      return { codigo: reserva.codigo_pago, resultado: 'no_disponible' };
    }

    let respuesta;
    try {
      respuesta = await Webpay.confirmarTransaccion(tokenWs);
    } catch (err) {
      Pago.finalizar(pago.id, 'rechazado', { error: err.message });
      return { codigo: reserva.codigo_pago, resultado: 'rechazado' };
    }

    const resumen = Webpay.resumenRespuesta(respuesta);
    const coincide = respuesta.amount === pago.monto && respuesta.buy_order === pago.detalle?.buy_order;
    if (Webpay.esAprobada(respuesta) && coincide) {
      if (Pago.finalizar(pago.id, 'aprobado', resumen)) acreditar(reserva.id, Pago.obtener(pago.id), 'webpay');
      return { codigo: reserva.codigo_pago, resultado: 'aprobado' };
    }
    if (Webpay.esAprobada(respuesta)) {
      // Cobrado pero no coincide monto/orden: no debería ocurrir; se deja para revisión manual
      Pago.finalizar(pago.id, 'aprobado', { ...resumen, alerta: 'monto u orden no coinciden' });
      notificarPagoConProblema(reserva, Propiedad.obtener(reserva.propiedad_id), Pago.obtener(pago.id), 'monto_distinto');
      return { codigo: reserva.codigo_pago, resultado: 'revision' };
    }
    Pago.finalizar(pago.id, 'rechazado', resumen);
    return { codigo: reserva.codigo_pago, resultado: 'rechazado' };
  }

  // Anulación o tiempo agotado: ubicamos el pago por token o por orden de compra
  let pago = tbkToken ? Pago.obtenerPorReferencia('webpay', tbkToken) : null;
  const m = /^R(\d+)P(\d+)$/.exec(ordenCompra ?? '');
  if (!pago && m) {
    const candidato = Pago.obtener(Number(m[2]));
    if (candidato?.reserva_id === Number(m[1])) pago = candidato;
  }
  if (!pago) return { codigo: null, resultado: 'error' };
  const motivo = tokenWs ? 'error en el formulario de pago' : tbkToken ? 'anulado por el cliente' : 'tiempo agotado';
  Pago.finalizar(pago.id, 'anulado', { motivo });
  return { codigo: Reserva.obtener(pago.reserva_id).codigo_pago, resultado: 'anulado' };
}

// ---------- Mercado Pago ----------

export async function iniciarMercadoPago(reserva) {
  if (!MP.mercadoPagoDisponible()) throw new PagoError('El pago con Mercado Pago no está habilitado', 503);
  validarPagable(reserva);
  const propiedad = Propiedad.obtener(reserva.propiedad_id);
  const pago = Pago.crear({ reserva_id: reserva.id, proveedor: 'mercadopago', monto: reserva.monto_total_clp });
  try {
    const pref = await MP.crearPreferencia({
      pagoId: pago.id,
      titulo: `Reserva #${reserva.id} · ${propiedad.titulo} (${reserva.noches} noches)`,
      monto: reserva.monto_total_clp,
      cliente: { nombre: reserva.cliente_nombre, email: reserva.cliente_email },
      urlRetorno: `${siteUrl}/api/pagos/mercadopago/retorno`,
      urlNotificacion: `${siteUrl}/api/pagos/mercadopago/webhook`,
    });
    Pago.actualizar(pago.id, { referencia: pref.id, detalle: { preference_id: pref.id } });
    return { url: pref.init_point };
  } catch (err) {
    Pago.finalizar(pago.id, 'rechazado', { error: err.message });
    throw new PagoError('No pudimos conectar con Mercado Pago. Intenta nuevamente en unos minutos.', 502);
  }
}

const ESTADO_MP = {
  approved: 'aprobado',
  pending: 'pendiente', in_process: 'pendiente', authorized: 'pendiente',
  rejected: 'rechazado', cancelled: 'rechazado', refunded: 'rechazado', charged_back: 'rechazado',
};

/** Procesa un pago de Mercado Pago consultándolo a la API (retorno del navegador o webhook). */
export async function procesarPagoMercadoPago(paymentId) {
  const p = await MP.obtenerPago(paymentId);
  const m = /^pago-(\d+)$/.exec(p.external_reference ?? '');
  const pago = m ? Pago.obtener(Number(m[1])) : null;
  if (!pago || pago.proveedor !== 'mercadopago') return { codigo: null, resultado: 'error' };
  const reserva = Reserva.obtener(pago.reserva_id);
  const resumen = MP.resumenPago(p);
  const estado = ESTADO_MP[p.status] ?? 'pendiente';

  if (estado === 'aprobado') {
    if (p.currency_id !== 'CLP' || Math.round(p.transaction_amount) < pago.monto) {
      if (Pago.finalizar(pago.id, 'aprobado', { ...resumen, alerta: 'monto o moneda no coinciden' })) {
        notificarPagoConProblema(reserva, Propiedad.obtener(reserva.propiedad_id), Pago.obtener(pago.id), 'monto_distinto');
      }
      return { codigo: reserva.codigo_pago, resultado: 'revision' };
    }
    if (Pago.finalizar(pago.id, 'aprobado', resumen)) acreditar(reserva.id, Pago.obtener(pago.id), 'mercadopago');
    return { codigo: reserva.codigo_pago, resultado: 'aprobado' };
  }
  if (estado === 'pendiente') {
    if (pago.estado === 'iniciado') Pago.actualizar(pago.id, { estado: 'pendiente', detalle: resumen });
    return { codigo: reserva.codigo_pago, resultado: 'pendiente' };
  }
  // Rechazado: la preferencia sigue abierta para reintentar con otro medio, sólo guardamos el intento
  Pago.actualizar(pago.id, { detalle: { ultimo_intento: resumen } });
  return { codigo: reserva.codigo_pago, resultado: 'rechazado' };
}

/** Retorno del navegador desde Mercado Pago (?payment_id=&status=&external_reference=). */
export async function procesarRetornoMercadoPago(query) {
  const paymentId = query.payment_id ?? query.collection_id;
  if (paymentId && paymentId !== 'null') return procesarPagoMercadoPago(paymentId);
  // Volvió sin pagar
  const m = /^pago-(\d+)$/.exec(query.external_reference ?? '');
  const pago = m ? Pago.obtener(Number(m[1])) : null;
  if (!pago) return { codigo: null, resultado: 'error' };
  return { codigo: Reserva.obtener(pago.reserva_id).codigo_pago, resultado: 'anulado' };
}

// ---------- Transferencia ----------

export function informarTransferencia(reserva, datos) {
  if (!transferenciaDisponible()) throw new PagoError('La transferencia no está habilitada', 503);
  validarPagable(reserva);
  const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const detalle = {
    titular: texto(datos.titular, 120),
    banco: texto(datos.banco, 60),
    comentario: texto(datos.comentario, 500),
  };
  if (!detalle.titular) throw new PagoError('Indica el nombre del titular de la cuenta de origen');
  const pago = Pago.crear({ reserva_id: reserva.id, proveedor: 'transferencia', monto: reserva.monto_total_clp, estado: 'informado', detalle });
  const actualizada = Reserva.informarTransferencia(reserva.id, JSON.stringify(detalle));
  notificarTransferenciaInformada(actualizada, Propiedad.obtener(reserva.propiedad_id), pago);
  return { ok: true };
}
