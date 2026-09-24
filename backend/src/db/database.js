import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const dbPath = path.resolve(config.dbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

export const MODALIDADES = ['arriendo_diario', 'arriendo_marzo_diciembre', 'arriendo_anual', 'venta'];
const CHECK_MODALIDAD = `CHECK (modalidad IN (${MODALIDADES.map((m) => `'${m}'`).join(', ')}))`;

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS propiedades (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo                TEXT    NOT NULL,
    descripcion           TEXT    NOT NULL DEFAULT '',
    precio_uf             REAL,
    precio_clp            INTEGER,
    moneda_original       TEXT    NOT NULL DEFAULT 'UF' CHECK (moneda_original IN ('UF', 'CLP')),
    -- modalidad de negocio; "operacion" se deriva de ella (venta / arriendo) y se mantiene por compatibilidad
    modalidad             TEXT    NOT NULL DEFAULT 'arriendo_anual' ${CHECK_MODALIDAD},
    operacion             TEXT    NOT NULL CHECK (operacion IN ('venta', 'arriendo')),
    tipo                  TEXT    NOT NULL CHECK (tipo IN ('casa', 'departamento', 'terreno', 'oficina', 'local', 'parcela', 'otro')),
    comuna                TEXT    NOT NULL,
    region                TEXT,
    direccion             TEXT,
    habitaciones          INTEGER NOT NULL DEFAULT 0,
    banos                 INTEGER NOT NULL DEFAULT 0,
    estacionamientos      INTEGER NOT NULL DEFAULT 0,
    superficie_util       REAL,
    superficie_total      REAL,
    imagenes              TEXT    NOT NULL DEFAULT '[]',
    id_portalinmobiliario TEXT    UNIQUE,
    permalink             TEXT,
    origen                TEXT    NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'portalinmobiliario')),
    estado                TEXT    NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'inactiva')),
    -- 0 = arrendada/vendida (no se muestra al público). En arriendo diario la ocupación sale de las reservas.
    disponible            INTEGER NOT NULL DEFAULT 1,
    destacada             INTEGER NOT NULL DEFAULT 0,
    creado_en             TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en        TEXT    NOT NULL DEFAULT (datetime('now')),
    sincronizado_en       TEXT
  );

  CREATE TABLE IF NOT EXISTS reservas (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    propiedad_id     INTEGER NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
    fecha_inicio     TEXT    NOT NULL,  -- check-in  (YYYY-MM-DD, primera noche)
    fecha_fin        TEXT    NOT NULL,  -- check-out (YYYY-MM-DD, no se cobra esa noche)
    cliente_nombre   TEXT    NOT NULL,
    cliente_email    TEXT    NOT NULL,
    cliente_telefono TEXT    NOT NULL,
    huespedes        INTEGER NOT NULL DEFAULT 1,
    notas            TEXT,
    noches           INTEGER NOT NULL,
    monto_total_clp  INTEGER,
    estado_pago      TEXT    NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente', 'pagado', 'cancelado')),
    creado_en        TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en   TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK (fecha_fin > fecha_inicio)
  );

  -- Bloqueos manuales de arriendo diario (uso del propietario, mantención, etc.)
  CREATE TABLE IF NOT EXISTS bloqueos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    propiedad_id INTEGER NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
    fecha_inicio TEXT    NOT NULL,  -- primera noche bloqueada
    fecha_fin    TEXT    NOT NULL,  -- primer día libre (excluido)
    motivo       TEXT,
    creado_en    TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK (fecha_fin > fecha_inicio)
  );

  -- Intentos de pago de reservas (Webpay, Mercado Pago, transferencia informada)
  CREATE TABLE IF NOT EXISTS pagos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    reserva_id     INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
    proveedor      TEXT    NOT NULL CHECK (proveedor IN ('webpay', 'mercadopago', 'transferencia')),
    referencia     TEXT,             -- token Webpay / id de preferencia o pago de Mercado Pago
    monto          INTEGER NOT NULL, -- CLP, calculado por el servidor
    estado         TEXT    NOT NULL DEFAULT 'iniciado'
                   CHECK (estado IN ('iniciado', 'aprobado', 'rechazado', 'anulado', 'informado', 'pendiente')),
    detalle        TEXT,             -- JSON con la respuesta del proveedor (sin datos sensibles)
    creado_en      TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Personal de apoyo para la agenda (aseo y entrega de llaves)
  CREATE TABLE IF NOT EXISTS personal (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre    TEXT    NOT NULL,
    telefono  TEXT,
    tipo      TEXT    NOT NULL DEFAULT 'aseo' CHECK (tipo IN ('aseo', 'llaves', 'ambos')),
    creado_en TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Datos que la corredora agrega a las tareas de la agenda. Las tareas en sí se derivan de las
  -- reservas pagadas; aquí sólo se guarda lo editado (hora, responsable, estado, notas).
  CREATE TABLE IF NOT EXISTS agenda_tareas (
    reserva_id     INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
    tipo           TEXT    NOT NULL CHECK (tipo IN ('entrega_llaves', 'recepcion_llaves', 'aseo')),
    hora           TEXT,
    responsable_id INTEGER REFERENCES personal(id) ON DELETE SET NULL,
    estado         TEXT    NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'hecha')),
    notas          TEXT,
    actualizado_en TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (reserva_id, tipo)
  );

  -- Una sola cuenta de Mercado Libre conectada (la del cliente)
  CREATE TABLE IF NOT EXISTS meli_tokens (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    user_id        TEXT    NOT NULL,
    access_token   TEXT    NOT NULL,
    refresh_token  TEXT    NOT NULL,
    expires_at     INTEGER NOT NULL,
    scope          TEXT,
    actualizado_en TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    iniciado_en   TEXT NOT NULL DEFAULT (datetime('now')),
    finalizado_en TEXT,
    estado        TEXT NOT NULL DEFAULT 'en_curso',
    total         INTEGER DEFAULT 0,
    creadas       INTEGER DEFAULT 0,
    actualizadas  INTEGER DEFAULT 0,
    desactivadas  INTEGER DEFAULT 0,
    errores       INTEGER DEFAULT 0,
    detalle       TEXT
  );
