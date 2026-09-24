import crypto from 'node:crypto';
import { db, transaccion } from '../db/database.js';
import { config } from '../config.js';
import { esFechaValida } from '../lib/fechas.js';

// Valor del filtro de propietario para las propiedades sin propietario registrado
export const SIN_PROPIETARIO = '__sin__';
export const ESTADOS = ['pendiente', 'liquidada'];

export class LiquidacionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const SELECT_BASE = `
  SELECT r.id AS reserva_id, r.propiedad_id, r.fecha_inicio, r.fecha_fin, r.noches, r.cliente_nombre,
         r.monto_total_clp, r.estado_pago, r.metodo_pago, r.pagado_en,
         p.titulo AS propiedad_titulo, p.comuna AS propiedad_comuna, p.direccion AS propiedad_direccion,
         p.propietario_nombre, p.propietario_rut, p.propietario_email, p.propietario_telefono, p.propietario_cuenta,
         p.aseo_clp AS prop_aseo_clp, p.comision_diario_pct AS prop_comision_pct,
         l.reserva_id AS liquidada, l.bruto_clp AS l_bruto, l.aseo_clp AS l_aseo, l.comision_clp AS l_comision,
         l.comision_pct AS l_comision_pct, l.iva_clp AS l_iva, l.neto_clp AS l_neto, l.fecha_transferencia, l.comprobante, l.notas AS liquidacion_notas,
         l.lote, c.nombre AS comprobante_archivo
  FROM reservas r
  JOIN propiedades p ON p.id = r.propiedad_id
  LEFT JOIN liquidaciones l ON l.reserva_id = r.id
  LEFT JOIN comprobantes_liquidacion c ON c.lote = l.lote
`;

// Se lee en cada cálculo: el asistente de configuración puede activar o desactivar el IVA sin reiniciar
export const ivaPct = () => (config.comision.masIva ? 19 : 0);
const ivaDe = (comision) => Math.round((comision * ivaPct()) / 100);

/** Montos que corresponden hoy según la configuración de la propiedad (para reservas aún no liquidadas). */
function calcular(fila) {
  const bruto = fila.monto_total_clp ?? 0;
  const pct = fila.prop_comision_pct ?? config.comision.diarioPct;
  const aseo = Math.min(fila.prop_aseo_clp ?? config.liquidacion.aseoBaseClp, bruto);
  // La comisión con IVA nunca supera lo que queda después del aseo
  const comision = Math.min(Math.round((bruto * pct) / 100), Math.floor((bruto - aseo) / (1 + ivaPct() / 100)));
  const iva = ivaDe(comision);
  return { bruto_clp: bruto, aseo_clp: aseo, comision_pct: pct, comision_clp: comision, iva_clp: iva, neto_clp: bruto - aseo - comision - iva };
}

function aDesglose(f) {
  const montos = f.liquidada
    ? { bruto_clp: f.l_bruto, aseo_clp: f.l_aseo, comision_pct: f.l_comision_pct, comision_clp: f.l_comision, iva_clp: f.l_iva, neto_clp: f.l_neto }
    : calcular(f);
  return {
    reserva_id: f.reserva_id,
    propiedad_id: f.propiedad_id,
    propiedad_titulo: f.propiedad_titulo,
    propiedad_comuna: f.propiedad_comuna,
    propiedad_direccion: f.propiedad_direccion,
    propietario_nombre: f.propietario_nombre,
    propietario_rut: f.propietario_rut,
    propietario_email: f.propietario_email,
    propietario_telefono: f.propietario_telefono,
    propietario_cuenta: f.propietario_cuenta,
    cliente_nombre: f.cliente_nombre,
    fecha_inicio: f.fecha_inicio,
    fecha_fin: f.fecha_fin,
    noches: f.noches,
    estado_pago: f.estado_pago,
    metodo_pago: f.metodo_pago,
    ...montos,
    estado: f.liquidada ? 'liquidada' : 'pendiente',
    fecha_transferencia: f.fecha_transferencia ?? null,
    comprobante: f.comprobante ?? null,
    liquidacion_notas: f.liquidacion_notas ?? null,
    lote: f.lote ?? null,
    comprobante_archivo: f.comprobante_archivo ?? null, // nombre del archivo adjunto, si lo hay
  };
}

