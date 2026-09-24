import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { db, transaccion } from '../db/database.js';
import { config } from '../config.js';
import { hoyChile, sumarDias } from '../lib/fechas.js';
import { crearZip, extraerZip, esZip, listarArchivos } from '../lib/zip.js';
import { repararDatos as repararDatosPropietarios } from '../models/propietario.js';

const RAIZ = path.resolve(config.respaldos.dir);
const DIR_DB = path.join(RAIZ, 'db');
const DIR_MEDIA = path.join(RAIZ, 'media');
const DIR_TMP = path.join(RAIZ, 'tmp');
const UPLOADS = path.resolve(config.respaldos.uploadsDir);

export const TIPOS = ['auto', 'manual', 'prerestauracion'];
export const CONFIRMACION = 'RESTAURAR';
const CONSERVAR_PRERESTAURACION = 10;
// backup_2026-09-23_02-00-00_auto.sqlite · images_2026-09-23_02-00-00_auto.zip (mismo id = mismo respaldo)
const RE_ARCHIVO = /^(backup|images)_((\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_(auto|manual|prerestauracion)(?:-\d+)?)\.(sqlite|zip)$/;
// No se restauran: los tokens de Mercado Libre son de un solo uso (uno antiguo desconectaría la cuenta)
// Tampoco la configuración del sitio ni los secretos de sesión: un respaldo antiguo podría devolver
// una contraseña del panel que ya nadie recuerda (o credenciales SMTP/pagos vencidas).
// La auditoría tampoco: restaurar un respaldo no debe borrar el registro de quién vio qué.
const NO_RESTAURAR = new Set(['meli_tokens', 'sync_log', 'configuracion_sitio', 'ajustes_sistema', 'auditoria']);
// Se vacían al restaurar: un enlace o código ya usado no debe volver a servir por venir en un respaldo
const VACIAR_AL_RESTAURAR = new Set(['codigos_acceso', 'codigos_propietario', 'enlaces_propietario']);
const TABLAS_REQUERIDAS = ['propiedades', 'reservas'];

export class RespaldoError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const sqlTexto = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sqlId = (s) => `"${String(s).replace(/"/g, '""')}"`;

/** Fecha y hora de Chile como partes. */
function ahoraChile() {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: Number(partes.hour), sello: `${partes.year}-${partes.month}-${partes.day}_${partes.hour}-${partes.minute}-${partes.second}` };
}

function asegurarCarpetas() {
  for (const d of [DIR_DB, DIR_MEDIA, DIR_TMP]) fs.mkdirSync(d, { recursive: true });
}

function infoCarpetaImagenes() {
  const archivos = listarArchivos(UPLOADS);
  const bytes = archivos.reduce((a, rel) => a + fs.statSync(path.join(UPLOADS, ...rel.split('/'))).size, 0);
  return { ruta: UPLOADS, existe: fs.existsSync(UPLOADS), archivos: archivos.length, bytes };
}

/** Respaldos agrupados por id (base de datos + ZIP de imágenes), del más nuevo al más antiguo. */
export function listar() {
  asegurarCarpetas();
  const grupos = new Map();
  for (const [dir, clase] of [[DIR_DB, 'db'], [DIR_MEDIA, 'imagenes']]) {
    for (const archivo of fs.readdirSync(dir)) {
      const m = RE_ARCHIVO.exec(archivo);
      if (!m) continue;
      const [, , id, fecha, hh, mm, ss, tipo] = m;
      if (!grupos.has(id)) grupos.set(id, { id, fecha: `${fecha} ${hh}:${mm}:${ss}`, tipo, db: null, imagenes: null });
      grupos.get(id)[clase] = { archivo, bytes: fs.statSync(path.join(dir, archivo)).size };
    }
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, total_bytes: (g.db?.bytes ?? 0) + (g.imagenes?.bytes ?? 0) }))
    .sort((a, b) => (a.id < b.id ? 1 : -1));
}

