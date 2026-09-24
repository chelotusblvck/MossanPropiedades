import crypto from 'node:crypto';
import { db, transaccion } from '../db/database.js';
import { config } from '../config.js';
import { normalizarRut, normalizarTelefono, formatearRut } from '../lib/identidad.js';
import { obtenerSecreto, igualesSeguro, firmarSesion, leerSesion } from '../lib/secretos.js';
import { hoyChile, sumarDias, diferenciaDias, esFechaValida } from '../lib/fechas.js';
import * as Liquidacion from './liquidacion.js';
import { enviarBienvenidaPropietario, enviarCodigoPropietario } from '../services/email.js';
import { enviarCodigoWhatsApp } from '../services/whatsapp.js';

const SECRETO = 'secreto_sesion_propietarios';
const SESION_MS = 30 * 24 * 60 * 60 * 1000;
const CODIGO_MIN = 10;
const MAX_INTENTOS = 5;
const ENLACE_DIAS = 7;

export class PropietarioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const hmac = (texto) => crypto.createHmac('sha256', obtenerSecreto(SECRETO)).update(texto).digest('base64url');

export function obtener(rut) {
  return db.prepare('SELECT * FROM propietarios WHERE rut = ?').get(rut) ?? null;
}

/** Propietario con acceso al portal (los registrados sin acceso no pueden entrar). */
const conAcceso = (rut) => db.prepare('SELECT * FROM propietarios WHERE rut = ? AND portal_habilitado = 1').get(rut) ?? null;

const publico = (p) => ({ rut: p.rut, rut_formateado: formatearRut(p.rut), nombre: p.nombre, email: p.email, telefono: p.telefono });

// --- Ficha del propietario (wizard de publicación) ---

export const TIPOS_CUENTA = ['Cuenta Corriente', 'Cuenta Vista', 'Cuenta RUT', 'Cuenta de Ahorro'];
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Texto de la cuenta bancaria que se muestra en liquidaciones y en el PDF. */
export function cuentaTexto(p) {
  if (!p?.banco || !p.numero_cuenta) return null;
  return [p.banco, p.tipo_cuenta, `N° ${p.numero_cuenta}`, p.titular_cuenta && `${p.titular_cuenta}${p.rut_titular ? ` (RUT ${formatearRut(p.rut_titular)})` : ''}`]
    .filter(Boolean).join(' · ');
}

const ficha = (p) => ({
  ...publico(p),
  banco: p.banco, tipo_cuenta: p.tipo_cuenta, numero_cuenta: p.numero_cuenta, titular_cuenta: p.titular_cuenta,
  rut_titular: p.rut_titular, rut_titular_formateado: formatearRut(p.rut_titular),
  portal_habilitado: Boolean(p.portal_habilitado), ultimo_ingreso_en: p.ultimo_ingreso_en,
  propiedades: db.prepare('SELECT COUNT(*) n FROM propiedades WHERE propietario_rut = ? AND eliminada_en IS NULL').get(p.rut).n,
});

/** Búsqueda para asociar un propietario existente: por RUT (con o sin formato) o por nombre. */
export function buscar(q) {
  const texto = String(q ?? '').trim();
  if (texto.length < 2) return [];
  const digitos = texto.replace(/[^0-9kK]/g, '').toUpperCase();
  const filas = db.prepare(`
    SELECT * FROM propietarios
    WHERE ($digitos <> '' AND replace(rut, '-', '') LIKE $digitos || '%') OR nombre LIKE $nombre
    ORDER BY nombre LIMIT 10
  `).all({ digitos: digitos.length >= 3 ? digitos : '', nombre: `%${texto}%` });
  return filas.map(ficha);
}

export function obtenerFicha(rut) {
  const p = obtener(rut);
  return p ? ficha(p) : null;
}

/**
 * Crea o actualiza la ficha completa (contacto + datos bancarios). `portal` = true habilita el acceso
 * al Portal de Propietarios; false no quita un acceso que ya tenía.
 */
