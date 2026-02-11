// src/js/navbar-role.js
(function () {
  const token = localStorage.getItem("token");
  const rol = localStorage.getItem("rol");

  const btnAdmin = document.getElementById("btnAdmin");
  const btnPerfil = document.getElementById("btnPerfil");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");

  // Si NO hay sesión
  if (!token) {
    if (btnAdmin) btnAdmin.style.display = "none";
    if (btnPerfil) btnPerfil.style.display = "none";
    if (btnLogout) btnLogout.style.display = "none";
    if (btnLogin) btnLogin.style.display = "inline-block";
    return;
  }

  // Si hay sesión
  if (btnLogin) btnLogin.style.display = "none";

  // Si no es admin, ocultar botón admin
  if (btnAdmin && rol !== "admin") {
    btnAdmin.style.display = "none";
  }
})();
