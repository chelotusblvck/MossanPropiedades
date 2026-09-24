import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Wallet, Sparkles, Percent, HandCoins, Download, Printer, CircleCheck, Undo2, Banknote, X, Paperclip } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { formatCLP } from '../../lib/format';
import { aISO, hoyISO, fechaCorta } from '../../lib/fechas';
import { descargarCSVLiquidaciones, imprimirLiquidacion, formatPct, fechaDocumento } from '../../lib/liquidacion';
import Segmentado from './Segmentado';

const SIN_PROPIETARIO = '__sin__';
const campo = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500';

function rangoMes(desplazamiento) {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento, 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento + 1, 0);
  return { desde: aISO(inicio), hasta: aISO(fin) };
}

const fmtMes = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
const nombreMes = (desplazamiento) => {
  const hoy = new Date();
  return fmtMes.format(new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento, 1));
};

function Tarjeta({ titulo, valor, detalle, Icono, tono }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{titulo}</p>
        <span className={`grid size-8 place-items-center rounded-lg ${tono}`}><Icono className="size-4" /></span>
      </div>
      <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-800 xl:text-3xl">{valor}</p>
      <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>
    </div>
  );
}

const TIPOS_COMPROBANTE = 'application/pdf,image/jpeg,image/png,image/webp';

