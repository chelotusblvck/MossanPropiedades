import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Building2, KeyRound, Loader2, ArrowRight, MessageCircle, AlertCircle } from 'lucide-react';
import { propietarioApi, haySesionPropietario } from '../lib/api';
import { MARCA } from '../lib/marca';

const campo = 'w-full rounded-lg border border-slate-200 px-3 py-3 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';


export default function PropietarioLoginPage() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const [paso, setPaso] = useState('identificador');
  const [identificador, setIdentificador] = useState('');
  const [codigo, setCodigo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const canjeado = useRef(false);

  useEffect(() => {
    document.title = `Portal de Propietarios | ${MARCA}`;
  }, []);

  // Enlace de bienvenida / magic link: se canjea una sola vez y se quita de la barra de direcciones
  useEffect(() => {
    const enlace = params.get('enlace');
    if (!enlace) {
      if (haySesionPropietario()) navegar('/propietario', { replace: true });
      return;
    }
    if (canjeado.current) return;
    canjeado.current = true;
    setCargando(true);
    propietarioApi.canjearEnlace(enlace)
      .then(() => navegar('/propietario', { replace: true }))
      .catch((err) => {
        setError(err.message);
        setCargando(false);
        navegar('/propietarios/login', { replace: true });
      });
  }, [params, navegar]);

  const pedirCodigo = async (e) => {
    e?.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const r = await propietarioApi.solicitarCodigo(identificador.trim());
      setAviso(r.mensaje);
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
      await propietarioApi.verificarCodigo(identificador.trim(), codigo);
      navegar('/propietario', { replace: true });
    } catch (err) {
      setError(err.message);
      setCargando(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-950 to-brand-800 p-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-lg font-extrabold text-white">
          <span className="grid size-9 place-items-center rounded-xl bg-white/10"><Building2 className="size-5" /></span> {MARCA}
        </Link>
        <div className="rounded-2xl bg-white p-7 shadow-2xl">
          <span className="grid size-12 place-items-center rounded-xl bg-brand-700 text-white"><KeyRound className="size-6" /></span>
          <h1 className="mt-4 text-2xl font-extrabold text-brand-950">Portal de Propietarios</h1>
          <p className="mt-1 text-sm text-slate-500">Ocupación, liquidaciones y comprobantes de tus propiedades. Sin contraseñas.</p>

          {params.get('enlace') && cargando ? (
            <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-600"><Loader2 className="size-5 animate-spin text-brand-600" /> Validando tu enlace…</div>
          ) : paso === 'identificador' ? (
            <form onSubmit={pedirCodigo} className="mt-6 space-y-3">
              <label htmlFor="prop-id" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">RUT o celular</label>
              <input
                id="prop-id"
                required
                autoFocus
                autoComplete="username"
                placeholder="12.345.678-9 o +56 9 1234 5678"
                value={identificador}
                maxLength={20}
                onChange={(e) => setIdentificador(e.target.value)}
                className={campo}
              />
              {error && <p role="alert" className="flex gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}</p>}
              <button disabled={cargando || !identificador.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
                {cargando ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />} Enviarme un código
              </button>
              <p className="text-center text-xs text-slate-400">Te enviamos un código de 4 dígitos por WhatsApp y/o correo.</p>
            </form>
          ) : (
            <form onSubmit={verificar} className="mt-6 space-y-3">
              <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">{aviso}</p>
              <label htmlFor="prop-codigo" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Código de 4 dígitos</label>
              <input
                id="prop-codigo"
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className={`${campo} text-center font-mono text-3xl tracking-[0.6em]`}
              />
              {error && <p role="alert" className="flex gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}</p>}
              <button disabled={cargando || codigo.length !== 4} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
                {cargando ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Entrar
              </button>
              <div className="flex justify-between text-sm">
                <button type="button" onClick={() => { setPaso('identificador'); setError(null); }} className="font-semibold text-slate-500 hover:underline">Cambiar RUT o celular</button>
                <button type="button" disabled={cargando} onClick={() => pedirCodigo()} className="font-semibold text-brand-700 hover:underline">Reenviar</button>
              </div>
            </form>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-brand-100/70">¿Eres propietario y no tienes acceso? Pídeselo a tu corredora.</p>
      </div>
    </div>
  );
}
