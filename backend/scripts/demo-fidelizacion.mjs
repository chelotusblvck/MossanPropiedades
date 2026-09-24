// Reservas pasadas de DEMOSTRACIÓN para el programa de fidelización (niveles Plata / Oro / Platinum).
//   node scripts/demo-fidelizacion.mjs            → respalda la base y crea las reservas demo
//   node scripts/demo-fidelizacion.mjs --deshacer → borra sólo las reservas demo
// No envía correos: escribe directo en la base. Se reconocen por la nota MARCA.
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const MARCA = '[DEMO fidelización]';
const RUTA = path.resolve(process.env.DB_PATH ?? 'data/propiedades.db');
const db = new DatabaseSync(RUTA);
db.exec('PRAGMA busy_timeout = 5000');

if (process.argv.includes('--deshacer')) {
  const { changes } = db.prepare('DELETE FROM reservas WHERE notas = ?').run(MARCA);
  console.log(`Reservas demo eliminadas: ${changes}`);
  process.exit(0);
}

const ya = db.prepare('SELECT COUNT(*) n FROM reservas WHERE notas = ?').get(MARCA).n;
if (ya) {
  console.log(`Ya hay ${ya} reservas demo. Usa --deshacer antes de volver a crearlas.`);
  process.exit(1);
}

// Respaldo consistente aunque el servidor esté corriendo
const respaldo = RUTA.replace(/\.db$/, `.antes-demo-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.db`);
db.exec(`VACUUM INTO '${respaldo.replace(/'/g, "''")}'`);
console.log('Respaldo:', respaldo);

const dv = (n) => {
  let s = 0, m = 2;
  for (const d of String(n).split('').reverse()) { s += Number(d) * m; m = m === 7 ? 2 : m + 1; }
  const r = 11 - (s % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
};
const rutFicticio = (n) => `${n}-${dv(n)}`;

// email del cliente existente → cuántas estadías pasadas y con qué RUT (el real si ya lo tiene)
const PLAN = [
  { email: 'marcelofcn23@gmail.com', estadias: 3 },                        // Oro
  { email: 'vsoto@example.com', estadias: 6, rut: rutFicticio(16100001) }, // Platinum
  { email: 'camila.rojas@example.com', estadias: 2, rut: rutFicticio(16100002) }, // Plata, a 1 de Oro
  { email: 'matias.g@example.com', estadias: 1, rut: rutFicticio(16100003) },     // Plata
];

const diarias = db.prepare(`
  SELECT id, precio_clp FROM propiedades
  WHERE modalidad = 'arriendo_diario' AND estado = 'activa' AND eliminada_en IS NULL AND precio_clp > 0 ORDER BY id
`).all();
if (!diarias.length) throw new Error('No hay propiedades de arriendo diario activas');

const libre = db.prepare(`
  SELECT 1 FROM reservas WHERE propiedad_id = ? AND estado_pago IN ('pendiente', 'pagado') AND fecha_inicio < ? AND fecha_fin > ?
  UNION ALL SELECT 1 FROM bloqueos WHERE propiedad_id = ? AND fecha_inicio < ? AND fecha_fin > ?
`);
const insertar = db.prepare(`
  INSERT INTO reservas (propiedad_id, fecha_inicio, fecha_fin, cliente_nombre, cliente_email, cliente_telefono, huespedes, noches,
                        monto_total_clp, codigo_pago, estado_pago, metodo_pago, pagado_en, cliente_rut, notas, creado_en, actualizado_en)
  VALUES ($p, $ini, $fin, $nombre, $email, $tel, 2, $noches, $monto, $codigo, 'pagado', 'transferencia', $creado, $rut, $marca, $creado, $creado)
`);
const iso = (d) => d.toISOString().slice(0, 10);

// Estadías repartidas hacia atrás desde hace ~3 semanas, una cada ~5 semanas, rotando propiedades
let cursor = new Date(Date.now() - 21 * 864e5);
let k = 0;
db.exec('BEGIN IMMEDIATE');
try {
  for (const plan of PLAN) {
    const cliente = db.prepare(`
      SELECT cliente_nombre AS nombre, cliente_telefono AS tel, cliente_rut AS rut FROM reservas
      WHERE lower(cliente_email) = ? ORDER BY creado_en DESC LIMIT 1
    `).get(plan.email);
    if (!cliente) { console.log('Sin reservas, se omite:', plan.email); continue; }
    // RUT: el que ya tenga (en sus reservas o registrado en el Directorio) y sólo si no, uno ficticio
    const crm = db.prepare('SELECT rut FROM clientes_crm WHERE clave = ? AND rut IS NOT NULL')
      .get(`tel:${cliente.tel.replace(/\D/g, '').slice(-9)}`);
    const rut = cliente.rut ?? crm?.rut ?? plan.rut;
    for (let i = 0; i < plan.estadias; i++) {
      const noches = 2 + (k % 3);
      let p, ini, fin;
      do { // busca un hueco libre retrocediendo
        p = diarias[k++ % diarias.length];
        cursor = new Date(cursor.getTime() - (30 + (k % 10)) * 864e5);
        ini = iso(cursor);
        fin = iso(new Date(cursor.getTime() + noches * 864e5));
      } while (libre.get(p.id, fin, ini, p.id, fin, ini));
      insertar.run({
        p: p.id, ini, fin, nombre: cliente.nombre, email: plan.email, tel: cliente.tel, noches, monto: p.precio_clp * noches,
        codigo: crypto.randomBytes(16).toString('hex'), creado: `${iso(new Date(cursor.getTime() - 14 * 864e5))} 12:00:00`, rut, marca: MARCA,
      });
    }
    console.log(`${cliente.nombre}: ${plan.estadias} estadías pasadas (RUT ${rut})`);
  }
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}