export function estado() {
  const respaldos = listar();
  const ultimoAuto = respaldos.find((r) => r.tipo === 'auto') ?? null;
  // Antigüedad según la fecha del archivo (independiente de la zona horaria del servidor)
  const horasUltimoAuto = ultimoAuto?.db
    ? Math.round(((Date.now() - fs.statSync(path.join(DIR_DB, ultimoAuto.db.archivo)).mtimeMs) / 3_600_000) * 10) / 10
    : null;
  const { fecha, hora } = ahoraChile();
  const h = String(config.respaldos.hora).padStart(2, '0');
  return {
    respaldos,
    estado: {
      ultimo_auto: ultimoAuto?.fecha ?? null,
      horas_ultimo_auto: horasUltimoAuto,
      ultimo: respaldos[0]?.fecha ?? null,
      cantidad: respaldos.length,
      total_bytes: respaldos.reduce((a, r) => a + r.total_bytes, 0),
      auto_habilitado: config.respaldos.auto,
      proximo_auto: config.respaldos.auto ? `${hora < config.respaldos.hora ? fecha : sumarDias(hoyChile(), 1)} ${h}:00` : null,
      conservar: config.respaldos.conservar,
      imagenes: infoCarpetaImagenes(),
    },
  };
}

/** Elimina los respaldos más antiguos de un tipo, conservando los últimos `n`. */
function rotar(tipo, n) {
  const sobrantes = listar().filter((r) => r.tipo === tipo).slice(n);
  for (const r of sobrantes) {
    if (r.db) fs.rmSync(path.join(DIR_DB, r.db.archivo), { force: true });
    if (r.imagenes) fs.rmSync(path.join(DIR_MEDIA, r.imagenes.archivo), { force: true });
  }
  return sobrantes.length;
}

/**
 * Crea un respaldo: copia consistente de la base de datos (VACUUM INTO, seguro con el servidor en uso)
 * y, si se pide y hay imágenes locales, un ZIP de la carpeta de imágenes.
 */
export function crear({ tipo = 'manual', imagenes = true } = {}) {
  if (!TIPOS.includes(tipo)) throw new RespaldoError('Tipo de respaldo inválido');
  asegurarCarpetas();
  const { sello } = ahoraChile();
  let id = `${sello}_${tipo}`;
  for (let n = 2; fs.existsSync(path.join(DIR_DB, `backup_${id}.sqlite`)); n++) id = `${sello}_${tipo}-${n}`;

  const rutaDb = path.join(DIR_DB, `backup_${id}.sqlite`);
  db.exec(`VACUUM INTO ${sqlTexto(rutaDb)}`);

  let archivosImagenes = 0;
  if (imagenes && listarArchivos(UPLOADS).length) {
    try {
      archivosImagenes = crearZip(UPLOADS, path.join(DIR_MEDIA, `images_${id}.zip`));
    } catch (err) {
      fs.rmSync(rutaDb, { force: true }); // un respaldo a medias no sirve
      throw err;
    }
  }
  if (tipo === 'auto') rotar('auto', config.respaldos.conservar);
  if (tipo === 'prerestauracion') rotar('prerestauracion', CONSERVAR_PRERESTAURACION);
  return { ...listar().find((r) => r.id === id), archivos_imagenes: archivosImagenes };
}

/** Ruta de un archivo de respaldo por su nombre (validado), o null. */
export function rutaArchivo(nombre) {
  const m = RE_ARCHIVO.exec(String(nombre ?? ''));
  if (!m) return null;
  const ruta = path.join(m[8] === 'sqlite' ? DIR_DB : DIR_MEDIA, nombre);
  return fs.existsSync(ruta) ? ruta : null;
}

// --- Restauración ---

function esSqlite(ruta) {
  const fd = fs.openSync(ruta, 'r');
  try {
    const b = Buffer.alloc(16);
    return fs.readSync(fd, b, 0, 16, 0) === 16 && b.toString('latin1') === 'SQLite format 3\0';
  } finally {
    fs.closeSync(fd);
  }
}

function validarSqlite(ruta) {
  if (!esSqlite(ruta)) throw new RespaldoError('El archivo no es una base de datos SQLite');
  let copia;
  try {
    copia = new DatabaseSync(ruta, { readOnly: true });
    const chequeo = copia.prepare('PRAGMA quick_check').get();
    if (Object.values(chequeo)[0] !== 'ok') throw new RespaldoError('La base de datos del respaldo está dañada');
    const tablas = new Set(copia.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((t) => t.name));
    const faltan = TABLAS_REQUERIDAS.filter((t) => !tablas.has(t));
    if (faltan.length) throw new RespaldoError(`El archivo no es un respaldo de este sitio (faltan tablas: ${faltan.join(', ')})`);
  } catch (err) {
    if (err instanceof RespaldoError) throw err;
    throw new RespaldoError(`No se pudo leer la base de datos del respaldo: ${err.message}`);
  } finally {
    copia?.close();
  }
}

