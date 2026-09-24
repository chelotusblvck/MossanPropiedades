import { Router } from 'express';
import * as Propiedad from '../models/propiedad.js';
import * as Reserva from '../models/reserva.js';
import * as Bloqueo from '../models/bloqueo.js';
import * as Agenda from '../models/agenda.js';
import * as Visita from '../models/visita.js';
import * as Liquidacion from '../models/liquidacion.js';
import * as Cliente from '../models/cliente.js';
import * as Respaldos from '../services/respaldos.js';
import * as Comprobantes from '../services/comprobantes.js';
import * as Propietario from '../models/propietario.js';
import * as Publicacion from '../services/publicacion.js';
import { diagnostico } from '../services/diagnostico.js';
import * as Cuenta from '../models/cuenta.js';
import * as Auditoria from '../models/auditoria.js';
import { normalizarRut } from '../lib/identidad.js';
import { config } from '../config.js';
import { debeAvisarCambioEstado, notificarCambioEstado } from '../services/email.js';
import { requireAdmin, iniciarSesion, loginHabilitado } from '../middleware/auth.js';
import { limitarSolicitudes } from '../middleware/rateLimit.js';
import { esFechaValida, hoyChile, sumarDias, diferenciaDias } from '../lib/fechas.js';
import { obtenerUF } from '../services/uf.js';

const router = Router();

router.post(
  '/login',
  limitarSolicitudes({ ventanaMs: 15 * 60 * 1000, max: 10, mensaje: 'Demasiados intentos. Espera 15 minutos.' }),
  (req, res) => {
    if (!loginHabilitado()) return res.status(503).json({ error: 'Aún no hay contraseña: completa la configuración inicial en /admin/setup' });
    const sesion = iniciarSesion(req.body?.password);
    if (!sesion) return res.status(401).json({ error: 'Contraseña incorrecta' });
    res.json(sesion);
  },
);

router.use(requireAdmin);

router.get('/sesion', (req, res) => res.json({ ok: true }));

/**
 * Inventario y disponibilidad.
 * GET /api/admin/inventario?desde=YYYY-MM-DD&dias=35
 * - arriendo diario: reservas activas dentro de la ventana + si está ocupada hoy
 * - resto: flag "disponible" (libre / arrendada / vendida)
 */
router.get('/inventario', async (req, res) => {
  const hoy = hoyChile();
  const desde = esFechaValida(req.query.desde) ? req.query.desde : hoy;
  const dias = Math.min(Math.max(Number(req.query.dias) || 35, 7), 120);
  const hasta = sumarDias(desde, dias);

  // Ventana ampliada para calcular también "ocupada hoy" aunque hoy quede fuera del rango visible
  const vDesde = desde < hoy ? desde : hoy;
  const vHasta = hasta > sumarDias(hoy, 1) ? hasta : sumarDias(hoy, 1);
  const reservasPorProp = Map.groupBy(Reserva.enVentana(vDesde, vHasta), (r) => r.propiedad_id);
  const bloqueosPorProp = Map.groupBy(Bloqueo.enVentana(vDesde, vHasta), (b) => b.propiedad_id);
  const cubreHoy = (x) => x.fecha_inicio <= hoy && x.fecha_fin > hoy;
  const visible = (x) => x.fecha_inicio < hasta && x.fecha_fin > desde;

  const propiedades = Propiedad.listarInventario().map((p) => {
    if (p.modalidad !== 'arriendo_diario') return p;
    const rs = reservasPorProp.get(p.id) ?? [];
    const bs = bloqueosPorProp.get(p.id) ?? [];
    return {
      ...p,
      ocupada_hoy: rs.some(cubreHoy),
      bloqueada_hoy: bs.some(cubreHoy),
      reservas: rs.filter(visible),
      bloqueos: bs.filter(visible),
    };
  });

  const contar = (modalidad, cond = () => true) => propiedades.filter((p) => p.modalidad === modalidad && cond(p)).length;
  const { valor: uf } = await obtenerUF();

  res.json({
    hoy, desde, hasta, dias, uf,
    resumen: {
      diario_total: contar('arriendo_diario'),
      diario_libres_hoy: contar('arriendo_diario', (p) => p.disponible && !p.ocupada_hoy && !p.bloqueada_hoy),
      anual_total: contar('arriendo_anual'),
      anual_libres: contar('arriendo_anual', (p) => p.disponible),
      marzo_total: contar('arriendo_marzo_diciembre'),
      marzo_libres: contar('arriendo_marzo_diciembre', (p) => p.disponible),
      venta_total: contar('venta'),
      venta_libres: contar('venta', (p) => p.disponible),
      reservas_pendientes: Reserva.contarPendientes(),
      visitas_nuevas: Visita.contarNuevas(),
    },
    propiedades,
    // Ocultas del sitio (desactivadas o borradores del wizard) y papelera
    inactivas: Propiedad.listarInactivas(),
    eliminadas: Propiedad.listarEliminadas(),
  });
});

