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

Dieselbe Funktion `getDateInfo()` nutzt auch `update_page` für die Seite `witz`. Das
Modell braucht `get_date_info` also nicht, um den Witz zu setzen, sondern nur, wenn
es selbst mit dem Datum arbeitet (z. B. für `get_on_this_day` oder im Chat).

---

## `update_page`

**Beschreibung (für den Agenten):**
> "Ersetzt den Inhalt einer Display-Seite, z. B. den Witz des Tages. Welche Seiten es
> gibt und welche Felder sie erwarten, steht im Schema. Das Layout ist fest, du
> lieferst nur Text. Gespeichert wird sofort, angezeigt erst, wenn die Seite wieder
> an der Reihe ist."

Was in die Felder gehört (Herkunft, Längen, keine Emojis, Pointe erhalten), steht
im Schema am jeweiligen Feld und nicht noch einmal hier. Eine Reihenfolge („als
letzten Schritt“) nennt die Beschreibung nicht. Sie folgt daraus, dass der Witz aus
`get_joke` stammt.

**Ein Tool für alle Seiten.** Jede Seite ist ein Zweig im Schema, nicht ein eigenes
Tool. Eine neue Seite heißt: ein Zweig mehr, eine Vorlage mehr, ein Eintrag in `.env`.
Die Beschreibung bleibt gleich. In dieser Spezifikation stehen die Zweige `witz` und
`nachricht`, die Zweige `zitat`, `geschichte` und `http` kommen in
`07-weitere-mcp-tools.md` dazu.

> Hinweis zur Geschichte: Das Witz-Tool hieß zuerst `render_screen`, dann
> `render_joke_screen`, dann `update_joke_page`, daneben gab es `update_plugin` und
> `show_message`. Die erste Umbenennung, weil der Name ein allgemeines Rendering
> versprach, das Schema aber fest einen Witz verlangte. Die zweite, weil „render“ und
> „screen“ sagen, *wie* und *worauf* etwas erscheint, nicht was das Tool bewirkt.
> „Plugin“ ist LaraPaper-Vokabular, der Nutzer spricht von Seiten. Am Ende verschwand
> das Witz-Tool ganz: Sein einziger Unterschied zu `update_page` war der Parameter
> `date`, und den hat das Modell nur unverändert durchgereicht. Jetzt setzt der Server
> das Datum selbst, und der Witz ist eine Seite wie jede andere. Ebenso die Nachricht.

**Eingabeschema:**

```ts
const keineEmojis = 'Keine Emojis, die Anzeige kann sie nicht darstellen';

z.discriminatedUnion('page', [
  z.object({
    page: z.literal('witz')
      .describe('Witz des Tages. Datum und Kalenderwoche setzt die Seite selbst'),
    fields: z.object({
      setup: z.string().min(1).max(200)
        .describe('Aufbau bzw. ganzer Einzeiler aus get_joke, auf Deutsch, max. ca. ' +
                  '140 Zeichen. Übersetzen und kürzen erlaubt. ' + keineEmojis),
      punchline: z.string().max(120)
        .describe('Pointe aus get_joke, max. ca. 100 Zeichen, leer bei Einzeilern. ' +
                  'Beim Übersetzen die Pointe erhalten, nicht erklären. ' + keineEmojis)
    })
  }),
  z.object({
    page: z.literal('nachricht')
      .describe('Freie Nachricht, z. B. ein Hinweis an alle. Nur, wenn ausdrücklich ' +
                'eine Nachricht gewünscht ist'),
    fields: z.object({
      text: z.string().max(200)
        .describe('Max. 200 Zeichen. ' + keineEmojis + '. Leerer Text blendet die ' +
                  'Nachricht aus')
    })
  })
  // zitat, geschichte, http: siehe 07-weitere-mcp-tools.md
])
```

Die Zod-Grenzen liegen bewusst über den Zielwerten am Feld. Zu lange Texte werden
nicht abgelehnt, sondern gekürzt und mit Warnung zurückgemeldet (siehe Fehlerfälle).
So bricht der Lauf nicht an ein paar Zeichen zu viel ab.

**Warum `discriminatedUnion`:** Das Modell sieht im Schema genau, welche Felder zu
welcher Seite gehören, und Zod lehnt `page: "witz"` mit Zitat-Feldern ab. Ein
generisches `fields: z.record(z.any())` wäre bequemer, würde falsche Feldnamen aber
erst auf dem Display sichtbar machen (leere Platzhalter).

**Zu beobachten:** Im JSON Schema wird die Union zu `anyOf`. Große Modelle kommen
damit gut zurecht, manche kleinen lokalen Modelle oder Harnesses schlechter. Das ist
ein Testfall für den Lauf mit pi und Ollama (`anleitung.md`, Phase 4). Hakt es dort,
ist die Ausweichlösung ein flaches Tool **pro Seite**, nicht ein Sonder-Tool neben
einem allgemeinen.

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

Jede Seite ist ein **static-Recipe** in LaraPaper. Sie wird einmalig angelegt und in
die Playlist aufgenommen (siehe `anleitung.md`, Phase 3 Teil B). Danach überschreibt
das Tool sie bei jedem Aufruf komplett über `pushPage(page, data)` in
`lib/larapaper.ts`:

1. `static_data` bauen. Pro Seite ergänzt der Server, was nicht vom Modell kommt:
   - `witz`: Texte kürzen (siehe Fehlerfälle), dazu `getDateInfo()` aus
     `lib/dateInfo.ts` → `{ setup, punchline, weekday, date, isoWeek }`.
   - `nachricht`: bei leerem Text `{ "TRMNL_SKIP_DISPLAY": true }`. LaraPaper
     überspringt die Seite dann in der Playlist, sie kann also dauerhaft dort bleiben.
2. Feste Vorlage `server/templates/{page}.blade.php` laden (für `witz` Layout nach
   `02-layout-spezifikation.md`, für `nachricht` 48 px, zentriert, ganzer Screen).
   Ausgabe nur über `{{ $data['setup'] }}` usw. Davor eine **Revisionsmarke** setzen:
   `{{-- rev: 2026-10-01T09:00:12Z --}}`.
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
5. `POST {LARAPAPER_URL}/api/plugin_settings/{LARAPAPER_PAGE_<PAGE>}/archive`,
   Multipart-Feld `file` (Dateiname z. B. `witz.zip`), Header
   `Authorization: Bearer {LARAPAPER_TOKEN}` und `Accept: application/json`.

Warum diese Details zählen:

| Detail | Grund |
|---|---|
| Vorlage liegt im MCP-Server, Modell liefert nur Text | LaraPaper rendert Blade, und Blade kann PHP ausführen. Text vom Modell darf nie Teil des Markups werden. |
| Ausgabe mit `{{ }}`, nie `{!! !!}` | `{{ }}` escapt HTML. So bleibt auch Witz 14 mit `&szlig;` korrekt: Er erscheint als Text `&szlig;`, wie gewollt. |
| Datum aus `lib/dateInfo.ts`, nicht vom Modell | Deterministische Daten gehören in Code. Was das Modell nur durchreichen würde, kann es nur verfälschen. |
| Revisionsmarke | LaraPaper verwirft das gespeicherte Bild nur, wenn sich das **Markup** ändert. Ohne Marke würde nur `static_data` geändert, und der alte Inhalt bliebe bis zu `refresh_interval` Minuten stehen. |
| Immer die komplette Seite schicken | Ein Upload ersetzt Name, Layouts und Daten. Was fehlt, ist danach leer. |
| `trmnlp_id` und Token aus `.env` | Konfiguration, kein Modell-Wissen. Das Modell sieht beides nie. |
| `Accept: application/json` | Ohne den Header antwortet Laravel bei Validierungsfehlern mit einer Weiterleitung statt mit einer lesbaren Fehlermeldung. |

> Warum für die Nachricht nicht `POST /api/display/update`? Der Push zeigt Markup
> sofort an, aber bei aktiver Playlist nur bis zum nächsten Geräte-Abruf. Außerdem
> müsste dafür Markup geschickt werden, das LaraPaper als Blade ausführt (siehe `06`,
> Abschnitt 7.2 und 7.5).

**Fehlerfälle:**

| Fall | Verhalten |
|---|---|
| `page` und `fields` passen nicht zusammen | Zod lehnt den Aufruf ab, die Meldung nennt das erwartete Feld. Das Modell kann das selbst korrigieren |
| Text länger als der Zielwert am Feld | Wird vor dem Upload an einer Wortgrenze gekürzt (mit "…"), zusätzlich Warnung im Rückgabetext, damit der Agent nachbessern kann |
| LaraPaper nicht erreichbar (Timeout/Netzwerk) | `isError: true`. Die Seite in LaraPaper bleibt unverändert, das Display zeigt weiter den letzten Inhalt |
| HTTP 401 | `isError: true`, *„LaraPaper-Token ungültig oder abgelaufen“*. Das Modell kann das nicht beheben, also nicht erneut versuchen |
| HTTP 422 oder 500 beim Upload | `isError: true` mit Status und Meldung von LaraPaper (z. B. *„Invalid ZIP structure“*). Ein Fehler im Server-Code, kein Fall für das Modell |
| `LARAPAPER_PAGE_<PAGE>` fehlt in `.env` | Startfehler des Servers, nicht erst beim Tool-Aufruf |
| `LARAPAPER_PAGE_<PAGE>` falsch (ID gibt es nicht) | **Noch offen.** Laut Code legt der Upload per `updateOrCreate` an. Vermutlich entsteht dann stillschweigend eine neue Seite außerhalb der Playlist statt eines Fehlers. Mit `curl` prüfen (siehe `07`, Offene Punkte) |

Rendering, PNG-Größe, Graustufen und das Ausliefern ans Gerät übernimmt LaraPaper
mit dem TRMNL-Framework. Diese Fehlerfälle gibt es in unserem Code nicht mehr.

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

Die Feldnamen in diesem Dokument (`fields.setup`, `fields.punchline`, …)
müssen 1:1 mit den Zod-Schemas in `server/src/tools/*.ts` übereinstimmen, und die
Schlüssel in `static_data` 1:1 mit den `$data['…']`-Zugriffen in `server/templates/*.blade.php`.
Ein falscher Schlüssel fällt nicht als Fehler auf, sondern als **leere Stelle auf dem
Display**. Wenn du
während der Session ein Feld umbenennst, hier und im Code gleichzeitig anpassen –
sonst bricht `update_page` mit einem für den Agenten schwer verständlichen
Validierungsfehler ab (guter Kandidat für den Abschnitt "Bewusst kaputt machen" in
`anleitung.md`).
