import { useMemo, useState } from "react";
import { HeaderActions } from "./components/HeaderActions";
import { PinModal } from "./components/PinModal";
import { SystemCard, SystemForm } from "./components/SystemCard";
import { getSystemStatus, sortSystemsByStatus, useHealthMonitor } from "./hooks/useHealthMonitor";
import { useSystems } from "./hooks/useSystems";
import { useTheme } from "./hooks/useStorage";
import type { System } from "./types";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [editMode, setEditMode] = useState(false);
  const [editPin, setEditPin] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<System | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { systems, loading, error, addSystem, updateSystem, deleteSystem } = useSystems(editPin);
  const { healthById, refresh } = useHealthMonitor(systems);

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

  const exitEditMode = () => {
    setEditMode(false);
    setEditPin(null);
    setEditingSystem(null);
    setShowAddForm(false);
    setActionError(null);
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
