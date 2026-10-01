# 05 – Fehler- und Fallback-Szenarien

Leitprinzip: **Das Display zeigt lieber einen leicht veralteten, aber korrekten
Screen als gar keinen oder einen kaputten.** Jede Komponente hat daher einen
klar definierten Rückfall.

## Übersicht

Da es keine Zeitsteuerung gibt, läuft jede Aktualisierung als Agenten-Lauf auf
Auftrag. Fällt etwas aus, entsteht einfach **kein neuer Screen** – der alte bleibt
auf dem Gerät. Die wichtigste Anforderung an den Agenten ist daher: Fehler ehrlich
melden, **keine Werte erfinden**.

| Ausfall | Erkennung | Fallback-Verhalten |
|---|---|---|
| JokeAPI nicht erreichbar / Timeout | `get_joke` liefert `isError: true` | Agent meldet den Fehler im Chat und zeigt **keinen selbst erfundenen Witz**; auf Nachfrage kann er per `show_message` einen reinen Text anzeigen, der klar kein Witz aus der API ist |
| Kein Witz zum Stichwort (HTTP 400, `code: 106`) | `get_joke` liefert `isError: true` mit Hinweis | Agent versucht es ohne `topic` oder mit `lang=en` (genau das steht im Fehlertext) |
| JokeAPI liefert unerwartetes Format (API-Änderung) | JSON-Parsing/Zod-Validierung schlägt fehl | Wie „nicht erreichbar“; zusätzlich Stolperstein-Eintrag anlegen, da das auf eine API-Änderung hindeutet |
| JokeAPI-Rate-Limit (120 Anfragen pro Minute) | HTTP 429 | `isError: true` mit Hinweis, kurz zu warten. Bei einem Agenten, der „nur noch einen Witz“ holt, durchaus erreichbar |
| LLM / Harness nicht erreichbar | Kein Agenten-Lauf möglich | Kein neuer Screen, der zuletzt gerenderte bleibt aktiv – bewusst akzeptiert, da es keine Zeitsteuerung gibt |
| Agent liefert zu langen Witz | Zeichenlimit-Check in `update_joke_page` | Setup auf 140, Pointe auf 100 Zeichen kürzen (an Wortgrenze, mit "…") und Warnung im Tool-Ergebnis zurückgeben, damit der Agent nachbessern kann |
| LaraPaper beim Upload nicht erreichbar / Timeout | `fetch` in `lib/larapaper.ts` schlägt fehl | `isError: true`. Die Seite in LaraPaper bleibt unverändert, das Display zeigt weiter den letzten Witz. Agent meldet den Fehler und behauptet nicht „fertig“ |
| Token ungültig (HTTP 401) | Antwort der Archiv-Schnittstelle | `isError: true` mit „Token ungültig oder abgelaufen“. Das Modell kann das nicht beheben und soll nicht erneut versuchen |
| Upload abgelehnt (HTTP 404, 422, 500) | Antwort der Archiv-Schnittstelle | `isError: true` mit Status und Meldung. Das ist ein Fehler im Server-Code (ZIP-Aufbau, falsche ID), kein Fall für das Modell. Alte Seite bleibt aktiv |
| Upload erfolgreich, Display zeigt alten Inhalt | Vorschau in LaraPaper neu, Gerät alt | Kein Ausfall: Die Seite ist in der Playlist noch nicht wieder dran. Fehlt die Revisionsmarke, rendert LaraPaper erst nach `refresh_interval` neu (siehe `06`, Abschnitt 7.2) |
| Rendering in LaraPaper schlägt fehl (Fehler in der Vorlage) | LaraPaper-Log, Fehlerbild auf dem Display | LaraPaper zeigt ein eigenes Fehlerbild mit dem Namen der Seite. Deshalb jede Vorlagenänderung zuerst in der Vorschau prüfen |
| LaraPaper für das Gerät nicht erreichbar | Gerät bekommt keine Antwort auf `/api/display` | Liegt außerhalb der Software-Kontrolle dieses Projekts; TRMNL-Firmware zeigt in diesem Fall je nach Konfiguration den letzten Screen oder eine Geräte-eigene Fehleranzeige – vor dem Test in der aktuellen TRMNL-Doku nachsehen |
| Gerät meldet niedrige Akkuspannung | `get_device_status` | Refresh-Intervall des Geräts in LaraPaper erhöhen (z. B. auf 3600 s), um den Akku zu schonen |

## "Letzter guter Stand" – technische Umsetzung

Den liefert LaraPaper. Ein Upload ersetzt die Seite in einem Schritt
(`updateOrCreate`). Scheitert er, bleibt die alte Seite vollständig erhalten, und das
Gerät bekommt weiter ihr gespeichertes Bild. Damit ein Upload nicht an halben Daten
scheitert, baut `lib/larapaper.ts` das ZIP vollständig im Speicher und schickt es erst
dann ab.

Eine Lücke bleibt: Ein Upload mit **inhaltlich** kaputter Vorlage (z. B. Blade-Fehler)
wird angenommen, und LaraPaper zeigt dann sein Fehlerbild. Deshalb ändert der Agent nie
die Vorlage, und Vorlagenänderungen durch Menschen werden zuerst in der Vorschau
geprüft.

## Entschiedene Design-Frage: Rendering-Methode

Das Briefing nannte als offenen Punkt: **Headless-Browser (Playwright/Puppeteer) vs.
Bildbibliothek** (z. B. `@napi-rs/canvas`, SVG + `sharp`). Entschieden ist: **weder
noch**. LaraPaper rendert selbst (HTML → Bild, Graustufen, Größenlimit) mit dem
TRMNL-Framework. Der MCP-Server lädt nur die Seite hoch (siehe `06`, Abschnitt 7.7).

Die Schnittstelle von `update_joke_page` zum Modell (Name, Eingabeschema) ist
dabei gleich geblieben. Nur die Rückgabe enthält keinen Dateinamen und keine URL mehr.

## Bewusst Kaputtes einplanen (siehe auch `anleitung.md`)

Diese Szenarien eignen sich für die gemeinsame Session, um Agentenverhalten
sichtbar zu machen:

1. JokeAPI-Aufruf im Code auf eine falsche URL zeigen lassen → beobachten, ob
   der Agent den Fehler erkennt und wie er reagiert (bricht ab? meldet den Fehler?
   erfindet einen Witz?).
2. `get_date_info` absichtlich ein falsches Feld zurückgeben lassen (z. B.
   `isoWeek` als String statt Zahl) → beobachten, wie `update_joke_page` (Zod)
   reagiert und ob der Agent den Validierungsfehler richtig interpretiert.
3. Die Tool-Beschreibung von `update_joke_page` auf eine Zeile ohne Kontext kürzen
   → beobachten, ob der Agent das Tool noch zuverlässig zur richtigen Zeit
   aufruft.
