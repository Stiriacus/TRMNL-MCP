# 02 – Layout-Spezifikation (800 × 480 px)

## Designregeln für E-Ink (verbindlich)

- Große Schrift, hoher Kontrast (reines Schwarz auf reinem Weiß).
- Klare, durchgezogene Rahmen statt Schatten oder Verläufen – das Standarddisplay
  hat nur **4 Graustufen**, Verläufe wirken darauf wie Streifen ("Banding").
- Keine Emojis im Witz – sie rendern auf E-Ink oft als graue Klötze.
- Keine dünnen Linien unter 2 px – bei 1-Bit/4-Graustufen-Rendering verschwinden
  sie leicht oder flackern beim Refresh.

## Canvas

- Größe: **800 × 480 px**, Hintergrund reines Weiß (`#FFFFFF`).
- Sicherheitsabstand zum Rand ("Safe Area"): **24 px** auf allen Seiten – manche
  E-Ink-Rahmen beschneiden den äußersten Pixelsaum leicht.

## Grid (schematisch)

```
0                                                              800
┌──────────────────────────────────────────────────────────────┐ 0
│  WITZ DES TAGES  24,24                    ┌──────────────────┐ │
│                                           │  Datumsbox       │ │
│  ┌──────────────────────────────┐         │  560,24          │ │
│  │ Setup                        │         │  216 × 148       │ │
│  │ 24,88 · 496 × 192            │         └──────────────────┘ │
│  └──────────────────────────────┘                              │
│  ┌──────────────────────────────┐                              │
│  │ Pointe (fett)                │                              │
│  │ 24,296 · 496 × 136           │                              │
│  └──────────────────────────────┘                              │
│  Quelle: JokeAPI  24,440                                        │
└──────────────────────────────────────────────────────────────┘ 480
```

## Elemente im Detail

### 1. Titelzeile (oben links)

| Eigenschaft | Wert |
|---|---|
| Position (x, y) | 24, 24 |
| Text | `WITZ DES TAGES` (fest im Template, nicht vom Modell) |
| Schriftgröße | 24 px, fett, Großbuchstaben, Laufweite +0.1em |
| Trennlinie | 4 px, `#000000`, 496 px breit, 12 px unter dem Text |

### 2. Setup (links, oben)

| Eigenschaft | Wert |
|---|---|
| Position (x, y) | 24, 88 |
| Größe (B × H) | 496 × 192 px |
| Schriftgröße | 34 px, normal, Zeilenhöhe 1.3 |
| Maximale Zeichenzahl | ca. 140 Zeichen (siehe `04-prompt-design.md`), das sind etwa 4 Zeilen |
| Ausrichtung | linksbündig, vertikal unten in der Box (damit Setup und Pointe zusammenrücken) |
| Umbruch | Wortumbruch, keine Silbentrennung (schlecht lesbar auf E-Ink) |

### 3. Pointe (links, unten)

| Eigenschaft | Wert |
|---|---|
| Position (x, y) | 24, 296 |
| Größe (B × H) | 496 × 136 px |
| Schriftgröße | 34 px, **fett**, Zeilenhöhe 1.3 |
| Maximale Zeichenzahl | ca. 100 Zeichen, das sind etwa 3 Zeilen |
| Ausrichtung | linksbündig, vertikal oben in der Box |
| Sonderfall Einzeiler | `punchline` leer: Die Setup-Box wächst auf 24,88 · 496 × 344 px (bis ca. 200 Zeichen), die Pointe-Box entfällt |

### 4. Datumsbox (oben rechts)

| Eigenschaft | Wert |
|---|---|
| Position (x, y) | 560, 24 |
| Größe (B × H) | 216 × 148 px |
| Rahmen | 4 px durchgezogen, `#000000`, Eckenradius 12 px |
| Innenabstand (Padding) | 16 px |
| Zeile 1 | Wochentag (z. B. `Mittwoch`), 24 px, normal |
| Zeile 2 | Datum `TT / MM / JJJJ` (z. B. `30 / 09 / 2026`), 28 px, fett |
| Zeile 3 | `KW 40`, 22 px, normal |
| Zeilenabstand innerhalb der Box | 8 px |

### 5. Fußzeile

| Eigenschaft | Wert |
|---|---|
| Position (x, y) | 24, 440 |
| Text | `Quelle: JokeAPI (v2.jokeapi.dev)`, fest im Template |
| Schriftgröße | 16 px, normal |

Rechts in der Fußzeile ist Platz für spätere Erweiterungen (z. B. Akkustand über
`get_device_status`). Wird in Version 1 nicht befüllt.

## Typografie

- Systemfont mit klaren, serifenlosen Formen (z. B. **Inter**, **Helvetica**,
  oder das im Browser verfügbare `system-ui` als Fallback). Wichtiger als die
  konkrete Schriftart ist: keine Serifen, keine dekorativen Schnitte, ausreichend
  Laufweite bei Fettschrift.
- Nur zwei Schriftschnitte verwenden: **Regular** und **Bold**. Kursiv vermeiden
  (rendert auf E-Ink kontrastarm).

## Farben

Da das Standarddisplay nur 4 Graustufen darstellt, wird im HTML/CSS-Template mit
genau zwei Werten gearbeitet:

- `#000000` (Text, Rahmen, Linien)
- `#FFFFFF` (Hintergrund)

Zwischentöne (z. B. ein grauer Hintergrund hinter der Pointe) nur dort einsetzen, wo
sie als Fläche groß genug sind (≥ 8 × 8 px zusammenhängend), sonst verschwimmen sie beim
Rendering auf 4 Graustufen.

## Bezug zur MCP-Tool-Spezifikation

`update_joke_page` (siehe `03-mcp-tool-spezifikation.md`) bekommt Witz (Setup und
Pointe) und Datum als strukturierte Daten übergeben. Dieses Layout ist die Grundlage für
die feste Blade-Vorlage `server/templates/witz.blade.php`. Die Daten landen als
`static_data` in der Seite, LaraPaper setzt sie beim Rendern ein und erzeugt das
Bild für das Gerät. Die Pixelmaße sind Zielwerte: Beim Übertragen auf die Klassen des
TRMNL-Frameworks in der LaraPaper-Vorschau prüfen, ob die Boxen passen.
