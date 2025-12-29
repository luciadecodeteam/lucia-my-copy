// lucia-stripe-webhook/index.mjs
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const SECRET_ARN = process.env.LUCIA_STRIPE_SECRET_ARN;
const FALLBACK_ORIGIN = "https://www.luciadecode.com";

const sm = new SecretsManagerClient({});
let cachedSecret = null;

async function loadStripeLib() {
  if (loadStripeLib._cache) return loadStripeLib._cache;

  const importWithInterop = async (specifier) => {
    const mod = await import(specifier);
    return mod?.default || mod;
  };

  try {
    const lib = await importWithInterop("./backend/src/lib/stripe.js");
    loadStripeLib._cache = lib;
    return lib;
  } catch (e1) {
    try {
      const lib = await importWithInterop("/opt/backend/src/lib/stripe.js");
      loadStripeLib._cache = lib;
      return lib;
    } catch (e2) {
      const err = new Error("stripe_lib_not_found");
      err.cause = { bundle: String(e1?.message || e1), layer: String(e2?.message || e2) };
      throw err;
    }
  }
}

async function getSecret() {
  if (cachedSecret) return cachedSecret;

  const resp = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
  const raw = resp.SecretString ?? Buffer.from(resp.SecretBinary || "", "base64").toString("utf8");
  const json = JSON.parse(raw);

  const norm = {};
  for (const [k, v] of Object.entries(json)) {
    norm[k.toUpperCase()] = v;
  }

  const STRIPE_SECRET_KEY = norm.STRIPE_SECRET_KEY || norm.STRIPE_KEY || norm.SECRETKEY || "";
  const STRIPE_WEBHOOK_SECRET =
    norm.STRIPE_WEBHOOK_SECRET || norm.WEBHOOK_SECRET || norm.WEBHOOKSECRET || "";

  let FIREBASE_PROJECT_ID = norm.FIREBASE_PROJECT_ID || norm.GCP_PROJECT_ID || "";
  let FIREBASE_CLIENT_EMAIL = norm.FIREBASE_CLIENT_EMAIL || norm.GCP_CLIENT_EMAIL || "";
  let FIREBASE_PRIVATE_KEY = norm.FIREBASE_PRIVATE_KEY || norm.GCP_PRIVATE_KEY || "";

  const SERVICE_ACCOUNT_RAW =
    norm.FIREBASE_SERVICE_ACCOUNT ||
    norm.FIREBASE_SERVICE_ACCOUNT_JSON ||
    norm.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
    norm.GCP_SERVICE_ACCOUNT ||
    "";

  if ((!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) && SERVICE_ACCOUNT_RAW) {
    try {
      const parsed =
        typeof SERVICE_ACCOUNT_RAW === "string" ? JSON.parse(SERVICE_ACCOUNT_RAW) : SERVICE_ACCOUNT_RAW;
      FIREBASE_PROJECT_ID = FIREBASE_PROJECT_ID || parsed?.project_id || "";
      FIREBASE_CLIENT_EMAIL = FIREBASE_CLIENT_EMAIL || parsed?.client_email || "";
      if (!FIREBASE_PRIVATE_KEY && parsed?.private_key) {
        FIREBASE_PRIVATE_KEY = parsed.private_key.replace(/\r\n/g, "\n");
      }
    } catch (err) {
      console.error("firebase_service_account_parse_error", err);
    }
  }

  if (FIREBASE_PRIVATE_KEY) {
    FIREBASE_PRIVATE_KEY = FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
  }

  if (STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY) {
    process.env.STRIPE_SECRET_KEY = STRIPE_SECRET_KEY;
  }
  if (STRIPE_WEBHOOK_SECRET && !process.env.STRIPE_WEBHOOK_SECRET) {
    process.env.STRIPE_WEBHOOK_SECRET = STRIPE_WEBHOOK_SECRET;
  }
  if (FIREBASE_PROJECT_ID && !process.env.FIREBASE_PROJECT_ID) {
    process.env.FIREBASE_PROJECT_ID = FIREBASE_PROJECT_ID;
  }
  if (FIREBASE_CLIENT_EMAIL && !process.env.FIREBASE_CLIENT_EMAIL) {
    process.env.FIREBASE_CLIENT_EMAIL = FIREBASE_CLIENT_EMAIL;
  }
  if (FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_PRIVATE_KEY) {
    process.env.FIREBASE_PRIVATE_KEY = FIREBASE_PRIVATE_KEY;
  }

  const secret = {
    ALLOW_ORIGIN: norm.ALLOW_ORIGIN || FALLBACK_ORIGIN,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
  };
  cachedSecret = secret;
  return secret;
}

function buildCors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || FALLBACK_ORIGIN,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,stripe-signature,x-app-secret",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "Content-Type": "application/json; charset=utf-8",
  };
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || event?.httpMethod || "POST";

  let secret;
  try {
    secret = await getSecret();
  } catch (err) {
    const cors = buildCors(FALLBACK_ORIGIN);
    if (method === "OPTIONS") return { statusCode: 200, headers: cors, body: "" };
    console.error("secrets_error", err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({
        ok: false,
        error: "secrets_error",
        detail: String(err?.message || err),
      }),
    };
  }

  const CORS = buildCors(secret.ALLOW_ORIGIN);

  if (method === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  if (method !== "POST") {
    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  let verifyWebhookSignature;
  let handleWebhookEvent;
  try {
    const lib = await loadStripeLib();
    verifyWebhookSignature = lib.verifyWebhookSignature;
    handleWebhookEvent = lib.handleWebhookEvent;
  } catch (err) {
    console.error("stripe_lib_load_error", err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({
        ok: false,
        error: "stripe_lib_not_found",
        detail: err?.cause || String(err),
      }),
    };
  }

  try {
    const headers = event?.headers || {};
    const sig =
      headers["stripe-signature"] || headers["Stripe-Signature"] || headers["STRIPE-SIGNATURE"];

    if (!sig) {
      console.error("missing_signature_header");
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ ok: false, error: "missing_signature" }),
      };
    }

    let rawBody;
    if (event.isBase64Encoded) {
      rawBody = Buffer.from(event.body || "", "base64").toString("utf8");
    } else {
      rawBody = typeof event.body === "string" ? event.body : JSON.stringify(event.body || {});
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error("missing_webhook_secret_env");
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ ok: false, error: "missing_webhook_secret" }),
      };
    }

    const stripeEvent = await verifyWebhookSignature(rawBody, sig);
    console.log("Stripe webhook verified", {
      id: stripeEvent.id,
      type: stripeEvent.type,
    });

    await handleWebhookEvent(stripeEvent);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    console.error("webhook_processing_error", err);
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({
        ok: false,
        error: err?.message || String(err),
      }),
    };
  }
};
