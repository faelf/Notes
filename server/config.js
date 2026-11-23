import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ENV_FILE_PATH = path.resolve(process.env.ENV_FILE || '.env');

// Load .env file (override: true ensures changes saved to a mounted .env survive docker restart)
if (fs.existsSync(ENV_FILE_PATH)) {
  dotenv.config({ path: ENV_FILE_PATH, override: true });
} else {
  dotenv.config();
}

export function deriveScryptHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function formatEnvValue(value) {
  const str = String(value);
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Updates keys in .env in place (preserving comments, ordering, and single-file Docker bind mounts).
 */
export function persistEnvUpdates(updates = {}, keysToRemove = []) {
  const removeSet = new Set(keysToRemove);
  let lines = [];

  if (fs.existsSync(ENV_FILE_PATH)) {
    const raw = fs.readFileSync(ENV_FILE_PATH, 'utf8');
    lines = raw.split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
  }

  const remainingUpdates = new Map(Object.entries(updates));
  const nextLines = [];

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      const key = match[1];
      if (removeSet.has(key)) {
        continue;
      }
      if (remainingUpdates.has(key)) {
        nextLines.push(`${key} = ${formatEnvValue(remainingUpdates.get(key))}`);
        remainingUpdates.delete(key);
        continue;
      }
    }
    nextLines.push(line);
  }

  for (const [key, val] of remainingUpdates.entries()) {
    nextLines.push(`${key} = ${formatEnvValue(val)}`);
  }

  fs.writeFileSync(ENV_FILE_PATH, `${nextLines.join('\n')}\n`, 'utf8');

  for (const key of removeSet) {
    delete process.env[key];
  }
  for (const [key, val] of Object.entries(updates)) {
    process.env[key] = String(val);
  }

  return ENV_FILE_PATH;
}

export function isPathInside(targetAbs, rootAbs) {
  return targetAbs === rootAbs || targetAbs.startsWith(rootAbs + path.sep);
}

function loadConfig() {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const host = process.env.FORCE_BIND_ALL === 'true' ? '0.0.0.0' : process.env.HOST || '0.0.0.0';

  // Fixed root folder: always ./Notes inside the app directory (created automatically on first boot)
  const browseRootRaw = './Notes';
  const resolvedBrowseRoot = path.resolve(browseRootRaw);
  fs.mkdirSync(resolvedBrowseRoot, { recursive: true });
  const browseRoot = fs.realpathSync(resolvedBrowseRoot);

  // Optional subfolder inside ./Notes selected via Settings
  const activeSubfolder = (process.env.ACTIVE_FOLDER || '').trim();
  let folderRoot = browseRoot;
  let folderDirRaw = browseRootRaw;

  if (activeSubfolder) {
    const candidate = path.resolve(browseRoot, activeSubfolder);
    if (isPathInside(candidate, browseRoot)) {
      fs.mkdirSync(candidate, { recursive: true });
      const realCandidate = fs.realpathSync(candidate);
      if (isPathInside(realCandidate, browseRoot)) {
        folderRoot = realCandidate;
        folderDirRaw = path.join(browseRootRaw, path.relative(browseRoot, realCandidate));
      }
    } else {
      console.warn(
        `[security] ACTIVE_FOLDER (${activeSubfolder}) escapes Notes root. Falling back to Notes.`
      );
    }
  }

  const authUsername = (process.env.AUTH_USERNAME || '').trim();
  const envPasswordHash = (process.env.AUTH_PASSWORD_HASH || '').trim();
  const envPassword = process.env.AUTH_PASSWORD || '';

  if (!authUsername) {
    throw new Error('AUTH_USERNAME is required. Set it in your .env file.');
  }

  let authPasswordHash = '';
  if (envPasswordHash) {
    const parts = envPasswordHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt' || !parts[1] || !parts[2]) {
      throw new Error(
        'AUTH_PASSWORD_HASH must be in format scrypt$<salt_hex>$<hash_hex>. Run `npm run hash-password` to generate one.'
      );
    }
    authPasswordHash = envPasswordHash;
  } else if (envPassword) {
    authPasswordHash = deriveScryptHash(envPassword);
  } else {
    throw new Error(
      'Either AUTH_PASSWORD_HASH or AUTH_PASSWORD must be set in your .env file. Refusing to start without credentials.'
    );
  }

  let sessionSecret = (process.env.SESSION_SECRET || '').trim();
  if (!sessionSecret || sessionSecret.length < 16) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[auth] SESSION_SECRET not set (or too short). Generated an ephemeral secret; sessions will reset on restart.'
    );
  }

  const cookieSecureMode = (process.env.COOKIE_SECURE || 'auto').toLowerCase();
  const sessionTtlDays = Math.max(1, Number.parseInt(process.env.SESSION_TTL_DAYS || '7', 10) || 7);

  return {
    port,
    host,
    envFilePath: ENV_FILE_PATH,
    browseRootRaw,
    browseRoot,
    folderDirRaw,
    folderRoot,
    authUsername,
    authPasswordHash,
    sessionSecret,
    cookieSecureMode,
    sessionTtlDays,
    isProd: process.env.NODE_ENV === 'production',
  };
}

