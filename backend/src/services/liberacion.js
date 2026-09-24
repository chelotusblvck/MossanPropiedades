import { config } from '../config.js';
import * as Reserva from '../models/reserva.js';
import * as Propiedad from '../models/propiedad.js';
import { hoyChile } from '../lib/fechas.js';
import { debeAvisarCambioEstado, notificarCambioEstado, notificarReservasLiberadas } from './email.js';

const INTERVALO_MS = 5 * 60 * 1000;
let enCurso = false;

/** Libera las reservas pendientes cuyo plazo de pago venció. Devuelve las reservas liberadas. */
export async function liberarVencidas() {
  if (enCurso) return [];
  enCurso = true;
  try {
    const liberadas = [];
    for (const anterior of Reserva.vencidasLiberables()) {
      // Se revalida en el UPDATE: si justo llegó un pago, la reserva ya no está pendiente y no se toca
      if (!Reserva.liberarPorVencimiento(anterior.id)) continue;
      const reserva = Reserva.obtener(anterior.id);
      const propiedad = Propiedad.obtener(reserva.propiedad_id);
      liberadas.push({ reserva, propiedad });
      if (debeAvisarCambioEstado(anterior, reserva, hoyChile())) notificarCambioEstado(reserva, propiedad);
    }
    if (liberadas.length) {
      console.log(`[reservas] Liberadas por falta de pago: ${liberadas.map(({ reserva }) => `#${reserva.id}`).join(', ')}`);
      notificarReservasLiberadas(liberadas);
    }
    return liberadas;
  } catch (err) {
    console.error('[reservas] Error liberando reservas vencidas:', err);
    return [];
  } finally {
    enCurso = false;
  }
}

export function iniciarLiberacionAutomatica() {
  if (!config.reservas.plazoPagoHoras) {
    console.log('[reservas] Plazo de pago desactivado (RESERVA_PLAZO_PAGO_HORAS=0): las reservas pendientes no vencen');
    return;
  }
  liberarVencidas();
  setInterval(liberarVencidas, INTERVALO_MS).unref();
  console.log(`[reservas] Las reservas pendientes se liberan ${config.reservas.plazoPagoHoras} h después de creadas si no se pagan`);
}
