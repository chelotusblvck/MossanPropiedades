// Filtros del catálogo (/propiedades) ⇄ URL: así el filtro activo se puede compartir y "Atrás" funciona.
import { GRUPOS } from './modalidades';

export const FILTROS_VACIOS = { grupo: '', tipo: '', comuna: '', moneda: 'UF', precio_min: '', precio_max: '', llegada: '', salida: '' };
export const ORDENES = ['recientes', 'precio_asc', 'precio_desc', 'superficie'];
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_NUMERO = /^\d+(\.\d{1,2})?$/;

// ?modo=<modalidad> (enlaces externos o de "Mi cuenta") equivale a ?grupo=
const GRUPO_DE_MODO = { venta: 'venta', arriendo_diario: 'diario', arriendo_anual: 'mensual', arriendo_marzo_diciembre: 'mensual' };

/** Lee y valida los filtros de la URL (lo inválido se ignora). */
export function leerUrl(sp) {
  const v = (k) => sp.get(k) ?? '';
  const pedido = v('grupo') || GRUPO_DE_MODO[v('modo')] || '';
  const grupo = GRUPOS.some((g) => g.value === pedido) ? pedido : '';
  const filtros = {
    ...FILTROS_VACIOS,
    grupo,
    tipo: v('tipo'),
    comuna: v('comuna'),
    moneda: v('moneda') === 'CLP' ? 'CLP' : 'UF',
    precio_min: RE_NUMERO.test(v('precio_min')) ? v('precio_min') : '',
    precio_max: RE_NUMERO.test(v('precio_max')) ? v('precio_max') : '',
    llegada: grupo === 'diario' && RE_FECHA.test(v('llegada')) ? v('llegada') : '',
    salida: grupo === 'diario' && RE_FECHA.test(v('salida')) ? v('salida') : '',
  };
  return {
    filtros,
    orden: ORDENES.includes(v('orden')) ? v('orden') : 'recientes',
    pagina: Math.max(Number.parseInt(v('page'), 10) || 1, 1),
  };
}

/** Query string con sólo lo que difiere de lo por defecto. */
export function aQuery({ filtros = FILTROS_VACIOS, orden = 'recientes', pagina = 1 } = {}) {
  const sp = new URLSearchParams();
  for (const [k, val] of Object.entries(filtros)) {
    if (val === '' || val == null) continue;
    if (k === 'moneda' && (val === 'UF' || (filtros.precio_min === '' && filtros.precio_max === ''))) continue;
    if ((k === 'llegada' || k === 'salida') && filtros.grupo !== 'diario') continue;
    sp.set(k, val);
  }
  if (orden !== 'recientes') sp.set('orden', orden);
  if (pagina > 1) sp.set('page', String(pagina));
  return sp.toString();
}

export const urlCatalogo = (opciones) => {
  const q = aQuery(opciones);
  return `/propiedades${q ? `?${q}` : ''}`;
};
