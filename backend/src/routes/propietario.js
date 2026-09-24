import { Router } from 'express';
import * as Propietario from '../models/propietario.js';
import * as Comprobantes from '../services/comprobantes.js';
import { limitarSolicitudes } from '../middleware/rateLimit.js';
import { normalizarRut, normalizarTelefono } from '../lib/identidad.js';

// Portal de Propietarios: acceso sin contraseña y datos sólo de las propiedades de su RUT.
// Usa su propio token (otro secreto y otro tipo): no sirve en /admin ni en el portal de clientes.
const router = Router();
const MIN = 60 * 1000;
const porIdentificador = (req) => normalizarRut(req.body?.identificador) ?? normalizarTelefono(req.body?.identificador);

router.post(
  '/login/codigo',
  limitarSolicitudes({ ventanaMs: 15 * MIN, max: 5, mensaje: 'Demasiadas solicitudes de código. Espera 15 minutos.' }),
  limitarSolicitudes({ ventanaMs: 60 * MIN, max: 5, clave: porIdentificador, mensaje: 'Demasiadas solicitudes de código. Espera una hora.' }),
  async (req, res) => {
    await Propietario.solicitarCodigo(req.body?.identificador);
    // Misma respuesta exista o no: no revela quién es propietario
    res.json({ ok: true, mensaje: 'Si el dato corresponde a un propietario registrado, le enviamos un código de 4 dígitos por WhatsApp y/o correo.' });
  },
);

router.post(
  '/login/verificar',
  limitarSolicitudes({ ventanaMs: 15 * MIN, max: 10, mensaje: 'Demasiados intentos. Espera 15 minutos.' }),
  (req, res) => res.json(Propietario.verificarCodigo(req.body?.identificador, req.body?.codigo)),
);

router.post(
  '/login/enlace',
  limitarSolicitudes({ ventanaMs: 15 * MIN, max: 20, mensaje: 'Demasiados intentos. Espera 15 minutos.' }),
  (req, res) => res.json(Propietario.canjearEnlace(req.body?.token)),
);

// --- Con sesión de propietario ---

// El portal del propietario es de sólo lectura, así que la vista del admin ("ver como usuario") usa las mismas rutas
router.use((req, res, next) => {
  const sesion = Propietario.sesionDe(req.get('authorization')?.match(/^Bearer (.+)$/)?.[1]);
  if (!sesion) return res.status(401).json({ error: 'Tu sesión expiró. Ingresa nuevamente.' });
  req.rut = sesion.rut;
  req.impersonacion = sesion.impersonacion;
  res.set('Cache-Control', 'private, no-store');
  next();
});

router.get('/', (req, res) => res.json({ ...Propietario.panel(req.rut), impersonacion: req.impersonacion }));

// ?propiedad_id=&desde=YYYY-MM-DD&hasta=YYYY-MM-DD (máx. 120 días)
router.get('/calendario', (req, res) => {
  res.json(Propietario.calendario(req.rut, Number(req.query.propiedad_id), req.query.desde, req.query.hasta));
});

router.get('/liquidaciones/:lote/comprobante', (req, res) => {
  Propietario.exigirLotePropio(req.rut, req.params.lote);
  const c = Comprobantes.obtener(req.params.lote);
  if (!c) return res.status(404).json({ error: 'Esta liquidación no tiene comprobante adjunto' });
  Comprobantes.enviar(res, c);
});

export default router;
