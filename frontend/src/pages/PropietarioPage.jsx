import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import {
  Building2, LogOut, Loader2, Wallet, Percent, Landmark, Clock, CalendarRange, FileText, Paperclip, Home, X, AlertCircle, BedDouble, Bath,
} from 'lucide-react';
import { propietarioApi, haySesionPropietario, impersonacionActiva } from '../lib/api';
import { MARCA } from '../lib/marca';
import { formatCLP } from '../lib/format';
import { fechaCorta, deISO } from '../lib/fechas';
import { infoModalidad } from '../lib/modalidades';
import { imprimirLiquidacion, formatPct } from '../lib/liquidacion';
import CalendarioOcupacion from '../components/propietario/CalendarioOcupacion';

const fmtMes = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
const fmtFecha = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
const fechaCompleta = (s) => fmtFecha.format(deISO(s));

function Tarjeta({ titulo, valor, detalle, Icono, tono }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{titulo}</p>
        <span className={`grid size-9 place-items-center rounded-xl ${tono}`}><Icono className="size-4" /></span>
      </div>
      <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-800 sm:text-3xl">{valor}</p>
      <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>
    </div>
  );
}

function Seccion({ titulo, Icono, children, derecha }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><Icono className="size-5 text-brand-600" /> {titulo}</h2>
        {derecha}
      </div>
      {children}
    </section>
  );
}

