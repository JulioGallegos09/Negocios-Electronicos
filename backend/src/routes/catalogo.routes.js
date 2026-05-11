const express = require("express");
const { getDB } = require("../db/init");
const {
  computePromotionForProduct,
  getActivePromotions,
  getStock
} = require("../services/ecommerce.service");

const router = express.Router();

function serializeProduct(producto, promociones) {
  const promo = computePromotionForProduct(producto, promociones, producto.costo_unitario);

  return {
    id: producto.id,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    categoria: producto.categoria,
    sku: producto.sku || "",
    imagen_url: producto.imagen_url || "",
    estado: producto.estado || "activo",
    destacado: Number(producto.destacado || 0),
    stock_actual: getStock(producto),
    stock_minimo: Number(producto.stock_minimo || 0),
    precio: Number(producto.costo_unitario || 0),
    precio_final: promo.precioFinal,
    descuento_unitario: promo.descuentoUnitario,
    promocion: promo.promocion
  };
}

router.get("/", (req, res) => {
  const db = getDB();
  const { categoria = "", buscar = "", destacado = "" } = req.query;

  let sql = `
    SELECT p.*, cat.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias cat ON cat.id = p.categoria_id
    WHERE lower(coalesce(p.estado, 'activo')) <> 'inactivo'
      AND coalesce(p.stock_actual, p.stock, 0) > 0
      AND trim(coalesce(p.imagen_url, '')) <> ''
  `;
  const params = [];

  if (categoria) {
    sql += ` AND (
      lower(coalesce(p.categoria, '')) = lower(?)
      OR lower(coalesce(cat.nombre, '')) = lower(?)
    )`;
    params.push(String(categoria).trim(), String(categoria).trim());
  }

  if (buscar) {
    sql += ` AND (
      lower(p.nombre) LIKE lower(?)
      OR lower(p.descripcion) LIKE lower(?)
      OR lower(coalesce(p.sku, '')) LIKE lower(?)
    )`;
    const term = `%${String(buscar).trim()}%`;
    params.push(term, term, term);
  }

  if (String(destacado) === "1" || String(destacado).toLowerCase() === "true") {
    sql += ` AND coalesce(p.destacado, 0) = 1`;
  }

  sql += ` ORDER BY coalesce(p.destacado, 0) DESC, p.id DESC`;

  const rows = db.prepare(sql).all(...params);
  const promociones = getActivePromotions(db);
  const items = rows.map(row => serializeProduct(row, promociones));
  const categorias = db.prepare(`
    SELECT nombre
    FROM categorias
    WHERE estado = 1
    ORDER BY nombre COLLATE NOCASE ASC
  `).all().map(row => row.nombre);

  const novedades = db.prepare(`
    SELECT p.*, cat.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias cat ON cat.id = p.categoria_id
    WHERE lower(coalesce(p.estado, 'activo')) <> 'inactivo'
      AND coalesce(p.stock_actual, p.stock, 0) > 0
      AND trim(coalesce(p.imagen_url, '')) <> ''
    ORDER BY p.id DESC
    LIMIT 4
  `).all().map(row => serializeProduct(row, promociones));

  res.json({
    items,
    categorias,
    novedades,
    promociones: promociones.map(promo => ({
      id: promo.id,
      nombre: promo.nombre,
      descripcion: promo.descripcion,
      tipo_descuento: promo.tipo_descuento,
      valor: Number(promo.valor || 0),
      categoria_objetivo: promo.categoria_objetivo || "",
      producto_id: promo.producto_id ?? null,
      solo_destacados: Number(promo.solo_destacados || 0)
    }))
  });
});

router.get("/:id", (req, res) => {
  const db = getDB();
  const producto = db.prepare(`
    SELECT p.*, cat.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias cat ON cat.id = p.categoria_id
    WHERE p.id = ?
      AND lower(coalesce(p.estado, 'activo')) <> 'inactivo'
      AND trim(coalesce(p.imagen_url, '')) <> ''
  `).get(req.params.id);

  if (!producto) {
    return res.status(404).json({ error: "Producto no encontrado" });
  }

  const promociones = getActivePromotions(db);
  const item = serializeProduct(producto, promociones);

  res.json({
    item,
    promociones_relacionadas: promociones.filter(promo =>
      item.promocion?.id === promo.id ||
      Number(promo.producto_id || 0) === Number(item.id) ||
      (promo.categoria_objetivo || "").trim().toLowerCase() === String(item.categoria || "").trim().toLowerCase()
    )
  });
});

module.exports = router;
