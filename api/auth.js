// Vercel Serverless Function - POST /api/auth
// Verifies the access password against the APP_PASSWORD environment variable.
// If APP_PASSWORD is not set, the app is open (no gate). The password is never
// shipped to the browser; it is only compared server-side.
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const expected = process.env.APP_PASSWORD;
  if (!expected) return res.status(200).json({ ok: true, configured: false });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const pw = (body && body.password) || "";
  if (pw === expected) return res.status(200).json({ ok: true, configured: true });
  return res.status(401).json({ ok: false, configured: true });
};
