import { useRef, useState } from 'react';
import {
  FileArchive, Loader2, Wand2, Download, FileText, RotateCcw, AlertTriangle, CheckCircle2, Palette, Type, ImageIcon, Info, Building2, Star,
} from 'lucide-react';
import { setupApi } from '../../lib/api';
import { escala, contraste, esHex, variablesTema, sugerirColores, cargarFuente, TEMA_POR_DEFECTO, EJEMPLO_TEMA_JSON } from '../../lib/tema';
import { descargarBlob } from '../../lib/marketing';

const campo = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

/** Tema inicial del formulario a partir de lo guardado en el servidor. */
export function temaDesde(t) {
  return t
    ? { usar: true, id: t.id, nombre: t.nombre ?? '', primario: t.primario, acento: t.acento, logo_claro: t.logo_claro, favicon: t.favicon, fuente: t.fuente ?? { tipo: 'sistema' }, documentos: t.documentos ?? [], kit: null }
    : { usar: false, id: null, nombre: '', ...TEMA_POR_DEFECTO, logo_claro: null, favicon: null, fuente: { tipo: 'sistema' }, documentos: [], kit: null };
}

/** Lo que se envía al servidor (null = tema por defecto). */
export const temaParaGuardar = (t) => (t.usar
  ? { id: t.id, nombre: t.nombre, primario: t.primario, acento: t.acento, logo_claro: t.logo_claro, favicon: t.favicon, fuente: t.fuente }
  : null);

export function erroresTema(t) {
  if (!t.usar) return null;
  if (!esHex(t.primario) || !esHex(t.acento)) return 'Línea gráfica: los colores deben tener formato #RRGGBB';
  if (t.fuente?.tipo === 'google' && !/^[A-Za-z0-9 ]{2,40}$/.test(t.fuente.familia ?? '')) return 'Línea gráfica: escribe el nombre exacto de la fuente de Google (p. ej. Montserrat)';
  if (t.fuente?.tipo === 'archivos' && (!t.fuente.archivos?.length || !t.fuente.familia?.trim())) return 'Línea gráfica: la tipografía del kit necesita nombre y archivos';
  return null;
}

function Color({ etiqueta, valor, onCambio, ayuda }) {
  const [texto, setTexto] = useState(valor);
  if (esHex(valor) && valor !== texto && esHex(texto)) setTexto(valor);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{etiqueta}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={esHex(valor) ? valor : '#000000'} onChange={(e) => { setTexto(e.target.value); onCambio(e.target.value); }} className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" aria-label={etiqueta} />
        <input
          value={texto}
          onChange={(e) => { const v = e.target.value.trim(); setTexto(v); if (esHex(v)) onCambio(v.toLowerCase()); }}
          maxLength={7}
          className={`${campo} font-mono uppercase ${esHex(texto) ? '' : 'border-rose-300'}`}
        />
      </span>
      {ayuda && <span className="mt-1 block text-[11px] text-slate-500">{ayuda}</span>}
    </label>
  );
}

/** Selector de una imagen del kit (miniaturas) para un uso concreto. */
function ElegirImagen({ etiqueta, detalle, valor, opciones, onCambio, fondo = 'bg-white', ninguno = 'Ninguno' }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600">{etiqueta}</p>
      {detalle && <p className="text-[11px] text-slate-400">{detalle}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => onCambio(null)} aria-pressed={!valor} className={`grid h-16 w-20 place-items-center rounded-lg text-[11px] font-semibold ring-2 ${!valor ? 'text-brand-700 ring-brand-600' : 'text-slate-400 ring-slate-200 hover:ring-slate-300'}`}>{ninguno}</button>
        {opciones.map((a) => (
          <button key={a.url} type="button" onClick={() => onCambio(a.url)} aria-pressed={valor === a.url} title={a.ruta} className={`grid h-16 w-20 place-items-center overflow-hidden rounded-lg p-1.5 ring-2 ${fondo} ${valor === a.url ? 'ring-brand-600' : 'ring-slate-200 hover:ring-slate-300'}`}>
            <img src={a.url} alt={a.nombre} className="max-h-full max-w-full object-contain" />
          </button>
        ))}
        {valor && !opciones.some((a) => a.url === valor) && (
          <span className={`grid h-16 w-20 place-items-center overflow-hidden rounded-lg p-1.5 ring-2 ring-brand-600 ${fondo}`}><img src={valor} alt="" className="max-h-full max-w-full object-contain" /></span>
        )}
      </div>
    </div>
  );
}

