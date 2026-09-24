import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { formatearRut } from '../lib/identidad.js';
import { alCambiar } from '../models/ajustes.js';

const { correo, marca, siteUrl } = config;
export const smtpConfigurado = () => Boolean(correo.host);

let transporte = null;
// Si el asistente cambia el SMTP, la próxima vez se crea la conexión con los datos nuevos
alCambiar(() => { transporte = null; });

const opcionesSmtp = (s) => ({
  host: s.host,
  port: Number(s.port) || 587,
  secure: Boolean(s.secure),
  auth: s.user ? { user: s.user, pass: s.pass } : undefined,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
});

/** Verifica conexión y credenciales SMTP (sin enviar nada). Devuelve null si está bien o el error. */
export async function verificarSmtp(s = correo) {
  if (!s.host) return 'SMTP no configurado';
  try {
    await nodemailer.createTransport(opcionesSmtp(s)).verify();
    return null;
  } catch (err) {
    return err.message;
  }
}

/** Envía un correo de prueba con los datos indicados (del asistente, aún sin guardar). */
export async function enviarPrueba(s, para) {
  const t = nodemailer.createTransport(opcionesSmtp(s));
  await t.sendMail({
    from: s.from || s.user,
    to: para,
    subject: `Correo de prueba – ${marca.nombre}`,
    text: `Si recibes este correo, el envío desde el sitio de ${marca.nombre} está bien configurado.`,
    html: plantilla({ titulo: 'Correo de prueba', intro: `Si recibes este correo, el envío desde el sitio de <b>${escapar(marca.nombre)}</b> está bien configurado.`, filas: [] }),
  });
}

function obtenerTransporte() {
  if (transporte) return transporte;
  transporte = smtpConfigurado()
    ? nodemailer.createTransport(opcionesSmtp(correo))
    : nodemailer.createTransport({ jsonTransport: true }); // desarrollo: no envía, sólo genera el mensaje
  return transporte;
}

export async function enviarCorreo({ to, subject, html, text, replyTo }) {
  const info = await obtenerTransporte().sendMail({
    from: correo.from || `${marca.nombre} <no-reply@localhost>`,
    to,
    replyTo,
    subject,
    html,
    text,
  });
  if (!smtpConfigurado()) {
    console.log(`\n[correo] (SMTP no configurado, no se envió)\n  Para: ${[].concat(to).join(', ')}\n  Asunto: ${subject}\n${text.replace(/^/gm, '  | ')}\n`);
  }
  return info;
}

// --- Formato ---

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmtFecha = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fecha = (s) => fmtFecha.format(new Date(`${s}T00:00:00Z`));
// Fecha y hora UTC de SQLite ('YYYY-MM-DD HH:MM:SS') mostrada en hora de Chile
const fmtFechaHora = new Intl.DateTimeFormat('es-CL', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago',
});
export const fechaHora = (s) => `${fmtFechaHora.format(new Date(`${s.replace(' ', 'T')}Z`))} h`;
const clp = (v) => (v == null ? '—' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v));
const soloDigitos = (s) => String(s).replace(/\D/g, '');

const colorEnlace = () => config.tema?.primario ?? '#1d5457';

/** Texto legible sobre un color (#RRGGBB): oscuro sobre fondos claros y blanco sobre oscuros. */
function textoSobre(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? '#0b2224' : '#ffffff';
}

