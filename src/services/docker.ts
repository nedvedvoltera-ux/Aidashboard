import type { DockerStatusPayload } from "../types";

export async function fetchDockerStatus(): Promise<DockerStatusPayload> {
  const response = await fetch("/api/docker/status");

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Docker API error (${response.status})`);
  }

  return (await response.json()) as DockerStatusPayload;
}
