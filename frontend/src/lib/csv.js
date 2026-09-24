// CSV para Excel en español: separador ";" y BOM para que respete los acentos

function celda(v) {
  if (v == null) return '';
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columnas: [[titulo, (fila) => valor], ...] */
export function descargarCSV(nombreArchivo, columnas, filas) {
  const lineas = [
    columnas.map(([t]) => t).join(';'),
    ...filas.map((f) => columnas.map(([, get]) => celda(get(f))).join(';')),
  ];
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
