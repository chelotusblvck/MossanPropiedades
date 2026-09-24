import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { normalizarRut, formatearCelular, formatearRut, nombreParcial, telefonoParcial } from '../lib/identidad.js';
import { esFechaValida, hoyChile, diferenciaDias } from '../lib/fechas.js';
import * as Cliente from './cliente.js';
import { obtenerSecreto, igualesSeguro, firmarSesion, leerSesion } from '../lib/secretos.js';

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESION_MS = 30 * 24 * 60 * 60 * 1000;
const CODIGO_MIN = 10;
const MAX_INTENTOS = 5;
export const LIMITES = { visitasPorDia: 3, reservasPorDia: 5, reservasPendientes: 3 };
const FRANJAS = ['manana', 'tarde', 'indiferente'];

export class CuentaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const correo = (v) => String(v ?? '').trim().toLowerCase();

export function obtener(rut) {
  return db.prepare('SELECT * FROM cuentas_cliente WHERE rut = ?').get(rut) ?? null;
}

export function publica(c) {
  return { rut: c.rut, rut_formateado: formatearRut(c.rut), nombre: c.nombre, email: c.email, telefono: c.telefono, creado_en: c.creado_en };
}

function exigirRut(rut) {
  const r = normalizarRut(rut);
  if (!r) throw new CuentaError('RUT inválido. Revisa el número y el dígito verificador.');
  return r;
}

function exigirEmail(email) {
  const e = correo(email);
  if (!e || e.length > 160 || !RE_EMAIL.test(e)) throw new CuentaError('Correo electrónico inválido');
  return e;
}

function validarDatosNuevos({ nombre, telefono }) {
  const n = typeof nombre === 'string' ? nombre.trim().replace(/\s+/g, ' ') : '';
  if (n.length < 3 || n.length > 120) throw new CuentaError('Indica tu nombre completo');
  const tel = formatearCelular(telefono);
  if (!tel) throw new CuentaError('Celular inválido: debe ser un móvil chileno (+56 9 XXXX XXXX)');
  return { nombre: n, telefono: tel };
}

/**
 * Paso 1 de los formularios públicos: ¿el RUT tiene cuenta? Sólo confirma la identidad (con datos
 * parcialmente ocultos) si además el correo coincide; nunca entrega los datos de otra persona.
 */
export function identificar({ rut, email }) {
  const r = exigirRut(rut);
  const e = exigirEmail(email);
  const cuenta = obtener(r);
  const reconocido = (d) => ({ estado: 'existente', nombre: nombreParcial(d.nombre), telefono: telefonoParcial(d.telefono) });
  if (cuenta) return cuenta.email === e ? reconocido(cuenta) : { estado: 'correo_distinto' };
  const antiguo = Cliente.buscarSinCuenta(r, e);
  if (antiguo && formatearCelular(antiguo.telefono)) return reconocido(antiguo);
  return { estado: 'nuevo' };
}

/**
 * Resuelve la identidad de una visita o reserva sin escribir nada todavía:
 * cuenta existente (con el correo correcto) o datos validados para crear una nueva.
 */
export function prepararIdentidad({ rut, email, nombre, telefono }) {
  const r = exigirRut(rut);
  const e = exigirEmail(email);
  const cuenta = obtener(r);
  if (cuenta) {
    if (cuenta.email !== e) throw new CuentaError('Este RUT ya está registrado con otro correo. Usa el correo con que te registraste.', 409);
    return { rut: r, nueva: false, datos: { nombre: cuenta.nombre, email: cuenta.email, telefono: cuenta.telefono } };
  }
  const antiguo = Cliente.buscarSinCuenta(r, e);
  const tel = antiguo && formatearCelular(antiguo.telefono);
  if (tel) return { rut: r, nueva: true, datos: { nombre: antiguo.nombre, email: e, telefono: tel } };
  return { rut: r, nueva: true, datos: { ...validarDatosNuevos({ nombre, telefono }), email: e } };
}

/** Crea la cuenta si la identidad es nueva (idempotente ante dos envíos simultáneos). */
export function registrarSiNueva(identidad) {
  if (!identidad.nueva) return obtener(identidad.rut);
  db.prepare(`
    INSERT INTO cuentas_cliente (rut, nombre, email, telefono) VALUES (?, ?, ?, ?)
    ON CONFLICT (rut) DO NOTHING
  `).run(identidad.rut, identidad.datos.nombre, identidad.datos.email, identidad.datos.telefono);
  return obtener(identidad.rut);
}

