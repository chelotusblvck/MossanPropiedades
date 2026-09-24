// Línea gráfica: se recibe un ZIP con logos, fuentes, manual de marca y (opcional) tema.json.
// Sólo se conservan imágenes, fuentes y PDF verificados por su contenido. Imágenes y fuentes se publican
// en /media/tema/<id>/ (con CSP que impide ejecutar scripts de un SVG); los PDF quedan privados.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { recibirArchivo, detectarTipo } from '../lib/archivos.js';
import { esZip, extraerZip, listarArchivos } from '../lib/zip.js';

const UPLOADS = path.resolve(config.respaldos.uploadsDir);
export const DIR_TEMA = path.join(UPLOADS, 'tema');
export const URL_TEMA = '/media/tema';
const DIR_DOCS = path.join(UPLOADS, 'privado', 'tema');
const MAX_ZIP = 50 * 1024 * 1024;
const MAX_EXTRAIDO = 200 * 1024 * 1024;
const MAX_ARCHIVOS = 400;
const RE_ID = /^t[0-9a-f]{12}$/;
const RE_HEX = /^#[0-9a-f]{6}$/i;

export class TemaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Tipo de un archivo del kit según su contenido (no sólo la extensión). */
function clasificar(ruta, nombre) {
  const ext = path.extname(nombre).toLowerCase();
  const b = Buffer.alloc(8);
  const fd = fs.openSync(ruta, 'r');
  try { fs.readSync(fd, b, 0, 8, 0); } finally { fs.closeSync(fd); }
  const inicio = b.subarray(0, 4).toString('latin1');

  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    const t = detectarTipo(ruta);
    return t && t.ext !== 'pdf' ? { clase: 'imagen', formato: t.ext } : null;
  }
  if (ext === '.svg') {
    if (fs.statSync(ruta).size > 2 * 1024 * 1024) return null;
    return /<svg[\s>]/i.test(fs.readFileSync(ruta, 'utf8').slice(0, 4096)) ? { clase: 'imagen', formato: 'svg' } : null;
  }
  if (ext === '.ico') return b.readUInt32BE(0) === 0x00000100 ? { clase: 'imagen', formato: 'ico' } : null;
  if (ext === '.woff2') return inicio === 'wOF2' ? { clase: 'fuente', formato: 'woff2' } : null;
  if (ext === '.woff') return inicio === 'wOFF' ? { clase: 'fuente', formato: 'woff' } : null;
  if (ext === '.ttf') return b.readUInt32BE(0) === 0x00010000 || inicio === 'true' ? { clase: 'fuente', formato: 'truetype' } : null;
  if (ext === '.otf') return inicio === 'OTTO' ? { clase: 'fuente', formato: 'opentype' } : null;
  if (ext === '.pdf') return detectarTipo(ruta)?.ext === 'pdf' ? { clase: 'documento', formato: 'pdf' } : null;
  return null;
}

/** Ruta segura para publicar: sólo letras, números, punto, guion y guion bajo por segmento. */
const segura = (rel) => rel.split('/').map((s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^\.+/, '_')).join('/');

/** Peso tipográfico según el nombre del archivo (Montserrat-SemiBoldItalic.woff2 → 600 italic). */
function pesoDeNombre(nombre) {
  const n = nombre.toLowerCase().replace(/[\s_-]/g, '');
  const pesos = [['thin', 100], ['extralight', 200], ['ultralight', 200], ['light', 300], ['medium', 500], ['semibold', 600], ['demibold', 600], ['extrabold', 800], ['ultrabold', 800], ['black', 900], ['heavy', 900], ['bold', 700]];
  const peso = pesos.find(([k]) => n.includes(k))?.[1] ?? 400;
  return { peso, estilo: /italic|oblique/.test(n) ? 'italic' : 'normal' };
}

