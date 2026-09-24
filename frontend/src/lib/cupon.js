// Cupón de fidelización elegido en "Mi cuenta" → se precarga en el formulario de reserva.
// sessionStorage: sólo dura la pestaña; si el navegador lo bloquea, el cliente lo escribe a mano.
const CLAVE = 'cupon_fidelizacion';

/** Catálogo filtrado en arriendo diario (lib/catalogo.js acepta ?modo= como alias de ?grupo=). */
export const URL_ARRIENDO_DIARIO = '/propiedades?modo=arriendo_diario';

export function guardarCupon(codigo) {
  try { sessionStorage.setItem(CLAVE, codigo); } catch { /* sin almacenamiento */ }
}

export function leerCupon() {
  try { return sessionStorage.getItem(CLAVE) ?? ''; } catch { return ''; }
}

export function olvidarCupon() {
  try { sessionStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
}