/**
 * Reservas pagadas (o ya liquidadas) con check-in dentro de [desde, hasta], con su desglose:
 * arriendo cobrado − aseo − comisión de la corredora = neto para el propietario.
 */
export function listar({ desde, hasta, propiedad_id, propietario, propietario_rut, estado } = {}) {
  if (!esFechaValida(desde) || !esFechaValida(hasta) || hasta < desde) throw new LiquidacionError('Rango de fechas inválido');
  const where = [`r.fecha_inicio BETWEEN $desde AND $hasta`, `(r.estado_pago = 'pagado' OR l.reserva_id IS NOT NULL)`];
  const params = { desde, hasta };
  // Portal de propietarios: sólo sus propiedades (vínculo por RUT, nunca por nombre)
  // Lo liquidado es de quien lo recibió; lo pendiente, del dueño actual de la propiedad.
  if (propietario_rut !== undefined) {
    where.push('(CASE WHEN l.reserva_id IS NOT NULL THEN l.propietario_rut ELSE p.propietario_rut END) = $propietario_rut');
    params.propietario_rut = propietario_rut;
  }
  if (Number(propiedad_id) > 0) { where.push('r.propiedad_id = $propiedad_id'); params.propiedad_id = Number(propiedad_id); }
  if (propietario === SIN_PROPIETARIO) {
    where.push(`COALESCE(TRIM(p.propietario_nombre), '') = ''`);
  } else if (typeof propietario === 'string' && propietario.trim()) {
    where.push('TRIM(p.propietario_nombre) = $propietario COLLATE NOCASE');
    params.propietario = propietario.trim();
  }
  if (estado === 'pendiente') where.push('l.reserva_id IS NULL');
  if (estado === 'liquidada') where.push('l.reserva_id IS NOT NULL');

  const filas = db.prepare(`${SELECT_BASE} WHERE ${where.join(' AND ')} ORDER BY r.fecha_inicio, r.id LIMIT 2000`).all(params).map(aDesglose);

  const suma = (xs, k) => xs.reduce((a, x) => a + (x[k] ?? 0), 0);
  const pendientes = filas.filter((f) => f.estado === 'pendiente');
  const liquidadas = filas.filter((f) => f.estado === 'liquidada');
  return {
    desde,
    hasta,
    comision_defecto_pct: config.comision.diarioPct,
    iva_pct: ivaPct(),
    resumen: {
      reservas: filas.length,
      noches: suma(filas, 'noches'),
      bruto_clp: suma(filas, 'bruto_clp'),
      aseo_clp: suma(filas, 'aseo_clp'),
      comision_clp: suma(filas, 'comision_clp'),
      iva_clp: suma(filas, 'iva_clp'),
      neto_clp: suma(filas, 'neto_clp'),
      pendientes: pendientes.length,
      neto_pendiente_clp: suma(pendientes, 'neto_clp'),
      liquidadas: liquidadas.length,
      neto_liquidado_clp: suma(liquidadas, 'neto_clp'),
    },
    filas,
  };
}

