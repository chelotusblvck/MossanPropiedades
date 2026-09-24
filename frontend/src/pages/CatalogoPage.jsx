import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, SearchX, RotateCcw, Gift } from 'lucide-react';
import { leerCupon } from '../lib/cupon';
import { api } from '../lib/api';
import { COMUNAS_POPULARES } from '../lib/format';
import { infoGrupo } from '../lib/modalidades';
import { fechaCorta } from '../lib/fechas';
import { leerUrl, aQuery, FILTROS_VACIOS } from '../lib/catalogo';
import { MARCA } from '../lib/marca';
import { Navbar, Footer } from '../components/Layout';
import SearchBar from '../components/SearchBar';
import FiltroGrupos from '../components/FiltroGrupos';
import PropertyCard, { PropertyCardSkeleton } from '../components/PropertyCard';

const POR_PAGINA = 12;

const ORDENES = [
  { value: 'recientes', label: 'Más recientes' },
  { value: 'precio_asc', label: 'Menor precio' },
  { value: 'precio_desc', label: 'Mayor precio' },
  { value: 'superficie', label: 'Mayor superficie' },
];

function Paginacion({ pagina, paginas, onCambiar }) {
  if (paginas <= 1) return null;
  const btn = 'grid size-10 place-items-center rounded-lg text-sm font-semibold transition disabled:opacity-40';
  // Con muchas páginas se muestran la primera, la última y las cercanas a la actual
  const numeros = Array.from({ length: paginas }, (_, i) => i + 1).filter((n) => n === 1 || n === paginas || Math.abs(n - pagina) <= 2);
  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Paginación">
      <button className={`${btn} bg-white ring-1 ring-slate-200 hover:bg-slate-50`} disabled={pagina === 1} onClick={() => onCambiar(pagina - 1)} aria-label="Página anterior">
        <ChevronLeft className="size-4" />
      </button>
      {numeros.map((n, i) => (
        <span key={n} className="flex items-center gap-2">
          {i > 0 && n - numeros[i - 1] > 1 && <span className="text-slate-400">…</span>}
          <button
            onClick={() => onCambiar(n)}
            aria-current={n === pagina ? 'page' : undefined}
            className={`${btn} ${n === pagina ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            {n}
          </button>
        </span>
      ))}
      <button className={`${btn} bg-white ring-1 ring-slate-200 hover:bg-slate-50`} disabled={pagina === paginas} onClick={() => onCambiar(pagina + 1)} aria-label="Página siguiente">
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}

/** Catálogo completo con filtros, orden y paginación en la URL (/propiedades?grupo=diario&comuna=…). */
export default function CatalogoPage() {
  const [sp, setSp] = useSearchParams();
  const clave = sp.toString();
  const { filtros, orden, pagina } = useMemo(() => leerUrl(new URLSearchParams(clave)), [clave]);
  const [resultado, setResultado] = useState({ data: [], total: 0, paginas: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [comunasDb, setComunasDb] = useState([]);
  const grupo = infoGrupo(filtros.grupo);
  // Cupón de fidelización traído desde "Mi cuenta" (state al llegar; sessionStorage si recarga o vuelve atrás)
  const location = useLocation();
  const [cupon] = useState(() => location.state?.cupon ?? leerCupon());

  useEffect(() => {
    document.title = `${grupo.titulo} | ${MARCA}`;
  }, [grupo.titulo]);

  useEffect(() => {
    api.comunas().then((c) => setComunasDb(c.map((x) => x.comuna))).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    const { llegada, salida, ...resto } = filtros;
    const conFechas = filtros.grupo === 'diario' && llegada && salida ? { llegada, salida } : {};
    api
      .propiedades({ ...resto, ...conFechas, orden, page: pagina, limit: POR_PAGINA })
      .then((r) => !cancelado && setResultado(r))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => { cancelado = true; };
  }, [filtros, orden, pagina]);

  const comunas = useMemo(
    () => [...new Set([...comunasDb, ...COMUNAS_POPULARES])].sort((a, b) => a.localeCompare(b, 'es')),
    [comunasDb],
  );

  const ir = (cambios) => {
    setSp(aQuery({ filtros, orden, pagina: 1, ...cambios }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filtrosActivos = aQuery({ filtros: { ...filtros, grupo: '' } }) !== '';
  const fechasActivas = filtros.grupo === 'diario' && filtros.llegada && filtros.salida;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navbar />
      <section className="bg-gradient-to-br from-brand-950 to-brand-800 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Catálogo de propiedades</h1>
          <p className="mt-1 text-brand-100">Filtra por tipo de operación, comuna y precio.</p>
          <div className="mt-6">
            {/* key: si cambia la URL (p. ej. "Atrás"), el buscador toma los filtros nuevos */}
            <SearchBar key={clave} inicial={filtros} comunas={comunas} onBuscar={(f) => ir({ filtros: f })} />
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <FiltroGrupos valor={filtros.grupo} onCambiar={(g) => ir({ filtros: { ...filtros, grupo: g, llegada: '', salida: '' } })} />

        {cupon && filtros.grupo === 'diario' && (
          <p role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <Gift className="mt-0.5 size-4 shrink-0" />
            <span>
              Tu cupón <b className="font-mono">{cupon}</b> {location.state?.cupon ? 'se copió y ' : ''}quedó listo:
              se ingresará solo en el formulario de reserva de la propiedad que elijas.
            </span>
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-brand-950">
              {grupo.titulo}
              {filtros.comuna && <span className="text-brand-600"> en {filtros.comuna}</span>}
            </h2>
            <p className="mt-1 text-slate-500">
              {cargando ? 'Buscando…' : `${resultado.total} ${resultado.total === 1 ? 'propiedad encontrada' : 'propiedades encontradas'}`}
              {fechasActivas && ` · libres del ${fechaCorta(filtros.llegada)} al ${fechaCorta(filtros.salida)}`}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Ordenar por
            <select
              value={orden}
              onChange={(e) => ir({ orden: e.target.value })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-brand-500"
            >
              {ORDENES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>

        {error ? (
          <div className="mt-10 rounded-2xl bg-rose-50 p-8 text-center text-rose-700 ring-1 ring-rose-200">
            No pudimos cargar las propiedades ({error}). Intenta nuevamente en unos minutos.
          </div>
        ) : cargando ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <PropertyCardSkeleton key={i} />)}
          </div>
        ) : resultado.data.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-2xl bg-white p-12 text-center ring-1 ring-slate-200">
            <SearchX className="size-10 text-slate-300" />
            <p className="mt-4 text-lg font-semibold text-slate-700">
              {filtrosActivos ? 'No encontramos propiedades con esos filtros' : `Por ahora no tenemos ${grupo.label.toLowerCase()} disponibles`}
            </p>
            <p className="mt-1 text-slate-500">
              {filtrosActivos ? 'Prueba ampliando el rango de precio, otras fechas u otra comuna.' : 'Publicamos propiedades nuevas cada semana: revisa las otras categorías.'}
            </p>
            <button onClick={() => ir({ filtros: FILTROS_VACIOS, orden: 'recientes' })} className="mt-5 flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 font-semibold text-white hover:bg-brand-800">
              <RotateCcw className="size-4" /> Limpiar filtros y ver todas
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {resultado.data.map((p) => <PropertyCard key={p.id} propiedad={p} />)}
          </div>
        )}

        <Paginacion pagina={pagina} paginas={resultado.paginas} onCambiar={(n) => ir({ pagina: n })} />
      </main>
      <Footer />
    </div>
  );
}
