import React, { useState } from 'react';
import { BookOpen, Lock, Moon, Sun, AlertCircle } from 'lucide-react';

export function LoginScreen({ theme, onToggleTheme, onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onLogin(username.trim(), password, rememberMe);
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <button
        type="button"
        className="icon-btn login-theme-btn"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Switch to GitHub Light' : 'Switch to GitHub Dark'}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">
            <BookOpen size={24} />
          </div>
          <h1 className="login-title">Sign in to Notes</h1>
          <p className="login-subtitle">Self-hosted Markdown notes</p>
        </div>

        <form className="login-card" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error" role="alert">
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-field">
            <label className="form-label" htmlFor="login-username">
              Username
            </label>
            <input
              id="login-username"
              type="text"
              className="input"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={submitting}
            />
            <span>Keep me signed in for 30 days</span>
          </label>

          <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-footer">
          <Lock size={13} />
          <span>Private homelab instance · Single-user access</span>
        </div>
      </div>
    </div>
  );
}
