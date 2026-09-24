import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageCircle, Mail, CreditCard } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { formatCLP } from '../../lib/format';
import { fechaCorta, hoyISO, desdeUTC, fechaHora, tiempoRestante } from '../../lib/fechas';
import { formatRut } from '../../lib/clientes';

export const ESTILO_ESTADO = {
  pendiente: 'bg-amber-100 text-amber-800 ring-amber-200',
  pagado: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  cancelado: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const TEXTO_AVISO = { pagado: 'Confirmación enviada al cliente', cancelado: 'Aviso de cancelación enviado al cliente' };

export function SelectorEstado({ reserva, onCambiado, onError, mostrarAviso = true }) {
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const cambiar = async (e) => {
    setGuardando(true);
    try {
      const actualizada = await adminApi.cambiarEstadoReserva(reserva.id, e.target.value);
      if (mostrarAviso) setAviso(actualizada.aviso_cliente ? TEXTO_AVISO[actualizada.estado_pago] : null);
      onCambiado(actualizada);
    } catch (err) {
      onError(err);
    } finally {
      setGuardando(false);
    }
  };
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <select
        value={reserva.estado_pago}
        onChange={cambiar}
        disabled={guardando}
        className={`rounded-full px-3 py-1 text-xs font-bold uppercase ring-1 ${ESTILO_ESTADO[reserva.estado_pago]}`}
        aria-label="Estado de pago"
      >
        <option value="pendiente">Pendiente</option>
        <option value="pagado">Pagado</option>
        <option value="cancelado">Cancelado</option>
      </select>
      {aviso && (
        <span role="status" className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
          <Mail className="size-3" /> {aviso}
        </span>
      )}
    </div>
  );
}

export const linkWhatsApp = (tel) => `https://wa.me/${tel.replace(/\D/g, '')}`;

const METODO_PAGO = { webpay: '💳 Webpay', mercadopago: '🟦 Mercado Pago', transferencia: '🏦 Transferencia', manual: 'Confirmado a mano' };

/** Plazo de pago de una reserva pendiente: tiempo restante y botones para extenderlo. */
function PlazoPago({ reserva: r, onCambiado, onError }) {
  const [guardando, setGuardando] = useState(false);
  const cambiar = async (horas) => {
    setGuardando(true);
    try {
      await adminApi.cambiarPlazoReserva(r.id, horas);
      onCambiado();
    } catch (err) {
      onError(err);
    } finally {
      setGuardando(false);
    }
  };
  const boton = 'rounded px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 disabled:opacity-50';

  if (!r.vence_en) {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
        Sin plazo de pago
        <button disabled={guardando} onClick={() => cambiar(24)} className={boton}>Poner 24 h</button>
      </div>
    );
  }
  const restante = tiempoRestante(r.vence_en);
  const urgente = desdeUTC(r.vence_en) - Date.now() < 2 * 3600 * 1000;
  // Con transferencia informada o un pago en proceso no se libera, aunque el plazo haya pasado
  const protegida = Boolean(r.transferencia_informada_en);
  return (
    <div className="mt-1 space-y-1">
      <p className={`text-[11px] ${urgente && !protegida ? 'font-semibold text-rose-600' : 'text-slate-500'}`} title={`Vence: ${fechaHora(r.vence_en)}`}>
        ⏱️ {restante === 'vencido' ? (protegida ? 'Plazo vencido (no se libera: transferencia informada)' : 'Plazo vencido · se libera en minutos') : `Vence ${restante}`}
      </p>
      <div className="flex gap-1">
        <button disabled={guardando} onClick={() => cambiar(24)} className={boton} title="Extender el plazo 24 horas">+24 h</button>
        <button disabled={guardando} onClick={() => cambiar(null)} className={boton} title="La reserva no se liberará automáticamente">Sin plazo</button>
      </div>
    </div>
  );
}

function detalleTransferencia(r) {
  try {
    const d = JSON.parse(r.transferencia_detalle ?? '{}');
    return [d.titular && `Titular: ${d.titular}`, d.banco && `Banco: ${d.banco}`, d.comentario].filter(Boolean).join(' · ');
  } catch {
    return '';
  }
}