function plantilla({ titulo, intro, filas, boton, pie }) {
  // Colores de la línea gráfica configurada en el asistente
  const primario = config.tema?.primario ?? '#1d5457';
  const acento = config.tema?.acento ?? '#f59e0b';
  const filasHtml = filas
    .map(([k, v]) => `<tr><td style="padding:8px 0;color:#64748b;width:140px;vertical-align:top">${k}</td><td style="padding:8px 0;color:#0f172a;font-weight:600">${v}</td></tr>`)
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:${primario};color:${textoSobre(primario)};padding:18px 24px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">${escapar(marca.nombre)}</div>
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#0b2224">${titulo}</h1>
      <p style="margin:0 0 16px;color:#334155;line-height:1.5">${intro}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${filasHtml}</table>
      ${boton ? `<p style="margin:24px 0 0"><a href="${escapar(boton.url)}" style="display:inline-block;background:${acento};color:${textoSobre(acento)};text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${boton.texto}</a></p>` : ''}
      ${pie ? `<p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.5">${pie}</p>` : ''}
    </div>
  </div></body></html>`;
}

const texto = (lineas) => lineas.filter((l) => l != null).join('\n');

/** Cupón de fidelización aplicado: "Oro · 10% OFF (−$12.000) · Late check-out gratis", o null. */
const lineaFidelizacion = (r) =>
  r.cupon
    ? [`Cupón ${r.cupon}`, `${r.descuento_pct}% OFF${r.descuento_clp ? ` (−${clp(r.descuento_clp)})` : ''}`, r.beneficios].filter(Boolean).join(' · ')
    : null;

// --- Correos de reservas ---

function correoCorredora(r, p) {
  const tel = escapar(r.cliente_telefono);
  const filas = [
    ['Propiedad', `${escapar(p.titulo)}<br><span style="font-weight:normal;color:#64748b">${escapar(p.comuna)}</span>`],
    ['Llegada', fecha(r.fecha_inicio)],
    ['Salida', fecha(r.fecha_fin)],
    ['Noches', `${r.noches} · ${r.huespedes} ${r.huespedes === 1 ? 'huésped' : 'huéspedes'}`],
    ['Total', clp(r.monto_total_clp)],
    ...(r.cupon ? [['Fidelización', `<span style="color:#047857">${escapar(lineaFidelizacion(r))}</span>`]] : []),
    ['Cliente', escapar(r.cliente_nombre)],
    ...(r.cliente_rut ? [['RUT', formatearRut(r.cliente_rut)]] : []),
    ['Correo', `<a href="mailto:${escapar(r.cliente_email)}">${escapar(r.cliente_email)}</a>`],
    ['Teléfono', `${tel} · <a href="https://wa.me/${soloDigitos(r.cliente_telefono)}">WhatsApp</a>`],
  ];
  if (r.notas) filas.push(['Comentarios', escapar(r.notas).replace(/\n/g, '<br>')]);

  return {
    subject: `Nueva reserva #${r.id}: ${p.titulo} (${r.fecha_inicio} → ${r.fecha_fin})`,
    replyTo: r.cliente_email,
    html: plantilla({
      titulo: `Nueva solicitud de reserva #${r.id}`,
      intro: 'Llegó una solicitud de arriendo diario desde el sitio. Las fechas ya quedaron <b>bloqueadas</b> como <b>pendiente de pago</b>.',
      filas,
      boton: { texto: 'Abrir panel de reservas', url: `${siteUrl}/admin` },
      pie: 'Responde este correo para escribirle directamente al cliente. Si no se concreta, cancela la reserva en el panel para liberar las fechas.',
    }),
    text: texto([
      `Nueva solicitud de reserva #${r.id} (pendiente de pago)`,
      '',
      `Propiedad: ${p.titulo} (${p.comuna})`,
      `Llegada:   ${fecha(r.fecha_inicio)}`,
      `Salida:    ${fecha(r.fecha_fin)}`,
      `Noches:    ${r.noches} · ${r.huespedes} huésped(es)`,
      `Total:     ${clp(r.monto_total_clp)}`,
      r.cupon ? `Fidelización: ${lineaFidelizacion(r)}` : null,
      '',
      `Cliente:   ${r.cliente_nombre}`,
      r.cliente_rut ? `RUT:       ${formatearRut(r.cliente_rut)}` : null,
      `Correo:    ${r.cliente_email}`,
      `Teléfono:  ${r.cliente_telefono} (https://wa.me/${soloDigitos(r.cliente_telefono)})`,
      r.notas ? `Comentarios: ${r.notas}` : null,
      '',
      `Panel: ${siteUrl}/admin`,
    ]),
  };
}

