import { Router } from 'express';
import * as Propiedad from '../models/propiedad.js';
import * as Reserva from '../models/reserva.js';
import { requireAdmin } from '../middleware/auth.js';
import { limitarSolicitudes } from '../middleware/rateLimit.js';
import { obtenerUF } from '../services/uf.js';
import { notificarNuevaReserva, notificarSolicitudVisita } from '../services/email.js';
import * as Visita from '../models/visita.js';
import * as Cuenta from '../models/cuenta.js';
import * as Propietario from '../models/propietario.js';
import * as Auditoria from '../models/auditoria.js';
import * as Fidelizacion from '../models/fidelizacion.js';
import { normalizarRut } from '../lib/identidad.js';
import { config } from '../config.js';
import { esFechaValida, hoyChile, sumarDias, diferenciaDias } from '../lib/fechas.js';

const router = Router();

const numeroPositivo = (v) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
};

function parsearFiltros(q) {
  const fechasOk = esFechaValida(q.llegada) && esFechaValida(q.salida) && q.salida > q.llegada;
  return {
    modalidad: Propiedad.MODALIDADES.includes(q.modalidad) ? q.modalidad : undefined,
    grupo: Propiedad.GRUPOS.includes(q.grupo) ? q.grupo : undefined, // venta | diario | mensual
    operacion: Propiedad.OPERACIONES.includes(q.operacion) ? q.operacion : undefined,
    tipo: Propiedad.TIPOS.includes(q.tipo) ? q.tipo : undefined,
    comuna: q.comuna?.trim() || undefined,
    q: q.q?.trim() || undefined,
    moneda: q.moneda === 'CLP' ? 'CLP' : 'UF',
    precio_min: numeroPositivo(q.precio_min),
    precio_max: numeroPositivo(q.precio_max),
    dormitorios_min: numeroPositivo(q.dormitorios_min),
    banos_min: numeroPositivo(q.banos_min),
    llegada: fechasOk ? q.llegada : undefined,
    salida: fechasOk ? q.salida : undefined,
    orden: q.orden,
    page: q.page,
    limit: q.limit,
  };
}

function obtenerPublica(req, res) {
  const propiedad = Propiedad.obtener(Number(req.params.id));
  if (!propiedad || propiedad.estado !== 'activa' || !propiedad.disponible) {
    res.status(404).json({ error: 'Propiedad no encontrada' });
    return null;
  }
  return propiedad;
}

// GET /api/propiedades?modalidad=venta&tipo=casa&comuna=Ñuñoa&moneda=UF&precio_min=3000&precio_max=8000&page=1
// Arriendo diario con fechas libres: ?modalidad=arriendo_diario&llegada=2026-12-20&salida=2026-12-27
router.get('/', (req, res) => {
  res.json(Propiedad.listar(parsearFiltros(req.query)));
});

// Home: máximo 8 propiedades en una sola consulta, repartidas entre grupos. ?grupo=venta|diario|mensual
router.get('/destacadas', (req, res) => {
  res.json(Propiedad.destacadas({ grupo: req.query.grupo, limit: req.query.limit }));
});

router.get('/comunas', (req, res) => {
  res.json(Propiedad.comunas());
});

/** Comisión y garantía efectivas (las de la propiedad o las por defecto). */
function condiciones(p) {
  const esVenta = p.modalidad === 'venta';
  return {
    comision_pct: p.comision_pct ?? (esVenta ? config.comision.ventaPct : config.comision.arriendoPct),
    comision_base: esVenta ? 'precio' : 'mes_arriendo', // sobre qué se calcula el %
    comision_mas_iva: config.comision.masIva,
    garantia_meses: esVenta || p.modalidad === 'arriendo_diario' ? null : p.garantia_meses ?? 1,
    // Arriendo diario: horarios de la propiedad o los generales
    ...(p.modalidad === 'arriendo_diario' && {
      hora_checkin: p.hora_checkin ?? config.agenda.horaCheckin,
      hora_checkout: p.hora_checkout ?? config.agenda.horaCheckout,
    }),
  };
}

router.get('/:id', (req, res) => {
  const propiedad = obtenerPublica(req, res);
  if (!propiedad) return;
  // Sin datos internos (agenda, propietario, liquidación)
  res.json({ ...Propiedad.sinDatosInternos(propiedad), condiciones: condiciones(propiedad) });
});

