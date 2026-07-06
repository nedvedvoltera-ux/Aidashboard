import type { System } from "../types";
import { migrateSystem } from "../types";

class SystemsApiError extends Error {
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
    throw new SystemsApiError(payload?.error ?? `API error (${response.status})`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function pinHeaders(pin: string): HeadersInit {
  return { "X-Edit-Pin": pin };
}

export async function fetchSystems(): Promise<System[]> {
  const payload = await request<{ systems: unknown[] }>("/api/systems");
  return payload.systems
    .map((item) => migrateSystem(item))
    .filter((item): item is System => item !== null);
}

function normalizeSystemPayload(data: Omit<System, "id">): Omit<System, "id"> {
  return {
    ...data,
    checkMode: data.checkMode === "tcp" ? "tcp" : "http",
    ignoreTlsErrors: Boolean(data.ignoreTlsErrors),
  };
}

export async function createSystem(data: Omit<System, "id">, pin: string): Promise<System> {
  const payload = await request<{ system: unknown }>("/api/systems", {
    method: "POST",
    headers: pinHeaders(pin),
    body: JSON.stringify(normalizeSystemPayload(data)),
  });
  const system = migrateSystem(payload.system);
  if (!system) {
    throw new SystemsApiError("Invalid system response", 500);
  }
  return system;
}

export async function updateSystem(id: string, data: Omit<System, "id">, pin: string): Promise<System> {
  const payload = await request<{ system: unknown }>(`/api/systems/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: pinHeaders(pin),
    body: JSON.stringify(normalizeSystemPayload(data)),
  });
  const system = migrateSystem(payload.system);
  if (!system) {
    throw new SystemsApiError("Invalid system response", 500);
  }
  return system;
}

export async function deleteSystem(id: string, pin: string): Promise<void> {
  await request<void>(`/api/systems/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: pinHeaders(pin),
  });
}

export { SystemsApiError };
