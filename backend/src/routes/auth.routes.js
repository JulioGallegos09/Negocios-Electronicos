const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");
const { ensureClienteForUser } = require("../services/ecommerce.service");

const router = express.Router();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const PASSWORD_MIN_LENGTH = 8;
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_LIMIT_MAX = 30;
const authRateLimitStore = new Map();

function nowIso() {
  return new Date().toISOString();
}

function isProduction() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function isSeedEnabled() {
  return String(process.env.ALLOW_AUTH_SEED || "").toLowerCase() === "true";
}

function getClientKey(req) {
  return req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
}

function authRateLimit(req, res, next) {
  const key = `${getClientKey(req)}:${req.path}`;
  const now = Date.now();
  const current = authRateLimitStore.get(key);

  if (!current || now > current.resetAt) {
    authRateLimitStore.set(key, { count: 1, resetAt: now + AUTH_RATE_LIMIT_WINDOW_MS });
    return next();
  }

  current.count += 1;
  if (current.count > AUTH_RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: "Demasiados intentos. Intenta de nuevo en unos minutos."
    });
  }

  return next();
}

function validatePassword(password) {
  const value = String(password || "");

  if (value.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
  }

  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(value) || !/\d/.test(value)) {
    return "La contraseña debe incluir al menos una letra y un número";
  }

  const weakPasswords = new Set([
    "12345678",
    "password",
    "password1",
    "admin123",
    "admin1234",
    "qwerty123"
  ]);

  if (weakPasswords.has(value.toLowerCase())) {
    return "La contraseña es demasiado común";
  }

  return null;
}

function isUserLocked(user) {
  if (!user?.locked_until) return false;
  return new Date(user.locked_until).getTime() > Date.now();
}

function registerFailedLogin(db, user) {
  const attempts = Number(user.failed_login_attempts || 0) + 1;
  const lockedUntil = attempts >= MAX_LOGIN_ATTEMPTS
    ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
    : null;

  db.prepare(`
    UPDATE usuarios
    SET failed_login_attempts = ?,
        locked_until = ?,
        last_failed_login_at = ?
    WHERE id = ?
  `).run(attempts, lockedUntil, nowIso(), user.id);

  return lockedUntil;
}

function clearFailedLogins(db, userId) {
  db.prepare(`
    UPDATE usuarios
    SET failed_login_attempts = 0,
        locked_until = NULL,
        last_failed_login_at = NULL
    WHERE id = ?
  `).run(userId);
}

