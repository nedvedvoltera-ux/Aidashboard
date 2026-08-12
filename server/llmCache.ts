import type { LlmProbeResult } from "./llmProbe.ts";

export type CachedLlmEntry = LlmProbeResult & {
  checkedAt: number;
};

const cache = new Map<string, CachedLlmEntry>();

export function getLlmSnapshot(): Record<string, CachedLlmEntry> {
  return Object.fromEntries(cache.entries());
}

export function setCachedLlm(serviceId: string, result: LlmProbeResult) {
  cache.set(serviceId, {
    ...result,
    checkedAt: Date.now(),
  });
}

export function removeCachedLlm(serviceId: string) {
  cache.delete(serviceId);
}
