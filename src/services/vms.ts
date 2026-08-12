import type { VmHealthState, VmNode } from "../types";
import { migrateVmNode } from "../types";

class VmsApiError extends Error {
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
    throw new VmsApiError(payload?.error ?? `API error (${response.status})`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function pinHeaders(pin: string): HeadersInit {
  return { "X-Edit-Pin": pin };
}

export async function fetchVms(): Promise<VmNode[]> {
  const payload = await request<{ vms: unknown[] }>("/api/vms");
  return payload.vms.map((item) => migrateVmNode(item)).filter((item): item is VmNode => item !== null);
}

export async function createVm(data: Omit<VmNode, "id">, pin: string): Promise<VmNode> {
  const payload = await request<{ vm: unknown }>("/api/vms", {
    method: "POST",
    headers: pinHeaders(pin),
    body: JSON.stringify(data),
  });
  const vm = migrateVmNode(payload.vm);
  if (!vm) {
    throw new VmsApiError("Invalid VM response", 500);
  }
  return vm;
}

export async function updateVm(id: string, data: Omit<VmNode, "id">, pin: string): Promise<VmNode> {
  const payload = await request<{ vm: unknown }>(`/api/vms/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: pinHeaders(pin),
    body: JSON.stringify(data),
  });
  const vm = migrateVmNode(payload.vm);
  if (!vm) {
    throw new VmsApiError("Invalid VM response", 500);
  }
  return vm;
}

export async function deleteVm(id: string, pin: string): Promise<void> {
  await request<void>(`/api/vms/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: pinHeaders(pin),
  });
}

export async function fetchVmStatus(): Promise<{ byId: Record<string, VmHealthState & { checkedAt: number }> }> {
  return request<{ byId: Record<string, VmHealthState & { checkedAt: number }> }>("/api/vms/status");
}

export { VmsApiError };
