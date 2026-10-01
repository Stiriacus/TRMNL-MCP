# 06 – Recherche: LaraPaper, Plugins, Playlists und das Seeed-Kit

Stand: 30.09.2026, ergänzt am 01.10.2026 (Abschnitt 7). Ziel: klären, ob der geplante Eigenbau (Express-BYOS + Playwright)
nötig ist, oder ob der vorhandene BYOS-Server **LaraPaper** Rendering, Markup und
Playlists schon mitbringt. Die API-Angaben unten stammen direkt aus dem Quellcode
(`routes/api.php` und Controller), nicht nur aus der README.

> **Kurzfassung:** LaraPaper rendert HTML/Blade/Liquid selbst zu Display-Bildern und
> hat Plugins (Seiten) und Playlists. Unser MCP-Server muss deshalb **keine Bilder
> mehr rendern und keinen eigenen BYOS-Server betreiben**.
>
> **Gewählter Weg (Abschnitt 7.7):** Der eigene MCP-Server lädt jede Seite als ZIP
> (`settings.yml` mit `static_data` und eine feste Blade-Vorlage) über die
> Archiv-Schnittstelle von LaraPaper hoch. `update_page` wird so zu einem
> einzigen HTTP-Aufruf. LaraPaper wird dafür nicht verändert, sein eingebauter
> MCP-Server wird nicht genutzt, es gibt keinen Webhook.
>
> Die Abschnitte 3 bis 5 halten die erste Analyse fest (Push und Webhook). Beide Wege
> wurden nach der Quellcode-Analyse in Abschnitt 7 verworfen.

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
- **API**: Markup direkt pushen, Plugin-Daten per Webhook aktualisieren oder ganze
  Seiten als ZIP hoch- und herunterladen (Archiv-Schnittstelle, siehe 7.7)
- **Device-Status**: Akku, WLAN, Firmware, also die Basis für `get_device_status`

## 3. Erste Analyse: zwei naheliegende Wege (verworfen)

> **Nicht mehr aktuell.** Beide Wege wurden nach der Quellcode-Analyse verworfen:
>
> - **Weg A** hält bei aktiver Playlist nur einen Geräte-Abruf lang und rendert frei
>   übergebenes Blade, also PHP (7.2, 7.5).
> - **Weg B** ist kein „statischer“ Inhalt: Nach einem Webhook wird die Seite praktisch
>   bei jedem Durchlauf neu gerendert, und die URL ist nur über die UUID geschützt
>   (7.2).
>
> Gewählt ist der Archiv-Upload aus **7.7**. Die beiden Wege bleiben als Begründung
> stehen.

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
- Gut geeignet für eine freie Nachricht: „Zeig jetzt diesen Text an.“

> Die README nennt `POST /api/screen` mit `{"markup": …}`. Im aktuellen Code heißt
> der Sanctum-Endpunkt aber `/api/display/update` und erwartet zusätzlich `device_id`.
> Der Endpunkt `POST /api/screens` ist für Geräte gedacht (Header `ID` = MAC,
> `Access-Token`, Body `{"image": {"content": "…"}}`).

### Weg B: Webhook-Plugin (Layout in LaraPaper, Daten vom Agenten)

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

**Warum Weg B zunächst favorisiert war:** Er zeigt eine saubere Trennung der
Zuständigkeiten.

| Wer | Zuständig für |
|---|---|
| LaraPaper-Plugin | **Aussehen**: Layout, E-Ink-Regeln, Rendering |
| MCP-Server | **Daten**: Witz, Datum, Weitergabe an LaraPaper |
| Modell | **Inhalt**: Auswahl, Übersetzung und Kürzen des Witzes, Reihenfolge der Schritte |

Man kann das Layout in LaraPaper mit Live-Vorschau ändern, ohne dass der Agent oder
der MCP-Server davon etwas mitbekommt.

Die Trennung von Aussehen, Daten und Inhalt gilt beim gewählten Archiv-Upload (7.7)
genauso. Einziger Unterschied: Die Blade-Vorlage liegt fest im MCP-Server
(`server/templates/*.blade.php`) und wird bei jedem Upload mitgeschickt. Das Layout
ändert man deshalb dort. Eine Änderung im LaraPaper-Editor überschreibt der nächste
Upload.

