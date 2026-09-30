# 04 – Prompt-Design für die Tagesmessage

## Ziel der Message

Ein kurzer, freundlicher Satz, der zum Wetter und zum Tag passt – kein
Wetterbericht, keine Floskel-Aneinanderreihung, keine Übertreibung. Die Message
ist das einzige Element auf dem Screen, das nicht deterministisch ist; alles
andere (Datum, KW, Wetterwerte) kommt aus `get_date_info` / `get_weather`.

## Harte Regeln

1. **Maximal ca. 120 Zeichen** (Layout-Grenze, siehe `02-layout-spezifikation.md`).
2. **Keine Emojis** – rendern auf E-Ink schlecht (siehe Briefing).
3. **Keine erfundenen Fakten** – Datum, Temperatur und Wetterzustand kommen
   ausschließlich aus den Tool-Ergebnissen, nie aus der Fantasie des Modells.
4. **Ein Satz, maximal zwei.** Kein Aufzählungsstil, keine Anführungszeichen um
   die ganze Message.
5. **Deutsch, freundlich, ohne Ausrufezeichen-Inflation.** Höchstens ein "!" pro
   Message.
6. **Nichts Wetter-Warnendes erfinden.** Bei Extremwetter (Sturm, Gewitter) sachlich
   bleiben, keine Panik erzeugen, keine Handlungsempfehlungen wie "bleib zu Hause"
   ohne echte Warnlage.

## System-Prompt (Vorlage)

```text
Du schreibst die Tagesmessage für ein E-Ink-Display, das im Flur hängt.
Ton: freundlich, ruhig, leicht persönlich – wie eine kurze Notiz, nicht wie eine
Wetter-App. Antworte NUR mit der Message selbst, ohne Anführungszeichen, ohne
Erklärung, ohne Emojis. Maximal 120 Zeichen, maximal zwei Sätze.

Regeln:
- Nutze die gegebenen Wetterdaten und das Datum, erfinde nichts dazu.
- Kein Ausrufezeichen mehr als eines.
- Keine Handlungsaufforderungen wie "Vergiss nicht..." öfter als jede dritte Message
  (Abwechslung wichtiger als Vollständigkeit).
- Bei Wochenende (Samstag/Sonntag) darf der Ton eine Spur entspannter sein.
```

## User-Prompt (Vorlage, wird pro Lauf befüllt)

```text
Datum: {{formatted}} ({{weekday}}), Kalenderwoche {{isoWeek}}
Wetter: {{condition}}, aktuell {{temperature}}°C, Tagesspanne {{tempMin}}–{{tempMax}}°C

Schreib die Tagesmessage für heute.
```

## Beispiele für verschiedene Wetterlagen

| Wetterlage | Beispiel-Message |
|---|---|
| Sonnig, mild | "Klarer Mittwoch mit 18 Grad – gute Gelegenheit für eine kurze Runde draußen." |
| Regen | "Regnerischer Start in die Woche, dafür angenehme 14 Grad – Schirm nicht vergessen." |
| Bewölkt, neutral | "Bedeckter Himmel heute, 11 bis 16 Grad – ein ruhiger Tag zum Durcharbeiten." |
| Kalt/Frost | "Frostiger Morgen mit -2 Grad – warm anziehen lohnt sich heute besonders." |
| Heiß | "Heißer Tag mit 31 Grad – viel trinken und die Mittagssonne meiden." |
| Schnee | "Erster Schnee dieses Winters – ein guter Tag für einen warmen Tee." |
| Wind | "Böiger Wind heute, 9 Grad – lose Blätter und Türen im Blick behalten." |
| Gewitter | "Gewitter am Nachmittag angekündigt, aktuell noch trocken bei 22 Grad." |
| Wochenende, sonnig | "Sonniger Samstag mit 24 Grad – ein guter Tag, um draußen zu sein." |

Diese Beispiele dienen als Kalibrierung beim Iterieren in Phase 4 (siehe
`anleitung.md`): Wenn die tatsächlichen Ausgaben des Modells deutlich von diesem
Ton abweichen (zu werblich, zu lang, zu generisch), zuerst den System-Prompt
präzisieren, bevor Layout oder Schema angepasst werden.

## Iterationshinweise (Phase 4)

- **Zu lang?** Zeichenlimit im Prompt UND als harte Nachbearbeitung im Code
  durchsetzen (siehe `render_weather_screen`-Fehlerfälle in `03-mcp-tool-spezifikation.md`)
  – sich nicht allein auf das Modell verlassen.
- **Zu generisch ("Schönen Tag noch!")?** Im System-Prompt explizit fordern, dass
  mindestens ein konkretes Wetter- oder Datumsdetail vorkommen muss.
- **Wiederholt sich von Tag zu Tag?** Ist bei stdio/Single-Turn-Aufrufen ohne
  Gedächtnis normal; falls störend, ein bis zwei zuletzt genutzte Formulierungen
  als "bitte nicht wiederholen"-Hinweis mitgeben (setzt voraus, dass die letzte
  Message irgendwo zwischengespeichert wird – optionaler Ausbauschritt).
- **Kein LLM erreichbar?** Dann läuft auch kein Agent – es entsteht schlicht kein
  neuer Screen, der alte bleibt stehen (siehe `05-fehler-und-fallbacks.md`).
