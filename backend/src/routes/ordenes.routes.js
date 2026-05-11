const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { ensureClienteForUser } = require("../services/ecommerce.service");

const router = express.Router();
const ESTADOS_LOGISTICOS = [
  "en_almacen",
  "en_central_para_envio",
  "en_envio",
  "entregado",
  "incidencia",
  "cancelado"
];

function validarItems(items) {
  return Array.isArray(items) && items.length > 0 &&
    items.every(i =>
      Number.isFinite(Number(i.producto_id)) &&
      Number.isFinite(Number(i.cantidad)) &&
      Number(i.cantidad) > 0
    );
}

/**
 * POST /api/ordenes
 * Roles: admin, ventas
 */
router.post("/", auth, requireRole("admin", "ventas"), (req, res) => {
  const { cliente_id, items } = req.body || {};

  if (!cliente_id || !validarItems(items)) {
    return res.status(400).json({ error: "Datos de orden inválidos" });
  }

  const db = getDB();
  const cliente = db.prepare("SELECT * FROM clientes WHERE id = ?").get(cliente_id);
  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });

  const fecha = new Date().toISOString();

  try {
    const tx = db.transaction(() => {
      const ordenResult = db.prepare(`
        INSERT INTO ordenes (cliente_id, fecha, estado, estado_logistico, fecha_estado_logistico, total, usuario_id)
        VALUES (?, ?, 'pendiente', 'en_almacen', ?, 0, ?)
      `).run(cliente_id, fecha, fecha, req.user.id);

      const ordenId = ordenResult.lastInsertRowid;
      let total = 0;

      for (const item of items) {
        const producto = db.prepare(`
          SELECT * FROM productos WHERE id = ?
        `).get(item.producto_id);

        if (!producto) {
          throw new Error(`Producto no encontrado: ${item.producto_id}`);
        }

        const precio = Number(producto.costo_unitario ?? producto.precio ?? 0);
        const cantidad = Number(item.cantidad);
        total += precio * cantidad;

        db.prepare(`
          INSERT INTO ordenes_items (orden_id, producto_id, cantidad, precio)
          VALUES (?, ?, ?, ?)
        `).run(ordenId, item.producto_id, cantidad, precio);
      }

      db.prepare(`
        UPDATE ordenes
        SET total = ?
        WHERE id = ?
      `).run(total, ordenId);

      return { ordenId, total };
    });

    const result = tx();

    const orden = db.prepare(`
      SELECT o.*, c.nombre AS cliente_nombre, u.nombre AS usuario_nombre
      FROM ordenes o
      JOIN clientes c ON c.id = o.cliente_id
      LEFT JOIN usuarios u ON u.id = o.usuario_id
      WHERE o.id = ?
    `).get(result.ordenId);

    const itemsOrden = db.prepare(`
      SELECT oi.*, p.nombre AS producto_nombre
      FROM ordenes_items oi
      JOIN productos p ON p.id = oi.producto_id
      WHERE oi.orden_id = ?
    `).all(result.ordenId);

    res.status(201).json({
      ok: true,
      orden,
      items: itemsOrden
    });
  } catch (e) {
    res.status(500).json({ error: "Error al crear orden", detail: e.message });
  }
});

/**
 * GET /api/ordenes/mias
 * Roles: usuario
 */
