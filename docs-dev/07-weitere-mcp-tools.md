# 07 – Weitere MCP-Tools: Tagesinhalte und Tagesplaylist

Erweiterung zu `03-mcp-tool-spezifikation.md`. Ziel: zeigen, dass ein MCP-Server
ein dünner Adapter um **bestehende APIs** ist, und dem Agenten genug Quellen geben,
um eine ganze LaraPaper-Playlist zu befüllen.

Alle APIs wurden am 30.09.2026 live getestet und funktionieren ohne API-Key.

## Architektur: zwei Server

| Server | Tools | Zweck |
|---|---|---|
| `trmnl-display` (bestehend) | `get_weather`, `get_date_info`, `render_weather_screen`, **neu:** `update_plugin`, `show_message` | Alles rund ums Display |
| `tagesinhalte` (neu) | `get_joke`, `get_http_status`, `get_quote_of_the_day`, `get_on_this_day` | Reine Datenquellen, wissen nichts vom Display |

Die Trennung ist gewollt. Der Agent kombiniert die Server, und `tagesinhalte` ließe
sich ohne Änderung auch in anderen Harnesses oder Projekten nutzen.

```
server/src/
├── mcp-server.ts            ← trmnl-display
├── tagesinhalte-server.ts   ← neuer Einstiegspunkt
├── lib/
│   ├── jokes.ts  httpStatus.ts  quotes.ts  onThisDay.ts   ← API-Aufrufe
│   └── larapaper.ts                                        ← Webhook / display/update
└── tools/ …
```

---

## `get_joke`

