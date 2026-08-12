import { useCallback, useEffect, useState } from "react";
import { fetchDockerStatus } from "../services/docker";
import type { DockerStatusPayload } from "../types";

const POLL_INTERVAL_MS = 15_000;

export function useDockerStatus() {
  const [status, setStatus] = useState<DockerStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchDockerStatus();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось получить статус Docker");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  return { status, error, refresh };
}
