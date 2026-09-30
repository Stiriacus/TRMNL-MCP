# 6 · Was bei einem MCP-Server wirklich zählt

Ein MCP-Server ist eine Schnittstelle für ein **Sprachmodell**, nicht für einen
**Programmierer**. Das Modell liest nur Namen, Beschreibungen, Schemas und Fehlertexte,
und genau dort entscheidet sich die **Qualität**.

Es folgen sechs Regeln, jede am Beispiel unserer Tools.

---

## 1. Die Beschreibung ist die Bedienungsanleitung

Das Modell wählt Tools **nur anhand ihrer Beschreibung** aus. Hier sind drei
Varianten für dasselbe Tool.

=== "Zu knapp"
    ```ts
    description: 'Rendert den Screen.'
    ```
    Für das Modell bleibt alles offen. Welchen Screen? Mit welchen Daten? Wann? Muss
    vorher etwas anderes aufgerufen werden?

=== "Klingt gut, sagt nichts"
    ```ts
    description:
      'Rufe dieses Tool auf, um die Datenwerte final zur Darstellung aufzubauen.'
    ```
    Länger, aber **genauso leer**. Welche Datenwerte? Was heißt „final“? Was kommt am
    Ende heraus? Diese Art Beschreibung ist die **häufigste**, weil sie beim Schreiben
    vollständig *wirkt*.

=== "Gut (unser render_weather_screen)"
    ```ts
    description:
      'Erzeugt den Wetter-Tagesscreen für das E-Ink-Display (800×480 Pixel, ' +
      'Graustufen) und legt ihn ab. Das Gerät holt ihn beim nächsten Refresh selbst. ' +
      'Eingaben: weather = Ergebnis von get_weather, unverändert übernehmen; ' +
      'date = Ergebnis von get_date_info; message = eine Tagesmessage, die du ' +
      'selbst schreibst (max. 120 Zeichen, keine Emojis). ' +
      'Rufe es als letzten Schritt auf. Nur für diesen Screen gedacht: ' +
      'andere Inhalte (Zitat, Witz, eigene Plugins) über update_plugin, ' +
      'reinen Text über show_message.'
    ```
    Jede Frage ist **beantwortet**. Die Beschreibung sagt, **was** entsteht
    (Wetter-Screen, Größe, Ziel), **woher** jede Eingabe kommt (zwei Tools, einmal das
    Modell selbst), **wann** es drankommt und **wann nicht**, samt Verweis auf das
    richtige Tool.

!!! tip "Die vier Fragen einer guten Beschreibung"
    **Was** tut es, und was kommt heraus? **Woher** kommen die Eingaben? **Wann** soll ich es
    nutzen und **wann nicht**? Was muss vorher passiert sein?

## 2. Schemas sind Leitplanken

```ts
inputSchema: z.object({
  lat: z.number().min(-90).max(90).describe('Breitengrad, WGS84, z. B. 52.52'),
  lon: z.number().min(-180).max(180).describe('Längengrad, WGS84, z. B. 13.405')
})
```

Das Schema erledigt zwei Aufgaben. Es **beschreibt die Parameter** für das Modell
(`.describe(...)` landet im JSON Schema), und es **prüft jede Eingabe**, bevor unser
Code läuft. Ein Modell, das `lat: "Berlin"` schickt, bekommt einen klaren
Validierungsfehler statt eines Absturzes. Das ist gerade bei kleineren lokalen
Modellen entscheidend.

!!! warning "Leitplanke, kein Qualitätscheck"
    Das Schema prüft die **Form**, nicht den **Inhalt**. Ein Beispiel aus unserem Projekt
    zeigt das. Das Tool hieß anfangs `render_screen` und verlangte fest `weather` und
    `date`. Der Auftrag lautete *„Zeig nach dem Wetter noch unseren Kaffee-Witz.“* Das
    Tool klingt nach „Screen rendern“, verlangt aber Wetterdaten. Ein Modell füllt die
    Felder dann eben irgendwie, notfalls mit erfundenem Wetter. Das Schema **lässt es
    durch**, denn die Form stimmt. *Shit in, shit out.* Dagegen hilft **kein Schema**,
    sondern nur ein **passender Zuschnitt** (Regel 6) und eine Beschreibung, die sagt,
    wofür das Tool *nicht* da ist (Regel 1).

## 3. Fehler sind Antworten, keine Abstürze