function buildToken(user) {
  return jwt.sign(
    { id: user.id, rol: user.rol, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
}

/**
 * POST /api/auth/seed
 * Crea un admin de prueba (solo desarrollo)
 */
router.post("/seed", (req, res) => {
  if (isProduction() || !isSeedEnabled()) {
    return res.status(403).json({ error: "Seed de autenticación deshabilitado" });
  }

  const db = getDB();

  const email = "admin@thriftcalido.com";
  const password = "admin123";

  const exists = db.prepare("SELECT id FROM usuarios WHERE email = ?").get(email);
  if (exists) {
    return res.json({ ok: true, message: "⚠️ Usuario admin ya existe" });
  }

  const hash = bcrypt.hashSync(password, 10);

  db.prepare(
    `INSERT INTO usuarios (nombre, email, passwordHash, rol)
     VALUES (?, ?, ?, ?)`
  ).run("Administrador", email, hash, "admin");

  res.json({
    ok: true,
    message: "✅ Usuario admin creado",
    credentials: { email, password }
  });
});

function handleRegister(req, res) {
  const { nombre, email, password, telefono = "", direccion = "" } = req.body || {};
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const db = getDB();

  // 1) validar email único en usuarios
  const existsUser = db.prepare("SELECT id FROM usuarios WHERE email = ?").get(email.trim());
  if (existsUser) return res.status(409).json({ error: "El correo ya está registrado" });

  // 2) crear usuario
  const passwordHash = bcrypt.hashSync(password, 10);
  const rUser = db.prepare(
    `INSERT INTO usuarios (nombre, email, passwordHash, rol)
     VALUES (?, ?, ?, ?)`
  ).run(nombre.trim(), email.trim(), passwordHash, "usuario");

  const userId = rUser.lastInsertRowid;

  // 3) crear/obtener cliente (prospecto)
  let cliente = db.prepare("SELECT * FROM clientes WHERE correo = ?").get(email.trim());

  if (!cliente) {
    const fecha_registro = new Date().toISOString();
    const estado = "activo";
    const etapa_crm = "Prospecto";

    const rCliente = db.prepare(
      `INSERT INTO clientes (nombre, correo, telefono, direccion, empresa, fecha_registro, estado, etapa_crm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(nombre.trim(), email.trim(), telefono.trim(), direccion.trim(), "", fecha_registro, estado, etapa_crm);

    cliente = db.prepare("SELECT * FROM clientes WHERE id = ?").get(rCliente.lastInsertRowid);
  }

  // 4) interacción automática de registro
  const fecha = new Date().toISOString();
  db.prepare(
    `INSERT INTO interacciones (cliente_id, tipo, descripcion, fecha, usuario_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(cliente.id, "registro", "Cliente se registró en el sitio", fecha, userId);

  // 5) token
  const token = buildToken({ id: userId, rol: "usuario", email: email.trim() });

  return res.status(201).json({
    ok: true,
    token,
    user: { id: userId, nombre: nombre.trim(), email: email.trim(), rol: "usuario" },
    cliente: { id: cliente.id, etapa_crm: cliente.etapa_crm }
  });
}

/**
 * POST /api/auth/register
 * Registra usuario (rol usuario) + crea cliente prospecto + interacción registro
 */
router.post("/register", authRateLimit, handleRegister);
router.post("/registro", authRateLimit, handleRegister);

/**
 * POST /api/auth/login
 */
router.post("/login", authRateLimit, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Faltan datos" });

  const db = getDB();
  const user = db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email.trim());
  if (!user) return res.status(401).json({ error: "Credenciales inválidas" });

  if (isUserLocked(user)) {
    return res.status(423).json({
      error: "Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.",
      locked_until: user.locked_until
    });
  }

  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) {
    const lockedUntil = registerFailedLogin(db, user);
    if (lockedUntil) {
      return res.status(423).json({
        error: "Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.",
        locked_until: lockedUntil
      });
    }

    return res.status(401).json({ error: "Credenciales inválidas" });
  }

  clearFailedLogins(db, user.id);

  const token = buildToken(user);

  res.json({
    token,
    user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
  });
});

router.put("/password", auth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Contraseña actual y nueva contraseña son obligatorias" });
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }

  const db = getDB();
  const user = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const ok = bcrypt.compareSync(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "La contraseña actual no es correcta" });

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`
    UPDATE usuarios
    SET passwordHash = ?,
        failed_login_attempts = 0,
        locked_until = NULL,
        last_failed_login_at = NULL
    WHERE id = ?
  `).run(passwordHash, user.id);

  res.json({ ok: true, message: "Contraseña actualizada correctamente" });
});

router.post("/logout", auth, (req, res) => {
  res.json({ ok: true, message: "Sesión cerrada" });
});

router.get("/perfil", auth, (req, res) => {
  const db = getDB();
  const user = db.prepare(`
    SELECT id, nombre, email, rol
    FROM usuarios
    WHERE id = ?
  `).get(req.user.id);

  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const cliente = ensureClienteForUser(db, { ...req.user, nombre: user.nombre });
  res.json({ user, cliente });
});

router.put("/perfil", auth, (req, res) => {
  const db = getDB();
  const currentUser = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(req.user.id);
  if (!currentUser) return res.status(404).json({ error: "Usuario no encontrado" });

  const clienteActual = ensureClienteForUser(db, { ...req.user, nombre: currentUser.nombre });
  const body = req.body || {};

  const nombre = String(body.nombre ?? currentUser.nombre).trim();
  const email = String(body.email ?? currentUser.email).trim();
  const telefono = String(body.telefono ?? clienteActual.telefono ?? "").trim();
  const direccion = String(body.direccion ?? clienteActual.direccion ?? "").trim();
  const empresa = String(body.empresa ?? clienteActual.empresa ?? "").trim();

  if (!nombre || !email) {
    return res.status(400).json({ error: "Nombre y correo son obligatorios" });
  }

  const existing = db.prepare(`
    SELECT id
    FROM usuarios
    WHERE lower(email) = lower(?) AND id <> ?
  `).get(email, currentUser.id);

  if (existing) {
    return res.status(409).json({ error: "El correo ya está registrado por otro usuario" });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE usuarios
      SET nombre = ?, email = ?
      WHERE id = ?
    `).run(nombre, email, currentUser.id);

    db.prepare(`
      UPDATE clientes
      SET nombre = ?, correo = ?, telefono = ?, direccion = ?, empresa = ?
      WHERE id = ?
    `).run(nombre, email, telefono, direccion, empresa, clienteActual.id);
  });

  tx();

  const updatedUser = db.prepare(`
    SELECT id, nombre, email, rol
    FROM usuarios
    WHERE id = ?
  `).get(currentUser.id);
  const updatedCliente = db.prepare("SELECT * FROM clientes WHERE id = ?").get(clienteActual.id);
  const token = buildToken(updatedUser);

  res.json({
    ok: true,
    token,
    user: updatedUser,
    cliente: updatedCliente
  });
});

module.exports = router;
