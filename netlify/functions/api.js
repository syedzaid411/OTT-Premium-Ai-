// Netlify Function: API keys stay on the server, never in the browser.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-code",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const send = (statusCode, body) => ({
  statusCode,
  headers: { ...CORS, "content-type": "application/json" },
  body: JSON.stringify(body),
});

// FIX 1: read the response as text first, so a non-JSON reply
// (HTML error page, empty body) does not crash the function.
async function readJson(r) {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: "non-json response from upstream", status: r.status, raw: text.slice(0, 300) };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return send(405, { error: "POST only" });

  // FIX 2: header names can arrive in different cases; trim spaces/newlines.
  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  const code = (headers["x-code"] || "").trim();
  const expected = (process.env.ACCESS_CODE || "").trim();
  if (!expected || code !== expected) return send(401, { error: "bad code" });

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch { return send(400, { error: "bad json" }); }

  try {
    if (b.type === "check") return send(200, { ok: true });

    if (b.type === "tmdb") {
      // FIX 3: trim the key (a pasted key often has a hidden space/newline).
      const key = (process.env.TMDB_KEY || "").trim();
      if (!/^\/[\w\/\-]*$/.test(b.path || "")) return send(400, { error: "bad path" });
      const qs = new URLSearchParams(b.params || {});
      const h = {};
      if (key.length > 60) h.Authorization = "Bearer " + key; // v4 token
      else qs.set("api_key", key); // v3 key
      const r = await fetch("https://api.themoviedb.org/3" + b.path + "?" + qs, { headers: h });
      return send(r.status, await readJson(r));
    }

    if (b.type === "ai") {
      const base = (process.env.AI_BASE || "https://api.groq.com/openai/v1").trim();
      const model = b.vision
        ? (process.env.AI_VISION_MODEL || "qwen/qwen3.6-27b").trim()
        : (process.env.AI_MODEL || "openai/gpt-oss-120b").trim();
      // FIX 3 again: trim the AI key.
      const aiKey = (process.env.AI_KEY || process.env.GROQ_API_KEY || "").trim();
      if (!aiKey) return send(500, { error: "AI_KEY missing on server" });

      const r = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer " + aiKey,
        },
        body: JSON.stringify({ model, messages: b.messages || [], temperature: 0.7, max_tokens: 1200 }),
      });
      const data = await readJson(r);

      // FIX 4: log the real upstream error in Netlify Functions logs
      // and tell the frontend which model failed.
      if (!r.ok) console.error("AI error", r.status, model, JSON.stringify(data));
      return send(r.status, r.ok ? data : { ...data, model_used: model });
    }

    return send(400, { error: "unknown type" });
  } catch (e) {
    console.error("handler crash", e);
    return send(500, { error: String(e.message || e) });
  }
};
                  
