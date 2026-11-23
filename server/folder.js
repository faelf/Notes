import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { config, isPathInside } from './config.js';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);

export class FolderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function isMarkdownFile(fileName) {
  return MARKDOWN_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export function stripMdExt(fileName) {
  return fileName.replace(/\.(md|markdown)$/i, '');
}

export function normalizeRelPath(rawPath, { allowEmpty = false } = {}) {
  if (typeof rawPath !== 'string') {
    throw new FolderError(400, 'Path must be a string');
  }
  const cleaned = rawPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  if (!cleaned) {
    if (allowEmpty) return '';
    throw new FolderError(400, 'Path cannot be empty');
  }
  if (cleaned.includes('\0')) {
    throw new FolderError(400, 'Invalid path');
  }

  const segments = cleaned.split('/');
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed || trimmed === '.' || trimmed === '..') {
      throw new FolderError(400, 'Invalid path segment');
    }
    if (trimmed.startsWith('.')) {
      throw new FolderError(400, 'Hidden files and folders are not allowed');
    }
    if (/[<>:"|?*]/.test(trimmed)) {
      throw new FolderError(400, 'Path contains disallowed characters');
    }
  }
  return segments.join('/');
}

function assertInsideRoot(absPath) {
  const root = config.folderRoot;
  if (absPath !== root && !absPath.startsWith(root + path.sep)) {
    throw new FolderError(403, 'Access outside the configured folder is forbidden');
  }
}

async function assertRealAncestorsInsideRoot(targetAbs) {
  let cursor = targetAbs;
  while (true) {
    if (fsSync.existsSync(cursor)) {
      const real = await fs.realpath(cursor);
      assertInsideRoot(real);
      return;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new FolderError(403, 'Invalid folder path');
    }
    cursor = parent;
  }
}

export async function resolveNotePath(rawPath, { allowEmpty = false } = {}) {
  const relPath = normalizeRelPath(rawPath, { allowEmpty });
  const absPath = relPath ? path.resolve(config.folderRoot, relPath) : config.folderRoot;
  assertInsideRoot(absPath);
  await assertRealAncestorsInsideRoot(absPath);
  return { relPath, absPath };
}

