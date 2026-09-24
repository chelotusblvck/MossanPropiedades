import { useRef, useState } from 'react';
import { ImagePlus, Star, Trash2, ChevronLeft, ChevronRight, Video, CheckCircle2 } from 'lucide-react';
import { esImagenPermitida } from '../../../lib/imagenes';
import { infoVideo } from '../../../lib/video';
import { Campo, Titulo, estiloCampo } from './campos';

export const MAX_FOTOS = 40;

export function erroresMedios({ fotos, video_url: video }) {
  const e = {};
  if (!fotos.length) e.fotos = 'Agrega al menos una foto';
  if (video && !infoVideo(video)) e.video = 'El enlace debe empezar con https://';
  return e;
}

let contador = 0;

export default function PasoMedios({ fotos, onFotos, video, onVideo, mostrarErrores }) {
  const [encima, setEncima] = useState(false);
  const [aviso, setAviso] = useState(null);
  const input = useRef(null);
  const errores = mostrarErrores ? erroresMedios({ fotos, video_url: video }) : {};
  const infoV = video ? infoVideo(video) : null;

  const agregar = (lista) => {
    const archivos = [...lista];
    const validas = archivos.filter(esImagenPermitida);
    const cupo = MAX_FOTOS - fotos.length;
    const nuevas = validas.slice(0, cupo).map((archivo) => ({ id: `f${++contador}`, archivo, preview: URL.createObjectURL(archivo), url: null }));
    const descartadas = archivos.length - nuevas.length;
    setAviso(descartadas ? `${descartadas} ${descartadas === 1 ? 'archivo no se agregó' : 'archivos no se agregaron'}: sólo JPG, PNG o WEBP, máximo ${MAX_FOTOS} fotos.` : null);
    if (nuevas.length) onFotos([...fotos, ...nuevas]);
  };

  const mover = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= fotos.length) return;
    const copia = [...fotos];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    onFotos(copia);
  };
  const portada = (i) => onFotos([fotos[i], ...fotos.filter((_, k) => k !== i)]);
  const quitar = (i) => {
    URL.revokeObjectURL(fotos[i].preview);
    onFotos(fotos.filter((_, k) => k !== i));
  };

  return (
    <div>
      <Titulo paso={4} titulo="Fotos y video" descripcion="La primera foto es la portada: es la que aparece en los listados y en redes sociales." />

      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); agregar(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${encima ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'}`}
      >
        <ImagePlus className={`size-9 ${encima ? 'text-brand-600' : 'text-slate-400'}`} />
        <p className="font-semibold text-slate-700">Arrastra las fotos aquí o haz clic para elegirlas</p>
        <p className="text-xs text-slate-500">JPG, PNG o WEBP · hasta {MAX_FOTOS} fotos · las muy pesadas se optimizan automáticamente</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
      </div>
      {aviso && <p className="mt-2 text-sm text-amber-700">{aviso}</p>}
      {errores.fotos && <p className="mt-2 text-sm font-medium text-rose-600">{errores.fotos}</p>}

      {fotos.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fotos.map((f, i) => (
            <li key={f.id} className={`group relative overflow-hidden rounded-xl ring-2 ${i === 0 ? 'ring-amber-400' : 'ring-transparent'}`}>
              <img src={f.preview} alt={`Foto ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
              {i === 0 && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950"><Star className="size-3 fill-current" /> Portada</span>}
              {f.url && <CheckCircle2 className="absolute right-2 top-2 size-5 rounded-full bg-white text-emerald-500" aria-label="Subida" />}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2">
                <div className="flex gap-1">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="rounded bg-white/90 p-1 text-slate-700 disabled:opacity-40" aria-label="Mover a la izquierda"><ChevronLeft className="size-4" /></button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === fotos.length - 1} className="rounded bg-white/90 p-1 text-slate-700 disabled:opacity-40" aria-label="Mover a la derecha"><ChevronRight className="size-4" /></button>
                </div>
                <div className="flex gap-1">
                  {i !== 0 && <button type="button" onClick={() => portada(i)} className="rounded bg-white/90 px-1.5 py-1 text-[11px] font-semibold text-slate-700" title="Usar como portada"><Star className="size-4" /></button>}
                  <button type="button" onClick={() => quitar(i)} className="rounded bg-white/90 p-1 text-rose-600" aria-label="Quitar foto"><Trash2 className="size-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <Campo etiqueta="Video tour o recorrido 360° (opcional)" ayuda="YouTube, Vimeo, Matterport u otro enlace https" error={errores.video}>
          <span className="relative block">
            <Video className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input type="url" value={video} onChange={(e) => onVideo(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className={`${estiloCampo} pl-9`} />
          </span>
        </Campo>
        {infoV?.embed && (
          <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-slate-200">
            <iframe src={infoV.embed} title="Vista previa del video" className="aspect-video w-full" allow="fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" loading="lazy" />
          </div>
        )}
        {infoV?.tipo === 'enlace' && <p className="mt-2 text-xs text-slate-500">Se mostrará como botón “Ver recorrido” en la ficha.</p>}
      </div>
    </div>
  );
}
