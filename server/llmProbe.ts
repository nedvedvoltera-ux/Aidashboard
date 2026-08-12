import http from "node:http";
import https from "node:https";
import type { LlmServiceRecord } from "./llms.ts";

const PROBE_TIMEOUT_MS = Number(process.env.LLM_PROBE_TIMEOUT_MS ?? 15_000);
const MAX_RESPONSE_BYTES = 1_000_000;

export type LlmProbeResult = {
  online: boolean;
  latencyMs: number;
  modelsCount?: number;
  models?: string[];
  statusCode?: number;
  error?: string;
};

function requestJson(
  targetUrl: string,
  headers: Record<string, string>,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      reject(new Error("Некорректный адрес LLM-сервиса"));
      return;
    }

    const secure = parsed.protocol === "https:";
    const transport = secure ? https : http;

    const request = transport.request(
      {
        protocol: secure ? "https:" : "http:",
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : secure ? 443 : 80,
        path: `${parsed.pathname}${parsed.search}` || "/",
        method: "GET",
        headers: {
          "User-Agent": "Aidashboard-LlmMonitor/1.0",
          Accept: "application/json",
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(new Error("Ответ LLM-сервиса слишком большой"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({ statusCode: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
        response.on("error", reject);
      },
    );

    request.setTimeout(PROBE_TIMEOUT_MS, () => {
      request.destroy(new Error("Таймаут опроса LLM-сервиса (модель может долго прогреваться)"));
    });
    request.on("error", reject);
    request.end();
  });
}

function resolvePath(service: LlmServiceRecord): string {
  if (service.probeMode === "ollama") {
    return "/api/tags";
  }
  if (service.probeMode === "custom") {
    const custom = service.customPath.trim();
    return custom || "/";
  }
  return "/v1/models";
}

function extractModelNames(service: LlmServiceRecord, body: string): string[] | undefined {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;

    if (service.probeMode === "ollama" && Array.isArray(parsed.models)) {
      return (parsed.models as Array<Record<string, unknown>>)
        .map((item) => (typeof item.name === "string" ? item.name : typeof item.model === "string" ? item.model : ""))
        .filter(Boolean);
    }

    if (Array.isArray(parsed.data)) {
      return (parsed.data as Array<Record<string, unknown>>)
        .map((item) => (typeof item.id === "string" ? item.id : ""))
        .filter(Boolean);
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export async function probeLlm(service: LlmServiceRecord): Promise<LlmProbeResult> {
  const startedAt = Date.now();
  const baseUrl = service.baseUrl.trim().replace(/\/+$/, "");
  const targetPath = resolvePath(service);

  const headers: Record<string, string> = {};
  const apiKeyEnv = service.apiKeyEnv.trim();
  if (apiKeyEnv) {
    const key = process.env[apiKeyEnv];
    if (key) {
      headers.Authorization = `Bearer ${key}`;
    }
  }

  try {
    const { statusCode, body } = await requestJson(`${baseUrl}${targetPath}`, headers);
    const latencyMs = Date.now() - startedAt;

    if (statusCode < 200 || statusCode >= 300) {
      return { online: false, latencyMs, statusCode, error: `HTTP ${statusCode}` };
    }

    const models = extractModelNames(service, body);

    return {
      online: true,
      latencyMs,
      statusCode,
      models: models?.slice(0, 6),
      modelsCount: models?.length,
    };
  } catch (error) {
    return {
      online: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Не удалось опросить LLM-сервис",
    };
  }
}
