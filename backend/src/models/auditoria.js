// Registro de acciones sensibles del panel (p. ej. ver el portal como un cliente o propietario).
import { db } from '../db/database.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS auditoria (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    accion    TEXT NOT NULL,           -- impersonar_cliente | impersonar_propietario
    detalle   TEXT,                    -- JSON
    ip        TEXT,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria (creado_en);
`);

export function registrar(accion, detalle, ip) {
  db.prepare('INSERT INTO auditoria (accion, detalle, ip) VALUES (?, ?, ?)').run(accion, JSON.stringify(detalle ?? {}), ip ?? null);
}

export function listar({ limite = 100 } = {}) {
  return db.prepare('SELECT * FROM auditoria ORDER BY id DESC LIMIT ?').all(Math.min(Math.max(Number(limite) || 100, 1), 500))
    .map((f) => ({ ...f, detalle: JSON.parse(f.detalle || '{}') }));
}