/** Propiedades de arriendo diario y propietarios, para los filtros. */
export function opcionesFiltro() {
  const propiedades = db.prepare(`
    SELECT id, titulo, comuna, propietario_nombre FROM propiedades
    WHERE modalidad = 'arriendo_diario' OR id IN (SELECT DISTINCT propiedad_id FROM reservas)
    ORDER BY titulo
  `).all();
  const propietarios = [...new Set(propiedades.map((p) => p.propietario_nombre?.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  return { propiedades, propietarios };
}

const entero = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));

/**
 * Marca como transferidas al propietario una o varias reservas (típicamente una sola transferencia
 * por propietario y mes). Cada item puede ajustar aseo y comisión; si no, se usan los de la propiedad.
 */
export function liquidar({ items, fecha_transferencia, comprobante, notas } = {}) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) throw new LiquidacionError('Indica las reservas a liquidar');
  if (!esFechaValida(fecha_transferencia)) throw new LiquidacionError('fecha_transferencia inválida (YYYY-MM-DD)');
  if (comprobante != null && (typeof comprobante !== 'string' || comprobante.length > 120)) throw new LiquidacionError('comprobante: máximo 120 caracteres');
  if (notas != null && (typeof notas !== 'string' || notas.length > 500)) throw new LiquidacionError('notas: máximo 500 caracteres');

  // Un lote = una transferencia. Sólo de un propietario: cada uno ve sus lotes y el comprobante en su portal.
  const lote = `L${crypto.randomBytes(8).toString('hex')}`;
  return transaccion(() => {
    const insertar = db.prepare(`
      INSERT INTO liquidaciones (reserva_id, bruto_clp, aseo_clp, comision_clp, comision_pct, iva_clp, neto_clp, fecha_transferencia, comprobante, notas, lote, propietario_rut)
      VALUES ($reserva_id, $bruto_clp, $aseo_clp, $comision_clp, $comision_pct, $iva_clp, $neto_clp, $fecha_transferencia, $comprobante, $notas, $lote, $propietario_rut)
    `);
    const ids = [];
    const propietarios = new Set();
    for (const item of items) {
      const id = Number(item?.reserva_id);
      const f = db.prepare(`${SELECT_BASE} WHERE r.id = ?`).get(id);
      if (!f) throw new LiquidacionError(`Reserva #${id} no encontrada`, 404);
      if (f.liquidada) throw new LiquidacionError(`La reserva #${id} ya fue liquidada`, 409);
      if (f.estado_pago !== 'pagado') throw new LiquidacionError(`La reserva #${id} no está pagada`, 409);
      propietarios.add(f.propietario_rut ?? `nombre:${(f.propietario_nombre ?? '').trim().toLowerCase()}`);
      if (propietarios.size > 1) throw new LiquidacionError('Registra una transferencia por propietario: las reservas seleccionadas son de propietarios distintos');

      const m = calcular(f);
      const aseo = entero(item.aseo_clp) ?? m.aseo_clp;
      const comision = entero(item.comision_clp) ?? m.comision_clp;
      for (const [nombre, v] of [['aseo', aseo], ['comisión', comision]]) {
        if (!Number.isInteger(v) || v < 0) throw new LiquidacionError(`Reserva #${id}: ${nombre} debe ser un monto entero ≥ 0`);
      }
      const iva = ivaDe(comision);
      if (aseo + comision + iva > m.bruto_clp) throw new LiquidacionError(`Reserva #${id}: aseo + comisión con IVA superan lo cobrado`);
      insertar.run({
        reserva_id: id,
        bruto_clp: m.bruto_clp,
        aseo_clp: aseo,
        comision_clp: comision,
        // Si la comisión se ajustó a mano, el % guardado es el efectivo
        comision_pct: comision !== m.comision_clp && m.bruto_clp > 0 ? Math.round((comision / m.bruto_clp) * 10000) / 100 : m.comision_pct,
        iva_clp: iva,
        neto_clp: m.bruto_clp - aseo - comision - iva,
        fecha_transferencia,
        comprobante: comprobante?.trim() || null,
        notas: notas?.trim() || null,
        lote,
        propietario_rut: f.propietario_rut ?? null,
      });
      ids.push(id);
    }
    return { liquidadas: ids, lote };
  });
}

/**
 * Vuelve una reserva a "pendiente de pago al propietario" (p. ej. si se marcó por error).
 * Devuelve el lote al que pertenecía (o null si no estaba liquidada).
 */
export function deshacer(reservaId) {
  const fila = db.prepare('SELECT lote FROM liquidaciones WHERE reserva_id = ?').get(reservaId);
  if (!fila) return null;
  db.prepare('DELETE FROM liquidaciones WHERE reserva_id = ?').run(reservaId);
  return fila.lote;
}

/** Propietario (RUT) de un lote, sólo si todas sus reservas son de ese RUT; si no, null. */
export function propietarioDeLote(lote) {
  const ruts = db.prepare('SELECT DISTINCT propietario_rut AS rut FROM liquidaciones WHERE lote = ?').all(lote);
  return ruts.length === 1 ? ruts[0].rut : null;
}

export const existeLote = (lote) => Boolean(db.prepare('SELECT 1 FROM liquidaciones WHERE lote = ? LIMIT 1').get(lote));
