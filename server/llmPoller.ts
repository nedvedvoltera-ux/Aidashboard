import { listLlms, type LlmServiceRecord } from "./llms.ts";
import { getLlmSnapshot, removeCachedLlm, setCachedLlm } from "./llmCache.ts";
import { probeLlm } from "./llmProbe.ts";

const POLL_INTERVAL_MS = Number(process.env.LLM_POLL_INTERVAL_MS ?? 45_000);

async function checkLlm(service: LlmServiceRecord) {
  if (!service.monitoringEnabled || !service.baseUrl.trim()) {
    removeCachedLlm(service.id);
    return;
  }

  const result = await probeLlm(service);
  setCachedLlm(service.id, result);
}

export async function refreshLlm(serviceId: string) {
  const llms = await listLlms();
  const service = llms.find((item) => item.id === serviceId);
  if (!service) {
    removeCachedLlm(serviceId);
    return;
  }
  await checkLlm(service);
}

export async function refreshAllLlms() {
  const llms = await listLlms();
  await Promise.all(llms.map((service) => checkLlm(service)));
}

export function startLlmPoller() {
  void refreshAllLlms();

  const intervalId = setInterval(() => {
    void refreshAllLlms();
  }, POLL_INTERVAL_MS);

  return () => clearInterval(intervalId);
}

export function getLlmStatusPayload() {
  return { byId: getLlmSnapshot() };
}
