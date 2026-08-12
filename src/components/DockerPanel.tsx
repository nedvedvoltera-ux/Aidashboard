import type { DockerStatusPayload } from "../types";

type DockerPanelProps = {
  status: DockerStatusPayload | null;
  error: string | null;
};

function formatCreatedAt(createdAt?: number) {
  if (!createdAt) {
    return null;
  }
  return new Date(createdAt * 1000).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stateClass(state: string, health?: string) {
  if (health === "unhealthy") {
    return "offline";
  }
  if (state !== "running") {
    return "offline";
  }
  if (health === "starting") {
    return "checking";
  }
  return "online";
}

function stateLabel(state: string, health?: string) {
  if (health === "unhealthy") {
    return "Нездоров";
  }
  if (health === "healthy") {
    return "Работает, healthcheck OK";
  }
  if (health === "starting") {
    return "Запускается";
  }
  if (state === "running") {
    return "Работает";
  }
  if (state === "exited") {
    return "Остановлен";
  }
  if (state === "restarting") {
    return "Перезапускается";
  }
  return state;
}

export function DockerPanel({ status, error }: DockerPanelProps) {
  if (!status) {
    return <p className="loading-state">Загрузка статуса Docker…</p>;
  }

  if (!status.available) {
    return (
      <div className="banner banner-warning">
        Docker Engine API недоступен{status.connection ? ` (${status.connection})` : ""}
        {status.error ? `: ${status.error}` : ""}
        {error ? `. ${error}` : ""}
      </div>
    );
  }

  if (status.containers.length === 0) {
    return <p className="loading-state">Контейнеры не найдены.</p>;
  }

  return (
    <div className="docker-grid">
      {status.containers.map((container) => {
        const cls = stateClass(container.state, container.health);
        return (
          <article className="system-card docker-card" key={container.id}>
            <div className="system-card-header">
              <span className={`status-dot status-${cls}`} />
              <h3 className="system-name">{container.name}</h3>
            </div>
            <p className="system-check-url">{container.image}</p>
            <div className="system-card-footer">
              <span className={`status-badge status-${cls}`}>{stateLabel(container.state, container.health)}</span>
              <span className="health-meta">
                {container.status}
                {formatCreatedAt(container.createdAt) ? ` · создан ${formatCreatedAt(container.createdAt)}` : ""}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
