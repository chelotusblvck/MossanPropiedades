// Estado del sistema para la pestaña "Estado / Desarrollador" del panel.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { config } from '../config.js';
import * as Ajustes from '../models/ajustes.js';
import * as Respaldos from './respaldos.js';
import { obtenerUF } from './uf.js';
import { verificarSmtp } from './email.js';
import { webpayDisponible, webpayEnPruebas } from './pagos/webpay.js';
import { mercadoPagoDisponible, mercadoPagoEnPruebas } from './pagos/mercadopago.js';
import { whatsappConfigurado } from './whatsapp.js';
import { loginHabilitado } from '../middleware/auth.js';
import { DIR_TEMA, URL_TEMA } from './tema.js';

const INICIO = Date.now();
const version = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const MB = 1024 * 1024;
const redondear = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// Pasos del asistente (/admin/setup?paso=N)
const PASO = { corredora: 1, tema: 2, finanzas: 3, integraciones: 4, seguridad: 5 };
const setup = (paso, texto = 'Configurar') => ({ tipo: 'setup', paso, texto });
const pestana = (nombre, texto) => ({ tipo: 'pestana', pestana: nombre, texto });

function baseDeDatos() {
  const ruta = path.resolve(config.dbPath);
  const bytes = ['', '-wal', '-shm'].reduce((a, s) => a + (fs.existsSync(ruta + s) ? fs.statSync(ruta + s).size : 0), 0);
  const chequeo = Object.values(db.prepare('PRAGMA quick_check').get())[0];
  const contar = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  return {
    id: 'base_datos',
    titulo: 'Base de datos SQLite',
    estado: chequeo === 'ok' ? 'ok' : 'error',
    detalle: chequeo === 'ok'
      ? `Conectada · ${redondear(bytes / MB, 2)} MB · ${contar('propiedades')} propiedades, ${contar('reservas')} reservas, ${contar('liquidaciones')} liquidaciones`
      : `Integridad con problemas: ${chequeo}. Restaura un respaldo.`,
    accion: chequeo === 'ok' ? null : pestana('respaldos', 'Ir a respaldos'),
  };
}

/** Prueba real de escritura (crear y borrar un archivo), no sólo permisos declarados. */
function carpeta(id, titulo, dir) {
  const ruta = path.resolve(dir);
  try {
    fs.mkdirSync(ruta, { recursive: true });
    const prueba = path.join(ruta, `.prueba_${crypto.randomBytes(4).toString('hex')}`);
    fs.writeFileSync(prueba, 'ok');
    fs.rmSync(prueba);
    return { id, titulo, estado: 'ok', detalle: `Lectura y escritura OK · ${ruta}` };
  } catch (err) {
    return { id, titulo, estado: 'error', detalle: `No se puede escribir en ${ruta} (${err.code ?? err.message}). Revisa los permisos de la carpeta.` };
  }
}

async function uf() {
  const r = await obtenerUF();
  const valor = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 2 }).format(r.valor);
  return r.fuente === 'respaldo'
    ? { id: 'uf', titulo: 'API UF del día (mindicador.cl)', estado: 'advertencia', detalle: `Sin conexión: se usa el valor de respaldo ${valor} (UF_FALLBACK). Los precios en pesos pueden quedar desactualizados.` }
    : { id: 'uf', titulo: 'API UF del día (mindicador.cl)', estado: 'ok', detalle: `Conectada · UF ${valor}${r.fecha ? ` (${r.fecha.slice(0, 10)})` : ''}` };
}

async function correo() {
  const c = config.correo;
  const checks = [];
  if (!c.host) {
    checks.push({ id: 'smtp', titulo: 'Servicio de correos SMTP', estado: 'advertencia', detalle: 'No configurado: los correos (reservas, códigos de acceso, bienvenidas) sólo se muestran en la consola del servidor.', accion: setup(PASO.integraciones) });
  } else {
    const error = await verificarSmtp(c);
    checks.push(error
      ? { id: 'smtp', titulo: 'Servicio de correos SMTP', estado: 'error', detalle: `${c.host}:${c.port} rechazó la conexión: ${error}`, accion: setup(PASO.integraciones, 'Revisar credenciales') }
      : { id: 'smtp', titulo: 'Servicio de correos SMTP', estado: 'ok', detalle: `Conectado a ${c.host}:${c.port} como ${c.user || '(sin usuario)'}` });
  }
  checks.push(c.avisosA.length
    ? { id: 'avisos', titulo: 'Destinatarios de avisos', estado: 'ok', detalle: c.avisosA.join(', ') }
    : { id: 'avisos', titulo: 'Destinatarios de avisos', estado: 'advertencia', detalle: 'Nadie recibe los avisos de nuevas reservas, pagos y visitas.', accion: setup(PASO.integraciones) });
  return checks;
}

