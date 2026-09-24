import crypto from 'node:crypto';
import { db } from '../db/database.js';

/**
 * Secreto aleatorio persistente (tabla ajustes_sistema). Cada portal usa el suyo, así un token de
 * cliente o de propietario nunca sirve en otro portal ni en /admin.
 */
export function obtenerSecreto(clave) {
  const leer = () => db.prepare('SELECT valor FROM ajustes_sistema WHERE clave = ?').get(clave)?.valor;
  const actual = leer();
  if (actual) return actual;
  db.prepare('INSERT OR IGNORE INTO ajustes_sistema (clave, valor) VALUES (?, ?)').run(clave, crypto.randomBytes(32).toString('base64url'));
  return leer();
}

export function igualesSeguro(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Token de sesión firmado: base64url(payload).firma — `tipo` distingue cada portal. */
export function firmarSesion(clave, datos, duracionMs) {
  const exp = Date.now() + duracionMs;
  const payload = Buffer.from(JSON.stringify({ ...datos, exp })).toString('base64url');
  const firma = crypto.createHmac('sha256', obtenerSecreto(clave)).update(`sesion|${payload}`).digest('base64url');
  return { token: `${payload}.${firma}`, expira: new Date(exp).toISOString() };
}

/** Datos de un token válido del `tipo` indicado, o null. */
export function leerSesion(clave, tipo, token) {
  const [payload, firma] = String(token ?? '').split('.');
  if (!payload || !firma) return null;
  const esperada = crypto.createHmac('sha256', obtenerSecreto(clave)).update(`sesion|${payload}`).digest('base64url');
  if (!igualesSeguro(firma, esperada)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return d.tipo === tipo && d.exp > Date.now() ? d : null;
  } catch {
    return null;
  }
}
