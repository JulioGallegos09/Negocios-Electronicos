document.addEventListener("DOMContentLoaded", () => {
  const rol = localStorage.getItem("rol");
  if (!rol) {
    alert("Debes iniciar sesión primero.");
    window.location.href = "../login.html";
    return;
  }
  if (rol !== "usuario") {
    alert("Acceso restringido: solo usuarios.");
    window.location.href = "../login.html";
    return;
  }

  const { escapeHtml, formatDate, money, refreshCartBadge } = window.ecommerceUtils || {};
  const {
    downloadFacturaPdf,
    enviarFacturaPorCorreo,
    facturaEstadoBadge,
    logisticaBadge,
    openFacturaWindow
  } = window.invoiceUtils || {};

  const tbody = document.getElementById("pedidosBody");
  const msgBox = document.getElementById("pedidosMsg");
  const invoiceCache = new Map();

  function showMsg(text, type = "info") {
    if (!msgBox) return;
    msgBox.innerHTML = `<div class="alert alert-${type}">${escapeHtml(text)}</div>`;
  }

  function estadoBadge(estado) {
    const value = String(estado || "").toLowerCase();
    if (value === "procesada" || value === "completada") return `<span class="badge bg-success">${escapeHtml(estado)}</span>`;
    if (value === "cancelada") return `<span class="badge bg-danger">Cancelada</span>`;
    if (value === "procesando") return `<span class="badge bg-primary">Procesando</span>`;
    return `<span class="badge bg-warning text-dark">${escapeHtml(estado || "Pendiente")}</span>`;
  }

  function pagoBadge(estado) {
    const value = String(estado || "").toLowerCase();
    if (value === "aprobado") return `<span class="badge bg-success">Aprobado</span>`;
    if (value === "rechazado") return `<span class="badge bg-danger">Rechazado</span>`;
    return `<span class="badge bg-secondary">${escapeHtml(estado || "Pendiente")}</span>`;
  }

  function renderItems(items) {
    if (!items.length) return "Sin productos";
    return items.map(item => `
      <div class="mb-1">
        <span class="fw-semibold">${escapeHtml(item.producto_nombre || "Producto")}</span>
        <span class="small text-muted">x${Number(item.cantidad || 0)}</span>
      </div>
    `).join("");
  }

  function render(rows) {
    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-muted">
            Aún no tienes pedidos registrados.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows.map(order => `
      <tr>
        <td>
          <div class="fw-semibold">${escapeHtml(order.folio || `#${order.id}`)}</div>
          <div class="small text-muted">${pagoBadge(order.pago_estado)}</div>
        </td>
        <td>${formatDate(order.fecha)}</td>
        <td>${renderItems(order.items || [])}</td>
        <td>
          <div class="fw-semibold">${money(order.total)}</div>
          <div class="small text-success">Descuento: -${money(order.descuento_total || 0)}</div>
          <div class="small text-muted">${escapeHtml(order.metodo_pago || "Sin método")}</div>
        </td>
        <td>
          <div>${estadoBadge(order.estado)}</div>
          <div class="mt-1">${logisticaBadge ? logisticaBadge(order.estado_logistico) : escapeHtml(order.estado_logistico || "en_almacen")}</div>
          ${order.fecha_estado_logistico ? `<div class="small text-muted mt-1">Actualizado: ${formatDate(order.fecha_estado_logistico)}</div>` : ""}
          ${order.guia_envio ? `<div class="small text-muted">Guía: ${escapeHtml(order.guia_envio)}</div>` : ""}
        </td>
        <td>
          ${facturaEstadoBadge ? facturaEstadoBadge(order.factura_estado) : escapeHtml(order.factura_estado || "no_solicitada")}
          ${order.factura_folio ? `<div class="small text-muted mt-1">${escapeHtml(order.factura_folio)}</div>` : ""}
          ${order.factura_fecha_envio ? `<div class="small text-muted">Correo: ${formatDate(order.factura_fecha_envio)}</div>` : ""}
        </td>
        <td>
          ${String(order.factura_estado || "no_solicitada").toLowerCase() !== "no_solicitada"
            ? `
              <div class="d-flex flex-wrap gap-1">
                <button class="btn btn-sm btn-outline-secondary" data-factura-view="${order.pago_id}">Ver</button>
                <button class="btn btn-sm btn-outline-secondary" data-factura-pdf="${order.pago_id}">PDF</button>
                <button class="btn btn-sm btn-outline-secondary" data-factura-email="${order.pago_id}">Correo</button>
              </div>
            `
            : `<span class="small text-muted">No solicitada</span>`}
        </td>
      </tr>
    `).join("");
  }

  async function getFacturaPayload(pagoId) {
    const key = Number(pagoId);
    if (invoiceCache.has(key)) return invoiceCache.get(key);
    const payload = await apiFetch(`/pagos/facturas/${key}`, { method: "GET" });
    invoiceCache.set(key, payload);
    return payload;
  }

  tbody?.addEventListener("click", async event => {
    const viewBtn = event.target.closest("[data-factura-view]");
    if (viewBtn) {
      try {
        const payload = await getFacturaPayload(viewBtn.dataset.facturaView);
        openFacturaWindow?.(payload);
      } catch (err) {
        showMsg(err.message, "danger");
      }
      return;
    }

    const pdfBtn = event.target.closest("[data-factura-pdf]");
    if (pdfBtn) {
      try {
        const payload = await getFacturaPayload(pdfBtn.dataset.facturaPdf);
        downloadFacturaPdf?.(payload);
      } catch (err) {
        showMsg(err.message, "danger");
      }
      return;
    }

    const emailBtn = event.target.closest("[data-factura-email]");
    if (!emailBtn) return;

    try {
      emailBtn.disabled = true;
      const result = await enviarFacturaPorCorreo?.(emailBtn.dataset.facturaEmail);
      if (result?.sent) {
        showMsg("Factura enviada por correo.", "success");
      } else {
        showMsg("No fue posible enviar correo real, pero la factura sigue disponible para ver o descargar.", "info");
      }
      invoiceCache.delete(Number(emailBtn.dataset.facturaEmail));
      const rows = await apiFetch("/ordenes/mias", { method: "GET" });
      render(Array.isArray(rows) ? rows : []);
    } catch (err) {
      showMsg(err.message, "danger");
    } finally {
      emailBtn.disabled = false;
    }
  });

  (async () => {
    try {
      const rows = await apiFetch("/ordenes/mias", { method: "GET" });
      render(Array.isArray(rows) ? rows : []);
      await refreshCartBadge();
    } catch (err) {
      showMsg(err.message, "danger");
    }
  })();
});
