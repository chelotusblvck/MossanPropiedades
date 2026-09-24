// Vacío = misma URL del sitio (el backend sirve el frontend, como en Render). Sólo se define si la API
// vive en otro dominio.
const BASE = import.meta.env.VITE_API_URL || '';
const CLAVE_SESION = 'admin_token';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function leerToken() {
  try {
    return sessionStorage.getItem(CLAVE_SESION);
  } catch {
    return null;
  }
}

export function guardarToken(token) {
  try {
    if (token) sessionStorage.setItem(CLAVE_SESION, token);
    else sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    /* almacenamiento no disponible */
  }
}

export const haySesion = () => Boolean(leerToken());

// --- Modo "ver como usuario" (impersonación del admin) ---
// El token simulado va en sessionStorage (sólo esta pestaña) y separado del token real del portal:
// al salir se borra sin tocar la sesión de un cliente o propietario de verdad en este navegador.
const CLAVE_IMPERSONACION = 'impersonacion';

/** { tipo: 'cliente' | 'propietario', rut, nombre, token, expira } o null. */
export function impersonacionActiva() {
  try {
    const imp = JSON.parse(sessionStorage.getItem(CLAVE_IMPERSONACION) ?? 'null');
    if (imp && new Date(imp.expira) > new Date()) return imp;
    if (imp) sessionStorage.removeItem(CLAVE_IMPERSONACION); // vencida
  } catch {
    /* almacenamiento no disponible o dato corrupto */
  }
  return null;
}

export function terminarImpersonacion() {
  try {
    sessionStorage.removeItem(CLAVE_IMPERSONACION);
  } catch {
    /* almacenamiento no disponible */
  }
}

function iniciarImpersonacion(r) {
  try {
    sessionStorage.setItem(CLAVE_IMPERSONACION, JSON.stringify({ tipo: r.tipo, rut: r.rut, nombre: r.nombre, token: r.token, expira: r.expira, previa: Boolean(r.previa) }));
  } catch {
    throw new ApiError('El navegador no permite guardar la sesión simulada', 0);
  }
}

// Sesiones de los portales públicos: cada uno con su token, recordado en este navegador.
// Si el admin está "viendo como" un usuario de este portal, se usa el token simulado.
function sesionLocal(clave, tipo) {
  const simulada = () => {
    const imp = impersonacionActiva();
    return imp?.tipo === tipo ? imp : null;
  };
  return {
    leer() {
      if (simulada()) return simulada().token;
      try {
        return localStorage.getItem(clave);
      } catch {
        return null;
      }
    },
    guardar(token) {
      if (!token && simulada()) return terminarImpersonacion(); // p. ej. 401: sólo se descarta la simulada
      try {
        if (token) localStorage.setItem(clave, token);
        else localStorage.removeItem(clave);
      } catch {
        /* almacenamiento no disponible */
      }
    },
  };
}
const sesionAdmin = { leer: leerToken, guardar: guardarToken };
const sesionCliente = sesionLocal('cliente_token', 'cliente');
const sesionPropietario = sesionLocal('propietario_token', 'propietario');
export const haySesionCliente = () => Boolean(sesionCliente.leer());
export const haySesionPropietario = () => Boolean(sesionPropietario.leer());

function sesionDe({ admin, cliente, propietario }) {
  if (admin) return sesionAdmin;
  if (cliente) return sesionCliente;
  if (propietario) return sesionPropietario;
  return null;
}

