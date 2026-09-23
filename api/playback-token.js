// Returns short-lived Mux playback tokens for one lesson, only to a signed-in
// student whose Supabase row-level security lets them read that lesson.
// Needs two Vercel environment variables: MUX_SIGNING_KEY_ID and MUX_SIGNING_PRIVATE_KEY.
const crypto = require("crypto");

const SUPABASE_URL = "https://pnalfkdewygqdmblxjoq.supabase.co";
const SUPABASE_KEY = "sb_publishable_QAIFChbnZk9PM3pbWzEGFA_sNsFlOuD"; // publishable key, safe to be public
const TOKEN_MINUTES = 240;

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function privateKeyPem() {
  const raw = (process.env.MUX_SIGNING_PRIVATE_KEY || "").trim();
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  return Buffer.from(raw, "base64").toString("utf8"); // Mux gives the key base64-encoded
}

function muxToken(playbackId, audience, keyId, pem) {
  const header = { alg: "RS256", typ: "JWT", kid: keyId };
  const claims = { sub: playbackId, aud: audience, exp: Math.floor(Date.now() / 1000) + TOKEN_MINUTES * 60, kid: keyId };
  const body = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(claims));
  const sig = crypto.createSign("RSA-SHA256").update(body).sign(pem);
  return body + "." + b64url(sig);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const lessonId = String((req.query && req.query.lesson) || "");
    const auth = String(req.headers.authorization || "");
    if (!/^[0-9a-f-]{36}$/i.test(lessonId)) return res.status(400).json({ error: "bad_lesson" });
    if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "signed_out" });

    // Ask Supabase as the student. Row-level security only returns the lesson
    // if they're allowed to see it (active course enrollment or free preview).
    const r = await fetch(`${SUPABASE_URL}/rest/v1/lessons?id=eq.${lessonId}&select=video_url`, {
      headers: { apikey: SUPABASE_KEY, Authorization: auth },
    });
    if (r.status === 401) return res.status(401).json({ error: "signed_out" });
    if (!r.ok) return res.status(502).json({ error: "lookup_failed" });
    const rows = await r.json();
    if (!rows.length || !rows[0].video_url) return res.status(403).json({ error: "no_access" });

    const keyId = process.env.MUX_SIGNING_KEY_ID;
    const pem = privateKeyPem();
    if (!keyId || !pem.includes("PRIVATE KEY")) return res.status(500).json({ error: "keys_missing" });

    const playbackId = rows[0].video_url.trim();
    return res.status(200).json({
      playbackId,
      playback: muxToken(playbackId, "v", keyId, pem),
      thumbnail: muxToken(playbackId, "t", keyId, pem),
      storyboard: muxToken(playbackId, "s", keyId, pem),
    });
  } catch (e) {
    return res.status(500).json({ error: "server_error" });
  }
};
