# Lucia Secure MVP Skeleton
Scaffold for React (frontend), Node/Express (backend), Vault, S3, Firebase, Stripe, OpenAI.

Next:
1) cd backend && npm i
2) cd ../frontend && npm i
3) Fill env files (*.example → actual)
4) Start: backend `npm run dev`, frontend `npm run dev`

## Stripe configuration

- Provide `STRIPE_SECRET_KEY` and `WEBHOOK_SIGNING_SECRET` (or `STRIPE_WEBHOOK_SECRET`) as environment variables **or** expose them via AWS Secrets Manager using the ARN in `LUCIA_STRIPE_SECRET_ARN`.
- Optional overrides: `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, `STRIPE_PORTAL_RETURN_URL`.
- Live price IDs are injected via `PRICE_WEEKLY` and `PRICE_MONTHLY` environment variables (or compatible `STRIPE_PRICE_*` fallbacks).
- The frontend publishable key is read from `VITE_STRIPE_PUBLISHABLE_KEY` and defaults to the live key provided by Stripe.

## OpenAI proxy

- Set `OPENAI_PROXY_URL` if you need to override the default Lambda URL.
- Optionally set `LUCIA_OPENAI_PROMPT_SECRET` (Secrets Manager) or `OPENAI_SYSTEM_PROMPT` to inject the private system prompt when calling the proxy.
