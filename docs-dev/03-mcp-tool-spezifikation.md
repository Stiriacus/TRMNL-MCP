# 03 – MCP-Tool-Spezifikation

> **Warum das wichtig ist:** Der Agent wählt Tools anhand ihrer `description` aus.
> Eine vage oder zu allgemeine Beschreibung führt dazu, dass ein Tool nicht (oder
> zur falschen Zeit) aufgerufen wird. Die Beschreibungen unten sind bewusst konkret
> formuliert und sollten in `server/src/tools/*.ts` wörtlich übernommen werden.

Alle Tools nutzen [Zod](https://zod.dev/) für das Eingabeschema, wie es die aktuelle
`@modelcontextprotocol/server`-API vorsieht (`registerTool(name, config, handler)`).

---

## `get_weather`

**Beschreibung (für den Agenten):**
> "Liefert die aktuellen Wetterdaten (Temperatur, Wetterzustand als Text, Tages-Min-
> und Maximaltemperatur) für einen Standort anhand von Breiten- und Längengrad.
> Nutze dieses Tool immer dann, wenn eine Tagesmessage oder ein Display-Screen
> aktuelle Wetterinformationen enthalten soll. Ruft die kostenlose Open-Meteo-API auf,
> es wird kein API-Key benötigt."

**Eingabeschema:**

```ts
z.object({
  lat: z.number().min(-90).max(90).describe('Breitengrad, WGS84, z. B. 52.52'),
  lon: z.number().min(-180).max(180).describe('Längengrad, WGS84, z. B. 13.405')
})
```

**Rückgabe (Erfolg):**

```json
{
  "temperature": 18,
  "condition": "Sonnig",
  "weatherCode": 0,
  "tempMin": 9,
  "tempMax": 21,
  "unit": "celsius",
  "fetchedAt": "2026-09-30T09:00:00Z"
}
```

**Fehlerfälle:**

| Fall | Verhalten |
|---|---|
| Open-Meteo antwortet nicht (Timeout/Netzwerk) | `isError: true`, Textinhalt beschreibt den Fehler; Agent soll den Fehler melden und keine Werte erfinden (siehe `05-fehler-und-fallbacks.md`) |
| Open-Meteo antwortet mit HTTP-Fehler (4xx/5xx) | `isError: true`, HTTP-Status im Text |
| `lat`/`lon` außerhalb des gültigen Bereichs | Wird bereits durch Zod vor dem Tool-Aufruf abgelehnt (Validierungsfehler) |
| Unbekannter `weatherCode` (API-Änderung) | Tool liefert trotzdem Zahlen, `condition` fällt auf `"Unbekannt"` zurück statt zu crashen |

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

## `render_weather_screen`

**Beschreibung (für den Agenten):**
> "Erzeugt den Wetter-Tagesscreen für das E-Ink-Display (800×480 Pixel, Graustufen)
> und legt ihn ab. Das Gerät holt ihn beim nächsten Refresh selbst. Eingaben:
> weather = Ergebnis von get_weather, unverändert übernehmen; date = Ergebnis von
> get_date_info; message = eine Tagesmessage, die du selbst schreibst (max. 120
> Zeichen, keine Emojis). Rufe es als letzten Schritt auf. Nur für diesen Screen
> gedacht: andere Inhalte (Zitat, Witz, eigene Plugins) über update_plugin, reinen
> Text über show_message."

> Hinweis: Hieß ursprünglich `render_screen`. Umbenannt, weil der Name ein
> allgemeines Rendering versprach, das Schema aber fest Wetter und Datum verlangt.

**Eingabeschema:**

```ts
z.object({
  weather: z.object({
    temperature: z.number(),
    condition: z.string(),
    tempMin: z.number(),
    tempMax: z.number()
  }),
  date: z.object({
    formatted: z.string().describe('z. B. "30 / 09 / 2026"'),
    isoWeek: z.number().int().min(1).max(53)
  }),
  message: z.string().max(160).describe(
    'Tagesmessage, max. ca. 120 Zeichen, keine Emojis (siehe 04-prompt-design.md)'
  )
})
```

**Rückgabe (Erfolg):**

```json
{
  "filename": "screen-20260930-0900.png",
  "imageUrl": "http://localhost:3000/images/screen-20260930-0900.png",
  "width": 800,
  "height": 480,
  "sizeBytes": 41230
}
```

**Fehlerfälle:**

| Fall | Verhalten |
|---|---|
| `message` länger als erlaubt | Wird vor dem Rendern hart gekürzt (mit "…"), zusätzlich Warnung im Rückgabetext |
| Rendering schlägt fehl (Headless-Browser-Fehler, Timeout) | `isError: true`; das zuletzt erfolgreich gerenderte Bild bleibt unverändert aktiv |
| Ergebnis-PNG über dem Größenlimit (siehe unten) | Automatische Nachbearbeitung (Graustufen-Palette, Kompression); wenn danach immer noch zu groß: `isError: true` mit Hinweis auf zu komplexes Layout |

**Größenlimit:** TRMNL-Displays erwarten PNG-Dateien **unter ca. 90 KB** bei
800×480 px und wenigen Graustufen (siehe Briefing, Abschnitt 3 – vor dem
Produktivbetrieb gegen die aktuelle TRMNL/Terminus-Doku prüfen, da sich Werte
ändern können). `render_weather_screen` prüft die Dateigröße nach dem Rendern und
reduziert bei Bedarf automatisch nach (siehe `server/src/lib/render.ts`).

---

## `show_message` (optional)

**Beschreibung (für den Agenten):**
> "Zeigt einen frei wählbaren Text ohne Wetter- oder Datumsbezug großflächig auf
> dem Display an. Nutze dieses Tool nur, wenn explizit eine reine Textnachricht
> gewünscht ist – für die normale Tagesansicht ist render_weather_screen zuständig."

**Eingabeschema:**

```ts
z.object({
  text: z.string().max(200)
})
```

**Rückgabe:** wie `render_weather_screen`, ohne Wetter-/Datumsbox – der gesamte Screen
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

Die Feldnamen in diesem Dokument (`weather.temperature`, `date.isoWeek`, …)
müssen 1:1 mit den Zod-Schemas in `server/src/tools/*.ts` übereinstimmen. Wenn du
während der Session ein Feld umbenennst, hier und im Code gleichzeitig anpassen –
sonst bricht `render_weather_screen` mit einem für den Agenten schwer verständlichen
Validierungsfehler ab (guter Kandidat für den Abschnitt "Bewusst kaputt machen" in
`anleitung.md`).
