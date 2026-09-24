const numeroCL = new Intl.NumberFormat('es-CL');
const ufCL = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export const formatUF = (v) => (v == null ? '—' : `UF ${ufCL.format(v)}`);
export const formatCLP = (v) => (v == null ? '—' : clp.format(v));
export const formatNumero = (v) => (v == null ? '—' : numeroCL.format(v));

export const TIPOS = [
  { value: 'casa', label: 'Casa' },
  { value: 'departamento', label: 'Departamento' },
  { value: 'terreno', label: 'Terreno' },
];

export const TIPO_LABEL = {
  casa: 'Casa',
  departamento: 'Departamento',
  terreno: 'Terreno',
  oficina: 'Oficina',
  local: 'Local comercial',
  parcela: 'Parcela',
  otro: 'Propiedad',
};

// Comunas más buscadas; se combinan con las que existen en la base de datos
export const COMUNAS_POPULARES = [
  'Santiago', 'Providencia', 'Las Condes', 'Vitacura', 'Lo Barnechea', 'Ñuñoa', 'La Reina', 'Macul',
  'Peñalolén', 'La Florida', 'Puente Alto', 'Maipú', 'San Miguel', 'Estación Central', 'Independencia',
  'Recoleta', 'Huechuraba', 'Colina','Quilicura', 'San Bernardo', 'Viña del Mar',
  'Valparaíso', 'Concón', 'La Serena', 'Coquimbo', 'Rancagua', 'Concepción', 'Temuco',
  'Puerto Varas', 'Puerto Montt', 'Antofagasta', 'Iquique',
];
