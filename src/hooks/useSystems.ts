import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSystem as apiCreateSystem,
  deleteSystem as apiDeleteSystem,
  fetchSystems,
  SystemsApiError,
  updateSystem as apiUpdateSystem,
} from "../services/systems";
import type { System } from "../types";

const LEGACY_STORAGE_KEY = "aidashboard-systems";
const REFRESH_INTERVAL_MS = 30_000;

export function useSystems(editPin: string | null) {
  const [systems, setSystems] = useState<System[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const migratedRef = useRef(false);

  const reload = useCallback(async () => {
    try {
      const data = await fetchSystems();
      setSystems(data);
      setError(null);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось загрузить список систем";
      setError(message);
      return null;
    }
  }, []);

  const tryMigrateLegacyData = useCallback(
    async (serverSystems: System[]) => {
      if (migratedRef.current || !editPin) {
        return;
      }

      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) {
        migratedRef.current = true;
        return;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed) || parsed.length === 0) {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          migratedRef.current = true;
          return;
        }

        const serverSnapshot = JSON.stringify(serverSystems);
        const legacySnapshot = JSON.stringify(parsed);
        if (serverSnapshot === legacySnapshot) {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          migratedRef.current = true;
          return;
        }

        for (const item of parsed) {
          if (!item || typeof item !== "object") {
            continue;
          }
          const record = item as Record<string, unknown>;
          if (typeof record.id === "string" && serverSystems.some((s) => s.id === record.id)) {
            await apiUpdateSystem(
              record.id,
              {
                name: String(record.name ?? ""),
                url: String(record.url ?? ""),
                description: String(record.description ?? ""),
                monitoringEnabled: Boolean(record.monitoringEnabled ?? record.status !== "no-counter"),
                checkUrl: String(record.checkUrl ?? record.url ?? ""),
                checkMode: record.checkMode === "tcp" ? "tcp" : "http",
                ignoreTlsErrors: Boolean(record.ignoreTlsErrors),
              },
              editPin,
            );
          } else {
            await apiCreateSystem(
              {
                name: String(record.name ?? ""),
                url: String(record.url ?? ""),
                description: String(record.description ?? ""),
                monitoringEnabled: Boolean(record.monitoringEnabled ?? record.status !== "no-counter"),
                checkUrl: String(record.checkUrl ?? record.url ?? ""),
                checkMode: record.checkMode === "tcp" ? "tcp" : "http",
                ignoreTlsErrors: Boolean(record.ignoreTlsErrors),
              },
              editPin,
            );
          }
        }

        localStorage.removeItem(LEGACY_STORAGE_KEY);
        migratedRef.current = true;
        await reload();
      } catch {
        // Keep legacy data if migration fails.
      }
    },
    [editPin, reload],
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const data = await reload();
      if (!cancelled) {
        setLoading(false);
        if (data) {
          await tryMigrateLegacyData(data);
        }
      }
    };

    void load();

    const intervalId = window.setInterval(() => {
      void reload();
    }, REFRESH_INTERVAL_MS);

    const onFocus = () => {
      void reload();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [reload, tryMigrateLegacyData]);

  useEffect(() => {
    if (!editPin || loading) {
      return;
    }
    void reload().then((data) => {
      if (data) {
        void tryMigrateLegacyData(data);
      }
    });
  }, [editPin, loading, reload, tryMigrateLegacyData]);

  const addSystem = useCallback(
    async (system: Omit<System, "id">) => {
      if (!editPin) {
        throw new SystemsApiError("Требуется PIN для редактирования", 401);
      }
      const created = await apiCreateSystem(system, editPin);
      setSystems((prev) => [...prev, created]);
      return created;
    },
    [editPin],
  );

  const updateSystem = useCallback(
    async (id: string, patch: Omit<System, "id">) => {
      if (!editPin) {
        throw new SystemsApiError("Требуется PIN для редактирования", 401);
      }
      const updated = await apiUpdateSystem(id, patch, editPin);
      setSystems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      return updated;
    },
    [editPin],
  );

  const deleteSystem = useCallback(
    async (id: string) => {
      if (!editPin) {
        throw new SystemsApiError("Требуется PIN для редактирования", 401);
      }
      await apiDeleteSystem(id, editPin);
      setSystems((prev) => prev.filter((item) => item.id !== id));
    },
    [editPin],
  );

  return { systems, loading, error, reload, addSystem, updateSystem, deleteSystem };
}
