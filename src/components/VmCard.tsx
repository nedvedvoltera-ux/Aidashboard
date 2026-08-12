import { useEffect, useState, type FormEvent } from "react";
import { getVmStatus, VM_STATUS_LABELS, type VmHealthState, type VmNode } from "../types";

type VmCardProps = {
  vm: VmNode;
  health?: VmHealthState;
  editMode: boolean;
  onEdit: (vm: VmNode) => void;
  onDelete: (id: string) => void;
};

function formatCheckedAt(timestamp?: number) {
  if (!timestamp) {
    return null;
  }
  return new Date(timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatBytes(bytes?: number) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) {
    return null;
  }
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatUptime(seconds?: number) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) {
    return `${days} д ${hours} ч`;
  }
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} ч ${minutes} мин`;
  }
  return `${minutes} мин`;
}

const EXPORTER_LABELS: Record<string, string> = {
  node_exporter: "node_exporter (Linux)",
  windows_exporter: "windows_exporter (Windows)",
  unknown: "формат не распознан",
};

function MetricBar({ label, percent, detail }: { label: string; percent?: number; detail?: string | null }) {
  if (typeof percent !== "number" || Number.isNaN(percent)) {
    return null;
  }
  const clamped = Math.min(100, Math.max(0, percent));
  const level = clamped >= 90 ? "high" : clamped >= 70 ? "medium" : "low";

  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <div className="metric-bar-track">
        <div className={`metric-bar-fill metric-bar-${level}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="metric-value">
        {clamped.toFixed(0)}%{detail ? ` · ${detail}` : ""}
      </span>
    </div>
  );
}

export function VmCard({ vm, health, editMode, onEdit, onDelete }: VmCardProps) {
  const status = getVmStatus(vm, health);
  const checkedAt = formatCheckedAt(health?.checkedAt);
  const metrics = health?.metrics;

  return (
    <article className={`system-card ${health?.checking ? "is-checking" : ""}`}>
      <div className="system-card-header">
        <span
          className={`status-dot status-${status} ${health?.checking ? "is-pulsing" : ""}`}
          title={VM_STATUS_LABELS[status]}
        />
        <h3 className="system-name">{vm.name}</h3>
        {editMode ? (
          <div className="card-actions">
            <button type="button" className="text-btn" onClick={() => onEdit(vm)}>
              Изменить
            </button>
            <button type="button" className="text-btn text-btn-danger" onClick={() => onDelete(vm.id)}>
              Удалить
            </button>
          </div>
        ) : null}
      </div>
      {vm.host ? <p className="system-check-url">Хост: {vm.host}</p> : null}
      {vm.monitoringEnabled && vm.exporterUrl ? (
        <p className="system-check-url">Exporter: {vm.exporterUrl}</p>
      ) : null}
      {vm.description ? (
        <p className="system-description" title={vm.description}>
          {vm.description}
        </p>
      ) : null}

      {vm.monitoringEnabled && metrics && (metrics.cpuPercent !== undefined || metrics.memoryPercent !== undefined || metrics.diskPercent !== undefined) ? (
        <div className="metrics-block">
          <MetricBar label="CPU" percent={metrics.cpuPercent} />
          <MetricBar label="RAM" percent={metrics.memoryPercent} detail={formatBytes(metrics.memoryUsedBytes) && formatBytes(metrics.memoryTotalBytes) ? `${formatBytes(metrics.memoryUsedBytes)} / ${formatBytes(metrics.memoryTotalBytes)}` : undefined} />
          <MetricBar label="Диск" percent={metrics.diskPercent} detail={formatBytes(metrics.diskUsedBytes) && formatBytes(metrics.diskTotalBytes) ? `${formatBytes(metrics.diskUsedBytes)} / ${formatBytes(metrics.diskTotalBytes)}` : undefined} />
        </div>
      ) : null}

      <div className="system-card-footer">
        <span className={`status-badge status-${status}`}>{VM_STATUS_LABELS[status]}</span>
        {vm.monitoringEnabled && health && !health.checking ? (
          <span className="health-meta">
            {metrics?.exporter ? EXPORTER_LABELS[metrics.exporter] ?? metrics.exporter : null}
            {metrics?.uptimeSeconds !== undefined ? ` · uptime ${formatUptime(metrics.uptimeSeconds)}` : null}
            {typeof health.latencyMs === "number" ? ` · ${health.latencyMs} мс` : null}
            {checkedAt ? ` · ${checkedAt}` : null}
          </span>
        ) : null}
      </div>
      {editMode && health?.error && vm.monitoringEnabled && !health.checking ? (
        <p className="health-error">{health.error}</p>
      ) : null}
    </article>
  );
}

type VmFormProps = {
  initial?: VmNode;
  onSubmit: (data: Omit<VmNode, "id">) => void | Promise<void>;
  onCancel: () => void;
};

const EMPTY_FORM: Omit<VmNode, "id"> = {
  name: "",
  host: "",
  exporterUrl: "",
  description: "",
  monitoringEnabled: true,
};

export function VmForm({ initial, onSubmit, onCancel }: VmFormProps) {
  const [form, setForm] = useState<Omit<VmNode, "id">>(() => ({ ...EMPTY_FORM, ...(initial ?? {}) }));

  useEffect(() => {
    setForm(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
  }, [initial?.id]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      return;
    }
    if (form.monitoringEnabled && !form.exporterUrl.trim()) {
      return;
    }

    await onSubmit({
      name: form.name.trim(),
      host: form.host.trim(),
      exporterUrl: form.exporterUrl.trim(),
      description: form.description.trim(),
      monitoringEnabled: form.monitoringEnabled,
    });
  };

  return (
    <form className="system-form" onSubmit={handleSubmit}>
      <h3 className="form-title">{initial ? "Редактировать ВМ" : "Добавить виртуальную машину"}</h3>
      <label className="field">
        <span className="field-label">Название</span>
        <input
          className="field-input"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Например: Сервер 1С"
          required
        />
      </label>
      <label className="field">
        <span className="field-label">Хост / IP (для справки)</span>
        <input
          className="field-input"
          value={form.host}
          onChange={(event) => setForm((prev) => ({ ...prev, host: event.target.value }))}
          placeholder="192.168.1.10"
        />
      </label>
      <label className="field field-checkbox">
        <input
          type="checkbox"
          checked={form.monitoringEnabled}
          onChange={(event) => setForm((prev) => ({ ...prev, monitoringEnabled: event.target.checked }))}
        />
        <span>Включить мониторинг производительности</span>
      </label>
      {form.monitoringEnabled ? (
        <label className="field">
          <span className="field-label">Адрес метрик exporter'а</span>
          <input
            className="field-input"
            value={form.exporterUrl}
            onChange={(event) => setForm((prev) => ({ ...prev, exporterUrl: event.target.value }))}
            placeholder="http://192.168.1.10:9100/metrics"
          />
          <span className="field-hint">
            node_exporter (Linux, порт 9100) или windows_exporter (Windows, порт 9182). Дашборд сам определит тип
            и вычислит CPU/RAM/диск/uptime.
          </span>
        </label>
      ) : (
        <p className="field-hint">Мониторинг выключен — статус будет «Нет счётчика» (жёлтый).</p>
      )}
      <label className="field">
        <span className="field-label">Описание</span>
        <textarea
          className="field-input field-textarea"
          rows={2}
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
        />
      </label>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="btn btn-primary">
          {initial ? "Сохранить" : "Добавить"}
        </button>
      </div>
    </form>
  );
}