## 4. Playlists

Eine Playlist gehört zu einem Gerät und enthält geordnete Einträge (Plugins). Bei
jedem Geräte-Refresh zeigt LaraPaper den nächsten aktiven Eintrag. Playlists können
zusätzlich auf Wochentage und Zeitfenster (`weekdays`, `active_from`,
`active_until`) beschränkt werden. Das ist eine reine Anzeige-Regel von LaraPaper und
**keine Zeitsteuerung unseres Projekts**: Neue Inhalte entstehen weiterhin nur auf
Auftrag.

Mögliche Playlist für die Demo: **Witz des Tages** (unsere hochgeladene Seite) →
**ein Recipe aus dem Katalog** (z. B. Kalender) → wieder Witz des Tages. Welche Seite
in welcher Playlist steht, legt man nur in der Oberfläche fest. Eine Schnittstelle
für Playlists gibt es nicht (7.4).

## 5. Was sich dadurch am Projekt ändert

| Bisher (Plan in `anleitung.md`) | Mit LaraPaper |
|---|---|
| Witz-Tool → Playwright → PNG → `sharp` → Datei | `update_page` → ZIP (`settings.yml` + `witz.blade.php`) → `POST /api/plugin_settings/{id}/archive` (7.7) |
| Eigener Express-Server mit `/api/display`, `/api/setup`, `/api/log` | **entfällt**, das übernimmt LaraPaper |
| PNG-Größenlimit, Graustufen, 1-px-Linien selbst prüfen | übernimmt LaraPaper und das TRMNL-Framework |
| `02-layout-spezifikation.md` mit Pixelmaßen | wird zur Grundlage der festen Blade-Vorlage `server/templates/witz.blade.php` |
| freie Nachricht (optional) | Seite `nachricht` in `update_page`, per Archiv-Upload. Ein leerer Text blendet sie aus (`TRMNL_SKIP_DISPLAY`) |
| `get_device_status` (optional) | `GET /api/devices` |
| weitere Seiten (`07-weitere-mcp-tools.md`) | weitere Zweige in `update_page`, dazu `list_pages`, `get_page` über dieselbe Archiv-Schnittstelle |

Die **Tool-Verträge** in `03-mcp-tool-spezifikation.md` bleiben fast gleich: Name
und Eingabe-Schema ändern sich nicht. Anders sind nur die Rückgabe von
des Witz-Tools (`page`, `status`, `rev`, `hint` statt Datei/URL) und ein Satz
der Beschreibung (die Seite erscheint erst, wenn sie in der Playlist an der Reihe ist). Für die Präsentation ist das ideal: *Der Vertrag zum
Modell ist stabil, die Implementierung dahinter ist austauschbar.*

## 6. Offene Punkte (vor der Umstellung prüfen)

- [ ] Läuft das Gerät bereits gegen LaraPaper? (Geräteliste, Akku, letzter Kontakt)
- [x] ~~Wann erscheint ein Webhook-Inhalt?~~ Laut Quellcode beim nächsten Mal, wenn das
      Plugin in der Playlist an der Reihe ist (siehe 7.2). Am Gerät noch bestätigen.
- [x] ~~Überschreibt `POST /api/display/update` die Playlist?~~ Nein, nur bis zum
      nächsten Geräte-Abruf, sobald eine Playlist aktiv ist (siehe 7.2).
- [ ] Welche `refresh_rate` ist am Gerät eingestellt? Für die Live-Demo kurz
      (z. B. 60 s) setzen, sonst wartet man ewig auf den Screen.
