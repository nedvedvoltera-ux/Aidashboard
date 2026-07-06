import http from "node:http";
import https from "node:https";
import net from "node:net";

const CHECK_TIMEOUT_MS = Number(process.env.HEALTH_CHECK_TIMEOUT_MS ?? 8_000);

export type HealthCheckMode = "http" | "tcp";

export type HealthProbeOptions = {
  mode?: HealthCheckMode;
  ignoreTlsErrors?: boolean;
};

export type HealthProbeResult = {
  online: boolean;
  latencyMs: number;
  statusCode?: number;
  error?: string;
};

type Endpoint = {
  hostname: string;
  port: number;
  path: string;
  secure: boolean;
};

function parseEndpoint(targetUrl: string): Endpoint {
  const parsed = new URL(targetUrl);
  const secure = parsed.protocol === "https:";
  const port = parsed.port
    ? Number(parsed.port)
    : secure
      ? 443
      : 80;

  if (!Number.isFinite(port)) {
    throw new Error("Invalid port in URL");
  }

  return {
    hostname: parsed.hostname,
    port,
    path: `${parsed.pathname}${parsed.search}`,
    secure,
  };
}

function requestHttp(
  endpoint: Endpoint,
  method: "HEAD" | "GET",
  ignoreTlsErrors: boolean,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const transport = endpoint.secure ? https : http;
    const request = transport.request(
      {
        protocol: endpoint.secure ? "https:" : "http:",
        hostname: endpoint.hostname,
        port: endpoint.port,
        path: endpoint.path || "/",
        method,
        rejectUnauthorized: endpoint.secure ? !ignoreTlsErrors : undefined,
        headers: {
          "User-Agent": "Aidashboard-HealthCheck/1.0",
          Accept: "*/*",
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );

    request.setTimeout(CHECK_TIMEOUT_MS, () => {
      request.destroy(new Error("Health check timeout"));
    });
    request.on("error", reject);
    request.end();
  });
}

function probeTcp(endpoint: Endpoint): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(
      {
        host: endpoint.hostname,
        port: endpoint.port,
      },
      () => {
        socket.end();
        resolve();
      },
    );

    socket.setTimeout(CHECK_TIMEOUT_MS, () => {
      socket.destroy(new Error("TCP check timeout"));
    });
    socket.on("error", reject);
  });
}

export async function probeUrl(
  targetUrl: string,
  options: HealthProbeOptions = {},
): Promise<HealthProbeResult> {
  const startedAt = Date.now();
  const mode = options.mode ?? "http";
  const ignoreTlsErrors = Boolean(options.ignoreTlsErrors);

  try {
    const endpoint = parseEndpoint(targetUrl);

    if (mode === "tcp") {
      await probeTcp(endpoint);
      return {
        online: true,
        latencyMs: Date.now() - startedAt,
      };
    }

    let statusCode = await requestHttp(endpoint, "HEAD", ignoreTlsErrors);

    if (statusCode === 405 || statusCode === 501) {
      statusCode = await requestHttp(endpoint, "GET", ignoreTlsErrors);
    }

    const latencyMs = Date.now() - startedAt;
    const online = statusCode >= 200 && statusCode < 400;

    return {
      online,
      latencyMs,
      statusCode,
      error: online ? undefined : `HTTP ${statusCode}`,
    };
  } catch (error) {
    return {
      online: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Health check failed",
    };
  }
}