export const urlPago = (r) => `${siteUrl}/pago/${r.codigo_pago}`;

function correoCliente(r, p) {
  const url = `${siteUrl}/propiedad/${p.id}`;
  const contacto = marca.telefono ? ` o al ${escapar(marca.telefono)}` : '';
  return {
    subject: `Recibimos tu solicitud de reserva #${r.id} – ${p.titulo}`,
    html: plantilla({
      titulo: `¡Hola ${escapar(r.cliente_nombre.split(' ')[0])}! Recibimos tu solicitud`,
      intro: 'Tus fechas quedaron reservadas mientras se realiza el pago. Puedes pagar en línea desde el botón de abajo; la reserva se confirma apenas recibimos el pago.',
      boton: { texto: 'Pagar reserva', url: urlPago(r) },
      filas: [
        ['Propiedad', `<a href="${escapar(url)}" style="color:${colorEnlace()}">${escapar(p.titulo)}</a>`],
        ['Llegada', fecha(r.fecha_inicio)],
        ['Salida', fecha(r.fecha_fin)],
        ['Noches', `${r.noches} · ${r.huespedes} ${r.huespedes === 1 ? 'huésped' : 'huéspedes'}`],
        ['Total', clp(r.monto_total_clp)],
        ...(r.cupon ? [['Tu beneficio', escapar(lineaFidelizacion(r))]] : []),
        ['Estado', 'Pendiente de pago'],
        ...(r.vence_en ? [['Paga antes de', `<span style="color:#b45309">${fechaHora(r.vence_en)}</span>`]] : []),
      ],
      pie: `${r.vence_en ? 'Si no recibimos el pago dentro del plazo, la reserva se libera automáticamente. ' : ''}Si tienes dudas, responde este correo${contacto}. Nº de reserva: ${r.id}.`,
    }),
    text: texto([
      `Hola ${r.cliente_nombre}, recibimos tu solicitud de reserva #${r.id}.`,
      '',
      `Propiedad: ${p.titulo} – ${url}`,
      `Llegada:   ${fecha(r.fecha_inicio)}`,
      `Salida:    ${fecha(r.fecha_fin)}`,
      `Noches:    ${r.noches}`,
      `Total:     ${clp(r.monto_total_clp)}`,
      r.cupon ? `Beneficio: ${lineaFidelizacion(r)}` : null,
      'Estado:    Pendiente de pago',
      '',
      `Paga en línea aquí: ${urlPago(r)}`,
      r.vence_en
        ? `Tienes hasta el ${fechaHora(r.vence_en)} para pagar; después la reserva se libera automáticamente.`
        : 'La reserva se confirma apenas recibimos el pago.',
      marca.telefono ? `Contacto: ${marca.telefono}` : null,
      `— ${marca.nombre}`,
    ]),
    replyTo: correo.avisosA[0],
  };
}

/**
 * Avisa a la corredora y (opcional) confirma al cliente. Nunca lanza: un fallo de correo
 * no debe afectar la reserva, que ya quedó guardada.
 */
