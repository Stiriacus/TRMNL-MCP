# 8 · Der Ablauf vom Auftrag zum Display

Auf [Seite 7](07-selbst-bauen.md) sind die Tools entstanden, jetzt arbeiten sie
zusammen. Ein Satz im Chat, ein paar Tool-Aufrufe und am Ende ein fertiger Screen,
mit zwei Harnesses und mehreren Modellen, aber **denselben MCP-Servern.**

Die Seite ist ein **Baukasten**, in dem jeder Akt für sich steht. Welche wir zeigen,
hängt davon ab, wie weit Seite 7 gekommen ist.

| Akt | Braucht |
|---|---|
| 1. Der Witz des Tages | `trmnl-display` mit drei Tools |
| 2. Anderer Harness, anderes Modell | Akt 1 und pi |
| 3. Die Tagesplaylist | zusätzlich `tagesinhalte`, fürs Display LaraPaper |
| 4. Bewusst kaputt machen | Akt 1 |

## Was aus Seite 7 da sein muss

- [ ] `trmnl-display` mit `get_joke`, `get_date_info` und `render_joke_screen`,
      jedes Tool im Inspector geprüft
- [ ] in Claude Code angebunden, sodass `claude mcp list` den Server zeigt
- [ ] für Akt 2 pi mit DeepSeek-Key, ein vorher heruntergeladenes Ollama-Modell
      (`ollama pull …` dauert sonst Minuten) und eine vorhandene `.pi/mcp.json`
- [ ] für Akt 3 der Server `tagesinhalte`, gebaut und angebunden

Nur fürs echte Display braucht es zusätzlich Folgendes.

- [ ] LaraPaper läuft, das Gerät ist verbunden (→ [docs-dev/06](../docs-dev/06-recherche-trmnl.md))
- [ ] Plugins `witz`, `zitat`, `geschichte` und `http` sind angelegt und in der
      Playlist, `update_plugin` ist gebaut
- [ ] `refresh_rate` am Gerät steht für die Demo auf ca. 60 s

Ohne Display ist das Ergebnis das **PNG** unter `server/public/images/`. Für alles,
was hier gezeigt wird, reicht das.

## Akt 1 · Der Witz des Tages (Claude Code)

```text
Hol einen Kaffeewitz und das heutige Datum. Bring den Witz nach den Regeln aus
docs-dev/04-prompt-design.md auf Deutsch und auf Display-Länge und erzeuge den
Screen.
```

Auf vier Dinge achten wir.

1. **Die Reihenfolge.** Das Modell holt erst Witz und Datum (oft parallel) und ruft
   `render_joke_screen` zuletzt auf. Das steht in keinem Code, sondern **nur in den
   Tool-Beschreibungen**, die wir auf Seite 7 geschrieben haben.
2. **Die Parameter.** Im Auftrag steht „Kaffeewitz“, das Tool will `topic` und
   `lang`. Wählt das Modell `topic: "coffee"` und `lang: "en"`, wie es die
   Beschreibung empfiehlt, oder probiert es erst Deutsch und reagiert dann auf den
   Fehlertext? Danach **übersetzt es selbst.**
3. **Die Tool-Ergebnisse** im Verlauf aufklappen. Das ist das JSON aus unserem Server.
4. **Das Ergebnis.** Das PNG öffnen oder mit LaraPaper nach dem nächsten Refresh aufs
   Display schauen.

## Akt 2 · Anderer Harness, anderes Modell (pi)

Denselben Auftrag stellen wir in pi, zuerst mit **DeepSeek** und dann mit einem
**lokalen Ollama-Modell**. **Am Server ändert sich nichts.**

| | Claude Code + Claude | pi + DeepSeek | pi + Ollama (lokal) |
|---|---|---|---|
| Tools in richtiger Reihenfolge? | | | |
| Witz regelkonform (Pointe erhalten, Längen, keine Emojis)? | | | |
| Übersetzung gelungen? | | | |
| Dauer | | | |
| Kosten | | | 0 € |

*Die Tabelle live ausfüllen, das macht den Vergleich greifbar.*

