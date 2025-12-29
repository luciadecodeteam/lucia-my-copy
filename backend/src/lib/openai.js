const axios = require('axios');
const { getSecretValue, parseSecretValue } = require('./secrets');

let promptTemplatePromise = null;

function getProxyUrl() {
  return (process.env.OPENAI_PROXY_URL || 'https://tsqwdm45h22gxxvxoyflrpoj7m0eewmb.lambda-url.eu-west-1.on.aws/').trim();
}

async function loadPromptTemplate() {
  if (!promptTemplatePromise) {
    promptTemplatePromise = (async () => {
      if (process.env.OPENAI_SYSTEM_PROMPT) {
        return process.env.OPENAI_SYSTEM_PROMPT;
      }
      const secretId = (process.env.LUCIA_OPENAI_PROMPT_SECRET || '').trim();
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
        console.warn('Failed to load OpenAI prompt secret', err?.message);
        return null;
      }
    })();
  }
  return promptTemplatePromise;
}

async function callOpenAI(prompt, options = {}) {
  if (!prompt) {
    throw new Error('Prompt is required');
  }
  const url = getProxyUrl();
  if (!url) {
    throw new Error('OpenAI proxy URL not configured');
  }
  const systemPrompt = await loadPromptTemplate();
  const payload = {
    prompt,
    ...(systemPrompt ? { systemPrompt } : {}),
    ...options,
  };
  try {
    const response = await axios.post(url, payload, {
      timeout: Number(process.env.OPENAI_PROXY_TIMEOUT_MS || 30000),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const data = response?.data;
    if (!data) {
      throw new Error('Empty response from OpenAI proxy');
    }
    if (typeof data === 'string') return data;
    if (data.result) return data.result;
    if (data.output) return data.output;
    const choice = data.choices && data.choices[0];
    if (choice?.message?.content) return choice.message.content;
    if (choice?.text) return choice.text;
    return JSON.stringify(data);
  } catch (err) {
    const message = err?.response?.data?.error || err?.message || 'OpenAI proxy request failed';
    console.error('OpenAI proxy error', { message });
    throw new Error(message);
  }
}

module.exports = { callOpenAI };
