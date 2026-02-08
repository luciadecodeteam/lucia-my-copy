// backend/src/server.js
"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

// Routers / handlers (keep your existing files)

const chat = require("./routes/chat");
const files = require("./routes/files");
const { router: stripeRouter, payRouter, webhookHandler } = require("./routes/payments");

const app = express();

// If running behind a proxy (API Gateway/ALB), keep this on
app.set("trust proxy", true);

app.options('/api/*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.status(200).end();
});

// ----------------- CORS CONFIG -----------------
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// -----------------------------------------------

app.use(helmet());

// IMPORTANT: Stripe webhook must read raw body BEFORE JSON parser
app.post("/stripe/webhook", express.raw({ type: "application/json" }), webhookHandler);

// JSON parser for all other routes
app.use(express.json({ limit: "1mb" }));

// Health
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

// API routes (mounted under /api)

app.use("/api/chat", chat);
app.use("/api/files", files);

// Payments API (e.g., POST /api/pay/checkout)
/**
 * Mirror allowed Origin for responses under /api/pay/* to ensure browser sees
 * Access-Control-Allow-* even when API Gateway proxies through.
 */
const attachCorsMirror = (req, res, next) => {
  const o = req.headers.origin;
  if (o && isAllowed(o)) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, stripe-signature, authorization, Authorization"
    );
    // If you use credentials (cookies/Authorization that requires it), also set:
    // res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  next();
};

// Handle preflight explicitly for /api/pay/*
app.options("/api/pay/*", (req, res) => {
  const o = req.headers.origin;
  if (o && isAllowed(o)) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, stripe-signature, authorization, Authorization"
    );
    // res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  return res.sendStatus(204);
});

// Mount payments routers with the per-request header mirror
app.use("/api/pay", attachCorsMirror, payRouter);

// Optional extra Stripe app routes (non-webhook)
app.use("/stripe", attachCorsMirror, stripeRouter);

// ✅ Export the app for Lambda wrapper; only listen when run directly (local dev)
module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 8080;
  app.listen(port, () => console.log(`API listening on :${port}`));
}
