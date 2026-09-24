import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, ShieldCheck, HardDrive, Images, DatabaseBackup, Download, RotateCcw, UploadCloud, TriangleAlert, X, CircleCheck, FileArchive, Database,
} from 'lucide-react';
import { adminApi } from '../../lib/api';

const TIPO = {
  auto: { label: 'Automático', clase: 'bg-sky-100 text-sky-800 ring-sky-200' },
  manual: { label: 'Manual', clase: 'bg-brand-100 text-brand-800 ring-brand-200' },
  prerestauracion: { label: 'Antes de restaurar', clase: 'bg-amber-100 text-amber-800 ring-amber-200' },
};
const CONFIRMACION = 'RESTAURAR';
const fmtFecha = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 'YYYY-MM-DD HH:mm:ss' (hora de Chile, del servidor) -> texto legible */
function fecha(s) {
  if (!s) return '—';
  const [d, t] = s.split(' ');
  const [y, m, dd] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return fmtFecha.format(new Date(y, m - 1, dd, h, mi));
}

export function formatBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  const unidades = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString('es-CL', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unidades[i]}`;
}

function Tarjeta({ titulo, valor, detalle, Icono, tono }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{titulo}</p>
        <span className={`grid size-8 place-items-center rounded-lg ${tono}`}><Icono className="size-4" /></span>
      </div>
      <p className="mt-2 text-xl font-extrabold text-slate-800">{valor}</p>
      <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>
    </div>
  );
}

/** Advertencia y confirmación escrita antes de restaurar (un respaldo guardado o un archivo subido). */
function ConfirmarRestauracion({ origen, onClose, onRestaurado }) {
  const r = origen.respaldo;
  const archivo = origen.archivo;
  const esZip = archivo && /\.zip$/i.test(archivo.name);
  const [conDb, setConDb] = useState(Boolean(r?.db));
  const [conImagenes, setConImagenes] = useState(Boolean(r?.imagenes));
  const [texto, setTexto] = useState('');
  const [restaurando, setRestaurando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && !restaurando && onClose();
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [onClose, restaurando]);

  const afectaDb = archivo ? !esZip : conDb;
  const afectaImagenes = archivo ? esZip : conImagenes;
  const listo = texto.trim().toUpperCase() === CONFIRMACION && (afectaDb || afectaImagenes);

  const restaurar = async (e) => {
    e.preventDefault();
    setRestaurando(true);
    setError(null);
    try {
      const resultado = archivo
        ? await adminApi.restaurarDesdeArchivo(archivo, CONFIRMACION)
        : await adminApi.restaurarRespaldo({ id: r.id, db: conDb, imagenes: conImagenes, confirmar: CONFIRMACION });
      onRestaurado(resultado);
    } catch (err) {
      setError(err.message);
      setRestaurando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 sm:items-center sm:p-4" onClick={() => !restaurando && onClose()}>
      <form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-restaurar"
        aria-describedby="detalle-restaurar"
        onSubmit={restaurar}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 bg-rose-50 p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600"><TriangleAlert className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="titulo-restaurar" className="font-bold text-rose-900">¿Restaurar este respaldo?</h2>
            <p className="truncate text-sm text-rose-800">{archivo ? archivo.name : `${TIPO[r.tipo].label} · ${fecha(r.fecha)}`}</p>
          </div>
          <button type="button" disabled={restaurando} onClick={onClose} className="rounded-full p-1.5 text-rose-400 hover:bg-rose-100" aria-label="Cerrar"><X className="size-5" /></button>
        </div>

        <div id="detalle-restaurar" className="space-y-4 p-5 text-sm">
          {r && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-semibold text-slate-600">Qué restaurar</legend>
              <label className={`flex items-center gap-2 ${r.db ? '' : 'opacity-50'}`}>
                <input type="checkbox" checked={conDb} disabled={!r.db} onChange={(e) => setConDb(e.target.checked)} className="accent-rose-600" />
                <Database className="size-4 text-slate-500" /> Base de datos <span className="text-slate-400">({formatBytes(r.db?.bytes)})</span>
              </label>
              <label className={`flex items-center gap-2 ${r.imagenes ? '' : 'opacity-50'}`}>
                <input type="checkbox" checked={conImagenes} disabled={!r.imagenes} onChange={(e) => setConImagenes(e.target.checked)} className="accent-rose-600" />
                <Images className="size-4 text-slate-500" /> Imágenes {r.imagenes ? <span className="text-slate-400">({formatBytes(r.imagenes.bytes)})</span> : <span className="text-slate-400">(este respaldo no tiene)</span>}
              </label>
            </fieldset>
          )}

          <ul className="list-disc space-y-1 pl-5 text-slate-700">
            {afectaDb && <li>Se <b>reemplazarán todos los datos actuales</b>: propiedades, reservas, clientes, visitas, agenda y liquidaciones. Lo registrado después de este respaldo se perderá.</li>}
            {afectaImagenes && <li>Se <b>reemplazará la carpeta de imágenes</b> del servidor por la del respaldo.</li>}
            <li>Antes se guarda automáticamente una copia del estado actual (tipo «Antes de restaurar»), por si necesitas volver atrás.</li>
            {afectaDb && <li className="text-slate-500">La conexión con Mercado Libre no se modifica.</li>}
          </ul>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Para confirmar, escribe <span className="font-mono text-rose-700">{CONFIRMACION}</span></span>
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-rose-500"
            />
          </label>
          {error && <p className="rounded-lg bg-rose-50 p-3 text-rose-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
          <button type="button" disabled={restaurando} onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">Cancelar</button>
          <button disabled={!listo || restaurando} className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40">
            {restaurando ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Restaurar ahora
          </button>
        </div>
      </form>
    </div>
  );
}

function ZonaCarga({ onArchivo }) {
  const [encima, setEncima] = useState(false);
  const input = useRef(null);
  const [error, setError] = useState(null);

  const elegir = (archivo) => {
    if (!archivo) return;
    if (!/\.(sqlite|db|zip)$/i.test(archivo.name)) {
      setError('Sube un respaldo .sqlite (base de datos) o .zip (imágenes).');
      return;
    }
    setError(null);
    onArchivo(archivo);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); elegir(e.dataTransfer.files?.[0]); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${encima ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'}`}
      >
        <UploadCloud className={`size-9 ${encima ? 'text-brand-600' : 'text-slate-400'}`} />
        <p className="font-semibold text-slate-700">Arrastra aquí un archivo de respaldo o haz clic para elegirlo</p>
        <p className="text-xs text-slate-500"><b>.sqlite</b> restaura la base de datos · <b>.zip</b> restaura las imágenes</p>
        <input
          ref={input}
          type="file"
          accept=".sqlite,.db,.zip"
          className="hidden"
          onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

