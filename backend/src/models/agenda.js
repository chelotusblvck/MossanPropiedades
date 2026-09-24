import { db } from '../db/database.js';
import { config } from '../config.js';

export const TIPOS_TAREA = ['entrega_llaves', 'recepcion_llaves', 'aseo'];
export const TIPOS_PERSONAL = ['aseo', 'llaves', 'ambos'];
const ORDEN_TIPO = { recepcion_llaves: 0, aseo: 1, entrega_llaves: 2 };
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AgendaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// --- Personal ---

export function listarPersonal() {
  return db.prepare('SELECT id, nombre, telefono, tipo FROM personal ORDER BY nombre').all();
}

function validarPersona(d, parcial = false) {
  const errores = [];
  if (!parcial || d.nombre !== undefined) {
    if (typeof d.nombre !== 'string' || !d.nombre.trim() || d.nombre.length > 80) errores.push('nombre es obligatorio (máx. 80)');
  }
  if (d.telefono != null && (typeof d.telefono !== 'string' || d.telefono.length > 30)) errores.push('telefono inválido');
  if ((!parcial || d.tipo !== undefined) && !TIPOS_PERSONAL.includes(d.tipo)) errores.push(`tipo debe ser: ${TIPOS_PERSONAL.join(', ')}`);
  if (errores.length) throw new AgendaError(errores[0]);
}

export function crearPersona(d) {
  validarPersona(d);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO personal (nombre, telefono, tipo) VALUES (?, ?, ?)')
    .run(d.nombre.trim(), d.telefono?.trim() || null, d.tipo);
  return db.prepare('SELECT id, nombre, telefono, tipo FROM personal WHERE id = ?').get(Number(lastInsertRowid));
}

export function actualizarPersona(id, d) {
  validarPersona(d, true);
  const actual = db.prepare('SELECT * FROM personal WHERE id = ?').get(id);
  if (!actual) throw new AgendaError('Persona no encontrada', 404);
  const nuevo = { ...actual, ...d };
  db.prepare('UPDATE personal SET nombre = ?, telefono = ?, tipo = ? WHERE id = ?')
    .run(nuevo.nombre.trim(), nuevo.telefono?.trim() || null, nuevo.tipo, id);
  return db.prepare('SELECT id, nombre, telefono, tipo FROM personal WHERE id = ?').get(id);
}

export function eliminarPersona(id) {
  // Las tareas y propiedades asignadas quedan sin responsable (ON DELETE SET NULL)
  return db.prepare('DELETE FROM personal WHERE id = ?').run(id).changes > 0;
}

// --- Tareas ---

/**
 * Tareas entre [desde, hasta] (inclusive), generadas a partir de las reservas PAGADAS:
 *  - entrega_llaves el día de llegada
 *  - recepcion_llaves y aseo el día de salida
 * Se combinan con lo que la corredora haya editado en agenda_tareas.
 */
export function listarTareas(desde, hasta) {
  const { horaCheckin, horaCheckout } = config.agenda;
  const reservas = db.prepare(`
    SELECT r.id, r.propiedad_id, r.fecha_inicio, r.fecha_fin, r.cliente_nombre, r.cliente_telefono, r.huespedes, r.noches,
           p.titulo, p.comuna, p.direccion, p.imagenes, p.aseo_responsable_id,
           COALESCE(p.hora_checkin, $checkin) AS hora_checkin, COALESCE(p.hora_checkout, $checkout) AS hora_checkout
    FROM reservas r JOIN propiedades p ON p.id = r.propiedad_id
    WHERE r.estado_pago = 'pagado'
      AND ((r.fecha_inicio BETWEEN $desde AND $hasta) OR (r.fecha_fin BETWEEN $desde AND $hasta))
  `).all({ desde, hasta, checkin: horaCheckin, checkout: horaCheckout });
  if (!reservas.length) return [];

  const ids = reservas.map((r) => r.id);
  const editadas = new Map(
    db.prepare(`SELECT * FROM agenda_tareas WHERE reserva_id IN (${ids.map(() => '?').join(', ')})`)
      .all(...ids)
      .map((o) => [`${o.reserva_id}-${o.tipo}`, o]),
  );
  const personal = new Map(listarPersonal().map((p) => [p.id, p]));

  // Llegadas del mismo día en la misma propiedad (recambio: el aseo es urgente)
  const llegadas = new Map(
    db.prepare(`
      SELECT propiedad_id, fecha_inicio, cliente_nombre, estado_pago FROM reservas
      WHERE estado_pago IN ('pendiente', 'pagado') AND fecha_inicio BETWEEN $desde AND $hasta
    `).all({ desde, hasta }).map((l) => [`${l.propiedad_id}|${l.fecha_inicio}`, l]),
  );

  const tareas = [];
  for (const r of reservas) {
    const crear = (tipo, fecha, horaPorDefecto) => {
      const e = editadas.get(`${r.id}-${tipo}`);
      const porDefecto = tipo === 'aseo' ? r.aseo_responsable_id : null;
      const responsableId = e?.responsable_id ?? porDefecto;
      return {
        id: `${r.id}-${tipo}`,
        reserva_id: r.id,
        tipo,
        fecha,
        hora: e?.hora ?? horaPorDefecto,
        estado: e?.estado ?? 'pendiente',
        notas: e?.notas ?? null,
        // Responsable efectivo = asignado a esta tarea, o si no, el por defecto de la propiedad (sólo aseo)
        responsable: responsableId ? personal.get(responsableId) ?? null : null,
        responsable_asignado_id: e?.responsable_id ?? null,
        responsable_defecto: porDefecto ? personal.get(porDefecto) ?? null : null,
        propiedad: {
          id: r.propiedad_id,
          titulo: r.titulo,
          comuna: r.comuna,
          direccion: r.direccion,
          imagen: JSON.parse(r.imagenes || '[]')[0] ?? null,
        },
        reserva: {
          cliente_nombre: r.cliente_nombre,
          cliente_telefono: r.cliente_telefono,
          huespedes: r.huespedes,
          noches: r.noches,
          fecha_inicio: r.fecha_inicio,
          fecha_fin: r.fecha_fin,
        },
      };
    };

    // Horarios de la propiedad (o los generales de la configuración)
    if (r.fecha_inicio >= desde && r.fecha_inicio <= hasta) tareas.push(crear('entrega_llaves', r.fecha_inicio, r.hora_checkin));
    if (r.fecha_fin >= desde && r.fecha_fin <= hasta) {
      tareas.push(crear('recepcion_llaves', r.fecha_fin, r.hora_checkout));
      const aseo = crear('aseo', r.fecha_fin, r.hora_checkout);
      const llegada = llegadas.get(`${r.propiedad_id}|${r.fecha_fin}`);
      if (llegada) {
        aseo.recambio = { hora_llegada: r.hora_checkin, cliente_nombre: llegada.cliente_nombre, confirmada: llegada.estado_pago === 'pagado' };
      }
      tareas.push(aseo);
    }
  }

  return tareas.sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora) || ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]
      || a.propiedad.comuna.localeCompare(b.propiedad.comuna));
}

