import React from 'react';
import {
  BookOpen,
  PanelLeft,
  Search,
  Sun,
  Moon,
  LogOut,
  Settings,
  Edit3,
  Columns2,
  Eye,
  Check,
  Loader2,
  Circle,
  AlertTriangle,
} from 'lucide-react';
import { ShortcutKey, formatShortcut } from './ShortcutKey.jsx';

export function Header({
  activePath,
  saveStatus,
  viewMode,
  onChangeViewMode,
  sidebarOpen,
  onToggleSidebar,
  onOpenSearch,
  theme,
  onToggleTheme,
  onOpenSettings,
  username,
  onLogout,
}) {
  const pathParts = activePath ? activePath.split('/') : [];

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleSidebar}
          title={
            sidebarOpen
              ? `Hide sidebar (${formatShortcut('B')})`
              : `Show sidebar (${formatShortcut('B')})`
          }
          aria-label="Toggle sidebar"
        >
          <PanelLeft size={17} />
        </button>

        <div className="header-brand">
          <BookOpen size={17} />
          <span>Notes</span>
        </div>

        {pathParts.length > 0 && (
          <>
            <div className="header-divider" />
            <nav className="breadcrumbs" aria-label="Note path">
              {pathParts.map((part, idx) => {
                const isLast = idx === pathParts.length - 1;
                return (
                  <React.Fragment key={`${part}-${idx}`}>
                    {idx > 0 && <span className="breadcrumb-sep">/</span>}
                    <span className={`breadcrumb-seg${isLast ? ' current' : ''}`} title={part}>
                      {part}
                    </span>
                  </React.Fragment>
                );
              })}
            </nav>
          </>
        )}
      </div>

      <div className="header-right">
        {activePath && (
          <div className={`save-badge ${saveStatus}`} title="Save status">
            {saveStatus === 'saved' && (
              <>
                <Check size={13} />
                <span>Saved</span>
              </>
            )}
            {saveStatus === 'saving' && (
              <>
                <Loader2 size={13} className="spin" />
                <span>Saving…</span>
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <Circle size={8} fill="currentColor" />
                <span>Unsaved</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertTriangle size={13} />
                <span>Save failed</span>
              </>
            )}
          </div>
        )}

        {activePath && (
          <div className="segmented-control" role="group" aria-label="Editor view mode">
            <button
              type="button"
              className={`segmented-btn${viewMode === 'edit' ? ' active' : ''}`}
              onClick={() => onChangeViewMode('edit')}
              title="Edit Markdown"
            >
              <Edit3 size={13} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              className={`segmented-btn split-only${viewMode === 'split' ? ' active' : ''}`}
              onClick={() => onChangeViewMode('split')}
              title="Split Edit & Preview"
            >
              <Columns2 size={13} />
              <span>Split</span>
            </button>
            <button
              type="button"
              className={`segmented-btn${viewMode === 'preview' ? ' active' : ''}`}
              onClick={() => onChangeViewMode('preview')}
              title={`Preview Markdown (${formatShortcut('E')})`}
            >
              <Eye size={13} />
              <span>Preview</span>
            </button>
          </div>
        )}

        <button
          type="button"
          className="search-trigger"
          onClick={onOpenSearch}
          title={`Quick switcher & search (${formatShortcut('K')})`}
        >
          <Search size={14} />
          <span className="search-label">Search notes</span>
          <ShortcutKey letter="K" />
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to GitHub Light' : 'Switch to GitHub Dark'}
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Open settings"
        >
          <Settings size={16} />
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onLogout}
          title={`Sign out (${username})`}
          aria-label="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
