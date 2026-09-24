import { useState } from 'react';
import { Link } from 'react-router';
import { PartyPopper, ExternalLink, Copy, Check, MessageCircle, Loader2, Share2, Plus } from 'lucide-react';
import { adminApi } from '../../../lib/api';
import { generarFicha } from '../../../lib/marketing';
import MarketingModal from '../MarketingModal';

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sin API de portapapeles (http o permisos): método clásico
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/** Acciones pos-publicación: ver la ficha, copiar el texto para redes y enviar la bienvenida al propietario. */
export default function ExitoPublicacion({ propiedad: p, bienvenida, onOtra, onCerrar }) {
  const [copiado, setCopiado] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [waUrl, setWaUrl] = useState(bienvenida?.whatsapp_url ?? null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const texto = generarFicha(p, 'whatsapp');

  const copiarFicha = async () => {
    setCopiado(await copiar(texto));
    setTimeout(() => setCopiado(false), 2500);
  };

  // Sin bienvenida previa: se genera ahora (habilita su portal). La pestaña se abre antes de la
  // petición para que el navegador no la bloquee como ventana emergente.
  const enviarBienvenida = async () => {
    const ventana = window.open('about:blank', '_blank');
    setEnviando(true);
    setMensaje(null);
    try {
      const r = await adminApi.bienvenidaPropietario(p.propietario_rut);
      if (r.whatsapp_url) {
        setWaUrl(r.whatsapp_url);
        if (ventana) ventana.location.href = r.whatsapp_url;
      } else {
        ventana?.close();
        setMensaje(r.email ? 'El propietario no tiene celular registrado: le enviamos la bienvenida sólo por correo.' : 'El propietario no tiene celular registrado.');
      }
    } catch (err) {
      ventana?.close();
      setMensaje(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const boton = 'flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold transition';

  return (
    <div className="mx-auto max-w-lg py-4 text-center">
      <PartyPopper className="mx-auto size-14 text-amber-500" />
      <h3 className="mt-3 text-2xl font-extrabold text-slate-800">¡Propiedad publicada!</h3>
      <p className="mt-1 text-slate-600">“{p.titulo}” ya está visible en el sitio.</p>
      {bienvenida?.email && <p className="mt-1 text-sm text-emerald-700">Le enviamos al propietario la bienvenida al portal por correo.</p>}

      <div className="mt-6 space-y-3 text-left">
        <Link to={`/propiedad/${p.id}`} target="_blank" className={`${boton} bg-brand-700 text-white hover:bg-brand-800`}>
          <ExternalLink className="size-5" /> Ver propiedad publicada
        </Link>

        <div className="rounded-xl ring-1 ring-slate-200">
          <button type="button" onClick={copiarFicha} className={`${boton} ${copiado ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-slate-800 hover:bg-slate-50'}`}>
            {copiado ? <Check className="size-5" /> : <Copy className="size-5" />} {copiado ? '¡Ficha copiada! Pégala en WhatsApp o redes' : 'Generar ficha para WhatsApp / Redes Sociales'}
          </button>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap border-t border-slate-100 bg-slate-50 p-3 font-sans text-xs text-slate-600">{texto}</pre>
          <button type="button" onClick={() => setMarketing(true)} className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">
            <Share2 className="size-3.5" /> Más formatos: Instagram, Facebook e imagen para publicar
          </button>
        </div>

        {waUrl ? (
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className={`${boton} bg-emerald-500 text-white hover:bg-emerald-600`}>
            <MessageCircle className="size-5" /> Enviar enlace de bienvenida por WhatsApp al propietario
          </a>
        ) : (
          <button type="button" onClick={enviarBienvenida} disabled={enviando} className={`${boton} bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-60`}>
            {enviando ? <Loader2 className="size-5 animate-spin" /> : <MessageCircle className="size-5" />} Enviar enlace de bienvenida por WhatsApp al propietario
          </button>
        )}
        {mensaje && <p className="text-center text-sm text-amber-700">{mensaje}</p>}
      </div>

      <div className="mt-6 flex justify-center gap-3 text-sm">
        <button type="button" onClick={onOtra} className="flex items-center gap-1 font-semibold text-brand-700 hover:underline"><Plus className="size-4" /> Publicar otra</button>
        <span className="text-slate-300">·</span>
        <button type="button" onClick={onCerrar} className="font-semibold text-slate-500 hover:underline">Cerrar</button>
      </div>

      {marketing && <MarketingModal propiedad={p} onClose={() => setMarketing(false)} />}
    </div>
  );
}
