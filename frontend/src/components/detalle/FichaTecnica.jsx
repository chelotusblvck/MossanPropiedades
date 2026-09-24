import {
  Home, BedDouble, Bath, Ruler, Maximize, Car, Package, Receipt, Sofa, PawPrint, CalendarDays, Compass, Percent, ShieldCheck, CalendarRange,
} from 'lucide-react';
import { formatCLP, formatNumero, TIPO_LABEL } from '../../lib/format';
import { infoModalidad } from '../../lib/modalidades';

const fmtPct = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
const siNo = (v) => (v == null ? null : v ? 'Sí' : 'No');
const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function Item({ icono: Icono, etiqueta, valor, detalle }) {
  const sinDato = valor == null || valor === '';
  return (
    <div className="flex items-start gap-3 py-3">
      <Icono className="mt-0.5 size-5 shrink-0 text-brand-600" />
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{etiqueta}</dt>
        <dd className={`font-semibold ${sinDato ? 'text-slate-400' : 'text-slate-800'}`}>
          {sinDato ? 'No informado' : valor}
          {!sinDato && detalle && <span className="ml-1 text-xs font-normal text-slate-500">{detalle}</span>}
        </dd>
      </div>
    </div>
  );
}

export default function FichaTecnica({ propiedad: p }) {
  const c = p.condiciones ?? {};
  const esVenta = p.modalidad === 'venta';
  const esTerreno = p.tipo === 'terreno';
  const antiguedad = p.ano_construccion ? new Date().getFullYear() - p.ano_construccion : null;
  const m2 = (v) => (v == null ? null : `${formatNumero(v)} m²`);

  const items = [
    { icono: Home, etiqueta: 'Tipo', valor: TIPO_LABEL[p.tipo] },
    { icono: CalendarRange, etiqueta: 'Modalidad', valor: infoModalidad(p.modalidad).label },
    !esTerreno && { icono: BedDouble, etiqueta: 'Dormitorios', valor: p.habitaciones || null },
    !esTerreno && { icono: Bath, etiqueta: 'Baños', valor: p.banos || null },
    !esTerreno && { icono: Ruler, etiqueta: 'Superficie útil', valor: m2(p.superficie_util) },
    { icono: Maximize, etiqueta: esTerreno ? 'Superficie del terreno' : 'Superficie total', valor: m2(p.superficie_total) },
    !esTerreno && { icono: Car, etiqueta: 'Estacionamientos', valor: p.estacionamientos ?? 0 },
    !esTerreno && { icono: Package, etiqueta: 'Bodegas', valor: p.bodegas ?? 0 },
    !esTerreno && {
      icono: Receipt,
      etiqueta: 'Gastos comunes',
      valor: p.gastos_comunes_clp == null ? null : p.gastos_comunes_clp === 0 ? 'No tiene' : formatCLP(p.gastos_comunes_clp),
      detalle: p.gastos_comunes_clp ? 'mensual aprox.' : null,
    },
    !esTerreno && { icono: Sofa, etiqueta: 'Amoblado', valor: siNo(p.amoblado) },
    !esTerreno && !esVenta && { icono: PawPrint, etiqueta: 'Admite mascotas', valor: siNo(p.mascotas) },
    !esTerreno && { icono: CalendarDays, etiqueta: 'Año de construcción', valor: p.ano_construccion, detalle: antiguedad != null ? `(${antiguedad === 0 ? 'nueva' : `${antiguedad} años`})` : null },
    !esTerreno && { icono: Compass, etiqueta: 'Orientación', valor: capitalizar(p.orientacion) },
    {
      icono: Percent,
      etiqueta: 'Comisión del corredor',
      valor: c.comision_pct != null ? `${fmtPct.format(c.comision_pct)} % ${esVenta ? 'del precio' : 'de un mes'}` : null,
      detalle: c.comision_mas_iva ? '+ IVA' : null,
    },
    !esVenta && { icono: ShieldCheck, etiqueta: 'Garantía', valor: c.garantia_meses != null ? `${fmtPct.format(c.garantia_meses)} ${c.garantia_meses === 1 ? 'mes' : 'meses'} de arriendo` : null },
  ].filter(Boolean);

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <h2 className="text-xl font-bold text-slate-800">Ficha técnica</h2>
      <dl className="mt-2 grid divide-y divide-slate-100 sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
        {items.map((it) => <Item key={it.etiqueta} {...it} />)}
      </dl>
    </section>
  );
}
