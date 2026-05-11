(function () {
  const {
    escapeHtml = value => String(value ?? ""),
    formatDate = value => value || "",
    money = value => `$${Number(value || 0).toFixed(2)}`
  } = window.ecommerceUtils || {};

  function facturaEstadoBadge(estado) {
    const value = String(estado || "").toLowerCase();
    if (value === "enviada") return `<span class="badge bg-success">Enviada</span>`;
    if (value === "generada") return `<span class="badge bg-primary">Generada</span>`;
    return `<span class="badge bg-secondary">No solicitada</span>`;
  }

  function logisticaBadge(estado) {
    const value = String(estado || "").toLowerCase();
    const labels = {
      en_almacen: ["En almacén", "bg-secondary"],
      en_central_para_envio: ["En central para envío", "bg-info text-dark"],
      en_envio: ["En envío", "bg-warning text-dark"],
      entregado: ["Entregado", "bg-success"],
      incidencia: ["Incidencia", "bg-danger"],
      cancelado: ["Cancelado", "bg-dark"]
    };
    const [label, className] = labels[value] || [estado || "En almacén", "bg-secondary"];
    return `<span class="badge ${className}">${escapeHtml(label)}</span>`;
  }

  function buildFacturaHtml(payload) {
    const pago = payload?.pago || {};
    const items = payload?.items || [];
    const fiscal = pago.detalle_fiscal || {};

    return `
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Factura ${escapeHtml(pago.factura_folio || pago.folio || "")}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          h1 { color: #8b5a2b; margin-bottom: 4px; }
          h3 { margin-top: 22px; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 14px; }
          th { background: #f6efe5; text-align: left; }
          .small { font-size: 12px; color: #6b7280; }
          .totals td { font-weight: bold; }
          .actions { margin-top: 24px; }
        </style>
      </head>
      <body>
        <h1>Thrift Cálido Bazar</h1>
        <p>Factura demo de compra</p>
        <p><strong>Factura:</strong> ${escapeHtml(pago.factura_folio || "Pendiente")}</p>
        <p><strong>Folio de compra:</strong> ${escapeHtml(pago.folio || "")}</p>
        <p><strong>Método de pago:</strong> ${escapeHtml(pago.metodo_pago || "")}</p>
        <p><strong>Referencia:</strong> ${escapeHtml(pago.referencia || "")}</p>
        <p><strong>Fecha:</strong> ${escapeHtml(formatDate(pago.fecha || pago.pedido_fecha || ""))}</p>

        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Precio</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>${escapeHtml(item.producto_nombre || item.nombre || "")}</td>
                <td>${Number(item.cantidad || 0)}</td>
                <td>${money(item.precio || 0)}</td>
                <td>${money(Number(item.precio || 0) * Number(item.cantidad || 0))}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr><td colspan="3">Subtotal</td><td>${money(pago.subtotal || 0)}</td></tr>
            <tr><td colspan="3">Descuento</td><td>-${money(pago.descuento_total || 0)}</td></tr>
            <tr><td colspan="3">Impuestos</td><td>${money(pago.impuesto_total || 0)}</td></tr>
            <tr><td colspan="3">Donación</td><td>${money(pago.donacion_total || 0)}</td></tr>
            <tr class="totals"><td colspan="3">Total</td><td>${money(pago.monto || 0)}</td></tr>
          </tfoot>
        </table>

        <div style="margin-top: 24px;">
          <h3>Datos fiscales</h3>
          <p><strong>Nombre/Razón social:</strong> ${escapeHtml(fiscal.nombre_razon_social || "")}</p>
          <p><strong>RFC:</strong> ${escapeHtml(fiscal.rfc || "")}</p>
          <p><strong>Dirección:</strong> ${escapeHtml(fiscal.direccion || "")}</p>
          <p><strong>CP:</strong> ${escapeHtml(fiscal.codigo_postal || "")}</p>
          <p><strong>Correo:</strong> ${escapeHtml(fiscal.correo || pago.cliente_correo || "")}</p>
        </div>

        <p class="small" style="margin-top: 24px;">Documento de simulación académica. No tiene validez fiscal.</p>
      </body>
      </html>
    `;
  }

  function openFacturaWindow(payload) {
    const facturaWin = window.open("", "_blank");
    if (!facturaWin) return false;
    facturaWin.document.open();
    facturaWin.document.write(buildFacturaHtml(payload));
    facturaWin.document.close();
    return true;
  }

  function getJsPdfCtor() {
    return window.jspdf?.jsPDF || window.jsPDF || null;
  }

  function createFacturaPdf(payload) {
    const JsPDF = getJsPdfCtor();
    if (!JsPDF) return null;

    const pago = payload?.pago || {};
    const items = payload?.items || [];
    const fiscal = pago.detalle_fiscal || {};
    const doc = new JsPDF({ unit: "mm", format: "a4" });
    const margin = 14;
    let y = 18;

    function line(text, opts = {}) {
      const size = opts.size || 10;
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = Array.isArray(text) ? text : doc.splitTextToSize(String(text || ""), 180);
      doc.text(lines, margin, y);
      y += (lines.length * (size * 0.45)) + 3;
      if (y > 275) {
        doc.addPage();
        y = 18;
      }
    }

    doc.setTextColor(139, 90, 43);
    line("Thrift Cálido Bazar", { size: 18, bold: true });
    doc.setTextColor(17, 24, 39);
    line("Factura demo de compra", { size: 11 });
    line(`Factura: ${pago.factura_folio || "Pendiente"}`, { bold: true });
    line(`Folio de compra: ${pago.folio || ""}`);
    line(`Método de pago: ${pago.metodo_pago || ""}`);
    line(`Referencia: ${pago.referencia || ""}`);
    line(`Fecha: ${formatDate(pago.fecha || pago.pedido_fecha || "")}`);

    y += 4;
    line("Detalle de productos", { size: 13, bold: true });
    items.forEach(item => {
      line(`${item.producto_nombre || item.nombre || ""} · ${Number(item.cantidad || 0)} x ${money(item.precio || 0)}`);
      line(`Subtotal: ${money(Number(item.precio || 0) * Number(item.cantidad || 0))}`, { size: 9 });
    });

    y += 4;
    line("Totales", { size: 13, bold: true });
    line(`Subtotal: ${money(pago.subtotal || 0)}`);
    line(`Descuento: -${money(pago.descuento_total || 0)}`);
    line(`Impuestos: ${money(pago.impuesto_total || 0)}`);
    line(`Donación: ${money(pago.donacion_total || 0)}`);
    line(`Total: ${money(pago.monto || 0)}`, { bold: true });

    y += 4;
    line("Datos fiscales", { size: 13, bold: true });
    line(`Nombre/Razón social: ${fiscal.nombre_razon_social || ""}`);
    line(`RFC: ${fiscal.rfc || ""}`);
    line(`Dirección: ${fiscal.direccion || ""}`);
    line(`CP: ${fiscal.codigo_postal || ""}`);
    line(`Correo: ${fiscal.correo || pago.cliente_correo || ""}`);
    line("Documento de simulación académica. No tiene validez fiscal.", { size: 9 });

    return doc;
  }

  function downloadFacturaPdf(payload) {
    const doc = createFacturaPdf(payload);
    if (!doc) {
      openFacturaWindow(payload);
      return false;
    }

    const pago = payload?.pago || {};
    const filename = `${pago.factura_folio || pago.folio || "factura-demo"}.pdf`;
    doc.save(filename);
    return true;
  }

  function openFacturaPdf(payload) {
    const doc = createFacturaPdf(payload);
    if (!doc) {
      openFacturaWindow(payload);
      return false;
    }

    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
    return true;
  }

  async function enviarFacturaPorCorreo(pagoId, correo = "") {
    return apiFetch(`/pagos/facturas/${pagoId}/enviar-correo`, {
      method: "POST",
      body: JSON.stringify(correo ? { correo } : {})
    });
  }

  window.invoiceUtils = {
    buildFacturaHtml,
    downloadFacturaPdf,
    enviarFacturaPorCorreo,
    facturaEstadoBadge,
    logisticaBadge,
    openFacturaPdf,
    openFacturaWindow
  };
})();
