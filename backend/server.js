require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { initDB } = require("./src/db/init");

const authRoutes = require("./src/routes/auth.routes");
const clientesRoutes = require("./src/routes/clientes.routes");
const interaccionesRoutes = require("./src/routes/interacciones.routes");
const metricasRoutes = require("./src/routes/metricas.routes");

const app = express();
app.use(cors());
app.use(express.json());

// health
app.get("/", (req, res) => {
  res.json({ ok: true, message: "✅ Backend CRM Thrift Cálido activo" });
});

// routes
app.use("/api/auth", authRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/interacciones", interaccionesRoutes);
app.use("/api/metricas", metricasRoutes);

const PORT = process.env.PORT || 3001;

// init db then listen
initDB().then(() => {
  app.listen(PORT, () => console.log(`✅ API corriendo en http://localhost:${PORT}`));
}).catch((err) => {
  console.error("❌ Error iniciando BD:", err);
});
