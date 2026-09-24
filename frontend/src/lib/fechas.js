// Fechas de calendario como 'YYYY-MM-DD' en hora local (evita desfases de zona horaria)
const pad = (n) => String(n).padStart(2, '0');

export const aISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function deISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function sumarDias(s, n) {
  const d = deISO(s);
  d.setDate(d.getDate() + n);
  return aISO(d);
}

export const diferenciaDias = (desde, hasta) => Math.round((deISO(hasta) - deISO(desde)) / 86_400_000);

export const hoyISO = () => aISO(new Date());

const fmtCorta = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' });
const fmtLarga = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fechaCorta = (s) => fmtCorta.format(deISO(s));
export const fechaLarga = (s) => fmtLarga.format(deISO(s));

// --- Fecha y hora UTC que entrega el backend ('YYYY-MM-DD HH:MM:SS') ---
export const desdeUTC = (s) => (s ? new Date(`${s.replace(' ', 'T')}Z`) : null);

const fmtFechaHora = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fechaHora = (s) => fmtFechaHora.format(desdeUTC(s));

/** "en 5 h", "en 35 min", "vencido" */
export function tiempoRestante(s, ahora = Date.now()) {
  const ms = desdeUTC(s) - ahora;
  if (ms <= 0) return 'vencido';
  const min = Math.round(ms / 60000);
  if (min < 60) return `en ${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `en ${h} h` : `en ${Math.floor(h / 24)} días`;
}

/** Conjunto de noches ocupadas (check-in incluido, check-out excluido) a partir de rangos. */
export function nochesOcupadas(rangos) {
  const set = new Set();
  for (const { fecha_inicio, fecha_fin } of rangos) {
    for (let d = fecha_inicio; d < fecha_fin; d = sumarDias(d, 1)) set.add(d);
  }
  return set;
}
