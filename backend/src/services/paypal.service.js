const PAYPAL_ENVIRONMENT = String(process.env.PAYPAL_ENV || "sandbox").trim().toLowerCase() === "live"
  ? "live"
  : "sandbox";
const PAYPAL_API_BASE = PAYPAL_ENVIRONMENT === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";
const PAYPAL_CURRENCY = String(process.env.PAYPAL_CURRENCY || "MXN").trim().toUpperCase();

let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;

function isPayPalConfigured() {
  return Boolean(
    String(process.env.PAYPAL_CLIENT_ID || "").trim() &&
    String(process.env.PAYPAL_CLIENT_SECRET || "").trim()
  );
}

function getPublicPayPalConfig() {
  return {
    enabled: isPayPalConfigured(),
    clientId: String(process.env.PAYPAL_CLIENT_ID || "").trim(),
    currency: PAYPAL_CURRENCY,
    environment: PAYPAL_ENVIRONMENT
  };
}

function readErrorMessage(payload, fallback) {
  const details = Array.isArray(payload?.details) ? payload.details : [];
  const detailText = details
    .map(item => item?.description || item?.issue || "")
    .filter(Boolean)
    .join(" · ");

  return detailText || payload?.message || payload?.error_description || fallback;
}

async function getPayPalAccessToken(forceRefresh = false) {
  if (!isPayPalConfigured()) {
    throw new Error("PayPal Sandbox no está configurado en el servidor");
  }

  if (!forceRefresh && cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt) {
    return cachedAccessToken;
  }

  const auth = Buffer
    .from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`)
    .toString("base64");

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readErrorMessage(payload, "No se pudo autenticar con PayPal"));
  }

  cachedAccessToken = String(payload.access_token || "");
  const expiresIn = Number(payload.expires_in || 0);
  cachedAccessTokenExpiresAt = Date.now() + Math.max(0, expiresIn - 60) * 1000;
  return cachedAccessToken;
}

async function paypalApiFetch(path, { method = "GET", body = null, forceRefresh = false } = {}) {
  const token = await getPayPalAccessToken(forceRefresh);

  const response = await fetch(`${PAYPAL_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401 && !forceRefresh) {
    return paypalApiFetch(path, { method, body, forceRefresh: true });
  }

  if (!response.ok) {
    throw new Error(readErrorMessage(payload, "Error al comunicarse con PayPal"));
  }

  return payload;
}

function withDefinedValues(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

async function createPayPalOrder({ amount, description = "", customId = "" }) {
  const total = Number(amount || 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("El monto de PayPal es inválido");
  }

  return paypalApiFetch("/v2/checkout/orders", {
    method: "POST",
    body: {
      intent: "CAPTURE",
      purchase_units: [
        withDefinedValues({
          amount: {
            currency_code: PAYPAL_CURRENCY,
            value: total.toFixed(2)
          },
          description: String(description || "").trim().slice(0, 127),
          custom_id: String(customId || "").trim().slice(0, 127)
        })
      ],
      payment_source: {
        paypal: {
          experience_context: {
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW"
          }
        }
      }
    }
  });
}

async function capturePayPalOrder(orderId) {
  const normalizedOrderId = String(orderId || "").trim();
  if (!normalizedOrderId) {
    throw new Error("El identificador de la orden PayPal es obligatorio");
  }

  return paypalApiFetch(`/v2/checkout/orders/${normalizedOrderId}/capture`, {
    method: "POST"
  });
}

module.exports = {
  PAYPAL_CURRENCY,
  capturePayPalOrder,
  createPayPalOrder,
  getPublicPayPalConfig,
  isPayPalConfigured
};
