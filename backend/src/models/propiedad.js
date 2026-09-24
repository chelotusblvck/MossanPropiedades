import { db, MODALIDADES } from '../db/database.js';
import { normalizarRut } from '../lib/identidad.js';

export { MODALIDADES };
export const OPERACIONES = ['venta', 'arriendo'];
export const TIPOS = ['casa', 'departamento', 'terreno', 'oficina', 'local', 'parcela', 'otro'];

// Columnas que se pueden escribir desde la API o la sincronización
const CAMPOS = [
  'titulo', 'descripcion', 'precio_uf', 'precio_clp', 'moneda_original', 'modalidad', 'operacion', 'tipo',
  'comuna', 'region', 'direccion', 'habitaciones', 'banos', 'estacionamientos',
  'superficie_util', 'superficie_total', 'imagenes', 'id_portalinmobiliario', 'permalink',
  'origen', 'estado', 'disponible', 'destacada', 'sincronizado_en', 'aseo_responsable_id',
  'gastos_comunes_clp', 'comision_pct', 'garantia_meses', 'bodegas', 'amoblado', 'mascotas', 'ano_construccion', 'orientacion',
  'propietario_nombre', 'propietario_rut', 'propietario_email', 'propietario_telefono', 'propietario_cuenta',
  'aseo_clp', 'comision_diario_pct', 'video_url', 'hora_checkin', 'hora_checkout',
];

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Video tour (YouTube/Vimeo) o recorrido 360° (Matterport, Kuula, etc.): sólo enlaces https. */
export function validarVideo(url) {
  if (url == null || url === '') return null;
  if (typeof url !== 'string' || url.length > 300) return 'video_url: máximo 300 caracteres';
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' ? null : 'El enlace del video debe empezar con https://';
  } catch {
    return 'Enlace de video inválido';
  }
}

// Datos de uso interno que no se entregan en la API pública
export const CAMPOS_INTERNOS = [
  'aseo_responsable_id', 'propietario_nombre', 'propietario_rut', 'propietario_email', 'propietario_telefono',
  'propietario_cuenta', 'aseo_clp', 'comision_diario_pct',
];

export function sinDatosInternos(p) {
  const r = { ...p };
  for (const c of CAMPOS_INTERNOS) delete r[c];
  return r;
}
const TEXTOS_PROPIETARIO = { propietario_nombre: 120, propietario_rut: 20, propietario_email: 160, propietario_telefono: 30, propietario_cuenta: 300 };

const BOOLEANOS = ['disponible', 'destacada'];
const BOOLEANOS_OPCIONALES = ['amoblado', 'mascotas']; // true / false / null (no informado)
export const ORIENTACIONES = ['norte', 'sur', 'oriente', 'poniente', 'nororiente', 'norponiente', 'suroriente', 'surponiente'];

function aFila(data) {
  const fila = {};
  for (const campo of CAMPOS) {
    if (data[campo] !== undefined) fila[campo] = data[campo];
  }
  if (fila.imagenes !== undefined) fila.imagenes = JSON.stringify(fila.imagenes ?? []);
  for (const b of BOOLEANOS) if (fila[b] !== undefined) fila[b] = fila[b] ? 1 : 0;
  for (const b of BOOLEANOS_OPCIONALES) if (fila[b] !== undefined) fila[b] = fila[b] == null ? null : fila[b] ? 1 : 0;
  if (fila.bodegas === null) fila.bodegas = 0;
  if (fila.orientacion === '') fila.orientacion = null;
  for (const c of ['video_url', 'hora_checkin', 'hora_checkout']) {
    if (fila[c] !== undefined) fila[c] = typeof fila[c] === 'string' ? fila[c].trim() || null : null;
  }
  for (const c of Object.keys(TEXTOS_PROPIETARIO)) {
    if (fila[c] !== undefined) fila[c] = typeof fila[c] === 'string' ? fila[c].trim() || null : null;
  }
  // El RUT del propietario vincula la propiedad con su portal: se guarda normalizado (12345678-K)
  if (fila.propietario_rut) fila.propietario_rut = normalizarRut(fila.propietario_rut) ?? fila.propietario_rut;
  if (fila.propietario_email) fila.propietario_email = fila.propietario_email.toLowerCase();
  return fila;
}

function deFila(row) {
  if (!row) return null;
  const opcional = (v) => (v == null ? null : Boolean(v));
  return {
    ...row,
    imagenes: JSON.parse(row.imagenes || '[]'),
    disponible: Boolean(row.disponible),
    destacada: Boolean(row.destacada),
    amoblado: opcional(row.amoblado),
    mascotas: opcional(row.mascotas),
  };
}

