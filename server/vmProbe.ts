import http from "node:http";
import https from "node:https";

const PROBE_TIMEOUT_MS = Number(process.env.VM_PROBE_TIMEOUT_MS ?? 8_000);
const MAX_RESPONSE_BYTES = 3_000_000;

export type VmExporterKind = "node_exporter" | "windows_exporter" | "unknown";

export type VmMetrics = {
  cpuPercent?: number;
  memoryPercent?: number;
  memoryTotalBytes?: number;
  memoryUsedBytes?: number;
  diskPercent?: number;
  diskTotalBytes?: number;
  diskUsedBytes?: number;
  uptimeSeconds?: number;
  exporter: VmExporterKind;
};

export type VmProbeResult = {
  online: boolean;
  latencyMs: number;
  metrics?: VmMetrics;
  error?: string;
};

export type VmRawSample = {
  timestamp: number;
  cpuIdleSeconds: number;
  cpuTotalSeconds: number;
};

type MetricSample = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

function fetchText(targetUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      reject(new Error("Некорректный адрес exporter'а"));
      return;
    }

    const secure = parsed.protocol === "https:";
    const transport = secure ? https : http;

    const request = transport.request(
      {
        protocol: secure ? "https:" : "http:",
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : secure ? 443 : 80,
        path: `${parsed.pathname}${parsed.search}` || "/metrics",
        method: "GET",
        headers: {
          "User-Agent": "Aidashboard-VmMonitor/1.0",
          Accept: "text/plain",
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            request.destroy(new Error("Ответ exporter'а слишком большой"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        response.on("error", reject);
      },
    );

    request.setTimeout(PROBE_TIMEOUT_MS, () => {
      request.destroy(new Error("Таймаут опроса exporter'а"));
    });
    request.on("error", reject);
    request.end();
  });
}

const LABELS_REGEX = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
const LINE_REGEX = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([^\s]+)/;

function parseMetrics(text: string): MetricSample[] {
  const samples: MetricSample[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(LINE_REGEX);
    if (!match) {
      continue;
    }

    const [, name, labelsBlock, valueRaw] = match;
    const value = Number(valueRaw);
    if (!Number.isFinite(value)) {
      continue;
    }

    const labels: Record<string, string> = {};
    if (labelsBlock) {
      let labelMatch: RegExpExecArray | null;
      LABELS_REGEX.lastIndex = 0;
      while ((labelMatch = LABELS_REGEX.exec(labelsBlock))) {
        labels[labelMatch[1]] = labelMatch[2];
      }
    }

    samples.push({ name, labels, value });
  }

  return samples;
}

function sumBy(
  samples: MetricSample[],
  name: string,
  filter?: (labels: Record<string, string>) => boolean,
): number {
  let total = 0;
  let found = false;
  for (const sample of samples) {
    if (sample.name !== name) continue;
    if (filter && !filter(sample.labels)) continue;
    total += sample.value;
    found = true;
  }
  return found ? total : Number.NaN;
}

