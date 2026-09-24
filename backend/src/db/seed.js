// Datos de ejemplo para desarrollo: npm run seed
import { db } from './database.js';
import * as Propiedad from '../models/propiedad.js';
import { obtenerUF } from '../services/uf.js';
import { hoyChile, sumarDias, diferenciaDias } from '../lib/fechas.js';

const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=75`;
const RM = 'Región Metropolitana';

const EJEMPLOS = [
  // --- Venta ---
  {
    titulo: 'Casa mediterránea con piscina en sector Los Dominicos',
    descripcion: 'Amplia casa de dos pisos con jardín consolidado, piscina, quincho y sala de estar independiente. Cercana a colegios y al metro Los Dominicos.',
    precio_uf: 21500, modalidad: 'venta', tipo: 'casa', comuna: 'Las Condes', region: RM,
    habitaciones: 5, banos: 4, estacionamientos: 3, superficie_util: 280, superficie_total: 820, destacada: true,
    imagenes: [img('photo-1600596542815-ffad4c1539a9'), img('photo-1600585154340-be6161a56a0c'), img('photo-1484154218962-a197022b5858')],
  },
  {
    titulo: 'Departamento moderno a pasos de metro Irarrázaval',
    descripcion: 'Departamento nuevo con terraza, cocina americana y logia. Edificio con piscina, gimnasio y quincho.',
    precio_uf: 5900, modalidad: 'venta', tipo: 'departamento', comuna: 'Ñuñoa', region: RM,
    habitaciones: 2, banos: 2, estacionamientos: 1, superficie_util: 62, superficie_total: 70,
    imagenes: [img('photo-1522708323590-d24dbb6b0267'), img('photo-1502672260266-1c1ef2d93688'), img('photo-1560448204-e02f11c3d0e2')],
  },
  {
    titulo: 'Parcela de agrado con vista al valle y factibilidad de agua',
    descripcion: 'Terreno de 5.000 m² con rol propio, factibilidad de luz y agua, acceso pavimentado. Ideal para proyecto de casa de campo.',
    precio_uf: 2800, modalidad: 'venta', tipo: 'terreno', comuna: 'Colina', region: RM,
    superficie_total: 5000,
    imagenes: [img('photo-1500382017468-9049fed747ef'), img('photo-1501785888041-af3ef285b470')],
  },
  {
    titulo: 'Casa remodelada en barrio residencial de Vitacura',
    descripcion: 'Casa de un piso completamente remodelada, con cocina equipada, jardín y piscina. Barrio tranquilo cerca de Parque Bicentenario.',
    precio_uf: 32000, modalidad: 'venta', tipo: 'casa', comuna: 'Vitacura', region: RM,
    habitaciones: 4, banos: 4, estacionamientos: 3, superficie_util: 310, superficie_total: 900,
    imagenes: [img('photo-1580587771525-78b9dba3b914'), img('photo-1512917774080-9991f1c4c750')],
  },
  {
    titulo: 'Terreno urbano apto para proyecto inmobiliario',
    descripcion: 'Terreno plano en zona de alta densidad, con frente a avenida principal. Consultar normativa y certificados.',
    precio_uf: 14500, modalidad: 'venta', tipo: 'terreno', comuna: 'San Miguel', region: RM,
    superficie_total: 1200,
    imagenes: [img('photo-1464822759023-fed622ff2c3b')],
  },
  // --- Arriendo año corrido ---
  {
    titulo: 'Departamento amoblado con vista al Costanera Center',
    descripcion: 'Departamento completamente amoblado, piso alto, con estacionamiento y bodega. Gastos comunes aprox. $120.000.',
    precio_clp: 850000, moneda_original: 'CLP', modalidad: 'arriendo_anual', tipo: 'departamento', comuna: 'Providencia', region: RM,
    habitaciones: 2, banos: 2, estacionamientos: 1, superficie_util: 68, superficie_total: 74, destacada: true,
    imagenes: [img('photo-1545324418-cc1a3fa10c00'), img('photo-1586023492125-27b2c045efd7'), img('photo-1493809842364-78817add7ffb')],
  },
  {
    titulo: 'Casa familiar en condominio con áreas verdes',
    descripcion: 'Casa en condominio cerrado con seguridad 24/7, áreas verdes y juegos infantiles. Excelente conectividad a Av. Departamental.',
    precio_clp: 1100000, moneda_original: 'CLP', modalidad: 'arriendo_anual', tipo: 'casa', comuna: 'La Florida', region: RM,
    habitaciones: 4, banos: 3, estacionamientos: 2, superficie_util: 140, superficie_total: 210,
    disponible: false, // arrendada: no aparece en el sitio público
    imagenes: [img('photo-1570129477492-45c003edd2be'), img('photo-1564013799919-ab600027ffc6')],
  },
  // --- Arriendo marzo a diciembre ---
  {
    titulo: 'Departamento para estudiantes cerca de universidades',
    descripcion: 'Arriendo de marzo a diciembre, amoblado, a pasos de la Av. Libertad y locomoción a las universidades. Incluye internet.',
    precio_clp: 480000, moneda_original: 'CLP', modalidad: 'arriendo_marzo_diciembre', tipo: 'departamento', comuna: 'Viña del Mar', region: 'Región de Valparaíso',
    habitaciones: 2, banos: 1, superficie_util: 55, superficie_total: 58,
    imagenes: [img('photo-1502672260266-1c1ef2d93688'), img('photo-1493809842364-78817add7ffb')],
  },
  {
    titulo: 'Casa con vista al mar en Concón, marzo a diciembre',
    descripcion: 'Casa amoblada disponible de marzo a diciembre. Terraza con vista al mar, calefacción y estacionamiento.',
    precio_clp: 750000, moneda_original: 'CLP', modalidad: 'arriendo_marzo_diciembre', tipo: 'casa', comuna: 'Concón', region: 'Región de Valparaíso',
    habitaciones: 3, banos: 2, estacionamientos: 2, superficie_util: 120, superficie_total: 300,
    imagenes: [img('photo-1564013799919-ab600027ffc6'), img('photo-1586023492125-27b2c045efd7')],
  },
  // --- Arriendo diario ---
  {
    titulo: 'Departamento con vista al mar en Reñaca',
    descripcion: 'Espectacular departamento frente al mar con terraza panorámica, acceso directo a la playa y piscina temperada. Capacidad 6 personas. Incluye ropa de cama y toallas.',
    precio_clp: 95000, moneda_original: 'CLP', modalidad: 'arriendo_diario', tipo: 'departamento', comuna: 'Viña del Mar', region: 'Región de Valparaíso',
    habitaciones: 3, banos: 2, estacionamientos: 1, superficie_util: 95, superficie_total: 110, destacada: true,
    imagenes: [img('photo-1560448204-e02f11c3d0e2'), img('photo-1522708323590-d24dbb6b0267'), img('photo-1484154218962-a197022b5858')],
  },
  {
    titulo: 'Casa con amplio patio y vista al volcán Osorno',
    descripcion: 'Casa de madera nativa para 8 personas, con calefacción a leña y estufa a pellet, quincho y amplio patio. A 5 minutos del lago.',
    precio_clp: 120000, moneda_original: 'CLP', modalidad: 'arriendo_diario', tipo: 'casa', comuna: 'Puerto Varas', region: 'Región de Los Lagos',
    habitaciones: 4, banos: 3, estacionamientos: 2, superficie_util: 180, superficie_total: 1000,
    imagenes: [img('photo-1570129477492-45c003edd2be'), img('photo-1580587771525-78b9dba3b914')],
  },
  {
    titulo: 'Loft en Barrio Lastarria, ideal para turistas',
    descripcion: 'Loft equipado a pasos del Cerro Santa Lucía y metro Universidad Católica. Wi-Fi, aire acondicionado y check-in autónomo.',
    precio_clp: 55000, moneda_original: 'CLP', modalidad: 'arriendo_diario', tipo: 'departamento', comuna: 'Santiago', region: RM,
    habitaciones: 1, banos: 1, superficie_util: 38, superficie_total: 40,
    imagenes: [img('photo-1493809842364-78817add7ffb'), img('photo-1502672260266-1c1ef2d93688')],
  },
];

// Reservas de demostración, relativas a hoy: [índice de propiedad, días desde hoy, noches, estado]
const RESERVAS = [
  [9, -2, 5, 'pagado'],
  [9, 6, 3, 'pendiente'],
  [9, 14, 7, 'pagado'],
  [10, 2, 4, 'pagado'],
  [10, 20, 3, 'pendiente'],
  [11, 0, 2, 'pagado'],
  [11, 2, 2, 'pagado'], // recambio: llega el mismo día que sale la reserva anterior
  [11, 4, 6, 'pagado'],
  [11, 16, 2, 'pendiente'],
];
const CLIENTES = [
  ['Camila Rojas', 'camila.rojas@example.com', '+56 9 8123 4567'],
  ['Diego Muñoz', 'diego.munoz@example.com', '+56 9 7234 5678'],
  ['Valentina Soto', 'vsoto@example.com', '+56 9 6345 6789'],
  ['Matías González', 'matias.g@example.com', '+56 9 5456 7890'],
];

// Personal de ejemplo para la agenda (sólo si no hay personal registrado)
if (!db.prepare('SELECT COUNT(*) AS n FROM personal').get().n) {
  const ins = db.prepare('INSERT INTO personal (nombre, telefono, tipo) VALUES (?, ?, ?)');
  ins.run('María González', '+56 9 7111 2222', 'aseo');
  ins.run('Rosa Pérez', '+56 9 7333 4444', 'aseo');
  ins.run('Carlos Rivas', '+56 9 7555 6666', 'llaves');
}
const persona = (nombre) => db.prepare('SELECT id FROM personal WHERE nombre = ?').get(nombre)?.id ?? null;

// Dirección y responsable de aseo por defecto de las propiedades de arriendo diario
Object.assign(EJEMPLOS[9], { direccion: 'Av. Borgoño 14500, Reñaca', aseo_responsable_id: persona('María González') });
Object.assign(EJEMPLOS[10], { direccion: 'Camino a Ensenada km 3' });
Object.assign(EJEMPLOS[11], { direccion: 'José Victorino Lastarria 70', aseo_responsable_id: persona('Rosa Pérez') });

// Ficha técnica de ejemplo (venta y arriendo mensual)
Object.assign(EJEMPLOS[0], { direccion: 'Camino Los Dominicos 8200', gastos_comunes_clp: 0, bodegas: 1, amoblado: false, mascotas: true, ano_construccion: 1998, orientacion: 'norte' });
Object.assign(EJEMPLOS[1], { direccion: 'Av. Irarrázaval 2940', gastos_comunes_clp: 95000, bodegas: 1, amoblado: false, mascotas: true, ano_construccion: 2023, orientacion: 'nororiente' });
Object.assign(EJEMPLOS[3], { gastos_comunes_clp: 0, bodegas: 2, amoblado: false, mascotas: true, ano_construccion: 1985, orientacion: 'norte', comision_pct: 1.5 });
Object.assign(EJEMPLOS[5], { direccion: 'Av. Nueva Providencia 2155', gastos_comunes_clp: 120000, bodegas: 1, amoblado: true, mascotas: false, ano_construccion: 2019, orientacion: 'oriente' });
Object.assign(EJEMPLOS[6], { gastos_comunes_clp: 65000, bodegas: 0, amoblado: false, mascotas: true, ano_construccion: 2012 });
Object.assign(EJEMPLOS[7], { direccion: '5 Norte 850', gastos_comunes_clp: 70000, bodegas: 0, amoblado: true, mascotas: false, ano_construccion: 2008, orientacion: 'poniente', garantia_meses: 1 });
Object.assign(EJEMPLOS[8], { gastos_comunes_clp: 0, bodegas: 1, amoblado: true, mascotas: true, ano_construccion: 2015, orientacion: 'poniente', garantia_meses: 2 });

const { valor: uf } = await obtenerUF();
db.exec(`DELETE FROM propiedades WHERE origen = 'manual'`); // reservas, bloqueos y tareas se borran en cascada
const creadas = EJEMPLOS.map((e) => Propiedad.crear(Propiedad.completarPrecios({ ...e, origen: 'manual' }, uf)));

const hoy = hoyChile();
const insertar = db.prepare(`
  INSERT INTO reservas (propiedad_id, fecha_inicio, fecha_fin, cliente_nombre, cliente_email, cliente_telefono,
                        huespedes, noches, monto_total_clp, estado_pago)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
