// Exporta la base local como base INICIAL de la demo (backend/demo/), apta para subirla al repositorio
// (que es PÚBLICO): conserva propiedades, clientes, reservas, historial y fotos; quita credenciales y
// secretos, y reemplaza por datos ficticios el RUT, contacto y cuenta bancaria de los propietarios.
//   node scripts/exportar-demo.mjs
// Al desplegar con DEMO_DB=./demo/propiedades.db, el servidor la copia si todavía no existe una base
// (ver src/db/demoInicial.js). Sólo lee la base local: nunca la modifica.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import 'dotenv/config';

const ORIGEN_DB = path.resolve(process.env.DB_PATH || './data/propiedades.db');
const ORIGEN_UPLOADS = path.resolve(process.env.UPLOADS_DIR || './uploads');
const DESTINO = path.resolve('demo');
const DESTINO_DB = path.join(DESTINO, 'propiedades.db');
// Sólo carpetas públicas. "privado" (comprobantes de pago de clientes) nunca se exporta.
const CARPETAS_PUBLICAS = ['propiedades', 'marca', 'tema'];

fs.mkdirSync(DESTINO, { recursive: true });
for (const f of fs.readdirSync(DESTINO)) if (f.startsWith('.tmp-')) fs.rmSync(path.join(DESTINO, f), { force: true }); // restos de una ejecución fallida
const temporal = path.join(DESTINO, `.tmp-${Date.now()}.db`);
fs.rmSync(DESTINO_DB, { force: true });

// 1) Copia consistente (aunque el servidor esté corriendo)
const local = new DatabaseSync(ORIGEN_DB, { readOnly: true });
local.exec(`VACUUM INTO '${temporal.replace(/'/g, "''")}'`);
local.close();

// 2) Limpieza de credenciales y secretos en la copia
const db = new DatabaseSync(temporal);
const limpiar = [
  // SMTP (usuario y contraseña) y contraseña del panel: en Render se usan las variables de entorno
  `DELETE FROM configuracion_sitio WHERE seccion IN ('correo', 'seguridad')`,
  // Secretos de firma de sesiones y cupones: el servidor genera unos nuevos al iniciar
  `DELETE FROM ajustes_sistema`,
  // Accesos vigentes (códigos, enlaces mágicos, tokens de Mercado Libre) e IPs de la auditoría
  `DELETE FROM codigos_acceso`,
  `DELETE FROM codigos_propietario`,
  `DELETE FROM enlaces_propietario`,
  `DELETE FROM meli_tokens`,
  `DELETE FROM auditoria`,
  // Comprobantes privados: no se exportan los archivos, así que tampoco sus registros
  `DELETE FROM comprobantes_liquidacion`,
];
for (const sql of limpiar) {
  try { db.exec(sql); } catch (err) { if (!/no such table/.test(err.message)) throw err; }
}

// Propietarios: el repositorio es público → RUT, correo, celular y cuenta bancaria pasan a ser ficticios
// (se conserva el nombre). También en las fichas de sus propiedades y en las liquidaciones.
const dv = (n) => {
  let s = 0, m = 2;
  for (const d of String(n).split('').reverse()) { s += Number(d) * m; m = m === 7 ? 2 : m + 1; }
  const r = 11 - (s % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
};
const rutTexto = (rut) => { const [n, d] = rut.split('-'); return `${Number(n).toLocaleString('es-CL')}-${d}`; };
const propietarios = db.prepare('SELECT rut, nombre FROM propietarios ORDER BY creado_en, rut').all();
db.exec('PRAGMA foreign_keys = OFF; BEGIN');
propietarios.forEach((p, i) => {
  const numero = 21000001 + i;
  const f = {
    viejo: p.rut,
    rut: `${numero}-${dv(numero)}`,
    email: `propietario${i + 1}@example.com`,
    telefono: `+56 9 0000 ${String(1001 + i)}`,
    banco: 'BancoEstado',
    tipo: 'Cuenta RUT',
    numero: String(numero),
  };
  const cuenta = `${f.banco} · ${f.tipo} · N° ${f.numero} · ${p.nombre} (RUT ${rutTexto(f.rut)})`;
  db.prepare(`
    UPDATE propietarios SET rut = $rut, email = $email, telefono = $telefono, banco = $banco, tipo_cuenta = $tipo,
      numero_cuenta = $numero, titular_cuenta = nombre, rut_titular = $rut, ultimo_ingreso_en = NULL
    WHERE rut = $viejo
  `).run(f);
  db.prepare(`
    UPDATE propiedades SET propietario_rut = $rut, propietario_email = $email, propietario_telefono = $telefono, propietario_cuenta = $cuenta
    WHERE propietario_rut = $viejo
  `).run({ rut: f.rut, email: f.email, telefono: f.telefono, cuenta, viejo: f.viejo });
  db.prepare('UPDATE liquidaciones SET propietario_rut = ? WHERE propietario_rut = ?').run(f.rut, f.viejo);
});
// Fichas con datos de propietario sin cuenta registrada (sin RUT): se vacían los datos de contacto y banco
db.exec(`UPDATE propiedades SET propietario_email = NULL, propietario_telefono = NULL, propietario_cuenta = NULL
         WHERE propietario_rut IS NULL AND (propietario_email IS NOT NULL OR propietario_telefono IS NOT NULL OR propietario_cuenta IS NOT NULL)`);
db.exec('COMMIT; PRAGMA foreign_keys = ON');
db.close();

// 3) VACUUM final: reescribe el archivo, así lo borrado no queda en páginas libres
const limpia = new DatabaseSync(temporal);
limpia.exec(`VACUUM INTO '${DESTINO_DB.replace(/'/g, "''")}'`);
limpia.close(); // en Windows el archivo queda bloqueado mientras esté abierto
fs.rmSync(temporal, { force: true });

// 4) Fotos y archivos públicos
const destinoUploads = path.join(DESTINO, 'uploads');
fs.rmSync(destinoUploads, { recursive: true, force: true });
let archivos = 0;
for (const carpeta of CARPETAS_PUBLICAS) {
  const origen = path.join(ORIGEN_UPLOADS, carpeta);
  if (!fs.existsSync(origen)) continue;
  fs.cpSync(origen, path.join(destinoUploads, carpeta), { recursive: true });
  archivos += fs.readdirSync(path.join(destinoUploads, carpeta), { recursive: true }).filter((f) => fs.statSync(path.join(destinoUploads, carpeta, f)).isFile()).length;
}

const kb = Math.round(fs.statSync(DESTINO_DB).size / 1024);
console.log(`Base demo: ${DESTINO_DB} (${kb} KB) · ${archivos} archivos públicos en ${destinoUploads}`);