/**
 * Reemplaza los datos de la base en uso por los del respaldo, tabla por tabla y en una sola
 * transacción (si algo falla no se cambia nada). Las columnas nuevas que el respaldo no tenga
 * quedan con su valor por defecto, así funcionan también respaldos de versiones anteriores.
 */
function restaurarBaseDatos(ruta) {
  validarSqlite(ruta);
  db.exec(`ATTACH DATABASE ${sqlTexto(ruta)} AS respaldo`);
  const resultado = {};
  try {
    const tablas = (esquema) => db.prepare(`SELECT name FROM ${esquema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all().map((t) => t.name);
    const columnas = (esquema, t) => db.prepare(`PRAGMA ${esquema}.table_info(${sqlId(t)})`).all().map((c) => c.name);
    const enRespaldo = new Set(tablas('respaldo'));
    const destino = tablas('main').filter((t) => !NO_RESTAURAR.has(t));

    db.exec('PRAGMA foreign_keys = OFF'); // no tiene efecto dentro de una transacción
    try {
      transaccion(() => {
        for (const t of destino) {
          db.exec(`DELETE FROM main.${sqlId(t)}`);
          if (!enRespaldo.has(t) || VACIAR_AL_RESTAURAR.has(t)) { resultado[t] = 0; continue; }
          const disponibles = new Set(columnas('respaldo', t));
          const cols = columnas('main', t).filter((c) => disponibles.has(c)).map(sqlId).join(', ');
          const { changes } = db.prepare(`INSERT INTO main.${sqlId(t)} (${cols}) SELECT ${cols} FROM respaldo.${sqlId(t)}`).run();
          resultado[t] = Number(changes);
        }
        const secuencias = (esquema) => db.prepare(`SELECT 1 FROM ${esquema}.sqlite_master WHERE name = 'sqlite_sequence'`).get();
        if (secuencias('main')) {
          const lista = destino.map(sqlTexto).join(', ');
          db.exec(`DELETE FROM main.sqlite_sequence WHERE name IN (${lista})`);
          if (secuencias('respaldo')) {
            db.exec(`INSERT INTO main.sqlite_sequence (name, seq) SELECT name, seq FROM respaldo.sqlite_sequence WHERE name IN (${lista})`);
          }
        }
        const huerfanos = db.prepare('PRAGMA main.foreign_key_check').all();
        if (huerfanos.length) throw new RespaldoError(`El respaldo tiene ${huerfanos.length} registros con referencias inválidas`);
      });
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  } catch (err) {
    if (err instanceof RespaldoError) throw err;
    throw new RespaldoError(`No se pudo restaurar la base de datos: ${err.message}`, 422);
  } finally {
    db.exec('DETACH DATABASE respaldo');
  }
  repararDatosPropietarios(); // respaldos de versiones anteriores: lotes y cuentas de propietarios
  return resultado;
}

/** Reemplaza la carpeta de imágenes por el contenido del ZIP (se extrae aparte primero). */
function restaurarImagenes(ruta) {
  if (!esZip(ruta)) throw new RespaldoError('El archivo no es un ZIP');
  const temporal = path.join(DIR_TMP, `imagenes_${crypto.randomBytes(6).toString('hex')}`);
  try {
    const r = extraerZip(ruta, temporal);
    fs.rmSync(UPLOADS, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(UPLOADS), { recursive: true });
    try {
      fs.renameSync(temporal, UPLOADS);
    } catch (err) {
      if (err.code !== 'EXDEV') throw err;
      fs.cpSync(temporal, UPLOADS, { recursive: true }); // otra unidad de disco
    }
    return r;
  } finally {
    fs.rmSync(temporal, { recursive: true, force: true });
  }
}

function exigirConfirmacion(confirmar) {
  if (confirmar !== CONFIRMACION) throw new RespaldoError(`Para restaurar escribe ${CONFIRMACION} como confirmación`);
}

/** Antes de sobrescribir se guarda el estado actual, para poder deshacer la restauración. */
function respaldoPrevio(incluyeImagenes) {
  return crear({ tipo: 'prerestauracion', imagenes: incluyeImagenes }).id;
}

/** Restaura un respaldo guardado en el servidor. */
export function restaurarGuardado({ id, db: conDb = true, imagenes: conImagenes = true, confirmar } = {}) {
  exigirConfirmacion(confirmar);
  const r = listar().find((x) => x.id === id);
  if (!r) throw new RespaldoError('Respaldo no encontrado', 404);
  const hacerDb = conDb && r.db;
  const hacerImagenes = conImagenes && r.imagenes;
  if (!hacerDb && !hacerImagenes) throw new RespaldoError('Elige qué restaurar (base de datos y/o imágenes)');

  const previo = respaldoPrevio(Boolean(hacerImagenes));
  const resultado = { respaldo_previo: previo };
  if (hacerDb) resultado.base_datos = restaurarBaseDatos(path.join(DIR_DB, r.db.archivo));
  if (hacerImagenes) resultado.imagenes = restaurarImagenes(path.join(DIR_MEDIA, r.imagenes.archivo));
  return resultado;
}

/**
 * Guarda en disco un archivo subido (stream), con límite de tamaño, y lo restaura según su tipo:
 * .sqlite = base de datos · .zip = imágenes.
 */
export async function restaurarSubida(req, { confirmar } = {}) {
  exigirConfirmacion(confirmar);
  asegurarCarpetas();
  const max = config.respaldos.maxSubidaMB * 1024 * 1024;
  const declarado = Number(req.get('content-length'));
  if (declarado > max) throw new RespaldoError(`El archivo supera ${config.respaldos.maxSubidaMB} MB`, 413);

  const temporal = path.join(DIR_TMP, `subida_${crypto.randomBytes(6).toString('hex')}`);
  let recibidos = 0;
  const limite = new Transform({
    transform(trozo, _, listo) {
      recibidos += trozo.length;
      if (recibidos > max) listo(new RespaldoError(`El archivo supera ${config.respaldos.maxSubidaMB} MB`, 413));
      else listo(null, trozo);
    },
  });
  try {
    await pipeline(req, limite, fs.createWriteStream(temporal));
    if (!recibidos) throw new RespaldoError('No se recibió ningún archivo');
    if (esSqlite(temporal)) {
      validarSqlite(temporal); // antes del respaldo previo: no se crea uno por un archivo inválido
      const previo = respaldoPrevio(false);
      return { respaldo_previo: previo, base_datos: restaurarBaseDatos(temporal) };
    }
    if (esZip(temporal)) {
      const previo = respaldoPrevio(true);
      return { respaldo_previo: previo, imagenes: restaurarImagenes(temporal) };
    }
    throw new RespaldoError('Formato no reconocido: sube un respaldo .sqlite (base de datos) o .zip (imágenes)');
  } finally {
    fs.rmSync(temporal, { force: true });
  }
}

// --- Respaldo automático ---

export function iniciarRespaldosAutomaticos() {
  if (!config.respaldos.auto) return;
  const hacer = (motivo) => {
    try {
      const r = crear({ tipo: 'auto', imagenes: true });
      console.log(`[respaldos] Respaldo automático (${motivo}): ${r.id}`);
    } catch (err) {
      console.error('[respaldos] Error en el respaldo automático:', err.message);
    }
  };

  const autos = listar().filter((r) => r.tipo === 'auto');
  const { fecha, hora } = ahoraChile();
  // Si hoy ya se hizo el respaldo diario (después de la hora programada), no se repite
  let ultimoDiario = autos.some((r) => r.fecha.slice(0, 10) === fecha && Number(r.fecha.slice(11, 13)) >= config.respaldos.hora) ? fecha : null;

  // Antigüedad del último automático según la fecha del archivo (independiente de la zona horaria del servidor)
  const archivoUltimo = autos[0]?.db && path.join(DIR_DB, autos[0].db.archivo);
  const horasDesde = archivoUltimo ? (Date.now() - fs.statSync(archivoUltimo).mtimeMs) / 3_600_000 : Infinity;
  if (horasDesde >= config.respaldos.minHorasInicio) {
    hacer('inicio del servidor');
    if (hora === config.respaldos.hora) ultimoDiario = fecha; // ya cuenta como el de hoy
  }

  setInterval(() => {
    const ahora = ahoraChile();
    if (ahora.hora === config.respaldos.hora && ultimoDiario !== ahora.fecha) {
      ultimoDiario = ahora.fecha;
      hacer('diario');
    }
  }, 60_000).unref();
  console.log(`[respaldos] Automático diario a las ${String(config.respaldos.hora).padStart(2, '0')}:00 (Chile), se conservan ${config.respaldos.conservar}`);
}
