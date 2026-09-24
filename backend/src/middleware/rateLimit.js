/**
 * Límite simple en memoria (suficiente para un solo proceso). Por defecto cuenta por IP;
 * `clave(req)` permite contar por otro dato (p. ej. el RUT). Si devuelve null no se limita.
 */
export function limitarSolicitudes({ ventanaMs, max, mensaje = 'Demasiadas solicitudes, intenta más tarde', clave = (req) => req.ip }) {
  const registros = new Map();
  return (req, res, next) => {
    const k = clave(req);
    if (k == null) return next();
    const ahora = Date.now();
    const recientes = (registros.get(k) ?? []).filter((t) => ahora - t < ventanaMs);
    if (recientes.length >= max) return res.status(429).json({ error: mensaje });
    recientes.push(ahora);
    registros.set(k, recientes);
    if (registros.size > 10_000) registros.clear();
    next();
  };
}
