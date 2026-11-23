import React, { useEffect, useState } from 'react';
import { Search, FileText, X } from 'lucide-react';
import { api } from '../api.js';

export function QuickSwitcher({ open, onClose, onSelectFile }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.search(query);
        if (!cancelled) {
          setResults(data.results || []);
          setSelectedIndex(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 120 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  if (!open) return null;

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      onSelectFile(results[selectedIndex].path);
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card switcher-card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Search notes"
      >
        <div className="switcher-input-wrap">
          <Search size={16} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
          <input
            type="text"
            className="switcher-input"
            placeholder="Search note titles or full text…"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="switcher-results">
          {loading && results.length === 0 ? (
            <div className="tree-empty">Searching…</div>
          ) : results.length === 0 ? (
            <div className="tree-empty">No matching notes found.</div>
          ) : (
            results.map((item, idx) => (
              <button
                key={item.path}
                type="button"
                className={`switcher-item${idx === selectedIndex ? ' selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={() => {
                  onSelectFile(item.path);
                  onClose();
                }}
              >
                <div className="switcher-item-top">
                  <span className="switcher-item-title">
                    <FileText size={14} style={{ color: 'var(--fg-muted)' }} />
                    {item.title}
                  </span>
                  <span className="switcher-item-path">{item.path}</span>
                </div>
                {item.snippet && <div className="switcher-item-snippet">{item.snippet}</div>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
