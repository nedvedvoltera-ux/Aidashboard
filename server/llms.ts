import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const LLMS_FILE = path.join(DATA_DIR, "llms.json");

export type LlmProbeMode = "openai" | "ollama" | "custom";

export type LlmServiceRecord = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  probeMode: LlmProbeMode;
  apiKeyEnv: string;
  customPath: string;
  description: string;
  monitoringEnabled: boolean;
};

export const DEFAULT_LLMS: LlmServiceRecord[] = [
  {
    id: "llm-qwen-vllm",
    name: "Qwen — vLLM/SGLang/Xinference (пример подключения)",
    baseUrl: "http://192.168.1.20:8000",
    model: "qwen2.5-72b-instruct",
    probeMode: "openai",
    apiKeyEnv: "",
    customPath: "",
    description:
      "Заготовка под сервер Qwen, раздаваемый через vLLM / SGLang / Xinference (OpenAI-совместимый API, " +
      "обычно порт 8000). Впишите реальный адрес, когда сервис будет развёрнут.",
    monitoringEnabled: true,
  },
  {
    id: "llm-qwen-ollama",
    name: "Qwen — Ollama (пример подключения)",
    baseUrl: "http://192.168.1.21:11434",
    model: "qwen2.5:32b",
    probeMode: "ollama",
    apiKeyEnv: "",
    customPath: "",
    description:
      "Заготовка под сервер Qwen, раздаваемый через Ollama (порт 11434). Впишите реальный адрес, когда " +
      "сервис будет развёрнут. Для каждого LLM-сервиса в компании создайте отдельную карточку — их может " +
      "быть сколько угодно.",
    monitoringEnabled: true,
  },
];

function normalizeProbeMode(value: unknown): LlmProbeMode {
  return value === "ollama" ? "ollama" : value === "custom" ? "custom" : "openai";
}

function normalizeRecord(record: LlmServiceRecord): LlmServiceRecord {
  return {
    ...record,
    name: record.name.trim(),
    baseUrl: record.baseUrl.trim(),
    model: record.model.trim(),
    probeMode: normalizeProbeMode(record.probeMode),
    apiKeyEnv: record.apiKeyEnv.trim(),
    customPath: record.customPath.trim(),
    description: record.description.trim(),
    monitoringEnabled: Boolean(record.monitoringEnabled),
  };
}

function migrateRecord(raw: unknown): LlmServiceRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") {
    return null;
  }

  return normalizeRecord({
    id: record.id,
    name: record.name,
    baseUrl: typeof record.baseUrl === "string" ? record.baseUrl : "",
    model: typeof record.model === "string" ? record.model : "",
    probeMode: normalizeProbeMode(record.probeMode),
    apiKeyEnv: typeof record.apiKeyEnv === "string" ? record.apiKeyEnv : "",
    customPath: typeof record.customPath === "string" ? record.customPath : "",
    description: typeof record.description === "string" ? record.description : "",
    monitoringEnabled: Boolean(record.monitoringEnabled),
  });
}

function validateLlmInput(raw: unknown, requireId = false): LlmServiceRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("Некорректные данные LLM-сервиса");
  }

  const record = raw as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const baseUrl = typeof record.baseUrl === "string" ? record.baseUrl.trim() : "";

  if (!name) {
    throw new Error("Название обязательно");
  }

  if (record.monitoringEnabled && !baseUrl) {
    throw new Error("Базовый адрес обязателен, если включён мониторинг");
  }

  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
    } catch {
      throw new Error("Базовый адрес должен быть корректным http(s) URL");
    }
  }

  const id = requireId
    ? typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : ""
    : randomUUID();

  if (requireId && !id) {
    throw new Error("Id LLM-сервиса обязателен");
  }

  return normalizeRecord({
    id: id as string,
    name,
    baseUrl,
    model: typeof record.model === "string" ? record.model.trim() : "",
    probeMode: normalizeProbeMode(record.probeMode),
    apiKeyEnv: typeof record.apiKeyEnv === "string" ? record.apiKeyEnv.trim() : "",
    customPath: typeof record.customPath === "string" ? record.customPath.trim() : "",
    description: typeof record.description === "string" ? record.description.trim() : "",
    monitoringEnabled: Boolean(record.monitoringEnabled),
  });
}

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readLlmsFile(): Promise<LlmServiceRecord[]> {
  await ensureDataDir();

  if (!existsSync(LLMS_FILE)) {
    await writeFile(LLMS_FILE, JSON.stringify(DEFAULT_LLMS, null, 2), "utf8");
    return DEFAULT_LLMS;
  }

  const raw = await readFile(LLMS_FILE, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("llms.json must contain an array");
  }

  return parsed.map((item) => migrateRecord(item)).filter((item): item is LlmServiceRecord => item !== null);
}

async function writeLlmsFile(llms: LlmServiceRecord[]) {
  await ensureDataDir();
  await writeFile(LLMS_FILE, JSON.stringify(llms, null, 2), "utf8");
}

export async function listLlms(): Promise<LlmServiceRecord[]> {
  return readLlmsFile();
}

export async function createLlm(raw: unknown): Promise<LlmServiceRecord> {
  const llm = validateLlmInput(raw);
  const llms = await readLlmsFile();
  llms.push(llm);
  await writeLlmsFile(llms);
  return llm;
}

export async function updateLlm(id: string, raw: unknown): Promise<LlmServiceRecord> {
  const patch = validateLlmInput({ ...(raw as object), id }, true);
  const llms = await readLlmsFile();
  const index = llms.findIndex((item) => item.id === id);

  if (index === -1) {
    throw new Error("LLM service not found");
  }

  llms[index] = patch;
  await writeLlmsFile(llms);
  return patch;
}

export async function deleteLlm(id: string): Promise<void> {
  const llms = await readLlmsFile();
  const next = llms.filter((item) => item.id !== id);

  if (next.length === llms.length) {
    throw new Error("LLM service not found");
  }

  await writeLlmsFile(next);
}
