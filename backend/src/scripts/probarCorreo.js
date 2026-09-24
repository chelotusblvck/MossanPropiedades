// Verifica la configuración SMTP y envía un correo de prueba: npm run probar-correo [destino@ejemplo.cl]
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { enviarCorreo, smtpConfigurado } from '../services/email.js';

const destino = process.argv[2] || config.correo.avisosA[0];
if (!destino) {
  console.error('Indica un destinatario (npm run probar-correo tu@correo.cl) o configura NOTIFY_EMAIL en backend/.env');
  process.exit(1);
}

if (smtpConfigurado()) {
  const { host, port, secure, user, pass } = config.correo;
  try {
    await nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined }).verify();
    console.log(`✔ Conexión SMTP OK (${host}:${port})`);
  } catch (err) {
    console.error(`✘ No se pudo conectar a ${host}:${port}: ${err.message}`);
    process.exit(1);
  }
} else {
  console.log('SMTP_HOST no configurado: el correo se mostrará aquí en lugar de enviarse.');
}

await enviarCorreo({
  to: destino,
  subject: `Correo de prueba – ${config.marca.nombre}`,
  text: 'Si recibes este mensaje, los avisos de reservas están bien configurados.',
  html: '<p>Si recibes este mensaje, los <b>avisos de reservas</b> están bien configurados.</p>',
});
console.log(smtpConfigurado() ? `✔ Correo de prueba enviado a ${destino}` : '✔ Listo');
