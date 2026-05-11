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

  const { escapeHtml, money, refreshCartBadge } = window.ecommerceUtils || {};
  const productMsg = document.getElementById("productMsg");
  const productDetailPage = document.getElementById("productDetailPage");
  const relatedProducts = document.getElementById("relatedProducts");

  const params = new URLSearchParams(window.location.search);
  const productId = Number(params.get("id") || 0);

  function showMsg(text, type = "info") {
    productMsg.innerHTML = `<div class="alert alert-${type}">${text}</div>`;
  }

  function renderDetail(item, promos = []) {
    productDetailPage.innerHTML = `
      <div class="row g-4 align-items-start">
        <div class="col-lg-5">
          <img src="${item.imagen_url ? assetUrl(item.imagen_url) : "https://via.placeholder.com/900x700?text=Sin+imagen"}"
               alt="${escapeHtml(item.nombre)}"
               class="img-fluid rounded-4 shadow-sm">
        </div>
        <div class="col-lg-7">
          <div class="d-flex gap-2 flex-wrap mb-2">
            <span class="badge bg-dark-subtle text-dark">${escapeHtml(item.categoria)}</span>
            ${Number(item.destacado) ? `<span class="badge bg-warning text-dark">Destacado</span>` : ""}
            ${item.promocion ? `<span class="badge bg-danger">Promoción activa</span>` : ""}
          </div>
          <h1 class="display-6 fw-bold">${escapeHtml(item.nombre)}</h1>
          <p class="text-muted mb-2">SKU: ${escapeHtml(item.sku || "N/D")}</p>
          <p class="lead">${escapeHtml(item.descripcion || "Sin descripción.")}</p>

          <div class="my-4">
            ${Number(item.descuento_unitario || 0) > 0
              ? `<div class="text-decoration-line-through text-muted">${money(item.precio)}</div>`
              : ""}
            <div class="display-6 fw-bold">${money(item.precio_final || item.precio)}</div>
            ${Number(item.descuento_unitario || 0) > 0
              ? `<div class="small text-success">Ahorro por unidad: ${money(item.descuento_unitario)}</div>`
              : ""}
          </div>

          <div class="row g-3">
            <div class="col-sm-6">
              <div class="border rounded-4 p-3 bg-light">
                <div class="small text-muted">Stock disponible</div>
                <div class="fw-semibold">${Number(item.stock_actual || 0)} pieza(s)</div>
              </div>
            </div>
            <div class="col-sm-6">
              <div class="border rounded-4 p-3 bg-light">
                <div class="small text-muted">Promoción aplicada</div>
                <div class="fw-semibold">${item.promocion ? escapeHtml(item.promocion.nombre) : "Sin promoción"}</div>
              </div>
            </div>
          </div>

          ${promos.length
            ? `<div class="mt-4"><div class="small text-muted mb-1">Promociones relacionadas</div><div>${promos.map(promo => `<span class="badge bg-warning text-dark me-2">${escapeHtml(promo.nombre)}</span>`).join("")}</div></div>`
            : ""}

          <div class="d-flex gap-2 flex-wrap mt-4">
            <a href="catalog.html" class="btn btn-outline-secondary">Volver al catálogo</a>
            <button class="btn btn-burly" id="detailAddCart">Agregar al carrito</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("detailAddCart")?.addEventListener("click", async () => {
      try {
        await apiFetch("/carrito/agregar", {
          method: "POST",
          body: JSON.stringify({ producto_id: Number(item.id), cantidad: 1 })
        });
        await refreshCartBadge();
        showMsg("Producto agregado al carrito.", "success");
      } catch (err) {
        showMsg(err.message, "danger");
      }
    });
  }

  function renderRelated(items) {
    if (!items.length) {
      relatedProducts.innerHTML = `
        <div class="col-12">
          <div class="alert alert-light border">No hay productos relacionados por ahora.</div>
        </div>
      `;
      return;
    }

    relatedProducts.innerHTML = items.map(item => `
      <div class="col-12 col-md-6 col-xl-3">
        <div class="card border-0 shadow-sm h-100">
          <img src="${item.imagen_url ? assetUrl(item.imagen_url) : "https://via.placeholder.com/600x400?text=Sin+imagen"}"
               class="card-img-top"
               alt="${escapeHtml(item.nombre)}"
               style="height:180px; object-fit:cover;">
          <div class="card-body">
            <div class="small text-muted mb-1">${escapeHtml(item.categoria)}</div>
            <h2 class="h6 fw-bold">${escapeHtml(item.nombre)}</h2>
            <div class="fw-semibold mb-3">${money(item.precio_final || item.precio)}</div>
            <a href="product.html?id=${item.id}" class="btn btn-outline-secondary btn-sm w-100">Ver ficha</a>
          </div>
        </div>
      </div>
    `).join("");
  }

  (async () => {
    if (!productId) {
      showMsg("Producto inválido.", "warning");
      return;
    }

    try {
      const [{ item, promociones_relacionadas }, catalog] = await Promise.all([
        apiFetch(`/catalogo/${productId}`, { method: "GET" }),
        apiFetch("/catalogo", { method: "GET" })
      ]);

      renderDetail(item, promociones_relacionadas || []);
      const related = (catalog?.items || [])
        .filter(product => Number(product.id) !== Number(item.id) && product.categoria === item.categoria)
        .slice(0, 4);
      renderRelated(related);
      await refreshCartBadge();
    } catch (err) {
      showMsg(err.message, "danger");
    }
  })();
});
