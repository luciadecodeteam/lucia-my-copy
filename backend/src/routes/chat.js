// server/routes/chat.js
const router = require('express').Router();
const crypto = require('crypto');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { verifyAuth } = require('../lib/authMiddleware');


// configure AWS Lambda client (region must match your function)
const lambda = new LambdaClient({ region: 'eu-west-1' });
const FUNCTION_NAME = 'lucia-openai-proxy';

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
  const prompt = (req.body?.prompt ?? '').toString();
  if (!prompt.trim()) {
    return res.status(400).json({ error: 'prompt_required' });
  }

  let sessionId = req.body?.sessionId;
  let newSessionId = null;
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    newSessionId = sessionId; // Flag to send it back to the client
  }

  const history = sanitizeHistory(req.body?.history);
  


  const messages = history.length
    ? [...history, { role: 'user', content: prompt }]
    : [{ role: 'user', content: prompt }];

  const payload = {
    contents: messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user', // Map roles for Gemini
      parts: [{ text: m.content }]
    }))
  };

  try {
    const cmd = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const resp = await lambda.send(cmd);
    const body = resp.Payload
      ? JSON.parse(new TextDecoder().decode(resp.Payload))
      : { error: 'empty_lambda_response' };

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
        const cmd = new InvokeCommand({
          FunctionName: 'lucia-summarizer-function',
          InvocationType: 'Event', // Async
          Payload: Buffer.from(JSON.stringify(summarizerPayload))
        });
        lambda.send(cmd).catch(err => console.error('⚠️ Failed to trigger summarizer for demo:', err));
        console.log('✅ Summarizer triggered for demo session');
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
  const prompt = (req.body?.prompt ?? '').toString();
  if (!prompt.trim()) {
    return res.status(400).json({ error: 'prompt_required' });
  }

  const history = sanitizeHistory(req.body?.history);
  


  const messages = history.length
    ? [...history, { role: 'user', content: prompt }]
    : [{ role: 'user', content: prompt }];

  const payload = {
    contents: messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user', // Map roles for Gemini
      parts: [{ text: m.content }]
    }))
  };

  try {
    const cmd = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const resp = await lambda.send(cmd);
    const body = resp.Payload
      ? JSON.parse(new TextDecoder().decode(resp.Payload))
      : { error: 'empty_lambda_response' };

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
        const cmd = new InvokeCommand({
          FunctionName: 'lucia-summarizer-function',
          InvocationType: 'Event', // Async
          Payload: Buffer.from(JSON.stringify(summarizerPayload))
        });
        lambda.send(cmd).catch(err => console.error('⚠️ Failed to trigger summarizer:', err));
        console.log('✅ Summarizer triggered for user:', req.user.uid);
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
