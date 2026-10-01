# 04 – Prompt-Design für den Witz des Tages

## Aufgabe des Modells

Der Witz selbst kommt **immer** aus `get_joke`. Das Modell erfindet keinen. Seine
Arbeit ist das, was Code nicht kann:

- einen **passenden** Witz auswählen (bei Bedarf `get_joke` mehrmals aufrufen),
- englische Witze **sinngemäß ins Deutsche übertragen**,
- den Text auf **Display-Länge** bringen.

Alles andere auf dem Screen (Datum, Wochentag, KW, Titel, Quellenangabe) ist
deterministisch und kommt aus `get_date_info` oder steht fest im Template.

Warum überhaupt Übersetzung? Der deutsche Bestand der JokeAPI ist klein (rund 30
jugendfreie Witze, Stand 01.10.2026), der englische deutlich größer (rund 180), und
die Stichwortsuche (`topic`) findet auf Deutsch praktisch nichts. Für Abwechslung
und für Themenwitze („Kaffee“) führt der Weg also über `lang=en` und eine
Übersetzung durch das Modell.

## Harte Regeln

1. **Nur Witze aus `get_joke`.** Liefert das Tool einen Fehler, wird der Fehler
   gemeldet, nicht ein eigener Witz eingesetzt.
2. **Längen:** Setup max. ca. 140 Zeichen, Pointe max. ca. 100 Zeichen, Einzeiler
   max. ca. 200 Zeichen (Layout-Grenzen, siehe `02-layout-spezifikation.md`).
3. **Keine Emojis** – rendern auf E-Ink schlecht.
4. **Pointe erhalten.** Übersetzen und straffen ja, die Pointe umschreiben oder
   „verbessern“ nein. Die Pointe gehört in `punchline`, nicht ans Ende des Setups.
5. **Unübersetzbares Wortspiel → neuer Witz.** Lebt ein Witz von einem englischen
   Wortspiel, das auf Deutsch nicht funktioniert, wird ein anderer geholt, statt das
   Wortspiel zu erklären.
6. **Flur-tauglich.** `safe-mode` filtert schon viel. Zusätzlich keine Witze über
   Gruppen von Menschen, Krankheit oder Tod, auch wenn sie durchrutschen.

## System-Prompt (Vorlage)

```text
Du bereitest den Witz des Tages für ein E-Ink-Display vor, das im Büroflur hängt.
Hol Witze ausschließlich über das Tool get_joke. Erfinde nie selbst einen Witz.

Regeln:
- Englische Witze sinngemäß ins Deutsche übertragen. Die Pointe bleibt erhalten.
- Funktioniert ein Wortspiel auf Deutsch nicht, hol einen anderen Witz.
- Setup max. 140 Zeichen, Pointe max. 100 Zeichen, keine Emojis.
- Nichts über Gruppen von Menschen, Krankheit oder Tod.
- Wenn get_joke fehlschlägt, melde den Fehler und zeige keinen Ersatzwitz.
```

## User-Prompt (Vorlage, wird pro Lauf befüllt)

```text
Heute ist {{weekday}}, {{formatted}} (KW {{isoWeek}}).
Thema: {{topic | "Programmierung"}}

Such einen passenden Witz aus und bring ihn auf den Screen.
```

## Beispiele: vom API-Ergebnis zum Screen

| Rohdaten aus `get_joke` | Auf dem Screen | Warum |
|---|---|---|
| *de:* „Was macht ein Informatiker, wenn sein Wagen nicht mehr anspringt?“ / „Aussteigen, einsteigen und nochmal starten.“ | unverändert | passt schon, nichts zu tun |
| *en:* „This morning I accidentally made my coffee with Red Bull instead of water.“ / „I was already on the highway when I noticed I forgot my car at home.“ | „Heute Morgen habe ich meinen Kaffee aus Versehen mit Red Bull statt mit Wasser gekocht.“ / „Ich war schon auf der Autobahn, als mir auffiel, dass das Auto noch zu Hause stand.“ | sinngemäß übertragen, beide Teile unter dem Limit |
| *en:* „What are bits?“ / „Tiny things left when you drop your computer down the stairs.“ | „Was sind Bits?“ / „Die kleinen Teile, die übrig bleiben, wenn der Computer die Treppe runterfällt.“ | funktioniert, weil „Bits“ im IT-Deutsch geläufig ist |
| *en:* „Why did the scarecrow win an award?“ / „Because he was outstanding in his field.“ | – (neuer Witz) | „outstanding in his field“ ist ein Wortspiel ohne deutsche Entsprechung (Regel 5) |
| *de:* „Die Selbsthilfegruppe "HTML-Sonderzeichen-Probleme" trifft sich heute im gro&szlig;en Saal.“ | unverändert, **mit** `&szlig;` | Das `&szlig;` ist die Pointe. Wer es „repariert“, macht den Witz kaputt |

Diese Beispiele dienen als Kalibrierung beim Iterieren in Phase 4 (siehe
`anleitung.md`): Wenn die tatsächlichen Ausgaben des Modells deutlich davon
abweichen (Pointe umgeschrieben, Wortspiel erklärt, zu lang), zuerst den
System-Prompt präzisieren, bevor Layout oder Schema angepasst werden.

## Iterationshinweise (Phase 4)

- **Zu lang?** Zeichenlimit im Prompt UND als harte Nachbearbeitung im Code
  durchsetzen (siehe `render_joke_screen`-Fehlerfälle in
  `03-mcp-tool-spezifikation.md`) – sich nicht allein auf das Modell verlassen.
- **Pointe wandert ins Setup?** Im System-Prompt ausdrücklich sagen, dass Setup und
  Pointe getrennt bleiben, und ein Beispiel mitgeben.
- **Immer derselbe deutsche Witz?** Bei rund 30 Witzen normal. Abhilfe: `lang=en`
  erlauben oder die zuletzt gezeigten Witze irgendwo zwischenspeichern und als
  „bitte nicht wiederholen“ mitgeben (optionaler Ausbauschritt).
- **Modell erfindet einen Witz, wenn `get_joke` scheitert?** Genau der Fall aus
  Regel 1. Das ist ein guter Testfall für „Bewusst kaputt machen“ (siehe
  `anleitung.md`).
- **Kein LLM erreichbar?** Dann läuft auch kein Agent – es entsteht schlicht kein
  neuer Screen, der alte bleibt stehen (siehe `05-fehler-und-fallbacks.md`).
