// Fechas de calendario como strings 'YYYY-MM-DD' (sin horas, sin problemas de zona horaria)
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 86_400_000;

export function esFechaValida(s) {
  if (typeof s !== 'string' || !RE_FECHA.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Fecha de hoy en Chile continental. */
export function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

const aUTC = (s) => Date.UTC(...s.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));

export function sumarDias(s, dias) {
  return new Date(aUTC(s) + dias * DIA_MS).toISOString().slice(0, 10);
}

export function diferenciaDias(desde, hasta) {
  return Math.round((aUTC(hasta) - aUTC(desde)) / DIA_MS);
}
