// Base inicial de la demo (DEMO_DB=./demo/propiedades.db): si en la ruta de la base todavía no hay nada
// (primer arranque en Render, o disco efímero del plan gratis), copia la base exportada con
// scripts/exportar-demo.mjs y sus fotos. Nunca reemplaza una base existente.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export function prepararBaseDemo(dbPath) {
  const origen = process.env.DEMO_DB ? path.resolve(process.env.DEMO_DB) : null;
  if (!origen || fs.existsSync(dbPath)) return;
  if (!fs.existsSync(origen)) {
    console.warn(`[demo] DEMO_DB no existe (${origen}): se inicia con una base vacía`);
    return;
  }
  fs.copyFileSync(origen, dbPath);
  const fotos = path.join(path.dirname(origen), 'uploads');
  if (fs.existsSync(fotos)) {
    // force: false → no pisa archivos que ya estén en el disco
    fs.cpSync(fotos, path.resolve(config.respaldos.uploadsDir), { recursive: true, force: false });
  }
  console.log(`[demo] Base inicial copiada desde ${origen}`);
}
