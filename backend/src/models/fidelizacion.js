// Programa de fidelización del arriendo diario: el nivel sale de las estadías completadas y cada nivel
// entrega un cupón de un solo uso para la PRÓXIMA reserva. Al completar otra estadía se genera uno nuevo.
import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { hoyChile } from '../lib/fechas.js';
import { obtenerSecreto } from '../lib/secretos.js';

export const NIVELES = [
  { id: 'plata', nombre: 'Plata', desde: 1, descuento_pct: 5, beneficios: ['5% OFF en tu próxima estadía'] },
  { id: 'oro', nombre: 'Oro', desde: 3, descuento_pct: 10, beneficios: ['10% OFF en tu próxima estadía', 'Late check-out gratis'] },
  { id: 'platinum', nombre: 'Platinum', desde: 6, descuento_pct: 15, beneficios: ['15% OFF en tu próxima estadía', 'Atenciones VIP'] },
];

// 422 (no 409): el formulario de reserva usa 409 para "fechas tomadas" y limpia la selección
export class CuponError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

const nivelPara = (n) => [...NIVELES].reverse().find((x) => n >= x.desde) ?? null;

// Mismo criterio que el historial de "Mi cuenta": su RUT, o reservas antiguas sin RUT hechas con su correo
const DE_LA_CUENTA = `(r.cliente_rut = $rut OR (r.cliente_rut IS NULL AND lower(r.cliente_email) = $email))`;

/**
 * Estadías válidas = reservas pagadas cuya salida ya pasó (la estadía se completó). Las pendientes o
 * canceladas no cuentan; las pagadas que aún no terminan se informan como "en camino".
 */
function estadias(rut, email, hoy) {
  return db.prepare(`
    SELECT COALESCE(SUM(r.fecha_fin <= $hoy), 0) AS completadas,
           COALESCE(SUM(r.fecha_fin > $hoy), 0) AS en_camino,
           COALESCE(SUM(CASE WHEN r.fecha_fin <= $hoy THEN r.monto_total_clp END), 0) AS total_gastado_clp
    FROM reservas r
    WHERE r.estado_pago = 'pagado' AND ${DE_LA_CUENTA}
  `).get({ rut: rut ?? null, email: email ? String(email).toLowerCase() : null, hoy }); // NULL no coincide con nada
}

// Sin 0/O ni 1/I/L para que se pueda dictar por teléfono sin errores
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Código determinístico: cambia con el nivel y con cada estadía completada (un cupón por estadía ganada). */
function codigoCupon(rut, nivel, completadas) {
  const h = crypto.createHmac('sha256', obtenerSecreto('secreto_cupones')).update(`cupon|${rut}|${nivel.id}|${completadas}`).digest();
  const sufijo = [...h.subarray(0, 6)].map((b) => ALFABETO[b % ALFABETO.length]).join('');
  return `${nivel.nombre.toUpperCase()}-${sufijo}`;
}

/** Reserva activa (pendiente o pagada) que ya usa este cupón, o null. */
function usoDelCupon(codigo) {
  return db.prepare(`SELECT id, estado_pago, fecha_inicio FROM reservas WHERE cupon = ? AND estado_pago <> 'cancelado' LIMIT 1`).get(codigo) ?? null;
}

/** Estado de fidelización de una cuenta, para "Mi cuenta". */
export function estado(cuenta, hoy = hoyChile()) {
  const e = estadias(cuenta.rut, cuenta.email, hoy);
  const nivel = nivelPara(e.completadas);
  const siguiente = NIVELES.find((x) => x.desde > e.completadas) ?? null;
  const base = nivel?.desde ?? 0;

  let cupon = null;
  if (nivel && !cuenta.rut) {
    // Vista previa de un cliente sin RUT registrado: el cupón es personal y se genera con su RUT
    cupon = { codigo: null, descuento_pct: nivel.descuento_pct, disponible: false, usado_en_reserva: null, requiere_rut: true };
  } else if (nivel) {
    const codigo = codigoCupon(cuenta.rut, nivel, e.completadas);
    const uso = usoDelCupon(codigo);
    cupon = { codigo, descuento_pct: nivel.descuento_pct, disponible: !uso, usado_en_reserva: uso?.id ?? null };
  }

  return {
    estadias_completadas: e.completadas,
    estadias_en_camino: e.en_camino,
    total_gastado_clp: e.total_gastado_clp,
    nivel: nivel && { id: nivel.id, nombre: nivel.nombre, descuento_pct: nivel.descuento_pct, beneficios: nivel.beneficios },
    siguiente: siguiente && {
      id: siguiente.id,
      nombre: siguiente.nombre,
      desde: siguiente.desde,
      faltan: siguiente.desde - e.completadas,
      descuento_pct: siguiente.descuento_pct,
      beneficios: siguiente.beneficios,
      // Avance dentro del tramo actual (de "base" a "siguiente.desde"), 0–100
      progreso_pct: Math.round(((e.completadas - base) / (siguiente.desde - base)) * 100),
    },
    cupon,
    niveles: NIVELES.map(({ id, nombre, desde, descuento_pct, beneficios }) => ({ id, nombre, desde, descuento_pct, beneficios })),
  };
}

/**
 * Valida un cupón para una reserva nueva de este RUT. Sólo sirve el cupón vigente del propio titular
 * (no se puede usar el de otra persona) y una sola vez. Devuelve lo que se guarda en la reserva.
 */
export function validarCupon(codigo, cuenta, hoy = hoyChile()) {
  const c = String(codigo ?? '').trim().toUpperCase();
  if (!c) return null;
  const invalido = new CuponError('El cupón no es válido para este RUT. Revisa el código en «Mi cuenta».');
  if (!cuenta || c.length > 40) throw invalido;
  const e = estadias(cuenta.rut, cuenta.email, hoy);
  const nivel = nivelPara(e.completadas);
  if (!nivel || c !== codigoCupon(cuenta.rut, nivel, e.completadas)) throw invalido;
  const uso = usoDelCupon(c);
  if (uso) throw new CuponError(`Este cupón ya se está usando en tu reserva #${uso.id}. Obtendrás uno nuevo al completar tu próxima estadía.`);
  return {
    cupon: c,
    nivel_cliente: nivel.id,
    nivel_nombre: nivel.nombre,
    descuento_pct: nivel.descuento_pct,
    beneficios: nivel.beneficios.slice(1), // el primero es el descuento, que ya va en el monto
  };
}
