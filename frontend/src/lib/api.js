// src/lib/api.js

export async function getIdToken() {
  const { auth } = await import("../firebase");
  const u = auth.currentUser;
  return u ? await u.getIdToken() : null;
}

// ---------- helpers ----------
function trimSlashes(v) { return (v || "").replace(/\/+$/, ""); }

// ---------- URLs from env ----------
function checkoutLambdaUrl() {
  const url = import.meta.env.VITE_CHECKOUT_LAMBDA_URL;
  if (!url) throw new Error("VITE_CHECKOUT_LAMBDA_URL is not set");
  return trimSlashes(url);
}

function backendUrl() {
  const url = import.meta.env.VITE_BACKEND_URL;
  if (!url) throw new Error("VITE_BACKEND_URL is not set");
  return trimSlashes(url);
}

// ---------- Endpoints ----------
export function chatUrl()        { return `${backendUrl()}/api/chat`; }
function checkoutEndpoint()      { return `${checkoutLambdaUrl()}/api/pay/checkout`; }
function portalEndpoint()        { return `${checkoutLambdaUrl()}/api/pay/portal`; }

// ---------- Stripe ----------
export function stripePublishableKey() {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!key) throw new Error("VITE_STRIPE_PUBLISHABLE_KEY is not set");
  return key.trim();
}
export function stripeEnabled() {
  try { return Boolean(stripePublishableKey()); }
  catch { return false; }
}

// ---------- Checkout ----------
export async function startCheckout(arg, info = {}) {
  let price, quantity = 1, metadata = {};

  if (typeof arg === "string") {
    price = arg;
    if (info?.uid)   metadata.uid   = info.uid;
    if (info?.email) metadata.email = info.email;
  } else if (arg && typeof arg === "object") {
    price    = arg.price;
    quantity = arg.quantity ?? 1;
    metadata = arg.metadata ?? {};
  }

  if (!price || !/^price_/.test(price)) {
    throw new Error("startCheckout expects a Stripe price id (e.g. 'price_...').");
  }

  const endpoint = checkoutEndpoint();
  console.log("Calling Stripe checkout:", endpoint);

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

// ---------- Portal ----------
export async function createPortalSession({ uid, email }) {
  const token = await getIdToken();
  const res = await fetch(portalEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ uid, email })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---------- Cancel ----------
export async function cancelSubscription({ uid }) {
  const token = await getIdToken();
  const res = await fetch(`${backendUrl()}/api/chat/cancel-subscription`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ uid })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export { fetchChatCompletion } from "./aiClient";