const DIA_MS = 24 * 60 * 60 * 1000;

// Solicitud de visita (venta y arriendo mensual). "sitio_web" es un campo trampa oculto para bots.
// El RUT identifica al cliente: si no tiene cuenta se crea con nombre y celular (registro de 1 paso).
router.post(
  '/:id/visitas',
  limitarSolicitudes({ ventanaMs: 15 * 60 * 1000, max: 5, mensaje: 'Demasiadas solicitudes. Intenta en unos minutos.' }),
  limitarSolicitudes({ ventanaMs: DIA_MS, max: 15, mensaje: 'Demasiadas solicitudes desde tu conexión hoy. Intenta mañana.' }),
  (req, res) => {
    const propiedad = obtenerPublica(req, res);
    if (!propiedad) return;
    const datos = req.body ?? {};
    if (datos.sitio_web) return res.status(201).json({ ok: true }); // bot: se ignora sin revelarlo
    const identidad = Cuenta.prepararIdentidad({ rut: datos.rut, email: datos.email, nombre: datos.nombre, telefono: datos.telefono });
    Cuenta.verificarLimiteVisitas(identidad.rut);
    const completa = { ...datos, ...identidad.datos, cliente_rut: identidad.rut };
    const error = Visita.validar(completa);
    if (error) return res.status(400).json({ error });
    Cuenta.registrarSiNueva(identidad); // sólo después de validar todo
    const visita = Visita.crear(propiedad.id, completa);
    notificarSolicitudVisita(visita, propiedad); // en segundo plano
    res.status(201).json({ ok: true, id: visita.id, cuenta_nueva: identidad.nueva });
  },
);

// Rangos ocupados de una propiedad de arriendo diario (sin datos personales)
router.get('/:id/disponibilidad', (req, res) => {
  const propiedad = obtenerPublica(req, res);
  if (!propiedad) return;
  const hoy = hoyChile();
  const desde = esFechaValida(req.query.desde) && req.query.desde > hoy ? req.query.desde : hoy;
  let hasta = esFechaValida(req.query.hasta) && req.query.hasta > desde ? req.query.hasta : sumarDias(desde, 365);
  if (diferenciaDias(desde, hasta) > 550) hasta = sumarDias(desde, 550);
  res.set('Cache-Control', 'no-store');
  res.json({ hoy, desde, hasta, ocupados: propiedad.modalidad === 'arriendo_diario' ? Reserva.ocupados(propiedad.id, desde, hasta) : [] });
});

// Vista previa del cupón de fidelización en el formulario de reserva: { rut, cupon } → descuento
router.post(
  '/:id/cupon',
  limitarSolicitudes({ ventanaMs: 15 * 60 * 1000, max: 15, mensaje: 'Demasiados intentos con cupones. Espera unos minutos.' }),
  (req, res) => {
    const propiedad = obtenerPublica(req, res);
    if (!propiedad) return;
    if (propiedad.modalidad !== 'arriendo_diario') return res.status(400).json({ error: 'Los cupones son para arriendo diario' });
    const rut = normalizarRut(req.body?.rut);
    // Sin cuenta, el cupón sólo puede ser válido si ese RUT ya tiene estadías (y el código es secreto)
    const f = Fidelizacion.validarCupon(req.body?.cupon, rut ? Cuenta.obtener(rut) ?? { rut, email: null } : null);
    if (!f) return res.status(400).json({ error: 'Ingresa el código del cupón' });
    res.json({ cupon: f.cupon, nivel: f.nivel_nombre, descuento_pct: f.descuento_pct, beneficios: f.beneficios });
  },
);