function findOne(
  samples: MetricSample[],
  name: string,
  filter?: (labels: Record<string, string>) => boolean,
): number | undefined {
  for (const sample of samples) {
    if (sample.name !== name) continue;
    if (filter && !filter(sample.labels)) continue;
    return sample.value;
  }
  return undefined;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function computeCpuPercent(previous: VmRawSample | undefined, current: VmRawSample): number | undefined {
  if (!previous || current.timestamp <= previous.timestamp) {
    return undefined;
  }
  const deltaTotal = current.cpuTotalSeconds - previous.cpuTotalSeconds;
  const deltaIdle = current.cpuIdleSeconds - previous.cpuIdleSeconds;
  if (!Number.isFinite(deltaTotal) || deltaTotal <= 0) {
    return undefined;
  }
  return clampPercent(100 * (1 - deltaIdle / deltaTotal));
}

export async function probeVm(
  exporterUrl: string,
  previousSample?: VmRawSample,
): Promise<{ result: VmProbeResult; sample?: VmRawSample }> {
  const startedAt = Date.now();

  try {
    const text = await fetchText(exporterUrl);
    const samples = parseMetrics(text);
    const latencyMs = Date.now() - startedAt;

    const isNodeExporter = samples.some((sample) => sample.name === "node_cpu_seconds_total");
    const isWindowsExporter = samples.some((sample) => sample.name === "windows_cpu_time_total");

    if (isNodeExporter) {
      const cpuIdleSeconds = sumBy(samples, "node_cpu_seconds_total", (labels) => labels.mode === "idle");
      const cpuTotalSeconds = sumBy(samples, "node_cpu_seconds_total");
      const memoryTotalBytes = findOne(samples, "node_memory_MemTotal_bytes");
      const memoryAvailableBytes = findOne(samples, "node_memory_MemAvailable_bytes");
      const diskTotalBytes = findOne(
        samples,
        "node_filesystem_size_bytes",
        (labels) => labels.mountpoint === "/" && labels.fstype !== "tmpfs",
      );
      const diskAvailBytes = findOne(
        samples,
        "node_filesystem_avail_bytes",
        (labels) => labels.mountpoint === "/" && labels.fstype !== "tmpfs",
      );
      const bootTimeSeconds = findOne(samples, "node_boot_time_seconds");

      const sample: VmRawSample | undefined = Number.isFinite(cpuTotalSeconds)
        ? { timestamp: Date.now(), cpuIdleSeconds, cpuTotalSeconds }
        : undefined;

      const metrics: VmMetrics = {
        cpuPercent: sample ? computeCpuPercent(previousSample, sample) : undefined,
        memoryTotalBytes,
        memoryUsedBytes:
          memoryTotalBytes !== undefined && memoryAvailableBytes !== undefined
            ? memoryTotalBytes - memoryAvailableBytes
            : undefined,
        memoryPercent:
          memoryTotalBytes && memoryAvailableBytes !== undefined
            ? clampPercent(100 * (1 - memoryAvailableBytes / memoryTotalBytes))
            : undefined,
        diskTotalBytes,
        diskUsedBytes:
          diskTotalBytes !== undefined && diskAvailBytes !== undefined ? diskTotalBytes - diskAvailBytes : undefined,
        diskPercent:
          diskTotalBytes && diskAvailBytes !== undefined
            ? clampPercent(100 * (1 - diskAvailBytes / diskTotalBytes))
            : undefined,
        uptimeSeconds: bootTimeSeconds !== undefined ? Date.now() / 1000 - bootTimeSeconds : undefined,
        exporter: "node_exporter",
      };

      return { result: { online: true, latencyMs, metrics }, sample };
    }

    if (isWindowsExporter) {
      const cpuIdleSeconds = sumBy(samples, "windows_cpu_time_total", (labels) => labels.mode === "idle");
      const cpuTotalSeconds = sumBy(samples, "windows_cpu_time_total");
      const memoryTotalBytes = findOne(samples, "windows_memory_physical_total_bytes");
      const memoryFreeBytes = findOne(samples, "windows_memory_physical_free_bytes");
      const diskTotalBytes = findOne(samples, "windows_logical_disk_size_bytes", (labels) => labels.volume === "C:");
      const diskFreeBytes = findOne(samples, "windows_logical_disk_free_bytes", (labels) => labels.volume === "C:");
      const bootTimestamp = findOne(samples, "windows_system_boot_time_timestamp");

      const sample: VmRawSample | undefined = Number.isFinite(cpuTotalSeconds)
        ? { timestamp: Date.now(), cpuIdleSeconds, cpuTotalSeconds }
        : undefined;

      const metrics: VmMetrics = {
        cpuPercent: sample ? computeCpuPercent(previousSample, sample) : undefined,
        memoryTotalBytes,
        memoryUsedBytes:
          memoryTotalBytes !== undefined && memoryFreeBytes !== undefined
            ? memoryTotalBytes - memoryFreeBytes
            : undefined,
        memoryPercent:
          memoryTotalBytes && memoryFreeBytes !== undefined
            ? clampPercent(100 * (1 - memoryFreeBytes / memoryTotalBytes))
            : undefined,
        diskTotalBytes,
        diskUsedBytes:
          diskTotalBytes !== undefined && diskFreeBytes !== undefined ? diskTotalBytes - diskFreeBytes : undefined,
        diskPercent:
          diskTotalBytes && diskFreeBytes !== undefined
            ? clampPercent(100 * (1 - diskFreeBytes / diskTotalBytes))
            : undefined,
        uptimeSeconds: bootTimestamp !== undefined ? Date.now() / 1000 - bootTimestamp : undefined,
        exporter: "windows_exporter",
      };

      return { result: { online: true, latencyMs, metrics }, sample };
    }

    return {
      result: {
        online: true,
        latencyMs,
        metrics: { exporter: "unknown" },
        error: "Узел ответил, но формат метрик не похож на node_exporter/windows_exporter",
      },
    };
  } catch (error) {
    return {
      result: {
        online: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Не удалось опросить exporter",
      },
    };
  }
}
