import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function PromptModal({
  open,
  title,
  label,
  placeholder,
  hint,
  initialValue = '',
  confirmText = 'Create',
  onCancel,
  onConfirm,
}) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setSubmitting(false);
    }
  }, [open, initialValue]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(value.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="icon-btn sm" onClick={onCancel} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="form-label" htmlFor="modal-prompt-input">
              {label}
            </label>
            <input
              id="modal-prompt-input"
              type="text"
              className="input"
              placeholder={placeholder}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={submitting}
            />
            {hint && <p className="modal-hint">{hint}</p>}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!value.trim() || submitting}
            >
              {submitting ? 'Working…' : confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ConfirmDeleteModal({ open, item, onCancel, onConfirm }) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setSubmitting(false);
  }, [open]);

  if (!open || !item) return null;

  async function handleDelete() {
    setSubmitting(true);
    try {
      await onConfirm(item);
    } finally {
      setSubmitting(false);
    }
  }

  const isFolder = item.type === 'folder';

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm deletion"
      >
        <div className="modal-header">
          <h3 className="modal-title">Delete {isFolder ? 'folder' : 'note'}</h3>
          <button type="button" className="icon-btn sm" onClick={onCancel} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ margin: 0, lineHeight: 1.55 }}>
            Are you sure you want to permanently delete{' '}
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{item.path}</strong>?
            {isFolder && ' All notes and subfolders inside it will also be removed.'}
          </p>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={submitting}
          >
            {submitting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
