import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db } from './db/database.js';
import * as Ajustes from './models/ajustes.js'; // aplica la configuración del asistente sobre `config` antes que el resto
import propiedadesRouter from './routes/propiedades.js';
import mercadolibreRouter from './routes/mercadolibre.js';
import adminRouter from './routes/admin.js';
import pagosRouter from './routes/pagos.js';
import cuentaRouter from './routes/cuenta.js';
import propietarioRouter from './routes/propietario.js';
import { repararDatos as repararDatosPropietarios } from './models/propietario.js';
import { iniciarLiberacionAutomatica } from './services/liberacion.js';
import { iniciarRespaldosAutomaticos } from './services/respaldos.js';
import { DIR_IMAGENES, URL_IMAGENES } from './services/publicacion.js';
import setupRouter from './routes/setup.js';
import { DIR_MARCA, URL_MARCA, sitioPublico, prepararCodigoInstalacion } from './services/setup.js';
import { DIR_TEMA, URL_TEMA } from './services/tema.js';
import { obtenerUF } from './services/uf.js';
import { recalcularPrecios } from './models/propiedad.js';
import { sincronizar } from './services/mercadolibre/sync.js';
import { usuarioConectado } from './services/mercadolibre/oauth.js';

// Demo (DEMO_SEED=true): si la base está vacía, carga las propiedades de ejemplo. Nunca toca una base con
// datos (el seed borra las propiedades manuales), así que es seguro dejarlo activo con un disco persistente.
if (process.env.DEMO_SEED === 'true' && !db.prepare('SELECT COUNT(*) n FROM propiedades').get().n) {
  console.log('[demo] Base vacía: cargando datos de ejemplo…');
  await import('./db/seed.js');
  // Con ADMIN_PASSWORD definida, el panel queda listo para mostrar sin pasar por el asistente de configuración
  if (config.adminPassword && !Ajustes.setupCompletado()) {
    Ajustes.guardar('setup', { completado_en: new Date().toISOString(), version: 1, demo: true });
    Ajustes.aplicar();
  }
}

// Cuentas de propietarios para las propiedades que ya tienen RUT (y datos antiguos normalizados)
repararDatosPropietarios();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' })); // retorno de Webpay por POST

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/indicadores/uf', async (req, res) => {
  const { valor, fecha, fuente } = await obtenerUF();
  res.json({ valor, fecha, fuente });
});
// Fotos de propiedades y logo de la corredora (sólo estas subcarpetas de UPLOADS_DIR son públicas)
const estaticoPublico = {
  index: false,
  dotfiles: 'ignore',
  maxAge: '30d',
  immutable: true, // cada archivo tiene un nombre único
  setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
};
app.use(URL_IMAGENES, express.static(DIR_IMAGENES, estaticoPublico));
app.use(URL_MARCA, express.static(DIR_MARCA, estaticoPublico));
// Kit de línea gráfica (logos y fuentes). Incluye SVG: la CSP impide que un SVG abierto directamente
// ejecute scripts (como <img> o fuente nunca se ejecutan).
app.use(URL_TEMA, express.static(DIR_TEMA, {
  ...estaticoPublico,
  setHeaders: (res) => res.set({
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
  }),
}));

// Nombre, contacto y logo de la corredora para el sitio público
app.get('/api/sitio', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(sitioPublico());
});
app.use('/api/setup', setupRouter);
app.use('/api/propiedades', propiedadesRouter);
app.use('/api/mercadolibre', mercadolibreRouter);
app.use('/api/admin', adminRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/cuenta', cuentaRouter);
app.use('/api/propietario', propietarioRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// En producción (Render) servimos el build del frontend desde el mismo servidor
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (fs.existsSync(distDir)) {
  // /assets lleva un hash en el nombre: se puede cachear un año. index.html nunca (así un deploy se ve al tiro).
  app.use('/assets', express.static(path.join(distDir, 'assets'), { maxAge: '1y', immutable: true, fallthrough: false }));
  app.use(express.static(distDir, { index: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));
  // SPA: cualquier otra ruta (que no sea /media ni un archivo) devuelve index.html y la resuelve React Router
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/media/') || path.extname(req.path)) return next();
    res.set('Cache-Control', 'no-cache').sendFile(path.join(distDir, 'index.html'));
  });
  console.log(`Sirviendo el frontend desde ${distDir}`);
}

app.use((err, req, res, next) => {
  const conocido = err.status >= 400 && err.status < 600;
  if (!conocido) console.error(err);
  res.status(conocido ? err.status : 500).json({ error: conocido ? err.message : 'Error interno del servidor' });
});

async function actualizarPreciosConUF() {
  const { valor, fuente } = await obtenerUF();
  // No reescribimos todos los precios con un valor UF de respaldo
  if (fuente !== 'respaldo') recalcularPrecios(valor);
}

app.listen(config.port, () => {
  console.log(`API escuchando en http://localhost:${config.port}`);
  actualizarPreciosConUF().catch((err) => console.error('[uf]', err.message));
  iniciarLiberacionAutomatica();
  iniciarRespaldosAutomaticos();
  prepararCodigoInstalacion(); // sólo en una instalación nueva (sin contraseña del panel)
  setInterval(() => actualizarPreciosConUF().catch((err) => console.error('[uf]', err.message)), 6 * 60 * 60 * 1000);

  if (config.meli.syncIntervalMinutes > 0) {
    setInterval(() => {
      if (!usuarioConectado()) return;
      sincronizar().catch((err) => console.error('[meli] Error en sincronización programada:', err.message));
    }, config.meli.syncIntervalMinutes * 60 * 1000);
    console.log(`[meli] Sincronización automática cada ${config.meli.syncIntervalMinutes} min`);
  }
});
