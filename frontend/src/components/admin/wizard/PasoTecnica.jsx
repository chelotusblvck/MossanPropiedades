import { formatCLP, formatUF } from '../../../lib/format';
import { ORIENTACIONES } from '../../../lib/chile';
import { Campo, Numero, Titulo, estiloCampo } from './campos';

export function erroresTecnica(f) {
  const e = {};
  if (!(Number(f.precio) > 0)) e.precio = 'Indica el precio';
  if (f.modalidad === 'arriendo_diario') {
    if (f.moneda_original !== 'CLP') e.precio = 'El arriendo diario se publica en pesos';
    if (f.aseo_clp !== '' && Number(f.aseo_clp) < 0) e.aseo_clp = 'Monto inválido';
  }
  if (f.comision_pct !== '' && !(Number(f.comision_pct) >= 0 && Number(f.comision_pct) <= 100)) e.comision_pct = 'Entre 0 y 100';
  if (f.comision_diario_pct !== '' && !(Number(f.comision_diario_pct) >= 0 && Number(f.comision_diario_pct) <= 100)) e.comision_diario_pct = 'Entre 0 y 100';
  if (f.superficie_total && f.superficie_util && Number(f.superficie_util) > Number(f.superficie_total)) {
    e.superficie_util = 'La superficie útil no puede superar la total';
  }
  return e;
}

/** Conversión UF ↔ pesos con la UF del día. */
function Conversion({ f, uf }) {
  const precio = Number(f.precio);
  if (!(precio > 0) || !uf) return null;
  return (
    <p className="mt-1 text-xs text-slate-500">
      ≈ {f.moneda_original === 'UF' ? formatCLP(Math.round(precio * uf)) : formatUF(Math.round((precio / uf) * 100) / 100)} con la UF de hoy ({formatCLP(Math.round(uf))})
    </p>
  );
}

export default function PasoTecnica({ valor: f, onChange, condiciones: c, mostrarErrores }) {
  const errores = mostrarErrores ? erroresTecnica(f) : {};
  const set = (k) => (v) => onChange({ ...f, [k]: v });
  const setE = (k) => (e) => onChange({ ...f, [k]: e.target.value });
  const diario = f.modalidad === 'arriendo_diario';
  const venta = f.modalidad === 'venta';

  return (
    <div>
      <Titulo paso={3} titulo="Ficha técnica y condiciones" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Campo etiqueta="Dormitorios"><Numero valor={f.habitaciones} onCambio={set('habitaciones')} step={1} /></Campo>
        <Campo etiqueta="Baños"><Numero valor={f.banos} onCambio={set('banos')} step={1} /></Campo>
        <Campo etiqueta="Estacionamientos"><Numero valor={f.estacionamientos} onCambio={set('estacionamientos')} step={1} /></Campo>
        <Campo etiqueta="Bodegas"><Numero valor={f.bodegas} onCambio={set('bodegas')} step={1} /></Campo>
        <Campo etiqueta="m² útiles" error={errores.superficie_util}><Numero valor={f.superficie_util} onCambio={set('superficie_util')} step="any" /></Campo>
        <Campo etiqueta="m² totales"><Numero valor={f.superficie_total} onCambio={set('superficie_total')} step="any" /></Campo>
        <Campo etiqueta="Gastos comunes ($)" ayuda="Mensuales"><Numero valor={f.gastos_comunes_clp} onCambio={set('gastos_comunes_clp')} step={1} /></Campo>
        <Campo etiqueta="Orientación">
          <select value={f.orientacion} onChange={setE('orientacion')} className={estiloCampo}>
            <option value="">—</option>
            {ORIENTACIONES.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Amoblado">
          <select value={f.amoblado} onChange={setE('amoblado')} className={estiloCampo}>
            <option value="">No informado</option><option value="si">Sí</option><option value="no">No</option>
          </select>
        </Campo>
        {!venta && (
          <Campo etiqueta="Admite mascotas">
            <select value={f.mascotas} onChange={setE('mascotas')} className={estiloCampo}>
              <option value="">No informado</option><option value="si">Sí</option><option value="no">No</option>
            </select>
          </Campo>
        )}
      </div>

      <div className="mt-6 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <p className="mb-3 text-sm font-bold text-slate-700">{diario ? 'Arriendo diario' : venta ? 'Precio de venta' : 'Arriendo mensual'}</p>
        {diario ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Precio por noche ($) *" error={errores.precio}><Numero valor={f.precio} onCambio={set('precio')} step={1000} /></Campo>
            <Campo etiqueta="Aseo por estadía ($)" ayuda="Se descuenta al propietario" error={errores.aseo_clp}><Numero valor={f.aseo_clp} onCambio={set('aseo_clp')} step={1000} /></Campo>
            <Campo etiqueta="Comisión corredora (%)" ayuda={`Vacío = ${c.comision.diario} %${c.iva_pct ? ' · + IVA' : ''}`} error={errores.comision_diario_pct}>
              <Numero valor={f.comision_diario_pct} onCambio={set('comision_diario_pct')} step="any" max={100} placeholder={String(c.comision.diario)} />
            </Campo>
            <Campo etiqueta="Check-in desde"><input type="time" value={f.hora_checkin} onChange={setE('hora_checkin')} className={estiloCampo} /></Campo>
            <Campo etiqueta="Check-out hasta"><input type="time" value={f.hora_checkout} onChange={setE('hora_checkout')} className={estiloCampo} /></Campo>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta={`${venta ? 'Precio' : 'Arriendo mensual'} *`} error={errores.precio} className="sm:col-span-2">
              <div className="flex gap-2">
                <div className="inline-flex shrink-0 rounded-lg bg-white p-0.5 ring-1 ring-slate-200">
                  {['UF', 'CLP'].map((m) => (
                    <button key={m} type="button" onClick={() => onChange({ ...f, moneda_original: m })} aria-pressed={f.moneda_original === m} className={`rounded-md px-3 text-sm font-semibold ${f.moneda_original === m ? 'bg-brand-700 text-white' : 'text-slate-500'}`}>
                      {m === 'UF' ? 'UF' : '$'}
                    </button>
                  ))}
                </div>
                <Numero valor={f.precio} onCambio={set('precio')} step={f.moneda_original === 'UF' ? 'any' : 1000} />
              </div>
              <Conversion f={f} uf={c.uf} />
            </Campo>
            {!venta && (
              <Campo etiqueta="Garantía (meses)"><Numero valor={f.garantia_meses} onCambio={set('garantia_meses')} step={0.5} max={6} placeholder="1" /></Campo>
            )}
            <Campo
              etiqueta={`Comisión corredor (% ${venta ? 'del precio' : 'de un mes'})`}
              ayuda={`Vacío = ${venta ? c.comision.venta : c.comision.arriendo} %${c.iva_pct ? ` + IVA ${c.iva_pct} %` : ''}`}
              error={errores.comision_pct}
            >
              <Numero valor={f.comision_pct} onCambio={set('comision_pct')} step="any" max={100} placeholder={String(venta ? c.comision.venta : c.comision.arriendo)} />
            </Campo>
          </div>
        )}
      </div>
    </div>
  );
}