// Qué registros tiene asociados (para el modal de confirmación de desactivar / eliminar)
router.get('/propiedades/:id/impacto', (req, res) => {
  const id = Number(req.params.id);
  if (!Propiedad.obtener(id)) return res.status(404).json({ error: 'Propiedad no encontrada' });
  res.json(Propiedad.impacto(id, hoyChile()));
});

// { accion: 'desactivar' | 'activar' | 'eliminar' | 'restaurar' } — nunca borra filas (ver Propiedad.cambiarEstado)
router.post('/propiedades/:id/estado', (req, res) => {
  const accion = req.body?.accion;
  const p = Propiedad.cambiarEstado(Number(req.params.id), accion, hoyChile());
  if (accion === 'eliminar' || accion === 'restaurar') {
    Auditoria.registrar(`${accion}_propiedad`, { id: p.id, titulo: p.titulo }, req.ip);
  }
  res.json(p);
});

router.get('/reservas', (req, res) => {
  res.json(Reserva.listar(req.query));
});

router.patch('/reservas/:id', (req, res) => {
  const id = Number(req.params.id);
  const anterior = Reserva.obtener(id);
  const reserva = Reserva.cambiarEstado(id, req.body?.estado_pago);
  // Aviso al cliente en segundo plano (confirmada / cancelada)
  const aviso = anterior && debeAvisarCambioEstado(anterior, reserva, hoyChile());
  if (aviso) notificarCambioEstado(reserva, Propiedad.obtener(reserva.propiedad_id));
  res.json({ ...reserva, aviso_cliente: Boolean(aviso) });
});

// --- Solicitudes de visita ---
router.get('/visitas', (req, res) => res.json(Visita.listar(req.query)));
router.patch('/visitas/:id', (req, res) => res.json(Visita.actualizar(Number(req.params.id), req.body ?? {})));

// Extender el plazo de pago: { horas: 24 } suma horas; { horas: null } deja la reserva sin vencimiento
router.patch('/reservas/:id/plazo', (req, res) => {
  const horas = req.body?.horas === null ? null : req.body?.horas;
  if (horas === undefined) return res.status(400).json({ error: 'Indica horas (número) o null' });
  res.json(Reserva.cambiarPlazo(Number(req.params.id), horas));
});

function propiedadDiaria(req, res) {
  const propiedad = Propiedad.obtener(Number(req.params.id));
  if (!propiedad) {
    res.status(404).json({ error: 'Propiedad no encontrada' });
    return null;
  }
  if (propiedad.modalidad !== 'arriendo_diario') {
    res.status(400).json({ error: 'Sólo se pueden bloquear fechas en propiedades de arriendo diario' });
    return null;
  }
  return propiedad;
}

// Ocupación completa (reservas + bloqueos) de una propiedad, para el selector de bloqueo
router.get('/propiedades/:id/ocupacion', (req, res) => {
  const propiedad = propiedadDiaria(req, res);
  if (!propiedad) return;
  const hoy = hoyChile();
  res.json({ hoy, ocupados: Reserva.ocupados(propiedad.id, hoy, sumarDias(hoy, 550)) });
});

router.post('/propiedades/:id/bloqueos', (req, res) => {
  const propiedad = propiedadDiaria(req, res);
  if (!propiedad) return;
  const errores = Bloqueo.validar(req.body ?? {});
  if (errores.length) return res.status(400).json({ error: errores[0], errores });
  res.status(201).json(Bloqueo.crear(propiedad.id, req.body));
});

// --- Agenda: entrega de llaves y aseo (derivada de reservas pagadas) ---