export function guardarFicha(d = {}, { portal = false } = {}) {
  const errores = [];
  const rut = normalizarRut(d.rut);
  if (!rut) errores.push('RUT del propietario inválido (revisa el dígito verificador)');
  const nombre = String(d.nombre ?? '').trim().replace(/\s+/g, ' ');
  if (nombre.length < 3 || nombre.length > 120) errores.push('Indica el nombre completo del propietario');
  const email = String(d.email ?? '').trim().toLowerCase() || null;
  if (email && (email.length > 160 || !RE_EMAIL.test(email))) errores.push('Correo del propietario inválido');
  const telDigitos = normalizarTelefono(d.telefono);
  const telefono = telDigitos && telDigitos.length === 9 && telDigitos[0] === '9' ? `+56 9 ${telDigitos.slice(1, 5)} ${telDigitos.slice(5)}` : null;
  if (d.telefono && !telefono) errores.push('Celular inválido: debe ser un móvil chileno (+56 9 XXXX XXXX)');
  if (!email && !telefono) errores.push('Indica al menos el correo o el celular del propietario');

  const banco = String(d.banco ?? '').trim();
  const tipoCuenta = String(d.tipo_cuenta ?? '').trim();
  const numero = String(d.numero_cuenta ?? '').replace(/\s+/g, '');
  const titular = String(d.titular_cuenta ?? '').trim() || nombre;
  const rutTitular = d.rut_titular ? normalizarRut(d.rut_titular) : rut;
  if (!banco || banco.length > 60) errores.push('Indica el banco');
  if (!TIPOS_CUENTA.includes(tipoCuenta)) errores.push(`Tipo de cuenta: ${TIPOS_CUENTA.join(', ')}`);
  if (!/^[0-9-]{4,20}$/.test(numero)) errores.push('N° de cuenta inválido (sólo números y guiones)');
  if (titular.length > 120) errores.push('Titular: máximo 120 caracteres');
  if (!rutTitular) errores.push('RUT del titular de la cuenta inválido');
  if (errores.length) throw new PropietarioError(errores[0]);

  const existente = obtener(rut);
  db.prepare(`
    INSERT INTO propietarios (rut, nombre, email, telefono, banco, tipo_cuenta, numero_cuenta, titular_cuenta, rut_titular, portal_habilitado)
    VALUES ($rut, $nombre, $email, $telefono, $banco, $tipo, $numero, $titular, $rutTitular, $portal)
    ON CONFLICT (rut) DO UPDATE SET nombre = $nombre, email = $email, telefono = $telefono, banco = $banco, tipo_cuenta = $tipo,
      numero_cuenta = $numero, titular_cuenta = $titular, rut_titular = $rutTitular,
      portal_habilitado = MAX(portal_habilitado, $portal), actualizado_en = datetime('now')
  `).run({ rut, nombre, email, telefono, banco, tipo: tipoCuenta, numero, titular, rutTitular, portal: portal ? 1 : 0 });
  return { propietario: obtener(rut), nuevo: !existente };
}

// --- Cuentas: se crean desde la ficha de la propiedad en /admin ---

/**
 * Crea o actualiza la cuenta del propietario con los datos de la propiedad. Si es nueva (y tiene
 * cómo contactarlo) le envía la bienvenida. Devuelve lo que el panel necesita mostrar, o null.
 */
export function sincronizarDesdePropiedad(propiedad) {
  const rut = normalizarRut(propiedad.propietario_rut);
  if (!rut) return null;
  const existente = obtener(rut);
  const nombre = propiedad.propietario_nombre?.trim() || existente?.nombre || 'Propietario';
  db.prepare(`
    INSERT INTO propietarios (rut, nombre, email, telefono) VALUES ($rut, $nombre, $email, $telefono)
    ON CONFLICT (rut) DO UPDATE SET nombre = $nombre, email = COALESCE($email, email), telefono = COALESCE($telefono, telefono),
      actualizado_en = datetime('now')
  `).run({ rut, nombre, email: propiedad.propietario_email || null, telefono: propiedad.propietario_telefono || null });

  if (existente) return { rut, nuevo: false, bienvenida_enviada_en: existente.bienvenida_enviada_en };
  const p = obtener(rut);
  return { rut, nuevo: true, ...(p.email || p.telefono ? enviarBienvenida(rut) : { email: false, whatsapp_url: null }) };
}

