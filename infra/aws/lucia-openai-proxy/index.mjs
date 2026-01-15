import { VertexAI } from '@google-cloud/vertexai';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

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

// --- Secrets Management ---
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'eu-west-1' });
let cachedServiceAccount = null;

async function getGoogleCredentials() {
  if (cachedServiceAccount) return cachedServiceAccount;

  const secretName = process.env.GCP_SERVICE_ACCOUNT_SECRET_NAME || 'lucia/gcp-service-account';
  
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsClient.send(command);
    
    let secret = response.SecretString;
    if (!secret && response.SecretBinary) {
      secret = Buffer.from(response.SecretBinary, 'base64').toString('utf-8');
    }
    
    if (!secret) throw new Error('Secret is empty');
    
    cachedServiceAccount = JSON.parse(secret);
    return cachedServiceAccount;
  } catch (err) {
    console.error('Failed to retrieve GCP credentials from Secrets Manager:', err);
    throw err;
  }
}

// --- Vertex AI Client ---
let vertexClient = null;

async function getVertexClient() {
  if (vertexClient) return vertexClient;

  const credentials = await getGoogleCredentials();
  const projectId = process.env.GCP_PROJECT_ID || credentials.project_id;
  
  if (!projectId) throw new Error('GCP Project ID not found in env or credentials');

  vertexClient = new VertexAI({
    project: projectId,
    location: process.env.GCP_LOCATION || 'us-central1',
    googleAuthOptions: {
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    }
  });
  
  return vertexClient;
}

// --- Handler ---

function decodeBody(event) {
  if (!event?.body) return "";
  try {
    return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  } catch (err) {
    return null;
  }
}

export const handler = async (event) => {
  // CORS Preflight
  const method = (event?.httpMethod || event?.requestContext?.http?.method || "").toUpperCase();
  if (method === "OPTIONS") return noContentResponse();
  if (method !== "POST") return jsonResponse(405, { ok: false, error: "Only POST is supported" });

  try {
    // 1. Parse Body
    const rawBody = decodeBody(event);
    if (!rawBody) return jsonResponse(400, { ok: false, error: "Empty body" });
    const payload = JSON.parse(rawBody);

    // 2. Normalize Payload (support legacy { prompt } and standard { messages })
    const messages = payload.messages || [];
    if (messages.length === 0 && payload.prompt) {
      if (payload.systemPrompt) messages.push({ role: 'system', content: payload.systemPrompt });
      messages.push({ role: 'user', content: payload.prompt });
    }

    if (messages.length === 0) {
      return jsonResponse(400, { ok: false, error: "No messages or prompt provided" });
    }

    // 3. Initialize Vertex AI
    const vertex = await getVertexClient();
    const modelName = process.env.VERTEX_MODEL || 'gemini-1.5-flash-001';
    
    const generativeModel = vertex.getGenerativeModel({
      model: modelName,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
      }
    });

    // 4. Convert Messages to Vertex Format
    // Vertex expects: { role: 'user'|'model', parts: [{ text: '...' }] }
    // System instructions are handled separately in newer SDKs, but often prepended to context in chat.
    // For this simple proxy, we will map 'system' to 'user' or use systemInstruction if supported.
    
    const contents = [];
    let systemInstruction = undefined;

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    // 5. Generate Content
    const result = await generativeModel.generateContent({
      contents,
      systemInstruction,
    });
    
    const response = await result.response;
    const reply = response.candidates[0]?.content?.parts[0]?.text || "";

    return jsonResponse(200, { ok: true, reply });

  } catch (err) {
    console.error('Vertex Proxy Error:', err);
    return jsonResponse(502, { 
      ok: false, 
      error: "Upstream AI Error", 
      details: err.message 
    });
  }
};