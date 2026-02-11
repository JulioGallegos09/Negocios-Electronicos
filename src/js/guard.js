// src/js/guard.js
(function () {
  // Uso:
  // <script src="../src/js/guard.js" data-roles="admin"></script>
  // o: data-roles="usuario,admin"
  const scriptTag = document.currentScript;
  const rolesAllowed = (scriptTag?.dataset?.roles || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const token = localStorage.getItem("token");
  const rol = localStorage.getItem("rol");

  // Sin sesión -> login
  if (!token || !rol) {
    window.location.href = (window.location.pathname.includes("/views/") ? "../login.html" : "login.html");
    return;
  }

  // Si hay roles definidos, validar acceso
  if (rolesAllowed.length && !rolesAllowed.includes(rol)) {
    // redirigir al dashboard correcto
    const base = window.location.pathname.includes("/views/") ? "../" : "";
    window.location.href = rol === "admin" ? `${base}views/admin.html` : `${base}views/usuarios.html`;
  }
})();
