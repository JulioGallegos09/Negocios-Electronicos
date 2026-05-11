// src/js/api.js
function normalizeBase(url) {
  return String(url || "").replace(/\/+$/, "");
}

function resolveApiBase() {
  const metaBase = document.querySelector('meta[name="api-base"]')?.content;
  const storageBase = localStorage.getItem("api_base");
  const configuredBase = normalizeBase(metaBase || storageBase);

  if (configuredBase) return configuredBase;

  const { protocol, hostname } = window.location;
  if (!hostname || protocol === "file:") {
    return "http://localhost:3001/api";
  }

  return `${protocol}//${hostname}:3001/api`;
}

const API_BASE = resolveApiBase();
const API_ORIGIN = API_BASE.replace(/\/api$/, "");

window.API_BASE = API_BASE;
window.API_ORIGIN = API_ORIGIN;

function apiUrl(path = "") {
  if (!path) return API_BASE;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function assetUrl(path = "") {
  if (!path) return API_ORIGIN;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

window.apiUrl = apiUrl;
window.assetUrl = assetUrl;

function getToken() {
  return localStorage.getItem("token") || "";
}

function setSession({ token, user }) {
  localStorage.setItem("token", token);
  localStorage.setItem("rol", user.rol);
  localStorage.setItem("user_email", user.email);
  localStorage.setItem("user_nombre", user.nombre);
  localStorage.setItem("user_id", user.id);
}

function clearSession() {
  const token = getToken();
  if (token && typeof fetch === "function") {
    fetch(apiUrl("/auth/logout"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      keepalive: true
    }).catch(() => {});
  }

  localStorage.removeItem("token");
  localStorage.removeItem("rol");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_nombre");
  localStorage.removeItem("user_id");
}

async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  const token = getToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  const finalHeaders = {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  if (!isFormData && options.body != null && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(apiUrl(path), {
      ...options,
      headers: finalHeaders
    });
  } catch (err) {
    const isNetworkError = /failed to fetch|networkerror|load failed/i.test(err?.message || "");
    const msg = isNetworkError
      ? `No se pudo conectar con el backend en ${API_BASE}. Verifica que el servidor esté activo en el puerto 3001.`
      : (err?.message || "Error de red");

    throw new Error(msg);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    const msg = data?.error || data?.message || "Error en API";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  return data;
}
