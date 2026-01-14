const DEFAULT_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const ALLOW_METHODS = "POST,OPTIONS";
const ALLOW_HEADERS = process.env.ALLOW_HEADERS || "Content-Type,Authorization";

const corsBaseHeaders = Object.freeze({
  "Access-Control-Allow-Origin": DEFAULT_ORIGIN,
  "Access-Control-Allow-Methods": ALLOW_METHODS,
  "Access-Control-Allow-Headers": ALLOW_HEADERS,
  "Access-Control-Max-Age": "86400",
});

function withCors(headers = {}) {
  return { ...corsBaseHeaders, ...headers };
}

function jsonResponse(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: withCors({ "Content-Type": "application/json; charset=utf-8", ...extraHeaders }),
    body: JSON.stringify(body),
  };
}

function noContentResponse(statusCode = 204) {
  return {
    statusCode,
    headers: withCors(),
    body: "",
  };
}

function decodeBody(event) {
  if (!event?.body) return "";
  try {
    return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  } catch (err) {
    return null;
  }
}

function validatePayload(payload) {
  if (payload?.mode !== "chat") {
    return { ok: false, code: "invalid_mode", reason: 'Expected payload.mode to be "chat".' };
  }

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return {
      ok: false,
      code: "invalid_messages",
      reason: "Expected payload.messages to be a non-empty array.",
    };
  }

  const messages = payload.messages.map((msg, index) => {
    const role = typeof msg?.role === "string" ? msg.role : null;
    const content = typeof msg?.content === "string" ? msg.content : null;
    if (!role || !content) {
      throw new Error(`Message at index ${index} is missing role or content.`);
    }
    return { role, content };
  });

  return { ok: true, messages };
}

async function callGemini(messages) {
  // Default to Gemini 1.5 Flash
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || ""; // Fallback for transition
  const apiBase = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  if (!apiKey) {
    return { ok: false, code: "missing_api_key", reason: "GEMINI_API_KEY environment variable is not set." };
  }

  // Convert OpenAI messages to Gemini contents
  const contents = messages.map((msg) => {
    const role = msg.role === "assistant" ? "model" : "user";
    return {
      role,
      parts: [{ text: msg.content }],
    };
  });

  const payload = {
    contents,
  };

  // Map system prompt if it exists as a separate conceptual role (Gemini uses 'system_instruction' but strictly 'user'/'model' in contents for chat)
  // For simplicity in this proxy, we treat system messages as user messages or prepended context if passed in messages.
  // However, Gemini API supports system_instruction separately. 
  // If the first message is 'system', we can move it to system_instruction.
  if (messages.length > 0 && messages[0].role === "system") {
    payload.system_instruction = {
      parts: [{ text: messages[0].content }]
    };
    // Remove it from contents
    payload.contents.shift();
  }
  
  // If contents is empty after removing system message, add a dummy user message to avoid API error
  if (payload.contents.length === 0) {
      payload.contents.push({ role: "user", parts: [{ text: "Hello" }] });
  }

  if (process.env.GEMINI_TEMPERATURE) {
    const temperature = Number(process.env.GEMINI_TEMPERATURE);
    if (!Number.isNaN(temperature)) {
      payload.generationConfig = { temperature };
    }
  }

  let response;
  try {
    response = await fetch(`${apiBase}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return {
      ok: false,
      code: "network_error",
      reason: error?.message || "Failed to reach Gemini API.",
    };
  }

  let data;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    return {
      ok: false,
      code: "invalid_upstream_body",
      reason: error?.message || "Gemini response was not valid JSON.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "upstream_error",
      reason: `Gemini request failed with status ${response.status}.`,
      data,
    };
  }

  return { ok: true, data };
}

export const handler = async (event) => {
  const method = (event?.httpMethod || event?.requestContext?.http?.method || "").toUpperCase();

  if (method === "OPTIONS") {
    return noContentResponse();
  }

  if (method !== "POST") {
    return jsonResponse(405, { ok: false, code: "method_not_allowed", reason: "Only POST is supported." });
  }

  const rawBody = decodeBody(event);
  if (rawBody === null) {
    return jsonResponse(400, {
      ok: false,
      code: "invalid_encoding",
      reason: "Request body could not be decoded.",
    });
  }

  let payload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      code: "invalid_json",
      reason: "Request body must be valid JSON.",
    });
  }

  // Adapter for legacy { prompt } payloads (e.g. from Backend directly)
  if (payload && payload.prompt && !payload.messages) {
    payload.mode = "chat";
    payload.messages = [{ role: "user", content: payload.prompt }];
    if (payload.systemPrompt) {
       payload.messages.unshift({ role: "system", content: payload.systemPrompt });
    }
  }

  let validation;
  try {
    validation = validatePayload(payload);
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      code: "invalid_message",
      reason: error?.message || "Messages must include role and content strings.",
    });
  }

  if (!validation.ok) {
    return jsonResponse(400, validation);
  }

  const upstream = await callGemini(validation.messages);
  if (!upstream.ok) {
    const statusCode = upstream.code === "network_error" || upstream.code === "missing_api_key" ? 500 : 502;
    return jsonResponse(statusCode, upstream);
  }

  // Gemini Response Parsing
  const candidate = upstream.data?.candidates?.[0];
  const reply = candidate?.content?.parts?.[0]?.text || null;

  if (reply === null) {
    return jsonResponse(502, {
      ok: false,
      code: "upstream_error",
      reason: "Upstream response did not include a reply text.",
      data: upstream.data,
    });
  }

  return jsonResponse(200, { ok: true, reply, data: upstream.data });
};
