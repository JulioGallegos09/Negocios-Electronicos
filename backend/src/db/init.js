const path = require("path");
const Database = require("better-sqlite3");

let db;

function initDB() {
  const dbPath = path.join(__dirname, "database.sqlite");
  db = new Database(dbPath);

  // Tablas
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('admin','usuario'))
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      correo TEXT,
      telefono TEXT,
      empresa TEXT,
      fecha_registro TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo','inactivo')),
      etapa_crm TEXT NOT NULL DEFAULT 'Prospecto'
    );

    CREATE TABLE IF NOT EXISTS interacciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT,
      fecha TEXT NOT NULL,
      usuario_id INTEGER,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS metricas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      total_clientes INTEGER NOT NULL,
      clientes_activos INTEGER NOT NULL,
      clientes_inactivos INTEGER NOT NULL,
      total_interacciones INTEGER NOT NULL,
      generado_por INTEGER,
      FOREIGN KEY (generado_por) REFERENCES usuarios(id)
    );
  `);

  return db;
}

function getDB() {
  if (!db) initDB();
  return db;
}

module.exports = { initDB, getDB };