router.get("/mias", auth, requireRole("usuario"), (req, res) => {
  const db = getDB();
  const cliente = ensureClienteForUser(db, req.user);

  const rows = db.prepare(`
    SELECT
      o.*,
      p.id AS pago_id,
      p.estado AS pago_estado,
      p.metodo_pago,
      p.referencia AS pago_referencia,
      p.factura_estado,
      p.factura_folio,
      p.factura_fecha_envio
    FROM ordenes o
    LEFT JOIN pagos p ON p.pedido_id = o.id
    WHERE o.cliente_id = ?
    ORDER BY o.fecha DESC, o.id DESC
  `).all(cliente.id);

  const orderIds = rows.map(row => row.id);
  const items = orderIds.length
    ? db.prepare(`
        SELECT
          oi.*,
          pr.nombre AS producto_nombre
        FROM ordenes_items oi
        JOIN productos pr ON pr.id = oi.producto_id
        WHERE oi.orden_id IN (${orderIds.map(() => "?").join(",")})
        ORDER BY oi.orden_id DESC, oi.id ASC
      `).all(...orderIds)
    : [];

  const itemsByOrder = new Map();
  for (const item of items) {
    const list = itemsByOrder.get(item.orden_id) || [];
    list.push({
      ...item,
      cantidad: Number(item.cantidad || 0),
      precio_lista: Number(item.precio_lista || 0),
      descuento_unitario: Number(item.descuento_unitario || 0),
      precio: Number(item.precio || 0)
    });
    itemsByOrder.set(item.orden_id, list);
  }

  res.json(rows.map(row => ({
    ...row,
    subtotal: Number(row.subtotal || 0),
    descuento_total: Number(row.descuento_total || 0),
    impuesto_total: Number(row.impuesto_total || 0),
    donacion_total: Number(row.donacion_total || 0),
    total: Number(row.total || 0),
    factura_estado: String(row.factura_estado || "no_solicitada"),
    items: itemsByOrder.get(row.id) || []
  })));
});

/**
 * GET /api/ordenes
 * Roles: admin, ventas
 */
router.get("/", auth, requireRole("admin", "ventas"), (req, res) => {
  const db = getDB();

  const rows = db.prepare(`
    SELECT
      o.*,
      c.nombre AS cliente_nombre,
      c.correo AS cliente_correo,
      u.nombre AS usuario_nombre
    FROM ordenes o
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.usuario_id
    ORDER BY o.id DESC
  `).all();

  res.json(rows);
});

/**
 * GET /api/ordenes/:id
 * Roles: admin, ventas
 */
router.get("/:id", auth, requireRole("admin", "ventas"), (req, res) => {
  const db = getDB();

  const orden = db.prepare(`
    SELECT
      o.*,
      c.nombre AS cliente_nombre,
      c.correo AS cliente_correo,
      u.nombre AS usuario_nombre
    FROM ordenes o
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.usuario_id
    WHERE o.id = ?
  `).get(req.params.id);

  if (!orden) return res.status(404).json({ error: "Orden no encontrada" });

  const items = db.prepare(`
    SELECT
      oi.*,
      p.nombre AS producto_nombre
    FROM ordenes_items oi
    JOIN productos p ON p.id = oi.producto_id
    WHERE oi.orden_id = ?
  `).all(req.params.id);

  res.json({ orden, items });
});

/**
 * PUT /api/ordenes/:id/estado
 * Body: { estado }
 * Roles: admin, ventas
 */
router.put("/:id/estado", auth, requireRole("admin", "ventas"), (req, res) => {
  const { estado } = req.body || {};
  const estados = ["pendiente", "procesando", "completada", "procesada", "cancelada"];

  if (!estados.includes(estado)) {
    return res.status(400).json({ error: "Estado inválido" });
  }

  const db = getDB();
  const orden = db.prepare(`SELECT * FROM ordenes WHERE id = ?`).get(req.params.id);
  if (!orden) return res.status(404).json({ error: "Orden no encontrada" });

  const updates = ["estado = ?"];
  const params = [estado];

  if (estado === "cancelada") {
    updates.push("estado_logistico = 'cancelado'");
    updates.push("fecha_estado_logistico = ?");
    params.push(new Date().toISOString());
  }

  params.push(req.params.id);

  db.prepare(`
    UPDATE ordenes
    SET ${updates.join(", ")}
    WHERE id = ?
  `).run(...params);

  const updated = db.prepare(`
    SELECT
      o.*,
      c.nombre AS cliente_nombre,
      c.correo AS cliente_correo,
      u.nombre AS usuario_nombre
    FROM ordenes o
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.usuario_id
    WHERE o.id = ?
  `).get(req.params.id);

  res.json(updated);
});

