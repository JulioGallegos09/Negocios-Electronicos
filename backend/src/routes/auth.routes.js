const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");


const router = express.Router();

// SEED ADMIN (solo desarrollo)
router.post("/seed", async (req, res) => {
  const db = getDB();

  const email = "admin@thriftcalido.com";
  const password = "admin123";

  const exists = db
    .prepare("SELECT id FROM usuarios WHERE email = ?")
    .get(email);

  if (exists) {
    return res.json({
      ok: true,
      message: "⚠️ Usuario admin ya existe"
    });
  }

  const bcrypt = require("bcryptjs");
  const hash = await bcrypt.hash(password, 10);

  db.prepare(
    `INSERT INTO usuarios (nombre, email, passwordHash, rol)
     VALUES (?, ?, ?, ?)`
  ).run(
    "Administrador",
    email,
    hash,
    "admin"
  );

  res.json({
    ok: true,
    message: "✅ Usuario admin creado",
    credentials: {
      email,
      password
    }
  });
});

// REGISTER (público = rol usuario; admin = puede asignar rol)
router.post("/register", (req, res) => {
  const db = getDB();
  const { nombre, email, password, rol } = req.body || {};

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: "Faltan datos (nombre, email, password)" });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 4 caracteres" });
  }

  // Validar si ya existe email
  const exists = db.prepare("SELECT id FROM usuarios WHERE email = ?").get(email.trim());
  if (exists) return res.status(409).json({ error: "El correo ya está registrado" });

  // Determinar rol final:
  // - Por defecto: usuario
  // - Si viene token y es admin: permite usar rol enviado
  let finalRol = "usuario";
  try {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      // si hay token, validamos con middleware manualmente usando tu mismo auth:
      // para no duplicar lógica, solo intentamos leer el rol desde JWT sin romper
      const jwt = require("jsonwebtoken");
      const token = authHeader.replace("Bearer ", "");
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload?.rol === "admin" && (rol === "admin" || rol === "usuario")) {
        finalRol = rol;
      }
    }
  } catch (_) {
    // si el token es inválido, ignoramos y registramos como usuario
    finalRol = "usuario";
  }

  const bcrypt = require("bcryptjs");
  const hash = bcrypt.hashSync(password, 10);

  const result = db.prepare(
    `INSERT INTO usuarios (nombre, email, passwordHash, rol)
     VALUES (?, ?, ?, ?)`
  ).run(nombre.trim(), email.trim(), hash, finalRol);

  const nuevo = db.prepare(
    "SELECT id, nombre, email, rol FROM usuarios WHERE id = ?"
  ).get(result.lastInsertRowid);

  return res.status(201).json({ ok: true, user: nuevo });
});


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
