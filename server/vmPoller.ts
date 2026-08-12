import { listVms, type VmNodeRecord } from "./vms.ts";
import { getVmSnapshot, removeCachedVm, setCachedVm } from "./vmCache.ts";
import { probeVm, type VmRawSample } from "./vmProbe.ts";

const POLL_INTERVAL_MS = Number(process.env.VM_POLL_INTERVAL_MS ?? 30_000);

const rawSamples = new Map<string, VmRawSample>();

async function checkVm(vm: VmNodeRecord) {
  if (!vm.monitoringEnabled || !vm.exporterUrl.trim()) {
    removeCachedVm(vm.id);
    rawSamples.delete(vm.id);
    return;
  }

  const { result, sample } = await probeVm(vm.exporterUrl.trim(), rawSamples.get(vm.id));

  if (sample) {
    rawSamples.set(vm.id, sample);
  } else {
    rawSamples.delete(vm.id);
  }

  setCachedVm(vm.id, result);
}

export async function refreshVm(vmId: string) {
  const vms = await listVms();
  const vm = vms.find((item) => item.id === vmId);
  if (!vm) {
    removeCachedVm(vmId);
    rawSamples.delete(vmId);
    return;
  }
  await checkVm(vm);
}

export async function refreshAllVms() {
  const vms = await listVms();
  await Promise.all(vms.map((vm) => checkVm(vm)));
}

export function startVmPoller() {
  void refreshAllVms();

  const intervalId = setInterval(() => {
    void refreshAllVms();
  }, POLL_INTERVAL_MS);

  return () => clearInterval(intervalId);
}

export function getVmStatusPayload() {
  return { byId: getVmSnapshot() };
}
