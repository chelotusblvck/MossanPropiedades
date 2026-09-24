import { db } from '../../db/database.js';
import * as Propiedad from '../../models/propiedad.js';
import { obtenerUF } from '../uf.js';
import { meliGet } from './client.js';
import { usuarioConectado, MeliError } from './oauth.js';
import { itemAPropiedad } from './mapper.js';

const TAMANO_MULTIGET = 20; // máximo permitido por /items?ids=
const CONCURRENCIA_DESCRIPCIONES = 5;

let syncEnCurso = null;

async function mapConLimite(lista, limite, fn) {
  const resultados = new Array(lista.length);
  let i = 0;
  const trabajadores = Array.from({ length: Math.min(limite, lista.length) }, async () => {
    while (i < lista.length) {
      const idx = i++;
      resultados[idx] = await fn(lista[idx], idx);
    }
  });
  await Promise.all(trabajadores);
  return resultados;
}

/** IDs de todas las publicaciones activas del usuario (modo scan: sin el límite de 1000 del offset). */
async function obtenerIdsActivos(userId) {
  const ids = [];
  let scrollId;
  for (;;) {
    const data = await meliGet(`/users/${userId}/items/search`, {
      params: { status: 'active', search_type: 'scan', limit: 100, scroll_id: scrollId },
    });
    if (!data.results?.length) break;
    ids.push(...data.results);
    scrollId = data.scroll_id;
    if (!scrollId) break;
  }
  return ids;
}

async function obtenerItems(ids) {
  const items = [];
  for (let i = 0; i < ids.length; i += TAMANO_MULTIGET) {
    const lote = ids.slice(i, i + TAMANO_MULTIGET);
    const respuesta = await meliGet('/items', { params: { ids: lote.join(',') } });
    for (const r of respuesta) if (r.code === 200) items.push(r.body);
  }
  return items;
}

async function obtenerDescripcion(itemId) {
  try {
    const d = await meliGet(`/items/${itemId}/description`);
    return d.plain_text ?? '';
  } catch {
    return '';
  }
}

/** Sincroniza todas las publicaciones activas del cliente hacia la base de datos local. */
export function sincronizar() {
  if (syncEnCurso) return syncEnCurso;
  syncEnCurso = ejecutarSincronizacion().finally(() => { syncEnCurso = null; });
  return syncEnCurso;
}

export const sincronizando = () => Boolean(syncEnCurso);

async function ejecutarSincronizacion() {
  const userId = usuarioConectado();
  if (!userId) throw new MeliError('No hay cuenta de Mercado Libre conectada', 401);

  const { lastInsertRowid: logId } = db.prepare('INSERT INTO sync_log DEFAULT VALUES').run();
  const resumen = { total: 0, creadas: 0, actualizadas: 0, desactivadas: 0, errores: 0, detalle: [] };

  try {
    const { valor: uf } = await obtenerUF();
    const ids = await obtenerIdsActivos(userId);
    const items = await obtenerItems(ids);
    resumen.total = items.length;

    const descripciones = await mapConLimite(items, CONCURRENCIA_DESCRIPCIONES, (it) => obtenerDescripcion(it.id));

    items.forEach((item, idx) => {
      try {
        const accion = Propiedad.upsertDesdePortal(itemAPropiedad(item, descripciones[idx], uf));
        if (accion === 'omitida') return; // está en la papelera: no se revive desde el portal
        resumen[accion === 'creada' ? 'creadas' : 'actualizadas']++;
      } catch (err) {
        resumen.errores++;
        resumen.detalle.push(`${item.id}: ${err.message}`);
      }
    });

    // Sólo desactivamos si el listado de IDs se obtuvo completo (no hubo excepción arriba)
    resumen.desactivadas = Propiedad.desactivarPortalNoIncluidas(ids);
    finalizarLog(logId, resumen.errores ? 'con_errores' : 'ok', resumen);
    console.log(`[meli] Sincronización OK: ${JSON.stringify({ ...resumen, detalle: undefined })}`);
    return resumen;
  } catch (err) {
    resumen.detalle.push(err.message);
    finalizarLog(logId, 'error', resumen);
    throw err;
  }
}

function finalizarLog(id, estado, r) {
  db.prepare(`
    UPDATE sync_log SET finalizado_en = datetime('now'), estado = $estado, total = $total, creadas = $creadas,
      actualizadas = $actualizadas, desactivadas = $desactivadas, errores = $errores, detalle = $detalle
    WHERE id = $id
  `).run({
    id: Number(id), estado, total: r.total, creadas: r.creadas, actualizadas: r.actualizadas,
    desactivadas: r.desactivadas, errores: r.errores, detalle: r.detalle.slice(0, 50).join('\n') || null,
  });
}

/** Sincroniza un solo ítem (usado por las notificaciones/webhooks de Mercado Libre). */
export async function sincronizarItem(itemId) {
  const userId = usuarioConectado();
  if (!userId) return null;
  const item = await meliGet(`/items/${itemId}`);
  if (String(item.seller_id) !== userId) return null;

  const { valor: uf } = await obtenerUF();
  const propiedad = itemAPropiedad(item, await obtenerDescripcion(itemId), uf);
  if (propiedad.estado !== 'activa' && !Propiedad.obtenerPorPortal(itemId)) return null;
  return Propiedad.upsertDesdePortal(propiedad);
}

export function ultimasSincronizaciones(limite = 10) {
  return db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT ?').all(limite);
}
