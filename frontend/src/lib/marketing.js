import { formatUF, formatCLP, formatNumero, TIPO_LABEL } from './format';
import { infoModalidad } from './modalidades';
import { MARCA, TELEFONO, EMAIL, urlPropiedad } from './marca';

export const PLATAFORMAS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const hashtag = (s) => '#' + sinTildes(s).toLowerCase().replace(/[^a-z0-9ñ]/g, '');

export function textoPrecio(p) {
  const { sufijo } = infoModalidad(p.modalidad);
  const periodo = sufijo === '/noche' ? ' por noche' : sufijo === '/mes' ? ' mensual' : '';
  return p.moneda_original === 'UF'
    ? `${formatUF(p.precio_uf)}${periodo} (≈ ${formatCLP(p.precio_clp)})`
    : `${formatCLP(p.precio_clp)}${periodo} (≈ ${formatUF(p.precio_uf)})`;
}

export function caracteristicas(p) {
  const superficie = p.superficie_util ?? p.superficie_total;
  return [
    p.habitaciones > 0 && `${p.habitaciones} ${p.habitaciones === 1 ? 'dormitorio' : 'dormitorios'}`,
    p.banos > 0 && `${p.banos} ${p.banos === 1 ? 'baño' : 'baños'}`,
    superficie && `${formatNumero(superficie)} m²`,
    p.estacionamientos > 0 && `${p.estacionamientos} estac.`,
  ].filter(Boolean);
}

function resumir(texto, max) {
  const t = (texto ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, '')}…` : t;
}

/** Texto listo para publicar, adaptado a cada red social. */
export function generarFicha(p, plataforma = 'instagram') {
  const modalidad = infoModalidad(p.modalidad);
  const ubicacion = [p.comuna, p.region].filter(Boolean).join(', ');
  const url = urlPropiedad(p.id);
  const wa = plataforma === 'whatsapp';
  const b = (s) => (wa ? `*${s}*` : s); // negrita en WhatsApp
  const tipo = TIPO_LABEL[p.tipo] ?? 'Propiedad';

  const cta = p.modalidad === 'arriendo_diario'
    ? '📅 Revisa la disponibilidad y reserva tus fechas'
    : p.modalidad === 'venta' ? '📞 Agenda tu visita' : '📞 Agenda tu visita hoy';

  const lineas = [
    `🏡 ${b(`${modalidad.label.toUpperCase()} · ${p.comuna}`)}`,
    b(p.titulo),
    '',
    `💰 ${b(textoPrecio(p))}`,
    caracteristicas(p).length ? `🛏️ ${caracteristicas(p).join(' · ')}` : null,
    `📍 ${tipo} en ${ubicacion}`,
  ];

  const desc = resumir(p.descripcion, plataforma === 'facebook' ? 500 : 260);
  if (desc) lineas.push('', `✨ ${desc}`);

  lineas.push('');
  if (plataforma === 'instagram') {
    lineas.push(`${cta}: link en la bio o escríbenos por DM.`, `📲 ${TELEFONO}`);
  } else {
    lineas.push(`${cta}: ${url}`, `📲 ${TELEFONO} · ✉️ ${EMAIL}`);
  }

  if (plataforma !== 'whatsapp') {
    const etiquetas = [
      hashtag(p.comuna),
      hashtag(`${tipo}${p.modalidad === 'venta' ? 'enventa' : 'enarriendo'}`),
      p.modalidad === 'arriendo_diario' ? '#arriendodiario' : p.modalidad === 'arriendo_marzo_diciembre' ? '#arriendomarzoadiciembre' : null,
      p.modalidad === 'venta' ? '#propiedadesenventa' : '#arriendos',
      '#propiedadeschile',
      hashtag(MARCA),
    ].filter(Boolean);
    lineas.push('', (plataforma === 'facebook' ? etiquetas.slice(0, 4) : etiquetas).join(' '));
  } else {
    lineas.push('', `— ${MARCA}`);
  }

  return lineas.filter((l) => l !== null).join('\n');
}

function cargarImagen(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function dibujarCubriendo(ctx, img, x, y, w, h) {
  const escala = Math.max(w / img.width, h / img.height);
  const sw = w / escala;
  const sh = h / escala;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function ajustarTexto(ctx, texto, maxAncho, maxLineas) {
  const palabras = texto.split(' ');
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > maxAncho && actual) {
      lineas.push(actual);
      actual = p;
    } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  if (lineas.length > maxLineas) {
    lineas.length = maxLineas;
    lineas[maxLineas - 1] = lineas[maxLineas - 1].replace(/\s*\S*$/, '…');
  }
  return lineas;
}

/** Imagen 1080×1350 (formato post vertical de Instagram) con foto, precio y características. */
export async function generarImagenRedes(p, indiceFoto = 0) {
  const W = 1080, H = 1350, FOTO_H = 860;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  await document.fonts?.ready;

  const img = await cargarImagen(p.imagenes?.[indiceFoto] ?? p.imagenes?.[0]);
  if (img) dibujarCubriendo(ctx, img, 0, 0, W, FOTO_H);
  else {
    const g = ctx.createLinearGradient(0, 0, W, FOTO_H);
    g.addColorStop(0, '#2d8285');
    g.addColorStop(1, '#0b2224');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, FOTO_H);
  }

  // Etiqueta de modalidad
  const modalidad = infoModalidad(p.modalidad).label.toUpperCase();
  ctx.font = '700 34px Inter, system-ui, sans-serif';
  const anchoEtiqueta = ctx.measureText(modalidad).width + 56;
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.roundRect(48, 48, anchoEtiqueta, 68, 34);
  ctx.fill();
  ctx.fillStyle = '#0b2224';
  ctx.fillText(modalidad, 76, 94);

  // Panel inferior
  ctx.fillStyle = '#0b2224';
  ctx.fillRect(0, FOTO_H, W, H - FOTO_H);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, FOTO_H, W, 10);

  const { sufijo } = infoModalidad(p.modalidad);
  const principal = p.moneda_original === 'UF' ? formatUF(p.precio_uf) : formatCLP(p.precio_clp);
  const secundario = p.moneda_original === 'UF' ? formatCLP(p.precio_clp) : formatUF(p.precio_uf);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 76px Inter, system-ui, sans-serif';
  ctx.fillText(principal, 60, FOTO_H + 110);
  const anchoPrecio = ctx.measureText(principal).width;
  ctx.font = '600 36px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#b3d8d9';
  ctx.fillText(`${sufijo}  ≈ ${secundario}`, 60 + anchoPrecio + 16, FOTO_H + 108);

  ctx.font = '600 40px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ajustarTexto(ctx, p.titulo, W - 120, 2).forEach((l, i) => ctx.fillText(l, 60, FOTO_H + 180 + i * 50));

  ctx.font = '500 34px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#d9ecec';
  ctx.fillText(`📍 ${[p.comuna, p.region].filter(Boolean).join(', ')}`, 60, FOTO_H + 305);
  const cars = caracteristicas(p).join('  ·  ');
  if (cars) ctx.fillText(cars, 60, FOTO_H + 360);

  ctx.font = '700 30px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#f59e0b';
  const pie = `${MARCA}  ·  ${TELEFONO}`;
  ctx.fillText(pie, W - 60 - ctx.measureText(pie).width, H - 40);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), 'image/jpeg', 0.9);
  });
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const nombreArchivo = (p, ext) =>
  `${sinTildes(`${p.comuna}-${p.titulo}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.${ext}`;