export default function Respaldos({ onError, onCambio }) {
  const [datos, setDatos] = useState(null);
  const [conImagenes, setConImagenes] = useState(true);
  const [creando, setCreando] = useState(false);
  const [descargando, setDescargando] = useState(null);
  const [restaurar, setRestaurar] = useState(null); // { respaldo } | { archivo }
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(() => {
    adminApi.respaldos().then(setDatos).catch(onError);
  }, [onError]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async () => {
    setCreando(true);
    try {
      const r = await adminApi.crearRespaldo(conImagenes);
      setAviso({ tipo: 'ok', texto: `Respaldo creado: base de datos (${formatBytes(r.db.bytes)})${r.imagenes ? ` + ${r.archivos_imagenes} imágenes (${formatBytes(r.imagenes.bytes)})` : ''}.` });
      cargar();
    } catch (err) {
      onError(err);
    } finally {
      setCreando(false);
    }
  };

  const descargar = async (archivo) => {
    setDescargando(archivo);
    try {
      await adminApi.descargarRespaldo(archivo);
    } catch (err) {
      onError(err);
    } finally {
      setDescargando(null);
    }
  };

  const alRestaurar = (resultado) => {
    setRestaurar(null);
    const partes = [];
    if (resultado.base_datos) {
      const b = resultado.base_datos;
      partes.push(`base de datos (${b.propiedades ?? 0} propiedades, ${b.reservas ?? 0} reservas)`);
    }
    if (resultado.imagenes) partes.push(`${resultado.imagenes.archivos} imágenes`);
    setAviso({ tipo: 'ok', texto: `Restauración completa: ${partes.join(' y ')}. El estado anterior quedó guardado como «Antes de restaurar».` });
    cargar();
    onCambio?.();
  };

  if (!datos) return <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-brand-600" /></div>;
  const { estado: e, respaldos } = datos;
  const hayImagenes = e.imagenes.archivos > 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Tarjeta
          titulo="Último respaldo automático"
          valor={e.ultimo_auto ? fecha(e.ultimo_auto) : 'Aún no hay'}
          detalle={e.auto_habilitado ? `Próximo: ${fecha(`${e.proximo_auto}:00`)} · al iniciar el servidor` : 'Respaldo automático desactivado (BACKUP_AUTO=false)'}
          Icono={ShieldCheck}
          tono={e.ultimo_auto ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}
        />
        <Tarjeta
          titulo="Espacio utilizado"
          valor={formatBytes(e.total_bytes)}
          detalle={`${e.cantidad} respaldos · se conservan los últimos ${e.conservar} automáticos`}
          Icono={HardDrive}
          tono="bg-sky-100 text-sky-700"
        />
        <Tarjeta
          titulo="Imágenes en el servidor"
          valor={hayImagenes ? `${e.imagenes.archivos} archivos · ${formatBytes(e.imagenes.bytes)}` : 'Sin imágenes locales'}
          detalle={hayImagenes ? 'Se comprimen en ZIP en cada respaldo' : 'Las fotos actuales son enlaces externos y se respaldan dentro de la base de datos'}
          Icono={Images}
          tono="bg-violet-100 text-violet-700"
        />
      </div>

      {/* Respaldo manual */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-br from-brand-800 to-brand-950 p-6 text-white shadow-sm">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 text-lg font-bold"><DatabaseBackup className="size-5" /> Seguridad y respaldos</h2>
          <p className="mt-1 text-sm text-brand-100">
            Copia de propiedades, clientes, reservas, visitas, agenda y liquidaciones. Descárgala a tu PC de vez en cuando:
            si el servidor falla, los respaldos guardados en él también se pierden.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <button
            onClick={crear}
            disabled={creando}
            className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-brand-800 shadow hover:bg-brand-50 disabled:opacity-60"
          >
            {creando ? <Loader2 className="size-5 animate-spin" /> : <DatabaseBackup className="size-5" />} Generar backup ahora
          </button>
          <label className={`flex items-center gap-2 text-sm ${hayImagenes ? 'text-brand-100' : 'text-brand-300'}`} title={hayImagenes ? undefined : 'No hay imágenes subidas al servidor'}>
            <input type="checkbox" checked={conImagenes && hayImagenes} disabled={!hayImagenes} onChange={(ev) => setConImagenes(ev.target.checked)} className="accent-white" />
            Incluir imágenes (ZIP)
          </label>
        </div>
      </section>

      {aviso && (
        <p role="status" className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <span className="flex items-center gap-2"><CircleCheck className="size-4 shrink-0" /> {aviso.texto}</span>
          <button onClick={() => setAviso(null)} aria-label="Cerrar"><X className="size-4" /></button>
        </p>
      )}

      {/* Historial */}
      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-200 p-4">
          <h3 className="font-bold text-slate-800">Historial de respaldos</h3>
          <p className="text-xs text-slate-500">Guardados en el servidor, en la carpeta <code>backups</code> (excluida de git).</p>
        </div>
        {respaldos.length === 0 ? (
          <p className="p-10 text-center text-slate-500">Aún no hay respaldos. Genera el primero con el botón de arriba.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Base de datos</th>
                  <th className="px-4 py-3 text-right">Imágenes</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {respaldos.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{fecha(r.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ring-1 ${TIPO[r.tipo].clase}`}>{TIPO[r.tipo].label}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">{formatBytes(r.db?.bytes)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">{r.imagenes ? formatBytes(r.imagenes.bytes) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {[r.db && ['db', r.db.archivo, Database, 'Base de datos'], r.imagenes && ['img', r.imagenes.archivo, FileArchive, 'Imágenes']].filter(Boolean).map(([k, archivo, Icono, label]) => (
                          <button
                            key={k}
                            onClick={() => descargar(archivo)}
                            disabled={descargando === archivo}
                            title={`Descargar a mi PC: ${archivo}`}
                            className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {descargando === archivo ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                            <Icono className="size-3.5 text-slate-400" /> {label}
                          </button>
                        ))}
                        <button
                          onClick={() => setRestaurar({ respaldo: r })}
                          className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"
                        >
                          <RotateCcw className="size-3.5" /> Restaurar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Restaurar desde el PC */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h3 className="font-bold text-slate-800">Restaurar desde un archivo de tu PC</h3>
        <p className="mb-3 text-xs text-slate-500">Usa un archivo descargado antes desde esta pantalla. Te pediremos confirmación antes de sobrescribir nada.</p>
        <ZonaCarga onArchivo={(archivo) => setRestaurar({ archivo })} />
      </section>

      {restaurar && <ConfirmarRestauracion origen={restaurar} onClose={() => setRestaurar(null)} onRestaurado={alRestaurar} />}
    </div>
  );
}