const familiaDeNombre = (nombre) => path.basename(nombre, path.extname(nombre)).split(/[-_]/)[0].replace(/([a-z])([A-Z])/g, '$1 $2').trim();

/** Sugerencias cuando el ZIP no trae tema.json. */
function detectar(imagenes, fuentes) {
  const n = (a) => a.ruta.toLowerCase();
  const esFavicon = (a) => /favicon|isotipo|icono|icon|simbolo/.test(n(a));
  const esOscuro = (a) => /blanc|white|negativ|invert|dark|oscur|reverse/.test(n(a));
  const logos = imagenes.filter((a) => /logo|marca|brand/.test(n(a)) && !esFavicon(a));
  // Preferencia de formato para el sitio: SVG > PNG > WEBP > JPG
  const orden = { svg: 0, png: 1, webp: 2, jpg: 3, ico: 4 };
  const mejor = (lista) => [...lista].sort((a, b) => orden[a.formato] - orden[b.formato])[0]?.url ?? null;
  const familias = [...new Set(fuentes.map((f) => f.familia))];
  return {
    logo: mejor(logos.filter((a) => !esOscuro(a))) ?? mejor(imagenes.filter((a) => !esFavicon(a) && !esOscuro(a))),
    logo_claro: mejor(logos.filter(esOscuro)),
    favicon: mejor(imagenes.filter(esFavicon)),
    fuente: familias.length ? { tipo: 'archivos', familia: familias[0] } : null,
  };
}

