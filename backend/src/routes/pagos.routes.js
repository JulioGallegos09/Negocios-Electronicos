const express = require("express");
const { getDB } = require("../db/init");
const { auth } = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const {
  ensureClienteForUser,
  getStock,
  nowIso,
  summarizeCartForCliente
} = require("../services/ecommerce.service");
const { enviarFacturaDemo } = require("../services/email.service");
const {
  PAYPAL_CURRENCY,
  capturePayPalOrder,
  createPayPalOrder,
  getPublicPayPalConfig,
  isPayPalConfigured
} = require("../services/paypal.service");

const router = express.Router();

const METODOS_VALIDOS = new Set([
  "Tarjeta",
  "Transferencia SPEI",
  "Depósito bancario",
  "Cajero automático",
  "Pago en OXXO",
  "Monedero electrónico",
  "Micropago",
  "Cheque electrónico"
]);

function generarFolio() {
  const random = Math.floor(10000 + Math.random() * 90000);
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `TCB-${stamp}-${random}`;
}

function generarFolioFactura() {
  const random = Math.floor(100000 + Math.random() * 900000);
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `FAC-${stamp}-${random}`;
}

function generarReferenciaPago(metodo) {
  const prefix = String(metodo || "PAGO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 5) || "PAGO";

  return `${prefix}-${Math.floor(100000000 + Math.random() * 900000000)}`;
}

function parseJsonSafe(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeFacturaEstado(value) {
  const estado = String(value || "").toLowerCase();
  if (estado === "enviada") return "enviada";
  if (estado === "generada") return "generada";
  return "no_solicitada";
}

function normalizeDonationTotal(value) {
  const donation = Number(value || 0);
  if (!Number.isFinite(donation) || donation < 0) {
    throw new Error("La donación es inválida");
  }
  return Number(donation.toFixed(2));
}

function normalizeFiscalPayload(requiereFactura, datosFiscales) {
  if (!requiereFactura) return null;

  const payload = {
    nombre_razon_social: String(datosFiscales?.nombre_razon_social || "").trim(),
    rfc: String(datosFiscales?.rfc || "").trim(),
    direccion: String(datosFiscales?.direccion || "").trim(),
    codigo_postal: String(datosFiscales?.codigo_postal || "").trim(),
    correo: String(datosFiscales?.correo || "").trim()
  };

  if (!payload.nombre_razon_social || !payload.rfc || !payload.correo) {
    throw new Error("Para facturar debes completar nombre o razón social, RFC y correo.");
  }

  return payload;
}

function buildFacturaHtml(payload) {
  const pago = payload?.pago || {};
  const items = payload?.items || [];
  const fiscal = pago.detalle_fiscal || {};

  return `
    <div style="font-family: Arial, sans-serif; color: #111827;">
      <h2 style="margin-bottom: 8px; color: #8b5a2b;">Thrift Cálido Bazar</h2>
      <p style="margin-top: 0;">Factura demo de compra</p>
      <p><strong>Factura:</strong> ${pago.factura_folio || "Pendiente"}</p>
      <p><strong>Folio de compra:</strong> ${pago.folio || ""}</p>
      <p><strong>Método de pago:</strong> ${pago.metodo_pago || ""}</p>
      <p><strong>Referencia:</strong> ${pago.referencia || ""}</p>

      <table style="width:100%; border-collapse:collapse; margin-top:16px;">
        <thead>
          <tr>
            <th style="border:1px solid #e5e7eb; padding:8px; background:#f6efe5; text-align:left;">Producto</th>
            <th style="border:1px solid #e5e7eb; padding:8px; background:#f6efe5; text-align:left;">Cantidad</th>
            <th style="border:1px solid #e5e7eb; padding:8px; background:#f6efe5; text-align:left;">Precio</th>
            <th style="border:1px solid #e5e7eb; padding:8px; background:#f6efe5; text-align:left;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td style="border:1px solid #e5e7eb; padding:8px;">${item.producto_nombre || ""}</td>
              <td style="border:1px solid #e5e7eb; padding:8px;">${Number(item.cantidad || 0)}</td>
              <td style="border:1px solid #e5e7eb; padding:8px;">$${Number(item.precio || 0).toFixed(2)}</td>
              <td style="border:1px solid #e5e7eb; padding:8px;">$${(Number(item.precio || 0) * Number(item.cantidad || 0)).toFixed(2)}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr><td colspan="3" style="border:1px solid #e5e7eb; padding:8px;"><strong>Subtotal</strong></td><td style="border:1px solid #e5e7eb; padding:8px;">$${Number(pago.subtotal || 0).toFixed(2)}</td></tr>
          <tr><td colspan="3" style="border:1px solid #e5e7eb; padding:8px;"><strong>Descuento</strong></td><td style="border:1px solid #e5e7eb; padding:8px;">-$${Number(pago.descuento_total || 0).toFixed(2)}</td></tr>
          <tr><td colspan="3" style="border:1px solid #e5e7eb; padding:8px;"><strong>Impuestos</strong></td><td style="border:1px solid #e5e7eb; padding:8px;">$${Number(pago.impuesto_total || 0).toFixed(2)}</td></tr>
          <tr><td colspan="3" style="border:1px solid #e5e7eb; padding:8px;"><strong>Donación</strong></td><td style="border:1px solid #e5e7eb; padding:8px;">$${Number(pago.donacion_total || 0).toFixed(2)}</td></tr>
          <tr><td colspan="3" style="border:1px solid #e5e7eb; padding:8px;"><strong>Total</strong></td><td style="border:1px solid #e5e7eb; padding:8px;"><strong>$${Number(pago.monto || 0).toFixed(2)}</strong></td></tr>
        </tfoot>
      </table>

      <div style="margin-top: 18px;">
        <h3 style="margin-bottom: 8px; font-size: 16px;">Datos fiscales</h3>
        <p style="margin: 4px 0;"><strong>Nombre/Razón social:</strong> ${fiscal.nombre_razon_social || ""}</p>
        <p style="margin: 4px 0;"><strong>RFC:</strong> ${fiscal.rfc || ""}</p>
        <p style="margin: 4px 0;"><strong>Dirección:</strong> ${fiscal.direccion || ""}</p>
        <p style="margin: 4px 0;"><strong>CP:</strong> ${fiscal.codigo_postal || ""}</p>
        <p style="margin: 4px 0;"><strong>Correo:</strong> ${fiscal.correo || ""}</p>
      </div>
    </div>
  `;
}

function getPaymentById(db, pagoId) {
  const pago = db.prepare(`
    SELECT
      p.*,
      o.id AS orden_id,
      o.folio,
      o.estado AS pedido_estado,
      o.estado_logistico,
      o.fecha_estado_logistico,
      o.guia_envio,
      o.fecha AS pedido_fecha,
      o.total AS pedido_total,
      o.cliente_id,
      c.nombre AS cliente_nombre,
      c.correo AS cliente_correo
    FROM pagos p
    JOIN ordenes o ON o.id = p.pedido_id
    JOIN clientes c ON c.id = o.cliente_id
    WHERE p.id = ?
  `).get(pagoId);

  if (!pago) return null;

  const items = db.prepare(`
    SELECT
      oi.*,
      pr.nombre AS producto_nombre
    FROM ordenes_items oi
    JOIN productos pr ON pr.id = oi.producto_id
    WHERE oi.orden_id = ?
    ORDER BY oi.id ASC
  `).all(pago.pedido_id);

  return {
    pago: {
      ...pago,
      monto: Number(pago.monto || 0),
      subtotal: Number(pago.subtotal || 0),
      descuento_total: Number(pago.descuento_total || 0),
      impuesto_total: Number(pago.impuesto_total || 0),
      donacion_total: Number(pago.donacion_total || 0),
      detalle_fiscal: parseJsonSafe(pago.detalle_fiscal, null),
      factura_estado: normalizeFacturaEstado(pago.factura_estado),
      factura_disponible: normalizeFacturaEstado(pago.factura_estado) !== "no_solicitada"
    },
    items: items.map(item => ({
      ...item,
      cantidad: Number(item.cantidad || 0),
      precio_lista: Number(item.precio_lista || 0),
      descuento_unitario: Number(item.descuento_unitario || 0),
      precio: Number(item.precio || 0)
    }))
  };
}

function assertPayloadOwnership(payload, user, db) {
  if (!payload) return { ok: false, status: 404, error: "Pago no encontrado" };
  if (user.rol === "admin") return { ok: true };

  const cliente = ensureClienteForUser(db, user);
  if (Number(payload.pago.cliente_id) !== Number(cliente.id)) {
    return { ok: false, status: 403, error: "No puedes consultar este pago" };
  }

  return { ok: true };
}

function buildApprovedPaymentResponse(db, pagoId) {
  const payload = getPaymentById(db, pagoId);
  return {
    ok: true,
    folio: payload?.pago?.folio || "",
    referencia: payload?.pago?.referencia || "",
    ...payload
  };
}

function completeApprovedPayment({
  db,
  user,
  cliente,
  summary,
  metodoPago,
  referencia,
  fecha = nowIso(),
  fiscalPayload = null,
  donation = 0,
  paypalMeta = null
}) {
  const subtotal = Number(summary.resumen.subtotal || 0);
  const descuentoTotal = Number(summary.resumen.descuento_total || 0);
  const impuestoTotal = Number(summary.resumen.impuesto_total || 0);
  const total = Number((summary.resumen.total + donation).toFixed(2));
  const facturaEstado = fiscalPayload ? "generada" : "no_solicitada";
  const facturaFolio = fiscalPayload ? generarFolioFactura() : "";

  const tx = db.transaction(() => {
    if (paypalMeta?.captureId) {
      const existingByCapture = db.prepare(`
        SELECT id
        FROM pagos
        WHERE paypal_capture_id = ?
      `).get(paypalMeta.captureId);

      if (existingByCapture) {
        return { paymentId: Number(existingByCapture.id), reused: true };
      }
    }

    if (paypalMeta?.orderId) {
      const existingByOrder = db.prepare(`
        SELECT id
        FROM pagos
        WHERE paypal_order_id = ?
      `).get(paypalMeta.orderId);

      if (existingByOrder) {
        return { paymentId: Number(existingByOrder.id), reused: true };
      }
    }

    for (const item of summary.items) {
      const producto = db.prepare("SELECT * FROM productos WHERE id = ?").get(item.producto_id);
      if (!producto) {
        throw new Error(`Producto no encontrado: ${item.producto_id}`);
      }
      if (getStock(producto) < Number(item.cantidad || 0)) {
        throw new Error(`Stock insuficiente para ${producto.nombre}`);
      }
    }

    const folio = generarFolio();

    const ordenResult = db.prepare(`
      INSERT INTO ordenes
        (cliente_id, fecha, estado, estado_logistico, fecha_estado_logistico, folio, subtotal, descuento_total, impuesto_total, donacion_total, total, canal, usuario_id)
      VALUES (?, ?, 'procesada', 'en_almacen', ?, ?, ?, ?, ?, ?, ?, 'ecommerce', ?)
    `).run(
      cliente.id,
      fecha,
      fecha,
      folio,
      subtotal,
      descuentoTotal,
      impuestoTotal,
      donation,
      total,
      user.id
    );

    const ordenId = Number(ordenResult.lastInsertRowid);

    for (const item of summary.items) {
      db.prepare(`
        INSERT INTO ordenes_items
          (orden_id, producto_id, cantidad, precio_lista, descuento_unitario, precio)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        ordenId,
        item.producto_id,
        Number(item.cantidad || 0),
        Number(item.precio_lista || 0),
        Number(item.descuento_unitario || 0),
        Number(item.precio_final || 0)
      );

      const producto = db.prepare("SELECT * FROM productos WHERE id = ?").get(item.producto_id);
      const nuevoStock = getStock(producto) - Number(item.cantidad || 0);

      db.prepare(`
        UPDATE productos
        SET stock_actual = ?, stock = ?
        WHERE id = ?
      `).run(nuevoStock, nuevoStock, item.producto_id);

      db.prepare(`
        INSERT INTO movimientos_inventario
          (producto_id, tipo, cantidad, motivo, referencia, fecha, usuario_id)
        VALUES (?, 'salida', ?, 'venta', ?, ?, ?)
      `).run(
        item.producto_id,
        Number(item.cantidad || 0),
        `ecommerce:${folio}`,
        fecha,
        user.id
      );
    }

    const pagoResult = db.prepare(`
      INSERT INTO pagos
        (
          pedido_id, monto, subtotal, descuento_total, impuesto_total, donacion_total,
          metodo_pago, estado, referencia, fecha, detalle_fiscal, factura_estado,
          factura_folio, factura_fecha_envio, paypal_order_id, paypal_capture_id,
          paypal_status, paypal_payer_email, paypal_payer_id
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'aprobado', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
    `).run(
      ordenId,
      total,
      subtotal,
      descuentoTotal,
      impuestoTotal,
      donation,
      metodoPago,
      referencia,
      fecha,
      fiscalPayload ? JSON.stringify(fiscalPayload) : "",
      facturaEstado,
      facturaFolio,
      String(paypalMeta?.orderId || "").trim(),
      String(paypalMeta?.captureId || "").trim(),
      String(paypalMeta?.status || "").trim(),
      String(paypalMeta?.payerEmail || "").trim(),
      String(paypalMeta?.payerId || "").trim()
    );

    const carrito = summary.carrito;
    db.prepare(`
      UPDATE carritos
      SET estado = 'pagado', fecha_actualizacion = ?
      WHERE id = ?
    `).run(fecha, carrito.id);

    db.prepare(`
      UPDATE clientes
      SET etapa_crm = 'Activo', estado = 'activo'
      WHERE id = ?
    `).run(cliente.id);

    db.prepare(`
      INSERT INTO interacciones (cliente_id, tipo, descripcion, fecha, usuario_id)
      VALUES (?, 'compra', ?, ?, ?)
    `).run(
      cliente.id,
      `Compra registrada ${folio} por $${total.toFixed(2)}`,
      fecha,
      user.id
    );

    return { paymentId: Number(pagoResult.lastInsertRowid), reused: false };
  });

  const result = tx();
  return buildApprovedPaymentResponse(db, result.paymentId);
}

router.get("/paypal/config", auth, requireRole("usuario"), (req, res) => {
  res.json(getPublicPayPalConfig());
});

router.post("/paypal/create-order", auth, requireRole("usuario"), async (req, res) => {
  if (!isPayPalConfigured()) {
    return res.status(503).json({ error: "PayPal Sandbox no está configurado en el servidor" });
  }

  const db = getDB();

  let cliente;
  let summary;
  let donation;

  try {
    normalizeFiscalPayload(req.body?.requiere_factura, req.body?.datos_fiscales);
    donation = normalizeDonationTotal(req.body?.donacion_total);
    cliente = ensureClienteForUser(db, req.user);
    summary = summarizeCartForCliente(db, cliente.id);

    if (!summary.items.length) {
      throw new Error("Tu carrito está vacío");
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    const total = Number((summary.resumen.total + donation).toFixed(2));
    const order = await createPayPalOrder({
      amount: total,
      description: `Compra Thrift Cálido Bazar (${Number(summary.resumen.items_count || 0)} artículo(s))`,
      customId: `cliente:${cliente.id}`
    });

    res.status(201).json({
      id: order.id,
      status: order.status,
      amount: total,
      currency: PAYPAL_CURRENCY
    });
  } catch (e) {
    res.status(502).json({ error: "No se pudo crear la orden PayPal", detail: e.message });
  }
});

router.post("/paypal/capture-order", auth, requireRole("usuario"), async (req, res) => {
  if (!isPayPalConfigured()) {
    return res.status(503).json({ error: "PayPal Sandbox no está configurado en el servidor" });
  }

  const paypalOrderId = String(req.body?.paypal_order_id || "").trim();
  if (!paypalOrderId) {
    return res.status(400).json({ error: "Falta el identificador de la orden PayPal" });
  }

  const db = getDB();
  const existingPayment = db.prepare(`
    SELECT id
    FROM pagos
    WHERE paypal_order_id = ?
    LIMIT 1
  `).get(paypalOrderId);

  if (existingPayment) {
    return res.json(buildApprovedPaymentResponse(db, Number(existingPayment.id)));
  }

  let cliente;
  let summary;
  let donation;
  let fiscalPayload;

  try {
    fiscalPayload = normalizeFiscalPayload(req.body?.requiere_factura, req.body?.datos_fiscales);
    donation = normalizeDonationTotal(req.body?.donacion_total);
    cliente = ensureClienteForUser(db, req.user);
    summary = summarizeCartForCliente(db, cliente.id);

    if (!summary.items.length) {
      throw new Error("Tu carrito está vacío");
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let capturePayload;
  try {
    capturePayload = await capturePayPalOrder(paypalOrderId);
  } catch (e) {
    return res.status(502).json({ error: "No se pudo capturar el pago PayPal", detail: e.message });
  }

  const purchaseUnit = capturePayload?.purchase_units?.[0] || {};
  const captures = Array.isArray(purchaseUnit?.payments?.captures) ? purchaseUnit.payments.captures : [];
  const captureInfo = captures.find(item => String(item?.status || "").toUpperCase() === "COMPLETED") || captures[0] || null;
  const captureStatus = String(captureInfo?.status || capturePayload?.status || "").toUpperCase();

  if (captureStatus !== "COMPLETED") {
    return res.status(402).json({
      error: `PayPal no confirmó el pago. Estado recibido: ${captureStatus || "desconocido"}`
    });
  }

  const capturedAmount = Number(captureInfo?.amount?.value || purchaseUnit?.amount?.value || 0);
  const capturedCurrency = String(
    captureInfo?.amount?.currency_code ||
    purchaseUnit?.amount?.currency_code ||
    PAYPAL_CURRENCY
  ).toUpperCase();
  const expectedTotal = Number((summary.resumen.total + donation).toFixed(2));

  if (capturedCurrency !== PAYPAL_CURRENCY) {
    return res.status(409).json({
      error: `La moneda recibida de PayPal (${capturedCurrency}) no coincide con ${PAYPAL_CURRENCY}`
    });
  }

  if (Math.abs(capturedAmount - expectedTotal) > 0.01) {
    return res.status(409).json({
      error: `El monto capturado en PayPal (${capturedAmount.toFixed(2)}) no coincide con el total actual del carrito (${expectedTotal.toFixed(2)})`
    });
  }

  try {
    const payload = completeApprovedPayment({
      db,
      user: req.user,
      cliente,
      summary,
      metodoPago: "PayPal Sandbox",
      referencia: String(captureInfo?.id || paypalOrderId).trim(),
      fiscalPayload,
      donation,
      paypalMeta: {
        orderId: paypalOrderId,
        captureId: String(captureInfo?.id || "").trim(),
        status: captureStatus,
        payerEmail: String(capturePayload?.payer?.email_address || "").trim(),
        payerId: String(capturePayload?.payer?.payer_id || "").trim()
      }
    });

    res.status(201).json(payload);
  } catch (e) {
    res.status(500).json({ error: "No se pudo registrar la compra después del pago PayPal", detail: e.message });
  }
});

router.post("/procesar", auth, requireRole("usuario"), (req, res) => {
  const {
    metodo_pago,
    requiere_factura = false,
    datos_fiscales = null,
    donacion_total = 0,
    escenario = "normal"
  } = req.body || {};

  if (!METODOS_VALIDOS.has(String(metodo_pago || ""))) {
    return res.status(400).json({ error: "Método de pago inválido" });
  }

  const escenarioValue = String(escenario || "normal");
  if (escenarioValue !== "normal") {
    const scenarioMessages = {
      duplicado: { code: 409, message: "Pago rechazado: posible duplicado de tarjeta." },
      fondos: { code: 402, message: "Pago rechazado: fondos insuficientes." },
      doble: { code: 409, message: "Transacción detenida por posible pago doble." },
      conexion: { code: 503, message: "Fallo de conexión con el procesador de pagos." }
    };

    const simulated = scenarioMessages[escenarioValue];
    if (simulated) {
      return res.status(simulated.code).json({
        error: simulated.message,
        estado: "rechazado",
        escenario: escenarioValue
      });
    }
  }

  const db = getDB();
  let cliente;
  let summary;
  let donation;
  let fiscalPayload;

  try {
    fiscalPayload = normalizeFiscalPayload(requiere_factura, datos_fiscales);
    donation = normalizeDonationTotal(donacion_total);
    cliente = ensureClienteForUser(db, req.user);
    summary = summarizeCartForCliente(db, cliente.id);

    if (!summary.items.length) {
      throw new Error("Tu carrito está vacío");
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const referencia = generarReferenciaPago(metodo_pago);

  try {
    const payload = completeApprovedPayment({
      db,
      user: req.user,
      cliente,
      summary,
      metodoPago: metodo_pago,
      referencia,
      fiscalPayload,
      donation
    });

    res.status(201).json(payload);
  } catch (e) {
    res.status(500).json({ error: "No se pudo procesar el pago", detail: e.message });
  }
});

router.get("/facturas/mias", auth, requireRole("usuario"), (req, res) => {
  const db = getDB();
  const cliente = ensureClienteForUser(db, req.user);

  const rows = db.prepare(`
    SELECT
      p.id AS pago_id,
      p.fecha,
      p.monto,
      p.estado AS pago_estado,
      p.metodo_pago,
      p.referencia,
      p.detalle_fiscal,
      p.factura_estado,
      p.factura_folio,
      p.factura_fecha_envio,
      o.id AS orden_id,
      o.folio,
      o.estado AS pedido_estado,
      o.estado_logistico,
      o.fecha_estado_logistico,
      o.guia_envio,
      o.total AS pedido_total
    FROM pagos p
    JOIN ordenes o ON o.id = p.pedido_id
    WHERE o.cliente_id = ?
      AND lower(p.factura_estado) <> 'no_solicitada'
    ORDER BY p.fecha DESC, p.id DESC
  `).all(cliente.id);

  res.json(rows.map(row => ({
    ...row,
    monto: Number(row.monto || 0),
    pedido_total: Number(row.pedido_total || 0),
    detalle_fiscal: parseJsonSafe(row.detalle_fiscal, null),
    factura_estado: normalizeFacturaEstado(row.factura_estado)
  })));
});

router.get("/facturas/:id", auth, requireRole("usuario", "admin"), (req, res) => {
  const db = getDB();
  const payload = getPaymentById(db, req.params.id);
  const access = assertPayloadOwnership(payload, req.user, db);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  if (!payload.pago.factura_disponible) {
    return res.status(404).json({ error: "Este pago no tiene factura solicitada" });
  }

  res.json(payload);
});

router.post("/facturas/:id/enviar-correo", auth, requireRole("usuario", "admin"), async (req, res) => {
  const db = getDB();
  const payload = getPaymentById(db, req.params.id);
  const access = assertPayloadOwnership(payload, req.user, db);
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  if (!payload.pago.factura_disponible) {
    return res.status(404).json({ error: "Este pago no tiene factura solicitada" });
  }

  const correoDestino = String(
    req.body?.correo ||
    payload.pago?.detalle_fiscal?.correo ||
    payload.pago?.cliente_correo ||
    ""
  ).trim();

  if (!correoDestino) {
    return res.status(400).json({ error: "No hay correo disponible para enviar la factura" });
  }

  try {
    const result = await enviarFacturaDemo({
      to: correoDestino,
      facturaFolio: payload.pago.factura_folio,
      clienteNombre: payload.pago.cliente_nombre,
      html: buildFacturaHtml(payload)
    });

    if (result?.skipped && result.reason === "invalid_email") {
      return res.status(400).json({ error: "El correo fiscal no es válido" });
    }

    if (result?.sent) {
      db.prepare(`
        UPDATE pagos
        SET factura_estado = 'enviada', factura_fecha_envio = ?
        WHERE id = ?
      `).run(nowIso(), req.params.id);
    }

    res.json({
      ok: true,
      sent: Boolean(result?.sent),
      simulated: Boolean(result?.skipped),
      reason: result?.reason || null
    });
  } catch (e) {
    res.status(500).json({ error: "No se pudo enviar la factura por correo", detail: e.message });
  }
});

router.get("/:id", auth, requireRole("usuario", "admin"), (req, res) => {
  const db = getDB();
  const payload = getPaymentById(db, req.params.id);
  const access = assertPayloadOwnership(payload, req.user, db);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  res.json(payload);
});

module.exports = router;
