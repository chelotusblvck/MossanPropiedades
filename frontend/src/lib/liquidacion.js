import { MARCA, TELEFONO, EMAIL } from './marca';
import { formatCLP } from './format';
import { fechaCorta, deISO, hoyISO } from './fechas';
import { descargarCSV } from './csv';

const fmtPct = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
const fmtFecha = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
export const fechaDocumento = (s) => fmtFecha.format(deISO(s));
export const formatPct = (v) => (v == null ? '—' : `${fmtPct.format(v)} %`);

export const ESTADO_LIQUIDACION = { pendiente: 'Pendiente de pago', liquidada: 'Transferido' };

export function descargarCSVLiquidaciones(filas, desde, hasta) {
  const columnas = [
    ['Reserva', (f) => f.reserva_id],
    ['Propiedad', (f) => f.propiedad_titulo],
    ['Comuna', (f) => f.propiedad_comuna],
    ['Propietario', (f) => f.propietario_nombre],
    ['RUT propietario', (f) => f.propietario_rut],
    ['Huésped', (f) => f.cliente_nombre],
    ['Check-in', (f) => f.fecha_inicio],
    ['Check-out', (f) => f.fecha_fin],
    ['Noches', (f) => f.noches],
    ['Ingreso bruto', (f) => f.bruto_clp],
    ['Aseo', (f) => f.aseo_clp],
    ['Comisión %', (f) => (f.comision_pct == null ? '' : String(f.comision_pct).replace('.', ','))],
    ['Comisión neta', (f) => f.comision_clp],
    ['IVA comisión', (f) => f.iva_clp],
    ['Comisión total', (f) => f.comision_clp + f.iva_clp],
    ['Neto propietario', (f) => f.neto_clp],
    ['Estado', (f) => ESTADO_LIQUIDACION[f.estado]],
    ['Fecha transferencia', (f) => f.fecha_transferencia],
    ['Comprobante', (f) => f.comprobante],
  ];
  descargarCSV(`liquidaciones_${desde}_${hasta}.csv`, columnas, filas);
}

// --- Liquidación imprimible (una hoja por propietario; "Guardar como PDF" desde el diálogo de impresión) ---

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Agrupa por propietario; las propiedades sin propietario registrado van cada una por separado. */
export function agruparPorPropietario(filas) {
  const grupos = new Map();
  for (const f of filas) {
    const nombre = f.propietario_nombre?.trim();
    const clave = nombre ? `p:${nombre.toLowerCase()}` : `s:${f.propiedad_id}`;
    if (!grupos.has(clave)) grupos.set(clave, { nombre: nombre || null, datos: f, filas: [] });
    grupos.get(clave).filas.push(f);
  }
  return [...grupos.values()];
}

