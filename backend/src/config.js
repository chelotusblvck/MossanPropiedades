import 'dotenv/config';
import path from 'node:path';

// DATA_DIR: una sola carpeta para todo lo que se escribe (base, imágenes, respaldos). En Render apunta
// al disco persistente. DB_PATH / UPLOADS_DIR / BACKUP_DIR, si se definen, siguen teniendo prioridad.
const DATA_DIR = process.env.DATA_DIR || '';
const enDatos = (nombre, porDefecto) => (DATA_DIR ? path.join(DATA_DIR, nombre) : porDefecto);

export const config = {
  port: Number(process.env.PORT) || 4000,
  dataDir: DATA_DIR,
  dbPath: process.env.DB_PATH || enDatos('propiedades.db', './data/propiedades.db'),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  adminApiKey: process.env.ADMIN_API_KEY || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // true si el servidor corre detrás de un proxy (Nginx, Render, Railway...) para obtener la IP real
  trustProxy: process.env.TRUST_PROXY === 'true',
  ufFallback: Number(process.env.UF_FALLBACK) || 40000,
  // URL pública del sitio (para los enlaces de los correos)
  // RENDER_EXTERNAL_URL la define Render automáticamente (https://<servicio>.onrender.com)
  siteUrl: (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
  // Comisión del corredor por defecto (cada propiedad puede tener la suya)
  comision: {
    ventaPct: Number(process.env.COMISION_VENTA_PCT ?? 2),        // % del precio de venta
    arriendoPct: Number(process.env.COMISION_ARRIENDO_PCT ?? 50), // % de un mes de arriendo
    diarioPct: Number(process.env.COMISION_DIARIO_PCT ?? 20),     // arriendo diario: % de lo cobrado por noches
    masIva: process.env.COMISION_MAS_IVA !== 'false',             // + IVA 19 %
  },
  reservas: {
    // Horas para pagar una reserva pendiente antes de liberarla (0 = nunca vence)
    plazoPagoHoras: Math.max(0, Number(process.env.RESERVA_PLAZO_PAGO_HORAS ?? 24) || 0),
  },
  pagos: {
    webpay: {
      // '' = desactivado · 'integracion' = ambiente de pruebas de Transbank · 'produccion'
      ambiente: process.env.WEBPAY_AMBIENTE || '',
      codigoComercio: process.env.WEBPAY_CODIGO_COMERCIO || '',
      apiKey: process.env.WEBPAY_API_KEY || '',
    },
    mercadopago: {
      // Access token de la cuenta Mercado Pago de la corredora (la misma de Mercado Libre)
      accessToken: process.env.MP_ACCESS_TOKEN || '',
    },
    transferencia: {
      banco: process.env.BANCO_NOMBRE || '',
      tipoCuenta: process.env.BANCO_TIPO_CUENTA || '',
      numeroCuenta: process.env.BANCO_NUMERO_CUENTA || '',
      titular: process.env.BANCO_TITULAR || '',
      rut: process.env.BANCO_RUT || '',
      email: process.env.BANCO_EMAIL || '',
    },
  },
  agenda: {
    horaCheckin: process.env.HORA_CHECKIN || '15:00',
    horaCheckout: process.env.HORA_CHECKOUT || '11:00',
    // Punto de partida de la ruta de llaves (ej. dirección de la oficina). Vacío = parte en la primera parada.
    origenRuta: process.env.ORIGEN_RUTA || '',
  },
  respaldos: {
    dir: process.env.BACKUP_DIR || enDatos('backups', './backups'),
    // Carpeta de imágenes subidas al servidor que se comprime en cada respaldo
    uploadsDir: process.env.UPLOADS_DIR || enDatos('uploads', './uploads'),
    auto: process.env.BACKUP_AUTO !== 'false',
    hora: Math.min(Math.max(Number(process.env.BACKUP_HORA ?? 2) || 0, 0), 23), // hora de Chile del respaldo diario
    conservar: Math.max(Number(process.env.BACKUP_CONSERVAR) || 30, 1),        // respaldos automáticos que se guardan
    // Al iniciar el servidor sólo se respalda si el último automático tiene más de estas horas
    // (evita llenar la rotación con los reinicios de "npm run dev")
    minHorasInicio: Math.max(Number(process.env.BACKUP_MIN_HORAS_INICIO ?? 6) || 0, 0),
    maxSubidaMB: Math.max(Number(process.env.BACKUP_MAX_SUBIDA_MB) || 1024, 1),
  },
  // WhatsApp Cloud API (Meta) para enviar códigos de acceso. Vacío = los códigos se envían sólo por correo.
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    // Plantilla de categoría "Autenticación" aprobada en Meta (cuerpo con el código + botón "copiar código")
    plantillaCodigo: process.env.WHATSAPP_PLANTILLA_CODIGO || '',
    idioma: process.env.WHATSAPP_IDIOMA || 'es',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
  },
  // Datos de la corredora. El asistente de configuración (/admin/setup) los guarda en la base de datos
  // y reemplazan a estos valores (ver models/ajustes.js).
  marca: {
    nombre: process.env.BRAND_NAME || 'Mi Inmobiliaria',
    telefono: process.env.CONTACT_PHONE || '',
    email: process.env.CONTACT_EMAIL || '',
    rut: '',
    direccion: '',
    logo: null,
  },
  liquidacion: {
    // Aseo por estadía que se descuenta al propietario cuando la propiedad no define el suyo
    aseoBaseClp: Math.max(Number(process.env.ASEO_BASE_CLP) || 0, 0),
  },
  // Hash (scrypt) de la contraseña del panel definida en el asistente; reemplaza a ADMIN_PASSWORD
  adminPasswordHash: null,
  // Línea gráfica del asistente (colores, logos, tipografía). null = tema por defecto del sitio.
  tema: null,
  correo: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true para el puerto 465
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
    // Destinatarios de los avisos internos (separados por coma)
    avisosA: (process.env.NOTIFY_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean),
    confirmarAlCliente: process.env.NOTIFY_CLIENT !== 'false',
  },
  meli: {
    clientId: process.env.MELI_CLIENT_ID || '',
    clientSecret: process.env.MELI_CLIENT_SECRET || '',
    redirectUri: process.env.MELI_REDIRECT_URI || 'http://localhost:4000/api/mercadolibre/callback',
    authUrl: process.env.MELI_AUTH_URL || 'https://auth.mercadolibre.cl/authorization',
    apiUrl: process.env.MELI_API_URL || 'https://api.mercadolibre.com',
    usePkce: process.env.MELI_USE_PKCE !== 'false',
    syncIntervalMinutes: Number(process.env.MELI_SYNC_INTERVAL_MINUTES) || 0,
  },
};

export const meliConfigurado = () => Boolean(config.meli.clientId && config.meli.clientSecret);
