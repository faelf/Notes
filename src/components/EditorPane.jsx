import React, { useMemo, useRef } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Code,
  FileCode,
  Link,
  List,
  CheckSquare,
  Quote,
  Table,
  Save,
} from 'lucide-react';
import { PreviewPane } from './PreviewPane.jsx';
import { formatShortcut } from './ShortcutKey.jsx';
import { toggleMarkdownCheckbox } from '../utils/markdown.js';

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function EditorPane({
  content,
  updatedAt,
  viewMode,
  autoSave,
  onToggleAutoSave,
  saveStatus,
  onChangeContent,
  onSaveNow,
  onOpenWikilink,
}) {
  const textareaRef = useRef(null);

  const stats = useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = content.length;
    const lines = content ? content.split('\n').length : 0;
    return { words, chars, lines };
  }, [content]);

  function applyWrap(prefix, suffix = prefix, placeholder = 'text') {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const next = `${content.slice(0, start)}${prefix}${selected}${suffix}${content.slice(end)}`;
    onChangeContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  function applyLinePrefix(prefix) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const next = `${content.slice(0, lineStart)}${prefix}${content.slice(lineStart)}`;
    onChangeContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }

  function insertSnippet(snippet) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${content.slice(0, start)}${snippet}${content.slice(end)}`;
    onChangeContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + snippet.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = textareaRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${content.slice(0, start)}  ${content.slice(end)}`;
      onChangeContent(next);
      requestAnimationFrame(() => {
        el.setSelectionRange(start + 2, start + 2);
      });
    }
  }

  function handleToggleCheckbox(index) {
    const next = toggleMarkdownCheckbox(content, index);
    if (next !== content) {
      onChangeContent(next, { immediateSave: true });
    }
  }

  const showEditor = viewMode === 'edit' || viewMode === 'split';
  const showPreview = viewMode === 'preview' || viewMode === 'split';

  return (
    <div className="workspace">
      {showEditor && (
        <div className="editor-toolbar">
          <div className="toolbar-group">
            <button
              type="button"
              className="icon-btn sm"
              title="Heading"
              onClick={() => applyLinePrefix('## ')}
            >
              <Heading2 size={15} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Bold"
              onClick={() => applyWrap('**', '**', 'bold')}
            >
              <Bold size={15} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Italic"
              onClick={() => applyWrap('_', '_', 'italic')}
            >
              <Italic size={15} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Strikethrough"
              onClick={() => applyWrap('~~', '~~', 'text')}
            >
              <Strikethrough size={15} />
            </button>
            <div className="toolbar-sep" />
            <button
              type="button"
              className="icon-btn sm"
              title="Inline code"
              onClick={() => applyWrap('`', '`', 'code')}
            >
              <Code size={15} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Code block"
              onClick={() => insertSnippet('\n```bash\n\n```\n')}
            >
              <FileCode size={15} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Link"
              onClick={() => applyWrap('[', '](https://)', 'link text')}
            >
              <Link size={15} />
            </button>
            <div className="toolbar-sep" />
            <button
              type="button"
              className="icon-btn sm"
              title="Bullet list"
              onClick={() => applyLinePrefix('- ')}
            >
              <List size={15} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Task list"
              onClick={() => applyLinePrefix('- [ ] ')}
            >
              <CheckSquare size={15} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Blockquote"
              onClick={() => applyLinePrefix('> ')}
            >
              <Quote size={15} />
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Table"
              onClick={() =>
                insertSnippet(
                  '\n| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n'
                )
              }
            >
              <Table size={15} />
            </button>
          </div>

          <div className="toolbar-group">
            <label className="autosave-toggle" title="Automatically save changes while typing">
              <input
                type="checkbox"
                checked={autoSave}
                onChange={(e) => onToggleAutoSave(e.target.checked)}
              />
              <span>Auto-save</span>
            </label>
            <button
              type="button"
              className="btn"
              style={{ height: 26, padding: '0 9px', fontSize: 12 }}
              onClick={onSaveNow}
              disabled={saveStatus === 'saved' || saveStatus === 'saving'}
              title={`Save note (${formatShortcut('S')})`}
            >
              <Save size={13} />
              <span>Save</span>
            </button>
          </div>
        </div>
      )}

      <div className={`panes-container${viewMode === 'split' ? ' split' : ''}`}>
        {showEditor && (
          <div className="pane pane-editor">
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              value={content}
              onChange={(e) => onChangeContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Start writing in Markdown…"
              spellCheck="true"
            />
          </div>
        )}

        {showPreview && (
          <PreviewPane
            content={content}
            onToggleCheckbox={handleToggleCheckbox}
            onOpenWikilink={onOpenWikilink}
          />
        )}
      </div>

      <footer className="editor-statusbar">
        <div className="statusbar-group">
          <span>{stats.words} words</span>
          <span>{stats.lines} lines</span>
          <span>{stats.chars} chars</span>
        </div>
        <div className="statusbar-group">
          {updatedAt && <span>Updated {formatTime(updatedAt)}</span>}
        </div>
      </footer>
    </div>
  );
}
