import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarCheck, CheckCircle2, Loader2, Sun, Sunset, Clock } from 'lucide-react';
import { api } from '../../lib/api';
import IdentificacionCliente from '../IdentificacionCliente';
import { hoyISO, sumarDias } from '../../lib/fechas';

const FRANJAS = [
  { value: 'manana', label: 'Mañana', icono: Sun },
  { value: 'tarde', label: 'Tarde', icono: Sunset },
  { value: 'indiferente', label: 'Cualquiera', icono: Clock },
];
const campo = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

export default function SolicitarVisita({ propiedad }) {
  const [form, setForm] = useState({
    fecha_preferida: '', franja: 'indiferente',
    mensaje: `Hola, me interesa "${propiedad.titulo}". Me gustaría coordinar una visita.`,
    sitio_web: '', // campo trampa: las personas no lo ven; los bots lo llenan
  });
  const [identidad, setIdentidad] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const [enviada, setEnviada] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    if (!identidad) return setError('Completa tu RUT y correo para continuar.');
    setEnviando(true);
    setError(null);
    try {
      const r = await api.solicitarVisita(propiedad.id, { ...form, ...identidad });
      setEnviada({ email: identidad.email, cuentaNueva: r.cuenta_nueva });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (enviada) {
    return (
      <div id="solicitar-visita" className="scroll-mt-24 rounded-2xl bg-white p-6 text-center shadow-lg ring-1 ring-slate-200">
        <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
        <h2 className="mt-3 text-xl font-bold text-slate-800">¡Solicitud enviada!</h2>
        <p className="mt-2 text-slate-600">Te contactaremos pronto para coordinar la visita. Te enviamos una copia a <b>{enviada.email}</b>.</p>
        <p className="mt-3 rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
          {enviada.cuentaNueva ? 'Creamos tu cuenta. ' : ''}Revisa el estado, reprograma o cancela tu visita en{' '}
          <Link to="/mi-cuenta" className="font-semibold underline">Mi cuenta</Link>.
        </p>
      </div>
    );
  }

  return (
    <form id="solicitar-visita" onSubmit={enviar} className="scroll-mt-24 rounded-2xl bg-white p-5 shadow-lg ring-1 ring-slate-200 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><CalendarCheck className="size-5 text-brand-600" /> Solicitar una visita</h2>
      <p className="mt-1 text-sm text-slate-500">Identifícate con tu RUT y te contactamos para agendar.</p>

      <div className="mt-4 grid gap-3">
        <IdentificacionCliente idBase="visita" onChange={setIdentidad} />

        <div>
          <label htmlFor="visita-fecha" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha preferida (opcional)</label>
          <input id="visita-fecha" type="date" min={hoyISO()} max={sumarDias(hoyISO(), 180)} value={form.fecha_preferida} onChange={set('fecha_preferida')} className={campo} />
        </div>

        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Horario</legend>
          <div className="grid grid-cols-3 gap-2">
            {FRANJAS.map(({ value, label, icono: Icono }) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium ring-1 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                  form.franja === value ? 'bg-brand-700 text-white ring-brand-700' : 'text-slate-600 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                <input type="radio" name="franja" value={value} checked={form.franja === value} onChange={set('franja')} className="sr-only" />
                <Icono className="size-4" /> {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="sr-only" htmlFor="visita-mensaje">Mensaje</label>
        <textarea id="visita-mensaje" rows={3} maxLength={1000} value={form.mensaje} onChange={set('mensaje')} className={campo} />

        {/* Campo trampa anti-spam: oculto para personas y lectores de pantalla */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>No completar<input tabIndex={-1} autoComplete="off" value={form.sitio_web} onChange={set('sitio_web')} name="sitio_web" /></label>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <button
        type="submit"
        disabled={enviando || !identidad}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-acento-500 py-3 font-bold text-acento-contraste transition hover:bg-acento-400 disabled:opacity-50"
      >
        {enviando ? <Loader2 className="size-4 animate-spin" /> : <CalendarCheck className="size-4" />} Solicitar visita
      </button>
      <p className="mt-2 text-center text-xs text-slate-400">Tus datos sólo se usan para coordinar la visita.</p>
    </form>
  );
}
