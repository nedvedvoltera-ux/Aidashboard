import type { VmProbeResult } from "./vmProbe.ts";

export type CachedVmEntry = VmProbeResult & {
  checkedAt: number;
};

const cache = new Map<string, CachedVmEntry>();

export function getVmSnapshot(): Record<string, CachedVmEntry> {
  return Object.fromEntries(cache.entries());
}

export function setCachedVm(vmId: string, result: VmProbeResult) {
  cache.set(vmId, {
    ...result,
    checkedAt: Date.now(),
  });
}

export function removeCachedVm(vmId: string) {
  cache.delete(vmId);
}
