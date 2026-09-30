# 7 · Selbst bauen

In der ersten Session ging es ums Verstehen, jetzt bauen wir. Das Fundament und das
erste Tool entstehen **von Hand**, damit jede Zeile verstanden ist. Alle weiteren
Tools baut **der Harness** aus unseren Spezifikationen. So arbeitet man heute mit
Agenten. Der Mensch legt fest, *was* entstehen soll, der Agent schreibt den Code, und
der Mensch prüft.

Ausgangspunkt sind die Spezifikationen in `docs-dev/` (vor allem
[03](../docs-dev/03-mcp-tool-spezifikation.md) und
[07](../docs-dev/07-weitere-mcp-tools.md)), dazu Node.js und Claude Code oder pi.
Code gibt es **noch keinen**.

| Schritt | Wer baut? |
|---|---|
| 1. MCP-Server aufsetzen | wir |
| 2. Starten und prüfen | wir |
| 3. Das Schema von `get_weather` durchgehen | wir |
| 4. Die Beschreibung selbst schreiben | wir |
| 5. Alle anderen Tools | **der Harness** |
| 6. Testen und Spielereien | alle |

## Schritt 1 · MCP-Server aufsetzen

```bash
mkdir server && cd server
npm init -y
npm pkg set type=module
npm install @modelcontextprotocol/server zod
npm install --save-dev typescript tsx @types/node
```

Dann kommt ein Server mit einem einzigen Test-Tool in `server/src/mcp-server.ts`.

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const server = new McpServer({ name: 'trmnl-display', version: '0.1.0' });

server.registerTool(
  'hello',
  {
    description: 'Testtool: gibt eine Begrüßung mit dem übergebenen Namen zurück.',
    inputSchema: z.object({ name: z.string() })
  },
  async ({ name }) => ({ content: [{ type: 'text', text: `Hallo, ${name}!` }] })
);

void serveStdio(() => server);
console.error('trmnl-display läuft auf stdio');
```

**Mehr braucht es nicht**, nämlich einen Namen, eine Beschreibung, ein Schema und eine
Funktion. Das sind die vier Teile aus [Seite 1](01-bausteine.md) in 15 Zeilen.

## Schritt 2 · Starten und prüfen

```bash
npx @modelcontextprotocol/inspector npx tsx src/mcp-server.ts
```

Im Browser **Connect** und dann **Tools** wählen und `hello` mit einem Namen aufrufen.

??? question "Was passiert, wenn wir `console.error` durch `console.log` ersetzen?"
    **Die Verbindung bricht ab.** Bei stdio ist stdout der Protokollkanal
    (→ [Seite 4](04-mcp-grundlagen.md)), und `console.log` schreibt Text mitten in den
    JSON-Strom. Einmal ausprobieren lohnt sich, denn diesen Fehler macht **jeder genau
    einmal**.

## Schritt 3 · Das Schema von `get_weather` durchgehen

Das erste echte Tool bauen wir **von Hand**. Den Code (Logik in `lib/weather.ts`,
Hülle in `tools/getWeather.ts`) übernehmen wir aus der
[Bauanleitung](../docs-dev/anleitung.md), Phase 3 Teil A, und gehen ihn gemeinsam
durch. Wichtiger als der Code sind die **Entscheidungen dahinter**.

Die Wetterdaten kommen von [Open-Meteo](https://open-meteo.com), frei und ohne
API-Key. So sieht die Antwort roh aus.

```bash
curl "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1"
```

```json
{
  "latitude": 52.52, "longitude": 13.419998, "generationtime_ms": 0.086,
  "utc_offset_seconds": 7200, "timezone": "Europe/Berlin", "elevation": 38.0,
  "current_units": { "temperature_2m": "°C", "weather_code": "wmo code", … },
  "current": { "time": "2026-10-01T00:30", "temperature_2m": 17.0, "weather_code": 3 },
  "daily_units": { … },
  "daily": { "time": ["2026-10-01"], "temperature_2m_max": [24.3], "temperature_2m_min": [14.0] }
}
```

??? question "Warum `lat`/`lon` als Eingabe und nicht einfach den Städtenamen?"
    Ein Städtename bräuchte eine zweite API (Geocoding) und ist mehrdeutig, etwa
    Frankfurt am Main oder an der Oder. Zahlen kann **das Schema prüfen**
    (`min(-90).max(90)`), und die Koordinaten einer Stadt kennt jedes Modell. Der
    Preis ist, dass das Modell **falsche Koordinaten** schicken *könnte*, ohne dass das
    Schema es merkt (→ [Seite 6](06-mcp-was-zaehlt.md), Regel 2).

??? question "Welche Felder geben wir zurück?"
    ```json
    { "temperature": 17, "condition": "Bedeckt", "weatherCode": 3,
      "tempMin": 14, "tempMax": 24, "unit": "celsius", "fetchedAt": "…" }
    ```
    - `weather_code: 3` versteht das Modell nicht zuverlässig, **„Bedeckt“ schon**.
      Die Übersetzung ist eine feste Tabelle und gehört in Code (Regel 4).
    - **Temperaturen sind gerundet**, denn auf dem Display steht „17°“ und nicht „17.0“.
    - `generationtime_ms`, `elevation` und `*_units` **fliegen raus**, weil sie nur
      Ballast im Kontext wären.

??? question "Was passiert, wenn das Modell `lat: \"Berlin\"` schickt?"
    Der Aufruf erreicht **unseren Code gar nicht**. Das Schema lehnt ihn ab, und das
    Modell bekommt eine Fehlermeldung, mit der es sich meist selbst korrigiert.

