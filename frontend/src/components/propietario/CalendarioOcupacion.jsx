import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { propietarioApi } from '../../lib/api';
import { deISO, sumarDias, hoyISO } from '../../lib/fechas';

const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const fmtMes = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
const fmtDia = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

export const ESTADOS_DIA = {
  reservado: { label: 'Reservado', clase: 'bg-brand-600 text-white' },
  por_confirmar: { label: 'Por confirmar pago', clase: 'bg-amber-300 text-amber-950' },
  mantencion: { label: 'Mantención / bloqueado', clase: 'bg-slate-300 text-slate-700 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,.45)_4px,rgba(255,255,255,.45)_8px)]' },
  libre: { label: 'Libre', clase: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200' },
};
const PRIORIDAD = { reservado: 3, por_confirmar: 2, mantencion: 1 };

/** Ocupación mensual de una propiedad de arriendo diario (cada noche: check-in incluido, check-out no). */
export default function CalendarioOcupacion({ propiedades, onError }) {
  const [propiedadId, setPropiedadId] = useState(propiedades[0]?.id ?? null);
  const [mes, setMes] = useState(() => `${hoyISO().slice(0, 7)}-01`);
  const [datos, setDatos] = useState(null);

  const siguienteMes = useMemo(() => `${sumarDias(mes, 32).slice(0, 7)}-01`, [mes]);

  useEffect(() => {
    if (!propiedadId) return;
    setDatos(null);
    propietarioApi.calendario({ propiedad_id: propiedadId, desde: mes, hasta: siguienteMes }).then(setDatos).catch(onError);
  }, [propiedadId, mes, siguienteMes, onError]);

  // Estado de cada noche del mes
  const estados = useMemo(() => {
    const m = new Map();
    for (const r of datos?.rangos ?? []) {
      for (let d = r.fecha_inicio; d < r.fecha_fin; d = sumarDias(d, 1)) {
        if ((PRIORIDAD[r.tipo] ?? 0) > (PRIORIDAD[m.get(d)] ?? 0)) m.set(d, r.tipo);
      }
    }
    return m;
  }, [datos]);

  if (!propiedadId) return null;
  const inicio = deISO(mes);
  const vacios = (inicio.getDay() + 6) % 7; // semana desde el lunes
  const dias = [];
  for (let d = mes; d < siguienteMes; d = sumarDias(d, 1)) dias.push(d);
  const hoy = datos?.hoy ?? hoyISO();
  const ocupadas = dias.filter((d) => estados.get(d) === 'reservado').length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {propiedades.length > 1 ? (
          <select value={propiedadId} onChange={(e) => setPropiedadId(Number(e.target.value))} aria-label="Propiedad" className="max-w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {propiedades.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
          </select>
        ) : (
          <p className="font-semibold text-slate-700">{propiedades[0].titulo}</p>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => setMes(`${sumarDias(mes, -1).slice(0, 7)}-01`)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Mes anterior"><ChevronLeft className="size-5" /></button>
          <p className="w-40 text-center font-bold capitalize text-slate-800">{fmtMes.format(inicio)}</p>
          <button onClick={() => setMes(siguienteMes)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Mes siguiente"><ChevronRight className="size-5" /></button>
        </div>
      </div>

      <div className="relative mt-4">
        {!datos && <div className="absolute inset-0 z-10 grid place-items-center bg-white/60"><Loader2 className="size-6 animate-spin text-brand-600" /></div>}
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-400">
          {DIAS.map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: vacios }, (_, i) => <div key={`v${i}`} />)}
          {dias.map((d) => {
            const estado = estados.get(d) ?? 'libre';
            const pasado = d < hoy;
            return (
              <div
                key={d}
                title={`${fmtDia.format(deISO(d))}: ${ESTADOS_DIA[estado].label}`}
                className={`flex aspect-square items-start justify-end rounded-lg p-1 text-xs font-semibold sm:p-1.5 sm:text-sm ${ESTADOS_DIA[estado].clase} ${pasado ? 'opacity-50' : ''} ${d === hoy ? 'outline outline-2 outline-offset-1 outline-amber-500' : ''}`}
              >
                {Number(d.slice(8))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {Object.entries(ESTADOS_DIA).map(([k, e]) => (
            <li key={k} className="flex items-center gap-1.5"><span className={`size-3.5 rounded ${e.clase}`} aria-hidden="true" /> {e.label}</li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">{ocupadas} de {dias.length} noches reservadas</p>
      </div>
    </div>
  );
}
