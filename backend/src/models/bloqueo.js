import { db, transaccion } from '../db/database.js';
import { esFechaValida, hoyChile, diferenciaDias } from '../lib/fechas.js';
import { conflicto, ReservaError } from './reserva.js';

const MAX_NOCHES = 365;

export function validar(d) {
  const errores = [];
  if (!esFechaValida(d.fecha_inicio)) errores.push('fecha_inicio inválida (YYYY-MM-DD)');
  if (!esFechaValida(d.fecha_fin)) errores.push('fecha_fin inválida (YYYY-MM-DD)');
  if (!errores.length) {
    if (d.fecha_inicio < hoyChile()) errores.push('No se pueden bloquear fechas pasadas');
    const noches = diferenciaDias(d.fecha_inicio, d.fecha_fin);
    if (noches < 1) errores.push('El último día debe ser posterior al primero');
    if (noches > MAX_NOCHES) errores.push(`Máximo ${MAX_NOCHES} noches por bloqueo`);
  }
  if (d.motivo != null && (typeof d.motivo !== 'string' || d.motivo.length > 200)) errores.push('motivo: máximo 200 caracteres');
  return errores;
}

export function obtener(id) {
  return db.prepare('SELECT * FROM bloqueos WHERE id = ?').get(id) ?? null;
}

export function crear(propiedadId, d) {
  return transaccion(() => {
    const choque = conflicto(propiedadId, d.fecha_inicio, d.fecha_fin);
    if (choque === 'reserva') {
      throw new ReservaError('Hay reservas en esas fechas. Cancélalas primero o elige otro rango.', 409);
    }
    if (choque === 'bloqueo') throw new ReservaError('Esas fechas ya están bloqueadas', 409);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO bloqueos (propiedad_id, fecha_inicio, fecha_fin, motivo) VALUES (?, ?, ?, ?)')
      .run(propiedadId, d.fecha_inicio, d.fecha_fin, d.motivo?.trim() || null);
    return obtener(Number(lastInsertRowid));
  });
}

export function eliminar(id) {
  return db.prepare('DELETE FROM bloqueos WHERE id = ?').run(id).changes > 0;
}

export function enVentana(desde, hasta) {
  return db
    .prepare('SELECT * FROM bloqueos WHERE fecha_inicio < ? AND fecha_fin > ? ORDER BY fecha_inicio')
    .all(hasta, desde);
}
