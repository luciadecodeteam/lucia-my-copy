// server/routes/chat.js
const router = require('express').Router();
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { verifyAuth } = require('../lib/authMiddleware');
const { getMemory, updateMemory } = require('../lib/memory');

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

router.post('/', verifyAuth, async (req, res) => {
  const prompt = (req.body?.prompt ?? '').toString();
  if (!prompt.trim()) {
    return res.status(400).json({ error: 'prompt_required' });
  }

  const history = sanitizeHistory(req.body?.history);
  
  // Fetch User Memory
  let userMemory = '';
  try {
    userMemory = await getMemory(req.user.uid);
  } catch (err) {
    console.warn('Failed to load user memory', err);
  }

  const messages = history.length
    ? [...history, { role: 'user', content: prompt }]
    : [{ role: 'user', content: prompt }];

  // Inject memory into context (as a system message or prepended to first user message)
  // We'll add it as a system message at the start.
  // Note: If the first message in history is already system, we might want to merge or append.
  // For simplicity, we just unshift a new system message.
  const memoryContext = userMemory ? `\n\nUser Context / Long-term Memory:\n${userMemory}` : '';
  
  // If there's memory, we prepend it. 
  // Depending on the model, it might handle multiple system messages or just one.
  // We'll assume the downstream proxy/model handles a list of messages.
  const finalMessages = [...messages];
  if (userMemory) {
    finalMessages.unshift({ role: 'system', content: `Current user memory:${memoryContext}` });
  }

  const payload = {
    mode: 'chat',
    messages: finalMessages,
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
      // Async: Update Memory
      // We don't await this, so it doesn't block the response
      updateMemory(req.user.uid, [{ role: 'user', content: prompt }, { role: 'assistant', content: body.reply }], userMemory)
        .catch(err => console.error('Background memory update failed', err));

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
