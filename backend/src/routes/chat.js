// server/routes/chat.js
const router = require('express').Router();
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

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

router.post('/', async (req, res) => {
  const prompt = (req.body?.prompt ?? '').toString();
  if (!prompt.trim()) {
    return res.status(400).json({ error: 'prompt_required' });
  }

  const history = sanitizeHistory(req.body?.history);
  const payload = {
    mode: 'chat',
    messages: history.length
      ? [...history, { role: 'user', content: prompt }]
      : [{ role: 'user', content: prompt }],
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
