import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { SearchX, ShieldCheck, KeyRound, Scale, ArrowRight, LayoutGrid } from 'lucide-react';
import { api } from '../lib/api';
import { COMUNAS_POPULARES } from '../lib/format';
import { infoGrupo } from '../lib/modalidades';
import { FILTROS_VACIOS, urlCatalogo } from '../lib/catalogo';
import { Navbar, Footer } from '../components/Layout';
import SearchBar from '../components/SearchBar';
import FiltroGrupos from '../components/FiltroGrupos';
import PropertyCard, { PropertyCardSkeleton } from '../components/PropertyCard';

// El Home muestra una selección liviana (máx. 8, repartidas entre venta y arriendos); el resto está en /propiedades
const MAX_HOME = 8;

const SERVICIOS = [
  { icono: KeyRound, titulo: 'Administración de arriendos', texto: 'Arriendos año corrido, de marzo a diciembre y por noche: buscamos arrendatarios, cobramos y gestionamos mantenciones.' },
  { icono: ShieldCheck, titulo: 'Tasación y venta', texto: 'Valorizamos tu propiedad con datos de mercado y la publicamos en los principales portales.' },
  { icono: Scale, titulo: 'Asesoría legal', texto: 'Estudio de títulos, promesas y escrituras con abogados especialistas en derecho inmobiliario.' },
];

export default function HomePage() {
  const navegar = useNavigate();
  const [grupo, setGrupo] = useState(''); // "Todas" por defecto: se ve de inmediato que hay venta y arriendos
  const [resultado, setResultado] = useState({ data: [], conteos: null });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [comunasDb, setComunasDb] = useState([]);

  useEffect(() => {
    api.comunas().then((c) => setComunasDb(c.map((x) => x.comuna))).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    api
      .destacadas(grupo)
      .then((r) => !cancelado && setResultado(r))
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => { cancelado = true; };
  }, [grupo]);

  const comunas = useMemo(
    () => [...new Set([...comunasDb, ...COMUNAS_POPULARES])].sort((a, b) => a.localeCompare(b, 'es')),
    [comunasDb],
  );

  // La búsqueda del hero lleva al catálogo completo con los filtros en la URL
  const buscar = (filtros) => navegar(urlCatalogo({ filtros }));
  const info = infoGrupo(grupo);
  const totalGrupo = resultado.conteos?.[grupo || 'todas'] ?? 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <section className="relative isolate">
        <img
          src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=2000&q=70"
          alt=""
          fetchPriority="high" // es lo primero que se ve: se pide antes que las fotos de las tarjetas (que son lazy)
          decoding="async"
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-950/90 via-brand-900/75 to-brand-800/40" />
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-20 sm:px-6 lg:px-8 lg:pb-24 lg:pt-28">
          <p className="text-sm font-semibold uppercase tracking-widest text-acento-300">Propiedades en todo Chile</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Encuentra el lugar donde quieres vivir
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-brand-100">
            Compra, arriendo año corrido, de marzo a diciembre o por noche. Precios en UF y en pesos, actualizados con el valor UF del día.
          </p>
          <div className="mt-10 max-w-6xl">
            <SearchBar inicial={FILTROS_VACIOS} comunas={comunas} onBuscar={buscar} onGrupo={setGrupo} />
          </div>
        </div>
      </section>

      <main id="propiedades" className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-brand-950">{grupo ? info.titulo : 'Propiedades destacadas'}</h2>
          <p className="mt-1 text-slate-500">
            {grupo ? 'Una selección de las más recientes.' : 'Venta, arriendo por noche, año corrido y de marzo a diciembre.'}
          </p>
        </div>
        <div className="mt-5">
          <FiltroGrupos valor={grupo} onCambiar={setGrupo} conteos={resultado.conteos} />
        </div>

        {error ? (
          <div className="mt-10 rounded-2xl bg-rose-50 p-8 text-center text-rose-700 ring-1 ring-rose-200">
            No pudimos cargar las propiedades ({error}). Intenta nuevamente en unos minutos.
          </div>
        ) : cargando ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <PropertyCardSkeleton key={i} />)}
          </div>
        ) : resultado.data.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-2xl bg-white p-12 text-center ring-1 ring-slate-200">
            <SearchX className="size-10 text-slate-300" />
            <p className="mt-4 text-lg font-semibold text-slate-700">
              {grupo ? `Por ahora no tenemos ${info.label.toLowerCase()} disponibles` : 'Aún no hay propiedades publicadas'}
            </p>
            <p className="mt-1 text-slate-500">
              {grupo ? 'Publicamos propiedades nuevas cada semana. Mientras tanto, revisa las demás categorías.' : 'Vuelve pronto: estamos preparando nuevas publicaciones.'}
            </p>
            {grupo && (
              <button onClick={() => setGrupo('')} className="mt-5 rounded-lg bg-brand-700 px-5 py-2.5 font-semibold text-white hover:bg-brand-800">
                Limpiar filtro y ver todas
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {resultado.data.slice(0, MAX_HOME).map((p) => <PropertyCard key={p.id} propiedad={p} />)}
            </div>
            <div className="mt-10 flex flex-col items-center gap-2">
              <Link
                to={urlCatalogo({ filtros: { ...FILTROS_VACIOS, grupo } })}
                className="flex items-center gap-2 rounded-xl bg-brand-700 px-7 py-3.5 font-bold text-white shadow-sm transition hover:bg-brand-800"
              >
                <LayoutGrid className="size-5" /> Ver catálogo completo <ArrowRight className="size-4" />
              </Link>
              {totalGrupo > resultado.data.length && (
                <p className="text-sm text-slate-500">
                  {totalGrupo} {totalGrupo === 1 ? 'propiedad' : 'propiedades'}{grupo ? ` en ${info.label.toLowerCase()}` : ' en total'}
                </p>
              )}
            </div>
          </>
        )}
      </main>

      <section id="servicios" className="scroll-mt-20 bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-brand-950">Te acompañamos en todo el proceso</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {SERVICIOS.map(({ icono: Icono, titulo, texto }) => (
              <div key={titulo} className="rounded-2xl bg-slate-50 p-7 ring-1 ring-slate-200">
                <span className="grid size-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
                  <Icono className="size-6" />
                </span>
                <h3 className="mt-5 text-lg font-bold text-slate-800">{titulo}</h3>
                <p className="mt-2 text-slate-600">{texto}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 flex flex-col items-start justify-between gap-6 rounded-3xl bg-gradient-to-r from-brand-700 to-brand-900 p-8 text-white sm:flex-row sm:items-center sm:p-10">
            <div>
              <p className="text-2xl font-bold">¿Quieres vender o arrendar tu propiedad?</p>
              <p className="mt-1 text-brand-100">Publicamos en nuestro sitio y en Portalinmobiliario sin que tengas que hacer nada.</p>
            </div>
            <a href="#contacto" className="flex shrink-0 items-center gap-2 rounded-lg bg-acento-500 px-5 py-3 font-bold text-acento-contraste transition hover:bg-acento-400">
              Contáctanos <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
