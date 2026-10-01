# Anleitung: TRMNL E-Ink Display mit MCP und Agenten

Diese Anleitung führt Schritt für Schritt durch die Phasen 0–5 aus dem Briefing.
Jede Phase endet mit einem **Checkpoint** (objektiv prüfbar) und einem
**Selbstcheck** (drei Fragen, die du dir ohne Notizen beantworten können solltest,
bevor du weitergehst).

> **Versionsstand dieser Anleitung:** geprüft im September 2026 gegen Node.js 24 LTS
> ("Krypton"), `@modelcontextprotocol/server` v2 (Paket-Split von `@modelcontextprotocol/sdk`),
> die JokeAPI und die TRMNL-BYOS-API (LaraPaper). Vor dem eigentlichen Start lohnt ein
> kurzer Blick auf die aktuellen Quellen, falls seither Zeit vergangen ist:
> [nodejs.org/en/download](https://nodejs.org/en/download),
> [TypeScript-SDK-Repo](https://github.com/modelcontextprotocol/typescript-sdk),
> [JokeAPI-Doku](https://v2.jokeapi.dev),
> [LaraPaper](https://github.com/usetrmnl/larapaper),
> [Awesome TRMNL](https://github.com/RJDvsFACe/awesome-trmnl) *(Linkziel vor Nutzung prüfen, Community-Listen ändern sich)*.

## Vor dem Start

Festgelegt (siehe auch `README.md`, Abschnitt "Festgelegt"):

- Diese Anleitung geht von **Windows** als Dev-Umgebung aus (PowerShell-Befehle).
- BYOS: Wir nutzen **LaraPaper** als vorhandene BYOS-Lösung, keinen eigenen
  BYOS-Server (Details in `06-recherche-trmnl.md`).
- Datenquelle für den Screen: die **JokeAPI** (frei, ohne API-Key).
- Wir rendern **kein Bild selbst**. Der MCP-Server überschreibt fertige Seiten
  (static-Recipes) in LaraPaper über die Archiv-Schnittstelle. LaraPaper rendert sie
  und zeigt sie in der Playlist an (siehe `06-recherche-trmnl.md`, Abschnitt 7.7).

---

## Phase 0 – Vorbereitung (ca. 30 Min.)

1. Zugang zu deinem Server klären: SSH-Zugriff? Darf dort Node.js installiert
   werden?
2. Zugang zu LaraPaper prüfen: Weboberfläche erreichbar? Unter den API-Tokens einen
   **Sanctum-Token** anlegen. Für die Archiv-Schnittstelle ist keine besondere
   Berechtigung nötig. Der Token ist trotzdem so viel wert wie ein Passwort, weil er
   Seiten überschreiben kann.
3. Archiv-Schnittstelle erreichbar? Einmal die Seitenliste abrufen:

   ```bash
   curl -H "Authorization: Bearer <token>" -H "Accept: application/json" \
        https://<larapaper>/api/plugin_settings
   ```

   Erwartet: `{"data":[{"id":…,"name":…},…]}`. Ein `401` heißt: Token falsch.
4. JokeAPI vom Server aus erreichbar? Einmal
   `curl "https://v2.jokeapi.dev/joke/Programming?lang=de&safe-mode=true"` aufrufen.

**Checkpoint:** Du erreichst die LaraPaper-Oberfläche, und `curl` liefert die
Seitenliste und einen Witz.

---

## Phase 1 – Dev-Umgebung (ca. 45 Min., Windows)

### Node.js installieren

```powershell
winget install OpenJS.NodeJS.LTS
```

Alternative, falls du später zwischen Node-Versionen wechseln willst:
[nvm-windows](https://github.com/coreybutler/nvm-windows), dann `nvm install lts`.

Prüfen (neues PowerShell-Fenster öffnen, damit PATH aktualisiert ist):
```powershell
node --version   # sollte v24.x oder neuer zeigen
npm --version
```

### Git installieren

```powershell
winget install Git.Git
```

### Projektordner anlegen

```powershell
git init trmnl-mcp-projekt
cd trmnl-mcp-projekt
```

Darin die `docs-dev/`-Struktur aus diesem Konzept ablegen; die `server/`-Struktur
(Code) entsteht Schritt für Schritt in den folgenden Phasen.

### Claude Code installieren und anmelden

```powershell
npm install -g @anthropic-ai/claude-code
claude
```

Beim ersten Start führt Claude Code durch die Anmeldung. Details und aktuelle
Installationswege: [Claude-Code-Dokumentation](https://docs.claude.com/en/docs-dev/claude-code).

Optional: ein alternatives Harness mit einem anderen Modell (z. B. DeepSeek) als
Vergleichsbasis für die Diskussion in der Session installieren – welches, hängt
vom verfügbaren API-Zugang ab und ist bewusst nicht vorgegeben.

**Checkpoint:** `claude` startet im Projektordner, du kannst mit "Liste die Dateien
in docs-dev/ auf" testen, dass Claude Code den Ordner liest.

**Selbstcheck:**
- Was macht `claude` beim Start technisch (welcher Prozess, welche Konfigurationsdatei)?
- Was passiert, wenn ich Claude Code in einem anderen Ordner starte?
- Kann ich den Anmeldevorgang ohne Notizen erklären?

---

## Phase 2 – Node-Grundlage für den MCP-Server (ca. 45 Min.)

### Projekt initialisieren

```powershell
mkdir server; cd server
npm init -y
npm pkg set type=module
npm install @modelcontextprotocol/server zod
npm install --save-dev typescript tsx @types/node
```

Empfohlene Scripts direkt in `package.json` ergänzen (`npm pkg set scripts.xyz=...`
oder von Hand eintragen) – die restliche Anleitung geht davon aus, dass sie existieren:

```json
"scripts": {
  "mcp": "tsx src/mcp-server.ts",
  "mcp:inspect": "npx @modelcontextprotocol/inspector npx tsx src/mcp-server.ts",
  "byos": "tsx src/byos/server.ts"
}
```

`type=module` ist wichtig – die aktuelle SDK-Generation liefert nur ES-Module aus.
`tsx` führt TypeScript ohne separaten Build-Schritt aus.

> **Hinweis zur Paketversion:** Seit dem MCP-TypeScript-SDK **v2** (Spezifikation
> 2026-07-28) heißen die Pakete `@modelcontextprotocol/server` und
> `@modelcontextprotocol/client` (vorher: ein gemeinsames Paket
> `@modelcontextprotocol/sdk`). Ältere Tutorials im Netz nutzen noch den alten
> Namen – funktioniert weiter (v1 erhält laut Projekt noch mindestens 6 Monate
> Sicherheitsupdates), aber neue Projekte sollten mit v2 starten.

### Transportarten verstehen

- **stdio** – der Client (z. B. Claude Code) startet den Server als Kindprozess
  und kommuniziert über `stdin`/`stdout`. Ideal zum Entwickeln: kein offener Port,
  keine Authentifizierung nötig, ein Prozess pro Verbindung.
- **Streamable HTTP** – der Server läuft dauerhaft und mehrere Clients können sich
  über HTTP verbinden. Sinnvoll, sobald mehrere Personen oder Tools gleichzeitig
  denselben Server nutzen sollen. Für dieses Projekt reicht stdio; Streamable HTTP
  ist als Diskussionspunkt für die Session interessant (siehe `01-projektuebersicht.md`).

**Wichtig bei stdio:** `stdout` ist der Protokollkanal. Jede `console.log`-Zeile im
Server landet im JSON-RPC-Stream und zerstört ihn. Für eigene Log-Ausgaben immer
`console.error` verwenden.

### Leeren Server mit Test-Tool starten

Lege `server/src/mcp-server.ts` an und registriere darin ein `hello`-Tool zum
Warmwerden:

```ts
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const server = new McpServer({ name: 'trmnl-demo', version: '0.1.0' });

server.registerTool(
  'hello',
  {
    description: 'Testtool: gibt eine Begrüßung mit dem übergebenen Namen zurück.',
    inputSchema: z.object({ name: z.string() })
  },
  async ({ name }) => ({
    content: [{ type: 'text', text: `Hallo, ${name}!` }]
  })
);

void serveStdio(() => server);
console.error('trmnl-demo MCP-Server läuft auf stdio');
```

Starten:
```bash
npx tsx src/mcp-server.ts
```

Testen mit dem MCP Inspector (siehe eigener Abschnitt unten):
```bash
npx @modelcontextprotocol/inspector npx tsx src/mcp-server.ts
```

**Checkpoint:** Der Inspector verbindet sich, listet das Tool `hello` und liefert
bei einem Testaufruf `"Hallo, <Name>!"` zurück.

**Selbstcheck:**
- Was passiert technisch, wenn ich `console.log` statt `console.error` im Server
  verwende? (Ausprobieren!)
- Was bricht, wenn ich das `inputSchema` entferne?
- Kann ich den Unterschied stdio vs. Streamable HTTP in eigenen Worten erklären?

---

## Phase 3 – MCP-Tools erstellen (ca. 90 Min.)

### Teil A – `get_joke` von Hand bauen

Anatomie eines Tools: **Name**, **Beschreibung**, **Zod-Schema**, **Rückgabe**.
Die volle Spezifikation steht in `03-mcp-tool-spezifikation.md` – hier die
Umsetzung in Code, aufgeteilt in `server/src/lib/jokes.ts` (Logik) und
`server/src/tools/getJoke.ts` (MCP-Wrapper):

```ts
// server/src/lib/jokes.ts – die eigentliche Logik, transport-unabhängig
export interface JokeResult {
  setup: string;
  punchline: string;
  lang: 'de' | 'en';
}

export interface JokeQuery {
  category: 'Programming' | 'Any';
  lang: 'de' | 'en';
  topic?: string;
}

export async function fetchJoke({ category, lang, topic }: JokeQuery): Promise<JokeResult> {
  const url = new URL(`https://v2.jokeapi.dev/joke/${category}`);
  url.searchParams.set('lang', lang);
  // fest im Code, nicht im Schema. Achtung: set('safe-mode', '') ergibt "safe-mode="
  // und wird von der JokeAPI stillschweigend ignoriert, deshalb ausdrücklich 'true'
  url.searchParams.set('safe-mode', 'true');
  if (topic) url.searchParams.set('contains', topic);

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await res.json();

  // Kein Treffer kommt als HTTP 400 mit "error": true und code 106
  if (data.error) {
    if (data.code === 106) {
      throw new Error('Kein Witz zu diesem Stichwort. Versuche es ohne topic oder mit lang=en.');
    }
    throw new Error(`JokeAPI antwortete mit HTTP ${res.status}: ${data.message}`);
  }

  // Zweite Sicherung: nie einen Witz durchreichen, den die API selbst nicht als safe markiert
  if (data.safe !== true) {
    throw new Error('JokeAPI lieferte einen nicht jugendfreien Witz. Bitte erneut aufrufen.');
  }

  // single: ein Feld "joke"; twopart: "setup" und "delivery"
  return data.type === 'twopart'
    ? { setup: data.setup, punchline: data.delivery, lang: data.lang }
    : { setup: data.joke, punchline: '', lang: data.lang };
}
```

```ts
// server/src/tools/getJoke.ts – dünner MCP-Wrapper um die Logik oben
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { fetchJoke } from '../lib/jokes.js';

export function registerGetJoke(server: McpServer) {
  server.registerTool(
    'get_joke',
    {
      description:
        'Liefert einen kurzen, jugendfreien Witz aus der Kategorie Programmierung oder ' +
        'gemischt. Mit topic kann nach einem Stichwort gefiltert werden (z. B. coffee ' +
        'fuer Kaffeewitze). Die Stichwortsuche funktioniert praktisch nur mit lang=en, ' +
        'der deutsche Bestand ist klein. Nutze es, wenn ein Screen einen Witz zeigen ' +
        'soll. Erfinde nie selbst einen Witz, sondern rufe das Tool bei Bedarf erneut auf.',
      inputSchema: z.object({
        category: z.enum(['Programming', 'Any']).default('Programming'),
        lang: z.enum(['de', 'en']).default('de'),
        topic: z.string().max(30).optional().describe('Stichwort, z. B. "coffee"')
      })
    },
    async (args) => {
      try {
        const joke = await fetchJoke(args);
        return { content: [{ type: 'text', text: JSON.stringify(joke) }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Witzabruf fehlgeschlagen: ${String(err)}` }],
          isError: true
        };
      }
    }
  );
}
```

Testen im Inspector: Tool `get_joke` einmal ohne Parameter, einmal mit
`topic: "coffee"` und `lang: "en"` und einmal mit `topic: "kaffee"` und `lang: "de"`
aufrufen. Der dritte Aufruf muss den Fehlertext mit Handlungsempfehlung liefern.
Ergebnisse gegen die Rückgabestruktur in `03-mcp-tool-spezifikation.md` prüfen.

### Teil B – `get_date_info` und `render_joke_screen` mit dem Agenten bauen

Statt die Dateien selbst zu tippen, jetzt Claude Code im Projektordner bitten,
sie nach Spezifikation zu bauen. Beispiel-Auftrag:

```text
Lies docs-dev/03-mcp-tool-spezifikation.md, Abschnitt "get_date_info". Erstelle
server/src/lib/dateInfo.ts mit einer reinen, deterministischen Funktion
getDateInfo(), die genau die dort spezifizierte Struktur zurückgibt (ISO-8601-
Kalenderwoche nach Donnerstagsregel, keine Bibliotheken, nur die eingebaute
Date-API). Erstelle danach server/src/tools/getDateInfo.ts als duennen MCP-
Tool-Wrapper analog zu server/src/tools/getJoke.ts.
```

Anschließend gemeinsamer Code-Review: Stimmen Feldnamen mit der Spezifikation
überein? Ist die ISO-Wochenberechnung tatsächlich zeitzonenfest? Wurde
versehentlich eine externe Bibliothek für reine Datumslogik verwendet (sollte
laut Spezifikation nicht sein)?

#### Vorbereitung: die Seite „Witz des Tages“ in LaraPaper anlegen

`render_joke_screen` überschreibt eine bestehende Seite. Die muss es einmal geben,
und zwar mit einer `trmnlp_id`. Seiten, die in der Oberfläche angelegt wurden, haben
keine. Deshalb über die API anlegen:

```bash
curl -X POST -H "Authorization: Bearer <token>" -H "Accept: application/json" \
     https://<larapaper>/api/plugin_settings
# → {"data":{"id":"0199a3c2-…"}}
```

Die ID und die Zugangsdaten kommen in `server/.env` (nicht ins Git):

```dotenv
LARAPAPER_URL=https://<larapaper>
LARAPAPER_TOKEN=<token>
LARAPAPER_PAGE_WITZ=0199a3c2-…
```

Die Seite heißt vorerst „New TRMNLP Plugin“. Den richtigen Namen bekommt sie beim
ersten Upload. Danach in der LaraPaper-Oberfläche **einmalig in die Playlist des
Geräts aufnehmen**. Das geht nur dort, eine Playlist-API gibt es nicht.

#### `render_joke_screen` bauen

Gleiches Vorgehen wie bei `get_date_info`. Diesmal liest Claude Code zusätzlich die
Layout-Spezifikation und den Abschnitt zur Archiv-Schnittstelle:

```text
Lies docs-dev/02-layout-spezifikation.md, docs-dev/03-mcp-tool-spezifikation.md
(Abschnitt "render_joke_screen") und docs-dev/06-recherche-trmnl.md (Abschnitt 7.7).

1. Erstelle server/templates/witz.blade.php nach dem Layout aus 02 mit den Klassen
   des TRMNL-Frameworks. Texte nur ueber {{ $data['setup'] }} usw. ausgeben, nie
   {!! !!}. Sonderfall Einzeiler (leere Pointe) beachten.
2. Erstelle server/src/lib/larapaper.ts mit pushPage(plugin, data): Vorlage laden,
   Revisionsmarke {{-- rev: <ISO-Zeit> --}} voranstellen, settings.yml bauen
   (name, strategy: static, refresh_interval: 60, static_data als JSON-String),
   beides mit fflate zu einem ZIP packen und per fetch als multipart-Feld "file" an
   POST /api/plugin_settings/{id}/archive schicken. Header: Authorization Bearer und
   Accept: application/json. URL, Token und IDs nur aus process.env.
3. Erstelle server/src/tools/renderJokeScreen.ts als duennen MCP-Tool-Wrapper:
   Texte kuerzen wie in 03 beschrieben, dann pushPage('witz', …).
```

Danach `npm install fflate`. Beim Code-Review besonders prüfen:

- Landet Text vom Modell irgendwo im Markup statt in `static_data`? Dann ist das ein
  Sicherheitsfehler (Blade kann PHP ausführen), kein Schönheitsfehler.
- Wird die Revisionsmarke bei **jedem** Aufruf neu gesetzt?
- Stehen Token oder ID irgendwo im Code oder in der Tool-Rückgabe?

### Mit dem MCP Inspector testen (ohne KI)

Der [MCP Inspector](https://github.com/modelcontextprotocol/inspector) ist ein
Web-UI, das einen Server direkt anspricht – ganz ohne Agenten dazwischen. Das ist
der wichtigste Baustein, um Tools **isoliert** zu verstehen, bevor ein Agent
mitspielt:

```bash
npx @modelcontextprotocol/inspector npx tsx src/mcp-server.ts
```

Im geöffneten Browser-Tab: **Connect**, dann Tab **Tools**, jedes Tool einzeln mit
Testwerten aufrufen und die Rückgabe gegen `03-mcp-tool-spezifikation.md` prüfen.

**Checkpoint:** `get_joke`, `get_date_info` und `render_joke_screen` laufen einzeln
im Inspector und liefern plausible Ergebnisse. Nach `render_joke_screen` heißt die
Seite in LaraPaper „Witz des Tages“, und ihre **Vorschau** zeigt den Testwitz.

**Selbstcheck:**
- Was passiert technisch zwischen Inspector-Klick und Tool-Antwort (welche
  Prozesse, welches Protokoll)?
- Was passiert, wenn ich in `get_joke` das Schema für `category` von `z.enum(...)`
  auf `z.string()` ändere und im Inspector `"Witze"` eingebe? Wer meldet dann den
  Fehler, Zod oder die JokeAPI, und welcher Fehlertext ist für das Modell hilfreicher?
- Kann ich den Unterschied zwischen `lib/` (Logik) und `tools/` (MCP-Wrapper)
  ohne Notizen erklären?

---

## Phase 4 – Agent anbinden (ca. 45 Min.)

### Server in Claude Code registrieren

```bash
claude mcp add trmnl-display -- npx tsx server/src/mcp-server.ts
```

(Der genaue Befehl kann sich mit neueren Claude-Code-Versionen ändern – im
Zweifel `claude mcp --help` bzw. die aktuelle Claude-Code-Dokumentation prüfen.)

Prüfen, ob der Server erkannt wurde:
```bash
claude mcp list
```

### Auftrag formulieren

Im Claude-Code-Chat:

```text
Hol einen Programmierwitz und das heutige Datum. Bring den Witz nach den Regeln aus
docs-dev/04-prompt-design.md auf den Screen (bei Bedarf übersetzen, Setup max. 140,
Pointe max. 100 Zeichen, keine Emojis). Rendere abschließend den Screen.
```

Danach dasselbe mit Thema: *„… einen Kaffeewitz …“*. Spannend ist, ob der Agent von
selbst auf `topic: "coffee"` und `lang: "en"` kommt und den Witz übersetzt.

### Beobachten und iterieren

- In welcher Reihenfolge ruft der Agent die Tools auf? Wartet er auf beide
  Datenquellen, bevor er den Screen rendert?
- Hält sich die Übersetzung an die Regeln aus `04-prompt-design.md` (Pointe
  erhalten, Längen, kein erklärtes Wortspiel)? Falls nicht: System-Prompt/Anweisung
  präzisieren, nicht das Layout ändern.
- Ruft der Agent `render_joke_screen` wirklich erst als letzten Schritt auf? Falls er
  es zu früh aufruft (z. B. ohne Witz), ist das ein Hinweis auf eine zu
  unklare Tool-Beschreibung – Testfall für "Bewusst kaputt machen" weiter unten.

**Checkpoint:** Die Vorschau der Seite „Witz des Tages“ in LaraPaper zeigt korrektes
Datum, korrekte KW und einen Witz aus der JokeAPI, sauber in Setup und Pointe getrennt.

**Selbstcheck:**
- Warum ruft der Agent die Tools in dieser Reihenfolge auf – steht das in den
  Tool-Beschreibungen oder hat er es "erraten"?
- Was ändert sich, wenn ich die Beschreibung von `get_joke` auf ein einziges
  Wort kürze? Findet der Agent dann noch den Hinweis zu `lang=en`?
- Kann ich erklären, warum `get_date_info` bewusst kein LLM nutzt, `render_joke_screen`
  aber schon vom Modell bearbeitete Eingaben (den übersetzten Witz) entgegennimmt?

---

## Phase 5 – Display anbinden (ca. 60 Min.)

### BYOS-Server bereitstellen

> **Hinweis:** Wir nutzen LaraPaper als BYOS-Server. Der folgende Express-Server
> ist nur zum Verständnis des Protokolls gedacht und wird für das Projekt nicht
> benötigt. Wie der MCP-Server Seiten an LaraPaper übergibt, steht in
> `06-recherche-trmnl.md` (Abschnitt 7.7) und in Phase 3 Teil B.

`server/src/byos/server.ts` implementiert die drei Endpunkte aus dem Briefing
(`GET /api/display`, `GET /api/setup`, `POST /api/log`) nach dem Terminus/TRMNL-
Protokoll. Minimalversion als Ausgangspunkt (Feldnamen wie in
`03-mcp-tool-spezifikation.md`, Zusatzfelder je nach genutzter BYOS-Doku prüfen):

```ts
import express from 'express';
import path from 'node:path';

const app = express();
app.use(express.json());
app.use('/images', express.static(path.join(process.cwd(), 'public', 'images')));

const ACCESS_TOKEN = process.env.BYOS_DEVICE_ACCESS_TOKEN ?? 'change-me';
const BASE_URL = process.env.BYOS_PUBLIC_BASE_URL ?? 'http://localhost:3000';

app.get('/api/setup', (req, res) => {
  res.json({
    status: 200,
    api_key: ACCESS_TOKEN,
    image_url: `${BASE_URL}/images/current.png`,
    message: 'Willkommen! Geraet ist mit dem eigenen Server verbunden.'
  });
});

app.get('/api/display', (req, res) => {
  if (req.header('Access-Token') !== ACCESS_TOKEN) {
    return res.status(401).json({ status: 401, message: 'Ungueltiger Access-Token' });
  }
  res.json({
    status: 0,
    image_url: `${BASE_URL}/images/current.png?v=${Date.now()}`,
    filename: `current-${Date.now()}`,
    refresh_rate: 1800,
    reset_firmware: false,
    update_firmware: false
  });
});

app.post('/api/log', (req, res) => {
  console.warn('[device-log]', JSON.stringify(req.body?.logs ?? []));
  res.status(204).end();
});

app.listen(3000, () => console.log('BYOS-Server laeuft auf Port 3000'));
```

Starten:
```powershell
npm run byos
```

Kurzer Funktionstest ohne Gerät (PowerShell – `curl` ist hier ein Alias für
`Invoke-WebRequest` mit anderer Flag-Syntax, deshalb `Invoke-RestMethod` nutzen):
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/display" -Headers @{ "Access-Token" = "<dein BYOS_DEVICE_ACCESS_TOKEN>" }
```

Die Antwort sollte `image_url`, `filename` und `refresh_rate` enthalten (siehe
`03-mcp-tool-spezifikation.md` und den Terminus-API-Referenz-Link oben).

### Gerät auf den eigenen Server zeigen lassen

Das Gerät meldet sich bei LaraPaper an. Der genaue Ablauf steht in
`06-recherche-trmnl.md` (Abschnitt Seeed-Kit) und im LaraPaper-README. Grundsätzlich:

1. In LaraPaper die automatische Geräteanmeldung erlauben ("Permit Auto-Join").
2. Gerät ins WLAN bringen (Setup-Modus, siehe Gerätehandbuch) und als Server-URL
   die LaraPaper-Adresse eintragen.
3. Das Gerät erscheint danach in der LaraPaper-Oberfläche.

Da sich Setup-Abläufe je nach Firmware-Version ändern können: vor dem eigentlichen
Test die aktuelle LaraPaper-Doku konsultieren.

### Screen auf Auftrag aktualisieren

Es gibt bewusst **keine Zeitsteuerung**. Einen neuen Screen erzeugst du, indem du
den Agenten beauftragst – genau wie in Phase 4. So läuft es dann ab:

1. Der Agent ruft `render_joke_screen` auf, der MCP-Server lädt die Seite hoch.
2. Weil sich das Markup geändert hat (Revisionsmarke), verwirft LaraPaper das
   gespeicherte Bild der Seite.
3. Beim nächsten Geräte-Abruf, bei dem die Seite in der Playlist dran ist, rendert
   LaraPaper sie neu und liefert sie aus.

Wie lange das dauert, hängt an der Playlist: im ungünstigsten Fall Anzahl der Seiten ×
Refresh-Intervall. Für die Live-Demo deshalb eine Playlist mit **nur der Witz-Seite**
und ein kurzes Refresh-Intervall (z. B. 60 s) einstellen.

**Checkpoint:** Nach einem Agenten-Auftrag zeigt das Display, sobald die Seite an der
Reihe ist, den Witz des Tages mit Datum und Kalenderwoche.

### Ausbau: Inhalte gezielt korrigieren

Mit den Tools aus `07-weitere-mcp-tools.md` (`list_plugins`, `get_plugin`,
`update_plugin`) kann der Agent einen Fehler auf dem Display selbst finden und
beheben. Ein guter Demo-Auftrag:

```text
Auf dem Display steht beim Zitat "Unbekannt" als Autor. Prüf das und korrigier es,
ohne den Rest der Seite zu ändern.
```

Beobachten: Liest der Agent die Seite erst mit `get_plugin`, bevor er schreibt? Ändert
er wirklich nur den Autor?

**Selbstcheck:**
- Welcher Teil der Kette gehört zum Gerät (Polling über `refresh_rate`), welcher
  zum Server, welcher zum Agenten?
- Was sieht das Display, wenn der Agent-Lauf abbricht, weil die JokeAPI nicht
  erreichbar ist? (Mit `05-fehler-und-fallbacks.md` abgleichen und ausprobieren.)
- Was müsste man ergänzen, wenn der Screen doch automatisch aktualisiert werden
  soll – und warum wäre dafür kein Agent nötig?

---

## Fehlersuche: häufige Stolpersteine

| Symptom | Wahrscheinliche Ursache |
|---|---|
| Inspector verbindet sich nicht | `console.log`-Aufruf im Server verunreinigt den stdio-Stream – auf `console.error` umstellen |
| "Cannot find module '@modelcontextprotocol/server/stdio'" | Altes v1-Paket (`@modelcontextprotocol/sdk`) installiert, aber v2-Importpfad verwendet, oder umgekehrt – Paketname und Importpfade müssen zur installierten Version passen |
| Zod-Validierungsfehler trotz "richtiger" Eingabe im Inspector | Zod-Version zwischen SDK-Peer-Dependency und installierter `zod`-Version inkompatibel (v2 des SDK erwartet Zod v4 über `zod/v4`) |
| Upload liefert `401` | Token falsch oder gelöscht, oder Header nicht als `Authorization: Bearer <token>` gesendet |
| Upload liefert `302` bzw. eine HTML-Seite statt JSON | Header `Accept: application/json` fehlt. Laravel leitet dann bei Validierungsfehlern weiter, statt den Fehler zu melden |
| Upload liefert `422` (*file must be a zip*) | Multipart-Feld heißt nicht `file`, oder Dateiname/Typ ist nicht `.zip` / `application/zip` |
| Upload liefert `500` (mit `APP_DEBUG=true` als *Invalid ZIP structure* lesbar) | `settings.yml` oder `full.blade.php` fehlen im ZIP oder liegen in einem Unterordner (erlaubt sind nur der Wurzelordner und `src/`) |
| Export liefert `404` | `trmnlp_id` in `.env` falsch, oder die Seite wurde in der Oberfläche angelegt und hat gar keine `trmnlp_id` |
| Seite heißt nach dem Upload „Imported Plugin“ | `name` fehlt in `settings.yml` |
| Upload erfolgreich, Display zeigt trotzdem den alten Witz | Entweder ist die Seite in der Playlist noch nicht wieder dran, oder die Revisionsmarke fehlt. Dann hat sich nur `static_data` geändert, und LaraPaper rendert erst nach `refresh_interval` Minuten neu |
| Display zeigt leere Stellen statt Text | Schlüssel in `static_data` und `$data['…']` in der Vorlage passen nicht zusammen (siehe Konsistenz-Hinweis in `03`) |
| `get_joke` meldet „Kein Witz zu diesem Stichwort“ | Stichwortsuche mit `lang=de` findet im kleinen deutschen Bestand fast nie etwas – `lang=en` verwenden |
| Trotz `safe-mode` kommen Witze mit `"safe": false` | Parameter als `safe-mode=` (leerer Wert) gesendet, etwa über `searchParams.set('safe-mode', '')`. Die API ignoriert ihn dann. `safe-mode=true` oder `safe-mode` ohne `=` verwenden |
| Witz zeigt `&szlig;` statt „ß“ | Kein Fehler: Bei Witz 14 ist das die Pointe. Nicht pauschal HTML-Entities dekodieren |
| Claude Code sieht den MCP-Server nicht | Pfad in `claude mcp add` relativ zum falschen Arbeitsverzeichnis, oder der Server-Prozess bricht beim Start ab – Server erst manuell mit `npx tsx src/mcp-server.ts` testen |

---

## Bewusst kaputt machen

Dieser Abschnitt ist bewusst Teil der Anleitung, nicht optional – laut Lernstrategie
(`README.md`) oft der lehrreichste Teil einer Demo:

1. **JokeAPI abschalten:** In `server/src/lib/jokes.ts` die URL kurzzeitig
   auf eine ungültige Adresse ändern. Beobachten: Wie reagiert `get_joke`
   (Fehlertext, `isError`)? Wie reagiert der Agent darauf – meldet er den
   Fehler, oder erfindet er einen Witz?
2. **Falsches Schema zurückgeben:** In `get_date_info` `isoWeek` versehentlich als
   String statt Zahl zurückgeben (Rückgabetext, nicht das Zod-Schema ändern).
   Beobachten: Meldet `render_joke_screen` einen Fehler? Versteht der Agent die
   Fehlermeldung und korrigiert er selbstständig?
3. **Tool-Beschreibung verschlechtern:** Die Beschreibung von `render_joke_screen` auf
   ein Wort kürzen ("rendert"). Im selben Auftrag wie in Phase 4 beobachten, ob
   der Agent das Tool noch zuverlässig und zur richtigen Zeit aufruft.
4. **Timeout simulieren:** In `fetchJoke` das `AbortSignal.timeout(8000)` auf
   `AbortSignal.timeout(1)` setzen. Beobachten, ob der Fehlerpfad tatsächlich
   greift oder der Prozess stattdessen hängen bleibt.
5. **Revisionsmarke weglassen:** In `pushPage` die Zeile mit `{{-- rev: … --}}`
   auskommentieren und zwei Witze nacheinander pushen. Beobachten: Die LaraPaper-
   Vorschau zeigt den neuen Witz, das Display aber weiter den alten. Warum? (Lösung:
   `06-recherche-trmnl.md`, Abschnitt 7.2.)

Für jedes Experiment: Ergebnis in `stolpersteine.md` festhalten, auch wenn nichts
Überraschendes passiert – "wie erwartet" ist ebenfalls eine Erkenntnis.

---

## Diskussionspunkte für die gemeinsame Session

(siehe auch `01-projektuebersicht.md`)

- Wo lohnt sich ein Agent, wo reicht klassischer Code? (Dieses Projekt beantwortet
  es konkret: Datum/KW = reine Logik im Tool, Auswahl/Übersetzung + Ablaufsteuerung = Modell.)
- Wie sichert man MCP-Server ab, wenn sie über HTTP statt stdio erreichbar sind?
  (Stichwort Host-/Origin-Validierung, siehe Streamable-HTTP-Doku des SDK.)
- Warum liefert das Modell nur Text und nie Markup? (LaraPaper rendert Blade, Blade
  kann PHP ausführen. Die Grenze zwischen Daten und Code zieht der MCP-Server.)
- Welche weiteren Tools wären denkbar? (Kalenderanbindung, Ticket-System,
  Serverstatus – die Tool-Vertrags-Struktur aus `03-mcp-tool-spezifikation.md`
  lässt sich direkt übertragen.)
- Vergleich der Harnesses/Modelle: Was ändert sich, wenn derselbe MCP-Server von
  einem anderen Client/Modell aus angesprochen wird? Was bleibt gleich, weil MCP
  modellunabhängig ist?
