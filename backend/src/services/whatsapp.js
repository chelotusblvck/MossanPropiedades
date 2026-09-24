import { config } from '../config.js';
import { normalizarTelefono } from '../lib/identidad.js';

const c = config.whatsapp;
export const whatsappConfigurado = () => Boolean(c.token && c.phoneNumberId && c.plantillaCodigo);

/**
 * Envía un código de acceso con una plantilla de autenticación de WhatsApp Cloud API.
 * Devuelve true si Meta aceptó el mensaje. Nunca lanza (el correo sigue siendo el respaldo).
 */
export async function enviarCodigoWhatsApp(telefono, codigo) {
  const numero = normalizarTelefono(telefono);
  if (!whatsappConfigurado() || !numero || numero.length !== 9) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/${c.apiVersion}/${c.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: `56${numero}`,
        type: 'template',
        template: {
          name: c.plantillaCodigo,
          language: { code: c.idioma },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: codigo }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] },
          ],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      console.error(`[whatsapp] Error ${res.status} enviando código: ${detalle.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[whatsapp] No se pudo enviar el código:', err.message);
    return false;
  }
}
