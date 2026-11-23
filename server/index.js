import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  config,
  getActiveFolderName,
  getDisplayFolderPath,
  updateCredentials,
  updateFolderDir,
} from './config.js';
import {
  registerAuthRoutes,
  requireAuth,
  verifyPassword,
  issueSessionCookie,
  revokeAllSessions,
  getClientIp,
  checkRateLimit,
  recordFailedAttempt,
  clearFailedAttempts,
  MAX_ATTEMPTS,
  WINDOW_MS,
} from './auth.js';
import {
  FolderError,
  getFolderTree,
  readNote,
  saveNote,
  createNote,
  createSubfolder,
  renameEntry,
  deleteEntry,
  searchNotes,
  browseDirectories,
  createDirectoryIn,
} from './folder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

const app = express();

// Trust Cloudflare Tunnel / reverse proxy headers (X-Forwarded-Proto, X-Forwarded-For)
app.set('trust proxy', 1);
app.disable('x-powered-by');

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Security headers on every response
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Prevent caching of private API responses & enforce same-origin on state-changing requests
const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');

  if (!MUTATING_METHODS.has(req.method)) {
    return next();
  }

  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite === 'cross-site') {
    return res.status(403).json({ error: 'Cross-origin request blocked' });
  }

  const expectedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (expectedHost && originHost !== expectedHost) {
        return res.status(403).json({ error: 'Cross-origin request blocked' });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid request origin' });
    }
  } else if (referer) {
    try {
      const refererHost = new URL(referer).host.toLowerCase();
      if (expectedHost && refererHost !== expectedHost) {
        return res.status(403).json({ error: 'Cross-origin request blocked' });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid request referer' });
    }
  }

  return next();
});

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Healthcheck (unauthenticated for Docker HEALTHCHECK)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Authentication routes
registerAuthRoutes(app);

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Protected settings routes
app.get('/api/settings', requireAuth, (_req, res) => {
  let envFileWritable = false;
  try {
    if (fs.existsSync(config.envFilePath)) {
      fs.accessSync(config.envFilePath, fs.constants.W_OK);
    } else {
      fs.accessSync(path.dirname(config.envFilePath), fs.constants.W_OK);
    }
    envFileWritable = true;
  } catch {
    envFileWritable = false;
  }

  res.json({
    username: config.authUsername,
    folderDir: config.folderDirRaw,
    displayPath: getDisplayFolderPath(config.folderRoot),
    folderName: getActiveFolderName(),
    envFileWritable,
  });
});

app.get(
  '/api/settings/browse',
  requireAuth,
  asyncRoute(async (req, res) => {
    const targetPath = typeof req.query.path === 'string' ? req.query.path : '';
    const showHidden = req.query.showHidden === '1' || req.query.showHidden === 'true';
    const listing = await browseDirectories(targetPath, { showHidden });
    res.json(listing);
  })
);

app.post(
  '/api/settings/browse/mkdir',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { parentPath, name } = req.body || {};
    const created = await createDirectoryIn(parentPath, name);
    res.status(201).json(created);
  })
);

app.put(
  '/api/settings/credentials',
  requireAuth,
  asyncRoute(async (req, res) => {
    const bucketKey = `settings:${getClientIp(req)}`;
    const limit = checkRateLimit(bucketKey);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      return res.status(429).json({
        error: `Too many failed password checks. Please wait ${Math.ceil(
          limit.retryAfterSec / 60
        )} minute(s).`,
      });
    }

    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword) {
      return res
        .status(400)
        .json({ error: 'Current password is required to save credential changes' });
    }
    if (!verifyPassword(currentPassword)) {
      const attemptsUsed = recordFailedAttempt(bucketKey);
      const remaining = MAX_ATTEMPTS - attemptsUsed;
      if (remaining <= 0) {
        res.setHeader('Retry-After', String(Math.ceil(WINDOW_MS / 1000)));
        return res.status(429).json({
          error: `Too many failed password checks. Locked for ${Math.ceil(
            WINDOW_MS / 60000
          )} minutes.`,
        });
      }
      return res.status(401).json({
        error: `Current password is incorrect. ${remaining} ${
          remaining === 1 ? 'attempt' : 'attempts'
        } remaining.`,
      });
    }

    clearFailedAttempts(bucketKey);

    try {
      const updated = updateCredentials({ username, newPassword });
      revokeAllSessions();
      issueSessionCookie(req, res, { username: updated.username, rememberMe: true });
      return res.json({
        ok: true,
        username: updated.username,
        passwordChanged: Boolean(newPassword),
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  })
);

app.put(
  '/api/settings/folder',
  requireAuth,
  asyncRoute(async (req, res) => {
    const folderDir = typeof req.body?.folderDir === 'string' ? req.body.folderDir : '';
    const createIfMissing = Boolean(req.body?.createIfMissing);

    try {
      const updated = updateFolderDir(folderDir, { createIfMissing });
      return res.json({
        ok: true,
        folderDir: updated.folderDir,
        displayPath: updated.displayPath,
        folderName: updated.folderName,
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  })
);

// Protected folder routes
app.get(
  '/api/folder/tree',
  requireAuth,
  asyncRoute(async (_req, res) => {
    const tree = await getFolderTree();
    res.json({ tree, folderName: getActiveFolderName() });
  })
);

app.get(
  '/api/folder/file',
  requireAuth,
  asyncRoute(async (req, res) => {
    const filePath = String(req.query.path || '');
    const note = await readNote(filePath);
    res.json(note);
  })
);

app.put(
  '/api/folder/file',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { path: filePath, content } = req.body || {};
    const saved = await saveNote(filePath, content);
    res.json(saved);
  })
);

app.post(
  '/api/folder/file',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { path: filePath, content } = req.body || {};
    const created = await createNote(filePath, content);
    res.status(201).json(created);
  })
);

app.post(
  '/api/folder/folder',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { path: folderPath } = req.body || {};
    const created = await createSubfolder(folderPath);
    res.status(201).json(created);
  })
);

app.post(
  '/api/folder/rename',
  requireAuth,
  asyncRoute(async (req, res) => {
    const { oldPath, newPath } = req.body || {};
    const result = await renameEntry(oldPath, newPath);
    res.json(result);
  })
);

app.delete(
  '/api/folder/entry',
  requireAuth,
  asyncRoute(async (req, res) => {
    const entryPath = String(req.query.path || '');
    const result = await deleteEntry(entryPath);
    res.json(result);
  })
);

app.get(
  '/api/folder/search',
  requireAuth,
  asyncRoute(async (req, res) => {
    const query = String(req.query.q || '');
    const results = await searchNotes(query);
    res.json({ results });
  })
);

// Serve built frontend when dist/ exists
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    return res.sendFile(path.join(distDir, 'index.html'));
  });
}

// 404 for unknown API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Centralized error handler
app.use((err, _req, res, _next) => {
  if (err instanceof FolderError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('[server error]', err);
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, config.host, () => {
  console.log(`Notes listening on http://${config.host}:${config.port}`);
  console.log(`Notes root folder: ${config.browseRoot}`);
  console.log(`Active folder: ${config.folderRoot}`);
});
