// backend/src/routes/productos.routes.js
const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/role");

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `prod_${Date.now()}${ext}`);
  }
});

const upload = multer({ storage });

const router = express.Router();

function ensureCategoria(db, categoria) {
  const nombre = String(categoria || "").trim();
  if (!nombre) return null;

  let categoriaRow = db.prepare(`
    SELECT *
    FROM categorias
    WHERE lower(nombre) = lower(?)
  `).get(nombre);

  if (categoriaRow) return categoriaRow;

  const slug = nombre.toLowerCase().replace(/\s+/g, "-");
  const result = db.prepare(`
    INSERT INTO categorias (nombre, slug, estado)
    VALUES (?, ?, 1)
  `).run(nombre, slug);

  categoriaRow = db.prepare("SELECT * FROM categorias WHERE id = ?").get(result.lastInsertRowid);
  return categoriaRow;
}

// POST /productos (admin) + imagen (multipart/form-data)
router.post("/", auth, requireAdmin, upload.single("imagen"), (req, res) => {
  const {
    nombre, descripcion, categoria,
    stock_actual = 0, stock_minimo = 0,
    proveedor_id, costo_unitario = 0,
    estrategia_logistica = "PULL",
    sku = "",
    estado = "activo",
    destacado = 0
  } = req.body || {};

  if (!nombre || !descripcion || !categoria || !proveedor_id) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const db = getDB();
  const prov = db.prepare("SELECT id FROM proveedores WHERE id = ?").get(Number(proveedor_id));
  if (!prov) return res.status(404).json({ error: "Proveedor no existe" });
  const categoriaRow = ensureCategoria(db, categoria);

  const estr = String(estrategia_logistica || "PULL").toUpperCase();
  if (!["PUSH", "PULL"].includes(estr)) {
    return res.status(400).json({ error: "estrategia_logistica inválida" });
  }

  // si subieron archivo -> guardar ruta accesible
  const imagen_url = req.file ? `/uploads/${req.file.filename}` : "";

  const r = db.prepare(`
    INSERT INTO productos
    (nombre, descripcion, categoria, categoria_id, stock_actual, stock, stock_minimo, proveedor_id, costo_unitario, estrategia_logistica, sku, imagen_url, estado, destacado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nombre.trim(),
    descripcion.trim(),
    categoria.trim(),
    categoriaRow?.id ?? null,
    Number(stock_actual),
    Number(stock_actual),
    Number(stock_minimo),
    Number(proveedor_id),
    Number(costo_unitario),
    estr,
    String(sku).trim(),
    imagen_url,
    String(estado || "activo").trim(),
    Number(destacado ? 1 : 0)
  );

  const nuevo = db.prepare("SELECT * FROM productos WHERE id = ?").get(r.lastInsertRowid);
  res.status(201).json(nuevo);
});

// GET /productos
router.get("/", auth, (req, res) => {
  const db = getDB();
  const { estrategia } = req.query;

  let rows;
  if (estrategia) {
    rows = db.prepare("SELECT * FROM productos WHERE estrategia_logistica = ? ORDER BY id DESC")
      .all(String(estrategia).toUpperCase());
  } else {
    rows = db.prepare("SELECT * FROM productos ORDER BY id DESC").all();
  }

  res.json(rows);
});

// PUT /productos/:id (admin)
router.put("/:id", auth, requireAdmin, (req, res) => {
  const db = getDB();
  const current = db.prepare("SELECT * FROM productos WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Producto no encontrado" });

  const body = req.body || {};
  const provId = body.proveedor_id ?? current.proveedor_id;

  const prov = db.prepare("SELECT id FROM proveedores WHERE id = ?").get(provId);
  if (!prov) return res.status(404).json({ error: "Proveedor no existe" });
  const categoriaNombre = body.categoria ?? current.categoria;
  const categoriaRow = ensureCategoria(db, categoriaNombre);

  const estr = (body.estrategia_logistica ?? current.estrategia_logistica).toUpperCase();
  if (!["PUSH", "PULL"].includes(estr)) {
    return res.status(400).json({ error: "estrategia_logistica inválida" });
  }

  db.prepare(`
    UPDATE productos SET
      nombre = ?, descripcion = ?, categoria = ?,
      categoria_id = ?, stock_actual = ?, stock_minimo = ?,
      stock = ?, proveedor_id = ?, costo_unitario = ?, estrategia_logistica = ?,
      sku = ?, imagen_url = ?, estado = ?, destacado = ?
    WHERE id = ?
  `).run(
    body.nombre ?? current.nombre,
    body.descripcion ?? current.descripcion,
    categoriaNombre,
    categoriaRow?.id ?? current.categoria_id ?? null,
    Number(body.stock_actual ?? current.stock_actual),
    Number(body.stock_minimo ?? current.stock_minimo),
    Number(body.stock_actual ?? current.stock_actual ?? current.stock),
    Number(provId),
    Number(body.costo_unitario ?? current.costo_unitario),
    estr,
    body.sku ?? current.sku,
    body.imagen_url ?? current.imagen_url,
    body.estado ?? current.estado ?? "activo",
    Number(body.destacado ?? current.destacado ?? 0),
    req.params.id
  );

  const updated = db.prepare("SELECT * FROM productos WHERE id = ?").get(req.params.id);
  res.json(updated);
});

// DELETE /productos/:id (admin)
router.delete("/:id", auth, requireAdmin, (req, res) => {
  const db = getDB();
  db.prepare("DELETE FROM productos WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// PUT /productos/:id/estrategia (admin) (para push/pull)
router.put("/:id/estrategia", auth, requireAdmin, (req, res) => {
  const db = getDB();
  const current = db.prepare("SELECT * FROM productos WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Producto no encontrado" });

  const estr = String(req.body?.estrategia_logistica || "").toUpperCase();
  if (!["PUSH", "PULL"].includes(estr)) return res.status(400).json({ error: "PUSH o PULL" });

  db.prepare("UPDATE productos SET estrategia_logistica = ? WHERE id = ?").run(estr, req.params.id);
  const updated = db.prepare("SELECT * FROM productos WHERE id = ?").get(req.params.id);
  res.json(updated);
});

// GET /api/productos/catalogo  (público)
router.get("/catalogo", (req, res) => {
  const db = getDB();

  const rows = db.prepare(`
    SELECT
      id,
      nombre,
      descripcion,
      categoria,
      sku,
      costo_unitario AS precio,
      stock_actual AS stock,
      stock_minimo,
      estrategia_logistica,
      imagen_url,
      estado,
      destacado
    FROM productos
    WHERE stock_actual > 0
      AND lower(coalesce(estado, 'activo')) <> 'inactivo'
      AND trim(coalesce(imagen_url, '')) <> ''
    ORDER BY id DESC
  `).all();

  res.json(rows);
});



module.exports = router;
