// Subida de archivos: se guardan por streaming con límite de tamaño y se identifica su tipo real por
// los primeros bytes (nunca por la extensión ni por el Content-Type que manda el navegador).
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

export const TIPOS = {
  pdf: { tipo: 'application/pdf', ext: 'pdf' },
  jpg: { tipo: 'image/jpeg', ext: 'jpg' },
  png: { tipo: 'image/png', ext: 'png' },
  webp: { tipo: 'image/webp', ext: 'webp' },
};

export function detectarTipo(ruta) {
  const b = Buffer.alloc(12);
  const fd = fs.openSync(ruta, 'r');
  try {
    fs.readSync(fd, b, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return TIPOS.pdf;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return TIPOS.jpg;
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return TIPOS.png;
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return TIPOS.webp;
  return null;
}

/**
 * Guarda el cuerpo de la petición en `destino`. Lanza `crearError(mensaje, status)` si supera
 * `maxBytes` o llega vacío. Devuelve los bytes recibidos.
 */
export async function recibirArchivo(req, destino, maxBytes, crearError) {
  const maxMB = Math.round(maxBytes / 1024 / 1024);
  if (Number(req.get('content-length')) > maxBytes) throw crearError(`El archivo supera ${maxMB} MB`, 413);
  let bytes = 0;
  const limite = new Transform({
    transform(trozo, _, listo) {
      bytes += trozo.length;
      listo(bytes > maxBytes ? crearError(`El archivo supera ${maxMB} MB`, 413) : null, trozo);
    },
  });
  await pipeline(req, limite, fs.createWriteStream(destino));
  if (!bytes) throw crearError('No se recibió ningún archivo', 400);
  return bytes;
}
