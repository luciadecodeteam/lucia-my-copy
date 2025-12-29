# Post-deploy Checklist
- Client injects Vault AppRole (role_id + secret_id) in hosting.
- Add OpenAI, Stripe, Firebase, S3 creds (Vault or platform secrets).
- Verify /healthz, then frontend → /api/secure-prompts/:id/test.
