(function () {
  const nav = document.querySelector("nav.navbar");
  if (!nav) return;

  injectNavStyles();

  const token = localStorage.getItem("token");
  const rol = String(localStorage.getItem("rol") || "").trim().toLowerCase();
  const nombre = (localStorage.getItem("user_nombre") || "Usuario").trim();
  const currentFile = getCurrentFile();
  const inViews = window.location.pathname.includes("/views/");
  const rootBase = inViews ? "../" : "";
  const viewsBase = inViews ? "../views/" : "views/";
  const collapseId = "appNavbarMenu";

  normalizeNavbar(nav, collapseId, rootBase);

  const actions = document.createElement("div");
  actions.className = "app-nav-actions";
  actions.innerHTML = buildMenu({
    token,
    rol,
    nombre,
    currentFile,
    rootBase,
    viewsBase
  });

  const collapse = nav.querySelector(`#${collapseId}`);
  if (!collapse) return;

  collapse.innerHTML = "";
  collapse.appendChild(actions);

  bindSessionActions(actions, rootBase);
})();

function injectNavStyles() {
  if (document.getElementById("app-navbar-style")) return;

  const style = document.createElement("style");
  style.id = "app-navbar-style";
  style.textContent = `
    .app-main-navbar {
      gap: .75rem;
      padding-top: 1rem;
      padding-bottom: 1rem;
    }

    .app-nav-actions {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: .75rem;
      margin-top: 1rem;
    }

    .app-nav-group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: .5rem;
    }

    .app-nav-accent {
      background-color: burlywood;
      border-color: burlywood;
      color: #fff;
    }

    .app-nav-accent:hover,
    .app-nav-accent:focus {
      background-color: #c89a5a;
      border-color: #c89a5a;
      color: #fff;
    }

    .app-nav-user-pill {
      display: inline-flex;
      align-items: center;
      gap: .35rem;
      padding: .45rem .85rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, .08);
      color: rgba(255, 255, 255, .92);
      font-size: .85rem;
      line-height: 1.2;
    }

    .app-nav-user-pill strong {
      color: burlywood;
      font-weight: 700;
    }

    .app-nav-actions .dropdown-menu {
      min-width: 15rem;
    }

    .app-nav-actions .dropdown-item.active,
    .app-nav-actions .dropdown-item:active {
      background-color: burlywood;
      color: #fff;
    }

    @media (min-width: 992px) {
      .app-nav-actions {
        width: auto;
        flex-direction: row;
        align-items: center;
        justify-content: flex-end;
        margin-top: 0;
        margin-left: auto;
      }
    }
  `;

  document.head.appendChild(style);
}

function normalizeNavbar(nav, collapseId, rootBase) {
  nav.classList.add("app-main-navbar", "navbar-expand-lg");

  const brand = nav.querySelector(".navbar-brand");
  if (brand && !brand.getAttribute("href")) {
    brand.setAttribute("href", `${rootBase}index.html`);
  }

  let toggler = nav.querySelector(".navbar-toggler");
  if (!toggler) {
    toggler = document.createElement("button");
    toggler.className = "navbar-toggler";
    toggler.type = "button";
    toggler.setAttribute("data-bs-toggle", "collapse");
    toggler.setAttribute("data-bs-target", `#${collapseId}`);
    toggler.setAttribute("aria-controls", collapseId);
    toggler.setAttribute("aria-expanded", "false");
    toggler.setAttribute("aria-label", "Abrir navegación");
    toggler.innerHTML = '<span class="navbar-toggler-icon"></span>';
  }

  let collapse = nav.querySelector(`#${collapseId}`);
  if (!collapse) {
    collapse = document.createElement("div");
    collapse.className = "collapse navbar-collapse";
    collapse.id = collapseId;
  }

  Array.from(nav.children).forEach(node => {
    if (
      node.classList.contains("navbar-brand") ||
      node.classList.contains("navbar-toggler") ||
      node.classList.contains("navbar-collapse")
    ) {
      return;
    }

    node.remove();
  });

  if (!toggler.parentElement || toggler.parentElement !== nav) {
    nav.appendChild(toggler);
  }

  if (!collapse.parentElement || collapse.parentElement !== nav) {
    nav.appendChild(collapse);
  }
}

