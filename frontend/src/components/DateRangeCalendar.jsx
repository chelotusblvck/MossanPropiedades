import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { aISO, deISO, sumarDias } from '../lib/fechas';

const DIAS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];
const fmtMes = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
const nombreMes = (d) => {
  const s = fmtMes.format(d); // "septiembre de 2026"
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** ¿Están libres todas las noches entre inicio (incluida) y fin (excluida)? */
function rangoLibre(inicio, fin, ocupadas) {
  for (let d = inicio; d < fin; d = sumarDias(d, 1)) if (ocupadas.has(d)) return false;
  return true;
}

function Mes({ anio, mes, hoy, ocupadas, inicio, fin, hover, onClick, onHover }) {
  const primero = new Date(anio, mes, 1);
  const offset = (primero.getDay() + 6) % 7; // semana parte el lunes
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => aISO(new Date(anio, mes, i + 1)))];
  const finVista = fin ?? (inicio && hover && hover > inicio && rangoLibre(inicio, hover, ocupadas) ? hover : null);

  return (
    <div>
      <p className="mb-3 text-center text-sm font-semibold text-slate-800">{nombreMes(primero)}</p>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-slate-400">
        {DIAS.map((d) => <span key={d} className="py-1">{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {celdas.map((dia, i) => {
          if (!dia) return <span key={`v${i}`} />;
          const pasado = dia < hoy;
          const ocupada = ocupadas.has(dia);
          // Un día ocupado aún puede ser día de salida si las noches anteriores están libres
          const puedeSalir = inicio && !fin && dia > inicio && rangoLibre(inicio, dia, ocupadas);
          const deshabilitado = pasado || (ocupada && !puedeSalir);
          const esInicio = dia === inicio;
          const esFin = dia === finVista;
          const enRango = inicio && finVista && dia > inicio && dia < finVista;

          return (
            <button
              key={dia}
              type="button"
              disabled={deshabilitado}
              onClick={() => onClick(dia)}
              onMouseEnter={() => onHover(dia)}
              aria-pressed={esInicio || esFin}
              aria-label={`${dia}${ocupada ? ' (ocupado)' : ''}`}
              className={[
                'relative mx-auto grid size-10 place-items-center text-sm transition',
                enRango ? 'w-full rounded-none bg-brand-100 text-brand-900' : 'rounded-full',
                esInicio || esFin ? 'bg-brand-700 font-bold text-white' : '',
                !esInicio && !esFin && !enRango && !deshabilitado ? 'text-slate-700 hover:bg-slate-100' : '',
                pasado ? 'text-slate-300' : '',
                ocupada && !pasado && !esFin ? 'text-rose-400 line-through decoration-rose-300' : '',
                deshabilitado ? 'cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {Number(dia.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Selector de rango para arriendo diario.
 * - ocupadas: Set de noches ocupadas ('YYYY-MM-DD')
 * - value: { inicio, fin }  (fin = día de salida)
 */
export default function DateRangeCalendar({ hoy, ocupadas, value, onChange, meses = 1 }) {
  const [vista, setVista] = useState(() => {
    const d = deISO(value.inicio ?? hoy);
    return { anio: d.getFullYear(), mes: d.getMonth() };
  });
  const [hover, setHover] = useState(null);
  const { inicio, fin } = value;

  const seleccionar = (dia) => {
    if (!inicio || fin || dia <= inicio) {
      if (!ocupadas.has(dia)) onChange({ inicio: dia, fin: null });
      return;
    }
    if (rangoLibre(inicio, dia, ocupadas)) onChange({ inicio, fin: dia });
    else if (!ocupadas.has(dia)) onChange({ inicio: dia, fin: null });
  };

  const mover = (delta) => setVista(({ anio, mes }) => {
    const d = new Date(anio, mes + delta, 1);
    return { anio: d.getFullYear(), mes: d.getMonth() };
  });

  const hoyD = deISO(hoy);
  const puedeRetroceder = vista.anio > hoyD.getFullYear() || vista.mes > hoyD.getMonth();
  const siguiente = new Date(vista.anio, vista.mes + 1, 1);
  const props = { hoy, ocupadas, inicio, fin, hover, onClick: seleccionar, onHover: setHover };

  return (
    <div onMouseLeave={() => setHover(null)}>
      <div className="mb-1 flex justify-between">
        <button type="button" onClick={() => mover(-1)} disabled={!puedeRetroceder} className="rounded-full p-1.5 hover:bg-slate-100 disabled:opacity-30" aria-label="Mes anterior">
          <ChevronLeft className="size-5" />
        </button>
        <button type="button" onClick={() => mover(1)} className="rounded-full p-1.5 hover:bg-slate-100" aria-label="Mes siguiente">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className={`-mt-9 grid gap-6 ${meses === 2 ? 'sm:grid-cols-2' : ''}`}>
        <Mes anio={vista.anio} mes={vista.mes} {...props} />
        {meses === 2 && (
          <div className="hidden sm:block">
            <Mes anio={siguiente.getFullYear()} mes={siguiente.getMonth()} {...props} />
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-brand-700" /> Seleccionado</span>
        <span className="flex items-center gap-1.5"><span className="text-rose-400 line-through">15</span> Ocupado</span>
      </div>
    </div>
  );
}
