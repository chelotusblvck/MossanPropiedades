import { ChevronLeft, ChevronRight, Megaphone, Lock } from 'lucide-react';
import { sumarDias, deISO, fechaCorta } from '../../lib/fechas';
import { formatCLP } from '../../lib/format';

const LETRA_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const fmtMes = new Intl.DateTimeFormat('es-CL', { month: 'short' });

const COLOR_ESTADO = {
  pagado: 'bg-brand-600 text-white',
  pendiente: 'bg-amber-400 text-amber-950',
};
const RAYADO = 'bg-[repeating-linear-gradient(135deg,#64748b_0_6px,#94a3b8_6px_12px)] text-white';

/**
 * Tablero de ocupación: una fila por propiedad de arriendo diario y una columna por noche.
 * Cada celda representa la noche de ese día (check-in incluido, check-out excluido).
 */
export default function AvailabilityBoard({
  datos, onMover, onHoy, onSeleccionarReserva, onSeleccionarBloqueo, onBloquear, onMarketing, seleccion,
}) {
  const { hoy, desde, dias } = datos;
  const fechas = Array.from({ length: dias }, (_, i) => sumarDias(desde, i));
  const propiedades = datos.propiedades.filter((p) => p.modalidad === 'arriendo_diario');

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 className="font-bold text-slate-800">Arriendo diario · ocupación</h2>
          <p className="text-sm text-slate-500">{fechaCorta(desde)} – {fechaCorta(sumarDias(desde, dias - 1))}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden gap-3 text-xs text-slate-500 sm:flex">
            <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-brand-600" /> Pagada</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-amber-400" /> Pendiente</span>
            <span className="flex items-center gap-1.5"><span className={`size-3 rounded ${RAYADO}`} /> Bloqueado</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-emerald-100 ring-1 ring-emerald-300" /> Libre</span>
          </div>
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200">
            <button onClick={() => onMover(-7)} className="px-2 py-1.5 hover:bg-slate-50" aria-label="Semana anterior"><ChevronLeft className="size-4" /></button>
            <button onClick={onHoy} className="border-x border-slate-200 px-3 text-sm font-medium hover:bg-slate-50">Hoy</button>
            <button onClick={() => onMover(7)} className="px-2 py-1.5 hover:bg-slate-50" aria-label="Semana siguiente"><ChevronRight className="size-4" /></button>
          </div>
        </div>
      </div>

      {propiedades.length === 0 ? (
        <p className="p-8 text-center text-slate-500">No hay propiedades en modalidad arriendo diario.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 w-64 min-w-64 border-b border-slate-200 bg-white p-3 text-left text-sm font-semibold text-slate-600">Propiedad</th>
                {fechas.map((f) => {
                  const d = deISO(f);
                  const finde = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <th key={f} className={`w-9 min-w-9 border-b border-slate-200 px-0 py-2 text-center font-medium ${f === hoy ? 'bg-brand-50 text-brand-700' : finde ? 'bg-slate-50 text-slate-500' : 'text-slate-400'}`}>
                      {(d.getDate() === 1 || f === desde) && <div className="text-[10px] font-bold uppercase text-slate-500">{fmtMes.format(d)}</div>}
                      <div>{LETRA_DIA[d.getDay()]}</div>
                      <div className={`text-sm ${f === hoy ? 'font-bold' : 'text-slate-700'}`}>{d.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {propiedades.map((p) => {
                const libreHoy = p.disponible && !p.ocupada_hoy && !p.bloqueada_hoy;
                const estadoHoy = !p.disponible ? 'Pausada' : p.ocupada_hoy ? 'Ocupada hoy' : p.bloqueada_hoy ? 'Bloqueada hoy' : 'Libre hoy';
                return (
                  <tr key={p.id}>
                    <td className="sticky left-0 z-10 border-b border-slate-100 bg-white p-3 align-middle">
                      <div className="flex items-center gap-3">
                        {p.imagenes?.[0] && <img src={p.imagenes[0]} alt="" className="size-10 shrink-0 rounded-lg object-cover" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800" title={p.titulo}>{p.titulo}</p>
                          <p className="truncate text-slate-500">{p.comuna} · {formatCLP(p.precio_clp)}/noche</p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${libreHoy ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {estadoHoy}
                            </span>
                            <button onClick={() => onMarketing(p)} className="flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline">
                              <Megaphone className="size-3" /> Ficha
                            </button>
                            <button onClick={() => onBloquear(p)} className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:underline">
                              <Lock className="size-3" /> Bloquear
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                    {fechas.map((f) => {
                      const cubre = (x) => x.fecha_inicio <= f && x.fecha_fin > f;
                      const r = p.reservas.find(cubre);
                      const b = !r && (p.bloqueos ?? []).find(cubre);
                      const item = r || b;
                      const esInicio = item && (item.fecha_inicio === f || f === desde);
                      const esFin = item && sumarDias(f, 1) === item.fecha_fin;
                      const seleccionado = item && seleccion?.tipo === (r ? 'reserva' : 'bloqueo') && seleccion.id === item.id;
                      const bordes = `${esInicio ? 'ml-0.5 rounded-l-md' : ''} ${esFin ? 'rounded-r-md' : ''} ${seleccionado ? 'ring-2 ring-slate-900' : ''}`;
                      const libreFuturo = !item && f >= hoy && p.disponible;
                      return (
                        <td key={f} className={`border-b border-slate-100 p-0 py-1.5 ${f === hoy ? 'bg-brand-50/60' : ''}`}>
                          {r ? (
                            <button
                              onClick={() => onSeleccionarReserva({ ...r, propiedad: p })}
                              title={`${r.cliente_nombre} · ${fechaCorta(r.fecha_inicio)} → ${fechaCorta(r.fecha_fin)} · ${r.estado_pago}`}
                              className={`block h-7 w-full truncate px-1 text-left text-[10px] font-semibold ${COLOR_ESTADO[r.estado_pago]} ${bordes}`}
                            >
                              {esInicio ? r.cliente_nombre.split(' ')[0] : ''}
                            </button>
                          ) : b ? (
                            <button
                              onClick={() => onSeleccionarBloqueo({ ...b, propiedad: p })}
                              title={`Bloqueado · ${fechaCorta(b.fecha_inicio)} → ${fechaCorta(b.fecha_fin)}${b.motivo ? ` · ${b.motivo}` : ''}`}
                              className={`block h-7 w-full truncate px-1 text-left text-[10px] font-semibold ${RAYADO} ${bordes}`}
                            >
                              {esInicio ? <Lock className="inline size-3" /> : ''}
                            </button>
                          ) : libreFuturo ? (
                            <button
                              onClick={() => onBloquear(p, f)}
                              title={`Libre · clic para bloquear desde el ${fechaCorta(f)}`}
                              aria-label={`Bloquear desde el ${f}`}
                              className="mx-0.5 block h-7 w-[calc(100%-4px)] rounded-md bg-emerald-50 ring-1 ring-inset ring-emerald-200 transition hover:bg-slate-200 hover:ring-slate-400"
                            />
                          ) : (
                            <div className="mx-0.5 h-7 rounded-md bg-slate-100" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