`);

// --- Migraciones para bases creadas con versiones anteriores ---
const columnas = new Set(db.prepare('PRAGMA table_info(propiedades)').all().map((c) => c.name));
if (!columnas.has('modalidad')) {
  db.exec(`
    ALTER TABLE propiedades ADD COLUMN modalidad TEXT NOT NULL DEFAULT 'arriendo_anual' ${CHECK_MODALIDAD};
    UPDATE propiedades SET modalidad = 'venta' WHERE operacion = 'venta';
  `);
}
if (!columnas.has('disponible')) {
  db.exec(`ALTER TABLE propiedades ADD COLUMN disponible INTEGER NOT NULL DEFAULT 1;`);
}
if (!columnas.has('aseo_responsable_id')) {
  // Responsable de aseo por defecto (arriendo diario)
  db.exec(`ALTER TABLE propiedades ADD COLUMN aseo_responsable_id INTEGER REFERENCES personal(id) ON DELETE SET NULL;`);
}
// Ficha técnica y condiciones comerciales
const fichaTecnica = {
  gastos_comunes_clp: 'INTEGER',     // mensuales
  comision_pct: 'REAL',              // NULL = valor por defecto (venta: % del precio; arriendo: % de un mes)
  garantia_meses: 'REAL',            // arriendos; NULL = 1 mes
  bodegas: 'INTEGER NOT NULL DEFAULT 0',
  amoblado: 'INTEGER',               // NULL = no informado
  mascotas: 'INTEGER',               // NULL = no informado
  ano_construccion: 'INTEGER',
  orientacion: 'TEXT',
};
// Propietario (datos internos, nunca se exponen en la API pública) y condiciones de liquidación
const propietarioYLiquidacion = {
  propietario_nombre: 'TEXT',
  propietario_rut: 'TEXT',
  propietario_email: 'TEXT',
  propietario_telefono: 'TEXT',
  propietario_cuenta: 'TEXT',        // datos bancarios para transferir la liquidación
  aseo_clp: 'INTEGER',               // arriendo diario: costo de aseo por estadía que se descuenta al propietario
  comision_diario_pct: 'REAL',       // arriendo diario: % del arriendo cobrado; NULL = valor por defecto
};
for (const [col, tipo] of Object.entries({ ...fichaTecnica, ...propietarioYLiquidacion })) {
  if (!columnas.has(col)) db.exec(`ALTER TABLE propiedades ADD COLUMN ${col} ${tipo};`);
}

db.exec(`
  -- Solicitudes de visita enviadas desde la ficha de venta / arriendo
  CREATE TABLE IF NOT EXISTS solicitudes_visita (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    propiedad_id    INTEGER NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
    nombre          TEXT    NOT NULL,
    email           TEXT    NOT NULL,
    telefono        TEXT    NOT NULL,
    fecha_preferida TEXT,              -- YYYY-MM-DD
    franja          TEXT CHECK (franja IN ('manana', 'tarde', 'indiferente')),
    mensaje         TEXT,
    estado          TEXT    NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva', 'contactada', 'agendada', 'descartada')),
    notas_internas  TEXT,
    creado_en       TEXT    NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_visitas_estado ON solicitudes_visita (estado, creado_en);
`);

const columnasReservas = new Set(db.prepare('PRAGMA table_info(reservas)').all().map((c) => c.name));
const nuevasColumnasReservas = {
  codigo_pago: 'TEXT',                // secreto para el enlace de pago del cliente
  metodo_pago: 'TEXT',                // webpay | mercadopago | transferencia | manual
  pagado_en: 'TEXT',
  transferencia_informada_en: 'TEXT',
  transferencia_detalle: 'TEXT',
  vence_en: 'TEXT',                   // UTC 'YYYY-MM-DD HH:MM:SS': si sigue pendiente a esa hora, se libera
  motivo_cancelacion: 'TEXT',         // manual | vencida
};
for (const [col, tipo] of Object.entries(nuevasColumnasReservas)) {
  if (!columnasReservas.has(col)) db.exec(`ALTER TABLE reservas ADD COLUMN ${col} ${tipo};`);
}
db.exec(`UPDATE reservas SET codigo_pago = lower(hex(randomblob(16))) WHERE codigo_pago IS NULL;`);

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_codigo_pago ON reservas (codigo_pago);
  CREATE INDEX IF NOT EXISTS idx_pagos_reserva ON pagos (reserva_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_referencia ON pagos (proveedor, referencia) WHERE referencia IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_prop_busqueda ON propiedades (estado, disponible, modalidad, tipo, comuna);
  CREATE INDEX IF NOT EXISTS idx_prop_precio_uf ON propiedades (precio_uf);
  CREATE INDEX IF NOT EXISTS idx_prop_precio_clp ON propiedades (precio_clp);
  CREATE INDEX IF NOT EXISTS idx_reservas_prop_fechas ON reservas (propiedad_id, fecha_inicio, fecha_fin);
  CREATE INDEX IF NOT EXISTS idx_bloqueos_prop_fechas ON bloqueos (propiedad_id, fecha_inicio, fecha_fin);

  CREATE INDEX IF NOT EXISTS idx_reservas_estado_inicio ON reservas (estado_pago, fecha_inicio);

  -- CRM: datos que la corredora agrega a un cliente. Los clientes en sí se derivan de reservas y
  -- solicitudes de visita agrupadas por celular; "clave" es el celular normalizado (tel:912345678).
  -- Dos claves con el mismo RUT se consideran la misma persona.
  CREATE TABLE IF NOT EXISTS clientes_crm (
    clave          TEXT PRIMARY KEY,
    rut            TEXT,              -- normalizado: 12345678-K
    nombre         TEXT,              -- reemplaza al nombre informado en las reservas
    email          TEXT,
    etiqueta       TEXT CHECK (etiqueta IN ('vip', 'confiable', 'observaciones', 'sin')),  -- NULL = automática
    notas          TEXT,
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_clientes_crm_rut ON clientes_crm (rut);

  -- Cuentas de clientes del sitio (registro de 1 paso). El RUT es el identificador único.
  CREATE TABLE IF NOT EXISTS cuentas_cliente (
    rut              TEXT PRIMARY KEY,   -- normalizado: 12345678-K
    nombre           TEXT NOT NULL,
    email            TEXT NOT NULL,
    telefono         TEXT NOT NULL,
    creado_en        TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en   TEXT NOT NULL DEFAULT (datetime('now')),
    ultimo_ingreso_en TEXT
  );

  -- Código de ingreso al portal "Mi cuenta" (uno vigente por RUT; se guarda sólo su hash)
  CREATE TABLE IF NOT EXISTS codigos_acceso (
    rut         TEXT PRIMARY KEY REFERENCES cuentas_cliente(rut) ON DELETE CASCADE,
    codigo_hash TEXT NOT NULL,
    expira_en   TEXT NOT NULL,
    intentos    INTEGER NOT NULL DEFAULT 0,
    creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Valores internos generados por el sistema (p. ej. el secreto de las sesiones de clientes)
  CREATE TABLE IF NOT EXISTS ajustes_sistema (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

// Vínculo de visitas y reservas con la cuenta del cliente, y acciones del cliente sobre sus visitas
for (const [tabla, nuevas] of [
  // Fidelización: cupón de nivel aplicado (monto_total_clp ya viene con el descuento) y beneficios a entregar
  ['reservas', { cliente_rut: 'TEXT', cupon: 'TEXT', nivel_cliente: 'TEXT', descuento_pct: 'INTEGER', descuento_clp: 'INTEGER', beneficios: 'TEXT' }],
  ['solicitudes_visita', { cliente_rut: 'TEXT', cancelada_por_cliente_en: 'TEXT', reprogramacion: 'TEXT', reprogramacion_en: 'TEXT' }],
]) {
  const existentes = new Set(db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name));
  for (const [col, tipo] of Object.entries(nuevas)) {
    if (!existentes.has(col)) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${tipo};`);
  }
}
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_reservas_cliente_rut ON reservas (cliente_rut, creado_en);
  CREATE INDEX IF NOT EXISTS idx_visitas_cliente_rut ON solicitudes_visita (cliente_rut, creado_en);
