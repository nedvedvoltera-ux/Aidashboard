import { useEffect, useState, type FormEvent } from "react";
import { getLlmStatus, STATUS_LABELS, type LlmHealthState, type LlmService } from "../types";

type LlmCardProps = {
  llm: LlmService;
  health?: LlmHealthState;
  editMode: boolean;
  onEdit: (llm: LlmService) => void;
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

const PROBE_MODE_LABELS: Record<string, string> = {
  openai: "OpenAI-совместимый API",
  ollama: "Ollama",
  custom: "Свой путь",
};

export function LlmCard({ llm, health, editMode, onEdit, onDelete }: LlmCardProps) {
  const status = getLlmStatus(llm, health);
  const checkedAt = formatCheckedAt(health?.checkedAt);

  return (
    <article className={`system-card ${health?.checking ? "is-checking" : ""}`}>
      <div className="system-card-header">
        <span
          className={`status-dot status-${status} ${health?.checking ? "is-pulsing" : ""}`}
          title={STATUS_LABELS[status]}
        />
        <h3 className="system-name">{llm.name}</h3>
        {editMode ? (
          <div className="card-actions">
            <button type="button" className="text-btn" onClick={() => onEdit(llm)}>
              Изменить
            </button>
            <button type="button" className="text-btn text-btn-danger" onClick={() => onDelete(llm.id)}>
              Удалить
            </button>
          </div>
        ) : null}
      </div>
      {llm.baseUrl ? <p className="system-check-url">Адрес: {llm.baseUrl}</p> : null}
      {llm.model ? <p className="system-check-url">Модель: {llm.model}</p> : null}
      {llm.description ? (
        <p className="system-description" title={llm.description}>
          {llm.description}
        </p>
      ) : null}
      <div className="system-card-footer">
        <span className={`status-badge status-${status}`}>{STATUS_LABELS[status]}</span>
        {llm.monitoringEnabled && health && !health.checking ? (
          <span className="health-meta">
            {PROBE_MODE_LABELS[llm.probeMode]}
            {typeof health.modelsCount === "number" ? ` · ${health.modelsCount} модел${health.modelsCount === 1 ? "ь" : "и"}` : null}
            {typeof health.latencyMs === "number" ? ` · ${health.latencyMs} мс` : null}
            {checkedAt ? ` · ${checkedAt}` : null}
          </span>
        ) : null}
      </div>
      {health?.models && health.models.length > 0 ? (
        <p className="system-check-url">Модели: {health.models.join(", ")}</p>
      ) : null}
      {editMode && health?.error && llm.monitoringEnabled && !health.checking ? (
        <p className="health-error">{health.error}</p>
      ) : null}
    </article>
  );
}

type LlmFormProps = {
  initial?: LlmService;
  onSubmit: (data: Omit<LlmService, "id">) => void | Promise<void>;
  onCancel: () => void;
};

const EMPTY_FORM: Omit<LlmService, "id"> = {
  name: "",
  baseUrl: "",
  model: "",
  probeMode: "openai",
  apiKeyEnv: "",
  customPath: "",
  description: "",
  monitoringEnabled: true,
};

export function LlmForm({ initial, onSubmit, onCancel }: LlmFormProps) {
  const [form, setForm] = useState<Omit<LlmService, "id">>(() => ({ ...EMPTY_FORM, ...(initial ?? {}) }));

  useEffect(() => {
    setForm(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM);
  }, [initial?.id]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      return;
    }
    if (form.monitoringEnabled && !form.baseUrl.trim()) {
      return;
    }

    await onSubmit({
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      model: form.model.trim(),
      probeMode: form.probeMode,
      apiKeyEnv: form.apiKeyEnv.trim(),
      customPath: form.customPath.trim(),
      description: form.description.trim(),
      monitoringEnabled: form.monitoringEnabled,
    });
  };

  return (
    <form className="system-form" onSubmit={handleSubmit}>
      <h3 className="form-title">{initial ? "Редактировать LLM-сервис" : "Добавить LLM-сервис"}</h3>
      <label className="field">
        <span className="field-label">Название</span>
        <input
          className="field-input"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Например: Локальный Llama 3"
          required
        />
      </label>
      <label className="field">
        <span className="field-label">Модель (для справки)</span>
        <input
          className="field-input"
          value={form.model}
          onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
          placeholder="llama3, gpt-4o-mini…"
        />
      </label>
      <label className="field field-checkbox">
        <input
          type="checkbox"
          checked={form.monitoringEnabled}
          onChange={(event) => setForm((prev) => ({ ...prev, monitoringEnabled: event.target.checked }))}
        />
        <span>Включить мониторинг доступности</span>
      </label>
      {form.monitoringEnabled ? (
        <>
          <label className="field">
            <span className="field-label">Базовый адрес сервиса</span>
            <input
              className="field-input"
              value={form.baseUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
              placeholder="http://192.168.1.20:11434"
            />
            <span className="field-hint">Без пути в конце — путь проверки добавляется автоматически.</span>
          </label>
          <label className="field">
            <span className="field-label">Тип проверки</span>
            <select
              className="field-input"
              value={form.probeMode}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  probeMode: event.target.value === "ollama" ? "ollama" : event.target.value === "custom" ? "custom" : "openai",
                }))
              }
            >
              <option value="openai">OpenAI-совместимый API (GET /v1/models)</option>
              <option value="ollama">Ollama (GET /api/tags)</option>
              <option value="custom">Свой путь</option>
            </select>
          </label>
          {form.probeMode === "custom" ? (
            <label className="field">
              <span className="field-label">Путь проверки</span>
              <input
                className="field-input"
                value={form.customPath}
                onChange={(event) => setForm((prev) => ({ ...prev, customPath: event.target.value }))}
                placeholder="/healthz"
              />
            </label>
          ) : null}
          <label className="field">
            <span className="field-label">Переменная окружения с API-ключом (необязательно)</span>
            <input
              className="field-input"
              value={form.apiKeyEnv}
              onChange={(event) => setForm((prev) => ({ ...prev, apiKeyEnv: event.target.value }))}
              placeholder="OPENAI_API_KEY"
            />
            <span className="field-hint">
              Впишите только ИМЯ переменной окружения на сервере дашборда — сам ключ сюда вводить не нужно и он
              никогда не сохраняется в файле сервисов.
            </span>
          </label>
        </>
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
