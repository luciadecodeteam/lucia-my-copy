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

  let sessionId = req.body?.sessionId;
  let newSessionId = null;
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    newSessionId = sessionId; // Flag to send it back to the client
  }

  const history = sanitizeHistory(req.body?.history);
  


  const payload = {
    mode: "chat",
    prompt: prompt,
    userId: sessionId, // For demo, session ID is the user identifier
    conversationId: sessionId
  };

  try {

    console.log('📤 Sending to Lambda:', JSON.stringify(payload, null, 2));
    const response = await fetch(CHAT_LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log('📥 Lambda response status:', response.status);
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Lambda error response:', errorBody);
      throw new Error(`Lambda returned ${response.status}: ${errorBody}`);
    }
    const body = await response.json();
    console.log('✅ Lambda success:', body);

    if (body.reply) {
      // Trigger summarizer async (fire-and-forget)
      try {
        const summarizerPayload = {
          userId: sessionId, // For demo, session ID is the user identifier
          conversationTurn: {
            userMessage: prompt,
            aiResponse: body.reply
          }
        };

      } catch (error) {
        console.error('⚠️ Failed to build summarizer trigger:', error);
      }

      const responsePayload = { reply: body.reply };
      if (newSessionId) {
        responsePayload.sessionId = newSessionId;
      }
      return res.json(responsePayload);

    } else if (body.error) {
      return res.status(502).json({ error: body.error });
    } else {
      return res.status(502).json({ error: 'unexpected_response', body });
    }
  } catch (err) {
    console.error('Lambda invoke failed', err);
    return res.status(502).json({ error: 'lambda_invoke_failed', message: err.message });
  }
});

router.post('/', verifyAuth, async (req, res) => {
  const prompt = (req.body.prompt || req.body.message || '').toString();
  if (!prompt.trim()) {
    return res.status(400).send("prompt_required");
  }

  const history = sanitizeHistory(req.body?.history);
  


  const payload = {
    mode: "chat",
    prompt: prompt,
    userId: req.user.uid,
    conversationId: req.body.conversationId
  };


    console.log('📥 Lambda response status:', response.status);
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Lambda error response:', errorBody);
      throw new Error(`Lambda returned ${response.status}: ${errorBody}`);
    }
    const body = await response.json();
    console.log('✅ Lambda success:', body);

    // normalize what your frontend expects
    if (body.reply) {
      // Trigger summarizer async (fire-and-forget)
      try {
        const summarizerPayload = {
          userId: req.user.uid,
          conversationTurn: {
            userMessage: prompt,
            aiResponse: body.reply
          }
        };

      } catch (error) {
        console.error('⚠️ Failed to build summarizer trigger:', error);
      }

      return res.json({ reply: body.reply });
    } else if (body.error) {
      return res.status(502).json({ error: body.error });
    } else {
      return res.status(502).json({ error: 'unexpected_response', body });
    }
  } catch (err) {
    console.error('Lambda invoke failed', err);
    return res.status(502).json({ error: 'lambda_invoke_failed', message: err.message });
  }
});

module.exports = router;