function hojaPropietario(g, desde, hasta) {
  const d = g.datos;
  const suma = (k) => g.filas.reduce((a, f) => a + (f[k] ?? 0), 0);
  const neto = suma('neto_clp');
  const pagado = g.filas.filter((f) => f.estado === 'liquidada').reduce((a, f) => a + f.neto_clp, 0);
  const transferencias = [...new Set(g.filas.filter((f) => f.estado === 'liquidada').map((f) => `${fechaCorta(f.fecha_transferencia)}${f.comprobante ? ` (comp. ${f.comprobante})` : ''}`))];

  const filas = g.filas.map((f) => `
    <tr>
      <td>${esc(f.propiedad_titulo)}<small>Reserva #${f.reserva_id}${f.cliente_nombre ? ` · ${esc(f.cliente_nombre)}` : ''}</small></td>
      <td class="nw">${fechaCorta(f.fecha_inicio)} → ${fechaCorta(f.fecha_fin)}<small>${f.noches} ${f.noches === 1 ? 'noche' : 'noches'}</small></td>
      <td class="n">${formatCLP(f.bruto_clp)}</td>
      <td class="n">${f.aseo_clp ? `−${formatCLP(f.aseo_clp)}` : '—'}</td>
      <td class="n">${f.comision_clp ? `−${formatCLP(f.comision_clp)}` : '—'}<small>${formatPct(f.comision_pct)}</small></td>
      <td class="n">${f.iva_clp ? `−${formatCLP(f.iva_clp)}` : '—'}</td>
      <td class="n b">${formatCLP(f.neto_clp)}</td>
      <td class="nw">${f.estado === 'liquidada' ? `Transferido<small>${fechaCorta(f.fecha_transferencia)}</small>` : 'Pendiente'}</td>
    </tr>`).join('');

  return `
  <section class="hoja">
    <header>
      <div><h1>Liquidación de arriendos</h1><p>${esc(MARCA)} · ${esc(TELEFONO)} · ${esc(EMAIL)}</p></div>
      <div class="per"><span>Período (check-in)</span><b>${fechaDocumento(desde)} – ${fechaDocumento(hasta)}</b></div>
    </header>
    <div class="datos">
      <div><span>Propietario</span><b>${esc(g.nombre ?? 'Sin propietario registrado')}</b>
        ${d.propietario_rut ? `<p>RUT ${esc(d.propietario_rut)}</p>` : ''}
        ${d.propietario_email || d.propietario_telefono ? `<p>${esc([d.propietario_email, d.propietario_telefono].filter(Boolean).join(' · '))}</p>` : ''}
      </div>
      <div><span>Cuenta de destino</span><b>${esc(d.propietario_cuenta || '—')}</b></div>
    </div>
    <table>
      <thead><tr><th>Propiedad / reserva</th><th>Estadía</th><th class="n">Arriendo</th><th class="n">Aseo</th><th class="n">Comisión</th><th class="n">IVA comisión</th><th class="n">Neto</th><th>Estado</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr>
        <td colspan="2">Totales · ${g.filas.length} ${g.filas.length === 1 ? 'reserva' : 'reservas'}, ${suma('noches')} noches</td>
        <td class="n">${formatCLP(suma('bruto_clp'))}</td>
        <td class="n">${formatCLP(suma('aseo_clp'))}</td>
        <td class="n">${formatCLP(suma('comision_clp'))}</td>
        <td class="n">${formatCLP(suma('iva_clp'))}</td>
        <td class="n">${formatCLP(neto)}</td><td></td>
      </tr></tfoot>
    </table>
    <div class="total">
      <div><span>Total a liquidar</span><b>${formatCLP(neto)}</b></div>
      <div><span>Transferido</span><b>${formatCLP(pagado)}</b></div>
      <div><span>Saldo pendiente</span><b>${formatCLP(neto - pagado)}</b></div>
    </div>
    ${transferencias.length ? `<p class="nota">Transferencias: ${esc(transferencias.join(', '))}</p>` : ''}
    <p class="nota">Neto = arriendo cobrado − aseo − comisión de administración − IVA de la comisión. Documento generado el ${fechaDocumento(hoyISO())}.</p>
  </section>`;
}

const ESTILOS = `
  *{box-sizing:border-box} body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1e293b;margin:0;font-size:12px}
  .hoja{padding:28px 32px;page-break-after:always} .hoja:last-child{page-break-after:auto}
  header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #1e293b;padding-bottom:12px}
  h1{margin:0;font-size:20px} header p{margin:2px 0 0;color:#64748b}
  .per{text-align:right} span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
  .datos{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0} .datos b{font-size:14px} .datos p{margin:2px 0 0;color:#475569}
  table{width:100%;border-collapse:collapse} th{text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #cbd5e1;padding:6px}
  td{padding:6px;border-bottom:1px solid #e2e8f0;vertical-align:top} td small{display:block;color:#64748b;font-size:10px}
  tfoot td{font-weight:700;border-top:2px solid #1e293b;border-bottom:none}
  .n{text-align:right;white-space:nowrap} .nw{white-space:nowrap} .b{font-weight:700}
  .total{display:flex;justify-content:flex-end;gap:28px;margin-top:18px;padding:12px 16px;background:#f1f5f9;border-radius:8px}
  .total b{font-size:16px} .nota{color:#64748b;font-size:10px;margin-top:10px}
  @page{size:A4;margin:10mm}
`;

export function imprimirLiquidacion(filas, desde, hasta) {
  const ventana = window.open('', '_blank');
  if (!ventana) return false;
  const hojas = agruparPorPropietario(filas).map((g) => hojaPropietario(g, desde, hasta)).join('');
  ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Liquidación ${esc(desde)} a ${esc(hasta)}</title><style>${ESTILOS}</style></head><body>${hojas}</body></html>`);
  ventana.document.close();
  ventana.focus();
  // Espera a que se aplique el diseño antes de abrir el diálogo de impresión
  setTimeout(() => ventana.print(), 300);
  return true;
}
