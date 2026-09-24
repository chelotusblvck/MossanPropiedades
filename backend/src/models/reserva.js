import crypto from 'node:crypto';
import { db, transaccion } from '../db/database.js';
import { config } from '../config.js';
import { esFechaValida, hoyChile, diferenciaDias } from '../lib/fechas.js';

export const ESTADOS_PAGO = ['pendiente', 'pagado', 'cancelado'];
// Las reservas pendientes también bloquean fechas, para no aceptar dos solicitudes sobre las mismas noches
const ESTADOS_QUE_OCUPAN = `('pendiente', 'pagado')`;
const MAX_NOCHES = 90;
// Expresión SQL del vencimiento de una reserva nueva o reactivada (NULL si el plazo está desactivado)
const SQL_VENCIMIENTO = config.reservas.plazoPagoHoras > 0
  ? `datetime('now', '+${config.reservas.plazoPagoHoras} hours')`
  : 'NULL';
const MAX_ANTICIPACION_DIAS = 540;

export class ReservaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validar(d) {
  const errores = [];
  const hoy = hoyChile();
  if (!esFechaValida(d.fecha_inicio)) errores.push('fecha_inicio inválida (YYYY-MM-DD)');
  if (!esFechaValida(d.fecha_fin)) errores.push('fecha_fin inválida (YYYY-MM-DD)');
  if (!errores.length) {
    if (d.fecha_inicio < hoy) errores.push('La fecha de llegada no puede ser en el pasado');
    const noches = diferenciaDias(d.fecha_inicio, d.fecha_fin);
    if (noches < 1) errores.push('La salida debe ser posterior a la llegada');
    if (noches > MAX_NOCHES) errores.push(`La estadía máxima es de ${MAX_NOCHES} noches`);
    if (diferenciaDias(hoy, d.fecha_inicio) > MAX_ANTICIPACION_DIAS) errores.push('Fecha demasiado lejana');
  }
  const texto = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
  if (!texto(d.cliente_nombre, 120)) errores.push('cliente_nombre es obligatorio');
  if (!texto(d.cliente_email, 160) || !RE_EMAIL.test(d.cliente_email.trim())) errores.push('cliente_email inválido');
  if (!texto(d.cliente_telefono, 30) || d.cliente_telefono.replace(/\D/g, '').length < 8) errores.push('cliente_telefono inválido');
  if (d.huespedes !== undefined && !(Number.isInteger(Number(d.huespedes)) && d.huespedes >= 1 && d.huespedes <= 30)) {
    errores.push('huespedes debe ser un número entre 1 y 30');
  }
  if (d.notas !== undefined && d.notas !== null && (typeof d.notas !== 'string' || d.notas.length > 1000)) errores.push('notas demasiado largas');
  return errores;
}

/**
 * ¿Hay alguna reserva activa o bloqueo manual que se cruce con [inicio, fin)?
 * Devuelve 'reserva', 'bloqueo' o null. Los ids excluidos permiten revalidar un registro existente.
 */
export function conflicto(propiedadId, inicio, fin, { excluirReserva = 0, excluirBloqueo = 0 } = {}) {
  const reserva = db.prepare(`
    SELECT 1 FROM reservas
    WHERE propiedad_id = ? AND id <> ? AND estado_pago IN ${ESTADOS_QUE_OCUPAN}
      AND fecha_inicio < ? AND fecha_fin > ?
    LIMIT 1
  `).get(propiedadId, excluirReserva, fin, inicio);
  if (reserva) return 'reserva';
  const bloqueo = db.prepare(`
    SELECT 1 FROM bloqueos
    WHERE propiedad_id = ? AND id <> ? AND fecha_inicio < ? AND fecha_fin > ?
    LIMIT 1
  `).get(propiedadId, excluirBloqueo, fin, inicio);
  return bloqueo ? 'bloqueo' : null;
}