/** Enlace de acceso de un solo uso. Sólo se guarda el hash del token. */
function crearEnlace(rut, dias = ENLACE_DIAS) {
  const token = crypto.randomBytes(24).toString('base64url');
  db.prepare(`INSERT INTO enlaces_propietario (token_hash, rut, expira_en) VALUES (?, ?, datetime('now', '+${dias} days'))`).run(hmac(`enlace|${token}`), rut);
  return `${config.siteUrl}/propietarios/login?enlace=${token}`;
}

/**
 * Bienvenida: correo con su enlace (si tiene correo) y un mensaje de WhatsApp listo para que la
 * corredora lo envíe desde su teléfono (con otro enlace, porque cada uno sirve una sola vez).
 */
export function enviarBienvenida(rut) {
  const p = obtener(rut);
  if (!p) throw new PropietarioError('Propietario no encontrado', 404);
  if (!p.email && !p.telefono) throw new PropietarioError('Registra el correo o el celular del propietario para enviarle el acceso');
  db.prepare('UPDATE propietarios SET portal_habilitado = 1 WHERE rut = ?').run(rut); // enviar el acceso lo habilita
  if (p.email) enviarBienvenidaPropietario(p, crearEnlace(rut), ENLACE_DIAS); // en segundo plano
  let whatsappUrl = null;
  const tel = normalizarTelefono(p.telefono);
  if (tel && tel.length === 9) {
    const texto = `Hola ${p.nombre.split(' ')[0]}, te saluda ${config.marca.nombre}. Creamos tu acceso al Portal de Propietarios, donde puedes ver la ocupación de tu propiedad y tus liquidaciones: ${crearEnlace(rut)}\n\nEl enlace es personal y sirve una vez durante ${ENLACE_DIAS} días. Después entras en ${config.siteUrl}/propietarios/login con tu RUT.`;
    whatsappUrl = `https://wa.me/56${tel}?text=${encodeURIComponent(texto)}`;
  }
  db.prepare(`UPDATE propietarios SET bienvenida_enviada_en = datetime('now') WHERE rut = ?`).run(rut);
  return { email: Boolean(p.email), whatsapp_url: whatsappUrl };
}

/**
 * Normaliza datos antiguos y crea las cuentas de las propiedades que ya tienen propietario (sin enviar
 * bienvenida). Se ejecuta al iniciar y después de restaurar un respaldo.
 */
export function repararDatos() {
  transaccion(() => {
    for (const p of db.prepare(`SELECT id, propietario_rut FROM propiedades WHERE propietario_rut IS NOT NULL`).all()) {
      const n = normalizarRut(p.propietario_rut);
      if (n && n !== p.propietario_rut) db.prepare('UPDATE propiedades SET propietario_rut = ? WHERE id = ?').run(n, p.id);
    }
    db.exec(`
      UPDATE liquidaciones SET lote = 'r' || reserva_id WHERE lote IS NULL;
      UPDATE liquidaciones SET propietario_rut = (
        SELECT p.propietario_rut FROM reservas r JOIN propiedades p ON p.id = r.propiedad_id WHERE r.id = liquidaciones.reserva_id
      ) WHERE propietario_rut IS NULL;
    `);
    for (const l of db.prepare('SELECT DISTINCT propietario_rut FROM liquidaciones WHERE propietario_rut IS NOT NULL').all()) {
      const n = normalizarRut(l.propietario_rut);
      if (n && n !== l.propietario_rut) db.prepare('UPDATE liquidaciones SET propietario_rut = ? WHERE propietario_rut = ?').run(n, l.propietario_rut);
    }
    const conDueno = db.prepare(`
      SELECT propietario_rut, propietario_nombre, propietario_email, propietario_telefono FROM propiedades
      WHERE propietario_rut IS NOT NULL ORDER BY actualizado_en
    `).all();
    const insertar = db.prepare(`
      INSERT INTO propietarios (rut, nombre, email, telefono) VALUES (?, ?, ?, ?)
      ON CONFLICT (rut) DO UPDATE SET email = COALESCE(email, excluded.email), telefono = COALESCE(telefono, excluded.telefono)
    `);
    for (const p of conDueno) {
      if (normalizarRut(p.propietario_rut) === p.propietario_rut) {
        insertar.run(p.propietario_rut, p.propietario_nombre?.trim() || 'Propietario', p.propietario_email || null, p.propietario_telefono || null);
      }
    }
  });
}

// --- Acceso sin contraseña ---

