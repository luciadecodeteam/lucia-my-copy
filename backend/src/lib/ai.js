const axios = require('axios');
const { getSecretValue, parseSecretValue } = require('./secrets');

let promptTemplatePromise = null;

function getProxyUrl() {
  // Prefer AI_PROXY_URL, fallback to OPENAI_PROXY_URL for compat
  return (process.env.AI_PROXY_URL || process.env.OPENAI_PROXY_URL || 'https://acmjtgoc47eieiii6gksw3bx6u0feemy.lambda-url.eu-west-1.on.aws/').trim();
}

async function loadPromptTemplate() {
  if (!promptTemplatePromise) {
    promptTemplatePromise = (async () => {
      // Check for generic or specific env vars
      if (process.env.AI_SYSTEM_PROMPT || process.env.OPENAI_SYSTEM_PROMPT) {
        return process.env.AI_SYSTEM_PROMPT || process.env.OPENAI_SYSTEM_PROMPT;
      }
      const secretId = (process.env.LUCIA_PROMPT_SECRET || process.env.LUCIA_OPENAI_PROMPT_SECRET || '').trim();
      if (!secretId) {
        return null;
      }
      try {
        const raw = await getSecretValue(secretId);
        const parsed = parseSecretValue(raw);
        if (!parsed) return null;
        if (typeof parsed === 'string') return parsed;
        return parsed.prompt || parsed.systemPrompt || null;
      } catch (err) {
        console.warn('Failed to load AI prompt secret', err?.message);
        return null;
      }
    })();
  }
  return promptTemplatePromise;
}

async function callAI(prompt, options = {}) {
  if (!prompt) {
    throw new Error('Prompt is required');
  }
  const url = getProxyUrl();
  if (!url) {
    throw new Error('AI proxy URL not configured');
  }
  
  const systemPrompt = await loadPromptTemplate();
  
  // Construct Chat Payload (Standardized)
  const messages = [];
  if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });
  
  const payload = {
    mode: 'chat',
    messages,
    ...options,
  };

  try {
    const response = await axios.post(url, payload, {
      timeout: Number(process.env.AI_PROXY_TIMEOUT_MS || process.env.OPENAI_PROXY_TIMEOUT_MS || 30000),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = response?.data;
    if (!data) {
      throw new Error('Empty response from AI proxy');
    }

    // New Proxy returns { ok: true, reply: "..." }
    if (data.reply) return data.reply;
    
    // Legacy handling (just in case)
    if (typeof data === 'string') return data;
    if (data.result) return data.result;
    if (data.output) return data.output;
    
    const choice = data.choices && data.choices[0];
    if (choice?.message?.content) return choice.message.content;
    if (choice?.text) return choice.text;
    
    return JSON.stringify(data);

  } catch (err) {
    const message = err?.response?.data?.error || err?.response?.data?.reason || err?.message || 'AI proxy request failed';
    console.error('AI proxy error', { message });
    throw new Error(message);
  }
}

module.exports = { callAI };
