// Vercel Serverless Function — POST /api/extract
// Extracts structured reinsurance quote fields from a raw email using OpenAI.
// The API key is read from the OPENAI_API_KEY environment variable and is
// NEVER exposed to the browser. The front-end calls fetch('/api/extract').
//
// Set the key in Vercel:  Project → Settings → Environment Variables → OPENAI_API_KEY
// Local dev:  put OPENAI_API_KEY=sk-... in .env.local and run `vercel dev`.

const SYSTEM_PROMPT = `You are a reinsurance placement assistant for a treaty broker.
Extract the key terms from an inbound reinsurer QUOTE email and return ONLY a
JSON object with EXACTLY these keys (use the string "—" when a value is absent):

{
  "reinsurer": "name of the quoting reinsurer",
  "umr": "the placement / UMR reference if present, else —",
  "layer1_rol": "rate on line for the first/lowest layer, e.g. 11.5%",
  "layer2_rol": "rate on line for the second layer",
  "layer3_rol": "rate on line for the third/top layer",
  "written_line": "the written line / share offered, e.g. 35%",
  "reinstatements": "reinstatement terms, e.g. 1 @ 100%",
  "valid_until": "quote validity / firm-until date, e.g. 30 Jun 2026",
  "conditions": "short summary of conditions/exclusions (cyber, sanctions, SOV, etc.)"
}

Rates on line must be returned as percentages with a % sign. Do not invent
values that are not in the email. Return strictly valid JSON, no prose.`;

module.exports = async function handler(req, res) {
  // Basic CORS (same-origin in practice; harmless if called cross-origin)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server." });
  }

  // Vercel parses JSON bodies automatically for Node functions; fall back just in case.
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const email = (body && body.email) || "";
  if (!email || email.length < 10) {
    return res.status(400).json({ error: "Provide an 'email' string in the request body." });
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: "Extract the quote terms from this email:\n\n" + email.slice(0, 8000) },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return res.status(502).json({ error: "OpenAI request failed", status: resp.status, detail: detail.slice(0, 500) });
    }

    const json = await resp.json();
    const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    let data;
    try { data = JSON.parse(content); } catch { return res.status(502).json({ error: "Model did not return valid JSON", raw: content }); }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Extraction failed", detail: String(err && err.message ? err.message : err) });
  }
};
