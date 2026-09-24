import { useEffect, useState } from 'react';
import { Search, UserPlus, UserCheck, Loader2, Pencil, Landmark, KeyRound, AlertTriangle } from 'lucide-react';
import { adminApi } from '../../../lib/api';
import { formatearRut, rutValido, digitosCelular, formatearDigitosCelular } from '../../../lib/rut';
import { BANCOS } from '../../../lib/chile';
import { Campo, Titulo, estiloCampo } from './campos';

export const PROPIETARIO_VACIO = {
  nombre: '', rut: '', celular: '', email: '', banco: '', tipo_cuenta: '', numero_cuenta: '', titular_cuenta: '', rut_titular: '',
};

/** Datos del formulario a partir de una ficha existente del servidor. */
export const desdeFicha = (f) => ({
  nombre: f.nombre ?? '',
  rut: f.rut_formateado ?? '',
  celular: digitosCelular(f.telefono ?? ''),
  email: f.email ?? '',
  banco: f.banco ?? '',
  tipo_cuenta: f.tipo_cuenta ?? '',
  numero_cuenta: f.numero_cuenta ?? '',
  titular_cuenta: f.titular_cuenta ?? '',
  rut_titular: f.rut_titular_formateado ?? '',
});

/** Errores del paso 1 (vacío = listo para avanzar). */
export function erroresPropietario(p) {
  const d = p.datos;
  const e = {};
  if (p.modo === 'buscar') return { general: 'Busca un propietario existente o registra uno nuevo' };
  if (d.nombre.trim().length < 3) e.nombre = 'Indica el nombre completo';
  if (!rutValido(d.rut)) e.rut = 'RUT inválido (Módulo 11)';
  if (d.celular && d.celular.length !== 8) e.celular = 'Faltan dígitos';
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = 'Correo inválido';
  if (!d.email.trim() && !d.celular) e.email = 'Indica al menos correo o celular';
  if (!d.banco) e.banco = 'Elige el banco';
  if (!d.tipo_cuenta) e.tipo_cuenta = 'Elige el tipo de cuenta';
  if (!/^[0-9-]{4,20}$/.test(d.numero_cuenta.replace(/\s/g, ''))) e.numero_cuenta = 'Sólo números y guiones';
  if (d.rut_titular && !rutValido(d.rut_titular)) e.rut_titular = 'RUT inválido';
  return e;
}

