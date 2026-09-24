import { db, transaccion } from '../db/database.js';
import { hoyChile } from '../lib/fechas.js';
import { normalizarTelefono, normalizarRut } from '../lib/identidad.js';

export const ETIQUETAS = ['vip', 'confiable', 'observaciones', 'sin'];
export const TIPOS = ['diario', 'mensual', 'compra'];
const MIN_VIP = 3;          // reservas pagadas para ser VIP / recurrente
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ClienteError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export { normalizarTelefono, normalizarRut };

const claveContacto = (telefono, email) => {
  const tel = normalizarTelefono(telefono);
  if (tel) return `tel:${tel}`;
  return email ? `mail:${email.trim().toLowerCase()}` : null;
};

/** Unión de claves (celular / RUT) en grupos: cada grupo es una persona. */
function unionFind() {
  const padre = new Map();
  const raiz = (x) => {
    if (!padre.has(x)) padre.set(x, x);
    let r = x;
    while (padre.get(r) !== r) r = padre.get(r);
    padre.set(x, r);
    return r;
  };
  const unir = (a, b) => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) padre.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  return { raiz, unir };
}

function cargarDatos() {
  const reservas = db.prepare(`
    SELECT r.id, r.propiedad_id, r.cliente_nombre AS nombre, r.cliente_email AS email, r.cliente_telefono AS telefono,
           r.estado_pago, r.monto_total_clp, r.fecha_inicio, r.fecha_fin, r.noches, r.huespedes, r.metodo_pago,
           r.motivo_cancelacion, r.creado_en, r.cliente_rut, p.titulo AS propiedad_titulo, p.comuna AS propiedad_comuna, p.modalidad
    FROM reservas r JOIN propiedades p ON p.id = r.propiedad_id
    ORDER BY r.creado_en
  `).all();
  const visitas = db.prepare(`
    SELECT v.id, v.propiedad_id, v.nombre, v.email, v.telefono, v.estado, v.fecha_preferida, v.mensaje, v.creado_en,
           v.cliente_rut, v.cancelada_por_cliente_en, v.reprogramacion,
           p.titulo AS propiedad_titulo, p.comuna AS propiedad_comuna, p.modalidad
    FROM solicitudes_visita v JOIN propiedades p ON p.id = v.propiedad_id
    ORDER BY v.creado_en
  `).all();
  const crm = db.prepare('SELECT * FROM clientes_crm').all();
  const cuentas = db.prepare('SELECT * FROM cuentas_cliente').all();
  return { reservas, visitas, crm, cuentas };
}

function etiquetas(c, manual) {
  const set = new Set();
  if (c.reservas_pagadas >= MIN_VIP) set.add('vip');
  // Historial impecable: al menos una estadía pagada ya terminada y sin observaciones
  if (c.estadias_completadas > 0) set.add('confiable');
  if (manual === 'sin') return [];
  if (manual === 'vip') set.add('vip');
  if (manual === 'confiable') set.add('confiable');
  if (manual === 'observaciones') {
    set.delete('confiable');
    set.add('observaciones');
  }
  const lista = ['vip', 'confiable', 'observaciones'].filter((e) => set.has(e));
  // Automática: aún sin estadías completadas ni otra etiqueta (p. ej. sólo visitas o una primera reserva en curso)
  return lista.length ? lista : ['nuevo'];
}

