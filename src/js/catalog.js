document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const rol = localStorage.getItem("rol");

  if (!token || !rol) {
    alert("Debes iniciar sesión primero.");
    window.location.href = "login.html";
    return;
  }

  if (rol !== "usuario") {
    alert("Acceso restringido: solo usuarios.");
    window.location.href = "views/admin.html";
    return;
  }

  const {
    escapeHtml,
    money,
    refreshCartBadge
  } = window.ecommerceUtils || {};

  const catalogBody = document.getElementById("catalogBody");
  const catalogMsg = document.getElementById("catalogMsg");
  const promoBanner = document.getElementById("promoBanner");
  const novedadesBody = document.getElementById("novedadesBody");
  const categorySelect = document.getElementById("catalogCategory");
  const searchInput = document.getElementById("catalogSearch");
  const featuredToggle = document.getElementById("catalogFeaturedOnly");
  const searchForm = document.getElementById("catalogFiltersForm");
  const detailTitle = document.getElementById("productDetailTitle");
  const detailBody = document.getElementById("productDetailBody");
  const detailModalEl = document.getElementById("productDetailModal");
  const detailModal = detailModalEl ? new bootstrap.Modal(detailModalEl) : null;

  let catalogData = { items: [], categorias: [], promociones: [], novedades: [] };

  function showMsg(text, type = "info") {
    catalogMsg.innerHTML = `<div class="alert alert-${type}">${text}</div>`;
  }

  function clearMsg() {
    catalogMsg.innerHTML = "";
  }

  function renderPromotions(promotions = []) {
    if (!promoBanner) return;

    if (!promotions.length) {
      promoBanner.innerHTML = `
        <div class="alert alert-light border">
          No hay promociones activas por el momento.
        </div>
      `;
      return;
    }

    promoBanner.innerHTML = `
      <div class="alert alert-warning border-0 shadow-sm mb-0">
        <div class="d-flex flex-wrap gap-2 align-items-center justify-content-between">
          <div>
            <strong>Promociones activas</strong>
            <div class="small mt-1">${promotions.map(promo => escapeHtml(promo.nombre)).join(" · ")}</div>
          </div>
          <div class="small text-muted">Los descuentos aplicables se reflejan en el carrito y checkout.</div>
        </div>
      </div>
    `;
  }

  function renderCategories(categories = []) {
    if (!categorySelect) return;

    const current = categorySelect.value;
    categorySelect.innerHTML = `
      <option value="">Todas las categorías</option>
      ${categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}
    `;
    categorySelect.value = categories.includes(current) ? current : "";
  }

  function renderNovedades(items = []) {
    if (!novedadesBody) return;

    if (!items.length) {
      novedadesBody.innerHTML = `
        <div class="col-12">
          <div class="alert alert-light border">No hay novedades para mostrar.</div>
        </div>
      `;
      return;
    }

    novedadesBody.innerHTML = items.map(item => `
      <div class="col-12 col-md-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <img src="${item.imagen_url ? assetUrl(item.imagen_url) : "https://via.placeholder.com/600x400?text=Sin+imagen"}"
               class="card-img-top"
               alt="${escapeHtml(item.nombre)}"
               style="height:180px; object-fit:cover;">
          <div class="card-body">
            <div class="small text-muted mb-1">${escapeHtml(item.categoria)}</div>
            <h3 class="h6 fw-bold">${escapeHtml(item.nombre)}</h3>
            <div class="fw-semibold mb-3">${money(item.precio_final || item.precio)}</div>
            <a href="product.html?id=${item.id}" class="btn btn-outline-secondary btn-sm w-100">Ver ficha</a>
          </div>
        </div>
      </div>
    `).join("");
  }

  function renderCatalog(items = []) {
    if (!items.length) {
      catalogBody.innerHTML = `
        <div class="col-12">
          <div class="alert alert-light border text-center py-4">
            No encontramos productos con esos filtros.
          </div>
        </div>
      `;
      return;
    }

    catalogBody.innerHTML = items.map(item => {
      const stockLow = Number(item.stock_actual || 0) <= Number(item.stock_minimo || 0);
      const imageSrc = item.imagen_url
        ? assetUrl(item.imagen_url)
        : "https://via.placeholder.com/600x400?text=Sin+imagen";

      return `
        <div class="col-12 col-md-6 col-xl-4">
          <div class="card h-100 border-0 shadow-sm">
            <img src="${imageSrc}" class="card-img-top" alt="${escapeHtml(item.nombre)}" style="height:220px; object-fit:cover;">
            <div class="card-body d-flex flex-column">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <span class="badge bg-dark-subtle text-dark mb-2">${escapeHtml(item.categoria)}</span>
                  ${Number(item.destacado) ? `<span class="badge bg-warning text-dark mb-2 ms-1">Destacado</span>` : ""}
                  <h5 class="card-title mb-1">${escapeHtml(item.nombre)}</h5>
                </div>
                ${item.promocion ? `<span class="badge bg-danger">Promo</span>` : ""}
              </div>

              <p class="text-muted small mb-2">${escapeHtml(item.descripcion || "Sin descripción")}</p>
              <p class="small text-muted mb-2">SKU: ${escapeHtml(item.sku || "N/D")}</p>

              <div class="mb-3">
                ${Number(item.descuento_unitario || 0) > 0
                  ? `
                    <div class="text-decoration-line-through text-muted small">${money(item.precio)}</div>
                    <div class="fw-bold fs-5">${money(item.precio_final)}</div>
                    <div class="small text-success">Ahorro por unidad: ${money(item.descuento_unitario)}</div>
                  `
                  : `<div class="fw-bold fs-5">${money(item.precio)}</div>`}
              </div>

              <div class="small text-muted mb-3">
                Stock disponible:
                <strong>${Number(item.stock_actual || 0)}</strong>
                ${stockLow ? `<span class="badge bg-danger ms-1">Stock bajo</span>` : ""}
              </div>

              <div class="mt-auto d-grid gap-2">
                <a class="btn btn-outline-secondary" href="product.html?id=${item.id}">Ver ficha</a>
                <button class="btn btn-outline-secondary" data-view-product="${item.id}">Vista rápida</button>
                <button class="btn btn-burly" data-add-product="${item.id}">
                  Agregar al carrito
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderDetail(item) {
    if (!detailTitle || !detailBody || !detailModal) return;

    detailTitle.textContent = item.nombre;
    detailBody.innerHTML = `
      <div class="row g-3">
        <div class="col-md-5">
          <img src="${item.imagen_url ? assetUrl(item.imagen_url) : "https://via.placeholder.com/600x400?text=Sin+imagen"}"
               alt="${escapeHtml(item.nombre)}"
               class="img-fluid rounded shadow-sm">
        </div>
        <div class="col-md-7">
          <p class="small text-muted mb-2">${escapeHtml(item.categoria)} · SKU ${escapeHtml(item.sku || "N/D")}</p>
          <p>${escapeHtml(item.descripcion || "Sin descripción")}</p>
          <p class="mb-2"><strong>Stock:</strong> ${Number(item.stock_actual || 0)}</p>
          <p class="mb-2"><strong>Precio base:</strong> ${money(item.precio)}</p>
          <p class="mb-2"><strong>Precio actual:</strong> ${money(item.precio_final || item.precio)}</p>
          <p class="mb-3"><strong>Promoción:</strong> ${item.promocion ? escapeHtml(item.promocion.nombre) : "Sin promoción activa"}</p>
          <div class="d-flex gap-2 flex-wrap">
            <a class="btn btn-outline-secondary" href="product.html?id=${item.id}">Abrir ficha</a>
            <button class="btn btn-burly" data-add-product="${item.id}">
              Agregar al carrito
            </button>
          </div>
        </div>
      </div>
    `;

    detailModal.show();
  }

  async function loadCatalog() {
    clearMsg();

    const params = new URLSearchParams();
    if (searchInput?.value.trim()) params.set("buscar", searchInput.value.trim());
    if (categorySelect?.value) params.set("categoria", categorySelect.value);
    if (featuredToggle?.checked) params.set("destacado", "1");

    try {
      const path = params.toString() ? `/catalogo?${params.toString()}` : "/catalogo";
      const data = await apiFetch(path, { method: "GET" });
      catalogData = data;
      renderPromotions(data.promociones || []);
      renderNovedades(data.novedades || []);
      renderCategories(data.categorias || []);
      renderCatalog(data.items || []);
    } catch (err) {
      showMsg(`Error cargando catálogo: ${err.message}`, "danger");
      catalogBody.innerHTML = "";
    }
  }

  async function handleAddToCart(productId) {
    try {
      await apiFetch("/carrito/agregar", {
        method: "POST",
        body: JSON.stringify({ producto_id: Number(productId), cantidad: 1 })
      });
      await refreshCartBadge();
      showMsg("Producto agregado al carrito.", "success");
    } catch (err) {
      showMsg(`No se pudo agregar el producto: ${err.message}`, "danger");
    }
  }

  searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadCatalog();
  });

  categorySelect?.addEventListener("change", loadCatalog);
  featuredToggle?.addEventListener("change", loadCatalog);

  catalogBody?.addEventListener("click", async (event) => {
    const addBtn = event.target.closest("[data-add-product]");
    if (addBtn) {
      await handleAddToCart(addBtn.dataset.addProduct);
      return;
    }

    const viewBtn = event.target.closest("[data-view-product]");
    if (viewBtn) {
      const productId = Number(viewBtn.dataset.viewProduct);
      const item = (catalogData.items || []).find(product => Number(product.id) === productId);
      if (item) renderDetail(item);
    }
  });

  detailBody?.addEventListener("click", async (event) => {
    const addBtn = event.target.closest("[data-add-product]");
    if (!addBtn) return;
    await handleAddToCart(addBtn.dataset.addProduct);
  });

  loadCatalog();
});
