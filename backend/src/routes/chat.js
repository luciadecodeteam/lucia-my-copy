// server/routes/chat.js
const router = require('express').Router();
const crypto = require('crypto');

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
    const response = await fetch(CHAT_LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Lambda returned ${response.status}: ${errorBody}`);
    }
    
    const body = await response.json();

    if (body.reply) {
      return res.json({ reply: body.reply, sessionId });
    } else {
      return res.status(502).json({ error: body.error || 'unexpected_response' });
    }
  } catch (err) {
    return res.status(502).json({ error: 'lambda_invoke_failed', message: err.message });
  }
});

router.post('/', async (req, res) => {
  const prompt = (req.body.prompt || req.body.message || '').toString();
  if (!prompt.trim()) {
    return res.status(400).send("prompt_required");
  }

  const history = sanitizeHistory(req.body?.history);
  const messages = [...history, { role: 'user', content: prompt }];

  const payload = {
    mode: "chat",
    userId: req.body.userId,
    conversationId: req.body.conversationId,
    messages: messages
  };
  
  try {
    const response = await fetch(CHAT_LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Lambda returned ${response.status}: ${errorBody}`);
    }
    
    const body = await response.json();

    if (body.reply) {
      return res.json({ reply: body.reply });
    } else {
      return res.status(502).json({ error: body.error || 'unexpected_response' });
    }
  } catch (err) {
    return res.status(502).json({ error: 'lambda_invoke_failed', message: err.message });
  }
});

router.post('/summarize', async (req, res) => {
  const { userId, conversationId, conversationTurn } = req.body;
  
  if (!userId || !conversationId || !conversationTurn?.userMessage || !conversationTurn?.aiResponse) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      received: { userId: !!userId, conversationId: !!conversationId, userMessage: !!conversationTurn?.userMessage, aiResponse: !!conversationTurn?.aiResponse }
    });
  }

  const summarizerPayload = {
    userId,
    conversationId,
    conversationTurn
  };

  try {
    const response = await fetch(SUMMARIZER_LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summarizerPayload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({ error: errorBody });
    }

    const result = await response.json();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

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

  try {
    const response = await fetch(SUMMARIZER_LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summarizerPayload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({ error: errorBody });
    }

    const result = await response.json();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;