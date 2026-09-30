# 01 – Projektübersicht

## Ziel

Ein Agent holt Wetterdaten und das aktuelle Datum, formuliert daraus eine kurze,
freundliche Tagesmessage und rendert einen Screen (800×480 px), den ein TRMNL
E-Ink-Display anzeigt. Datenbeschaffung und Rendering laufen als **MCP-Tools** –
der Agent entscheidet selbst, wann er welches Tool aufruft.

## Kontext

- Hardware: **TRMNL** (Variante von Seeed Studio)
- Das Gerät läuft im **BYOS- und BYOD-Modus**.

## Architektur im Überblick

| Baustein | Aufgabe | Technik |
|---|---|---|
| Wetterdaten | Temperatur, Zustand, Min/Max | Open-Meteo API (kein API-Key nötig) |
| Datum & Kalenderwoche | Deterministische Logik | Node.js, ISO-8601-Woche aus Systemzeit |
| Tagesmessage | Kreativer Kurztext | LLM (z. B. Claude) |
| MCP-Server | Stellt Tools für den Agenten bereit | Node.js, `@modelcontextprotocol/server`, `zod` |
| Rendering | HTML → 800×480-PNG | Headless-Browser (Playwright), serverseitig |
| Auslieferung | Bild an das Gerät | BYOS-Server, `GET /api/display` |

Eine bewusste Design-Entscheidung dieses Projekts: **es gibt keine Zeitsteuerung**
(kein Cron, kein Scheduler). Ein neuer Screen entsteht nur, wenn jemand den Agenten
beauftragt ("Mach mir den Screen für heute"). Das Gerät fragt zwar selbst
regelmäßig beim Server nach (`refresh_rate`), bekommt aber so lange den zuletzt
gerenderten Screen, bis der Agent einen neuen erzeugt.

Innerhalb eines Agenten-Laufs gilt trotzdem die Frage aus dem Briefing "Wo lohnt
sich ein Agent, wo reicht klassischer Code?": Datum und Kalenderwoche sind reine
Logik, Wetterabfrage und Rendering sind deterministische API-Aufrufe – deshalb
stecken sie als Code in den Tools. Nur die Formulierung der Message und die
Entscheidung, welches Tool wann aufgerufen wird, übernimmt das Sprachmodell.

```
                       ┌─────────────────────────┐
   Auftrag (Chat)      │  Harness + Modell       │   Claude Code oder pi
   ───────────────────►│  ruft MCP-Tools auf     │   (Claude, DeepSeek, Ollama …)
                       └───────────┬─────────────┘
                                   │ stdio (MCP)
                       ┌───────────▼─────────────┐
                       │   MCP-Server (Node.js)  │   src/tools/*.ts
                       │  get_weather            │   dünne Wrapper um
                       │  get_date_info          │   src/lib/*.ts
                       │  render_weather_screen          │
                       └───────────┬─────────────┘
                                   │ schreibt PNG
                       ┌───────────▼─────────────┐
                       │   BYOS-Server (Express) │   src/byos/server.ts
                       │  GET /api/display       │
                       └───────────┬─────────────┘
                                   │ HTTP (Polling)
                       ┌───────────▼─────────────┐
                       │   TRMNL-Display          │
                       └─────────────────────────┘
```

## Geplante MCP-Tools

| Tool | Zweck |
|---|---|
| `get_weather(lat, lon)` | Liefert aktuelle Wetterdaten (Temperatur, Zustand, Min/Max) |
| `get_date_info()` | Liefert Datum, Wochentag, ISO-Kalenderwoche |
| `render_weather_screen(weather, date, message)` | Baut das 800×480-Bild und legt es auf dem Server ab |
| `show_message(text)` *(optional)* | Zeigt eine freie Nachricht an, ohne Wetter/Datum |
| `get_device_status()` *(optional)* | Akku, WLAN-Signal, Firmware-Version des Geräts |

Details zu Ein-/Ausgabe und Fehlerfällen: siehe `03-mcp-tool-spezifikation.md`.

## Ablauf (Entwicklungsmodus)

1. Agent ruft `get_weather` und `get_date_info` auf.
2. Agent formuliert die Tagesmessage nach den Regeln aus `04-prompt-design.md`.
3. Agent ruft `render_weather_screen` mit den gesammelten Daten auf.
4. Das Display holt sich beim nächsten Wake-Cycle das fertige Bild über
   `GET /api/display` ab.

## Wichtige Designentscheidungen aus dem Briefing

- **Tool-Beschreibungen sind entscheidend.** Der Agent wählt Tools anhand der
  Beschreibung aus – vage Beschreibungen führen dazu, dass Tools gar nicht erst
  aufgerufen werden. Siehe `03-mcp-tool-spezifikation.md`.
- **Fallback einbauen.** Bei Ausfall der Wetter-API oder des LLM zeigt das
  Display den letzten guten Stand oder eine Standardnachricht. Siehe
  `05-fehler-und-fallbacks.md`.
- **Geräte-Refresh sparsam.** Das Gerät muss nicht öfter als alle 30–60 Minuten
  nachfragen (`refresh_rate`) – das schont den Akku. Neue Inhalte entstehen ohnehin
  nur auf Auftrag.
- **Transportarten von MCP:**
  - **stdio** – Server läuft lokal als Kindprozess des Clients, ideal zum Entwickeln
    (Claude Code, MCP Inspector).
  - **Streamable HTTP** – Server läuft dauerhaft, mehrere Clients können sich
    verbinden. Für dieses Projekt nicht zwingend nötig, aber relevant für die
    Diskussion in der Session (siehe unten).
- **MCP ist modellunabhängig.** Jeder MCP-fähige Client kann den Server nutzen –
  Claude Code oder ein Harness mit einem anderen Modell (z. B. DeepSeek). Guter
  Diskussionspunkt für die gemeinsame Session.

## Weiterführende Dokumente

- `02-layout-spezifikation.md` – exaktes Layout mit Maßen für den 800×480-Screen
- `03-mcp-tool-spezifikation.md` – Tool-Verträge (Schema, Rückgabe, Fehlerfälle)
- `04-prompt-design.md` – Prompt-Vorlage für die Tagesmessage
- `05-fehler-und-fallbacks.md` – Ausfallszenarien und Systemverhalten
- `anleitung.md` – Schritt-für-Schritt-Anleitung entlang der Phasen 0–5
- `stolpersteine.md` – Lernlog, während der Arbeit auszufüllen
