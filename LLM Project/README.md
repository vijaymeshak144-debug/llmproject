# Ollama Local Chat

A lightweight browser chat app that generates replies with a locally running Ollama model. The Node.js server has no framework or third-party package dependencies.

## Requirements

- Node.js 18 or newer
- Ollama running at `http://localhost:11434`
- At least one model installed in Ollama (the default is `qwen3:8b`)

## Run on Windows

```powershell
ollama pull qwen3:8b
node server.mjs
```

Open [http://localhost:3000](http://localhost:3000). Install and start Ollama separately if it is not already running.

## API

The app's `/api/generate` endpoint accepts a prompt and optional model name. Its Ollama service sends the non-streaming request directly to `http://localhost:11434/api/generate` with the exact Ollama payload:

```json
{
  "model": "qwen3:8b",
  "prompt": "Your prompt",
  "stream": false
}
```

For chat, the browser formats the conversation history as a text prompt. Ollama errors and request timeouts are returned as readable API errors.

Set `OLLAMA_MODEL` to change the default model, `OLLAMA_URL` to change the local Ollama base URL, or `OLLAMA_TIMEOUT_MS` to change the generation timeout (default: 300,000 ms).
