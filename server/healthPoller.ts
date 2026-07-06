import { listSystems, type SystemRecord } from "./systems.ts";
import { getHealthSnapshot, removeCachedHealth, setCachedHealth } from "./healthCache.ts";
import { probeUrl } from "./healthProbe.ts";

const POLL_INTERVAL_MS = Number(process.env.HEALTH_POLL_INTERVAL_MS ?? 30_000);

function resolveCheckUrl(system: SystemRecord): string | null {
  if (!system.monitoringEnabled) {
    return null;
  }
  const candidate = system.checkUrl.trim() || system.url.trim();
  return candidate || null;
}

async function checkSystem(system: SystemRecord) {
  const checkUrl = resolveCheckUrl(system);
  if (!checkUrl) {
    removeCachedHealth(system.id);
    return;
  }

  const result = await probeUrl(checkUrl, {
    mode: system.checkMode,
    ignoreTlsErrors: system.ignoreTlsErrors,
  });
  setCachedHealth(system.id, result);
}

export async function refreshHealthForSystem(systemId: string) {
  const systems = await listSystems();
  const system = systems.find((item) => item.id === systemId);
  if (!system) {
    removeCachedHealth(systemId);
    return;
  }
  await checkSystem(system);
}

export async function refreshAllHealth() {
  const systems = await listSystems();
  await Promise.all(systems.map((system) => checkSystem(system)));
}

export function startHealthPoller() {
  void refreshAllHealth();

  const intervalId = setInterval(() => {
    void refreshAllHealth();
  }, POLL_INTERVAL_MS);

  return () => {
    clearInterval(intervalId);
  };
}

export function getHealthStatusPayload() {
  return { byId: getHealthSnapshot() };
}