/** Deriva modalidad desde operacion (datos antiguos / portal) y operacion desde modalidad. */
export function normalizar(d) {
  const r = { ...d };
  if (!r.modalidad && r.operacion) r.modalidad = r.operacion === 'venta' ? 'venta' : 'arriendo_anual';
  if (MODALIDADES.includes(r.modalidad)) r.operacion = r.modalidad === 'venta' ? 'venta' : 'arriendo';
  return r;
}

export function validar(d) {
  const errores = [];
  if (typeof d.titulo !== 'string' || !d.titulo.trim()) errores.push('titulo es obligatorio');
  if (!MODALIDADES.includes(d.modalidad)) errores.push(`modalidad debe ser: ${MODALIDADES.join(', ')}`);
  if (!TIPOS.includes(d.tipo)) errores.push(`tipo debe ser: ${TIPOS.join(', ')}`);
  if (typeof d.comuna !== 'string' || !d.comuna.trim()) errores.push('comuna es obligatoria');
  if (!(Number(d.precio_uf) > 0) && !(Number(d.precio_clp) > 0)) errores.push('Debe indicar precio_uf o precio_clp');
  if (d.moneda_original !== undefined && !['UF', 'CLP'].includes(d.moneda_original)) errores.push('moneda_original debe ser UF o CLP');
  if (d.imagenes !== undefined && !Array.isArray(d.imagenes)) errores.push('imagenes debe ser un arreglo de URLs');
  if (d.aseo_responsable_id != null && !db.prepare('SELECT 1 FROM personal WHERE id = ?').get(Number(d.aseo_responsable_id) || 0)) {
    errores.push('aseo_responsable_id no corresponde a una persona registrada');
  }
  if (d.direccion != null && (typeof d.direccion !== 'string' || d.direccion.length > 200)) errores.push('direccion: máximo 200 caracteres');

  const rango = (campo, min, max, entero = false) => {
    const v = d[campo];
    if (v == null) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max || (entero && !Number.isInteger(n))) errores.push(`${campo} debe estar entre ${min} y ${max}`);
  };
  rango('gastos_comunes_clp', 0, 10_000_000, true);
  rango('comision_pct', 0, 100);
  rango('garantia_meses', 0, 6);
  rango('bodegas', 0, 20, true);
  rango('ano_construccion', 1800, new Date().getFullYear() + 5, true);
  rango('aseo_clp', 0, 5_000_000, true);
  const errorVideo = validarVideo(d.video_url);
  if (errorVideo) errores.push(errorVideo);
  for (const c of ['hora_checkin', 'hora_checkout']) {
    if (d[c] != null && d[c] !== '' && !RE_HORA.test(String(d[c]).trim())) errores.push(`${c} debe tener formato HH:MM`);
  }
  rango('comision_diario_pct', 0, 100);
  for (const [campo, max] of Object.entries(TEXTOS_PROPIETARIO)) {
    const v = d[campo];
    if (v != null && (typeof v !== 'string' || v.trim().length > max)) errores.push(`${campo}: máximo ${max} caracteres`);
  }
  if (d.orientacion != null && d.orientacion !== '' && !ORIENTACIONES.includes(d.orientacion)) {
    errores.push(`orientacion debe ser: ${ORIENTACIONES.join(', ')}`);
  }
  return errores;
}

/**
 * RUT y correo del propietario. Se valida sólo lo que llega en el cambio: así una propiedad con datos
 * antiguos mal escritos se puede seguir editando (p. ej. marcarla disponible) sin tocar al propietario.
 */
