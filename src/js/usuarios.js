(function () {
  const token = localStorage.getItem("token");
  const rol = localStorage.getItem("rol");

  if (!token || rol !== "usuario") return;

  const {
    escapeHtml,
    formatDate,
    money,
    refreshCartBadge
  } = window.ecommerceUtils || {};
  const {
    downloadFacturaPdf,
    enviarFacturaPorCorreo,
    facturaEstadoBadge,
    openFacturaWindow
  } = window.invoiceUtils || {};

  const perfilMsgBox = document.getElementById("perfilMsgBox");
  const profileAvatar = document.getElementById("profileAvatar");
  const profileNombre = document.getElementById("profileNombre");
  const profileResumen = document.getElementById("profileResumen");
  const profileCorreo = document.getElementById("profileCorreo");
  const profileTelefono = document.getElementById("profileTelefono");
  const profileEmpresa = document.getElementById("profileEmpresa");
  const profileDireccion = document.getElementById("profileDireccion");
  const profileEstado = document.getElementById("profileEstado");
  const mensajesResumen = document.getElementById("mensajesResumen");
  const mensajesClienteList = document.getElementById("mensajesClienteList");
  const btnReloadMensajesCliente = document.getElementById("btnReloadMensajesCliente");
  const btnEditarPerfil = document.getElementById("btnEditarPerfil");
  const btnEliminarCuenta = document.getElementById("btnEliminarCuenta");
  const btnCerrarSesionCuenta = document.getElementById("btnCerrarSesionCuenta");
  const btnLogoutPerfil = document.getElementById("btnLogoutPerfil");
  const ticketsMsg = document.getElementById("ticketsMsg");
  const ticketsList = document.getElementById("ticketsList");
  const ticketForm = document.getElementById("ticketForm");
  const ticketAsunto = document.getElementById("ticketAsunto");
  const ticketMensaje = document.getElementById("ticketMensaje");
  const btnReloadTickets = document.getElementById("btnReloadTickets");
  const facturasMsg = document.getElementById("facturasMsg");
  const facturasList = document.getElementById("facturasList");
  const btnReloadFacturas = document.getElementById("btnReloadFacturas");
  const passwordMsg = document.getElementById("passwordMsg");
  const passwordForm = document.getElementById("passwordForm");
  const currentPassword = document.getElementById("currentPassword");
  const newPassword = document.getElementById("newPassword");
  const confirmNewPassword = document.getElementById("confirmNewPassword");

  const facturaCache = new Map();

  let currentCliente = null;
  let editing = false;

  function showMsg(text, type = "success") {
    if (!perfilMsgBox) return;
    perfilMsgBox.innerHTML = `<div class="alert alert-${type}">${text}</div>`;
    setTimeout(() => {
      if (perfilMsgBox) perfilMsgBox.innerHTML = "";
    }, 3000);
  }

  function showTicketMsg(text, type = "info") {
    if (!ticketsMsg) return;
    ticketsMsg.innerHTML = `<div class="alert alert-${type}">${text}</div>`;
    setTimeout(() => {
      if (ticketsMsg) ticketsMsg.innerHTML = "";
    }, 3500);
  }

  function showFacturaMsg(text, type = "info") {
    if (!facturasMsg) return;
    facturasMsg.innerHTML = `<div class="alert alert-${type}">${text}</div>`;
    setTimeout(() => {
      if (facturasMsg) facturasMsg.innerHTML = "";
    }, 3500);
  }

  function showPasswordMsg(text, type = "info") {
    if (!passwordMsg) return;
    passwordMsg.innerHTML = `<div class="alert alert-${type} mb-0">${text}</div>`;
    setTimeout(() => {
      if (passwordMsg) passwordMsg.innerHTML = "";
    }, 3500);
  }

  function validatePassword(password) {
    const weakPasswords = ["12345678", "password", "password1", "admin123", "admin1234", "qwerty123"];

    if (password.length < 8) return "La nueva contraseña debe tener al menos 8 caracteres.";
    if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(password)) return "La nueva contraseña debe incluir al menos una letra.";
    if (!/\d/.test(password)) return "La nueva contraseña debe incluir al menos un número.";
    if (weakPasswords.includes(password.toLowerCase())) return "La nueva contraseña es demasiado común.";

    return "";
  }

  function formatMultiline(str) {
    return escapeHtml(str).replaceAll("\n", "<br>");
  }

  function getInitials(name) {
    return String(name || "U")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join("") || "U";
  }

  function setEditable(isEditable) {
    [profileCorreo, profileTelefono, profileEmpresa, profileDireccion].forEach(input => {
      if (!input) return;
      input.disabled = !isEditable;
    });
    editing = isEditable;
    if (btnEditarPerfil) {
      btnEditarPerfil.innerHTML = isEditable
        ? `<i class="bi bi-check2-circle"></i> Guardar cambios`
        : `<i class="bi bi-pencil-square"></i> Editar perfil`;
    }
  }

  function renderProfile(user, cliente) {
    currentCliente = cliente || null;
    const nombre = cliente?.nombre || user?.nombre || localStorage.getItem("user_nombre") || "Usuario";
    const correo = cliente?.correo || user?.email || localStorage.getItem("user_email") || "";

    if (profileAvatar) profileAvatar.textContent = getInitials(nombre);
    if (profileNombre) profileNombre.textContent = nombre;
    if (profileResumen) {
      const parts = [];
      if (cliente?.fecha_registro) {
        parts.push(`Cliente desde ${new Date(cliente.fecha_registro).getFullYear()}`);
      }
      if (cliente?.etapa_crm) parts.push(`Etapa ${cliente.etapa_crm}`);
      if (cliente?.estado) parts.push(`Estado ${cliente.estado}`);
      profileResumen.textContent = parts.join(" · ") || "Perfil activo";
    }

    if (profileCorreo) profileCorreo.value = correo;
    if (profileTelefono) profileTelefono.value = cliente?.telefono || "";
    if (profileEmpresa) profileEmpresa.value = cliente?.empresa || "";
    if (profileDireccion) profileDireccion.value = cliente?.direccion || "";
    if (profileEstado) profileEstado.value = cliente ? `${cliente.estado || "activo"} / ${cliente.etapa_crm || "Prospecto"}` : "Pendiente";
  }

  function renderResumenMensajes(mensajes) {
    if (!mensajesResumen) return;

    const unread = mensajes.filter(m => !Number(m.leido)).length;
    if (!mensajes.length) {
      mensajesResumen.className = "alert alert-light mt-3";
      mensajesResumen.textContent = "Aún no tienes mensajes del administrador.";
      return;
    }

    mensajesResumen.className = unread ? "alert alert-warning mt-3" : "alert alert-success mt-3";
    mensajesResumen.textContent = unread
      ? `Tienes ${unread} mensaje(s) nuevo(s) del administrador.`
      : "No tienes mensajes pendientes por leer.";
  }

  function badgePrioridad(prioridad) {
    const value = String(prioridad || "normal");
    if (value === "alta") return `<span class="badge bg-danger">Alta</span>`;
    if (value === "baja") return `<span class="badge bg-secondary">Baja</span>`;
    return `<span class="badge bg-primary">Normal</span>`;
  }

  function renderMensajes(mensajes) {
    if (!mensajesClienteList) return;
    renderResumenMensajes(mensajes);

    if (!mensajes.length) {
      mensajesClienteList.innerHTML = `
        <div class="message-card">
          <div class="text-muted">Cuando administración te envíe un aviso, aparecerá aquí.</div>
        </div>
      `;
      return;
    }

    mensajesClienteList.innerHTML = mensajes.map(mensaje => `
      <div class="message-card ${Number(mensaje.leido) ? "" : "unread"}">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <h6 class="mb-0 fw-bold">${escapeHtml(mensaje.asunto)}</h6>
              ${badgePrioridad(mensaje.prioridad)}
              ${Number(mensaje.leido)
                ? `<span class="badge text-bg-light">Leído</span>`
                : `<span class="badge text-bg-warning">Nuevo</span>`}
            </div>
            <small class="text-muted">
              Enviado por ${escapeHtml(mensaje.admin_nombre || "Administración")} el ${formatDate(mensaje.fecha_envio)}
            </small>
          </div>
          ${Number(mensaje.leido)
            ? `<small class="text-muted">Leído: ${formatDate(mensaje.fecha_lectura)}</small>`
            : `<button class="btn btn-sm btn-outline-secondary" data-marcar-leido="${mensaje.id}">Marcar como leído</button>`}
        </div>
        <div class="mt-3">${formatMultiline(mensaje.mensaje)}</div>
      </div>
    `).join("");
  }

  function renderTickets(tickets) {
    if (!ticketsList) return;

    if (!tickets.length) {
      ticketsList.innerHTML = `
        <div class="message-card">
          <div class="text-muted">Aún no has generado tickets de atención.</div>
        </div>
      `;
      return;
    }

    ticketsList.innerHTML = tickets.map(ticket => `
      <div class="message-card">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <h6 class="fw-bold mb-1">${escapeHtml(ticket.asunto)}</h6>
            <small class="text-muted">Creado el ${formatDate(ticket.fecha)}</small>
          </div>
          <span class="badge ${ticket.estado === "respondido" ? "bg-success" : ticket.estado === "cerrado" ? "bg-dark" : "bg-warning text-dark"}">
            ${escapeHtml(ticket.estado)}
          </span>
        </div>
        <div class="mt-3">${formatMultiline(ticket.mensaje)}</div>
        <div class="mt-3 p-3 rounded" style="background:#f8f4ee;">
          <div class="small text-muted mb-1">Respuesta</div>
          ${ticket.respuesta
            ? `<div>${formatMultiline(ticket.respuesta)}</div><div class="small text-muted mt-2">Respondido por ${escapeHtml(ticket.admin_nombre || "Administración")} el ${formatDate(ticket.fecha_respuesta)}</div>`
            : `<div class="text-muted small">Aún sin respuesta.</div>`}
        </div>
      </div>
    `).join("");
  }

  function renderFacturas(facturas) {
    if (!facturasList) return;

    if (!facturas.length) {
      facturasList.innerHTML = `
        <div class="message-card">
          <div class="text-muted">Aún no has solicitado facturas.</div>
        </div>
      `;
      return;
    }

    facturasList.innerHTML = facturas.map(factura => `
      <div class="message-card">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <h6 class="fw-bold mb-1">${escapeHtml(factura.factura_folio || factura.folio || "Factura demo")}</h6>
            <small class="text-muted">
              Compra ${escapeHtml(factura.folio || "")} · ${formatDate(factura.fecha)}
            </small>
          </div>
          ${facturaEstadoBadge ? facturaEstadoBadge(factura.factura_estado) : escapeHtml(factura.factura_estado || "")}
        </div>
        <div class="small text-muted mt-2">
          Total: ${escapeHtml(money ? money(factura.monto || factura.pedido_total || 0) : `$${factura.monto || factura.pedido_total || 0}`)}
          · Método: ${escapeHtml(factura.metodo_pago || "Sin método")}
        </div>
        <div class="small text-muted">
          Correo fiscal: ${escapeHtml(factura.detalle_fiscal?.correo || "No disponible")}
        </div>
        ${factura.factura_fecha_envio ? `<div class="small text-muted">Enviada: ${formatDate(factura.factura_fecha_envio)}</div>` : ""}
        <div class="d-flex flex-wrap gap-2 mt-3">
          <button class="btn btn-sm btn-outline-secondary" data-factura-view="${factura.pago_id}">
            <i class="bi bi-eye"></i> Ver
          </button>
          <button class="btn btn-sm btn-outline-secondary" data-factura-pdf="${factura.pago_id}">
            <i class="bi bi-file-earmark-pdf"></i> PDF
          </button>
          <button class="btn btn-sm btn-outline-secondary" data-factura-email="${factura.pago_id}">
            <i class="bi bi-envelope"></i> Correo
          </button>
        </div>
      </div>
    `).join("");
  }

  async function loadPerfil() {
    const data = await apiFetch("/auth/perfil", { method: "GET" });
    renderProfile(data?.user || null, data?.cliente || null);
    localStorage.setItem("user_nombre", data?.user?.nombre || "");
    localStorage.setItem("user_email", data?.user?.email || "");
    setEditable(false);
  }

  async function loadMensajes() {
    const data = await apiFetch("/mensajes-cliente/mios", { method: "GET" });
    renderMensajes(Array.isArray(data?.mensajes) ? data.mensajes : []);
  }

  async function loadTickets() {
    const data = await apiFetch("/atencion/tickets/mios", { method: "GET" });
    renderTickets(Array.isArray(data) ? data : []);
  }

  async function loadFacturas() {
    facturaCache.clear();
    const data = await apiFetch("/pagos/facturas/mias", { method: "GET" });
    renderFacturas(Array.isArray(data) ? data : []);
  }

  async function getFacturaPayload(pagoId) {
    const key = Number(pagoId);
    if (facturaCache.has(key)) return facturaCache.get(key);
    const payload = await apiFetch(`/pagos/facturas/${key}`, { method: "GET" });
    facturaCache.set(key, payload);
    return payload;
  }

  function cerrarSesion() {
    clearSession();
    window.location.href = "../login.html";
  }

  btnReloadMensajesCliente?.addEventListener("click", async () => {
    try {
      await loadMensajes();
      showMsg("Mensajes actualizados.");
    } catch (e) {
      showMsg(`❌ ${e.message}`, "danger");
    }
  });

  btnReloadTickets?.addEventListener("click", async () => {
    try {
      await loadTickets();
      showTicketMsg("Tickets actualizados.", "success");
    } catch (e) {
      showTicketMsg(`❌ ${e.message}`, "danger");
    }
  });

  btnReloadFacturas?.addEventListener("click", async () => {
    try {
      await loadFacturas();
      showFacturaMsg("Facturas actualizadas.", "success");
    } catch (e) {
      showFacturaMsg(`❌ ${e.message}`, "danger");
    }
  });

  btnEditarPerfil?.addEventListener("click", async () => {
    if (!editing) {
      setEditable(true);
      showMsg("Ahora puedes actualizar tu correo, teléfono, empresa y dirección.", "info");
      return;
    }

    try {
      const payload = await apiFetch("/auth/perfil", {
        method: "PUT",
        body: JSON.stringify({
          nombre: profileNombre?.textContent || localStorage.getItem("user_nombre") || "Usuario",
          email: profileCorreo?.value.trim() || "",
          telefono: profileTelefono?.value.trim() || "",
          empresa: profileEmpresa?.value.trim() || "",
          direccion: profileDireccion?.value.trim() || ""
        })
      });

      setSession(payload);
      renderProfile(payload.user, payload.cliente);
      setEditable(false);
      showMsg("Perfil actualizado correctamente.");
      await refreshCartBadge();
    } catch (e) {
      showMsg(`❌ ${e.message}`, "danger");
    }
  });

  btnEliminarCuenta?.addEventListener("click", () => {
    showMsg("La eliminación de cuenta sigue fuera del alcance de esta etapa.", "info");
  });

  btnCerrarSesionCuenta?.addEventListener("click", cerrarSesion);
  btnLogoutPerfil?.addEventListener("click", cerrarSesion);

  document.addEventListener("click", async event => {
    const btn = event.target.closest("button[data-marcar-leido]");
    if (!btn) return;

    try {
      btn.disabled = true;
      await apiFetch(`/mensajes-cliente/${btn.dataset.marcarLeido}/leido`, { method: "PUT" });
      await loadMensajes();
      showMsg("Mensaje marcado como leído.");
    } catch (e) {
      btn.disabled = false;
      showMsg(`❌ ${e.message}`, "danger");
    }
  });

  facturasList?.addEventListener("click", async event => {
    const viewBtn = event.target.closest("[data-factura-view]");
    if (viewBtn) {
      try {
        const payload = await getFacturaPayload(viewBtn.dataset.facturaView);
        openFacturaWindow?.(payload);
      } catch (e) {
        showFacturaMsg(`❌ ${e.message}`, "danger");
      }
      return;
    }

    const pdfBtn = event.target.closest("[data-factura-pdf]");
    if (pdfBtn) {
      try {
        const payload = await getFacturaPayload(pdfBtn.dataset.facturaPdf);
        downloadFacturaPdf?.(payload);
      } catch (e) {
        showFacturaMsg(`❌ ${e.message}`, "danger");
      }
      return;
    }

    const emailBtn = event.target.closest("[data-factura-email]");
    if (!emailBtn) return;

    try {
      emailBtn.disabled = true;
      const result = await enviarFacturaPorCorreo?.(emailBtn.dataset.facturaEmail);
      if (result?.sent) {
        showFacturaMsg("Factura enviada por correo.", "success");
      } else {
        showFacturaMsg("No fue posible enviar correo real, pero la factura sigue disponible para descarga.", "info");
      }
      facturaCache.delete(Number(emailBtn.dataset.facturaEmail));
      await loadFacturas();
    } catch (e) {
      showFacturaMsg(`❌ ${e.message}`, "danger");
    } finally {
      emailBtn.disabled = false;
    }
  });

  ticketForm?.addEventListener("submit", async event => {
    event.preventDefault();

    const asunto = ticketAsunto?.value.trim() || "";
    const mensaje = ticketMensaje?.value.trim() || "";

    if (!asunto || !mensaje) {
      showTicketMsg("Completa asunto y mensaje para generar el ticket.", "warning");
      return;
    }

    try {
      await apiFetch("/atencion/ticket", {
        method: "POST",
        body: JSON.stringify({ asunto, mensaje })
      });

      ticketAsunto.value = "";
      ticketMensaje.value = "";
      await loadTickets();
      showTicketMsg("Ticket creado correctamente.", "success");
    } catch (e) {
      showTicketMsg(`❌ ${e.message}`, "danger");
    }
  });

  passwordForm?.addEventListener("submit", async event => {
    event.preventDefault();

    const actual = currentPassword?.value || "";
    const nueva = newPassword?.value || "";
    const confirmacion = confirmNewPassword?.value || "";

    if (!actual || !nueva || !confirmacion) {
      showPasswordMsg("Completa la contraseña actual, la nueva y su confirmación.", "warning");
      return;
    }

    const passwordError = validatePassword(nueva);
    if (passwordError) {
      showPasswordMsg(passwordError, "warning");
      return;
    }

    if (nueva !== confirmacion) {
      showPasswordMsg("La nueva contraseña y su confirmación no coinciden.", "warning");
      return;
    }

    try {
      await apiFetch("/auth/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: actual,
          newPassword: nueva
        })
      });

      passwordForm.reset();
      showPasswordMsg("Contraseña actualizada correctamente.", "success");
    } catch (e) {
      showPasswordMsg(`❌ ${e.message}`, "danger");
    }
  });

  (async () => {
    try {
      await Promise.all([loadPerfil(), loadMensajes(), loadTickets(), loadFacturas(), refreshCartBadge()]);
    } catch (e) {
      console.error(e);
      showMsg(`❌ ${e.message}`, "danger");
    }
  })();
})();