/** Construye todos los clientes (agrupados) con sus métricas. Con detalle incluye reservas y visitas. */
function construir({ detalle = false } = {}) {
  const { reservas, visitas, crm, cuentas } = cargarDatos();
  const hoy = hoyChile();
  const uf = unionFind();

  const contactos = [
    ...reservas.map((r) => ({ ...r, origen: 'reserva', clave: claveContacto(r.telefono, r.email) })),
    ...visitas.map((v) => ({ ...v, origen: 'visita', clave: claveContacto(v.telefono, v.email) })),
  ].filter((c) => c.clave);
  // Mismo RUT (informado al reservar/visitar, de la cuenta o puesto en el CRM) = misma persona
  for (const c of contactos) {
    uf.raiz(c.clave);
    if (c.cliente_rut) uf.unir(c.clave, `rut:${c.cliente_rut}`);
  }
  for (const fila of crm) {
    uf.raiz(fila.clave);
    if (fila.rut) uf.unir(fila.clave, `rut:${fila.rut}`);
  }
  const claveCuenta = (cu) => claveContacto(cu.telefono, cu.email);
  for (const cu of cuentas) uf.unir(claveCuenta(cu), `rut:${cu.rut}`);

  const grupos = new Map();
  const grupo = (clave) => {
    const r = uf.raiz(clave);
    if (!grupos.has(r)) grupos.set(r, { claves: new Set(), reservas: [], visitas: [], crm: [], cuentas: [] });
    return grupos.get(r);
  };
  for (const c of contactos) {
    const g = grupo(c.clave);
    g.claves.add(c.clave);
    (c.origen === 'reserva' ? g.reservas : g.visitas).push(c);
  }
  for (const fila of crm) {
    const g = grupo(fila.clave);
    g.claves.add(fila.clave);
    g.crm.push(fila);
  }
  for (const cu of cuentas) {
    const g = grupo(claveCuenta(cu));
    g.claves.add(claveCuenta(cu));
    g.cuentas.push(cu);
  }

  const clientes = [];
  for (const g of grupos.values()) {
    if (!g.reservas.length && !g.visitas.length) continue; // ficha CRM sin actividad
    const claves = [...g.claves].filter((k) => !k.startsWith('rut:')).sort();
    const id = claves.find((k) => k.startsWith('tel:')) ?? claves[0];
    // Datos CRM: primero la ficha de la clave principal, luego las demás del grupo
    const fichas = [...g.crm].sort((a, b) => (a.clave === id ? -1 : b.clave === id ? 1 : 0));
    const crmDe = (campo) => fichas.find((f) => f[campo] != null && f[campo] !== '')?.[campo] ?? null;

    const actividad = [...g.reservas, ...g.visitas].sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1));
    const reciente = actividad[0];
    const pagadas = g.reservas.filter((r) => r.estado_pago === 'pagado');
    const tipos = new Set();
    if (g.reservas.length) tipos.add('diario');
    for (const v of g.visitas) tipos.add(v.modalidad === 'venta' ? 'compra' : v.modalidad === 'arriendo_diario' ? 'diario' : 'mensual');

    const cuenta = g.cuentas[0] ?? null;
    const emailInformado = cuenta?.email ?? actividad.find((a) => a.email)?.email ?? null;
    const nombreInformado = cuenta?.nombre ?? reciente.nombre;
    const c = {
      id,
      nombre: crmDe('nombre') ?? nombreInformado,
      nombre_informado: nombreInformado,
      rut: crmDe('rut') ?? cuenta?.rut ?? actividad.find((a) => a.cliente_rut)?.cliente_rut ?? null,
      cuenta: cuenta ? { creado_en: cuenta.creado_en, ultimo_ingreso_en: cuenta.ultimo_ingreso_en } : null,
      telefono: reciente.telefono,
      email: crmDe('email') ?? emailInformado,
      email_informado: emailInformado,
      telefonos: [...new Set(actividad.map((a) => a.telefono))],
      emails: [...new Set(actividad.map((a) => a.email?.toLowerCase()).filter(Boolean))],
      tipos: TIPOS.filter((t) => tipos.has(t)),
      reservas_total: g.reservas.length,
      reservas_pagadas: pagadas.length,
      reservas_canceladas: g.reservas.filter((r) => r.estado_pago === 'cancelado').length,
      estadias_completadas: pagadas.filter((r) => r.fecha_fin <= hoy).length,
      noches: pagadas.reduce((a, r) => a + r.noches, 0),
      total_gastado_clp: pagadas.reduce((a, r) => a + (r.monto_total_clp ?? 0), 0),
      visitas: g.visitas.length,
      primera_actividad: actividad.at(-1).creado_en,
      ultima_actividad: reciente.creado_en,
      etiqueta_manual: crmDe('etiqueta'),
      notas: crmDe('notas'),
    };
    c.etiquetas = etiquetas(c, c.etiqueta_manual);
    if (detalle) {
      c.claves = claves;
      c.historial_reservas = g.reservas.sort((a, b) => (a.fecha_inicio < b.fecha_inicio ? 1 : -1)).map(({ clave, origen, ...r }) => r);
      c.historial_visitas = g.visitas.sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1)).map(({ clave, origen, ...v }) => v);
    }
    clientes.push(c);
  }
  return clientes.sort((a, b) => (a.ultima_actividad < b.ultima_actividad ? 1 : -1));
}

