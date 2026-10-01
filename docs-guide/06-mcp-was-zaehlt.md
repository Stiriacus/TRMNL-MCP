# 6 · Was bei einem MCP-Server wirklich zählt

Ein MCP-Server ist eine Schnittstelle für ein **Sprachmodell**, nicht für einen
**Programmierer**. Das Modell liest nur Namen, Beschreibungen, Schemas und Fehlertexte,
und genau dort entscheidet sich die **Qualität**.

Es folgen sechs Regeln, jede am Beispiel unserer Tools.

---

## 1. Die Beschreibung ist die Bedienungsanleitung

Das Modell wählt Tools **nur anhand ihrer Beschreibung** aus. Eine Beschreibung
sagt, **was** das Tool tut und **wofür** es da ist. Sie sagt nicht, **worauf** es
läuft und **wann** es an der Reihe ist.

!!! tip "Leitgedanke: Ändert diese Information, was das Modell tut oder sagt?"
    Jeder Satz in Beschreibung und Schema muss diesen Test bestehen.

    **Hinein gehört**

    - der **Zweck in den Worten des Nutzers** („Display“, „Witz des Tages“). Darüber
      *findet* das Modell das Tool, wenn jemand sagt „bring einen Witz aufs Display“.
    - die **Herkunft der Eingaben** („aus get_joke“). Das sagt, woher die Daten kommen,
      nicht, wann das Tool dran ist.
    - **Einschränkungen**, gern mit kurzem Grund („keine Emojis, die Anzeige kann sie
      nicht darstellen“). Mit Grund verallgemeinert das Modell, ohne Grund befolgt es
      wörtlich. Was ein einzelnes Feld betrifft, steht am Feld im Schema.
    - die **Wirkung** („sofort gespeichert, angezeigt erst, wenn die Seite wieder dran
      ist“). Sonst verspricht das Modell dem Nutzer etwas Falsches.
    - die **Abgrenzung**: wofür das Tool *nicht* da ist, und welches stattdessen.

    **Hinaus gehört**

    - **Hardware**: Größe, Auflösung, Farbtiefe, Anzahl der Geräte. Das Modell liefert
      Text, wo und wie er erscheint, regelt die Schicht dahinter.
    - **Backend**: LaraPaper, ZIP, Blade, Token. Das ist das *Wie*, nicht das *Was*.
    - **Ablauf**: „Rufe es als letzten Schritt auf.“ Ein Tool ist ein Baustein, kein
      Schritt in einem festen Ablauf. Die Reihenfolge ergibt sich aus der Herkunft der
      Daten, und wo sie wirklich festgelegt werden muss, gehört sie in den Auftrag, den
      Systemprompt oder einen MCP-Prompt.

Hier sind vier Varianten für dasselbe Tool.

=== "Zu knapp"
    ```ts
    description: 'Rendert den Screen.'
    ```
    Für das Modell bleibt alles offen. Welcher Screen? Mit welchen Daten? Woher kommen
    sie? Wofür ist das Tool *nicht* da?

=== "Klingt gut, sagt nichts"
    ```ts
    description:
      'Rufe dieses Tool auf, um die Datenwerte final zur Darstellung aufzubauen.'
    ```
    Länger, aber **genauso leer**. Welche Datenwerte? Was heißt „final“? Was kommt am
    Ende heraus? Diese Art Beschreibung ist die **häufigste**, weil sie beim Schreiben
    vollständig *wirkt*.

