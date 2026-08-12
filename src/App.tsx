import { useMemo, useState } from "react";
import { HeaderActions } from "./components/HeaderActions";
import { PinModal } from "./components/PinModal";
import { SystemCard, SystemForm } from "./components/SystemCard";
import { VmCard, VmForm } from "./components/VmCard";
import { LlmCard, LlmForm } from "./components/LlmCard";
import { DockerPanel } from "./components/DockerPanel";
import { GuidePanel } from "./components/GuidePanel";
import { getSystemStatus, sortSystemsByStatus, useHealthMonitor } from "./hooks/useHealthMonitor";
import { useSystems } from "./hooks/useSystems";
import { useVms } from "./hooks/useVms";
import { useVmMonitor } from "./hooks/useVmMonitor";
import { useLlms } from "./hooks/useLlms";
import { useLlmMonitor } from "./hooks/useLlmMonitor";
import { useDockerStatus } from "./hooks/useDockerStatus";
import { useTheme } from "./hooks/useStorage";
import type { LlmService, System, VmNode } from "./types";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [editMode, setEditMode] = useState(false);
  const [editPin, setEditPin] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<System | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVm, setEditingVm] = useState<VmNode | null>(null);
  const [showAddVmForm, setShowAddVmForm] = useState(false);
  const [editingLlm, setEditingLlm] = useState<LlmService | null>(null);
  const [showAddLlmForm, setShowAddLlmForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [vmActionError, setVmActionError] = useState<string | null>(null);
  const [llmActionError, setLlmActionError] = useState<string | null>(null);

  const { systems, loading, error, addSystem, updateSystem, deleteSystem } = useSystems(editPin);
  const { healthById, refresh } = useHealthMonitor(systems);

  const { vms, loading: vmsLoading, error: vmsError, addVm, updateVm, deleteVm } = useVms(editPin);
  const { healthById: vmHealthById } = useVmMonitor(vms);

  const { llms, loading: llmsLoading, error: llmsError, addLlm, updateLlm, deleteLlm } = useLlms(editPin);
  const { healthById: llmHealthById } = useLlmMonitor(llms);

  const { status: dockerStatus, error: dockerError } = useDockerStatus();

  const stats = useMemo(() => {
    let online = 0;
    let offline = 0;
    let noCounter = 0;
    let checking = 0;

    for (const system of systems) {
      const status = getSystemStatus(system, healthById[system.id]);
      if (status === "online") {
        online += 1;
      } else if (status === "offline") {
        offline += 1;
      } else if (status === "checking") {
        checking += 1;
      } else {
        noCounter += 1;
      }
    }

    return { online, offline, noCounter, checking };
  }, [systems, healthById]);

  const sortedSystems = useMemo(
    () => sortSystemsByStatus(systems, healthById),
    [systems, healthById],
  );

  const handleEdit = (system: System) => {
    setEditingSystem(system);
    setShowAddForm(false);
    setActionError(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Удалить эту систему из списка?")) {
      return;
    }

    try {
      setActionError(null);
      await deleteSystem(id);
      if (editingSystem?.id === id) {
        setEditingSystem(null);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось удалить систему");
    }
  };

  const handleEditVm = (vm: VmNode) => {
    setEditingVm(vm);
    setShowAddVmForm(false);
    setVmActionError(null);
  };

  const handleDeleteVm = async (id: string) => {
    if (!window.confirm("Удалить эту ВМ из списка?")) {
      return;
    }

    try {
      setVmActionError(null);
      await deleteVm(id);
      if (editingVm?.id === id) {
        setEditingVm(null);
      }
    } catch (err) {
      setVmActionError(err instanceof Error ? err.message : "Не удалось удалить ВМ");
    }
  };

  const handleEditLlm = (llm: LlmService) => {
    setEditingLlm(llm);
    setShowAddLlmForm(false);
    setLlmActionError(null);
  };

  const handleDeleteLlm = async (id: string) => {
    if (!window.confirm("Удалить этот LLM-сервис из списка?")) {
      return;
    }

    try {
      setLlmActionError(null);
      await deleteLlm(id);
      if (editingLlm?.id === id) {
        setEditingLlm(null);
      }
    } catch (err) {
      setLlmActionError(err instanceof Error ? err.message : "Не удалось удалить LLM-сервис");
    }
  };

  const exitEditMode = () => {
    setEditMode(false);
    setEditPin(null);
    setEditingSystem(null);
    setShowAddForm(false);
    setActionError(null);
    setEditingVm(null);
    setShowAddVmForm(false);
    setVmActionError(null);
    setEditingLlm(null);
    setShowAddLlmForm(false);
    setLlmActionError(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div>
            <p className="eyebrow">Корпоративный контур</p>
            <h1 className="page-title">Системы и сервисы</h1>
            <p className="page-subtitle">
              Единый дашборд доступности внутренних платформ компании с HTTP health-check.
            </p>
          </div>
          <div className="header-side">
            <button type="button" className="btn btn-ghost refresh-btn" onClick={refresh}>
              Обновить статусы
            </button>
            <HeaderActions
              theme={theme}
              editMode={editMode}
              onToggleTheme={toggleTheme}
              onEditClick={() => setPinOpen(true)}
              onExitEdit={exitEditMode}
            />
          </div>
        </div>
        <div className="stats-row">
          <div className="stat-chip">
            <span className="status-dot status-online" />
            <span>{stats.online} онлайн</span>
          </div>
          <div className="stat-chip">
            <span className="status-dot status-offline" />
            <span>{stats.offline} офлайн</span>
          </div>
          {stats.checking > 0 ? (
            <div className="stat-chip">
              <span className="status-dot status-checking is-pulsing" />
              <span>{stats.checking} проверяется</span>
            </div>
          ) : null}
          <div className="stat-chip">
            <span className="status-dot status-no-counter" />
            <span>{stats.noCounter} без счётчика</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {error ? <div className="banner banner-error">{error}</div> : null}
        {actionError ? <div className="banner banner-error">{actionError}</div> : null}

        {editMode ? (
          <section className="edit-panel">
            {showAddForm ? (
              <SystemForm
                onSubmit={async (data) => {
                  try {
                    setActionError(null);
                    await addSystem(data);
                    setShowAddForm(false);
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : "Не удалось добавить систему");
                  }
                }}
                onCancel={() => setShowAddForm(false)}
              />
            ) : editingSystem ? (
              <SystemForm
                key={editingSystem.id}
                initial={editingSystem}
                onSubmit={async (data) => {
                  try {
                    setActionError(null);
                    await updateSystem(editingSystem.id, data);
                    setEditingSystem(null);
                  } catch (err) {
                    setActionError(err instanceof Error ? err.message : "Не удалось сохранить систему");
                  }
                }}
                onCancel={() => setEditingSystem(null)}
              />
            ) : (
              <div className="edit-toolbar">
                <p className="edit-hint">
                  Режим редактирования активен. Изменения сохраняются на сервере и видны всем в сети.
                </p>
                <button type="button" className="btn btn-primary" onClick={() => setShowAddForm(true)}>
                  + Добавить систему
                </button>
              </div>
            )}
          </section>
        ) : null}

        {loading ? (
          <p className="loading-state">Загрузка списка систем…</p>
        ) : (
          <section className="systems-grid">
            {sortedSystems.map((system) => (
              <SystemCard
                key={system.id}
                system={system}
                health={healthById[system.id]}
                editMode={editMode}
                onEdit={handleEdit}
                onDelete={(id) => {
                  void handleDelete(id);
                }}
              />
            ))}
          </section>
        )}

        {editMode ? (
        <details className="new-sections-spoiler">
          <summary className="new-sections-summary">
            Новые разделы мониторинга: ВМ, LLM-сервисы, Docker
          </summary>
          <div className="new-sections-body">
        <section className="section-block">
          <div className="section-header">
            <div>
              <h2 className="section-title">Виртуальные машины</h2>
              <p className="section-subtitle">
                Мониторинг производительности узлов: CPU, память, диск и время работы.
              </p>
            </div>
            {editMode ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setShowAddVmForm(true);
                  setEditingVm(null);
                }}
              >
                + Добавить ВМ
              </button>
            ) : null}
          </div>

          <GuidePanel title="Как подключить реальную виртуальную машину">
            <ol>
              <li>
                Установите на сервере агент сбора метрик Prometheus: <strong>node_exporter</strong> для Linux
                (порт по умолчанию <code>9100</code>) или <strong>windows_exporter</strong> для Windows (порт
                по умолчанию <code>9182</code>). Оба — бесплатные однофайловые агенты, ничего кроме них
                устанавливать не нужно.
              </li>
              <li>Откройте этот порт в файрволе ВМ для доступа с сервера, где работает дашборд.</li>
              <li>
                Нажмите «+ Добавить ВМ», укажите название и полный адрес метрик, например{" "}
                <code>http://192.168.1.10:9100/metrics</code> (Linux) или{" "}
                <code>http://192.168.1.10:9182/metrics</code> (Windows).
              </li>
              <li>
                Дашборд сам определит тип агента и начнёт опрашивать его каждые 30 секунд, показывая
                загрузку CPU, памяти, диска и время работы. Статус «Высокая нагрузка» появляется, когда
                любой из показателей достигает 85% и выше.
              </li>
            </ol>
            <p className="field-hint">
              Дополнительно на сервере дашборда ничего ставить не нужно — метрики забираются напрямую по HTTP.
            </p>
          </GuidePanel>

          {vmsError ? <div className="banner banner-error">{vmsError}</div> : null}
          {vmActionError ? <div className="banner banner-error">{vmActionError}</div> : null}

          {editMode ? (
            <section className="edit-panel">
              {showAddVmForm ? (
                <VmForm
                  onSubmit={async (data) => {
                    try {
                      setVmActionError(null);
                      await addVm(data);
                      setShowAddVmForm(false);
                    } catch (err) {
                      setVmActionError(err instanceof Error ? err.message : "Не удалось добавить ВМ");
                    }
                  }}
                  onCancel={() => setShowAddVmForm(false)}
                />
              ) : editingVm ? (
                <VmForm
                  key={editingVm.id}
                  initial={editingVm}
                  onSubmit={async (data) => {
                    try {
                      setVmActionError(null);
                      await updateVm(editingVm.id, data);
                      setEditingVm(null);
                    } catch (err) {
                      setVmActionError(err instanceof Error ? err.message : "Не удалось сохранить ВМ");
                    }
                  }}
                  onCancel={() => setEditingVm(null)}
                />
              ) : null}
            </section>
          ) : null}

          {vmsLoading ? (
            <p className="loading-state">Загрузка списка ВМ…</p>
          ) : (
            <section className="systems-grid">
              {vms.map((vm) => (
                <VmCard
                  key={vm.id}
                  vm={vm}
                  health={vmHealthById[vm.id]}
                  editMode={editMode}
                  onEdit={handleEditVm}
                  onDelete={(id) => {
                    void handleDeleteVm(id);
                  }}
                />
              ))}
            </section>
          )}
        </section>

        <section className="section-block">
          <div className="section-header">
            <div>
              <h2 className="section-title">LLM-сервисы</h2>
              <p className="section-subtitle">Проверка того, что языковая модель отвечает и готова к работе.</p>
            </div>
            {editMode ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setShowAddLlmForm(true);
                  setEditingLlm(null);
                }}
              >
                + Добавить LLM-сервис
              </button>
            ) : null}
          </div>

          <GuidePanel title="Как подключить реальный LLM-сервис">
            <ol>
              <li>
                У сервиса должен быть HTTP API: <strong>OpenAI-совместимый</strong> (vLLM, LM Studio,
                text-generation-webui, LocalAI и т.п.) — дашборд проверяет <code>GET /v1/models</code>;{" "}
                <strong>Ollama</strong> — проверяется <code>GET /api/tags</code>; либо выберите «Свой путь» и
                укажите endpoint, отвечающий 200 OK, когда сервис готов принимать запросы.
              </li>
              <li>
                Укажите базовый адрес без пути, например <code>http://192.168.1.20:11434</code> (Ollama) или{" "}
                <code>http://192.168.1.20:8000</code> (vLLM/OpenAI-совместимый API).
              </li>
              <li>
                Если API требует ключ — не вводите сам ключ в форму. Задайте переменную окружения с ключом на
                сервере дашборда (например, в <code>docker-compose.yml</code> или <code>.env</code>) и впишите
                в поле формы только её имя, например <code>OPENAI_API_KEY</code>. Ключ никогда не сохраняется
                в файле сервисов и не отображается в интерфейсе.
              </li>
              <li>
                Статус «Онлайн» означает, что сервис ответил и вернул список моделей — то есть LLM
                действительно готова обрабатывать запросы, а не просто что порт открыт.
              </li>
            </ol>
            <p className="field-hint">
              Для on-prem <strong>Qwen</strong>: если модель раздаётся через <strong>vLLM</strong>,{" "}
              <strong>SGLang</strong> или <strong>Xinference</strong> — выбирайте «OpenAI-совместимый API»,
              обычно порт <code>8000</code>. Если через <strong>Ollama</strong> (например, тег{" "}
              <code>qwen2.5:72b</code>) — выбирайте «Ollama», порт <code>11434</code>. Поле «Модель» — просто
              для справки в карточке, на проверку не влияет.
            </p>
            <p className="field-hint">
              Если в компании несколько LLM-сервисов (разные модели, разные серверы, разные способы раздачи) —
              добавьте отдельную карточку на каждый через «+ Добавить LLM-сервис». Ограничений по количеству
              нет, у каждой карточки — свой адрес, свой тип проверки и свой статус.
            </p>
          </GuidePanel>

          {llmsError ? <div className="banner banner-error">{llmsError}</div> : null}
          {llmActionError ? <div className="banner banner-error">{llmActionError}</div> : null}

          {editMode ? (
            <section className="edit-panel">
              {showAddLlmForm ? (
                <LlmForm
                  onSubmit={async (data) => {
                    try {
                      setLlmActionError(null);
                      await addLlm(data);
                      setShowAddLlmForm(false);
                    } catch (err) {
                      setLlmActionError(err instanceof Error ? err.message : "Не удалось добавить LLM-сервис");
                    }
                  }}
                  onCancel={() => setShowAddLlmForm(false)}
                />
              ) : editingLlm ? (
                <LlmForm
                  key={editingLlm.id}
                  initial={editingLlm}
                  onSubmit={async (data) => {
                    try {
                      setLlmActionError(null);
                      await updateLlm(editingLlm.id, data);
                      setEditingLlm(null);
                    } catch (err) {
                      setLlmActionError(err instanceof Error ? err.message : "Не удалось сохранить LLM-сервис");
                    }
                  }}
                  onCancel={() => setEditingLlm(null)}
                />
              ) : null}
            </section>
          ) : null}

          {llmsLoading ? (
            <p className="loading-state">Загрузка списка LLM-сервисов…</p>
          ) : (
            <section className="systems-grid">
              {llms.map((llm) => (
                <LlmCard
                  key={llm.id}
                  llm={llm}
                  health={llmHealthById[llm.id]}
                  editMode={editMode}
                  onEdit={handleEditLlm}
                  onDelete={(id) => {
                    void handleDeleteLlm(id);
                  }}
                />
              ))}
            </section>
          )}
        </section>

        <section className="section-block">
          <div className="section-header">
            <div>
              <h2 className="section-title">Docker</h2>
              <p className="section-subtitle">
                Состояние контейнеров на сервере дашборда: работает / остановлен / healthcheck.
              </p>
            </div>
          </div>

          <GuidePanel title="Как подключить мониторинг Docker" defaultOpen={!dockerStatus?.available}>
            <ul>
              <li>
                Если дашборд запущен через <code>docker compose</code>: добавьте в <code>docker-compose.yml</code>{" "}
                монтирование сокета <code>/var/run/docker.sock:/var/run/docker.sock:ro</code> и перезапустите{" "}
                <code>docker compose up -d --build</code>. Сокет монтируется только на чтение — дашборд не может
                останавливать или перезапускать контейнеры, только смотрит их статус.
              </li>
              <li>
                Если дашборд запущен на Windows напрямую (<code>npm run dev</code> / <code>npm start</code>) и
                локально установлен Docker Desktop — подключение к именованному каналу произойдёт автоматически.
              </li>
              <li>
                Чтобы мониторить Docker на другой машине удалённо: включите на ней TCP-доступ к Docker Engine
                API (только в защищённой сети/VPN!) и укажите на сервере дашборда переменную окружения{" "}
                <code>DOCKER_HOST=tcp://адрес:2375</code>.
              </li>
            </ul>
          </GuidePanel>

          {dockerError ? <div className="banner banner-error">{dockerError}</div> : null}

          <DockerPanel status={dockerStatus} error={dockerError} />
        </section>
          </div>
        </details>
        ) : null}
      </main>

      <PinModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onSuccess={(pin) => {
          setEditPin(pin);
          setEditMode(true);
        }}
      />
    </div>
  );
}
