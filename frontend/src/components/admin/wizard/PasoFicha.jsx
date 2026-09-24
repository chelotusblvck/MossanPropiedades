import { CalendarDays, CalendarRange, KeyRound, Tag } from 'lucide-react';
import { MODALIDADES } from '../../../lib/modalidades';
import { COMUNAS_POPULARES } from '../../../lib/format';
import { REGIONES, TIPOS_PROPIEDAD } from '../../../lib/chile';
import { Campo, Titulo, estiloCampo } from './campos';

const OPCIONES = [
  ['arriendo_diario', CalendarDays, 'Por noche, con reservas y pago en línea'],
  ['arriendo_anual', KeyRound, 'Contrato de 12 meses'],
  ['arriendo_marzo_diciembre', CalendarRange, 'Temporada escolar / universitaria'],
  ['venta', Tag, 'Precio en UF o pesos'],
];

export function erroresFicha(f) {
  const e = {};
  if (!f.modalidad) e.modalidad = 'Elige la modalidad';
  if (f.titulo.trim().length < 10) e.titulo = 'Escribe un título de al menos 10 caracteres';
  if (!f.tipo) e.tipo = 'Elige el tipo de propiedad';
  if (!f.comuna.trim()) e.comuna = 'Indica la comuna';
  if (f.descripcion.trim().length < 30) e.descripcion = 'Describe la propiedad (al menos 30 caracteres)';
  return e;
}

export default function PasoFicha({ valor: f, onChange, mostrarErrores }) {
  const errores = mostrarErrores ? erroresFicha(f) : {};
  const set = (k) => (e) => onChange({ ...f, [k]: e.target.value });

  return (
    <div>
      <Titulo paso={2} titulo="Tipo de operación y ficha básica" />

      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-slate-600">Modalidad *</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPCIONES.map(([k, Icono, detalle]) => {
            const activa = f.modalidad === k;
            return (
              <label
                key={k}
                className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${activa ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-slate-200 hover:bg-slate-50'}`}
              >
                <input type="radio" name="modalidad" value={k} checked={activa} onChange={() => onChange({ ...f, modalidad: k })} className="sr-only" />
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${MODALIDADES[k].badge}`}><Icono className="size-4" /></span>
                <span>
                  <span className="block font-semibold text-slate-800">{MODALIDADES[k].label}</span>
                  <span className="text-xs text-slate-500">{detalle}</span>
                </span>
              </label>
            );
          })}
        </div>
        {errores.modalidad && <p className="mt-1 text-[11px] font-medium text-rose-600">{errores.modalidad}</p>}
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Título *" ayuda={`${f.titulo.length}/120 · Ej: "Depto con vista al mar a pasos de la playa"`} error={errores.titulo} className="sm:col-span-2">
          <input value={f.titulo} onChange={set('titulo')} maxLength={120} className={estiloCampo} />
        </Campo>
        <Campo etiqueta="Tipo de propiedad *" error={errores.tipo}>
          <select value={f.tipo} onChange={set('tipo')} className={estiloCampo}>
            <option value="">Elige…</option>
            {TIPOS_PROPIEDAD.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Dirección" ayuda="Calle y número (para la agenda de llaves)">
          <input value={f.direccion} onChange={set('direccion')} maxLength={200} className={estiloCampo} />
        </Campo>
        <Campo etiqueta="Comuna *" error={errores.comuna}>
          <input list="wizard-comunas" value={f.comuna} onChange={set('comuna')} maxLength={80} className={estiloCampo} />
          <datalist id="wizard-comunas">{COMUNAS_POPULARES.map((c) => <option key={c} value={c} />)}</datalist>
        </Campo>
        <Campo etiqueta="Región">
          <select value={f.region} onChange={set('region')} className={estiloCampo}>
            <option value="">Elige…</option>
            {REGIONES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Descripción detallada *" ayuda={`${f.descripcion.length}/5000 · Destaca vista, luz, entorno, conectividad y equipamiento`} error={errores.descripcion} className="sm:col-span-2">
          <textarea value={f.descripcion} onChange={set('descripcion')} rows={6} maxLength={5000} className={estiloCampo} />
        </Campo>
      </div>
    </div>
  );
}
