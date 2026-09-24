import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Loader2, LogOut, Mail, Phone, KeyRound, Info, CalendarCheck, CalendarDays, CreditCard, Receipt, Pencil, X, Check, ArrowRight, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { Navbar, Footer } from '../components/Layout';
import { cuentaApi, haySesionCliente } from '../lib/api';
import { MARCA } from '../lib/marca';
import { formatCLP } from '../lib/format';
import { fechaLarga, fechaCorta, desdeUTC, hoyISO, sumarDias } from '../lib/fechas';
import { formatearRut, rutValido, digitosCelular, formatearDigitosCelular, celularCompleto } from '../lib/rut';
import Fidelizacion from '../components/cuenta/Fidelizacion';

const campo = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';
const FRANJA = { manana: 'Mañana', tarde: 'Tarde', indiferente: 'Cualquier horario' };
const fmtEnviada = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
const enviada = (s) => fmtEnviada.format(desdeUTC(s));

function estadoVisita(v) {
  if (v.estado === 'descartada') return { label: v.cancelada_por_cliente_en ? 'Cancelada por ti' : 'Cancelada', clase: 'bg-slate-100 text-slate-600 ring-slate-200' };
  if (v.reprogramacion && v.estado === 'nueva') return { label: 'Reprogramación solicitada', clase: 'bg-violet-100 text-violet-800 ring-violet-200' };
  if (v.estado === 'agendada') return { label: 'Agendada', clase: 'bg-emerald-100 text-emerald-800 ring-emerald-200' };
  return { label: 'Pendiente', clase: 'bg-amber-100 text-amber-800 ring-amber-200' };
}

