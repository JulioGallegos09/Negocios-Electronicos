// src/js/api.js
const API_BASE = "http://localhost:3001/api";

function getToken() {
  return localStorage.getItem("token");
}

function setSession({ token, user }) {
  localStorage.setItem("token", token);
  localStorage.setItem("rol", user.rol);
  localStorage.setItem("user_email", user.email);
  localStorage.setItem("user_nombre", user.nombre);
  localStorage.setItem("user_id", user.id);
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("rol");
  localStorage.removeItem("user_email");
  localStorage.removeItem("user_nombre");
  localStorage.removeItem("user_id");
}

async function apiFetch(path, options = {}) {
  const headers = options.headers || {};
  const token = getToken();

  const finalHeaders = {
    "Content-Type": "application/json",
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: finalHeaders
  });

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
