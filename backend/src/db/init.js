// backend/src/db/init.js
const Database = require("better-sqlite3");

let db;

function hasColumn(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some(col => col.name === columnName);
}

function ensureColumn(tableName, definition) {
  const columnName = String(definition).trim().split(/\s+/)[0];
  if (!columnName || hasColumn(tableName, columnName)) return;
  db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`).run();
}

function syncCategorias() {
  const rows = db.prepare(`
    SELECT DISTINCT trim(categoria) AS categoria
    FROM productos
    WHERE trim(coalesce(categoria, '')) <> ''
  `).all();

  for (const row of rows) {
    db.prepare(`
      INSERT OR IGNORE INTO categorias (nombre, slug, estado, fecha_creacion)
      VALUES (?, lower(replace(?, ' ', '-')), 1, CURRENT_TIMESTAMP)
    `).run(row.categoria, row.categoria);
  }

  if (hasColumn("productos", "categoria_id")) {
    db.prepare(`
      UPDATE productos
      SET categoria_id = (
        SELECT c.id
        FROM categorias c
        WHERE lower(c.nombre) = lower(productos.categoria)
        LIMIT 1
      )
      WHERE trim(coalesce(categoria, '')) <> ''
    `).run();
  }
}

function initDB() {
  if (db) return db;

  db = new Database("thriftcalido.db");
  db.pragma("foreign_keys = ON");

  db.prepare(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'usuario',
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT DEFAULT NULL,
      last_failed_login_at TEXT DEFAULT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      correo TEXT NOT NULL UNIQUE,
      telefono TEXT DEFAULT '',
      direccion TEXT DEFAULT '',
      empresa TEXT DEFAULT '',
      fecha_registro TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activo',
      etapa_crm TEXT NOT NULL DEFAULT 'Prospecto'
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS interacciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      fecha TEXT NOT NULL,
      usuario_id INTEGER NOT NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS metricas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      total_clientes INTEGER NOT NULL,
      clientes_activos INTEGER NOT NULL,
      clientes_inactivos INTEGER NOT NULL,
      total_interacciones INTEGER NOT NULL,
      generado_por INTEGER,
      FOREIGN KEY (generado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      contacto TEXT NOT NULL,
      correo TEXT NOT NULL,
      telefono TEXT NOT NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      estado INTEGER NOT NULL DEFAULT 1,
      fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Productos (tu BD ya usa stock_actual/stock_minimo)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      categoria TEXT NOT NULL,
      categoria_id INTEGER,
      stock_actual INTEGER NOT NULL DEFAULT 0,
      stock_minimo INTEGER NOT NULL DEFAULT 0,
      proveedor_id INTEGER NOT NULL,
      costo_unitario REAL NOT NULL DEFAULT 0,
      estrategia_logistica TEXT NOT NULL DEFAULT 'PULL',
      sku TEXT DEFAULT '',
      imagen_url TEXT DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'activo',
      destacado INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT,
      FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
    )
  `).run();

  // ✅ Movimientos inventario (agregamos referencia y usuario_id porque tu inventario lo usa)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS movimientos_inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,                 -- entrada/salida
      cantidad INTEGER NOT NULL,
      motivo TEXT NOT NULL,               -- venta/ajuste/reposicion/devolucion
      referencia TEXT NOT NULL DEFAULT '',
      fecha TEXT NOT NULL,
      usuario_id INTEGER,
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `).run();

  // (Opcional) pedidos viejos que ya tenías
  db.prepare(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      tipo TEXT NOT NULL,                 -- reposicion/venta
      estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente/surtido
      fecha TEXT NOT NULL,
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
    )
  `).run();

  // ✅ Alertas de stock bajo
  db.prepare(`
    CREATE TABLE IF NOT EXISTS alertas_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      proveedor_id INTEGER NOT NULL,
      stock_actual INTEGER NOT NULL,
      stock_minimo INTEGER NOT NULL,
      faltan INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente/resuelta/ignorada
      fecha TEXT NOT NULL,
      generado_por INTEGER,
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT,
      FOREIGN KEY (generado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `).run();

  // ✅ Pedidos a proveedor + seguimiento
  db.prepare(`
    CREATE TABLE IF NOT EXISTS pedidos_proveedor (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad_solicitada INTEGER NOT NULL,
      cantidad_recibida INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'creado', -- creado/enviado/confirmado/en_transito/recibido/cancelado
      nota TEXT DEFAULT '',
      fecha_creacion TEXT NOT NULL,
      fecha_actualizacion TEXT NOT NULL,
      creado_por INTEGER,
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT,
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT,
      FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS pedidos_proveedor_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL,
      estado TEXT NOT NULL,
      comentario TEXT DEFAULT '',
      fecha TEXT NOT NULL,
      usuario_id INTEGER,
      FOREIGN KEY (pedido_id) REFERENCES pedidos_proveedor(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `).run();
  // ✅ ERP: órdenes empresariales
  db.prepare(`
    CREATE TABLE IF NOT EXISTS ordenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      fecha TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente/procesada/cancelada
      estado_logistico TEXT NOT NULL DEFAULT 'en_almacen',
      fecha_estado_logistico TEXT DEFAULT NULL,
      guia_envio TEXT DEFAULT '',
      folio TEXT DEFAULT '',
      subtotal REAL NOT NULL DEFAULT 0,
      descuento_total REAL NOT NULL DEFAULT 0,
      impuesto_total REAL NOT NULL DEFAULT 0,
      donacion_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      canal TEXT NOT NULL DEFAULT 'erp',
      usuario_id INTEGER,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS ordenes_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      precio_lista REAL NOT NULL DEFAULT 0,
      descuento_unitario REAL NOT NULL DEFAULT 0,
      precio REAL NOT NULL,
      FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
    )
  `).run();

  // ✅ ERP: madurez / estado
  db.prepare(`
    CREATE TABLE IF NOT EXISTS erp_estado (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nivel TEXT NOT NULL DEFAULT 'Básico'
    )
  `).run();

  // asegurar fila única
  db.prepare(`
    INSERT OR IGNORE INTO erp_estado (id, nivel)
    VALUES (1, 'Básico')
  `).run();
    db.prepare(`
    CREATE TABLE IF NOT EXISTS procesos_erp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'activo',
      progreso INTEGER NOT NULL DEFAULT 0,
      fecha_inicio TEXT NOT NULL,
      referencia TEXT NOT NULL DEFAULT ''
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS recursos_erp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL,
      departamento TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'disponible'
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS mensajes_cliente (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      admin_id INTEGER,
      asunto TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      prioridad TEXT NOT NULL DEFAULT 'normal',
      leido INTEGER NOT NULL DEFAULT 0,
      fecha_envio TEXT NOT NULL,
      fecha_lectura TEXT DEFAULT NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
      FOREIGN KEY (admin_id) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS carritos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'abierto',
      fecha_creacion TEXT NOT NULL,
      fecha_actualizacion TEXT NOT NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS carrito_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      carrito_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 1,
      precio_unitario REAL NOT NULL DEFAULT 0,
      UNIQUE(carrito_id, producto_id),
      FOREIGN KEY (carrito_id) REFERENCES carritos(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS impuestos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      porcentaje REAL NOT NULL DEFAULT 0,
      estado INTEGER NOT NULL DEFAULT 1,
      fecha_creacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS promociones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      tipo_descuento TEXT NOT NULL DEFAULT 'porcentaje',
      valor REAL NOT NULL DEFAULT 0,
      fecha_inicio TEXT NOT NULL,
      fecha_fin TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activa',
      categoria_objetivo TEXT DEFAULT '',
      producto_id INTEGER,
      solo_destacados INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL,
      monto REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      descuento_total REAL NOT NULL DEFAULT 0,
      impuesto_total REAL NOT NULL DEFAULT 0,
      donacion_total REAL NOT NULL DEFAULT 0,
      metodo_pago TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      referencia TEXT DEFAULT '',
      fecha TEXT NOT NULL,
      detalle_fiscal TEXT DEFAULT '',
      factura_estado TEXT NOT NULL DEFAULT 'no_solicitada',
      factura_folio TEXT DEFAULT '',
      factura_fecha_envio TEXT DEFAULT NULL,
      paypal_order_id TEXT DEFAULT '',
      paypal_capture_id TEXT DEFAULT '',
      paypal_status TEXT DEFAULT '',
      paypal_payer_email TEXT DEFAULT '',
      paypal_payer_id TEXT DEFAULT '',
      FOREIGN KEY (pedido_id) REFERENCES ordenes(id) ON DELETE CASCADE
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS tickets_atencion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      asunto TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'abierto',
      fecha TEXT NOT NULL,
      respuesta TEXT DEFAULT '',
      fecha_respuesta TEXT DEFAULT NULL,
      admin_id INTEGER,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
      FOREIGN KEY (admin_id) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `).run();

  ensureColumn("clientes", "direccion TEXT DEFAULT ''");
  ensureColumn("usuarios", "failed_login_attempts INTEGER NOT NULL DEFAULT 0");
  ensureColumn("usuarios", "locked_until TEXT DEFAULT NULL");
  ensureColumn("usuarios", "last_failed_login_at TEXT DEFAULT NULL");
  ensureColumn("productos", "stock INTEGER DEFAULT 0");
  ensureColumn("productos", "categoria_id INTEGER");
  ensureColumn("productos", "sku TEXT DEFAULT ''");
  ensureColumn("productos", "imagen_url TEXT DEFAULT ''");
  ensureColumn("productos", "estado TEXT NOT NULL DEFAULT 'activo'");
  ensureColumn("productos", "destacado INTEGER NOT NULL DEFAULT 0");
  ensureColumn("ordenes", "folio TEXT DEFAULT ''");
  ensureColumn("ordenes", "estado_logistico TEXT NOT NULL DEFAULT 'en_almacen'");
  ensureColumn("ordenes", "fecha_estado_logistico TEXT DEFAULT NULL");
  ensureColumn("ordenes", "guia_envio TEXT DEFAULT ''");
  ensureColumn("ordenes", "subtotal REAL NOT NULL DEFAULT 0");
  ensureColumn("ordenes", "descuento_total REAL NOT NULL DEFAULT 0");
  ensureColumn("ordenes", "impuesto_total REAL NOT NULL DEFAULT 0");
  ensureColumn("ordenes", "donacion_total REAL NOT NULL DEFAULT 0");
  ensureColumn("ordenes", "canal TEXT NOT NULL DEFAULT 'erp'");
  ensureColumn("ordenes_items", "precio_lista REAL NOT NULL DEFAULT 0");
  ensureColumn("ordenes_items", "descuento_unitario REAL NOT NULL DEFAULT 0");
  ensureColumn("pagos", "factura_estado TEXT NOT NULL DEFAULT 'no_solicitada'");
  ensureColumn("pagos", "factura_folio TEXT DEFAULT ''");
  ensureColumn("pagos", "factura_fecha_envio TEXT DEFAULT NULL");
  ensureColumn("pagos", "paypal_order_id TEXT DEFAULT ''");
  ensureColumn("pagos", "paypal_capture_id TEXT DEFAULT ''");
  ensureColumn("pagos", "paypal_status TEXT DEFAULT ''");
  ensureColumn("pagos", "paypal_payer_email TEXT DEFAULT ''");
  ensureColumn("pagos", "paypal_payer_id TEXT DEFAULT ''");

  db.prepare(`
    INSERT OR IGNORE INTO impuestos (id, nombre, porcentaje, estado)
    VALUES (1, 'IVA', 16, 1)
  `).run();

  db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_pedido_unique
    ON pagos (pedido_id)
  `).run();

  db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_paypal_order_id
    ON pagos (paypal_order_id)
    WHERE trim(coalesce(paypal_order_id, '')) <> ''
  `).run();

  db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_paypal_capture_id
    ON pagos (paypal_capture_id)
    WHERE trim(coalesce(paypal_capture_id, '')) <> ''
  `).run();

  db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_carritos_cliente_abierto
    ON carritos (cliente_id)
    WHERE estado = 'abierto'
  `).run();

  syncCategorias();

  const existingPromo = db.prepare(`
    SELECT id
    FROM promociones
    WHERE nombre = 'Destacados de temporada'
  `).get();

  if (!existingPromo) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59).toISOString();

    db.prepare(`
      INSERT INTO promociones
        (nombre, descripcion, tipo_descuento, valor, fecha_inicio, fecha_fin, estado, solo_destacados)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "Destacados de temporada",
      "Descuento visible para productos destacados del catálogo.",
      "porcentaje",
      10,
      start,
      end,
      "activa",
      1
    );
  }
}

function getDB() {
  if (!db) initDB();
  return db;
}

module.exports = { initDB, getDB };
