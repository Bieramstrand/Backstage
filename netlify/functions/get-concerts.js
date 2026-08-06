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

    const prompt = `Suche aktuelle und anstehende Konzerttermine für die Band "${band}" in Hamburg.
Antworte AUSSCHLIESSLICH als valides JSON-Objekt (ohne Markdown-Codeblocks) mit folgender Struktur:
{
  "artist": "${band}",
  "hasHamburgShow": true/false,
  "date": "TT.MM.JJJJ oder 'Kein Termin'",
  "location": "Venue Name & Stadt (z.B. Markthalle Hamburg)",
  "info": "Kurze Info zur Show oder alternative Termine in der Nähe",
  "ticketUrl": "Direkter Link zum Ticketverkauf (z.B. von Eventim, Ticketmaster, der Venue-Website), falls bekannt, sonst leerer String",
  "isOnTour": true/false (true, falls die Band aktuell/demnächst irgendwo auf Tour ist, auch wenn NICHT in Hamburg),
  "nearestShowInfo": "Falls isOnTour true ist und hasHamburgShow false: kurze Info zum nächstgelegenen oder nächsten bekannten Tourtermin (Datum + Stadt), sonst leerer String"
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
          { role: 'system', content: 'Du bist ein präziser API-Assistent für Konzertdaten.' },
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
