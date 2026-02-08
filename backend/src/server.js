// backend/src/server.js
"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

// Routers / handlers (keep your existing files)
const chat = require("./routes/chat");

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

// JSON parser for all other routes
app.use(express.json({ limit: "1mb" }));

// Health
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

// API routes (mounted under /api)
app.use("/api/chat", chat);

// ✅ Export the app for Lambda wrapper; only listen when run directly (local dev)
module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 8080;
  app.listen(port, () => console.log(`API listening on :${port}`));
}