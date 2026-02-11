const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDB } = require("../db/init");

const router = express.Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Faltan datos" });

  try {
    const db = getDB();
    const user = db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email);

    if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

    const ok = bcrypt.compareSync(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });

    const token = jwt.sign(
      { id: user.id, rol: user.rol, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error en login" });
  }
});

module.exports = router;
