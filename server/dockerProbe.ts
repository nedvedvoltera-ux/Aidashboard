import http from "node:http";

const DOCKER_TIMEOUT_MS = Number(process.env.DOCKER_PROBE_TIMEOUT_MS ?? 6_000);

export type DockerContainerStatus = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health?: string;
  createdAt?: number;
};

export type DockerProbeResult = {
  available: boolean;
  containers: DockerContainerStatus[];
  error?: string;
  connection?: string;
};

type DockerConnection =
  | { kind: "socket"; socketPath: string }
  | { kind: "tcp"; host: string; port: number };

function resolveConnection(): DockerConnection {
  const dockerHost = process.env.DOCKER_HOST?.trim();

  if (dockerHost?.startsWith("tcp://")) {
    const parsed = new URL(dockerHost.replace("tcp://", "http://"));
    return { kind: "tcp", host: parsed.hostname, port: Number(parsed.port || 2375) };
  }

  const explicitSocket = process.env.DOCKER_SOCKET_PATH?.trim();
  if (explicitSocket) {
    return { kind: "socket", socketPath: explicitSocket };
  }

  const defaultSocket = process.platform === "win32" ? "\\\\.\\pipe\\docker_engine" : "/var/run/docker.sock";
  return { kind: "socket", socketPath: defaultSocket };
}

function describeConnection(connection: DockerConnection): string {
  return connection.kind === "socket" ? connection.socketPath : `tcp://${connection.host}:${connection.port}`;
}

function requestDockerApi(pathAndQuery: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const connection = resolveConnection();

    const options: http.RequestOptions =
      connection.kind === "socket"
        ? { socketPath: connection.socketPath, path: pathAndQuery, method: "GET", headers: { Accept: "application/json" } }
        : { host: connection.host, port: connection.port, path: pathAndQuery, method: "GET", headers: { Accept: "application/json" } };

    const request = http.request(options, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({ statusCode: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
      );
      response.on("error", reject);
    });

    request.setTimeout(DOCKER_TIMEOUT_MS, () => {
      request.destroy(new Error("Таймаут запроса к Docker Engine API"));
    });
    request.on("error", reject);
    request.end();
  });
}

function parseHealthFromStatus(status: string): string | undefined {
  const match = status.match(/\((healthy|unhealthy|starting)\)/i);
  return match ? match[1].toLowerCase() : undefined;
}

export async function probeDocker(): Promise<DockerProbeResult> {
  const connection = resolveConnection();
  const connectionLabel = describeConnection(connection);

  try {
    const { statusCode, body } = await requestDockerApi("/containers/json?all=1");

    if (statusCode < 200 || statusCode >= 300) {
      return {
        available: false,
        containers: [],
        error: `Docker Engine API вернул HTTP ${statusCode}`,
        connection: connectionLabel,
      };
    }

    const parsed = JSON.parse(body) as Array<Record<string, unknown>>;
    const containers: DockerContainerStatus[] = parsed.map((item) => {
      const names = Array.isArray(item.Names) ? (item.Names as string[]) : [];
      const status = typeof item.Status === "string" ? item.Status : "";
      const rawId = typeof item.Id === "string" ? item.Id : "";

      return {
        id: rawId.slice(0, 12),
        name: (names[0] ?? "").replace(/^\//, "") || rawId.slice(0, 12) || "—",
        image: typeof item.Image === "string" ? item.Image : "",
        state: typeof item.State === "string" ? item.State : "unknown",
        status,
        health: parseHealthFromStatus(status),
        createdAt: typeof item.Created === "number" ? item.Created : undefined,
      };
    });

    containers.sort((a, b) => a.name.localeCompare(b.name, "ru"));

    return { available: true, containers, connection: connectionLabel };
  } catch (error) {
    return {
      available: false,
      containers: [],
      error: error instanceof Error ? error.message : "Docker Engine API недоступен",
      connection: connectionLabel,
    };
  }
}