function respaldos() {
  const { estado: e } = Respaldos.estado();
  const titulo = 'Respaldos automáticos';
  if (!e.auto_habilitado) return { id: 'respaldos', titulo, estado: 'advertencia', detalle: 'Desactivados (BACKUP_AUTO=false en backend/.env).', accion: pestana('respaldos', 'Ir a respaldos') };
  if (e.horas_ultimo_auto == null) return { id: 'respaldos', titulo, estado: 'error', detalle: 'Aún no se ha hecho ningún respaldo.', accion: pestana('respaldos', 'Generar respaldo') };
  const detalle = `Último: ${e.ultimo_auto} (hace ${e.horas_ultimo_auto} h) · ${e.cantidad} respaldos · ${redondear(e.total_bytes / MB)} MB`;
  return e.horas_ultimo_auto > 26
    ? { id: 'respaldos', titulo, estado: 'advertencia', detalle: `${detalle}. El diario no se ha ejecutado: ¿el servidor estuvo apagado a las ${config.respaldos.hora}:00?`, accion: pestana('respaldos', 'Ir a respaldos') }
    : { id: 'respaldos', titulo, estado: 'ok', detalle };
}

function seguridad() {
  const checks = [];
  if (Ajustes.passwordPropia()) {
    const cambiada = Ajustes.leer('seguridad')?.cambiada_en;
    checks.push({ id: 'password', titulo: 'Contraseña del panel', estado: 'ok', detalle: `Definida en el asistente${cambiada ? ` el ${cambiada.slice(0, 10)}` : ''} (guardada con hash scrypt).${config.adminPassword ? ' Ya puedes borrar ADMIN_PASSWORD de backend/.env: no se usa.' : ''}` });
  } else if (loginHabilitado()) {
    checks.push({ id: 'password', titulo: 'Contraseña del panel', estado: 'error', detalle: 'Se usa la contraseña inicial de backend/.env (texto plano). Cámbiala en el asistente.', accion: setup(PASO.seguridad, 'Cambiar contraseña') });
  } else {
    checks.push({ id: 'password', titulo: 'Contraseña del panel', estado: 'error', detalle: 'No hay contraseña: el panel sólo es accesible con el código de instalación.', accion: setup(PASO.seguridad, 'Definir contraseña') });
  }
  if (config.adminApiKey && config.adminApiKey.length < 32) {
    checks.push({ id: 'api_key', titulo: 'API key de integraciones', estado: 'advertencia', detalle: `ADMIN_API_KEY tiene ${config.adminApiKey.length} caracteres: usa al menos 32 caracteres aleatorios.` });
  }
  return checks;
}

function corredora() {
  const m = config.marca;
  const faltan = [
    (!m.nombre || m.nombre === 'Mi Inmobiliaria') && 'nombre comercial',
    !m.telefono && 'teléfono / WhatsApp',
    !m.email && 'correo corporativo',
  ].filter(Boolean);
  return faltan.length
    ? { id: 'corredora', titulo: 'Datos de la corredora', estado: 'advertencia', detalle: `Falta: ${faltan.join(', ')}. Se usan en el sitio, los correos y las liquidaciones.`, accion: setup(PASO.corredora) }
    : { id: 'corredora', titulo: 'Datos de la corredora', estado: 'ok', detalle: `${m.nombre} · ${m.telefono} · ${m.email}` };
}

