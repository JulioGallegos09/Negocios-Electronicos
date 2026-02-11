// src/js/auth-ui.js
function requireAuth(allowedRoles = []) {
  const token = localStorage.getItem("token");
  const rol = localStorage.getItem("rol");

  if (!token || !rol) {
    window.location.href = "/login.html";
    return false;
  }

  if (allowedRoles.length && !allowedRoles.includes(rol)) {
    // si no tiene rol, manda a su dashboard correcto
    window.location.href = (rol === "admin") ? "/views/admin.html" : "/views/usuarios.html";
    return false;
  }

  return true;
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("rol");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_nombre");
  localStorage.removeItem("user_id");
  window.location.href = "/login.html";
}
