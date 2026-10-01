# 07 – Weitere MCP-Tools: Tagesinhalte und Tagesplaylist

Erweiterung zu `03-mcp-tool-spezifikation.md`. Ziel: zeigen, dass ein MCP-Server
ein dünner Adapter um **bestehende APIs** ist, und dem Agenten genug Quellen geben,
um eine ganze LaraPaper-Playlist zu befüllen.

Alle APIs wurden am 30.09.2026 live getestet und funktionieren ohne API-Key.

## Architektur: zwei Server

| Server | Tools | Zweck |
|---|---|---|
| `trmnl-display` (bestehend) | `get_joke`, `get_date_info`, `render_joke_screen`, **neu:** `update_plugin`, `list_plugins`, `get_plugin`, `show_message` | Witz des Tages und alles rund ums Display |
| `tagesinhalte` (neu) | `get_http_status`, `get_quote_of_the_day`, `get_on_this_day` | Reine Datenquellen, wissen nichts vom Display |

`get_joke` ist das Haupttool des Projekts und in `03-mcp-tool-spezifikation.md`
spezifiziert. Es bleibt im Server `trmnl-display`, weil es zum Kern-Ablauf gehört.

Die Trennung ist gewollt. Der Agent kombiniert die Server, und `tagesinhalte` ließe
sich ohne Änderung auch in anderen Harnesses oder Projekten nutzen.

```
server/src/
├── mcp-server.ts            ← trmnl-display
├── tagesinhalte-server.ts   ← neuer Einstiegspunkt
├── lib/
│   ├── jokes.ts                                            ← aus 03 (trmnl-display)
│   ├── httpStatus.ts  quotes.ts  onThisDay.ts              ← API-Aufrufe
│   └── larapaper.ts                                        ← Seiten auflisten, lesen, hochladen
└── tools/ …
server/templates/
└── witz.blade.php  zitat.blade.php  geschichte.blade.php  http.blade.php  nachricht.blade.php
```

Alle Display-Tools laufen über **eine** Funktion in `lib/larapaper.ts`, die eine
Seite komplett hochlädt: `pushPage(plugin, data)`. Sie lädt die Vorlage, setzt die
Revisionsmarke, baut `settings.yml`, packt das ZIP und schickt es an die
Archiv-Schnittstelle (Details: `03-mcp-tool-spezifikation.md`, `render_joke_screen`,
und `06-recherche-trmnl.md`, Abschnitt 7.7).

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

Überschreibt eine der vorbereiteten Seiten in LaraPaper (static-Recipe, siehe
`06-recherche-trmnl.md`, Abschnitt 7.7).

**Beschreibung (für den Agenten):**
> "Schreibt Inhalte in eine der vorbereiteten Display-Seiten (zitat, geschichte,
> http) und ersetzt dabei den bisherigen Inhalt. Das Layout ist festgelegt – übergib
> nur die Felder, die die jeweilige Seite erwartet. Texte vorher auf Display-Länge
> kürzen (max. 160 Zeichen pro Feld), keine Emojis. Die Seite erscheint, sobald sie in
> der Playlist wieder an der Reihe ist. Für den Witz des Tages ist render_joke_screen
> zuständig."

**Eingabeschema:**
```ts
z.discriminatedUnion('plugin', [
  z.object({ plugin: z.literal('zitat'),
             fields: z.object({ quote: z.string().max(160), author: z.string() }) }),
  z.object({ plugin: z.literal('geschichte'),
             fields: z.object({ year: z.number().int(), text: z.string().max(160) }) }),
  z.object({ plugin: z.literal('http'),
             fields: z.object({ code: z.number().int(), title: z.string(),
                                comment: z.string().max(160) }) })
])
```

**Warum `discriminatedUnion`:** Das Modell sieht im Schema genau, welche Felder zu
welcher Seite gehören. Ein generisches `fields: z.record(z.any())` wäre bequemer,
würde aber falsche Feldnamen erst im Display sichtbar machen (leere Platzhalter).

**Implementierung:** `pushPage(plugin, fields)`. Die Zuordnung Seite → `trmnlp_id`
steht in `.env` (`LARAPAPER_PAGE_ZITAT=…`), die Vorlage in
`server/templates/{plugin}.blade.php`. `fields` landen ausschließlich in
`static_data`, nie im Markup.

**Rückgabe:** `{ "plugin": "zitat", "status": "updated", "rev": "…", "hint": "…" }`

---

## Inhalte prüfen und korrigieren: `list_plugins` und `get_plugin`

Wenn auf dem Display etwas Falsches steht, soll der Agent die betroffene Seite
finden, ihren aktuellen Inhalt lesen und gezielt korrigieren können. Ohne
Lese-Tools könnte er nur blind neu schreiben.

### `list_plugins`

**Beschreibung (für den Agenten):**
> "Listet die Display-Seiten auf, die du bearbeiten kannst, mit Anzeigename und
> letzter Änderung. Nutze es, wenn der Nutzer einen Fehler auf dem Display meldet und
> unklar ist, welche Seite betroffen ist."

**Eingabeschema:** keines.

**Rückgabe:**
```json
{
  "plugins": [
    { "plugin": "witz",       "name": "Witz des Tages",    "found": true },
    { "plugin": "zitat",      "name": "Zitat des Tages",   "found": true },
    { "plugin": "geschichte", "name": "Heute vor …",       "found": false }
  ],
  "other": ["Kalender", "Wetter (Recipe)"]
}
```