=== "Erzählt zu viel"
    ```ts
    description:
      'Bringt den Witz des Tages auf das E-Ink-Display: überschreibt die Seite ' +
      '"Witz des Tages" in LaraPaper mit neuem Inhalt. Sie erscheint, sobald sie ' +
      'in der Playlist des Geräts wieder an der Reihe ist. ' +
      'Eingaben: joke = ein Witz aus get_joke, bei Bedarf von dir übersetzt und ' +
      'gekürzt (setup max. 140, punchline max. 100 Zeichen, keine Emojis, Pointe ' +
      'nicht verändern); date = Ergebnis von get_date_info, unverändert übernehmen. ' +
      'Rufe es als letzten Schritt auf. Nur für diesen Screen gedacht: ' +
      'andere Inhalte (Zitat, Geschichte, HTTP-Status) über update_page, ' +
      'reinen Text über show_message.'
    ```
    So stand es bei uns lange da, und es wirkt gründlich. Am Leitgedanken gemessen
    fällt aber vieles durch. **E-Ink** und **LaraPaper** sind Umsetzung, das Modell
    tut ohne sie nichts anders. **„Als letzten Schritt“** ist schlicht falsch, sobald
    der Auftrag lautet „nach dem Witz noch das Zitat“. Die Liste **„Zitat, Geschichte,
    HTTP-Status“** veraltet mit jeder neuen Seite. Und die Feldregeln stehen doppelt,
    hier und im Schema, und laufen irgendwann auseinander.

=== "Gut (unser update_page)"
    ```ts
    description:
      'Ersetzt den Inhalt einer Display-Seite, z. B. den Witz des Tages. Welche ' +
      'Seiten es gibt und welche Felder sie erwarten, steht im Schema. Das Layout ' +
      'ist fest, du lieferst nur Text. Gespeichert wird sofort, angezeigt erst, ' +
      'wenn die Seite wieder an der Reihe ist.',
    inputSchema: z.discriminatedUnion('page', [
      z.object({
        page: z.literal('witz')
          .describe('Witz des Tages. Datum und Kalenderwoche setzt die Seite selbst'),
        fields: z.object({
          setup: z.string().min(1).max(200).describe(
            'Aufbau bzw. ganzer Einzeiler aus get_joke, auf Deutsch, max. ca. 140 ' +
            'Zeichen. Übersetzen und kürzen erlaubt. Keine Emojis, die Anzeige ' +
            'kann sie nicht darstellen'),
          punchline: z.string().max(120).describe(
            'Pointe aus get_joke, max. ca. 100 Zeichen, leer bei Einzeilern. ' +
            'Beim Übersetzen die Pointe erhalten, nicht erklären. Keine Emojis')
        })
      }),
      // weitere Seiten: nachricht, zitat, geschichte, http
    ])
    ```
    Die Beschreibung sagt, **was** das Tool bewirkt (Inhalt ersetzt, Anzeige
    verzögert) und dass das Modell nur Text liefert. Welche Seiten es gibt, was jedes
    Feld enthalten muss und **woher** es kommt, steht im Schema. Kein Wort über
    Geräte, Backend oder Reihenfolge. Dass `update_page` nach `get_joke` kommt, folgt
    daraus, dass der Witz *aus* `get_joke` stammt. Eine Abgrenzung zu anderen Tools
    braucht es nicht mehr, denn es gibt nur dieses eine für alle Seiten (Regel 6).

!!! note "Wenn die Hardware doch durchschlägt"
    „Max. 140 Zeichen, keine Emojis“ hat seinen Grund in der Anzeige. Die Hardware
    erreicht das Modell also doch, aber als **Einschränkung**, nicht als Wissen über
    Geräte. Zeigen Geräte unterschiedlicher Größe dieselbe Seite, muss die Vorlage mit
    dieser Länge überall zurechtkommen. Das Modell soll nicht pro Gerät denken. Passt
    es nicht, ist das ein Architekturproblem, und eine längere Beschreibung löst es
    nicht.

## 2. Schemas sind Leitplanken

```ts
inputSchema: z.object({
  category: z.enum(['Programming', 'Any']).default('Programming')
    .describe('Programming = Programmierwitze, Any = gemischt'),
  lang: z.enum(['de', 'en']).default('de'),
  topic: z.string().max(30).optional().describe('Stichwort, z. B. "coffee"')
})
```

Das Schema erledigt zwei Aufgaben. Es **beschreibt die Parameter** für das Modell
(`.describe(...)` landet im JSON Schema), und es **prüft jede Eingabe**, bevor unser
Code läuft. Ein Modell, das `category: "Witze"` schickt, bekommt einen klaren
Validierungsfehler statt einer kryptischen Antwort der API. Das ist gerade bei kleineren lokalen
Modellen entscheidend.