export async function notificarNuevaReserva(reserva, propiedad) {
  const envios = [];
  if (correo.avisosA.length) {
    envios.push(['corredora', enviarCorreo({ to: correo.avisosA, ...correoCorredora(reserva, propiedad) })]);
  } else {
    console.warn('[correo] NOTIFY_EMAIL no está configurado: no se avisó a la corredora de la reserva', reserva.id);
  }
  if (correo.confirmarAlCliente) {
    envios.push(['cliente', enviarCorreo({ to: reserva.cliente_email, ...correoCliente(reserva, propiedad) })]);
  }
  const resultados = await Promise.allSettled(envios.map(([, p]) => p));
  resultados.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[correo] Error enviando aviso (${envios[i][0]}) de la reserva ${reserva.id}:`, r.reason?.message);
  });
}

const METODO_PAGO = {
  webpay: 'Pagado con Webpay',
  mercadopago: 'Pagado con Mercado Pago',
  transferencia: 'Pagado por transferencia',
};

// --- Cambio de estado (pagada / cancelada) ---

function correoConfirmada(r, p) {
  const url = `${siteUrl}/propiedad/${p.id}`;
  const { horaCheckin, horaCheckout } = config.agenda;
  const direccion = [p.direccion, p.comuna].filter(Boolean).join(', ');
  const contacto = marca.telefono ? ` o escríbenos al ${escapar(marca.telefono)}` : '';
  return {
    subject: `Reserva #${r.id} confirmada – ${p.titulo}`,
    html: plantilla({
      titulo: `¡Tu reserva está confirmada, ${escapar(r.cliente_nombre.split(' ')[0])}!`,
      intro: 'Recibimos tu pago. Te esperamos en las fechas indicadas.',
      filas: [
        ['Propiedad', `<a href="${escapar(url)}" style="color:${colorEnlace()}">${escapar(p.titulo)}</a>`],
        ['Dirección', escapar(direccion)],
        ['Llegada', `${fecha(r.fecha_inicio)}<br><span style="font-weight:normal;color:#64748b">desde las ${horaCheckin} h</span>`],
        ['Salida', `${fecha(r.fecha_fin)}<br><span style="font-weight:normal;color:#64748b">hasta las ${horaCheckout} h</span>`],
        ['Huéspedes', String(r.huespedes)],
        ...(r.beneficios ? [['Beneficios', escapar(r.beneficios)]] : []),
        ['Total pagado', `${clp(r.monto_total_clp)}${r.metodo_pago && METODO_PAGO[r.metodo_pago] ? `<br><span style="font-weight:normal;color:#64748b">${METODO_PAGO[r.metodo_pago]}</span>` : ''}`],
        ['Estado', '<span style="color:#047857">Confirmada ✓</span>'],
      ],
      pie: `Unos días antes coordinaremos contigo la entrega de llaves. Si necesitas algo, responde este correo${contacto}. Nº de reserva: ${r.id}.`,
    }),
    text: texto([
      `Hola ${r.cliente_nombre}, tu reserva #${r.id} está CONFIRMADA. Recibimos tu pago.`,
      '',
      `Propiedad: ${p.titulo} – ${url}`,
      `Dirección: ${direccion}`,
      `Llegada:   ${fecha(r.fecha_inicio)}, desde las ${horaCheckin} h`,
      `Salida:    ${fecha(r.fecha_fin)}, hasta las ${horaCheckout} h`,
      `Huéspedes: ${r.huespedes}`,
      `Total:     ${clp(r.monto_total_clp)}`,
      '',
      'Unos días antes coordinaremos contigo la entrega de llaves.',
      marca.telefono ? `Contacto: ${marca.telefono}` : null,
      `— ${marca.nombre}`,
    ]),
    replyTo: correo.avisosA[0],
  };
}

function correoCancelada(r, p) {
  const contacto = marca.telefono ? ` o al ${escapar(marca.telefono)}` : '';
  const vencida = r.motivo_cancelacion === 'vencida';
  const nombre = escapar(r.cliente_nombre.split(' ')[0]);
  return {
    subject: vencida ? `Tu reserva #${r.id} venció por falta de pago – ${p.titulo}` : `Reserva #${r.id} cancelada – ${p.titulo}`,
    html: plantilla({
      titulo: vencida ? `Tu reserva #${r.id} venció` : `Tu reserva #${r.id} fue cancelada`,
      intro: vencida
        ? `Hola ${nombre}, no recibimos el pago dentro del plazo, así que la reserva se canceló y las fechas quedaron disponibles. Si aún te interesan, puedes reservarlas de nuevo.`
        : `Hola ${nombre}, te informamos que la siguiente reserva quedó cancelada y las fechas fueron liberadas.`,
      filas: [
        ['Propiedad', escapar(p.titulo)],
        ['Llegada', fecha(r.fecha_inicio)],
        ['Salida', fecha(r.fecha_fin)],
        ['Noches', String(r.noches)],
        ['Estado', '<span style="color:#b91c1c">Cancelada</span>'],
      ],
      boton: { texto: 'Buscar otras fechas', url: `${siteUrl}/propiedad/${p.id}` },
      pie: `Si crees que es un error o ya habías realizado un pago, responde este correo${contacto} y lo revisamos.`,
    }),
    text: texto([
      vencida
        ? `Hola ${r.cliente_nombre}, tu reserva #${r.id} VENCIÓ: no recibimos el pago dentro del plazo y las fechas quedaron liberadas.`
        : `Hola ${r.cliente_nombre}, tu reserva #${r.id} fue CANCELADA y las fechas quedaron liberadas.`,
      '',
      `Propiedad: ${p.titulo}`,
      `Llegada:   ${fecha(r.fecha_inicio)}`,
      `Salida:    ${fecha(r.fecha_fin)}`,
      '',
      'Si crees que es un error o ya habías realizado un pago, responde este correo y lo revisamos.',
      `Otras fechas: ${siteUrl}/propiedad/${p.id}`,
      marca.telefono ? `Contacto: ${marca.telefono}` : null,
      `— ${marca.nombre}`,
    ]),
    replyTo: correo.avisosA[0],
  };
}

