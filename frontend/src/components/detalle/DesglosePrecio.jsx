import { Info } from 'lucide-react';
import { formatUF, formatCLP } from '../../lib/format';

const IVA = 0.19;
const fmtPct = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
const fmtValorUF = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Suma que devuelve null si falta algún término (p. ej. UF no disponible)
const sumar = (...xs) => (xs.every((x) => x != null) ? xs.reduce((a, b) => a + b, 0) : null);
const fmtFechaUF =new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Montos de la propiedad convertidos con la UF del día. Si no hay UF disponible,
 * se usan los valores guardados (calculados por el servidor con la última UF conocida).
 */
export function preciosDelDia(p, uf) {
  const v = uf?.valor;
  if (p.moneda_original === 'UF') return { uf: p.precio_uf, clp: v ? Math.round(p.precio_uf * v) : p.precio_clp };
  return { clp: p.precio_clp, uf: v ? p.precio_clp / v : p.precio_uf };
}

function Fila({ concepto, detalle, montoUF, montoCLP, total = false, enUF }) {
  const clase = total ? 'font-bold text-slate-900' : 'text-slate-700';
  return (
    <tr className={total ? 'border-t-2 border-slate-200' : 'border-t border-slate-100'}>
      <td className="py-2.5 pr-3">
        <span className={total ? 'font-bold text-slate-900' : 'text-slate-700'}>{concepto}</span>
        {detalle && <span className="block text-xs text-slate-500">{detalle}</span>}
      </td>
      <td className={`whitespace-nowrap py-2.5 pl-3 text-right tabular-nums ${clase} ${enUF ? '' : 'text-slate-500'}`}>
        {montoUF == null ? '—' : formatUF(Math.round(montoUF * 100) / 100)}
      </td>
      <td className={`whitespace-nowrap py-2.5 pl-3 text-right tabular-nums ${clase} ${enUF ? 'text-slate-500' : ''}`}>
        {montoCLP == null ? '—' : formatCLP(Math.round(montoCLP))}
      </td>
    </tr>
  );
}

export default function DesglosePrecio({ propiedad: p, uf }) {
  const c = p.condiciones ?? {};
  const base = preciosDelDia(p, uf);
  const v = uf?.valor;
  const enUF = p.moneda_original === 'UF';
  // Convierte un monto expresado en la moneda original a { uf, clp }
  const par = (montoOriginal) => (enUF
    ? { uf: montoOriginal, clp: v ? montoOriginal * v : null }
    : { clp: montoOriginal, uf: v ? montoOriginal / v : null });
  const desdeCLP = (clp) => ({ clp, uf: v ? clp / v : null });
  const montoBase = enUF ? base.uf : base.clp;

  const factorIva = c.comision_mas_iva ? 1 + IVA : 1;
  const etiquetaComision = `${fmtPct.format(c.comision_pct ?? 0)} % ${c.comision_base === 'precio' ? 'del precio' : 'de un mes de arriendo'}${c.comision_mas_iva ? ' + IVA' : ''}`;
  const comision = par(montoBase * ((c.comision_pct ?? 0) / 100) * factorIva);
  // Sin gastos comunes (0 o no informado) no se muestran la fila ni el total mensual
  const gc = p.gastos_comunes_clp > 0 ? desdeCLP(p.gastos_comunes_clp) : null;
  const filas = [];

  if (p.modalidad === 'venta') {
    const total = par(montoBase * (1 + ((c.comision_pct ?? 0) / 100) * factorIva));
    filas.push(
      <Fila key="precio" concepto="Precio de venta" montoUF={base.uf} montoCLP={base.clp} enUF={enUF} />,
      <Fila key="com" concepto="Comisión del corredor" detalle={etiquetaComision} montoUF={comision.uf} montoCLP={comision.clp} enUF={enUF} />,
      <Fila key="total" concepto="Total con comisión" detalle="No incluye gastos notariales ni de inscripción" montoUF={total.uf} montoCLP={total.clp} enUF={enUF} total />,
    );
  } else {
    const meses = c.garantia_meses ?? 1;
    const garantia = par(montoBase * meses);
    const mensualTotal = gc ? { uf: sumar(base.uf, gc.uf), clp: sumar(base.clp, gc.clp) } : null;
    const inicial = {
      uf: sumar(base.uf, garantia.uf, comision.uf),
      clp: sumar(base.clp, garantia.clp, comision.clp),
    };
    filas.push(
      <Fila key="arriendo" concepto="Arriendo mensual" montoUF={base.uf} montoCLP={base.clp} enUF={enUF} />,
      gc && <Fila key="gc" concepto="Gastos comunes (aprox.)" detalle="Mensual" montoUF={gc.uf} montoCLP={gc.clp} enUF={enUF} />,
      mensualTotal && <Fila key="mensual" concepto="Total mensual estimado" montoUF={mensualTotal.uf} montoCLP={mensualTotal.clp} enUF={enUF} total />,
      <tr key="sep"><td colSpan={3} className="pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Al firmar el contrato</td></tr>,
      <Fila key="primer" concepto="Primer mes de arriendo" montoUF={base.uf} montoCLP={base.clp} enUF={enUF} />,
      <Fila key="garantia" concepto={`Garantía (${fmtPct.format(meses)} ${meses === 1 ? 'mes' : 'meses'})`} detalle="Se devuelve al término del contrato" montoUF={garantia.uf} montoCLP={garantia.clp} enUF={enUF} />,
      <Fila key="com" concepto="Comisión del corredor" detalle={etiquetaComision} montoUF={comision.uf} montoCLP={comision.clp} enUF={enUF} />,
      <Fila key="inicial" concepto="Pago inicial estimado" montoUF={inicial.uf} montoCLP={inicial.clp} enUF={enUF} total />,
    );
    if (p.modalidad === 'arriendo_marzo_diciembre') {
      const contrato = par(montoBase * 10);
      filas.push(
        <tr key="sep2"><td colSpan={3} className="pb-1 pt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Temporada completa</td></tr>,
        <Fila key="temporada" concepto="10 meses de arriendo" detalle="Marzo a diciembre" montoUF={contrato.uf} montoCLP={contrato.clp} enUF={enUF} />,
      );
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <h2 className="text-xl font-bold text-slate-800">Desglose de precios</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 text-left font-semibold">Concepto</th>
              <th className="pb-2 pl-3 text-right font-semibold">UF</th>
              <th className="pb-2 pl-3 text-right font-semibold">Pesos (CLP)</th>
            </tr>
          </thead>
          <tbody>{filas.filter(Boolean)}</tbody>
        </table>
      </div>
      <p className="mt-4 flex gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <Info className="size-4 shrink-0 text-slate-400" />
        <span>
          {v ? (
            <>Conversión con la <b>UF del día: {fmtValorUF.format(v)}</b>
              {uf.fecha && <> ({fmtFechaUF.format(new Date(uf.fecha))}{uf.fuente && uf.fuente !== 'respaldo' ? `, ${uf.fuente}` : ''})</>}
              {uf.fuente === 'respaldo' && ' (valor referencial)'}. </>
          ) : 'Valores en pesos calculados con la última UF disponible. '}
          El precio publicado está en <b>{enUF ? 'UF' : 'pesos'}</b>; el otro valor es una conversión. Comisión y garantía son referenciales y se confirman en el contrato.
        </span>
      </p>
    </section>
  );
}
