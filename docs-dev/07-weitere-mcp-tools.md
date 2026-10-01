# 07 – Weitere MCP-Tools: Tagesinhalte und Tagesplaylist

Erweiterung zu `03-mcp-tool-spezifikation.md`. Ziel: zeigen, dass ein MCP-Server
ein dünner Adapter um **bestehende APIs** ist, und dem Agenten genug Quellen geben,
um eine ganze LaraPaper-Playlist zu befüllen.

Alle APIs wurden am 30.09.2026 live getestet und funktionieren ohne API-Key.

## Architektur: zwei Server

| Server | Tools | Zweck |
|---|---|---|
| `trmnl-display` (bestehend) | `get_joke`, `get_date_info`, `update_page` (**neu:** Seiten `zitat`, `geschichte`, `http`), **neu:** `list_pages`, `get_page` | Witz des Tages und alles rund ums Display |
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

Alle Seiten laufen über **eine** Funktion in `lib/larapaper.ts`, die eine
Seite komplett hochlädt: `pushPage(page, data)`. Sie lädt die Vorlage, setzt die
Revisionsmarke, baut `settings.yml`, packt das ZIP und schickt es an die
Archiv-Schnittstelle (Details: `03-mcp-tool-spezifikation.md`, `update_page`,
und `06-recherche-trmnl.md`, Abschnitt 7.7).

---

## `get_http_status`

