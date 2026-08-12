import { probeDocker, type DockerProbeResult } from "./dockerProbe.ts";

const POLL_INTERVAL_MS = Number(process.env.DOCKER_POLL_INTERVAL_MS ?? 20_000);

type CachedDockerStatus = DockerProbeResult & { checkedAt: number };

let cached: CachedDockerStatus | null = null;

export async function refreshDockerStatus() {
  const result = await probeDocker();
  cached = { ...result, checkedAt: Date.now() };
  return cached;
}

export function startDockerPoller() {
  void refreshDockerStatus();

  const intervalId = setInterval(() => {
    void refreshDockerStatus();
  }, POLL_INTERVAL_MS);

  return () => clearInterval(intervalId);
}

export function getDockerStatusPayload(): CachedDockerStatus {
  return (
    cached ?? {
      available: false,
      containers: [],
      error: "Ещё не проверено",
      checkedAt: 0,
    }
  );
}
