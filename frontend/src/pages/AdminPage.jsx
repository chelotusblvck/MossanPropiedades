import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, Lock, Loader2, LogOut, CalendarRange, ClipboardList, CalendarCheck, DoorOpen, X, MessageCircle, Mail, ExternalLink, Trash2, Wallet, Contact, ShieldCheck, Plus, Activity, Settings, ChevronDown, CheckCircle2 } from 'lucide-react';
import { adminApi, haySesion, setupApi } from '../lib/api';
import { MARCA } from '../lib/marca';
import { sumarDias, fechaLarga, diferenciaDias } from '../lib/fechas';
import { formatCLP } from '../lib/format';
import AvailabilityBoard from '../components/admin/AvailabilityBoard';
import InventoryList from '../components/admin/InventoryList';
import ReservasTable, { SelectorEstado, linkWhatsApp } from '../components/admin/ReservasTable';
import MarketingModal from '../components/admin/MarketingModal';
import BloqueoModal from '../components/admin/BloqueoModal';
import Agenda from '../components/admin/Agenda';
import VisitasTable from '../components/admin/VisitasTable';
import EditarFichaModal from '../components/admin/EditarFichaModal';
import Finanzas from '../components/admin/Finanzas';
import Directorio from '../components/admin/Directorio';
import Respaldos from '../components/admin/Respaldos';
import PublicarWizard from '../components/admin/wizard/PublicarWizard';
import EstadoSistema from '../components/admin/EstadoSistema';
import ConfirmarEliminarPropiedad from '../components/admin/ConfirmarEliminarPropiedad';

const AVISO_ESTADO = {
  desactivar: 'Propiedad desactivada: ya no se muestra en el sitio (está en «Inactivas»).',
  activar: 'Propiedad publicada en el sitio.',
  eliminar: 'Propiedad movida a la papelera. Sus reservas y liquidaciones se conservan.',
  restaurar: 'Propiedad restaurada: quedó en «Inactivas». Actívala para publicarla.',
};

export function Login({ onEntrar }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      await adminApi.login(password);
      onEntrar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-950 to-brand-800 p-4">
      <form onSubmit={enviar} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <span className="grid size-12 place-items-center rounded-xl bg-brand-700 text-white"><Lock className="size-6" /></span>
        <h1 className="mt-5 text-2xl font-extrabold text-brand-950">Panel de administración</h1>
        <p className="mt-1 text-sm text-slate-500">{MARCA}</p>
        <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <button disabled={cargando || !password} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 py-2.5 font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
          {cargando && <Loader2 className="size-4 animate-spin" />} Entrar
        </button>
      </form>
    </div>
  );
}

function Kpi({ titulo, valor, detalle, color }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2">
        <span className={`size-2.5 rounded-full ${color}`} />
        <p className="text-sm font-medium text-slate-500">{titulo}</p>
      </div>
      <p className="mt-2 text-3xl font-extrabold text-slate-800">{valor}</p>
      <p className="text-xs text-slate-500">{detalle}</p>
    </div>
  );
}

function DetalleReserva({ reserva: r, onCerrar, onCambiado, onError }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-2 ring-brand-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Reserva #{r.id} · {r.propiedad.titulo}</p>
          <p className="mt-1 text-lg font-bold text-slate-800">{r.cliente_nombre}</p>
          <p className="text-sm text-slate-600">
            {fechaLarga(r.fecha_inicio)} → {fechaLarga(r.fecha_fin)} · {r.noches} noches · {r.huespedes} huésp. · <strong>{formatCLP(r.monto_total_clp)}</strong>
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <a href={linkWhatsApp(r.cliente_telefono)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-emerald-600 hover:underline">
              <MessageCircle className="size-4" /> {r.cliente_telefono}
            </a>
            <a href={`mailto:${r.cliente_email}`} className="flex items-center gap-1 text-slate-600 hover:underline"><Mail className="size-4" /> {r.cliente_email}</a>
          </div>
          {r.notas && <p className="mt-2 text-sm italic text-slate-500">“{r.notas}”</p>}
        </div>
        <div className="flex items-center gap-2">
          <SelectorEstado reserva={r} onCambiado={onCambiado} onError={onError} />
          <button onClick={onCerrar} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar"><X className="size-5" /></button>
        </div>
      </div>
    </div>
  );
}

