import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { printAccessUrls } from "./network.ts";
import { verifyEditPin } from "./auth.ts";
import {
  createSystem,
  deleteSystem,
  listSystems,
  updateSystem,
} from "./systems.ts";
import { probeUrl } from "./healthProbe.ts";
import {
  getHealthStatusPayload,
  refreshHealthForSystem,
  startHealthPoller,
} from "./healthPoller.ts";
import { createVm, deleteVm, listVms, updateVm } from "./vms.ts";
import { getVmStatusPayload, refreshVm, startVmPoller } from "./vmPoller.ts";
import { createLlm, deleteLlm, listLlms, updateLlm } from "./llms.ts";
import { getLlmStatusPayload, refreshLlm, startLlmPoller } from "./llmPoller.ts";
import { getDockerStatusPayload, startDockerPoller } from "./dockerPoller.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 3102);
const MAX_BODY_BYTES = 16_384;

type HealthCheckBody = {
  url?: string;
  mode?: "http" | "tcp";
  ignoreTlsErrors?: boolean;
};

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function isAllowedUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function readJsonBody<T = Record<string, unknown>>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Payload too large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

async function requireEditPin(req: http.IncomingMessage): Promise<boolean> {
  const pin = req.headers["x-edit-pin"];
  const value = Array.isArray(pin) ? pin[0] : pin;
  return verifyEditPin(value);
}

