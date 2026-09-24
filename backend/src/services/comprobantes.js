// Comprobantes bancarios (PDF o imagen) de las transferencias a propietarios. Se guardan en una carpeta
// privada dentro de UPLOADS_DIR (entra en los respaldos) y sólo se entregan por rutas autenticadas.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { detectarTipo, recibirArchivo } from '../lib/archivos.js';
import { config } from '../config.js';
import { existeLote } from '../models/liquidacion.js';

const DIR = path.join(path.resolve(config.respaldos.uploadsDir), 'privado', 'comprobantes');
const MAX_BYTES = 10 * 1024 * 1024;
const RE_LOTE = /^(L[0-9a-f]{16}|r\d+)$/;

export class ComprobanteError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function validarLote(lote) {
  if (!RE_LOTE.test(String(lote)) || !existeLote(lote)) throw new ComprobanteError('Transferencia no encontrada', 404);
}

/** Guarda (o reemplaza) el comprobante de un lote a partir del cuerpo de la petición. */
export async function guardar(lote, req, nombreOriginal) {
  validarLote(lote);
  fs.mkdirSync(DIR, { recursive: true });
  const temporal = path.join(DIR, `.subida_${crypto.randomBytes(6).toString('hex')}`);
  try {
    const bytes = await recibirArchivo(req, temporal, MAX_BYTES, (m, s) => new ComprobanteError(m, s));
    const tipo = detectarTipo(temporal);
    if (!tipo) throw new ComprobanteError('Formato no permitido: sube un PDF, JPG, PNG o WEBP');

    const archivo = `${lote}_${crypto.randomBytes(4).toString('hex')}.${tipo.ext}`;
    fs.renameSync(temporal, path.join(DIR, archivo));
    const anterior = db.prepare('SELECT archivo FROM comprobantes_liquidacion WHERE lote = ?').get(lote);
    const nombre = String(nombreOriginal || `comprobante.${tipo.ext}`).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120);
    db.prepare(`
      INSERT INTO comprobantes_liquidacion (lote, archivo, nombre, tipo, bytes) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (lote) DO UPDATE SET archivo = excluded.archivo, nombre = excluded.nombre, tipo = excluded.tipo,
        bytes = excluded.bytes, subido_en = datetime('now')
    `).run(lote, archivo, nombre, tipo.tipo, bytes);
    if (anterior) fs.rmSync(path.join(DIR, anterior.archivo), { force: true });
    return { lote, nombre, tipo: tipo.tipo, bytes };
  } finally {
    fs.rmSync(temporal, { force: true });
  }
}

/** { ruta, nombre, tipo } del comprobante de un lote, o null. */
export function obtener(lote) {
  if (!RE_LOTE.test(String(lote))) return null;
  const c = db.prepare('SELECT * FROM comprobantes_liquidacion WHERE lote = ?').get(lote);
  if (!c) return null;
  const ruta = path.join(DIR, c.archivo);
  return fs.existsSync(ruta) ? { ruta, nombre: c.nombre, tipo: c.tipo } : null;
}

/** Envía el archivo con cabeceras seguras (nunca se interpreta como HTML). */
export function enviar(res, comprobante) {
  res.set({
    'Content-Type': comprobante.tipo,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(comprobante.nombre)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.sendFile(comprobante.ruta);
}

/** Si ya no queda ninguna reserva en el lote (se deshizo), se borra su comprobante. */
export function limpiarSiHuerfano(lote) {
  if (!lote || existeLote(lote)) return;
  const c = db.prepare('SELECT archivo FROM comprobantes_liquidacion WHERE lote = ?').get(lote);
  if (!c) return;
  db.prepare('DELETE FROM comprobantes_liquidacion WHERE lote = ?').run(lote);
  fs.rmSync(path.join(DIR, c.archivo), { force: true });
}
