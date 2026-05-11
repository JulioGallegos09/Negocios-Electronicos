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

  const cartBody = document.getElementById("cart-body");
  const cartMsg = document.getElementById("cartMsg");
  const cartSubtotal = document.getElementById("cart-subtotal");
  const cartDiscount = document.getElementById("cart-discount");
  const cartPromotions = document.getElementById("cart-promotions");
  const cartTaxes = document.getElementById("cart-taxes");
  const cartTotal = document.getElementById("cart-total");
  const clearBtn = document.getElementById("clearCart");
  const goPayBtn = document.getElementById("goPay");

  let currentCart = null;

  function showMsg(text, type = "info") {
    if (!cartMsg) return;
    cartMsg.innerHTML = `<div class="alert alert-${type}">${text}</div>`;
  }

  function renderSummary(payload) {
    const resumen = payload?.resumen || {};
    const impuestos = payload?.impuestos || [];
    const promocionesAplicadas = payload?.promociones_aplicadas || [];

    if (cartSubtotal) cartSubtotal.textContent = money(resumen.subtotal || 0);
    if (cartDiscount) cartDiscount.textContent = `-${money(resumen.descuento_total || 0)}`;
    if (cartTotal) cartTotal.textContent = money(resumen.total || 0);
    if (cartPromotions) {
      cartPromotions.innerHTML = promocionesAplicadas.length
        ? promocionesAplicadas.map(promocion => `
            <div class="text-success">
              <i class="bi bi-tag-fill"></i> ${escapeHtml(promocion.nombre)}: ahorro ${money(promocion.ahorro_total || 0)}
            </div>
          `).join("")
        : `<div class="text-muted">No hay descuentos activos aplicados a este carrito.</div>`;
    }

    if (cartTaxes) {
      cartTaxes.innerHTML = impuestos.length
        ? impuestos.map(impuesto => `
            <div class="d-flex justify-content-between small text-muted">
              <span>${escapeHtml(impuesto.nombre)} (${Number(impuesto.porcentaje || 0)}%)</span>
              <span>${money(impuesto.monto || 0)}</span>
            </div>
          `).join("")
        : `<div class="small text-muted">Sin impuestos activos.</div>`;
    }
  }

  function renderCart(payload) {
    currentCart = payload;
    const items = payload?.items || [];

    if (!items.length) {
      cartBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-muted">
            Tu carrito está vacío. Agrega productos desde el catálogo para continuar.
          </td>
        </tr>
      `;
      renderSummary(payload);
      return;
    }

    cartBody.innerHTML = items.map(item => `
      <tr>
        <td>
          <div class="fw-semibold">${escapeHtml(item.nombre)}</div>
          <div class="small text-muted">${escapeHtml(item.categoria)}</div>
          ${item.promocion
            ? `<div class="small text-success">${escapeHtml(item.promocion.nombre)} · ahorro por pieza ${money(item.descuento_unitario || 0)}</div>`
            : `<div class="small text-muted">Sin promoción aplicada</div>`}
        </td>
        <td class="text-nowrap">${escapeHtml(item.sku || "N/D")}</td>
        <td style="max-width:180px;">
          <div class="input-group input-group-sm">
            <button class="btn btn-outline-secondary" data-cart-step="${item.id}" data-step="-1">-</button>
            <input type="number" min="1" max="${Number(item.stock_actual || 1)}" value="${Number(item.cantidad || 1)}"
                   class="form-control text-center"
                   data-cart-input="${item.id}">
            <button class="btn btn-outline-secondary" data-cart-step="${item.id}" data-step="1">+</button>
          </div>
        </td>
        <td>
          ${Number(item.descuento_unitario || 0) > 0
            ? `<div class="small text-decoration-line-through text-muted">${money(item.precio_lista)}</div><div>${money(item.precio_final)}</div>`
            : money(item.precio_final)}
        </td>
        <td class="fw-semibold">${money(item.subtotal_final)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger" data-remove-item="${item.id}">
            Eliminar
          </button>
        </td>
      </tr>
    `).join("");

    renderSummary(payload);
  }

  async function loadCart() {
    try {
      const payload = await apiFetch("/carrito/mio", { method: "GET" });
      renderCart(payload);
      await refreshCartBadge();
    } catch (err) {
      showMsg(`No se pudo cargar el carrito: ${err.message}`, "danger");
    }
  }

  async function updateItem(itemId, quantity) {
    try {
      const payload = await apiFetch(`/carrito/item/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ cantidad: Number(quantity) })
      });
      renderCart(payload);
      await refreshCartBadge();
    } catch (err) {
      showMsg(err.message, "danger");
      await loadCart();
    }
  }

  async function removeItem(itemId) {
    try {
      const payload = await apiFetch(`/carrito/item/${itemId}`, { method: "DELETE" });
      renderCart(payload);
      await refreshCartBadge();
    } catch (err) {
      showMsg(err.message, "danger");
    }
  }

  cartBody?.addEventListener("click", async event => {
    const removeBtn = event.target.closest("[data-remove-item]");
    if (removeBtn) {
      await removeItem(removeBtn.dataset.removeItem);
      return;
    }

    const stepBtn = event.target.closest("[data-cart-step]");
    if (!stepBtn) return;

    const itemId = stepBtn.dataset.cartStep;
    const input = cartBody.querySelector(`[data-cart-input="${itemId}"]`);
    const step = Number(stepBtn.dataset.step || 0);
    const nextValue = Math.max(1, Number(input?.value || 1) + step);
    if (input) input.value = String(nextValue);
    await updateItem(itemId, nextValue);
  });

  cartBody?.addEventListener("change", async event => {
    const input = event.target.closest("[data-cart-input]");
    if (!input) return;
    const value = Math.max(1, Number(input.value || 1));
    input.value = String(value);
    await updateItem(input.dataset.cartInput, value);
  });

  clearBtn?.addEventListener("click", async () => {
    try {
      const payload = await apiFetch("/carrito/vaciar/mio", { method: "DELETE" });
      renderCart(payload);
      await refreshCartBadge();
      showMsg("Carrito vaciado.", "success");
    } catch (err) {
      showMsg(err.message, "danger");
    }
  });

  goPayBtn?.addEventListener("click", () => {
    const itemCount = Number(currentCart?.resumen?.items_count || 0);
    if (!itemCount) {
      showMsg("Agrega al menos un producto antes de continuar.", "warning");
      return;
    }
    window.location.href = "pago.html";
  });

  loadCart();
});
