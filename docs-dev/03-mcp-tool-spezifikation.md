# 03 – MCP-Tool-Spezifikation

> **Warum das wichtig ist:** Der Agent wählt Tools anhand ihrer `description` aus.
> Eine vage oder zu allgemeine Beschreibung führt dazu, dass ein Tool nicht (oder
> zur falschen Zeit) aufgerufen wird. Die Beschreibungen unten sind bewusst konkret
> formuliert und sollten in `server/src/tools/*.ts` wörtlich übernommen werden.

Alle Tools nutzen [Zod](https://zod.dev/) für das Eingabeschema, wie es die aktuelle
`@modelcontextprotocol/server`-API vorsieht (`registerTool(name, config, handler)`).

---

## `get_joke`

**API:** [JokeAPI](https://v2.jokeapi.dev): `https://v2.jokeapi.dev/joke/{Kategorie}?lang={de|en}&safe-mode[&contains=…]`

Welche der 10 Endpunkte wir brauchen und welche Felder übrig bleiben, ist auf
Seite 2 des Guides hergeleitet (`docs-guide/02-harness.md`, „Zum Anfassen“).

**Beschreibung (für den Agenten):**
> "Liefert einen kurzen, jugendfreien Witz aus der Kategorie Programmierung oder
> gemischt. Mit topic kann nach einem Stichwort gefiltert werden (z. B. 'coffee' für
> Kaffeewitze). Die Stichwortsuche funktioniert praktisch nur mit lang=en, der
> deutsche Bestand ist klein (rund 30 Witze). Nutze es, wenn ein Screen einen Witz
> zeigen soll. Erfinde nie selbst einen Witz, sondern rufe das Tool bei Bedarf
> erneut auf."

**Eingabeschema:**

```ts
z.object({
  category: z.enum(['Programming', 'Any']).default('Programming')
    .describe('Programming = Programmierwitze, Any = gemischt'),
  lang: z.enum(['de', 'en']).default('de'),
  topic: z.string().max(30).optional().describe('Stichwort, z. B. "coffee"')
})
```

**Rückgabe (Erfolg):**

```json
{
  "setup": "Was macht ein Informatiker, wenn sein Wagen nicht mehr anspringt?",
  "punchline": "Aussteigen, einsteigen und nochmal starten.",
  "lang": "de"
}
```

- `twopart`-Witze: `setup` → `setup`, `delivery` → `punchline`.
- `single`-Witze: `joke` → `setup`, `punchline` ist ein leerer String.
- `safe-mode` ist **fest im Code** und nicht Teil des Schemas. Ob Unpassendes
  gefiltert wird, entscheidet nicht das Modell.
- **Stolperstein (getestet 01.10.2026):** `safe-mode=` mit leerem Wert, wie ihn
  `URLSearchParams.set('safe-mode', '')` erzeugt, ignoriert die API stillschweigend
  und liefert auch Witze mit `"safe": false`. Deshalb `safe-mode=true` senden und
  zusätzlich im Code prüfen, dass `safe` wirklich `true` ist.
- `flags`, `id`, `safe`, `category` und `error` fliegen raus.
- **Kein HTML-Decoding.** Die Texte kommen als normales UTF-8 (Umlaute sind kein
  Problem). Witz 14 enthält absichtlich `gro&szlig;en`, das ist dort die Pointe.

**Fehlerfälle:**

| Fall | Verhalten |
|---|---|
| Kein Treffer für `topic` (API: HTTP 400, `"error": true`, `"code": 106`) | `isError: true` mit dem Hinweis *„Kein Witz zu diesem Stichwort. Versuche es ohne topic oder mit lang=en.“* Der Hinweis ist eine Handlungsempfehlung an das Modell |
| JokeAPI antwortet nicht (Timeout/Netzwerk) | `isError: true`, Textinhalt beschreibt den Fehler; Agent soll den Fehler melden und **keinen Witz erfinden** (siehe `05-fehler-und-fallbacks.md`) |
| Anderer HTTP-Fehler (4xx/5xx), z. B. Rate-Limit (120 Anfragen pro Minute) | `isError: true`, HTTP-Status und `message` der API im Text |
| `category` oder `lang` mit ungültigem Wert | Wird bereits durch Zod vor dem Tool-Aufruf abgelehnt (Validierungsfehler) |

---

## `get_date_info`

**Beschreibung (für den Agenten):**
> "Liefert das aktuelle Datum, den Wochentag und die ISO-8601-Kalenderwoche als
> strukturierte Daten. Verwendet ausschließlich die Systemzeit – erfindet oder
> schätzt niemals ein Datum. Nutze dieses Tool immer, wenn ein Screen das aktuelle
> Datum oder die Kalenderwoche anzeigen soll."

**Eingabeschema:** keines (leeres Objekt `z.object({})`).

**Rückgabe:**

```json
{
  "isoDate": "2026-09-30",
  "day": 30,
  "month": 9,
  "year": 2026,
  "weekday": "Mittwoch",
  "isoWeek": 40,
  "formatted": "30 / 09 / 2026"
}
```

**Fehlerfälle:** praktisch keine, da rein deterministisch aus `new Date()`
berechnet (siehe `server/src/lib/dateInfo.ts`, ISO-8601-Wochenberechnung nach
Donnerstagsregel). Das Tool sollte **bewusst kein LLM und keinen externen Dienst**
verwenden – das ist die zentrale Lernbotschaft dieses Tools.

---

## `render_joke_screen`

**Beschreibung (für den Agenten):**
> "Erzeugt den Witz-des-Tages-Screen für das E-Ink-Display (800×480 Pixel,
> Graustufen) und übergibt die Daten an das Witz-Plugin in LaraPaper, das den Screen
> rendert. Das Gerät zeigt ihn beim nächsten Refresh. Eingaben: joke = ein Witz aus
> get_joke, bei Bedarf von dir ins Deutsche übersetzt und gekürzt (setup max. 140,
> punchline max. 100 Zeichen, keine Emojis, Pointe nicht verändern); date = Ergebnis
> von get_date_info, unverändert übernehmen. Rufe es als letzten Schritt auf. Nur für
> diesen Screen gedacht: andere Inhalte (Zitat, Geschichte, HTTP-Status) über
> update_plugin, reinen Text über show_message."

> Hinweis: Hieß ursprünglich `render_screen`. Umbenannt, weil der Name ein
> allgemeines Rendering versprach, das Schema aber fest einen Witz und ein Datum
> verlangt.

**Eingabeschema:**

```ts
z.object({
  joke: z.object({
    setup: z.string().min(1).max(200)
      .describe('Aufbau des Witzes bzw. der ganze Witz bei Einzeilern, max. ca. 140 Zeichen'),
    punchline: z.string().max(120)
      .describe('Pointe, max. ca. 100 Zeichen; leer bei Einzeilern')
  }),
  date: z.object({
    formatted: z.string().describe('z. B. "30 / 09 / 2026"'),
    weekday: z.string(),
    isoWeek: z.number().int().min(1).max(53)
  })
})
```

Die Zod-Grenzen liegen bewusst über den Zielwerten aus der Beschreibung. Zu lange
Texte werden nicht abgelehnt, sondern gekürzt und mit Warnung zurückgemeldet (siehe
Fehlerfälle). So bricht der Lauf nicht an ein paar Zeichen zu viel ab.

**Rückgabe (Erfolg):**

```json
{
  "filename": "screen-20260930-0900.png",
  "imageUrl": "http://localhost:3000/images/screen-20260930-0900.png",
  "width": 800,
  "height": 480,
  "sizeBytes": 38410
}
```

Mit LaraPaper (Webhook-Plugin, siehe `06-recherche-trmnl.md`) entfallen Datei und
URL. Dann kommt `{ "plugin": "witz", "status": "updated" }` zurück.

**Fehlerfälle:**

| Fall | Verhalten |
|---|---|
| `setup` oder `punchline` länger als die Zielwerte | Wird vor dem Rendern an einer Wortgrenze gekürzt (mit "…"), zusätzlich Warnung im Rückgabetext, damit der Agent nachbessern kann |
| Rendering schlägt fehl (Headless-Browser-Fehler, Timeout) | `isError: true`; das zuletzt erfolgreich gerenderte Bild bleibt unverändert aktiv |
| Ergebnis-PNG über dem Größenlimit (siehe unten) | Automatische Nachbearbeitung (Graustufen-Palette, Kompression); wenn danach immer noch zu groß: `isError: true` mit Hinweis auf zu komplexes Layout |

**Größenlimit:** TRMNL-Displays erwarten PNG-Dateien **unter ca. 90 KB** bei
800×480 px und wenigen Graustufen (siehe Briefing, Abschnitt 3 – vor dem
Produktivbetrieb gegen die aktuelle TRMNL/Terminus-Doku prüfen, da sich Werte
ändern können). `render_joke_screen` prüft die Dateigröße nach dem Rendern und
reduziert bei Bedarf automatisch nach (siehe `server/src/lib/render.ts`).

---

## `show_message` (optional)

**Beschreibung (für den Agenten):**
> "Zeigt einen frei wählbaren Text ohne Witz- oder Datumsbezug großflächig auf dem
> Display an. Nutze dieses Tool nur, wenn explizit eine reine Textnachricht gewünscht
> ist – für den Witz des Tages ist render_joke_screen zuständig."

**Eingabeschema:**

```ts
z.object({
  text: z.string().max(200)
})
```

**Rückgabe:** wie `render_joke_screen`, ohne Datumsspalte – der gesamte Screen
wird für den Text genutzt (Schriftgröße 48 px, zentriert).

---

## `get_device_status` (optional)

**Beschreibung (für den Agenten):**
> "Liefert den zuletzt vom TRMNL-Gerät gemeldeten Status: Akkuspannung, WLAN-Signal
> (RSSI), Firmware-Version und Zeitpunkt der letzten Abfrage. Nutze dieses Tool, um
> zu prüfen, ob das Gerät erreichbar ist oder der Akku bald geladen werden muss."

**Eingabeschema:** keines.

**Rückgabe:**

```json
{
  "batteryVoltage": 4.01,
  "rssi": -54,
  "firmwareVersion": "1.8.16",
  "lastSeenAt": "2026-09-30T08:31:00Z"
}
```

**Fehlerfälle:** Wenn sich das Gerät seit dem letzten Serverstart noch nie gemeldet
hat, liefert das Tool `null`-Werte statt eines Fehlers – das ist ein normaler
Zustand direkt nach dem Einrichten, kein Ausfall.

---

## Konsistenz-Hinweis

Die Feldnamen in diesem Dokument (`joke.punchline`, `date.isoWeek`, …)
müssen 1:1 mit den Zod-Schemas in `server/src/tools/*.ts` übereinstimmen. Wenn du
während der Session ein Feld umbenennst, hier und im Code gleichzeitig anpassen –
sonst bricht `render_joke_screen` mit einem für den Agenten schwer verständlichen
Validierungsfehler ab (guter Kandidat für den Abschnitt "Bewusst kaputt machen" in
`anleitung.md`).
