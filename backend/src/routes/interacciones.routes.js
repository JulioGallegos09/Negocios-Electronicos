const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");
const { validateInteraccion } = require("../validators/interaccion.validator");

const router = express.Router();

// POST /interacciones
router.post("/", auth, async (req, res) => {
  const errors = validateInteraccion(req.body);
  if (errors.length) return res.status(400).json({ error: errors });

  const db = getDB();
  const { cliente_id, tipo, descripcion } = req.body;

  // validar cliente exista
  const cliente = await db.get("SELECT id FROM clientes WHERE id = ?", [cliente_id]);
  if (!cliente) return res.status(404).json({ error: "Cliente no existe" });

  const fecha = new Date().toISOString();

  const result = await db.run(
    `INSERT INTO interacciones (cliente_id, tipo, descripcion, fecha, usuario_id)
     VALUES (?,?,?,?,?)`,
    [cliente_id, tipo, descripcion, fecha, req.user.id]
  );

  const nueva = await db.get("SELECT * FROM interacciones WHERE id = ?", [result.lastID]);
  res.status(201).json(nueva);
});

// GET /clientes/:id/interacciones  (lo pide el PDF)
// Para mantenerlo en esta ruta: /api/interacciones/cliente/:id
router.get("/cliente/:id", auth, async (req, res) => {
  const db = getDB();
  const rows = await db.all(
    "SELECT * FROM interacciones WHERE cliente_id = ? ORDER BY id DESC",
    [req.params.id]
  );
  res.json(rows);
});

module.exports = router;
