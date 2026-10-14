// Netlify Function "search-location": sucht Gastronomie Locations im Web und liefert Name und Adresse.
// Nutzt denselben Perplexity Schlüssel wie die Konzert Abfrage (Umgebungsvariable PERPLEXITY_API_KEY).
// Falls die Variable bei get-concerts anders heißt, hier den Namen anpassen.
const SHARED_TOKEN = "mbcc"; // dasselbe Passwort wie in der Seite, hält Fremde fern
const TYPES = ["Restaurant", "Café", "Bar", "Imbiss", "Biergarten", "Sonstiges"];

const headers = { "Content-Type": "application/json" };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST erwartet" });
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Ungültige Anfrage" }); }
  const query = typeof payload.query === "string" ? payload.query.trim().slice(0, 120) : "";
  if (payload.token !== SHARED_TOKEN) return reply(401, { error: "Nicht erlaubt" });
  if (query.length < 2) return reply(400, { error: "Suchbegriff fehlt" });

  const prompt = `Finde bis zu 5 passende Gastronomie Locations (Restaurant, Café, Bar, Imbiss, Biergarten) in Deutschland zur Suche: "${query}".
Wenn in der Suche kein Ort steht, bevorzuge Hamburg.
Antworte ausschließlich mit JSON, ohne weiteren Text und ohne Codeblock:
{"results":[{"name":"","type":"","street":"","zip":"","city":"","website":"","note":""}]}
Regeln:
- type ist genau einer von: ${TYPES.join(", ")}
- street enthält Straße und Hausnummer, Hausnummernbereiche als "7 bis 11"
- zip ist die fünfstellige PLZ, city der Ort (bei Hamburg "Hamburg", nicht der Stadtteil)
- website ist nur die offizielle Seite der Location, sonst leer
- note ist kurz (Küche, Besonderheit, Preisklasse), höchstens 100 Zeichen
- Nur real existierende Locations, nichts erfinden. Unbekannte Felder bleiben leere Strings.
- Die beste Übereinstimmung mit dem Suchbegriff steht zuerst.`;

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
        max_tokens: 900,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) return reply(502, { error: "Suche fehlgeschlagen" });
    const data = await r.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return reply(200, { results: [] });
    const parsed = JSON.parse(match[0]);
    const clean = (v) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
    const results = (Array.isArray(parsed.results) ? parsed.results : [])
      .slice(0, 5)
      .map((x) => ({
        name: clean(x.name),
        type: TYPES.includes(x.type) ? x.type : "Restaurant",
        street: clean(x.street),
        zip: clean(x.zip).replace(/\D/g, "").slice(0, 5),
        city: clean(x.city),
        website: /^https?:\/\//i.test(clean(x.website)) ? clean(x.website) : "",
        note: clean(x.note).slice(0, 100),
      }))
      .filter((x) => x.name);
    return reply(200, { results });
  } catch (e) {
    console.error(e);
    return reply(500, { error: "Auswertung fehlgeschlagen" });
  }
};
