import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const SYSTEMS_FILE = path.join(DATA_DIR, "systems.json");

export type SystemRecord = {
  id: string;
  name: string;
  url: string;
  description: string;
  monitoringEnabled: boolean;
  checkUrl: string;
  checkMode: "http" | "tcp";
  ignoreTlsErrors: boolean;
};

export const DEFAULT_SYSTEMS: SystemRecord[] = [
  {
    id: "1",
    name: "Портал сотрудника",
    url: "https://portal.company.local",
    description: "Единая точка входа для внутренних сервисов и новостей компании.",
    monitoringEnabled: true,
    checkUrl: "https://portal.company.local",
    checkMode: "http",
    ignoreTlsErrors: false,
  },
  {
    id: "2",
    name: "Система документооборота",
    url: "https://docflow.company.local",
    description: "Согласование и хранение корпоративных документов.",
    monitoringEnabled: true,
    checkUrl: "https://docflow.company.local/health",
    checkMode: "http",
    ignoreTlsErrors: false,
  },
  {
    id: "3",
    name: "Мониторинг инфраструктуры",
    url: "https://monitor.company.local",
    description: "Дашборды доступности серверов и сетевого оборудования.",
    monitoringEnabled: false,
    checkUrl: "",
    checkMode: "http",
    ignoreTlsErrors: false,
  },
];

function normalizeRecord(record: SystemRecord): SystemRecord {
  return {
    ...record,
    checkMode: record.checkMode === "tcp" ? "tcp" : "http",
    ignoreTlsErrors: Boolean(record.ignoreTlsErrors),
  };
}

function recordNeedsUpgrade(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const record = raw as Record<string, unknown>;
  return record.checkMode === undefined || typeof record.ignoreTlsErrors !== "boolean";
}

function migrateRecord(raw: unknown): SystemRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string" || typeof record.url !== "string") {
    return null;
  }

  if (typeof record.monitoringEnabled === "boolean") {
    return normalizeRecord({
      id: record.id,
      name: record.name.trim(),
      url: record.url.trim(),
      description: typeof record.description === "string" ? record.description.trim() : "",
      monitoringEnabled: record.monitoringEnabled,
      checkUrl: typeof record.checkUrl === "string" ? record.checkUrl.trim() : record.url.trim(),
      checkMode: record.checkMode === "tcp" ? "tcp" : "http",
      ignoreTlsErrors: Boolean(record.ignoreTlsErrors),
    });
  }

  const legacyStatus = record.status as string | undefined;
  return normalizeRecord({
    id: record.id,
    name: record.name.trim(),
    url: record.url.trim(),
    description: typeof record.description === "string" ? record.description.trim() : "",
    monitoringEnabled: legacyStatus !== "no-counter",
    checkUrl: record.url.trim(),
    checkMode: "http",
    ignoreTlsErrors: false,
  });
}

function validateSystemInput(raw: unknown, requireId = false): SystemRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid system payload");
  }

  const record = raw as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const url = typeof record.url === "string" ? record.url.trim() : "";

  if (!name || !url) {
    throw new Error("Name and URL are required");
  }

  const monitoringEnabled = Boolean(record.monitoringEnabled);
  const checkUrl = typeof record.checkUrl === "string" ? record.checkUrl.trim() : "";

  if (monitoringEnabled && !checkUrl && !url) {
    throw new Error("Check URL or main URL is required when monitoring is enabled");
  }

  const id = requireId
    ? typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : ""
    : randomUUID();

  if (requireId && !id) {
    throw new Error("System id is required");
  }

  return normalizeRecord({
    id: id as string,
    name,
    url,
    description: typeof record.description === "string" ? record.description.trim() : "",
    monitoringEnabled,
    checkUrl,
    checkMode: record.checkMode === "tcp" ? "tcp" : "http",
    ignoreTlsErrors: Boolean(record.ignoreTlsErrors),
  });
}

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readSystemsFile(): Promise<SystemRecord[]> {
  await ensureDataDir();

  if (!existsSync(SYSTEMS_FILE)) {
    await writeFile(SYSTEMS_FILE, JSON.stringify(DEFAULT_SYSTEMS, null, 2), "utf8");
    return DEFAULT_SYSTEMS;
  }

  const raw = await readFile(SYSTEMS_FILE, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("systems.json must contain an array");
  }

  const systems = parsed
    .map((item) => migrateRecord(item))
    .filter((item): item is SystemRecord => item !== null);

  const normalized = systems.map(normalizeRecord);
  const needsUpgrade = parsed.some(recordNeedsUpgrade);

  if (needsUpgrade && normalized.length > 0) {
    await writeSystemsFile(normalized);
  }

  return normalized.length > 0 ? normalized : DEFAULT_SYSTEMS;
}

async function writeSystemsFile(systems: SystemRecord[]) {
  await ensureDataDir();
  await writeFile(SYSTEMS_FILE, JSON.stringify(systems, null, 2), "utf8");
}

export async function listSystems(): Promise<SystemRecord[]> {
  return readSystemsFile();
}

export async function createSystem(raw: unknown): Promise<SystemRecord> {
  const system = validateSystemInput(raw);
  const systems = await readSystemsFile();
  systems.push(system);
  await writeSystemsFile(systems);
  return system;
}

export async function updateSystem(id: string, raw: unknown): Promise<SystemRecord> {
  const patch = validateSystemInput({ ...(raw as object), id }, true);
  const systems = await readSystemsFile();
  const index = systems.findIndex((item) => item.id === id);

  if (index === -1) {
    throw new Error("System not found");
  }

  systems[index] = patch;
  await writeSystemsFile(systems);
  return patch;
}

export async function deleteSystem(id: string): Promise<void> {
  const systems = await readSystemsFile();
  const next = systems.filter((item) => item.id !== id);

  if (next.length === systems.length) {
    throw new Error("System not found");
  }

  await writeSystemsFile(next);
}