function TablaLiquidaciones({ liquidaciones, ivaPct, onError }) {
  const [descargando, setDescargando] = useState(null);
  const verComprobante = async (lote) => {
    setDescargando(lote);
    try {
      await propietarioApi.descargarComprobante(lote);
    } catch (err) {
      onError(err);
    } finally {
      setDescargando(null);
    }
  };

  if (!liquidaciones.length) return <p className="py-6 text-center text-sm text-slate-500">Aún no hay liquidaciones transferidas.</p>;
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3">Transferencia</th>
            <th className="px-3 py-3">Período</th>
            <th className="px-3 py-3 text-right">Arriendo</th>
            <th className="px-3 py-3 text-right">Aseo</th>
            <th className="px-3 py-3 text-right">Comisión</th>
            {ivaPct > 0 && <th className="px-3 py-3 text-right">IVA</th>}
            <th className="px-3 py-3 text-right">Neto recibido</th>
            <th className="px-5 py-3 text-right">Documentos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {liquidaciones.map((l) => (
            <tr key={l.lote} className="align-top">
              <td className="whitespace-nowrap px-5 py-3">
                <p className="font-semibold text-slate-800">{fechaCompleta(l.fecha_transferencia)}</p>
                {l.comprobante && <p className="text-xs text-slate-500">Operación {l.comprobante}</p>}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                {fechaCorta(l.desde)} → {fechaCorta(l.hasta)}
                <p className="text-xs text-slate-400">{l.reservas} {l.reservas === 1 ? 'reserva' : 'reservas'} · {l.noches} noches</p>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatCLP(l.bruto_clp)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-600">{l.aseo_clp ? `−${formatCLP(l.aseo_clp)}` : '—'}</td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-600">{l.comision_clp ? `−${formatCLP(l.comision_clp)}` : '—'}</td>
              {ivaPct > 0 && <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-600">{l.iva_clp ? `−${formatCLP(l.iva_clp)}` : '—'}</td>}
              <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-emerald-700">{formatCLP(l.neto_clp)}</td>
              <td className="px-5 py-3">
                <div className="flex justify-end gap-1.5">
                  <button
                    onClick={() => imprimirLiquidacion(l.filas, l.desde, l.hasta) || onError(new Error('Permite las ventanas emergentes para descargar el PDF.'))}
                    className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                    title="Abre la liquidación lista para imprimir o «Guardar como PDF»"
                  >
                    <FileText className="size-3.5" /> PDF
                  </button>
                  {l.tiene_archivo && (
                    <button
                      onClick={() => verComprobante(l.lote)}
                      disabled={descargando === l.lote}
                      className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 disabled:opacity-50"
                    >
                      {descargando === l.lote ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />} Comprobante
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Propiedades({ propiedades }) {
  if (!propiedades.length) return <p className="py-6 text-center text-sm text-slate-500">No tienes propiedades asociadas a tu RUT.</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {propiedades.map((p) => {
        const m = infoModalidad(p.modalidad);
        const estado = p.estado !== 'activa' ? ['Inactiva', 'bg-slate-100 text-slate-600'] : p.disponible ? ['Publicada', 'bg-emerald-100 text-emerald-800'] : ['Arrendada / no disponible', 'bg-amber-100 text-amber-800'];
        return (
          <li key={p.id} className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            {p.imagen ? <img src={p.imagen} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" /> : <div className="aspect-[16/9] bg-slate-100" />}
            <div className="p-4">
              <div className="flex flex-wrap gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.badge}`}>{m.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${estado[1]}`}>{estado[0]}</span>
              </div>
              <p className="mt-2 font-bold text-slate-800">{p.titulo}</p>
              <p className="text-sm text-slate-500">{[p.direccion, p.comuna].filter(Boolean).join(', ')}</p>
              <p className="mt-2 flex gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><BedDouble className="size-3.5" /> {p.habitaciones}</span>
                <span className="flex items-center gap-1"><Bath className="size-3.5" /> {p.banos}</span>
                <span className="font-semibold text-slate-700">{formatCLP(p.precio_clp)}{m.sufijo}</span>
              </p>
              {p.modalidad === 'arriendo_diario' && (
                <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                  Comisión {formatPct(p.comision_pct)} + IVA{p.aseo_clp ? ` · aseo ${formatCLP(p.aseo_clp)} por estadía` : ''}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Panel({ onSalir }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  const manejarError = useCallback((err) => (err.status === 401 ? onSalir() : setError(err.message)), [onSalir]);

  useEffect(() => {
    propietarioApi.panel().then(setDatos).catch(manejarError);
  }, [manejarError]);

  if (!datos) {
    return error
      ? <p className="rounded-lg bg-rose-50 p-4 text-rose-700">{error}</p>
      : <div className="grid place-items-center py-32"><Loader2 className="size-8 animate-spin text-brand-600" /></div>;
  }

  const { kpis: k, propietario: yo } = datos;
  const mes = fmtMes.format(deISO(datos.mes.desde));
  const diarias = datos.propiedades.filter((p) => p.modalidad === 'arriendo_diario');

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">Hola,</p>
        <h1 className="text-2xl font-extrabold text-slate-800 sm:text-3xl">{yo.nombre}</h1>
        <p className="text-sm text-slate-500">RUT {yo.rut_formateado}</p>
      </div>

      {error && (
        <p role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
          <span className="flex items-center gap-2"><AlertCircle className="size-4" /> {error}</span>
          <button onClick={() => setError(null)} aria-label="Cerrar"><X className="size-4" /></button>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta titulo="Ingresos netos del mes" valor={formatCLP(k.neto_mes_clp)} detalle={`${k.reservas_mes} reservas con llegada en ${mes}`} Icono={Wallet} tono="bg-emerald-100 text-emerald-700" />
        <Tarjeta
          titulo="Tasa de ocupación"
          valor={k.ocupacion_pct == null ? '—' : `${k.ocupacion_pct.toLocaleString('es-CL')} %`}
          detalle={k.ocupacion_pct == null ? 'Sin propiedades de arriendo diario' : `${k.noches_reservadas_mes} de ${k.noches_disponibles_mes} noches en ${mes}`}
          Icono={Percent}
          tono="bg-brand-100 text-brand-700"
        />
        <Tarjeta titulo="Total histórico recibido" valor={formatCLP(k.historico_recibido_clp)} detalle={`${datos.liquidaciones.length} transferencias`} Icono={Landmark} tono="bg-sky-100 text-sky-700" />
        <Tarjeta
          titulo="Próximas liquidaciones"
          valor={formatCLP(k.pendiente_clp)}
          detalle={k.pendientes ? `${k.pendientes} ${k.pendientes === 1 ? 'reserva pagada' : 'reservas pagadas'} por transferirte` : 'Nada pendiente'}
          Icono={Clock}
          tono="bg-amber-100 text-amber-700"
        />
      </div>

      {diarias.length > 0 && (
        <Seccion titulo="Calendario de ocupación" Icono={CalendarRange}>
          <CalendarioOcupacion propiedades={diarias} onError={manejarError} />
        </Seccion>
      )}

      {datos.pendientes.length > 0 && (
        <Seccion titulo="Por liquidar" Icono={Clock}>
          <ul className="divide-y divide-slate-100 text-sm">
            {datos.pendientes.map((f) => (
              <li key={f.reserva_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{f.propiedad_titulo}</span>
                  <span className="text-xs text-slate-500">{fechaCorta(f.fecha_inicio)} → {fechaCorta(f.fecha_fin)} · {f.noches} noches</span>
                </span>
                <span className="text-right">
                  <span className="block font-bold tabular-nums text-slate-800">{formatCLP(f.neto_clp)}</span>
                  <span className="text-[11px] text-slate-400">de {formatCLP(f.bruto_clp)} cobrados</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">Montos estimados: se confirman al momento de la transferencia.</p>
        </Seccion>
      )}

      <Seccion titulo="Historial de liquidaciones" Icono={Landmark}>
        <TablaLiquidaciones liquidaciones={datos.liquidaciones} ivaPct={datos.iva_pct} onError={manejarError} />
      </Seccion>

      <Seccion titulo="Mis propiedades" Icono={Home}>
        <Propiedades propiedades={datos.propiedades} />
      </Seccion>
    </div>
  );
}

export default function PropietarioPage() {
  const [sesion, setSesion] = useState(haySesionPropietario);

  useEffect(() => {
    document.title = `Portal de Propietarios | ${MARCA}`;
  }, []);

  const salir = useCallback(() => {
    propietarioApi.salir();
    setSesion(false);
  }, []);

  if (!sesion) return <Navigate to="/propietarios/login" replace />;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 font-extrabold text-brand-900">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-700 text-white"><Building2 className="size-4" /></span>
            <span className="hidden sm:inline">{MARCA}</span> <span className="font-medium text-slate-400">/ Propietarios</span>
          </div>
          {/* En modo "ver como usuario" la salida está en la barra superior */}
          {impersonacionActiva()?.tipo !== 'propietario' && (
            <button onClick={salir} className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-rose-600">
              <LogOut className="size-4" /> Salir
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Panel onSalir={salir} />
      </main>
    </div>
  );
}
