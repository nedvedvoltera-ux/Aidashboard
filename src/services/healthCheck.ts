import type { HealthCheckResult } from "../types";
import type { HealthProbeOptions } from "../utils/healthProbe";

export type CachedHealthEntry = HealthCheckResult & {
  checkedAt: number;
};

export async function probeUrl(
  checkUrl: string,
  options: HealthProbeOptions = { mode: "http", ignoreTlsErrors: false },
): Promise<HealthCheckResult> {
  const response = await fetch("/api/health-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: checkUrl,
      mode: options.mode,
      ignoreTlsErrors: options.ignoreTlsErrors,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Health check API error (${response.status})`);
  }

  return (await response.json()) as HealthCheckResult;
}

export async function fetchHealthStatus(): Promise<{ byId: Record<string, CachedHealthEntry> }> {
  const response = await fetch("/api/health-status");

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Health status API error (${response.status})`);
  }

  return (await response.json()) as { byId: Record<string, CachedHealthEntry> };
}
