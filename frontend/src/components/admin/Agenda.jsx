import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Settings2, Route, MessageCircle, MapPin, AlertTriangle, CheckCircle2, Circle,
  Phone, Users, Loader2, RefreshCw, CalendarClock,
} from 'lucide-react';
import { adminApi } from '../../lib/api';
import { deISO, sumarDias, hoyISO, fechaLarga } from '../../lib/fechas';
import { TIPOS_TAREA, esTareaDeLlaves, paradasRuta, urlRutaMaps, textoRuta, textoAseos, linkWhatsApp } from '../../lib/agenda';
import AjustesAgenda from './AjustesAgenda';

const REFRESCO_MS = 60_000;
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const fmtMes = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
const nombreMes = (mes) => {
  const s = fmtMes.format(deISO(`${mes}-01`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const moverMes = (mes, delta) => {
  const d = deISO(`${mes}-01`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function rangoGrilla(mes) {
  const primero = `${mes}-01`;
  const d = deISO(primero);
  const offset = (d.getDay() + 6) % 7;
  const diasMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const total = Math.ceil((offset + diasMes) / 7) * 7;
  const inicio = sumarDias(primero, -offset);
  return { inicio, fin: sumarDias(inicio, total - 1), dias: Array.from({ length: total }, (_, i) => sumarDias(inicio, i)) };
}

// ---------- Calendario mensual ----------

function CeldaDia({ fecha, tareas, delMes, esHoy, seleccionado, onClick }) {
  const conteo = { entrega_llaves: 0, recepcion_llaves: 0, aseo: 0 };
  tareas.forEach((t) => { conteo[t.tipo]++; });
  const recambio = tareas.some((t) => t.recambio && t.estado !== 'hecha');
  const sinAsignar = tareas.some((t) => t.tipo === 'aseo' && !t.responsable && t.estado !== 'hecha');
  const todoHecho = tareas.length > 0 && tareas.every((t) => t.estado === 'hecha');

  return (
    <button
      onClick={onClick}
      className={`flex min-h-20 flex-col gap-1 border-b border-r border-slate-100 p-1.5 text-left transition sm:min-h-24 sm:p-2 ${
        seleccionado ? 'bg-brand-50 ring-2 ring-inset ring-brand-500' : 'hover:bg-slate-50'
      } ${delMes ? '' : 'bg-slate-50/60 text-slate-400'}`}
    >
      <div className="flex items-center justify-between">
        <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold sm:text-sm ${esHoy ? 'bg-brand-700 text-white' : ''}`}>
          {Number(fecha.slice(8))}
        </span>
        {todoHecho ? <CheckCircle2 className="size-4 text-emerald-500" /> : recambio ? <AlertTriangle className="size-4 text-rose-500" /> : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {Object.entries(conteo).filter(([, n]) => n > 0).map(([tipo, n]) => (
          <span key={tipo} className={`rounded px-1 text-[11px] font-semibold ring-1 sm:px-1.5 ${TIPOS_TAREA[tipo].color}`} title={TIPOS_TAREA[tipo].label}>
            {TIPOS_TAREA[tipo].emoji}<span className="ml-0.5">{n}</span>
          </span>
        ))}
      </div>
      {sinAsignar && <span className="mt-auto hidden text-[10px] font-semibold text-amber-600 sm:block">Aseo sin asignar</span>}
    </button>
  );
}

// ---------- Tarjeta de tarea ----------

function TareaCard({ tarea: t, numero, personal, onGuardar }) {
  const [hora, setHora] = useState(t.hora);
  const [notas, setNotas] = useState(t.notas ?? '');
  useEffect(() => {
    setHora(t.hora);
  }, [t.hora]);
  useEffect(() => {
    setNotas(t.notas ?? '');
  }, [t.notas]);

  const tipo = TIPOS_TAREA[t.tipo];
  const hecha = t.estado === 'hecha';
  const aptos = personal.filter((p) => p.tipo === 'ambos' || p.tipo === (t.tipo === 'aseo' ? 'aseo' : 'llaves') || p.id === t.responsable_asignado_id);
  const opcionVacia = t.responsable_defecto ? `Por defecto: ${t.responsable_defecto.nombre}` : 'Sin asignar';

  return (
    <li className={`rounded-xl p-3 ring-1 transition ${hecha ? 'bg-slate-50 ring-slate-200' : 'bg-white ring-slate-200'} ${t.recambio && !hecha ? 'ring-2 ring-rose-300' : ''}`}>
      <div className="flex items-start gap-3">
        {numero != null && (
          <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white">{numero}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              onBlur={() => hora && hora !== t.hora && onGuardar(t, { hora })}
              className="rounded-md border border-slate-200 px-1.5 py-0.5 text-sm font-bold text-slate-800"
              aria-label="Hora"
            />
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${tipo.color}`}>{tipo.emoji} {tipo.label}</span>
            {t.recambio && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700" title={`Llega ${t.recambio.cliente_nombre}`}>
                ⚠️ Recambio · llega {t.recambio.hora_llegada}
              </span>
            )}
          </div>
          <p className={`mt-1.5 truncate font-semibold ${hecha ? 'text-slate-400 line-through' : 'text-slate-800'}`} title={t.propiedad.titulo}>
            {t.propiedad.titulo}
          </p>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="size-3 shrink-0" />
            {t.propiedad.direccion ? `${t.propiedad.direccion}, ${t.propiedad.comuna}` : (
              <span className="text-amber-600">{t.propiedad.comuna} · falta dirección</span>
            )}
          </p>
          {esTareaDeLlaves(t) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
              <span>👤 {t.reserva.cliente_nombre}</span>
              <a href={`https://wa.me/${t.reserva.cliente_telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-emerald-600 hover:underline">
                <Phone className="size-3" /> {t.reserva.cliente_telefono}
              </a>
              {t.tipo === 'entrega_llaves' && <span>· {t.reserva.huespedes} huésp. · {t.reserva.noches} noches</span>}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={t.responsable_asignado_id ?? ''}
              onChange={(e) => onGuardar(t, { responsable_id: e.target.value ? Number(e.target.value) : null })}
              className={`max-w-full rounded-md border px-2 py-1 text-xs ${t.tipo === 'aseo' && !t.responsable ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200'}`}
              aria-label="Responsable"
            >
              <option value="">{opcionVacia}</option>
              {aptos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              onBlur={() => notas !== (t.notas ?? '') && onGuardar(t, { notas })}
              placeholder="Notas"
              maxLength={500}
              className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
            />
          </div>
        </div>
        <button
          onClick={() => onGuardar(t, { estado: hecha ? 'pendiente' : 'hecha' })}
          className={`shrink-0 rounded-full p-1 transition ${hecha ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'}`}
          title={hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}
          aria-label={hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}
        >
          {hecha ? <CheckCircle2 className="size-6" /> : <Circle className="size-6" />}
        </button>
      </div>
    </li>
  );
}

// ---------- Panel del día ----------

function PanelDia({ fecha, tareas, datos, onGuardar }) {
  const paradas = paradasRuta(tareas);
  const aseos = tareas.filter((t) => t.tipo === 'aseo');
  const urlMaps = urlRutaMaps(paradas, datos.config.origen_ruta);
  const sinDireccion = paradas.filter((t) => !t.propiedad.direccion).length;

  // Envío a cada persona: agrupa por responsable efectivo
  const porResponsable = (lista) => {
    const grupos = new Map();
    lista.filter((t) => t.responsable && t.estado !== 'hecha').forEach((t) => {
      const g = grupos.get(t.responsable.id) ?? { persona: t.responsable, tareas: [] };
      g.tareas.push(t);
      grupos.set(t.responsable.id, g);
    });
    return [...grupos.values()];
  };
  const hechas = tareas.filter((t) => t.estado === 'hecha').length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agenda del día</p>
        <h3 className="text-xl font-extrabold text-slate-800">{fechaLarga(fecha)}</h3>
        {tareas.length > 0 && <p className="text-sm text-slate-500">{hechas} de {tareas.length} tareas hechas</p>}
      </div>

      {tareas.length === 0 && (
        <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
          <CalendarClock className="mx-auto mb-2 size-8 text-slate-300" />
          No hay entregas, recepciones ni aseos este día.
        </div>
      )}

      {paradas.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 font-bold text-slate-800"><Route className="size-4" /> Ruta de llaves ({paradas.length})</h4>
            <div className="flex flex-wrap gap-2">
              {urlMaps && (
                <a href={urlMaps} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800">
                  <MapPin className="size-3.5" /> Abrir en Google Maps
                </a>
              )}
              <a href={linkWhatsApp(textoRuta(fecha, paradas))} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600">
                <MessageCircle className="size-3.5" /> Compartir
              </a>
            </div>
          </div>
          {sinDireccion > 0 && (
            <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {sinDireccion} {sinDireccion === 1 ? 'parada no tiene' : 'paradas no tienen'} dirección: la ruta usará sólo la comuna. Agrégalas en "Personal y direcciones".
            </p>
          )}
          <ol className="space-y-2">
            {paradas.map((t, i) => (
              <TareaCard key={t.id} tarea={t} numero={i + 1} personal={datos.personal} onGuardar={onGuardar} />
            ))}
          </ol>
          {porResponsable(paradas).map(({ persona, tareas: ts }) => persona.telefono && (
            <a key={persona.id} href={linkWhatsApp(textoRuta(fecha, ts), persona.telefono)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline">
              <MessageCircle className="size-3.5" /> Enviar ruta a {persona.nombre} ({ts.length})
            </a>
          ))}
        </section>
      )}

      {aseos.length > 0 && (
        <section>
          <h4 className="mb-2 flex items-center gap-2 font-bold text-slate-800">🧹 Aseos ({aseos.length})</h4>
          <ul className="space-y-2">
            {aseos.map((t) => <TareaCard key={t.id} tarea={t} personal={datos.personal} onGuardar={onGuardar} />)}
          </ul>
          <div className="mt-2 flex flex-col gap-1">
            {porResponsable(aseos).map(({ persona, tareas: ts }) => persona.telefono && (
              <a key={persona.id} href={linkWhatsApp(textoAseos(fecha, ts, persona.nombre), persona.telefono)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline">
                <MessageCircle className="size-3.5" /> Enviar aseos a {persona.nombre} ({ts.length})
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------- Contenedor ----------

export default function Agenda({ onError }) {
  const [mes, setMes] = useState(() => hoyISO().slice(0, 7));
  const [dia, setDia] = useState(hoyISO);
  const [datos, setDatos] = useState(null);
  const [actualizado, setActualizado] = useState(null);
  const [ajustes, setAjustes] = useState(false);
  const grilla = useMemo(() => rangoGrilla(mes), [mes]);

  const cargar = useCallback(async () => {
    try {
      setDatos(await adminApi.agenda({ desde: grilla.inicio, hasta: grilla.fin }));
      setActualizado(new Date());
    } catch (err) {
      onError(err);
    }
  }, [grilla.inicio, grilla.fin, onError]);

  // Se actualiza sola: al cambiar de mes, cada minuto y al volver a la pestaña
  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, REFRESCO_MS);
    const alVolver = () => {
      if (document.visibilityState === 'visible') cargar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargar]);

  const porDia = useMemo(() => {
    const m = new Map();
    for (const t of datos?.tareas ?? []) m.set(t.fecha, [...(m.get(t.fecha) ?? []), t]);
    return m;
  }, [datos]);

  const guardar = async (tarea, cambios) => {
    // Actualización optimista para que la interfaz responda al instante
    setDatos((d) => ({
      ...d,
      tareas: d.tareas.map((t) => {
        if (t.id !== tarea.id) return t;
        const n = { ...t, ...cambios };
        if ('responsable_id' in cambios) {
          n.responsable_asignado_id = cambios.responsable_id;
          n.responsable = d.personal.find((p) => p.id === cambios.responsable_id) ?? t.responsable_defecto;
        }
        return n;
      }),
    }));
    try {
      await adminApi.guardarTarea(tarea.reserva_id, tarea.tipo, cambios);
    } catch (err) {
      onError(err);
    }
    cargar();
  };

  const irHoy = () => {
    setMes(hoyISO().slice(0, 7));
    setDia(hoyISO());
  };
  const hoy = datos?.hoy ?? hoyISO();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
      <section className="min-w-0 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200">
              <button onClick={() => setMes(moverMes(mes, -1))} className="px-2 py-1.5 hover:bg-slate-50" aria-label="Mes anterior"><ChevronLeft className="size-4" /></button>
              <button onClick={irHoy} className="border-x border-slate-200 px-3 text-sm font-medium hover:bg-slate-50">Hoy</button>
              <button onClick={() => setMes(moverMes(mes, 1))} className="px-2 py-1.5 hover:bg-slate-50" aria-label="Mes siguiente"><ChevronRight className="size-4" /></button>
            </div>
            <h2 className="text-lg font-bold text-slate-800">{nombreMes(mes)}</h2>
          </div>
          <div className="flex items-center gap-3">
            {actualizado && (
              <button onClick={cargar} className="flex items-center gap-1 text-xs text-slate-400 hover:text-brand-600" title="Se actualiza automáticamente cada minuto">
                <RefreshCw className="size-3" /> {actualizado.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </button>
            )}
            <button onClick={() => setAjustes(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
              <Settings2 className="size-4" /> <span className="hidden sm:inline">Personal y direcciones</span><Users className="size-4 sm:hidden" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          {Object.entries(TIPOS_TAREA).map(([k, t]) => <span key={k}>{t.emoji} {t.label}</span>)}
          <span className="flex items-center gap-1"><AlertTriangle className="size-3 text-rose-500" /> Recambio el mismo día</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="size-3 text-emerald-500" /> Todo hecho</span>
        </div>

        {datos?.reservas_pendientes > 0 && (
          <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Hay {datos.reservas_pendientes} {datos.reservas_pendientes === 1 ? 'reserva pendiente' : 'reservas pendientes'} de pago en este período.
            Aparecerán en la agenda cuando las marques como pagadas.
          </p>
        )}

        {!datos ? (
          <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-brand-600" /></div>
        ) : (
          <div className="grid grid-cols-7 border-l border-t border-slate-100">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="border-b border-r border-slate-100 bg-slate-50 py-2 text-center text-xs font-semibold uppercase text-slate-500">{d}</div>
            ))}
            {grilla.dias.map((f) => (
              <CeldaDia
                key={f}
                fecha={f}
                tareas={porDia.get(f) ?? []}
                delMes={f.startsWith(mes)}
                esHoy={f === hoy}
                seleccionado={f === dia}
                onClick={() => setDia(f)}
              />
            ))}
          </div>
        )}
      </section>

      <aside className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:self-start xl:overflow-y-auto">
        {datos ? (
          dia >= grilla.inicio && dia <= grilla.fin ? (
            <PanelDia fecha={dia} tareas={porDia.get(dia) ?? []} datos={datos} onGuardar={guardar} />
          ) : (
            <p className="text-sm text-slate-500">Selecciona un día del calendario.</p>
          )
        ) : null}
      </aside>

      {ajustes && datos && (
        <AjustesAgenda datos={datos} onClose={() => setAjustes(false)} onCambio={cargar} onError={onError} />
      )}
    </div>
  );
}
