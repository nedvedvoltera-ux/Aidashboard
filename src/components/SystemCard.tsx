import { useState, useEffect, type FormEvent } from "react";
import { STATUS_LABELS, type HealthState, type System } from "../types";
import { getSystemStatus } from "../hooks/useHealthMonitor";

type SystemCardProps = {
  system: System;
  health?: HealthState;
  editMode: boolean;
  onEdit: (system: System) => void;
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

export function SystemCard({ system, health, editMode, onEdit, onDelete }: SystemCardProps) {
  const status = getSystemStatus(system, health);
  const checkedAt = formatCheckedAt(health?.checkedAt);

  return (
    <article className={`system-card ${health?.checking ? "is-checking" : ""}`}>
      <div className="system-card-header">
        <span
          className={`status-dot status-${status} ${health?.checking ? "is-pulsing" : ""}`}
          title={STATUS_LABELS[status]}
        />
        <h3 className="system-name">{system.name}</h3>
        {editMode ? (
          <div className="card-actions">
            <button type="button" className="text-btn" onClick={() => onEdit(system)}>
              Изменить
            </button>
            <button type="button" className="text-btn text-btn-danger" onClick={() => onDelete(system.id)}>
              Удалить
            </button>
          </div>
        ) : null}
      </div>
      <a className="system-link" href={system.url} target="_blank" rel="noopener noreferrer">
        {system.url}
      </a>
      {system.monitoringEnabled && system.checkUrl.trim() && system.checkUrl.trim() !== system.url ? (
        <p className="system-check-url">Проверка: {system.checkUrl}</p>
      ) : null}
      {system.description ? (
        <p className="system-description" title={system.description}>
          {system.description}
        </p>
      ) : null}
      <div className="system-card-footer">
        <span className={`status-badge status-${status}`}>{STATUS_LABELS[status]}</span>
        {system.monitoringEnabled && health && !health.checking ? (
          <span className="health-meta">
            {typeof health.latencyMs === "number" ? `${health.latencyMs} мс` : null}
            {health.statusCode ? ` · HTTP ${health.statusCode}` : null}
            {checkedAt ? ` · ${checkedAt}` : null}
          </span>
        ) : null}
      </div>
      {editMode && health?.error && system.monitoringEnabled && !health.checking ? (
        <p className="health-error">{health.error}</p>
      ) : null}
    </article>
  );
}

type SystemFormProps = {
  initial?: System;
  onSubmit: (data: Omit<System, "id">) => void | Promise<void>;
  onCancel: () => void;
};

const EMPTY_FORM: Omit<System, "id"> = {
  name: "",
  url: "",
  description: "",
  monitoringEnabled: true,
  checkUrl: "",
  checkMode: "http",
  ignoreTlsErrors: false,
};

export function SystemForm({ initial, onSubmit, onCancel }: SystemFormProps) {
  const [form, setForm] = useState<Omit<System, "id">>(() => ({
    ...EMPTY_FORM,
    ...(initial ?? {}),
    checkMode: initial?.checkMode === "tcp" ? "tcp" : "http",
    ignoreTlsErrors: Boolean(initial?.ignoreTlsErrors),
  }));

  useEffect(() => {
    if (!initial) {
      setForm(EMPTY_FORM);
      return;
    }

    setForm({
      ...EMPTY_FORM,
      ...initial,
      checkMode: initial.checkMode === "tcp" ? "tcp" : "http",
      ignoreTlsErrors: Boolean(initial.ignoreTlsErrors),
    });
  }, [initial?.id]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.url.trim()) {
      return;
    }

    if (form.monitoringEnabled && !form.checkUrl.trim() && !form.url.trim()) {
      return;
    }

    await onSubmit({
      name: form.name.trim(),
      url: form.url.trim(),
      description: form.description.trim(),
      monitoringEnabled: form.monitoringEnabled,
      checkUrl: form.checkUrl.trim(),
      checkMode: form.checkMode,
      ignoreTlsErrors: form.ignoreTlsErrors,
    });
  };

  return (
    <form className="system-form" onSubmit={handleSubmit}>
      <h3 className="form-title">{initial ? "Редактировать систему" : "Добавить систему"}</h3>
      <label className="field">
        <span className="field-label">Название</span>
        <input
          className="field-input"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
      </label>
      <label className="field">
        <span className="field-label">Адрес (ссылка)</span>
        <input
          className="field-input"
          type="url"
          value={form.url}
          onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
          placeholder="https://"
          required
        />
      </label>
      <label className="field">
        <span className="field-label">Описание</span>
        <textarea
          className="field-input field-textarea"
          rows={3}
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
        />
      </label>
      <label className="field field-checkbox">
        <input
          type="checkbox"
          checked={form.monitoringEnabled}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, monitoringEnabled: event.target.checked }))
          }
        />
        <span>Включить мониторинг доступности</span>
      </label>
      {form.monitoringEnabled ? (
        <>
          <label className="field">
            <span className="field-label">URL для проверки (health-check)</span>
            <input
              className="field-input"
              type="url"
              value={form.checkUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, checkUrl: event.target.value }))}
              placeholder={form.url || "https://192.168.215.44:8443/health"}
            />
            <span className="field-hint">
              Если поле пустое — используется основная ссылка.
            </span>
          </label>
          <label className="field">
            <span className="field-label">Тип проверки</span>
            <select
              className="field-input"
              value={form.checkMode}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  checkMode: event.target.value === "tcp" ? "tcp" : "http",
                }))
              }
            >
              <option value="http">HTTP(S) — проверка ответа сервера</option>
              <option value="tcp">TCP — только доступность порта</option>
            </select>
          </label>
          {form.checkMode === "http" ? (
            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={form.ignoreTlsErrors}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, ignoreTlsErrors: event.target.checked }))
                }
              />
              <span>Игнорировать ошибки SSL/TLS (самоподписанный сертификат)</span>
            </label>
          ) : (
            <p className="field-hint">
              TCP-проверка подключается к хосту и порту из URL, без проверки сертификата.
            </p>
          )}
        </>
      ) : (
        <p className="field-hint">Мониторинг выключен — статус будет «Нет счётчика» (жёлтый).</p>
      )}
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
