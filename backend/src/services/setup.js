import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import * as Ajustes from '../models/ajustes.js';
import { esAdmin, loginHabilitado, passwordCorrecta, emitirSesion } from '../middleware/auth.js';
import { normalizarRut, normalizarTelefono, formatearRut } from '../lib/identidad.js';
import { detectarTipo, recibirArchivo } from '../lib/archivos.js';
import { enviarPrueba } from './email.js';
import { TIPOS_CUENTA } from '../models/propietario.js';
import * as Tema from './tema.js';

export const DIR_MARCA = path.join(path.resolve(config.respaldos.uploadsDir), 'marca');
export const URL_MARCA = '/media/marca';
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEBILES = ['admin', 'password', 'contraseña', 'contrasena', '123456', 'qwerty', 'inmobiliaria', 'cambiar', 'changeme'];

export class SetupError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// --- Acceso al asistente ---

/** Instalación nueva: todavía no hay contraseña del panel (ni en .env ni en la base). */
export const instalacionNueva = () => !loginHabilitado();

let codigoInstalacion = null;

/**
 * En una instalación nueva no hay con qué iniciar sesión: se genera un código de un solo uso que
 * sólo ve quien tiene acceso a la consola del servidor (como Grafana o Jupyter).
 */
export function prepararCodigoInstalacion() {
  if (!instalacionNueva() || Ajustes.setupCompletado()) return;
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  const c = [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
  codigoInstalacion = `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
  console.log(`\n[setup] Instalación nueva. Entra a ${config.siteUrl}/admin/setup con este código: ${codigoInstalacion}\n`);
}

const codigoValido = (c) => {
  if (!codigoInstalacion || typeof c !== 'string') return false;
  const a = crypto.createHash('sha256').update(c.trim().toUpperCase()).digest();
  const b = crypto.createHash('sha256').update(codigoInstalacion).digest();
  return crypto.timingSafeEqual(a, b);
};

/** Admin con sesión, o el código de instalación mientras no exista contraseña. */
export function requireSetup(req, res, next) {
  if (esAdmin(req)) return next();
  if (instalacionNueva() && codigoValido(req.get('x-setup-token'))) return next();
  res.status(401).json({ error: instalacionNueva() ? 'Código de instalación inválido' : 'Inicia sesión en el panel para configurar el sitio', requiere: instalacionNueva() ? 'codigo' : 'login' });
}

export function estadoPublico() {
  return { completado: Ajustes.setupCompletado(), instalacion_nueva: instalacionNueva() };
}

export function sitioPublico() {
  const m = config.marca;
  const t = config.tema;
  return {
    nombre: m.nombre, telefono: m.telefono || null, email: m.email || null, direccion: m.direccion || null, logo: m.logo || null,
    // Sin documentos: el manual de marca es interno
    tema: t ? { primario: t.primario, acento: t.acento, logo_claro: t.logo_claro, favicon: t.favicon, fuente: t.fuente } : null,
  };
}

// --- Datos actuales para el formulario (los secretos nunca se devuelven) ---

export function datos() {
  const c = config;
  return {
    completado: Ajustes.setupCompletado(),
    corredora: { nombre: c.marca.nombre, rut: c.marca.rut, direccion: c.marca.direccion, telefono: c.marca.telefono, email: c.marca.email, logo: c.marca.logo },
    finanzas: {
      comision_venta_pct: c.comision.ventaPct,
      comision_arriendo_pct: c.comision.arriendoPct,
      comision_diario_pct: c.comision.diarioPct,
      iva_activo: c.comision.masIva,
      aseo_base_clp: c.liquidacion.aseoBaseClp,
    },
    correo: {
      host: c.correo.host, port: c.correo.port, secure: c.correo.secure, user: c.correo.user, from: c.correo.from,
      avisos: c.correo.avisosA, tiene_pass: Boolean(c.correo.pass),
    },
    pagos: {
      webpay_ambiente: c.pagos.webpay.ambiente,
      webpay_codigo_comercio: c.pagos.webpay.codigoComercio,
      tiene_webpay_api_key: Boolean(c.pagos.webpay.apiKey),
      mercadopago_activo: Boolean(c.pagos.mercadopago.accessToken),
      mp_modo: c.pagos.mercadopago.accessToken ? (c.pagos.mercadopago.accessToken.startsWith('TEST-') ? 'pruebas' : 'produccion') : null,
      // No es secreto: se muestra a los huéspedes en la página de pago
      transferencia_activa: Boolean(c.pagos.transferencia.numeroCuenta),
      transferencia: {
        banco: c.pagos.transferencia.banco, tipo_cuenta: c.pagos.transferencia.tipoCuenta, numero_cuenta: c.pagos.transferencia.numeroCuenta,
        titular: c.pagos.transferencia.titular, rut: c.pagos.transferencia.rut, email: c.pagos.transferencia.email,
      },
    },
    seguridad: { password_propia: Ajustes.passwordPropia(), instalacion_nueva: instalacionNueva() },
    tema: c.tema,
    tipos_cuenta: TIPOS_CUENTA,
  };
}

// --- Validación y guardado ---

const pct = (v, campo) => {
  const n = Number(v);
  if (v === '' || v == null || !Number.isFinite(n) || n < 0 || n > 100) throw new SetupError(`${campo}: debe ser un porcentaje entre 0 y 100`);
  return n;
};
const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validarCorredora(d = {}, temaId = null) {
  const nombre = texto(d.nombre, 80);
  if (nombre.length < 2) throw new SetupError('Indica el nombre comercial de la corredora');
  const rut = d.rut ? normalizarRut(d.rut) : '';
  if (d.rut && !rut) throw new SetupError('RUT de la corredora inválido (revisa el dígito verificador)');
  const tel = normalizarTelefono(d.telefono);
  if (!tel) throw new SetupError('Indica el teléfono / WhatsApp de la corredora');
  const email = texto(d.email, 160).toLowerCase();
  if (!RE_EMAIL.test(email)) throw new SetupError('Correo corporativo inválido');
  // Logo subido en el paso 1 o elegido del kit de la línea gráfica (paso 2)
  const logo = d.logo || null;
  const logoPaso1 = typeof logo === 'string' && logo.startsWith(`${URL_MARCA}/`) && fs.existsSync(path.join(DIR_MARCA, path.basename(logo)));
  if (logo && !logoPaso1 && !Tema.esUrlTema(temaId, logo)) throw new SetupError('Logo inválido: vuelve a subirlo');
  return { nombre, rut, direccion: texto(d.direccion, 200), telefono: texto(d.telefono, 30), email, logo };
}

function validarFinanzas(d = {}) {
  const aseo = Number(d.aseo_base_clp || 0);
  if (!Number.isInteger(aseo) || aseo < 0 || aseo > 5_000_000) throw new SetupError('Aseo base: monto entero entre 0 y 5.000.000');
  return {
    comision_venta_pct: pct(d.comision_venta_pct, 'Comisión de venta'),
    comision_arriendo_pct: pct(d.comision_arriendo_pct, 'Comisión de arriendo mensual'),
    comision_diario_pct: pct(d.comision_diario_pct, 'Comisión de arriendo diario'),
    iva_activo: Boolean(d.iva_activo),
    aseo_base_clp: aseo,
  };
}

/** SMTP: la contraseña vacía conserva la actual. */
function validarCorreo(d = {}) {
  const host = texto(d.host, 120);
  const avisos = (Array.isArray(d.avisos) ? d.avisos : String(d.avisos ?? '').split(','))
    .map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  for (const e of avisos) if (!RE_EMAIL.test(e)) throw new SetupError(`Correo de avisos inválido: ${e}`);
  if (!host) return { host: '', port: 587, secure: false, user: '', pass: '', from: '', avisos };
  const port = Number(d.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new SetupError('Puerto SMTP inválido');
  return {
    host,
    port,
    secure: Boolean(d.secure),
    user: texto(d.user, 160),
    pass: d.pass ? String(d.pass) : config.correo.pass,
    from: texto(d.from, 200),
    avisos,
  };
}

function validarPagos(d = {}) {
  const ambiente = d.webpay_ambiente ?? '';
  if (!['', 'integracion', 'produccion'].includes(ambiente)) throw new SetupError('Ambiente de Webpay inválido');
  const codigo = texto(d.webpay_codigo_comercio, 20);
  const apiKey = d.webpay_api_key ? String(d.webpay_api_key).trim() : config.pagos.webpay.apiKey;
  if (ambiente === 'produccion' && (!/^\d{6,15}$/.test(codigo) || !apiKey)) {
    throw new SetupError('Webpay en producción requiere el código de comercio y la API key que entrega Transbank');
  }
  const mpActivo = Boolean(d.mercadopago_activo);
  const token = d.mp_access_token ? String(d.mp_access_token).trim() : config.pagos.mercadopago.accessToken;
  if (mpActivo && !token) throw new SetupError('Ingresa el Access Token de Mercado Pago o desactívalo');
  if (mpActivo && d.mp_access_token && !/^(TEST|APP_USR)-[\w-]{20,}$/.test(token)) throw new SetupError('El Access Token de Mercado Pago debe empezar con APP_USR- (o TEST- para pruebas)');
  return {
    webpay_ambiente: ambiente,
    webpay_codigo_comercio: ambiente === 'produccion' ? codigo : '',
    webpay_api_key: ambiente === 'produccion' ? apiKey : '',
    mp_access_token: mpActivo ? token : '',
    transferencia: validarTransferencia(d),
  };
}

/** Cuenta de la corredora para pagos por transferencia (null = desactivada). */
function validarTransferencia(d) {
  if (!d.transferencia_activa) return null;
  const t = d.transferencia ?? {};
  const banco = texto(t.banco, 60);
  const numero = String(t.numero_cuenta ?? '').replace(/\s+/g, '');
  const titular = texto(t.titular, 120);
  const rut = normalizarRut(t.rut);
  const email = texto(t.email, 160).toLowerCase();
  if (!banco) throw new SetupError('Transferencia: indica el banco');
  if (!TIPOS_CUENTA.includes(t.tipo_cuenta)) throw new SetupError(`Transferencia: tipo de cuenta (${TIPOS_CUENTA.join(', ')})`);
  if (!/^[0-9-]{4,20}$/.test(numero)) throw new SetupError('Transferencia: n° de cuenta inválido (sólo números y guiones)');
  if (titular.length < 3) throw new SetupError('Transferencia: indica el titular de la cuenta');
  if (!rut) throw new SetupError('Transferencia: RUT del titular inválido');
  if (email && !RE_EMAIL.test(email)) throw new SetupError('Transferencia: correo para comprobantes inválido');
  return { banco, tipo_cuenta: t.tipo_cuenta, numero_cuenta: numero, titular, rut: formatearRut(rut), email };
}

function validarPassword(d = {}) {
  const nueva = d.password_nueva ?? '';
  if (!nueva) {
    // Obligatorio mientras siga la contraseña de backend/.env (o no haya ninguna)
    if (!Ajustes.passwordPropia()) throw new SetupError('Define una contraseña nueva para el panel de administración');
    return null;
  }
  if (nueva.length < 12) throw new SetupError('La contraseña debe tener al menos 12 caracteres');
  if (nueva !== d.password_confirmacion) throw new SetupError('La confirmación no coincide con la contraseña');
  if (DEBILES.some((w) => nueva.toLowerCase().includes(w)) || /^(.)\1+$/.test(nueva)) throw new SetupError('La contraseña es demasiado fácil de adivinar');
  if (loginHabilitado() && passwordCorrecta(nueva)) throw new SetupError('La contraseña nueva debe ser distinta de la actual');
  if (config.marca.nombre && nueva.toLowerCase().includes(config.marca.nombre.toLowerCase())) throw new SetupError('No uses el nombre de la corredora en la contraseña');
  return Ajustes.hashPassword(nueva);
}

/**
 * Valida los 4 pasos, guarda todo y aplica la configuración sin reiniciar. Como cambiar la
 * contraseña invalida las sesiones, devuelve una sesión nueva para seguir en el panel.
 */
export function finalizar(d = {}) {
  let tema;
  try {
    tema = Tema.validar(d.tema);
  } catch (err) {
    throw new SetupError(err.message);
  }
  const corredora = validarCorredora(d.corredora, tema?.id);
  const finanzas = validarFinanzas(d.finanzas);
  const correo = validarCorreo(d.correo);
  const pagos = validarPagos(d.pagos);
  const hash = validarPassword(d.seguridad);

  Ajustes.guardar('tema', tema);
  Tema.limpiar(tema?.id); // kits subidos que no quedaron en uso
  Ajustes.guardar('corredora', corredora);
  Ajustes.guardar('finanzas', finanzas);
  Ajustes.guardar('correo', correo);
  Ajustes.guardar('pagos', pagos);
  if (hash) Ajustes.guardar('seguridad', { password_hash: hash, cambiada_en: new Date().toISOString() });
  Ajustes.guardar('setup', { completado_en: new Date().toISOString(), version: 1 });
  Ajustes.aplicar();
  codigoInstalacion = null; // ya hay contraseña: el código deja de servir
  return { ok: true, sesion: emitirSesion(), password_cambiada: Boolean(hash) };
}

/** Correo de prueba con los datos del paso 3 (aún sin guardar). */
export async function probarCorreo({ smtp, para } = {}) {
  const s = validarCorreo(smtp);
  if (!s.host) throw new SetupError('Completa el servidor SMTP');
  const destino = texto(para, 160);
  if (!RE_EMAIL.test(destino)) throw new SetupError('Indica a qué correo enviar la prueba');
  try {
    await enviarPrueba(s, destino);
  } catch (err) {
    throw new SetupError(`No se pudo enviar: ${err.message}`, 422);
  }
  return { ok: true };
}

/** Logo (PNG, JPG o WEBP, máx. 2 MB). SVG no se acepta: puede contener scripts. */
export async function subirLogo(req) {
  fs.mkdirSync(DIR_MARCA, { recursive: true });
  const temporal = path.join(DIR_MARCA, `.subida_${crypto.randomBytes(6).toString('hex')}`);
  try {
    await recibirArchivo(req, temporal, 2 * 1024 * 1024, (m, s) => new SetupError(m, s));
    const tipo = detectarTipo(temporal);
    if (!tipo || tipo.ext === 'pdf') throw new SetupError('El logo debe ser PNG, JPG o WEBP');
    const archivo = `logo_${crypto.randomBytes(6).toString('hex')}.${tipo.ext}`;
    fs.renameSync(temporal, path.join(DIR_MARCA, archivo));
    return { url: `${URL_MARCA}/${archivo}` };
  } finally {
    fs.rmSync(temporal, { force: true });
  }
}
