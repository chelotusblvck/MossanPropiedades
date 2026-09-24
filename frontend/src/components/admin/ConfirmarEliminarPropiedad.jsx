import { useEffect, useState } from 'react';
import { AlertTriangle, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { adminApi } from '../../lib/api';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Confirmación al eliminar una propiedad. Ofrece dos salidas:
 *  - Desactivar: se oculta del sitio y queda en "Inactivas" (reversible con un clic).
 *  - Eliminar:   va a la papelera. Es un borrado lógico: reservas, pagos y liquidaciones se conservan.
 * Si ya está inactiva sólo se ofrece eliminar.
 */
export default function ConfirmarEliminarPropiedad({ propiedad: p, onClose, onHecho }) {
  const [impacto, setImpacto] = useState(null);
  const [procesando, setProcesando] = useState(null); // 'desactivar' | 'eliminar'
  const [error, setError] = useState('');
  const activa = p.estado === 'activa';

  useEffect(() => {
    adminApi.impactoPropiedad(p.id).then(setImpacto).catch(() => setImpacto({}));
  }, [p.id]);

  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && !procesando && onClose();
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [onClose, procesando]);

  const ejecutar = async (accion) => {
    setProcesando(accion);
    setError('');
    try {
      await adminApi.estadoPropiedad(p.id, accion);
      onHecho(accion);
    } catch (err) {
      setError(err.message);
      setProcesando(null);
    }
  };

  const vigentes = impacto?.reservas_vigentes ?? 0;
  const conservados = impacto && [
    impacto.reservas_total > 0 && plural(impacto.reservas_total, 'reserva', 'reservas'),
    impacto.liquidaciones > 0 && plural(impacto.liquidaciones, 'liquidación', 'liquidaciones'),
    impacto.visitas_abiertas > 0 && plural(impacto.visitas_abiertas, 'visita abierta', 'visitas abiertas'),
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4" onClick={() => !procesando && onClose()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-eliminar"
        aria-describedby="detalle-eliminar"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600">
            <Trash2 className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="titulo-eliminar" className="text-lg font-bold text-slate-900">¿Eliminar o desactivar esta propiedad?</h2>
            <p className="mt-0.5 line-clamp-2 break-words text-sm text-slate-600" title={p.titulo}>{p.titulo}</p>
          </div>
        </div>

        <div id="detalle-eliminar" className="mt-5 space-y-3 text-sm">
          {!impacto ? (
            <p className="flex items-center gap-2 text-slate-500"><Loader2 className="size-4 animate-spin" /> Revisando reservas y registros asociados…</p>
          ) : (
            <>
              {vigentes > 0 && (
                <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-amber-800 ring-1 ring-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Tiene <strong>{plural(vigentes, 'reserva vigente o futura', 'reservas vigentes o futuras')}</strong>: no se puede eliminar
                    hasta que terminen o se cancelen. Puedes desactivarla para que no reciba nuevas.
                  </span>
                </p>
              )}
              {conservados?.length > 0 && (
                <p className="text-slate-600">
                  Se conservan sus registros históricos ({conservados.join(', ')}): la contabilidad y las reservas no se ven afectadas.
                </p>
              )}
            </>
          )}

          <ul className="space-y-2 rounded-lg bg-slate-50 p-3 text-slate-600 ring-1 ring-slate-200">
            {activa && (
              <li><strong className="text-slate-800">Desactivar:</strong> deja de verse en el sitio y pasa a «Inactivas». Puedes reactivarla cuando quieras.</li>
            )}
            <li><strong className="text-slate-800">Eliminar:</strong> se mueve a la papelera y desaparece del panel. Se puede restaurar desde la papelera.</li>
          </ul>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p>}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onClose} disabled={!!procesando} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50">
            Cancelar
          </button>
          {activa && (
            <button
              onClick={() => ejecutar('desactivar')}
              disabled={!!procesando}
              className="flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
            >
              {procesando === 'desactivar' ? <Loader2 className="size-4 animate-spin" /> : <EyeOff className="size-4" />} Desactivar
            </button>
          )}
          <button
            onClick={() => ejecutar('eliminar')}
            disabled={!!procesando || !impacto || vigentes > 0}
            title={vigentes > 0 ? 'Tiene reservas vigentes o futuras' : undefined}
            className="flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {procesando === 'eliminar' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
