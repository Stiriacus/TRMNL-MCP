# 01 – Projektübersicht

## Ziel

Ein Agent holt einen Witz aus der JokeAPI und das aktuelle Datum, wählt den Witz
aus, überträgt ihn bei Bedarf ins Deutsche, bringt ihn auf Display-Länge und lädt
ihn als Seite „Witz des Tages“ nach LaraPaper hoch. LaraPaper rendert daraus den
Screen (800×480 px), den ein TRMNL E-Ink-Display anzeigt. Datenbeschaffung und
Upload laufen als **MCP-Tools** – der Agent entscheidet selbst, wann er welches Tool
aufruft. LaraPaper selbst wird dafür nicht verändert, und sein eingebauter MCP-Server
wird nicht genutzt (siehe `06-recherche-trmnl.md`, Abschnitt 7.7).

## Kontext

- Hardware: **TRMNL** (Variante von Seeed Studio)
- Das Gerät läuft im **BYOS- und BYOD-Modus**.

## Architektur im Überblick

| Baustein | Aufgabe | Technik |
|---|---|---|
| Witz | Setup und Pointe, jugendfrei | JokeAPI (kein API-Key nötig, `safe-mode`) |
| Datum & Kalenderwoche | Deterministische Logik | Node.js, ISO-8601-Woche aus Systemzeit |
| Auswahl, Übersetzung, Kürzen | Sprachliche Arbeit am Witz | LLM (z. B. Claude) |
| MCP-Server | Stellt Tools für den Agenten bereit | Node.js, `@modelcontextprotocol/server`, `zod` |
| Seite hochladen | Witz und Datum in eine feste Blade-Vorlage, als Seite (static-Recipe) nach LaraPaper | MCP-Server, LaraPaper-Archiv-Schnittstelle (`POST /api/plugin_settings/{id}/archive`) |
| Rendering und Auslieferung | Seite → 800×480-Bild, Playlist, Bild an das Gerät | LaraPaper (BYOS-Server) mit TRMNL-Framework |

Eine bewusste Design-Entscheidung dieses Projekts: **es gibt keine Zeitsteuerung**
(kein Cron, kein Scheduler). Ein neuer Screen entsteht nur, wenn jemand den Agenten
beauftragt ("Mach mir den Screen für heute"). Das Gerät fragt zwar selbst
regelmäßig bei LaraPaper nach, bekommt aber so lange die zuletzt hochgeladene
Seite, bis der Agent sie überschreibt.

Innerhalb eines Agenten-Laufs gilt trotzdem die Frage aus dem Briefing "Wo lohnt
sich ein Agent, wo reicht klassischer Code?": Datum und Kalenderwoche sind reine
Logik, Witzabruf und Upload sind deterministische API-Aufrufe – deshalb
stecken sie als Code in den Tools. Das Rendern übernimmt LaraPaper. Nur Auswahl,
Übersetzung und Kürzen des Witzes und die Entscheidung, welches Tool wann aufgerufen wird, übernimmt das Sprachmodell.

```
                       ┌─────────────────────────┐
   Auftrag (Chat)      │  Harness + Modell       │   Claude Code oder pi
   ───────────────────►│  ruft MCP-Tools auf     │   (Claude, DeepSeek, Ollama …)
                       └───────────┬─────────────┘
                                   │ stdio (MCP)
                       ┌───────────▼─────────────┐
                       │   MCP-Server (Node.js)  │   src/tools/*.ts
                       │  get_joke               │   dünne Wrapper um
                       │  get_date_info          │   src/lib/*.ts
                       │  update_joke_page     │
                       └───────────┬─────────────┘
                                   │ lädt Seite hoch (ZIP: settings.yml + Blade)
                       ┌───────────▼─────────────┐
                       │   LaraPaper (BYOS)      │   rendert die Seite,
                       │  Seiten + Playlist      │   Playlist rotiert
                       └───────────┬─────────────┘
                                   │ HTTP (Polling)
                       ┌───────────▼─────────────┐
                       │   TRMNL-Display         │
                       └─────────────────────────┘
```

## Geplante MCP-Tools

| Tool | Zweck |
|---|---|
| `get_joke(category, lang, topic?)` | Liefert einen jugendfreien Witz (Setup und Pointe) |
| `get_date_info()` | Liefert Datum, Wochentag, ISO-Kalenderwoche |
| `update_joke_page(joke, date)` | Überschreibt die Seite „Witz des Tages“ in LaraPaper |
| `show_message(text)` *(optional)* | Zeigt eine freie Nachricht an, ohne Witz/Datum |
| `get_device_status()` *(optional)* | Akku, WLAN-Signal, Firmware-Version aller Geräte |

Details zu Ein-/Ausgabe und Fehlerfällen: siehe `03-mcp-tool-spezifikation.md`.

## Ablauf (Entwicklungsmodus)

1. Agent ruft `get_joke` und `get_date_info` auf.
2. Agent wählt den Witz aus, überträgt ihn bei Bedarf ins Deutsche und kürzt ihn
   nach den Regeln aus `04-prompt-design.md`.
3. Agent ruft `update_joke_page` mit den gesammelten Daten auf. Das Tool lädt die
   Seite als ZIP nach LaraPaper hoch und überschreibt die vorhandene Seite.
4. Das Display fragt bei jedem Wake-Cycle `GET /api/display` bei LaraPaper an. Ist
   die Seite in der Playlist an der Reihe, rendert LaraPaper sie neu und liefert das
   Bild aus. Bis dahin zeigt das Display weiter die anderen Seiten der Playlist.

## Wichtige Designentscheidungen aus dem Briefing

- **Tool-Beschreibungen sind entscheidend.** Der Agent wählt Tools anhand der
  Beschreibung aus – vage Beschreibungen führen dazu, dass Tools gar nicht erst
  aufgerufen werden. Siehe `03-mcp-tool-spezifikation.md`.
- **Fallback einbauen.** Bei Ausfall der JokeAPI oder des LLM zeigt das
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
    Diskussion in der Session.
- **MCP ist modellunabhängig.** Jeder MCP-fähige Client kann den Server nutzen –
  Claude Code oder ein Harness mit einem anderen Modell (z. B. DeepSeek). Guter
  Diskussionspunkt für die gemeinsame Session.

## Weiterführende Dokumente

- `02-layout-spezifikation.md` – exaktes Layout mit Maßen für den 800×480-Screen
- `03-mcp-tool-spezifikation.md` – Tool-Verträge (Schema, Rückgabe, Fehlerfälle)
- `04-prompt-design.md` – Regeln und Prompt-Vorlage für den Witz des Tages
- `05-fehler-und-fallbacks.md` – Ausfallszenarien und Systemverhalten
- `06-recherche-trmnl.md` – LaraPaper-Recherche, Push-Logik und Archiv-Schnittstelle
- `07-weitere-mcp-tools.md` – weitere Tools, Tagesplaylist und gezielte Korrektur
- `anleitung.md` – Schritt-für-Schritt-Anleitung entlang der Phasen 0–5
- `stolpersteine.md` – Lernlog, während der Arbeit auszufüllen
