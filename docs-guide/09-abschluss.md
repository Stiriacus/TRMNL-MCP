# 9 · Abschluss und Einordnung

Agenten lohnen sich dort, wo **Sprache** verstanden oder erzeugt oder **flexibel
entschieden** werden muss. Alles Berechenbare gehört in normalen Code, und **MCP
verbindet beide Welten**.

## Wann ein Agent, wann normaler Code?

| Eher Agent | Eher klassischer Code |
|---|---|
| Aufträge in natürlicher Sprache, die jedes Mal etwas anders sind | Immer gleicher, festgelegter Ablauf |
| Texte formulieren, zusammenfassen, einordnen | Rechnen, Datumslogik, Formate |
| Mehrere Systeme situationsabhängig kombinieren | Harte Anforderungen an Korrektheit und Reproduzierbarkeit |
| Ein Mensch prüft das Ergebnis | Läuft unbeaufsichtigt und muss immer funktionieren |

Im Projekt sind Datum, Wetter und Rendering **Code**. Die Tagesmessage und die
Steuerung übernimmt das **Modell**. Wer den Screen regelmäßig automatisch aktualisieren
wollte, bräuchte dafür keinen Agenten, sondern ein Skript mit einem einzelnen
LLM-Aufruf für die Message.

## Was man aus dem Projekt mitnehmen kann

1. **Das Modell ist austauschbar.** Claude, DeepSeek und ein lokales Modell arbeiten
   mit denselben Tools. Man legt sich nicht auf einen Anbieter fest.
2. Der **Harness** ist die eigentliche **Plattform**. Kontext, Berechtigungen und
   Erweiterungen entscheiden über Qualität und Sicherheit.
3. **MCP ist die Integrationsschicht.** Ein Server, einmal gebaut, funktioniert in
   jedem MCP-fähigen Werkzeug.
4. Die Qualität eines MCP-Servers steckt in **Beschreibungen, Schemas und
   Fehlertexten**, nicht in der Menge der Tools.

## Risiken und offene Fragen

| Thema | Frage |
|---|---|
| **Halluzination** | Was passiert, wenn das Modell Daten erfindet? Dagegen helfen klare Fehler, Validierung und ein Mensch im Loop |
| **Sicherheit** | Wer darf welche Tools nutzen? Wie gehen wir mit Prompt Injection über Tool-Ergebnisse um? |
| **Datenschutz** | Welche Daten gehen an welchen Anbieter? Lokale Modelle sind eine Option |
| **Kosten** | Pro Auftrag Cent-Beträge (DeepSeek) bis nichts (lokal). Bei großen Modellen und vielen Aufrufen summiert es sich |
| **Betrieb** | stdio reicht lokal. Für ein Team braucht man HTTP-Server mit Authentifizierung |

## Mögliche nächste Schritte

- **Interne MCP-Server.** Welche unserer Systeme (Ticketsystem, Wiki, Monitoring,
  Datenbanken) würden als Tools für Agenten Sinn ergeben?
- **Ein Pilot** als kleiner, klar abgegrenzter Anwendungsfall mit Mensch im Loop.
- **Die Harness-Entscheidung.** Ein fertiges Produkt (Claude Code o. ä.) oder ein
  angepasster, offener Harness (pi) mit eigenen Regeln und eigener Modellwahl?

## Designentscheidungen in diesem Projekt

Nachlesen lassen sie sich in [`docs-dev`](../docs-dev/01-projektuebersicht.md).

- **Tool-Verträge vor dem Code** spezifiziert (`03-mcp-tool-spezifikation.md`)
- Logik (`lib/`) und MCP-Hülle (`tools/`) **getrennt**
- **Fehler- und Fallback-Verhalten** für jeden Ausfall durchdacht
  (`05-fehler-und-fallbacks.md`)
- **Prompt-Regeln explizit und prüfbar** formuliert (`04-prompt-design.md`)
- Bestehende **Infrastruktur** (LaraPaper) statt **Eigenbau** genutzt, nachdem die API
  recherchiert war (`06-recherche-trmnl.md`)
