// Datos de la corredora. Parten con las variables del build (VITE_*) y se reemplazan al iniciar con los
// del asistente de configuración (/api/sitio). Son "live bindings": quien los importa ve el valor nuevo.
import { aplicarTema } from './tema';

export let MARCA = import.meta.env.VITE_BRAND_NAME || 'Mi Inmobiliaria';
export let TELEFONO = import.meta.env.VITE_CONTACT_PHONE || '+56 9 1234 5678';
export let EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'contacto@miinmobiliaria.cl';
export let LOGO = null;
export let LOGO_CLARO = null; // versión para fondos oscuros (pie de página)

export function aplicarMarca(d = {}) {
  if (d.nombre) MARCA = d.nombre;
  if (d.telefono) TELEFONO = d.telefono;
  if (d.email) EMAIL = d.email;
  LOGO = d.logo || null;
  LOGO_CLARO = d.tema?.logo_claro || null;
  aplicarTema(d.tema ?? null); // colores, tipografía y favicon de la línea gráfica
}

/** Carga los datos configurados antes del primer render (si el servidor tarda, sigue con los del build). */
export async function cargarMarca(base = '') {
  try {
    const res = await fetch(`${base}/api/sitio`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) aplicarMarca(await res.json());
  } catch {
    /* sin conexión: se usan los valores del build */
  }
}

export const telefonoWhatsApp = () => TELEFONO.replace(/\D/g, '');
export const urlPropiedad = (id) => `${window.location.origin}/propiedad/${id}`;