// --- Límites por RUT (además de los límites por IP de las rutas) ---

export function verificarLimiteVisitas(rut) {
  const { n } = db.prepare(`SELECT COUNT(*) n FROM solicitudes_visita WHERE cliente_rut = ? AND creado_en > datetime('now', '-1 day')`).get(rut);
  if (n >= LIMITES.visitasPorDia) {
    throw new CuentaError(`Ya enviaste ${LIMITES.visitasPorDia} solicitudes de visita hoy. Te contactaremos pronto; puedes revisarlas en «Mi cuenta».`, 429);
  }
}

export function verificarLimiteReservas(rut) {
  const { dia, pendientes } = db.prepare(`
    SELECT SUM(creado_en > datetime('now', '-1 day')) dia, SUM(estado_pago = 'pendiente') pendientes
    FROM reservas WHERE cliente_rut = ?
  `).get(rut);
  if ((pendientes ?? 0) >= LIMITES.reservasPendientes) {
    throw new CuentaError(`Tienes ${pendientes} reservas pendientes de pago. Págalas o espera a que se liberen antes de solicitar otra.`, 429);
  }
  if ((dia ?? 0) >= LIMITES.reservasPorDia) throw new CuentaError('Alcanzaste el máximo de solicitudes de reserva por hoy.', 429);
}

// --- Ingreso al portal con código por correo ---

const SECRETO = 'secreto_sesion_clientes';
const hashCodigo = (rut, codigo) => crypto.createHmac('sha256', obtenerSecreto(SECRETO)).update(`codigo|${rut}|${codigo}`).digest('base64url');

/**
 * Genera un código de 6 dígitos si el RUT y el correo corresponden a una cuenta (o a un cliente
 * antiguo, al que se le crea la cuenta). Devuelve { cuenta, codigo } o null (la ruta responde
 * siempre lo mismo para no revelar qué RUT están registrados).
 */
export function solicitarCodigo({ rut, email }) {
  const r = exigirRut(rut);
  const e = exigirEmail(email);
  let cuenta = obtener(r);
  if (!cuenta) {
    const antiguo = Cliente.buscarSinCuenta(r, e);
    const tel = antiguo && formatearCelular(antiguo.telefono);
    if (!tel) return null;
    cuenta = registrarSiNueva({ rut: r, nueva: true, datos: { nombre: antiguo.nombre, email: e, telefono: tel } });
  }
  if (cuenta.email !== e) return null;
  const previo = db.prepare(`SELECT creado_en > datetime('now', '-60 seconds') reciente FROM codigos_acceso WHERE rut = ?`).get(r);
  if (previo?.reciente) return null; // ya se envió uno hace menos de un minuto (sin revelarlo)

  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare(`
    INSERT INTO codigos_acceso (rut, codigo_hash, expira_en, intentos, creado_en)
    VALUES (?, ?, datetime('now', '+${CODIGO_MIN} minutes'), 0, datetime('now'))
    ON CONFLICT (rut) DO UPDATE SET codigo_hash = excluded.codigo_hash, expira_en = excluded.expira_en, intentos = 0, creado_en = excluded.creado_en
  `).run(r, hashCodigo(r, codigo));
  return { cuenta, codigo, minutos: CODIGO_MIN };
}

/** Valida el código y entrega un token de sesión del portal (distinto y separado del de /admin). */
export function verificarCodigo({ rut, codigo }) {
  const r = exigirRut(rut);
  const fila = db.prepare(`SELECT *, expira_en > datetime('now') vigente FROM codigos_acceso WHERE rut = ?`).get(r);
  const invalido = new CuentaError('Código incorrecto o vencido. Solicita uno nuevo.', 401);
  if (!fila || !fila.vigente || fila.intentos >= MAX_INTENTOS) throw invalido;
  if (!igualesSeguro(hashCodigo(r, String(codigo ?? '').trim()), fila.codigo_hash)) {
    db.prepare('UPDATE codigos_acceso SET intentos = intentos + 1 WHERE rut = ?').run(r);
    throw invalido;
  }
  db.prepare('DELETE FROM codigos_acceso WHERE rut = ?').run(r);
  db.prepare(`UPDATE cuentas_cliente SET ultimo_ingreso_en = datetime('now') WHERE rut = ?`).run(r);
  return { ...firmarSesion(SECRETO, { tipo: 'cliente', rut: r }, SESION_MS), cuenta: publica(obtener(r)) };
}

