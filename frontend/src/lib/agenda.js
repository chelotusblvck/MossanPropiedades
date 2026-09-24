import { fechaLarga } from './fechas';
import { MARCA } from './marca';

export const TIPOS_TAREA = {
  entrega_llaves: { label: 'Entrega de llaves', corto: 'Entrega', emoji: '🔑', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200', punto: 'bg-emerald-500' },
  recepcion_llaves: { label: 'Recepción de llaves', corto: 'Recepción', emoji: '↩️', color: 'bg-sky-100 text-sky-800 ring-sky-200', punto: 'bg-sky-500' },
  aseo: { label: 'Aseo', corto: 'Aseo', emoji: '🧹', color: 'bg-violet-100 text-violet-800 ring-violet-200', punto: 'bg-violet-500' },
};

export const esTareaDeLlaves = (t) => t.tipo !== 'aseo';

export const direccionDe = (t) =>
  t.propiedad.direccion ? `${t.propiedad.direccion}, ${t.propiedad.comuna}, Chile` : `${t.propiedad.comuna}, Chile`;

/**
 * Paradas de la ruta de llaves del día, ordenadas por hora. Cuando varias comparten hora, se elige primero
 * la misma propiedad de la parada anterior (recambio) y luego la misma comuna, para no ir y volver.
 */
export function paradasRuta(tareas) {
  const ordenadas = tareas
    .filter(esTareaDeLlaves)
    .sort((a, b) => a.hora.localeCompare(b.hora) || a.propiedad.comuna.localeCompare(b.propiedad.comuna));
  const ruta = [];
  for (let i = 0; i < ordenadas.length;) {
    const grupo = [];
    const hora = ordenadas[i].hora;
    while (i < ordenadas.length && ordenadas[i].hora === hora) grupo.push(ordenadas[i++]);
    while (grupo.length) {
      const anterior = ruta[ruta.length - 1];
      let k = anterior ? grupo.findIndex((t) => t.propiedad.id === anterior.propiedad.id) : -1;
      if (k < 0 && anterior) k = grupo.findIndex((t) => t.propiedad.comuna === anterior.propiedad.comuna);
      ruta.push(grupo.splice(Math.max(k, 0), 1)[0]);
    }
  }
  return ruta;
}

/** Enlace de Google Maps con la ruta (origen opcional, máximo 9 paradas intermedias). */
export function urlRutaMaps(paradas, origen) {
  // Una sola visita por propiedad consecutiva (p. ej. recambio: recepción + entrega en el mismo lugar)
  const puntos = paradas.map(direccionDe).filter((d, i, arr) => d !== arr[i - 1]);
  if (!puntos.length) return null;
  const todos = origen ? [origen, ...puntos] : puntos;
  if (todos.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(todos[0])}`;
  const params = new URLSearchParams({
    api: '1',
    origin: todos[0],
    destination: todos[todos.length - 1],
    travelmode: 'driving',
  });
  const intermedios = todos.slice(1, -1).slice(0, 9);
  if (intermedios.length) params.set('waypoints', intermedios.join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

export function textoRuta(fecha, paradas) {
  const lineas = [`🔑 *Ruta de llaves · ${fechaLarga(fecha)}*`, ''];
  paradas.forEach((t, i) => {
    const tipo = TIPOS_TAREA[t.tipo];
    lineas.push(`${i + 1}. *${t.hora}* ${tipo.emoji} ${tipo.corto} · ${t.propiedad.titulo}`);
    lineas.push(`   📍 ${t.propiedad.direccion ? `${t.propiedad.direccion}, ` : ''}${t.propiedad.comuna}`);
    lineas.push(`   👤 ${t.reserva.cliente_nombre} · ${t.reserva.cliente_telefono}${t.tipo === 'entrega_llaves' ? ` · ${t.reserva.huespedes} huésp.` : ''}`);
  });
  lineas.push('', `— ${MARCA}`);
  return lineas.join('\n');
}

export function textoAseos(fecha, tareas, nombre) {
  const lineas = [`🧹 *Aseos · ${fechaLarga(fecha)}*`, nombre ? `Hola ${nombre.split(' ')[0]}, tus aseos de este día:` : '', ''];
  tareas.forEach((t) => {
    lineas.push(`• *${t.hora}* · ${t.propiedad.titulo}`);
    lineas.push(`   📍 ${t.propiedad.direccion ? `${t.propiedad.direccion}, ` : ''}${t.propiedad.comuna}`);
    if (t.recambio) lineas.push(`   ⚠️ Recambio: llega huésped a las ${t.recambio.hora_llegada}`);
    if (t.notas) lineas.push(`   📝 ${t.notas}`);
  });
  lineas.push('', `— ${MARCA}`);
  return lineas.filter((l, i) => l !== '' || i !== 1).join('\n');
}

export const linkWhatsApp = (texto, telefono) =>
  `https://wa.me/${telefono ? telefono.replace(/\D/g, '') : ''}?text=${encodeURIComponent(texto)}`;
