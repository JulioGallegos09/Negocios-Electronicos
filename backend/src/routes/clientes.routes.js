const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");
const { validateCliente } = require("../validators/cliente.validator");

const router = express.Router();

// POST /clientes
router.post("/", auth, async (req, res) => {
  const errors = validateCliente(req.body);
  if (errors.length) return res.status(400).json({ error: errors });

  const db = getDB();
  const { nombre, correo, telefono = "", empresa = "" } = req.body;

  try {
    const fecha_registro = new Date().toISOString();
    const estado = "activo";
    const etapa_crm = "Prospecto";

    const result = await db.run(
      `INSERT INTO clientes (nombre, correo, telefono, empresa, fecha_registro, estado, etapa_crm)
       VALUES (?,?,?,?,?,?,?)`,
      [nombre, correo, telefono, empresa, fecha_registro, estado, etapa_crm]
    );

    const nuevo = await db.get("SELECT * FROM clientes WHERE id = ?", [result.lastID]);
    res.status(201).json(nuevo);
  } catch (e) {
    return res.status(409).json({ error: "Correo ya registrado" });
  }
});

// GET /clientes
router.get("/", auth, async (req, res) => {
  const db = getDB();
  const rows = await db.all("SELECT * FROM clientes ORDER BY id DESC");
  res.json(rows);
});

// GET /clientes/:id
router.get("/:id", auth, async (req, res) => {
  const db = getDB();
  const row = await db.get("SELECT * FROM clientes WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Cliente no encontrado" });
  res.json(row);
});

// PUT /clientes/:id
router.put("/:id", auth, async (req, res) => {
  const db = getDB();

  const current = await db.get("SELECT * FROM clientes WHERE id = ?", [req.params.id]);
  if (!current) return res.status(404).json({ error: "Cliente no encontrado" });

  const { nombre, correo, telefono, empresa, estado } = req.body;

  await db.run(
    `UPDATE clientes 
     SET nombre=?, correo=?, telefono=?, empresa=?, estado=?
     WHERE id=?`,
    [
      nombre ?? current.nombre,
      correo ?? current.correo,
      telefono ?? current.telefono,
      empresa ?? current.empresa,
      estado ?? current.estado,
      req.params.id
    ]
  );

  const updated = await db.get("SELECT * FROM clientes WHERE id = ?", [req.params.id]);
  res.json(updated);
});

// DELETE /clientes/:id
router.delete("/:id", auth, async (req, res) => {
  const db = getDB();
  await db.run("DELETE FROM clientes WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

// PUT /clientes/:id/etapa
router.put("/:id/etapa", auth, async (req, res) => {
  const db = getDB();
  const { etapa_crm } = req.body || {};
  const etapas = ["Prospecto","Activo","Frecuente","Inactivo"];

  if (!etapa_crm || !etapas.includes(etapa_crm)) {
    return res.status(400).json({ error: "etapa_crm inválida" });
  }

  const current = await db.get("SELECT * FROM clientes WHERE id = ?", [req.params.id]);
  if (!current) return res.status(404).json({ error: "Cliente no encontrado" });

  await db.run("UPDATE clientes SET etapa_crm=? WHERE id=?", [etapa_crm, req.params.id]);
  const updated = await db.get("SELECT * FROM clientes WHERE id = ?", [req.params.id]);
  res.json(updated);
});

module.exports = router;