/**
 * Propietario por RUT, o por celular si ese número pertenece a un solo propietario. Un número de sólo
 * dígitos puede ser ambas cosas (912345678 también cuadra como RUT 91.234.567-8): se prueba RUT y luego celular.
 */
function resolver(identificador) {
  const texto = String(identificador ?? '').trim();
  if (!texto.startsWith('+')) {
    const rut = normalizarRut(texto);
    const porRut = rut && conAcceso(rut);
    if (porRut) return porRut;
    // Formato inequívoco de RUT (12.345.678-9 / 12345678-K): no se busca como celular
    if (/^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/.test(texto.replace(/\s/g, ''))) return null;
  }
  const tel = normalizarTelefono(texto);
  if (!tel) return null;
  const coinciden = db.prepare('SELECT * FROM propietarios WHERE telefono IS NOT NULL AND portal_habilitado = 1').all().filter((p) => normalizarTelefono(p.telefono) === tel);
  return coinciden.length === 1 ? coinciden[0] : null;
}

/**
 * Envía un código de 4 dígitos por WhatsApp (si está configurado) y por correo. Devuelve los canales
 * usados o null; la ruta responde igual en ambos casos para no revelar quién es propietario.
 */
export async function solicitarCodigo(identificador) {
  const p = resolver(identificador);
  if (!p || (!p.email && !p.telefono)) return null;
  const previo = db.prepare(`SELECT creado_en > datetime('now', '-60 seconds') reciente FROM codigos_propietario WHERE rut = ?`).get(p.rut);
  if (previo?.reciente) return null;

  const codigo = String(crypto.randomInt(0, 10_000)).padStart(4, '0');
  db.prepare(`
    INSERT INTO codigos_propietario (rut, codigo_hash, expira_en, intentos, creado_en)
    VALUES (?, ?, datetime('now', '+${CODIGO_MIN} minutes'), 0, datetime('now'))
    ON CONFLICT (rut) DO UPDATE SET codigo_hash = excluded.codigo_hash, expira_en = excluded.expira_en, intentos = 0, creado_en = excluded.creado_en
  `).run(p.rut, hmac(`codigo|${p.rut}|${codigo}`));

  const whatsapp = p.telefono ? await enviarCodigoWhatsApp(p.telefono, codigo) : false;
  if (p.email) enviarCodigoPropietario(p, codigo, CODIGO_MIN); // en segundo plano
  return { whatsapp, email: Boolean(p.email) };
}

function iniciarSesion(rut) {
  db.prepare(`UPDATE propietarios SET ultimo_ingreso_en = datetime('now') WHERE rut = ?`).run(rut);
  return { ...firmarSesion(SECRETO, { tipo: 'propietario', rut }, SESION_MS), propietario: publico(obtener(rut)) };
}

/** Código de 4 dígitos: vence en 10 minutos y admite 5 intentos (luego hay que pedir otro). */
export function verificarCodigo(identificador, codigo) {
  const p = resolver(identificador);
  const invalido = new PropietarioError('Código incorrecto o vencido. Solicita uno nuevo.', 401);
  if (!p) throw invalido;
  const fila = db.prepare(`SELECT *, expira_en > datetime('now') vigente FROM codigos_propietario WHERE rut = ?`).get(p.rut);
  if (!fila || !fila.vigente || fila.intentos >= MAX_INTENTOS) throw invalido;
  if (!igualesSeguro(hmac(`codigo|${p.rut}|${String(codigo ?? '').trim()}`), fila.codigo_hash)) {
    db.prepare('UPDATE codigos_propietario SET intentos = intentos + 1 WHERE rut = ?').run(p.rut);
    throw invalido;
  }
  db.prepare('DELETE FROM codigos_propietario WHERE rut = ?').run(p.rut);
  return iniciarSesion(p.rut);
}

/** Enlace de bienvenida / magic link: un solo uso y con vencimiento. */
export function canjearEnlace(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw new PropietarioError('Enlace inválido', 401);
  const hash = hmac(`enlace|${token}`);
  const { changes } = db.prepare(`
    UPDATE enlaces_propietario SET usado_en = datetime('now')
    WHERE token_hash = ? AND usado_en IS NULL AND expira_en > datetime('now')
  `).run(hash);
  if (!changes) throw new PropietarioError('Este enlace ya se usó o venció. Entra con tu RUT y te enviaremos un código.', 401);
  const { rut } = db.prepare('SELECT rut FROM enlaces_propietario WHERE token_hash = ?').get(hash);
  if (!conAcceso(rut)) throw new PropietarioError('Tu acceso al portal no está habilitado. Contáctanos.', 401);
  return iniciarSesion(rut);
}

