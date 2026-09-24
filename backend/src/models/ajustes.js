// Configuración del sitio definida en el asistente (/admin/setup). Se guarda en la base de datos y se
// aplica sobre `config` al iniciar y al guardar (sin reiniciar). Lo que no se configuró sigue tomando
// el valor de backend/.env.
import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { config } from '../config.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS configuracion_sitio (
    seccion        TEXT PRIMARY KEY,   -- corredora | finanzas | correo | pagos | seguridad | setup
    valor          TEXT NOT NULL,      -- JSON
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Valores de backend/.env, para volver a ellos si una sección se borra
const ENV = structuredClone({
  marca: config.marca, comision: config.comision, liquidacion: config.liquidacion, correo: config.correo,
  webpay: config.pagos.webpay, mercadopago: config.pagos.mercadopago, transferencia: config.pagos.transferencia,
});

const oyentes = [];
/** Módulos que guardan estado derivado de la configuración (p. ej. la conexión SMTP) se registran aquí. */
export function alCambiar(fn) {
  oyentes.push(fn);
}

export function leer(seccion) {
  const fila = db.prepare('SELECT valor FROM configuracion_sitio WHERE seccion = ?').get(seccion);
  return fila ? JSON.parse(fila.valor) : null;
}

export function guardar(seccion, valor) {
  db.prepare(`
    INSERT INTO configuracion_sitio (seccion, valor) VALUES (?, ?)
    ON CONFLICT (seccion) DO UPDATE SET valor = excluded.valor, actualizado_en = datetime('now')
  `).run(seccion, JSON.stringify(valor));
}

/**
 * Aplica lo guardado sobre el objeto `config` (mutándolo: los módulos que lo importaron ven el cambio).
 * Una sección guardada manda por completo (un campo vacío = desactivado); sin guardar, rige backend/.env.
 */
export function aplicar() {
  const c = leer('corredora');
  Object.assign(config.marca, c
    ? { nombre: c.nombre, telefono: c.telefono, email: c.email, rut: c.rut, direccion: c.direccion, logo: c.logo }
    : ENV.marca);

  const f = leer('finanzas');
  Object.assign(config.comision, f
    ? { ventaPct: f.comision_venta_pct, arriendoPct: f.comision_arriendo_pct, diarioPct: f.comision_diario_pct, masIva: f.iva_activo }
    : ENV.comision);
  config.liquidacion.aseoBaseClp = f ? f.aseo_base_clp : ENV.liquidacion.aseoBaseClp;

  const m = leer('correo');
  Object.assign(config.correo, m
    ? { host: m.host, port: m.port, secure: m.secure, user: m.user, pass: m.pass, from: m.from, avisosA: m.avisos }
    : { ...ENV.correo, avisosA: [...ENV.correo.avisosA] });

  const p = leer('pagos');
  Object.assign(config.pagos.webpay, p
    ? { ambiente: p.webpay_ambiente, codigoComercio: p.webpay_codigo_comercio, apiKey: p.webpay_api_key }
    : ENV.webpay);
  config.pagos.mercadopago.accessToken = p ? p.mp_access_token : ENV.mercadopago.accessToken;
  // Cuenta para que los huéspedes paguen por transferencia (sin número de cuenta = desactivada).
  // Secciones guardadas antes de existir este campo siguen usando backend/.env.
  Object.assign(config.pagos.transferencia, p?.transferencia !== undefined
    ? {
        banco: p.transferencia?.banco ?? '',
        tipoCuenta: p.transferencia?.tipo_cuenta ?? '',
        numeroCuenta: p.transferencia?.numero_cuenta ?? '',
        titular: p.transferencia?.titular ?? '',
        rut: p.transferencia?.rut ?? '',
        email: p.transferencia?.email ?? '',
      }
    : ENV.transferencia);

  config.adminPasswordHash = leer('seguridad')?.password_hash ?? null;
  config.tema = leer('tema');
  for (const fn of oyentes) fn();
}

// --- Contraseña del panel (scrypt) ---

const SCRYPT = { N: 16384, r: 8, p: 1, largo: 64 };

export function hashPassword(password) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, sal, SCRYPT.largo, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export function verificarPassword(password, almacenado) {
  const [alg, n, sal, hash] = String(almacenado ?? '').split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = crypto.scryptSync(String(password ?? ''), Buffer.from(sal, 'base64'), esperado.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(calculado, esperado);
}

/** ¿La contraseña del panel se definió en el asistente? (si no, se usa la de backend/.env o no hay ninguna) */
export const passwordPropia = () => Boolean(config.adminPasswordHash);

export function setupCompletado() {
  return Boolean(leer('setup')?.completado_en);
}

aplicar();
