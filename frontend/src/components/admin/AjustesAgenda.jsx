import { useEffect, useState } from 'react';
import { X, Plus, Trash2, Check, Loader2 } from 'lucide-react';
import { adminApi } from '../../lib/api';

const TIPOS_PERSONA = { aseo: 'Aseo', llaves: 'Llaves', ambos: 'Aseo y llaves' };
const campo = 'rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500';

function Persona({ persona: p, onEliminar }) {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-800">{p.nombre}</p>
        <p className="text-xs text-slate-500">{TIPOS_PERSONA[p.tipo]}{p.telefono && ` · ${p.telefono}`}</p>
      </div>
      {confirmando ? (
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => onEliminar(p)} className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700">Eliminar</button>
          <button onClick={() => setConfirmando(false)} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">No</button>
        </div>
      ) : (
        <button onClick={() => setConfirmando(true)} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Eliminar a ${p.nombre}`}>
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  );
}

function PropiedadAjustes({ propiedad: p, personal, onGuardar }) {
  const [direccion, setDireccion] = useState(p.direccion ?? '');
  const [estado, setEstado] = useState(null); // 'guardando' | 'ok'

  useEffect(() => {
    setDireccion(p.direccion ?? '');
  }, [p.direccion]);

  const guardar = async (cambios) => {
    setEstado('guardando');
    const ok = await onGuardar(p, cambios);
    setEstado(ok ? 'ok' : null);
    if (ok) setTimeout(() => setEstado(null), 1500);
  };

  const aptos = personal.filter((x) => x.tipo !== 'llaves' || x.id === p.aseo_responsable_id);
  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-medium text-slate-800" title={p.titulo}>{p.titulo}</p>
        {estado === 'guardando' && <Loader2 className="size-4 shrink-0 animate-spin text-slate-400" />}
        {estado === 'ok' && <Check className="size-4 shrink-0 text-emerald-500" />}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_200px]">
        <input
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          onBlur={() => direccion !== (p.direccion ?? '') && guardar({ direccion: direccion.trim() || null })}
          placeholder={`Dirección (calle y número), ${p.comuna}`}
          maxLength={200}
          className={campo}
          aria-label="Dirección"
        />
        <select
          value={p.aseo_responsable_id ?? ''}
          onChange={(e) => guardar({ aseo_responsable_id: e.target.value ? Number(e.target.value) : null })}
          className={campo}
          aria-label="Responsable de aseo por defecto"
        >
          <option value="">Aseo: sin responsable fijo</option>
          {aptos.map((x) => <option key={x.id} value={x.id}>Aseo: {x.nombre}</option>)}
        </select>
      </div>
    </li>
  );
}

export default function AjustesAgenda({ datos, onClose, onCambio, onError }) {
  const [nueva, setNueva] = useState({ nombre: '', telefono: '', tipo: 'aseo' });
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    const alPresionar = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [onClose]);

  const agregar = async (e) => {
    e.preventDefault();
    setCreando(true);
    try {
      await adminApi.crearPersona({ ...nueva, telefono: nueva.telefono || null });
      setNueva({ nombre: '', telefono: '', tipo: nueva.tipo });
      await onCambio();
    } catch (err) {
      onError(err);
    } finally {
      setCreando(false);
    }
  };

  const eliminar = async (p) => {
    try {
      await adminApi.eliminarPersona(p.id);
      await onCambio();
    } catch (err) {
      onError(err);
    }
  };

  const guardarPropiedad = async (p, cambios) => {
    try {
      await adminApi.actualizarPropiedad(p.id, cambios);
      await onCambio();
      return true;
    } catch (err) {
      onError(err);
      return false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-ajustes"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <h2 id="titulo-ajustes" className="font-bold text-slate-800">Personal y direcciones</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X className="size-5" /></button>
        </div>

        <div className="grid gap-6 overflow-y-auto p-5 md:grid-cols-[1fr_1.4fr]">
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Personal</h3>
            {datos.personal.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Aún no hay personal registrado.</p>
            ) : (
              <ul className="mt-1 divide-y divide-slate-100">
                {datos.personal.map((p) => <Persona key={p.id} persona={p} onEliminar={eliminar} />)}
              </ul>
            )}
            <form onSubmit={agregar} className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3">
              <input required value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre" maxLength={80} className={campo} />
              <input value={nueva.telefono} onChange={(e) => setNueva({ ...nueva, telefono: e.target.value })} placeholder="Teléfono (para WhatsApp)" maxLength={30} className={campo} type="tel" />
              <div className="flex gap-2">
                <select value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })} className={`${campo} flex-1`}>
                  {Object.entries(TIPOS_PERSONA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button disabled={creando || !nueva.nombre.trim()} className="flex items-center gap-1 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
                  {creando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Agregar
                </button>
              </div>
            </form>
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Propiedades de arriendo diario</h3>
            <p className="mt-1 text-xs text-slate-500">La dirección se usa para la ruta de llaves; el responsable se asigna automáticamente a cada aseo.</p>
            {datos.propiedades.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No hay propiedades en arriendo diario.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {datos.propiedades.map((p) => (
                  <PropiedadAjustes key={p.id} propiedad={p} personal={datos.personal} onGuardar={guardarPropiedad} />
                ))}
              </ul>
            )}
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">Horarios por defecto</p>
              <p className="mt-1">Check-in {datos.config.hora_checkin} · Check-out y aseo {datos.config.hora_checkout}
                {datos.config.origen_ruta && <> · La ruta parte en: {datos.config.origen_ruta}</>}</p>
              <p className="mt-1 text-slate-500">Se cambian en <code>backend/.env</code> (HORA_CHECKIN, HORA_CHECKOUT, ORIGEN_RUTA). La hora de cada tarea también se puede ajustar en la agenda.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
