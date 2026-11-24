import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  ChevronDown,
  Code,
  FileCode,
  Link,
  List,
  CheckSquare,
  Quote,
  Table,
  Save,
  Check,
  Loader2,
  Circle,
  AlertTriangle,
} from 'lucide-react';
import { PreviewPane } from './PreviewPane.jsx';
import { Tooltip } from './Tooltip.jsx';
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

const HEADING_LEVELS = [
  { level: 1, label: 'Heading 1', tag: 'H1', Icon: Heading1 },
  { level: 2, label: 'Heading 2', tag: 'H2', Icon: Heading2 },
  { level: 3, label: 'Heading 3', tag: 'H3', Icon: Heading3 },
  { level: 4, label: 'Heading 4', tag: 'H4', Icon: Heading4 },
];

export function EditorPane({
  content,
  updatedAt,
  viewMode,
  saveStatus,
  onChangeContent,
  onSaveNow,
  onOpenWikilink,
}) {
  const textareaRef = useRef(null);
  const pendingEditRef = useRef(null);
  const headingBtnRef = useRef(null);
  const headingMenuRef = useRef(null);
  const [headingOpen, setHeadingOpen] = useState(false);
  const [headingPos, setHeadingPos] = useState({ top: 0, left: 0 });

  // Restore exact cursor selection and scrollTop synchronously after React commits new value
  useLayoutEffect(() => {
    const pending = pendingEditRef.current;
    const el = textareaRef.current;
    if (!pending || !el) return;
    pendingEditRef.current = null;

    el.focus({ preventScroll: true });
    el.setSelectionRange(pending.start, pending.end);
    el.scrollTop = pending.scrollTop;
  }, [content]);

  useEffect(() => {
    if (!headingOpen) return;
    const onPointerDown = (e) => {
      if (
        headingBtnRef.current?.contains(e.target) ||
        headingMenuRef.current?.contains(e.target)
      ) {
        return;
      }
      setHeadingOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setHeadingOpen(false);
    };
    const onScroll = () => setHeadingOpen(false);

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onScroll);
    };
  }, [headingOpen]);

  const stats = useMemo(() => {
    const trimmed = content.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = content.length;
    const lines = content ? content.split('\n').length : 0;
    return { words, chars, lines };
  }, [content]);

  function commitTextEdit(nextText, selStart, selEnd) {
    const el = textareaRef.current;
    const scrollTop = el ? el.scrollTop : 0;
    pendingEditRef.current = { start: selStart, end: selEnd, scrollTop };
    onChangeContent(nextText);
  }

  function applyWrap(prefix, suffix = prefix, placeholder = 'text') {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const next = `${content.slice(0, start)}${prefix}${selected}${suffix}${content.slice(end)}`;
    commitTextEdit(next, start + prefix.length, start + prefix.length + selected.length);
  }

  function applyHeading(level) {
    const el = textareaRef.current;
    setHeadingOpen(false);
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const lineEndIdx = content.indexOf('\n', lineStart);
    const lineEnd = lineEndIdx === -1 ? content.length : lineEndIdx;
    const currentLine = content.slice(lineStart, lineEnd);

    const existingMatch = currentLine.match(/^(#{1,6}\s+)/);
    const prefix = `${'#'.repeat(level)} `;

    let nextLine;
    let delta;
    if (existingMatch) {
      nextLine = `${prefix}${currentLine.slice(existingMatch[1].length)}`;
      delta = prefix.length - existingMatch[1].length;
    } else {
      nextLine = `${prefix}${currentLine}`;
      delta = prefix.length;
    }

    const next = `${content.slice(0, lineStart)}${nextLine}${content.slice(lineEnd)}`;
    const nextStart = Math.max(lineStart + prefix.length, start + delta);
    const nextEnd = Math.max(nextStart, end + delta);
    commitTextEdit(next, nextStart, nextEnd);
  }

  function applyLinePrefix(prefix) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const next = `${content.slice(0, lineStart)}${prefix}${content.slice(lineStart)}`;
    commitTextEdit(next, start + prefix.length, end + prefix.length);
  }

  function insertSnippet(snippet) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${content.slice(0, start)}${snippet}${content.slice(end)}`;
    const cursor = start + snippet.length;
    commitTextEdit(next, cursor, cursor);
  }

  function handleToggleHeadingMenu() {
    if (headingOpen) {
      setHeadingOpen(false);
      return;
    }
    const rect = headingBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setHeadingPos({ top: rect.bottom + 6, left: Math.max(8, rect.left) });
    }
    setHeadingOpen(true);
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = textareaRef.current;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${content.slice(0, start)}  ${content.slice(end)}`;
      commitTextEdit(next, start + 2, start + 2);
    }
  }

  function handleToggleCheckbox(index) {
    const next = toggleMarkdownCheckbox(content, index);
    if (next !== content) {
      onChangeContent(next, { immediateSave: true });
    }
  }

  const preventFocusSteal = (e) => e.preventDefault();

  const showEditor = viewMode === 'edit' || viewMode === 'split';
  const showPreview = viewMode === 'preview' || viewMode === 'split';

  return (
    <div className="workspace">
      {showEditor && (
        <div className="editor-toolbar">
          <div className="toolbar-group">
            <Tooltip label="Headings (H1–H4)">
              <button
                ref={headingBtnRef}
                type="button"
                className={`toolbar-dropdown-btn${headingOpen ? ' active' : ''}`}
                onMouseDown={preventFocusSteal}
                onClick={handleToggleHeadingMenu}
                aria-label="Insert heading"
                aria-expanded={headingOpen}
                aria-haspopup="menu"
              >
                <Heading size={14} />
                <ChevronDown size={11} />
              </button>
            </Tooltip>

            {headingOpen &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={headingMenuRef}
                  className="dropdown-menu heading-dropdown-menu"
                  style={{ top: headingPos.top, left: headingPos.left }}
                  role="menu"
                >
                  {HEADING_LEVELS.map(({ level, label, tag, Icon }) => (
                    <button
                      key={level}
                      type="button"
                      className="dropdown-item"
                      role="menuitem"
                      onMouseDown={preventFocusSteal}
                      onClick={() => applyHeading(level)}
                    >
                      <Icon size={15} />
                      <span className={`heading-opt-label h${level}`}>{label}</span>
                      <span className="heading-opt-tag">{tag}</span>
                    </button>
                  ))}
                </div>,
                document.body
              )}

            <Tooltip label="Bold">
              <button
                type="button"
                className="icon-btn toolbar-btn"
                onMouseDown={preventFocusSteal}
                onClick={() => applyWrap('**', '**', 'bold')}
                aria-label="Bold"
              >
                <Bold size={15} />
              </button>
            </Tooltip>

            <Tooltip label="Italic">
              <button
                type="button"
                className="icon-btn toolbar-btn"
                onMouseDown={preventFocusSteal}
                onClick={() => applyWrap('_', '_', 'italic')}
                aria-label="Italic"
              >
                <Italic size={15} />
              </button>
            </Tooltip>

            <Tooltip label="Strikethrough">
              <button
                type="button"
                className="icon-btn toolbar-btn"
                onMouseDown={preventFocusSteal}
                onClick={() => applyWrap('~~', '~~', 'text')}
                aria-label="Strikethrough"
              >
                <Strikethrough size={15} />
              </button>
            </Tooltip>

            <div className="toolbar-sep" />

            <Tooltip label="Inline code">
              <button
                type="button"
                className="icon-btn toolbar-btn"
                onMouseDown={preventFocusSteal}
                onClick={() => applyWrap('`', '`', 'code')}
                aria-label="Inline code"
              >
                <Code size={15} />
              </button>
            </Tooltip>

            <Tooltip label="Code block">
              <button
                type="button"
                className="icon-btn toolbar-btn"
                onMouseDown={preventFocusSteal}
                onClick={() => insertSnippet('\n```bash\n\n```\n')}
                aria-label="Code block"
              >
                <FileCode size={15} />
              </button>
            </Tooltip>

            <Tooltip label="Insert link">
              <button
                type="button"
                className="icon-btn toolbar-btn"
                onMouseDown={preventFocusSteal}
                onClick={() => applyWrap('[', '](https://)', 'link text')}
                aria-label="Insert link"
              >
                <Link size={15} />
              </button>
            </Tooltip>

            <div className="toolbar-sep" />

            <Tooltip label="Bullet list">
              <button
                type="button"
                className="icon-btn toolbar-btn"
                onMouseDown={preventFocusSteal}
                onClick={() => applyLinePrefix('- ')}
                aria-label="Bullet list"
              >
                <List size={15} />
              </button>
            </Tooltip>

            <Tooltip label="Task list">
              <button
                type="button"
                className="icon-btn toolbar-btn"
                onMouseDown={preventFocusSteal}
                onClick={() => applyLinePrefix('- [ ] ')}
                aria-label="Task list"
              >
                <CheckSquare size={15} />
              </button>
            </Tooltip>

            <Tooltip label="Blockquote">
              <button
                type="button"
                className="icon-btn toolbar-btn"
                onMouseDown={preventFocusSteal}
                onClick={() => applyLinePrefix('> ')}
                aria-label="Blockquote"
              >
                <Quote size={15} />
              </button>
            </Tooltip>

            <Tooltip label="Insert table">
              <button
                type="button"
                className="icon-btn toolbar-btn"
                onMouseDown={preventFocusSteal}
                onClick={() =>
                  insertSnippet(
                    '\n| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n'
                  )
                }
                aria-label="Insert table"
              >
                <Table size={15} />
              </button>
            </Tooltip>
          </div>

          <div className="toolbar-group">
            <Tooltip label="Save note" shortcut="S">
              <button
                type="button"
                className="btn toolbar-save-btn"
                onMouseDown={preventFocusSteal}
                onClick={onSaveNow}
                disabled={saveStatus === 'saved' || saveStatus === 'saving'}
              >
                <Save size={13} />
                <span>Save</span>
              </button>
            </Tooltip>
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
          <div className={`save-badge ${saveStatus}`}>
            {saveStatus === 'saved' && (
              <>
                <Check size={12} />
                <span>Saved</span>
              </>
            )}
            {saveStatus === 'saving' && (
              <>
                <Loader2 size={12} className="spin" />
                <span>Saving…</span>
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <Circle size={7} fill="currentColor" />
                <span>Unsaved</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertTriangle size={12} />
                <span>Save failed</span>
              </>
            )}
          </div>
          {updatedAt && (
            <>
              <span className="statusbar-dot">·</span>
              <span>Updated {formatTime(updatedAt)}</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
