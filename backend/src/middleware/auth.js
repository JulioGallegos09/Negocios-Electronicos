const jwt = require("jsonwebtoken");

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: "No autorizado (sin token)" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // {id, rol, email}
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

module.exports = { auth };
