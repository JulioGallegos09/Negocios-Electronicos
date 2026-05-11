const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");
const { requireRole } = require("../middleware/role");

const router = express.Router();

function normalizePromo(row) {
  return {
    ...row,
    valor: Number(row.valor || 0),
    solo_destacados: Number(row.solo_destacados || 0)
  };
}

router.get("/", (req, res) => {
  const db = getDB();
  const { all = "" } = req.query;
  const wantsAll = String(all) === "1" || String(all).toLowerCase() === "true";

  let sql = `SELECT * FROM promociones`;
  const params = [];

  if (!wantsAll) {
    const now = new Date().toISOString();
    sql += `
      WHERE lower(estado) IN ('activa', 'activo', 'vigente')
        AND fecha_inicio <= ?
        AND fecha_fin >= ?
    `;
    params.push(now, now);
  }

  sql += ` ORDER BY fecha_inicio DESC, id DESC`;

  const rows = db.prepare(sql).all(...params).map(normalizePromo);
  res.json(rows);
});

router.post("/", auth, requireRole("admin"), (req, res) => {
  const {
    nombre = "",
    descripcion = "",
    tipo_descuento = "porcentaje",
    valor = 0,
    fecha_inicio,
    fecha_fin,
    estado = "activa",
    categoria_objetivo = "",
    producto_id = null,
    solo_destacados = 0
  } = req.body || {};

  if (!nombre.trim() || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: "Nombre, fecha_inicio y fecha_fin son obligatorios" });
  }

  const db = getDB();
  const result = db.prepare(`
    INSERT INTO promociones
      (nombre, descripcion, tipo_descuento, valor, fecha_inicio, fecha_fin, estado, categoria_objetivo, producto_id, solo_destacados)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nombre.trim(),
    String(descripcion || "").trim(),
    String(tipo_descuento || "porcentaje").trim(),
    Number(valor || 0),
    fecha_inicio,
    fecha_fin,
    String(estado || "activa").trim(),
    String(categoria_objetivo || "").trim(),
    producto_id ? Number(producto_id) : null,
    Number(solo_destacados ? 1 : 0)
  );

  const created = db.prepare("SELECT * FROM promociones WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(normalizePromo(created));
});

router.put("/:id", auth, requireRole("admin"), (req, res) => {
  const db = getDB();
  const current = db.prepare("SELECT * FROM promociones WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Promoción no encontrada" });

  const body = req.body || {};
  db.prepare(`
    UPDATE promociones
    SET
      nombre = ?,
      descripcion = ?,
      tipo_descuento = ?,
      valor = ?,
      fecha_inicio = ?,
      fecha_fin = ?,
      estado = ?,
      categoria_objetivo = ?,
      producto_id = ?,
      solo_destacados = ?
    WHERE id = ?
  `).run(
    body.nombre?.trim() || current.nombre,
    body.descripcion?.trim() ?? current.descripcion,
    body.tipo_descuento?.trim() || current.tipo_descuento,
    Number(body.valor ?? current.valor),
    body.fecha_inicio || current.fecha_inicio,
    body.fecha_fin || current.fecha_fin,
    body.estado?.trim() || current.estado,
    body.categoria_objetivo?.trim() ?? current.categoria_objetivo,
    body.producto_id ? Number(body.producto_id) : (current.producto_id ?? null),
    Number(body.solo_destacados ?? current.solo_destacados ?? 0),
    req.params.id
  );

  const updated = db.prepare("SELECT * FROM promociones WHERE id = ?").get(req.params.id);
  res.json(normalizePromo(updated));
});

module.exports = router;
