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

## Offene Punkte

Diese Entscheidungen triffst du am besten vor Phase 0 (siehe auch `docs-dev/anleitung.md`,
Abschnitt "Vor dem Start"):

- Läuft auf deinem Server bereits eine BYOS-Software (z. B. Terminus), oder baust du
  neu auf Basis der Anleitung auf?
- Koordinaten (Breite/Länge) für die Wetterabfrage
- Harness/Modell für den Agenten (Claude Code; pi mit DeepSeek oder Ollama als Vergleich)
- Rendering-Methode: Headless-Browser (in der Anleitung als Standard gewählt, siehe
  `docs-dev/05-fehler-und-fallbacks.md`) vs. Bildbibliothek
- Termine für die gemeinsame Session

## Nächster Schritt

Wenn die Konzeption steht: Code-Gerüst auf Basis von `docs-dev/anleitung.md` und
`docs-dev/03-mcp-tool-spezifikation.md` aufbauen lassen – dafür einfach im nächsten
Schritt Bescheid geben.
