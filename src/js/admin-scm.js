// src/js/admin-scm.js
(function () {
  const token = localStorage.getItem("token");
  const rol = localStorage.getItem("rol");

  const warn = document.getElementById("adminWarn");
  const msgBox = document.getElementById("msgBox");

  // protecciones
  if (!token) {
    window.location.href = "../login.html";
    return;
  }
  if (rol !== "admin") {
    warn.style.display = "block";
    warn.textContent = "Acceso restringido: esta sección es solo para administradores.";
    setTimeout(() => (window.location.href = "usuarios.html"), 1200);
    return;
  }

  const showMsg = (text, type = "success") => {
    msgBox.innerHTML = `<div class="alert alert-${type}">${text}</div>`;
    setTimeout(() => (msgBox.innerHTML = ""), 2500);
  };

  // modals
  const modalEditProv = new bootstrap.Modal("#modalEditProv");
  const modalDelProv = new bootstrap.Modal("#modalDelProv");
  const modalEditProd = new bootstrap.Modal("#modalEditProd");
  const modalDelProd = new bootstrap.Modal("#modalDelProd");

  // dom
  const provBody = document.getElementById("provBody");
  const prodBody = document.getElementById("prodBody");
  const histBody = document.getElementById("histBody");

  const formProveedor = document.getElementById("formProveedor");
  const formProducto = document.getElementById("formProducto");
  const formMovimiento = document.getElementById("formMovimiento");

  const btnReloadProv = document.getElementById("btnReloadProv");
  const btnReloadProd = document.getElementById("btnReloadProd");
  const btnReloadHist = document.getElementById("btnReloadHist");

  const filterEstr = document.getElementById("filterEstr");

  const pr_prov = document.getElementById("pr_prov");
  const mv_producto = document.getElementById("mv_producto");
  const hist_producto = document.getElementById("hist_producto");

  // modal inputs prov
  const formEditProv = document.getElementById("formEditProv");
  const formDelProv = document.getElementById("formDelProv");

  // modal inputs prod
  const formEditProd = document.getElementById("formEditProd");
  const formDelProd = document.getElementById("formDelProd");

  let PROVEEDORES = [];
  let PRODUCTOS = [];

  // ---------- helpers ----------
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isoToLocal(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso || "";
    }
  }

  // ---------- LOAD PROVEEDORES ----------
  async function loadProveedores() {
    PROVEEDORES = await apiFetch("/proveedores", { method: "GET" });

    provBody.innerHTML = PROVEEDORES.map(p => `
      <tr>
        <td>${p.id}</td>
        <td>${escapeHtml(p.nombre)}</td>
        <td>${escapeHtml(p.contacto)}</td>
        <td>${escapeHtml(p.correo)}</td>
        <td>${escapeHtml(p.telefono)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1"
                  data-action="edit-prov" data-id="${p.id}">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger"
                  data-action="del-prov" data-id="${p.id}">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `).join("");

    // cargar selects de proveedor (productos)
    if (PROVEEDORES.length === 0) {
      pr_prov.innerHTML = `<option value="">No hay proveedores</option>`;
    } else {
      pr_prov.innerHTML =
        `<option value="">Selecciona...</option>` +
        PROVEEDORES.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)} (#${p.id})</option>`).join("");
    }
  }

  // ---------- LOAD PRODUCTOS ----------
  async function loadProductos() {
    const estr = filterEstr?.value || "";
    const qs = estr ? `?estrategia=${encodeURIComponent(estr)}` : "";

    PRODUCTOS = await apiFetch("/productos" + qs, { method: "GET" });

    const provMap = new Map(PROVEEDORES.map(p => [p.id, p.nombre]));

    prodBody.innerHTML = PRODUCTOS.map(pr => `
      <tr>
        <td>${pr.id}</td>
        <td>${escapeHtml(pr.nombre)}</td>
        <td class="mono">${escapeHtml(pr.sku)}</td>
        <td>$${Number(pr.precio ?? 0).toFixed(2)}</td>
        <td>${Number(pr.stock ?? 0)}</td>
        <td>${Number(pr.stock_minimo ?? 0)}</td>
        <td>${escapeHtml(provMap.get(pr.proveedor_id) || ("#" + pr.proveedor_id))}</td>
        <td><span class="badge tag-burly">${escapeHtml(pr.estrategia_logistica || "")}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1"
                  data-action="edit-prod" data-id="${pr.id}">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger"
                  data-action="del-prod" data-id="${pr.id}">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `).join("");

    // selects para inventario
    if (PRODUCTOS.length === 0) {
      mv_producto.innerHTML = `<option value="">No hay productos</option>`;
      hist_producto.innerHTML = `<option value="">No hay productos</option>`;
    } else {
      mv_producto.innerHTML =
        `<option value="">Selecciona...</option>` +
        PRODUCTOS.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)} (#${p.id})</option>`).join("");

      hist_producto.innerHTML =
        `<option value="">Selecciona...</option>` +
        PRODUCTOS.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)} (#${p.id})</option>`).join("");
    }
  }

  // ---------- CREATE PROVEEDOR ----------
  formProveedor?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      nombre: document.getElementById("p_nombre").value.trim(),
      contacto: document.getElementById("p_contacto").value.trim(),
      correo: document.getElementById("p_correo").value.trim(),
      telefono: document.getElementById("p_telefono").value.trim(),
    };

    try {
      await apiFetch("/proveedores", { method: "POST", body: JSON.stringify(payload) });
      showMsg("✅ Proveedor creado", "success");
      formProveedor.reset();
      await loadProveedores();
      await loadProductos();
    } catch (err) {
      showMsg("❌ " + err.message, "danger");
    }
  });

  // ---------- CREATE PRODUCTO ----------
  formProducto?.addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const fd = new FormData();
    fd.append("proveedor_id", document.getElementById("pr_prov").value);
    fd.append("nombre", document.getElementById("pr_nombre").value.trim());
    fd.append("sku", document.getElementById("pr_sku").value.trim());

    // estos deben existir en tu form (si no, ponlos o quítalos del backend)
    fd.append("descripcion", document.getElementById("pr_desc").value.trim());
    fd.append("categoria", document.getElementById("pr_cat").value.trim());

    fd.append("costo_unitario", document.getElementById("pr_precio").value);
    fd.append("stock_actual", document.getElementById("pr_stock").value);
    fd.append("stock_minimo", document.getElementById("pr_min").value);
    fd.append("estrategia_logistica", document.getElementById("pr_estr").value);

    const file = document.getElementById("pr_img").files[0];
    if (file) fd.append("imagen", file);

    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:3001/api/productos", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || data?.message || "Error creando producto");

    showMsg("✅ Producto creado con imagen", "success");
    formProducto.reset();
    await loadProductos();
  } catch (err) {
    showMsg("❌ " + err.message, "danger");
  }
});

  // ---------- TABLE BUTTONS (delegation) ----------
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;

    if (action === "edit-prov") openEditProveedor(id);
    if (action === "del-prov") openDeleteProveedor(id);
    if (action === "edit-prod") openEditProducto(id);
    if (action === "del-prod") openDeleteProducto(id);
  });

  // ---------- EDIT PROVEEDOR ----------
  function openEditProveedor(id) {
    const p = PROVEEDORES.find(x => x.id === id);
    if (!p) return;

    document.getElementById("ep_id").value = p.id;
    document.getElementById("ep_nombre").value = p.nombre ?? "";
    document.getElementById("ep_contacto").value = p.contacto ?? "";
    document.getElementById("ep_correo").value = p.correo ?? "";
    document.getElementById("ep_telefono").value = p.telefono ?? "";

    modalEditProv.show();
  }

  formEditProv?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Number(document.getElementById("ep_id").value);

    const payload = {
      nombre: document.getElementById("ep_nombre").value.trim(),
      contacto: document.getElementById("ep_contacto").value.trim(),
      correo: document.getElementById("ep_correo").value.trim(),
      telefono: document.getElementById("ep_telefono").value.trim(),
    };

    try {
      await apiFetch(`/proveedores/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      modalEditProv.hide();
      showMsg("✅ Proveedor actualizado", "success");
      await loadProveedores();
      await loadProductos();
    } catch (err) {
      showMsg("❌ " + err.message, "danger");
    }
  });

  // ---------- DELETE PROVEEDOR ----------
  function openDeleteProveedor(id) {
    const p = PROVEEDORES.find(x => x.id === id);
    if (!p) return;

    document.getElementById("dp_id").value = p.id;
    document.getElementById("dp_name").textContent = p.nombre ?? ("#" + p.id);

    modalDelProv.show();
  }

  formDelProv?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Number(document.getElementById("dp_id").value);

    try {
      await apiFetch(`/proveedores/${id}`, { method: "DELETE" });
      modalDelProv.hide();
      showMsg("🗑️ Proveedor eliminado", "success");
      await loadProveedores();
      await loadProductos();
    } catch (err) {
      showMsg("❌ " + err.message, "danger");
    }
  });

  // ---------- EDIT PRODUCTO ----------
  function openEditProducto(id) {
    const pr = PRODUCTOS.find(x => x.id === id);
    if (!pr) return;

    document.getElementById("epr_id").value = pr.id;
    document.getElementById("epr_nombre").value = pr.nombre ?? "";
    document.getElementById("epr_sku").value = pr.sku ?? "";
    document.getElementById("epr_precio").value = Number(pr.precio ?? 0);
    document.getElementById("epr_stock").value = Number(pr.stock ?? 0);
    document.getElementById("epr_min").value = Number(pr.stock_minimo ?? 0);
    document.getElementById("epr_estr").value = pr.estrategia_logistica ?? "PULL";

    // llenar select proveedores
    const sel = document.getElementById("epr_prov");
    if (PROVEEDORES.length === 0) {
      sel.innerHTML = `<option value="">No hay proveedores</option>`;
    } else {
      sel.innerHTML = PROVEEDORES.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)} (#${p.id})</option>`).join("");
    }
    sel.value = String(pr.proveedor_id ?? "");

    modalEditProd.show();
  }

  formEditProd?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Number(document.getElementById("epr_id").value);

    const payload = {
      proveedor_id: Number(document.getElementById("epr_prov").value),
      nombre: document.getElementById("epr_nombre").value.trim(),
      sku: document.getElementById("epr_sku").value.trim(),
      precio: Number(document.getElementById("epr_precio").value || 0),
      stock: Number(document.getElementById("epr_stock").value || 0),
      stock_minimo: Number(document.getElementById("epr_min").value || 0),
      estrategia_logistica: document.getElementById("epr_estr").value
    };

    try {
      await apiFetch(`/productos/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      modalEditProd.hide();
      showMsg("✅ Producto actualizado", "success");
      await loadProductos();
    } catch (err) {
      showMsg("❌ " + err.message, "danger");
    }
  });

  // ---------- DELETE PRODUCTO ----------
  function openDeleteProducto(id) {
    const pr = PRODUCTOS.find(x => x.id === id);
    if (!pr) return;

    document.getElementById("dpr_id").value = pr.id;
    document.getElementById("dpr_name").textContent = pr.nombre ?? ("#" + pr.id);

    modalDelProd.show();
  }

  formDelProd?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = Number(document.getElementById("dpr_id").value);

    try {
      await apiFetch(`/productos/${id}`, { method: "DELETE" });
      modalDelProd.hide();
      showMsg("🗑️ Producto eliminado", "success");
      await loadProductos();
    } catch (err) {
      showMsg("❌ " + err.message, "danger");
    }
  });

  // ---------- MOVIMIENTO INVENTARIO ----------
  formMovimiento?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      producto_id: Number(document.getElementById("mv_producto").value),
      tipo: document.getElementById("mv_tipo").value,
      cantidad: Number(document.getElementById("mv_cantidad").value || 0),
      motivo: document.getElementById("mv_motivo").value,
      referencia: document.getElementById("mv_ref").value.trim()
    };

    try {
      await apiFetch("/inventario/movimiento", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showMsg("✅ Movimiento registrado y stock actualizado", "success");
      formMovimiento.reset();
      document.getElementById("mv_cantidad").value = 1;

      // Recargar productos (para ver stock actualizado) y si el producto está seleccionado, actualizar historial
      const currentHistId = hist_producto.value;
      await loadProductos();
      if (currentHistId) {
        hist_producto.value = currentHistId;
        await loadHistorial(currentHistId);
      }
    } catch (err) {
      showMsg("❌ " + err.message, "danger");
    }
  });

  async function loadHistorial(productoId) {
    if (!productoId) {
      histBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Selecciona un producto para ver movimientos.</td></tr>`;
      return;
    }

    const rows = await apiFetch(`/inventario/producto/${productoId}`, { method: "GET" });

    if (!rows.length) {
      histBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Sin movimientos aún.</td></tr>`;
      return;
    }

    histBody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${escapeHtml(isoToLocal(r.fecha))}</td>
        <td>${escapeHtml(r.tipo)}</td>
        <td>${Number(r.cantidad)}</td>
        <td>${escapeHtml(r.motivo)}</td>
        <td class="mono">${escapeHtml(r.referencia || "")}</td>
      </tr>
    `).join("");
  }

  btnReloadHist?.addEventListener("click", async () => {
    try {
      await loadHistorial(hist_producto.value);
    } catch (e) {
      showMsg("❌ " + e.message, "danger");
    }
  });

  hist_producto?.addEventListener("change", async () => {
    try {
      await loadHistorial(hist_producto.value);
    } catch (e) {
      showMsg("❌ " + e.message, "danger");
    }
  });

  // reload buttons
  btnReloadProv?.addEventListener("click", async () => {
    try { await loadProveedores(); await loadProductos(); }
    catch (e) { showMsg("❌ " + e.message, "danger"); }
  });

  btnReloadProd?.addEventListener("click", async () => {
    try { await loadProductos(); }
    catch (e) { showMsg("❌ " + e.message, "danger"); }
  });

  filterEstr?.addEventListener("change", async () => {
    try { await loadProductos(); }
    catch (e) { showMsg("❌ " + e.message, "danger"); }
  });

  // init
  (async () => {
    try {
      await loadProveedores();
      await loadProductos();
    } catch (err) {
      showMsg("❌ " + err.message, "danger");
    }
  })();
})();
