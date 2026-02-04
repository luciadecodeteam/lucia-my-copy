// server/routes/chat.js
const router = require('express').Router();
const crypto = require('crypto');
const { verifyAuth } = require('../lib/authMiddleware');

const CHAT_LAMBDA_URL = process.env.CHAT_LAMBDA_URL || 'https://acmjtgoc47eieiii6gksw3bx6u0feemy.lambda-url.eu-west-1.on.aws/';
const SUMMARIZER_LAMBDA_URL = process.env.SUMMARIZER_LAMBDA_URL || 'https://eyis5ss5ms7gzgar2uadqkm5sm0ixfqc.lambda-url.eu-west-1.on.aws/';

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-20)
    .map((entry) => {
      const role = typeof entry?.role === 'string' ? entry.role : 'user';
      const content = typeof entry?.content === 'string' ? entry.content : '';
      return { role, content: content.trim() };
    })
    .filter((entry) => entry.content.length > 0);
}

// Demo chat endpoint (unauthenticated)
router.post('/demo', async (req, res) => {
  const prompt = (req.body.prompt || req.body.message || '').toString();
  if (!prompt.trim()) {
    return res.status(400).send("prompt_required");
  }

  let sessionId = req.body?.sessionId || crypto.randomUUID();
  const history = sanitizeHistory(req.body?.history);
  const messages = [...history, { role: 'user', content: prompt }];

  const payload = {
    mode: "chat",
    userId: sessionId,
    conversationId: sessionId,
    messages: messages
  };

  try {
    console.log('📤 Sending to Lambda (Demo):', JSON.stringify(payload, null, 2));
    
    const response = await fetch(CHAT_LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Lambda error response:', errorBody);
      throw new Error(`Lambda returned ${response.status}: ${errorBody}`);
    }
    
    const body = await response.json();
    console.log('✅ Lambda success:', body);

    if (body.reply) {
      return res.json({ reply: body.reply, sessionId });
    } else {
      return res.status(502).json({ error: body.error || 'unexpected_response' });
    }
  } catch (err) {
    console.error('Lambda invoke failed', err);
    return res.status(502).json({ error: 'lambda_invoke_failed', message: err.message });
  }
});

// Authenticated chat endpoint
router.post('/', verifyAuth, async (req, res) => {
  const prompt = (req.body.prompt || req.body.message || '').toString();
  if (!prompt.trim()) {
    return res.status(400).send("prompt_required");
  }

  const history = sanitizeHistory(req.body?.history);
  const messages = [...history, { role: 'user', content: prompt }];

  const payload = {
    mode: "chat",
    userId: req.user.uid,
    conversationId: req.body.conversationId,
    messages: messages
  };

  try {
    console.log('📤 Sending to Lambda (Auth):', JSON.stringify(payload, null, 2));
    
    const response = await fetch(CHAT_LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Lambda error response:', errorBody);
      throw new Error(`Lambda returned ${response.status}: ${errorBody}`);
    }
    
    const body = await response.json();
    console.log('✅ Lambda success:', body);

    if (body.reply) {
      return res.json({ reply: body.reply });
    } else {
      return res.status(502).json({ error: body.error || 'unexpected_response' });
    }
  } catch (err) {
    console.error('Lambda invoke failed', err);
    return res.status(502).json({ error: 'lambda_invoke_failed', message: err.message });
  }
});

// ✅ NEW: Summarizer endpoint
router.post('/summarize', verifyAuth, async (req, res) => {
  const { conversationId, userMessage, aiResponse } = req.body;
  
  if (!conversationId || !userMessage || !aiResponse) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const summarizerPayload = {
    userId: req.user.uid,
    conversationId,
    conversationTurn: { userMessage, aiResponse }
  };

  console.log('🔔 Summarizer called:', req.user.uid, conversationId);

  try {
    const response = await fetch(SUMMARIZER_LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summarizerPayload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Summarizer error:', response.status, errorBody);
      return res.status(response.status).json({ error: errorBody });
    }

    const result = await response.json();
    console.log('✅ Summarizer success:', result);
    return res.json(result);
  } catch (err) {
    console.error('⚠️ Summarizer failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: Demo summarizer endpoint (unauthenticated)
router.post('/summarize-demo', async (req, res) => {
  const { sessionId, userMessage, aiResponse } = req.body;
  
  if (!sessionId || !userMessage || !aiResponse) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const summarizerPayload = {
    userId: sessionId,
    conversationId: sessionId,
    conversationTurn: { userMessage, aiResponse }
  };

  console.log('🔔 Summarizer called (Demo):', sessionId);

  try {
    const response = await fetch(SUMMARIZER_LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summarizerPayload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Summarizer error (Demo):', response.status, errorBody);
      return res.status(response.status).json({ error: errorBody });
    }

    const result = await response.json();
    console.log('✅ Summarizer success (Demo):', result);
    return res.json(result);
  } catch (err) {
    console.error('⚠️ Summarizer failed (Demo):', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
