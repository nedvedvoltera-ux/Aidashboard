export type SystemStatus = "online" | "offline" | "no-counter" | "checking";

export type HealthCheckMode = "http" | "tcp";

export type System = {
  id: string;
  name: string;
  url: string;
  description: string;
  monitoringEnabled: boolean;
  checkUrl: string;
  checkMode: HealthCheckMode;
  ignoreTlsErrors: boolean;
};

export type HealthCheckResult = {
  online: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
};

export type HealthState = {
  status: SystemStatus;
  checking: boolean;
  latencyMs?: number;
  statusCode?: number;
  checkedAt?: number;
  error?: string;
};

export const STATUS_LABELS: Record<SystemStatus, string> = {
  online: "Онлайн",
  offline: "Офлайн",
  "no-counter": "Нет счётчика",
  checking: "Проверка…",
};

export const POLL_INTERVAL_MS = 30_000;
export const CHECK_TIMEOUT_MS = 8_000;

export const DEFAULT_SYSTEMS: System[] = [
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

export function resolveCheckUrl(system: System): string | null {
  if (!system.monitoringEnabled) {
    return null;
  }
  const candidate = system.checkUrl.trim() || system.url.trim();
  return candidate || null;
}

export function migrateSystem(raw: unknown): System | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string" || typeof record.url !== "string") {
    return null;
  }

  if (typeof record.monitoringEnabled === "boolean") {
    return {
      id: record.id,
      name: record.name,
      url: record.url,
      description: typeof record.description === "string" ? record.description : "",
      monitoringEnabled: record.monitoringEnabled,
      checkUrl: typeof record.checkUrl === "string" ? record.checkUrl : record.url,
      checkMode: record.checkMode === "tcp" ? "tcp" : "http",
      ignoreTlsErrors: Boolean(record.ignoreTlsErrors),
    };
  }

  const legacyStatus = record.status as SystemStatus | undefined;
  return {
    id: record.id,
    name: record.name,
    url: record.url,
    description: typeof record.description === "string" ? record.description : "",
    monitoringEnabled: legacyStatus !== "no-counter",
    checkUrl: record.url,
    checkMode: "http",
    ignoreTlsErrors: false,
  };
}
