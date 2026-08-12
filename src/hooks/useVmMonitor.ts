import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchVmStatus } from "../services/vms";
import type { VmHealthState, VmNode } from "../types";

const POLL_INTERVAL_MS = 20_000;

export function useVmMonitor(vms: VmNode[]) {
  const [healthById, setHealthById] = useState<Record<string, VmHealthState>>({});
  const vmsRef = useRef(vms);
  vmsRef.current = vms;

  const vmsKey = useMemo(
    () => vms.map((vm) => `${vm.id}:${vm.monitoringEnabled}:${vm.exporterUrl}`).join("|"),
    [vms],
  );

  const refresh = useCallback(async () => {
    try {
      const snapshot = await fetchVmStatus();
      setHealthById((prev) => {
        const next = { ...prev };
        for (const vm of vmsRef.current) {
          if (!vm.monitoringEnabled) {
            next[vm.id] = { status: "no-counter", checking: false };
            continue;
          }
          const cached = snapshot.byId[vm.id];
          next[vm.id] = cached
            ? { ...cached, checking: false }
            : (next[vm.id] ?? { status: "checking", checking: true });
        }
        return next;
      });
    } catch {
      // Держим предыдущее состояние при временной ошибке сети.
    }
  }, []);

  useEffect(() => {
    if (!vmsKey) {
      setHealthById({});
      return;
    }

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [vmsKey, refresh]);

  return { healthById, refresh };
}