const PLANTILLAS_ESTADO = { pagado: correoConfirmada, cancelado: correoCancelada };

/**
 * ¿Corresponde avisar al cliente de este cambio de estado? Sólo cuando el estado realmente cambia a
 * pagado o cancelado, la reserva no terminó (evita escribir por limpiezas de reservas antiguas)
 * y los correos al cliente están activos.
 */
export function debeAvisarCambioEstado(anterior, nueva, hoy) {
  return correo.confirmarAlCliente
    && anterior.estado_pago !== nueva.estado_pago
    && Object.hasOwn(PLANTILLAS_ESTADO, nueva.estado_pago)
    && nueva.fecha_fin >= hoy;
}

/** Envía al cliente el correo de reserva confirmada o cancelada. Nunca lanza. */
export async function notificarCambioEstado(reserva, propiedad) {
  const plantillaEstado = PLANTILLAS_ESTADO[reserva.estado_pago];
  if (!plantillaEstado) return;
  try {
    await enviarCorreo({ to: reserva.cliente_email, ...plantillaEstado(reserva, propiedad) });
  } catch (err) {
    console.error(`[correo] Error avisando al cliente el cambio a "${reserva.estado_pago}" de la reserva ${reserva.id}:`, err.message);
  }
}

// --- Avisos de pago a la corredora ---

const PROVEEDOR = { webpay: 'Webpay', mercadopago: 'Mercado Pago', transferencia: 'Transferencia bancaria' };

function filasReserva(r, p) {
  return [
    ['Reserva', `#${r.id} · ${escapar(p.titulo)}`],
    ['Fechas', `${fecha(r.fecha_inicio)} → ${fecha(r.fecha_fin)} (${r.noches} noches)`],
    ['Cliente', `${escapar(r.cliente_nombre)} · <a href="mailto:${escapar(r.cliente_email)}">${escapar(r.cliente_email)}</a> · ${escapar(r.cliente_telefono)}`],
  ];
}

async function avisarCorredora(asunto, { titulo, intro, filas, pie, replyTo }) {
  if (!correo.avisosA.length) {
    console.warn(`[correo] NOTIFY_EMAIL no está configurado: no se envió "${asunto}"`);
    return;
  }
  try {
    await enviarCorreo({
      to: correo.avisosA,
      subject: asunto,
      replyTo,
      html: plantilla({ titulo, intro, filas, pie, boton: { texto: 'Abrir panel de reservas', url: `${siteUrl}/admin` } }),
      text: texto([titulo, '', intro.replace(/<[^>]+>/g, ''), '', ...filas.map(([k, v]) => `${k}: ${String(v).replace(/<[^>]+>/g, '')}`), pie ? `\n${pie}` : null]),
    });
  } catch (err) {
    console.error(`[correo] Error enviando "${asunto}":`, err.message);
  }
}