```ts
inputSchema: z.object({
  lat: z.number().min(-90).max(90).describe('Breitengrad, WGS84, z. B. 52.52'),
  lon: z.number().min(-180).max(180).describe('Längengrad, WGS84, z. B. 13.405')
})
```

## Schritt 4 · Die Beschreibung selbst schreiben

Wir formulieren sie gemeinsam anhand der Fragen von [Seite 6](06-mcp-was-zaehlt.md).
Was tut es, und was kommt heraus? Woher kommen die Eingaben? Wann soll ich es
nutzen und wann nicht?

??? question "Unser Vorschlag zum Vergleich"
    *„Liefert die aktuellen Wetterdaten (Temperatur, Wetterzustand als Text,
    Tages-Min- und Maximaltemperatur) für einen Standort anhand von Breiten- und
    Längengrad. Nutze dieses Tool immer dann, wenn eine Tagesmessage oder ein
    Display-Screen aktuelle Wetterinformationen enthalten soll. Ruft die kostenlose
    Open-Meteo-API auf, es wird kein API-Key benötigt.“*

Dann **sofort ausprobieren**. Den Server in Claude Code oder pi anbinden
(→ [Seite 4](04-mcp-grundlagen.md#denselben-server-in-zwei-harnesses-anbinden)) und
fragen *„Wie ist das Wetter in Hamburg?“* Findet das Modell das Tool? Setzt es die
Koordinaten selbst ein?

## Schritt 5 · Den Rest baut der Harness

`get_weather` ist jetzt **die Vorlage** für Aufbau, Fehlerbehandlung und die Trennung
von `lib/` und `tools/`. Der Agent orientiert sich daran. Der Auftrag an Claude Code
oder pi lautet etwa so.

```text
Lies docs-dev/03-mcp-tool-spezifikation.md, Abschnitt "get_date_info". Baue das Tool
genau nach Spezifikation: Logik in server/src/lib/dateInfo.ts (nur die eingebaute
Date-API, keine Bibliotheken), MCP-Hülle in server/src/tools/getDateInfo.ts, im
selben Aufbau wie getWeather.ts. Übernimm die Beschreibung wörtlich.
```

Nach demselben Muster gibt es je einen Auftrag pro Tool.

| Tool | Spezifikation | Worauf beim Prüfen achten |
|---|---|---|
| `get_date_info` | [docs-dev/03](../docs-dev/03-mcp-tool-spezifikation.md) | Kalenderwoche richtig (Donnerstagsregel)? Keine Bibliothek? |
| `render_weather_screen` | docs-dev/02 und 03 | Layout 800×480, Datei unter 90 KB? |
| `get_joke`, `get_quote_of_the_day`, `get_on_this_day`, `get_http_status` als **zweiter Server** `tagesinhalte` | [docs-dev/07](../docs-dev/07-weitere-mcp-tools.md) | Rückgabe knapp? Weiche Trennstriche entfernt? |
| `update_plugin` *(nur mit LaraPaper)* | docs-dev/07 | Plugin-UUIDs nur aus `.env`, nie im Schema? |

Unsere Rolle ist jetzt **Review**. Stimmen Feldnamen und Beschreibung mit der
Spezifikation überein? Hat der Agent etwas dazuerfunden? Das geht **deutlich
schneller** als selbst schreiben, und genau deshalb lohnt sich die Spezifikation
vorher.

!!! info "Wenn der Agent Fehler macht"
    Das ist **kein Problem**, sondern die Schleife aus [Seite 2](02-harness.md). Die
    Fehlermeldung aus dem Inspector oder vom Compiler zurück in den Chat geben. Meist
    behebt der Agent sie im nächsten Durchlauf.

## Schritt 6 · Testen und Spielereien

Erst jedes Tool **einzeln** im Inspector testen, dann alles **zusammen** mit dem Agenten.

```text
Mach mir den Screen für heute.
```

Danach ist Zeit zum Spielen.

- **Den Ton ändern** mit *„Schreib die Tagesmessage heute als Wetterbericht aus dem
  Mittelalter.“* Nichts am Server ändert sich, nur der Auftrag.
- **Einen HTTP-Witz** mit *„Such dir einen lustigen HTTP-Statuscode aus und schreib
  einen Witz dazu.“* Das Tool liefert nur den Code, der Witz kommt vom Modell.
- **Die Beschreibung verschlechtern**, also eine Tool-Beschreibung auf ein Wort kürzen
  und denselben Auftrag noch einmal stellen.
- **Das Modell wechseln** und denselben Auftrag in pi mit DeepSeek oder einem lokalen
  Modell stellen.
- **Ein Wunsch-Tool bauen.** Eine freie API aussuchen, die gerade jemanden
  interessiert, und den Harness in wenigen Minuten ein Tool daraus bauen lassen.
  Vorher gemeinsam entscheiden, *welche* Endpunkte und Felder es braucht (wie auf
  [Seite 2](02-harness.md#zum-anfassen-eine-api-auswahlen-und-beschreiben)).
- **Aufs Display bringen** *(optional, wenn LaraPaper läuft)* und die Tagesplaylist
  aus [Seite 8](08-ablauf.md) live befüllen.
