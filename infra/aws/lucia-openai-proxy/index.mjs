// Google Gemini proxy via Secrets Manager (GOOGLE_SECRET_ID)
import { GoogleAuth } from "google-auth-library";

const DEFAULT_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const ALLOW_METHODS = "POST,OPTIONS";
const ALLOW_HEADERS = process.env.ALLOW_HEADERS || "Content-Type,Authorization";

const corsBaseHeaders = Object.freeze({
  "Access-Control-Allow-Origin": DEFAULT_ORIGIN,
  "Access-Control-Allow-Methods": ALLOW_METHODS,
  "Access-Control-Allow-Headers": ALLOW_HEADERS,
  "Access-Control-Max-Age": "86400",
});

function withCors(extra = {}) { return { ...corsBaseHeaders, ...extra }; }
function noContent() { return { statusCode: 204, headers: withCors(), body: "" }; }
function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: withCors({ "Content-Type": "application/json; charset=utf-8", ...extraHeaders }),
    body: JSON.stringify(body)
  };
}

function decodeBody(event) {
  if (!event?.body) return "";
  try {
    return event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
  } catch {
    return null;
  }
}

function validate(payload) {
  if (payload?.mode !== "chat")
    return { ok: false, code: "invalid_mode", reason: 'Expected payload.mode to be "chat".' };

  if (!Array.isArray(payload.messages) || payload.messages.length === 0)
    return { ok: false, code: "invalid_messages", reason: "messages must be a non-empty array." };

  const messages = payload.messages.map((m, i) => {
    const role = typeof m?.role === "string" ? m.role : null;
    const content = typeof m?.content === "string" ? m.content : null;
    if (!role || !content)
      throw new Error(`Message at index ${i} is missing role or content.`);
    return { role, content };
  });

  return { ok: true, messages };
}

// AWS SDK v3
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const sm = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-1" });
let GOOGLE_KEY_CACHE = null;

async function getGoogleKey() {
  const secretId = (process.env.GOOGLE_SECRET_ID || "").trim();
  if (!secretId) return null;
  if (GOOGLE_KEY_CACHE) return GOOGLE_KEY_CACHE;

  const out = await sm.send(new GetSecretValueCommand({ SecretId: secretId }));
  const str =
    out.SecretString ||
    (out.SecretBinary ? Buffer.from(out.SecretBinary, "base64").toString("utf8") : "");

  if (!str) return null;

  let obj;
  try { obj = JSON.parse(str); } catch { obj = {}; }

  const key = (obj.GOOGLE_API_KEY || obj.apiKey || "").trim();
  if (!key) return null;

  GOOGLE_KEY_CACHE = key;
  return key;
}

export const handler = async (event) => {
  const method = (event?.httpMethod || event?.requestContext?.http?.method || "GET").toUpperCase();
  if (method === "OPTIONS") return noContent();
  if (method !== "POST")
    return json(405, { ok: false, code: "method_not_allowed", reason: "Only POST is supported." });

  const raw = decodeBody(event);
  if (raw === null)
    return json(400, { ok: false, code: "invalid_encoding", reason: "Body could not be decoded." });

  let payload;
  try { payload = raw ? JSON.parse(raw) : {}; }
  catch {
    return json(400, { ok: false, code: "invalid_json", reason: "Body must be valid JSON." });
  }

  let validation;
  try { validation = validate(payload); }
  catch (e) {
    return json(400, { ok: false, code: "invalid_message", reason: e?.message });
  }
  if (!validation.ok) return json(400, validation);

  const apiKey = await getGoogleKey();
  if (!apiKey)
    return json(500, {
      ok: false,
      code: "missing_api_key",
      reason: "No key via GOOGLE_SECRET_ID."
    });

  // Map OpenAI-style messages to Gemini contents
  const contents = validation.messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const model = process.env.GOOGLE_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents })
  }).catch(e => ({ ok: false, error: e }));

  if (!upstream || upstream.ok === false && !upstream.status) {
    return json(500, {
      ok: false,
      code: "network_error",
      reason: upstream?.error?.message || "Failed to reach Google."
    });
  }

  const text = await upstream.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch (e) {
    return json(502, {
      ok: false,
      code: "invalid_upstream_body",
      reason: e?.message || "Google JSON invalid.",
      raw: text
    });
  }

  if (!upstream.ok)
    return json(502, { ok: false, code: "upstream_error", reason: `Google ${upstream.status}`, data });

  return json(200, { ok: true, data });
};