export const config = loadConfig();

export function getActiveFolderName() {
  return path.basename(config.folderRoot) || config.folderRoot;
}

/**
 * Returns a clean display path relative to BROWSE_ROOT (avoids exposing host OS paths in UI).
 */
export function getDisplayFolderPath(absDir = config.folderRoot) {
  const rootName = path.basename(config.browseRoot) || 'Notes';
  if (absDir === config.browseRoot) {
    return rootName;
  }
  const rel = path.relative(config.browseRoot, absDir).split(path.sep).join('/');
  return `${rootName}/${rel}`;
}

export function updateCredentials({ username, newPassword }) {
  const nextUsername = typeof username === 'string' ? username.trim() : config.authUsername;
  if (!nextUsername) {
    throw new Error('Username cannot be empty');
  }
  if (nextUsername.length > 64 || /[\r\n\0]/.test(nextUsername)) {
    throw new Error('Invalid username');
  }

  const envUpdates = { AUTH_USERNAME: nextUsername };
  const keysToRemove = [];
  let nextHash = config.authPasswordHash;

  if (typeof newPassword === 'string' && newPassword.length > 0) {
    if (newPassword.length < 4) {
      throw new Error('New password must be at least 4 characters');
    }
    nextHash = deriveScryptHash(newPassword);
    envUpdates.AUTH_PASSWORD_HASH = nextHash;
    keysToRemove.push('AUTH_PASSWORD');
  }

  try {
    persistEnvUpdates(envUpdates, keysToRemove);
  } catch (err) {
    console.error('[config] Failed to write .env:', err.message);
    throw new Error(`Could not write to .env file (${err.code || err.message})`);
  }

  config.authUsername = nextUsername;
  config.authPasswordHash = nextHash;

  return {
    username: config.authUsername,
    persistedToEnv: true,
  };
}

export function updateFolderDir(rawDir, { createIfMissing = false } = {}) {
  if (typeof rawDir !== 'string' || !rawDir.trim()) {
    throw new Error('Folder path cannot be empty');
  }
  const cleaned = rawDir.trim();
  if (cleaned.includes('\0') || /[\r\n]/.test(cleaned)) {
    throw new Error('Invalid folder path');
  }

  const resolved = path.resolve(cleaned);
  if (!isPathInside(resolved, config.browseRoot)) {
    throw new Error('Selected folder must be inside the allowed notes root');
  }

  if (fs.existsSync(resolved)) {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new Error('Target path exists but is not a folder');
    }
  } else if (createIfMissing) {
    fs.mkdirSync(resolved, { recursive: true });
  } else {
    throw new Error('Folder does not exist');
  }

  fs.accessSync(resolved, fs.constants.R_OK | fs.constants.W_OK);
  const real = fs.realpathSync(resolved);

  if (!isPathInside(real, config.browseRoot)) {
    throw new Error('Selected folder must be inside the allowed notes root');
  }

  const relFromBrowse = path.relative(config.browseRoot, real).split(path.sep).join('/');

  try {
    if (relFromBrowse) {
      persistEnvUpdates({ ACTIVE_FOLDER: relFromBrowse }, ['BROWSE_ROOT', 'NOTES_DIR', 'VAULT_DIR']);
    } else {
      persistEnvUpdates({}, ['ACTIVE_FOLDER', 'BROWSE_ROOT', 'NOTES_DIR', 'VAULT_DIR']);
    }
  } catch (err) {
    console.error('[config] Failed to write ACTIVE_FOLDER to .env:', err.message);
    throw new Error(`Could not write to .env file (${err.code || err.message})`);
  }

  config.folderDirRaw = relFromBrowse ? `./Notes/${relFromBrowse}` : './Notes';
  config.folderRoot = real;

  return {
    folderDir: config.folderDirRaw,
    displayPath: getDisplayFolderPath(config.folderRoot),
    folderName: getActiveFolderName(),
  };
}
