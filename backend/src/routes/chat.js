// server/routes/chat.js
const router = require('express').Router();
const crypto = require('crypto');

function requireEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val.replace(/\/+$/, ""); // trim trailing slash
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-20)
    .map((entry) => {
      const role    = typeof entry?.role    === "string" ? entry.role    : "user";
      const content = typeof entry?.content === "string" ? entry.content : "";
      return { role, content: content.trim() };
    })
    .filter((entry) => entry.content.length > 0);
}

// ---------- /demo ----------
router.post('/demo', async (req, res) => {
  const prompt = (req.body.prompt || req.body.message || '').toString();
  if (!prompt.trim()) return res.status(400).send("prompt_required");

  const sessionId = req.body?.sessionId || crypto.randomUUID();
  const history   = sanitizeHistory(req.body?.history);
  const messages  = [...history, { role: 'user', content: prompt }];

  try {
    const response = await fetch(requireEnv('CHAT_LAMBDA_URL'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mode: "chat", userId: sessionId, conversationId: sessionId, messages })
    });

    if (!response.ok) throw new Error(`Lambda ${response.status}: ${await response.text()}`);
    const body = await response.json();
    if (body.reply) return res.json({ reply: body.reply, sessionId });
    return res.status(502).json({ error: body.error || 'unexpected_response' });
  } catch (err) {
    return res.status(502).json({ error: 'lambda_invoke_failed', message: err.message });
  }
});

// ---------- / ----------
router.post('/', async (req, res) => {
  const prompt = (req.body.prompt || req.body.message || '').toString();
  if (!prompt.trim()) return res.status(400).send("prompt_required");

  const history  = sanitizeHistory(req.body?.history);
  const messages = [...history, { role: 'user', content: prompt }];

  try {
    const response = await fetch(requireEnv('CHAT_LAMBDA_URL'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mode: "chat", userId: req.body.userId, conversationId: req.body.conversationId, messages })
    });

    if (!response.ok) throw new Error(`Lambda ${response.status}: ${await response.text()}`);
    const body = await response.json();
    if (body.reply) return res.json({ reply: body.reply });
    return res.status(502).json({ error: body.error || 'unexpected_response' });
  } catch (err) {
    return res.status(502).json({ error: 'lambda_invoke_failed', message: err.message });
  }
});

// ---------- /summarize ----------
router.post('/summarize', async (req, res) => {
  const { userId, conversationId, conversationTurn } = req.body;
  if (!userId || !conversationId || !conversationTurn?.userMessage || !conversationTurn?.aiResponse) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const response = await fetch(requireEnv('SUMMARIZER_LAMBDA_URL'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId, conversationId, conversationTurn })
    });

    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    return res.json(await response.json());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------- /summarize-demo ----------
router.post('/summarize-demo', async (req, res) => {
  const { sessionId, userMessage, aiResponse } = req.body;
  if (!sessionId || !userMessage || !aiResponse) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const response = await fetch(requireEnv('SUMMARIZER_LAMBDA_URL'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ userId: sessionId, conversationId: sessionId, conversationTurn: { userMessage, aiResponse } })
    });

    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    return res.json(await response.json());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------- /cancel-subscription ----------
router.post('/cancel-subscription', async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'Missing uid' });

  try {
    const response = await fetch(`${requireEnv('CHECKOUT_LAMBDA_URL')}/api/pay/cancel`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ uid })
    });

    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    return res.json(await response.json());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;