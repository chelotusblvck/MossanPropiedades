import { config } from '../config.js';

const TTL_MS = 6 * 60 * 60 * 1000;
const TTL_FALLO_MS = 10 * 60 * 1000; // tras un fallo, no reintentar en cada request
let cache = null;
let ultimoFallo = 0;

/** Valor de la UF del día desde mindicador.cl (con caché y valor de respaldo). */
export async function obtenerUF() {
  if (cache && Date.now() - cache.obtenidoEn < TTL_MS) return cache;
  if (Date.now() - ultimoFallo < TTL_FALLO_MS) return cache ?? respaldo();
  try {
    const res = await fetch('https://mindicador.cl/api/uf', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { serie } = await res.json();
    cache = { valor: serie[0].valor, fecha: serie[0].fecha, fuente: 'mindicador.cl', obtenidoEn: Date.now() };
    return cache;
  } catch (err) {
    ultimoFallo = Date.now();
    console.warn(`[uf] No se pudo obtener la UF (${err.message}); usando ${cache ? 'caché' : 'valor de respaldo'}`);
    return cache ?? respaldo();
  }
}

function respaldo() {
  return { valor: config.ufFallback, fecha: null, fuente: 'respaldo', obtenidoEn: Date.now() };
}
