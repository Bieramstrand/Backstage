// Netlify Function "taplist": liest die aktuelle Taplist (Bier vom Fass) einer Location von ihrer Untappd Seite.
// Kein Perplexity Schlüssel nötig, es wird nur die öffentliche Untappd Seite abgerufen.
// Erlaubt sind nur Links von untappd.com und untp.beer (Kurzlinks der Untappd App).
const SHARED_TOKEN = "mbcc"; // dasselbe Passwort wie in der Seite, hält Fremde fern

const headers = { "Content-Type": "application/json" };
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

const hostAllowed = (host) => host === "untappd.com" || host.endsWith(".untappd.com") || host === "untp.beer";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", bull: "•", middot: "·", euro: "€" };
function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m));
}
function textOf(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}
const comma = (v) => String(v).replace(".", ",");

// Liest die nummerierten Biere ("1. Name", Link auf /b/...) und die Angaben dahinter.
function parseTaps(html) {
  const anchorRe = /<a\b[^>]*href=["']([^"']*\/b\/[^"']*)["'][^>]*>\s*(\d{1,3})\.\s*([^<]+?)\s*<\/a>/gi;
  const found = [];
  let m;
  while ((m = anchorRe.exec(html))) found.push({ n: Number(m[2]), name: decode(m[3]).trim(), start: m.index, end: anchorRe.lastIndex });

  const taps = [];
  let lastN = 0;
  for (let i = 0; i < found.length && taps.length < 80; i++) {
    const f = found[i];
    if (f.n <= lastN) break; // die Nummerierung beginnt von vorn: nächster Menüabschnitt (Flaschen, Dosen ...)
    lastN = f.n;
    const limit = i + 1 < found.length ? found[i + 1].start : f.end + 2000;
    const text = textOf(html.slice(f.end, Math.min(limit, f.end + 2000)));

    const abvM = text.match(/(\d+(?:[.,]\d+)?)\s*%\s*ABV/i);
    let style = abvM ? text.slice(0, abvM.index).trim() : "";
    if (style.length > 60) style = "";
    const bm = text.match(/IBU\s*[•·]\s*([^•·(]+?)\s*(?:[•·]|\(|$)/i);
    const ratingM = text.match(/\((\d(?:[.,]\d{1,2})?)\)/);

    const prices = [];
    const priceRe = /(\d+(?:[.,]\d+)?)\s*(ml|cl|l)\b\s*(\d+(?:[.,]\d{1,2})?)\s*(?:EUR|€)/gi;
    let pm;
    while ((pm = priceRe.exec(text)) && prices.length < 6) {
      const price = Number(String(pm[3]).replace(",", "."));
      prices.push({ size: `${comma(pm[1])} ${pm[2].toLowerCase()}`, price: `${price.toFixed(2).replace(".", ",")} €` });
    }
    const beforePrices = prices.length ? text.slice(0, text.search(priceRe)) : text;
    const tags = ["Vegan", "Fresh Hop", "Gluten Free"].filter((t) => new RegExp("\\b" + t + "\\b", "i").test(beforePrices));

    taps.push({
      n: f.n,
      name: f.name,
      style,
      abv: abvM ? comma(abvM[1]) : "",
      brewery: bm ? bm[1].trim() : "",
      rating: ratingM ? comma(ratingM[1]) : "",
      tags,
      sizes: prices,
    });
  }
  return taps;
}

exports.parseTaps = parseTaps;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "POST erwartet" });
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "Ungültige Anfrage" }); }
  if (payload.token !== SHARED_TOKEN) return reply(401, { error: "Nicht erlaubt" });

  let u;
  try { u = new URL(String(payload.url || "").trim()); } catch { return reply(400, { error: "Link ungültig" }); }
  if (u.protocol !== "https:" || !hostAllowed(u.hostname)) return reply(400, { error: "Nur Untappd Links sind erlaubt" });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(u.toString(), {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });
    let finalHost = u.hostname;
    try { finalHost = new URL(r.url).hostname; } catch { /* bei Umleitung ohne URL Angabe den ersten Host behalten */ }
    if (!hostAllowed(finalHost)) return reply(400, { error: "Nur Untappd Links sind erlaubt" });
    if (!r.ok) return reply(502, { error: `Untappd antwortet nicht (${r.status})` });
    const html = (await r.text()).slice(0, 3000000);
    const taps = parseTaps(html);
    return reply(200, { taps, count: taps.length, url: r.url || u.toString() });
  } catch (e) {
    console.error(e);
    return reply(502, { error: e && e.name === "AbortError" ? "Untappd braucht zu lange" : "Abruf fehlgeschlagen" });
  } finally {
    clearTimeout(timer);
  }
};
