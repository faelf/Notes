import React from 'react';

export function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type || 'info'}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
