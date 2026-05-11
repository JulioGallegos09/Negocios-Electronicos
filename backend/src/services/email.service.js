const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isEmailConfigured() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

async function enviarAlertaStockBajo({
  to,
  proveedorNombre,
  productoNombre,
  stockActual,
  stockMinimo,
  faltan,
}) {
  if (!isValidEmail(to)) return { skipped: true, reason: "invalid_email" };

  const subject = `⚠️ Stock bajo: ${productoNombre}, se neceita reposición de unidades`;

  const html = `
    <div style="font-family: Arial, sans-serif">
      <h2>Alerta de Stock Bajo</h2>
      <p>Hola <b>${proveedorNombre || "Proveedor"}</b>,</p>
      <p>Se detectó que el siguiente producto está por debajo del stock mínimo:</p>
      <ul>
        <li><b>Producto:</b> ${productoNombre}</li>
        <li><b>Stock actual:</b> ${stockActual}</li>
        <li><b>Stock mínimo:</b> ${stockMinimo}</li>
      </ul>
      <p>Por favor confirmar disponibilidad y tiempo de entrega.</p>
      <hr />
      <small>Mensaje enviado automáticamente por el sistema SCM.</small>
    </div>
  `;

  await transporter.sendMail({
    from: `"Thrift Cálido" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });

  return { sent: true };
}

async function enviarFacturaDemo({
  to,
  facturaFolio,
  clienteNombre,
  html
}) {
  if (!isValidEmail(to)) return { skipped: true, reason: "invalid_email" };
  if (!isEmailConfigured()) return { skipped: true, reason: "email_not_configured" };

  await transporter.sendMail({
    from: `"Thrift Cálido" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Factura demo ${facturaFolio || ""}`.trim(),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <p>Hola ${clienteNombre || "cliente"},</p>
        <p>Te compartimos la factura demo de tu compra en <strong>Thrift Cálido Bazar</strong>.</p>
        ${html}
        <p style="font-size:12px;color:#6b7280;margin-top:24px;">
          Documento de simulación académica. No tiene validez fiscal.
        </p>
      </div>
    `
  });

  return { sent: true };
}

module.exports = {
  enviarAlertaStockBajo,
  enviarFacturaDemo,
  isEmailConfigured,
  isValidEmail
};
