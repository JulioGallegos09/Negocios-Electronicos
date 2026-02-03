function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "No autorizado" });
    if (req.user.rol !== role) return res.status(403).json({ error: "Acceso denegado" });
    next();
  };
}

module.exports = { requireRole };