router.put("/:id/logistica", auth, requireRole("admin", "ventas", "logistica"), (req, res) => {
  const { estado_logistico, guia_envio = "" } = req.body || {};
  const estado = String(estado_logistico || "").trim().toLowerCase();

  if (!ESTADOS_LOGISTICOS.includes(estado)) {
    return res.status(400).json({ error: "Estado logístico inválido" });
  }

  const db = getDB();
  const orden = db.prepare("SELECT * FROM ordenes WHERE id = ?").get(req.params.id);
  if (!orden) return res.status(404).json({ error: "Orden no encontrada" });

  db.prepare(`
    UPDATE ordenes
    SET estado_logistico = ?, fecha_estado_logistico = ?, guia_envio = ?
    WHERE id = ?
  `).run(
    estado,
    new Date().toISOString(),
    String(guia_envio || "").trim(),
    req.params.id
  );

  const updated = db.prepare(`
    SELECT
      o.*,
      c.nombre AS cliente_nombre,
      c.correo AS cliente_correo,
      u.nombre AS usuario_nombre
    FROM ordenes o
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.usuario_id
    WHERE o.id = ?
  `).get(req.params.id);

  res.json(updated);
});

/**
 * POST /api/ordenes/procesar/:id
 * Automatización ERP:
 * - descuenta inventario
 * - registra movimiento
 * - cambia estado
 * Roles: admin, ventas
 */
router.post("/procesar/:id", auth, requireRole("admin", "ventas"), (req, res) => {
  const db = getDB();
  const ordenId = Number(req.params.id);

  const orden = db.prepare(`
    SELECT * FROM ordenes WHERE id = ?
  `).get(ordenId);

  if (!orden) return res.status(404).json({ error: "Orden no encontrada" });
  if (orden.estado === "procesada" || orden.estado === "completada") {
    return res.status(400).json({ error: "La orden ya fue procesada" });
  }
  if (orden.estado === "cancelada") {
    return res.status(400).json({ error: "No se puede procesar una orden cancelada" });
  }

  const items = db.prepare(`
    SELECT * FROM ordenes_items WHERE orden_id = ?
  `).all(ordenId);

  if (!items.length) {
    return res.status(400).json({ error: "La orden no tiene productos" });
  }

  try {
    const tx = db.transaction(() => {
      for (const item of items) {
        const producto = db.prepare(`
          SELECT * FROM productos WHERE id = ?
        `).get(item.producto_id);

        if (!producto) {
          throw new Error(`Producto no encontrado: ${item.producto_id}`);
        }

        const stockActual = Number(producto.stock_actual ?? producto.stock ?? 0);
        if (stockActual < Number(item.cantidad)) {
          throw new Error(`Stock insuficiente para producto ${producto.nombre}`);
        }

        const nuevoStock = stockActual - Number(item.cantidad);

        db.prepare(`
          UPDATE productos
          SET stock_actual = ?
          WHERE id = ?
        `).run(nuevoStock, item.producto_id);

        db.prepare(`
          INSERT INTO movimientos_inventario
            (producto_id, tipo, cantidad, motivo, referencia, fecha, usuario_id)
          VALUES
            (?, 'salida', ?, 'venta', ?, ?, ?)
        `).run(
          item.producto_id,
          item.cantidad,
          `orden:${ordenId}`,
          new Date().toISOString(),
          req.user.id
        );
      }

      db.prepare(`
        UPDATE ordenes
        SET estado = 'procesada', estado_logistico = 'en_almacen', fecha_estado_logistico = ?
        WHERE id = ?
      `).run(new Date().toISOString(), ordenId);
    });

    tx();

    res.json({
      ok: true,
      message: "Orden procesada correctamente"
    });
  } catch (e) {
    res.status(500).json({ error: "Error al procesar orden", detail: e.message });
  }
});

module.exports = router;
