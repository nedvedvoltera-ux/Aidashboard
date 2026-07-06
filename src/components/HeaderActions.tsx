import type { Theme } from "../hooks/useStorage";

type HeaderActionsProps = {
  theme: Theme;
  editMode: boolean;
  onToggleTheme: () => void;
  onEditClick: () => void;
  onExitEdit: () => void;
};

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 14.5A8.5 8.5 0 1 1 9.5 3a6.5 6.5 0 0 0 11.5 11.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
        <path
          d="M8 11V8a4 4 0 0 1 8 0"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 11V8a4 4 0 0 1 7.5-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HeaderActions({
  theme,
  editMode,
  onToggleTheme,
  onEditClick,
  onExitEdit,
}: HeaderActionsProps) {
  return (
    <div className="header-actions">
      <button
        type="button"
        className="icon-btn"
        onClick={onToggleTheme}
        title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
      <button
        type="button"
        className={`icon-btn ${editMode ? "icon-btn-active" : ""}`}
        onClick={editMode ? onExitEdit : onEditClick}
        title={editMode ? "Выйти из редактирования" : "Редактирование"}
        aria-label={editMode ? "Выйти из режима редактирования" : "Войти в режим редактирования"}
      >
        <LockIcon open={editMode} />
      </button>
    </div>
  );
}
