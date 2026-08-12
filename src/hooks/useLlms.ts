import { useCallback, useEffect, useState } from "react";
import {
  createLlm as apiCreateLlm,
  deleteLlm as apiDeleteLlm,
  fetchLlms,
  LlmsApiError,
  updateLlm as apiUpdateLlm,
} from "../services/llms";
import type { LlmService } from "../types";

const REFRESH_INTERVAL_MS = 30_000;

export function useLlms(editPin: string | null) {
  const [llms, setLlms] = useState<LlmService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await fetchLlms();
      setLlms(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить список LLM-сервисов");
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

  const addLlm = useCallback(
    async (data: Omit<LlmService, "id">) => {
      if (!editPin) {
        throw new LlmsApiError("Требуется PIN для редактирования", 401);
      }
      const created = await apiCreateLlm(data, editPin);
      setLlms((prev) => [...prev, created]);
      return created;
    },
    [editPin],
  );

  const updateLlmEntry = useCallback(
    async (id: string, patch: Omit<LlmService, "id">) => {
      if (!editPin) {
        throw new LlmsApiError("Требуется PIN для редактирования", 401);
      }
      const updated = await apiUpdateLlm(id, patch, editPin);
      setLlms((prev) => prev.map((item) => (item.id === id ? updated : item)));
      return updated;
    },
    [editPin],
  );

  const deleteLlmEntry = useCallback(
    async (id: string) => {
      if (!editPin) {
        throw new LlmsApiError("Требуется PIN для редактирования", 401);
      }
      await apiDeleteLlm(id, editPin);
      setLlms((prev) => prev.filter((item) => item.id !== id));
    },
    [editPin],
  );

  return { llms, loading, error, addLlm, updateLlm: updateLlmEntry, deleteLlm: deleteLlmEntry };
}
