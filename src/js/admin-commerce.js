document.addEventListener("DOMContentLoaded", () => {
  const msgBox = document.getElementById("adminCommerceMsg");
  const taxForm = document.getElementById("taxForm");
  const taxBody = document.getElementById("taxBody");
  const promoForm = document.getElementById("promoForm");
  const promoBody = document.getElementById("promoBody");
  const promoProduct = document.getElementById("promoProduct");
  const ticketAdminBody = document.getElementById("ticketAdminBody");
  const ticketSelected = document.getElementById("ticketSelected");
  const ticketReply = document.getElementById("ticketReply");
  const ticketStatus = document.getElementById("ticketStatus");
  const reloadTicketsBtn = document.getElementById("reloadTicketsBtn");
  const sendTicketReply = document.getElementById("sendTicketReply");

  const state = {
    tickets: [],
    selectedTicketId: null
  };

  function showMsg(text, type = "success") {
    msgBox.innerHTML = `<div class="alert alert-${type} mb-0">${text}</div>`;
    setTimeout(() => {
      if (msgBox) msgBox.innerHTML = "";
    }, 3000);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtDate(value) {
    if (!value) return "Sin fecha";
    return new Date(value).toLocaleString("es-MX");
  }

  async function loadTaxes() {
    const rows = await apiFetch("/impuestos?all=1", { method: "GET" });
    taxBody.innerHTML = rows.map(row => `
      <tr>
        <td>${escapeHtml(row.nombre)}</td>
        <td>${Number(row.porcentaje || 0)}%</td>
        <td>${Number(row.estado) ? `<span class="badge bg-success">Activo</span>` : `<span class="badge bg-secondary">Inactivo</span>`}</td>
      </tr>
    `).join("") || `<tr><td colspan="3" class="text-center text-muted">Sin impuestos</td></tr>`;
  }

  async function loadProducts() {
    const rows = await apiFetch("/productos", { method: "GET" });
    promoProduct.innerHTML = `
      <option value="">Todos los productos</option>
      ${rows.map(row => `<option value="${row.id}">${escapeHtml(row.nombre)}</option>`).join("")}
    `;
  }

  async function loadPromos() {
    const rows = await apiFetch("/promociones?all=1", { method: "GET" });
    promoBody.innerHTML = rows.map(row => `
      <tr>
        <td>
          <div class="fw-semibold">${escapeHtml(row.nombre)}</div>
          <div class="small text-muted">${escapeHtml(row.descripcion || "")}</div>
        </td>
        <td>
          ${row.producto_id ? `Producto #${row.producto_id}` : row.categoria_objetivo ? escapeHtml(row.categoria_objetivo) : "Global"}
          ${Number(row.solo_destacados) ? `<div class="small text-warning">Solo destacados</div>` : ""}
        </td>
        <td class="small text-muted">
          ${fmtDate(row.fecha_inicio)}<br>${fmtDate(row.fecha_fin)}
        </td>
      </tr>
    `).join("") || `<tr><td colspan="3" class="text-center text-muted">Sin promociones</td></tr>`;
  }

  async function loadTickets() {
    const rows = await apiFetch("/atencion/tickets", { method: "GET" });
    state.tickets = Array.isArray(rows) ? rows : [];

    ticketAdminBody.innerHTML = state.tickets.map(ticket => `
      <tr>
        <td>${escapeHtml(ticket.cliente_nombre)}</td>
        <td>${escapeHtml(ticket.asunto)}</td>
        <td><span class="badge ${ticket.estado === "respondido" ? "bg-success" : ticket.estado === "cerrado" ? "bg-dark" : "bg-warning text-dark"}">${escapeHtml(ticket.estado)}</span></td>
        <td class="small">${escapeHtml(ticket.mensaje)}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" data-select-ticket="${ticket.id}">
            Seleccionar
          </button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="5" class="text-center text-muted">Sin tickets</td></tr>`;
  }

  taxForm?.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await apiFetch("/impuestos", {
        method: "POST",
        body: JSON.stringify({
          nombre: document.getElementById("taxName").value.trim(),
          porcentaje: Number(document.getElementById("taxRate").value || 0),
          estado: document.getElementById("taxEnabled").checked ? 1 : 0
        })
      });
      taxForm.reset();
      document.getElementById("taxEnabled").checked = true;
      await loadTaxes();
      showMsg("Impuesto guardado.");
    } catch (err) {
      showMsg(err.message, "danger");
    }
  });

  promoForm?.addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await apiFetch("/promociones", {
        method: "POST",
        body: JSON.stringify({
          nombre: document.getElementById("promoName").value.trim(),
          descripcion: document.getElementById("promoDescription").value.trim(),
          tipo_descuento: document.getElementById("promoType").value,
          valor: Number(document.getElementById("promoValue").value || 0),
          fecha_inicio: new Date(document.getElementById("promoStart").value).toISOString(),
          fecha_fin: new Date(document.getElementById("promoEnd").value).toISOString(),
          categoria_objetivo: document.getElementById("promoCategory").value.trim(),
          producto_id: document.getElementById("promoProduct").value || null,
          solo_destacados: document.getElementById("promoFeaturedOnly").checked ? 1 : 0
        })
      });
      promoForm.reset();
      await loadPromos();
      showMsg("Promoción guardada.");
    } catch (err) {
      showMsg(err.message, "danger");
    }
  });

  ticketAdminBody?.addEventListener("click", event => {
    const button = event.target.closest("[data-select-ticket]");
    if (!button) return;

    const ticket = state.tickets.find(item => Number(item.id) === Number(button.dataset.selectTicket));
    if (!ticket) return;

    state.selectedTicketId = ticket.id;
    ticketSelected.value = `#${ticket.id} · ${ticket.cliente_nombre}`;
    ticketReply.value = ticket.respuesta || "";
    ticketStatus.value = ticket.estado === "abierto" ? "respondido" : ticket.estado;
  });

  reloadTicketsBtn?.addEventListener("click", async () => {
    try {
      await loadTickets();
      showMsg("Tickets recargados.");
    } catch (err) {
      showMsg(err.message, "danger");
    }
  });

  sendTicketReply?.addEventListener("click", async () => {
    if (!state.selectedTicketId) {
      showMsg("Selecciona primero un ticket.", "warning");
      return;
    }

    if (!ticketReply.value.trim()) {
      showMsg("Escribe una respuesta antes de guardar.", "warning");
      return;
    }

    try {
      await apiFetch(`/atencion/ticket/${state.selectedTicketId}/respuesta`, {
        method: "PUT",
        body: JSON.stringify({
          respuesta: ticketReply.value.trim(),
          estado: ticketStatus.value
        })
      });
      await loadTickets();
      ticketReply.value = "";
      ticketSelected.value = "";
      state.selectedTicketId = null;
      showMsg("Ticket respondido correctamente.");
    } catch (err) {
      showMsg(err.message, "danger");
    }
  });

  (async () => {
    try {
      await Promise.all([loadTaxes(), loadProducts(), loadPromos(), loadTickets()]);
    } catch (err) {
      showMsg(err.message, "danger");
    }
  })();
});
