import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarCheck, Loader2, CheckCircle2, RefreshCw, CreditCard, Ticket, Check } from 'lucide-react';
import { leerCupon, olvidarCupon } from '../lib/cupon';
import DateRangeCalendar from './DateRangeCalendar';
import IdentificacionCliente from './IdentificacionCliente';
import { api } from '../lib/api';
import { formatCLP } from '../lib/format';
import { nochesOcupadas, diferenciaDias, fechaLarga, hoyISO, sumarDias, fechaHora } from '../lib/fechas';

const REFRESCO_MS = 30_000;
const campo = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

export default function BookingWidget({ propiedad }) {
  const [disp, setDisp] = useState({ hoy: hoyISO(), ocupados: [] });
  const [actualizado, setActualizado] = useState(null);
  const [rango, setRango] = useState({ inicio: null, fin: null });
  const [form, setForm] = useState({ huespedes: 2, notas: '', sitio_web: '' }); // sitio_web: campo trampa para bots
  const [identidad, setIdentidad] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [confirmada, setConfirmada] = useState(null);

  // Disponibilidad "en tiempo real": al cargar, cada 30 s y al volver a la pestaña
  const cargar = useCallback(async () => {
    try {
      setDisp(await api.disponibilidad(propiedad.id));
      setActualizado(new Date());
    } catch {
      /* se reintenta en el siguiente ciclo */
    }
  }, [propiedad.id]);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, REFRESCO_MS);
    const alVolver = () => document.visibilityState === 'visible' && cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [cargar]);

  const ocupadas = useMemo(() => nochesOcupadas(disp.ocupados), [disp.ocupados]);

  // Si otra persona tomó las fechas mientras el cliente miraba, se limpia la selección
  useEffect(() => {
    if (!rango.inicio) return;
    const fin = rango.fin ?? sumarDias(rango.inicio, 1);
    for (let d = rango.inicio; d < fin; d = sumarDias(d, 1)) {
      if (ocupadas.has(d)) {
        setRango({ inicio: null, fin: null });
        setError('Alguien acaba de reservar parte de esas fechas. Elige otras.');
        return;
      }
    }
  }, [ocupadas]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cupón de fidelización (viene precargado si el cliente pulsó "Usar en mi próxima reserva" en Mi cuenta)
  const [cupon, setCupon] = useState(leerCupon);
  const [cuponAplicado, setCuponAplicado] = useState(null); // { cupon, nivel, descuento_pct, beneficios }
  const [cuponError, setCuponError] = useState(null);
  const [validandoCupon, setValidandoCupon] = useState(false);

  const aplicarCupon = useCallback(async (codigo) => {
    if (!codigo.trim()) return;
    if (!identidad?.rut) return setCuponError('Completa primero tu RUT y correo: el cupón es personal.');
    setValidandoCupon(true);
    setCuponError(null);
    try {
      setCuponAplicado(await api.validarCupon(propiedad.id, identidad.rut, codigo.trim()));
    } catch (err) {
      setCuponAplicado(null);
      setCuponError(err.message);
    } finally {
      setValidandoCupon(false);
    }
  }, [identidad?.rut, propiedad.id]);

  // Al cambiar el RUT el cupón se revalida (es personal); si venía precargado se aplica solo
  useEffect(() => {
    setCuponAplicado(null);
    setCuponError(null);
    if (identidad?.rut && cupon) aplicarCupon(cupon);
  }, [identidad?.rut]); // eslint-disable-line react-hooks/exhaustive-deps

  const noches = rango.inicio && rango.fin ? diferenciaDias(rango.inicio, rango.fin) : 0;
  const bruto = noches * (propiedad.precio_clp ?? 0);
  const descuento = cuponAplicado ? Math.round((bruto * cuponAplicado.descuento_pct) / 100) : 0;
  const total = bruto - descuento;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    if (!noches) return setError('Selecciona las fechas de llegada y salida.');
    if (!identidad) return setError('Completa tu RUT y correo para continuar.');
    setEnviando(true);
    setError(null);
    try {
      const r = await api.reservar(propiedad.id, {
        ...form,
        rut: identidad.rut,
        cliente_email: identidad.email,
        cliente_nombre: identidad.nombre,
        cliente_telefono: identidad.telefono,
        huespedes: Number(form.huespedes),
        fecha_inicio: rango.inicio,
        fecha_fin: rango.fin,
        cupon: cuponAplicado?.cupon,
      });
      setConfirmada(r);
      if (cuponAplicado) {
        olvidarCupon();
        setCupon('');
        setCuponAplicado(null);
      }
      cargar();
    } catch (err) {
      setError(err.message);
      if (err.status === 422) setCuponAplicado(null); // cupón ya usado o inválido: se quita
      if (err.status === 409) {
        setRango({ inicio: null, fin: null });
        cargar();
      }
    } finally {
      setEnviando(false);
    }
  };

  if (confirmada) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-lg ring-1 ring-slate-200">
        <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
        <h3 className="mt-3 text-xl font-bold text-slate-800">¡Solicitud enviada!</h3>
        <p className="mt-2 text-slate-600">
          Reserva #{confirmada.id} · {confirmada.noches} {confirmada.noches === 1 ? 'noche' : 'noches'}
          <br />
          {fechaLarga(confirmada.fecha_inicio)} → {fechaLarga(confirmada.fecha_fin)}
        </p>
        {confirmada.monto_total_clp != null && (
          <p className="mt-2 text-lg font-bold text-brand-800">Total: {formatCLP(confirmada.monto_total_clp)}</p>
        )}
        {confirmada.descuento_clp > 0 && (
          <p className="text-sm font-semibold text-emerald-700">
            Ahorraste {formatCLP(confirmada.descuento_clp)} con tu cupón{confirmada.beneficios ? ` · ${confirmada.beneficios}` : ''}
          </p>
        )}
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {confirmada.vence_en ? (
            <>Tus fechas quedaron bloqueadas hasta el <b>{fechaHora(confirmada.vence_en)}</b>. Si no se paga antes, la reserva se libera automáticamente. También te enviamos el enlace de pago por correo.</>
          ) : (
            'Tus fechas quedaron bloqueadas. La reserva se confirma al recibir el pago; también te enviamos el enlace por correo.'
          )}
        </p>
        {confirmada.codigo_pago && (
          <Link
            to={`/pago/${confirmada.codigo_pago}`}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-acento-500 py-3 font-bold text-acento-contraste transition hover:bg-acento-400"
          >
            <CreditCard className="size-4" /> Pagar ahora
          </Link>
        )}
        <p className="mt-3 text-sm text-slate-600">
          {confirmada.cuenta_nueva ? 'Creamos tu cuenta: ' : ''}Sigue tus reservas y comprobantes en{' '}
          <Link to="/mi-cuenta" className="font-semibold text-brand-700 underline">Mi cuenta</Link>.
        </p>
        <button onClick={() => { setConfirmada(null); setRango({ inicio: null, fin: null }); setError(null); }} className="mt-4 text-sm font-semibold text-brand-700 hover:underline">
          Hacer otra reserva
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-200 sm:p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-2xl font-extrabold text-brand-900">
          {formatCLP(propiedad.precio_clp)} <span className="text-sm font-medium text-slate-500">/noche</span>
        </p>
        {actualizado && (
          <button type="button" onClick={cargar} className="flex items-center gap-1 text-xs text-slate-400 hover:text-brand-600" title="Actualizar disponibilidad">
            <RefreshCw className="size-3" /> En vivo
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl ring-1 ring-slate-200">
        <div className="border-r border-slate-200 p-3">
          <p className="text-[11px] font-bold uppercase text-slate-500">Llegada</p>
          <p className="text-sm font-medium">{rango.inicio ? fechaLarga(rango.inicio) : 'Elige fecha'}</p>
        </div>
        <div className="p-3">
          <p className="text-[11px] font-bold uppercase text-slate-500">Salida</p>
          <p className="text-sm font-medium">{rango.fin ? fechaLarga(rango.fin) : rango.inicio ? 'Elige salida' : '—'}</p>
        </div>
      </div>

      <div className="mt-4">
        <DateRangeCalendar hoy={disp.hoy} ocupadas={ocupadas} value={rango} onChange={(r) => { setRango(r); setError(null); }} />
      </div>

      {noches > 0 && (
        <div className="mt-4 space-y-1 rounded-lg bg-brand-50 p-3 text-sm">
          <div className="flex justify-between">
            <span>{formatCLP(propiedad.precio_clp)} × {noches} {noches === 1 ? 'noche' : 'noches'}</span>
            <span className={descuento ? 'text-slate-500 line-through' : 'font-bold text-brand-900'}>{formatCLP(bruto)}</span>
          </div>
          {descuento > 0 && (
            <>
              <div className="flex justify-between text-emerald-700">
                <span>Cupón {cuponAplicado.nivel} (−{cuponAplicado.descuento_pct}%)</span>
                <span>−{formatCLP(descuento)}</span>
              </div>
              <div className="flex justify-between border-t border-brand-100 pt-1 font-bold text-brand-900">
                <span>Total</span>
                <span>{formatCLP(total)}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <IdentificacionCliente idBase="reserva" onChange={setIdentidad} />
        <div>
          <label htmlFor="reserva-cupon" className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Ticket className="size-3.5" /> Cupón de cliente frecuente (opcional)
          </label>
          <div className="flex gap-2">
            <input
              id="reserva-cupon"
              value={cupon}
              onChange={(e) => { setCupon(e.target.value.toUpperCase()); setCuponAplicado(null); setCuponError(null); }}
              placeholder="Ej: ORO-ABC123"
              autoComplete="off"
              maxLength={40}
              className={`${campo} font-mono uppercase`}
            />
            <button
              type="button"
              onClick={() => aplicarCupon(cupon)}
              disabled={!cupon.trim() || validandoCupon || !!cuponAplicado}
              className="shrink-0 rounded-lg px-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 disabled:opacity-50"
            >
              {validandoCupon ? <Loader2 className="size-4 animate-spin" /> : cuponAplicado ? <Check className="size-4 text-emerald-600" /> : 'Aplicar'}
            </button>
          </div>
          {cuponAplicado && (
            <p className="mt-1 text-xs font-semibold text-emerald-700">
              Nivel {cuponAplicado.nivel}: {cuponAplicado.descuento_pct}% OFF{cuponAplicado.beneficios.length ? ` + ${cuponAplicado.beneficios.join(' + ')}` : ''}
            </p>
          )}
          {cuponError && <p className="mt-1 text-xs text-rose-600">{cuponError}</p>}
        </div>
        <label className="flex items-center justify-between gap-2 text-sm text-slate-600">
          Huéspedes
          <input type="number" min={1} max={30} value={form.huespedes} onChange={set('huespedes')} className={`${campo} w-20`} />
        </label>
        <textarea placeholder="Comentarios (opcional)" rows={2} value={form.notas} onChange={set('notas')} className={campo} maxLength={1000} />
        {/* Campo trampa anti-spam: oculto para personas y lectores de pantalla */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>No completar<input tabIndex={-1} autoComplete="off" value={form.sitio_web} onChange={set('sitio_web')} name="sitio_web" /></label>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <button
        type="submit"
        disabled={enviando || !noches || !identidad}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-acento-500 py-3 font-bold text-acento-contraste transition hover:bg-acento-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <CalendarCheck className="size-4" />}
        Solicitar reserva
      </button>
      <p className="mt-2 text-center text-xs text-slate-400">No se cobra nada ahora. Confirmamos por correo o WhatsApp.</p>
    </form>
  );
}
