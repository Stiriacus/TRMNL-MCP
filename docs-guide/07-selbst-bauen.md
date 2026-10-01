# 7 · Selbst bauen

Die Seiten 1 bis 6 haben erklärt, wie alles zusammenhängt, jetzt bauen wir. Das Fundament und das
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
| 3. `get_joke` bauen und durchgehen | wir |
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

## Schritt 3 · `get_joke` bauen und durchgehen

Auf [Seite 2](02-harness.md#zum-anfassen-eine-api-auswahlen-und-beschreiben) haben wir
entschieden, *was* das Tool können soll, nämlich ein Endpunkt, 3 Parameter und 3
Felder. Jetzt bauen wir es **von Hand**. Den Code (Logik in `lib/jokes.ts`, Hülle in
`tools/getJoke.ts`) übernehmen wir aus der [Bauanleitung](../docs-dev/anleitung.md),
Phase 3 Teil A, und gehen ihn gemeinsam durch. Wichtiger als der Code sind die
**Entscheidungen dahinter**.

```ts
inputSchema: z.object({
  category: z.enum(['Programming', 'Any']).default('Programming'),
  lang: z.enum(['de', 'en']).default('de'),
  topic: z.string().max(30).optional().describe('Stichwort, z. B. "coffee"')
})
```

??? question "Warum `z.enum` und nicht einfach ein freier Text für die Kategorie?"
    Die API kennt nur feste Namen. Mit `z.enum` steht die Auswahl **im Schema**, das
    Modell sieht sie also schon in `tools/list`. Schickt es trotzdem `"Witze"`,
    lehnt das Schema den Aufruf ab, bevor unser Code läuft, und das Modell bekommt
    eine Fehlermeldung, mit der es sich meist selbst korrigiert. Bei einem freien
    Text käme stattdessen eine Fehlermeldung der API zurück, die für das Modell
    schwerer zu deuten ist.

??? question "Warum ist `safe-mode` kein Parameter?"
    Ob ein Witz im Flur jugendfrei sein muss, ist **keine Entscheidung für das
    Modell**. Deshalb steht `safe-mode` fest im Code. Beim Testen ist dabei etwas
    aufgefallen, das in keiner Doku steht. `URLSearchParams.set('safe-mode', '')`
    erzeugt `safe-mode=` mit leerem Wert, und den **ignoriert die API
    stillschweigend**. Dann kommen auch Witze mit `"safe": false`. Unser Code sendet
    deshalb `safe-mode=true` und prüft zusätzlich, ob die Antwort wirklich `safe` ist.

??? question "Welche Felder geben wir zurück?"
    ```json
    { "setup": "Was macht ein Informatiker, wenn sein Wagen nicht mehr anspringt?",
      "punchline": "Aussteigen, einsteigen und nochmal starten.", "lang": "de" }
    ```
    - Die API kennt zwei Formate, `single` mit einem Feld `joke` und `twopart` mit
      `setup` und `delivery`. Wir geben **immer dieselbe Form** zurück. Bei Einzeilern
      bleibt `punchline` leer. Das Modell muss sich um die Unterschiede nicht kümmern.
    - `flags`, `id`, `safe` und `category` **fliegen raus**, weil sie nur Ballast im
      Kontext wären.

??? question "Was passiert bei `topic: \"kaffee\"` und `lang: \"de\"`?"
    Die API antwortet mit HTTP 400 und `"code": 106`, kein Treffer. Der deutsche
    Bestand hat nur rund 30 Witze. Unser Tool macht daraus eine **Handlungsempfehlung**,
    nämlich *„Kein Witz zu diesem Stichwort. Versuche es ohne topic oder mit
    lang=en.“* Ein gutes Modell versucht es danach auf Englisch und übersetzt den
    Witz selbst (→ [Seite 6](06-mcp-was-zaehlt.md), Regel 3).

## Schritt 4 · Die Beschreibung selbst schreiben

Wir formulieren sie gemeinsam anhand der Fragen von [Seite 6](06-mcp-was-zaehlt.md).
Was tut es, und was kommt heraus? Woher kommen die Eingaben? Wann soll ich es
nutzen und wann nicht?

??? question "Unser Vorschlag zum Vergleich"
    *„Liefert einen kurzen, jugendfreien Witz aus der Kategorie Programmierung oder
    gemischt. Mit topic kann nach einem Stichwort gefiltert werden (z. B. ‚coffee‘
    für Kaffeewitze). Die Stichwortsuche funktioniert praktisch nur mit lang=en, der
    deutsche Bestand ist klein. Nutze es, wenn ein Screen einen Witz zeigen soll.
    Erfinde nie selbst einen Witz, sondern rufe das Tool bei Bedarf erneut auf.“*

Dann **sofort ausprobieren**. Den Server in Claude Code oder pi anbinden
(→ [Seite 4](04-mcp-grundlagen.md#denselben-server-in-zwei-harnesses-anbinden)) und
fragen *„Erzähl mir einen Kaffeewitz auf Deutsch.“* Findet das Modell das Tool?
Kommt es von selbst auf `topic: "coffee"` und `lang: "en"` und übersetzt den Witz?

## Schritt 5 · Den Rest baut der Harness

`get_joke` ist jetzt **die Vorlage** für Aufbau, Fehlerbehandlung und die Trennung
von `lib/` und `tools/`. Der Agent orientiert sich daran. Der Auftrag an Claude Code
oder pi lautet etwa so.

```text
Lies docs-dev/03-mcp-tool-spezifikation.md, Abschnitt "get_date_info". Baue das Tool
genau nach Spezifikation: Logik in server/src/lib/dateInfo.ts (nur die eingebaute
Date-API, keine Bibliotheken), MCP-Hülle in server/src/tools/getDateInfo.ts, im
selben Aufbau wie getJoke.ts. Übernimm die Beschreibung wörtlich.
```

Nach demselben Muster gibt es je einen Auftrag pro Tool.

| Tool | Spezifikation | Worauf beim Prüfen achten |
|---|---|---|
| `get_date_info` | [docs-dev/03](../docs-dev/03-mcp-tool-spezifikation.md) | Kalenderwoche richtig (Donnerstagsregel)? Keine Bibliothek? |
| `render_joke_screen` | docs-dev/02, 03 und [06](../docs-dev/06-recherche-trmnl.md) (Abschnitt 7.7) | Text vom Modell nur in den Daten, **nie im Markup**? Ausgabe mit `{{ }}`? Revisionsmarke bei jedem Aufruf neu? Einzeiler ohne Pointe? |
| `get_quote_of_the_day`, `get_on_this_day`, `get_http_status` als **zweiter Server** `tagesinhalte` | [docs-dev/07](../docs-dev/07-weitere-mcp-tools.md) | Rückgabe knapp? Weiche Trennstriche entfernt? |
| `update_plugin` | docs-dev/07 | Token und Seiten-IDs nur aus `.env`, nie im Schema? Gleicher Upload-Weg wie `render_joke_screen`? |
| `list_plugins`, `get_plugin` | docs-dev/07 | Gibt `get_plugin` nur Felder zurück, kein Markup? Bleiben fremde Seiten unangetastet? |

!!! warning "Vorher in LaraPaper: die Seiten anlegen"
    `render_joke_screen` und `update_plugin` **überschreiben** Seiten, die es schon
    geben muss. Jede Seite einmal über die API anlegen
    (`POST /api/plugin_settings`), die ID in `server/.env` eintragen und die Seite
    einmalig in der LaraPaper-Oberfläche in die Playlist aufnehmen. Eine
    Playlist-API gibt es nicht. Die Schritte stehen in der
    [Bauanleitung](../docs-dev/anleitung.md), Phase 3 Teil B. Das Gerät selbst
    braucht man zum Bauen nicht, die **Vorschau** der Seite in LaraPaper reicht.

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

- **Ein Thema vorgeben** mit *„Heute bitte einen Witz über Kaffee, auf Deutsch.“*
  Nichts am Server ändert sich, nur der Auftrag. Das Modell muss selbst auf
  `lang=en` ausweichen und übersetzen.
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
- **Einen Fehler korrigieren lassen** mit *„Beim Zitat steht der falsche Autor.
  Korrigier das, ohne den Rest zu ändern.“* Liest das Modell die Seite erst mit
  `get_plugin`, bevor es schreibt?
- **Aufs Display bringen** *(wenn das Gerät verbunden ist)* und die Tagesplaylist
  aus [Seite 8](08-ablauf.md) live befüllen.