export function listar() {
  const clientes = construir();
  const conCompras = clientes.filter((c) => c.reservas_pagadas > 0);
  const top = (orden) => [...conCompras].sort(orden).slice(0, 3)
    .map(({ id, nombre, reservas_pagadas, total_gastado_clp, etiquetas: e }) => ({ id, nombre, reservas_pagadas, total_gastado_clp, etiquetas: e }));
  const gastoTotal = conCompras.reduce((a, c) => a + c.total_gastado_clp, 0);
  return {
    resumen: {
      total_clientes: clientes.length,
      con_reservas: conCompras.length,
      gasto_promedio_clp: conCompras.length ? Math.round(gastoTotal / conCompras.length) : 0,
      // Recurrente: 2 o más reservas pagadas, sobre los clientes que han pagado alguna
      recurrentes: conCompras.filter((c) => c.reservas_pagadas >= 2).length,
      pct_recurrentes: conCompras.length ? Math.round((conCompras.filter((c) => c.reservas_pagadas >= 2).length / conCompras.length) * 1000) / 10 : 0,
      top_reservas: top((a, b) => b.reservas_pagadas - a.reservas_pagadas || b.total_gastado_clp - a.total_gastado_clp),
      top_gasto: top((a, b) => b.total_gastado_clp - a.total_gastado_clp || b.reservas_pagadas - a.reservas_pagadas),
    },
    clientes,
  };
}

/**
 * Cliente sin cuenta cuyo RUT fue registrado (en el CRM o en una solicitud) y que usó este correo.
 * Permite que clientes antiguos obtengan su cuenta sin volver a registrarse.
 */
export function buscarSinCuenta(rut, email) {
  const correo = String(email ?? '').trim().toLowerCase();
  const c = construir().find((x) => x.rut === rut && !x.cuenta && x.emails.includes(correo));
  return c ? { nombre: c.nombre, telefono: c.telefono, email: correo } : null;
}

export function obtener(id) {
  return construir({ detalle: true }).find((c) => c.id === id || c.claves.includes(id)) ?? null;
}

/**
 * Guarda los datos CRM de un cliente. La ficha queda en la clave principal; en las demás claves del
 * grupo sólo se conserva el RUT (es lo que las mantiene unidas).
 */
export function actualizar(id, d = {}) {
  const c = obtener(id);
  if (!c) throw new ClienteError('Cliente no encontrado', 404);

  const texto = (v, max, campo) => {
    if (v == null || v === '') return null;
    if (typeof v !== 'string' || v.trim().length > max) throw new ClienteError(`${campo}: máximo ${max} caracteres`);
    return v.trim() || null;
  };
  const nombre = d.nombre !== undefined ? texto(d.nombre, 120, 'nombre') : c.nombre;
  const email = d.email !== undefined ? texto(d.email, 160, 'email') : c.email;
  if (email && !RE_EMAIL.test(email)) throw new ClienteError('Correo inválido');
  let rut = c.rut;
  if (d.rut !== undefined) {
    rut = d.rut ? normalizarRut(d.rut) : null;
    if (d.rut && !rut) throw new ClienteError('RUT inválido (revisa el dígito verificador)');
  }
  const etiqueta = d.etiqueta !== undefined ? d.etiqueta || null : c.etiqueta_manual;
  if (etiqueta && !ETIQUETAS.includes(etiqueta)) throw new ClienteError(`etiqueta debe ser: ${ETIQUETAS.join(', ')} o vacía`);
  const notas = d.notas !== undefined ? texto(d.notas, 2000, 'notas') : c.notas;

  const upsert = db.prepare(`
    INSERT INTO clientes_crm (clave, rut, nombre, email, etiqueta, notas) VALUES ($clave, $rut, $nombre, $email, $etiqueta, $notas)
    ON CONFLICT (clave) DO UPDATE SET rut = $rut, nombre = $nombre, email = $email, etiqueta = $etiqueta, notas = $notas,
      actualizado_en = datetime('now')
  `);
  transaccion(() => {
    // Nombre y correo sólo se guardan si difieren de lo informado por el cliente (así siguen sus datos nuevos)
    upsert.run({
      clave: c.id,
      rut,
      nombre: nombre === c.nombre_informado ? null : nombre,
      email: email?.toLowerCase() === c.email_informado?.toLowerCase() ? null : email,
      etiqueta,
      notas,
    });
    for (const clave of c.claves) {
      if (clave !== c.id) upsert.run({ clave, rut, nombre: null, email: null, etiqueta: null, notas: null });
    }
  });
  // Si el RUT ya estaba en otro cliente, ambos quedan unificados
  const actualizado = obtener(c.id);
  return { ...actualizado, unificado: actualizado.claves.length > c.claves.length };
}
