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

// --- Виртуальные машины (мониторинг производительности) ---

export type VmExporterKind = "node_exporter" | "windows_exporter" | "unknown";

export type VmNode = {
  id: string;
  name: string;
  host: string;
  exporterUrl: string;
  description: string;
  monitoringEnabled: boolean;
};

export type VmMetrics = {
  cpuPercent?: number;
  memoryPercent?: number;
  memoryTotalBytes?: number;
  memoryUsedBytes?: number;
  diskPercent?: number;
  diskTotalBytes?: number;
  diskUsedBytes?: number;
  uptimeSeconds?: number;
  exporter?: VmExporterKind;
};

export type VmStatus = "online" | "offline" | "degraded" | "no-counter" | "checking";

export type VmHealthState = {
  status: VmStatus;
  checking: boolean;
  latencyMs?: number;
  metrics?: VmMetrics;
  checkedAt?: number;
  error?: string;
};

export const VM_STATUS_LABELS: Record<VmStatus, string> = {
  online: "Онлайн",
  offline: "Офлайн",
  degraded: "Высокая нагрузка",
  "no-counter": "Нет счётчика",
  checking: "Проверка…",
};

export const VM_DEGRADED_THRESHOLD_PERCENT = 85;

export function getVmStatus(vm: VmNode, health?: VmHealthState): VmStatus {
  if (!vm.monitoringEnabled) {
    return "no-counter";
  }
  if (!health || (health.checking && health.checkedAt === undefined)) {
    return "checking";
  }
  if (health.status === "online" && health.metrics) {
    const values = [health.metrics.cpuPercent, health.metrics.memoryPercent, health.metrics.diskPercent];
    if (values.some((value) => typeof value === "number" && value >= VM_DEGRADED_THRESHOLD_PERCENT)) {
      return "degraded";
    }
  }
  return health.status;
}

export function migrateVmNode(raw: unknown): VmNode | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") {
    return null;
  }
  return {
    id: record.id,
    name: record.name,
    host: typeof record.host === "string" ? record.host : "",
    exporterUrl: typeof record.exporterUrl === "string" ? record.exporterUrl : "",
    description: typeof record.description === "string" ? record.description : "",
    monitoringEnabled: Boolean(record.monitoringEnabled),
  };
}

// --- LLM-сервисы (мониторинг доступности) ---

export type LlmProbeMode = "openai" | "ollama" | "custom";

export type LlmService = {
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

export type LlmHealthState = {
  status: SystemStatus;
  checking: boolean;
  latencyMs?: number;
  modelsCount?: number;
  models?: string[];
  checkedAt?: number;
  error?: string;
};

export function getLlmStatus(service: LlmService, health?: LlmHealthState): SystemStatus {
  if (!service.monitoringEnabled) {
    return "no-counter";
  }
  if (!health || (health.checking && health.checkedAt === undefined)) {
    return "checking";
  }
  return health.status;
}

export function migrateLlmService(raw: unknown): LlmService | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") {
    return null;
  }
  return {
    id: record.id,
    name: record.name,
    baseUrl: typeof record.baseUrl === "string" ? record.baseUrl : "",
    model: typeof record.model === "string" ? record.model : "",
    probeMode: record.probeMode === "ollama" ? "ollama" : record.probeMode === "custom" ? "custom" : "openai",
    apiKeyEnv: typeof record.apiKeyEnv === "string" ? record.apiKeyEnv : "",
    customPath: typeof record.customPath === "string" ? record.customPath : "",
    description: typeof record.description === "string" ? record.description : "",
    monitoringEnabled: Boolean(record.monitoringEnabled),
  };
}

// --- Docker (мониторинг состояния контейнеров) ---

export type DockerContainerStatus = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health?: string;
  createdAt?: number;
};

export type DockerStatusPayload = {
  available: boolean;
  containers: DockerContainerStatus[];
  error?: string;
  connection?: string;
  checkedAt: number;
};

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