// GET /api/admin/agenda?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (máx. 62 días)
router.get('/agenda', (req, res) => {
  const hoy = hoyChile();
  const desde = esFechaValida(req.query.desde) ? req.query.desde : hoy;
  let hasta = esFechaValida(req.query.hasta) && req.query.hasta >= desde ? req.query.hasta : sumarDias(desde, 41);
  if (diferenciaDias(desde, hasta) > 62) hasta = sumarDias(desde, 62);
  res.set('Cache-Control', 'no-store');
  res.json({
    hoy, desde, hasta,
    config: {
      hora_checkin: config.agenda.horaCheckin,
      hora_checkout: config.agenda.horaCheckout,
      origen_ruta: config.agenda.origenRuta,
    },
    tareas: Agenda.listarTareas(desde, hasta),
    reservas_pendientes: Agenda.reservasPendientesEnRango(desde, hasta),
    personal: Agenda.listarPersonal(),
    propiedades: Agenda.propiedadesDiarias(),
  });
});

router.put('/agenda/tareas/:reservaId/:tipo', (req, res) => {
  res.json(Agenda.guardarTarea(Number(req.params.reservaId), req.params.tipo, req.body));
});

router.get('/personal', (req, res) => res.json(Agenda.listarPersonal()));
router.post('/personal', (req, res) => res.status(201).json(Agenda.crearPersona(req.body ?? {})));
router.patch('/personal/:id', (req, res) => res.json(Agenda.actualizarPersona(Number(req.params.id), req.body ?? {})));
router.delete('/personal/:id', (req, res) => {
  if (!Agenda.eliminarPersona(Number(req.params.id))) return res.status(404).json({ error: 'Persona no encontrada' });
  res.status(204).end();
});

// --- Clientes (CRM): huéspedes e interesados agrupados por celular / RUT ---

router.get('/clientes', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { valor: uf } = await obtenerUF();
  res.json({ ...Cliente.listar(), uf });
});

// :id es la clave del cliente (ej. tel:981234567)
router.get('/clientes/:id', (req, res) => {
  const cliente = Cliente.obtener(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.set('Cache-Control', 'no-store');
  res.json(cliente);
});

// { nombre?, rut?, email?, etiqueta?: 'vip'|'confiable'|'observaciones'|'sin'|null, notas? }
router.put('/clientes/:id', (req, res) => {
  res.json(Cliente.actualizar(req.params.id, req.body ?? {}));
});

// --- Respaldos: base de datos (.sqlite) + imágenes (.zip) ---

router.get('/backups', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(Respaldos.estado());
});

// { imagenes?: boolean }
router.post('/backups/crear', (req, res) => {
  res.status(201).json(Respaldos.crear({ tipo: 'manual', imagenes: req.body?.imagenes !== false }));
});

router.get('/backups/descargar/:archivo', (req, res) => {
  const ruta = Respaldos.rutaArchivo(req.params.archivo);
  if (!ruta) return res.status(404).json({ error: 'Archivo de respaldo no encontrado' });
  res.set('Cache-Control', 'no-store');
  res.download(ruta, req.params.archivo);
});

/**
 * Restaurar (exige confirmar = "RESTAURAR"). Antes se guarda automáticamente el estado actual.
 * - JSON { id, db?, imagenes?, confirmar }: un respaldo guardado en el servidor
 * - application/octet-stream ?confirmar=RESTAURAR: archivo subido (.sqlite o .zip)
 */
router.post('/backups/restaurar', async (req, res) => {
  const resultado = req.is('application/json')
    ? Respaldos.restaurarGuardado(req.body ?? {})
    : await Respaldos.restaurarSubida(req, { confirmar: req.query.confirmar });
  res.json(resultado);
});

// --- Finanzas: liquidación a propietarios de arriendo diario ---

// GET /api/admin/finanzas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&propiedad_id=&propietario=&estado=pendiente|liquidada
router.get('/finanzas', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...Liquidacion.listar(req.query), ...Liquidacion.opcionesFiltro() });
});

// { items: [{ reserva_id, aseo_clp?, comision_clp? }], fecha_transferencia, comprobante?, notas? }
router.post('/finanzas/liquidaciones', (req, res) => {
  res.status(201).json(Liquidacion.liquidar(req.body ?? {}));
});

router.delete('/finanzas/liquidaciones/:reservaId', (req, res) => {
  const lote = Liquidacion.deshacer(Number(req.params.reservaId));
  if (!lote) return res.status(404).json({ error: 'Liquidación no encontrada' });
  Comprobantes.limpiarSiHuerfano(lote);
  res.status(204).end();
});

// Comprobante bancario de una transferencia (PDF/JPG/PNG/WEBP, máx. 10 MB). Cuerpo binario, ?nombre=archivo.pdf
router.post('/finanzas/lotes/:lote/comprobante', async (req, res) => {
  res.status(201).json(await Comprobantes.guardar(req.params.lote, req, req.query.nombre));
});

