// ZIP mínimo (deflate, sin ZIP64) con node:zlib, para respaldar y restaurar la carpeta de imágenes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const FIRMA_LOCAL = 0x04034b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_FIN = 0x06054b50;
const MAX_ENTRADAS = 65_535;
const MAX_BYTES = 0xffffffff;
const UTF8 = 0x0800;

export class ZipError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function fechaDOS(d) {
  const anio = Math.max(d.getFullYear(), 1980);
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    fecha: ((anio - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Archivos (rutas relativas con "/") de una carpeta, recursivamente. */
export function listarArchivos(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath ?? e.path, e.name)).split(path.sep).join('/'))
    .sort();
}

/** Comprime el contenido de `dir` en `destino`. Devuelve la cantidad de archivos. */
export function crearZip(dir, destino) {
  const archivos = listarArchivos(dir);
  if (archivos.length > MAX_ENTRADAS) throw new ZipError('Demasiados archivos para un ZIP (máx. 65.535)', 500);
  const temporal = `${destino}.parcial`;
  const fd = fs.openSync(temporal, 'w');
  const central = [];
  let offset = 0;
  const escribir = (buf) => {
    fs.writeSync(fd, buf);
    offset += buf.length;
  };
  try {
    for (const rel of archivos) {
      const ruta = path.join(dir, ...rel.split('/'));
      const datos = fs.readFileSync(ruta);
      const comprimido = zlib.deflateRawSync(datos, { level: 6 });
      // Imágenes ya comprimidas (jpg, webp...) a veces crecen: se guardan sin comprimir
      const metodo = comprimido.length < datos.length ? 8 : 0;
      const cuerpo = metodo === 8 ? comprimido : datos;
      if (offset + cuerpo.length > MAX_BYTES) throw new ZipError('La carpeta de imágenes supera 4 GB', 500);
      const nombre = Buffer.from(rel, 'utf8');
      const crc = zlib.crc32(datos);
      const { hora, fecha } = fechaDOS(fs.statSync(ruta).mtime);

      const local = Buffer.alloc(30);
      local.writeUInt32LE(FIRMA_LOCAL, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(UTF8, 6);
      local.writeUInt16LE(metodo, 8);
      local.writeUInt16LE(hora, 10);
      local.writeUInt16LE(fecha, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(cuerpo.length, 18);
      local.writeUInt32LE(datos.length, 22);
      local.writeUInt16LE(nombre.length, 26);
      local.writeUInt16LE(0, 28);

      const cabecera = Buffer.alloc(46);
      cabecera.writeUInt32LE(FIRMA_CENTRAL, 0);
      cabecera.writeUInt16LE(20, 4);
      cabecera.writeUInt16LE(20, 6);
      cabecera.writeUInt16LE(UTF8, 8);
      cabecera.writeUInt16LE(metodo, 10);
      cabecera.writeUInt16LE(hora, 12);
      cabecera.writeUInt16LE(fecha, 14);
      cabecera.writeUInt32LE(crc, 16);
      cabecera.writeUInt32LE(cuerpo.length, 20);
      cabecera.writeUInt32LE(datos.length, 24);
      cabecera.writeUInt16LE(nombre.length, 28);
      cabecera.writeUInt32LE(offset, 42);
      central.push(cabecera, nombre);

      escribir(local);
      escribir(nombre);
      escribir(cuerpo);
    }
    const inicioCentral = offset;
    for (const b of central) escribir(b);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(FIRMA_FIN, 0);
    fin.writeUInt16LE(archivos.length, 8);
    fin.writeUInt16LE(archivos.length, 10);
    fin.writeUInt32LE(offset - inicioCentral, 12);
    fin.writeUInt32LE(inicioCentral, 16);
    escribir(fin);
    fs.closeSync(fd);
    fs.renameSync(temporal, destino);
    return archivos.length;
  } catch (err) {
    fs.closeSync(fd);
    fs.rmSync(temporal, { force: true });
    throw err;
  }
}

export function esZip(ruta) {
  const fd = fs.openSync(ruta, 'r');
  try {
    const b = Buffer.alloc(4);
    return fs.readSync(fd, b, 0, 4, 0) === 4 && b.readUInt32LE(0) === FIRMA_LOCAL;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Extrae un ZIP en `destino` (que no debe existir). Rechaza rutas fuera de la carpeta, archivos
 * cifrados y tamaños descomprimidos mayores a `maxBytes` (protección contra "zip bombs").
 */
export function extraerZip(ruta, destino, { maxBytes = 5 * 1024 ** 3 } = {}) {
  const fd = fs.openSync(ruta, 'r');
  const leer = (pos, largo) => {
    const b = Buffer.alloc(largo);
    const n = fs.readSync(fd, b, 0, largo, pos);
    if (n !== largo) throw new ZipError('Archivo ZIP dañado o incompleto');
    return b;
  };
  try {
    const tamano = fs.fstatSync(fd).size;
    const cola = Math.min(tamano, 22 + 65_535);
    const fin = leer(tamano - cola, cola);
    let p = -1;
    for (let i = fin.length - 22; i >= 0; i--) {
      if (fin.readUInt32LE(i) === FIRMA_FIN) { p = i; break; }
    }
    if (p < 0) throw new ZipError('El archivo no es un ZIP válido');
    const entradas = fin.readUInt16LE(p + 10);
    const tamanoCentral = fin.readUInt32LE(p + 12);
    const inicioCentral = fin.readUInt32LE(p + 16);
    const cd = leer(inicioCentral, tamanoCentral);

    const raiz = path.resolve(destino);
    fs.mkdirSync(raiz, { recursive: true });
    let total = 0;
    let archivos = 0;
    let q = 0;
    for (let i = 0; i < entradas; i++) {
      if (cd.readUInt32LE(q) !== FIRMA_CENTRAL) throw new ZipError('Directorio del ZIP dañado');
      const flags = cd.readUInt16LE(q + 8);
      const metodo = cd.readUInt16LE(q + 10);
      const crc = cd.readUInt32LE(q + 16);
      const comprimido = cd.readUInt32LE(q + 20);
      const original = cd.readUInt32LE(q + 24);
      const largoNombre = cd.readUInt16LE(q + 28);
      const largoExtra = cd.readUInt16LE(q + 30);
      const largoComentario = cd.readUInt16LE(q + 32);
      const offsetLocal = cd.readUInt32LE(q + 42);
      // Algunas herramientas de Windows (Compress-Archive de PowerShell 5.1) usan "\" como separador
      const nombre = cd.subarray(q + 46, q + 46 + largoNombre).toString('utf8').replace(/\\/g, '/');
      q += 46 + largoNombre + largoExtra + largoComentario;

      if (nombre.endsWith('/')) continue; // carpeta
      if (flags & 0x1) throw new ZipError('El ZIP está cifrado');
      if (metodo !== 0 && metodo !== 8) throw new ZipError(`Método de compresión no soportado en "${nombre}"`);
      const salida = path.resolve(raiz, nombre);
      if (!salida.startsWith(raiz + path.sep) || path.isAbsolute(nombre) || /^[a-zA-Z]:/.test(nombre)) {
        throw new ZipError(`Ruta no permitida en el ZIP: ${nombre}`);
      }
      total += original;
      if (total > maxBytes) throw new ZipError('El contenido del ZIP es demasiado grande');

      const local = leer(offsetLocal, 30);
      if (local.readUInt32LE(0) !== FIRMA_LOCAL) throw new ZipError('Entrada del ZIP dañada');
      const inicioDatos = offsetLocal + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const bruto = comprimido ? leer(inicioDatos, comprimido) : Buffer.alloc(0);
      const datos = metodo === 8 ? zlib.inflateRawSync(bruto, { maxOutputLength: Math.max(original, 1) }) : bruto;
      if (datos.length !== original || zlib.crc32(datos) !== crc) throw new ZipError(`Archivo dañado dentro del ZIP: ${nombre}`);

      fs.mkdirSync(path.dirname(salida), { recursive: true });
      fs.writeFileSync(salida, datos);
      archivos++;
    }
    return { archivos, bytes: total };
  } finally {
    fs.closeSync(fd);
  }
}
