// Wizard de publicación: el borrador se crea oculto (estado inactiva), luego se suben las fotos y al final
// se publica. Si algo falla a mitad de camino, el wizard reintenta sobre el mismo borrador.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { transaccion } from '../db/database.js';
import { config } from '../config.js';
import * as Propiedad from '../models/propiedad.js';
import * as Propietario from '../models/propietario.js';
import { obtenerUF } from './uf.js';
import { detectarTipo, recibirArchivo } from '../lib/archivos.js';

// Sólo esta subcarpeta de UPLOADS_DIR se publica (en /media/propiedades); "privado" nunca se sirve
export const DIR_IMAGENES = path.join(path.resolve(config.respaldos.uploadsDir), 'propiedades');
export const URL_IMAGENES = '/media/propiedades';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_IMAGENES = 40;

export class PublicacionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const num = (v) => (v === '' || v == null ? null : Number(v));
const texto = (v) => (typeof v === 'string' ? v.trim() : '');

/** Sólo los campos que el wizard puede definir (nada de estado, origen, destacada ni datos del propietario). */
function datosPropiedad(d) {
  const diario = d.modalidad === 'arriendo_diario';
  const venta = d.modalidad === 'venta';
  const enUF = !diario && d.moneda_original === 'UF';
  return {
    titulo: texto(d.titulo),
    descripcion: texto(d.descripcion),
    modalidad: d.modalidad,
    tipo: d.tipo,
    comuna: texto(d.comuna),
    region: texto(d.region) || null,
    direccion: texto(d.direccion) || null,
    habitaciones: num(d.habitaciones) ?? 0,
    banos: num(d.banos) ?? 0,
    estacionamientos: num(d.estacionamientos) ?? 0,
    bodegas: num(d.bodegas) ?? 0,
    superficie_util: num(d.superficie_util),
    superficie_total: num(d.superficie_total),
    gastos_comunes_clp: num(d.gastos_comunes_clp),
    orientacion: d.orientacion || null,
    amoblado: d.amoblado == null || d.amoblado === '' ? null : Boolean(d.amoblado),
    mascotas: venta || d.mascotas == null || d.mascotas === '' ? null : Boolean(d.mascotas),
    moneda_original: enUF ? 'UF' : 'CLP',
    precio_uf: enUF ? num(d.precio) : null,
    precio_clp: enUF ? null : num(d.precio),
    garantia_meses: diario || venta ? null : num(d.garantia_meses),
    comision_pct: diario ? null : num(d.comision_pct),
    comision_diario_pct: diario ? num(d.comision_diario_pct) : null,
    aseo_clp: diario ? num(d.aseo_clp) : null,
    hora_checkin: diario ? d.hora_checkin || null : null,
    hora_checkout: diario ? d.hora_checkout || null : null,
    video_url: texto(d.video_url) || null,
  };
}

/**
 * Paso final (1/3): valida todo, guarda la ficha del propietario y crea la propiedad oculta.
 * Si `propiedadId` viene (reintento), actualiza ese borrador en vez de crear otro.
 */
export async function guardarBorrador({ propietario, propiedad, propiedadId } = {}) {
  const datos = datosPropiedad(propiedad ?? {});
  const errores = Propiedad.validar(Propiedad.normalizar(datos));
  if (datos.titulo.length > 120) errores.push('El título puede tener hasta 120 caracteres');
  if (datos.descripcion.length > 5000) errores.push('La descripción puede tener hasta 5.000 caracteres');
  if (!(Number(propiedad?.precio) > 0)) errores.push('Indica el precio');
  if (errores.length) throw new PublicacionError(errores[0]);

  const { valor } = await obtenerUF();
  return transaccion(() => {
    const { propietario: p } = Propietario.guardarFicha(propietario, { portal: false });
    const completa = Propiedad.completarPrecios(Propiedad.normalizar({
      ...datos,
      propietario_nombre: p.nombre,
      propietario_rut: p.rut,
      propietario_email: p.email,
      propietario_telefono: p.telefono,
      propietario_cuenta: Propietario.cuentaTexto(p),
    }), valor);
    if (propiedadId) {
      const actual = Propiedad.obtener(Number(propiedadId));
      if (!actual || actual.estado !== 'inactiva' || actual.eliminada_en) throw new PublicacionError('El borrador ya no existe o ya fue publicado', 409);
      return Propiedad.actualizar(actual.id, completa);
    }
    return Propiedad.crear({ ...completa, origen: 'manual', estado: 'inactiva', disponible: true, imagenes: [] });
  });
}

