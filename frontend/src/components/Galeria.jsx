import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Expand, ImageOff, Images } from 'lucide-react';

/** Detecta deslizamiento horizontal (móvil) y llama a onIzq / onDer. */
function useSwipe(onIzq, onDer) {
  const inicio = useRef(null);
  return {
    onTouchStart: (e) => { inicio.current = e.touches[0].clientX; },
    onTouchEnd: (e) => {
      if (inicio.current == null) return;
      const dx = e.changedTouches[0].clientX - inicio.current;
      inicio.current = null;
      if (Math.abs(dx) > 50) (dx < 0 ? onDer : onIzq)();
    },
  };
}

function Flecha({ lado, onClick, oscuro = false }) {
  const Icono = lado === 'izq' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={lado === 'izq' ? 'Foto anterior' : 'Foto siguiente'}
      className={`absolute top-1/2 z-10 -translate-y-1/2 rounded-full p-2 shadow-lg transition ${lado === 'izq' ? 'left-3' : 'right-3'} ${
        oscuro ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white/90 text-slate-800 hover:bg-white'
      }`}
    >
      <Icono className="size-6" />
    </button>
  );
}

/** Visor a pantalla completa: flechas, teclado (← → Esc), deslizar y miniaturas. */
function Visor({ imagenes, indice, onCambiar, onCerrar, titulo }) {
  const total = imagenes.length;
  const anterior = useCallback(() => onCambiar((indice - 1 + total) % total), [indice, total, onCambiar]);
  const siguiente = useCallback(() => onCambiar((indice + 1) % total), [indice, total, onCambiar]);
  const swipe = useSwipe(anterior, siguiente);
  const cerrarRef = useRef(null);
  const miniaturasRef = useRef(null);

  useEffect(() => {
    const alPresionar = (e) => {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'ArrowLeft') anterior();
      else if (e.key === 'ArrowRight') siguiente();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [anterior, siguiente, onCerrar]);

  useEffect(() => {
    const previo = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cerrarRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previo?.focus?.();
    };
  }, []);

  // Precarga de las fotos vecinas y miniatura activa siempre visible
  useEffect(() => {
    [imagenes[(indice + 1) % total], imagenes[(indice - 1 + total) % total]].forEach((src) => {
      const img = new Image();
      img.src = src;
    });
    miniaturasRef.current?.children[indice]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [indice, imagenes, total]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Fotos de ${titulo}`} className="fixed inset-0 z-[60] flex flex-col bg-slate-950/95 text-white">
      <div className="flex items-center justify-between px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <span className="text-sm font-medium text-white/80">{indice + 1} / {total}</span>
        <button ref={cerrarRef} onClick={onCerrar} className="rounded-full p-2 hover:bg-white/10" aria-label="Cerrar galería">
          <X className="size-6" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16" {...swipe}>
        <img src={imagenes[indice]} alt={`${titulo} – foto ${indice + 1} de ${total}`} className="max-h-full max-w-full select-none object-contain" draggable={false} />
        {total > 1 && (
          <>
            <Flecha lado="izq" onClick={anterior} oscuro />
            <Flecha lado="der" onClick={siguiente} oscuro />
          </>
        )}
      </div>
      {total > 1 && (
        <div ref={miniaturasRef} className="flex gap-2 overflow-x-auto px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {imagenes.map((src, i) => (
            <button
              key={src + i}
              onClick={() => onCambiar(i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-current={i === indice}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 transition ${i === indice ? 'ring-white' : 'opacity-50 ring-transparent hover:opacity-90'}`}
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Galería de la ficha: foto principal navegable + miniaturas; clic para ampliar. */
export default function Galeria({ imagenes = [], titulo }) {
  const [activa, setActiva] = useState(0);
  const [visor, setVisor] = useState(false);
  const total = imagenes.length;
  const anterior = () => setActiva((i) => (i - 1 + total) % total);
  const siguiente = () => setActiva((i) => (i + 1) % total);
  const swipe = useSwipe(anterior, siguiente);

  if (!total) {
    return (
      <div className="grid aspect-[16/9] place-items-center rounded-2xl bg-slate-200 text-slate-400">
        <ImageOff className="size-10" />
      </div>
    );
  }

  return (
    <div>
      <div className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100 sm:aspect-[16/10]" {...swipe}>
        <button type="button" onClick={() => setVisor(true)} className="block h-full w-full cursor-zoom-in" aria-label="Ampliar foto">
          <img src={imagenes[activa]} alt={`${titulo} – foto ${activa + 1} de ${total}`} className="h-full w-full object-cover" />
        </button>
        {total > 1 && (
          <>
            <Flecha lado="izq" onClick={anterior} />
            <Flecha lado="der" onClick={siguiente} />
          </>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-slate-900/70 px-3 py-1 text-xs font-semibold text-white">
          {activa + 1} / {total}
        </div>
        <button
          type="button"
          onClick={() => setVisor(true)}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow hover:bg-white"
        >
          {total > 1 ? <Images className="size-4" /> : <Expand className="size-4" />}
          {total > 1 ? `Ver las ${total} fotos` : 'Ampliar'}
        </button>
      </div>

      {total > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {imagenes.map((src, i) => (
            <button
              key={src + i}
              onClick={() => setActiva(i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-current={i === activa}
              className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 transition sm:h-20 sm:w-28 ${i === activa ? 'ring-brand-600' : 'opacity-70 ring-transparent hover:opacity-100'}`}
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {visor && <Visor imagenes={imagenes} indice={activa} onCambiar={setActiva} onCerrar={() => setVisor(false)} titulo={titulo} />}
    </div>
  );
}
