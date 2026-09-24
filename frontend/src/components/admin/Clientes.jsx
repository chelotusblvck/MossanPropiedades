import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, Search, Download, MessageCircle, History, Pencil, X, Save, Trophy, Wallet, Users, Mail, Phone, StickyNote, Merge, Eye } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { formatCLP, formatUF } from '../../lib/format';
import { fechaCorta, desdeUTC } from '../../lib/fechas';
import { infoModalidad } from '../../lib/modalidades';
import {
  ETIQUETAS, TIPOS_CLIENTE, formatRut, linkWhatsAppCliente, colorAvatar, iniciales, coincide, exportarClientes,
} from '../../lib/clientes';
import { ESTILO_ESTADO } from './ReservasTable';
import Segmentado from './Segmentado';
import MenuAcciones from './MenuAcciones';

const POR_PAGINA = 50;
const MEDALLAS = ['🥇', '🥈', '🥉'];
const campo = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500';
const fmtActividad = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
const actividad = (s) => fmtActividad.format(desdeUTC(s));
const aUF = (clp, uf) => (uf ? Math.round((clp / uf) * 10) / 10 : null);
const ESTADO_VISITA = { nueva: 'Nueva', contactada: 'Contactada', agendada: 'Agendada', descartada: 'Descartada' };

function Avatar({ cliente, tamano = 'size-9 text-sm' }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${tamano} ${colorAvatar(cliente.id)}`} aria-hidden="true">
      {iniciales(cliente.nombre)}
    </span>
  );
}

function Etiquetas({ lista, compacto = false }) {
  // Vacía sólo si se eligió "Sin etiqueta" a mano: se muestra igual, para no dejar la celda en blanco
  if (!lista.length) {
    return <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">Sin etiqueta</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {lista.map((e) => (
        <span key={e} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${ETIQUETAS[e].clase}`}>
          {ETIQUETAS[e].icono} {compacto ? ETIQUETAS[e].corto : ETIQUETAS[e].label}
        </span>
      ))}
    </div>
  );
}

