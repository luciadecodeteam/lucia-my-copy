const router = require('express').Router();
const { readKv2 } = require('../lib/vault');
const { callAI } = require('../lib/ai');

// POST /api/secure-prompts  → metadata stub
router.post('/', async (req, res) => {
  const { name = 'Untitled', slot_type = 'account' } = req.body || {};
  return res.json({ ok: true, id: 'prompt-id-dev', name, slot_type });
});

// GET /api/secure-prompts/:id → metadata stub
router.get('/:id', async (req, res) => {
  return res.json({ id: req.params.id, name: 'Example', slot_type: 'account' });
});

// POST /api/secure-prompts/:id/test → read from Vault then call AI (dev-stub)
router.post('/:id/test', async (req, res) => {
  try {
    const path = `lucia/prompts/${req.params.id}`;
    let prompt = 'Hello from dev-stub prompt';
    try {
      const data = await readKv2(path);
      if (data && data.prompt) prompt = data.prompt;
    } catch (_) {}
    const result = await callAI(prompt);
    return res.json({ result });
  } catch (e) {
    return res.status(500).json({ error: 'test_failed' });
  }
});

// POST /api/secure-prompts/:id/revoke → stub
router.post('/:id/revoke', async (_req, res) => {
  return res.json({ revoked: true });
});

module.exports = router;
