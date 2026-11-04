const ollamaUrl = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
const requestTimeout = Number(process.env.OLLAMA_TIMEOUT_MS || 300_000);

export async function generateText(promptText, modelName = process.env.OLLAMA_MODEL || "qwen3:8b") {
  let response;
  try {
    response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        prompt: promptText,
        stream: false,
      }),
      signal: AbortSignal.timeout(requestTimeout),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error("Ollama took too long to respond. Try again or use a smaller model.");
    }
    throw new Error("Could not reach Ollama. Make sure Ollama is running locally.");
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `Ollama returned HTTP ${response.status}.`);
  }
  if (typeof result?.response !== "string" || !result.response.trim()) {
    throw new Error("Ollama returned an empty or invalid response.");
  }
  return result.response;
}

export async function listModels() {
  let response;
  try {
    response = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const result = await response.json().catch(() => null);
  return Array.isArray(result?.models)
    ? result.models.map((model) => model.name).filter((name) => typeof name === "string")
    : [];
}
