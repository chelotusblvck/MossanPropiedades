import { useState } from 'react';
import { Link } from 'react-router';
import { BedDouble, Bath, Ruler, MapPin, ChevronLeft, ChevronRight, ImageOff, Car } from 'lucide-react';
import { formatUF, formatCLP, formatNumero, TIPO_LABEL } from '../lib/format';
import { infoModalidad } from '../lib/modalidades';

function Carrusel({ imagenes, titulo }) {
  const [idx, setIdx] = useState(0);
  const [fallidas, setFallidas] = useState({});
  const total = imagenes.length;
  const mover = (delta) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIdx((i) => (i + delta + total) % total);
  };

  if (!total || fallidas[idx]) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
        <ImageOff className="size-8" />
        <span className="text-xs">Sin imagen</span>
      </div>
    );
  }

  return (
    <>
      <img
        src={imagenes[idx]}
        alt={`${titulo} – foto ${idx + 1}`}
        loading="lazy"
        decoding="async"
        onError={() => setFallidas((f) => ({ ...f, [idx]: true }))}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
      />
      {total > 1 && (
        <>
          <button
            onClick={mover(-1)}
            aria-label="Foto anterior"
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-slate-700 opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={mover(1)}
            aria-label="Foto siguiente"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-slate-700 opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100"
          >
            <ChevronRight className="size-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {imagenes.slice(0, 6).map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Dato({ icono: Icono, valor, etiqueta }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-slate-600" title={etiqueta}>
      <Icono className="size-4 text-brand-500" />
      <span className="font-semibold text-slate-800">{valor}</span>
      <span className="hidden text-slate-500 sm:inline">{etiqueta}</span>
    </div>
  );
}

export default function PropertyCard({ propiedad: p }) {
  const modalidad = infoModalidad(p.modalidad);
  const superficie = p.superficie_util ?? p.superficie_total;
  const principalEnUF = p.moneda_original === 'UF';
  const sufijo = modalidad.sufijo ? <span className="text-sm font-medium text-slate-500"> {modalidad.sufijo}</span> : null;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <Carrusel imagenes={p.imagenes ?? []} titulo={p.titulo} />
        {/* Operación y tipo en una fila que hace salto: en tarjetas angostas nunca se tapan entre sí */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide shadow ${modalidad.badge}`}>
            {modalidad.label}
          </span>
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow">
            {TIPO_LABEL[p.tipo] ?? 'Propiedad'}
          </span>
        </div>
        {/* Destacada va abajo a la izquierda, lejos de la fila superior para no chocar con operaciones largas */}
        {p.destacada && (
          <span className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow">
            Destacada
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div>
          <p className="text-2xl font-extrabold tracking-tight text-brand-900">
            {principalEnUF ? formatUF(p.precio_uf) : formatCLP(p.precio_clp)}
            {sufijo}
          </p>
          <p className="text-sm font-medium text-slate-500">
            ≈ {principalEnUF ? formatCLP(p.precio_clp) : formatUF(p.precio_uf)}
          </p>
        </div>

        <h3 className="mt-3 line-clamp-2 font-semibold leading-snug text-slate-800">
          {/* Enlace "estirado": toda la tarjeta es clickeable, las flechas del carrusel quedan por encima */}
          <Link to={`/propiedad/${p.id}`} className="after:absolute after:inset-0 hover:text-brand-700">
            {p.titulo}
          </Link>
        </h3>

        <p className="mb-4 mt-2 flex items-center gap-1 text-sm text-slate-500">
          <MapPin className="size-4 shrink-0 text-slate-400" />
          <span className="truncate">{[p.comuna, p.region].filter(Boolean).join(', ')}</span>
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4">
          {p.habitaciones > 0 && <Dato icono={BedDouble} valor={p.habitaciones} etiqueta={p.habitaciones === 1 ? 'dorm.' : 'dorms.'} />}
          {p.banos > 0 && <Dato icono={Bath} valor={p.banos} etiqueta={p.banos === 1 ? 'baño' : 'baños'} />}
          {superficie != null && <Dato icono={Ruler} valor={formatNumero(superficie)} etiqueta="m²" />}
          {p.estacionamientos > 0 && <Dato icono={Car} valor={p.estacionamientos} etiqueta="estac." />}
        </div>
      </div>
    </article>
  );
}

export function PropertyCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="aspect-[4/3] bg-slate-200" />
      <div className="space-y-3 p-5">
        <div className="h-7 w-1/2 rounded bg-slate-200" />
        <div className="h-4 w-1/3 rounded bg-slate-100" />
        <div className="h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-2/3 rounded bg-slate-100" />
      </div>
    </div>
  );
}
