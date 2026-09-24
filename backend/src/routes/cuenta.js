import { Router } from 'express';
import * as Cuenta from '../models/cuenta.js';
import * as Propiedad from '../models/propiedad.js';
import * as Fidelizacion from '../models/fidelizacion.js';
import { limitarSolicitudes } from '../middleware/rateLimit.js';
import { normalizarRut } from '../lib/identidad.js';
import { enviarCodigoAcceso, notificarCambioVisitaCliente } from '../services/email.js';

// Portal público del cliente ("Mi cuenta"): ingreso con RUT + código enviado al correo
const router = Router();
const MIN = 60 * 1000;
const porRut = (req) => normalizarRut(req.body?.rut);

// Paso 1 de los formularios de visita y reserva: ¿cliente nuevo o existente?
router.post(
  '/identificar',
  limitarSolicitudes({ ventanaMs: 15 * MIN, max: 30, mensaje: 'Demasiados intentos. Espera unos minutos.' }),
  (req, res) => {
    if (req.body?.sitio_web) return res.json({ estado: 'nuevo' }); // campo trampa
    res.json(Cuenta.identificar(req.body ?? {}));
  },
);

router.post(
  '/codigo',
  limitarSolicitudes({ ventanaMs: 15 * MIN, max: 5, mensaje: 'Demasiadas solicitudes de código. Espera 15 minutos.' }),
  limitarSolicitudes({ ventanaMs: 60 * MIN, max: 5, clave: porRut, mensaje: 'Demasiadas solicitudes de código para este RUT. Espera una hora.' }),
  (req, res) => {
    const r = Cuenta.solicitarCodigo(req.body ?? {});
    if (r) enviarCodigoAcceso(r.cuenta, r.codigo, r.minutos); // en segundo plano
    // Misma respuesta exista o no la cuenta: no revela qué RUT están registrados
    res.json({ ok: true, mensaje: 'Si el RUT y el correo coinciden con una cuenta, te enviamos un código de 6 dígitos.' });
  },
);

router.post(
  '/verificar',
  limitarSolicitudes({ ventanaMs: 15 * MIN, max: 15, mensaje: 'Demasiados intentos. Espera 15 minutos.' }),
  (req, res) => {
    res.json(Cuenta.verificarCodigo(req.body ?? {}));
  },
);

// --- Con sesión de cliente ---

function requireCliente(req, res, next) {
  const token = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  const sesion = Cuenta.sesionDe(token);
  if (!sesion) return res.status(401).json({ error: 'Tu sesión expiró. Ingresa nuevamente.' });
  req.rut = sesion.rut;
  req.impersonacion = sesion.impersonacion;
  req.previa = sesion.previa; // cliente sin cuenta web visto por el admin (sólo lectura)
  next();
}

/** El admin viendo "como el cliente" sólo mira: no puede cambiar nada en su nombre. */
function soloTitular(req, res, next) {
  if (req.impersonacion) return res.status(403).json({ error: 'Modo "ver como usuario": sólo lectura. El cliente debe hacer este cambio desde su cuenta.' });
  next();
}

router.use(requireCliente);

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const titular = req.previa ?? { rut: req.rut, email: Cuenta.obtener(req.rut).email };
  res.json({
    ...(req.previa ? Cuenta.historialDe(req.previa) : Cuenta.historial(req.rut)),
    fidelizacion: Fidelizacion.estado(titular), // nivel, progreso y cupón vigente
    impersonacion: req.impersonacion,
    vista_previa: Boolean(req.previa),
  });
});

router.patch('/', soloTitular, (req, res) => {
  res.json(Cuenta.actualizarDatos(req.rut, req.body ?? {}));
});

const limiteAcciones = limitarSolicitudes({ ventanaMs: 60 * MIN, max: 10, clave: (req) => req.rut, mensaje: 'Demasiados cambios seguidos. Intenta más tarde.' });

router.post('/visitas/:id/cancelar', soloTitular, limiteAcciones, (req, res) => {
  const v = Cuenta.cancelarVisita(req.rut, Number(req.params.id));
  notificarCambioVisitaCliente(v, Propiedad.obtener(v.propiedad_id), 'cancelar');
  res.json({ ok: true });
});

// { fecha_preferida?, franja?, mensaje? }
router.post('/visitas/:id/reprogramar', soloTitular, limiteAcciones, (req, res) => {
  const v = Cuenta.reprogramarVisita(req.rut, Number(req.params.id), req.body ?? {});
  notificarCambioVisitaCliente(v, Propiedad.obtener(v.propiedad_id), 'reprogramar');
  res.json({ ok: true });
});

export default router;