export function hayConflicto(propiedadId, inicio, fin, excluirId = 0) {
  return conflicto(propiedadId, inicio, fin, { excluirReserva: excluirId }) !== null;
}

/** Rangos ocupados (reservas + bloqueos, sin datos del cliente) para mostrar disponibilidad pública. */
export function ocupados(propiedadId, desde, hasta) {
  return db.prepare(`
    SELECT fecha_inicio, fecha_fin FROM reservas
    WHERE propiedad_id = $id AND estado_pago IN ${ESTADOS_QUE_OCUPAN} AND fecha_inicio < $hasta AND fecha_fin > $desde
    UNION ALL
    SELECT fecha_inicio, fecha_fin FROM bloqueos
    WHERE propiedad_id = $id AND fecha_inicio < $hasta AND fecha_fin > $desde
    ORDER BY fecha_inicio
  `).all({ id: propiedadId, desde, hasta });
}

/** Reservas activas (con datos del cliente) de varias propiedades en una ventana de fechas. */
export function enVentana(desde, hasta) {
  return db.prepare(`
    SELECT * FROM reservas
    WHERE estado_pago IN ${ESTADOS_QUE_OCUPAN} AND fecha_inicio < ? AND fecha_fin > ?
    ORDER BY fecha_inicio
  `).all(hasta, desde);
}

/**
 * `fidelizacion` (opcional): cupón ya validado por models/fidelizacion.js. El descuento se aplica sobre
 * el alojamiento y monto_total_clp queda con el precio final (lo que se cobra).
 */
