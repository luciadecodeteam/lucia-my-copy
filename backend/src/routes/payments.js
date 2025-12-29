const express = require('express');

const router = express.Router();
const {
  createCheckoutSessionForTier,
  createPortalSession,
  verifyWebhookSignature,
  handleWebhookEvent,
} = require('../lib/stripe');

const payRouter = express.Router();

const TEXT_CONTENT_TYPES = [
  'text/plain',
  'text/plain;charset=utf-8',
  'text/plain; charset=utf-8',
];
const textParser = express.text({ type: TEXT_CONTENT_TYPES, limit: '256kb' });
const jsonParser = express.json({ limit: '1mb' });

payRouter.use((req, res, next) => {
  const contentType = (req.headers['content-type'] || '').toLowerCase();
  if (TEXT_CONTENT_TYPES.some(type => contentType.startsWith(type))) {
    return textParser(req, res, next);
  }
  return jsonParser(req, res, next);
});

function parseRequestBody(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      const e = new Error('Request body must be valid JSON');
      e.statusCode = 400;
      e.code = 'invalid_json';
      throw e;
    }
  }
  return {};
}

payRouter.post('/checkout', async (req, res) => {
  try {
    const payload = parseRequestBody(req.body);
    const { tier, uid, email, price, quantity, metadata } = payload || {};
    const session = await createCheckoutSessionForTier({ tier, uid, email, price, quantity, metadata });
    return res.json({ url: session.url, id: session.id });
  } catch (err) {
    const status = err?.statusCode || 500;
    const message = err?.message || 'Failed to create checkout session';
    console.error('Stripe checkout error', { message, code: err?.code });
    return res.status(status).json({ error: err?.code || 'checkout_failed', message });
  }
});

router.post('/create-checkout-session', async (req, res) => {
  try {
    const payload = parseRequestBody(req.body);
    const { tier, uid, email, price, quantity, metadata } = payload || {};
    if (!tier && !price) {
      return res.status(400).json({ error: 'invalid_tier', message: 'Tier or price is required' });
    }
    const session = await createCheckoutSessionForTier({ tier, uid, email, price, quantity, metadata });
    return res.json({ url: session.url, id: session.id });
  } catch (err) {
    const status = err?.statusCode || 500;
    const message = err?.message || 'Failed to create checkout session';
    console.error('Stripe checkout error', { message, code: err?.code });
    return res.status(status).json({ error: err?.code || 'checkout_failed', message });
  }
});

router.post('/create-portal-session', async (req, res) => {
  try {
    const { uid, email } = req.body || {};
    const session = await createPortalSession({ uid, email });
    return res.json({ url: session.url, id: session.id });
  } catch (err) {
    const status = err?.statusCode || 500;
    const message = err?.message || 'Failed to create billing portal session';
    console.error('Stripe portal error', { message, code: err?.code });
    return res.status(status).json({ error: err?.code || 'portal_failed', message });
  }
});

async function webhookHandler(req, res) {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).send('Missing stripe-signature header');
  }
  try {
    const event = await verifyWebhookSignature(req.body, signature);
    await handleWebhookEvent(event);
    return res.status(200).json({ received: true });
  } catch (err) {
    const status = err?.statusCode || 400;
    const message = err?.message || 'Webhook signature verification failed';
    console.error('Stripe webhook error', { message, code: err?.code });
    return res.status(status).send(`Webhook Error: ${message}`);
  }
}

module.exports = {
  router,
  payRouter,
  webhookHandler,
};
