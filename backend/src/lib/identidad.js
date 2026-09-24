// RUT y celular chilenos

/** Celular chileno sin prefijo ni símbolos: '+56 9 8123 4567' -> '981234567'. */
export function normalizarTelefono(tel) {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (d.startsWith('56') && d.length >= 11) d = d.slice(2);
  if (d.length > 9) d = d.slice(-9);
  return d.length >= 8 ? d : null;
}

/** Celular móvil chileno (9 dígitos que empiezan en 9) con formato '+56 9 8123 4567', o null. */
export function formatearCelular(tel) {
  const d = normalizarTelefono(tel);
  if (!d || d.length !== 9 || d[0] !== '9') return null;
  return `+56 9 ${d.slice(1, 5)} ${d.slice(5)}`;
}

/** RUT normalizado ('12345678-K') o null si el dígito verificador (módulo 11) no cuadra. */
export function normalizarRut(rut) {
  const limpio = String(rut ?? '').toUpperCase().replace(/[^0-9K]/g, '');
  if (limpio.length < 2) return null;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d{6,8}$/.test(cuerpo)) return null;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === esperado ? `${Number(cuerpo)}-${dv}` : null;
}

/** '12345678-5' -> '12.345.678-5' */
export function formatearRut(rut) {
  if (!rut) return null;
  const [cuerpo, dv] = rut.split('-');
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

// Datos parcialmente ocultos, para confirmar identidad sin exponerlos
export const nombreParcial = (nombre) => {
  const [primero, ...resto] = String(nombre).trim().split(/\s+/);
  return resto.length ? `${primero} ${resto[0][0].toUpperCase()}.` : primero;
};
export const telefonoParcial = (tel) => `···${String(tel).replace(/\D/g, '').slice(-4)}`;