export function validarPropietario(cambios) {
  const errores = [];
  const { propietario_rut: rut, propietario_email: email } = cambios;
  if (typeof rut === 'string' && rut.trim() && !normalizarRut(rut)) errores.push('RUT del propietario inválido (revisa el dígito verificador)');
  if (typeof email === 'string' && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errores.push('Correo del propietario inválido');
  return errores;
}

/** Completa el precio en la otra moneda a partir de la moneda original y el valor UF del día. */
export function completarPrecios(d, uf) {
  const r = { ...d };
  r.moneda_original = r.moneda_original ?? (Number(r.precio_uf) > 0 ? 'UF' : 'CLP');
  if (r.moneda_original === 'UF') {
    r.precio_uf = Number(r.precio_uf);
    r.precio_clp = Math.round(r.precio_uf * uf);
  } else {
    r.precio_clp = Math.round(Number(r.precio_clp));
    r.precio_uf = Math.round((r.precio_clp / uf) * 100) / 100;
  }
  return r;
}

/** Recalcula la moneda derivada de todas las propiedades con el valor UF vigente. */
export function recalcularPrecios(uf) {
  db.prepare(`UPDATE propiedades SET precio_clp = ROUND(precio_uf * $uf) WHERE moneda_original = 'UF'`).run({ uf });
  db.prepare(`UPDATE propiedades SET precio_uf = ROUND(precio_clp / $uf, 2) WHERE moneda_original = 'CLP'`).run({ uf });
}

// Grupos del filtro rápido del sitio: venta, arriendo diario y arriendo mensual (anual + marzo-diciembre)
export const GRUPOS = ['venta', 'diario', 'mensual'];
const SQL_GRUPO = `CASE modalidad WHEN 'venta' THEN 'venta' WHEN 'arriendo_diario' THEN 'diario' ELSE 'mensual' END`;
const SQL_PUBLICADA = `estado = 'activa' AND disponible = 1`;

/**
 * Propiedades del Home: máximo `limit` (8 por defecto) en UNA consulta. Con "Todas" se reparten por turnos
 * entre venta, diario y mensual (la 1ª de cada grupo, luego la 2ª…), priorizando destacadas y recientes, para
 * que se vea de inmediato que hay de todo. Incluye cuántas hay en cada grupo (pestañas y mensajes vacíos).
 */
export function destacadas({ grupo, limit } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 8, 1), 12);
  const soloGrupo = GRUPOS.includes(grupo);
  const filas = db.prepare(`
    SELECT * FROM (
      SELECT *, ${SQL_GRUPO} AS grupo_home,
             ROW_NUMBER() OVER (PARTITION BY ${SQL_GRUPO} ORDER BY destacada DESC, creado_en DESC, id DESC) AS turno_home
      FROM propiedades
      WHERE ${SQL_PUBLICADA} ${soloGrupo ? `AND ${SQL_GRUPO} = $grupo` : ''}
    )
    ORDER BY turno_home, CASE grupo_home WHEN 'venta' THEN 0 WHEN 'diario' THEN 1 ELSE 2 END
    LIMIT $limit
  `).all(soloGrupo ? { grupo, limit: lim } : { limit: lim });

  const conteos = { todas: 0, venta: 0, diario: 0, mensual: 0 };
  for (const { g, n } of db.prepare(`SELECT ${SQL_GRUPO} AS g, COUNT(*) AS n FROM propiedades WHERE ${SQL_PUBLICADA} GROUP BY 1`).all()) {
    conteos[g] = n;
    conteos.todas += n;
  }
  const data = filas.map(({ grupo_home, turno_home, ...fila }) => sinDatosInternos(deFila(fila)));
  return { data, conteos, grupo: soloGrupo ? grupo : '' };
}