// Solicitud de reserva (queda "pendiente" de pago y bloquea las fechas)
router.post(
  '/:id/reservas',
  limitarSolicitudes({ ventanaMs: 15 * 60 * 1000, max: 5, mensaje: 'Demasiadas solicitudes de reserva. Intenta en unos minutos.' }),
  limitarSolicitudes({ ventanaMs: DIA_MS, max: 20, mensaje: 'Demasiadas solicitudes de reserva desde tu conexión hoy. Intenta mañana.' }),
  (req, res) => {
    const propiedad = obtenerPublica(req, res);
    if (!propiedad) return;
    if (propiedad.modalidad !== 'arriendo_diario') {
      return res.status(400).json({ error: 'Esta propiedad no se arrienda por noche' });
    }
    const datos = req.body ?? {};
    if (datos.sitio_web) return res.status(201).json({ ok: true }); // campo trampa: bot
    const identidad = Cuenta.prepararIdentidad({
      rut: datos.rut, email: datos.cliente_email, nombre: datos.cliente_nombre, telefono: datos.cliente_telefono,
    });
    Cuenta.verificarLimiteReservas(identidad.rut);
    const completa = {
      ...datos,
      cliente_nombre: identidad.datos.nombre,
      cliente_email: identidad.datos.email,
      cliente_telefono: identidad.datos.telefono,
      cliente_rut: identidad.rut,
    };
    const errores = Reserva.validar(completa);
    if (errores.length) return res.status(400).json({ error: errores[0], errores });
    // Cupón de fidelización: sólo el vigente del propio RUT. Un cliente antiguo que reserva por primera vez
    // con cuenta nueva puede traer el cupón que la corredora le vio en la vista previa de su portal.
    const fidelizacion = Fidelizacion.validarCupon(
      datos.cupon,
      identidad.nueva ? { rut: identidad.rut, email: identidad.datos.email } : Cuenta.obtener(identidad.rut),
    );

    Cuenta.registrarSiNueva(identidad);
    const reserva = Reserva.crear(propiedad, completa, fidelizacion);
    // En segundo plano: la respuesta al cliente no espera al servidor de correo
    notificarNuevaReserva(reserva, propiedad);
    res.status(201).json({
      id: reserva.id,
      fecha_inicio: reserva.fecha_inicio,
      fecha_fin: reserva.fecha_fin,
      noches: reserva.noches,
      monto_total_clp: reserva.monto_total_clp,
      descuento_clp: reserva.descuento_clp,
      descuento_pct: reserva.descuento_pct,
      beneficios: reserva.beneficios,
      estado_pago: reserva.estado_pago,
      codigo_pago: reserva.codigo_pago, // para ir a pagar: /pago/:codigo
      vence_en: reserva.vence_en, // UTC; null si no vence
      cuenta_nueva: identidad.nueva,
    });
  },
);

// --- Administración ---

router.post('/', requireAdmin, async (req, res) => {
  const data = Propiedad.normalizar(req.body ?? {});
  const errores = [...Propiedad.validar(data), ...Propiedad.validarPropietario(data)];
  if (errores.length) return res.status(400).json({ errores });
  const { valor } = await obtenerUF();
  const propiedad = Propiedad.crear(Propiedad.completarPrecios({ ...data, origen: 'manual' }, valor));
  res.status(201).json({ ...propiedad, portal_propietario: Propietario.sincronizarDesdePropiedad(propiedad) });
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const actual = Propiedad.obtener(id);
  if (!actual) return res.status(404).json({ error: 'Propiedad no encontrada' });
  // En la papelera no se edita (ni se puede reactivar con estado: 'activa'): primero se restaura
  if (actual.eliminada_en) return res.status(409).json({ error: 'La propiedad está en la papelera: restáurala primero' });

  const cambios = { ...req.body };
  // Si cambia la modalidad, "operacion" se recalcula a partir de ella
  if (cambios.modalidad) delete cambios.operacion;
  const combinada = Propiedad.normalizar({ ...actual, ...cambios });
  const errores = [...Propiedad.validar(combinada), ...Propiedad.validarPropietario(cambios)];
  if (errores.length) return res.status(400).json({ errores });

  const { valor } = await obtenerUF();
  const propiedad = Propiedad.actualizar(id, Propiedad.completarPrecios(combinada, valor));
  // Crea o actualiza la cuenta del propietario (y le envía la bienvenida si es nueva)
  const portal = 'propietario_rut' in cambios ? Propietario.sincronizarDesdePropiedad(propiedad) : null;
  res.json({ ...propiedad, portal_propietario: portal });
});

// Borrado LÓGICO (papelera). Antes era físico y, por las claves ON DELETE CASCADE, arrastraba reservas,
// pagos y liquidaciones. Rechaza si hay reservas vigentes o futuras.
router.delete('/:id', requireAdmin, (req, res) => {
  const p = Propiedad.cambiarEstado(Number(req.params.id), 'eliminar', hoyChile());
  Auditoria.registrar('eliminar_propiedad', { id: p.id, titulo: p.titulo }, req.ip);
  res.status(204).end();
});

export default router;
