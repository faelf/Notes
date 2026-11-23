import React, { useMemo } from 'react';
import { renderMarkdown } from '../utils/markdown.js';

export function PreviewPane({ content, onToggleCheckbox, onOpenWikilink }) {
  const { frontmatter, html } = useMemo(() => renderMarkdown(content), [content]);

  function handleClick(e) {
    const copyBtn = e.target.closest('button[data-copy-code]');
    if (copyBtn) {
      const rawCode = decodeURIComponent(copyBtn.getAttribute('data-copy-code') || '');
      navigator.clipboard?.writeText(rawCode).then(() => {
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 1400);
      });
      return;
    }

    const wikiLink = e.target.closest('a[data-wikilink]');
    if (wikiLink) {
      e.preventDefault();
      const target = wikiLink.getAttribute('data-wikilink');
      if (target) onOpenWikilink(target);
      return;
    }

    const checkbox = e.target.closest('input.task-checkbox');
    if (checkbox) {
      const idx = Number.parseInt(checkbox.getAttribute('data-task-index') || '-1', 10);
      if (idx >= 0) {
        onToggleCheckbox(idx);
      }
    }
  }

  return (
    <div className="pane pane-preview" onClick={handleClick}>
      <div className="preview-inner">
        {frontmatter && (
          <div className="frontmatter-card" aria-label="Note properties">
            {frontmatter.map((item, idx) => (
              <div className="frontmatter-item" key={`${item.key}-${idx}`}>
                <span className="frontmatter-key">{item.key}:</span>
                <span className="frontmatter-value">{item.value}</span>
              </div>
            ))}
          </div>
        )}
        <article
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
