import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  PanelLeft,
  Search,
  LogOut,
  Settings,
  Edit3,
  Columns2,
  Eye,
  Menu,
} from 'lucide-react';
import { ShortcutKey } from './ShortcutKey.jsx';
import { Tooltip } from './Tooltip.jsx';

export function Header({
  activePath,
  viewMode,
  onChangeViewMode,
  sidebarOpen,
  onToggleSidebar,
  onOpenSearch,
  onOpenSettings,
  username,
  onLogout,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);
  const pathParts = activePath ? activePath.split('/') : [];

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="app-header">
      <div className="header-left">
        <Tooltip label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} shortcut="B">
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <PanelLeft size={16} />
          </button>
        </Tooltip>

        <div className="header-divider" />

        <div className="header-brand">
          <BookOpen size={16} />
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
          <div className="btn-group" role="group" aria-label="Editor view mode">
            <Tooltip label="Edit Markdown">
              <button
                type="button"
                className={`btn-group-item${viewMode === 'edit' ? ' active' : ''}`}
                onClick={() => onChangeViewMode('edit')}
              >
                <Edit3 size={13} />
                <span>Edit</span>
              </button>
            </Tooltip>
            <Tooltip label="Split editor & preview">
              <button
                type="button"
                className={`btn-group-item split-only${viewMode === 'split' ? ' active' : ''}`}
                onClick={() => onChangeViewMode('split')}
              >
                <Columns2 size={13} />
                <span>Split</span>
              </button>
            </Tooltip>
            <Tooltip label="Preview Markdown" shortcut="E">
              <button
                type="button"
                className={`btn-group-item${viewMode === 'preview' ? ' active' : ''}`}
                onClick={() => onChangeViewMode('preview')}
              >
                <Eye size={13} />
                <span>Preview</span>
              </button>
            </Tooltip>
          </div>
        )}

        <Tooltip label="Quick switcher & search" shortcut="K">
          <button
            type="button"
            className="search-trigger"
            onClick={onOpenSearch}
            aria-label="Search notes"
          >
            <span className="search-trigger-left">
              <Search size={14} />
              <span className="search-label">Search notes</span>
            </span>
            <ShortcutKey letter="K" />
          </button>
        </Tooltip>

        {/* Desktop actions (> 900px) */}
        <div className="header-desktop-actions">
          <Tooltip label="Settings">
            <button
              type="button"
              className="icon-btn header-control-btn"
              onClick={onOpenSettings}
              aria-label="Open settings"
            >
              <Settings size={15} />
            </button>
          </Tooltip>

          <Tooltip label={`Sign out (${username})`}>
            <button
              type="button"
              className="btn btn-logout"
              onClick={onLogout}
              aria-label="Sign out"
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </Tooltip>
        </div>

        {/* Mobile / narrow burger menu (<= 900px) */}
        <div className="header-mobile-menu" ref={menuWrapRef}>
          <Tooltip label="Menu">
            <button
              type="button"
              className="icon-btn header-control-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <Menu size={16} />
            </button>
          </Tooltip>

          {menuOpen && (
            <div className="dropdown-menu header-burger-dropdown" role="menu">
              <button
                type="button"
                className="dropdown-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSettings();
                }}
              >
                <Settings size={14} />
                <span>Settings</span>
              </button>
              <div className="dropdown-divider" />
              <button
                type="button"
                className="dropdown-item dropdown-item-danger"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              >
                <LogOut size={14} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
