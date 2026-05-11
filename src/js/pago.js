document.addEventListener("DOMContentLoaded", () => {
  const rol = localStorage.getItem("rol");
  if (!rol) {
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
  const {
    downloadFacturaPdf,
    enviarFacturaPorCorreo,
    openFacturaWindow
  } = window.invoiceUtils || {};
  const WALLET_KEY = "thrift_wallet";
  const PAYPAL_METHOD = "PayPal Sandbox";

  const cartBody = document.getElementById("cart-body");
  const cartSubtotal = document.getElementById("cart-subtotal");
  const cartDiscount = document.getElementById("cart-discount");
  const cartTaxes = document.getElementById("cart-taxes");
  const cartTotal = document.getElementById("cart-total");
  const paymentStatus = document.getElementById("payment-status");
  const escenarioSelect = document.getElementById("escenarioPrueba");
  const radiosMetodo = document.querySelectorAll('input[name="metodoPago"]');
  const datosTarjetaDiv = document.getElementById("datosTarjeta");
  const infoOtrosDiv = document.getElementById("infoOtrosMetodos");
  const datosMicropagoDiv = document.getElementById("datosMicropago");
  const datosChequeDiv = document.getElementById("datosCheque");
  const paypalSection = document.getElementById("paypalSection");
  const paypalNotice = document.getElementById("paypalNotice");
  const paypalButtonsContainer = document.getElementById("paypalButtons");
  const fiscalCheckbox = document.getElementById("fiscalFactura");
  const fiscalesSection = document.getElementById("fiscalesSection");
  const donateToggle = document.getElementById("donateToggle");
  const donationOptions = document.getElementById("donationOptions");
  const donateCustomAmount = document.getElementById("donateCustomAmount");
  const donateAmountRadios = document.querySelectorAll("input[name='donateAmount']");
  const folioLabel = document.getElementById("folioLabel");
  const paymentSummaryLabel = document.getElementById("paymentSummaryLabel");
  const paymentReferenceLabel = document.getElementById("paymentReferenceLabel");
  const invoiceActionsBox = document.getElementById("invoiceActionsBox");
  const btnInvoiceView = document.getElementById("btnInvoiceView");
  const btnInvoicePdf = document.getElementById("btnInvoicePdf");
  const btnInvoiceEmail = document.getElementById("btnInvoiceEmail");
  const btnConfirmarPago = document.getElementById("btnConfirmarPago");

  let currentCart = null;
  let currentInvoicePayload = null;
  let shouldRedirectOnEmpty = true;
  let payPalConfig = null;
  let payPalSdkPromise = null;
  let payPalButtonsReady = false;
  let pendingPayPalPayload = null;

  function getWallet() {
    return Number(localStorage.getItem(WALLET_KEY) || "0");
  }

  function setWallet(value) {
    localStorage.setItem(WALLET_KEY, String(value));
  }

  function getSelectedMethod() {
    return document.querySelector('input[name="metodoPago"]:checked')?.value || "";
  }

  function setPaymentStatus(type, text) {
    paymentStatus.className = `alert mt-3 alert-${type}`;
    paymentStatus.textContent = text;
    paymentStatus.classList.remove("d-none");
  }

  function clearPaymentStatus() {
    paymentStatus.className = "alert d-none mt-3";
    paymentStatus.textContent = "";
  }

  function setPayPalNotice(text, tone = "muted") {
    if (!paypalNotice) return;

    const className = tone === "danger"
      ? "text-danger"
      : tone === "success"
        ? "text-success"
        : tone === "warning"
          ? "text-warning"
          : "text-muted";

    paypalNotice.className = `small mb-2 ${className}`;
    paypalNotice.textContent = text;
  }

  function toggleFiscales() {
    fiscalesSection.style.display = fiscalCheckbox.checked ? "block" : "none";
  }

  function getDonationAmount() {
    if (!donateToggle?.checked) return 0;
    const selected = document.querySelector("input[name='donateAmount']:checked");
    if (!selected) return 0;

    if (selected.value === "custom") {
      const custom = Number(donateCustomAmount.value || 0);
      return Number.isFinite(custom) && custom > 0 ? custom : 0;
    }

    return Number(selected.value || 0);
  }

  function generarReferencia(prefix) {
    const num = Math.floor(1000000000 + Math.random() * 9000000000);
    return `${prefix}-${num}`;
  }

  function renderCart(payload) {
    currentCart = payload;
    const items = payload?.items || [];

    if (!items.length) {
      cartBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted py-4">
            Tu carrito está vacío.
          </td>
        </tr>
      `;
      if (shouldRedirectOnEmpty) {
        setTimeout(() => {
          window.location.href = "cart.html";
        }, 1200);
      }
      return;
    }

    cartBody.innerHTML = items.map(item => `
      <tr>
        <td>
          <div class="fw-semibold">${escapeHtml(item.nombre)}</div>
          ${item.promocion ? `<div class="small text-success">${escapeHtml(item.promocion.nombre)} · ahorro por pieza ${money(item.descuento_unitario || 0)}</div>` : ""}
          <div class="small text-muted">${escapeHtml(item.categoria)}</div>
        </td>
        <td>${Number(item.cantidad || 0)}</td>
        <td>
          ${Number(item.descuento_unitario || 0) > 0
            ? `<div class="small text-decoration-line-through text-muted">${money(item.precio_lista)}</div><div>${money(item.precio_final)}</div>`
            : money(item.precio_final)}
        </td>
        <td>${money(item.subtotal_final)}</td>
      </tr>
    `).join("");

    const resumen = payload?.resumen || {};
    cartSubtotal.textContent = money(resumen.subtotal || 0);
    cartDiscount.textContent = `-${money(resumen.descuento_total || 0)}`;
    cartTotal.textContent = money(resumen.total || 0);
    cartTaxes.innerHTML = (payload?.impuestos || []).map(impuesto => `
      <div class="d-flex justify-content-between small text-muted">
        <span>${escapeHtml(impuesto.nombre)} (${Number(impuesto.porcentaje || 0)}%)</span>
        <span>${money(impuesto.monto || 0)}</span>
      </div>
    `).join("") || `<div class="small text-muted">Sin impuestos activos.</div>`;
  }

  async function loadCart() {
    const payload = await apiFetch("/carrito/mio", { method: "GET" });
    renderCart(payload);
    await refreshCartBadge();
  }

  function collectFiscalData() {
    return {
      nombre_razon_social: document.getElementById("fiscalName").value.trim(),
      rfc: document.getElementById("fiscalRFC").value.trim(),
      direccion: document.getElementById("fiscalAddress").value.trim(),
      codigo_postal: document.getElementById("fiscalCP").value.trim(),
      correo: document.getElementById("fiscalEmail").value.trim()
    };
  }

  function buildCheckoutPayload(methodOverride = "") {
    const metodo = methodOverride || getSelectedMethod();
    if (!metodo) {
      throw new Error("Selecciona un método de pago.");
    }

    if (!currentCart?.items?.length) {
      throw new Error("Tu carrito está vacío.");
    }

    const requiereFactura = Boolean(fiscalCheckbox.checked);
    const fiscalData = requiereFactura ? collectFiscalData() : null;

    if (requiereFactura && (!fiscalData.nombre_razon_social || !fiscalData.rfc || !fiscalData.correo)) {
      throw new Error("Para facturar debes completar nombre o razón social, RFC y correo.");
    }

    if (metodo === "Tarjeta") {
      const cardName = document.getElementById("cardName").value.trim();
      const cardNumber = document.getElementById("cardNumber").value.trim();
      const cardExp = document.getElementById("cardExp").value.trim();
      const cardCVV = document.getElementById("cardCVV").value.trim();
      if (!cardName || !cardNumber || !cardExp || !cardCVV) {
        throw new Error("Completa los datos de la tarjeta.");
      }
    }

    if (metodo === "Micropago") {
      const amount = Number(document.getElementById("micropagoMonto").value || 0);
      if (amount <= 0) {
        throw new Error("Selecciona un monto de micropago.");
      }
    }

    if (metodo === "Cheque electrónico") {
      const chequeNumero = document.getElementById("chequeNumero").value.trim();
      const chequeBanco = document.getElementById("chequeBanco").value.trim();
      const chequeFecha = document.getElementById("chequeFecha").value;
      const chequeMonto = document.getElementById("chequeMonto").value;
      if (!chequeNumero || !chequeBanco || !chequeFecha || !chequeMonto) {
        throw new Error("Completa los datos del cheque electrónico.");
      }
    }

    const donation = getDonationAmount();
    if (!Number.isFinite(donation) || donation < 0) {
      throw new Error("La donación no puede ser negativa.");
    }

    if (metodo === "Monedero electrónico") {
      const totalFinal = Number(currentCart?.resumen?.total || 0) + donation;
      const saldo = getWallet();
      if (saldo < totalFinal) {
        throw new Error(`Saldo insuficiente en el monedero. Saldo actual: ${money(saldo)}.`);
      }
    }

    return {
      metodo,
      donation,
      requiere_factura: requiereFactura,
      datos_fiscales: fiscalData
    };
  }

  function updateInvoiceActions(payload) {
    currentInvoicePayload = payload?.pago?.factura_disponible ? payload : null;
    if (!invoiceActionsBox) return;
    invoiceActionsBox.classList.toggle("d-none", !currentInvoicePayload);
  }

  async function handleSuccessfulPayment(response, successMessage) {
    setPaymentStatus("success", successMessage);
    if (folioLabel) folioLabel.textContent = response?.folio || "";
    if (paymentSummaryLabel) paymentSummaryLabel.textContent = money(response?.pago?.monto || 0);
    if (paymentReferenceLabel) paymentReferenceLabel.textContent = response?.referencia || "";
    updateInvoiceActions(response);
    if (response?.pago?.factura_disponible) {
      openFacturaWindow?.(response);
    }

    const modal = new bootstrap.Modal(document.getElementById("compraExitosaModal"));
    modal.show();

    shouldRedirectOnEmpty = false;
    await refreshCartBadge();
    await loadCart();
  }

  async function loadPayPalConfig() {
    if (payPalConfig) return payPalConfig;

    try {
      payPalConfig = await apiFetch("/pagos/paypal/config", { method: "GET" });
      if (!payPalConfig?.enabled) {
        setPayPalNotice("PayPal Sandbox está deshabilitado hasta capturar el client id y secret en el backend.", "warning");
      } else {
        setPayPalNotice("PayPal Sandbox listo para usarse.", "success");
      }
    } catch (err) {
      payPalConfig = { enabled: false };
      setPayPalNotice(err.message || "No se pudo cargar la configuración de PayPal.", "danger");
    }

    return payPalConfig;
  }

  async function loadPayPalSdk() {
    const config = await loadPayPalConfig();
    if (!config?.enabled || !config.clientId) {
      throw new Error("PayPal Sandbox no está configurado en este ambiente.");
    }

    if (window.paypal?.Buttons) {
      return window.paypal;
    }

    if (!payPalSdkPromise) {
      payPalSdkPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-paypal-sdk="true"]');
        if (existing) {
          existing.addEventListener("load", () => resolve(window.paypal));
          existing.addEventListener("error", () => reject(new Error("No se pudo cargar el SDK de PayPal.")));
          return;
        }

        const script = document.createElement("script");
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=${encodeURIComponent(config.currency || "MXN")}&intent=capture&components=buttons`;
        script.async = true;
        script.dataset.paypalSdk = "true";
        script.onload = () => {
          if (window.paypal?.Buttons) {
            resolve(window.paypal);
          } else {
            reject(new Error("El SDK de PayPal se cargó sin exponer los botones."));
          }
        };
        script.onerror = () => reject(new Error("No se pudo cargar el SDK de PayPal."));
        document.head.appendChild(script);
      });
    }

    return payPalSdkPromise;
  }

  async function ensurePayPalButtons() {
    if (payPalButtonsReady || !paypalButtonsContainer) return;

    const config = await loadPayPalConfig();
    if (!config?.enabled) {
      throw new Error("PayPal Sandbox no está configurado todavía.");
    }

    const paypal = await loadPayPalSdk();
    paypalButtonsContainer.innerHTML = "";

    await paypal.Buttons({
      style: {
        layout: "vertical",
        shape: "rect",
        label: "paypal"
      },
      createOrder: async () => {
        clearPaymentStatus();

        try {
          const checkout = buildCheckoutPayload(PAYPAL_METHOD);
          pendingPayPalPayload = checkout;
          setPaymentStatus("info", "Creando orden en PayPal Sandbox...");

          const response = await apiFetch("/pagos/paypal/create-order", {
            method: "POST",
            body: JSON.stringify({
              requiere_factura: checkout.requiere_factura,
              datos_fiscales: checkout.datos_fiscales,
              donacion_total: checkout.donation
            })
          });

          return response.id;
        } catch (err) {
          setPaymentStatus("danger", err.message || "No se pudo iniciar el flujo de PayPal.");
          throw err;
        }
      },
      onApprove: async data => {
        try {
          const checkout = pendingPayPalPayload || buildCheckoutPayload(PAYPAL_METHOD);
          setPaymentStatus("info", "Capturando pago en PayPal Sandbox...");

          const response = await apiFetch("/pagos/paypal/capture-order", {
            method: "POST",
            body: JSON.stringify({
              paypal_order_id: data.orderID,
              requiere_factura: checkout.requiere_factura,
              datos_fiscales: checkout.datos_fiscales,
              donacion_total: checkout.donation
            })
          });

          pendingPayPalPayload = null;
          await handleSuccessfulPayment(response, "Pago aprobado con PayPal Sandbox y compra registrada correctamente.");
        } catch (err) {
          setPaymentStatus("danger", err.message || "No se pudo confirmar el pago con PayPal.");
        }
      },
      onCancel: () => {
        pendingPayPalPayload = null;
        setPaymentStatus("warning", "El pago con PayPal Sandbox fue cancelado.");
      },
      onError: err => {
        pendingPayPalPayload = null;
        const message = err?.message || "No se pudo completar el flujo de PayPal Sandbox.";
        setPaymentStatus("danger", message);
      }
    }).render("#paypalButtons");

    payPalButtonsReady = true;
    setPayPalNotice("PayPal Sandbox listo para autorizar el pago.", "success");
  }

  async function actualizarMetodo() {
    const metodo = getSelectedMethod();
    if (!metodo) return;

    datosTarjetaDiv.style.display = "none";
    infoOtrosDiv.style.display = "none";
    infoOtrosDiv.innerHTML = "";
    datosMicropagoDiv.style.display = "none";
    datosChequeDiv.style.display = "none";
    if (paypalSection) paypalSection.style.display = "none";
    if (btnConfirmarPago) btnConfirmarPago.style.display = "";
    if (escenarioSelect) escenarioSelect.disabled = false;

    if (metodo === PAYPAL_METHOD) {
      if (btnConfirmarPago) btnConfirmarPago.style.display = "none";
      if (paypalSection) paypalSection.style.display = "block";
      if (escenarioSelect) escenarioSelect.disabled = true;

      try {
        await ensurePayPalButtons();
      } catch (err) {
        setPayPalNotice(err.message || "No fue posible preparar PayPal Sandbox.", "danger");
      }
      return;
    }

    if (metodo === "Tarjeta") {
      datosTarjetaDiv.style.display = "block";
      return;
    }

    if (metodo === "Micropago") {
      datosMicropagoDiv.style.display = "block";
      return;
    }

    if (metodo === "Cheque electrónico") {
      datosChequeDiv.style.display = "block";
      return;
    }

    infoOtrosDiv.style.display = "block";

    if (metodo === "Transferencia SPEI") {
      infoOtrosDiv.innerHTML = `
        <h6 class="fw-bold mb-2">Transferencia SPEI</h6>
        <p class="mb-1">Banco: BBVA Demo</p>
        <p class="mb-1">CLABE: 000000000000000000</p>
        <p class="mb-0"><strong>Referencia:</strong> ${generarReferencia("TRF")}</p>
      `;
    } else if (metodo === "Depósito bancario") {
      infoOtrosDiv.innerHTML = `
        <h6 class="fw-bold mb-2">Depósito bancario</h6>
        <p class="mb-1">Banco: BBVA Demo</p>
        <p class="mb-0"><strong>Referencia para depósito:</strong> ${generarReferencia("DEP")}</p>
      `;
    } else if (metodo === "Cajero automático") {
      infoOtrosDiv.innerHTML = `
        <h6 class="fw-bold mb-2">Pago en cajero</h6>
        <p class="mb-1">Convenio: ${Math.floor(10000 + Math.random() * 90000)}</p>
        <p class="mb-0"><strong>Referencia:</strong> ${generarReferencia("ATM")}</p>
      `;
    } else if (metodo === "Pago en OXXO") {
      infoOtrosDiv.innerHTML = `
        <h6 class="fw-bold mb-2">Pago en OXXO</h6>
        <p class="mb-1">Presenta la referencia al cajero:</p>
        <p class="mb-2"><strong>${generarReferencia("OXXO")}</strong></p>
        <div class="text-center">
          <img src="img/oxxo-qr.png" alt="QR OXXO" style="max-width:160px;">
        </div>
      `;
    } else if (metodo === "Monedero electrónico") {
      const saldo = getWallet();
      infoOtrosDiv.innerHTML = `
        <h6 class="fw-bold mb-2">Monedero electrónico</h6>
        <p class="mb-1">Saldo disponible:</p>
        <p class="display-6">${money(saldo)}</p>
        <p class="small text-muted mb-0">El saldo del monedero se mantiene en tu navegador para esta demo.</p>
      `;
    }
  }

  async function processPayment() {
    clearPaymentStatus();

    try {
      const checkout = buildCheckoutPayload();
      if (checkout.metodo === PAYPAL_METHOD) {
        throw new Error("Usa el botón de PayPal Sandbox para completar ese método de pago.");
      }

      setPaymentStatus("info", "Procesando pago...");

      const response = await apiFetch("/pagos/procesar", {
        method: "POST",
        body: JSON.stringify({
          metodo_pago: checkout.metodo,
          requiere_factura: checkout.requiere_factura,
          datos_fiscales: checkout.datos_fiscales,
          donacion_total: checkout.donation,
          escenario: escenarioSelect?.value || "normal"
        })
      });

      if (checkout.metodo === "Monedero electrónico") {
        setWallet(getWallet() - Number(response?.pago?.monto || 0));
      }

      await handleSuccessfulPayment(response, "Pago aprobado y compra registrada correctamente.");
    } catch (err) {
      setPaymentStatus("danger", err.message || "No se pudo procesar el pago.");
    }
  }

  btnInvoiceView?.addEventListener("click", () => {
    if (!currentInvoicePayload) return;
    openFacturaWindow?.(currentInvoicePayload);
  });

  btnInvoicePdf?.addEventListener("click", () => {
    if (!currentInvoicePayload) return;
    downloadFacturaPdf?.(currentInvoicePayload);
  });

  btnInvoiceEmail?.addEventListener("click", async () => {
    if (!currentInvoicePayload?.pago?.id) return;

    try {
      btnInvoiceEmail.disabled = true;
      const result = await enviarFacturaPorCorreo?.(currentInvoicePayload.pago.id);
      if (result?.sent) {
        setPaymentStatus("success", "Factura enviada por correo correctamente.");
        currentInvoicePayload.pago.factura_estado = "enviada";
        currentInvoicePayload.pago.factura_fecha_envio = new Date().toISOString();
      } else {
        setPaymentStatus("info", "No fue posible enviar correo real, pero la factura quedó disponible para descarga.");
      }
    } catch (err) {
      setPaymentStatus("danger", err.message || "No se pudo enviar la factura.");
    } finally {
      btnInvoiceEmail.disabled = false;
    }
  });

  fiscalCheckbox?.addEventListener("change", toggleFiscales);
  toggleFiscales();

  donateToggle?.addEventListener("change", () => {
    donationOptions.style.display = donateToggle.checked ? "block" : "none";
  });
  donationOptions.style.display = donateToggle?.checked ? "block" : "none";

  donateAmountRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.checked && radio.value === "custom") {
        donateCustomAmount.disabled = false;
        donateCustomAmount.focus();
      } else if (radio.checked) {
        donateCustomAmount.disabled = true;
        donateCustomAmount.value = "";
      }
    });
  });

  radiosMetodo.forEach(radio => radio.addEventListener("change", () => {
    void actualizarMetodo();
  }));

  document.querySelectorAll(".micropago-btn").forEach(btn => {
    btn.addEventListener("click", event => {
      event.preventDefault();
      const amount = Number(btn.dataset.amount || 0);
      document.getElementById("micropagoMonto").value = amount;
      setPaymentStatus("secondary", `Micropago seleccionado: ${money(amount)}`);
    });
  });

  btnConfirmarPago?.addEventListener("click", processPayment);

  Promise.all([loadCart(), loadPayPalConfig()])
    .then(() => actualizarMetodo())
    .catch(err => {
      setPaymentStatus("danger", err.message || "No se pudo cargar el checkout.");
    });
});
