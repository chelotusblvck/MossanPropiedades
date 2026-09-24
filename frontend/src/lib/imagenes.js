// Las fotos se achican en el navegador antes de subirlas: celulares y cámaras generan archivos de
// 5–15 MB que harían lenta la ficha pública.
const LADO_MAX = 2400;
const LIMITE_SIN_TOCAR = 1.5 * 1024 * 1024;

function cargar(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`No se pudo leer la imagen ${archivo.name}`)); };
    img.src = url;
  });
}

/** Devuelve el archivo tal cual si ya es liviano; si no, un JPEG de máx. 2400 px por lado. */
export async function prepararFoto(archivo) {
  const img = await cargar(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  if (escala === 1 && archivo.size <= LIMITE_SIN_TOCAR) return archivo;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * escala);
  canvas.height = Math.round(img.naturalHeight * escala);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // PNG con transparencia → fondo blanco en JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error(`No se pudo procesar la imagen ${archivo.name}`);
  return blob;
}

export const esImagenPermitida = (archivo) => ['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type);