async function pedir(ruta, { method = 'GET', params, body, headers: extra, ...quien } = {}) {
  const qs = new URLSearchParams(
    Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString();
  const headers = { Accept: 'application/json', ...extra };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const sesion = sesionDe(quien);
  if (sesion?.leer()) headers.Authorization = `Bearer ${sesion.leer()}`;

  const res = await fetch(`${BASE}/api${ruta}${qs ? `?${qs}` : ''}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (sesion && res.status === 401) sesion.guardar(null);
    throw new ApiError(data.error ?? data.errores?.[0] ?? `Error ${res.status}`, res.status);
  }
  return data;
}

/** Petición con cuerpo o respuesta binaria (respaldos, comprobantes). Por defecto con la sesión admin. */
async function pedirBinario(ruta, { method = 'GET', params, archivo, propietario = false, headers: extra } = {}) {
  const qs = new URLSearchParams(params ?? {}).toString();
  const sesion = propietario ? sesionPropietario : sesionAdmin;
  const headers = { ...extra };
  if (sesion.leer()) headers.Authorization = `Bearer ${sesion.leer()}`;
  if (archivo) headers['Content-Type'] = 'application/octet-stream';
  const res = await fetch(`${BASE}/api${ruta}${qs ? `?${qs}` : ''}`, { method, headers, body: archivo });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) sesion.guardar(null);
    throw new ApiError(data.error ?? `Error ${res.status}`, res.status);
  }
  return res;
}

/** Descarga un archivo protegido (blob) con el nombre que indica el servidor. */
async function guardarDescarga(res, nombrePorDefecto) {
  const nombre = decodeURIComponent(res.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? '') || nombrePorDefecto;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  propiedades: (filtros) => pedir('/propiedades', { params: filtros }),
  destacadas: (grupo) => pedir('/propiedades/destacadas', { params: { grupo } }),
  propiedad: (id) => pedir(`/propiedades/${id}`),
  disponibilidad: (id) => pedir(`/propiedades/${id}/disponibilidad`),
  reservar: (id, datos) => pedir(`/propiedades/${id}/reservas`, { method: 'POST', body: datos }),
  validarCupon: (id, rut, cupon) => pedir(`/propiedades/${id}/cupon`, { method: 'POST', body: { rut, cupon } }),
  comunas: () => pedir('/propiedades/comunas'),
  solicitarVisita: (id, datos) => pedir(`/propiedades/${id}/visitas`, { method: 'POST', body: datos }),
  pago: (codigo) => pedir(`/pagos/${codigo}`),
  pagarWebpay: (codigo) => pedir(`/pagos/${codigo}/webpay`, { method: 'POST', body: {} }),
  pagarMercadoPago: (codigo) => pedir(`/pagos/${codigo}/mercadopago`, { method: 'POST', body: {} }),
  informarTransferencia: (codigo, datos) => pedir(`/pagos/${codigo}/transferencia`, { method: 'POST', body: datos }),
  uf: () => pedir('/indicadores/uf'),
};

export const cuentaApi = {
  identificar: (rut, email) => pedir('/cuenta/identificar', { method: 'POST', body: { rut, email } }),
  solicitarCodigo: (rut, email) => pedir('/cuenta/codigo', { method: 'POST', body: { rut, email } }),
  async verificarCodigo(rut, codigo) {
    const r = await pedir('/cuenta/verificar', { method: 'POST', body: { rut, codigo } });
    sesionCliente.guardar(r.token);
    return r;
  },
  salir: () => sesionCliente.guardar(null),
  miCuenta: () => pedir('/cuenta', { cliente: true }),
  actualizar: (cambios) => pedir('/cuenta', { method: 'PATCH', body: cambios, cliente: true }),
  cancelarVisita: (id) => pedir(`/cuenta/visitas/${id}/cancelar`, { method: 'POST', cliente: true }),
  reprogramarVisita: (id, datos) => pedir(`/cuenta/visitas/${id}/reprogramar`, { method: 'POST', body: datos, cliente: true }),
};

// Asistente de configuración: con la sesión admin o, en una instalación nueva, con el código de instalación
const CLAVE_CODIGO_SETUP = 'setup_codigo';
const codigoSetup = () => {
  try {
    return sessionStorage.getItem(CLAVE_CODIGO_SETUP);
  } catch {
    return null;
  }
};
const cabecerasSetup = () => (codigoSetup() ? { 'x-setup-token': codigoSetup() } : {});

export const setupApi = {
  estado: () => pedir('/setup/estado'),
  guardarCodigo(codigo) {
    try {
      if (codigo) sessionStorage.setItem(CLAVE_CODIGO_SETUP, codigo.trim().toUpperCase());
      else sessionStorage.removeItem(CLAVE_CODIGO_SETUP);
    } catch {
      /* almacenamiento no disponible */
    }
  },
  datos: () => pedir('/setup/datos', { admin: true, headers: cabecerasSetup() }),
  subirLogo: async (archivo) => (await pedirBinario('/setup/logo', { method: 'POST', archivo, headers: cabecerasSetup() })).json(),
  subirKitTema: async (zip) => (await pedirBinario('/setup/tema/zip', { method: 'POST', archivo: zip, headers: cabecerasSetup() })).json(),
  descargarDocumentoTema: async (id, archivo, nombre) => guardarDescarga(
    await pedirBinario(`/setup/tema/${id}/documento`, { params: { archivo }, headers: cabecerasSetup() }),
    nombre,
  ),
  probarCorreo: (datos) => pedir('/setup/probar-correo', { method: 'POST', body: datos, admin: true, headers: cabecerasSetup() }),
  async finalizar(datos) {
    const r = await pedir('/setup/finalizar', { method: 'POST', body: datos, admin: true, headers: cabecerasSetup() });
    guardarToken(r.sesion.token); // la contraseña cambió: queda la sesión nueva
    setupApi.guardarCodigo(null);
    return r;
  },
};

export const propietarioApi = {
  solicitarCodigo: (identificador) => pedir('/propietario/login/codigo', { method: 'POST', body: { identificador } }),
  async verificarCodigo(identificador, codigo) {
    const r = await pedir('/propietario/login/verificar', { method: 'POST', body: { identificador, codigo } });
    sesionPropietario.guardar(r.token);
    return r;
  },
  async canjearEnlace(token) {
    const r = await pedir('/propietario/login/enlace', { method: 'POST', body: { token } });
    sesionPropietario.guardar(r.token);
    return r;
  },
  salir: () => sesionPropietario.guardar(null),
  panel: () => pedir('/propietario', { propietario: true }),
  calendario: (params) => pedir('/propietario/calendario', { params, propietario: true }),
  descargarComprobante: async (lote) => guardarDescarga(await pedirBinario(`/propietario/liquidaciones/${lote}/comprobante`, { propietario: true }), 'comprobante'),
};

export const adminApi = {
  async login(password) {
    const { token } = await pedir('/admin/login', { method: 'POST', body: { password } });
    guardarToken(token);
  },
  logout: () => guardarToken(null),
  inventario: (params) => pedir('/admin/inventario', { params, admin: true }),
  reservas: (params) => pedir('/admin/reservas', { params, admin: true }),
  visitas: (params) => pedir('/admin/visitas', { params, admin: true }),
  actualizarVisita: (id, cambios) => pedir(`/admin/visitas/${id}`, { method: 'PATCH', body: cambios, admin: true }),
  cambiarPlazoReserva: (id, horas) => pedir(`/admin/reservas/${id}/plazo`, { method: 'PATCH', body: { horas }, admin: true }),
  cambiarEstadoReserva: (id, estado_pago) => pedir(`/admin/reservas/${id}`, { method: 'PATCH', body: { estado_pago }, admin: true }),
  ocupacion: (propiedadId) => pedir(`/admin/propiedades/${propiedadId}/ocupacion`, { admin: true }),
  crearBloqueo: (propiedadId, datos) => pedir(`/admin/propiedades/${propiedadId}/bloqueos`, { method: 'POST', body: datos, admin: true }),
  eliminarBloqueo: (id) => pedir(`/admin/bloqueos/${id}`, { method: 'DELETE', admin: true }),
  agenda: (params) => pedir('/admin/agenda', { params, admin: true }),
  guardarTarea: (reservaId, tipo, cambios) => pedir(`/admin/agenda/tareas/${reservaId}/${tipo}`, { method: 'PUT', body: cambios, admin: true }),
  crearPersona: (datos) => pedir('/admin/personal', { method: 'POST', body: datos, admin: true }),
  eliminarPersona: (id) => pedir(`/admin/personal/${id}`, { method: 'DELETE', admin: true }),
  respaldos: () => pedir('/admin/backups', { admin: true }),
  crearRespaldo: (imagenes) => pedir('/admin/backups/crear', { method: 'POST', body: { imagenes }, admin: true }),
  restaurarRespaldo: (datos) => pedir('/admin/backups/restaurar', { method: 'POST', body: datos, admin: true }),
  restaurarDesdeArchivo: async (archivo, confirmar) => (
    await pedirBinario('/admin/backups/restaurar', { method: 'POST', params: { confirmar }, archivo })
  ).json(),
  descargarRespaldo: async (nombre) => guardarDescarga(await pedirBinario(`/admin/backups/descargar/${encodeURIComponent(nombre)}`), nombre),
  adjuntarComprobante: async (lote, archivo) => (
    await pedirBinario(`/admin/finanzas/lotes/${lote}/comprobante`, { method: 'POST', params: { nombre: archivo.name }, archivo })
  ).json(),
  descargarComprobante: async (lote) => guardarDescarga(await pedirBinario(`/admin/finanzas/lotes/${lote}/comprobante`), 'comprobante'),
  estadoSistema: () => pedir('/admin/estado-sistema', { admin: true }),
  propietarios: (q) => pedir('/admin/propietarios', { params: { q }, admin: true }),
  opcionesImpersonacion: (tipo, q) => pedir('/admin/impersonar/opciones', { params: { tipo, q }, admin: true }),
  /** Abre el portal del cliente o propietario en modo sólo lectura (el servidor lo registra). */
  // clienteId (directorio de clientes): también sirve para clientes sin cuenta web (vista previa)
  async verComo(tipo, rut, clienteId) {
    const r = await pedir('/admin/impersonar', { method: 'POST', body: clienteId ? { tipo, cliente_id: clienteId } : { tipo, rut }, admin: true });
    iniciarImpersonacion(r);
    return r;
  },
  wizardCondiciones: () => pedir('/admin/wizard/condiciones', { admin: true }),
  buscarPropietarios: (q) => pedir('/admin/propietarios', { params: { q }, admin: true }),
  guardarBorrador: (datos) => pedir('/admin/propiedades/borrador', { method: 'POST', body: datos, admin: true }),
  subirFotoPropiedad: async (id, archivo) => (await pedirBinario(`/admin/propiedades/${id}/imagenes`, { method: 'POST', archivo })).json(),
  publicarPropiedad: (id, datos) => pedir(`/admin/propiedades/${id}/publicar`, { method: 'POST', body: datos, admin: true }),
  bienvenidaPropietario: (rut) => pedir(`/admin/propietarios/${encodeURIComponent(rut)}/bienvenida`, { method: 'POST', admin: true }),
  clientes: () => pedir('/admin/clientes', { admin: true }),
  cliente: (id) => pedir(`/admin/clientes/${encodeURIComponent(id)}`, { admin: true }),
  actualizarCliente: (id, cambios) => pedir(`/admin/clientes/${encodeURIComponent(id)}`, { method: 'PUT', body: cambios, admin: true }),
  finanzas: (params) => pedir('/admin/finanzas', { params, admin: true }),
  liquidar: (datos) => pedir('/admin/finanzas/liquidaciones', { method: 'POST', body: datos, admin: true }),
  deshacerLiquidacion: (reservaId) => pedir(`/admin/finanzas/liquidaciones/${reservaId}`, { method: 'DELETE', admin: true }),
  actualizarPropiedad:(id, cambios) => pedir(`/propiedades/${id}`, { method: 'PUT', body: cambios, admin: true }),
  // accion: desactivar | activar | eliminar (papelera) | restaurar
  estadoPropiedad: (id, accion) => pedir(`/admin/propiedades/${id}/estado`, { method: 'POST', body: { accion }, admin: true }),
  impactoPropiedad: (id) => pedir(`/admin/propiedades/${id}/impacto`, { admin: true }),
  estadoPortal: () => pedir('/mercadolibre/status', { admin: true }),
  sincronizarPortal: () => pedir('/mercadolibre/sync', { method: 'POST', admin: true }),
};
