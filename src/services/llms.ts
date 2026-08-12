import type { LlmHealthState, LlmService } from "../types";
import { migrateLlmService } from "../types";

class LlmsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new LlmsApiError(payload?.error ?? `API error (${response.status})`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function pinHeaders(pin: string): HeadersInit {
  return { "X-Edit-Pin": pin };
}

export async function fetchLlms(): Promise<LlmService[]> {
  const payload = await request<{ llms: unknown[] }>("/api/llms");
  return payload.llms.map((item) => migrateLlmService(item)).filter((item): item is LlmService => item !== null);
}

export async function createLlm(data: Omit<LlmService, "id">, pin: string): Promise<LlmService> {
  const payload = await request<{ llm: unknown }>("/api/llms", {
    method: "POST",
    headers: pinHeaders(pin),
    body: JSON.stringify(data),
  });
  const llm = migrateLlmService(payload.llm);
  if (!llm) {
    throw new LlmsApiError("Invalid LLM response", 500);
  }
  return llm;
}

export async function updateLlm(id: string, data: Omit<LlmService, "id">, pin: string): Promise<LlmService> {
  const payload = await request<{ llm: unknown }>(`/api/llms/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: pinHeaders(pin),
    body: JSON.stringify(data),
  });
  const llm = migrateLlmService(payload.llm);
  if (!llm) {
    throw new LlmsApiError("Invalid LLM response", 500);
  }
  return llm;
}

export async function deleteLlm(id: string, pin: string): Promise<void> {
  await request<void>(`/api/llms/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: pinHeaders(pin),
  });
}

export async function fetchLlmStatus(): Promise<{ byId: Record<string, LlmHealthState & { checkedAt: number }> }> {
  return request<{ byId: Record<string, LlmHealthState & { checkedAt: number }> }>("/api/llms/status");
}

export { LlmsApiError };