function linkEnlacePago(r) {
  const texto = `Hola ${r.cliente_nombre.split(' ')[0]}, aquí puedes pagar tu reserva #${r.id} (${formatCLP(r.monto_total_clp)}): ${window.location.origin}/pago/${r.codigo_pago}`;
  return `https://wa.me/${r.cliente_telefono.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
}

export default function ReservasTable({ onError, onCambio }) {
  const [estado, setEstado] = useState('');
  const [soloFuturas, setSoloFuturas] = useState(true);
  const [reservas, setReservas] = useState(null);

  const cargar = useCallback(() => {
    adminApi
      .reservas({ estado, desde: soloFuturas ? hoyISO() : undefined })
      .then(setReservas)
      .catch(onError);
  }, [estado, soloFuturas, onError]);

  useEffect(() => { cargar(); }, [cargar]);

  const [aviso, setAviso] = useState(null);
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const alCambiar = (actualizada) => {
    // Se muestra arriba de la tabla: con un filtro activo la fila puede desaparecer al recargar
    if (actualizada?.aviso_cliente) {
      setAviso(`Reserva #${actualizada.id}: ${TEXTO_AVISO[actualizada.estado_pago].toLowerCase()} (${actualizada.cliente_email}).`);
    }
    cargar();
    onCambio?.();
  };

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <h2 className="font-bold text-slate-800">Reservas de arriendo diario</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            <input type="checkbox" checked={soloFuturas} onChange={(e) => setSoloFuturas(e.target.checked)} className="accent-brand-600" />
            Sólo actuales y futuras
          </label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5">
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="pagado">Pagadas</option>
            <option value="cancelado">Canceladas</option>
          </select>
        </div>
      </div>

      {aviso && (
        <p role="status" className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <Mail className="size-4" /> {aviso}
        </p>
      )}

      {!reservas ? (
        <div className="grid place-items-center p-10"><Loader2 className="size-6 animate-spin text-brand-600" /></div>
      ) : reservas.length === 0 ? (
        <p className="p-8 text-center text-slate-500">No hay reservas con estos filtros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Propiedad</th>
                <th className="px-4 py-3">Fechas</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3">Estado de pago</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reservas.map((r) => (
                <tr key={r.id} className={r.estado_pago === 'cancelado' ? 'opacity-60' : ''}>
                  <td className="px-4 py-3 text-slate-400">{r.id}</td>
                  <td className="max-w-56 px-4 py-3">
                    <p className="truncate font-medium text-slate-800" title={r.propiedad_titulo}>{r.propiedad_titulo}</p>
                    <p className="text-xs text-slate-500">{r.propiedad_comuna}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {fechaCorta(r.fecha_inicio)} → {fechaCorta(r.fecha_fin)}
                    <p className="text-xs text-slate-500">{r.noches} {r.noches === 1 ? 'noche' : 'noches'} · {r.huespedes} huésp.</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{r.cliente_nombre}</p>
                    {r.cliente_rut && <p className="text-xs text-slate-500">RUT {formatRut(r.cliente_rut)}</p>}
                    <div className="flex flex-wrap gap-x-3 text-xs">
                      <a href={linkWhatsApp(r.cliente_telefono)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-emerald-600 hover:underline">
                        <MessageCircle className="size-3" /> {r.cliente_telefono}
                      </a>
                      <a href={`mailto:${r.cliente_email}`} className="flex items-center gap-1 text-slate-500 hover:underline">
                        <Mail className="size-3" /> {r.cliente_email}
                      </a>
                    </div>
                    {r.notas && <p className="mt-1 text-xs italic text-slate-500">“{r.notas}”</p>}
                    {r.cupon && (
                      <p className="mt-1 text-xs font-semibold text-emerald-700" title={`Cupón ${r.cupon}`}>
                        🎁 {r.descuento_pct}% OFF fidelización{r.beneficios ? ` · ${r.beneficios}` : ''}
                      </p>
                    )}
                    {r.estado_pago === 'pendiente' && r.codigo_pago && (
                      <a
                        href={linkEnlacePago(r)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                      >
                        <CreditCard className="size-3" /> Enviar enlace de pago
                      </a>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    {formatCLP(r.monto_total_clp)}
                    {r.descuento_clp > 0 && <p className="text-[11px] font-normal text-emerald-700">−{formatCLP(r.descuento_clp)}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <SelectorEstado reserva={r} onCambiado={alCambiar} onError={onError} mostrarAviso={false} />
                    {r.estado_pago === 'pagado' && METODO_PAGO[r.metodo_pago] && (
                      <p className="mt-1 text-[11px] text-slate-500">{METODO_PAGO[r.metodo_pago]}</p>
                    )}
                    {r.estado_pago === 'pendiente' && (
                      <PlazoPago reserva={r} onCambiado={() => cargar()} onError={onError} />
                    )}
                    {r.estado_pago === 'cancelado' && r.motivo_cancelacion === 'vencida' && (
                      <p className="mt-1 text-[11px] text-slate-500">⏱️ Vencida por falta de pago</p>
                    )}
                    {r.estado_pago === 'pendiente' && r.transferencia_informada_en && (
                      <p className="mt-1 text-[11px] font-semibold text-amber-700" title={detalleTransferencia(r)}>
                        🏦 Transferencia informada · verificar
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
