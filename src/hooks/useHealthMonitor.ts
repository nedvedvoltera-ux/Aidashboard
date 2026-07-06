import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchHealthStatus, probeUrl } from "../services/healthCheck";
import {
  POLL_INTERVAL_MS,
  resolveCheckUrl,
  type HealthState,
  type System,
  type SystemStatus,
} from "../types";
import { getProbeOptions } from "../utils/healthProbe";

function pendingState(): HealthState {
  return { status: "offline", checking: true };
}

function resultToHealthState(result: {
  online: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
  checkedAt: number;
}): HealthState {
  return {
    status: result.online ? "online" : "offline",
    checking: false,
    latencyMs: result.latencyMs,
    statusCode: result.statusCode,
    checkedAt: result.checkedAt,
    error: result.error,
  };
}

function buildInitialState(systems: System[]): Record<string, HealthState> {
  return Object.fromEntries(
    systems.map((system) => [
      system.id,
      system.monitoringEnabled ? pendingState() : { status: "no-counter", checking: false },
    ]),
  );
}

export function useHealthMonitor(systems: System[]) {
  const [healthById, setHealthById] = useState<Record<string, HealthState>>({});
  const systemsRef = useRef(systems);
  systemsRef.current = systems;

  const systemKey = useMemo(
    () =>
      systems
        .map(
          (system) =>
            `${system.id}:${system.monitoringEnabled}:${system.checkUrl}:${system.url}:${system.checkMode}:${system.ignoreTlsErrors}`,
        )
        .join("|"),
    [systems],
  );

  const runCheck = useCallback(async (system: System) => {
    const checkUrl = resolveCheckUrl(system);

    if (!checkUrl) {
      setHealthById((prev) => ({
        ...prev,
        [system.id]: { status: "no-counter", checking: false },
      }));
      return;
    }

    setHealthById((prev) => ({
      ...prev,
      [system.id]: {
        ...(prev[system.id] ?? pendingState()),
        checking: true,
      },
    }));

    try {
      const result = await probeUrl(checkUrl, getProbeOptions(system));
      setHealthById((prev) => ({
        ...prev,
        [system.id]: resultToHealthState({
          ...result,
          checkedAt: Date.now(),
        }),
      }));
    } catch (error) {
      setHealthById((prev) => ({
        ...prev,
        [system.id]: {
          status: "offline",
          checking: false,
          checkedAt: Date.now(),
          error: error instanceof Error ? error.message : "Health check failed",
        },
      }));
    }
  }, []);

  const runAllChecks = useCallback(async () => {
    const currentSystems = systemsRef.current;
    await Promise.all(currentSystems.map((system) => runCheck(system)));
  }, [runCheck]);

  const applyServerSnapshot = useCallback(async () => {
    try {
      const snapshot = await fetchHealthStatus();
      setHealthById((prev) => {
        const next = { ...prev };
        for (const system of systemsRef.current) {
          if (!system.monitoringEnabled) {
            next[system.id] = { status: "no-counter", checking: false };
            continue;
          }

          const cached = snapshot.byId[system.id];
          if (cached) {
            next[system.id] = resultToHealthState(cached);
          } else if (!next[system.id]) {
            next[system.id] = pendingState();
          }
        }
        return next;
      });
    } catch {
      setHealthById((prev) => {
        if (Object.keys(prev).length > 0) {
          return prev;
        }
        return buildInitialState(systemsRef.current);
      });
    }
  }, []);

  useEffect(() => {
    if (!systemKey) {
      setHealthById({});
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      setHealthById(buildInitialState(systemsRef.current));
      await applyServerSnapshot();
      if (!cancelled) {
        await runAllChecks();
      }
    };

    void bootstrap();

    const intervalId = window.setInterval(() => {
      void runAllChecks();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [systemKey, applyServerSnapshot, runAllChecks]);

  const refresh = useCallback(() => {
    void applyServerSnapshot().then(() => runAllChecks());
  }, [applyServerSnapshot, runAllChecks]);

  return { healthById, refresh };
}

export function getSystemStatus(system: System, health?: HealthState): SystemStatus {
  if (!system.monitoringEnabled) {
    return "no-counter";
  }
  if (health?.checking && health.checkedAt === undefined) {
    return "checking";
  }
  return health?.status ?? "checking";
}

export function sortSystemsByStatus(
  systems: System[],
  healthById: Record<string, HealthState>,
): System[] {
  return [...systems].sort((left, right) => {
    const leftOnline = getSystemStatus(left, healthById[left.id]) === "online" ? 0 : 1;
    const rightOnline = getSystemStatus(right, healthById[right.id]) === "online" ? 0 : 1;

    if (leftOnline !== rightOnline) {
      return leftOnline - rightOnline;
    }

    return left.name.localeCompare(right.name, "ru");
  });
}
