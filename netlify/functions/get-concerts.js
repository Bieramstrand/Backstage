// Version 2.22.0 (26.11.2026), gehört zu Backstage 2.22.0. Bei jeder Änderung dieser Datei die Nummer mit der Seite erhöhen.
exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { band, focus } = JSON.parse(event.body || '{}');

    if (!band) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bandname fehlt' }) };
    }

    // Schreibweisen: UNDERØATH und Underoath sind dieselbe Band, Suchen finden sonst nur eine Variante
    const plain = band.replace(/[Øø]/g, (c) => (c === 'Ø' ? 'O' : 'o')).replace(/[Ææ]/g, (c) => (c === 'Æ' ? 'Ae' : 'ae')).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const spelling = plain.toLowerCase() !== band.toLowerCase() ? `Die Band schreibt sich auch "${plain}", suche unter beiden Schreibweisen. ` : '';
    const today = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
    const recent = focus === 'neu'
      ? `ZWEITER SUCHLAUF: Der erste Lauf hat keinen Hamburg Termin gefunden. Konzentriere dich jetzt auf KÜRZLICH ANGEKÜNDIGTE Tourneen (Ankündigungen der letzten Wochen) und suche gezielt nach "${band} Tour 2027", "${band} tour announcement", "${band} Hamburg 2027" und "${band} live Hamburg". Prüfe Musik Nachrichtenseiten, Ticketshops und die Tourdaten Seite der Band. Eine europäische Tour hat oft einen Hamburg Termin, schau die komplette Terminliste durch. `
      : '';
    const prompt = `Heute ist der ${today}. Berücksichtige Termine der nächsten 12 Monate und auch erst kürzlich angekündigte Tourneen. ${spelling}${recent}Suche gründlich nach aktuellen und anstehenden Konzerttermine für die Band "${band}" – mit Fokus auf Hamburg, aber auch generell in Deutschland.

Durchsuche dabei bewusst MEHRERE Arten von Quellen, nicht nur die naheliegendsten:
- Offizielle Website und Social-Media-Kanäle der Band (Instagram, Facebook)
- Große Ticketing-Plattformen (Eventim, Reservix, Ticketmaster, ADticket)
- Konzert-Aggregatoren (Songkick, Bandsintown, Resident Advisor)
- Websites einzelner Venues/Clubs, auch kleinerer und lokaler
- Lokale Presse, Stadtmagazine, regionale Veranstaltungskalender und Konzert-Blogs
Gib nicht nach dem ersten Treffer auf – prüfe mehrere dieser Quellentypen, bevor du zu dem Schluss kommst, dass kein Termin existiert. Auch kleine, wenig bekannte Locations und Vorstädte zählen.

Antworte AUSSCHLIESSLICH als valides JSON-Objekt (ohne Markdown-Codeblocks) mit folgender Struktur:
{
  "artist": "${band}",
  "hasHamburgShow": true/false,
  "date": "TT.MM.JJJJ oder 'Kein Termin'",
  "location": "Venue Name & Stadt (z.B. Markthalle Hamburg)",
  "info": "Kurze Info zur Show oder alternative Termine in der Nähe",
  "ticketUrl": "Direkter Link zur KONKRETEN Event-Seite dieses Konzerts (z.B. von Eventim, Ticketmaster, der Venue-Website) – NIEMALS nur die Startseite eines Anbieters (z.B. NICHT 'eventim.de' allein). Falls kein echter, konkreter Event-Link gefunden wird, leerer String.",
  "ticketAvailability": "'ausverkauft' falls eine Quelle die Hamburg-Show als ausverkauft meldet. 'wenige' falls eine Quelle explizit meldet, dass nur noch wenige Tickets/Restkarten/limitiertes Kontingent verfügbar sind oder die Show 'fast ausverkauft' ist. 'gefragt' falls Quellen eine sehr hohe Nachfrage belegen, zum Beispiel ein Zusatzkonzert wegen großer Nachfrage, eine Verlegung in eine größere Halle, eine Warteliste oder ein Vorverkauf mit sehr schnellem Abverkauf. Sonst leerer String. NICHT raten – nur wenn tatsächlich eine Quelle das so nennt.",
  "ticketNote": "Kurzer Beleg mit Quelle für ticketAvailability, höchstens 80 Zeichen (z.B. 'Eventim: nur noch Restkarten'), sonst leerer String.",
  "isOnTour": true/false (true, falls die Band IRGENDWO in Deutschland/Europa aktuell oder demnächst einen Termin hat, auch wenn NICHT in Hamburg – dieses Feld möglichst nicht auf false setzen, ohne wirklich gründlich gesucht zu haben),
  "nearestShowDate": "TT.MM.JJJJ des nächstgelegenen/nächsten bekannten Tourtermins, falls isOnTour true ist, sonst leerer String",
  "nearestShowInfo": "Falls isOnTour true ist und hasHamburgShow false: kurze Info zum nächstgelegenen oder nächsten bekannten Tourtermin (Ort/Venue), sonst leerer String",
  "nearestShowInGermany": true/false (true, falls dieser nächstgelegene Tourtermin in Deutschland stattfindet, sonst false),
  "nearestShowTicketUrl": "Direkter Link zur KONKRETEN Event-Seite dieses nächstgelegenen Tourtermins (nur falls nearestShowInGermany true ist), NIEMALS nur eine Anbieter-Startseite, sonst leerer String",
  "supportActs": "Namen ALLER weiteren bei der Hamburg-Show auftretenden Bands außer '${band}' selbst – also sowohl Vorbands/Support-Acts ALS AUCH Co-Headliner oder andere Bands, die als Teil derselben gemeinsamen Tour/desselben Konzerts auftreten, durch Komma getrennt (z.B. 'Band A, Band B'), falls bekannt – sonst leerer String. NICHT erfinden, nur wenn tatsächlich eine Quelle das bestätigt.",
  "nearestShowSupportActs": "Namen ALLER weiteren auftretenden Bands (Vorbands/Support-Acts UND Co-Headliner) beim nächstgelegenen Tourtermin (falls nearestShowDate gesetzt ist), durch Komma getrennt, falls bekannt – sonst leerer String",
  "time": "Uhrzeit (Einlass oder Beginn) der Hamburg-Show im Format HH:MM, falls bekannt, sonst leerer String",
  "nearestShowTime": "Uhrzeit des nächstgelegenen Tourtermins im Format HH:MM, falls bekannt, sonst leerer String"
}`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: 'Du bist ein gründlicher Recherche-Assistent für Konzertdaten. Du gibst dich nicht mit dem ersten Suchergebnis zufrieden, sondern prüfst mehrere Quellenarten, bevor du antwortest.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        ...(focus === 'neu' ? { search_recency_filter: 'month' } : {})
      })
    });

    const data = await response.json();
    const rawContent = data.choices[0].message.content.trim();
    const cleaned = rawContent.replace(/```json|```/g, '');
    const concertData = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
    // Nachfrage Angaben bereinigen: nur bekannte Werte, Beleg kurz
    const okAvail = ['ausverkauft', 'wenige', 'gefragt'];
    concertData.ticketAvailability = okAvail.includes(String(concertData.ticketAvailability || '').toLowerCase().trim())
      ? String(concertData.ticketAvailability).toLowerCase().trim() : '';
    concertData.ticketNote = concertData.ticketAvailability && typeof concertData.ticketNote === 'string'
      ? concertData.ticketNote.trim().slice(0, 100) : '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(concertData)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Fehler bei der Abfrage', details: error.message })
    };
  }
};
