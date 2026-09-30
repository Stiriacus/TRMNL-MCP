# 3 · Eigenen Harness aufsetzen mit pi

**Harness** und **Modell** sind getrennte Entscheidungen. Mit pi wechseln wir zwischen
einem Cloud-Modell (DeepSeek) und einem lokalen Modell (Ollama), und der
MCP-Server bleibt dabei **unverändert**. Wie er angebunden wird, zeigt
[Seite 4](04-mcp-grundlagen.md#denselben-server-in-zwei-harnesses-anbinden).

[pi](https://pi.dev) ist ein bewusst minimaler, quelloffener Coding-Agent-Harness für
das Terminal. Seine Philosophie lautet *„Adapt Pi to your workflows, not the other
way around.“*

## Schritt 1 · Installieren

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi
```

Alles, was pi konfiguriert, liegt an zwei Orten.

| Ort | Gilt für | Inhalt |
|---|---|---|
| `~/.pi/agent/` | alle Projekte | `models.json`, `mcp.json`, `auth.json`, `AGENTS.md`, `skills/`, `extensions/`, `prompts/` |
| `.pi/` im Projekt | nur dieses Projekt | dieselben Dateien, die erst geladen werden, wenn man dem Projekt **vertraut** (Project Trust). Nur `AGENTS.md` und `CLAUDE.md` im Projekt lädt pi immer |

!!! info "Project Trust"
    Ein fremdes Repo könnte eine `.pi/mcp.json` mitbringen, die beliebige Programme
    startet. Deshalb lädt pi Projekt-Konfiguration erst nach **ausdrücklicher
    Zustimmung**. Das ist ein gutes Beispiel dafür, dass Sicherheit eine Aufgabe des
    Harness ist.

    Project Trust regelt allerdings nur, *was beim Start geladen wird*. Danach fragt
    pi **nicht vor jedem Tool-Aufruf** nach, anders als Claude Code. Wer Rückfragen will,
    baut sie per Extension ein oder lässt pi in einem Container laufen.

## Schritt 2 · Exkurs zur „Sprache“ des Modells

Es gibt keinen einheitlichen Standard dafür, wie man ein LLM über HTTP anspricht. In
der Praxis haben sich **drei Protokolle** durchgesetzt, und fast jeder Anbieter
unterstützt mindestens eines davon.

| Protokoll | Endpunkt | Ursprung | pi-Einstellung (`api`) |
|---|---|---|---|
| **OpenAI Chat Completions** | `POST /v1/chat/completions` | OpenAI, heute De-facto-Standard | `openai-completions` |
| **OpenAI Responses** | `POST /v1/responses` | OpenAIs neueres API | `openai-responses` |
| **Anthropic Messages** | `POST /v1/messages` | Anthropic (Claude) | `anthropic-messages` |

Die Unterschiede liegen im Detail, zum Beispiel darin, wie Tool-Aufrufe im JSON
aussehen.

=== "Anthropic Messages"
    ```json
    { "type": "tool_use", "id": "toolu_01", "name": "get_weather",
      "input": { "lat": 52.52, "lon": 13.41 } }
    ```

=== "OpenAI Chat Completions"
    ```json
    { "tool_calls": [{ "id": "call_01", "type": "function",
      "function": { "name": "get_weather",
                    "arguments": "{\"lat\":52.52,\"lon\":13.41}" } }] }
    ```

OpenAI übergibt die Argumente als **String** mit JSON darin, Anthropic dagegen als
echtes Objekt. Solche Details übersetzt der **Harness**.

Für unser Setup sieht das so aus.

| Anbieter | OpenAI-kompatibel | Anthropic-kompatibel |
|---|---|---|
| DeepSeek | `https://api.deepseek.com` | `https://api.deepseek.com/anthropic` |
| Ollama (lokal) | `http://localhost:11434/v1` | `http://localhost:11434` (`/v1/messages`, seit Ollama 0.14) |

Beide Anbieter sprechen also **beide Protokolle**. Deshalb kann man DeepSeek oder
Ollama sogar *in Claude Code* nutzen, indem man dort die Basis-URL umbiegt. Das ist
ein schöner Beleg dafür, dass Harness und Modell wirklich getrennt sind.

## Schritt 3 · DeepSeek anbinden (Cloud)

DeepSeek ist in pi bereits als Anbieter **eingebaut**, man braucht nur den API-Key.

```bash
export DEEPSEEK_API_KEY=sk-...   # oder in pi /login → DeepSeek
pi
# in pi /model → DeepSeek-Modell wählen
```

## Schritt 4 · Ollama anbinden (lokal)

Lokale Modelle trägt man in `~/.pi/agent/models.json` ein.

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [{ "id": "qwen2.5-coder:7b" }]
    }
  }
}
```

`baseUrl` gibt an, wo das Modell läuft, und **`api` legt fest**, welches der drei
Protokolle pi verwendet. `apiKey` ist bei Ollama ein Platzhalter, weil ein lokales
Modell keinen Schlüssel braucht. Mit `/model` in pi lädt man die Datei neu und wählt
das Modell aus.

!!! warning "Realistische Erwartung an lokale Modelle"
    Kleine lokale Modelle (7 bis 14 B Parameter) können Tool-Aufrufe, machen aber
    **mehr Fehler**. Sie rufen Tools in falscher Reihenfolge oder mit falschen Typen auf
    oder erfinden Werte. Genau das ist in der Demo **lehrreich**, denn es zeigt, warum
    Schema-Validierung und gute Tool-Beschreibungen (→ [Seite 6](06-mcp-was-zaehlt.md))
    so wichtig sind.

## Schritt 5 · Den Harness anpassen

Mit wenigen Dateien wird pi zum **Spezialisten** für dieses Projekt.

- **`AGENTS.md`** enthält Projektwissen, zum Beispiel *„Tagesmessages immer nach den
  Regeln in docs-dev/04-prompt-design.md schreiben“*.
- Ein **Prompt-Template** in `.pi/prompts/screen.md` macht aus dem ganzen Auftrag der
  Demo den Slash-Befehl `/screen`.
- Ein **Skill** bündelt Anleitung und Hilfsdateien, die pi nur bei Bedarf lädt
  (→ [Seite 2](02-harness.md)).
- Eine **Extension** (TypeScript) bringt eigene Tools, Befehle und Freigabe-Dialoge.
  Damit kann man pi grundlegend umbauen.

## Live

!!! example "Zeigen"
    1. `pi` starten, mit `/model` DeepSeek wählen und eine Frage stellen.
    2. Mit `/model` zum Ollama-Modell wechseln, **dieselbe** Frage stellen und die
       Antworten vergleichen.
