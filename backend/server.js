require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
// ─── Razorpay Webhook ──────────────
app.use("/api/webhook/razorpay", require("./routes/razorpay").webhookRouter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/dentist", require("./routes/dentist"));
// app.use("/api/dentist", require("./routes/dentist-communication")); // Dentist-to-agent communication
app.use("/api/patient", require("./routes/patient"));
app.use("/api/appointments", require("./routes/appointments"));
app.use("/api/chat", require("./routes/chat"));
app.use("/api/webhook/whatsapp", require("./routes/whatsapp"));
app.use("/api/payment", require("./routes/razorpay").paymentRouter);
app.use("/api/payments", require("./routes/payments"));
// app.use("/api/calendar", require("./routes/calendar"));
// app.use("/api/voice", require("./routes/voice"));
app.use("/api/admin", require("./routes/admin"));

// ─── Serve embeddable widget ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    app: "BookMyAppointment",
    timestamp: new Date().toISOString(),
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.stack);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║        BookMyAppointment Backend         ║
║        Running on port ${PORT}           ║
╚══════════════════════════════════════════╝`);
});

module.exports = app;
