import { Router } from 'express';
import { config } from '../config.js';
import * as Reserva from '../models/reserva.js';
import * as Pagos from '../services/pagos/index.js';
import { limitarSolicitudes } from '../middleware/rateLimit.js';

const router = Router();
const limite = limitarSolicitudes({ ventanaMs: 10 * 60 * 1000, max: 15, mensaje: 'Demasiados intentos de pago. Espera unos minutos.' });

const redirigir = (res, { codigo, resultado }) =>
  res.redirect(303, codigo ? `${config.siteUrl}/pago/${codigo}?resultado=${resultado}` : `${config.siteUrl}/?pago=error`);

// --- Retornos y notificaciones de los proveedores (antes de las rutas con :codigo) ---

// Webpay vuelve con GET (flujo normal) o POST (anulación / error), según el caso
async function retornoWebpay(req, res) {
  try {
    redirigir(res, await Pagos.procesarRetornoWebpay({ ...req.query, ...req.body }));
  } catch (err) {
    console.error('[pagos] Error en retorno Webpay:', err);
    redirigir(res, { codigo: null, resultado: 'error' });
  }
}
router.get('/webpay/retorno', retornoWebpay);
router.post('/webpay/retorno', retornoWebpay);

router.get('/mercadopago/retorno', async (req, res) => {
  try {
    redirigir(res, await Pagos.procesarRetornoMercadoPago(req.query));
  } catch (err) {
    console.error('[pagos] Error en retorno Mercado Pago:', err);
    redirigir(res, { codigo: null, resultado: 'error' });
  }
});

// Webhook: se responde 200 de inmediato y se consulta el pago a la API de Mercado Pago
router.post('/mercadopago/webhook', (req, res) => {
  res.sendStatus(200);
  const tipo = req.body?.type ?? req.query.type ?? req.query.topic;
  const id = req.body?.data?.id ?? req.query['data.id'] ?? req.query.id;
  if (tipo !== 'payment' || !id) return;
  Pagos.procesarPagoMercadoPago(String(id)).catch((err) => console.error(`[pagos] Error procesando webhook MP ${id}:`, err.message));
});

// --- Página de pago del cliente (el código es el secreto de acceso) ---

function reservaPorCodigo(req, res) {
  const reserva = Reserva.obtenerPorCodigo(req.params.codigo);
  if (!reserva) res.status(404).json({ error: 'Enlace de pago no válido' });
  return reserva;
}

router.get('/:codigo', (req, res) => {
  const reserva = reservaPorCodigo(req, res);
  if (!reserva) return;
  res.set('Cache-Control', 'no-store');
  res.json(Pagos.datosPublicos(reserva));
});

router.post('/:codigo/webpay', limite, async (req, res) => {
  const reserva = reservaPorCodigo(req, res);
  if (reserva) res.json(await Pagos.iniciarWebpay(reserva));
});

router.post('/:codigo/mercadopago', limite, async (req, res) => {
  const reserva = reservaPorCodigo(req, res);
  if (reserva) res.json(await Pagos.iniciarMercadoPago(reserva));
});

router.post('/:codigo/transferencia', limite, (req, res) => {
  const reserva = reservaPorCodigo(req, res);
  if (reserva) res.json(Pagos.informarTransferencia(reserva, req.body ?? {}));
});

export default router;