export function notificarPagoRecibido(r, p, pago) {
  const d = pago.detalle ?? {};
  const medio = d.card_last4 ? `Tarjeta terminada en ${escapar(d.card_last4)}` : d.payment_method_id ? escapar(d.payment_method_id) : '';
  return avisarCorredora(`💰 Pago recibido – Reserva #${r.id} (${clp(pago.monto)})`, {
    titulo: `Pago recibido: reserva #${r.id} confirmada`,
    intro: `El cliente pagó en línea con <b>${PROVEEDOR[pago.proveedor]}</b>. La reserva quedó <b>pagada</b> y ya aparece en la agenda.`,
    filas: [
      ...filasReserva(r, p),
      ['Monto', clp(pago.monto)],
      ['Medio', [PROVEEDOR[pago.proveedor], medio, d.authorization_code ? `Autorización ${escapar(d.authorization_code)}` : ''].filter(Boolean).join(' · ')],
    ],
    replyTo: r.cliente_email,
  });
}

export function notificarTransferenciaInformada(r, p, pago) {
  const d = pago.detalle ?? {};
  return avisarCorredora(`🏦 Transferencia informada – Reserva #${r.id} (${clp(pago.monto)})`, {
    titulo: `El cliente informó una transferencia (reserva #${r.id})`,
    intro: 'Revisa tu cuenta bancaria. Cuando veas el abono, marca la reserva como <b>pagada</b> en el panel (el cliente recibirá la confirmación).',
    filas: [
      ...filasReserva(r, p),
      ['Monto esperado', clp(pago.monto)],
      ['Titular origen', escapar(d.titular)],
      ...(d.banco ? [['Banco origen', escapar(d.banco)]] : []),
      ...(d.comentario ? [['Comentario', escapar(d.comentario)]] : []),
    ],
    replyTo: r.cliente_email,
  });
}

const PROBLEMAS = {
  ya_pagada: 'La reserva ya estaba pagada: es un <b>pago duplicado</b> y debes devolverlo al cliente.',
  cancelada: 'La reserva estaba <b>cancelada</b> cuando llegó el pago: debes devolverlo o reactivar la reserva.',
  monto_distinto: 'El monto o la moneda del pago <b>no coinciden</b> con la reserva. Revísalo antes de confirmar.',
};

// --- Solicitudes de visita ---

const FRANJA = { manana: 'Mañana', tarde: 'Tarde', indiferente: 'Indiferente' };

/** Aviso a la corredora + acuse al interesado. Nunca lanza. */
export async function notificarSolicitudVisita(v, p) {
  const urlProp = `${siteUrl}/propiedad/${p.id}`;
  const preferencia = [v.fecha_preferida ? fecha(v.fecha_preferida) : 'Sin fecha preferida', FRANJA[v.franja]].join(' · ');
  await avisarCorredora(`🏠 Solicitud de visita – ${p.titulo}`, {
    titulo: 'Nueva solicitud de visita',
    intro: `Un interesado quiere visitar <a href="${escapar(urlProp)}">${escapar(p.titulo)}</a> (${escapar(p.comuna)}). Quedó registrada en el panel, pestaña <b>Visitas</b>.`,
    filas: [
      ['Nombre', escapar(v.nombre)],
      ...(v.cliente_rut ? [['RUT', formatearRut(v.cliente_rut)]] : []),
      ['Correo', `<a href="mailto:${escapar(v.email)}">${escapar(v.email)}</a>`],
      ['Teléfono', `${escapar(v.telefono)} · <a href="https://wa.me/${soloDigitos(v.telefono)}">WhatsApp</a>`],
      ['Preferencia', preferencia],
      ...(v.mensaje ? [['Mensaje', escapar(v.mensaje).replace(/\n/g, '<br>')]] : []),
    ],
    pie: 'Responde este correo para escribirle directamente al interesado.',
    replyTo: v.email,
  });

  if (!correo.confirmarAlCliente) return;
  const contacto = marca.telefono ? ` o llámanos al ${escapar(marca.telefono)}` : '';
  try {
    await enviarCorreo({
      to: v.email,
      replyTo: correo.avisosA[0],
      subject: `Recibimos tu solicitud de visita – ${p.titulo}`,
      html: plantilla({
        titulo: `¡Gracias, ${escapar(v.nombre.split(' ')[0])}!`,
        intro: 'Recibimos tu solicitud de visita. Te contactaremos pronto para coordinar el día y la hora.',
        filas: [
          ['Propiedad', `<a href="${escapar(urlProp)}" style="color:${colorEnlace()}">${escapar(p.titulo)}</a>`],
          ['Tu preferencia', preferencia],
        ],
        pie: `Si necesitas algo, responde este correo${contacto}.`,
      }),
      text: texto([
        `Hola ${v.nombre}, recibimos tu solicitud de visita.`,
        '',
        `Propiedad: ${p.titulo} – ${urlProp}`,
        `Preferencia: ${preferencia}`,
        '',
        'Te contactaremos pronto para coordinar.',
        `— ${marca.nombre}`,
      ]),
    });
  } catch (err) {
    console.error('[correo] Error enviando acuse de visita:', err.message);
  }
}

