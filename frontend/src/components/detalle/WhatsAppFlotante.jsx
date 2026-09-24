import { telefonoWhatsApp, urlPropiedad } from '../../lib/marca';

/** Botón fijo abajo a la derecha con un mensaje prearmado sobre la propiedad. */
export default function WhatsAppFlotante({ propiedad: p, precio }) {
  const mensaje = `Hola, me interesa la propiedad "${p.titulo}"${precio ? ` (${precio})` : ''} en ${p.comuna}: ${urlPropiedad(p.id)} ¿Sigue disponible?`;
  return (
    <a
      href={`https://wa.me/${telefonoWhatsApp()}?text=${encodeURIComponent(mensaje)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contactar por WhatsApp"
      className="group fixed right-4 z-40 flex items-center gap-2 rounded-full bg-[#25D366] p-3.5 text-white shadow-xl shadow-emerald-900/20 transition hover:scale-105 hover:bg-[#1ebe5a] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 sm:right-6 sm:px-5"
      style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Logotipo de WhatsApp */}
      <svg viewBox="0 0 24 24" className="size-7 shrink-0 fill-current" aria-hidden="true">
        <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.56.93.95-3.47-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43a9.37 9.37 0 0 1 6.67 2.77 9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.23 9.43-9.44 9.43m8.03-17.46A11.3 11.3 0 0 0 12.05.7C5.8.7.7 5.8.7 12.05c0 2 .52 3.95 1.52 5.67L.6 23.6l6.02-1.58a11.3 11.3 0 0 0 5.42 1.38h.01c6.26 0 11.35-5.1 11.35-11.35 0-3.03-1.18-5.88-3.33-8.02" />
      </svg>
      <span className="hidden font-semibold sm:inline">WhatsApp</span>
    </a>
  );
}
