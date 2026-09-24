import { GRUPOS } from '../lib/modalidades';

/** Pestañas de filtro rápido: Todas · En venta · Arriendo diario · Arriendo anual / Mar–Dic (con cantidad opcional). */
export default function FiltroGrupos({ valor, onCambiar, conteos, variante = 'con-borde' }) {
  const plano = variante === 'plano'; // dentro de una tarjeta blanca (buscador)
  return (
    <div role="tablist" aria-label="Tipo de operación" className="flex gap-1.5 overflow-x-auto pb-1">
      {GRUPOS.map((g) => {
        const activo = (valor ?? '') === g.value;
        const n = conteos?.[g.value || 'todas'];
        return (
          <button
            key={g.value || 'todas'}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onCambiar(g.value)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
              activo
                ? 'bg-brand-700 text-white shadow'
                : plano ? 'text-slate-600 hover:bg-slate-100' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {g.label}
            {n != null && (
              <span className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${activo ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