function Resultado({ ficha, onElegir }) {
  const bancoCompleto = ficha.banco && ficha.numero_cuenta;
  return (
    <li>
      <button type="button" onClick={() => onElegir(ficha)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-brand-50">
        <span className="min-w-0">
          <span className="block truncate font-semibold text-slate-800">{ficha.nombre}</span>
          <span className="text-xs text-slate-500">RUT {ficha.rut_formateado} · {ficha.propiedades} {ficha.propiedades === 1 ? 'propiedad' : 'propiedades'}</span>
        </span>
        {!bancoCompleto && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Faltan datos bancarios</span>}
      </button>
    </li>
  );
}

export default function PasoPropietario({ valor: p, onChange, tiposCuenta, mostrarErrores }) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const errores = mostrarErrores ? erroresPropietario(p) : {};
  const set = (k, v) => onChange({ ...p, datos: { ...p.datos, [k]: v } });

  // Búsqueda con espera de 300 ms mientras se escribe
  useEffect(() => {
    if (q.trim().length < 2) { setResultados(null); return undefined; }
    setBuscando(true);
    const t = setTimeout(() => {
      adminApi.buscarPropietarios(q.trim()).then(setResultados).catch(() => setResultados([])).finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const elegir = (ficha) => {
    const datos = desdeFicha(ficha);
    onChange({ modo: 'existente', existente: ficha, datos, portal: !ficha.portal_habilitado, editando: !(ficha.banco && ficha.numero_cuenta) });
  };

  const nuevo = () => {
    const rutBuscado = rutValido(q) ? formatearRut(q) : '';
    onChange({ modo: 'nuevo', existente: null, datos: { ...PROPIETARIO_VACIO, rut: rutBuscado, nombre: rutBuscado ? '' : q.trim() }, portal: true, editando: true });
  };

  const formulario = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre completo *" error={errores.nombre}>
        <input value={p.datos.nombre} onChange={(e) => set('nombre', e.target.value)} maxLength={120} className={estiloCampo} />
      </Campo>
      <Campo etiqueta="RUT *" error={errores.rut}>
        <input
          value={p.datos.rut}
          onChange={(e) => set('rut', formatearRut(e.target.value))}
          disabled={p.modo === 'existente'}
          placeholder="12.345.678-9"
          className={`${estiloCampo} disabled:bg-slate-50 disabled:text-slate-500`}
        />
      </Campo>
      <Campo etiqueta="Celular WhatsApp" error={errores.celular}>
        <span className="flex overflow-hidden rounded-lg border border-slate-200 focus-within:border-brand-500">
          <span className="flex items-center bg-slate-50 px-3 text-sm font-semibold text-slate-500">+56 9</span>
          <input inputMode="numeric" value={formatearDigitosCelular(p.datos.celular)} onChange={(e) => set('celular', digitosCelular(e.target.value))} placeholder="1234 5678" className="w-full px-3 py-2 text-sm outline-none" />
        </span>
      </Campo>
      <Campo etiqueta="Correo" error={errores.email}>
        <input type="email" value={p.datos.email} onChange={(e) => set('email', e.target.value)} maxLength={160} className={estiloCampo} />
      </Campo>

      <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm font-bold text-slate-700 sm:col-span-2">
        <Landmark className="size-4 text-brand-600" /> Datos bancarios para liquidaciones
      </div>
      <Campo etiqueta="Banco *" error={errores.banco}>
        <select value={p.datos.banco} onChange={(e) => set('banco', e.target.value)} className={estiloCampo}>
          <option value="">Elige…</option>
          {[...new Set([...BANCOS, p.datos.banco].filter(Boolean))].map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Tipo de cuenta *" error={errores.tipo_cuenta}>
        <select value={p.datos.tipo_cuenta} onChange={(e) => set('tipo_cuenta', e.target.value)} className={estiloCampo}>
          <option value="">Elige…</option>
          {tiposCuenta.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="N° de cuenta *" error={errores.numero_cuenta}>
        <input inputMode="numeric" value={p.datos.numero_cuenta} onChange={(e) => set('numero_cuenta', e.target.value.replace(/[^0-9-]/g, ''))} maxLength={20} className={estiloCampo} />
      </Campo>
      <Campo etiqueta="Titular de la cuenta" ayuda="Vacío = el propietario">
        <input value={p.datos.titular_cuenta} onChange={(e) => set('titular_cuenta', e.target.value)} maxLength={120} placeholder={p.datos.nombre} className={estiloCampo} />
      </Campo>
      <Campo etiqueta="RUT del titular" ayuda="Vacío = el del propietario" error={errores.rut_titular}>
        <input value={p.datos.rut_titular} onChange={(e) => set('rut_titular', formatearRut(e.target.value))} placeholder={p.datos.rut} className={estiloCampo} />
      </Campo>
    </div>
  );

  return (
    <div>
      <Titulo paso={1} titulo="Propietario" descripcion="Toda propiedad queda asociada a su dueño: sus liquidaciones se transfieren a esta cuenta." />

      {p.modo === 'buscar' && (
        <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar propietario por RUT o nombre"
              aria-label="Buscar propietario"
              className={`${estiloCampo} py-3 pl-9`}
            />
            {buscando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-brand-600" />}
          </label>
          {resultados && (
            resultados.length ? (
              <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                {resultados.map((f) => <Resultado key={f.rut} ficha={f} onElegir={elegir} />)}
              </ul>
            ) : <p className="text-sm text-slate-500">No encontramos propietarios con “{q}”.</p>
          )}
          <button type="button" onClick={nuevo} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-4 font-semibold text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
            <UserPlus className="size-5" /> Registrar propietario nuevo
          </button>
          {errores.general && <p className="text-sm font-medium text-rose-600">{errores.general}</p>}
        </div>
      )}

      {p.modo !== 'buscar' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              {p.modo === 'existente' ? <UserCheck className="size-4 text-emerald-600" /> : <UserPlus className="size-4 text-brand-600" />}
              {p.modo === 'existente' ? `Propietario existente · ${p.existente.propiedades} ${p.existente.propiedades === 1 ? 'propiedad' : 'propiedades'}` : 'Propietario nuevo'}
            </p>
            <button type="button" onClick={() => onChange({ ...p, modo: 'buscar' })} className="text-xs font-semibold text-brand-700 hover:underline">Cambiar propietario</button>
          </div>

          {p.modo === 'existente' && !p.editando ? (
            <div className="rounded-xl p-4 ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="text-lg font-bold text-slate-800">{p.datos.nombre}</p>
                  <p className="text-slate-500">RUT {p.datos.rut}</p>
                  <p className="mt-1 text-slate-600">{[p.existente.telefono, p.existente.email].filter(Boolean).join(' · ')}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-slate-600"><Landmark className="size-4" /> {p.datos.banco} · {p.datos.tipo_cuenta} · N° {p.datos.numero_cuenta}</p>
                </div>
                <button type="button" onClick={() => onChange({ ...p, editando: true })} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                  <Pencil className="size-3.5" /> Editar
                </button>
              </div>
            </div>
          ) : (
            <>
              {p.modo === 'existente' && !(p.existente.banco && p.existente.numero_cuenta) && (
                <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
                  <AlertTriangle className="size-4 shrink-0" /> Este propietario no tiene datos bancarios completos: complétalos para poder liquidarle.
                </p>
              )}
              {formulario}
            </>
          )}

          <label className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200">
            <input
              type="checkbox"
              checked={p.existente?.portal_habilitado ? true : p.portal}
              disabled={Boolean(p.existente?.portal_habilitado)}
              onChange={(e) => onChange({ ...p, portal: e.target.checked })}
              className="mt-0.5 size-4 accent-brand-600"
            />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-semibold text-brand-900"><KeyRound className="size-4" /> Crear su acceso al Portal de Propietarios</span>
              <span className="block text-brand-800">
                {p.existente?.portal_habilitado
                  ? 'Ya tiene acceso: verá esta propiedad en su portal al publicarla.'
                  : 'Al publicar le enviamos la bienvenida por correo y podrás enviársela por WhatsApp. Verá ocupación, liquidaciones y comprobantes.'}
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
