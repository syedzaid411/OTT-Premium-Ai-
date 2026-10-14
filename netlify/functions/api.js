// Netlify Function: API keys یہاں سرور پر رہتی ہیں، براؤزر میں کبھی نہیں جاتیں۔
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return send(405, { error: "POST only" });

  const code = event.headers["x-code"] || "";
  if (!process.env.ACCESS_CODE || code !== process.env.ACCESS_CODE) return send(401, { error: "bad code" });

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch { return send(400, { error: "bad json" }); }

  try {
    if (b.type === "check") return send(200, { ok: true });

    if (b.type === "tmdb") {
      const key = process.env.TMDB_KEY || "";
      if (!/^\/[\w\/\-]*$/.test(b.path || "")) return send(400, { error: "bad path" });
      const qs = new URLSearchParams(b.params || {});
      const headers = {};
      if (key.length > 60) headers.Authorization = "Bearer " + key; // v4 token
      else qs.set("api_key", key); // v3 key
      const r = await fetch("https://api.themoviedb.org/3" + b.path + "?" + qs, { headers });
      return send(r.status, await r.json());
    }

    if (b.type === "ai") {
      const base = process.env.AI_BASE || "https://api.groq.com/openai/v1";
      const model = b.vision
        ? process.env.AI_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct"
        : process.env.AI_MODEL || "llama-3.3-70b-versatile";
      const r = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer " + (process.env.AI_KEY || process.env.GROQ_API_KEY || ""),
        },
        body: JSON.stringify({ model, messages: b.messages || [], temperature: 0.7, max_tokens: 1200 }),
      });
      return send(r.status, await r.json());
    }

    return send(400, { error: "unknown type" });
  } catch (e) {
    return send(500, { error: String(e.message || e) });
  }
};