function DetalleBloqueo({ bloqueo: b, onCerrar, onEliminado, onError }) {
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const eliminar = async () => {
    setEliminando(true);
    try {
      await adminApi.eliminarBloqueo(b.id);
      onEliminado();
    } catch (err) {
      onError(err);
      setEliminando(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-2 ring-slate-300">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Bloqueo · {b.propiedad.titulo}</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-bold text-slate-800"><Lock className="size-4" /> {b.motivo || 'Sin motivo'}</p>
          <p className="text-sm text-slate-600">
            {fechaLarga(b.fecha_inicio)} → libre desde {fechaLarga(b.fecha_fin)} · {diferenciaDias(b.fecha_inicio, b.fecha_fin)} noches
          </p>
        </div>
        <div className="flex items-center gap-2">
          {confirmando ? (
            <>
              <span className="text-sm text-slate-600">¿Liberar estas fechas?</span>
              <button onClick={eliminar} disabled={eliminando} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                {eliminando && <Loader2 className="size-4 animate-spin" />} Sí, eliminar
              </button>
              <button onClick={() => setConfirmando(false)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">No</button>
            </>
          ) : (
            <button onClick={() => setConfirmando(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50">
              <Trash2 className="size-4" /> Eliminar bloqueo
            </button>
          )}
          <button onClick={onCerrar} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar"><X className="size-5" /></button>
        </div>
      </div>
    </div>
  );
}

// Navegación superior agrupada: 5 entradas en vez de 8 pestañas sueltas
const NAVEGACION = [
  { k: 'disponibilidad', label: 'Propiedades', icon: CalendarRange },
  {
    label: 'Operación',
    icon: ClipboardList,
    hijos: [
      { k: 'reservas', label: 'Reservas', icon: ClipboardList, badge: 'reservas' },
      { k: 'visitas', label: 'Visitas', icon: DoorOpen, badge: 'visitas' },
      { k: 'agenda', label: 'Agenda', icon: CalendarCheck },
    ],
  },
  { k: 'clientes', label: 'Directorio', icon: Contact },
  { k: 'finanzas', label: 'Finanzas', icon: Wallet },
  {
    label: 'Sistema',
    icon: Settings,
    hijos: [
      { k: 'estado', label: 'Estado del sistema', icon: Activity },
      { k: 'respaldos', label: 'Respaldos', icon: ShieldCheck },
      { ruta: '/admin/setup', label: 'Configuración', icon: Settings },
    ],
  },
];

function Badge({ tipo, resumen: r }) {
  if (tipo === 'reservas' && r?.reservas_pendientes > 0) {
    return <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-amber-950" title="Reservas pendientes de pago">{r.reservas_pendientes}</span>;
  }
  if (tipo === 'visitas' && r?.visitas_nuevas > 0) {
    return <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white" title="Solicitudes de visita nuevas">{r.visitas_nuevas}</span>;
  }
  return null;
}

function GrupoNav({ grupo, pestana, onElegir, resumen }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  const navegar = useNavigate();
  const activoHijo = grupo.hijos.find((h) => h.k === pestana);
  const Icono = activoHijo?.icon ?? grupo.icon;

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => !caja.current?.contains(e.target) && setAbierto(false);
    const tecla = (e) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  return (
    <div ref={caja} className="relative">
      <button
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title={grupo.label}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${activoHijo ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      >
        <Icono className="size-4" />
        <span className="sr-only lg:not-sr-only">{activoHijo ? activoHijo.label.replace(' del sistema', '') : grupo.label}</span>
        {grupo.hijos.map((h) => h.badge && <Badge key={h.k} tipo={h.badge} resumen={resumen} />)}
        <ChevronDown className={`size-3.5 transition ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div role="menu" className="absolute left-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200">
          {grupo.hijos.map((h) => {
            const HIcono = h.icon;
            return (
              <button
                key={h.k ?? h.ruta}
                role="menuitem"
                onClick={() => {
                  setAbierto(false);
                  if (h.ruta) navegar(h.ruta);
                  else onElegir(h.k);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${h.k === pestana ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <HIcono className="size-4 shrink-0" />
                <span className="flex-1">{h.label}</span>
                {h.badge && <Badge tipo={h.badge} resumen={resumen} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dashboard({ onSalir, abrirWizard }) {
  const navegar = useNavigate();
  const [pestana, setPestana] = useState('disponibilidad');
  const [wizard, setWizard] = useState(Boolean(abrirWizard));
  const [desde, setDesde] = useState(null); // null = hoy (según el servidor)
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [marketing, setMarketing] = useState(null);
  const [seleccion, setSeleccion] = useState(null); // { tipo: 'reserva' | 'bloqueo', ... }
  const [bloquear, setBloquear] = useState(null); // { propiedad, fecha }
  const [editando, setEditando] = useState(null); // propiedad cuya ficha se edita
  const [guardandoId, setGuardandoId] = useState(null);
  const [eliminando, setEliminando] = useState(null); // propiedad en el modal de eliminar/desactivar
  const [aviso, setAviso] = useState(null);

  const manejarError = useCallback((err) => {
    if (err.status === 401) onSalir();
    else setError(err.message);
  }, [onSalir]);

  const cargar = useCallback(() => {
    adminApi.inventario({ desde: desde ?? undefined, dias: 35 }).then(setDatos).catch(manejarError);
  }, [desde, manejarError]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiarPropiedad = async (p, cambios) => {
    setGuardandoId(p.id);
    try {
      await adminApi.actualizarPropiedad(p.id, cambios);
      cargar();
    } catch (err) {
      manejarError(err);
    } finally {
      setGuardandoId(null);
    }
  };

  const avisar = (accion) => {
    setAviso(AVISO_ESTADO[accion]);
    setTimeout(() => setAviso((a) => (a === AVISO_ESTADO[accion] ? null : a)), 5000);
  };

  const cambiarEstado = async (p, accion) => {
    setGuardandoId(p.id);
    try {
      await adminApi.estadoPropiedad(p.id, accion);
      avisar(accion);
      cargar();
    } catch (err) {
      manejarError(err);
    } finally {
      setGuardandoId(null);
    }
  };

  const r = datos?.resumen;
  const porModalidad = (m) => datos?.propiedades.filter((p) => p.modalidad === m) ?? [];
  const accionesFila = { onCambiar: cambiarPropiedad, onMarketing: setMarketing, onEditar: setEditando, onEstado: cambiarEstado, onEliminar: setEliminando, guardandoId };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 font-extrabold text-brand-900">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-700 text-white"><Building2 className="size-4" /></span>
            <span className="hidden sm:inline">{MARCA}</span> <span className="font-medium text-slate-400">/ Admin</span>
          </div>
          <nav className="flex gap-1 rounded-lg bg-slate-100 p-1" aria-label="Secciones del panel">
            {NAVEGACION.map((item) =>
              item.hijos ? (
                <GrupoNav key={item.label} grupo={item} pestana={pestana} onElegir={setPestana} resumen={r} />
              ) : (
                <button
                  key={item.k}
                  onClick={() => setPestana(item.k)}
                  title={item.label}
                  aria-current={pestana === item.k ? 'page' : undefined}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${pestana === item.k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <item.icon className="size-4" /> <span className="sr-only lg:not-sr-only">{item.label}</span>
                </button>
              ),
            )}
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWizard(true)}
              title="Publicar propiedad"
              className="flex items-center gap-1.5 rounded-lg bg-acento-500 px-3 py-1.5 text-sm font-bold text-acento-contraste hover:bg-acento-400"
            >
              <Plus className="size-4" /> <span className="sr-only lg:not-sr-only">Publicar</span>
            </button>
            <Link to="/" target="_blank" className="hidden items-center gap-1 text-sm text-slate-500 hover:text-brand-700 md:flex">
              Ver sitio <ExternalLink className="size-3.5" />
            </Link>
            <button onClick={onSalir} className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-rose-600">
              <LogOut className="size-4" /> Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
        {error && (
          <div className="flex items-center justify-between rounded-lg bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
            <button onClick={() => setError(null)} aria-label="Cerrar"><X className="size-4" /></button>
          </div>
        )}
        {aviso && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
            <span className="flex items-center gap-2"><CheckCircle2 className="size-4 shrink-0" /> {aviso}</span>
            <button onClick={() => setAviso(null)} aria-label="Cerrar"><X className="size-4" /></button>
          </div>
        )}

        {!datos ? (
          <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-brand-600" /></div>
        ) : pestana === 'disponibilidad' ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Kpi titulo="Arriendo diario" valor={`${r.diario_libres_hoy}/${r.diario_total}`} detalle="libres hoy" color="bg-amber-400" />
              <Kpi titulo="Año corrido" valor={`${r.anual_libres}/${r.anual_total}`} detalle="libres" color="bg-sky-500" />
              <Kpi titulo="Marzo–Diciembre" valor={`${r.marzo_libres}/${r.marzo_total}`} detalle="libres" color="bg-violet-500" />
              <Kpi titulo="Venta" valor={`${r.venta_libres}/${r.venta_total}`} detalle="disponibles" color="bg-brand-600" />
              <Kpi titulo="Reservas pendientes" valor={r.reservas_pendientes} detalle="por confirmar pago" color="bg-rose-500" />
            </div>

            <AvailabilityBoard
              datos={datos}
              onMover={(n) => setDesde(sumarDias(datos.desde, n))}
              onHoy={() => setDesde(null)}
              onMarketing={setMarketing}
              onSeleccionarReserva={(r) => setSeleccion({ ...r, tipo: 'reserva' })}
              onSeleccionarBloqueo={(b) => setSeleccion({ ...b, tipo: 'bloqueo' })}
              onBloquear={(propiedad, fecha) => setBloquear({ propiedad, fecha })}
              seleccion={seleccion}
            />
            {seleccion?.tipo === 'reserva' && (
              <DetalleReserva
                reserva={seleccion}
                onCerrar={() => setSeleccion(null)}
                onCambiado={(nueva) => { setSeleccion({ ...seleccion, ...nueva }); cargar(); }}
                onError={manejarError}
              />
            )}
            {seleccion?.tipo === 'bloqueo' && (
              <DetalleBloqueo
                bloqueo={seleccion}
                onCerrar={() => setSeleccion(null)}
                onEliminado={() => { setSeleccion(null); cargar(); }}
                onError={manejarError}
              />
            )}

            <div className="grid gap-6 xl:grid-cols-2">
              <InventoryList titulo="Arriendo año corrido" propiedades={porModalidad('arriendo_anual')} {...accionesFila} />
              <InventoryList titulo="Arriendo marzo a diciembre" propiedades={porModalidad('arriendo_marzo_diciembre')} {...accionesFila} />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <InventoryList titulo="Venta" propiedades={porModalidad('venta')} {...accionesFila} />
              <InventoryList titulo="Arriendo diario" propiedades={porModalidad('arriendo_diario')} {...accionesFila} />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <InventoryList
                titulo="Inactivas y borradores"
                descripcion="No se muestran en el sitio. Actívalas desde el menú ⋯ para publicarlas."
                variante="inactivas"
                plegable
                propiedades={datos.inactivas ?? []}
                {...accionesFila}
              />
              <InventoryList
                titulo="Papelera"
                descripcion="Eliminadas. Sus reservas, pagos y liquidaciones se conservan; puedes restaurarlas."
                variante="papelera"
                plegable
                propiedades={datos.eliminadas ?? []}
                {...accionesFila}
              />
            </div>
          </>
        ) : pestana === 'reservas' ? (
          <ReservasTable onError={manejarError} onCambio={cargar} />
        ) : pestana === 'visitas' ? (
          <VisitasTable onError={manejarError} onCambio={cargar} />
        ) : pestana === 'clientes' ? (
          <Directorio onError={manejarError} />
        ) : pestana === 'estado' ? (
          <EstadoSistema onError={manejarError} onIrPestana={setPestana} />
        ) : pestana === 'respaldos' ? (
          <Respaldos onError={manejarError} onCambio={cargar} />
        ) : pestana === 'finanzas' ? (
          <Finanzas onError={manejarError} />
        ) : (
          <Agenda onError={manejarError} />
        )}
      </main>

      {wizard && (
        <PublicarWizard
          onPublicada={cargar}
          onClose={() => {
            setWizard(false);
            if (abrirWizard) navegar('/admin', { replace: true });
          }}
        />
      )}
      {eliminando && (
        <ConfirmarEliminarPropiedad
          propiedad={eliminando}
          onClose={() => setEliminando(null)}
          onHecho={(accion) => { setEliminando(null); avisar(accion); cargar(); }}
        />
      )}
      {marketing && <MarketingModal propiedad={marketing} onClose={() => setMarketing(null)} />}
      {editando && (
        <EditarFichaModal
          propiedad={editando}
          onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar(); }}
        />
      )}
      {bloquear && (
        <BloqueoModal
          propiedad={bloquear.propiedad}
          fechaInicial={bloquear.fecha}
          onClose={() => setBloquear(null)}
          onGuardado={() => { setBloquear(null); cargar(); }}
        />
      )}
    </div>
  );
}

export default function AdminPage({ abrirWizard = false }) {
  const [sesion, setSesion] = useState(haySesion);
  const navegar = useNavigate();

  useEffect(() => {
    document.title = `Admin | ${MARCA}`;
  }, []);

  // Configuración inicial pendiente: instalación nueva (aún no hay con qué iniciar sesión) o, ya con sesión,
  // asistente sin completar → /admin/setup
  useEffect(() => {
    setupApi.estado()
      .then((e) => {
        if (e.instalacion_nueva || (sesion && !e.completado)) navegar('/admin/setup', { replace: true });
      })
      .catch(() => { /* sin conexión: se muestra el panel y sus errores */ });
  }, [sesion, navegar]);

  const salir = useCallback(() => {
    adminApi.logout();
    setSesion(false);
  }, []);

  return sesion ? <Dashboard onSalir={salir} abrirWizard={abrirWizard} /> : <Login onEntrar={() => setSesion(true)} />;
}