function Modal({ titulo, subtitulo, onClose, children, pie, ancho = 'max-w-3xl' }) {
  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[95vh] w-full ${ancho} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <h2 className="font-bold text-slate-800">{titulo}</h2>
            {subtitulo && <div className="text-sm text-slate-500">{subtitulo}</div>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X className="size-5" /></button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
        {pie && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">{pie}</div>}
      </div>
    </div>
  );
}

// --- Tarjetas superiores ---

function Podio({ titulo, Icono, tono, clientes, valor, detalle, onVer }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-600">{titulo}</p>
        <span className={`grid size-8 place-items-center rounded-lg ${tono}`}><Icono className="size-4" /></span>
      </div>
      {clientes.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">Aún no hay reservas pagadas.</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {clientes.map((c, i) => (
            <li key={c.id}>
              <button onClick={() => onVer(c)} className="flex w-full items-center gap-3 rounded-lg p-1 text-left hover:bg-slate-50">
                <span className="w-5 text-center text-lg" aria-label={`Puesto ${i + 1}`}>{MEDALLAS[i]}</span>
                <Avatar cliente={c} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{c.nombre}</span>
                  <span className="block text-xs text-slate-500">{detalle(c)}</span>
                </span>
                <span className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-800">{valor(c)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Metricas({ resumen: r, uf }) {
  const dato = (etiqueta, valor, extra) => (
    <div>
      <p className="text-xs text-slate-500">{etiqueta}</p>
      <p className="text-2xl font-extrabold tabular-nums text-slate-800">{valor}</p>
      {extra && <p className="text-[11px] text-slate-400">{extra}</p>}
    </div>
  );
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-600">Métricas de clientes</p>
        <span className="grid size-8 place-items-center rounded-lg bg-sky-100 text-sky-700"><Users className="size-4" /></span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        {dato('Clientes registrados', r.total_clientes, `${r.con_reservas} con reservas pagadas`)}
        {dato('Recurrentes', `${r.pct_recurrentes.toLocaleString('es-CL')} %`, `${r.recurrentes} con 2+ reservas`)}
        <div className="col-span-2">
          {dato('Gasto promedio por cliente', formatCLP(r.gasto_promedio_clp), uf ? `≈ ${formatUF(aUF(r.gasto_promedio_clp, uf))} · clientes con reservas pagadas` : null)}
        </div>
      </div>
    </div>
  );
}

// --- Modales ---

function HistorialModal({ id, uf, onClose, onEditar, onError }) {
  const [c, setC] = useState(null);

  useEffect(() => {
    adminApi.cliente(id).then(setC).catch((err) => { onError(err); onClose(); });
  }, [id, onError, onClose]);

  if (!c) {
    return (
      <Modal titulo="Historial del cliente" onClose={onClose}>
        <div className="grid place-items-center py-16"><Loader2 className="size-6 animate-spin text-brand-600" /></div>
      </Modal>
    );
  }

  const tile = (etiqueta, valor, extra) => (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="mt-0.5 text-lg font-extrabold tabular-nums text-slate-800">{valor}</p>
      {extra && <p className="text-[11px] text-slate-400">{extra}</p>}
    </div>
  );

  return (
    <Modal
      titulo={c.nombre}
      subtitulo={<>Cliente desde {actividad(c.primera_actividad)} · {c.tipos.map((t) => TIPOS_CLIENTE[t]).join(' · ')}</>}
      onClose={onClose}
      pie={(
        <>
          <a href={linkWhatsAppCliente(c)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
            <MessageCircle className="size-4" /> WhatsApp
          </a>
          <button onClick={() => onEditar(c)} className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
            <Pencil className="size-4" /> Editar datos / etiqueta
          </button>
        </>
      )}
    >
      <div className="flex flex-wrap items-start gap-4">
        <Avatar cliente={c} tamano="size-14 text-lg" />
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <Etiquetas lista={c.etiquetas} />
          <p className="text-slate-600">
            {c.rut ? <>RUT <span className="font-medium text-slate-800">{formatRut(c.rut)}</span></> : <span className="text-slate-400">Sin RUT registrado</span>}
            {c.cuenta && (
              <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200">
                Cuenta web desde {actividad(c.cuenta.creado_en)}{c.cuenta.ultimo_ingreso_en ? ` · último ingreso ${actividad(c.cuenta.ultimo_ingreso_en)}` : ''}
              </span>
            )}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 text-slate-600">
            {c.telefonos.map((t) => <span key={t} className="flex items-center gap-1"><Phone className="size-3.5" /> {t}</span>)}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 text-slate-600">
            {c.emails.map((e) => <a key={e} href={`mailto:${e}`} className="flex items-center gap-1 hover:underline"><Mail className="size-3.5" /> {e}</a>)}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile('Reservas pagadas', c.reservas_pagadas, `${c.reservas_total} en total`)}
        {tile('Noches', c.noches)}
        {tile('Total gastado', formatCLP(c.total_gastado_clp), uf ? `≈ ${formatUF(aUF(c.total_gastado_clp, uf))}` : null)}
        {tile('Visitas', c.visitas, c.reservas_canceladas ? `${c.reservas_canceladas} reservas canceladas` : null)}
      </div>

      <div className="mt-5 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800"><StickyNote className="size-3.5" /> Notas internas</p>
        <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{c.notas || <span className="text-slate-400">Sin notas.</span>}</p>
      </div>

      <h3 className="mt-6 text-sm font-bold text-slate-800">Reservas ({c.historial_reservas.length})</h3>
      {c.historial_reservas.length === 0 ? (
        <p className="mt-1 text-sm text-slate-400">Sin reservas.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Propiedad</th><th className="px-3 py-2">Estadía</th><th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2">Pago</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {c.historial_reservas.map((r) => (
                <tr key={r.id}>
                  <td className="max-w-56 px-3 py-2">
                    <p className="truncate font-medium text-slate-800" title={r.propiedad_titulo}>{r.propiedad_titulo}</p>
                    <p className="text-xs text-slate-500">#{r.id} · {r.propiedad_comuna}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {fechaCorta(r.fecha_inicio)} → {fechaCorta(r.fecha_fin)}
                    <p className="text-xs text-slate-500">{r.noches} noches · {r.huespedes} huésp.</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatCLP(r.monto_total_clp)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ring-1 ${ESTILO_ESTADO[r.estado_pago]}`}>{r.estado_pago}</span>
                    {r.motivo_cancelacion === 'vencida' && <p className="mt-0.5 text-[11px] text-slate-500">Vencida sin pago</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-6 text-sm font-bold text-slate-800">Propiedades que ha pedido visitar ({c.historial_visitas.length})</h3>
      {c.historial_visitas.length === 0 ? (
        <p className="mt-1 text-sm text-slate-400">Sin solicitudes de visita.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
          {c.historial_visitas.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-800">{v.propiedad_titulo}</span>
                <span className="text-xs text-slate-500">{infoModalidad(v.modalidad).label} · {v.propiedad_comuna} · pedida el {actividad(v.creado_en)}</span>
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{ESTADO_VISITA[v.estado] ?? v.estado}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function EditarClienteModal({ cliente: c, onClose, onGuardado }) {
  const [f, setF] = useState({
    nombre: c.nombre,
    rut: formatRut(c.rut) ?? '',
    email: c.email ?? '',
    etiqueta: c.etiqueta_manual ?? '',
    notas: c.notas ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const actualizado = await adminApi.actualizarCliente(c.id, {
        nombre: f.nombre.trim() || c.nombre,
        rut: f.rut.trim() || null,
        email: f.email.trim() || null,
        etiqueta: f.etiqueta || null,
        notas: f.notas,
      });
      onGuardado(actualizado);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Editar cliente"
      subtitulo={c.telefono}
      ancho="max-w-lg"
      onClose={onClose}
      pie={(
        <>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200">Cancelar</button>
          <button form="form-cliente" disabled={guardando} className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar
          </button>
        </>
      )}
    >
      <form id="form-cliente" onSubmit={guardar} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Nombre completo</span>
          <input value={f.nombre} onChange={set('nombre')} maxLength={120} className={campo} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">RUT</span>
            <input value={f.rut} onChange={set('rut')} maxLength={14} className={campo} placeholder="12.345.678-5" />
            <span className="mt-0.5 block text-[11px] text-slate-400">Si otro cliente tiene el mismo RUT, se unifican.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Correo</span>
            <input type="email" value={f.email} onChange={set('email')} maxLength={160} className={campo} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Etiqueta</span>
          <select value={f.etiqueta} onChange={set('etiqueta')} className={campo}>
            <option value="">Automática (según su historial)</option>
            <option value="vip">🌟 VIP / Recurrente</option>
            <option value="confiable">🟢 Cliente confiable</option>
            <option value="observaciones">⚠️ Con observaciones</option>
            <option value="sin">Sin etiqueta</option>
          </select>
          <span className="mt-0.5 block text-[11px] text-slate-400">
            Automática: VIP con 3+ reservas pagadas; confiable con al menos una estadía terminada. «Con observaciones» quita «confiable».
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Notas internas de la corredora</span>
          <textarea
            value={f.notas}
            onChange={set('notas')}
            maxLength={2000}
            rows={5}
            className={campo}
            placeholder="Ej: Pide siempre estacionamiento · Cuida muy bien las propiedades · Dejó la cocina sucia"
          />
        </label>
        {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </form>
    </Modal>
  );
}

// --- Pestaña ---

export default function Clientes({ onError }) {
  const [datos, setDatos] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [comportamiento, setComportamiento] = useState('');
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [historial, setHistorial] = useState(null); // id del cliente
  const [editando, setEditando] = useState(null); // cliente
  const [aviso, setAviso] = useState(null);

  const cargar = useCallback(() => {
    adminApi.clientes().then(setDatos).catch(onError);
  }, [onError]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  // Al cambiar los filtros se vuelve a la primera página
  useEffect(() => { setVisibles(POR_PAGINA); }, [busqueda, tipo, comportamiento]);

  const filtrados = useMemo(() => (datos?.clientes ?? []).filter((c) => (
    (!tipo || c.tipos.includes(tipo))
    && (!comportamiento || c.etiquetas.includes(comportamiento))
    && coincide(c, busqueda)
  )), [datos, tipo, comportamiento, busqueda]);

  const cerrarHistorial = useCallback(() => setHistorial(null), []);

  // Modo "ver como usuario": abre su portal con una sesión simulada de sólo lectura (queda registrado)
  const navegar = useNavigate();
  const [abriendo, setAbriendo] = useState(null);
  const verComo = async (c) => {
    setAbriendo(c.id);
    try {
      await adminApi.verComo('cliente', c.rut, c.id); // sin cuenta web → vista previa de su portal
      navegar('/mi-cuenta');
    } catch (err) {
      onError(err);
      setAbriendo(null);
    }
  };

  if (!datos) return <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-brand-600" /></div>;

  const { resumen: r, uf } = datos;
  const verCliente = (c) => setHistorial(c.id);

  return (
    <div className="space-y-6">
      {/* Podio y métricas */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Podio
          titulo="Top 3 por cantidad de reservas"
          Icono={Trophy}
          tono="bg-amber-100 text-amber-700"
          clientes={r.top_reservas}
          valor={(c) => `${c.reservas_pagadas} ${c.reservas_pagadas === 1 ? 'reserva' : 'reservas'}`}
          detalle={(c) => `${formatCLP(c.total_gastado_clp)} gastados`}
          onVer={verCliente}
        />
        <Podio
          titulo="Top 3 por dinero gastado"
          Icono={Wallet}
          tono="bg-emerald-100 text-emerald-700"
          clientes={r.top_gasto}
          valor={(c) => formatCLP(c.total_gastado_clp)}
          detalle={(c) => `${uf ? `≈ ${formatUF(aUF(c.total_gastado_clp, uf))} · ` : ''}${c.reservas_pagadas} ${c.reservas_pagadas === 1 ? 'reserva' : 'reservas'}`}
          onVer={verCliente}
        />
        <Metricas resumen={r} uf={uf} />
      </div>

      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        {/* Búsqueda y filtros */}
        <div className="space-y-3 border-b border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-800">Clientes</h2>
              <p className="text-xs text-slate-500">Huéspedes e interesados, unificados por celular o RUT.</p>
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <label className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, RUT, celular o correo"
                  aria-label="Buscar clientes"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
                />
              </label>
              <button
                onClick={() => exportarClientes(filtrados)}
                disabled={!filtrados.length}
                title="Exporta los clientes que se ven con los filtros actuales"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
              >
                <Download className="size-4" /> Exportar Excel/CSV
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmentado
              etiqueta="Tipo de cliente"
              valor={tipo}
              onCambiar={setTipo}
              opciones={[['', 'Todos'], ['diario', 'Arriendo diario'], ['mensual', 'Anual / Mar–Dic'], ['compra', 'Compradores / Visitas']]}
            />
            <Segmentado
              etiqueta="Comportamiento"
              valor={comportamiento}
              onCambiar={setComportamiento}
              opciones={[['', 'Todas las etiquetas'], ...Object.entries(ETIQUETAS).map(([k, e]) => [k, `${e.icono} ${e.corto}`])]}
            />
            <span className="text-xs text-slate-500">{filtrados.length} de {datos.clientes.length}</span>
          </div>
        </div>

        {aviso && (
          <p role="status" className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            <Merge className="size-4" /> {aviso}
          </p>
        )}

        {filtrados.length === 0 ? (
          <p className="p-10 text-center text-slate-500">No hay clientes con estos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            {/* Anchos fijos por columna (table-fixed): ningún dato largo puede empujar ni tapar a las columnas
                vecinas; lo que no cabe se corta con "…" y se ve completo al pasar el mouse. "Cliente" toma el resto. */}
            <table className="w-full min-w-[1200px] table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-[120px]" />
                <col className="w-[140px]" />
                <col className="w-[190px]" />
                <col className="w-[150px]" />
                <col className="w-[90px]" />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
                <col className="w-[72px]" />
              </colgroup>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">RUT</th>
                  <th className="px-4 py-3">Celular</th>
                  <th className="px-4 py-3">Correo</th>
                  <th className="px-4 py-3">Etiqueta</th>
                  <th className="px-4 py-3 text-right">Reservas</th>
                  <th className="px-4 py-3 text-right">Total gastado</th>
                  <th className="px-4 py-3" title="Última actividad">Última act.</th>
                  <th className="px-4 py-3 text-right"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.slice(0, visibles).map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      {/* w-full + min-w-0 en cada nivel: así "truncate" tiene un ancho contra el cual cortar */}
                      <button onClick={() => verCliente(c)} className="flex w-full min-w-0 items-center gap-3 text-left" title={c.nombre}>
                        <Avatar cliente={c} />
                        <span className="min-w-0 flex-1">
                          {/* Hasta 2 líneas con salto limpio; si aún no cabe, "…" (el nombre completo queda en el title) */}
                          <span className="line-clamp-2 break-words font-semibold leading-snug text-slate-800 hover:text-brand-700">{c.nombre}</span>
                          <span className="block truncate text-xs text-slate-500">{c.tipos.map((t) => TIPOS_CLIENTE[t]).join(' · ')}</span>
                        </span>
                      </button>
                    </td>
                    <td className="truncate px-4 py-3 text-slate-600">
                      {formatRut(c.rut) ?? <span className="text-slate-300">—</span>}
                      {c.cuenta && <p className="text-[11px] font-semibold text-brand-600">Cuenta web</p>}
                    </td>
                    <td className="truncate px-4 py-3 text-slate-600" title={c.telefonos.join(', ')}>
                      {c.telefono}
                      {c.telefonos.length > 1 && <span className="ml-1 text-[11px] text-slate-400">+{c.telefonos.length - 1}</span>}
                    </td>
                    <td className="truncate px-4 py-3 text-slate-600" title={c.email ?? undefined}>{c.email ?? '—'}</td>
                    <td className="overflow-hidden px-4 py-3">
                      <Etiquetas lista={c.etiquetas} compacto />
                      {c.notas && <p className="mt-1 truncate text-[11px] italic text-slate-500" title={c.notas}>📝 {c.notas}</p>}
                    </td>
                    <td className="truncate px-4 py-3 text-right tabular-nums">
                      <span className="font-semibold text-slate-800">{c.reservas_pagadas}</span>
                      {c.visitas > 0 && <p className="text-[11px] text-slate-400">{c.visitas} {c.visitas === 1 ? 'visita' : 'visitas'}</p>}
                    </td>
                    <td className="truncate px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                      {c.total_gastado_clp ? formatCLP(c.total_gastado_clp) : <span className="font-normal text-slate-300">—</span>}
                    </td>
                    <td className="truncate px-4 py-3 text-slate-600">{actividad(c.ultima_actividad)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {abriendo === c.id ? (
                          <Loader2 className="m-1.5 size-4 animate-spin text-brand-600" />
                        ) : (
                          <MenuAcciones
                            etiqueta={`Acciones: ${c.nombre}`}
                            items={[
                              { label: 'Ver historial', icon: History, onClick: () => verCliente(c) },
                              { label: 'Editar datos / etiqueta', icon: Pencil, onClick: () => setEditando(c) },
                              { label: 'Escribir por WhatsApp', icon: MessageCircle, href: linkWhatsAppCliente(c) },
                              {
                                label: c.cuenta ? 'Ver como usuario' : 'Ver como usuario (vista previa)',
                                icon: Eye,
                                onClick: () => verComo(c),
                                separador: true,
                              },
                            ]}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtrados.length > visibles && (
          <div className="border-t border-slate-100 p-3 text-center">
            <button onClick={() => setVisibles((v) => v + POR_PAGINA)} className="rounded-lg px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
              Mostrar más ({filtrados.length - visibles} restantes)
            </button>
          </div>
        )}
      </section>

      {historial && !editando && (
        <HistorialModal
          id={historial}
          uf={uf}
          onClose={cerrarHistorial}
          onEditar={(c) => setEditando(c)}
          onError={onError}
        />
      )}
      {editando && (
        <EditarClienteModal
          cliente={editando}
          onClose={() => setEditando(null)}
          onGuardado={(actualizado) => {
            setEditando(null);
            if (actualizado.unificado) {
              setAviso(`${actualizado.nombre}: el RUT coincidía con otro cliente y se unificaron sus historiales.`);
            }
            // El historial abierto se recarga con los datos nuevos (el id puede cambiar al unificar)
            if (historial) setHistorial(actualizado.id);
            cargar();
          }}
        />
      )}
    </div>
  );
}
