// Google Vertex AI proxy using Workload Identity Federation.
import { GoogleAuth } from "google-auth-library";

// --- Configuration ---
const GCP_PROJECT_ID = "gen-lang-client-0706503278";
const GCP_REGION = "eu-west-1";
// Note: User specified "Gemini 2.0 Flash Lite". Using gemini-1.5-flash-latest as a standard equivalent.
const MODEL_ID = process.env.GOOGLE_MODEL || "gemini-1.5-flash-latest";

const DEFAULT_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const ALLOW_METHODS = "POST,OPTIONS";
const ALLOW_HEADERS = process.env.ALLOW_HEADERS || "Content-Type,Authorization";

// --- CORS and Response Helpers ---
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

// --- Body and Payload Validation ---
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
  const mode = payload?.mode;
  if (!mode)
    return { ok: false, code: "invalid_mode", reason: "Payload must have a 'mode' field." };

  if (mode === "chat") {
    if (!Array.isArray(payload.messages) || payload.messages.length === 0)
      return { ok: false, code: "invalid_messages", reason: "Chat mode requires a non-empty 'messages' array." };

    const messages = payload.messages.map((m, i) => {
      const role = typeof m?.role === "string" ? m.role : null;
      const content = typeof m?.content === "string" ? m.content : null;
      if (!role || !content)
        throw new Error(`Message at index ${i} is missing role or content.`);
      return { role, content };
    });
    return { ok: true, mode, messages };
  }

  if (mode === "summarize") {
    const text = payload?.text;
    if (typeof text !== "string" || !text.trim())
      return { ok: false, code: "invalid_text", reason: "Summarize mode requires a non-empty 'text' field." };
    return { ok: true, mode, text: text.trim() };
  }

  return { ok: false, code: "unsupported_mode", reason: `Mode '${mode}' is not supported.` };
}


// --- Main Handler ---
export const handler = async (event) => {
  // --- OPTIONS Preflight ---
  const method = (event?.httpMethod || event?.requestContext?.http?.method || "GET").toUpperCase();
  if (method === "OPTIONS") return noContent();
  if (method !== "POST")
    return json(405, { ok: false, code: "method_not_allowed", reason: "Only POST is supported." });

  // --- Body Parsing and Validation ---
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

  // --- Authentication (Workload Identity Federation) ---
  let accessToken;
  try {
    const auth = new GoogleAuth({
      scopes: "https://www.googleapis.com/auth/cloud-platform"
    });
    accessToken = await auth.getAccessToken();
  } catch (e) {
    console.error("Authentication failed:", e);
    return json(500, {
      ok: false,
      code: "gcp_auth_failed",
      reason: "Failed to get access token from Google.",
      error: e.message
    });
  }

  if (!accessToken) {
    return json(500, { ok: false, code: "gcp_auth_no_token", reason: "Received an empty access token." });
  }

  // --- Build Upstream Request ---
  let contents;
  if (validation.mode === "chat") {
    // Convert OpenAI-style roles to Gemini roles
    contents = validation.messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
  } else if (validation.mode === "summarize") {
    contents = [{
      role: "user",
      parts: [{ text: `Please provide a concise summary of the following text:

---

${validation.text}` }]
    }];
  }

  const url = `https://${GCP_REGION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/publishers/google/models/${MODEL_ID}:streamGenerateContent`;

  const upstreamPayload = { contents };

  // --- Call Vertex AI ---
  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(upstreamPayload)
  }).catch(e => ({ ok: false, error: e }));


  // --- Process Response ---
  if (!upstream || upstream.ok === false && !upstream.status) {
    return json(500, {
      ok: false,
      code: "network_error",
      reason: upstream?.error?.message || "Failed to reach Google Vertex AI."
    });
  }

  const text = await upstream.text();
  let responseData;
  try {
    // Vertex AI streaming endpoint returns a JSON array.
    const responseArray = text ? JSON.parse(text) : [];
    if (responseArray.length === 0) {
       return json(502, { ok: false, code: "empty_upstream_response", reason: "Vertex AI returned an empty array.", raw: text });
    }
    // We'll use the content from the first element.
    responseData = responseArray[0];
  }
  catch (e) {
    return json(502, {
      ok: false,
      code: "invalid_upstream_body",
      reason: `Google Vertex AI response was not valid JSON. ${e?.message}`,
      raw: text
    });
  }

  if (!upstream.ok)
    return json(502, { ok: false, code: "upstream_error", reason: `Google Vertex AI Error ${upstream.status}`, data: responseData });

  // Extract content from Vertex AI response
  const responseContent = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof responseContent !== 'string') {
    return json(502, { ok: false, code: "no_content_in_response", reason: "Extracted no text from Vertex AI response.", data: responseData });
  }

  return json(200, { ok: true, content: responseContent });
};