RESERVAS.forEach(([idx, offset, noches, estado], i) => {
  const p = creadas[idx];
  const inicio = sumarDias(hoy, offset);
  const fin = sumarDias(inicio, noches);
  const [nombre, email, tel] = CLIENTES[i % CLIENTES.length];
  insertar.run(p.id, inicio, fin, nombre, email, tel, 2 + (i % 3), diferenciaDias(inicio, fin), p.precio_clp * noches, estado);
});

// Código de pago para todas y plazo de pago (20 h) para las pendientes
db.exec(`UPDATE reservas SET codigo_pago = lower(hex(randomblob(16))) WHERE codigo_pago IS NULL`);
db.exec(`UPDATE reservas SET vence_en = datetime('now', '+20 hours') WHERE estado_pago = 'pendiente'`);

// Bloqueo manual de ejemplo: mantención del loft
db.prepare('INSERT INTO bloqueos (propiedad_id, fecha_inicio, fecha_fin, motivo) VALUES (?, ?, ?, ?)')
  .run(creadas[11].id, sumarDias(hoy, 22), sumarDias(hoy, 25), 'Mantención');

console.log(`Insertadas ${creadas.length} propiedades, ${RESERVAS.length} reservas y 1 bloqueo de ejemplo (UF = ${uf}).`);