**API:** [http.dog](https://http.dog): `https://http.dog/{code}.json`, alternativ [http.cat](https://http.cat) (nur Bild)

**Beschreibung (für den Agenten):**
> "Liefert Titel und Bild-URL zu einem HTTP-Statuscode (z. B. 418 → 'I'm a teapot').
> Gedacht für humorvolle Nerd-Inhalte. Einen Witz oder Kommentar zum Status liefert
> es nicht, den schreibst du bei Bedarf selbst."

Der frühere Satz zum Bild („Foto, eignet sich nur mit Dithering für E-Ink“) ist
gestrichen. Der Server `tagesinhalte` weiß nichts vom Display, und ob das Bild
gezeigt werden kann, entscheidet die Vorlage der Seite, nicht das Modell.

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
> "Liefert das Zitat des Tages (englisch) mit Autor. Es wechselt täglich um 00:00 UTC,
> mehrfaches Abrufen am selben Tag liefert dasselbe Zitat. Beim Übersetzen den Sinn
> erhalten und den Autor immer nennen."

**Eingabeschema:** keines.

**Rückgabe:** `{ "quote": "…", "author": "…", "attribution": "zenquotes.io" }`

**Besonderheiten:**
- Limit ohne Key: **5 Anfragen pro 30 Sekunden**. Das Tool sollte das Ergebnis
  pro Tag im Speicher cachen.
- **Quellenangabe ist Pflicht** (Link auf zenquotes.io). Deshalb gibt es das Feld
  `attribution`. Die Vorlage `zitat.blade.php` zeigt die Quelle fest im Fuß an,
  deshalb braucht die Seite `zitat` kein eigenes Feld dafür.

---

## `get_on_this_day`

**API:** [Wikimedia Feed API](https://api.wikimedia.org/wiki/Feed_API/Reference/On_this_day):
`https://api.wikimedia.org/feed/v1/wikipedia/de/onthisday/selected/{MM}/{DD}`
(`User-Agent`-Header setzen, das ist Wikimedia-Richtlinie)

**Beschreibung (für den Agenten):**
> "Liefert ausgewählte historische Ereignisse zu einem Kalendertag, mit Jahr und
> Kurztext (Quelle: deutsche Wikipedia). Nutze es für 'Heute vor X Jahren'-Inhalte.
> Die Auswahl enthält oft auch Kriege und Katastrophen, wähle passend zum Zweck."

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
Katastrophen. Die Auswahl überlassen wir bewusst dem Modell. Die Beschreibung sagt
nur, *was* in der Liste steckt. *Was passt*, hängt vom Einsatz ab (Flur-Bildschirm,
Geschichtsunterricht) und steht deshalb im Auftrag oder Systemprompt, nicht im Tool.

---

## Neue Seiten für `update_page` (Server `trmnl-display`)

`update_page` ist in `03-mcp-tool-spezifikation.md` spezifiziert, mit den Seiten
`witz` und `nachricht`. Für die Tagesplaylist kommen drei Seiten dazu. **Es entsteht
kein neues Tool**, und die Beschreibung bleibt unverändert. Pro Seite wächst nur
dreierlei: ein Zweig im Schema, eine Vorlage `server/templates/{page}.blade.php` und
ein Eintrag `LARAPAPER_PAGE_<PAGE>=…` in `.env`.

**Zusätzliche Zweige im Schema:**
```ts
const kurz = z.string().max(160)
  .describe('Max. 160 Zeichen. ' + keineEmojis);

  z.object({ page: z.literal('zitat').describe('Zitat des Tages'),
             fields: z.object({
               quote: kurz.describe('Zitat aus get_quote_of_the_day, bei Bedarf ' +
                 'übersetzt, Sinn erhalten. Max. 160 Zeichen. ' + keineEmojis),
               author: z.string().describe('Autor aus get_quote_of_the_day, ' +
                 'unverändert. Immer angeben') }) }),
  z.object({ page: z.literal('geschichte').describe('Heute vor X Jahren'),
             fields: z.object({
               year: z.number().int().describe('Jahr des Ereignisses aus get_on_this_day'),
               text: kurz.describe('Ereignis aus get_on_this_day, bei Bedarf gekürzt. ' +
                 'Max. 160 Zeichen. ' + keineEmojis) }) }),
  z.object({ page: z.literal('http').describe('HTTP-Status mit Spruch'),
             fields: z.object({
               code: z.number().int().describe('Statuscode aus get_http_status'),
               title: z.string().describe('Titel aus get_http_status, unverändert'),
               comment: kurz.describe('Eigener Spruch zum Status. ' +
                 'Max. 160 Zeichen. ' + keineEmojis) }) })
```

`fields` landen ausschließlich in `static_data`, nie im Markup. Anders als bei `witz`
ergänzt der Server hier nichts, die Seiten zeigen nur, was das Modell liefert.

**Rückgabe:** `{ "page": "zitat", "status": "updated", "rev": "…", "hint": "…" }`

---

## Inhalte prüfen und korrigieren: `list_pages` und `get_page`

Wenn auf dem Display etwas Falsches steht, soll der Agent die betroffene Seite
finden, ihren aktuellen Inhalt lesen und gezielt korrigieren können. Ohne
Lese-Tools könnte er nur blind neu schreiben.

### `list_pages`

**Beschreibung (für den Agenten):**
> "Listet die Display-Seiten auf, die du bearbeiten kannst, mit Kennung und
> Anzeigename, dazu fremde Seiten, die nur angezeigt werden. Nutze es, um
> herauszufinden, welche Seite der Nutzer meint, z. B. wenn er einen Fehler auf dem
> Display meldet."

**Eingabeschema:** keines.

**Rückgabe:**
```json
{
  "pages": [
    { "page": "witz",       "name": "Witz des Tages",    "found": true },
    { "page": "zitat",      "name": "Zitat des Tages",   "found": true },
    { "page": "geschichte", "name": "Heute vor …",       "found": false }
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

### `get_page`

**Beschreibung (für den Agenten):**
> "Liefert den aktuellen Inhalt einer Display-Seite: die Felder, wie sie zuletzt
> geschrieben wurden, und den Zeitpunkt der Änderung, nicht das Layout. Dient dazu,
> bei einer Korrektur nur das Falsche zu ändern und den Rest zu übernehmen."

**Eingabeschema:**
```ts
z.object({ page: z.enum(['witz', 'zitat', 'geschichte', 'http', 'nachricht']) })
```

**Rückgabe:**
```json
{ "page": "zitat", "fields": { "quote": "…", "author": "Unbekannt" },
  "rev": "2026-10-01T09:00:12Z" }
```

**Implementierung:** `GET /api/plugin_settings/{trmnlp_id}/archive` liefert die Seite
als ZIP. `settings.yml` auslesen, `static_data` parsen → `fields`. Die Revisionsmarke
aus der ersten Zeile des Markups → `rev`. Das Markup selbst gibt das Tool **nicht**
zurück: Das Modell soll Inhalte korrigieren, nicht das Layout.

### Ablauf „Inhalt ist falsch“

Auftrag: *„Beim Zitat auf dem Display steht ‚Unbekannt‘ als Autor. Prüf das und
korrigier es.“*

1. `list_pages` → die Seite `zitat` ist gemeint
2. `get_page(zitat)` → aktueller Text und Autor
3. `get_quote_of_the_day` → Original mit Autor
4. `update_page(zitat, …)` mit korrigiertem Autor und unverändertem Zitat
5. Erscheint, sobald die Seite in der Playlist wieder dran ist

**Grenze:** Playlists selbst sind über die API nicht lesbar. Welche Seite in welcher
Playlist steckt, wird einmalig in der LaraPaper-Oberfläche festgelegt. Damit der
Agent sich zurechtfindet, tragen die Seiten eindeutige Namen.

---

## Sicherheit bei allen Seiten

> ⚠️ LaraPaper rendert die Seiten als **Blade**, und Blade kann PHP ausführen. Deshalb
> liefert das Modell bei `update_page` **nur Text**. Die Vorlagen liegen fest im
> MCP-Server und geben Text nur über `{{ }}` (escapt) aus. Auch
> `POST /api/display/update` nutzen wir aus diesem Grund nicht.

---

## Ablauf „Tagesplaylist“

Auftrag: *„Stell die Playlist für heute zusammen: ein Kaffee-Witz, ein Zitat, ein
Ereignis aus der Geschichte und zum Abschluss ein HTTP-Status mit einem Spruch dazu.“*

1. `get_date_info` → Datum für `get_on_this_day` (das Datum auf der Witz-Seite setzt
   der Server selbst)
2. parallel: `get_joke(topic: "coffee", lang: "en")`, `get_quote_of_the_day`, `get_on_this_day`, `get_http_status(418)`
3. Modell: Ereignis auswählen, Witz und Zitat übersetzen, Spruch zum Statuscode schreiben, alles kürzen
4. 4 × `update_page`: `witz`, `zitat`, `geschichte` und `http`
5. LaraPaper rotiert bei jedem Geräte-Refresh zur nächsten Seite der Playlist. Jede
   Seite wird beim nächsten Mal, wenn sie dran ist, mit dem neuen Inhalt gerendert.

## Offene Punkte

- [ ] Seiten `witz`, `zitat`, `geschichte`, `http`, `nachricht` anlegen: je
      `POST /api/plugin_settings` → `trmnlp_id` in `.env`, dann ein erster Upload mit
      der Vorlage. Danach **einmalig in der Oberfläche** in die Playlist aufnehmen.
      Ein kleines Script `npm run pages:init` spart das Abtippen.
- [ ] Archiv-Schnittstelle einmal mit `curl` gegen die eigene LaraPaper-Instanz
      testen (Upload, Export, Revisionsmarke, `TRMNL_SKIP_DISPLAY`, Upload mit
      unbekannter ID: Fehler oder neue Seite?)
- [x] Wie verhält sich JokeAPI mit `contains` + `lang=de`? Getestet am 01.10.2026:
      `contains=kaffee` mit `lang=de` liefert HTTP 400 (`code: 106`, kein Treffer), der
      deutsche Bestand hat nur 29 (also rund 30) jugendfreie Witze. Für Themenwitze
      also `lang=en` plus Übersetzung durch das Modell (siehe `04-prompt-design.md`).
- [ ] ZenQuotes-Quellenangabe fest in `zitat.blade.php` unterbringen
