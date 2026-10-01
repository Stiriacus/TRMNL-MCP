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
| Agent liefert zu langen Witz | Zeichenlimit-Check in `render_joke_screen` | Setup auf 140, Pointe auf 100 Zeichen kürzen (an Wortgrenze, mit "…") und Warnung im Tool-Ergebnis zurückgeben, damit der Agent nachbessern kann |
| Rendering schlägt fehl (Headless-Browser crasht, Timeout) | Exception in `render_joke_screen` / `src/lib/render.ts` | Zuletzt erfolgreich gerenderte PNG-Datei bleibt unverändert auf dem Server liegen und wird weiter ausgeliefert |
| Gerenderte PNG-Datei zu groß (> ca. 90 KB) | Dateigrößen-Check nach dem Rendern | Automatische Nachbearbeitung: Graustufen-Palette reduzieren, PNG neu komprimieren; hilft das nicht, `isError: true` mit Hinweis an den Agenten |
| BYOS-Server nicht erreichbar | Gerät bekommt keine Antwort auf `/api/display` | Liegt außerhalb der Software-Kontrolle dieses Projekts; TRMNL-Firmware zeigt in diesem Fall je nach Konfiguration den letzten Screen oder eine Geräte-eigene Fehleranzeige – vor dem Test in der aktuellen TRMNL-Doku nachsehen |
| Gerät meldet niedrige Akkuspannung | `Battery-Voltage`-Header bei `/api/display`-Anfrage | `refresh_rate` in der Antwort erhöhen (z. B. auf 3600s), um Akku zu schonen; siehe `get_device_status` |

## "Letzter guter Stand" – technische Umsetzung

`src/byos/server.ts` liefert bei `/api/display` immer die zuletzt von
`render_joke_screen` erzeugte Datei aus einem einzigen bekannten
Pfad (`public/images/current.png`). Ein neuer Render-Lauf schreibt zunächst in
eine temporäre Datei und ersetzt `current.png` erst nach erfolgreicher Prüfung
(Dateigröße, gültiges PNG) atomar (`fs.rename`). So sieht das Gerät nie eine
halb geschriebene oder fehlerhafte Datei.

## Offene Design-Entscheidung: Rendering-Methode

Das Briefing nennt dies explizit als offenen Punkt: **Headless-Browser
(Playwright/Puppeteer) vs. Bildbibliothek** (z. B. `@napi-rs/canvas`, SVG + `sharp`).

Der Code in diesem Projekt nutzt **Playwright** als Standard, weil:

- HTML/CSS zum Layouten einfacher iterierbar ist als Canvas-Zeichenbefehle,
- die Layout-Spezifikation (`02-layout-spezifikation.md`) direkt als CSS
  übersetzbar ist,
- für ein Lernprojekt der Zusatzaufwand (Chromium-Installation) vertretbar ist.

Nachteil: Chromium braucht mehr Ressourcen als eine reine Bildbibliothek – auf
sehr kleiner Server-Hardware (z. B. Raspberry Pi Zero) kann das spürbar sein. In
diesem Fall ist der Wechsel zu einer SVG-Vorlage plus `sharp`-Rendering eine
sinnvolle spätere Optimierung; die Schnittstelle von `render_joke_screen` (Eingabe:
Witz/Datum, Ausgabe: Dateiname + URL) bliebe dabei unverändert.

## Bewusst Kaputtes einplanen (siehe auch `anleitung.md`)

Diese Szenarien eignen sich für die gemeinsame Session, um Agentenverhalten
sichtbar zu machen:

1. JokeAPI-Aufruf im Code auf eine falsche URL zeigen lassen → beobachten, ob
   der Agent den Fehler erkennt und wie er reagiert (bricht ab? meldet den Fehler?
   erfindet einen Witz?).
2. `get_date_info` absichtlich ein falsches Feld zurückgeben lassen (z. B.
   `isoWeek` als String statt Zahl) → beobachten, wie `render_joke_screen` (Zod)
   reagiert und ob der Agent den Validierungsfehler richtig interpretiert.
3. Die Tool-Beschreibung von `render_joke_screen` auf eine Zeile ohne Kontext kürzen
   → beobachten, ob der Agent das Tool noch zuverlässig zur richtigen Zeit
   aufruft.
