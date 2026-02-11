const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");

const router = express.Router();

// GET /api/metricas  -> calcula + guarda snapshot
router.get("/", auth, (req, res) => {
  const db = getDB();

  const totalClientes = db.prepare("SELECT COUNT(*) as total FROM clientes").get();
  const activos = db.prepare("SELECT COUNT(*) as total FROM clientes WHERE estado='activo'").get();
  const inactivos = db.prepare("SELECT COUNT(*) as total FROM clientes WHERE estado='inactivo'").get();
  const totalInteracciones = db.prepare("SELECT COUNT(*) as total FROM interacciones").get();

  const fecha = new Date().toISOString();

  db.prepare(
    `INSERT INTO metricas 
      (fecha, total_clientes, clientes_activos, clientes_inactivos, total_interacciones, generado_por)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    fecha,
    totalClientes.total,
    activos.total,
    inactivos.total,
    totalInteracciones.total,
    req.user.id
  );

  res.json({
    fecha,
    total_clientes: totalClientes.total,
    clientes_activos: activos.total,
    clientes_inactivos: inactivos.total,
    total_interacciones: totalInteracciones.total
  });
});

// GET /api/metricas/historico  -> muestra la tabla "metricas"
router.get("/historico", auth, (req, res) => {
  const db = getDB();
  const rows = db
    .prepare("SELECT * FROM metricas ORDER BY id DESC LIMIT 50")
    .all();
  res.json(rows);
});

module.exports = router;
