import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, RefreshCw, Wand2, CheckCircle2, AlertTriangle, XCircle, Info, ArrowRight, Cpu } from 'lucide-react';
import { adminApi } from '../../lib/api';

const SEMAFORO = {
  verde: { emoji: '🟢', titulo: 'Sistema operativo', texto: 'Todo está configurado y funcionando.', clase: 'from-emerald-500 to-emerald-700' },
  amarillo: { emoji: '🟡', titulo: 'Configuración incompleta', texto: 'El sitio funciona, pero hay puntos por completar.', clase: 'from-amber-400 to-amber-600' },
  rojo: { emoji: '🔴', titulo: 'Atención requerida', texto: 'Hay problemas que pueden afectar al sitio o a tus datos.', clase: 'from-rose-500 to-rose-700' },
};

const ESTADO = {
  ok: { Icono: CheckCircle2, clase: 'text-emerald-600', etiqueta: 'OK' },
  advertencia: { Icono: AlertTriangle, clase: 'text-amber-500', etiqueta: 'Pendiente' },
  error: { Icono: XCircle, clase: 'text-rose-600', etiqueta: 'Error' },
  info: { Icono: Info, clase: 'text-slate-400', etiqueta: 'Opcional' },
};

const fmtHora = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function EstadoSistema({ onError, onIrPestana }) {
  const navegar = useNavigate();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);

  const revisar = useCallback(() => {
    setCargando(true);
    adminApi.estadoSistema().then(setDatos).catch(onError).finally(() => setCargando(false));
  }, [onError]);

  useEffect(() => { revisar(); }, [revisar]);

  const resolver = (accion) => {
    if (accion.tipo === 'setup') navegar(`/admin/setup?paso=${accion.paso}`);
    else onIrPestana(accion.pestana);
  };

  if (!datos) return <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-brand-600" /></div>;

  const s = SEMAFORO[datos.general];
  const pendientes = datos.checks.filter((c) => c.estado === 'error' || c.estado === 'advertencia')
    .sort((a, b) => (a.estado === 'error' ? -1 : 0) - (b.estado === 'error' ? -1 : 0));
  const ok = datos.checks.filter((c) => c.estado === 'ok').length;

  return (
    <div className="space-y-6">
      <section className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-br p-6 text-white shadow-sm ${s.clase}`}>
        <div className="flex items-center gap-4">
          <span className="text-5xl" aria-hidden="true">{s.emoji}</span>
          <div>
            <h2 className="text-2xl font-extrabold">{s.titulo}</h2>
            <p className="text-white/90">{s.texto} · {ok} de {datos.checks.length} verificaciones OK</p>
            <p className="text-xs text-white/70">Revisado a las {fmtHora.format(new Date(datos.revisado_en))}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={revisar} disabled={cargando} className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold ring-1 ring-white/30 hover:bg-white/25 disabled:opacity-60">
            <RefreshCw className={`size-4 ${cargando ? 'animate-spin' : ''}`} /> Revisar de nuevo
          </button>
          <button onClick={() => navegar('/admin/setup')} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-white/90">
            <Wand2 className="size-4" /> Volver a ejecutar el asistente
          </button>
        </div>
      </section>

      {pendientes.length > 0 && (
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h3 className="font-bold text-slate-800">Pasos pendientes ({pendientes.length})</h3>
          <ul className="mt-3 space-y-2">
            {pendientes.map((c) => {
              const e = ESTADO[c.estado];
              return (
                <li key={c.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 ring-1 ${c.estado === 'error' ? 'bg-rose-50 ring-rose-200' : 'bg-amber-50 ring-amber-200'}`}>
                  <span className="flex min-w-0 flex-1 items-start gap-2.5">
                    <e.Icono className={`mt-0.5 size-5 shrink-0 ${e.clase}`} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-800">{c.titulo}</span>
                      <span className="text-sm text-slate-600">{c.detalle}</span>
                    </span>
                  </span>
                  {c.accion && (
                    <button onClick={() => resolver(c.accion)} className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-slate-200 hover:bg-brand-50">
                      {c.accion.texto ?? 'Resolver'} <ArrowRight className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <h3 className="border-b border-slate-200 p-4 font-bold text-slate-800">Verificaciones automáticas</h3>
          <ul className="divide-y divide-slate-100">
            {datos.checks.map((c) => {
              const e = ESTADO[c.estado];
              return (
                <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                  <e.Icono className={`mt-0.5 size-5 shrink-0 ${e.clase}`} aria-label={e.etiqueta} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">{c.titulo}</span>
                    <span className="block break-words text-xs text-slate-500">{c.detalle}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="h-fit rounded-2xl bg-slate-900 p-5 font-mono text-xs text-slate-300 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 font-sans text-sm font-bold text-white"><Cpu className="size-4" /> Vista de desarrollador</h3>
          <dl className="space-y-1.5">
            {[
              ['Versión app', datos.sistema.version_app],
              ['Node.js', datos.sistema.node],
              ['Plataforma', datos.sistema.plataforma],
              ['Entorno', datos.sistema.entorno],
              ['Zona horaria', datos.sistema.zona_horaria],
              ['Activo hace', `${datos.sistema.uptime_min} min`],
              ['Memoria (RSS)', `${datos.sistema.memoria_mb} MB`],
              ['URL del sitio', datos.sistema.url_sitio],
              ['Base de datos', datos.sistema.base_datos],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="break-all text-slate-200">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