/** Acciones del cliente sobre su visita desde el portal "Mi cuenta". Nunca lanza. */
export function notificarCambioVisitaCliente(v, p, accion) {
  const cancelar = accion === 'cancelar';
  const r = v.reprogramacion ? JSON.parse(v.reprogramacion) : null;
  const filas = [
    ['Propiedad', escapar(p.titulo)],
    ['Cliente', `${escapar(v.nombre)}${v.cliente_rut ? ` · RUT ${formatearRut(v.cliente_rut)}` : ''}`],
    ['Contacto', `<a href="mailto:${escapar(v.email)}">${escapar(v.email)}</a> · ${escapar(v.telefono)} · <a href="https://wa.me/${soloDigitos(v.telefono)}">WhatsApp</a>`],
  ];
  if (!cancelar && r) {
    filas.push(['Nueva preferencia', [r.fecha_preferida ? fecha(r.fecha_preferida) : 'Sin fecha', FRANJA[r.franja]].join(' · ')]);
    if (r.mensaje) filas.push(['Mensaje', escapar(r.mensaje)]);
  }
  return avisarCorredora(cancelar ? `❌ Visita cancelada por el cliente – ${p.titulo}` : `🔁 Piden reprogramar una visita – ${p.titulo}`, {
    titulo: cancelar ? 'El cliente canceló su visita' : 'El cliente pide reprogramar su visita',
    intro: cancelar
      ? 'La solicitud quedó como <b>descartada</b> en el panel (pestaña Visitas).'
      : 'La solicitud volvió a <b>nueva</b> en el panel (pestaña Visitas) con la preferencia indicada. Contáctalo para coordinar.',
    filas,
    replyTo: v.email,
  });
}

/** Bienvenida al Portal de Propietarios con enlace de acceso de un solo uso. Nunca lanza. */
export async function enviarBienvenidaPropietario(p, url, dias) {
  try {
    await enviarCorreo({
      to: p.email,
      replyTo: correo.avisosA[0],
      subject: `Tu acceso al Portal de Propietarios – ${marca.nombre}`,
      html: plantilla({
        titulo: `¡Bienvenido/a, ${escapar(p.nombre.split(' ')[0])}!`,
        intro: `Creamos tu acceso al <b>Portal de Propietarios</b> de ${escapar(marca.nombre)}. Ahí puedes ver la ocupación de tus propiedades, tus liquidaciones con su desglose y descargar cada comprobante.`,
        filas: [['Tu RUT', formatearRut(p.rut)], ['Acceso', 'Sin contraseña: con tu RUT y un código que te enviamos']],
        boton: { texto: 'Entrar a mi portal', url },
        pie: `El botón es personal y sirve una sola vez durante ${dias} días. Después entra en ${escapar(`${siteUrl}/propietarios/login`)} con tu RUT.`,
      }),
      text: texto([
        `Hola ${p.nombre}, creamos tu acceso al Portal de Propietarios de ${marca.nombre}.`,
        '',
        `Entra aquí (enlace personal, un solo uso, ${dias} días): ${url}`,
        `Después: ${siteUrl}/propietarios/login con tu RUT ${formatearRut(p.rut)}.`,
      ]),
    });
    return true;
  } catch (err) {
    console.error('[correo] Error enviando bienvenida de propietario:', err.message);
    return false;
  }
}

