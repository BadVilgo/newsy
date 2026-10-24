'use client';

import { useEffect, useRef } from 'react';

// Prosty modal potwierdzenia (role="alertdialog"). Fokus startuje na "Anuluj", żeby
// przypadkowy Enter/tap nie potwierdzał akcji nieodwracalnej. Escape i klik w tło zamykają.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      // Pułapka fokusu między dwoma przyciskami.
      if (e.key === 'Tab') {
        e.preventDefault();
        const next =
          document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current;
        next?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="modal-title">
          {title}
        </h2>
        <p id="confirm-message" className="modal-message">
          {message}
        </p>
        <div className="modal-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>
            Anuluj
          </button>
          <button ref={confirmRef} type="button" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
