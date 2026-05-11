(function () {
  function money(value) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN"
    }).format(Number(value || 0));
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    if (!value) return "Sin fecha";
    try {
      return new Date(value).toLocaleString("es-MX");
    } catch {
      return value;
    }
  }

  function setCartBadges(count) {
    document.querySelectorAll("[data-cart-count]").forEach(node => {
      node.textContent = String(count || 0);
      node.classList.toggle("d-none", !Number(count));
    });
  }

  async function refreshCartBadge() {
    const token = localStorage.getItem("token");
    const rol = localStorage.getItem("rol");

    if (!token || rol !== "usuario" || typeof apiFetch !== "function") {
      setCartBadges(0);
      return 0;
    }

    try {
      const payload = await apiFetch("/carrito/mio", { method: "GET" });
      const count = Number(payload?.resumen?.items_count || 0);
      setCartBadges(count);
      return count;
    } catch (_) {
      return 0;
    }
  }

  function buildBadge(text, className = "bg-secondary") {
    return `<span class="badge ${className}">${escapeHtml(text)}</span>`;
  }

  window.ecommerceUtils = {
    buildBadge,
    escapeHtml,
    formatDate,
    money,
    refreshCartBadge,
    setCartBadges
  };

  document.addEventListener("DOMContentLoaded", () => {
    refreshCartBadge();
  });
})();
