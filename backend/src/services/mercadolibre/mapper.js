import { completarPrecios } from '../../models/propiedad.js';

const atributo = (item, id) => item.attributes?.find((a) => a.id === id);

const texto = (item, id) => atributo(item, id)?.value_name ?? null;

function numero(item, ...ids) {
  for (const id of ids) {
    const a = atributo(item, id);
    if (!a) continue;
    if (a.value_struct?.number != null) return Number(a.value_struct.number);
    const n = parseFloat(String(a.value_name ?? '').replace(/\./g, '').replace(',', '.'));
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

// Portalinmobiliario sólo distingue Venta / Arriendo / Arriendo de temporada.
// "Marzo a diciembre" no existe en el portal: la corredora lo ajusta desde /admin y la sincronización lo respeta.
function mapearModalidad(item) {
  const op = (texto(item, 'OPERATION') ?? '').toLowerCase();
  if (op.includes('temporada')) return 'arriendo_diario';
  if (op.includes('arriendo')) return 'arriendo_anual';
  if (op.includes('venta')) return 'venta';
  return /RENT/i.test(item.domain_id ?? '') ? 'arriendo_anual' : 'venta';
}

function siNo(valor) {
  const v = (valor ?? '').toLowerCase();
  if (v.startsWith('s') || v === 'yes') return true;
  if (v.startsWith('n')) return false;
  return undefined;
}

const definidos = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));

function mapearTipo(item) {
  const t = (texto(item, 'PROPERTY_TYPE') ?? '').toLowerCase();
  const porNombre = ['departamento', 'casa', 'terreno', 'parcela', 'oficina', 'local'].find((x) => t.includes(x));
  if (porNombre) return porNombre;
  const dominio = item.domain_id ?? '';
  if (/APARTMENT/.test(dominio)) return 'departamento';
  if (/HOUSE/.test(dominio)) return 'casa';
  if (/LAND|LOT/.test(dominio)) return 'terreno';
  if (/OFFICE/.test(dominio)) return 'oficina';
  if (/COMMERCIAL|STORE|RETAIL/.test(dominio)) return 'local';
  return 'otro';
}

/** Convierte un ítem de la API de Mercado Libre (MLC) al modelo Propiedad. */
export function itemAPropiedad(item, descripcion, uf) {
  const ubicacion = item.location ?? {};
  const moneda = item.currency_id === 'CLF' ? 'UF' : 'CLP';

  const propiedad = {
    titulo: item.title,
    descripcion: descripcion ?? '',
    moneda_original: moneda,
    precio_uf: moneda === 'UF' ? item.price : undefined,
    precio_clp: moneda === 'CLP' ? item.price : undefined,
    modalidad: mapearModalidad(item),
    tipo: mapearTipo(item),
    comuna: ubicacion.city?.name ?? item.seller_address?.city?.name ?? 'Sin comuna',
    region: ubicacion.state?.name ?? item.seller_address?.state?.name ?? null,
    direccion: ubicacion.address_line ?? null,
    habitaciones: numero(item, 'BEDROOMS', 'ROOMS') ?? 0,
    banos: numero(item, 'FULL_BATHROOMS', 'BATHROOMS') ?? 0,
    estacionamientos: numero(item, 'PARKING_LOTS') ?? 0,
    superficie_util: numero(item, 'COVERED_AREA'),
    superficie_total: numero(item, 'TOTAL_AREA'),
    // Ficha técnica (sólo si el aviso la informa; no se pisan con null los datos cargados a mano)
    ...definidos({
      gastos_comunes_clp: numero(item, 'MAINTENANCE_FEE'),
      bodegas: numero(item, 'WAREHOUSES'),
      amoblado: siNo(texto(item, 'FURNISHED')),
      mascotas: siNo(texto(item, 'IS_SUITABLE_FOR_PETS')),
    }),
    imagenes: (item.pictures ?? []).map((p) => p.secure_url || p.url).filter(Boolean),
    id_portalinmobiliario: item.id,
    permalink: item.permalink ?? null,
    origen: 'portalinmobiliario',
    estado: item.status === 'active' ? 'activa' : 'inactiva',
    sincronizado_en: new Date().toISOString(),
  };
  return completarPrecios(propiedad, uf);
}
