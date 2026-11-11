// Netlify Function "apple-music": sucht einen Künstler bei Apple Music und gibt den Link auf seine Künstlerseite zurück.
// Version 2.19.1 (11.11.2026), gehört zu Backstage 2.19.1. Bei jeder Änderung dieser Datei die Nummer mit der Seite erhöhen.
// Grund: Auf dem iPhone ignoriert die Musik App den Suchbegriff eines Such Links, ein Link auf die Künstlerseite klappt dagegen.
// Genutzt wird die öffentliche iTunes Suche von Apple, ohne Schlüssel.
const SHARED_TOKEN = "mbcc"; // dasselbe Passwort wie in der Seite, hält Fremde fern

const headers = { "Content-Type": "application/json" };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

// Für den Vergleich: klein, ohne Akzente und Sonderzeichen ("Fjørt" und "FJORT" sind gleich)
const norm = (s) => String(s || "").toLowerCase().replace(/ø/g, "o").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

function artistUrl(a) {
  try {
    const u = new URL(a.artistLinkUrl);
    if (u.hostname !== "music.apple.com") return null;
    u.search = ""; // ?uo=4 und ähnliches weglassen
    return u.toString();
  } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST erwartet" });
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Ungültige Anfrage" }); }
  if (payload.token !== SHARED_TOKEN) return reply(401, { error: "Nicht erlaubt" });
  const term = String(payload.artist || "").trim().slice(0, 100);
  if (!term) return reply(400, { error: "Künstler fehlt" });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const q = new URLSearchParams({ term, entity: "musicArtist", media: "music", country: "de", limit: "10" });
    const r = await fetch(`https://itunes.apple.com/search?${q}`, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) return reply(502, { error: `Apple antwortet nicht (${r.status})` });
    const data = await r.json();
    const list = (Array.isArray(data.results) ? data.results : []).filter((a) => a && a.artistLinkUrl);
    // Genau passender Name zuerst, sonst der erste Treffer von Apple
    const best = list.find((a) => norm(a.artistName) === norm(term)) || list[0];
    const url = best ? artistUrl(best) : null;
    return reply(200, { url, name: best ? best.artistName : null, exact: !!(best && norm(best.artistName) === norm(term)) });
  } catch (e) {
    console.error(e);
    return reply(502, { error: e && e.name === "AbortError" ? "Apple braucht zu lange" : "Abruf fehlgeschlagen" });
  } finally {
    clearTimeout(timer);
  }
};