/** RUT de un token de sesión de cliente válido, o null. */
export function rutDeSesion(token) {
  return sesionDe(token)?.rut ?? null;
}

/**
 * { rut, impersonacion, previa } de un token válido, o null. impersonacion = lo abrió el admin ("ver como
 * usuario"). previa = titular simulado de un cliente SIN cuenta web (sólo existe en impersonación).
 */
export function sesionDe(token) {
  const d = leerSesion(SECRETO, 'cliente', token);
  if (!d) return null;
  if (d.imp === true && d.previa) {
    const previa = titularPrevia(d.previa);
    return previa ? { rut: previa.rut, impersonacion: true, previa } : null;
  }
  return obtener(d.rut) ? { rut: d.rut, impersonacion: d.imp === true, previa: null } : null;
}

const IMPERSONACION_MS = 60 * 60 * 1000;

/**
 * Titular simulado de un cliente del CRM sin cuenta: su RUT (si se conoce) y el correo que informó, es
 * decir, con lo que se registraría. Se resuelve en cada consulta, así refleja su actividad actual.
 */
function titularPrevia(clienteId) {
  const c = Cliente.obtener(clienteId);
  if (!c) return null;
  const email = correo(c.email_informado ?? c.email) || null;
  return {
    rut: c.rut ?? null,
    email,
    cuenta: {
      rut: c.rut ?? null,
      rut_formateado: c.rut ? formatearRut(c.rut) : null,
      nombre: c.nombre,
      email,
      telefono: c.telefono,
      creado_en: null,
      sin_cuenta: true,
    },
  };
}

/**
 * "Ver como usuario" para un cliente del directorio. Con cuenta web → sesión normal de impersonación;
 * sin cuenta → vista previa de cómo se vería su portal. Nunca crea la cuenta ni escribe nada.
 */
export function sesionImpersonacionCliente(clienteId) {
  const c = Cliente.obtener(String(clienteId ?? ''));
  if (!c) throw new CuentaError('Cliente no encontrado', 404);
  if (c.rut && obtener(c.rut)) return sesionImpersonacion(c.rut);
  return {
    ...firmarSesion(SECRETO, { tipo: 'cliente', imp: true, previa: c.id }, IMPERSONACION_MS),
    nombre: c.nombre,
    rut: c.rut ?? null,
    previa: true,
  };
}

/**
 * Sesión de sólo lectura para que el admin vea el portal como este cliente. Es un token de cliente
 * marcado (imp) y corto: las rutas que modifican datos lo rechazan.
 */
export function sesionImpersonacion(rut) {
  const cuenta = obtener(rut);
  if (!cuenta) throw new CuentaError('Este cliente no tiene cuenta web (se crea con su primera visita o reserva con RUT)', 404);
  return { ...firmarSesion(SECRETO, { tipo: 'cliente', rut, imp: true }, IMPERSONACION_MS), nombre: cuenta.nombre, rut };
}

/** Clientes con cuenta web, para el selector del modo impersonación. */
export function listarCuentas(q = '') {
  const texto = String(q).trim();
  const digitos = texto.replace(/[^0-9kK]/g, '').toUpperCase();
  return db.prepare(`
    SELECT rut, nombre, email FROM cuentas_cliente
    WHERE $q = '' OR nombre LIKE $like OR email LIKE $like OR ($digitos <> '' AND replace(rut, '-', '') LIKE $digitos || '%')
    ORDER BY nombre LIMIT 200
  `).all({ q: texto, like: `%${texto}%`, digitos: digitos.length >= 3 ? digitos : '' })
    .map((c) => ({ ...c, rut_formateado: formatearRut(c.rut) }));
}

export function actualizarDatos(rut, { nombre, telefono }) {
  const cuenta = obtener(rut);
  const d = validarDatosNuevos({ nombre: nombre ?? cuenta.nombre, telefono: telefono ?? cuenta.telefono });
  db.prepare(`UPDATE cuentas_cliente SET nombre = ?, telefono = ?, actualizado_en = datetime('now') WHERE rut = ?`).run(d.nombre, d.telefono, rut);
  return publica(obtener(rut));
}

// --- Historial del portal ---

/**
 * Sólo lo que es del cliente con certeza: lo vinculado a su RUT, o lo antiguo (sin RUT) enviado con
 * su correo, que ya verificó. Nunca lo agrupado por teléfono: cualquiera podría registrar un celular ajeno.
 */
const DE_LA_CUENTA = `(x.cliente_rut = $rut OR (x.cliente_rut IS NULL AND lower(x.email) = $email))`;

