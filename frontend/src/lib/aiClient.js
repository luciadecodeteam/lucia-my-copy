const WRAPPER_KEYS = [
  'reply',
  'response',
  'result',
  'message',
  'data',
  'body',
  'payload'
]

function pickDirectContent(obj) {
  if (!obj || typeof obj !== 'object') return undefined
  const choice = Array.isArray(obj.choices) ? obj.choices[0] : null
  if (choice) {
    if (choice.message && typeof choice.message.content === 'string') {
      return choice.message.content
    }
    if (choice.delta && typeof choice.delta.content === 'string') {
      return choice.delta.content
    }
  }

  if (obj.data && typeof obj.data.content === 'string') {
    return obj.data.content
  }

  if (typeof obj.content === 'string') {
    return obj.content
  }

  return undefined
}

function isLikelyJsonString(str) {
  if (typeof str !== 'string') return false
  const trimmed = str.trim()
  if (!trimmed) return false
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  return (
    (first === '{' && last === '}') ||
    (first === '[' && last === ']')
  )
}

function unwrapString(value, depth) {
  let peeled = false
  let current = value

  while (typeof current === 'string') {
    const trimmed = current.trim()
    if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
      const inner = trimmed.replace(/^```(?:json)?/, '').replace(/```$/, '')
      current = inner.trim()
      peeled = true
      continue
    }

    if (isLikelyJsonString(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed)
        const result = extractContent(parsed, depth + 1)
        if (result.text) {
          return { text: result.text, peeled: true }
        }
      } catch {
        // fall through to returning trimmed string
      }
    }

    return { text: trimmed, peeled }
  }

  return { text: null, peeled }
}

function extractFromWrapper(obj, depth) {
  for (const key of WRAPPER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const result = extractContent(obj[key], depth + 1)
      if (result.text) {
        return { text: result.text, peeled: true }
      }
    }
  }
  return { text: null, peeled: false }
}

function extractContent(value, depth = 0) {
  if (depth > 6) return { text: null, peeled: false }
  if (value == null) return { text: null, peeled: false }

  if (typeof value === 'string') {
    return unwrapString(value, depth)
  }

  if (typeof value !== 'object') {
    return { text: null, peeled: false }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = extractContent(item, depth + 1)
      if (result.text) {
        return { text: result.text, peeled: true }
      }
    }
    return { text: null, peeled: false }
  }

  const direct = pickDirectContent(value)
  if (typeof direct === 'string') {
    return { text: direct, peeled: false }
  }

  const fromWrapper = extractFromWrapper(value, depth)
  if (fromWrapper.text) {
    return fromWrapper
  }

  for (const key of Object.keys(value)) {
    const candidate = value[key]
    if (typeof candidate === 'string') {
      return { text: candidate, peeled: true }
    }
  }

  return { text: null, peeled: false }
}

function extractErrorReason(payload) {
  if (!payload || typeof payload !== 'object') return null
  const error = payload.error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim()
    }
    if (typeof error.code === 'string') {
      return error.code
    }
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim()
  }
  return null
}

export async function fetchChatCompletion({ url, prompt, history, token, userId, conversationId, signal }) {
  try {
    const body = { userId, conversationId, prompt, history };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body),
      signal
    });

    const bodyText = await res.text();
    let payload = null;
    try {
      payload = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      payload = bodyText;
    }

    if (!res.ok) {
      const reason =
        (typeof payload === 'object' ? extractErrorReason(payload) : null) ||
        `${res.status} ${res.statusText || ''}`.trim();
      return { ok: false, reason: reason || `HTTP ${res.status}`, raw: bodyText };
    }

    const result = extractContent(payload ?? bodyText);
    if (result.peeled) {
      console.debug('aiClient: peeled wrapper from chat response');
    }

    const content = typeof result.text === 'string' ? result.text.trim() : '';
    if (!content) {
      return { ok: false, reason: 'Empty response from server.', raw: bodyText };
    }
    
    const responsePayload = { ok: true, content };
    if (payload?.sessionId) {
      responsePayload.sessionId = payload.sessionId;
    }

    return responsePayload;

  } catch (error) {
    const reason = (error && typeof error.message === 'string' && error.message.trim())
      ? error.message.trim()
      : 'Network error';
    return { ok: false, reason, raw: null };
  }
}

export default fetchChatCompletion
