const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const {
  ensureClienteForUser,
  getOrCreateOpenCart,
  getStock,
  nowIso,
  summarizeCartForCliente
} = require("../services/ecommerce.service");

const router = express.Router();

function loadCartItemForUser(db, itemId, user) {
  const baseSql = `
    SELECT
      cd.*,
      c.cliente_id
    FROM carrito_detalle cd
    JOIN carritos c ON c.id = cd.carrito_id
    WHERE cd.id = ?
  `;

  const item = db.prepare(baseSql).get(itemId);
  if (!item) return null;

  if (user.rol === "admin") return item;

  const cliente = ensureClienteForUser(db, user);
  return Number(item.cliente_id) === Number(cliente.id) ? item : null;
}

function canAccessCliente(db, clienteId, user) {
  if (user.rol === "admin") return true;
  const cliente = ensureClienteForUser(db, user);
  return Number(cliente.id) === Number(clienteId);
}

router.get("/mio", auth, requireRole("usuario", "admin"), (req, res) => {
  const db = getDB();
  const cliente = ensureClienteForUser(db, req.user);
  res.json(summarizeCartForCliente(db, cliente.id));
});

router.get("/:clienteId", auth, requireRole("usuario", "admin"), (req, res) => {
  const db = getDB();
  if (!canAccessCliente(db, req.params.clienteId, req.user)) {
    return res.status(403).json({ error: "No puedes consultar este carrito" });
  }
  const cliente = db.prepare("SELECT * FROM clientes WHERE id = ?").get(req.params.clienteId);
  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
  res.json(summarizeCartForCliente(db, cliente.id));
});

router.post("/agregar", auth, requireRole("usuario", "admin"), (req, res) => {
  const { producto_id, cantidad = 1 } = req.body || {};
  const db = getDB();
  const cliente = ensureClienteForUser(db, req.user);
  const producto = db.prepare("SELECT * FROM productos WHERE id = ?").get(producto_id);

  if (!producto) {
    return res.status(404).json({ error: "Producto no encontrado" });
  }

  if (String(producto.estado || "activo").toLowerCase() === "inactivo") {
    return res.status(400).json({ error: "El producto no está disponible" });
  }

  const qty = Number(cantidad);
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: "Cantidad inválida" });
  }

  const carrito = getOrCreateOpenCart(db, cliente.id);
  const existing = db.prepare(`
    SELECT *
    FROM carrito_detalle
    WHERE carrito_id = ? AND producto_id = ?
  `).get(carrito.id, producto.id);

  const nuevaCantidad = Number(existing?.cantidad || 0) + qty;
  if (nuevaCantidad > getStock(producto)) {
    return res.status(400).json({ error: "No hay stock suficiente para agregar esa cantidad" });
  }

  const tx = db.transaction(() => {
    if (existing) {
      db.prepare(`
        UPDATE carrito_detalle
        SET cantidad = ?, precio_unitario = ?
        WHERE id = ?
      `).run(nuevaCantidad, Number(producto.costo_unitario || 0), existing.id);
    } else {
      db.prepare(`
        INSERT INTO carrito_detalle (carrito_id, producto_id, cantidad, precio_unitario)
        VALUES (?, ?, ?, ?)
      `).run(carrito.id, producto.id, qty, Number(producto.costo_unitario || 0));
    }

    db.prepare(`
      UPDATE carritos
      SET fecha_actualizacion = ?
      WHERE id = ?
    `).run(nowIso(), carrito.id);
  });

  tx();

  res.status(201).json(summarizeCartForCliente(db, cliente.id));
});

router.put("/item/:id", auth, requireRole("usuario", "admin"), (req, res) => {
  const { cantidad } = req.body || {};
  const qty = Number(cantidad);
  const db = getDB();
  const item = loadCartItemForUser(db, req.params.id, req.user);

  if (!item) {
    return res.status(404).json({ error: "Elemento del carrito no encontrado" });
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: "Cantidad inválida" });
  }

  const producto = db.prepare("SELECT * FROM productos WHERE id = ?").get(item.producto_id);
  if (!producto) {
    return res.status(404).json({ error: "Producto no encontrado" });
  }

  if (qty > getStock(producto)) {
    return res.status(400).json({ error: "No hay stock suficiente para esa cantidad" });
  }

  db.prepare(`
    UPDATE carrito_detalle
    SET cantidad = ?, precio_unitario = ?
    WHERE id = ?
  `).run(qty, Number(producto.costo_unitario || 0), item.id);

  db.prepare(`
    UPDATE carritos
    SET fecha_actualizacion = ?
    WHERE id = ?
  `).run(nowIso(), item.carrito_id);

  res.json(summarizeCartForCliente(db, item.cliente_id));
});

router.delete("/item/:id", auth, requireRole("usuario", "admin"), (req, res) => {
  const db = getDB();
  const item = loadCartItemForUser(db, req.params.id, req.user);

  if (!item) {
    return res.status(404).json({ error: "Elemento del carrito no encontrado" });
  }

  db.prepare("DELETE FROM carrito_detalle WHERE id = ?").run(item.id);
  db.prepare(`
    UPDATE carritos
    SET fecha_actualizacion = ?
    WHERE id = ?
  `).run(nowIso(), item.carrito_id);

  res.json(summarizeCartForCliente(db, item.cliente_id));
});

router.delete("/vaciar/mio", auth, requireRole("usuario", "admin"), (req, res) => {
  const db = getDB();
  const cliente = ensureClienteForUser(db, req.user);
  const carrito = getOrCreateOpenCart(db, cliente.id);

  db.prepare("DELETE FROM carrito_detalle WHERE carrito_id = ?").run(carrito.id);
  db.prepare(`
    UPDATE carritos
    SET fecha_actualizacion = ?
    WHERE id = ?
  `).run(nowIso(), carrito.id);

  res.json(summarizeCartForCliente(db, cliente.id));
});

router.delete("/vaciar/:clienteId", auth, requireRole("usuario", "admin"), (req, res) => {
  const db = getDB();
  if (!canAccessCliente(db, req.params.clienteId, req.user)) {
    return res.status(403).json({ error: "No puedes vaciar este carrito" });
  }
  const carrito = db.prepare(`
    SELECT *
    FROM carritos
    WHERE cliente_id = ? AND estado = 'abierto'
    ORDER BY id DESC
    LIMIT 1
  `).get(req.params.clienteId);

  if (!carrito) {
    return res.json({
      carrito: null,
      items: [],
      promociones: [],
      impuestos: [],
      resumen: {
        items_count: 0,
        subtotal: 0,
        descuento_total: 0,
        subtotal_con_descuento: 0,
        impuesto_total: 0,
        total: 0
      }
    });
  }

  db.prepare("DELETE FROM carrito_detalle WHERE carrito_id = ?").run(carrito.id);
  db.prepare(`
    UPDATE carritos
    SET fecha_actualizacion = ?
    WHERE id = ?
  `).run(nowIso(), carrito.id);

  res.json(summarizeCartForCliente(db, Number(req.params.clienteId)));
});

module.exports = router;