/** Paso final (2/3): una foto (JPG/PNG/WEBP, máx. 10 MB). Se agrega a la galería del borrador. */
export async function subirImagen(propiedadId, req) {
  const p = Propiedad.obtener(Number(propiedadId));
  if (!p) throw new PublicacionError('Propiedad no encontrada', 404);
  if (p.imagenes.length >= MAX_IMAGENES) throw new PublicacionError(`Máximo ${MAX_IMAGENES} fotos por propiedad`);
  const dir = path.join(DIR_IMAGENES, String(p.id));
  fs.mkdirSync(dir, { recursive: true });
  const temporal = path.join(dir, `.subida_${crypto.randomBytes(6).toString('hex')}`);
  try {
    await recibirArchivo(req, temporal, MAX_BYTES, (m, s) => new PublicacionError(m, s));
    const tipo = detectarTipo(temporal);
    if (!tipo || tipo.ext === 'pdf') throw new PublicacionError('Formato no permitido: sube fotos JPG, PNG o WEBP');
    const archivo = `${crypto.randomBytes(8).toString('hex')}.${tipo.ext}`;
    fs.renameSync(temporal, path.join(dir, archivo));
    const url = `${URL_IMAGENES}/${p.id}/${archivo}`;
    Propiedad.actualizar(p.id, { imagenes: [...Propiedad.obtener(p.id).imagenes, url] });
    return { url };
  } finally {
    fs.rmSync(temporal, { force: true });
  }
}

/**
 * Paso final (3/3): orden de la galería (la primera es la portada) y publicación. Con `portal`, además
 * habilita el acceso del propietario y le envía la bienvenida.
 */
export function publicar(propiedadId, { imagenes, portal } = {}) {
  const p = Propiedad.obtener(Number(propiedadId));
  if (!p) throw new PublicacionError('Propiedad no encontrada', 404);
  const disponibles = new Set(p.imagenes);
  const orden = Array.isArray(imagenes) ? imagenes.filter((u) => disponibles.has(u)) : p.imagenes;
  // Las fotos subidas que no quedaron en la galería final se borran del disco
  for (const url of p.imagenes) {
    if (!orden.includes(url) && url.startsWith(`${URL_IMAGENES}/${p.id}/`)) {
      fs.rmSync(path.join(DIR_IMAGENES, String(p.id), path.basename(url)), { force: true });
    }
  }
  const publicada = Propiedad.actualizar(p.id, { imagenes: orden, estado: 'activa', disponible: true });
  let bienvenida = null;
  if (portal && publicada.propietario_rut) bienvenida = Propietario.enviarBienvenida(publicada.propietario_rut);
  return { propiedad: publicada, bienvenida };
}

/** Valores por defecto para el wizard. */
export async function condiciones() {
  const { valor: uf } = await obtenerUF();
  return {
    uf,
    iva_pct: config.comision.masIva ? 19 : 0,
    comision: { venta: config.comision.ventaPct, arriendo: config.comision.arriendoPct, diario: config.comision.diarioPct },
    hora_checkin: config.agenda.horaCheckin,
    hora_checkout: config.agenda.horaCheckout,
    tipos_cuenta: Propietario.TIPOS_CUENTA,
  };
}
