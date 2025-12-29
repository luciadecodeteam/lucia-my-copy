// src/lib/api.js — Frontend-only CORS bypass: send text/plain to avoid preflight
// Calls: https://lt2masjrrscsh556e35szjp4u40yaifr.lambda-url.eu-west-1.on.aws/api/pay/checkout

export async function getIdToken() {
  const { auth } = await import("../firebase");
  const u = auth.currentUser;
  return u ? await u.getIdToken() : null;
}

const LIVE_STRIPE_PUBLISHABLE_KEY =
  "pk_live_51S1C5h2NCNcgXLO1oeZdRA6lXH6NHLi5wBDVVSoGwPCLxweZ2Xp8dZTee2QgrzPwwXwhalZAcY1xUeKNmKUxb5gq00tf0go3ih";

// ---------- helpers ----------
function trimTrailingSlashes(v) { return (v || "").replace(/\/+$/, ""); }
function normalizePath(pathname) { return pathname ? pathname.replace(/\/+$/, "") : ""; }

// ---------- CHAT URL (unchanged) ----------
function ensureChatUrl(base, { preferPlainChat } = {}) {
  const normalized = trimTrailingSlashes(base);
  if (!normalized) return preferPlainChat ? "/chat" : "/api/chat";
  if (normalized.endsWith("/api/chat") || normalized.endsWith("/chat")) return normalized;
  if (normalized.endsWith("/api")) return `${normalized}/chat`;
  return `${normalized}${preferPlainChat ? "/chat" : "/api/chat"}`;
}
export function chatUrl() {
  const override = trimTrailingSlashes(import.meta.env.VITE_CHAT_URL || "");
  if (override) return override;
  const workerBase = trimTrailingSlashes(import.meta.env.VITE_WORKER_API_URL || "");
  const functionsBase = trimTrailingSlashes(import.meta.env.VITE_FUNCTIONS_URL || "");
  const base = workerBase || functionsBase || "";
  if (!base) return "/api/chat";
  const preferPlainChat = Boolean(workerBase && workerBase !== functionsBase);
  try {
    const url = new URL(base);
    const path = normalizePath(url.pathname);
    const root = path ? `${url.origin}${path}` : url.origin;
    return ensureChatUrl(root, { preferPlainChat });
  } catch {
    return ensureChatUrl(base, { preferPlainChat });
  }
}

// ---------- PAYMENTS (hard-pinned) ----------
const CHECKOUT_FUNCTION_URL = "https://lt2masjrrscsh556e35szjp4u40yaifr.lambda-url.eu-west-1.on.aws";

export function apiBaseUrl() {
  return CHECKOUT_FUNCTION_URL;
}
function checkoutEndpoint() { return `${trimTrailingSlashes(apiBaseUrl())}/api/pay/checkout`; }
function portalEndpoint()   { return `${trimTrailingSlashes(apiBaseUrl())}/api/pay/portal`; }

// ---------- Stripe helpers ----------
export function stripePublishableKey() {
  return (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || LIVE_STRIPE_PUBLISHABLE_KEY).trim();
}
export function stripeEnabled() { return Boolean(stripePublishableKey()); }

/**
 * Create Stripe Checkout session (no-preflight; text/plain)
 */
export async function startCheckout(arg, info = {}) {
  let price, quantity = 1, metadata = {};
  if (typeof arg === "string") {
    price = arg;
    if (info?.uid) metadata.uid = info.uid;
    if (info?.email) metadata.email = info.email;
  } else if (arg && typeof arg === "object") {
    price = arg.price;
    quantity = arg.quantity ?? 1;
    metadata = arg.metadata ?? {};
  }
  if (!price || !/^price_/.test(price)) {
    throw new Error("startCheckout expects a Stripe price id (e.g. 'price_...').");
  }

  const endpoint = checkoutEndpoint();
  console.log("Calling Stripe checkout:", endpoint);

  // CRUCIAL: text/plain makes the request "simple" → browser skips preflight
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ price, quantity, metadata })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Checkout failed (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  if (!data?.url) throw new Error("Checkout failed: missing redirect URL");
  window.location.href = data.url;
  return data.url;
}

export async function createPortalSession({ uid, email }) {
  const token = await getIdToken();
  const res = await fetch(portalEndpoint(), {
    method: "POST",
    headers: {
      // portal can stay JSON; if it also trips CORS, switch to text/plain here too
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ uid, email })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export { fetchChatCompletion } from "./aiClient";
