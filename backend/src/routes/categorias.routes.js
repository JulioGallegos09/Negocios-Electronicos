const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");
const { requireRole } = require("../middleware/role");

const router = express.Router();

function serialize(row) {
  return {
    ...row,
    estado: Number(row.estado || 0)
  };
}

router.get("/", (req, res) => {
  const db = getDB();
  const rows = db.prepare(`
    SELECT
      c.*,
      COUNT(p.id) AS productos_count
    FROM categorias c
    LEFT JOIN productos p ON p.categoria_id = c.id
    GROUP BY c.id
    ORDER BY c.nombre COLLATE NOCASE ASC
  `).all();

  res.json(rows.map(row => ({
    ...serialize(row),
    productos_count: Number(row.productos_count || 0)
  })));
});

router.post("/", auth, requireRole("admin"), (req, res) => {
  const { nombre = "", estado = 1 } = req.body || {};
  if (!nombre.trim()) {
    return res.status(400).json({ error: "El nombre de la categoría es obligatorio" });
  }

  const db = getDB();
  const slug = nombre.trim().toLowerCase().replace(/\s+/g, "-");
  const result = db.prepare(`
    INSERT INTO categorias (nombre, slug, estado)
    VALUES (?, ?, ?)
  `).run(nombre.trim(), slug, Number(estado ? 1 : 0));

  const created = db.prepare("SELECT * FROM categorias WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(serialize(created));
});

module.exports = router;