const ESTADO_RESERVA = {
  pendiente: { label: 'Pendiente de pago', clase: 'bg-amber-100 text-amber-800 ring-amber-200' },
  pagado: { label: 'Pagada', clase: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  cancelado: { label: 'Cancelada', clase: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

function Insignia({ estado }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ring-1 ${estado.clase}`}>{estado.label}</span>;
}

function Miniatura({ src }) {
  return src
    ? <img src={src} alt="" loading="lazy" className="size-16 shrink-0 rounded-lg object-cover sm:size-20" />
    : <span className="size-16 shrink-0 rounded-lg bg-slate-100 sm:size-20" />;
}

// --- Ingreso con RUT + código por correo ---

function Ingreso({ onEntrar }) {
  const [paso, setPaso] = useState('datos');
  const [rut, setRut] = useState('');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const pedirCodigo = async (e) => {
    e?.preventDefault();
    if (!rutValido(rut)) return setError('RUT inválido: revisa el número y el dígito verificador.');
    setCargando(true);
    setError(null);
    try {
      await cuentaApi.solicitarCodigo(rut, email.trim());
      setPaso('codigo');
      setCodigo('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  const verificar = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      await cuentaApi.verificarCodigo(rut, codigo);
      onEntrar();
    } catch (err) {
      setError(err.message);
      setCargando(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-lg ring-1 ring-slate-200 sm:p-8">
      <span className="grid size-12 place-items-center rounded-xl bg-brand-700 text-white"><KeyRound className="size-6" /></span>
      <h1 className="mt-4 text-2xl font-extrabold text-brand-950">Mi cuenta</h1>
      <p className="mt-1 text-sm text-slate-500">Revisa tus visitas y reservas en {MARCA}.</p>

      {paso === 'datos' ? (
        <form onSubmit={pedirCodigo} className="mt-6 space-y-3">
          <div>
            <label htmlFor="ingreso-rut" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">RUT</label>
            <input id="ingreso-rut" required autoFocus autoComplete="off" placeholder="12.345.678-9" value={rut} onChange={(e) => setRut(formatearRut(e.target.value))} className={campo} />
          </div>
          <div>
            <label htmlFor="ingreso-email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Correo con que te registraste</label>
            <input id="ingreso-email" required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
          </div>
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <button disabled={cargando} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
            {cargando ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Enviarme un código
          </button>
          <p className="text-center text-xs text-slate-500">
            ¿Aún no tienes cuenta? Se crea automáticamente al solicitar una visita o una reserva.
          </p>
        </form>
      ) : (
        <form onSubmit={verificar} className="mt-6 space-y-3">
          <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
            Si el RUT <b>{rut}</b> y el correo <b>{email}</b> coinciden con una cuenta, te enviamos un código de 6 dígitos. Revisa también la carpeta de spam.
          </p>
          <label htmlFor="ingreso-codigo" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Código</label>
          <input
            id="ingreso-codigo"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={`${campo} text-center font-mono text-2xl tracking-[0.5em]`}
          />
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <button disabled={cargando || codigo.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
            {cargando ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Entrar
          </button>
          <div className="flex justify-between text-sm">
            <button type="button" onClick={() => { setPaso('datos'); setError(null); }} className="font-semibold text-slate-500 hover:underline">Cambiar datos</button>
            <button type="button" disabled={cargando} onClick={() => pedirCodigo()} className="font-semibold text-brand-700 hover:underline">Reenviar código</button>
          </div>
        </form>
      )}
    </div>
  );
}

// --- Vista del cliente ---

function Perfil({ cuenta, onActualizada, onSalir, soloLectura }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(cuenta.nombre);
  const [celular, setCelular] = useState(digitosCelular(cuenta.telefono));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      onActualizada(await cuentaApi.actualizar({ nombre: nombre.trim(), telefono: celularCompleto(celular) }));
      setEditando(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const iniciales = cuenta.nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-700 text-lg font-bold text-white" aria-hidden="true">{iniciales}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold text-slate-800">{cuenta.nombre}</h1>
          <p className="text-sm text-slate-500">{cuenta.rut_formateado ? `RUT ${cuenta.rut_formateado}` : 'RUT no registrado'}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="flex items-center gap-1"><Mail className="size-3.5" /> {cuenta.email}</span>
            <span className="flex items-center gap-1"><Phone className="size-3.5" /> {cuenta.telefono}</span>
          </p>
        </div>
        {/* En modo "ver como usuario" no se edita ni se cierra la sesión del cliente (la salida está en la barra superior) */}
        {!soloLectura && (
          <div className="flex gap-2">
            {!editando && (
              <button onClick={() => setEditando(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                <Pencil className="size-4" /> Editar datos
              </button>
            )}
            <button onClick={onSalir} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-rose-50 hover:text-rose-700">
              <LogOut className="size-4" /> Salir
            </button>
          </div>
        )}
      </div>

      {editando && (
        <form onSubmit={guardar} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Nombre completo</span>
            <input required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Celular</span>
            <span className="flex overflow-hidden rounded-lg border border-slate-200 focus-within:border-brand-500">
              <span className="flex items-center bg-slate-50 px-3 text-sm font-semibold text-slate-500">+56 9</span>
              <input required inputMode="numeric" value={formatearDigitosCelular(celular)} onChange={(e) => setCelular(digitosCelular(e.target.value))} className="w-full px-3 py-2.5 text-sm outline-none" />
            </span>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setEditando(false); setError(null); }} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100" aria-label="Cancelar"><X className="size-4" /></button>
            <button disabled={guardando || celular.length !== 8} className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
              {guardando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
            </button>
          </div>
          {error && <p className="text-sm text-rose-600 sm:col-span-3">{error}</p>}
          <p className="text-xs text-slate-400 sm:col-span-3">Para cambiar tu RUT o correo, contáctanos.</p>
        </form>
      )}
    </section>
  );
}

function TarjetaVisita({ visita: v, onCambio, onError, soloLectura }) {
  const [modo, setModo] = useState(null); // 'cancelar' | 'reprogramar'
  const [form, setForm] = useState({ fecha_preferida: '', franja: 'indiferente', mensaje: '' });
  const [enviando, setEnviando] = useState(false);
  const estado = estadoVisita(v);
  const activa = v.estado !== 'descartada';
  const preferencia = v.reprogramacion ?? v;

  const accion = async (fn) => {
    setEnviando(true);
    try {
      await fn();
      setModo(null);
      onCambio();
    } catch (err) {
      onError(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex gap-4">
        <Miniatura src={v.imagen} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link to={`/propiedad/${v.propiedad_id}`} className="font-bold text-slate-800 hover:text-brand-700">{v.propiedad_titulo}</Link>
            <Insignia estado={estado} />
          </div>
          <p className="text-sm text-slate-500">{v.propiedad_comuna} · solicitada el {enviada(v.creado_en)}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
            <CalendarDays className="size-4 text-slate-400" />
            {preferencia.fecha_preferida ? fechaLarga(preferencia.fecha_preferida) : 'Sin fecha preferida'} · {FRANJA[preferencia.franja] ?? 'Cualquier horario'}
          </p>
          {activa && !modo && !soloLectura && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setModo('reprogramar')} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">Reprogramar</button>
              <button onClick={() => setModo('cancelar')} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50">Cancelar visita</button>
            </div>
          )}
        </div>
      </div>

      {modo === 'cancelar' && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
          ¿Seguro que quieres cancelar esta visita?
          <span className="flex gap-2">
            <button onClick={() => setModo(null)} className="rounded-lg px-3 py-1.5 font-semibold text-slate-600 hover:bg-white">No</button>
            <button disabled={enviando} onClick={() => accion(() => cuentaApi.cancelarVisita(v.id))} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
              {enviando && <Loader2 className="size-4 animate-spin" />} Sí, cancelar
            </button>
          </span>
        </div>
      )}

      {modo === 'reprogramar' && (
        <form
          onSubmit={(e) => { e.preventDefault(); accion(() => cuentaApi.reprogramarVisita(v.id, form)); }}
          className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2"
        >
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Nueva fecha preferida</span>
            <input type="date" min={hoyISO()} max={sumarDias(hoyISO(), 180)} value={form.fecha_preferida} onChange={(e) => setForm({ ...form, fecha_preferida: e.target.value })} className={`${campo} bg-white`} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Horario</span>
            <select value={form.franja} onChange={(e) => setForm({ ...form, franja: e.target.value })} className={`${campo} bg-white`}>
              {Object.entries(FRANJA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Mensaje (opcional)</span>
            <input maxLength={500} value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} placeholder="Ej: prefiero después de las 18:00" className={`${campo} bg-white`} />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setModo(null)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white">Volver</button>
            <button disabled={enviando} className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
              {enviando && <Loader2 className="size-4 animate-spin" />} Solicitar reprogramación
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

function TarjetaReserva({ reserva: r }) {
  const estado = ESTADO_RESERVA[r.estado_pago];
  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="flex gap-4">
        <Miniatura src={r.imagen} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link to={`/propiedad/${r.propiedad_id}`} className="font-bold text-slate-800 hover:text-brand-700">{r.propiedad_titulo}</Link>
            <Insignia estado={estado} />
          </div>
          <p className="text-sm text-slate-500">Reserva #{r.id} · {r.propiedad_comuna}</p>
          <p className="mt-1 text-sm text-slate-700">
            {fechaCorta(r.fecha_inicio)} → {fechaCorta(r.fecha_fin)} · {r.noches} {r.noches === 1 ? 'noche' : 'noches'} · {r.huespedes} huésp.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-extrabold text-brand-900">{formatCLP(r.monto_total_clp)}</p>
              {r.cupon && (
                <p className="text-xs font-semibold text-emerald-700">
                  Cupón {r.descuento_pct}% OFF{r.descuento_clp ? ` (ahorraste ${formatCLP(r.descuento_clp)})` : ''}{r.beneficios ? ` · ${r.beneficios}` : ''}
                </p>
              )}
            </div>
            {r.estado_pago === 'pagado' && (
              <Link to={`/pago/${r.codigo_pago}`} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50">
                <Receipt className="size-4" /> Ver comprobante
              </Link>
            )}
            {r.estado_pago === 'pendiente' && (
              <Link to={`/pago/${r.codigo_pago}`} className="flex items-center gap-1.5 rounded-lg bg-acento-500 px-3 py-1.5 text-sm font-bold text-acento-contraste hover:bg-acento-400">
                <CreditCard className="size-4" /> Pagar ahora
              </Link>
            )}
            {r.estado_pago === 'cancelado' && r.motivo_cancelacion === 'vencida' && (
              <p className="text-xs text-slate-500">Se liberó por falta de pago</p>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function Panel({ onSalir }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(() => {
    cuentaApi.miCuenta().then(setDatos).catch((err) => (err.status === 401 ? onSalir() : setError(err.message)));
  }, [onSalir]);

  useEffect(() => { cargar(); }, [cargar]);

  const onError = (err) => (err.status === 401 ? onSalir() : setError(err.message));

  if (!datos) {
    return error
      ? <p className="rounded-lg bg-rose-50 p-4 text-rose-700">{error}</p>
      : <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-brand-600" /></div>;
  }

  return (
    <div className="space-y-8">
      <Perfil cuenta={datos.cuenta} onActualizada={(cuenta) => { setDatos({ ...datos, cuenta }); setAviso('Tus datos quedaron actualizados.'); }} onSalir={onSalir} soloLectura={datos.impersonacion} />
      {datos.vista_previa && (
        <p className="flex gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>Vista previa:</b> este cliente aún no tiene cuenta web. Así vería su portal al registrarse
            {datos.cuenta.rut_formateado ? ` con su RUT ${datos.cuenta.rut_formateado}` : ''}
            {datos.cuenta.email ? ` y el correo ${datos.cuenta.email}` : ''}: aparece lo vinculado a su RUT o, sin RUT, lo enviado con ese correo.
            {!datos.cuenta.rut_formateado && ' Registra su RUT en el directorio para ver su cupón.'}
          </span>
        </p>
      )}
      {datos.fidelizacion && <Fidelizacion datos={datos.fidelizacion} />}

      {(aviso || error) && (
        <p role="status" className={`flex items-center justify-between gap-2 rounded-lg p-3 text-sm ring-1 ${error ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200'}`}>
          <span className="flex items-center gap-2">{error ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />} {error ?? aviso}</span>
          <button onClick={() => { setAviso(null); setError(null); }} aria-label="Cerrar"><X className="size-4" /></button>
        </p>
      )}

      <section>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><CalendarCheck className="size-5 text-brand-600" /> Mis visitas</h2>
        {datos.visitas.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">
            Aún no has solicitado visitas. <Link to="/propiedades" className="font-semibold text-brand-700 hover:underline">Ver propiedades</Link>
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {datos.visitas.map((v) => (
              <TarjetaVisita key={v.id} visita={v} soloLectura={datos.impersonacion} onError={onError} onCambio={() => { setAviso('Listo: avisamos a la corredora.'); cargar(); }} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><CalendarDays className="size-5 text-brand-600" /> Mis reservas</h2>
        {datos.reservas.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">Aún no tienes reservas de arriendo por noche.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {datos.reservas.map((r) => <TarjetaReserva key={r.id} reserva={r} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function MiCuentaPage() {
  const [sesion, setSesion] = useState(haySesionCliente);

  useEffect(() => {
    document.title = `Mi cuenta | ${MARCA}`;
  }, []);

  const salir = useCallback(() => {
    cuentaApi.salir();
    setSesion(false);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        {sesion ? <Panel onSalir={salir} /> : <Ingreso onEntrar={() => setSesion(true)} />}
      </main>
      <Footer />
    </div>
  );
}