function buildMenu({ token, rol, nombre, currentFile, rootBase, viewsBase }) {
  const roleLabel = getRoleLabel(rol);
  const isHome = ["index.html", "Landing.html"].includes(currentFile);
  const isCatalog = ["catalog.html", "product.html"].includes(currentFile);
  const isCart = ["cart.html", "pago.html", "micropago.html"].includes(currentFile);
  const isAccount = ["usuarios.html", "pedidos.html", "certificacion.html"].includes(currentFile);
  const isAdmin = ["admin.html", "admin-crm.html", "admin-scm.html", "admin-erp.html", "admin-commerce.html", "analytics.html"].includes(currentFile);
  const isSystem = ["infraestructura.html", "status.html", "disponibilidad.html", "tecnologias.html"].includes(currentFile);

  if (!token || !rol) {
    return `
      <div class="app-nav-group">
        ${linkButton(`${rootBase}index.html`, "Inicio", isHome, "bi-house-door")}
        ${linkButton(`${rootBase}certificacion.html`, "Certificación", currentFile === "certificacion.html", "bi-patch-check")}
      </div>
      <div class="app-nav-group">
        ${linkButton(`${rootBase}login.html`, "Ingresar", currentFile === "login.html", "bi-box-arrow-in-right", false)}
        ${linkButton(`${rootBase}register.html`, "Crear cuenta", currentFile === "register.html", "bi-person-plus")}
      </div>
    `;
  }

  if (rol === "usuario") {
    return `
      <div class="app-nav-group">
        ${linkButton(`${rootBase}index.html`, "Inicio", isHome, "bi-house-door")}
        ${linkButton(`${rootBase}catalog.html`, "Catálogo", isCatalog, "bi-grid")}
        ${cartButton(`${rootBase}cart.html`, isCart)}
        ${dropdownButton("Mi cuenta", "bi-person-circle", isAccount, [
          dropdownItem(`${viewsBase}usuarios.html`, "Mi perfil", currentFile === "usuarios.html", "bi-person"),
          dropdownItem(`${viewsBase}pedidos.html`, "Mis pedidos", currentFile === "pedidos.html", "bi-bag-check"),
          dropdownItem(`${rootBase}certificacion.html`, "Certificación", currentFile === "certificacion.html", "bi-patch-check")
        ])}
      </div>
      <div class="app-nav-group">
        ${userPill(nombre, roleLabel)}
        <button class="btn btn-sm btn-outline-light" id="btnLogoutPerfil" type="button">
          <i class="bi bi-box-arrow-right me-1"></i>Cerrar sesión
        </button>
      </div>
    `;
  }

  if (rol === "admin") {
    return `
      <div class="app-nav-group">
        ${linkButton(`${rootBase}index.html`, "Inicio", isHome, "bi-house-door")}
        ${dropdownButton("Administración", "bi-speedometer2", isAdmin, [
          dropdownItem(`${viewsBase}admin.html`, "Panel general", currentFile === "admin.html", "bi-grid-1x2"),
          dropdownItem(`${viewsBase}admin-crm.html`, "CRM y clientes", currentFile === "admin-crm.html", "bi-people"),
          dropdownItem(`${viewsBase}admin-scm.html`, "SCM e inventario", currentFile === "admin-scm.html", "bi-box-seam"),
          dropdownItem(`${viewsBase}admin-erp.html`, "ERP y órdenes", currentFile === "admin-erp.html", "bi-diagram-3"),
          dropdownItem(`${viewsBase}admin-commerce.html`, "Comercio electrónico", currentFile === "admin-commerce.html", "bi-cart-check"),
          dropdownItem(`${viewsBase}analytics.html`, "Analíticas", currentFile === "analytics.html", "bi-graph-up")
        ])}
        ${dropdownButton("Sistema", "bi-hdd-network", isSystem, [
          dropdownItem(`${viewsBase}infraestructura.html`, "Infraestructura", currentFile === "infraestructura.html", "bi-server"),
          dropdownItem(`${viewsBase}status.html`, "Estado del servicio", currentFile === "status.html", "bi-activity"),
          dropdownItem(`${viewsBase}disponibilidad.html`, "Disponibilidad", currentFile === "disponibilidad.html", "bi-shield-check"),
          dropdownItem(`${viewsBase}tecnologias.html`, "Tecnologías", currentFile === "tecnologias.html", "bi-cpu")
        ])}
      </div>
      <div class="app-nav-group">
        ${userPill(nombre, roleLabel)}
        <button class="btn btn-sm btn-outline-light" id="btnLogout" type="button">
          <i class="bi bi-box-arrow-right me-1"></i>Cerrar sesión
        </button>
      </div>
    `;
  }

  return `
    <div class="app-nav-group">
      ${linkButton(`${rootBase}index.html`, "Inicio", isHome, "bi-house-door")}
      ${dropdownButton("Operación", "bi-kanban", isAdmin, [
        dropdownItem(`${viewsBase}admin-erp.html`, "ERP y seguimiento", currentFile === "admin-erp.html", "bi-diagram-3")
      ])}
    </div>
    <div class="app-nav-group">
      ${userPill(nombre, roleLabel)}
      <button class="btn btn-sm btn-outline-light" id="btnLogout" type="button">
        <i class="bi bi-box-arrow-right me-1"></i>Cerrar sesión
      </button>
    </div>
  `;
}

