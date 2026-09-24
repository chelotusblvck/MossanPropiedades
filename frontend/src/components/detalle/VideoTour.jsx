import { PlayCircle, ExternalLink } from 'lucide-react';
import { infoVideo } from '../../lib/video';

/** Video tour (YouTube/Vimeo) o recorrido 360° de la propiedad. */
export default function VideoTour({ url, titulo }) {
  const v = infoVideo(url);
  if (!v) return null;
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800"><PlayCircle className="size-5 text-brand-600" /> Video tour</h2>
      {v.embed ? (
        <div className="mt-3 overflow-hidden rounded-xl bg-slate-900">
          <iframe
            src={v.embed}
            title={`Video tour: ${titulo}`}
            className="aspect-video w-full"
            allow="fullscreen; picture-in-picture; xr-spatial-tracking"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        </div>
      ) : (
        <a href={v.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 font-semibold text-white hover:bg-brand-800">
          Ver recorrido virtual <ExternalLink className="size-4" />
        </a>
      )}
    </section>
  );
}
