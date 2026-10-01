# TRMNL E-Ink Display mit MCP und Agenten

Lernprojekt: Ein Agent holt Wetterdaten, formuliert eine Tagesmessage und rendert daraus
einen Screen für ein TRMNL E-Ink-Display (BYOS-Modus). Datenbeschaffung und Rendering
laufen über MCP-Tools, die von Claude Code (oder einem anderen MCP-fähigen Client)
aufgerufen werden.

Dieses Paket enthält die **Konzeption** – reine Markdown-Dokumente. Der eigentliche
Code entsteht Schritt für Schritt beim Durcharbeiten von `docs-dev/anleitung.md`
(dort inline als Codebeispiele enthalten); es gibt bewusst noch kein separates
Code-Gerüst zum Auspacken.

## Zwei Dokumentationen

| Ordner | Zielgruppe | Zweck |
|---|---|---|
| `docs-guide/` | Vorgesetzte, Kolleg:innen | Erklär-Guide: Harness, MCP, pi, Live-Demo (Einstieg: `docs-guide/index.md`); später als statische Website über GitHub Pages |
| `docs-dev/` | ich selbst | Bauanleitung und Spezifikationen für das Projekt |

## Inhalt docs-dev

| Datei | Inhalt |
|---|---|
| `docs-dev/01-projektuebersicht.md` | Ziel, Architektur, Tool-Liste |
| `docs-dev/02-layout-spezifikation.md` | 800×480-Layout mit exakten Maßen |
| `docs-dev/03-mcp-tool-spezifikation.md` | Tool-Verträge (Schema, Rückgabe, Fehlerfälle) |
| `docs-dev/04-prompt-design.md` | Prompt-Vorlage und Beispiele für die Tagesmessage |
| `docs-dev/05-fehler-und-fallbacks.md` | Ausfallszenarien und Systemverhalten |
| `docs-dev/anleitung.md` | Schritt-für-Schritt-Anleitung (Phase 0–5), Windows, mit Codebeispielen |
| `docs-dev/stolpersteine.md` | Leeres Lernlog zum Ausfüllen während der Arbeit |
| `docs-dev/06-recherche-trmnl.md` | Recherche: LaraPaper (Webhook-Plugins, Playlists, Markup-API), Seeed-Kit |
| `docs-dev/07-weitere-mcp-tools.md` | Weitere Tools (Witze, HTTP-Status, Zitat, Geschichte) und Tagesplaylist |

**Empfohlene Lesereihenfolge:** `01-projektuebersicht.md` → `02-layout-spezifikation.md`
→ `03-mcp-tool-spezifikation.md` → `04-prompt-design.md` → `05-fehler-und-fallbacks.md`
→ `anleitung.md`. Das `stolpersteine.md` wird begleitend während der Arbeit geführt.

## Wichtiger Hinweis zu Versionen

Die Inhalte wurden im September 2026 gegen die dann aktuellen Versionen geprüft
(Node.js 24 LTS "Krypton", `@modelcontextprotocol/server` v2, Open-Meteo, TRMNL/Terminus-API).
MCP und das TRMNL-Ökosystem entwickeln sich weiter — vor dem eigentlichen Start lohnt sich
ein kurzer Blick in die jeweils aktuelle Dokumentation (Links in `docs-dev/anleitung.md`).

## Festgelegt

- BYOS: Wir nutzen die BYOS-Lösung einer anderen Plattform, keine eigene Neuentwicklung.
- Koordinaten für die Wetterabfrage: Ingolstadt, Breite 48.7665, Länge 11.4258
