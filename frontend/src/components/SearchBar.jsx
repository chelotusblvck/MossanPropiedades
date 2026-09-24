import { useState } from 'react';
import { Search, MapPin, Home, Coins, CalendarDays } from 'lucide-react';
import { TIPOS, formatNumero } from '../lib/format';
import { infoGrupo } from '../lib/modalidades';
import FiltroGrupos from './FiltroGrupos';
import { hoyISO, sumarDias } from '../lib/fechas';

function PrecioInput({ value, onChange, moneda, placeholder }) {
  const mostrado = value === '' ? '' : moneda === 'CLP' ? formatNumero(Number(value)) : value.replace('.', ',');

  const manejarCambio = (e) => {
    const texto = e.target.value;
    let limpio;
    if (moneda === 'CLP') {
      limpio = texto.replace(/\D/g, '');
    } else {
      // UF: admite decimales con coma (ej. 4.500,5 -> 4500.5)
      limpio = texto.replace(/\./g, '').replace(/[^\d,]/g, '').replace(',', '.');
      const [ent, dec] = limpio.split('.');
      limpio = dec !== undefined ? `${ent}.${dec.slice(0, 2)}` : ent;
    }
    onChange(limpio);
  };

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-slate-400">
        {moneda === 'UF' ? 'UF' : '$'}
      </span>
      <input
        inputMode={moneda === 'CLP' ? 'numeric' : 'decimal'}
        value={mostrado}
        onChange={manejarCambio}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
    </div>
  );
}

const campoClase =
  'w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

/** onGrupo (opcional): avisa al cambiar la pestaña, p. ej. para que el Home filtre su grilla al mismo tiempo. */
export default function SearchBar({ inicial, comunas, onBuscar, onGrupo }) {
  const [f, setF] = useState(inicial);
  const set = (campo) => (valor) => setF((prev) => ({ ...prev, [campo]: valor }));

  const cambiarMoneda = (moneda) => setF((prev) => ({ ...prev, moneda, precio_min: '', precio_max: '' }));

  const enviar = (e) => {
    e.preventDefault();
    onBuscar(f);
  };

  return (
    <form onSubmit={enviar} className="rounded-2xl bg-white p-2 shadow-2xl shadow-brand-950/20 ring-1 ring-black/5">
      <div className="p-2">
        <FiltroGrupos
          variante="plano"
          valor={f.grupo}
          onCambiar={(g) => {
            setF((prev) => ({ ...prev, grupo: g, precio_min: '', precio_max: '', moneda: infoGrupo(g).moneda ?? 'UF', llegada: '', salida: '' }));
            onGrupo?.(g);
          }}
        />
      </div>

      {f.grupo === 'diario' && (
        <div className="grid gap-3 px-3 pt-1 sm:grid-cols-2 lg:w-1/2">
          {[['llegada', 'Llegada'], ['salida', 'Salida']].map(([k, label]) => (
            <label key={k}>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={f[k]}
                  min={k === 'llegada' ? hoyISO() : f.llegada ? sumarDias(f.llegada, 1) : hoyISO()}
                  onChange={(e) => setF((prev) => {
                    const next = { ...prev, [k]: e.target.value };
                    if (k === 'llegada' && next.salida && next.salida <= next.llegada) next.salida = '';
                    return next;
                  })}
                  className={campoClase}
                />
              </div>
            </label>
          ))}
        </div>
      )}

      <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
        <label className="lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tipo</span>
          <div className="relative">
            <Home className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <select value={f.tipo} onChange={(e) => set('tipo')(e.target.value)} className={campoClase}>
              <option value="">Todos</option>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </label>

        <label className="lg:col-span-3">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Comuna</span>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <select value={f.comuna} onChange={(e) => set('comuna')(e.target.value)} className={campoClase}>
              <option value="">Todas las comunas</option>
              {comunas.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </label>

        <div className="sm:col-span-2 lg:col-span-5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Precio</span>
            <div className="flex rounded-md bg-slate-100 p-0.5 text-xs font-semibold">
              {['UF', 'CLP'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => cambiarMoneda(m)}
                  className={`rounded px-2.5 py-0.5 transition ${f.moneda === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PrecioInput value={f.precio_min} onChange={set('precio_min')} moneda={f.moneda} placeholder="Desde" />
            <PrecioInput value={f.precio_max} onChange={set('precio_max')} moneda={f.moneda} placeholder="Hasta" />
          </div>
        </div>

        <button
          type="submit"
          className="flex items-center justify-center gap-2 rounded-lg bg-acento-500 px-5 py-2.5 text-sm font-bold text-acento-contraste shadow-sm transition hover:bg-acento-400 sm:col-span-2 lg:col-span-2"
        >
          <Search className="size-4" /> Buscar
        </button>
      </div>

      <p className="flex items-center gap-1.5 px-5 pb-3 text-xs text-slate-400">
        <Coins className="size-3.5" /> Los precios se convierten automáticamente entre UF y pesos con el valor UF del día.
      </p>
    </form>
  );
}
