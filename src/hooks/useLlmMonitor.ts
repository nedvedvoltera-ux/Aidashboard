import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLlmStatus } from "../services/llms";
import type { LlmHealthState, LlmService } from "../types";

const POLL_INTERVAL_MS = 30_000;

export function useLlmMonitor(llms: LlmService[]) {
  const [healthById, setHealthById] = useState<Record<string, LlmHealthState>>({});
  const llmsRef = useRef(llms);
  llmsRef.current = llms;

  const llmsKey = useMemo(
    () => llms.map((llm) => `${llm.id}:${llm.monitoringEnabled}:${llm.baseUrl}:${llm.probeMode}`).join("|"),
    [llms],
  );

  const refresh = useCallback(async () => {
    try {
      const snapshot = await fetchLlmStatus();
      setHealthById((prev) => {
        const next = { ...prev };
        for (const llm of llmsRef.current) {
          if (!llm.monitoringEnabled) {
            next[llm.id] = { status: "no-counter", checking: false };
            continue;
          }
          const cached = snapshot.byId[llm.id];
          next[llm.id] = cached
            ? { ...cached, checking: false }
            : (next[llm.id] ?? { status: "checking", checking: true });
        }
        return next;
      });
    } catch {
      // Держим предыдущее состояние при временной ошибке сети.
    }
  }, []);

  useEffect(() => {
    if (!llmsKey) {
      setHealthById({});
      return;
    }

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [llmsKey, refresh]);

  return { healthById, refresh };
}