function contentTypeFor(filePath: string): string {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!existsSync(DIST_DIR)) {
    sendJson(res, 503, { error: "Frontend build not found. Run npm run build first." });
    return;
  }

  const requestPath = req.url === "/" ? "/index.html" : (req.url?.split("?")[0] ?? "/index.html");
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(DIST_DIR, safePath);

  if (!filePath.startsWith(DIST_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  let resolvedPath = filePath;
  try {
    const fileStat = await stat(resolvedPath);
    if (fileStat.isDirectory()) {
      resolvedPath = path.join(resolvedPath, "index.html");
    }
  } catch {
    resolvedPath = path.join(DIST_DIR, "index.html");
  }

  if (!existsSync(resolvedPath)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentTypeFor(resolvedPath),
    "Cache-Control": resolvedPath.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  });

  if (resolvedPath.endsWith(".html")) {
    const html = await readFile(resolvedPath);
    res.end(html);
    return;
  }

  createReadStream(resolvedPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Edit-Pin");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url?.split("?")[0] ?? "";

  if (url === "/api/health-check" && req.method === "POST") {
    try {
      const body = await readJsonBody<HealthCheckBody>(req);
      const target = body.url?.trim();

      if (!target || !isAllowedUrl(target)) {
        sendJson(res, 400, { error: "Valid http(s) URL is required" });
        return;
      }

      const result = await probeUrl(target, {
        mode: body.mode === "tcp" ? "tcp" : "http",
        ignoreTlsErrors: Boolean(body.ignoreTlsErrors),
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : "Invalid request",
      });
    }
    return;
  }

  if (url === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url === "/api/health-status" && req.method === "GET") {
    sendJson(res, 200, getHealthStatusPayload());
    return;
  }

  if (url === "/api/auth/verify" && req.method === "POST") {
    try {
      const body = await readJsonBody<{ pin?: string }>(req);
      const valid = verifyEditPin(body.pin);
      sendJson(res, 200, { valid });
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : "Invalid request",
      });
    }
    return;
  }

  if (url === "/api/systems" && req.method === "GET") {
    try {
      const systems = await listSystems();
      sendJson(res, 200, { systems });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "Failed to load systems",
      });
    }
    return;
  }

  if (url === "/api/systems" && req.method === "POST") {
    if (!(await requireEditPin(req))) {
      sendJson(res, 401, { error: "Invalid or missing edit PIN" });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const system = await createSystem(body);
      void refreshHealthForSystem(system.id);
      sendJson(res, 201, { system });
    } catch (error) {
      sendJson(res, 400, {
        error: error instanceof Error ? error.message : "Failed to create system",
      });
    }
    return;
  }

  const systemMatch = url.match(/^\/api\/systems\/([^/]+)$/);
  if (systemMatch) {
    const systemId = decodeURIComponent(systemMatch[1]);

    if (req.method === "PUT") {
      if (!(await requireEditPin(req))) {
        sendJson(res, 401, { error: "Invalid or missing edit PIN" });
        return;
      }

      try {
        const body = await readJsonBody(req);
        const system = await updateSystem(systemId, body);
        void refreshHealthForSystem(system.id);
        sendJson(res, 200, { system });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update system";
        sendJson(res, message === "System not found" ? 404 : 400, { error: message });
      }
      return;
    }

    if (req.method === "DELETE") {
      if (!(await requireEditPin(req))) {
        sendJson(res, 401, { error: "Invalid or missing edit PIN" });
        return;
      }

      try {
        await deleteSystem(systemId);
        void refreshHealthForSystem(systemId);
        res.writeHead(204, { "Cache-Control": "no-store" });
        res.end();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete system";
        sendJson(res, message === "System not found" ? 404 : 400, { error: message });
      }
      return;
    }
  }

  // --- Виртуальные машины (performance monitoring через node_exporter/windows_exporter) ---

  if (url === "/api/vms/status" && req.method === "GET") {
    sendJson(res, 200, getVmStatusPayload());
    return;
  }

  if (url === "/api/vms" && req.method === "GET") {
    try {
      const vms = await listVms();
      sendJson(res, 200, { vms });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Failed to load VMs" });
    }
    return;
  }

  if (url === "/api/vms" && req.method === "POST") {
    if (!(await requireEditPin(req))) {
      sendJson(res, 401, { error: "Invalid or missing edit PIN" });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const vm = await createVm(body);
      void refreshVm(vm.id);
      sendJson(res, 201, { vm });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Failed to create VM" });
    }
    return;
  }

  const vmMatch = url.match(/^\/api\/vms\/([^/]+)$/);
  if (vmMatch) {
    const vmId = decodeURIComponent(vmMatch[1]);

    if (req.method === "PUT") {
      if (!(await requireEditPin(req))) {
        sendJson(res, 401, { error: "Invalid or missing edit PIN" });
        return;
      }

      try {
        const body = await readJsonBody(req);
        const vm = await updateVm(vmId, body);
        void refreshVm(vm.id);
        sendJson(res, 200, { vm });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update VM";
        sendJson(res, message === "VM not found" ? 404 : 400, { error: message });
      }
      return;
    }

    if (req.method === "DELETE") {
      if (!(await requireEditPin(req))) {
        sendJson(res, 401, { error: "Invalid or missing edit PIN" });
        return;
      }

      try {
        await deleteVm(vmId);
        void refreshVm(vmId);
        res.writeHead(204, { "Cache-Control": "no-store" });
        res.end();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete VM";
        sendJson(res, message === "VM not found" ? 404 : 400, { error: message });
      }
      return;
    }
  }

  // --- LLM-сервисы (проверка доступности и готовности отвечать) ---

  if (url === "/api/llms/status" && req.method === "GET") {
    sendJson(res, 200, getLlmStatusPayload());
    return;
  }

  if (url === "/api/llms" && req.method === "GET") {
    try {
      const llms = await listLlms();
      sendJson(res, 200, { llms });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Failed to load LLM services" });
    }
    return;
  }

  if (url === "/api/llms" && req.method === "POST") {
    if (!(await requireEditPin(req))) {
      sendJson(res, 401, { error: "Invalid or missing edit PIN" });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const llm = await createLlm(body);
      void refreshLlm(llm.id);
      sendJson(res, 201, { llm });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Failed to create LLM service" });
    }
    return;
  }

  const llmMatch = url.match(/^\/api\/llms\/([^/]+)$/);
  if (llmMatch) {
    const llmId = decodeURIComponent(llmMatch[1]);

    if (req.method === "PUT") {
      if (!(await requireEditPin(req))) {
        sendJson(res, 401, { error: "Invalid or missing edit PIN" });
        return;
      }

      try {
        const body = await readJsonBody(req);
        const llm = await updateLlm(llmId, body);
        void refreshLlm(llm.id);
        sendJson(res, 200, { llm });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update LLM service";
        sendJson(res, message === "LLM service not found" ? 404 : 400, { error: message });
      }
      return;
    }

    if (req.method === "DELETE") {
      if (!(await requireEditPin(req))) {
        sendJson(res, 401, { error: "Invalid or missing edit PIN" });
        return;
      }

      try {
        await deleteLlm(llmId);
        void refreshLlm(llmId);
        res.writeHead(204, { "Cache-Control": "no-store" });
        res.end();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete LLM service";
        sendJson(res, message === "LLM service not found" ? 404 : 400, { error: message });
      }
      return;
    }
  }

  // --- Docker (только чтение статуса контейнеров) ---

  if (url === "/api/docker/status" && req.method === "GET") {
    sendJson(res, 200, getDockerStatusPayload());
    return;
  }

  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  startHealthPoller();
  startVmPoller();
  startLlmPoller();
  startDockerPoller();
  printAccessUrls("Aidashboard server", PORT, HOST);
  console.log("");
  console.log("Коллеги в сети могут открыть любой Network-адрес выше в браузере.");
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\nОшибка: порт ${PORT} уже занят.`);
    console.error("Остановите предыдущий сервер или укажите другой порт:");
    console.error(`  set PORT=3103 && npm start`);
    console.error("\nНайти процесс на Windows:");
    console.error(`  netstat -ano | findstr :${PORT}`);
    console.error("  taskkill /PID <номер> /F");
    process.exit(1);
  }

  console.error("Server error:", error);
  process.exit(1);
});
