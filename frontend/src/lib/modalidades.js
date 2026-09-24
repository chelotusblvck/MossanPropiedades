export const MODALIDADES = {
  venta: {
    label: 'Venta',
    tab: 'Comprar',
    titulo: 'Propiedades en venta',
    sufijo: '',
    badge: 'bg-brand-700 text-white',
    punto: 'bg-brand-600',
  },
  arriendo_anual: {
    label: 'Arriendo año corrido',
    tab: 'Arriendo anual',
    titulo: 'Arriendos año corrido',
    sufijo: '/mes',
    badge: 'bg-sky-600 text-white',
    punto: 'bg-sky-500',
  },
  arriendo_marzo_diciembre: {
    label: 'Arriendo marzo a diciembre',
    tab: 'Marzo–Diciembre',
    titulo: 'Arriendos de marzo a diciembre',
    sufijo: '/mes',
    badge: 'bg-violet-600 text-white',
    punto: 'bg-violet-500',
  },
  arriendo_diario: {
    label: 'Arriendo diario',
    tab: 'Por noche',
    titulo: 'Arriendos por noche',
    sufijo: '/noche',
    badge: 'bg-amber-400 text-amber-950',
    punto: 'bg-amber-400',
  },
};

export const ORDEN_MODALIDADES = ['venta', 'arriendo_anual', 'arriendo_marzo_diciembre', 'arriendo_diario'];

export const infoModalidad = (m) => MODALIDADES[m] ?? MODALIDADES.arriendo_anual;

// Filtro rápido del sitio (Home, buscador y catálogo). '' = todas.
export const GRUPOS = [
  { value: '', label: 'Todas', titulo: 'Propiedades disponibles' },
  { value: 'venta', label: 'En venta', titulo: 'Propiedades en venta', moneda: 'UF' },
  { value: 'diario', label: 'Arriendo diario', titulo: 'Arriendos por noche', moneda: 'CLP' },
  { value: 'mensual', label: 'Arriendo anual / Mar–Dic', titulo: 'Arriendos año corrido y de marzo a diciembre', moneda: 'CLP' },
];
export const infoGrupo = (g) => GRUPOS.find((x) => x.value === (g ?? '')) ?? GRUPOS[0];