/** Lee tema.json y resuelve sus rutas contra los archivos publicados. */
function leerManifiesto(rutaJson, mapa, advertencias) {
  let t;
  try {
    t = JSON.parse(fs.readFileSync(rutaJson, 'utf8'));
  } catch (err) {
    advertencias.push(`tema.json no es un JSON válido (${err.message}); se usó la detección automática`);
    return null;
  }
  const resolver = (rel, campo) => {
    if (!rel) return null;
    const url = mapa.get(String(rel).replace(/^\.?\//, '').toLowerCase());
    if (!url) advertencias.push(`tema.json: no se encontró "${rel}" (${campo})`);
    return url ?? null;
  };
  const color = (v, campo) => {
    if (!v) return null;
    if (RE_HEX.test(v)) return v.toLowerCase();
    advertencias.push(`tema.json: ${campo} debe ser un color #RRGGBB`);
    return null;
  };
  const tipo = t.tipografia ?? {};
  return {
    nombre: typeof t.nombre === 'string' ? t.nombre.slice(0, 80) : null,
    primario: color(t.colores?.primario, 'colores.primario'),
    acento: color(t.colores?.acento, 'colores.acento'),
    logo: resolver(t.logos?.principal, 'logos.principal'),
    logo_claro: resolver(t.logos?.fondo_oscuro, 'logos.fondo_oscuro'),
    favicon: resolver(t.logos?.favicon, 'logos.favicon'),
    fuente: tipo.google
      ? { tipo: 'google', familia: String(tipo.google).slice(0, 40) }
      : tipo.familia ? { tipo: 'archivos', familia: String(tipo.familia).slice(0, 40) } : null,
  };
}

/**
 * Recibe el ZIP (cuerpo de la petición), lo extrae aparte y publica lo útil en una carpeta nueva.
 * No cambia el sitio: el tema se aplica recién al finalizar el asistente.
 */
export async function procesarZip(req) {
  const id = `t${crypto.randomBytes(6).toString('hex')}`;
  const trabajo = path.join(UPLOADS, 'privado', `.tema_${id}`);
  fs.mkdirSync(trabajo, { recursive: true });
  const zip = path.join(trabajo, 'kit.zip');
  const extraido = path.join(trabajo, 'x');
  try {
    await recibirArchivo(req, zip, MAX_ZIP, (m, s) => new TemaError(m, s));
    if (!esZip(zip)) throw new TemaError('El archivo no es un ZIP');
    try {
      extraerZip(zip, extraido, { maxBytes: MAX_EXTRAIDO });
    } catch (err) {
      throw new TemaError(`No se pudo abrir el ZIP: ${err.message}`);
    }
    const todos = listarArchivos(extraido).filter((r) => !r.split('/').some((s) => s.startsWith('.') || s === '__MACOSX') && !/thumbs\.db$|desktop\.ini$/i.test(r));
    if (todos.length > MAX_ARCHIVOS) throw new TemaError(`El ZIP tiene ${todos.length} archivos (máximo ${MAX_ARCHIVOS})`);

    // Si todo viene dentro de una sola carpeta (lo habitual al comprimir), se usa como raíz
    const primeras = new Set(todos.map((r) => r.split('/')[0]));
    const prefijo = primeras.size === 1 && todos.every((r) => r.includes('/')) ? `${[...primeras][0]}/` : '';

    const advertencias = [];
    const mapa = new Map(); // ruta relativa (minúsculas) → url publicada
    const archivos = [];
    let manifiesto = null;
    let omitidos = 0;
    for (const rel of todos) {
      const origen = path.join(extraido, ...rel.split('/'));
      const relativa = rel.slice(prefijo.length);
      if (relativa.toLowerCase() === 'tema.json') { manifiesto = origen; continue; }
      const c = clasificar(origen, rel);
      if (!c) { omitidos++; continue; }
      const destinoRel = segura(relativa);
      const base = c.clase === 'documento' ? path.join(DIR_DOCS, id) : path.join(DIR_TEMA, id);
      const destino = path.join(base, ...destinoRel.split('/'));
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(origen, destino);
      const a = {
        clase: c.clase,
        formato: c.formato,
        ruta: relativa,
        nombre: path.basename(relativa),
        bytes: fs.statSync(destino).size,
        url: c.clase === 'documento' ? null : `${URL_TEMA}/${id}/${destinoRel}`,
        archivo: destinoRel,
      };
      if (c.clase === 'fuente') Object.assign(a, pesoDeNombre(a.nombre), { familia: familiaDeNombre(a.nombre) });
      if (a.url) mapa.set(relativa.toLowerCase(), a.url);
      archivos.push(a);
    }
    if (!archivos.length) throw new TemaError('El ZIP no contiene logos, fuentes ni documentos reconocibles (PNG, JPG, WEBP, SVG, ICO, WOFF2, WOFF, TTF, OTF o PDF)');
    if (omitidos) advertencias.push(`${omitidos} ${omitidos === 1 ? 'archivo se omitió' : 'archivos se omitieron'} por formato no permitido (p. ej. .ai, .psd, .eps: exporta los logos a PNG o SVG)`);

    const imagenes = archivos.filter((a) => a.clase === 'imagen');
    const fuentes = archivos.filter((a) => a.clase === 'fuente');
    const sugerido = detectar(imagenes, fuentes);
    const desdeJson = manifiesto ? leerManifiesto(manifiesto, mapa, advertencias) : null;
    const propuesta = { ...sugerido };
    if (desdeJson) for (const [k, v] of Object.entries(desdeJson)) if (v) propuesta[k] = v;

    return { id, archivos, propuesta, con_manifiesto: Boolean(desdeJson), advertencias };
  } catch (err) {
    fs.rmSync(path.join(DIR_TEMA, id), { recursive: true, force: true });
    fs.rmSync(path.join(DIR_DOCS, id), { recursive: true, force: true });
    throw err;
  } finally {
    fs.rmSync(trabajo, { recursive: true, force: true });
  }
}

const existePublico = (id, url) => typeof url === 'string' && url.startsWith(`${URL_TEMA}/${id}/`)
  && !url.includes('..') && fs.existsSync(path.join(DIR_TEMA, id, ...url.slice(`${URL_TEMA}/${id}/`.length).split('/')));

/** ¿La URL es un logo publicado por el asistente (paso 1 o kit de marca)? Lo usa la validación del paso 1. */
export const esUrlTema = (id, url) => Boolean(id && RE_ID.test(id) && existePublico(id, url));

/** Valida el tema del asistente (null = tema por defecto). */
export function validar(t) {
  if (!t) return null;
  const id = t.id ?? null;
  if (id && (!RE_ID.test(id) || !fs.existsSync(path.join(DIR_TEMA, id)) && !fs.existsSync(path.join(DIR_DOCS, id)))) {
    throw new TemaError('Línea gráfica: el kit subido ya no está disponible, vuelve a subir el ZIP');
  }
  for (const k of ['primario', 'acento']) if (!RE_HEX.test(t[k] ?? '')) throw new TemaError(`Línea gráfica: color ${k} inválido (#RRGGBB)`);
  for (const k of ['logo_claro', 'favicon']) {
    if (t[k] && !existePublico(id, t[k])) throw new TemaError(`Línea gráfica: ${k === 'favicon' ? 'favicon' : 'logo para fondos oscuros'} inválido`);
  }
  let fuente = { tipo: 'sistema', familia: null, archivos: [] };
  const f = t.fuente ?? {};
  if (f.tipo === 'google') {
    if (!/^[A-Za-z0-9 ]{2,40}$/.test(f.familia ?? '')) throw new TemaError('Línea gráfica: nombre de fuente de Google inválido');
    fuente = { tipo: 'google', familia: f.familia.trim(), archivos: [] };
  } else if (f.tipo === 'archivos') {
    const archivos = (Array.isArray(f.archivos) ? f.archivos : []).filter((a) => existePublico(id, a.url)).slice(0, 12).map((a) => ({
      url: a.url,
      formato: ['woff2', 'woff', 'truetype', 'opentype'].includes(a.formato) ? a.formato : 'woff2',
      peso: Math.min(Math.max(Number(a.peso) || 400, 100), 900),
      estilo: a.estilo === 'italic' ? 'italic' : 'normal',
    }));
    if (!archivos.length) throw new TemaError('Línea gráfica: elige al menos un archivo de la fuente');
    const familia = String(f.familia ?? '').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 40);
    if (!familia) throw new TemaError('Línea gráfica: indica el nombre de la tipografía');
    fuente = { tipo: 'archivos', familia, archivos };
  }
  const documentos = id && fs.existsSync(path.join(DIR_DOCS, id))
    ? listarArchivos(path.join(DIR_DOCS, id)).map((archivo) => ({ archivo, nombre: path.basename(archivo) }))
    : [];
  return {
    id,
    nombre: typeof t.nombre === 'string' ? t.nombre.trim().slice(0, 80) : null,
    primario: t.primario.toLowerCase(),
    acento: t.acento.toLowerCase(),
    logo_claro: t.logo_claro || null,
    favicon: t.favicon || null,
    fuente,
    documentos,
  };
}

/** Borra los kits subidos que no quedaron en uso (subidas de prueba o temas anteriores). */
export function limpiar(idVigente) {
  for (const dir of [DIR_TEMA, DIR_DOCS]) {
    if (!fs.existsSync(dir)) continue;
    for (const nombre of fs.readdirSync(dir)) {
      if (RE_ID.test(nombre) && nombre !== idVigente) fs.rmSync(path.join(dir, nombre), { recursive: true, force: true });
    }
  }
}

/** Ruta de un documento (manual de marca) del kit vigente o subido, o null. */
export function rutaDocumento(id, archivo) {
  if (!RE_ID.test(String(id)) || typeof archivo !== 'string' || archivo.includes('..') || path.isAbsolute(archivo)) return null;
  const ruta = path.join(DIR_DOCS, id, ...archivo.split('/'));
  return ruta.startsWith(path.join(DIR_DOCS, id) + path.sep) && fs.existsSync(ruta) ? ruta : null;
}