**Implementierung:** `GET /api/plugin_settings` liefert alle Plugins des Users
(`id` = `trmnlp_id`, `name`). Das Tool gleicht sie mit der `.env`-Zuordnung ab.
`found: false` heißt, die Seite wurde in LaraPaper gelöscht oder die ID in `.env`
stimmt nicht. `other` zeigt fremde Seiten nur mit Namen, **bearbeiten lassen sie sich
nicht**: Sie sind nicht in der Zuordnung, und ein Upload würde sie komplett
überschreiben.

### `get_plugin`

**Beschreibung (für den Agenten):**
> "Liefert den aktuellen Inhalt einer Display-Seite (die Felder, wie sie zuletzt
> geschrieben wurden) und den Zeitpunkt der letzten Änderung. Nutze es vor einer
> Korrektur, damit du nur das Falsche änderst und den Rest übernimmst."

**Eingabeschema:**
```ts
z.object({ plugin: z.enum(['witz', 'zitat', 'geschichte', 'http', 'nachricht']) })
```

**Rückgabe:**
```json
{ "plugin": "zitat", "fields": { "quote": "…", "author": "Unbekannt" },
  "rev": "2026-10-01T09:00:12Z" }
```

**Implementierung:** `GET /api/plugin_settings/{trmnlp_id}/archive` liefert die Seite
als ZIP. `settings.yml` auslesen, `static_data` parsen → `fields`. Die Revisionsmarke
aus der ersten Zeile des Markups → `rev`. Das Markup selbst gibt das Tool **nicht**
zurück: Das Modell soll Inhalte korrigieren, nicht das Layout.

### Ablauf „Inhalt ist falsch“

Auftrag: *„Beim Zitat auf dem Display steht ‚Unbekannt‘ als Autor. Prüf das und
korrigier es.“*

1. `list_plugins` → die Seite `zitat` ist gemeint
2. `get_plugin(zitat)` → aktueller Text und Autor
3. `get_quote_of_the_day` → Original mit Autor
4. `update_plugin(zitat, …)` mit korrigiertem Autor und unverändertem Zitat
5. Erscheint, sobald die Seite in der Playlist wieder dran ist

**Grenze:** Playlists selbst sind über die API nicht lesbar. Welche Seite in welcher
Playlist steckt, wird einmalig in der LaraPaper-Oberfläche festgelegt. Damit der
Agent sich zurechtfindet, tragen die Seiten eindeutige Namen.

---

## `show_message` (Server `trmnl-display`)

Beschreibung, Schema und Umsetzung stehen in `03-mcp-tool-spezifikation.md`: eigene
Seite „Nachricht“, leerer Text blendet sie über `TRMNL_SKIP_DISPLAY` aus.

> ⚠️ Sicherheitsnotiz: LaraPaper rendert die Seiten als **Blade**, und Blade kann
> PHP ausführen. Deshalb liefert das Modell bei allen Display-Tools **nur Text**. Die
> Vorlagen liegen fest im MCP-Server und geben Text nur über `{{ }}` (escapt) aus.
> Auch `POST /api/display/update` nutzen wir aus diesem Grund nicht.

---

## Ablauf „Tagesplaylist“

Auftrag: *„Stell die Playlist für heute zusammen: ein Kaffee-Witz, ein Zitat, ein
Ereignis aus der Geschichte und zum Abschluss ein HTTP-Status mit einem Spruch dazu.“*

1. `get_date_info` → Datum für `get_on_this_day` und den Witz-Screen
2. parallel: `get_joke(topic: "coffee", lang: "en")`, `get_quote_of_the_day`, `get_on_this_day`, `get_http_status(418)`
3. Modell: Ereignis auswählen, Witz und Zitat übersetzen, Spruch zum Statuscode schreiben, alles kürzen
4. `render_joke_screen` für den Witz, 3 × `update_plugin` für Zitat, Geschichte und HTTP-Status
5. LaraPaper rotiert bei jedem Geräte-Refresh zur nächsten Seite der Playlist. Jede
   Seite wird beim nächsten Mal, wenn sie dran ist, mit dem neuen Inhalt gerendert.

## Offene Punkte

- [ ] Seiten `witz`, `zitat`, `geschichte`, `http`, `nachricht` anlegen: je
      `POST /api/plugin_settings` → `trmnlp_id` in `.env`, dann ein erster Upload mit
      der Vorlage. Danach **einmalig in der Oberfläche** in die Playlist aufnehmen.
      Ein kleines Script `npm run pages:init` spart das Abtippen.
- [ ] Archiv-Schnittstelle einmal mit `curl` gegen die eigene LaraPaper-Instanz
      testen (Upload, Export, Revisionsmarke, `TRMNL_SKIP_DISPLAY`)
- [x] Wie verhält sich JokeAPI mit `contains` + `lang=de`? Getestet am 01.10.2026:
      `contains=kaffee` mit `lang=de` liefert HTTP 400 (`code: 106`, kein Treffer), der
      deutsche Bestand hat nur 29 jugendfreie Witze. Für Themenwitze also `lang=en`
      plus Übersetzung durch das Modell (siehe `04-prompt-design.md`).
- [ ] ZenQuotes-Quellenangabe im Plugin-Layout unterbringen
