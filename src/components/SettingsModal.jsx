import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  User,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  FileKey,
  Check,
} from 'lucide-react';
import { api } from '../api.js';

export function SettingsModal({ open, onClose, onCredentialsUpdated, onFolderUpdated }) {
  const [activeTab, setActiveTab] = useState('account');
  const [loading, setLoading] = useState(false);

  const [settings, setSettings] = useState({
    username: '',
    folderDir: '',
    displayPath: '',
    folderName: '',
    envFileWritable: true,
  });

  // Account form state
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accountError, setAccountError] = useState('');
  const [accountSuccess, setAccountSuccess] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  // Folder locator state
  const [locatorOpen, setLocatorOpen] = useState(false);
  const [browseData, setBrowseData] = useState(null);
  const [browsing, setBrowsing] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [creatingSubdir, setCreatingSubdir] = useState(false);
  const [newSubdirName, setNewSubdirName] = useState('');
  const [folderError, setFolderError] = useState('');
  const [folderSuccess, setFolderSuccess] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const breadcrumbsRef = useRef(null);

  useEffect(() => {
    if (breadcrumbsRef.current) {
      breadcrumbsRef.current.scrollLeft = breadcrumbsRef.current.scrollWidth;
    }
  }, [browseData]);

  const loadDirectory = useCallback(async (targetPath, includeHidden = false) => {
    setBrowsing(true);
    setFolderError('');
    try {
      const data = await api.browseFolders(targetPath, includeHidden);
      setBrowseData(data);
    } catch (err) {
      setFolderError(err.message || 'Could not browse directory');
    } finally {
      setBrowsing(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setAccountError('');
    setAccountSuccess('');
    setFolderError('');
    setFolderSuccess('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setLocatorOpen(false);
    setCreatingSubdir(false);
    setNewSubdirName('');

    api
      .getSettings()
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
        setUsername(data.username || '');
      })
      .catch((err) => {
        if (!cancelled) {
          setAccountError(err.message || 'Could not load settings');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (creatingSubdir) {
          setCreatingSubdir(false);
          setNewSubdirName('');
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, creatingSubdir, onClose]);

  if (!open) return null;

  async function handleSaveAccount(e) {
    e.preventDefault();
    setAccountError('');
    setAccountSuccess('');

    const cleanUser = username.trim();
    if (!cleanUser) {
      setAccountError('Username cannot be empty.');
      return;
    }
    if (!currentPassword) {
      setAccountError('Enter your current password to confirm changes.');
      return;
    }
    if (newPassword && newPassword.length < 4) {
      setAccountError('New password must be at least 4 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setAccountError('New password and confirmation do not match.');
      return;
    }
    if (cleanUser === settings.username && !newPassword) {
      setAccountError('Enter a new username or a new password to update.');
      return;
    }

    setSavingAccount(true);
    try {
      const res = await api.updateCredentials(currentPassword, cleanUser, newPassword);
      setSettings((prev) => ({ ...prev, username: res.username }));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setAccountSuccess(
        res.passwordChanged
          ? 'Username and password updated in .env.'
          : 'Username updated in .env.'
      );
      onCredentialsUpdated?.(res);
    } catch (err) {
      setAccountError(err.message || 'Failed to update credentials');
    } finally {
      setSavingAccount(false);
    }
  }

  function handleOpenLocator() {
    setFolderError('');
    setFolderSuccess('');
    setLocatorOpen(true);
    loadDirectory('', showHidden);
  }

  async function handleCreateSubdir(e) {
    e.preventDefault();
    if (!browseData?.currentPath || !newSubdirName.trim()) return;
    setFolderError('');
    try {
      const created = await api.createDirectoryIn(browseData.currentPath, newSubdirName.trim());
      setCreatingSubdir(false);
      setNewSubdirName('');
      await loadDirectory(created.path, showHidden);
    } catch (err) {
      setFolderError(err.message || 'Could not create folder');
    }
  }

  async function handleSelectCurrentFolder() {
    if (!browseData?.currentPath) return;
    setFolderError('');
    setFolderSuccess('');
    setSavingFolder(true);

    try {
      const res = await api.updateFolderLocation(browseData.currentPath, false);
      setSettings((prev) => ({
        ...prev,
        folderDir: res.folderDir,
        displayPath: res.displayPath,
        folderName: res.folderName,
      }));
      setLocatorOpen(false);
      setFolderSuccess(`Switched active folder to "${res.folderName}" and saved to .env.`);
      onFolderUpdated?.(res);
    } catch (err) {
      setFolderError(err.message || 'Failed to update folder location');
    } finally {
      setSavingFolder(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal-card settings-modal-card${locatorOpen && activeTab === 'folder' ? ' wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="modal-header">
          <h3 className="modal-title">Settings</h3>
          <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Close settings">
            <X size={15} />
          </button>
        </div>

        <div className="settings-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'account'}
            className={`settings-tab${activeTab === 'account' ? ' active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            <User size={14} />
            <span>Account</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'folder'}
            className={`settings-tab${activeTab === 'folder' ? ' active' : ''}`}
            onClick={() => setActiveTab('folder')}
          >
            <Folder size={14} />
            <span>Folder location</span>
          </button>
        </div>

        {loading ? (
          <div className="modal-body" style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
            Loading settings…
          </div>
        ) : activeTab === 'account' ? (
          <form onSubmit={handleSaveAccount}>
            <div className="modal-body">
              {accountError && (
                <div className="settings-alert error" role="alert">
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{accountError}</span>
                </div>
              )}
              {accountSuccess && (
                <div className="settings-alert success" role="status">
                  <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                  <span>{accountSuccess}</span>
                </div>
              )}

              <div className="form-field">
                <label className="form-label" htmlFor="settings-username">
                  Username
                </label>
                <input
                  id="settings-username"
                  type="text"
                  className="input"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={savingAccount}
                />
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="settings-current-password">
                  Current password
                </label>
                <input
                  id="settings-current-password"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  placeholder="Required to confirm changes"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={savingAccount}
                />
              </div>

              <div className="settings-divider" />

              <div className="form-field">
                <label className="form-label" htmlFor="settings-new-password">
                  New password
                </label>
                <input
                  id="settings-new-password"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  placeholder="Leave blank to keep current password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={savingAccount}
                />
              </div>

              <div className="form-field" style={{ marginBottom: 10 }}>
                <label className="form-label" htmlFor="settings-confirm-password">
                  Confirm new password
                </label>
                <input
                  id="settings-confirm-password"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={savingAccount}
                />
              </div>

              <div className="settings-env-note">
                <FileKey size={13} style={{ flexShrink: 0 }} />
                <span>
                  Saves to <code>.env</code> as a salted <code>scrypt</code> hash (
                  <code>AUTH_PASSWORD_HASH</code>).
                </span>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn" onClick={onClose} disabled={savingAccount}>
                Close
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingAccount || !settings.envFileWritable}
              >
                {savingAccount ? 'Saving…' : 'Save account'}
              </button>
            </div>
          </form>
        ) : (
          <div className="settings-tab-panel">
            <div className="modal-body">
              {folderError && (
                <div className="settings-alert error" role="alert">
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{folderError}</span>
                </div>
              )}
              {folderSuccess && (
                <div className="settings-alert success" role="status">
                  <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                  <span>{folderSuccess}</span>
                </div>
              )}

              <div className="settings-info-grid">
                <div className="settings-info-row">
                  <span className="settings-info-label">Active folder</span>
                  <div className="settings-info-value strong">
                    <Folder size={14} className="tree-icon" />
                    <span>{settings.folderName || 'Folder'}</span>
                  </div>
                </div>
                <div className="settings-info-row">
                  <span className="settings-info-label">Path</span>
                  <code className="settings-info-value mono">{settings.displayPath}</code>
                </div>
              </div>

              {!locatorOpen && (
                <div className="settings-folder-action">
                  <button
                    type="button"
                    className="btn"
                    onClick={handleOpenLocator}
                    disabled={!settings.envFileWritable}
                  >
                    <FolderOpen size={14} />
                    <span>Choose folder…</span>
                  </button>
                </div>
              )}

              {locatorOpen && (
                <div className="folder-locator" aria-label="Folder locator">
                  {browseData?.quickLocations?.length > 0 && (
                    <div className="locator-quick-bar">
                      {browseData.quickLocations.map((loc) => (
                        <button
                          key={loc.id || loc.path}
                          type="button"
                          className={`locator-pill${
                            browseData.currentPath === loc.path ? ' active' : ''
                          }`}
                          onClick={() => loadDirectory(loc.path, showHidden)}
                        >
                          {loc.id === 'home' && <Home size={12} />}
                          <span>{loc.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="locator-nav-bar">
                    <div
                      ref={breadcrumbsRef}
                      className="locator-breadcrumbs"
                      title={browseData?.currentPath || ''}
                    >
                      {(browseData?.breadcrumbs || []).map((crumb, idx) => (
                        <React.Fragment key={crumb.path}>
                          {idx > 0 && <ChevronRight size={12} className="locator-crumb-sep" />}
                          <button
                            type="button"
                            className={`locator-crumb-btn${crumb.isHome ? ' is-home' : ''}`}
                            onClick={() => loadDirectory(crumb.path, showHidden)}
                            title={crumb.isHome ? `Home (${crumb.path})` : crumb.path}
                            aria-label={crumb.isHome ? 'Home folder' : crumb.name}
                          >
                            {crumb.isHome ? <Home size={13} /> : crumb.name}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="icon-btn sm"
                      onClick={() => setCreatingSubdir((v) => !v)}
                      title="Create new subfolder here"
                      aria-label="Create new subfolder"
                    >
                      <FolderPlus size={14} />
                    </button>
                  </div>

                  {creatingSubdir && (
                    <form className="locator-mkdir-row" onSubmit={handleCreateSubdir}>
                      <input
                        type="text"
                        className="input"
                        style={{ height: 28, fontSize: 12.5 }}
                        placeholder="New folder name…"
                        autoFocus
                        value={newSubdirName}
                        onChange={(e) => setNewSubdirName(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                        disabled={!newSubdirName.trim()}
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        className="btn"
                        style={{ height: 28, padding: '0 8px', fontSize: 12 }}
                        onClick={() => {
                          setCreatingSubdir(false);
                          setNewSubdirName('');
                        }}
                      >
                        Cancel
                      </button>
                    </form>
                  )}

                  <div className="locator-list">
                    {browsing ? (
                      <div className="locator-empty">Loading folders…</div>
                    ) : !browseData || browseData.directories.length === 0 ? (
                      <div className="locator-empty">No subfolders inside this folder.</div>
                    ) : (
                      browseData.directories.map((dir) => (
                        <button
                          key={dir.path}
                          type="button"
                          className="locator-row"
                          onClick={() => loadDirectory(dir.path, showHidden)}
                        >
                          <Folder size={15} className="tree-icon" />
                          <span className="locator-row-name">{dir.name}</span>
                          <ChevronRight size={14} className="locator-row-arrow" />
                        </button>
                      ))
                    )}
                  </div>

                  <div className="locator-meta-bar">
                    <span>
                      {browseData
                        ? `${browseData.markdownCount} ${
                            browseData.markdownCount === 1 ? 'Markdown file' : 'Markdown files'
                          } in "${browseData.name}"`
                        : ''}
                    </span>
                    <label className="locator-hidden-toggle">
                      <input
                        type="checkbox"
                        checked={showHidden}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setShowHidden(next);
                          if (browseData?.currentPath) {
                            loadDirectory(browseData.currentPath, next);
                          }
                        }}
                      />
                      <span>Show hidden</span>
                    </label>
                  </div>
                </div>
              )}

              {!locatorOpen && (
                <p className="modal-hint" style={{ marginTop: 10 }}>
                  Click <strong>Choose folder…</strong> to browse or create subfolders inside{' '}
                  <code>Notes</code>.
                </p>
              )}
            </div>

            <div className="modal-footer">
              {locatorOpen ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setLocatorOpen(false)}
                    disabled={savingFolder}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSelectCurrentFolder}
                    disabled={savingFolder || !browseData?.currentPath}
                  >
                    <Check size={14} />
                    <span>
                      {savingFolder
                        ? 'Switching…'
                        : `Select "${browseData?.name || 'folder'}"`}
                    </span>
                  </button>
                </>
              ) : (
                <button type="button" className="btn" onClick={onClose}>
                  Close
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