**API:** [JokeAPI](https://sv443.net/jokeapi/v2/): `https://v2.jokeapi.dev/joke/{Kategorie}?lang=de&safe-mode[&contains=…]`

**Beschreibung (für den Agenten):**
> "Liefert einen kurzen, jugendfreien Witz. Kategorien: Programmierung oder
> gemischt. Mit `topic` kann nach einem Stichwort gefiltert werden (z. B. 'coffee'
> für Kaffeewitze – Stichwortsuche funktioniert am zuverlässigsten auf Englisch).
> Nutze es für auflockernde Display-Inhalte."

**Eingabeschema:**
```ts
z.object({
  category: z.enum(['Programming', 'Any']).default('Programming'),
  lang: z.enum(['de', 'en']).default('de'),
  topic: z.string().max(30).optional().describe('Stichwort, z. B. "coffee"')
})
```

**Rückgabe:** `{ "setup": "…", "punchline": "…", "lang": "de" }`. Einzeilige Witze
(`type: "single"`) werden auf `setup` abgebildet, `punchline` ist dann leer.

**Fehlerfälle:** Kein Treffer für `topic` → API liefert `"error": true`. Das Tool
gibt dann `isError: true` mit dem Hinweis *„Kein Witz zu diesem Stichwort, versuche
es ohne topic oder mit lang=en“* zurück. Der Hinweis ist eine Handlungsempfehlung
an das Modell.

---

## `get_http_status`

**API:** [http.dog](https://http.dog): `https://http.dog/{code}.json`, alternativ [http.cat](https://http.cat) (nur Bild)

**Beschreibung (für den Agenten):**
> "Liefert Titel und Bild-URL zu einem HTTP-Statuscode (z. B. 418 → 'I'm a teapot').
> Gedacht für humorvolle Nerd-Inhalte: Schreibe selbst einen kurzen Witz oder
> Kommentar zum Status. Das Bild ist ein Foto und eignet sich nur mit Dithering
> für E-Ink."

**Eingabeschema:** `z.object({ code: z.number().int().min(100).max(599) })`

**Rückgabe (getestet):**
```json
{ "status_code": 418, "title": "I'm a teapot", "image": "https://http.dog/418.jpg" }
```

**Hinweis:** Die API liefert keinen Witz. **Der Witz entsteht im Modell.** Das ist
ein gutes Beispiel für die Aufgabenteilung: Fakten kommen aus dem Tool, die
Kreativität aus dem Modell.

---

## `get_quote_of_the_day`

**API:** [ZenQuotes](https://zenquotes.io): `https://zenquotes.io/api/today`

**Beschreibung (für den Agenten):**
> "Liefert das Zitat des Tages (englisch) mit Autor. Wechselt täglich um 00:00 UTC.
> Übersetze bei Bedarf ins Deutsche, nenne aber immer den Autor und verändere den
> Sinn nicht."

**Eingabeschema:** keines.

**Rückgabe:** `{ "quote": "…", "author": "…", "attribution": "zenquotes.io" }`

**Besonderheiten:**
- Limit ohne Key: **5 Anfragen pro 30 Sekunden**. Das Tool sollte das Ergebnis
  pro Tag im Speicher cachen.
- **Quellenangabe ist Pflicht** (Link auf zenquotes.io). Deshalb gibt es das Feld
  `attribution`, und das Plugin-Layout zeigt es klein im Fuß an.

---

## `get_on_this_day`

**API:** [Wikimedia Feed API](https://api.wikimedia.org/wiki/Feed_API/Reference/On_this_day):
`https://api.wikimedia.org/feed/v1/wikipedia/de/onthisday/selected/{MM}/{DD}`
(`User-Agent`-Header setzen, das ist Wikimedia-Richtlinie)

**Beschreibung (für den Agenten):**
> "Liefert historische Ereignisse, die an einem Kalendertag stattfanden (Quelle:
> deutsche Wikipedia). Nutze es für 'Heute vor X Jahren'-Inhalte. Wähle für ein
> Display ein allgemein interessantes, nicht belastendes Ereignis."

**Eingabeschema:**
```ts
z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  limit: z.number().int().min(1).max(10).default(5)
})
```

**Rückgabe:** `[{ "year": 1938, "text": "…" }, …]`, Text auf 200 Zeichen gekürzt.

**Stolperstein (beim Test gefunden):** Die deutschen Texte enthalten **weiche
Trennstriche** (`U+00AD`, z. B. „Welt­reise“). Im Browser unsichtbar, auf E-Ink
unter Umständen als Kästchen oder Lücke. → Im Tool entfernen:
`text.replaceAll('­', '')`. Zusätzlich enthält `selected` oft Kriege oder
Katastrophen. Die Auswahl überlassen wir bewusst dem Modell (siehe Beschreibung).

---

## `update_plugin` (Server `trmnl-display`)

Befüllt ein LaraPaper-Webhook-Plugin (siehe `06-recherche-trmnl.md`, Weg B).

**Beschreibung (für den Agenten):**
> "Schreibt Inhalte in eines der vorbereiteten Display-Plugins (wetter, zitat,
> geschichte, witz). Das Layout ist im Plugin festgelegt – übergib nur die Felder,
> die das jeweilige Plugin erwartet. Texte vorher auf Display-Länge kürzen
> (max. 160 Zeichen pro Feld), keine Emojis."

**Eingabeschema:**
```ts
z.discriminatedUnion('plugin', [
  z.object({ plugin: z.literal('zitat'),
             fields: z.object({ quote: z.string().max(160), author: z.string() }) }),
  z.object({ plugin: z.literal('geschichte'),
             fields: z.object({ year: z.number().int(), text: z.string().max(160) }) }),
  z.object({ plugin: z.literal('witz'),
             fields: z.object({ setup: z.string().max(160), punchline: z.string().max(160) }) }),
  z.object({ plugin: z.literal('wetter'),
             fields: z.object({ /* wie render_weather_screen */ }) })
])
```

**Warum `discriminatedUnion`:** Das Modell sieht im Schema genau, welche Felder zu
welchem Plugin gehören. Ein generisches `fields: z.record(z.any())` wäre bequemer,
würde aber falsche Feldnamen erst im Display sichtbar machen (leere Platzhalter).

**Implementierung:** Plugin-Name → UUID aus `.env` (`LARAPAPER_PLUGIN_ZITAT=…`), dann
`POST /api/custom_plugins/{uuid}` mit `{ "merge_variables": fields }`. Die UUIDs
bekommt das Modell **nie zu sehen**, denn sie sind Zugangsdaten.

---

## `show_message` (Server `trmnl-display`)

Neu umgesetzt über `POST /api/display/update` (Sanctum-Token, `device_id`,
`markup`). Beschreibung und Schema wie in `03-mcp-tool-spezifikation.md`. Das
Markup baut das Tool aus einer festen Vorlage. **Das Modell liefert nur den Text,
kein HTML**, sonst könnte es beliebiges Blade/PHP-Markup einschleusen.

> ⚠️ Sicherheitsnotiz: `display/update` rendert `markup` als **Blade**. Blade kann
> PHP ausführen. Freies Markup vom Modell wäre also Code-Ausführung auf dem
> LaraPaper-Server. Deshalb: nur Text rein, HTML-escapen, feste Vorlage.

---

## Ablauf „Tagesplaylist“

Auftrag: *„Stell die Playlist für heute zusammen: Wetter, ein Zitat, ein Ereignis aus
der Geschichte und zum Abschluss ein Kaffee-Witz.“*

1. `get_date_info` → Datum für `get_on_this_day`
2. parallel: `get_weather`, `get_quote_of_the_day`, `get_on_this_day`, `get_joke(topic: "coffee", lang: "en")`
3. Modell: Ereignis auswählen, Zitat und Witz übersetzen, alles kürzen, Tagesmessage schreiben
4. 4 × `update_plugin`
5. LaraPaper rotiert bei jedem Geräte-Refresh zum nächsten Plugin der Playlist

## Offene Punkte

- [ ] Plugins `zitat`, `geschichte`, `witz` in LaraPaper anlegen (Webhook, Liquid-Markup) und in die Playlist aufnehmen
- [ ] Wie verhält sich JokeAPI mit `contains` + `lang=de`? (Deutscher Bestand ist klein → evtl. immer `en` + Übersetzung)
- [ ] ZenQuotes-Quellenangabe im Plugin-Layout unterbringen
