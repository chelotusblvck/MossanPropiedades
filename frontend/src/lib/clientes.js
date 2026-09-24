import { MARCA } from './marca';
import { descargarCSV } from './csv';
import { hoyISO, desdeUTC, aISO } from './fechas';

export const ETIQUETAS = {
  vip: { icono: '🌟', label: 'VIP / Recurrente', corto: 'VIP', clase: 'bg-amber-100 text-amber-900 ring-amber-300' },
  confiable: { icono: '🟢', label: 'Cliente confiable', corto: 'Confiable', clase: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  observaciones: { icono: '⚠️', label: 'Con observaciones', corto: 'Observaciones', clase: 'bg-rose-100 text-rose-800 ring-rose-200' },
  nuevo: { icono: '🆕', label: 'Cliente nuevo', corto: 'Nuevo', clase: 'bg-sky-100 text-sky-800 ring-sky-200' }, // automática
};

export const TIPOS_CLIENTE = {
  diario: 'Huésped (arriendo diario)',
  mensual: 'Arriendo anual / Mar–Dic',
  compra: 'Comprador / visita',
};

/** '12345678-5' -> '12.345.678-5' */
export function formatRut(rut) {
  if (!rut) return null;
  const [cuerpo, dv] = rut.split('-');
  return `${Number(cuerpo).toLocaleString('es-CL')}-${dv}`;
}

/** Número para wa.me: celulares chilenos de 9 dígitos llevan el 56 delante. */
export function numeroWhatsApp(tel) {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (d.startsWith('56') && d.length >= 11) return d;
  if (d.length === 9) d = `56${d}`;
  return d;
}

const primerNombre = (nombre) => nombre.trim().split(/\s+/)[0];

/** Plantilla de WhatsApp según el tipo de cliente. */
export function mensajeWhatsApp(c) {
  const hola = `Hola ${primerNombre(c.nombre)}, te saluda ${MARCA}.`;
  const sitio = window.location.origin;
  if (c.tipos.includes('diario')) {
    return `${hola} Tenemos nuevas propiedades disponibles para tu próxima estadía 🏖️. ¿Te comparto algunas opciones? ${sitio}`;
  }
  if (c.tipos.includes('mensual')) {
    return `${hola} Tenemos nuevas propiedades en arriendo que podrían interesarte. ¿Te envío algunas alternativas? ${sitio}`;
  }
  return `${hola} Tenemos nuevas propiedades en venta que podrían interesarte. ¿Coordinamos una visita? ${sitio}`;
}

export const linkWhatsAppCliente = (c) => `https://wa.me/${numeroWhatsApp(c.telefono)}?text=${encodeURIComponent(mensajeWhatsApp(c))}`;

// Colores de avatar estables por cliente
const COLORES = ['bg-sky-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-brand-600', 'bg-indigo-500', 'bg-teal-500'];
export function colorAvatar(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}
export const iniciales = (nombre) => nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

/** Texto sin tildes ni mayúsculas, para buscar. */
export const normalizarTexto = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿Coincide el cliente con la búsqueda? (nombre, RUT, celular o correo) */
export function coincide(c, busqueda) {
  const q = normalizarTexto(busqueda.trim());
  if (!q) return true;
  const digitos = q.replace(/[^0-9k]/g, '');
  const texto = normalizarTexto([c.nombre, ...c.emails, c.email].join(' '));
  if (texto.includes(q)) return true;
  if (digitos.length >= 3) {
    const telefonos = c.telefonos.map((t) => t.replace(/\D/g, '')).join(' ');
    const rut = (c.rut ?? '').replace(/[^0-9K]/g, '').toLowerCase();
    return telefonos.includes(digitos) || rut.includes(digitos);
  }
  return false;
}

/** Fecha local (YYYY-MM-DD) de un 'YYYY-MM-DD HH:MM:SS' UTC del servidor. */
export const fechaLocal = (s) => aISO(desdeUTC(s));

export function exportarClientes(clientes) {
  const columnas = [
    ['Nombre', (c) => c.nombre],
    ['RUT', (c) => formatRut(c.rut)],
    ['Celular', (c) => `+${numeroWhatsApp(c.telefono)}`],
    ['Correo', (c) => c.email],
    ['Otros correos', (c) => c.emails.filter((e) => e !== c.email?.toLowerCase()).join(', ')],
    ['Tipo', (c) => c.tipos.map((t) => TIPOS_CLIENTE[t]).join(', ')],
    ['Etiquetas', (c) => c.etiquetas.map((e) => ETIQUETAS[e].corto).join(', ')],
    ['Reservas pagadas', (c) => c.reservas_pagadas],
    ['Noches', (c) => c.noches],
    ['Total gastado (CLP)', (c) => c.total_gastado_clp],
    ['Visitas solicitadas', (c) => c.visitas],
    ['Primera actividad', (c) => fechaLocal(c.primera_actividad)],
    ['Última actividad', (c) => fechaLocal(c.ultima_actividad)],
  ];
  descargarCSV(`clientes_${hoyISO()}.csv`, columnas, clientes);
}
