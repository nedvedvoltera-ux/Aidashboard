import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const VMS_FILE = path.join(DATA_DIR, "vms.json");

export type VmNodeRecord = {
  id: string;
  name: string;
  host: string;
  exporterUrl: string;
  description: string;
  monitoringEnabled: boolean;
};

export const DEFAULT_VMS: VmNodeRecord[] = [
  {
    id: "vm-demo-1",
    name: "Демо ВМ (пример подключения)",
    host: "192.168.1.10",
    exporterUrl: "http://192.168.1.10:9100/metrics",
    description:
      "Пример узла. Установите node_exporter (Linux, порт 9100) или windows_exporter (Windows, порт 9182) на реальном сервере и впишите его адрес вместо этого, чтобы увидеть настоящие CPU/RAM/диск.",
    monitoringEnabled: true,
  },
];

function normalizeRecord(record: VmNodeRecord): VmNodeRecord {
  return {
    ...record,
    name: record.name.trim(),
    host: record.host.trim(),
    exporterUrl: record.exporterUrl.trim(),
    description: record.description.trim(),
    monitoringEnabled: Boolean(record.monitoringEnabled),
  };
}

function migrateRecord(raw: unknown): VmNodeRecord | null {
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
    host: typeof record.host === "string" ? record.host : "",
    exporterUrl: typeof record.exporterUrl === "string" ? record.exporterUrl : "",
    description: typeof record.description === "string" ? record.description : "",
    monitoringEnabled: Boolean(record.monitoringEnabled),
  });
}

function validateVmInput(raw: unknown, requireId = false): VmNodeRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("Некорректные данные ВМ");
  }

  const record = raw as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const exporterUrl = typeof record.exporterUrl === "string" ? record.exporterUrl.trim() : "";

  if (!name) {
    throw new Error("Название обязательно");
  }

  if (record.monitoringEnabled && !exporterUrl) {
    throw new Error("Адрес exporter'а обязателен, если включён мониторинг");
  }

  if (exporterUrl) {
    try {
      const parsed = new URL(exporterUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
    } catch {
      throw new Error("Адрес exporter'а должен быть корректным http(s) URL");
    }
  }

  const id = requireId
    ? typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : ""
    : randomUUID();

  if (requireId && !id) {
    throw new Error("Id ВМ обязателен");
  }

  return normalizeRecord({
    id: id as string,
    name,
    host: typeof record.host === "string" ? record.host.trim() : "",
    exporterUrl,
    description: typeof record.description === "string" ? record.description.trim() : "",
    monitoringEnabled: Boolean(record.monitoringEnabled),
  });
}

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readVmsFile(): Promise<VmNodeRecord[]> {
  await ensureDataDir();

  if (!existsSync(VMS_FILE)) {
    await writeFile(VMS_FILE, JSON.stringify(DEFAULT_VMS, null, 2), "utf8");
    return DEFAULT_VMS;
  }

  const raw = await readFile(VMS_FILE, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("vms.json must contain an array");
  }

  const vms = parsed.map((item) => migrateRecord(item)).filter((item): item is VmNodeRecord => item !== null);
  return vms;
}

async function writeVmsFile(vms: VmNodeRecord[]) {
  await ensureDataDir();
  await writeFile(VMS_FILE, JSON.stringify(vms, null, 2), "utf8");
}

export async function listVms(): Promise<VmNodeRecord[]> {
  return readVmsFile();
}

export async function createVm(raw: unknown): Promise<VmNodeRecord> {
  const vm = validateVmInput(raw);
  const vms = await readVmsFile();
  vms.push(vm);
  await writeVmsFile(vms);
  return vm;
}

export async function updateVm(id: string, raw: unknown): Promise<VmNodeRecord> {
  const patch = validateVmInput({ ...(raw as object), id }, true);
  const vms = await readVmsFile();
  const index = vms.findIndex((item) => item.id === id);

  if (index === -1) {
    throw new Error("VM not found");
  }

  vms[index] = patch;
  await writeVmsFile(vms);
  return patch;
}

export async function deleteVm(id: string): Promise<void> {
  const vms = await readVmsFile();
  const next = vms.filter((item) => item.id !== id);

  if (next.length === vms.length) {
    throw new Error("VM not found");
  }

  await writeVmsFile(next);
}
