# 06 – Recherche: LaraPaper, Plugins, Playlists und das Seeed-Kit

Stand: 30.09.2026. Ziel: klären, ob der geplante Eigenbau (Express-BYOS + Playwright)
nötig ist, oder ob der vorhandene BYOS-Server **LaraPaper** Rendering, Markup und
Playlists schon mitbringt. Die API-Angaben unten stammen direkt aus dem Quellcode
(`routes/api.php` und Controller), nicht nur aus der README.

> **Kurzfassung:** LaraPaper rendert HTML/Blade/Liquid selbst zu Display-Bildern,
> hat Plugins mit **Webhook-Strategie** und Playlists. Unser MCP-Server muss
> deshalb **keine Bilder mehr rendern und keinen eigenen BYOS-Server betreiben**.
> `render_joke_screen` wird zu einem einzigen HTTP-Aufruf an LaraPaper. Das bedeutet
> weniger Code, weniger Fehlerquellen und ein klareres MCP-Beispiel.

---

## 1. Das Gerät: Seeed Studio TRMNL 7,5" (OG) DIY Kit

([Seeed-Wiki](https://wiki.seeedstudio.com/trmnl_7inch5_diy_kit_main_page/))

| Eigenschaft | Wert |
|---|---|
| Controller | XIAO ePaper Display Board mit **XIAO ESP32-S3 Plus** |
| Display | 7,5", **800 × 480**, monochrom |
| Akku | 2000 mAh, bis ca. 3 Monate bei 6-Stunden-Refresh |
| Refresh | partiell 0,34 s, voll 3,5 s |
| Firmware-Optionen | TRMNL (BYOD/BYOS), ESPHome/Home Assistant, Arduino |
| LaraPaper-Support | **ja**, ausdrücklich gelistet als „SeeedStudio TRMNL 7,5" (OG) DIY Kit“ |

Stolperstein beim Zusammenbau laut Wiki: Das FPC-Kabel muss mit der **Metallseite
nach oben** eingesteckt werden, sonst bleibt das Display leer.

Einrichtung gegen LaraPaper (laut LaraPaper-README): In LaraPaper oben **„Permit
Auto-Join“** aktivieren. Das Gerät im Captive Portal (Knopf hinten **5 s halten**) ins
WLAN bringen und als Server-URL die LaraPaper-Adresse eintragen. Das Gerät erscheint
danach automatisch in der Geräteliste.

## 2. LaraPaper im Überblick

[LaraPaper](https://github.com/usetrmnl/larapaper) (früher `byos_laravel`) ist ein
selbst gehosteter TRMNL-Server auf PHP/Laravel-Basis, mit Docker-Setup und SQLite als
Standard-Datenbank. Rendering läuft intern über Puppeteer und ImageMagick.

Für uns relevant:

- **Plugins** mit Markup in **Blade** oder **Liquid**, inklusive TRMNL-Design-Framework
  (Layouts `full`, `half_horizontal`, `half_vertical`, `quadrant`)
- **Recipes**: 170+ aus dem Community-Katalog, 1000+ aus dem TRMNL-Katalog
- **Playlists** pro Gerät: rotieren durch mehrere Plugins
- **API**: Markup direkt pushen oder Plugin-Daten per Webhook aktualisieren
- **Device-Status**: Akku, WLAN, Firmware, also die Basis für `get_device_status`

## 3. Zwei Wege, wie unser MCP-Server Inhalte aufs Display bringt

### Weg A: Markup direkt pushen (sofort, ohne Plugin)

```http
POST /api/display/update
Authorization: Bearer <Sanctum-Token mit Ability "update-screen">
Content-Type: application/json

{ "device_id": 1, "markup": "<div class=\"view view--full\">…</div>" }
```

- `markup` wird als **Blade** gerendert, danach sofort als Bild für das Gerät erzeugt
  (`GenerateScreenJob`).
- Der Token wird in der LaraPaper-Oberfläche erstellt und muss die Berechtigung
  `update-screen` haben.
- Gut geeignet für **`show_message`**: „Zeig jetzt diesen Text an.“

> Die README nennt `POST /api/screen` mit `{"markup": …}`. Im aktuellen Code heißt
> der Sanctum-Endpunkt aber `/api/display/update` und erwartet zusätzlich `device_id`.
> Der Endpunkt `POST /api/screens` ist für Geräte gedacht (Header `ID` = MAC,
> `Access-Token`, Body `{"image": {"content": "…"}}`).

### Weg B: Webhook-Plugin (Layout in LaraPaper, Daten vom Agenten) ⭐

1. In LaraPaper ein **Private Plugin** anlegen: Datenstrategie **Webhook**, Markup in
   Liquid, z. B.:

   ```html
   <div class="layout layout--row">
     <div class="columns">
       <div class="column">
         <p class="description">{{ setup }}</p>
         <p class="title">{{ punchline }}</p>
       </div>
       <div class="column">
         <span class="label">{{ weekday }}</span>
         <span class="value">{{ date }}</span>
         <span class="label">KW {{ isoWeek }}</span>
       </div>
     </div>
   </div>
   <div class="title_bar"><span class="title">Witz des Tages</span></div>
   ```

2. Der Agent schickt nur noch **Daten**:

   ```http
   POST /api/custom_plugins/{plugin-uuid}
   Content-Type: application/json

   { "merge_variables": {
       "setup": "Was macht ein Informatiker, wenn sein Wagen nicht mehr anspringt?",
       "punchline": "Aussteigen, einsteigen und nochmal starten.",
       "weekday": "Mittwoch", "date": "30 / 09 / 2026", "isoWeek": 40 } }
   ```

   - Optional `merge_strategy`: `deep_merge` oder `stream` (mit `stream_limit`).
   - Payload hat ein Größenlimit (HTTP 413 bei Überschreitung).
   - `GET` auf dieselbe URL liefert die aktuellen `merge_variables` zurück, was
     praktisch zum Debuggen und für ein Tool `get_current_screen` ist.
   - Die URL ist nur über die Plugin-UUID geschützt, es gibt keinen Token. Die UUID
     ist also wie ein Passwort zu behandeln.

3. Das Plugin in die **Playlist** des Geräts aufnehmen.

**Warum Weg B für die Präsentation besser ist:** Er zeigt eine saubere Trennung der
Zuständigkeiten.

| Wer | Zuständig für |
|---|---|
| LaraPaper-Plugin | **Aussehen**: Layout, E-Ink-Regeln, Rendering |
| MCP-Server | **Daten**: Witz, Datum, Weitergabe an LaraPaper |
| Modell | **Inhalt**: Auswahl, Übersetzung und Kürzen des Witzes, Reihenfolge der Schritte |

Man kann das Layout in LaraPaper mit Live-Vorschau ändern, ohne dass der Agent oder
der MCP-Server davon etwas mitbekommt.

## 4. Playlists

Eine Playlist gehört zu einem Gerät und enthält geordnete Einträge (Plugins). Bei
jedem Geräte-Refresh zeigt LaraPaper den nächsten aktiven Eintrag. Playlists können
zusätzlich auf Wochentage und Zeitfenster (`weekdays`, `active_from`,
`active_until`) beschränkt werden. Das ist eine reine Anzeige-Regel von LaraPaper und
**keine Zeitsteuerung unseres Projekts**: Neue Inhalte entstehen weiterhin nur auf
Auftrag.

Mögliche Playlist für die Demo: **Witz des Tages** (unser Webhook-Plugin) →
**ein Recipe aus dem Katalog** (z. B. Kalender) → wieder Witz des Tages.

## 5. Was sich dadurch am Projekt ändert

| Bisher (Plan in `anleitung.md`) | Mit LaraPaper |
|---|---|
| `render_joke_screen` → Playwright → PNG → `sharp` → Datei | `render_joke_screen` → `POST /api/custom_plugins/{uuid}` mit `merge_variables` |
| Eigener Express-Server mit `/api/display`, `/api/setup`, `/api/log` | **entfällt**, das übernimmt LaraPaper |
| PNG-Größenlimit, Graustufen, 1-px-Linien selbst prüfen | übernimmt LaraPaper und das TRMNL-Framework |
| `02-layout-spezifikation.md` mit Pixelmaßen | wird zur Vorlage für das Liquid-Markup im Plugin |
| `show_message` (optional) | `POST /api/display/update` mit Markup |
| `get_device_status` (optional) | `GET /api/devices` bzw. `/api/display/status` |

Die **Tool-Verträge** in `03-mcp-tool-spezifikation.md` (Namen, Beschreibungen,
Eingabe-Schemas) bleiben fast gleich, nur die Rückgabe von `render_joke_screen` ändert
sich (keine Datei/URL mehr). Für die Präsentation ist das ideal: *Der Vertrag zum
Modell ist stabil, die Implementierung dahinter ist austauschbar.*

## 6. Offene Punkte (vor der Umstellung prüfen)

- [ ] Läuft das Gerät bereits gegen LaraPaper? (Geräteliste, Akku, letzter Kontakt)
- [ ] Webhook-Plugin anlegen und `merge_variables` per `curl` pushen. Wann erscheint
      der neue Inhalt: beim nächsten Geräte-Refresh oder erst, wenn die Daten als
      „stale“ gelten? (`data_stale_minutes` im Plugin prüfen)
- [ ] `POST /api/display/update` testen: Überschreibt der Push die Playlist dauerhaft
      oder nur bis zum nächsten Playlist-Wechsel?
- [ ] Welche `refresh_rate` ist am Gerät eingestellt? Für die Live-Demo kurz
      (z. B. 60 s) setzen, sonst wartet man ewig auf den Screen.
- [ ] Liquid oder Blade für das Plugin? (Liquid ist portabel zur TRMNL-Cloud und zu
      Recipes, Blade hat die [laravel-trmnl-blade](https://github.com/bnussbau/laravel-trmnl-blade)-Komponenten.)
- [ ] Danach entscheiden: `docs-dev` (Anleitung Phase 3 + 5, `03`, `05`) auf LaraPaper umstellen

## Quellen

- [LaraPaper – GitHub](https://github.com/usetrmnl/larapaper) (README, `routes/api.php`,
  `DisplayUpdateController`, `PluginWebhookController`, `Models/Playlist.php`)
- [Seeed Studio – TRMNL 7,5" DIY Kit](https://wiki.seeedstudio.com/trmnl_7inch5_diy_kit_main_page/)
- [TRMNL – Screen Templating / Design Framework](https://docs.trmnl.com/go/private-plugins/templates)
- [TRMNL – Webhooks für Private Plugins](https://docs.trmnl.com/go/private-plugins/webhooks)
- [TRMNL-Recipe-Katalog (Community)](https://bnussbau.github.io/trmnl-recipe-catalog/)