!!! warning "Leitplanke, kein Qualitätscheck"
    Das Schema prüft die **Form**, nicht den **Inhalt**. Ein Beispiel aus unserem Projekt
    zeigt das. Das Tool hieß anfangs `render_screen` und verlangte fest `joke` und
    `date`. Der Auftrag lautete *„Zeig nach dem Witz noch das Zitat des Tages.“* Das
    Tool klingt nach „Screen rendern“, verlangt aber einen Witz. Ein Modell füllt die
    Felder dann eben irgendwie, das Zitat als `setup`, den Autor als `punchline`, und
    auf dem Display steht es unter „Witz des Tages“. Das Schema **lässt es durch**,
    denn die Form stimmt. *Shit in, shit out.* Dagegen hilft **kein Schema**,
    sondern nur ein **passender Zuschnitt** (Regel 6) und eine Beschreibung, die sagt,
    wofür das Tool *nicht* da ist (Regel 1).

## 3. Fehler sind Antworten, keine Abstürze

```ts
async (args) => {
  try {
    const joke = await fetchJoke(args);
    return { content: [{ type: 'text', text: JSON.stringify(joke) }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Witzabruf fehlgeschlagen: ${String(err)}` }],
      isError: true
    };
  }
}
```

Wenn die JokeAPI ausfällt, bekommt das Modell einen **lesbaren Fehler** mit
`isError: true`. So kann es reagieren und etwa den Fehler melden oder es erneut
versuchen, statt dass der ganze Lauf abbricht. Ein Fehlertext ist ebenfalls eine
**Anweisung an das Modell**. Deshalb sollte er erklären, was passiert ist und was man
tun kann. Findet die API zum Stichwort keinen Witz, lautet unser Text deshalb
*„Kein Witz zu diesem Stichwort. Versuche es ohne topic oder mit lang=en.“*

## 4. Deterministisches gehört in Code, nicht ins Modell

| Aufgabe | Wer macht es? | Warum |
|---|---|---|
| Datum, Kalenderwoche | Tool `get_date_info` (reiner Code), auf der Witz-Seite setzt `update_page` es selbst | Modelle kennen das heutige Datum nicht zuverlässig und verrechnen sich bei Kalenderwochen. Was das Modell nur unverändert durchreichen würde, gibt es ihm gar nicht erst in die Hand |
| Witz abrufen, jugendfrei filtern | Tool `get_joke` (API-Aufruf, `safe-mode` fest im Code) | Inhalt kommt aus einer geprüften Quelle, der Filter hängt nicht am Modell |
| Layout, Rendering | feste Vorlage im MCP-Server, gerendert von LaraPaper | muss exakt und reproduzierbar sein |
| Witz auswählen, übersetzen, kürzen | **Modell** | Hier ist Sprachgefühl gefragt |
| Reihenfolge der Schritte | **Modell** | flexibel auf den Auftrag reagieren |

Das ist die wichtigste Designentscheidung des Projekts. Das **Modell orchestriert**,
der **Code rechnet**.

## 5. Logik und MCP-Hülle trennen

```
server/src/
├── lib/        ← die eigentliche Logik (jokes.ts, dateInfo.ts, larapaper.ts)
│                  testbar ohne KI, wiederverwendbar
└── tools/      ← dünne MCP-Hüllen mit Beschreibung, Schema und Fehlerbehandlung
```

Dieselbe `lib/`-Funktion lässt sich aus einem MCP-Tool, einem normalen Skript oder
einem Unit-Test aufrufen. Im Projekt hat sich das schon ausgezahlt. Geplant war
zuerst, das Bild selbst zu rendern (Headless-Browser, PNG). Dann zeigte sich, dass
LaraPaper fertige Seiten annimmt und selbst rendert. Getauscht wurde nur `lib/`
(`render.ts` → `larapaper.ts`). Das Schema des damaligen Witz-Tools, also der
**Vertrag zum Modell**, ist gleich geblieben (dass das Tool später in `update_page`
aufging, war eine Frage des Zuschnitts, siehe Regel 6). In der Beschreibung hat sich nur ein Satz geändert:
wann das Ergebnis zu sehen ist. Das ist die Wirkung, nicht die
Technik, und deshalb steht der Satz überhaupt dort (Regel 1).

## 6. Wenige, klar geschnittene Tools

- Lieber `get_joke`, `get_date_info` und `update_page` als ein
  `do_everything(config)`. Kleine Tools kann das Modell **flexibel kombinieren**.
- Aber auch nicht **40 Tools** für jede API-Route. Jedes Tool kostet Kontext und
  erschwert die Auswahl.
- Rückgaben bleiben **knapp** und enthalten nur die Felder, die das Modell für den
  nächsten Schritt braucht.
- **Neuer Inhalt heißt neue Seite, nicht neues Tool.** `update_page` hat für jede
  Seite einen eigenen Zweig im Schema mit festem Layout und eigenen Feldern. Eine
  neue Seite ist ein Zweig mehr, die Beschreibung bleibt gleich. Schon gar nicht
  gibt es ein Universal-Tool, in das das Modell freies Layout kippt.
- **Der Name muss halten, was das Tool kann.** Bei uns hat das drei Umbauten
  gebraucht:
    1. `render_screen` versprach ein allgemeines Rendering, verlangte aber einen Witz
       (siehe Regel 2). Also `render_joke_screen`.
    2. „render“ und „screen“ sagen, *wie* und *worauf* etwas erscheint, nicht was
       das Tool bewirkt (Regel 1). Also `update_joke_page`. Aus demselben Grund wurde
       `update_plugin` zu `update_page`: „Plugin“ ist LaraPaper-Vokabular, der
       Nutzer spricht von Seiten.
    3. Dann blieb die Frage, warum der Witz ein eigenes Tool hat und das Zitat
       nicht. Der einzige Unterschied war der Parameter `date`, und den hat das Modell
       nur unverändert durchgereicht (Regel 4). Seit der Server das Datum selbst setzt,
       ist der Witz eine Seite wie jede andere. **Am Ende verschwand das Witz-Tool
       ganz**, ebenso `show_message`, das jetzt die Seite `nachricht` ist.
- **Lesen gehört genauso zugeschnitten wie Schreiben.** Damit der Agent einen Fehler
  auf dem Display gezielt korrigieren kann, gibt es `list_pages` und `get_page`.
  `get_page` liefert nur die Felder, **nicht das Markup**. Das Modell soll Inhalte
  korrigieren, nicht das Layout.

## Bonus zur Sicherheit

- Ein MCP-Server läuft mit den **Rechten** dessen, der ihn startet. Fremde Server
  sollte man wie fremde Software behandeln.
- Tool-Ergebnisse landen im Kontext und können **Anweisungen enthalten** (Prompt
  Injection), etwa über eine manipulierte Webseite. Der Harness muss damit umgehen,
  zum Beispiel über Berechtigungen und Rückfragen bei kritischen Aktionen.
- HTTP-Server brauchen **Authentifizierung**, Origin-Prüfung und nur die nötigen
  Rechte.
- Ein konkretes Beispiel aus dem Projekt ist **Blade**. LaraPaper rendert Seiten als
  *Blade*, und Blade kann PHP ausführen. Würde ein Display-Tool Markup vom Modell
  durchreichen, könnte ein manipuliertes Modell Code auf dem Server ausführen. Deshalb
  nehmen alle Display-Tools nur **Text** entgegen. Der landet als Daten in der Seite,
  und die feste Vorlage im Server gibt ihn mit `{{ }}` escapt aus. Die Grenze zwischen
  Daten und Code zieht der **MCP-Server**, nicht das Modell.
- Zugangsdaten kommen **nie ins Modell**. Der LaraPaper-Token und die Seiten-IDs
  bleiben in `.env`. Das Modell wählt nur `page: "zitat"`, und der Server übersetzt
  das in die ID. Der Token kann Seiten überschreiben und gehört deshalb behandelt wie
  ein Passwort.
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
