# 03 – MCP-Tool-Spezifikation

> **Warum das wichtig ist:** Der Agent wählt Tools anhand ihrer `description` aus.
> Eine vage oder zu allgemeine Beschreibung führt dazu, dass ein Tool nicht (oder
> zur falschen Zeit) aufgerufen wird. Die Beschreibungen unten sind bewusst konkret
> formuliert und sollten in `server/src/tools/*.ts` wörtlich übernommen werden.

> **Leitgedanke für jede Beschreibung:** *Ändert diese Information, was das Modell tut
> oder sagt?* Hinein gehören Zweck (in den Worten des Nutzers), Herkunft der
> Eingaben, Einschränkungen mit kurzem Grund, Wirkung und Abgrenzung zu anderen
> Tools. Hinaus gehören Hardware (Geräte, Größen, Farbtiefe), Backend (LaraPaper,
> ZIP, Blade) und Ablauf („als letzten Schritt“). Regeln für ein einzelnes Feld
> stehen am Feld (`.describe()`), nicht in der Beschreibung. Ausführlich:
> `docs-guide/06-mcp-was-zaehlt.md`, Regel 1.

Alle Tools nutzen [Zod](https://zod.dev/) für das Eingabeschema, wie es die aktuelle
`@modelcontextprotocol/server`-API vorsieht (`registerTool(name, config, handler)`).

---

## `get_joke`

**API:** [JokeAPI](https://v2.jokeapi.dev): `https://v2.jokeapi.dev/joke/{Kategorie}?lang={de|en}&safe-mode=true[&contains=…]`

Welche der 10 Endpunkte wir brauchen und welche Felder übrig bleiben, ist auf
Seite 2 des Guides hergeleitet (`docs-guide/02-harness.md`, „Zum Anfassen“).

**Beschreibung (für den Agenten):**
> "Liefert einen kurzen, jugendfreien Witz mit Aufbau und Pointe, wahlweise
> Programmierwitz oder gemischt. Mit topic kann nach einem Stichwort gefiltert werden
> (z. B. 'coffee' für Kaffeewitze). Die Stichwortsuche funktioniert praktisch nur mit
> lang=en, der deutsche Bestand ist klein (rund 30 Witze). Nutze es, wann immer ein
> Witz gebraucht wird. Erfinde nie selbst einen Witz, sondern rufe das Tool bei Bedarf
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
> "Liefert das heutige Datum mit Wochentag und ISO-Kalenderwoche. Nutze es, wann
> immer das heutige Datum, der Wochentag oder die Kalenderwoche gebraucht wird, statt
> sie selbst anzunehmen oder zu berechnen."

Dass das Tool die Systemzeit nutzt, steht bewusst nicht in der Beschreibung. Das ist
Umsetzung. Für das Modell zählt nur: hier kommt das Datum her, nicht aus dem eigenen
Wissen.

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

## `update_joke_page`

**Beschreibung (für den Agenten):**
> "Setzt den Witz auf der Display-Seite 'Witz des Tages' und ersetzt den bisherigen.
> Gespeichert wird sofort, angezeigt erst, wenn die Seite wieder an der Reihe ist.
> Nur für diese Seite: Inhalte anderer Seiten über update_page, freien Text über
> show_message."

Was in die Felder gehört (Herkunft, Längen, keine Emojis, Pointe erhalten), steht
im Schema am jeweiligen Feld und nicht noch einmal hier. Eine Reihenfolge („als
letzten Schritt“) nennt die Beschreibung nicht. Sie folgt daraus, dass Witz und
Datum aus `get_joke` und `get_date_info` stammen.

> Hinweis: Hieß ursprünglich `render_screen`, dann `render_joke_screen`. Die erste
> Umbenennung, weil der Name ein allgemeines Rendering versprach, das Schema aber fest
> einen Witz und ein Datum verlangt. Die zweite, weil „render“ und „screen“ sagen,
> *wie* und *worauf* etwas erscheint. Das Tool rendert nichts (das macht LaraPaper),
> und auf welchem Gerät die Seite landet, weiß es nicht. Es setzt den Inhalt einer
> Seite, und genau das sagt `update_joke_page`. Aus demselben Grund heißen
> `update_plugin`, `list_plugins` und `get_plugin` jetzt `update_page`, `list_pages`
> und `get_page`: „Plugin“ ist LaraPaper-Vokabular, der Nutzer spricht von Seiten.

**Eingabeschema:**

```ts
z.object({
  joke: z.object({
    setup: z.string().min(1).max(200)
      .describe('Aufbau bzw. ganzer Einzeiler aus get_joke, auf Deutsch, max. ca. 140 ' +
                'Zeichen. Übersetzen und kürzen erlaubt. Keine Emojis, die Anzeige ' +
                'kann sie nicht darstellen'),
    punchline: z.string().max(120)
      .describe('Pointe aus get_joke, max. ca. 100 Zeichen, leer bei Einzeilern. Beim ' +
                'Übersetzen die Pointe erhalten, nicht erklären. Keine Emojis')
  }),
  date: z.object({
    formatted: z.string().describe('z. B. "30 / 09 / 2026"'),
    weekday: z.string(),
    isoWeek: z.number().int().min(1).max(53)
  }).describe('Rückgabe von get_date_info, unverändert übernehmen')
})
```

Die Zod-Grenzen liegen bewusst über den Zielwerten aus der Beschreibung. Zu lange
Texte werden nicht abgelehnt, sondern gekürzt und mit Warnung zurückgemeldet (siehe
Fehlerfälle). So bricht der Lauf nicht an ein paar Zeichen zu viel ab.

**Rückgabe (Erfolg):**

```json
{
  "page": "witz",
  "status": "updated",
  "rev": "2026-10-01T09:00:12Z",
  "hint": "Erscheint, sobald die Seite in der Playlist an der Reihe ist."
}
```

Kein Bild, keine URL: Das Rendern übernimmt LaraPaper. Der `hint` verhindert, dass
das Modell dem Nutzer „ist jetzt auf dem Display“ verspricht.

**Implementierung (LaraPaper-Archiv-Schnittstelle, siehe `06-recherche-trmnl.md`,
Abschnitt 7.7):**

Die Seite ist ein **static-Recipe** in LaraPaper. Sie wird einmalig angelegt und in
die Playlist aufgenommen (siehe `anleitung.md`, Phase 3 Teil B). Danach überschreibt
das Tool sie bei jedem Aufruf komplett:

1. Texte kürzen (siehe Fehlerfälle) und `static_data` bauen:
   `{ setup, punchline, weekday, date, isoWeek }`.
2. Feste Vorlage `server/templates/witz.blade.php` laden (Layout nach
   `02-layout-spezifikation.md`, Ausgabe nur über `{{ $data['setup'] }}` usw.).
   Davor eine **Revisionsmarke** setzen: `{{-- rev: 2026-10-01T09:00:12Z --}}`.
3. `settings.yml` erzeugen:

   ```yaml
   name: Witz des Tages
   strategy: static
   refresh_interval: 60
   static_data: "{\"setup\":\"Was macht ein Informatiker …\",\"punchline\":\"…\"}"
   ```

   `static_data` ist ein JSON-**String**. Im Code: `JSON.stringify(JSON.stringify(data))`.
   Das ergibt einen gültigen YAML-String in doppelten Anführungszeichen.
4. Beides als ZIP packen (`settings.yml`, `full.blade.php`, z. B. mit `fflate`).
5. `POST {LARAPAPER_URL}/api/plugin_settings/{LARAPAPER_PAGE_WITZ}/archive`,
   Multipart-Feld `file` (Dateiname `witz.zip`), Header
   `Authorization: Bearer {LARAPAPER_TOKEN}` und `Accept: application/json`.

Warum diese Details zählen:

| Detail | Grund |
|---|---|
| Vorlage liegt im MCP-Server, Modell liefert nur Text | LaraPaper rendert Blade, und Blade kann PHP ausführen. Text vom Modell darf nie Teil des Markups werden. |
| Ausgabe mit `{{ }}`, nie `{!! !!}` | `{{ }}` escapt HTML. So bleibt auch Witz 14 mit `&szlig;` korrekt: Er erscheint als Text `&szlig;`, wie gewollt. |
| Revisionsmarke | LaraPaper verwirft das gespeicherte Bild nur, wenn sich das **Markup** ändert. Ohne Marke würde nur `static_data` geändert, und der alte Witz bliebe bis zu `refresh_interval` Minuten stehen. |
| Immer die komplette Seite schicken | Ein Upload ersetzt Name, Layouts und Daten. Was fehlt, ist danach leer. |
| `trmnlp_id` und Token aus `.env` | Konfiguration, kein Modell-Wissen. Das Modell sieht beides nie. |
| `Accept: application/json` | Ohne den Header antwortet Laravel bei Validierungsfehlern mit einer Weiterleitung statt mit einer lesbaren Fehlermeldung. |

**Fehlerfälle:**

| Fall | Verhalten |
|---|---|
| `setup` oder `punchline` länger als die Zielwerte | Wird vor dem Upload an einer Wortgrenze gekürzt (mit "…"), zusätzlich Warnung im Rückgabetext, damit der Agent nachbessern kann |
| LaraPaper nicht erreichbar (Timeout/Netzwerk) | `isError: true`. Die Seite in LaraPaper bleibt unverändert, das Display zeigt weiter den letzten Witz |
| HTTP 401 | `isError: true`, *„LaraPaper-Token ungültig oder abgelaufen“*. Das Modell kann das nicht beheben, also nicht erneut versuchen |
| HTTP 404 beim Export, HTTP 422 oder 500 beim Upload | `isError: true` mit Status und Meldung von LaraPaper (z. B. *„Invalid ZIP structure“*). Ein Fehler im Server-Code, kein Fall für das Modell |
| `LARAPAPER_PAGE_WITZ` fehlt in `.env` | Startfehler des Servers, nicht erst beim Tool-Aufruf |

Rendering, PNG-Größe, Graustufen und das Ausliefern ans Gerät übernimmt LaraPaper
mit dem TRMNL-Framework. Diese Fehlerfälle gibt es in unserem Code nicht mehr.

---

## `show_message` (optional)

**Beschreibung (für den Agenten):**
> "Zeigt eine kurze, frei formulierte Nachricht als eigene Display-Seite, z. B.
> einen Hinweis an alle. Ein leerer Text blendet die Nachricht wieder aus. Gespeichert
> wird sofort, angezeigt erst, wenn die Seite wieder an der Reihe ist. Nur nutzen,
> wenn ausdrücklich eine freie Nachricht gewünscht ist: für den Witz des Tages ist
> update_joke_page zuständig, für andere vorbereitete Seiten update_page."

**Eingabeschema:**

```ts
z.object({
  text: z.string().max(200)
    .describe('Kurze Nachricht, max. 200 Zeichen, keine Emojis. Leerer Text = Nachricht ausblenden')
})
```

**Rückgabe:** wie `update_joke_page`, mit `"page": "nachricht"`.

**Implementierung:** Gleicher Weg wie `update_joke_page`, eigene Seite „Nachricht“
mit Vorlage `server/templates/nachricht.blade.php` (Schriftgröße 48 px, zentriert,
ganzer Screen). Bei leerem Text schreibt das Tool
`static_data: {"TRMNL_SKIP_DISPLAY": true}`. LaraPaper überspringt die Seite dann
in der Playlist, sie kann also dauerhaft in der Playlist bleiben.

> Warum nicht `POST /api/display/update`? Der Push zeigt Markup sofort an, aber bei
> aktiver Playlist nur bis zum nächsten Geräte-Abruf. Außerdem müsste dafür Markup
> geschickt werden, das LaraPaper als Blade ausführt (siehe `06`, Abschnitt 7.2 und 7.5).

---

## `get_device_status` (optional)

**Beschreibung (für den Agenten):**
> "Liefert für jedes Display-Gerät den zuletzt gemeldeten Zustand: Name, Akkuspannung,
> WLAN-Signal (RSSI), Firmware-Version und Zeitpunkt der letzten Meldung. Nutze es,
> um zu prüfen, ob ein Gerät erreichbar ist oder bald geladen werden muss."

Hier sind die Geräte selbst der Zweck des Tools, deshalb kommen sie in der
Beschreibung vor. Es sind mehrere, also liefert das Tool eine Liste, auch wenn nur
ein Gerät eingerichtet ist.

**Eingabeschema:** keines.

**Rückgabe:**

```json
{
  "devices": [
    {
      "name": "Flur",
      "batteryVoltage": 4.01,
      "rssi": -54,
      "firmwareVersion": "1.8.16",
      "lastSeenAt": "2026-09-30T08:31:00Z"
    }
  ]
}
```

**Implementierung:** `GET {LARAPAPER_URL}/api/devices` mit demselben Token. Die
Feldnamen der LaraPaper-Antwort beim ersten Test abgleichen und auf die Struktur oben
abbilden.

**Fehlerfälle:** Hat sich ein Gerät noch nie gemeldet, liefert das Tool für dieses
Gerät `null`-Werte statt eines Fehlers. Das ist direkt nach dem Einrichten ein normaler Zustand, kein
Ausfall.

---

## Konsistenz-Hinweis

Die Feldnamen in diesem Dokument (`joke.punchline`, `date.isoWeek`, …)
müssen 1:1 mit den Zod-Schemas in `server/src/tools/*.ts` übereinstimmen, und die
Schlüssel in `static_data` 1:1 mit den `$data['…']`-Zugriffen in `server/templates/*.blade.php`.
Ein falscher Schlüssel fällt nicht als Fehler auf, sondern als **leere Stelle auf dem
Display**. Wenn du
während der Session ein Feld umbenennst, hier und im Code gleichzeitig anpassen –
sonst bricht `update_joke_page` mit einem für den Agenten schwer verständlichen
Validierungsfehler ab (guter Kandidat für den Abschnitt "Bewusst kaputt machen" in
`anleitung.md`).