export function rutDeSesion(token) {
  return sesionDe(token)?.rut ?? null;
}

/**
 * { rut, impersonacion } de un token válido, o null. La vista del admin ("ver como propietario") también
 * funciona si el propietario aún no tiene acceso habilitado: sirve para revisar su portal antes de invitarlo.
 */
export function sesionDe(token) {
  const d = leerSesion(SECRETO, 'propietario', token);
  if (!d) return null;
  const imp = d.imp === true;
  return (imp ? obtener(d.rut) : conAcceso(d.rut)) ? { rut: d.rut, impersonacion: imp } : null;
}

/** Sesión de sólo lectura (1 hora) para que el admin vea el portal como este propietario. */
export function sesionImpersonacion(rut) {
  const p = obtener(rut);
  if (!p) throw new PropietarioError('Propietario no encontrado', 404);
  return { ...firmarSesion(SECRETO, { tipo: 'propietario', rut, imp: true }, 60 * 60 * 1000), nombre: p.nombre, rut };
}

/** Todos los propietarios (tabla del panel y selector del modo impersonación). */
export function listar(q = '') {
  if (String(q).trim().length >= 2) return buscar(q);
  return db.prepare('SELECT * FROM propietarios ORDER BY nombre LIMIT 500').all().map(ficha);
}

// --- Panel del propietario (todo filtrado por su RUT) ---

const imagen = (json) => { try { return JSON.parse(json || '[]')[0] ?? null; } catch { return null; } };
const nochesEn = (inicio, fin, desde, hasta) => Math.max(0, diferenciaDias(inicio > desde ? inicio : desde, fin < hasta ? fin : hasta));

/** Fila de liquidación sin datos de huéspedes ni notas internas de la corredora. */
const paraPropietario = ({ cliente_nombre, liquidacion_notas, propietario_email, propietario_telefono, ...f }) => f;

