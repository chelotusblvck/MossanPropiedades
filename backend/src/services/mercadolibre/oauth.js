import crypto from 'node:crypto';
import { db } from '../../db/database.js';
import { config, meliConfigurado } from '../../config.js';

export class MeliError extends Error {
  constructor(message, status, detalle) {
    super(message);
    this.status = status;
    this.detalle = detalle;
  }
}

// state -> { verifier, expira }  (flujo OAuth en curso, válido 10 minutos)
const pendientes = new Map();
const MARGEN_EXPIRACION_MS = 5 * 60 * 1000;
let refrescoEnCurso = null;

function asegurarConfigurado() {
  if (!meliConfigurado()) throw new MeliError('Faltan MELI_CLIENT_ID / MELI_CLIENT_SECRET en backend/.env', 503);
}

/** Paso 1: URL a la que se redirige al cliente para que autorice nuestra app en Mercado Libre. */
export function crearUrlAutorizacion() {
  asegurarConfigurado();
  for (const [s, p] of pendientes) if (p.expira < Date.now()) pendientes.delete(s);

  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.meli.clientId,
    redirect_uri: config.meli.redirectUri,
    state,
  });

  let verifier = null;
  if (config.meli.usePkce) {
    verifier = crypto.randomBytes(32).toString('base64url');
    params.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('base64url'));
    params.set('code_challenge_method', 'S256');
  }
  pendientes.set(state, { verifier, expira: Date.now() + 10 * 60 * 1000 });
  return `${config.meli.authUrl}?${params}`;
}

async function solicitarToken(campos) {
  const res = await fetch(`${config.meli.apiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: config.meli.clientId,
      client_secret: config.meli.clientSecret,
      ...campos,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new MeliError(`Error OAuth de Mercado Libre: ${data.message || data.error || res.status}`, res.status, data);
  return data;
}

function guardarTokens(t) {
  db.prepare(`
    INSERT INTO meli_tokens (id, user_id, access_token, refresh_token, expires_at, scope, actualizado_en)
    VALUES (1, $user_id, $access_token, $refresh_token, $expires_at, $scope, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id, access_token = excluded.access_token, refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at, scope = excluded.scope, actualizado_en = excluded.actualizado_en
  `).run({
    user_id: String(t.user_id),
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: Date.now() + t.expires_in * 1000,
    scope: t.scope ?? null,
  });
}

function leerTokens() {
  return db.prepare('SELECT * FROM meli_tokens WHERE id = 1').get() ?? null;
}

/** Paso 2: intercambia el "code" del callback por access_token + refresh_token. */
export async function intercambiarCodigo(code, state) {
  asegurarConfigurado();
  const pendiente = pendientes.get(state);
  pendientes.delete(state);
  if (!pendiente || pendiente.expira < Date.now()) throw new MeliError('Parámetro state inválido o expirado', 400);

  const tokens = await solicitarToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.meli.redirectUri,
    ...(pendiente.verifier ? { code_verifier: pendiente.verifier } : {}),
  });
  guardarTokens(tokens);
  return { userId: String(tokens.user_id) };
}

/** Renueva el access_token (dura 6 h). El refresh_token de ML es de un solo uso, así que se guarda el nuevo. */
export async function refrescarToken() {
  if (refrescoEnCurso) return refrescoEnCurso;
  refrescoEnCurso = (async () => {
    const actual = leerTokens();
    if (!actual) throw new MeliError('No hay cuenta de Mercado Libre conectada', 401);
    const tokens = await solicitarToken({ grant_type: 'refresh_token', refresh_token: actual.refresh_token });
    guardarTokens(tokens);
    return tokens.access_token;
  })().finally(() => { refrescoEnCurso = null; });
  return refrescoEnCurso;
}

/** Devuelve un access_token válido, renovándolo si está por expirar. */
export async function obtenerAccessToken() {
  asegurarConfigurado();
  const t = leerTokens();
  if (!t) throw new MeliError('No hay cuenta de Mercado Libre conectada. Visite /api/mercadolibre/auth', 401);
  if (t.expires_at - MARGEN_EXPIRACION_MS > Date.now()) return t.access_token;
  return refrescarToken();
}

export function usuarioConectado() {
  return leerTokens()?.user_id ?? null;
}

export function estadoConexion() {
  const t = leerTokens();
  return {
    configurado: meliConfigurado(),
    conectado: Boolean(t),
    user_id: t?.user_id ?? null,
    token_expira: t ? new Date(t.expires_at).toISOString() : null,
    actualizado_en: t?.actualizado_en ?? null,
  };
}

export function desconectar() {
  db.prepare('DELETE FROM meli_tokens WHERE id = 1').run();
}
