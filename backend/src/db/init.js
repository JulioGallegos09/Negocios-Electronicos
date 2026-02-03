const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

const dbPath = path.join(__dirname, "database.sqlite");

let db;

async function initDB() {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // tablas
  await db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('admin','usuario'))
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      correo TEXT NOT NULL UNIQUE,
      telefono TEXT,
      empresa TEXT,
      fecha_registro TEXT NOT NULL,
      estado TEXT NOT NULL CHECK(estado IN ('activo','inactivo')),
      etapa_crm TEXT NOT NULL CHECK(etapa_crm IN ('Prospecto','Activo','Frecuente','Inactivo'))
    );

    CREATE TABLE IF NOT EXISTS interacciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('llamada','correo','reunion','whatsapp','compra','tiktok')),
      descripcion TEXT NOT NULL,
      fecha TEXT NOT NULL,
      usuario_id INTEGER NOT NULL,
      FOREIGN KEY(cliente_id) REFERENCES clientes(id),
      FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
    );
  `);

  // usuarios default (admin y usuario)
  const adminExists = await db.get("SELECT id FROM usuarios WHERE email = ?", ["admin@thrift.com"]);
  const userExists = await db.get("SELECT id FROM usuarios WHERE email = ?", ["user@thrift.com"]);

  const bcrypt = require("bcryptjs");
  const hash = await bcrypt.hash("1234", 10);

  if (!adminExists) {
    await db.run(
      "INSERT INTO usuarios (nombre,email,passwordHash,rol) VALUES (?,?,?,?)",
      ["Admin", "admin@thrift.com", hash, "admin"]
    );
  }

  if (!userExists) {
    await db.run(
      "INSERT INTO usuarios (nombre,email,passwordHash,rol) VALUES (?,?,?,?)",
      ["Usuario", "user@thrift.com", hash, "usuario"]
    );
  }

  console.log("✅ BD lista en:", dbPath);
  return db;
}

function getDB() {
  if (!db) throw new Error("DB no inicializada");
  return db;
}

module.exports = { initDB, getDB };