function lineaGrafica() {
  const t = config.tema;
  const titulo = 'Línea gráfica (colores, logos y tipografía)';
  if (!t) return { id: 'tema', titulo, estado: 'info', detalle: 'Se usan los colores por defecto del sitio.', accion: setup(PASO.tema, 'Cargar línea gráfica') };
  // Archivos del kit que el sitio usa (si alguien borró la carpeta, el sitio mostraría imágenes rotas)
  const usados = [t.logo_claro, t.favicon, config.marca.logo, ...(t.fuente?.archivos ?? []).map((a) => a.url)]
    .filter((u) => u?.startsWith(`${URL_TEMA}/`));
  const faltan = usados.filter((u) => !fs.existsSync(path.join(DIR_TEMA, ...u.slice(URL_TEMA.length + 1).split('/'))));
  const fuente = t.fuente?.tipo === 'sistema' ? 'tipografía por defecto' : `${t.fuente.familia}${t.fuente.tipo === 'google' ? ' (Google Fonts)' : ''}`;
  const detalle = `${t.nombre ?? 'Tema personalizado'} · ${t.primario} / ${t.acento} · ${fuente}${t.documentos?.length ? ` · ${t.documentos.length} documento(s)` : ''}`;
  return faltan.length
    ? { id: 'tema', titulo, estado: 'advertencia', detalle: `${detalle}. Faltan ${faltan.length} archivo(s) del kit: vuelve a subir el ZIP.`, accion: setup(PASO.tema, 'Volver a subir') }
    : { id: 'tema', titulo, estado: 'ok', detalle };
}

function pagos() {
  const medios = [
    webpayDisponible() && `Webpay${webpayEnPruebas() ? ' (pruebas)' : ''}`,
    mercadoPagoDisponible() && `Mercado Pago${mercadoPagoEnPruebas() ? ' (pruebas)' : ''}`,
    config.pagos.transferencia.numeroCuenta && 'Transferencia',
  ].filter(Boolean);
  const titulo = 'Pagos de reservas';
  if (!medios.length) return { id: 'pagos', titulo, estado: 'advertencia', detalle: 'Ningún medio de pago activo: los huéspedes no pueden pagar sus reservas en línea.', accion: setup(PASO.integraciones) };
  if (webpayEnPruebas() || mercadoPagoEnPruebas()) return { id: 'pagos', titulo, estado: 'advertencia', detalle: `${medios.join(' · ')}. En modo pruebas no se cobra dinero real.`, accion: setup(PASO.integraciones, 'Pasar a producción') };
  return { id: 'pagos', titulo, estado: 'ok', detalle: medios.join(' · ') };
}

/** Diagnóstico completo con semáforo general. */
export async function diagnostico() {
  const completado = Ajustes.setupCompletado();
  const [chequeoUF, chequeosCorreo] = await Promise.all([uf(), correo()]);
  const checks = [
    completado
      ? { id: 'setup', titulo: 'Configuración inicial', estado: 'ok', detalle: `Completada el ${Ajustes.leer('setup').completado_en.slice(0, 10)}` }
      : { id: 'setup', titulo: 'Configuración inicial', estado: 'advertencia', detalle: 'El asistente de configuración no se ha completado.', accion: setup(PASO.corredora, 'Ejecutar asistente') },
    baseDeDatos(),
    carpeta('uploads', 'Carpeta de imágenes (uploads)', config.respaldos.uploadsDir),
    carpeta('backups', 'Carpeta de respaldos (backups)', config.respaldos.dir),
    chequeoUF,
    ...chequeosCorreo,
    respaldos(),
    ...seguridad(),
    corredora(),
    lineaGrafica(),
    pagos(),
    {
      id: 'whatsapp', titulo: 'WhatsApp (códigos del portal de propietarios)', estado: whatsappConfigurado() ? 'ok' : 'info',
      detalle: whatsappConfigurado() ? 'Meta Cloud API configurada' : 'Opcional · sin configurar: los códigos se envían sólo por correo (variables WHATSAPP_* en backend/.env).',
    },
  ];
  const general = checks.some((c) => c.estado === 'error') ? 'rojo' : checks.some((c) => c.estado === 'advertencia') ? 'amarillo' : 'verde';
  const memoria = process.memoryUsage();
  return {
    general,
    revisado_en: new Date().toISOString(),
    checks,
    sistema: {
      version_app: version,
      node: process.version,
      plataforma: `${process.platform} ${process.arch}`,
      entorno: process.env.NODE_ENV || 'desarrollo',
      activo_desde: new Date(INICIO).toISOString(),
      uptime_min: Math.round((Date.now() - INICIO) / 60000),
      memoria_mb: redondear(memoria.rss / MB),
      base_datos: path.resolve(config.dbPath),
      url_sitio: config.siteUrl,
      zona_horaria: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };
}
