// src/js/navbar-role.js
(function () {
  const token = localStorage.getItem("token");
  const rol = localStorage.getItem("rol");
  const nombre = localStorage.getItem("user_nombre") || "Usuario";

  const btnAdmin = document.getElementById("btnAdmin");
  const btnPerfil = document.getElementById("btnPerfil");
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const navUserName = document.getElementById("navUserName");

  // Sin sesión
  if (!token) {
    if (btnAdmin) btnAdmin.style.display = "none";
    if (btnPerfil) btnPerfil.style.display = "none";
    if (btnLogout) btnLogout.style.display = "none";
    if (btnLogin) btnLogin.style.display = "inline-block";
    if (navUserName) navUserName.textContent = "";
    return;
  }

  // Con sesión
  if (btnLogin) btnLogin.style.display = "none";
  if (btnLogout) btnLogout.style.display = "inline-block";
  if (btnPerfil) btnPerfil.style.display = "inline-block";

  // Mostrar nombre
  if (navUserName) {
    navUserName.textContent = `Hola, ${nombre} (${rol})`;
  }

  // Ocultar Admin si no corresponde
  if (btnAdmin && rol !== "admin") {
    btnAdmin.style.display = "none";
  }
})();
