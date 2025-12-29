Lucía Worker
============

Endpoints:
- GET / or /chat or /api/chat -> health JSON
- POST /chat or /api/chat     -> { prompt, history? } -> { reply }

Env (Dashboard -> Variables/Secrets):
- DUMMY_MODE: "true" (echo) or "false" (OpenAI)
- OPENAI_API_URL: https://api.openai.com/v1/chat/completions
- OPENAI_MODEL: gpt-4o-mini
- OPENAI_API_KEY: (Secret)
