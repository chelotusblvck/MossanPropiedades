import { useState } from 'react';
import { UserRound, Home, Landmark, Image as ImageIcon, Video, KeyRound } from 'lucide-react';
import { formatCLP, formatUF, TIPO_LABEL } from '../../../lib/format';
import { infoModalidad } from '../../../lib/modalidades';
import { desgloseDiario, desgloseArriendo, desgloseVenta } from '../../../lib/desglose';
import { Titulo } from './campos';

const fmtPct = (v) => `${Number(v).toLocaleString('es-CL', { maximumFractionDigits: 2 })} %`;

function Fila({ concepto, valor, detalle, fuerte, negativo }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${fuerte ? 'border-t border-slate-200 pt-2.5 font-bold text-slate-900' : 'text-slate-700'}`}>
      <span>{concepto}{detalle && <span className="block text-xs font-normal text-slate-400">{detalle}</span>}</span>
      <span className={`whitespace-nowrap tabular-nums ${negativo ? 'text-rose-600' : ''}`}>{negativo ? '−' : ''}{valor}</span>
    </div>
  );
}

function Columna({ titulo, tono, children }) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${tono}`}>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide">{titulo}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function DesgloseComercial({ f, c }) {
  const [noches, setNoches] = useState(3);
  const iva = c.iva_pct;

  if (f.modalidad === 'arriendo_diario') {
    const pct = f.comision_diario_pct === '' ? c.comision.diario : Number(f.comision_diario_pct);
    const d = desgloseDiario({ precio: f.precio, noches, aseo: f.aseo_clp, comisionPct: pct, ivaPct: iva });
    return (
      <>
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
          Ejemplo para una estadía de
          <input type="number" min={1} max={60} value={noches} onChange={(e) => setNoches(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} className="w-16 rounded-lg border border-slate-200 px-2 py-1" />
          noches
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <Columna titulo="El huésped paga" tono="bg-sky-50 text-sky-900 ring-sky-200">
            <Fila concepto={`${formatCLP(Number(f.precio))} × ${noches} noches`} valor={formatCLP(d.bruto)} fuerte />
          </Columna>
          <Columna titulo="El propietario recibe" tono="bg-emerald-50 text-emerald-900 ring-emerald-200">
            <Fila concepto="Arriendo cobrado" valor={formatCLP(d.bruto)} />
            {d.aseo > 0 && <Fila concepto="Aseo" valor={formatCLP(d.aseo)} negativo />}
            <Fila concepto={`Comisión corredora (${fmtPct(pct)})`} valor={formatCLP(d.comision)} negativo />
            {iva > 0 && <Fila concepto={`IVA comisión (${iva} %)`} valor={formatCLP(d.iva)} negativo />}
            <Fila concepto="Neto a transferir" valor={formatCLP(d.neto)} fuerte />
          </Columna>
        </div>
      </>
    );
  }

  const enUF = f.moneda_original === 'UF';
  const monto = (v) => (enUF ? formatUF(Math.round(v * 100) / 100) : formatCLP(Math.round(v)));
  const otra = (v) => (c.uf ? (enUF ? formatCLP(Math.round(v * c.uf)) : formatUF(Math.round((v / c.uf) * 100) / 100)) : null);

  if (f.modalidad === 'venta') {
    const pct = f.comision_pct === '' ? c.comision.venta : Number(f.comision_pct);
    const d = desgloseVenta({ precio: f.precio, comisionPct: pct, ivaPct: iva });
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Columna titulo="El comprador paga" tono="bg-sky-50 text-sky-900 ring-sky-200">
          <Fila concepto="Precio" valor={monto(d.precio)} />
          <Fila concepto={`Comisión corredor (${fmtPct(pct)})`} valor={monto(d.comision)} />
          {iva > 0 && <Fila concepto={`IVA (${iva} %)`} valor={monto(d.iva)} />}
          <Fila concepto="Total" detalle={otra(d.total) && `≈ ${otra(d.total)}`} valor={monto(d.total)} fuerte />
        </Columna>
        <Columna titulo="El propietario recibe" tono="bg-emerald-50 text-emerald-900 ring-emerald-200">
          <Fila concepto="Precio de venta" detalle={otra(d.precio) && `≈ ${otra(d.precio)}`} valor={monto(d.precio)} fuerte />
          <p className="mt-2 text-xs text-emerald-800">La comisión la paga el comprador. No incluye gastos notariales.</p>
        </Columna>
      </div>
    );
  }

  const pct = f.comision_pct === '' ? c.comision.arriendo : Number(f.comision_pct);
  const garantia = f.garantia_meses === '' ? 1 : Number(f.garantia_meses);
  const d = desgloseArriendo({ mensual: f.precio, garantiaMeses: garantia, comisionPct: pct, ivaPct: iva });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Columna titulo="El arrendatario paga al firmar" tono="bg-sky-50 text-sky-900 ring-sky-200">
        <Fila concepto="Primer mes" valor={monto(d.mensual)} />
        <Fila concepto={`Garantía (${garantia} ${garantia === 1 ? 'mes' : 'meses'})`} valor={monto(d.garantia)} />
        <Fila concepto={`Comisión (${fmtPct(pct)} de un mes)`} valor={monto(d.comision)} />
        {iva > 0 && <Fila concepto={`IVA (${iva} %)`} valor={monto(d.iva)} />}
        <Fila concepto="Pago inicial" detalle={otra(d.inicial) && `≈ ${otra(d.inicial)}`} valor={monto(d.inicial)} fuerte />
      </Columna>
      <Columna titulo="El propietario recibe" tono="bg-emerald-50 text-emerald-900 ring-emerald-200">
        <Fila concepto="Arriendo mensual" detalle={otra(d.mensual) && `≈ ${otra(d.mensual)}`} valor={monto(d.mensual)} fuerte />
        <Fila concepto="Garantía (se devuelve al término)" valor={monto(d.garantia)} />
        <p className="mt-2 text-xs text-emerald-800">La comisión la paga el arrendatario.{f.modalidad === 'arriendo_marzo_diciembre' ? ' Temporada de 10 meses (marzo a diciembre).' : ''}</p>
      </Columna>
    </div>
  );
}

