/**
 * Video tour o recorrido 360°: devuelve { tipo, embed } si se puede incrustar (YouTube, Vimeo,
 * Matterport) o { tipo: 'enlace' } para otros proveedores. null si la URL no es https válida.
 */
export function infoVideo(url) {
  let u;
  try {
    u = new URL(String(url ?? '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');

  if (host === 'youtube.com' || host === 'youtu.be') {
    const id = host === 'youtu.be'
      ? u.pathname.slice(1)
      : u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
    if (id && /^[\w-]{6,20}$/.test(id)) return { tipo: 'YouTube', embed: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = u.pathname.match(/(\d{6,})/)?.[1];
    if (id) return { tipo: 'Vimeo', embed: `https://player.vimeo.com/video/${id}` };
  }
  if (host === 'my.matterport.com' && u.searchParams.get('m')) {
    return { tipo: 'Recorrido 360° (Matterport)', embed: `https://my.matterport.com/show/?m=${encodeURIComponent(u.searchParams.get('m'))}` };
  }
  return { tipo: 'enlace', url: u.href };
}
