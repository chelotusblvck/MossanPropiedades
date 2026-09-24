import { db } from '../db/database.js';

const deFila = (f) => (f ? { ...f, detalle: f.detalle ? JSON.parse(f.detalle) : null } : null);

export function crear({ reserva_id, proveedor, monto, estado = 'iniciado', referencia = null, detalle = null }) {
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO pagos (reserva_id, proveedor, referencia, monto, estado, detalle)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(reserva_id, proveedor, referencia, monto, estado, detalle ? JSON.stringify(detalle) : null);
  return obtener(Number(lastInsertRowid));
}

export function obtener(id) {
  return deFila(db.prepare('SELECT * FROM pagos WHERE id = ?').get(id));
}

export function obtenerPorReferencia(proveedor, referencia) {
  return deFila(db.prepare('SELECT * FROM pagos WHERE proveedor = ? AND referencia = ?').get(proveedor, String(referencia)));
}

export function actualizar(id, { estado, referencia, detalle }) {
  const actual = obtener(id);
  db.prepare(`
    UPDATE pagos SET estado = ?, referencia = ?, detalle = ?, actualizado_en = datetime('now') WHERE id = ?
  `).run(
    estado ?? actual.estado,
    referencia ?? actual.referencia,
    JSON.stringify({ ...(actual.detalle ?? {}), ...(detalle ?? {}) }),
    id,
  );
  return obtener(id);
}

/**
 * Pasa un pago de "iniciado"/"pendiente" a un estado final, sólo una vez.
 * Devuelve true si esta llamada hizo la transición (evita procesar dos veces el mismo pago:
 * retorno del navegador + webhook, o doble envío del formulario).
 */
export function finalizar(id, estado, detalle) {
  const actual = obtener(id);
  const { changes } = db.prepare(`
    UPDATE pagos SET estado = ?, detalle = ?, actualizado_en = datetime('now')
    WHERE id = ? AND estado IN ('iniciado', 'pendiente')
  `).run(estado, JSON.stringify({ ...(actual?.detalle ?? {}), ...(detalle ?? {}) }), id);
  return changes > 0;
}

export function listarPorReserva(reservaId) {
  return db.prepare('SELECT * FROM pagos WHERE reserva_id = ? ORDER BY id DESC').all(reservaId).map(deFila);
}