/** Vista previa con las clases reales del sitio, con las variables del tema acotadas a este contenedor. */
function VistaPrevia({ t, logo, nombre }) {
  const vars = variablesTema(temaParaGuardar(t) ?? TEMA_POR_DEFECTO);
  return (
    <div style={{ ...vars, fontFamily: vars['--font-sans'] }} className="overflow-hidden rounded-xl ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 font-extrabold text-brand-900">
          {logo ? <img src={logo} alt="" className="size-8 object-contain" /> : <span className="grid size-8 place-items-center rounded-lg bg-brand-700 text-white"><Building2 className="size-4" /></span>}
          <span className="truncate text-sm">{nombre || 'Tu corredora'}</span>
        </span>
        <span className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white">Publica tu propiedad</span>
      </div>
      <div className="bg-gradient-to-br from-brand-900 to-brand-700 px-4 py-6 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-acento-300">Propiedades en todo Chile</p>
        <p className="mt-1 text-xl font-extrabold">Encuentra tu próximo hogar</p>
        <span className="mt-3 inline-flex rounded-lg bg-acento-500 px-4 py-2 text-sm font-bold text-acento-contraste">Buscar propiedades</span>
      </div>
      <div className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-2">
        <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-800">Arriendo diario</span>
          <p className="mt-2 text-sm font-bold text-slate-800">Depto con vista al mar</p>
          <p className="text-lg font-extrabold text-brand-900">$75.000 <span className="text-xs font-medium text-slate-500">/noche</span></p>
        </div>
        <div className="flex flex-col justify-center gap-2">
          <span className="rounded-lg bg-acento-500 py-2 text-center text-sm font-bold text-acento-contraste">Solicitar reserva</span>
          <span className="rounded-lg py-2 text-center text-sm font-semibold text-brand-700 ring-1 ring-brand-200">Ver detalles</span>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-brand-950 px-4 py-3 text-xs text-brand-100">
        {t.usar && t.logo_claro ? <img src={t.logo_claro} alt="" className="h-6 max-w-24 object-contain" /> : <Building2 className="size-4" />} © {nombre || 'Tu corredora'}
      </div>
    </div>
  );
}

