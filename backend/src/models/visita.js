import { db } from '../db/database.js';
import { esFechaValida, hoyChile, diferenciaDias } from '../lib/fechas.js';

export const ESTADOS = ['nueva', 'contactada', 'agendada', 'descartada'];
export const FRANJAS = ['manana', 'tarde', 'indiferente'];
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class VisitaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validar(d) {
  const texto = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
  if (!texto(d.nombre, 120)) return 'Indica tu nombre';
  if (!texto(d.email, 160) || !RE_EMAIL.test(d.email.trim())) return 'Correo electrónico inválido';
  if (!texto(d.telefono, 30) || d.telefono.replace(/\D/g, '').length < 8) return 'Teléfono inválido';
  if (d.fecha_preferida) {
    if (!esFechaValida(d.fecha_preferida)) return 'Fecha preferida inválida';
    const dias = diferenciaDias(hoyChile(), d.fecha_preferida);
    if (dias < 0 || dias > 180) return 'La fecha preferida debe estar dentro de los próximos 6 meses';
  }
  if (d.franja && !FRANJAS.includes(d.franja)) return 'Franja horaria inválida';
  if (d.mensaje != null && (typeof d.mensaje !== 'string' || d.mensaje.length > 1000)) return 'El mensaje es demasiado largo';
  return null;
}

export function crear(propiedadId, d) {
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO solicitudes_visita (propiedad_id, nombre, email, telefono, fecha_preferida, franja, mensaje, cliente_rut)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    propiedadId,
    d.nombre.trim(),
    d.email.trim().toLowerCase(),
    d.telefono.trim(),
    d.fecha_preferida || null,
    d.franja || 'indiferente',
    d.mensaje?.trim() || null,
    d.cliente_rut ?? null,
  );
  return obtener(Number(lastInsertRowid));
}

export function obtener(id) {
  return db.prepare('SELECT * FROM solicitudes_visita WHERE id = ?').get(id) ?? null;
}

export function listar({ estado } = {}) {
  const filtro = ESTADOS.includes(estado) ? 'WHERE v.estado = $estado' : '';
  return db.prepare(`
    SELECT v.*, p.titulo AS propiedad_titulo, p.comuna AS propiedad_comuna, p.modalidad AS propiedad_modalidad
    FROM solicitudes_visita v JOIN propiedades p ON p.id = v.propiedad_id
    ${filtro}
    ORDER BY CASE v.estado WHEN 'nueva' THEN 0 WHEN 'contactada' THEN 1 WHEN 'agendada' THEN 2 ELSE 3 END, v.creado_en DESC
    LIMIT 500
  `).all(filtro ? { estado } : {});
}

export function actualizar(id, { estado, notas_internas }) {
  const actual = obtener(id);
  if (!actual) throw new VisitaError('Solicitud no encontrada', 404);
  if (estado !== undefined && !ESTADOS.includes(estado)) throw new VisitaError(`estado debe ser: ${ESTADOS.join(', ')}`);
  if (notas_internas != null && (typeof notas_internas !== 'string' || notas_internas.length > 1000)) {
    throw new VisitaError('notas_internas: máximo 1000 caracteres');
  }
  db.prepare(`UPDATE solicitudes_visita SET estado = ?, notas_internas = ?, actualizado_en = datetime('now') WHERE id = ?`).run(
    estado ?? actual.estado,
    notas_internas !== undefined ? notas_internas?.trim() || null : actual.notas_internas,
    id,
  );
  return obtener(id);
}

export function contarNuevas() {
  return db.prepare(`SELECT COUNT(*) AS n FROM solicitudes_visita WHERE estado = 'nueva'`).get().n;
}