/** Guarda lo editado por la corredora (hora, responsable, estado, notas) sobre una tarea derivada. */
export function guardarTarea(reservaId, tipo, cambios) {
  if (!TIPOS_TAREA.includes(tipo)) throw new AgendaError(`tipo debe ser: ${TIPOS_TAREA.join(', ')}`);
  const reserva = db.prepare('SELECT estado_pago FROM reservas WHERE id = ?').get(reservaId);
  if (!reserva) throw new AgendaError('Reserva no encontrada', 404);
  if (reserva.estado_pago !== 'pagado') throw new AgendaError('Sólo las reservas pagadas tienen tareas en la agenda', 409);

  const c = cambios ?? {};
  if (c.hora !== undefined && c.hora !== null && c.hora !== '' && !RE_HORA.test(c.hora)) throw new AgendaError('hora inválida (HH:MM)');
  if (c.estado !== undefined && !['pendiente', 'hecha'].includes(c.estado)) throw new AgendaError('estado debe ser pendiente o hecha');
  if (c.notas != null && (typeof c.notas !== 'string' || c.notas.length > 500)) throw new AgendaError('notas: máximo 500 caracteres');
  if (c.responsable_id != null && !db.prepare('SELECT 1 FROM personal WHERE id = ?').get(Number(c.responsable_id) || 0)) {
    throw new AgendaError('El responsable no existe');
  }

  const actual = db.prepare('SELECT * FROM agenda_tareas WHERE reserva_id = ? AND tipo = ?').get(reservaId, tipo) ?? {};
  const fila = {
    hora: c.hora !== undefined ? c.hora || null : actual.hora ?? null,
    responsable_id: c.responsable_id !== undefined ? (c.responsable_id == null ? null : Number(c.responsable_id)) : actual.responsable_id ?? null,
    estado: c.estado ?? actual.estado ?? 'pendiente',
    notas: c.notas !== undefined ? c.notas?.trim() || null : actual.notas ?? null,
  };
  db.prepare(`
    INSERT INTO agenda_tareas (reserva_id, tipo, hora, responsable_id, estado, notas, actualizado_en)
    VALUES ($reserva_id, $tipo, $hora, $responsable_id, $estado, $notas, datetime('now'))
    ON CONFLICT (reserva_id, tipo) DO UPDATE SET
      hora = excluded.hora, responsable_id = excluded.responsable_id, estado = excluded.estado,
      notas = excluded.notas, actualizado_en = excluded.actualizado_en
  `).run({ reserva_id: reservaId, tipo, ...fila });
  return { reserva_id: reservaId, tipo, ...fila };
}

export function propiedadesDiarias() {
  return db.prepare(`
    SELECT id, titulo, comuna, direccion, aseo_responsable_id FROM propiedades
    WHERE estado = 'activa' AND modalidad = 'arriendo_diario' ORDER BY titulo
  `).all();
}

export function reservasPendientesEnRango(desde, hasta) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM reservas
    WHERE estado_pago = 'pendiente' AND ((fecha_inicio BETWEEN ? AND ?) OR (fecha_fin BETWEEN ? AND ?))
  `).get(desde, hasta, desde, hasta).n;
}
