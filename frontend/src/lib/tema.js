// Línea gráfica en tiempo real: Tailwind v4 compila los colores como variables CSS
// (bg-brand-700 → var(--color-brand-700)), así que basta con redefinirlas en :root.

export const TEMA_POR_DEFECTO = { primario: '#1d5457', acento: '#f59e0b' };
const TONOS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
// Luminosidad (HSL) de cada tono en la paleta original y cuánto sigue al color elegido
const L_BASE = { 50: 95.5, 100: 89, 200: 78, 300: 62, 400: 46, 500: 34, 600: 27, 700: 23, 800: 19, 900: 16, 950: 9 };
const PESO = { 50: 0, 100: 0.15, 200: 0.3, 300: 0.5, 400: 0.7, 500: 0.85, 600: 0.95, 700: 1, 800: 0.8, 900: 0.6, 950: 0.3 };

// --- Conversión de colores ---

export function hexARgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbAHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

function rgbAHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslAHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbAHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

const hexAHsl = (hex) => rgbAHsl(...hexARgb(hex));

/** Contraste WCAG entre dos colores (1 a 21). Texto normal legible: ≥ 4,5. */
export function contraste(a, b) {
  const lum = (hex) => {
    const [r, g, bb] = hexARgb(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bb;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const esHex = (v) => /^#[0-9a-f]{6}$/i.test(v ?? '');

/**
 * Escala de 11 tonos a partir del color principal. El color elegido queda como tono 700 (el de botones y
 * encabezados, con texto blanco). Si es tan claro que el texto blanco no se leería, el 700 se oscurece.
 */
export function escala(hex) {
  const [h, s, l] = hexAHsl(hex);
  let l700 = l;
  while (l700 > 5 && contraste(hslAHex(h, s, l700), '#ffffff') < 4.5) l700 -= 1;
  const ajustado = l700 !== l;
  const delta = l700 - L_BASE[700];
  const tonos = {};
  for (const t of TONOS) {
    const lt = Math.min(98, Math.max(3, L_BASE[t] + delta * PESO[t]));
    const st = t <= 100 ? s * 0.6 : s; // los más claros, menos saturados (fondos suaves)
    tonos[t] = hslAHex(h, st, lt);
  }
  tonos[700] = ajustado ? hslAHex(h, s, l700) : hex.toLowerCase();
  return { tonos, ajustado };
}

/** Tonos del acento (botones de acción) y el color de texto más legible encima. */
export function escalaAcento(hex, oscuro) {
  const [h, s, l] = hexAHsl(hex);
  return {
    500: hex.toLowerCase(),
    400: hslAHex(h, s, Math.min(95, l + 8)),
    300: hslAHex(h, s, Math.min(96, l + 16)),
    contraste: contraste(hex, '#ffffff') >= contraste(hex, oscuro) ? '#ffffff' : oscuro,
  };
}

/** Variables CSS del tema (para :root o para una vista previa acotada a un contenedor). */
export function variablesTema(t) {
  const { tonos } = escala(esHex(t?.primario) ? t.primario : TEMA_POR_DEFECTO.primario);
  const acento = escalaAcento(esHex(t?.acento) ? t.acento : TEMA_POR_DEFECTO.acento, tonos[950]);
  const vars = {};
  for (const n of TONOS) vars[`--color-brand-${n}`] = tonos[n];
  vars['--color-acento-300'] = acento[300];
  vars['--color-acento-400'] = acento[400];
  vars['--color-acento-500'] = acento[500];
  vars['--color-acento-contraste'] = acento.contraste;
  const familia = familiaCss(t?.fuente);
  if (familia) {
    vars['--font-sans'] = familia;
    vars['--default-font-family'] = familia;
  }
  return vars;
}

// --- Tipografía ---

const FALLBACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const familiaCss = (f) => (f && f.tipo !== 'sistema' && f.familia ? `"${f.familia.replace(/"/g, '')}", ${FALLBACK}` : null);

/** Carga la tipografía: @font-face con los archivos del kit o una hoja de Google Fonts. */
export function cargarFuente(f) {
  document.getElementById('tema-fuente')?.remove();
  if (!f || f.tipo === 'sistema' || !f.familia) return;
  if (f.tipo === 'archivos') {
    const estilo = document.createElement('style');
    estilo.id = 'tema-fuente';
    estilo.textContent = (f.archivos ?? []).map((a) => `@font-face{font-family:"${f.familia.replace(/"/g, '')}";src:url("${encodeURI(a.url)}") format("${a.formato}");font-weight:${a.peso};font-style:${a.estilo};font-display:swap}`).join('\n');
    document.head.appendChild(estilo);
  } else if (f.tipo === 'google') {
    const enlace = document.createElement('link');
    enlace.id = 'tema-fuente';
    enlace.rel = 'stylesheet';
    const familia = encodeURIComponent(f.familia).replace(/%20/g, '+');
    enlace.href = `https://fonts.googleapis.com/css2?family=${familia}:wght@400;500;600;700;800&display=swap`;
    // Algunas familias no tienen todos los pesos: se reintenta sólo con el regular
    enlace.onerror = () => { enlace.onerror = null; enlace.href = `https://fonts.googleapis.com/css2?family=${familia}&display=swap`; };
    document.head.appendChild(enlace);
  }
}

/** Aplica el tema a todo el sitio (colores, tipografía y favicon). null = tema por defecto. */
export function aplicarTema(t) {
  const raiz = document.documentElement;
  const vars = variablesTema(t ?? TEMA_POR_DEFECTO);
  // Sin tema: se quitan las variables y rigen los colores originales exactos de index.css
  for (const [k, v] of Object.entries(vars)) {
    if (t) raiz.style.setProperty(k, v);
    else raiz.style.removeProperty(k);
  }
  if (!familiaCss(t?.fuente)) {
    raiz.style.removeProperty('--font-sans');
    raiz.style.removeProperty('--default-font-family');
  }
  cargarFuente(t?.fuente);
  if (t?.favicon) {
    let icono = document.querySelector('link[rel="icon"]');
    if (!icono) {
      icono = document.createElement('link');
      icono.rel = 'icon';
      document.head.appendChild(icono);
    }
    icono.href = t.favicon;
  }
}

// --- Sugerencia de colores desde el logo ---

/**
 * Colores dominantes de una imagen: descarta transparencias, blancos, negros y grises, agrupa por tono
 * y devuelve el más frecuente como principal y el siguiente bien distinto como acento.
 */
export function sugerirColores(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const lado = 64;
        const canvas = document.createElement('canvas');
        canvas.width = lado;
        canvas.height = lado;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, lado, lado);
        const datos = ctx.getImageData(0, 0, lado, lado).data;
        const grupos = new Map();
        for (let i = 0; i < datos.length; i += 4) {
          if (datos[i + 3] < 160) continue;
          const [h, s, l] = rgbAHsl(datos[i], datos[i + 1], datos[i + 2]);
          if (l > 92 || l < 8 || s < 18) continue;
          const g = Math.round(h / 15) % 24;
          const x = grupos.get(g) ?? { peso: 0, r: 0, gg: 0, b: 0, n: 0, h };
          x.peso += s / 100;
          x.r += datos[i]; x.gg += datos[i + 1]; x.b += datos[i + 2]; x.n++;
          grupos.set(g, x);
        }
        const orden = [...grupos.values()].sort((a, b) => b.peso - a.peso);
        const color = (x) => rgbAHex(x.r / x.n, x.gg / x.n, x.b / x.n);
        if (!orden.length) return resolve(null);
        const principal = orden[0];
        const distancia = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
        const acento = orden.find((x) => distancia(x.h, principal.h) >= 40);
        resolve({ primario: color(principal), acento: acento ? color(acento) : null });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** tema.json de ejemplo para el diseñador o la agencia. */
export const EJEMPLO_TEMA_JSON = {
  nombre: 'Línea gráfica 2026',
  colores: { primario: '#1d5457', acento: '#f59e0b' },
  logos: { principal: 'logos/logo-color.png', fondo_oscuro: 'logos/logo-blanco.svg', favicon: 'logos/favicon.png' },
  tipografia: { familia: 'Montserrat', _nota: 'Incluye los archivos .woff2 en la carpeta fuentes/, o usa { "google": "Montserrat" } para Google Fonts' },
};
