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
    const { band } = JSON.parse(event.body || '{}');

    if (!band) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bandname fehlt' }) };
    }

    const prompt = `Suche gründlich nach aktuellen und anstehenden Konzerttermine für die Band "${band}" – mit Fokus auf Hamburg, aber auch generell in Deutschland.

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
  "ticketUrl": "Direkter Link zum Ticketverkauf (z.B. von Eventim, Ticketmaster, der Venue-Website), falls bekannt, sonst leerer String",
  "isOnTour": true/false (true, falls die Band IRGENDWO in Deutschland/Europa aktuell oder demnächst einen Termin hat, auch wenn NICHT in Hamburg – dieses Feld möglichst nicht auf false setzen, ohne wirklich gründlich gesucht zu haben),
  "nearestShowDate": "TT.MM.JJJJ des nächstgelegenen/nächsten bekannten Tourtermins, falls isOnTour true ist, sonst leerer String",
  "nearestShowInfo": "Falls isOnTour true ist und hasHamburgShow false: kurze Info zum nächstgelegenen oder nächsten bekannten Tourtermin (Ort/Venue), sonst leerer String"
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
        temperature: 0.1
      })
    });

    const data = await response.json();
    const rawContent = data.choices[0].message.content.trim();
    const concertData = JSON.parse(rawContent.replace(/```json|```/g, ''));

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
