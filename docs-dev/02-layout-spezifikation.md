# 02 – Layout-Spezifikation (800 × 480 px)

## Designregeln für E-Ink (verbindlich)

- Große Schrift, hoher Kontrast (reines Schwarz auf reinem Weiß).
- Klare, durchgezogene Rahmen statt Schatten oder Verläufen – das Standarddisplay
  hat nur **4 Graustufen**, Verläufe wirken darauf wie Streifen ("Banding").
- Keine Emojis in der Message – sie rendern auf E-Ink oft als graue Klötze.
- Keine dünnen Linien unter 2 px – bei 1-Bit/4-Graustufen-Rendering verschwinden
  sie leicht oder flackern beim Refresh.
- Ein Icon-Satz mit dicken, einfachen Formen (Liniendicke ≥ 4 px) statt filigraner
  Icons.

## Canvas

- Größe: **800 × 480 px**, Hintergrund reines Weiß (`#FFFFFF`).
- Sicherheitsabstand zum Rand ("Safe Area"): **24 px** auf allen Seiten – manche
  E-Ink-Rahmen beschneiden den äußersten Pixelsaum leicht.

## Grid (schematisch)

```
0                                                              800
┌──────────────────────────────────────────────────────────────┐ 0
│  24,24                                          520,24        │
│  ┌───────────────────────┐              ┌──────────────────┐ │
│  │                       │              │   Wetterbox      │ │
│  │                       │              │   520,24         │ │
│  │   Message des Tages   │              │   256 × 148      │ │
│  │   32,180              │              └──────────────────┘ │
│  │   460 × 220           │               Datum   520,188     │
│  │                       │               KW      520,232     │
│  └───────────────────────┘                                   │
│                                                                │
└──────────────────────────────────────────────────────────────┘ 480
```

## Elemente im Detail

### 1. Wetterbox (oben rechts)

| Eigenschaft | Wert |
|---|---|
| Position (x, y) | 520, 24 |
| Größe (B × H) | 256 × 148 px |
| Rahmen | 4 px durchgezogen, `#000000`, Eckenradius 12 px |
| Innenabstand (Padding) | 16 px |
| Icon | 64 × 64 px, oben links in der Box (536, 40) |
| Temperatur | rechts neben dem Icon, Schriftgröße 56 px, fett |
| Zustandstext (z. B. "Sonnig") | unter Icon/Temperatur, Schriftgröße 24 px, normal |
| Min/Max-Zeile ("H 21 / T 9") | unterste Zeile der Box, Schriftgröße 20 px |
| Zeilenabstand innerhalb der Box | 8 px |

### 2. Datum (unter der Wetterbox)

| Eigenschaft | Wert |
|---|---|
| Position (x, y) | 520, 188 |
| Format | `TT / MM / JJJJ` (z. B. `30 / 09 / 2026`) |
| Schriftgröße | 28 px, fett |
| Ausrichtung | linksbündig, beginnt auf gleicher x-Position wie die Wetterbox |

### 3. Kalenderwoche

| Eigenschaft | Wert |
|---|---|
| Position (x, y) | 520, 232 |
| Format | `KW 40` |
| Schriftgröße | 22 px, normal |

### 4. Message des Tages (links)

| Eigenschaft | Wert |
|---|---|
| Position (x, y) | 32, 180 |
| Größe (B × H) | 460 × 220 px |
| Schriftgröße | 36 px, Zeilenhöhe 1.3 |
| Maximale Zeichenzahl | ca. 120 Zeichen (siehe `04-prompt-design.md`) – bei dieser
  Schriftgröße und Boxbreite passen das etwa 4–5 Zeilen |
| Ausrichtung | linksbündig, vertikal mittig in der Box |
| Umbruch | Wortumbruch, keine Silbentrennung (schlecht lesbar auf E-Ink) |

### 5. Optionaler Fußbereich

Für spätere Erweiterungen (z. B. Akkustand über `get_device_status`) ist unten ein
schmaler Streifen reserviert: `y = 440–456`, Schriftgröße 16 px, dezent. Wird in
Version 1 nicht befüllt.

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

- `#000000` (Text, Rahmen, Icons)
- `#FFFFFF` (Hintergrund)

Zwischentöne (z. B. für "leicht bewölkt"-Icons) nur dort einsetzen, wo sie als
Fläche groß genug sind (≥ 8 × 8 px zusammenhängend), sonst verschwimmen sie beim
Rendering auf 4 Graustufen.

## Bezug zur MCP-Tool-Spezifikation

`render_weather_screen` (siehe `03-mcp-tool-spezifikation.md`) bekommt Wetter, Datum und
Message als strukturierte Daten übergeben und setzt sie exakt nach diesem Layout
in eine HTML-Vorlage (`server/src/lib/templates/screen.html`) ein, bevor daraus ein
PNG gerendert wird.
