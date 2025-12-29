// Minimal Cloudflare Worker proxy to Lambda

function cors(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,x-app-secret,stripe-signature",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, origin = "*", status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || "*";
    const url = new URL(request.url);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: cors(origin) });
    }

    // Health
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true, mode: "PROXY_TO_LAMBDA" }, origin, 200);
    }

    if (request.method === "POST" && url.pathname === "/chat") {
      const upstream = (env.OPENAI_PROXY_URL || "").trim();
      if (!upstream) return json({ ok: false, error: "OPENAI_PROXY_URL not set" }, origin, 500);

      // Read client body
      const raw = await request.text();
      let payload = {};
      try { payload = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "invalid_json" }, origin, 400); }

      // Adapter: if client sent {prompt}, convert to Lambda's chat schema
      // Otherwise pass through as-is
      let bodyForLambda = payload;
      if (typeof payload.prompt === "string" && payload.prompt.trim()) {
        bodyForLambda = {
          mode: "chat",
          messages: [{ role: "user", content: payload.prompt }],
          // pass through optional fields if you had them
          ...("history" in payload ? { messages: [
            ...(Array.isArray(payload.history) ? payload.history : []),
            { role: "user", content: payload.prompt }
          ] } : {}),
        };
      }

      // Forward headers that might matter
      const fwd = new Headers();
      const ct = request.headers.get("Content-Type"); if (ct) fwd.set("Content-Type", ct);
      const auth = request.headers.get("Authorization"); if (auth) fwd.set("Authorization", auth);
      const sig = request.headers.get("stripe-signature"); if (sig) fwd.set("stripe-signature", sig);
      const appSecret = request.headers.get("x-app-secret"); if (appSecret) fwd.set("x-app-secret", appSecret);

      // Call Lambda Function URL (no extra path)
      const resp = await fetch(upstream, {
        method: "POST",
        headers: fwd,
        body: JSON.stringify(bodyForLambda),
      });

      // Debug view
      if (url.searchParams.get("debug") === "1") {
        const text = await resp.text();
        return new Response(JSON.stringify({
          ok: resp.ok,
          status: resp.status,
          from: "lambda",
          upstream,
          body: maybeJson(text),
        }, null, 2), {
          status: resp.ok ? 200 : resp.status,
          headers: { "Content-Type": "application/json", ...cors(origin) }
        });
      }

      // Normal proxy: stream through
      const headers = new Headers(resp.headers);
      for (const [k, v] of Object.entries(cors(origin))) headers.set(k, v);
      return new Response(resp.body, { status: resp.status, headers });
    }

    return new Response("Not found", { status: 404, headers: cors(origin) });
  }
};

function maybeJson(text) {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