```ts
async ({ lat, lon }) => {
  try {
    const weather = await fetchWeather(lat, lon);
    return { content: [{ type: 'text', text: JSON.stringify(weather) }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Wetterabfrage fehlgeschlagen: ${String(err)}` }],
      isError: true
    };
  }
}
```

Wenn die Wetter-API ausfällt, bekommt das Modell einen **lesbaren Fehler** mit
`isError: true`. So kann es reagieren und etwa den Fehler melden oder es erneut
versuchen, statt dass der ganze Lauf abbricht. Ein Fehlertext ist ebenfalls eine
**Anweisung an das Modell**. Deshalb sollte er erklären, was passiert ist und was man
tun kann.

## 4. Deterministisches gehört in Code, nicht ins Modell

| Aufgabe | Wer macht es? | Warum |
|---|---|---|
| Datum, Kalenderwoche | Tool `get_date_info` (reiner Code) | Modelle kennen das heutige Datum nicht zuverlässig und verrechnen sich bei Kalenderwochen |
| Wetterwerte | Tool `get_weather` (API-Aufruf) | Fakten dürfen nicht erfunden werden |
| Rendering, Pixelmaße | Tool `render_weather_screen` (Code) | muss exakt und reproduzierbar sein |
| Tagesmessage | **Modell** | Nur hier ist Kreativität gefragt |
| Reihenfolge der Schritte | **Modell** | flexibel auf den Auftrag reagieren |

Das ist die wichtigste Designentscheidung des Projekts. Das **Modell orchestriert**,
der **Code rechnet**.

## 5. Logik und MCP-Hülle trennen

```
server/src/
├── lib/        ← die eigentliche Logik (weather.ts, dateInfo.ts, render.ts)
│                  testbar ohne KI, wiederverwendbar
└── tools/      ← dünne MCP-Hüllen mit Beschreibung, Schema und Fehlerbehandlung
```

Dieselbe `lib/`-Funktion lässt sich aus einem MCP-Tool, einem normalen Skript oder
einem Unit-Test aufrufen. Das zahlt sich direkt aus, denn unser BYOS-Server
LaraPaper kann das Rendering komplett selbst übernehmen. Das Modell schickt dann nur
noch Daten an ein Webhook-Plugin. Dafür ändert sich nur `lib/render.ts`, und der
**Vertrag zum Modell** bleibt identisch.

## 6. Wenige, klar geschnittene Tools

- Lieber `get_weather`, `get_date_info` und `render_weather_screen` als ein
  `do_everything(config)`. Kleine Tools kann das Modell **flexibel kombinieren**.
- Aber auch nicht **40 Tools** für jede API-Route. Jedes Tool kostet Kontext und
  erschwert die Auswahl.
- Rückgaben bleiben **knapp** und enthalten nur die Felder, die das Modell für den
  nächsten Schritt braucht.
- **Der Name muss halten, was das Tool kann.** Aus `render_screen` wurde
  `render_weather_screen`, als klar war, dass es nur *einen* Screen kann (siehe
  Regel 2). Für alles andere gibt es `update_plugin`, bei dem jedes Plugin ein festes
  Layout und ein eigenes Schema hat. Neuer Inhalt heißt dann **neues Plugin**, nicht
  neues Tool und schon gar nicht ein Universal-Tool, in das das Modell freies Layout
  kippt.

## Bonus zur Sicherheit

- Ein MCP-Server läuft mit den **Rechten** dessen, der ihn startet. Fremde Server
  sollte man wie fremde Software behandeln.
- Tool-Ergebnisse landen im Kontext und können **Anweisungen enthalten** (Prompt
  Injection), etwa über eine manipulierte Webseite. Der Harness muss damit umgehen,
  zum Beispiel über Berechtigungen und Rückfragen bei kritischen Aktionen.
- HTTP-Server brauchen **Authentifizierung**, Origin-Prüfung und nur die nötigen
  Rechte.
- Ein konkretes Beispiel aus dem Projekt ist **Blade**. LaraPaper rendert Markup als
  *Blade*, und Blade kann PHP ausführen. Würde `show_message` rohes HTML vom Modell
  durchreichen, könnte ein manipuliertes Modell Code auf dem Server ausführen.
  Deshalb nimmt das Tool nur **Text** entgegen und setzt ihn in eine feste Vorlage.
- Zugangsdaten kommen **nie ins Modell**. Plugin-UUIDs und Tokens bleiben in `.env`.
  Das Modell wählt nur `plugin: "zitat"`, und der Server übersetzt das in die UUID.
- Verbindungen und Tools **regelmäßig durchsehen**. Jeder Harness zeigt, welche
  MCP-Server verbunden sind und welche Tools sie anbieten (in Claude Code per `/mcp`
  oder `claude mcp list`, für jeden Server per MCP Inspector). Dabei lohnt sich
  Folgendes.
    - **Server entfernen**, die niemand mehr nutzt.
    - Bei fremden Servern die **Tool-Beschreibungen lesen**. Sie landen ungefiltert
      beim Modell und können versteckte Anweisungen enthalten.
    - **Nach Updates erneut prüfen**, denn ein Server kann seine Tools jederzeit
      ändern.
    - **Schreibende oder löschende Tools** nur mit Rückfrage erlauben und ungenutzte
      Tools sperren (in Claude Code über Berechtigungen pro Tool, z. B.
      `mcp__github__delete_repository` auf *deny*).
