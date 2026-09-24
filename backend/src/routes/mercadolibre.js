import { Router } from 'express';
import { config } from '../config.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  crearUrlAutorizacion, intercambiarCodigo, estadoConexion, desconectar, usuarioConectado,
} from '../services/mercadolibre/oauth.js';
import {
  sincronizar, sincronizarItem, sincronizando, ultimasSincronizaciones,
} from '../services/mercadolibre/sync.js';

const router = Router();

// 1) El administrador abre en el navegador: /api/mercadolibre/auth?key=ADMIN_API_KEY
router.get('/auth', requireAdmin, (req, res) => {
  res.redirect(crearUrlAutorizacion());
});

// 2) Mercado Libre redirige aquí con ?code=...&state=...
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error || !code) {
    return res.redirect(`${config.frontendUrl}/?meli=error&motivo=${encodeURIComponent(error ?? 'sin_codigo')}`);
  }
  try {
    await intercambiarCodigo(String(code), String(state));
    sincronizar().catch((err) => console.error('[meli] Error en sincronización inicial:', err.message));
    res.redirect(`${config.frontendUrl}/?meli=conectado`);
  } catch (err) {
    console.error('[meli] Error en callback OAuth:', err.message);
    res.redirect(`${config.frontendUrl}/?meli=error&motivo=${encodeURIComponent(err.message)}`);
  }
});

router.get('/status', requireAdmin, (req, res) => {
  res.json({ ...estadoConexion(), sincronizando: sincronizando(), historial: ultimasSincronizaciones() });
});

// Sincronización manual. Responde con el resumen al terminar.
router.post('/sync', requireAdmin, async (req, res) => {
  res.json(await sincronizar());
});

// Webhook de notificaciones (configurar "URL de retorno de notificaciones" con el tópico "items").
// ML exige responder 200 rápido; el procesamiento ocurre después.
router.post('/notifications', (req, res) => {
  res.sendStatus(200);
  const { topic, resource, user_id } = req.body ?? {};
  if (!['items', 'items_prices'].includes(topic) || String(user_id) !== usuarioConectado()) return;
  const itemId = String(resource ?? '').match(/MLC\d+/)?.[0];
  if (!itemId) return;
  sincronizarItem(itemId).catch((err) => console.error(`[meli] Error sincronizando ${itemId}:`, err.message));
});

router.delete('/disconnect', requireAdmin, (req, res) => {
  desconectar();
  res.status(204).end();
});

export default router;
