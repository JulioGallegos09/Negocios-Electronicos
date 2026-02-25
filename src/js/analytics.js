// src/js/analytics.js
let chart;

function showAlert(type, text) {
  const box = document.getElementById("alertBox");
  if (!box) return;
  box.innerHTML = `<div class="alert alert-${type}">${text}</div>`;
  setTimeout(() => { box.innerHTML = ""; }, 2500);
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-MX");
  } catch {
    return iso;
  }
}

function setKPIs(last) {
  document.getElementById("kpiClientes").textContent = last?.total_clientes ?? 0;
  document.getElementById("kpiActivos").textContent = last?.clientes_activos ?? 0;
  document.getElementById("kpiInactivos").textContent = last?.clientes_inactivos ?? 0;
  document.getElementById("kpiInteracciones").textContent = last?.total_interacciones ?? 0;
}

function renderTable(rows) {
  const tbody = document.getElementById("tbodyMetricas");
  tbody.innerHTML = "";

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${fmtDate(r.fecha)}</td>
      <td>${r.total_clientes}</td>
      <td>${r.clientes_activos}</td>
      <td>${r.clientes_inactivos}</td>
      <td>${r.total_interacciones}</td>
      <td>${r.generado_por ?? "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderChart(rows) {
  const last10 = rows.slice(0, 10).reverse(); // orden cronológico
  const labels = last10.map(r => new Date(r.fecha).toLocaleTimeString("es-MX"));
  const clientes = last10.map(r => r.total_clientes);
  const interacciones = last10.map(r => r.total_interacciones);

  const ctx = document.getElementById("chartMetricas");
  if (!ctx) return;

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Total clientes", data: clientes, tension: 0.3 },
        { label: "Total interacciones", data: interacciones, tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

async function loadHistorico() {
  const rows = await apiFetch("/metricas/historico"); // requiere token
  if (rows.length) setKPIs(rows[0]);
  renderTable(rows);
  renderChart(rows);
}

async function generarSnapshot() {
  await apiFetch("/metricas", { method: "GET" }); // guarda snapshot
  showAlert("success", "✅ Snapshot generado y guardado en la tabla metricas.");
  await loadHistorico();
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadHistorico();
    document.getElementById("btnSnapshot").addEventListener("click", generarSnapshot);
    document.getElementById("btnRefresh").addEventListener("click", loadHistorico);
  } catch (e) {
    console.error(e);
    showAlert("danger", "❌ No se pudieron cargar métricas: " + e.message);
  }
});
