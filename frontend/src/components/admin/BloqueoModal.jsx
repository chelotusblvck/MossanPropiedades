import { useEffect, useMemo, useState } from 'react';
import { X, Lock, Loader2 } from 'lucide-react';
import DateRangeCalendar from '../DateRangeCalendar';
import { adminApi } from '../../lib/api';
import { nochesOcupadas, diferenciaDias, fechaLarga, sumarDias } from '../../lib/fechas';

const MOTIVOS = ['Uso del propietario', 'Mantención', 'Limpieza', 'Reserva externa (Airbnb/Booking)'];

/** Bloqueo manual de fechas para una propiedad de arriendo diario. */
export default function BloqueoModal({ propiedad, fechaInicial, onClose, onGuardado }) {
  const [ocupacion, setOcupacion] = useState(null);
  const [rango, setRango] = useState({ inicio: fechaInicial ?? null, fin: null });
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminApi.ocupacion(propiedad.id).then(setOcupacion).catch((e) => setError(e.message));
  }, [propiedad.id]);

  useEffect(() => {
    const alPresionar = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [onClose]);

  const ocupadas = useMemo(() => nochesOcupadas(ocupacion?.ocupados ?? []), [ocupacion]);

  // Si la fecha clickeada en el tablero ya está ocupada, no la dejamos preseleccionada
  useEffect(() => {
    if (rango.inicio && ocupadas.has(rango.inicio)) setRango({ inicio: null, fin: null });
  }, [ocupadas]); // eslint-disable-line react-hooks/exhaustive-deps

  const noches = rango.inicio && rango.fin ? diferenciaDias(rango.inicio, rango.fin) : 0;

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await adminApi.crearBloqueo(propiedad.id, { fecha_inicio: rango.inicio, fecha_fin: rango.fin, motivo });
      onGuardado();
    } catch (err) {
      setError(err.message);
      adminApi.ocupacion(propiedad.id).then(setOcupacion).catch(() => {});
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-bloqueo"
        onSubmit={guardar}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <h2 id="titulo-bloqueo" className="flex items-center gap-2 font-bold text-slate-800"><Lock className="size-4" /> Bloquear fechas</h2>
            <p className="truncate text-sm text-slate-500">{propiedad.titulo}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="grid grid-cols-2 overflow-hidden rounded-xl ring-1 ring-slate-200">
            <div className="border-r border-slate-200 p-3">
              <p className="text-[11px] font-bold uppercase text-slate-500">Desde (primera noche)</p>
              <p className="text-sm font-medium">{rango.inicio ? fechaLarga(rango.inicio) : 'Elige fecha'}</p>
            </div>
            <div className="p-3">
              <p className="text-[11px] font-bold uppercase text-slate-500">Hasta (última noche)</p>
              <p className="text-sm font-medium">{rango.fin ? fechaLarga(sumarDias(rango.fin, -1)) : '—'}</p>
            </div>
          </div>

          <div className="mt-4">
            {ocupacion ? (
              <DateRangeCalendar
                hoy={ocupacion.hoy}
                ocupadas={ocupadas}
                value={rango}
                onChange={(r) => { setRango(r); setError(null); }}
                meses={2}
              />
            ) : (
              !error && <div className="grid place-items-center py-16"><Loader2 className="size-6 animate-spin text-brand-600" /></div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Elige la primera noche y luego el día en que vuelve a quedar libre. Las fechas tachadas ya tienen reservas o bloqueos.
            </p>
          </div>

          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-slate-700">Motivo</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {MOTIVOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivo(m)}
                  className={`rounded-full px-3 py-1 text-sm ring-1 transition ${motivo === m ? 'bg-brand-700 text-white ring-brand-700' : 'text-slate-600 ring-slate-200 hover:bg-slate-50'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={200}
              placeholder="Otro motivo"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </fieldset>

          {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-600">{noches > 0 ? `${noches} ${noches === 1 ? 'noche bloqueada' : 'noches bloqueadas'}` : ''}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">Cancelar</button>
            <button
              type="submit"
              disabled={!noches || guardando}
              className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-40"
            >
              {guardando ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Bloquear
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