## Akt 3 · Die Tagesplaylist (zwei MCP-Server)

```text
Stell die Inhalte für heute zusammen: einen Kaffeewitz, ein Zitat, ein Ereignis aus
der Geschichte und zum Abschluss einen HTTP-Status mit einem Spruch dazu.
```

Hier lohnt der Blick auf vier Punkte.

- Der Agent nutzt **zwei Server gleichzeitig** (`tagesinhalte` und `trmnl-display`),
  die nichts voneinander wissen.
- Er ruft die **Datenquellen parallel** ab und macht dann die Arbeit, die Code nicht
  kann, also auswählen, übersetzen, kürzen und einen Spruch zum Statuscode
  schreiben.
- **Welches Geschichtsereignis** wählt er, und warum? Die Tool-Beschreibung bittet um
  „nicht belastend“.
- **Ohne Display** zeigt der Agent die Inhalte im Chat. Mit LaraPaper befüllt er per
  `update_plugin` die Plugins, und die Playlist rotiert bei jedem Refresh zum nächsten
  Screen.

## Akt 4 · Bewusst kaputt machen

Hier sieht man am deutlichsten, **wie ein Agent „denkt“.** Nach jedem Versuch die
Änderung zurücknehmen.

| # | Was wird kaputt gemacht? | Frage | Was man typischerweise sieht |
|---|---|---|---|
| 1 | Beschreibung von `render_joke_screen` auf `"rendert"` kürzen | Ruft das Modell es noch zur richtigen Zeit auf? | Starke Modelle raten oft richtig, schwache rufen es zu früh oder gar nicht auf |
| 2 | JokeAPI-URL in `lib/jokes.ts` ungültig machen | Meldet das Modell den Fehler, oder erfindet es einen Witz? | `isError: true` kommt an. Gute Modelle melden es, schwache denken sich gern selbst einen Witz aus |
| 3 | `get_date_info` gibt `isoWeek` als String zurück | Wie reagiert `render_joke_screen`, und korrigiert das Modell selbst? | Validierungsfehler, oft korrigiert das Modell den Typ im zweiten Versuch |
| 4 | Den Auftrag unklar formulieren, etwa *„Mach was Schönes aufs Display.“* | Was macht das Modell ohne klare Vorgaben? | Zeigt, wie viel an Auftrag und `AGENTS.md` hängt |
| 5 | Tool zurück auf `render_screen` umbenennen, die Grenze aus der Beschreibung streichen und dann *„Zeig nach dem Witz noch das Zitat des Tages.“* | Sucht das Modell ein passendes Tool, oder missbraucht es den Witz-Screen? | Schwache Modelle stecken das Zitat in `setup` und den Autor in `punchline`. Das Schema merkt nichts |
| 6 | Im Tool `get_on_this_day` die Bereinigung von `U+00AD` entfernen *(nur mit Display)* | Sieht man es auf dem Display? | Unsichtbare Zeichen zeigen, dass Daten aus APIs nie so sauber sind, wie sie aussehen |

!!! warning "Der wichtigste Fall"
    Fall 2 zeigt, wie ein Agent mit fehlenden Daten umgeht. Ein erfundener Witz ist
    harmlos. Dasselbe Verhalten bei Messwerten, Preisen oder Ticketdaten wäre
    **gefährlich**. Die Gegenmaßnahmen liegen im MCP-Server (klare Fehlertexte), im
    Prompt („erfinde nichts“) und in der Modellwahl.

## Plan B, falls live etwas hängt

- **Ein Tool funktioniert nicht.** Die Fehlermeldung zurück an den Agenten geben und
  ihn reparieren lassen. Das ist selbst eine gute Demo.
- **Das Display reagiert nicht.** Das PNG oder die LaraPaper-Vorschau zeigen, die
  Logik ist dieselbe.
- **Die Modell-API ist nicht erreichbar.** Auf Ollama (lokal) ausweichen. Das ist
  zugleich ein Argument für lokale Modelle.
- **Der Server startet nicht im Harness.** Im Inspector zeigen, dass die Tools für
  sich funktionieren.
