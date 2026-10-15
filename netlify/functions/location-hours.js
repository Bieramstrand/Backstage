// Netlify Function "location-hours": sucht die regulären Öffnungszeiten einer Gastronomie Location im Web.
// Nutzt denselben Perplexity Schlüssel wie die Konzert Abfrage und die Locations Suche (Umgebungsvariable PERPLEXITY_API_KEY).
const SHARED_TOKEN = "mbcc"; // dasselbe Passwort wie in der Seite, hält Fremde fern
const DAYS = ["mo", "di", "mi", "do", "fr", "sa", "so"];

const headers = { "Content-Type": "application/json" };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

const WINDOW = /^(\d{1,2}):([0-5]\d)-(\d{1,2}):([0-5]\d)$/;

// Macht aus einer Modellantwort pro Tag entweder "", "geschlossen" oder Zeitfenster wie "12:00-14:30, 17:30-22:00"
function cleanDay(value) {
  if (typeof value !== "string") return "";
  let t = value.trim();
  if (/^(geschlossen|ruhetag|closed)$/i.test(t)) return "geschlossen";
  t = t.replace(/[–—−]/g, "-").replace(/\s*uhr/gi, "").replace(/\s+/g, "");
  const parts = t.split(/[,;]/).filter(Boolean);
  if (parts.length === 0 || parts.length > 4) return "";
  const out = [];
  for (const p of parts) {
    const m = p.match(WINDOW);
    if (!m) return "";
    const h1 = Number(m[1]);
    const h2 = Number(m[3]);
    if (h1 > 24 || h2 > 24) return "";
    out.push(`${String(h1).padStart(2, "0")}:${m[2]}-${String(h2).padStart(2, "0")}:${m[4]}`);
  }
  return out.join(", ");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST erwartet" });
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Ungültige Anfrage" }); }
  if (payload.token !== SHARED_TOKEN) return reply(401, { error: "Nicht erlaubt" });
  const clean = (v) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
  const name = clean(payload.name);
  if (name.length < 2) return reply(400, { error: "Name fehlt" });
  const place = [name, clean(payload.street), [clean(payload.zip), clean(payload.city)].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  const prompt = `Suche die regulären wöchentlichen Öffnungszeiten dieser Gastronomie Location: ${place}
Antworte ausschließlich mit JSON, ohne weiteren Text und ohne Codeblock:
{"hours":{"mo":"","di":"","mi":"","do":"","fr":"","sa":"","so":""}}
Regeln:
- Pro Wochentag entweder Zeitfenster im 24 Stunden Format, zum Beispiel "17:00-23:00", oder bei mehreren Fenstern "12:00-14:30, 17:30-22:00"
- Ruhetag: "geschlossen"
- Schließt die Location nach Mitternacht, schreibe zum Beispiel "18:00-02:00"
- Wenn die Zeiten für einen Tag nicht sicher belegt sind, bleibt der Wert ein leerer String
- Nur die regulären Zeiten, keine Feiertage oder Sonderaktionen. Nichts erfinden.
- Nimm Angaben der offiziellen Website oder eines verlässlichen Verzeichnisses, nur für genau diese Location.`;

  try {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: "sonar",
        temperature: 0.1,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) return reply(502, { error: "Suche fehlgeschlagen" });
    const data = await r.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return reply(200, { hours: null });
    let parsed;
    try { parsed = JSON.parse(match[0]); } catch { return reply(200, { hours: null }); }
    const src = parsed && typeof parsed.hours === "object" && parsed.hours ? parsed.hours : {};
    const hours = {};
    DAYS.forEach((d) => { hours[d] = cleanDay(src[d]); });
    const anyKnown = DAYS.some((d) => hours[d] !== "");
    return reply(200, { hours: anyKnown ? hours : null });
  } catch (e) {
    console.error(e);
    return reply(500, { error: "Auswertung fehlgeschlagen" });
  }
};