export function panel(rut) {
  const propiedades = db.prepare(`
    SELECT id, titulo, comuna, direccion, modalidad, tipo, estado, disponible, imagenes, precio_clp, precio_uf, moneda_original,
           habitaciones, banos, aseo_clp, comision_diario_pct
    FROM propiedades WHERE propietario_rut = ? AND eliminada_en IS NULL ORDER BY estado, titulo
  `).all(rut).map(({ imagenes, ...p }) => ({
    ...p,
    imagen: imagen(imagenes),
    disponible: Boolean(p.disponible),
    comision_pct: p.modalidad === 'arriendo_diario' ? p.comision_diario_pct ?? config.comision.diarioPct : null,
  }));

  const hoy = hoyChile();
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const finMes = sumarDias(`${sumarDias(inicioMes, 32).slice(0, 7)}-01`, -1);
  const mes = Liquidacion.listar({ desde: inicioMes, hasta: finMes, propietario_rut: rut });
  const todo = Liquidacion.listar({ desde: '2000-01-01', hasta: '2999-12-31', propietario_rut: rut });

  // Ocupación del mes: noches reservadas (pagadas) sobre noches disponibles (sin bloqueos) de sus propiedades diarias
  const diarias = propiedades.filter((p) => p.modalidad === 'arriendo_diario' && p.estado === 'activa');
  const finExcl = sumarDias(finMes, 1);
  const diasMes = diferenciaDias(inicioMes, finExcl);
  let reservadas = 0;
  let bloqueadas = 0;
  for (const p of diarias) {
    for (const r of db.prepare(`SELECT fecha_inicio, fecha_fin FROM reservas WHERE propiedad_id = ? AND estado_pago = 'pagado' AND fecha_inicio < ? AND fecha_fin > ?`).all(p.id, finExcl, inicioMes)) {
      reservadas += nochesEn(r.fecha_inicio, r.fecha_fin, inicioMes, finExcl);
    }
    for (const b of db.prepare('SELECT fecha_inicio, fecha_fin FROM bloqueos WHERE propiedad_id = ? AND fecha_inicio < ? AND fecha_fin > ?').all(p.id, finExcl, inicioMes)) {
      bloqueadas += nochesEn(b.fecha_inicio, b.fecha_fin, inicioMes, finExcl);
    }
  }
  const disponibles = diasMes * diarias.length - bloqueadas;

  // Historial: una fila por transferencia (lote)
  const lotes = new Map();
  for (const f of todo.filas.filter((x) => x.estado === 'liquidada')) {
    if (!lotes.has(f.lote)) {
      lotes.set(f.lote, {
        lote: f.lote, fecha_transferencia: f.fecha_transferencia, comprobante: f.comprobante, tiene_archivo: Boolean(f.comprobante_archivo),
        desde: f.fecha_inicio, hasta: f.fecha_fin, reservas: 0, noches: 0, bruto_clp: 0, aseo_clp: 0, comision_clp: 0, iva_clp: 0, neto_clp: 0, filas: [],
      });
    }
    const l = lotes.get(f.lote);
    l.reservas++;
    for (const k of ['noches', 'bruto_clp', 'aseo_clp', 'comision_clp', 'iva_clp', 'neto_clp']) l[k] += f[k] ?? 0;
    if (f.fecha_inicio < l.desde) l.desde = f.fecha_inicio;
    if (f.fecha_fin > l.hasta) l.hasta = f.fecha_fin;
    l.filas.push(paraPropietario(f));
  }

  return {
    propietario: publico(obtener(rut)),
    mes: { desde: inicioMes, hasta: finMes },
    iva_pct: Liquidacion.ivaPct(),
    kpis: {
      neto_mes_clp: mes.resumen.neto_clp,
      reservas_mes: mes.resumen.reservas,
      ocupacion_pct: disponibles > 0 ? Math.round((reservadas / disponibles) * 1000) / 10 : null,
      noches_reservadas_mes: reservadas,
      noches_disponibles_mes: Math.max(disponibles, 0),
      historico_recibido_clp: todo.resumen.neto_liquidado_clp,
      pendiente_clp: todo.resumen.neto_pendiente_clp,
      pendientes: todo.resumen.pendientes,
    },
    propiedades,
    liquidaciones: [...lotes.values()].sort((a, b) => (a.fecha_transferencia < b.fecha_transferencia ? 1 : -1)),
    pendientes: todo.filas.filter((x) => x.estado === 'pendiente').map(paraPropietario),
  };
}

/** Ocupación de una propiedad suya (sin datos de huéspedes): reservado / por confirmar / mantención. */
export function calendario(rut, propiedadId, desde, hasta) {
  const p = db.prepare(`SELECT id, modalidad FROM propiedades WHERE id = ? AND propietario_rut = ?`).get(propiedadId, rut);
  if (!p) throw new PropietarioError('Propiedad no encontrada', 404);
  if (p.modalidad !== 'arriendo_diario') throw new PropietarioError('El calendario de ocupación es para propiedades de arriendo diario');
  if (!esFechaValida(desde) || !esFechaValida(hasta) || hasta <= desde || diferenciaDias(desde, hasta) > 120) {
    throw new PropietarioError('Rango de fechas inválido');
  }
  const rangos = [
    ...db.prepare(`
      SELECT fecha_inicio, fecha_fin, CASE estado_pago WHEN 'pagado' THEN 'reservado' ELSE 'por_confirmar' END AS tipo
      FROM reservas WHERE propiedad_id = ? AND estado_pago IN ('pendiente', 'pagado') AND fecha_inicio < ? AND fecha_fin > ?
    `).all(p.id, hasta, desde),
    ...db.prepare(`SELECT fecha_inicio, fecha_fin, 'mantencion' AS tipo FROM bloqueos WHERE propiedad_id = ? AND fecha_inicio < ? AND fecha_fin > ?`).all(p.id, hasta, desde),
  ];
  return { hoy: hoyChile(), desde, hasta, rangos };
}

/** Lote de liquidación que pertenece por completo a este propietario (para su comprobante). */
export function exigirLotePropio(rut, lote) {
  if (Liquidacion.propietarioDeLote(lote) !== rut) throw new PropietarioError('Liquidación no encontrada', 404);
}
