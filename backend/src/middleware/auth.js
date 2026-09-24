import crypto from 'node:crypto';
import { config } from '../config.js';
import { verificarPassword } from '../models/ajustes.js';

const SESION_MS = 12 * 60 * 60 * 1000;

// El secreto de firma depende de las credenciales: si cambias la clave, se invalidan las sesiones.
// La contraseña definida en el asistente (hash en la base de datos) reemplaza a ADMIN_PASSWORD.
const credencial = () => config.adminPasswordHash ?? config.adminPassword;
const secreto = () => crypto.createHash('sha256').update(`sesion|${config.adminApiKey}|${credencial()}`).digest();
const firmar = (payload) => crypto.createHmac('sha256', secreto()).update(payload).digest('base64url');

function igualesSeguro(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export const loginHabilitado = () => Boolean(credencial());

export function passwordCorrecta(password) {
  if (config.adminPasswordHash) return verificarPassword(password, config.adminPasswordHash);
  return Boolean(config.adminPassword) && igualesSeguro(password ?? '', config.adminPassword);
}

/** Token de sesión firmado (HMAC). */
export function emitirSesion() {
  const expira = Date.now() + SESION_MS;
  const payload = Buffer.from(JSON.stringify({ exp: expira })).toString('base64url');
  return { token: `${payload}.${firmar(payload)}`, expira: new Date(expira).toISOString() };
}

/** Verifica la contraseña del panel y entrega un token de sesión. */
export function iniciarSesion(password) {
  if (!loginHabilitado() || !passwordCorrecta(password)) return null;
  return emitirSesion();
}

export function tokenValido(token) {
  const [payload, firma] = String(token).split('.');
  if (!payload || !firma || !igualesSeguro(firma, firmar(payload))) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now();
  } catch {
    return false;
  }
}

/**
 * ¿La petición trae una sesión de admin o la API key?
 *  - Authorization: Bearer <token de sesión>   (panel /admin)
 *  - x-api-key: <ADMIN_API_KEY> o ?key=        (scripts, integración)
 * Sin ninguna credencial configurada nunca es admin (el secreto de firma sería predecible).
 */
export function esAdmin(req) {
  if (!config.adminApiKey && !loginHabilitado()) return false;
  const bearer = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (bearer && tokenValido(bearer)) return true;
  const clave = req.get('x-api-key') ?? req.query.key;
  return Boolean(config.adminApiKey && clave && igualesSeguro(clave, config.adminApiKey));
}

export function requireAdmin(req, res, next) {
  if (!config.adminApiKey && !loginHabilitado()) {
    return res.status(503).json({ error: 'Falta la configuración inicial: entra a /admin/setup con el código de instalación que aparece en la consola del servidor' });
  }
  if (esAdmin(req)) return next();
  res.status(401).json({ error: 'No autorizado' });
}