function linkButton(href, label, active, icon = "", accentWhenActive = true) {
  const classes = [
    "btn",
    "btn-sm",
    accentWhenActive && active ? "app-nav-accent" : "btn-outline-light"
  ].join(" ");

  return `
    <a href="${href}" class="${classes}"${active ? ' aria-current="page"' : ""}>
      ${icon ? `<i class="bi ${icon} me-1"></i>` : ""}${label}
    </a>
  `;
}

function cartButton(href, active) {
  const classes = ["btn", "btn-sm", active ? "app-nav-accent" : "btn-outline-light"].join(" ");

  return `
    <a href="${href}" class="${classes}"${active ? ' aria-current="page"' : ""}>
      <i class="bi bi-cart3 me-1"></i>Carrito
      <span class="badge bg-light text-dark ms-1 d-none" data-cart-count>0</span>
    </a>
  `;
}

function dropdownButton(label, icon, active, items) {
  const classes = ["btn", "btn-sm", active ? "app-nav-accent" : "btn-outline-light", "dropdown-toggle"].join(" ");

  return `
    <div class="btn-group">
      <button type="button" class="${classes}" data-bs-toggle="dropdown" aria-expanded="false">
        ${icon ? `<i class="bi ${icon} me-1"></i>` : ""}${label}
      </button>
      <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end">
        ${items.join("")}
      </ul>
    </div>
  `;
}

function dropdownItem(href, label, active, icon = "") {
  return `
    <li>
      <a class="dropdown-item${active ? " active" : ""}" href="${href}"${active ? ' aria-current="page"' : ""}>
        ${icon ? `<i class="bi ${icon} me-2"></i>` : ""}${label}
      </a>
    </li>
  `;
}

function userPill(nombre, roleLabel) {
  return `
    <span class="app-nav-user-pill" id="navUserName">
      <strong>${escapeHtml(nombre)}</strong>
      <span>${escapeHtml(roleLabel)}</span>
    </span>
  `;
}

function bindSessionActions(container, rootBase) {
  container.querySelectorAll("#btnLogout, #btnLogoutPerfil").forEach(button => {
    button.addEventListener("click", () => {
      if (typeof window.clearSession === "function") {
        window.clearSession();
      } else {
        localStorage.removeItem("token");
        localStorage.removeItem("rol");
        localStorage.removeItem("user_email");
        localStorage.removeItem("user_nombre");
        localStorage.removeItem("user_id");
      }

      window.location.href = `${rootBase}login.html`;
    });
  });
}

function getCurrentFile() {
  const pathname = window.location.pathname || "";
  const lastSegment = pathname.split("/").filter(Boolean).pop() || "index.html";
  return lastSegment;
}

function getRoleLabel(rol) {
  if (rol === "admin") return "Administrador";
  if (rol === "ventas") return "Ventas";
  if (rol === "logistica") return "Logística";
  return "Usuario";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