/** Código de 4 dígitos para entrar al Portal de Propietarios. Nunca lanza. */
export async function enviarCodigoPropietario(p, codigo, minutos) {
  try {
    await enviarCorreo({
      to: p.email,
      subject: `${codigo} es tu código del Portal de Propietarios`,
      html: plantilla({
        titulo: `Hola, ${escapar(p.nombre.split(' ')[0])}`,
        intro: `Usa este código para entrar al Portal de Propietarios. Vence en ${minutos} minutos.`,
        filas: [['Código', `<span style="font-size:28px;letter-spacing:8px">${codigo}</span>`]],
        pie: 'Si no lo pediste, ignora este correo: nadie puede entrar sin este código.',
      }),
      text: texto([`Tu código del Portal de Propietarios es: ${codigo}`, `Vence en ${minutos} minutos.`, `— ${marca.nombre}`]),
    });
  } catch (err) {
    console.error('[correo] Error enviando código de propietario:', err.message);
  }
}

/** Código de ingreso al portal "Mi cuenta". */
export async function enviarCodigoAcceso(cuenta, codigo, minutos) {
  try {
    await enviarCorreo({
      to: cuenta.email,
      subject: `${codigo} es tu código de acceso – ${marca.nombre}`,
      html: plantilla({
        titulo: `Hola, ${escapar(cuenta.nombre.split(' ')[0])}`,
        intro: `Usa este código para entrar a <b>Mi cuenta</b> y ver tus visitas y reservas. Vence en ${minutos} minutos.`,
        filas: [['Código', `<span style="font-size:28px;letter-spacing:6px">${codigo}</span>`]],
        pie: 'Si no lo pediste, ignora este correo: nadie puede entrar sin este código.',
      }),
      text: texto([`Tu código de acceso a Mi cuenta es: ${codigo}`, `Vence en ${minutos} minutos.`, '', 'Si no lo pediste, ignora este correo.', `— ${marca.nombre}`]),
    });
  } catch (err) {
    console.error('[correo] Error enviando código de acceso:', err.message);
  }
}

/** Resumen a la corredora de las reservas liberadas por falta de pago en una pasada del proceso automático. */
export function notificarReservasLiberadas(liberadas) {
  const n = liberadas.length;
  return avisarCorredora(`⏱️ ${n} ${n === 1 ? 'reserva liberada' : 'reservas liberadas'} por falta de pago`, {
    titulo: `${n === 1 ? 'Se liberó 1 reserva' : `Se liberaron ${n} reservas`} por falta de pago`,
    intro: 'Estas reservas no se pagaron dentro del plazo: quedaron <b>canceladas</b> y sus fechas vuelven a estar disponibles. Puedes reactivarlas desde el panel si el cliente pagó por otro medio.',
    filas: liberadas.map(({ reserva: r, propiedad: p }) => [
      `#${r.id}`,
      `${escapar(p.titulo)}<br><span style="font-weight:normal;color:#64748b">${fecha(r.fecha_inicio)} → ${fecha(r.fecha_fin)} · ${escapar(r.cliente_nombre)} · ${clp(r.monto_total_clp)}</span>`,
    ]),
  });
}

export function notificarPagoConProblema(r, p, pago, motivo) {
  return avisarCorredora(`⚠️ Revisar pago – Reserva #${r.id}`, {
    titulo: `Pago que requiere revisión (reserva #${r.id})`,
    intro: PROBLEMAS[motivo] ?? 'Un pago requiere revisión.',
    filas: [...filasReserva(r, p), ['Pago', `${PROVEEDOR[pago.proveedor]} · ${clp(pago.monto)} · registro #${pago.id}`]],
    replyTo: r.cliente_email,
  });
}