export default function PasoResumen({ propietario: p, ficha: f, fotos, condiciones: c }) {
  const m = infoModalidad(f.modalidad);
  return (
    <div>
      <Titulo paso={5} titulo="Confirmación y publicación" descripcion="Revisa que todo esté correcto antes de publicar." />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
            {fotos[0] ? <img src={fotos[0].preview} alt="" className="aspect-[16/9] w-full object-cover" /> : <div className="aspect-[16/9] bg-slate-100" />}
            <div className="p-4">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${m.badge}`}>{m.label}</span>
              <p className="mt-2 text-lg font-bold text-slate-800">{f.titulo}</p>
              <p className="text-sm text-slate-500">{TIPO_LABEL[f.tipo]} · {[f.direccion, f.comuna, f.region].filter(Boolean).join(', ')}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1"><ImageIcon className="size-3.5" /> {fotos.length} fotos</span>
                {f.video_url && <span className="flex items-center gap-1"><Video className="size-3.5" /> Video tour</span>}
                {f.habitaciones && <span>{f.habitaciones} dorm.</span>}
                {f.banos && <span>{f.banos} baños</span>}
                {f.superficie_util && <span>{f.superficie_util} m² útiles</span>}
              </p>
            </div>
          </div>
          <div className="rounded-xl p-4 text-sm ring-1 ring-slate-200">
            <p className="flex items-center gap-2 font-bold text-slate-800"><UserRound className="size-4 text-brand-600" /> {p.datos.nombre}</p>
            <p className="text-slate-500">RUT {p.datos.rut}</p>
            <p className="mt-1 flex items-center gap-1.5 text-slate-600"><Landmark className="size-4" /> {p.datos.banco} · {p.datos.tipo_cuenta} · N° {p.datos.numero_cuenta}</p>
            {(p.portal || p.existente?.portal_habilitado) && (
              <p className="mt-1 flex items-center gap-1.5 text-brand-700"><KeyRound className="size-4" /> {p.existente?.portal_habilitado ? 'Ya tiene acceso al portal' : 'Se le enviará el acceso al portal'}</p>
            )}
          </div>
        </div>

        <div className="rounded-xl p-4 ring-1 ring-slate-200">
          <p className="mb-3 flex items-center gap-2 font-bold text-slate-800"><Home className="size-4 text-brand-600" /> Resumen financiero</p>
          <DesgloseComercial f={f} c={c} />
        </div>
      </div>
    </div>
  );
}