async function walkDirectory(absDir, relPrefix) {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const folders = [];
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }
    const entryRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const entryAbs = path.join(absDir, entry.name);

    let stat;
    try {
      const real = await fs.realpath(entryAbs);
      assertInsideRoot(real);
      stat = await fs.stat(real);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const children = await walkDirectory(entryAbs, entryRel);
      folders.push({
        type: 'folder',
        name: entry.name,
        path: entryRel,
        children,
      });
    } else if (stat.isFile() && isMarkdownFile(entry.name)) {
      files.push({
        type: 'file',
        name: entry.name,
        title: stripMdExt(entry.name),
        path: entryRel,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return [...folders, ...files];
}

export async function getFolderTree() {
  return walkDirectory(config.folderRoot, '');
}

export async function readNote(rawPath) {
  const { relPath, absPath } = await resolveNotePath(rawPath);
  if (!isMarkdownFile(relPath)) {
    throw new FolderError(400, 'Only Markdown (.md) files can be opened');
  }

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    throw new FolderError(404, 'File not found');
  }
  if (!stat.isFile()) {
    throw new FolderError(400, 'Target is not a file');
  }

  const content = await fs.readFile(absPath, 'utf8');
  const name = path.basename(relPath);
  return {
    path: relPath,
    name,
    title: stripMdExt(name),
    content,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

export async function saveNote(rawPath, content) {
  if (typeof content !== 'string') {
    throw new FolderError(400, 'Content must be a string');
  }
  const { relPath, absPath } = await resolveNotePath(rawPath);
  if (!isMarkdownFile(relPath)) {
    throw new FolderError(400, 'Only Markdown (.md) files can be saved');
  }

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf8');
  const stat = await fs.stat(absPath);
  const name = path.basename(relPath);
  return {
    path: relPath,
    name,
    title: stripMdExt(name),
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

export async function createNote(rawPath, initialContent) {
  let candidate = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!candidate) {
    throw new FolderError(400, 'File name is required');
  }
  if (!isMarkdownFile(candidate)) {
    candidate = `${candidate}.md`;
  }

  const { relPath, absPath } = await resolveNotePath(candidate);
  if (fsSync.existsSync(absPath)) {
    throw new FolderError(409, 'A file or folder with that name already exists');
  }

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const name = path.basename(relPath);
  const title = stripMdExt(name);
  const content = typeof initialContent === 'string' ? initialContent : `# ${title}\n\n`;

  await fs.writeFile(absPath, content, 'utf8');
  const stat = await fs.stat(absPath);
  return {
    path: relPath,
    name,
    title,
    content,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

export async function createSubfolder(rawPath) {
  const { relPath, absPath } = await resolveNotePath(rawPath);
  if (fsSync.existsSync(absPath)) {
    throw new FolderError(409, 'A folder or file with that name already exists');
  }
  await fs.mkdir(absPath, { recursive: true });
  return {
    type: 'folder',
    name: path.basename(relPath),
    path: relPath,
  };
}

export async function renameEntry(rawOldPath, rawNewPath) {
  const { relPath: oldRel, absPath: oldAbs } = await resolveNotePath(rawOldPath);
  if (!fsSync.existsSync(oldAbs)) {
    throw new FolderError(404, 'Source item not found');
  }
  const stat = await fs.stat(oldAbs);

  let targetRaw = typeof rawNewPath === 'string' ? rawNewPath.trim() : '';
  if (!targetRaw) {
    throw new FolderError(400, 'New path is required');
  }
  if (stat.isFile() && !isMarkdownFile(targetRaw)) {
    targetRaw = `${targetRaw}.md`;
  }

  const { relPath: newRel, absPath: newAbs } = await resolveNotePath(targetRaw);
  if (oldRel === newRel) {
    return { oldPath: oldRel, newPath: newRel, type: stat.isDirectory() ? 'folder' : 'file' };
  }
  if (fsSync.existsSync(newAbs)) {
    throw new FolderError(409, 'Destination already exists');
  }
  if (stat.isDirectory() && newAbs.startsWith(oldAbs + path.sep)) {
    throw new FolderError(400, 'Cannot move a folder inside itself');
  }

  await fs.mkdir(path.dirname(newAbs), { recursive: true });
  await fs.rename(oldAbs, newAbs);

  return {
    oldPath: oldRel,
    newPath: newRel,
    type: stat.isDirectory() ? 'folder' : 'file',
  };
}

export async function deleteEntry(rawPath) {
  const { relPath, absPath } = await resolveNotePath(rawPath);
  if (absPath === config.folderRoot) {
    throw new FolderError(400, 'Cannot delete root folder');
  }
  if (!fsSync.existsSync(absPath)) {
    throw new FolderError(404, 'Item not found');
  }
  await fs.rm(absPath, { recursive: true, force: false });
  return { deleted: relPath };
}

async function collectMarkdownFiles(absDir, relPrefix, out) {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const entryRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const entryAbs = path.join(absDir, entry.name);
    let stat;
    try {
      const real = await fs.realpath(entryAbs);
      assertInsideRoot(real);
      stat = await fs.stat(real);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      await collectMarkdownFiles(entryAbs, entryRel, out);
    } else if (stat.isFile() && isMarkdownFile(entry.name)) {
      out.push({ relPath: entryRel, absPath: entryAbs, name: entry.name, mtime: stat.mtime });
    }
  }
}

export async function searchNotes(rawQuery) {
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';
  const allFiles = [];
  await collectMarkdownFiles(config.folderRoot, '', allFiles);

  if (!query) {
    return allFiles
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 30)
      .map((f) => ({
        path: f.relPath,
        title: stripMdExt(f.name),
        updatedAt: f.mtime.toISOString(),
        matchType: 'recent',
        snippet: '',
      }));
  }

  const qLower = query.toLowerCase();
  const results = [];

  for (const f of allFiles) {
    const title = stripMdExt(f.name);
    const titleMatch = title.toLowerCase().includes(qLower);
    const pathMatch = f.relPath.toLowerCase().includes(qLower);

    let snippet = '';
    let contentMatch = false;
    let lineNumber = null;

    try {
      const text = await fs.readFile(f.absPath, 'utf8');
      const idx = text.toLowerCase().indexOf(qLower);
      if (idx !== -1) {
        contentMatch = true;
        const before = text.slice(0, idx);
        lineNumber = before.split('\n').length;
        const start = Math.max(0, idx - 55);
        const end = Math.min(text.length, idx + query.length + 85);
        snippet = text
          .slice(start, end)
          .replace(/\s+/g, ' ')
          .trim();
        if (start > 0) snippet = `…${snippet}`;
        if (end < text.length) snippet = `${snippet}…`;
      }
    } catch {
      continue;
    }

    if (titleMatch || pathMatch || contentMatch) {
      const score = (titleMatch ? 100 : 0) + (pathMatch ? 40 : 0) + (contentMatch ? 20 : 0);
      results.push({
        path: f.relPath,
        title,
        updatedAt: f.mtime.toISOString(),
        matchType: titleMatch ? 'title' : contentMatch ? 'content' : 'path',
        lineNumber,
        snippet,
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return results.slice(0, 40);
}

/* ======================== SERVER DIRECTORY LOCATOR (JAILED TO BROWSE_ROOT) ======================== */

function assertInsideBrowseRoot(absPath) {
  if (!isPathInside(absPath, config.browseRoot)) {
    throw new FolderError(403, 'Access outside the allowed notes root is forbidden');
  }
}

function buildBreadcrumbs(absDir) {
  const root = config.browseRoot;
  const rel = absDir === root ? '' : path.relative(root, absDir);
  const parts = rel ? rel.split(path.sep).filter(Boolean) : [];
  const crumbs = [{ name: path.basename(root) || 'Home', path: root, isHome: true }];

  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    crumbs.push({ name: part, path: cursor, isHome: false });
  }
  return crumbs;
}

function getQuickLocations() {
  return [
    { id: 'home', label: 'Home', path: config.browseRoot },
    { id: 'active', label: 'Active folder', path: config.folderRoot },
  ];
}

export async function browseDirectories(rawPath, { showHidden = false } = {}) {
  const target =
    typeof rawPath === 'string' && rawPath.trim() ? path.resolve(rawPath.trim()) : config.folderRoot;

  if (target.includes('\0')) {
    throw new FolderError(400, 'Invalid directory path');
  }

  let realPath;
  try {
    realPath = await fs.realpath(target);
    assertInsideBrowseRoot(realPath);
    const stat = await fs.stat(realPath);
    if (!stat.isDirectory()) {
      throw new FolderError(400, 'Path is not a directory');
    }
  } catch (err) {
    if (err instanceof FolderError) throw err;
    throw new FolderError(404, 'Directory not found or not accessible');
  }

  let entries;
  try {
    entries = await fs.readdir(realPath, { withFileTypes: true });
  } catch {
    throw new FolderError(403, 'Permission denied reading this directory');
  }

  const directories = [];
  let markdownCount = 0;

  for (const entry of entries) {
    if (!showHidden && entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;

    const full = path.join(realPath, entry.name);
    let targetReal;
    let stat;
    try {
      targetReal = await fs.realpath(full);
      if (!isPathInside(targetReal, config.browseRoot)) continue;
      stat = await fs.stat(targetReal);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      try {
        await fs.access(targetReal, fsSync.constants.R_OK);
        directories.push({ name: entry.name, path: targetReal });
      } catch {
        // Skip unreadable directories
      }
    } else if (stat.isFile() && isMarkdownFile(entry.name)) {
      markdownCount++;
    }
  }

  directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const parent = path.dirname(realPath);
  const parentPath =
    realPath !== config.browseRoot && isPathInside(parent, config.browseRoot) ? parent : null;

  return {
    currentPath: realPath,
    name: path.basename(realPath) || realPath,
    parentPath,
    breadcrumbs: buildBreadcrumbs(realPath),
    markdownCount,
    directories,
    quickLocations: getQuickLocations(),
  };
}

export async function createDirectoryIn(rawParentPath, rawName) {
  if (typeof rawParentPath !== 'string' || !rawParentPath.trim()) {
    throw new FolderError(400, 'Parent directory is required');
  }
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name || name === '.' || name === '..' || name.startsWith('.') || /[/\\<>:"|?*\0]/.test(name)) {
    throw new FolderError(400, 'Invalid folder name');
  }

  const parentReal = await fs.realpath(path.resolve(rawParentPath.trim()));
  assertInsideBrowseRoot(parentReal);

  const nextDir = path.join(parentReal, name);
  assertInsideBrowseRoot(nextDir);

  if (fsSync.existsSync(nextDir)) {
    throw new FolderError(409, 'A folder or file with that name already exists');
  }

  await fs.mkdir(nextDir);
  return { name, path: nextDir };
}