export function crear(propiedad, d, fidelizacion = null) {
  const noches = diferenciaDias(d.fecha_inicio, d.fecha_fin);
  const bruto = propiedad.precio_clp != null ? propiedad.precio_clp * noches : null;
  const descuento = fidelizacion && bruto != null ? Math.round((bruto * fidelizacion.descuento_pct) / 100) : null;
  return transaccion(() => {
    if (hayConflicto(propiedad.id, d.fecha_inicio, d.fecha_fin)) {
      throw new ReservaError('Las fechas seleccionadas ya no están disponibles', 409);
    }
    // Revalidado dentro de la transacción: dos solicitudes simultáneas no pueden usar el mismo cupón
    if (fidelizacion && db.prepare(`SELECT 1 FROM reservas WHERE cupon = ? AND estado_pago <> 'cancelado'`).get(fidelizacion.cupon)) {
      throw new ReservaError('Este cupón ya se usó en otra reserva', 422);
    }
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO reservas (propiedad_id, fecha_inicio, fecha_fin, cliente_nombre, cliente_email, cliente_telefono,
                            huespedes, notas, noches, monto_total_clp, codigo_pago, vence_en, cliente_rut,
                            cupon, nivel_cliente, descuento_pct, descuento_clp, beneficios)
      VALUES ($propiedad_id, $fecha_inicio, $fecha_fin, $cliente_nombre, $cliente_email, $cliente_telefono,
              $huespedes, $notas, $noches, $monto_total_clp, $codigo_pago, ${SQL_VENCIMIENTO}, $cliente_rut,
              $cupon, $nivel_cliente, $descuento_pct, $descuento_clp, $beneficios)
    `).run({
      cupon: fidelizacion?.cupon ?? null,
      nivel_cliente: fidelizacion?.nivel_cliente ?? null,
      descuento_pct: fidelizacion?.descuento_pct ?? null,
      descuento_clp: descuento,
      beneficios: fidelizacion?.beneficios.length ? fidelizacion.beneficios.join(' · ') : null,
      cliente_rut: d.cliente_rut ?? null,
      codigo_pago: crypto.randomBytes(16).toString('hex'),
      propiedad_id: propiedad.id,
      fecha_inicio: d.fecha_inicio,
      fecha_fin: d.fecha_fin,
      cliente_nombre: d.cliente_nombre.trim(),
      cliente_email: d.cliente_email.trim().toLowerCase(),
      cliente_telefono: d.cliente_telefono.trim(),
      huespedes: Number(d.huespedes ?? 1),
      notas: d.notas?.trim() || null,
      noches,
      monto_total_clp: bruto != null ? bruto - (descuento ?? 0) : null,
    });
    return obtener(Number(lastInsertRowid));
  });
}

export function obtener(id) {
  return db.prepare('SELECT * FROM reservas WHERE id = ?').get(id) ?? null;
}

export function listar({ estado, propiedad_id, desde } = {}) {
  const where = ['1 = 1'];
  const params = {};
  if (ESTADOS_PAGO.includes(estado)) { where.push('r.estado_pago = $estado'); params.estado = estado; }
  if (propiedad_id) { where.push('r.propiedad_id = $propiedad_id'); params.propiedad_id = Number(propiedad_id); }
  if (esFechaValida(desde)) { where.push('r.fecha_fin >= $desde'); params.desde = desde; }
  return db.prepare(`
    SELECT r.*, p.titulo AS propiedad_titulo, p.comuna AS propiedad_comuna
    FROM reservas r JOIN propiedades p ON p.id = r.propiedad_id
    WHERE ${where.join(' AND ')}
    ORDER BY r.fecha_inicio ASC
    LIMIT 500
  `).all(params);
}

export function cambiarEstado(id, estado) {
  if (!ESTADOS_PAGO.includes(estado)) throw new ReservaError(`estado_pago debe ser: ${ESTADOS_PAGO.join(', ')}`);
  return transaccion(() => {
    const r = obtener(id);
    if (!r) throw new ReservaError('Reserva no encontrada', 404);
    // Reactivar una reserva cancelada exige que las fechas sigan libres
    if (r.estado_pago === 'cancelado' && estado !== 'cancelado' && hayConflicto(r.propiedad_id, r.fecha_inicio, r.fecha_fin, r.id)) {
      throw new ReservaError('No se puede reactivar: las fechas ya fueron tomadas por otra reserva o un bloqueo', 409);
    }
    db.prepare(`UPDATE reservas SET estado_pago = ?, actualizado_en = datetime('now') WHERE id = ?`).run(estado, id);
    if (estado === 'cancelado' && r.estado_pago !== 'cancelado') {
      db.prepare(`UPDATE reservas SET motivo_cancelacion = 'manual' WHERE id = ?`).run(id);
    }
    if (estado === 'pendiente' && r.estado_pago !== 'pendiente') {
      // Reactivada: plazo nuevo para pagar (si no, el proceso automático la liberaría de inmediato)
      db.prepare(`UPDATE reservas SET motivo_cancelacion = NULL, vence_en = ${SQL_VENCIMIENTO} WHERE id = ?`).run(id);
    }
    if (estado === 'pagado' && r.estado_pago !== 'pagado') {
      // Pago confirmado a mano por la corredora (típicamente una transferencia)
      db.prepare(`
        UPDATE reservas SET pagado_en = datetime('now'),
          metodo_pago = COALESCE(metodo_pago, CASE WHEN transferencia_informada_en IS NOT NULL THEN 'transferencia' ELSE 'manual' END)
        WHERE id = ?
      `).run(id);
    }
    return obtener(id);
  });
}

/**
 * Extiende (o quita) el plazo de pago de una reserva pendiente.
 * horas > 0: nuevo vencimiento = ahora + horas (o vencimiento actual + horas si aún no vence). null: sin vencimiento.
 */
export function cambiarPlazo(id, horas) {
  const r = obtener(id);
  if (!r) throw new ReservaError('Reserva no encontrada', 404);
  if (r.estado_pago !== 'pendiente') throw new ReservaError('Sólo las reservas pendientes tienen plazo de pago', 409);
  if (horas === null) {
    db.prepare('UPDATE reservas SET vence_en = NULL WHERE id = ?').run(id);
  } else {
    const h = Number(horas);
    if (!Number.isInteger(h) || h < 1 || h > 720) throw new ReservaError('horas debe ser un entero entre 1 y 720');
    db.prepare(`
      UPDATE reservas SET vence_en = datetime(MAX(COALESCE(vence_en, datetime('now')), datetime('now')), '+' || ? || ' hours')
      WHERE id = ?
    `).run(h, id);
  }
  return obtener(id);
}

/**
 * Reservas pendientes con el plazo vencido que se pueden liberar. No se liberan las que tienen una
 * transferencia informada (la corredora debe verificarla), un pago en proceso en Mercado Pago, o un
 * pago iniciado hace menos de 30 minutos (el cliente puede estar en el formulario de Webpay).
 */
export function vencidasLiberables() {
  return db.prepare(`
    SELECT r.* FROM reservas r
    WHERE r.estado_pago = 'pendiente'
      AND r.vence_en IS NOT NULL AND r.vence_en <= datetime('now')
      AND r.transferencia_informada_en IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pagos p WHERE p.reserva_id = r.id
          AND (p.estado = 'pendiente' OR (p.estado = 'iniciado' AND p.creado_en > datetime('now', '-30 minutes')))
      )
    ORDER BY r.vence_en
  `).all();
}

/** Cancela una reserva por vencimiento, sólo si sigue pendiente (evita carreras con un pago que llega justo). */
export function liberarPorVencimiento(id) {
  const { changes } = db.prepare(`
    UPDATE reservas SET estado_pago = 'cancelado', motivo_cancelacion = 'vencida', actualizado_en = datetime('now')
    WHERE id = ? AND estado_pago = 'pendiente'
  `).run(id);
  return changes > 0;
}

export function obtenerPorCodigo(codigo) {
  if (typeof codigo !== 'string' || !/^[a-f0-9]{32}$/.test(codigo)) return null;
  return db.prepare('SELECT * FROM reservas WHERE codigo_pago = ?').get(codigo) ?? null;
}

/**
 * Registra un pago en línea aprobado. Devuelve:
 *  'pagada'     -> la reserva estaba pendiente y quedó pagada
 *  'ya_pagada'  -> ya estaba pagada (pago duplicado: la corredora debe devolverlo)
 *  'cancelada'  -> la reserva estaba cancelada (hay que devolver el dinero)
 */
export function registrarPagoEnLinea(id, metodo) {
  return transaccion(() => {
    const r = obtener(id);
    if (!r) throw new ReservaError('Reserva no encontrada', 404);
    if (r.estado_pago === 'pagado') return 'ya_pagada';
    if (!aceptaPago(r)) return 'cancelada';
    db.prepare(`
      UPDATE reservas SET estado_pago = 'pagado', metodo_pago = ?, pagado_en = datetime('now'),
        motivo_cancelacion = NULL, actualizado_en = datetime('now')
      WHERE id = ?
    `).run(metodo, id);
    return 'pagada';
  });
}

/**
 * ¿Se puede acreditar un pago a esta reserva? Sí si está pendiente, o si se liberó sólo por vencimiento
 * y sus fechas siguen libres (p. ej. un pago que se aprobó minutos después de vencer).
 */
export function aceptaPago(r) {
  if (r.estado_pago === 'pendiente') return true;
  return r.estado_pago === 'cancelado' && r.motivo_cancelacion === 'vencida'
    && !hayConflicto(r.propiedad_id, r.fecha_inicio, r.fecha_fin, r.id);
}

export function informarTransferencia(id, detalle) {
  db.prepare(`
    UPDATE reservas SET transferencia_informada_en = datetime('now'), transferencia_detalle = ?, actualizado_en = datetime('now')
    WHERE id = ?
  `).run(detalle, id);
  return obtener(id);
}

export function contarPendientes() {
  return db.prepare(`SELECT COUNT(*) AS n FROM reservas WHERE estado_pago = 'pendiente' AND fecha_fin >= ?`).get(hoyChile()).n;
}
