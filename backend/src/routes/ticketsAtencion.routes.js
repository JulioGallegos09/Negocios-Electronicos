const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { ensureClienteForUser, nowIso } = require("../services/ecommerce.service");

const router = express.Router();
const ESTADOS = new Set(["abierto", "en_proceso", "respondido", "cerrado"]);

function getTicketById(db, id) {
  return db.prepare(`
    SELECT
      t.*,
      c.nombre AS cliente_nombre,
      c.correo AS cliente_correo,
      a.nombre AS admin_nombre
    FROM tickets_atencion t
    JOIN clientes c ON c.id = t.cliente_id
    LEFT JOIN usuarios a ON a.id = t.admin_id
    WHERE t.id = ?
  `).get(id);
}

router.post("/", auth, requireRole("usuario"), (req, res) => {
  const { asunto = "", mensaje = "" } = req.body || {};
  if (!asunto.trim() || !mensaje.trim()) {
    return res.status(400).json({ error: "Asunto y mensaje son obligatorios" });
  }

  const db = getDB();
  const cliente = ensureClienteForUser(db, req.user);
  const fecha = nowIso();

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO tickets_atencion
        (cliente_id, asunto, mensaje, estado, fecha)
      VALUES (?, ?, ?, 'abierto', ?)
    `).run(cliente.id, asunto.trim(), mensaje.trim(), fecha);

    db.prepare(`
      INSERT INTO interacciones (cliente_id, tipo, descripcion, fecha, usuario_id)
      VALUES (?, 'ticket', ?, ?, ?)
    `).run(cliente.id, `Ticket creado: ${asunto.trim()}`, fecha, req.user.id);

    return result.lastInsertRowid;
  });

  const ticketId = tx();
  res.status(201).json(getTicketById(db, ticketId));
});

router.get("/mios", auth, requireRole("usuario"), (req, res) => {
  const db = getDB();
  const cliente = ensureClienteForUser(db, req.user);
  const rows = db.prepare(`
    SELECT
      t.*,
      a.nombre AS admin_nombre
    FROM tickets_atencion t
    LEFT JOIN usuarios a ON a.id = t.admin_id
    WHERE t.cliente_id = ?
    ORDER BY t.fecha DESC, t.id DESC
  `).all(cliente.id);

  res.json(rows);
});

router.get("/", auth, requireRole("admin"), (req, res) => {
  const db = getDB();
  const { estado = "" } = req.query;

  let sql = `
    SELECT
      t.*,
      c.nombre AS cliente_nombre,
      c.correo AS cliente_correo,
      a.nombre AS admin_nombre
    FROM tickets_atencion t
    JOIN clientes c ON c.id = t.cliente_id
    LEFT JOIN usuarios a ON a.id = t.admin_id
  `;
  const params = [];

  if (estado) {
    sql += ` WHERE t.estado = ?`;
    params.push(estado);
  }

  sql += ` ORDER BY t.fecha DESC, t.id DESC`;

  res.json(db.prepare(sql).all(...params));
});

router.get("/:id", auth, requireRole("usuario", "admin"), (req, res) => {
  const db = getDB();
  const ticket = getTicketById(db, req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });

  if (req.user.rol !== "admin") {
    const cliente = ensureClienteForUser(db, req.user);
    if (Number(ticket.cliente_id) !== Number(cliente.id)) {
      return res.status(403).json({ error: "No puedes ver este ticket" });
    }
  }

  res.json(ticket);
});

router.put("/:id/respuesta", auth, requireRole("admin"), (req, res) => {
  const { respuesta = "", estado = "respondido" } = req.body || {};
  if (!respuesta.trim()) {
    return res.status(400).json({ error: "La respuesta es obligatoria" });
  }

  if (!ESTADOS.has(String(estado))) {
    return res.status(400).json({ error: "Estado inválido" });
  }

  const db = getDB();
  const current = db.prepare("SELECT * FROM tickets_atencion WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Ticket no encontrado" });

  const fecha = nowIso();
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE tickets_atencion
      SET respuesta = ?, estado = ?, fecha_respuesta = ?, admin_id = ?
      WHERE id = ?
    `).run(respuesta.trim(), estado, fecha, req.user.id, req.params.id);

    db.prepare(`
      INSERT INTO interacciones (cliente_id, tipo, descripcion, fecha, usuario_id)
      VALUES (?, 'ticket_respuesta', ?, ?, ?)
    `).run(
      current.cliente_id,
      `Ticket #${req.params.id} respondido: ${respuesta.trim().slice(0, 180)}`,
      fecha,
      req.user.id
    );
  });

  tx();
  res.json(getTicketById(db, req.params.id));
});

module.exports = router;
