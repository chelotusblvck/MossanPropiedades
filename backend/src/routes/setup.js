import { Router } from 'express';
import path from 'node:path';
import * as Setup from '../services/setup.js';
import * as Tema from '../services/tema.js';
import { limitarSolicitudes } from '../middleware/rateLimit.js';

// Asistente de configuración inicial (/admin/setup)
const router = Router();

// Público: si falta completar el asistente (el panel redirige) y si es una instalación nueva (pide código)
router.get('/estado', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(Setup.estadoPublico());
});

// Todo lo demás: sesión de admin, o el código de instalación mientras no exista contraseña.
// El límite frena intentos de adivinar el código.
router.use(limitarSolicitudes({ ventanaMs: 15 * 60 * 1000, max: 60, mensaje: 'Demasiados intentos. Espera 15 minutos.' }));
router.use(Setup.requireSetup);

router.get('/datos', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(Setup.datos());
});

// Logo: cuerpo binario PNG/JPG/WEBP (máx. 2 MB)
router.post('/logo', async (req, res) => res.status(201).json(await Setup.subirLogo(req)));

// Kit de línea gráfica: ZIP con logos, fuentes, manual (PDF) y opcionalmente tema.json (máx. 50 MB)
router.post('/tema/zip', async (req, res) => res.status(201).json(await Tema.procesarZip(req)));

// Manual de marca u otro PDF del kit (privado: sólo desde el asistente)
router.get('/tema/:id/documento', (req, res) => {
  const ruta = Tema.rutaDocumento(req.params.id, req.query.archivo);
  if (!ruta) return res.status(404).json({ error: 'Documento no encontrado' });
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(ruta))}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.sendFile(ruta);
});

// { smtp: {...}, para: 'correo@...' }
router.post('/probar-correo', async (req, res) => res.json(await Setup.probarCorreo(req.body ?? {})));

// { corredora, finanzas, correo, pagos, seguridad }
router.post('/finalizar', (req, res) => res.json(Setup.finalizar(req.body ?? {})));

export default router;