`);

// Liquidación al propietario de una reserva de arriendo diario ya transferida. Los montos quedan
// congelados: cambiar después el aseo o la comisión de la propiedad no altera lo ya pagado.
const SQL_LIQUIDACIONES = (nombre) => `
  CREATE TABLE ${nombre} (
    reserva_id          INTEGER PRIMARY KEY REFERENCES reservas(id) ON DELETE CASCADE,
    bruto_clp           INTEGER NOT NULL,
    aseo_clp            INTEGER NOT NULL DEFAULT 0,
    comision_clp        INTEGER NOT NULL DEFAULT 0,  -- comisión neta (sin IVA)
    comision_pct        REAL,
    iva_clp             INTEGER NOT NULL DEFAULT 0,  -- IVA de la comisión
    neto_clp            INTEGER NOT NULL,
    fecha_transferencia TEXT    NOT NULL,  -- YYYY-MM-DD
    comprobante         TEXT,              -- n° de operación / folio de la transferencia
    notas               TEXT,
    creado_en           TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK (neto_clp = bruto_clp - aseo_clp - comision_clp - iva_clp)
  );`;
const columnasLiquidaciones = new Set(db.prepare('PRAGMA table_info(liquidaciones)').all().map((c) => c.name));
if (!columnasLiquidaciones.size) {
  db.exec(SQL_LIQUIDACIONES('liquidaciones'));
} else if (!columnasLiquidaciones.has('iva_clp')) {
  // Versión sin IVA: se reconstruye la tabla (la regla CHECK del neto cambia); lo ya liquidado queda con IVA 0
  transaccion(() => db.exec(`
    ${SQL_LIQUIDACIONES('liquidaciones_nueva')}
    INSERT INTO liquidaciones_nueva (reserva_id, bruto_clp, aseo_clp, comision_clp, comision_pct, iva_clp, neto_clp, fecha_transferencia, comprobante, notas, creado_en)
      SELECT reserva_id, bruto_clp, aseo_clp, comision_clp, comision_pct, 0, neto_clp, fecha_transferencia, comprobante, notas, creado_en FROM liquidaciones;
    DROP TABLE liquidaciones;
    ALTER TABLE liquidaciones_nueva RENAME TO liquidaciones;
  `));
}
// Lote = una transferencia al propietario (puede cubrir varias reservas); lo antiguo queda con un lote por reserva
if (!db.prepare('PRAGMA table_info(liquidaciones)').all().some((c) => c.name === 'lote')) {
  db.exec(`
    ALTER TABLE liquidaciones ADD COLUMN lote TEXT;
    UPDATE liquidaciones SET lote = 'r' || reserva_id WHERE lote IS NULL;
  `);
}
// RUT del propietario al que se le pagó (si la propiedad cambia de dueño, lo ya pagado sigue siendo del anterior)
if (!db.prepare('PRAGMA table_info(liquidaciones)').all().some((c) => c.name === 'propietario_rut')) {
  db.exec(`
    ALTER TABLE liquidaciones ADD COLUMN propietario_rut TEXT;
    UPDATE liquidaciones SET propietario_rut = (
      SELECT p.propietario_rut FROM reservas r JOIN propiedades p ON p.id = r.propiedad_id WHERE r.id = liquidaciones.reserva_id
    );
  `);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_liquidaciones_lote ON liquidaciones (lote);

  -- Comprobante bancario (archivo) de una transferencia al propietario
  CREATE TABLE IF NOT EXISTS comprobantes_liquidacion (
    lote      TEXT PRIMARY KEY,
    archivo   TEXT NOT NULL,     -- nombre en la carpeta privada de comprobantes
    nombre    TEXT NOT NULL,     -- nombre original del archivo
    tipo      TEXT NOT NULL,     -- application/pdf, image/jpeg, image/png, image/webp
    bytes     INTEGER NOT NULL,
    subido_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Portal de propietarios: cuentas (por RUT, creadas desde la ficha de la propiedad) y acceso sin contraseña
  CREATE TABLE IF NOT EXISTS propietarios (
    rut                   TEXT PRIMARY KEY,   -- normalizado: 12345678-K
    nombre                TEXT NOT NULL,
    email                 TEXT,
    telefono              TEXT,
    creado_en             TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en        TEXT NOT NULL DEFAULT (datetime('now')),
    ultimo_ingreso_en     TEXT,
    bienvenida_enviada_en TEXT
  );
  CREATE TABLE IF NOT EXISTS codigos_propietario (
    rut         TEXT PRIMARY KEY REFERENCES propietarios(rut) ON DELETE CASCADE,
    codigo_hash TEXT NOT NULL,
    expira_en   TEXT NOT NULL,
    intentos    INTEGER NOT NULL DEFAULT 0,
    creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  -- Enlaces de acceso de un solo uso (bienvenida / magic link); se guarda sólo el hash del token
  CREATE TABLE IF NOT EXISTS enlaces_propietario (
    token_hash TEXT PRIMARY KEY,
    rut        TEXT NOT NULL REFERENCES propietarios(rut) ON DELETE CASCADE,
    expira_en  TEXT NOT NULL,
    usado_en   TEXT,
    creado_en  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_propiedades_propietario ON propiedades (propietario_rut);
`);

// Wizard de publicación: video tour y horarios por propiedad; datos bancarios y acceso al portal del propietario
for (const [tabla, nuevas] of [
  // eliminada_en: borrado lógico (papelera). La fila se conserva para no perder reservas, pagos ni liquidaciones.
  ['propiedades', { video_url: 'TEXT', hora_checkin: 'TEXT', hora_checkout: 'TEXT', eliminada_en: 'TEXT' }],
  ['propietarios', {
    banco: 'TEXT', tipo_cuenta: 'TEXT', numero_cuenta: 'TEXT', titular_cuenta: 'TEXT', rut_titular: 'TEXT',
    portal_habilitado: 'INTEGER NOT NULL DEFAULT 1', // 0 = registrado sin acceso al Portal de Propietarios
  }],
]) {
  const existentes = new Set(db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name));
  for (const [col, tipo] of Object.entries(nuevas)) {
    if (!existentes.has(col)) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${tipo};`);
  }
}

/** Ejecuta fn dentro de una transacción (BEGIN IMMEDIATE evita reservas duplicadas en paralelo). */
export function transaccion(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
