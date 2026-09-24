import { useEffect, useState } from 'react';
import { X, Loader2, Save, Send, CheckCircle2, MessageCircle } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { formatearRut, rutValido } from '../../lib/rut';

const ORIENTACIONES = ['norte', 'sur', 'oriente', 'poniente', 'nororiente', 'norponiente', 'suroriente', 'surponiente'];
const campo = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500';

// Valores del formulario (strings) <-> valores de la API
const aTexto = (v) => (v == null ? '' : String(v));
const aNumero = (s) => (s === '' ? null : Number(s));
const aSiNo = (v) => (v == null ? '' : v ? 'si' : 'no');
const deSiNo = (s) => (s === '' ? null : s === 'si');

function Campo({ etiqueta, ayuda, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-0.5 block text-[11px] text-slate-400">{ayuda}</span>}
    </label>
  );
}

/** Edición de la ficha técnica y condiciones comerciales de una propiedad. */
export default function EditarFichaModal({ propiedad: p, onClose, onGuardado }) {
  const esVenta = p.modalidad === 'venta';
  const esDiario = p.modalidad === 'arriendo_diario';
  const [f, setF] = useState(() => ({
    propietario_nombre: p.propietario_nombre ?? '', propietario_rut: rutValido(p.propietario_rut ?? '') ? formatearRut(p.propietario_rut) : p.propietario_rut ?? '', propietario_email: p.propietario_email ?? '',
    propietario_telefono: p.propietario_telefono ?? '', propietario_cuenta: p.propietario_cuenta ?? '',
    aseo_clp: aTexto(p.aseo_clp), comision_diario_pct: aTexto(p.comision_diario_pct),
    direccion: p.direccion ?? '',
    habitaciones: aTexto(p.habitaciones), banos: aTexto(p.banos), estacionamientos: aTexto(p.estacionamientos), bodegas: aTexto(p.bodegas),
    superficie_util: aTexto(p.superficie_util), superficie_total: aTexto(p.superficie_total),
    gastos_comunes_clp: aTexto(p.gastos_comunes_clp), comision_pct: aTexto(p.comision_pct), garantia_meses: aTexto(p.garantia_meses),
    amoblado: aSiNo(p.amoblado), mascotas: aSiNo(p.mascotas), ano_construccion: aTexto(p.ano_construccion), orientacion: p.orientacion ?? '',
  }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [portal, setPortal] = useState(null); // resultado de crear la cuenta / enviar el acceso del propietario
  const [enviandoAcceso, setEnviandoAcceso] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const rutPropietarioOk = rutValido(f.propietario_rut);
  const propietarioGuardado = Boolean(p.propietario_rut) && rutValido(p.propietario_rut);

  const enviarAcceso = async () => {
    setEnviandoAcceso(true);
    setError(null);
    try {
      setPortal({ ...(await adminApi.bienvenidaPropietario(p.propietario_rut)), reenvio: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviandoAcceso(false);
    }
  };

  useEffect(() => {
    const alPresionar = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [onClose]);

  const guardar = async (e) => {
    e.preventDefault();
    if (f.propietario_rut.trim() && !rutPropietarioOk) {
      setError('RUT del propietario inválido: revisa el dígito verificador.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await adminApi.actualizarPropiedad(p.id, {
        direccion: f.direccion.trim() || null,
        habitaciones: aNumero(f.habitaciones) ?? 0,
        banos: aNumero(f.banos) ?? 0,
        estacionamientos: aNumero(f.estacionamientos) ?? 0,
        bodegas: aNumero(f.bodegas) ?? 0,
        superficie_util: aNumero(f.superficie_util),
        superficie_total: aNumero(f.superficie_total),
        gastos_comunes_clp: aNumero(f.gastos_comunes_clp),
        comision_pct: aNumero(f.comision_pct),
        garantia_meses: esVenta ? null : aNumero(f.garantia_meses),
        amoblado: deSiNo(f.amoblado),
        mascotas: deSiNo(f.mascotas),
        ano_construccion: aNumero(f.ano_construccion),
        orientacion: f.orientacion || null,
        propietario_nombre: f.propietario_nombre,
        propietario_rut: f.propietario_rut,
        propietario_email: f.propietario_email,
        propietario_telefono: f.propietario_telefono,
        propietario_cuenta: f.propietario_cuenta,
        ...(esDiario && { aseo_clp: aNumero(f.aseo_clp), comision_diario_pct: aNumero(f.comision_diario_pct) }),
      });
      // Cuenta de propietario recién creada: se muestra la confirmación de la bienvenida antes de cerrar
      if (r.portal_propietario?.nuevo) setPortal(r.portal_propietario);
      else onGuardado();
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  const numero = (k, props = {}) => <input type="number" inputMode="decimal" min={0} value={f[k]} onChange={set(k)} className={campo} {...props} />;
  const siNo = (k) => (
    <select value={f[k]} onChange={set(k)} className={campo}>
      <option value="">No informado</option>
      <option value="si">Sí</option>
      <option value="no">No</option>
    </select>
  );

  if (portal) {
    const cerrar = portal.reenvio ? () => setPortal(null) : onGuardado;
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" onClick={cerrar}>
        <div role="dialog" aria-modal="true" aria-labelledby="titulo-portal" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-2xl bg-white p-6 text-center shadow-2xl sm:rounded-2xl">
          <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
          <h2 id="titulo-portal" className="mt-3 text-lg font-bold text-slate-800">
            {portal.reenvio ? 'Acceso al portal enviado' : 'Cuenta de propietario creada'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {f.propietario_nombre || 'El propietario'} ya puede entrar al Portal de Propietarios con su RUT.
            {portal.email ? ` Le enviamos la bienvenida con su enlace de acceso a ${f.propietario_email}.` : ' No tiene correo registrado.'}
          </p>
          {portal.whatsapp_url ? (
            <a href={portal.whatsapp_url} target="_blank" rel="noopener noreferrer" className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2.5 font-semibold text-white hover:bg-emerald-600">
              <MessageCircle className="size-4" /> Enviar bienvenida por WhatsApp
            </a>
          ) : (
            <p className="mt-3 text-xs text-slate-400">Registra un celular (+56 9) para enviarle el acceso también por WhatsApp.</p>
          )}
          <button onClick={cerrar} className="mt-3 w-full rounded-lg py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Listo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-ficha-edit"
        onSubmit={guardar}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <h2 id="titulo-ficha-edit" className="font-bold text-slate-800">Editar ficha técnica</h2>
            <p className="truncate text-sm text-slate-500">{p.titulo}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X className="size-5" /></button>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo etiqueta="Dirección"><input value={f.direccion} onChange={set('direccion')} maxLength={200} className={campo} placeholder={`Calle y número, ${p.comuna}`} /></Campo>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
            <Campo etiqueta="Dormitorios">{numero('habitaciones', { step: 1 })}</Campo>
            <Campo etiqueta="Baños">{numero('banos', { step: 1 })}</Campo>
            <Campo etiqueta="Estacionamientos">{numero('estacionamientos', { step: 1 })}</Campo>
            <Campo etiqueta="Bodegas">{numero('bodegas', { step: 1 })}</Campo>
          </div>
          <Campo etiqueta="Superficie útil (m²)">{numero('superficie_util', { step: 'any' })}</Campo>
          <Campo etiqueta="Superficie total (m²)">{numero('superficie_total', { step: 'any' })}</Campo>
          <Campo etiqueta="Gastos comunes mensuales ($)" ayuda="0 = no tiene · vacío = no informado">{numero('gastos_comunes_clp', { step: 1 })}</Campo>
          {esDiario ? (
            <>
              <Campo etiqueta="Comisión corredora (% de lo cobrado)" ayuda="Se descuenta al liquidar al propietario, + IVA · vacío = 20 %">
                {numero('comision_diario_pct', { step: 'any', max: 100 })}
              </Campo>
              <Campo etiqueta="Aseo por estadía ($)" ayuda="Se descuenta al propietario en cada reserva · vacío = aseo base de la configuración">
                {numero('aseo_clp', { step: 1 })}
              </Campo>
            </>
          ) : (
            <Campo
              etiqueta={`Comisión del corredor (% ${esVenta ? 'del precio' : 'de un mes'})`}
              ayuda={`Vacío = valor por defecto (${esVenta ? '2' : '50'} % + IVA)`}
            >
              {numero('comision_pct', { step: 'any', max: 100 })}
            </Campo>
          )}
          {!esVenta && !esDiario && <Campo etiqueta="Garantía (meses de arriendo)" ayuda="Vacío = 1 mes">{numero('garantia_meses', { step: 0.5, max: 6 })}</Campo>}
          <Campo etiqueta="Año de construcción">{numero('ano_construccion', { step: 1, min: 1800, max: new Date().getFullYear() + 5 })}</Campo>
          <Campo etiqueta="Orientación">
            <select value={f.orientacion} onChange={set('orientacion')} className={campo}>
              <option value="">No informada</option>
              {ORIENTACIONES.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Amoblado">{siNo('amoblado')}</Campo>
          {!esVenta && <Campo etiqueta="Admite mascotas">{siNo('mascotas')}</Campo>}

          <div className="flex flex-wrap items-start justify-between gap-2 border-t border-slate-200 pt-4 sm:col-span-2">
            <div>
              <p className="text-sm font-bold text-slate-800">Propietario</p>
              <p className="text-xs text-slate-500">No se muestra en el sitio. Con RUT válido se le crea acceso al Portal de Propietarios.</p>
            </div>
            {propietarioGuardado && (
              <button type="button" onClick={enviarAcceso} disabled={enviandoAcceso} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 disabled:opacity-50">
                {enviandoAcceso ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Enviar acceso al portal
              </button>
            )}
          </div>
          <Campo etiqueta="Nombre"><input value={f.propietario_nombre} onChange={set('propietario_nombre')} maxLength={120} className={campo} /></Campo>
          <Campo etiqueta="RUT" ayuda={f.propietario_rut && !rutPropietarioOk ? 'RUT inválido' : null}>
            <input
              value={f.propietario_rut}
              onChange={(e) => setF((x) => ({ ...x, propietario_rut: formatearRut(e.target.value) }))}
              maxLength={12}
              className={`${campo} ${f.propietario_rut && !rutPropietarioOk ? 'border-rose-300' : ''}`}
              placeholder="12.345.678-9"
            />
          </Campo>
          <Campo etiqueta="Correo"><input type="email" value={f.propietario_email} onChange={set('propietario_email')} maxLength={160} className={campo} /></Campo>
          <Campo etiqueta="Celular (WhatsApp)"><input value={f.propietario_telefono} onChange={set('propietario_telefono')} maxLength={30} className={campo} placeholder="+56 9 1234 5678" /></Campo>
          <div className="sm:col-span-2">
            <Campo etiqueta="Datos para transferir" ayuda="Banco, tipo y n° de cuenta, titular">
              <input value={f.propietario_cuenta} onChange={set('propietario_cuenta')} maxLength={300} className={campo} placeholder="Banco Estado · Cuenta RUT · 12345678" />
            </Campo>
          </div>
        </div>

        {error && <p className="mx-5 mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">Cancelar</button>
          <button disabled={guardando} className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
