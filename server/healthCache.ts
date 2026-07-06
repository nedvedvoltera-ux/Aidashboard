import type { HealthProbeResult } from "./healthProbe.ts";

export type CachedHealthEntry = HealthProbeResult & {
  checkedAt: number;
};

const cache = new Map<string, CachedHealthEntry>();

export function getHealthSnapshot(): Record<string, CachedHealthEntry> {
  return Object.fromEntries(cache.entries());
}

export function getCachedHealth(systemId: string): CachedHealthEntry | undefined {
  return cache.get(systemId);
}

export function setCachedHealth(systemId: string, result: HealthProbeResult) {
  cache.set(systemId, {
    ...result,
    checkedAt: Date.now(),
  });
}

export function removeCachedHealth(systemId: string) {
  cache.delete(systemId);
}

export function clearHealthCache() {
  cache.clear();
}
