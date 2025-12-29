# High-level
User → React (Vercel) → Node API (Render/Fly) → Vault (HCP) → AWS Lambda (OpenAI proxy)
                                  ↘ S3 (encrypted) / Firebase / Stripe (Secrets Manager)

No prompts/files in DB or logs. Secrets only in Vault. Backend reads at runtime.