export function historial(rut) {
  const cuenta = obtener(rut);
  return historialDe({ rut, email: cuenta.email, cuenta: publica(cuenta) });
}

/** Historial de un titular { rut, email, cuenta } (una cuenta real o la vista previa de un cliente sin cuenta). */
export function historialDe({ rut, email, cuenta }) {
  // Un NULL nunca coincide: sin RUT quedan sólo las solicitudes antiguas con su correo, y viceversa
  const params = { rut: rut ?? null, email: email ?? null };
  const visitas = db.prepare(`
    SELECT x.id, x.propiedad_id, x.fecha_preferida, x.franja, x.mensaje, x.estado, x.creado_en,
           x.cancelada_por_cliente_en, x.reprogramacion, x.reprogramacion_en,
           p.titulo AS propiedad_titulo, p.comuna AS propiedad_comuna, p.modalidad, p.imagenes
    FROM solicitudes_visita x JOIN propiedades p ON p.id = x.propiedad_id
    WHERE ${DE_LA_CUENTA}
    ORDER BY x.creado_en DESC LIMIT 200
  `).all(params);
  const reservas = db.prepare(`
    SELECT x.id, x.propiedad_id, x.fecha_inicio, x.fecha_fin, x.noches, x.huespedes, x.monto_total_clp, x.estado_pago,
           x.metodo_pago, x.pagado_en, x.vence_en, x.motivo_cancelacion, x.codigo_pago, x.creado_en,
           x.cupon, x.descuento_pct, x.descuento_clp, x.beneficios,
           p.titulo AS propiedad_titulo, p.comuna AS propiedad_comuna, p.imagenes
    FROM (SELECT *, cliente_email AS email FROM reservas) x JOIN propiedades p ON p.id = x.propiedad_id
    WHERE ${DE_LA_CUENTA}
    ORDER BY x.fecha_inicio DESC LIMIT 200
  `).all(params);
  const imagen = (json) => { try { return JSON.parse(json || '[]')[0] ?? null; } catch { return null; } };
  const sinImagenes = ({ imagenes, ...resto }) => ({ ...resto, imagen: imagen(imagenes) });
  return {
    cuenta,
    visitas: visitas.map((v) => ({ ...sinImagenes(v), reprogramacion: v.reprogramacion ? JSON.parse(v.reprogramacion) : null })),
    reservas: reservas.map(sinImagenes),
  };
}

function visitaDeLaCuenta(rut, id) {
  const cuenta = obtener(rut);
  const v = db.prepare(`SELECT x.* FROM solicitudes_visita x WHERE x.id = $id AND ${DE_LA_CUENTA}`).get({ id, rut, email: cuenta.email });
  if (!v) throw new CuentaError('Solicitud de visita no encontrada', 404);
  if (v.estado === 'descartada') throw new CuentaError('Esta visita ya está cancelada', 409);
  return v;
}

export function cancelarVisita(rut, id) {
  visitaDeLaCuenta(rut, id);
  db.prepare(`
    UPDATE solicitudes_visita SET estado = 'descartada', cancelada_por_cliente_en = datetime('now'), actualizado_en = datetime('now')
    WHERE id = ?
  `).run(id);
  return db.prepare('SELECT * FROM solicitudes_visita WHERE id = ?').get(id);
}

/** La visita vuelve a "nueva" para que la corredora la vea destacada, con la preferencia solicitada. */
export function reprogramarVisita(rut, id, { fecha_preferida, franja, mensaje }) {
  visitaDeLaCuenta(rut, id);
  if (fecha_preferida) {
    const dias = esFechaValida(fecha_preferida) ? diferenciaDias(hoyChile(), fecha_preferida) : -1;
    if (dias < 0 || dias > 180) throw new CuentaError('La nueva fecha debe estar dentro de los próximos 6 meses');
  }
  if (franja && !FRANJAS.includes(franja)) throw new CuentaError('Franja horaria inválida');
  if (mensaje != null && (typeof mensaje !== 'string' || mensaje.length > 500)) throw new CuentaError('El mensaje es demasiado largo');
  const solicitud = { fecha_preferida: fecha_preferida || null, franja: franja || 'indiferente', mensaje: mensaje?.trim() || null };
  db.prepare(`
    UPDATE solicitudes_visita SET reprogramacion = ?, reprogramacion_en = datetime('now'), estado = 'nueva', actualizado_en = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(solicitud), id);
  return db.prepare('SELECT * FROM solicitudes_visita WHERE id = ?').get(id);
}
