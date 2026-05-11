const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");
const { requireRole } = require("../middleware/role");

const router = express.Router();

router.get("/", (req, res) => {
  const db = getDB();
  const { all = "" } = req.query;
  const wantsAll = String(all) === "1" || String(all).toLowerCase() === "true";

  let sql = `SELECT * FROM impuestos`;
  if (!wantsAll) sql += ` WHERE estado = 1`;
  sql += ` ORDER BY id ASC`;

  const rows = db.prepare(sql).all().map(row => ({
    ...row,
    porcentaje: Number(row.porcentaje || 0),
    estado: Number(row.estado || 0)
  }));

  res.json(rows);
});

router.post("/", auth, requireRole("admin"), (req, res) => {
  const { nombre = "", porcentaje = 0, estado = 1 } = req.body || {};
  if (!nombre.trim()) {
    return res.status(400).json({ error: "El nombre del impuesto es obligatorio" });
  }

  const db = getDB();
  const result = db.prepare(`
    INSERT INTO impuestos (nombre, porcentaje, estado)
    VALUES (?, ?, ?)
  `).run(nombre.trim(), Number(porcentaje || 0), Number(estado ? 1 : 0));

  const created = db.prepare("SELECT * FROM impuestos WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({
    ...created,
    porcentaje: Number(created.porcentaje || 0),
    estado: Number(created.estado || 0)
  });
});

router.put("/:id", auth, requireRole("admin"), (req, res) => {
  const db = getDB();
  const current = db.prepare("SELECT * FROM impuestos WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Impuesto no encontrado" });

  const body = req.body || {};
  db.prepare(`
    UPDATE impuestos
    SET nombre = ?, porcentaje = ?, estado = ?
    WHERE id = ?
  `).run(
    body.nombre?.trim() || current.nombre,
    Number(body.porcentaje ?? current.porcentaje),
    Number((body.estado ?? current.estado) ? 1 : 0),
    req.params.id
  );

  const updated = db.prepare("SELECT * FROM impuestos WHERE id = ?").get(req.params.id);
  res.json({
    ...updated,
    porcentaje: Number(updated.porcentaje || 0),
    estado: Number(updated.estado || 0)
  });
});

module.exports = router;