router.get('/finanzas/lotes/:lote/comprobante', (req, res) => {
  const c = Comprobantes.obtener(req.params.lote);
  if (!c) return res.status(404).json({ error: 'Esta transferencia no tiene comprobante adjunto' });
  Comprobantes.enviar(res, c);
});

// --- Estado del sistema (pestaña Estado / Desarrollador) ---
router.get('/estado-sistema', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await diagnostico());
});

// --- Wizard de publicación de propiedades ---

router.get('/wizard/condiciones', async (req, res) => res.json(await Publicacion.condiciones()));

// Propietarios: todos, o búsqueda por RUT o nombre (?q=)
router.get('/propietarios', (req, res) => res.json(Propietario.listar(req.query.q)));

// --- Modo "ver como usuario" (impersonación de sólo lectura, queda registrada) ---

// Opciones del selector: ?tipo=cliente|propietario&q=
router.get('/impersonar/opciones', (req, res) => {
  const tipo = req.query.tipo;
  if (tipo === 'cliente') return res.json(Cuenta.listarCuentas(req.query.q));
  if (tipo === 'propietario') return res.json(Propietario.listar(req.query.q).map(({ rut, rut_formateado, nombre, email }) => ({ rut, rut_formateado, nombre, email })));
  res.status(400).json({ error: 'tipo debe ser cliente o propietario' });
});

// { tipo: 'cliente' | 'propietario', rut } → token del portal marcado como impersonación (1 hora, sólo lectura)
router.post('/impersonar', (req, res) => {
  const { tipo, cliente_id: clienteId } = req.body ?? {};
  // Desde el directorio de clientes: { tipo: 'cliente', cliente_id } funciona también sin cuenta web (vista previa)
  if (tipo === 'cliente' && clienteId) {
    const sesion = Cuenta.sesionImpersonacionCliente(clienteId);
    Auditoria.registrar('impersonar_cliente', { cliente_id: clienteId, rut: sesion.rut, nombre: sesion.nombre, vista_previa: Boolean(sesion.previa) }, req.ip);
    return res.json({ tipo, ...sesion });
  }
  const rut = normalizarRut(req.body?.rut);
  if (!rut) return res.status(400).json({ error: 'RUT inválido' });
  if (!['cliente', 'propietario'].includes(tipo)) return res.status(400).json({ error: 'tipo debe ser cliente o propietario' });
  const sesion = tipo === 'cliente' ? Cuenta.sesionImpersonacion(rut) : Propietario.sesionImpersonacion(rut);
  Auditoria.registrar(`impersonar_${tipo}`, { rut, nombre: sesion.nombre }, req.ip);
  res.json({ tipo, ...sesion });
});

router.get('/auditoria', (req, res) => res.json(Auditoria.listar({ limite: req.query.limite })));

// { propietario: {...}, propiedad: {...}, propiedad_id? } → borrador oculto (reintento: mismo propiedad_id)
router.post('/propiedades/borrador', async (req, res) => {
  const { propietario, propiedad, propiedad_id } = req.body ?? {};
  res.status(201).json(await Publicacion.guardarBorrador({ propietario, propiedad, propiedadId: propiedad_id }));
});

// Foto (cuerpo binario JPG/PNG/WEBP, máx. 10 MB)
router.post('/propiedades/:id/imagenes', async (req, res) => {
  res.status(201).json(await Publicacion.subirImagen(req.params.id, req));
});

// { imagenes: [urls en orden; la primera es la portada], portal: boolean }
router.post('/propiedades/:id/publicar', (req, res) => {
  res.json(Publicacion.publicar(req.params.id, req.body ?? {}));
});

// --- Portal de propietarios ---

// Reenvía el acceso: correo con enlace + mensaje de WhatsApp listo para enviar desde el teléfono de la corredora
router.post('/propietarios/:rut/bienvenida', (req, res) => {
  const rut = normalizarRut(req.params.rut);
  if (!rut) return res.status(400).json({ error: 'RUT inválido' });
  res.json(Propietario.enviarBienvenida(rut));
});

router.delete('/bloqueos/:id', (req, res) => {
  if (!Bloqueo.eliminar(Number(req.params.id))) return res.status(404).json({ error: 'Bloqueo no encontrado' });
  res.status(204).end();
});

export default router;
