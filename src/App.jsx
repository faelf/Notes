import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, FilePlus, FolderPlus, Search } from 'lucide-react';
import { api } from './api.js';
import { LoginScreen } from './components/LoginScreen.jsx';
import { Header } from './components/Header.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { EditorPane } from './components/EditorPane.jsx';
import { QuickSwitcher } from './components/QuickSwitcher.jsx';
import { PromptModal, ConfirmDeleteModal } from './components/Modal.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { ShortcutKey } from './components/ShortcutKey.jsx';
import { ToastContainer } from './components/Toast.jsx';

function flattenFiles(nodes, acc = []) {
  for (const n of nodes) {
    if (n.type === 'file') acc.push(n);
    else if (n.children) flattenFiles(n.children, acc);
  }
  return acc;
}

function getParentFolders(filePath) {
  const parts = filePath.split('/');
  const folders = [];
  for (let i = 0; i < parts.length - 1; i++) {
    folders.push(parts.slice(0, i + 1).join('/'));
  }
  return folders;
}

function getInitialTheme() {
  try {
    const saved = localStorage.getItem('notes-theme') || localStorage.getItem('vault-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function getInitialExpanded() {
  try {
    const raw =
      localStorage.getItem('notes-expanded-folders') ||
      localStorage.getItem('vault-expanded-folders');
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [authState, setAuthState] = useState({ loading: true, authenticated: false, username: '' });

  const [folderName, setFolderName] = useState('');
  const [tree, setTree] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(getInitialExpanded);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 820 : true
  );

  const [activePath, setActivePath] = useState('');
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved');
  const [autoSave, setAutoSave] = useState(true);
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved =
        localStorage.getItem('notes-view-mode') || localStorage.getItem('vault-view-mode');
      if (saved === 'edit' || saved === 'split' || saved === 'preview') return saved;
    } catch {}
    return typeof window !== 'undefined' && window.innerWidth <= 820 ? 'preview' : 'split';
  });

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modalState, setModalState] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toasts, setToasts] = useState([]);

  const autoSaveTimerRef = useRef(null);
  const activePathRef = useRef(activePath);
  const contentRef = useRef(content);
  const savedContentRef = useRef(savedContent);

  activePathRef.current = activePath;
  contentRef.current = content;
  savedContentRef.current = savedContent;

  const notify = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('notes-theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem('notes-view-mode', viewMode);
    } catch {}
  }, [viewMode]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const persistExpanded = useCallback((nextSet) => {
    try {
      localStorage.setItem('notes-expanded-folders', JSON.stringify(Array.from(nextSet)));
    } catch {}
  }, []);

  const handleUnauthorized = useCallback(() => {
    setAuthState({ loading: false, authenticated: false, username: '' });
    setTree([]);
    setActivePath('');
    setContent('');
    setSavedContent('');
  }, []);

  const loadTree = useCallback(async () => {
    try {
      const data = await api.getTree();
      setTree(data.tree || []);
      setFolderName(data.folderName || 'Folder');
      return data.tree || [];
    } catch (err) {
      if (err.status === 401) {
        handleUnauthorized();
      } else {
        notify(err.message || 'Failed to load folder', 'error');
      }
      return [];
    }
  }, [handleUnauthorized, notify]);

  const performSave = useCallback(
    async (pathToSave, textToSave) => {
      if (!pathToSave) return true;
      setSaveStatus('saving');
      try {
        const res = await api.saveFile(pathToSave, textToSave);
        if (activePathRef.current === pathToSave) {
          setUpdatedAt(res.updatedAt);
          setSavedContent(textToSave);
          setSaveStatus(contentRef.current === textToSave ? 'saved' : 'unsaved');
        }
        return true;
      } catch (err) {
        if (err.status === 401) {
          handleUnauthorized();
        } else {
          setSaveStatus('error');
          notify(err.message || 'Failed to save note', 'error');
        }
        return false;
      }
    },
    [handleUnauthorized, notify]
  );

  const openFile = useCallback(
    async (filePath) => {
      if (!filePath) return;

      if (
        activePathRef.current &&
        activePathRef.current !== filePath &&
        contentRef.current !== savedContentRef.current
      ) {
        clearTimeout(autoSaveTimerRef.current);
        await performSave(activePathRef.current, contentRef.current);
      }

      try {
        const note = await api.readFile(filePath);
        setActivePath(note.path);
        setContent(note.content);
        setSavedContent(note.content);
        setUpdatedAt(note.updatedAt);
        setSaveStatus('saved');

        const parents = getParentFolders(note.path);
        if (parents.length > 0) {
          setExpandedFolders((prev) => {
            const next = new Set(prev);
            parents.forEach((p) => next.add(p));
            persistExpanded(next);
            return next;
          });
        }

        try {
          localStorage.setItem('notes-last-file', note.path);
        } catch {}

        if (window.innerWidth <= 820) {
          setSidebarOpen(false);
        }
      } catch (err) {
        if (err.status === 401) handleUnauthorized();
        else notify(err.message || 'Could not open file', 'error');
      }
    },
    [handleUnauthorized, notify, performSave, persistExpanded]
  );

  // Check session on startup
  useEffect(() => {
    let cancelled = false;
    api
      .authStatus()
      .then((res) => {
        if (cancelled) return;
        setAuthState({
          loading: false,
          authenticated: Boolean(res.authenticated),
          username: res.username || '',
        });
      })
      .catch(() => {
        if (!cancelled) {
          setAuthState({ loading: false, authenticated: false, username: '' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load folder once authenticated
  useEffect(() => {
    if (!authState.authenticated) return;
    loadTree().then((loadedTree) => {
      const allFiles = flattenFiles(loadedTree);
      if (allFiles.length === 0) return;

      let targetPath = '';
      try {
        const last = localStorage.getItem('notes-last-file');
        if (last && allFiles.some((f) => f.path === last)) {
          targetPath = last;
        }
      } catch {}

      if (!targetPath) {
        const welcome = allFiles.find((f) => f.title.toLowerCase() === 'welcome');
        targetPath = (welcome || allFiles[0]).path;
      }
      openFile(targetPath);
    });
  }, [authState.authenticated, loadTree, openFile]);

  // Global keyboard shortcuts
  useEffect(() => {
    if (!authState.authenticated) return;

    function onKeyDown(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSwitcherOpen((v) => !v);
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activePathRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          performSave(activePathRef.current, contentRef.current);
        }
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setViewMode((prev) => (prev === 'preview' ? 'edit' : 'preview'));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [authState.authenticated, performSave]);

  useEffect(() => {
    return () => clearTimeout(autoSaveTimerRef.current);
  }, []);

  const handleChangeContent = useCallback(
    (nextContent, { immediateSave = false } = {}) => {
      setContent(nextContent);
      const dirty = nextContent !== savedContentRef.current;
      setSaveStatus(dirty ? 'unsaved' : 'saved');

      clearTimeout(autoSaveTimerRef.current);
      if (!dirty || !activePathRef.current) return;

      if (immediateSave) {
        performSave(activePathRef.current, nextContent);
      } else if (autoSave) {
        autoSaveTimerRef.current = setTimeout(() => {
          performSave(activePathRef.current, nextContent);
        }, 700);
      }
    },
    [autoSave, performSave]
  );

  const handleLogin = async (username, password, rememberMe) => {
    const res = await api.login(username, password, rememberMe);
    setAuthState({ loading: false, authenticated: true, username: res.username });
  };

  const handleLogout = async () => {
    clearTimeout(autoSaveTimerRef.current);
    if (activePathRef.current && contentRef.current !== savedContentRef.current) {
      await performSave(activePathRef.current, contentRef.current);
    }
    try {
      await api.logout();
    } catch {}
    handleUnauthorized();
  };

  const handleToggleFolder = (folderPath) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      persistExpanded(next);
      return next;
    });
  };

  const handleOpenNewFileModal = (parentFolder = '') => {
    setModalState({
      kind: 'new-file',
      title: parentFolder ? `New note in ${parentFolder}` : 'Create new note',
      label: 'Note path',
      placeholder: parentFolder ? `${parentFolder}/My Note.md` : 'My Note.md',
      hint: 'You can include subfolders like "Projects/Ideas". The .md extension is added automatically.',
      initialValue: parentFolder ? `${parentFolder}/` : '',
      confirmText: 'Create note',
    });
  };

  const handleOpenNewFolderModal = (parentFolder = '') => {
    setModalState({
      kind: 'new-folder',
      title: parentFolder ? `New folder in ${parentFolder}` : 'Create new folder',
      label: 'Folder path',
      placeholder: parentFolder ? `${parentFolder}/Subfolder` : 'Projects',
      hint: 'Nested folders like "Homelab/Docker" can be created in one step.',
      initialValue: parentFolder ? `${parentFolder}/` : '',
      confirmText: 'Create folder',
    });
  };

  const handleOpenRenameModal = (node) => {
    setModalState({
      kind: 'rename',
      node,
      title: `Rename ${node.type === 'folder' ? 'folder' : 'note'}`,
      label: 'New path',
      placeholder: node.path,
      hint: 'Change the folder prefix to move this item to another folder.',
      initialValue: node.path,
      confirmText: 'Rename',
    });
  };

  const handleConfirmPrompt = async (value) => {
    if (!modalState) return;
    try {
      if (modalState.kind === 'new-file') {
        const created = await api.createFile(value);
        await loadTree();
        setModalState(null);
        await openFile(created.path);
        if (viewMode === 'preview') setViewMode('split');
        notify(`Created ${created.path}`, 'success');
      } else if (modalState.kind === 'new-folder') {
        const created = await api.createFolder(value);
        await loadTree();
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          next.add(created.path);
          getParentFolders(created.path).forEach((p) => next.add(p));
          persistExpanded(next);
          return next;
        });
        setModalState(null);
        notify(`Created folder ${created.path}`, 'success');
      } else if (modalState.kind === 'rename') {
        const oldPath = modalState.node.path;
        const result = await api.renameEntry(oldPath, value);
        await loadTree();

        if (activePath === oldPath) {
          setActivePath(result.newPath);
        } else if (activePath.startsWith(`${oldPath}/`)) {
          setActivePath(`${result.newPath}${activePath.slice(oldPath.length)}`);
        }

        setModalState(null);
        notify(`Renamed to ${result.newPath}`, 'success');
      }
    } catch (err) {
      if (err.status === 401) handleUnauthorized();
      else notify(err.message || 'Operation failed', 'error');
    }
  };

  const handleConfirmDelete = async (item) => {
    try {
      await api.deleteEntry(item.path);
      const nextTree = await loadTree();
      setDeleteTarget(null);

      if (activePath === item.path || activePath.startsWith(`${item.path}/`)) {
        clearTimeout(autoSaveTimerRef.current);
        setActivePath('');
        setContent('');
        setSavedContent('');
        setUpdatedAt('');
        const remaining = flattenFiles(nextTree);
        if (remaining.length > 0) {
          openFile(remaining[0].path);
        }
      }
      notify(`Deleted ${item.path}`, 'success');
    } catch (err) {
      if (err.status === 401) handleUnauthorized();
      else notify(err.message || 'Delete failed', 'error');
    }
  };

  const handleOpenWikilink = async (target) => {
    const clean = target.replace(/\.md$/i, '').trim().toLowerCase();
    const allFiles = flattenFiles(tree);
    const match =
      allFiles.find((f) => f.path.replace(/\.md$/i, '').toLowerCase() === clean) ||
      allFiles.find((f) => f.title.toLowerCase() === clean);

    if (match) {
      openFile(match.path);
    } else {
      setModalState({
        kind: 'new-file',
        title: `Create linked note "${target}"?`,
        label: 'Note path',
        placeholder: `${target}.md`,
        hint: 'This wikilink points to a note that does not exist yet.',
        initialValue: target.endsWith('.md') ? target : `${target}.md`,
        confirmText: 'Create & open',
      });
    }
  };

  const handleCredentialsUpdated = (res) => {
    setAuthState((prev) => ({ ...prev, username: res.username }));
    notify(
      res.passwordChanged ? 'Credentials updated in .env' : 'Username updated in .env',
      'success'
    );
  };

  const handleFolderUpdated = async (res) => {
    clearTimeout(autoSaveTimerRef.current);
    setActivePath('');
    setContent('');
    setSavedContent('');
    setUpdatedAt('');
    setSaveStatus('saved');
    const loadedTree = await loadTree();
    const allFiles = flattenFiles(loadedTree);
    if (allFiles.length > 0) {
      const welcome = allFiles.find((f) => f.title.toLowerCase() === 'welcome');
      openFile((welcome || allFiles[0]).path);
    }
    notify(`Switched folder to ${res?.folderName || 'new folder'}`, 'success');
  };

  if (authState.loading) {
    return (
      <div className="login-page">
        <span style={{ color: 'var(--fg-muted)', fontSize: 13 }}>Loading Notes…</span>
      </div>
    );
  }

  if (!authState.authenticated) {
    return <LoginScreen theme={theme} onToggleTheme={toggleTheme} onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <Header
        activePath={activePath}
        saveStatus={saveStatus}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenSearch={() => setSwitcherOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        username={authState.username}
        onLogout={handleLogout}
      />

      <div className="app-body">
        <Sidebar
          open={sidebarOpen}
          folderName={folderName}
          tree={tree}
          activePath={activePath}
          expandedFolders={expandedFolders}
          onToggleFolder={handleToggleFolder}
          onSelectFile={openFile}
          onNewFile={handleOpenNewFileModal}
          onNewFolder={handleOpenNewFolderModal}
          onRename={handleOpenRenameModal}
          onDelete={setDeleteTarget}
          onRefresh={() => loadTree().then(() => notify('Folder refreshed'))}
          onCloseMobile={() => setSidebarOpen(false)}
        />

        {activePath ? (
          <EditorPane
            content={content}
            updatedAt={updatedAt}
            viewMode={viewMode}
            autoSave={autoSave}
            onToggleAutoSave={setAutoSave}
            saveStatus={saveStatus}
            onChangeContent={handleChangeContent}
            onSaveNow={() => {
              clearTimeout(autoSaveTimerRef.current);
              performSave(activePath, content);
            }}
            onOpenWikilink={handleOpenWikilink}
          />
        ) : (
          <main className="workspace">
            <div className="blankslate">
              <div className="blankslate-icon">
                <BookOpen size={24} />
              </div>
              <h2>No note selected</h2>
              <p>
                Pick a Markdown file from the sidebar, or create a new note or folder to get
                started.
              </p>
              <div className="blankslate-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleOpenNewFileModal('')}
                >
                  <FilePlus size={15} />
                  New note
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => handleOpenNewFolderModal('')}
                >
                  <FolderPlus size={15} />
                  New folder
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSwitcherOpen(true)}
                >
                  <Search size={15} />
                  Quick switcher
                </button>
              </div>
              <div className="shortcuts-hint">
                <span>
                  <ShortcutKey letter="K" /> Search
                </span>
                <span>
                  <ShortcutKey letter="S" /> Save
                </span>
                <span>
                  <ShortcutKey letter="E" /> Edit / Preview
                </span>
                <span>
                  <ShortcutKey letter="B" /> Sidebar
                </span>
              </div>
            </div>
          </main>
        )}
      </div>

      <QuickSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        onSelectFile={openFile}
      />

      <PromptModal
        open={Boolean(modalState)}
        title={modalState?.title || ''}
        label={modalState?.label || ''}
        placeholder={modalState?.placeholder || ''}
        hint={modalState?.hint || ''}
        initialValue={modalState?.initialValue || ''}
        confirmText={modalState?.confirmText || 'Save'}
        onCancel={() => setModalState(null)}
        onConfirm={handleConfirmPrompt}
      />

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        item={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onCredentialsUpdated={handleCredentialsUpdated}
        onFolderUpdated={handleFolderUpdated}
      />

      <ToastContainer toasts={toasts} />
    </div>
  );
}
