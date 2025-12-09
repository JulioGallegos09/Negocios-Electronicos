document.addEventListener("DOMContentLoaded", () => {
  // Verificar rol
  const rol = localStorage.getItem("rol");
  if (!rol) {
    alert("Debes iniciar sesión primero.");
    window.location.href = "login.html";
    return;
  } else if (rol !== "usuario") {
    alert("Acceso restringido: solo usuarios.");
    window.location.href = "views/admin.html";
    return;
  }

  const CART_KEY = "thrift_cart";
  const WALLET_KEY = "thrift_wallet";
  let PRODUCTS = [];

  function loadCart() {
    return JSON.parse(localStorage.getItem(CART_KEY) || "{}");
  }

  function renderCart() {
    const cart = loadCart();
    const body = document.getElementById("cart-body");
    body.innerHTML = "";
    let total = 0;
    Object.entries(cart).forEach(([id, qty]) => {
      const p = PRODUCTS.find((x) => x.id === id);
      if (!p) return;
      const subtotal = p.precio * qty;
      total += subtotal;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.nombre}</td>
        <td>${qty}</td>
        <td>$${p.precio.toFixed(2)}</td>
        <td>$${subtotal.toFixed(2)}</td>
      `;
      body.appendChild(tr);
    });
    document.getElementById("cart-total").textContent = "$" + total.toFixed(2);
  }

  function getWallet() {
    return Number(localStorage.getItem(WALLET_KEY) || "0");
  }

  function setWallet(value) {
    localStorage.setItem(WALLET_KEY, String(value));
  }

  function cerrarSesion() {
    localStorage.removeItem("rol");
    window.location.href = "login.html";
  }
  window.cerrarSesion = cerrarSesion;

  const radiosMetodo = document.querySelectorAll('input[name="metodoPago"]');
  const datosTarjetaDiv = document.getElementById("datosTarjeta");
  const infoOtrosDiv = document.getElementById("infoOtrosMetodos");
  const datosMicropagoDiv = document.getElementById("datosMicropago");
  const datosChequeDiv = document.getElementById("datosCheque");
  const fiscalCheckbox = document.getElementById("fiscalFactura");
  const fiscalesSection = document.getElementById("fiscalesSection");
  const paymentStatus = document.getElementById("payment-status");
  const escenarioSelect = document.getElementById("escenarioPrueba");

  // Donación
  const donateToggle = document.getElementById("donateToggle");
  const donationOptions = document.getElementById("donationOptions");
  const donateCustomAmount = document.getElementById("donateCustomAmount");
  const donateAmountRadios = document.querySelectorAll("input[name='donateAmount']");

  function setPaymentStatus(type, text) {
    paymentStatus.className = "alert mt-3 alert-" + type;
    paymentStatus.textContent = text;
    paymentStatus.classList.remove("d-none");
  }

  function clearPaymentStatus() {
    paymentStatus.className = "alert d-none mt-3";
    paymentStatus.textContent = "";
  }

  function toggleFiscales() {
    fiscalesSection.style.display = fiscalCheckbox.checked ? "block" : "none";
  }
  fiscalCheckbox.addEventListener("change", toggleFiscales);
  toggleFiscales();

  // Donación: mostrar / ocultar opciones
  if (donateToggle) {
    donateToggle.addEventListener("change", () => {
      donationOptions.style.display = donateToggle.checked ? "block" : "none";
    });
  }

  // Donación: habilitar campo personalizado si se elige "Otro monto"
  donateAmountRadios.forEach(r => {
    r.addEventListener("change", () => {
      if (r.value === "custom" && r.checked) {
        donateCustomAmount.disabled = false;
        donateCustomAmount.focus();
      } else if (r.checked) {
        donateCustomAmount.disabled = true;
        donateCustomAmount.value = "";
      }
    });
  });

  function getDonationAmount() {
    if (!donateToggle || !donateToggle.checked) return 0;

    const selected = document.querySelector("input[name='donateAmount']:checked");
    if (!selected) return 0;

    if (selected.value === "custom") {
      const val = Number(donateCustomAmount.value || "0");
      return isNaN(val) || val < 0 ? 0 : val;
    } else {
      return Number(selected.value);
    }
  }

  function generarReferencia(prefix) {
    const num = Math.floor(1000000000 + Math.random() * 9000000000);
    return `${prefix}-${num}`;
  }

  function generarUUIDCFDI() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16).toUpperCase();
    });
  }

  function generarSelloSAT() {
    let sello = "SELLO-SAT-";
    for (let i = 0; i < 5; i++) {
      sello += Math.random().toString(36).toUpperCase().slice(2);
    }
    return sello.slice(0, 220) + "...";
  }

  function actualizarMetodo() {
    const metodo = document.querySelector(
      'input[name="metodoPago"]:checked'
    )?.value;
    if (!metodo) return;

    // Ocultar todo al inicio
    datosTarjetaDiv.style.display = "none";
    infoOtrosDiv.style.display = "none";
    infoOtrosDiv.innerHTML = "";
    datosMicropagoDiv.style.display = "none";
    datosChequeDiv.style.display = "none";

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

    // Otros métodos que usan infoOtrosMetodos
    infoOtrosDiv.style.display = "block";

    if (metodo === "Transferencia SPEI") {
      const ref = generarReferencia("TRF");
      infoOtrosDiv.innerHTML = `
        <h6 class="fw-bold mb-2">Transferencia SPEI</h6>
        <p class="mb-1">Banco: Banco BBVA</p>
        <p class="mb-1">Cuenta: 00012345678</p>
        <p class="mb-1">CLABE: 000000000000000000</p>
        <p class="mb-0"><strong>Referencia:</strong> ${ref}</p>
      `;
    } else if (metodo === "Depósito bancario") {
      const ref = generarReferencia("DEP");
      infoOtrosDiv.innerHTML = `
        <h6 class="fw-bold mb-2">Depósito bancario</h6>
        <p class="mb-1">Banco: Banco BBVA</p>
        <p class="mb-1">Sucursal: 001 Ejemplo</p>
        <p class="mb-1">Cuenta: 00098765432</p>
        <p class="mb-0"><strong>Referencia para depósito:</strong> ${ref}</p>
      `;
    } else if (metodo === "Cajero automático") {
      const ref = generarReferencia("ATM");
      const convenio = Math.floor(10000 + Math.random() * 90000);
      infoOtrosDiv.innerHTML = `
        <h6 class="fw-bold mb-2">Pago en cajero automático</h6>
        <p class="mb-1">Acude a un cajero de tu banco.</p>
        <p class="mb-1">Selecciona "Pago de servicios".</p>
        <p class="mb-1"><strong>Convenio:</strong> ${convenio}</p>
        <p class="mb-2"><strong>Referencia:</strong> ${ref}</p>
        <p class="small text-muted mb-0">Datos solo ilustrativos. No funcionan en un cajero real.</p>
      `;
    } else if (metodo === "Pago en OXXO") {
      const ref = generarReferencia("OXXO");
      const codigoNumerico = Math.floor(
        100000000000 + Math.random() * 900000000000
      );
      infoOtrosDiv.innerHTML = `
        <h6 class="fw-bold mb-2">Pago en OXXO</h6>
        <p class="mb-1">Acude a tu OXXO más cercano.</p>
        <p class="mb-1">Indica que pagarás un servicio con la referencia:</p>
        <p class="mb-2"><strong>${ref}</strong></p>
        <p class="mb-1">O utiliza este QR:</p>
        <div class="text-center mb-2">
          <img src="img/oxxo-qr.png" alt="QR OXXO" style="max-width:160px;">
        </div>
        <p class="mb-1">Si no se puede escanear, proporciona este código numérico:</p>
        <p class="mb-2"><strong>${codigoNumerico}</strong></p>
        <p class="small text-muted mb-0">Datos ilustrativos. No funcionan en caja real.</p>
      `;
    } else if (metodo === "Monedero electrónico") {
      const saldo = getWallet();
      infoOtrosDiv.innerHTML = `
        <h6 class="fw-bold mb-2">Monedero electrónico</h6>
        <p class="mb-1">Saldo disponible en tu monedero:</p>
        <p class="display-6">$${saldo.toFixed(2)} MXN</p>
        <p class="small text-muted mb-1">
          Este saldo se guarda de forma en tu navegador (localStorage). 
          Puedes recargarlo desde el módulo de Micropagos.
        </p>
        <p class="small text-muted mb-0">
          Para la simulación, el saldo debe ser suficiente para cubrir el total de la compra.
        </p>
      `;
    } else {
      infoOtrosDiv.innerHTML = "";
    }
  }

  radiosMetodo.forEach((r) => r.addEventListener("change", actualizarMetodo));
  actualizarMetodo();

  // Micropago: asignar monto
  document.querySelectorAll(".micropago-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const amount = Number(btn.dataset.amount || "0");
      document.getElementById("micropagoMonto").value = amount;
      alert("Micropago seleccionado: $" + amount.toFixed(2) + " MXN");
    });
  });

  document
    .getElementById("btnConfirmarPago")
    .addEventListener("click", () => {
      clearPaymentStatus();

      const metodo = document.querySelector(
        'input[name="metodoPago"]:checked'
      )?.value;

      const fiscalName = document.getElementById("fiscalName")
        ? document.getElementById("fiscalName").value.trim()
        : "";
      const fiscalRFC = document.getElementById("fiscalRFC")
        ? document.getElementById("fiscalRFC").value.trim()
        : "";
      const fiscalAddress = document.getElementById("fiscalAddress")
        ? document.getElementById("fiscalAddress").value.trim()
        : "";
      const fiscalCP = document.getElementById("fiscalCP")
        ? document.getElementById("fiscalCP").value.trim()
        : "";
      const fiscalEmail = document.getElementById("fiscalEmail")
        ? document.getElementById("fiscalEmail").value.trim()
        : "";
      const requiereFactura = fiscalCheckbox.checked;

      if (!metodo) {
        alert("Selecciona un método de pago.");
        return;
      }

      if (requiereFactura) {
        if (!fiscalName || !fiscalRFC || !fiscalEmail) {
          alert(
            "Para generar la factura, completa Nombre/Razón social, RFC y correo."
          );
          return;
        }
      }

      if (metodo === "Tarjeta") {
        const cardName = document.getElementById("cardName").value.trim();
        const cardNumber = document.getElementById("cardNumber").value.trim();
        const cardExp = document.getElementById("cardExp").value.trim();
        const cardCVV = document.getElementById("cardCVV").value.trim();
        if (!cardName || !cardNumber || !cardExp || !cardCVV) {
          alert("Por favor, llena los datos de la tarjeta.");
          return;
        }
      }

      if (metodo === "Micropago") {
        const monto = Number(
          document.getElementById("micropagoMonto").value || "0"
        );
        if (monto <= 0) {
          alert("Selecciona un monto de micropago.");
          return;
        }
      }

      if (metodo === "Cheque electrónico") {
        const num = document.getElementById("chequeNumero").value.trim();
        const banco = document.getElementById("chequeBanco").value.trim();
        const fechaCh = document.getElementById("chequeFecha").value;
        const montoCh = document.getElementById("chequeMonto").value;
        if (!num || !banco || !fechaCh || !montoCh) {
          alert("Completa todos los datos del cheque electrónico.");
          return;
        }
      }

      const cart = loadCart();
      if (!cart || Object.keys(cart).length === 0) {
        alert("Tu carrito está vacío. Te redirigimos al carrito.");
        window.location.href = "cart.html";
        return;
      }

      if (!PRODUCTS || PRODUCTS.length === 0) {
        alert("No se pudieron cargar los productos. Intenta recargar la página.");
        return;
      }

      const folio = "ORD-" + Math.floor(1000 + Math.random() * 9000);
      document.getElementById("folioLabel").textContent = folio;

      let total = 0;
      let rows = "";
      Object.entries(cart).forEach(([id, qty]) => {
        const p = PRODUCTS.find((x) => x.id === id);
        if (!p) return;
        const subtotal = p.precio * qty;
        total += subtotal;
        rows += `
          <tr>
            <td>${p.nombre}</td>
            <td style="text-align:center;">${qty}</td>
            <td style="text-align:right;">$${p.precio.toFixed(2)}</td>
            <td style="text-align:right;">$${subtotal.toFixed(2)}</td>
          </tr>
        `;
      });

      const donacion = getDonationAmount();
      if (donacion < 0) {
        alert("El monto de donación no puede ser negativo.");
        return;
      }

      const totalConDonacion = total + donacion;

      // Validar monedero (si lo seleccionó)
      if (metodo === "Monedero electrónico") {
        const saldo = getWallet();
        if (saldo < totalConDonacion) {
          alert(
            "Saldo insuficiente en el monedero para cubrir el total de la compra (incluyendo la donación).\n" +
            "Saldo actual: $" + saldo.toFixed(2) + " MXN.\n" +
            "Total de la compra: $" + totalConDonacion.toFixed(2) + " MXN.\n" +
            "Puedes recargar saldo desde el módulo de Micropagos."
          );
          return;
        }
      }

      const fecha = new Date().toLocaleString("es-MX");

      const uuidCFDI = requiereFactura ? generarUUIDCFDI() : null;
      const selloSAT = requiereFactura ? generarSelloSAT() : null;
      const usoCFDI = requiereFactura ? "G03 - Gastos en general" : null;

      let cfdiSection = "";
      if (requiereFactura) {
        cfdiSection = `
          <div class="section">
            <h2>Datos CFDI</h2>
            <p><strong>Uso CFDI:</strong> ${usoCFDI}</p>
            <p><strong>UUID CFDI:</strong> ${uuidCFDI}</p>
            <p><strong>Sello digital del SAT:</strong></p>
            <p class="small" style="word-wrap:break-word;">${selloSAT}</p>
          </div>
        `;
      } else {
        cfdiSection = `
          <div class="section small">
            <p><strong>CFDI:</strong> No se solicitó factura para esta compra.</p>
          </div>
        `;
      }

      const facturaHTML = `
        <!doctype html>
        <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>Factura  - ${folio}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #8b5a2b; }
            h2 { margin-top: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 14px; }
            th { background: #f4eadc; text-align: left; }
            .totals { text-align: right; font-weight: bold; }
            .small { font-size: 12px; color: #555; }
            .section { margin-top: 18px; }
          </style>
        </head>
        <body>
          <h1>Thrift Cálido Bazar</h1>
          <p><strong>Factura</strong></p>

          <div class="section">
            <p><strong>Folio:</strong> ${folio}</p>
            <p><strong>Fecha:</strong> ${fecha}</p>
            <p><strong>Método de pago:</strong> ${metodo}</p>
          </div>

          <div class="section">
            <h2>Datos fiscales del cliente</h2>
            <p><strong>Nombre / Razón social:</strong> ${
              requiereFactura ? fiscalName : "No se solicitó factura"
            }</p>
            <p><strong>RFC:</strong> ${
              requiereFactura ? fiscalRFC : "N/A (sin factura)"
            }</p>
            <p><strong>Dirección:</strong> ${
              requiereFactura ? fiscalAddress || "-" : "-"
            } &nbsp; C.P. ${requiereFactura ? fiscalCP || "-" : "-"}</p>
            <p><strong>Correo:</strong> ${
              requiereFactura ? fiscalEmail : "N/A"
            }</p>
          </div>

          <div class="section">
            <h2>Detalle de la compra</h2>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style="text-align:center;">Cantidad</th>
                  <th style="text-align:right;">Precio</th>
                  <th style="text-align:right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                ${donacion > 0 ? `
                  <tr>
                    <td>Donación voluntaria — Programa "Abrigo Cálido"</td>
                    <td style="text-align:center;">1</td>
                    <td style="text-align:right;">$${donacion.toFixed(2)}</td>
                    <td style="text-align:right;">$${donacion.toFixed(2)}</td>
                  </tr>
                ` : ""}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3" class="totals">Total</td>
                  <td class="totals">$${totalConDonacion.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          ${cfdiSection}

          <div class="section small">
            <p><strong>Aviso importante:</strong></p>
            <ul>
              <li>Esta factura es únicamente con fines académicos y de simulación. No tiene validez fiscal.</li>
              <li>Las prendas son de segunda mano y pueden presentar ligeros detalles no visibles en las fotografías.</li>
              <li>Se recomienda lavar la prenda antes de su primer uso.</li>
              <li>La donación al programa "Abrigo Cálido" es simulada y no es deducible de impuestos.</li>
            </ul>
            <p>Gracias por comprar en Thrift Cálido Bazar.</p>
          </div>
        </body>
        </html>
      `;

      setPaymentStatus("info", "Procesando pago...");

      const escenario = escenarioSelect ? escenarioSelect.value : "normal";

      setTimeout(() => {

        // Escenarios especiales
        if (escenario !== "normal") {
          if (escenario === "duplicado") {
            setPaymentStatus(
              "warning",
              "Pago rechazado: posible duplicado de tarjeta."
            );
          } else if (escenario === "fondos") {
            setPaymentStatus(
              "danger",
              "Pago rechazado: fondos insuficientes en la cuenta."
            );
          } else if (escenario === "doble") {
            setPaymentStatus(
              "warning",
              "Aviso: se detectó un posible pago doble. Esta transacción ha sido detenida."
            );
          } else if (escenario === "conexion") {
            setPaymentStatus(
              "danger",
              "Fallo de conexión con el procesador de pagos. Intenta nuevamente más tarde."
            );
          }
          return;
        }

        // Flujo normal: pago aleatorio (80% éxito)
        const aprobado = Math.random() < 0.8;

        if (!aprobado) {
          setPaymentStatus(
            "danger",
            "Pago rechazado. Intenta nuevamente o prueba con otro método de pago."
          );
          return;
        }

        // Si fue con monedero y está aprobado, descontamos saldo
        if (metodo === "Monedero electrónico") {
          const saldoActual = getWallet();
          const nuevoSaldo = saldoActual - totalConDonacion;
          setWallet(nuevoSaldo);
        }

        // Mensaje clásico
        setPaymentStatus(
          "success",
          "Pago aprobado. Cobro realizado."
        );

        const facturaWin = window.open("", "_blank");
        if (facturaWin) {
          facturaWin.document.open();
          facturaWin.document.write(facturaHTML);
          facturaWin.document.close();
          facturaWin.focus();
          facturaWin.print();
        } else {
          alert(
            "El navegador bloqueó la ventana emergente de la factura. Permite ventanas emergentes para ver la factura."
          );
        }

        const compraModal = new bootstrap.Modal(
          document.getElementById("compraExitosaModal")
        );
        compraModal.show();

        localStorage.setItem(CART_KEY, JSON.stringify({}));
        renderCart();
      }, 1000);
    });

  fetch("src/data/products.json")
    .then((r) => r.json())
    .then((data) => {
      PRODUCTS = data;
      const cart = loadCart();
      if (!cart || Object.keys(cart).length === 0) {
        alert("Tu carrito está vacío. Te redirigimos al carrito.");
        window.location.href = "cart.html";
        return;
      }
      renderCart();
    });
});
