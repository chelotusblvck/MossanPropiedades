import { config } from '../../config.js';
import { MeliError, obtenerAccessToken, refrescarToken } from './oauth.js';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET autenticado a la API de Mercado Libre, con renovación de token en 401 y reintentos en 429/5xx. */
export async function meliGet(ruta, { params, intentos = 3 } = {}) {
  const url = new URL(ruta, config.meli.apiUrl);
  for (const [k, v] of Object.entries(params ?? {})) if (v != null) url.searchParams.set(k, v);

  let tokenRenovado = false;
  for (let intento = 1; ; intento++) {
    const token = await obtenerAccessToken();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });

    if (res.ok) return res.json();

    if (res.status === 401 && !tokenRenovado) {
      tokenRenovado = true;
      await refrescarToken();
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && intento < intentos) {
      await esperar(1000 * 2 ** intento);
      continue;
    }
    const detalle = await res.json().catch(() => ({}));
    throw new MeliError(`Mercado Libre respondió ${res.status} en ${url.pathname}: ${detalle.message ?? ''}`, res.status, detalle);
  }
}
