import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Eye, ArrowLeft, Loader2 } from 'lucide-react';
import { adminApi, haySesion, impersonacionActiva, terminarImpersonacion } from '../lib/api';

const PORTALES = { '/mi-cuenta': 'cliente', '/propietario': 'propietario', '/propietarios/login': 'propietario' };
const RUTA = { cliente: '/mi-cuenta', propietario: '/propietario' };
const ETIQUETA = { cliente: 'cliente', propietario: 'propietario' };

/**
 * Barra superior del modo "ver como usuario". Aparece mientras el admin mira un portal con un token
 * simulado (sólo lectura), o cuando un admin con sesión entra a /mi-cuenta o /propietario, para elegir
 * a quién ver. Quién es admin lo decide el servidor: sin sesión válida el selector no carga.
 */
export default function ImpersonationBanner() {
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const imp = impersonacionActiva();
  const tipoPortal = PORTALES[pathname] ?? imp?.tipo ?? null;
  const esAdmin = haySesion();
  const [opciones, setOpciones] = useState(null);
  const [cambiando, setCambiando] = useState(false);
  const [error, setError] = useState(null);

  const visible = Boolean(imp) || (esAdmin && Boolean(PORTALES[pathname]));

  useEffect(() => {
    if (!visible || !esAdmin || !tipoPortal) return;
    setOpciones(null);
    adminApi.opcionesImpersonacion(tipoPortal)
      .then(setOpciones)
      .catch(() => setOpciones([])); // sesión de admin vencida o sin permisos: sin selector
  }, [visible, esAdmin, tipoPortal]);

  if (!visible) return null;

  const verComo = async (rut) => {
    if (!rut) return;
    setCambiando(true);
    setError(null);
    try {
      await adminApi.verComo(tipoPortal, rut);
      // Recarga completa: la página vuelve a pedir sus datos con el nuevo token simulado
      window.location.assign(RUTA[tipoPortal]);
    } catch (err) {
      setError(err.message);
      setCambiando(false);
    }
  };

  const volver = () => {
    terminarImpersonacion();
    navegar('/admin');
  };

  return (
    <div role="region" aria-label="Modo ver como usuario" className="relative z-[60] border-b border-amber-300 bg-amber-100 text-amber-950 shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 text-sm sm:px-6">
        <p className="flex min-w-0 items-center gap-2">
          <Eye className="size-4 shrink-0" />
          {imp ? (
            <span className="truncate">
              Viendo como <b>{imp.nombre}</b> ({ETIQUETA[imp.tipo]}{imp.previa ? ', sin cuenta web: vista previa' : ''}) · <span className="font-semibold">sólo lectura</span>
            </span>
          ) : (
            <span>Modo administrador: elige a quién ver en el portal de {tipoPortal === 'propietario' ? 'propietarios' : 'clientes'}</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {esAdmin && tipoPortal && (
            <label className="flex items-center gap-1.5">
              <span className="sr-only">Ver como</span>
              {opciones === null || cambiando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : opciones.length ? (
                <select
                  value={imp?.tipo === tipoPortal && !imp.previa ? imp.rut ?? '' : ''}
                  onChange={(e) => verComo(e.target.value)}
                  className="max-w-64 rounded-lg border border-amber-300 bg-white px-2 py-1 text-sm"
                >
                  <option value="">Ver como {ETIQUETA[tipoPortal]}…</option>
                  {opciones.map((o) => <option key={o.rut} value={o.rut}>{o.nombre} · {o.rut_formateado}</option>)}
                </select>
              ) : (
                <span className="text-xs text-amber-800">{tipoPortal === 'cliente' ? 'Aún no hay clientes con cuenta web' : 'Aún no hay propietarios'}</span>
              )}
            </label>
          )}
          <button onClick={volver} className="flex items-center gap-1.5 rounded-lg bg-amber-950 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-900">
            <ArrowLeft className="size-4" /> Volver al Panel Admin
          </button>
        </div>
      </div>
      {error && <p className="bg-rose-100 px-4 py-1.5 text-center text-sm text-rose-800">{error}</p>}
    </div>
  );
}
