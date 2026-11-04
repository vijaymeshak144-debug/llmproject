import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { generateText, listModels } from "./ollama.js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 3000);
const defaultModel = process.env.OLLAMA_MODEL || "qwen3:8b";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw new Error("Request is too large.");
    }
  }
  return JSON.parse(body);
}

async function handleGenerate(request, response) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof SyntaxError ? "Request body must be valid JSON." : error.message,
    });
    return;
  }

  if (typeof body?.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 100_000) {
    sendJson(response, 400, { error: "Provide a non-empty prompt up to 100,000 characters." });
    return;
  }
  if (body.model !== undefined && (typeof body.model !== "string" || !body.model.trim())) {
    sendJson(response, 400, { error: "Model must be a non-empty string." });
    return;
  }

  const model = body.model || defaultModel;
  try {
    const text = await generateText(body.prompt, model);
    sendJson(response, 200, { response: text });
  } catch (error) {
    const status = error.message.includes("Could not reach Ollama") ? 503
      : error.message.includes("took too long") ? 504
        : 502;
    sendJson(response, status, { error: error.message });
  }
}

async function serveFile(request, response) {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  const requestedPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).slice(1);
  const filePath = resolve(root, requestedPath);
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(contents);
  } catch {
    sendJson(response, 404, { error: "Not found." });
  }
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (request.method === "GET" && pathname === "/api/models") {
    const models = await listModels();
    const availableModels = models?.length
      ? [...models].sort((a, b) => Number(b === defaultModel) - Number(a === defaultModel))
      : [defaultModel];
    sendJson(response, 200, {
      models: availableModels,
      connected: models !== null,
      installedModelCount: models?.length || 0,
    });
    return;
  }
  if (request.method === "POST" && pathname === "/api/generate") {
    await handleGenerate(request, response);
    return;
  }
  if (request.method === "GET") {
    await serveFile(request, response);
    return;
  }
  sendJson(response, 405, { error: "Method not allowed." });
});

server.listen(port, () => {
  console.log(`Chat app is running at http://localhost:${port}`);
  console.log(`Ollama model: ${defaultModel}`);
});
