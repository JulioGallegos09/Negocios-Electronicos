const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");

const router = express.Router();

router.get("/", auth, async (req, res) => {
  const db = getDB();

  const totalClientes = await db.get("SELECT COUNT(*) as total FROM clientes");
  const activos = await db.get("SELECT COUNT(*) as total FROM clientes WHERE estado='activo'");
  const inactivos = await db.get("SELECT COUNT(*) as total FROM clientes WHERE estado='inactivo'");

  // interacciones por cliente
  const interaccionesPorCliente = await db.all(`
    SELECT c.id as cliente_id, c.nombre, COUNT(i.id) as interacciones
    FROM clientes c
    LEFT JOIN interacciones i ON i.cliente_id = c.id
    GROUP BY c.id
    ORDER BY interacciones DESC
  `);

  // clientes sin interacción en 30 días
  const sinReciente = await db.all(`
    SELECT c.id, c.nombre, c.correo
    FROM clientes c
    LEFT JOIN interacciones i ON i.cliente_id = c.id
    GROUP BY c.id
    HAVING MAX(i.fecha) IS NULL OR MAX(i.fecha) < datetime('now','-30 days')
  `);

  res.json({
    totalClientes: totalClientes.total,
    activos: activos.total,
    inactivos: inactivos.total,
    interaccionesPorCliente,
    clientesSinInteraccionReciente: sinReciente
  });
});

module.exports = router;
