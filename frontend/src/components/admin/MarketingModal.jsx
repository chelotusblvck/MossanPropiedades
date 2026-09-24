import { useEffect, useRef, useState } from 'react';
import { X, Copy, Check, FileText, ImageDown, MessageCircle, Loader2, ExternalLink } from 'lucide-react';
import { PLATAFORMAS, generarFicha, generarImagenRedes, descargarBlob, nombreArchivo } from '../../lib/marketing';

async function copiarAlPortapapeles(texto, textarea) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Respaldo para navegadores sin API de portapapeles (o sin HTTPS)
    textarea.select();
    document.execCommand('copy');
  }
}

export default function MarketingModal({ propiedad: p, onClose }) {
  const [plataforma, setPlataforma] = useState('instagram');
  const [texto, setTexto] = useState(() => generarFicha(p, 'instagram'));
  const [foto, setFoto] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    setTexto(generarFicha(p, plataforma));
  }, [p, plataforma]);

  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', alPresionar);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alPresionar);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const copiar = async () => {
    await copiarAlPortapapeles(texto, textareaRef.current);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const descargarTexto = () => {
    const fotos = (p.imagenes ?? []).map((u, i) => `Foto ${i + 1}: ${u}`).join('\n');
    const contenido = `${texto}\n\n---\nFOTOS\n${fotos || 'Sin fotos'}\n`;
    descargarBlob(new Blob([contenido], { type: 'text/plain;charset=utf-8' }), nombreArchivo(p, 'txt'));
  };

  const descargarImagen = async () => {
    setGenerando(true);
    setAviso(null);
    try {
      descargarBlob(await generarImagenRedes(p, foto), nombreArchivo(p, 'jpg'));
    } catch {
      setAviso('No se pudo generar la imagen (el servidor de la foto no permite usarla). Descarga las fotos desde los enlaces.');
    } finally {
      setGenerando(false);
    }
  };

  const boton = 'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-ficha"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <h2 id="titulo-ficha" className="font-bold text-slate-800">Ficha de marketing</h2>
            <p className="truncate text-sm text-slate-500">{p.titulo}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>

        <div className="grid flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[1fr_220px]">
          <div className="min-w-0">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {PLATAFORMAS.map((pl) => (
                <button
                  key={pl.value}
                  onClick={() => setPlataforma(pl.value)}
                  className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition ${plataforma === pl.value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
                >
                  {pl.label}
                </button>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={16}
              className="mt-3 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm leading-relaxed outline-none focus:border-brand-500"
            />
            <p className="mt-1 text-xs text-slate-400">Puedes editar el texto antes de copiarlo.</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Foto para la imagen</p>
            <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-2">
              {(p.imagenes ?? []).map((src, i) => (
                <div key={src + i} className="group relative">
                  <button
                    onClick={() => setFoto(i)}
                    className={`block aspect-square w-full overflow-hidden rounded-lg ring-2 ${foto === i ? 'ring-brand-600' : 'ring-transparent'}`}
                    aria-label={`Usar foto ${i + 1}`}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                  <a href={src} target="_blank" rel="noopener noreferrer" className="absolute right-1 top-1 rounded bg-white/90 p-1 opacity-0 shadow group-hover:opacity-100" title="Abrir foto original">
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              ))}
              {!p.imagenes?.length && <p className="col-span-2 text-sm text-slate-400">Sin fotos</p>}
            </div>
          </div>
        </div>

        {aviso && <p className="mx-5 mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{aviso}</p>}

        <div className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:flex sm:flex-wrap sm:justify-end">
          <button onClick={copiar} className={`${boton} col-span-2 bg-brand-700 text-white hover:bg-brand-800 sm:order-last`}>
            {copiado ? <Check className="size-4" /> : <Copy className="size-4" />} {copiado ? '¡Copiado!' : 'Copiar texto'}
          </button>
          <button onClick={descargarImagen} disabled={generando} className={`${boton} bg-white ring-1 ring-slate-200 hover:bg-slate-100`}>
            {generando ? <Loader2 className="size-4 animate-spin" /> : <ImageDown className="size-4" />} Imagen para redes
          </button>
          <button onClick={descargarTexto} className={`${boton} bg-white ring-1 ring-slate-200 hover:bg-slate-100`}>
            <FileText className="size-4" /> Descargar resumen
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`${boton} col-span-2 bg-emerald-500 text-white hover:bg-emerald-600 sm:col-span-1`}
          >
            <MessageCircle className="size-4" /> Enviar por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