- [x] ~~Liquid oder Blade für das Plugin?~~ **Blade.** Die Vorlage liegt fest im
      MCP-Server, Inhalte kommen nur über `static_data` (7.7). Liquid wäre portabel zur
      TRMNL-Cloud, Blade hat die [laravel-trmnl-blade](https://github.com/bnussbau/laravel-trmnl-blade)-Komponenten.
- [x] ~~`docs-dev` auf LaraPaper umstellen~~ Erledigt: `01`, `02`, `03`, `05`, `07`
      und die Anleitung beschreiben den Archiv-Upload.
- [ ] **Am echten LaraPaper prüfen**, was bisher nur aus dem Quellcode stammt:
      Leert die Revisionsmarke wirklich das gespeicherte Bild? Zeigt die Vorschau
      dasselbe wie das Gerät? Blendet `TRMNL_SKIP_DISPLAY` die Seite aus? Bettet
      LaraPaper das Blade-Markup selbst in `view view--full` ein, oder muss die Vorlage
      das tun? Klappt der Upload mit einem Token ohne besondere Ability?

## 7. Push-Logik im Detail (Quellcode-Analyse, Stand 01.10.2026)

Grundlage: LaraPaper `main` mit Laravel 13 und `laravel/mcp` ^0.9.1. Die Dateien
sind am Ende des Abschnitts aufgelistet.

### 7.1 Was bei jedem Geräte-Abruf passiert

Das Gerät ruft `GET /api/display` auf. `RunDeviceDisplayCycle` entscheidet dann:

1. **Pause oder Schlafmodus** aktiv? Dann kommt das Sleep-Bild, sonst nichts.
2. **Gespiegeltes Gerät?** Dann zeigt es das Bild des Quellgeräts.
3. **Playlist:** Von allen aktiven Playlists des Geräts gewinnt die mit den meisten
   Einschränkungen. Ein Zeitfenster zählt 2 Punkte, Wochentage zählen 1 Punkt. Es
   wird nur eine Playlist genommen, die gerade aktiv ist und einen Eintrag hat.
   Innerhalb der Playlist kommt der Eintrag nach dem zuletzt gezeigten
   (`last_displayed_at`, Reihenfolge nach `order`). Am Ende geht es wieder von vorn
   los.
4. **Rendern oder Cache:** Neu gerendert wird nur, wenn die Daten als „stale“ gelten
   **oder** das Plugin noch kein Bild hat (`current_image = null`). Sonst wird das
   gespeicherte Bild ausgeliefert.
5. Nach dem Rendern setzt `GenerateScreenJob` beim Plugin `current_image` und
   **auch `data_payload_updated_at = now()`**. Danach bekommt das Gerät
   `current_screen_image`.
6. **Kein Playlist-Eintrag?** Dann bleibt `current_screen_image` stehen, also das,
   was zuletzt gerendert oder gepusht wurde.

### 7.2 Folgen pro Weg

| Weg | Wie kommen Inhalte rein? | Wann sind sie auf dem Display? |
|---|---|---|
| `POST /api/display/update` (Push) | Markup → `Blade::render` → Bild direkt ans Gerät | Sofort beim nächsten Abruf. **Bei aktiver Playlist überschreibt der übernächste Abruf das Bild wieder.** Ein Push bleibt nur stehen, wenn keine Playlist aktiv ist. |
| Webhook-Recipe | `POST /api/custom_plugins/{uuid}` schreibt `data_payload` | Sobald das Plugin wieder an der Reihe ist. `isDataStale()` heißt bei Webhooks „in der letzten Stunde aktualisiert“. Weil jedes Rendern den Zeitstempel auf jetzt setzt, wird das Plugin danach praktisch **bei jedem Durchlauf** neu gerendert. |
| Polling-Recipe | LaraPaper holt `polling_url` selbst ab | Wenn `data_stale_minutes` abgelaufen ist (Standard 60) |
| **Static-Recipe** | `data_payload` über die **Web-Oberfläche** (JSON-Feld im Recipe-Editor) oder den **Import einer ganzen Seite** (Archiv-Upload, 7.7). Einen Endpunkt nur für die Daten gibt es nicht. | Beim Ändern des **Markups** sofort, weil ein Model-Hook dann `current_image` leert. Beim Ändern nur der **Daten** erst nach `data_stale_minutes`, weil der Hook nur auf Markup-Spalten reagiert. |

Wichtig für den „statischen“ Ansatz: Wer `data_payload` an der Oberfläche vorbei
ändert, muss **selbst `current_image = null` setzen**. Sonst zeigt das Gerät bis zu
`data_stale_minutes` lang den alten Inhalt. Beim Archiv-Upload erledigt das die
Revisionsmarke im Markup (7.7).

### 7.3 Der eingebaute MCP-Server von LaraPaper

> **Wird nicht genutzt.** Entschieden ist ein eigener MCP-Server über die
> Archiv-Schnittstelle (7.7). Der Abschnitt bleibt als Recherche-Ergebnis stehen.

LaraPaper bringt schon einen MCP-Server mit (`routes/ai.php`):

- Endpunkt: `/mcp` (HTTP), Middleware `toggle:mcp`, `auth:sanctum`, `ability:mcp`
- Einschalten mit `TOGGLE_MCP=true` (Lab-/Experimental-Schalter). Dazu einen
  Sanctum-Token mit der Ability **`mcp`** anlegen.
- In Claude Code:
  `claude mcp add --transport http larapaper https://<host>/mcp --header "Authorization: Bearer <token>"`

| Tool | Macht |
|---|---|
| `list-recipes`, `get-recipe` | Recipes des Users auflisten, Details lesen (Markup aller Layouts, Strategie, `data_payload`) |
| `create-recipe` | Neues Recipe (blade/liquid, polling/webhook/static) |
| `update-recipe-markup` | Markup pro Layout ersetzen. Leert den Bild-Cache, ist also sofort wirksam. |
| `update-recipe-settings` | Strategie, Polling-URL, `data_stale_minutes`, Renderer |
| `render-recipe` | Rendert zu **HTML** zur Kontrolle. Erzeugt kein Gerätebild. |

**Lücken:** keine Playlists, keine Geräte, kein Schreiben von `data_payload`. Nur
Plugins vom Typ `recipe` sind sichtbar, eingebaute Plugin-Typen (Screenshot,
Image-Webhook …) nicht.

### 7.4 Playlists: Es gibt keine Schnittstelle

> **Entschieden:** LaraPaper wird nicht erweitert (7.6). Die Tool-Vorschläge unten
> gelten nur für den Fall, dass sich das später ändert. Unser eigener MCP-Server
> liest und korrigiert die **Seiten** (`list_pages`, `get_page`, `update_page`
> in `07-weitere-mcp-tools.md`). Playlists richtet man einmalig in der Oberfläche ein.

Playlists existieren nur in der Livewire-Oberfläche (`playlists.index`). Es gibt
weder REST-Endpunkte noch MCP-Tools dafür. Wer „Playlist wählen → Eintrag finden →
Inhalt korrigieren“ per MCP will, muss **LaraPaper erweitern**. Das passt zu Blade und
PHP: Die neuen Tools sind `laravel/mcp`-Klassen nach dem Muster von
`ResolvesUserRecipes`, und sie werden in `McpServer::$tools` eingetragen.

Vorschlag für die Tools (alle auf den eingeloggten User eingeschränkt, über
`device.user_id`):

| Tool | Art | Inhalt |
|---|---|---|
| `list-playlists` | lesend | Gerät, Name, `is_active`, Wochentage, Zeitfenster, `refresh_time`, `isActiveNow()`, Anzahl Einträge |
| `get-playlist` | lesend | Einträge mit `order`, `is_active`, Plugin-ID/-Name/-Typ, Mashup-Info, `last_displayed_at`, „kommt als Nächstes“ |
| `update-recipe-data` | schreibend | `data_payload` setzen oder mergen, **`current_image = null`**, Größenlimit prüfen (`staticDataPayloadWithinWireLimit`) |
| `set-playlist-item-active` | schreibend, optional | Eintrag aus- oder einschalten, z. B. einen fehlerhaften Inhalt vorübergehend ausblenden |

Ablauf „Inhalt ist falsch“ für den Agenten:
`list-playlists` → `get-playlist` → Eintrag erkennen → `get-recipe` →
`update-recipe-data` (oder `update-recipe-markup`) → `render-recipe` prüfen →
erscheint, sobald der Eintrag wieder an der Reihe ist.

### 7.5 Sicherheit

- **Blade heißt PHP-Ausführung.** `update-recipe-markup` und `/api/display/update`
  rendern frei übergebenes Blade. Wer den Token hat, kann also PHP auf dem Server
  ausführen (`@php … @endphp`). Darum den `mcp`- und den `update-screen`-Token wie ein
  Server-Passwort behandeln.
- Daraus folgt: **Inhalte als Daten (`data_payload`) schreiben, Layout nicht vom Agenten
  ändern lassen.** In Blade escapt `{{ $data['setup'] }}` die Ausgabe. Soll der Agent
  doch Markup bearbeiten, ist `markup_language: liquid` die sicherere Wahl, weil
  Liquid in einer Sandbox läuft.
- **Der Token für die Archiv-Schnittstelle braucht keine besondere Ability.** Jeder
  Sanctum-Token des Users kann also Seiten mit beliebigem Blade hochladen und damit
  PHP ausführen. `LARAPAPER_TOKEN` in `server/.env` wie ein Server-Passwort behandeln:
  nicht ins Repo, nicht in Prompts, nicht in Tool-Ergebnisse.
- Unser MCP-Server schickt nur seine eigenen, festen Vorlagen. Text vom Modell landet
  ausschließlich in `static_data` und wird mit `{{ }}` escapt.
- (Nur Weg B, nicht genutzt: Die Webhook-URL ist nur über die UUID geschützt.)

### 7.6 Zu klären

- [x] ~~**Darf LaraPaper erweitert werden?**~~ **Nein**, nicht auf die Schnelle. Der
      Archiv-Upload (7.7) kommt ohne Änderung aus.
- [x] ~~**Wie viele MCP-Server?**~~ Nur eigene TypeScript-Server (`trmnl-display`,
      später `tagesinhalte`). Der LaraPaper-`/mcp` wird **nicht** genutzt.
- [x] ~~**Inhalt in `data_payload` oder im Markup?**~~ In `static_data` (landet in
      `data_payload`). Das Markup ist die feste Vorlage, plus Revisionsmarke.
- [ ] **Wer bekommt den Token?** Wegen Blade/PHP und weil der Archiv-Token keine
      Ability braucht: keinen Token an Agenten mit ungeprüften Eingaben weitergeben.
      Der Token bleibt im MCP-Server, das Modell sieht ihn nie.
- [ ] **Wie schnell muss eine Korrektur sichtbar sein?** Sie erscheint, sobald der
      Eintrag in der Rotation wieder dran ist (also Länge der Playlist ×
      `refresh_time`). Braucht es ein „jetzt anzeigen“? Ein Push hält bei aktiver
      Playlist nur einen Abruf lang.
- [ ] **Ein Plugin in mehreren Playlists:** Korrigiert man die Daten, ändert sich der
      Inhalt überall. Ist das gewollt?
- [ ] **Mashups** (mehrere Plugins auf einem Screen) mit abdecken oder vorerst
      ausklammern?
- [ ] **Stabilität:** Die Archiv-Schnittstelle ist für die CLI `trmnlp` gedacht und
      nicht als öffentliche API dokumentiert. Die LaraPaper-Version festschreiben und
      nach jedem Update den Upload einmal testen.
- [ ] **Netz:** Ist LaraPaper (`/api/plugin_settings`) von dort erreichbar, wo der
      MCP-Server läuft (HTTPS, VPN)?

### 7.7 Ohne LaraPaper-Änderung: Seiten per Archiv-Endpunkt pushen ⭐

LaraPaper bietet die Schnittstelle der TRMNL-CLI `trmnlp` an (Sanctum-Token, **keine
besondere Ability nötig**). Damit kann ein **eigener MCP-Server** ganze Seiten
(Recipes) anlegen, auslesen und überschreiben:

| Endpunkt | Wirkung |
|---|---|
| `GET /api/plugin_settings` | alle Plugins des Users: `id` (= `trmnlp_id`), `name` |
| `POST /api/plugin_settings` | leeres Plugin anlegen, liefert eine neue `trmnlp_id` |
| `GET /api/plugin_settings/{trmnlp_id}/archive` | Seite als ZIP herunterladen (auslesen) |
| `POST /api/plugin_settings/{trmnlp_id}/archive` | ZIP hochladen (Feld `file`), **überschreibt die Seite** |
| `DELETE /api/plugin_settings/{trmnlp_id}` | Seite löschen |

ZIP-Inhalt, direkt im Wurzelordner oder in `src/`:

```text
settings.yml        # name, strategy: static, refresh_interval, static_data (JSON-String)
full.blade.php      # oder full.liquid; optional shared.*, half_*.*, quadrant.*
```

Verhalten laut Code (`PluginImportService::importFromZip`):

- `updateOrCreate` über `trmnlp_id`: Die Plugin-ID bleibt gleich, die Seite **bleibt in
  ihrer Playlist**.
- Ändert sich das Markup, leert der Model-Hook `current_image`. Die Seite wird dann neu
  gerendert, sobald sie in der Rotation dran ist.
- Ändert sich nur `static_data`, wird **nicht** sofort neu gerendert, sondern erst nach
  `refresh_interval` Minuten (Standard 15). Abhilfe: Bei jedem Push eine
  Revisionsmarke ins Markup schreiben (`{{-- rev: 2026-10-01T09:00:12Z --}}`), damit
  sich das Markup ändert.
- Ein Import **ersetzt alles**: Name, Strategie, alle Layouts und `static_data`. Was im
  ZIP fehlt, ist danach leer. Der Push muss also immer die komplette Seite enthalten.
  Fehlt `name` in `settings.yml`, heißt die Seite danach „Imported Plugin“.
- Steht `"TRMNL_SKIP_DISPLAY": true` in `static_data`, überspringt die Playlist die
  Seite. So blendet man eine Seite aus, ohne die Playlist anzufassen.
- Immer `Accept: application/json` mitschicken. Sonst antwortet Laravel bei
  Validierungsfehlern mit einer Weiterleitung (302) statt mit 422 und einer Meldung.
- Ein Fehler im Blade-Markup fällt erst beim Rendern auf. Das Gerät zeigt dann ein
  Fehlerbild mit dem Namen der Seite.
- Plugins, die in der Oberfläche angelegt wurden, haben keine `trmnlp_id`. Seiten, die
  der MCP-Server pflegen soll, legt man deshalb über `POST /api/plugin_settings` oder
  einen ersten Import an und nimmt sie dann **einmalig in der Oberfläche** in die
  Playlist auf.
- Playlists selbst sind weiterhin nicht lesbar. Die Zuordnung „Seite ↔ Playlist“
  läuft über eindeutige Namen.

**Blade:** Das Template ist fester Bestandteil unseres MCP-Servers. Die Inhalte
landen in `static_data` und werden mit `{{ $data['…'] }}` escapt ausgegeben. So kann
kein Text vom Modell als Blade oder PHP ausgeführt werden.

Gelesene Dateien: `routes/api.php`, `routes/web.php`, `routes/ai.php`,
`app/Actions/Api/RunDeviceDisplayCycle.php`, `app/Jobs/GenerateScreenJob.php`,
`app/Models/{Plugin,Playlist,PlaylistItem,Device}.php`,
`app/Http/Controllers/Api/PluginWebhookController.php`,
`app/Mcp/Servers/McpServer.php`, `app/Mcp/Tools/*`,
`app/Mcp/Concerns/ResolvesUserRecipes.php`, `config/toggle.php`,
`app/Http/Controllers/Api/{PluginArchiveController,PluginSettingsController,CompanionController}.php`,
`app/Services/PluginImportService.php`.

## Quellen

- [LaraPaper – GitHub](https://github.com/usetrmnl/larapaper) (README, `routes/api.php`,
  `DisplayUpdateController`, `PluginWebhookController`, `Models/Playlist.php`,
  `PluginArchiveController`, `PluginImportService`)
- [Seeed Studio – TRMNL 7,5" DIY Kit](https://wiki.seeedstudio.com/trmnl_7inch5_diy_kit_main_page/)
- [TRMNL – Screen Templating / Design Framework](https://docs.trmnl.com/go/private-plugins/templates)
- [TRMNL – Webhooks für Private Plugins](https://docs.trmnl.com/go/private-plugins/webhooks)
- [TRMNL-Recipe-Katalog (Community)](https://bnussbau.github.io/trmnl-recipe-catalog/)
