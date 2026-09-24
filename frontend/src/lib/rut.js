// RUT chileno (módulo 11) y celular, para los formularios públicos

const limpiar = (s) => String(s ?? '').toUpperCase().replace(/[^0-9K]/g, '');

/** Formato mientras se escribe: '123456785' -> '12.345.678-5' */
export function formatearRut(valor) {
  const l = limpiar(valor).slice(0, 9);
  if (l.length < 2) return l;
  const cuerpo = l.slice(0, -1).replace(/K/g, '');
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${l.slice(-1)}`;
}

/** ¿El dígito verificador cuadra? */
export function rutValido(valor) {
  const l = limpiar(valor);
  const cuerpo = l.slice(0, -1);
  const dv = l.slice(-1);
  if (!/^\d{6,8}$/.test(cuerpo)) return false;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return dv === (resto === 11 ? '0' : resto === 10 ? 'K' : String(resto));
}

/** Los 8 dígitos que siguen a "+56 9" (acepta que peguen el número completo). */
export function digitosCelular(valor) {
  let d = String(valor ?? '').replace(/\D/g, '');
  if (d.startsWith('569') && d.length > 9) d = d.slice(3);
  else if (d.startsWith('9') && d.length === 9) d = d.slice(1);
  return d.slice(0, 8);
}

export const formatearDigitosCelular = (d) => (d.length > 4 ? `${d.slice(0, 4)} ${d.slice(4)}` : d);
export const celularCompleto = (d) => `+56 9 ${formatearDigitosCelular(d)}`;
