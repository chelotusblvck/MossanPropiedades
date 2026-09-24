import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Loader2, CheckCircle2, UserPlus, UserCheck, ArrowRight, AlertCircle } from 'lucide-react';
import { cuentaApi, haySesionCliente, impersonacionActiva } from '../lib/api';
import { formatearRut, rutValido, digitosCelular, formatearDigitosCelular, celularCompleto } from '../lib/rut';

const campo = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Identificación por RUT para los formularios de visita y reserva.
 * 1) RUT + correo  2a) cliente registrado: se reconoce (datos parcialmente ocultos)
 * 2b) cliente nuevo: registro de 1 paso con nombre y celular. Con sesión en "Mi cuenta" se completa sola.
 * onChange recibe { rut, email, nombre?, telefono? } cuando está lista, o null.
 */
export default function IdentificacionCliente({ idBase, onChange }) {
  const [rut, setRut] = useState('');
  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState('inicial'); // inicial | verificando | existente | nuevo | sesion
  const [reconocido, setReconocido] = useState(null);
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [error, setError] = useState(null);
  const [tocadoRut, setTocadoRut] = useState(false);

  // Con sesión iniciada en "Mi cuenta" se usan sus datos directamente. Nunca con la sesión simulada del
  // admin ("ver como usuario"): así no se envían visitas o reservas en nombre de un cliente real.
  useEffect(() => {
    if (!haySesionCliente() || impersonacionActiva()) return;
    cuentaApi.miCuenta()
      .then(({ cuenta }) => {
        setRut(cuenta.rut_formateado);
        setEmail(cuenta.email);
        setReconocido(cuenta);
        setEstado('sesion');
      })
      .catch(() => { /* sesión vencida: se pide el RUT */ });
  }, []);

  useEffect(() => {
    if (estado === 'existente' || estado === 'sesion') onChange({ rut, email: email.trim() });
    else if (estado === 'nuevo' && nombre.trim().length >= 3 && celular.length === 8) {
      onChange({ rut, email: email.trim(), nombre: nombre.trim(), telefono: celularCompleto(celular) });
    } else onChange(null);
  }, [estado, rut, email, nombre, celular]); // eslint-disable-line react-hooks/exhaustive-deps

  const rutOk = rutValido(rut);
  const emailOk = RE_EMAIL.test(email.trim());

  const continuar = async () => {
    setTocadoRut(true);
    if (!rutOk || !emailOk) {
      setError(!rutOk ? 'Revisa tu RUT: el dígito verificador no coincide.' : 'Ingresa un correo válido.');
      return;
    }
    setEstado('verificando');
    setError(null);
    try {
      const r = await cuentaApi.identificar(rut, email.trim());
      if (r.estado === 'correo_distinto') {
        setEstado('inicial');
        setError('Este RUT ya está registrado con otro correo. Usa el correo con que te registraste.');
        return;
      }
      setReconocido(r.estado === 'existente' ? r : null);
      setEstado(r.estado);
    } catch (err) {
      setEstado('inicial');
      setError(err.message);
    }
  };

  const cambiar = () => {
    setEstado('inicial');
    setReconocido(null);
    setError(null);
  };

  // Enter en estos campos no debe enviar el formulario completo
  const alPresionar = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      continuar();
    }
  };

  if (estado === 'sesion' || estado === 'existente') {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm ring-1 ring-emerald-200">
        <UserCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-emerald-900">¡Hola, {reconocido.nombre}!</p>
          <p className="text-emerald-800">
            {estado === 'sesion'
              ? <>RUT {reconocido.rut_formateado} · {reconocido.telefono}</>
              : <>Usaremos tus datos registrados (celular {reconocido.telefono}). Esta solicitud quedará en tu historial.</>}
          </p>
          {estado === 'existente' && (
            <p className="mt-1 text-xs text-emerald-700">¿Cambiaste de celular? Actualízalo en <Link to="/mi-cuenta" className="font-semibold underline">Mi cuenta</Link>.</p>
          )}
        </div>
        {estado === 'existente' && (
          <button type="button" onClick={cambiar} className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline">Cambiar</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3">
        <div>
          <label htmlFor={`${idBase}-rut`} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">RUT</label>
          <div className="relative">
            <input
              id={`${idBase}-rut`}
              required
              inputMode="text"
              autoComplete="off"
              placeholder="12.345.678-9"
              value={rut}
              readOnly={estado === 'nuevo'}
              onChange={(e) => { setRut(formatearRut(e.target.value)); setError(null); }}
              onBlur={() => setTocadoRut(true)}
              onKeyDown={alPresionar}
              aria-invalid={tocadoRut && rut && !rutOk ? 'true' : undefined}
              className={`${campo} pr-9 ${estado === 'nuevo' ? 'bg-slate-50 text-slate-500' : ''} ${tocadoRut && rut && !rutOk ? 'border-rose-300' : ''}`}
            />
            {rutOk && <CheckCircle2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-emerald-500" aria-label="RUT válido" />}
          </div>
          {tocadoRut && rut && !rutOk && <p className="mt-1 text-xs text-rose-600">RUT inválido</p>}
        </div>
        <div>
          <label htmlFor={`${idBase}-email`} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Correo</label>
          <input
            id={`${idBase}-email`}
            required
            type="email"
            autoComplete="email"
            maxLength={160}
            placeholder="tu@correo.cl"
            value={email}
            readOnly={estado === 'nuevo'}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            onKeyDown={alPresionar}
            className={`${campo} ${estado === 'nuevo' ? 'bg-slate-50 text-slate-500' : ''}`}
          />
        </div>
      </div>

      {estado === 'nuevo' ? (
        <div className="rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-bold text-brand-900"><UserPlus className="size-4" /> Crea tu cuenta en 1 paso</p>
            <button type="button" onClick={cambiar} className="text-xs font-semibold text-brand-700 hover:underline">Cambiar RUT o correo</button>
          </div>
          <p className="mt-0.5 text-xs text-brand-800">Así podrás ver y gestionar tus visitas y reservas en «Mi cuenta».</p>
          <div className="mt-3 grid gap-3">
            <div>
              <label htmlFor={`${idBase}-nombre`} className="sr-only">Nombre completo</label>
              <input id={`${idBase}-nombre`} required autoFocus placeholder="Nombre completo" autoComplete="name" maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} className={`${campo} bg-white`} />
            </div>
            <div>
              <label htmlFor={`${idBase}-cel`} className="sr-only">Celular</label>
              <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
                <span className="flex items-center bg-slate-50 px-3 text-sm font-semibold text-slate-500">+56 9</span>
                <input
                  id={`${idBase}-cel`}
                  required
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="1234 5678"
                  value={formatearDigitosCelular(celular)}
                  onChange={(e) => setCelular(digitosCelular(e.target.value))}
                  className="w-full px-3 py-2.5 text-sm outline-none"
                />
              </div>
              {celular && celular.length < 8 && <p className="mt-1 text-xs text-slate-500">Faltan {8 - celular.length} dígitos</p>}
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={continuar}
          disabled={estado === 'verificando' || !rut || !email}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-50"
        >
          {estado === 'verificando' ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Continuar
        </button>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error} {error.includes('otro correo') && <Link to="/mi-cuenta" className="font-semibold underline">Ir a Mi cuenta</Link>}</span>
        </p>
      )}
    </div>
  );
}