export default function PasoLineaGrafica({ f, set }) {
  const t = f.tema;
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const [encima, setEncima] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const input = useRef(null);
  const actualizar = (cambios) => set('tema', { ...t, ...cambios });

  const imagenes = t.kit?.archivos.filter((a) => a.clase === 'imagen') ?? [];
  const fuentesKit = t.kit?.archivos.filter((a) => a.clase === 'fuente') ?? [];
  const documentos = t.kit ? t.kit.archivos.filter((a) => a.clase === 'documento').map((a) => ({ archivo: a.archivo, nombre: a.nombre })) : t.documentos;
  const { tonos, ajustado } = escala(esHex(t.primario) ? t.primario : TEMA_POR_DEFECTO.primario);
  const contrasteAcento = esHex(t.acento) ? Math.max(contraste(t.acento, '#ffffff'), contraste(t.acento, tonos[950])) : 21;

  const sugerir = async (logo = f.corredora.logo) => {
    if (!logo) return;
    setSugiriendo(true);
    const s = await sugerirColores(logo);
    setSugiriendo(false);
    return s;
  };

  const subir = async (archivo) => {
    if (!archivo) return;
    if (!/\.zip$/i.test(archivo.name)) return setError('Sube el kit en formato .zip');
    if (archivo.size > 50 * 1024 * 1024) return setError('El ZIP no puede pesar más de 50 MB');
    setSubiendo(true);
    setError(null);
    try {
      const kit = await setupApi.subirKitTema(archivo);
      const p = kit.propuesta;
      const fuentes = kit.archivos.filter((a) => a.clase === 'fuente');
      let colores = { primario: p.primario ?? t.primario, acento: p.acento ?? t.acento };
      // Sin colores en tema.json: se proponen a partir del logo
      if ((!p.primario || !p.acento) && p.logo) {
        const s = await sugerirColores(p.logo);
        if (s) colores = { primario: p.primario ?? s.primario ?? colores.primario, acento: p.acento ?? s.acento ?? colores.acento };
      }
      const fuente = p.fuente?.tipo === 'google'
        ? { tipo: 'google', familia: p.fuente.familia }
        : fuentes.length
          ? { tipo: 'archivos', familia: p.fuente?.familia ?? fuentes[0].familia, archivos: fuentes }
          : { tipo: 'sistema' };
      if (fuente.tipo === 'archivos') cargarFuente(fuente); // para la vista previa
      set('tema', {
        usar: true, id: kit.id, nombre: p.nombre ?? t.nombre ?? '', ...colores,
        logo_claro: p.logo_claro, favicon: p.favicon, fuente, documentos: [], kit,
      });
      if (p.logo) set('corredora', { ...f.corredora, logo: p.logo });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  };

  const restablecer = () => {
    set('tema', { ...temaDesde(null) });
    // El logo elegido del kit deja de existir al no usar el kit
    if (f.corredora.logo?.startsWith('/media/tema/')) set('corredora', { ...f.corredora, logo: null });
    cargarFuente(null);
  };

  const descargarEjemplo = () => descargarBlob(new Blob([JSON.stringify(EJEMPLO_TEMA_JSON, null, 2)], { type: 'application/json' }), 'tema.json');

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Sube el kit de marca que te entregó tu diseñador o agencia (un <b>.zip</b>) y aplicamos sus colores, logos y tipografía a todo el sitio, los correos y las liquidaciones.
        También puedes elegir los colores a mano.
      </p>

      {/* Zona de carga del ZIP */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !subiendo && input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); subir(e.dataTransfer.files?.[0]); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${encima ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'}`}
      >
        {subiendo ? <Loader2 className="size-9 animate-spin text-brand-600" /> : <FileArchive className={`size-9 ${encima ? 'text-brand-600' : 'text-slate-400'}`} />}
        <p className="font-semibold text-slate-700">{subiendo ? 'Procesando el kit…' : t.kit ? 'Subir otro kit (.zip)' : 'Arrastra aquí el ZIP de la línea gráfica o haz clic para elegirlo'}</p>
        <p className="text-xs text-slate-500">Logos (PNG, SVG, JPG, WEBP), favicon, fuentes (WOFF2, WOFF, TTF, OTF), manual de marca (PDF) · máx. 50 MB</p>
        <input ref={input} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {error && <p className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}</p>}

      <details className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-slate-700"><Info className="size-4" /> ¿Qué debe traer el ZIP?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Logos</b> exportados en PNG o SVG. Nombres que ayudan: <code>logo-color.png</code>, <code>logo-blanco.svg</code> (fondos oscuros), <code>favicon.png</code>.</li>
          <li><b>Tipografía</b> en .woff2 (ideal), .woff, .ttf u .otf, p. ej. <code>fuentes/Montserrat-Bold.woff2</code>.</li>
          <li><b>Manual de marca</b> en PDF (queda privado, sólo para el panel).</li>
          <li><b>tema.json</b> (opcional): indica exactamente colores, logos y tipografía. Sin él, detectamos todo por los nombres y proponemos los colores a partir del logo.</li>
          <li>Archivos de diseño (.ai, .psd, .eps, .indd) se ignoran: pídele a tu diseñador las versiones exportadas.</li>
        </ul>
        <button type="button" onClick={descargarEjemplo} className="mt-3 flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
          <Download className="size-3.5" /> Descargar tema.json de ejemplo
        </button>
      </details>

      {t.kit && (
        <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4" /> Kit procesado{t.kit.con_manifiesto ? ' con tema.json' : ' (detección automática)'}</p>
          <p className="mt-0.5">
            {imagenes.length} imágenes · {fuentesKit.length} archivos de fuente · {documentos.length} documentos
          </p>
          {t.kit.advertencias.map((a) => <p key={a} className="mt-1 flex items-start gap-1.5 text-amber-800"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {a}</p>)}
        </div>
      )}

      {!t.usar ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ring-1 ring-slate-200">
          <p className="text-sm text-slate-600">Se usa el <b>tema por defecto</b> del sitio.</p>
          <button type="button" onClick={() => actualizar({ usar: true })} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
            <Palette className="size-4" /> Elegir colores a mano
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-6">
            <section>
              <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800"><Palette className="size-4 text-brand-600" /> Colores</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Color
                  etiqueta="Principal"
                  valor={t.primario}
                  onCambio={(v) => actualizar({ primario: v })}
                  ayuda={ajustado ? `Es claro para botones con texto blanco: se usará ${tonos[700].toUpperCase()} en botones y encabezados.` : 'Encabezados, botones y enlaces'}
                />
                <Color
                  etiqueta="Acento"
                  valor={t.acento}
                  onCambio={(v) => actualizar({ acento: v })}
                  ayuda={contrasteAcento < 4.5 ? 'Poco contraste con cualquier texto: prueba un tono más claro u oscuro.' : 'Botones de acción: reservar, buscar, pagar'}
                />
              </div>
              <div className="mt-2 flex h-6 overflow-hidden rounded-md ring-1 ring-slate-200" aria-label="Escala generada">
                {Object.entries(tonos).map(([k, c]) => <span key={k} title={`${k}: ${c}`} className="flex-1" style={{ background: c }} />)}
              </div>
              {f.corredora.logo && (
                <button
                  type="button"
                  onClick={async () => { const s = await sugerir(); if (s) actualizar({ primario: s.primario ?? t.primario, acento: s.acento ?? t.acento }); else setError('No se encontraron colores en el logo (¿es blanco y negro?)'); }}
                  disabled={sugiriendo}
                  className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline disabled:opacity-50"
                >
                  {sugiriendo ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Sugerir colores desde el logo
                </button>
              )}
            </section>

            <section className="space-y-4">
              <h3 className="flex items-center gap-2 font-bold text-slate-800"><ImageIcon className="size-4 text-brand-600" /> Logos</h3>
              <ElegirImagen
                etiqueta="Logo principal"
                detalle="Encabezado del sitio, correos y liquidaciones (también se puede subir en el paso 1)"
                valor={f.corredora.logo}
                opciones={imagenes.filter((a) => a.formato !== 'ico')}
                onCambio={(v) => set('corredora', { ...f.corredora, logo: v })}
              />
              <ElegirImagen
                etiqueta="Logo para fondos oscuros"
                detalle="Pie de página (versión blanca o negativa)"
                valor={t.logo_claro}
                opciones={imagenes.filter((a) => a.formato !== 'ico')}
                onCambio={(v) => actualizar({ logo_claro: v })}
                fondo="bg-brand-950"
              />
              <ElegirImagen
                etiqueta="Favicon"
                detalle="Ícono de la pestaña del navegador (cuadrado)"
                valor={t.favicon}
                opciones={imagenes}
                onCambio={(v) => actualizar({ favicon: v })}
                ninguno="Por defecto"
              />
            </section>

            <section>
              <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800"><Type className="size-4 text-brand-600" /> Tipografía</h3>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="fuente" checked={t.fuente.tipo === 'sistema'} onChange={() => { actualizar({ fuente: { tipo: 'sistema' } }); cargarFuente(null); }} className="accent-brand-600" />
                  Por defecto del sitio (Inter / sistema)
                </label>
                {(fuentesKit.length > 0 || t.fuente.tipo === 'archivos') && (
                  <label className="flex flex-wrap items-center gap-2">
                    <input
                      type="radio"
                      name="fuente"
                      checked={t.fuente.tipo === 'archivos'}
                      onChange={() => {
                        const fuente = fuentesKit.length ? { tipo: 'archivos', familia: fuentesKit[0].familia, archivos: fuentesKit } : t.fuente;
                        actualizar({ fuente });
                        cargarFuente(fuente);
                      }}
                      className="accent-brand-600"
                    />
                    Del kit:
                    <input
                      value={t.fuente.tipo === 'archivos' ? t.fuente.familia : (fuentesKit[0]?.familia ?? '')}
                      disabled={t.fuente.tipo !== 'archivos'}
                      onChange={(e) => { const fuente = { ...t.fuente, familia: e.target.value }; actualizar({ fuente }); cargarFuente(fuente); }}
                      className={`${campo} w-48 disabled:bg-slate-50`}
                    />
                    <span className="text-xs text-slate-400">{(t.fuente.tipo === 'archivos' ? t.fuente.archivos : fuentesKit).length} archivo(s)</span>
                  </label>
                )}
                <label className="flex flex-wrap items-center gap-2">
                  <input type="radio" name="fuente" checked={t.fuente.tipo === 'google'} onChange={() => actualizar({ fuente: { tipo: 'google', familia: t.fuente.tipo === 'google' ? t.fuente.familia : '' } })} className="accent-brand-600" />
                  Google Fonts:
                  <input
                    value={t.fuente.tipo === 'google' ? t.fuente.familia : ''}
                    disabled={t.fuente.tipo !== 'google'}
                    onChange={(e) => actualizar({ fuente: { tipo: 'google', familia: e.target.value } })}
                    onBlur={() => t.fuente.tipo === 'google' && cargarFuente(t.fuente)}
                    placeholder="Montserrat"
                    className={`${campo} w-48 disabled:bg-slate-50`}
                  />
                </label>
              </div>
            </section>

            {documentos.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-2 font-bold text-slate-800"><FileText className="size-4 text-brand-600" /> Documentación de la marca</h3>
                <ul className="space-y-1.5">
                  {documentos.map((d) => (
                    <li key={d.archivo}>
                      <button type="button" onClick={() => setupApi.descargarDocumentoTema(t.id, d.archivo, d.nombre).catch((err) => setError(err.message))} className="flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
                        <Download className="size-4" /> {d.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-slate-400">Privado: sólo se descarga desde este asistente.</p>
              </section>
            )}
          </div>

          <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
            <h3 className="flex items-center gap-2 font-bold text-slate-800"><Star className="size-4 text-brand-600" /> Vista previa</h3>
            <VistaPrevia t={t} logo={f.corredora.logo} nombre={f.corredora.nombre} />
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Nombre de la línea gráfica (opcional)</span>
              <input value={t.nombre} onChange={(e) => actualizar({ nombre: e.target.value })} maxLength={80} className={campo} placeholder="Ej: Manual de marca 2026" />
            </label>
            <button type="button" onClick={restablecer} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-rose-600">
              <RotateCcw className="size-4" /> Volver al tema por defecto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