/** Ver o adjuntar el comprobante bancario de una transferencia (se muestra también al propietario). */
function ComprobanteArchivo({ fila: f, onError, onCambio }) {
  const [subiendo, setSubiendo] = useState(false);
  const subir = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      await adminApi.adjuntarComprobante(f.lote, archivo);
      onCambio();
    } catch (err) {
      onError(err);
    } finally {
      setSubiendo(false);
    }
  };
  if (f.comprobante_archivo) {
    return (
      <button onClick={() => adminApi.descargarComprobante(f.lote).catch(onError)} title={f.comprobante_archivo} className="flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline">
        <Paperclip className="size-3" /> Ver comprobante
      </button>
    );
  }
  return (
    <label className="flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-brand-700">
      {subiendo ? <Loader2 className="size-3 animate-spin" /> : <Paperclip className="size-3" />} Adjuntar comprobante
      <input type="file" accept={TIPOS_COMPROBANTE} className="sr-only" disabled={subiendo} onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

function EstadoLiquidacion({ fila: f, onLiquidar, onDeshacer, onError, onCambio }) {
  const [confirmando, setConfirmando] = useState(false);
  if (f.estado === 'pendiente') {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase text-amber-800 ring-1 ring-amber-200">Pendiente</span>
        <button onClick={() => onLiquidar([f])} className="flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
          <Banknote className="size-3.5" /> Marcar transferido
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase text-emerald-800 ring-1 ring-emerald-200">
        <CircleCheck className="size-3" /> Transferido
      </span>
      <p className="text-[11px] text-slate-500" title={f.liquidacion_notas ?? undefined}>
        {fechaCorta(f.fecha_transferencia)}{f.comprobante && <> · comp. <span className="font-medium text-slate-700">{f.comprobante}</span></>}
      </p>
      <ComprobanteArchivo fila={f} onError={onError} onCambio={onCambio} />
      {confirmando ? (
        <span className="flex items-center gap-1 text-[11px]">
          ¿Volver a pendiente?
          <button onClick={() => onDeshacer(f)} className="font-semibold text-rose-600 hover:underline">Sí</button>
          <button onClick={() => setConfirmando(false)} className="font-semibold text-slate-500 hover:underline">No</button>
        </span>
      ) : (
        <button onClick={() => setConfirmando(true)} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600">
          <Undo2 className="size-3" /> Deshacer
        </button>
      )}
    </div>
  );
}

/** Registro de la transferencia al propietario (una o varias reservas en una sola transferencia). */
function LiquidarModal({ filas, ivaPct, onClose, onGuardado }) {
  const unica = filas.length === 1 ? filas[0] : null;
  const [fecha, setFecha] = useState(hoyISO());
  const [comprobante, setComprobante] = useState('');
  const [notas, setNotas] = useState('');
  const [aseo, setAseo] = useState(String(unica?.aseo_clp ?? ''));
  const [comision, setComision] = useState(String(unica?.comision_clp ?? ''));
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [onClose]);

  // Mismo cálculo del IVA que el servidor
  const iva = Math.round(((Number(comision) || 0) * ivaPct) / 100);
  const neto = unica
    ? unica.bruto_clp - (Number(aseo) || 0) - (Number(comision) || 0) - iva
    : filas.reduce((a, f) => a + f.neto_clp, 0);
  // Una transferencia es de un solo propietario (el servidor también lo exige: cada uno la ve en su portal)
  const propietarios = [...new Map(filas.map((f) => [f.propietario_rut ?? `n:${(f.propietario_nombre ?? '').trim().toLowerCase()}`, f.propietario_nombre || 'Sin propietario'])).values()];
  const cuenta = propietarios.length === 1 ? filas[0].propietario_cuenta : null;

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    let lote;
    try {
      ({ lote } = await adminApi.liquidar({
        items: filas.map((f) => (unica ? { reserva_id: f.reserva_id, aseo_clp: Number(aseo) || 0, comision_clp: Number(comision) || 0 } : { reserva_id: f.reserva_id })),
        fecha_transferencia: fecha,
        comprobante: comprobante.trim() || null,
        notas: notas.trim() || null,
      }));
    } catch (err) {
      setError(err.message);
      setGuardando(false);
      return;
    }
    if (archivo) {
      try {
        await adminApi.adjuntarComprobante(lote, archivo);
      } catch (err) {
        // La transferencia ya quedó registrada: se avisa y se puede adjuntar después desde la tabla
        onGuardado(`La transferencia quedó registrada, pero el comprobante no se pudo adjuntar: ${err.message}`);
        return;
      }
    }
    onGuardado();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-liquidar"
        onSubmit={guardar}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <h2 id="titulo-liquidar" className="font-bold text-slate-800">Registrar transferencia al propietario</h2>
            <p className="truncate text-sm text-slate-500">
              {unica ? `Reserva #${unica.reserva_id} · ${unica.propiedad_titulo}` : `${filas.length} reservas · ${propietarios.join(', ')}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X className="size-5" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {propietarios.length > 1 && (
            <p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-800 ring-1 ring-rose-200">
              Seleccionaste reservas de {propietarios.length} propietarios distintos ({propietarios.join(', ')}). Registra una transferencia por propietario:
              cada uno ve la suya y su comprobante en el Portal de Propietarios.
            </p>
          )}

          {unica ? (
            <div className="rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200">
              <div className="flex justify-between"><span className="text-slate-600">Arriendo cobrado ({unica.noches} noches)</span><span className="font-semibold tabular-nums">{formatCLP(unica.bruto_clp)}</span></div>
              <label className="mt-3 flex items-center justify-between gap-3">
                <span className="text-slate-600">− Aseo</span>
                <input type="number" min={0} step={1} value={aseo} onChange={(e) => setAseo(e.target.value)} className={`${campo} w-32 text-right tabular-nums`} />
              </label>
              <label className="mt-2 flex items-center justify-between gap-3">
                <span className="text-slate-600">− Comisión neta <span className="text-xs text-slate-400">({formatPct(unica.comision_pct)} por defecto)</span></span>
                <input type="number" min={0} step={1} value={comision} onChange={(e) => setComision(e.target.value)} className={`${campo} w-32 text-right tabular-nums`} />
              </label>
              {ivaPct > 0 && (
                <div className="mt-2 flex justify-between">
                  <span className="text-slate-600">− IVA comisión ({formatPct(ivaPct)})</span>
                  <span className="tabular-nums text-slate-700">{formatCLP(iva)}</span>
                </div>
              )}
              <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-bold">
                <span>Neto a transferir</span>
                <span className={`tabular-nums ${neto < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatCLP(neto)}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 p-4 text-sm ring-1 ring-slate-200">
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {filas.map((f) => (
                  <li key={f.reserva_id} className="flex justify-between gap-3">
                    <span className="truncate text-slate-600">#{f.reserva_id} · {f.propiedad_titulo} · {fechaCorta(f.fecha_inicio)}</span>
                    <span className="tabular-nums">{formatCLP(f.neto_clp)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-bold">
                <span>Total a transferir</span><span className="tabular-nums text-emerald-700">{formatCLP(neto)}</span>
              </div>
            </div>
          )}

          {cuenta && <p className="text-xs text-slate-500"><span className="font-semibold text-slate-600">Cuenta del propietario:</span> {cuenta}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Fecha de la transferencia</span>
              <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${campo} w-full`} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">N° de comprobante / operación</span>
              <input value={comprobante} onChange={(e) => setComprobante(e.target.value)} maxLength={120} className={`${campo} w-full`} placeholder="Ej. 000123456" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Notas (opcional)</span>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} className={`${campo} w-full`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Comprobante bancario (opcional · PDF o imagen, máx. 10 MB)</span>
            <input
              type="file"
              accept={TIPOS_COMPROBANTE}
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
            <span className="mt-0.5 block text-[11px] text-slate-400">El propietario lo verá y podrá descargarlo en su portal.</span>
          </label>
        </div>

        {error && <p className="mx-5 mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">Cancelar</button>
          <button disabled={guardando || neto < 0 || propietarios.length > 1} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <CircleCheck className="size-4" />} Marcar como transferido
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Finanzas({ onError }) {
  const [periodo, setPeriodo] = useState('actual');
  const [personalizado, setPersonalizado] = useState(() => rangoMes(0));
  const [propiedadId, setPropiedadId] = useState('');
  const [propietario, setPropietario] = useState('');
  const [estado, setEstado] = useState('');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [liquidando, setLiquidando] = useState(null); // filas a liquidar
  const [aviso, setAviso] = useState(null);

  const rango = periodo === 'actual' ? rangoMes(0) : periodo === 'anterior' ? rangoMes(-1) : personalizado;
  const rangoValido = rango.desde && rango.hasta && rango.hasta >= rango.desde;

  const cargar = useCallback(() => {
    if (!rangoValido) return;
    setCargando(true);
    adminApi
      .finanzas({ desde: rango.desde, hasta: rango.hasta, propiedad_id: propiedadId, propietario, estado })
      .then((d) => {
        setDatos(d);
        // La selección sólo conserva reservas pendientes que siguen visibles
        setSeleccion((s) => new Set(d.filas.filter((f) => f.estado === 'pendiente' && s.has(f.reserva_id)).map((f) => f.reserva_id)));
      })
      .catch(onError)
      .finally(() => setCargando(false));
  }, [rango.desde, rango.hasta, rangoValido, propiedadId, propietario, estado, onError]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const filas = datos?.filas ?? [];
  const pendientes = filas.filter((f) => f.estado === 'pendiente');
  const seleccionadas = filas.filter((f) => seleccion.has(f.reserva_id));
  const todasMarcadas = pendientes.length > 0 && pendientes.every((f) => seleccion.has(f.reserva_id));
  const r = datos?.resumen;

  // Propiedades del filtro: si hay propietario elegido, sólo las suyas
  const propiedadesFiltro = useMemo(() => (datos?.propiedades ?? []).filter((p) => {
    if (!propietario) return true;
    if (propietario === SIN_PROPIETARIO) return !p.propietario_nombre?.trim();
    return p.propietario_nombre?.trim().toLowerCase() === propietario.toLowerCase();
  }), [datos?.propiedades, propietario]);

  const alternar = (id) => setSeleccion((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const deshacer = async (f) => {
    try {
      await adminApi.deshacerLiquidacion(f.reserva_id);
      setAviso(`Reserva #${f.reserva_id} volvió a "pendiente de pago al propietario".`);
      cargar();
    } catch (err) {
      onError(err);
    }
  };

  const imprimir = () => {
    if (!imprimirLiquidacion(filas, rango.desde, rango.hasta)) {
      onError(new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.'));
    }
  };

  const etiquetaPeriodo = periodo === 'actual' ? nombreMes(0) : periodo === 'anterior' ? nombreMes(-1)
    : rangoValido ? `${fechaDocumento(rango.desde)} – ${fechaDocumento(rango.hasta)}` : 'rango inválido';

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">Finanzas · Liquidaciones</h2>
            <p className="text-xs text-slate-500">
              Arriendo diario · reservas pagadas con check-in en <span className="font-semibold capitalize text-slate-700">{etiquetaPeriodo}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => descargarCSVLiquidaciones(filas, rango.desde, rango.hasta)}
              disabled={!filas.length}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
            >
              <Download className="size-4" /> Excel / CSV
            </button>
            <button
              onClick={imprimir}
              disabled={!filas.length}
              title="Una hoja por propietario. Usa «Guardar como PDF» para enviarla."
              className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-40"
            >
              <Printer className="size-4" /> Liquidación PDF
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Segmentado
            etiqueta="Período"
            valor={periodo}
            onCambiar={setPeriodo}
            opciones={[['actual', 'Mes actual'], ['anterior', 'Mes anterior'], ['personalizado', 'Personalizado']]}
          />
          {periodo === 'personalizado' && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <input type="date" aria-label="Desde" value={personalizado.desde} onChange={(e) => setPersonalizado((x) => ({ ...x, desde: e.target.value }))} className={campo} />
              –
              <input type="date" aria-label="Hasta" value={personalizado.hasta} min={personalizado.desde} onChange={(e) => setPersonalizado((x) => ({ ...x, hasta: e.target.value }))} className={campo} />
            </div>
          )}
          <select
            aria-label="Propietario"
            value={propietario}
            onChange={(e) => { setPropietario(e.target.value); setPropiedadId(''); }}
            className={campo}
          >
            <option value="">Todos los propietarios</option>
            {datos?.propietarios.map((n) => <option key={n} value={n}>{n}</option>)}
            <option value={SIN_PROPIETARIO}>Sin propietario registrado</option>
          </select>
          <select aria-label="Propiedad" value={propiedadId} onChange={(e) => setPropiedadId(e.target.value)} className={`${campo} max-w-64`}>
            <option value="">Todas las propiedades</option>
            {propiedadesFiltro.map((p) => <option key={p.id} value={p.id}>{p.titulo}</option>)}
          </select>
          <Segmentado
            etiqueta="Estado de liquidación"
            valor={estado}
            onCambiar={setEstado}
            opciones={[['', 'Todas'], ['pendiente', 'Pendientes de pago'], ['liquidada', 'Pagadas']]}
          />
          {cargando && <Loader2 className="size-4 animate-spin text-brand-600" />}
        </div>
        {!rangoValido && <p className="mt-2 text-sm text-rose-600">La fecha final debe ser igual o posterior a la inicial.</p>}
      </section>

      {!datos ? (
        <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-brand-600" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tarjeta titulo="Total cobrado" valor={formatCLP(r.bruto_clp)} detalle={`${r.reservas} reservas · ${r.noches} noches`} Icono={Wallet} tono="bg-sky-100 text-sky-700" />
            <Tarjeta titulo="Total aseo" valor={formatCLP(r.aseo_clp)} detalle="Descontado a propietarios" Icono={Sparkles} tono="bg-violet-100 text-violet-700" />
            <Tarjeta
              titulo={datos.iva_pct ? 'Comisión corredora + IVA' : 'Comisión corredora'}
              valor={formatCLP(r.comision_clp + r.iva_clp)}
              detalle={datos.iva_pct ? `Neta ${formatCLP(r.comision_clp)} · IVA ${formatCLP(r.iva_clp)}` : `Por defecto ${formatPct(datos.comision_defecto_pct)}`}
              Icono={Percent}
              tono="bg-brand-100 text-brand-700"
            />
            <Tarjeta
              titulo="Total a liquidar"
              valor={formatCLP(r.neto_clp)}
              detalle={`${formatCLP(r.neto_pendiente_clp)} pendiente · ${formatCLP(r.neto_liquidado_clp)} transferido`}
              Icono={HandCoins}
              tono="bg-emerald-100 text-emerald-700"
            />
          </div>

          {/* Desglose */}
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <h3 className="font-bold text-slate-800">Desglose por reserva</h3>
              {seleccionadas.length > 0 ? (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-slate-600">
                    {seleccionadas.length} seleccionadas · <span className="font-bold tabular-nums text-slate-800">{formatCLP(seleccionadas.reduce((a, f) => a + f.neto_clp, 0))}</span>
                  </span>
                  <button onClick={() => setSeleccion(new Set())} className="text-slate-500 hover:underline">Quitar selección</button>
                  <button onClick={() => setLiquidando(seleccionadas)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700">
                    <Banknote className="size-4" /> Marcar como transferidas
                  </button>
                </div>
              ) : (
                pendientes.length > 0 && <p className="text-xs text-slate-500">Selecciona varias reservas para registrar una sola transferencia.</p>
              )}
            </div>

            {aviso && <p role="status" className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{aviso}</p>}

            {filas.length === 0 ? (
              <p className="p-10 text-center text-slate-500">No hay reservas pagadas con estos filtros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todas las pendientes"
                          checked={todasMarcadas}
                          disabled={!pendientes.length}
                          onChange={() => setSeleccion(todasMarcadas ? new Set() : new Set(pendientes.map((f) => f.reserva_id)))}
                          className="accent-brand-600"
                        />
                      </th>
                      <th className="px-4 py-3">Propiedad · propietario</th>
                      <th className="px-4 py-3">Estadía</th>
                      <th className="px-4 py-3 text-right">Ingreso bruto</th>
                      <th className="px-4 py-3 text-right">Aseo</th>
                      <th className="px-4 py-3 text-right">{datos.iva_pct ? 'Comisión + IVA' : 'Comisión'}</th>
                      <th className="px-4 py-3 text-right">Neto propietario</th>
                      <th className="px-4 py-3">Liquidación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filas.map((f) => (
                      <tr key={f.reserva_id} className={`align-top ${seleccion.has(f.reserva_id) ? 'bg-brand-50/50' : ''}`}>
                        <td className="px-4 py-3">
                          {f.estado === 'pendiente' && (
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar reserva ${f.reserva_id}`}
                              checked={seleccion.has(f.reserva_id)}
                              onChange={() => alternar(f.reserva_id)}
                              className="accent-brand-600"
                            />
                          )}
                        </td>
                        <td className="max-w-64 px-4 py-3">
                          <p className="truncate font-medium text-slate-800" title={f.propiedad_titulo}>{f.propiedad_titulo}</p>
                          <p className="text-xs text-slate-500">
                            {f.propietario_nombre || <span className="italic text-amber-700">Sin propietario</span>} · #{f.reserva_id} {f.cliente_nombre}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {fechaCorta(f.fecha_inicio)} → {fechaCorta(f.fecha_fin)}
                          <p className="text-xs text-slate-500">{f.noches} {f.noches === 1 ? 'noche' : 'noches'}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatCLP(f.bruto_clp)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">{f.aseo_clp ? `−${formatCLP(f.aseo_clp)}` : '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                          {f.comision_clp ? `−${formatCLP(f.comision_clp + f.iva_clp)}` : '—'}
                          <p className="text-[11px] text-slate-400">
                            {formatPct(f.comision_pct)}{f.iva_clp > 0 && ` · IVA ${formatCLP(f.iva_clp)}`}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-slate-800">{formatCLP(f.neto_clp)}</td>
                        <td className="px-4 py-3"><EstadoLiquidacion fila={f} onLiquidar={setLiquidando} onDeshacer={deshacer} onError={onError} onCambio={cargar} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-800">
                    <tr>
                      <td />
                      <td className="px-4 py-3" colSpan={2}>Totales · {r.reservas} reservas</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCLP(r.bruto_clp)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCLP(r.aseo_clp)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCLP(r.comision_clp + r.iva_clp)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{formatCLP(r.neto_clp)}</td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-500">{r.pendientes} pendientes</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              Neto = arriendo cobrado − aseo − comisión{datos.iva_pct ? ` − IVA de la comisión (${formatPct(datos.iva_pct)})` : ''}. El aseo y la comisión se configuran por propiedad en «Editar ficha» (comisión por defecto {formatPct(datos.comision_defecto_pct)}).
              Al marcar una reserva como transferida sus montos quedan fijos.
            </p>
          </section>
        </>
      )}

      {liquidando && (
        <LiquidarModal
          filas={liquidando}
          ivaPct={datos?.iva_pct ?? 0}
          onClose={() => setLiquidando(null)}
          onGuardado={(advertencia) => {
            setAviso(advertencia ?? (liquidando.length === 1 ? `Reserva #${liquidando[0].reserva_id} marcada como transferida.` : `${liquidando.length} reservas marcadas como transferidas.`));
            setLiquidando(null);
            setSeleccion(new Set());
            cargar();
          }}
        />
      )}
    </div>
  );
}
