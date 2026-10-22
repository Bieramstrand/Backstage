// Netlify Function "search-location": sucht Gastronomie Locations im Web und liefert Name und Adresse.
// Nutzt denselben Perplexity Schlüssel wie die Konzert Abfrage (Umgebungsvariable PERPLEXITY_API_KEY).
// Falls die Variable bei get-concerts anders heißt, hier den Namen anpassen.
// Zwei Arten von Anfragen: "query" sucht eine bestimmte Location, "topic" holt Tipps zu einem Thema (Burger, Steak ...)
// aus Blogs, Creator Seiten und Magazinen.
const SHARED_TOKEN = "mbcc"; // dasselbe Passwort wie in der Seite, hält Fremde fern
const TOPICS = ["Burger", "Steak", "Schnitzel", "Pizza", "Chicken", "Tacos", "Fisch", "Griechisch", "Craftbeer", "Bars"];
const TYPES = ["Restaurant", "Bar", "Craftbeer Bar", "Imbiss", "Burger", "Chicken", "Griechisch", "All You Can Eat", "Pizza", "Steak", "Tacos", "Fisch", "Sonstiges"];

const headers = { "Content-Type": "application/json" };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

// Prüft in einer eigenen, zweiten Anfrage, ob die Tipps noch in Betrieb sind (getrennt, damit jede Anfrage unter dem Zeitlimit bleibt).
const normName = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
async function verifyPlaces(list) {
  const clean = (v) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
  const items = list.slice(0, 8).map((x) => ({ name: clean(x && x.name), street: clean(x && x.street), zip: clean(x && x.zip).replace(/\D/g, "").slice(0, 5), city: clean(x && x.city) })).filter((x) => x.name);
  if (items.length === 0) return reply(400, { error: "Keine Locations" });
  const today = new Date().toISOString().slice(0, 10);
  const lines = items.map((x, i) => { const addr = [x.street, [x.zip, x.city].filter(Boolean).join(" ")].filter(Boolean).join(", "); return `${i + 1}. ${x.name}${addr ? " (" + addr + ")" : ""}`; }).join("\n");
  const prompt = `Heute ist der ${today}. Prüfe für jede dieser Gastronomie Locations in Hamburg, ob sie aktuell noch in Betrieb ist:
${lines}
Antworte ausschließlich mit JSON, ohne weiteren Text und ohne Codeblock:
{"checks":[{"name":"","status":"offen","hint":""}]}
Regeln:
- name genau so, wie oben angegeben
- status ist genau einer von: offen, geschlossen, unklar
- "offen" nur, wenn du in aktuellen Quellen (offizielle Website, Verzeichnisse, Karteneinträge, Presse, Social Media der letzten 12 Monate) Hinweise findest, dass die Location in Betrieb ist
- "geschlossen" nur bei klaren Hinweisen auf eine dauerhafte Schließung (Geschäftsaufgabe, Insolvenz, "dauerhaft geschlossen", Umzug ohne Nachfolger am Ort). Ruhetage oder Betriebsferien sind nicht geschlossen.
- "unklar", wenn du es nicht sicher sagen kannst. Nichts erfinden.
- hint ist ein kurzer Beleg, höchstens 80 Zeichen`;
  try {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
      body: JSON.stringify({ model: "sonar", temperature: 0.1, max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) return reply(502, { error: "Prüfung fehlgeschlagen" });
    const data = await r.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    const match = text.match(/\{[\s\S]*\}/);
    let raw = [];
    if (match) { try { const parsed = JSON.parse(match[0]); raw = Array.isArray(parsed.checks) ? parsed.checks : []; } catch { raw = []; } }
    const checks = items.map((it) => {
      const n = normName(it.name);
      const hit = raw.find((c) => normName(c && c.name) === n) || raw.find((c) => { const m = normName(c && c.name); return m && n && (m.includes(n) || n.includes(m)); });
      const st = hit && typeof hit.status === "string" ? hit.status.toLowerCase().trim() : "";
      return { name: it.name, status: st === "offen" ? "open" : st === "geschlossen" ? "closed" : "unknown", hint: hit && typeof hit.hint === "string" ? hit.hint.trim().slice(0, 80) : "" };
    });
    return reply(200, { checks });
  } catch (e) {
    console.error(e);
    return reply(500, { error: "Prüfung fehlgeschlagen" });
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST erwartet" });
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Ungültige Anfrage" }); }
  const query = typeof payload.query === "string" ? payload.query.trim().slice(0, 120) : "";
  if (payload.token !== SHARED_TOKEN) return reply(401, { error: "Nicht erlaubt" });
  if (Array.isArray(payload.verify)) return verifyPlaces(payload.verify);
  const topic = typeof payload.topic === "string" ? payload.topic.trim() : "";
  if (topic && !TOPICS.includes(topic)) return reply(400, { error: "Thema unbekannt" });
  if (!topic && query.length < 2) return reply(400, { error: "Suchbegriff fehlt" });

  const rules = (extra) => `Antworte ausschließlich mit JSON, ohne weiteren Text und ohne Codeblock:
{"results":[{"name":"","type":"","street":"","zip":"","city":"","website":"","note":"","source":""}]}
Regeln:
- type ist genau einer von: ${TYPES.join(", ")}
- Craftbeer Bar nur für Bars mit Schwerpunkt auf Craft Beer, Burger für Läden, die vor allem Burger anbieten
- Pizza für Pizzerien, Steak für Steakhäuser, Chicken für Läden mit Schwerpunkt Hähnchen, Griechisch für griechische Restaurants, All You Can Eat für Läden mit Buffet oder All You Can Eat Konzept, Tacos für mexikanische Taco Läden und Taquerias, Fisch für Fischrestaurants und Fischimbisse
- street enthält Straße und Hausnummer, Hausnummernbereiche als "7 bis 11"
- zip ist die fünfstellige PLZ, city der Ort (bei Hamburg "Hamburg", nicht der Stadtteil)
- website ist nur die offizielle Seite der Location, sonst leer
- note ist kurz (Küche, Besonderheit, Preisklasse), höchstens 100 Zeichen
- Nur real existierende, aktuell geöffnete Locations, nichts erfinden. Unbekannte Felder bleiben leere Strings.
${extra}`;
  const tipsPrompt = `Nenne bis zu 8 Gastronomie Locations in Hamburg zum Thema "${topic}", die Foodblogger, Food Creator (YouTube, TikTok, Instagram, Blogs), Stadtmagazine oder lokale Medien aktuell empfehlen.
Suche dafür ausdrücklich auch auf genussguide-hamburg.com (Genuss Guide Hamburg), hamburg.mitvergnuegen.com (Mit Vergnügen Hamburg) und geheimtipphamburg.de, Kategorie Essen und Trinken (Geheimtipp Hamburg), zum Beispiel mit site: Suchen, und nutze deren Top Listen, Tests und Beiträge zusätzlich zu anderen Quellen.
${rules(`- source nennt, wer die Location empfiehlt, zum Beispiel den Namen des Creators, Blogs oder Magazins (bei den genannten Seiten "Genuss Guide Hamburg", "Mit Vergnügen Hamburg" bzw. "Geheimtipp Hamburg"; ist der Beitrag ausdrücklich als Anzeige oder Kooperation gekennzeichnet, hänge " (Anzeige)" an), höchstens 80 Zeichen
- Nenne nur Empfehlungen, die du in deinen Suchergebnissen tatsächlich findest. Kannst du keine konkrete Empfehlung belegen, bleibt source ein leerer String.
- Bevorzuge Empfehlungen der letzten zwei Jahre.
- Lass jede Location weg, bei der du Hinweise auf eine dauerhafte Schließung findest.`)}`;
  const searchPrompt = `Finde bis zu 5 passende Gastronomie Locations (Restaurant, Bar, Craftbeer Bar, Imbiss, Burger, Chicken, Griechisch, All You Can Eat, Pizza, Steak) in Deutschland zur Suche: "${query}".
Wenn in der Suche kein Ort steht, bevorzuge Hamburg.
Antworte ausschließlich mit JSON, ohne weiteren Text und ohne Codeblock:
{"results":[{"name":"","type":"","street":"","zip":"","city":"","website":"","note":""}]}
Regeln:
- type ist genau einer von: ${TYPES.join(", ")}
- Craftbeer Bar nur für Bars mit Schwerpunkt auf Craft Beer, Burger für Läden, die vor allem Burger anbieten
- Pizza für Pizzerien, Steak für Steakhäuser, Chicken für Läden mit Schwerpunkt Hähnchen, Griechisch für griechische Restaurants, All You Can Eat für Läden mit Buffet oder All You Can Eat Konzept, Tacos für mexikanische Taco Läden und Taquerias, Fisch für Fischrestaurants und Fischimbisse
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
        max_tokens: topic ? 1300 : 900,
        messages: [{ role: "user", content: topic ? tipsPrompt : searchPrompt }],
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
      .slice(0, topic ? 8 : 5)
      .map((x) => ({
        name: clean(x.name),
        type: TYPES.includes(x.type) ? x.type : "Restaurant",
        street: clean(x.street),
        zip: clean(x.zip).replace(/\D/g, "").slice(0, 5),
        city: clean(x.city),
        website: /^https?:\/\//i.test(clean(x.website)) ? clean(x.website) : "",
        note: clean(x.note).slice(0, 100),
        source: topic ? clean(x.source).slice(0, 80) : "",
      }))
      .filter((x) => x.name);
    // Quellen der Websuche (nur Domains), damit man Tipps nachprüfen kann
    const urls = []
      .concat(Array.isArray(data.citations) ? data.citations : [])
      .concat(Array.isArray(data.search_results) ? data.search_results.map((x) => x && x.url) : [])
      .filter((u) => typeof u === "string");
    const sources = [...new Set(urls.map((u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean))].slice(0, 5);
    return reply(200, topic ? { results, sources } : { results });
  } catch (e) {
    console.error(e);
    return reply(500, { error: "Auswertung fehlgeschlagen" });
  }
};
