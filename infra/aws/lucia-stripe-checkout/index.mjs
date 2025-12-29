// lucia-stripe-checkout/index.mjs
import Stripe from "stripe";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const SECRET_ARN = process.env.LUCIA_STRIPE_SECRET_ARN;
const FALLBACK_ORIGIN = "https://www.luciadecode.com";
const FALLBACK_SUCCESS = "https://www.luciadecode.com/success?session_id={CHECKOUT_SESSION_ID}";
const FALLBACK_CANCEL = "https://www.luciadecode.com/cancel";

let cachedSecret = null;
let cachedStripe = null;
const sm = new SecretsManagerClient({});

function buildCors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || FALLBACK_ORIGIN,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,stripe-signature,x-app-secret",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Type": "application/json; charset=utf-8"
  };
}

async function getSecret() {
  if (cachedSecret) return cachedSecret;
  const resp = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
  const raw = resp.SecretString ?? Buffer.from(resp.SecretBinary || "", "base64").toString("utf8");
  const json = JSON.parse(raw);
  const norm = {};
  for (const [k, v] of Object.entries(json)) norm[k.toUpperCase()] = v;
  const secret = {
    STRIPE_SECRET_KEY: norm.STRIPE_SECRET_KEY || norm.STRIPE_KEY,
    SUCCESS_URL: norm.SUCCESS_URL || FALLBACK_SUCCESS,
    CANCEL_URL: norm.CANCEL_URL || FALLBACK_CANCEL,
    ALLOW_ORIGIN: norm.ALLOW_ORIGIN || FALLBACK_ORIGIN,
    STRIPE_DEFAULT_PRICE_ID: norm.STRIPE_DEFAULT_PRICE_ID || ""
  };
  if (!secret.STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY in secret");
  cachedSecret = secret;
  return secret;
}

async function getStripe() {
  if (cachedStripe) return cachedStripe;
  const s = await getSecret();
  cachedStripe = new Stripe(s.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  return cachedStripe;
}

function safeJson(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function toPositiveInt(n) {
  const x = parseInt(n, 10);
  return Number.isFinite(x) && x > 0 ? x : null;
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || event?.httpMethod || "GET";

  // Handle preflight early (fixes CORS)
  if (method === "OPTIONS") {
    const cors = buildCors(FALLBACK_ORIGIN);
    return { statusCode: 200, headers: cors, body: "" };
  }

  let secret;
  try {
    secret = await getSecret();
  } catch (err) {
    const cors = buildCors(FALLBACK_ORIGIN);
    console.error("secrets_error", err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: "secrets_error", detail: String(err.message || err) }) };
  }

  const CORS = buildCors(secret.ALLOW_ORIGIN);
  if (method !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, error: "method_not_allowed" }) };

  try {
    const stripe = await getStripe();
    const body = safeJson(event.body);
    const priceId = (body?.price || secret.STRIPE_DEFAULT_PRICE_ID || "").trim();
    const quantity = toPositiveInt(body?.quantity) || 1;
    const metadata = (typeof body?.metadata === "object" && body.metadata) || {};

    if (!priceId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: "missing_price" }) };
    }

    // Determine subscription vs one-time
    const price = await stripe.prices.retrieve(priceId);
    const isRecurring = !!price?.recurring?.interval;

    const session = await stripe.checkout.sessions.create({
      mode: isRecurring ? "subscription" : "payment",
      line_items: [{ price: priceId, quantity }],
      allow_promotion_codes: true,
      success_url: secret.SUCCESS_URL,
      cancel_url: secret.CANCEL_URL,
      metadata
    });

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, url: session.url }) };
  } catch (err) {
    console.error("stripe_error", err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: "stripe_error", detail: err?.message }) };
  }
};
