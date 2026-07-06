import { useEffect, useRef, useState, type FormEvent } from "react";
import { verifyPin } from "../utils/pin";

type PinModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: (pin: string) => void;
};

export function PinModal({ open, onClose, onSuccess }: PinModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin("");
      setError("");
      setChecking(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setChecking(true);
    setError("");

    const valid = await verifyPin(pin);
    setChecking(false);

    if (valid) {
      onSuccess(pin);
      onClose();
      return;
    }

    setError("Неверный PIN-код");
    setPin("");
    inputRef.current?.focus();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="pin-modal-title"
        aria-modal="true"
      >
        <h2 id="pin-modal-title" className="modal-title">
          Доступ к редактированию
        </h2>
        <p className="modal-text">Введите PIN-код для входа в режим редактирования.</p>
        <form onSubmit={handleSubmit} className="modal-form">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            className="field-input"
            placeholder="PIN-код"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            disabled={checking}
          />
          {error ? <p className="field-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary" disabled={checking}>
              {checking ? "Проверка…" : "Войти"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