export function listar(f = {}) {
  const where = [`estado = 'activa'`, 'disponible = 1'];
  const params = {};

  if (f.modalidad) { where.push('modalidad = $modalidad'); params.modalidad = f.modalidad; }
  if (GRUPOS.includes(f.grupo)) { where.push(`${SQL_GRUPO} = $grupo`); params.grupo = f.grupo; }
  if (f.operacion) { where.push('operacion = $operacion'); params.operacion = f.operacion; }
  if (f.tipo) { where.push('tipo = $tipo'); params.tipo = f.tipo; }
  if (f.comuna) { where.push('comuna = $comuna COLLATE NOCASE'); params.comuna = f.comuna; }
  if (f.q) {
    where.push('(titulo LIKE $q OR descripcion LIKE $q OR comuna LIKE $q OR direccion LIKE $q)');
    params.q = `%${f.q}%`;
  }
  if (f.dormitorios_min) { where.push('habitaciones >= $dormitorios_min'); params.dormitorios_min = f.dormitorios_min; }
  if (f.banos_min) { where.push('banos >= $banos_min'); params.banos_min = f.banos_min; }

  // Arriendo diario: sólo propiedades sin reservas que se crucen con [llegada, salida)
  if (f.llegada && f.salida) {
    where.push(`modalidad = 'arriendo_diario'`);
    where.push(`NOT EXISTS (
      SELECT 1 FROM reservas r
      WHERE r.propiedad_id = propiedades.id AND r.estado_pago IN ('pendiente', 'pagado')
        AND r.fecha_inicio < $salida AND r.fecha_fin > $llegada)`);
    where.push(`NOT EXISTS (
      SELECT 1 FROM bloqueos b
      WHERE b.propiedad_id = propiedades.id AND b.fecha_inicio < $salida AND b.fecha_fin > $llegada)`);
    params.llegada = f.llegada;
    params.salida = f.salida;
  }

  const colPrecio = f.moneda === 'CLP' ? 'precio_clp' : 'precio_uf';
  if (f.precio_min != null) { where.push(`${colPrecio} >= $precio_min`); params.precio_min = f.precio_min; }
  if (f.precio_max != null) { where.push(`${colPrecio} <= $precio_max`); params.precio_max = f.precio_max; }

  const ordenes = {
    recientes: 'destacada DESC, creado_en DESC, id DESC',
    precio_asc: `${colPrecio} ASC`,
    precio_desc: `${colPrecio} DESC`,
    superficie: 'COALESCE(superficie_util, superficie_total) DESC',
  };
  const orden = ordenes[f.orden] ?? ordenes.recientes;

  const limit = Math.min(Math.max(Number(f.limit) || 12, 1), 60);
  const page = Math.max(Number(f.page) || 1, 1);
  const whereSql = where.join(' AND ');

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM propiedades WHERE ${whereSql}`).get(params);
  const rows = db
    .prepare(`SELECT * FROM propiedades WHERE ${whereSql} ORDER BY ${orden} LIMIT $limit OFFSET $offset`)
    .all({ ...params, limit, offset: (page - 1) * limit });

  return { data: rows.map((r) => sinDatosInternos(deFila(r))), total, page, limit, paginas: Math.ceil(total / limit) };
}

/** Todas las propiedades activas (incluye arrendadas), para el panel de administración. */
export function listarInventario() {
  return db
    .prepare(`SELECT * FROM propiedades WHERE estado = 'activa' AND eliminada_en IS NULL ORDER BY modalidad, comuna, titulo`)
    .all()
    .map(deFila);
}

/** Desactivadas (ocultas del sitio) y borradores del wizard: se pueden reactivar. */
export function listarInactivas() {
  return db
    .prepare(`SELECT * FROM propiedades WHERE estado = 'inactiva' AND eliminada_en IS NULL ORDER BY actualizado_en DESC LIMIT 200`)
    .all()
    .map(deFila);
}

/** Papelera: eliminadas (borrado lógico), de la más reciente a la más antigua. */
export function listarEliminadas() {
  return db
    .prepare(`SELECT * FROM propiedades WHERE eliminada_en IS NOT NULL ORDER BY eliminada_en DESC LIMIT 200`)
    .all()
    .map(deFila);
}

export class PropiedadError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Registros asociados, para que el modal de confirmación diga qué se conserva y qué impide eliminar. */
export function impacto(id, hoy) {
  const n = (sql, ...p) => db.prepare(sql).get(...p).n;
  return {
    reservas_vigentes: n(`SELECT COUNT(*) n FROM reservas WHERE propiedad_id = ? AND estado_pago IN ('pendiente', 'pagado') AND fecha_fin >= ?`, id, hoy),
    reservas_total: n('SELECT COUNT(*) n FROM reservas WHERE propiedad_id = ?', id),
    liquidaciones: n('SELECT COUNT(*) n FROM liquidaciones l JOIN reservas r ON r.id = l.reserva_id WHERE r.propiedad_id = ?', id),
    visitas_abiertas: n(`SELECT COUNT(*) n FROM solicitudes_visita WHERE propiedad_id = ? AND estado IN ('nueva', 'contactada', 'agendada')`, id),
    bloqueos_futuros: n('SELECT COUNT(*) n FROM bloqueos WHERE propiedad_id = ? AND fecha_fin >= ?', id, hoy),
  };
}

export const ACCIONES_ESTADO = ['desactivar', 'activar', 'eliminar', 'restaurar'];

/**
 * Cambia el estado de publicación. Nunca borra filas: "eliminar" es lógico (papelera) para no perder
 * reservas, pagos, liquidaciones ni el historial de clientes y propietarios.
 *  - desactivar: se oculta del sitio (sigue en el panel, se puede reactivar)
 *  - activar:    vuelve a publicarse
 *  - eliminar:   va a la papelera (bloqueado si tiene reservas vigentes o futuras)
 *  - restaurar:  sale de la papelera como inactiva (hay que activarla para publicarla)
 */
export function cambiarEstado(id, accion, hoy) {
  const p = obtener(id);
  if (!p) throw new PropiedadError('Propiedad no encontrada', 404);
  if (!ACCIONES_ESTADO.includes(accion)) throw new PropiedadError(`accion debe ser: ${ACCIONES_ESTADO.join(', ')}`);
  const eliminada = Boolean(p.eliminada_en);
  if (accion !== 'restaurar' && eliminada) throw new PropiedadError('La propiedad está en la papelera: restáurala primero', 409);

  if (accion === 'desactivar') {
    db.prepare(`UPDATE propiedades SET estado = 'inactiva', actualizado_en = datetime('now') WHERE id = ?`).run(id);
  } else if (accion === 'activar') {
    db.prepare(`UPDATE propiedades SET estado = 'activa', actualizado_en = datetime('now') WHERE id = ?`).run(id);
  } else if (accion === 'eliminar') {
    const { reservas_vigentes: vigentes } = impacto(id, hoy);
    if (vigentes > 0) {
      throw new PropiedadError(`Tiene ${vigentes} ${vigentes === 1 ? 'reserva vigente o futura' : 'reservas vigentes o futuras'}: cancélalas o espera a que terminen. Mientras tanto puedes desactivarla para que no reciba nuevas.`, 409);
    }
    db.prepare(`UPDATE propiedades SET estado = 'inactiva', destacada = 0, eliminada_en = datetime('now'), actualizado_en = datetime('now') WHERE id = ?`).run(id);
  } else if (!eliminada) {
    throw new PropiedadError('La propiedad no está en la papelera', 409);
  } else {
    db.prepare(`UPDATE propiedades SET eliminada_en = NULL, actualizado_en = datetime('now') WHERE id = ?`).run(id);
  }
  return obtener(id);
}

export function obtener(id) {
  return deFila(db.prepare('SELECT * FROM propiedades WHERE id = ?').get(id));
}

export function obtenerPorPortal(idPortal) {
  return deFila(db.prepare('SELECT * FROM propiedades WHERE id_portalinmobiliario = ?').get(idPortal));
}

export function comunas() {
  return db
    .prepare(`SELECT comuna, COUNT(*) AS total FROM propiedades WHERE estado = 'activa' AND disponible = 1 GROUP BY comuna ORDER BY comuna`)
    .all();
}

export function crear(data) {
  const fila = aFila(normalizar(data));
  const cols = Object.keys(fila);
  const sql = `INSERT INTO propiedades (${cols.join(', ')}) VALUES (${cols.map((c) => '$' + c).join(', ')})`;
  const { lastInsertRowid } = db.prepare(sql).run(fila);
  return obtener(Number(lastInsertRowid));
}

export function actualizar(id, data) {
  const fila = aFila(normalizar(data));
  const cols = Object.keys(fila);
  if (!cols.length) return obtener(id);
  const set = cols.map((c) => `${c} = $${c}`).join(', ');
  const { changes } = db
    .prepare(`UPDATE propiedades SET ${set}, actualizado_en = datetime('now') WHERE id = $id`)
    .run({ ...fila, id });
  return changes ? obtener(id) : null;
}

/** Inserta o actualiza una propiedad proveniente de Portalinmobiliario. */
export function upsertDesdePortal(data) {
  const existente = obtenerPorPortal(data.id_portalinmobiliario);
  // Eliminada en el panel: la sincronización no la revive aunque siga publicada en el portal
  if (existente?.eliminada_en) return 'omitida';
  if (existente) {
    // Si la corredora ajustó la modalidad (p. ej. anual -> marzo-diciembre) no la pisamos,
    // salvo que en el portal haya cambiado entre venta y arriendo.
    const nuevo = normalizar(data);
    const cambios = existente.operacion === nuevo.operacion ? { ...nuevo, modalidad: existente.modalidad } : nuevo;
    actualizar(existente.id, cambios);
    return 'actualizada';
  }
  crear(data);
  return 'creada';
}

/** Marca como inactivas las propiedades sincronizadas que ya no están activas en el portal. */
export function desactivarPortalNoIncluidas(idsActivos) {
  const activos = new Set(idsActivos);
  const filas = db
    .prepare(`SELECT id, id_portalinmobiliario FROM propiedades WHERE origen = 'portalinmobiliario' AND estado = 'activa'`)
    .all();
  const desactivar = db.prepare(`UPDATE propiedades SET estado = 'inactiva', actualizado_en = datetime('now') WHERE id = ?`);
  let n = 0;
  for (const f of filas) {
    if (!activos.has(f.id_portalinmobiliario)) {
      desactivar.run(f.id);
      n++;
    }
  }
  return n;
}
