require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { initDB } = require("./src/db/init");

// Rutas
const authRoutes = require("./src/routes/auth.routes");
const clientesRoutes = require("./src/routes/clientes.routes");
const interaccionesRoutes = require("./src/routes/interacciones.routes");
const metricasRoutes = require("./src/routes/metricas.routes");

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ ok: true, message: "✅ Backend CRM Thrift Cálido activo" });
});

// Endpoints
app.use("/api/auth", authRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/interacciones", interaccionesRoutes);
app.use("/api/metricas", metricasRoutes);

// Inicializar BD (better-sqlite3 NO es async)
try {
  initDB();
  console.log("✅ Base de datos inicializada correctamente");
} catch (e) {
  console.error("❌ Error inicializando la BD:", e);
  process.exit(1);
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API corriendo en http://localhost:${PORT}`);
});
