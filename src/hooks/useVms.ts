import { useCallback, useEffect, useState } from "react";
import {
  createVm as apiCreateVm,
  deleteVm as apiDeleteVm,
  fetchVms,
  updateVm as apiUpdateVm,
  VmsApiError,
} from "../services/vms";
import type { VmNode } from "../types";

const REFRESH_INTERVAL_MS = 30_000;

export function useVms(editPin: string | null) {
  const [vms, setVms] = useState<VmNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await fetchVms();
      setVms(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить список ВМ");
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      await reload();
      if (!cancelled) {
        setLoading(false);
      }
    };

    void load();

    const intervalId = window.setInterval(() => void reload(), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [reload]);

  const addVm = useCallback(
    async (data: Omit<VmNode, "id">) => {
      if (!editPin) {
        throw new VmsApiError("Требуется PIN для редактирования", 401);
      }
      const created = await apiCreateVm(data, editPin);
      setVms((prev) => [...prev, created]);
      return created;
    },
    [editPin],
  );

  const updateVmEntry = useCallback(
    async (id: string, patch: Omit<VmNode, "id">) => {
      if (!editPin) {
        throw new VmsApiError("Требуется PIN для редактирования", 401);
      }
      const updated = await apiUpdateVm(id, patch, editPin);
      setVms((prev) => prev.map((item) => (item.id === id ? updated : item)));
      return updated;
    },
    [editPin],
  );

  const deleteVmEntry = useCallback(
    async (id: string) => {
      if (!editPin) {
        throw new VmsApiError("Требуется PIN для редактирования", 401);
      }
      await apiDeleteVm(id, editPin);
      setVms((prev) => prev.filter((item) => item.id !== id));
    },
    [editPin],
  );

  return { vms, loading, error, addVm, updateVm: updateVmEntry, deleteVm: deleteVmEntry };
}
