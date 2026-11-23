async function request(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  authStatus: () => request('/api/auth/status'),
  login: (username, password, rememberMe) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, rememberMe }),
    }),
  logout: () =>
    request('/api/auth/logout', {
      method: 'POST',
    }),

  getSettings: () => request('/api/settings'),
  browseFolders: (targetPath = '', showHidden = false) =>
    request(
      `/api/settings/browse?path=${encodeURIComponent(targetPath)}&showHidden=${
        showHidden ? '1' : '0'
      }`
    ),
  createDirectoryIn: (parentPath, name) =>
    request('/api/settings/browse/mkdir', {
      method: 'POST',
      body: JSON.stringify({ parentPath, name }),
    }),
  updateCredentials: (currentPassword, username, newPassword) =>
    request('/api/settings/credentials', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, username, newPassword }),
    }),
  updateFolderLocation: (folderDir, createIfMissing = false) =>
    request('/api/settings/folder', {
      method: 'PUT',
      body: JSON.stringify({ folderDir, createIfMissing }),
    }),

  getTree: () => request('/api/folder/tree'),
  readFile: (filePath) =>
    request(`/api/folder/file?path=${encodeURIComponent(filePath)}`),
  saveFile: (filePath, content) =>
    request('/api/folder/file', {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, content }),
    }),
  createFile: (filePath, content) =>
    request('/api/folder/file', {
      method: 'POST',
      body: JSON.stringify({ path: filePath, content }),
    }),
  createFolder: (folderPath) =>
    request('/api/folder/folder', {
      method: 'POST',
      body: JSON.stringify({ path: folderPath }),
    }),
  renameEntry: (oldPath, newPath) =>
    request('/api/folder/rename', {
      method: 'POST',
      body: JSON.stringify({ oldPath, newPath }),
    }),
  deleteEntry: (entryPath) =>
    request(`/api/folder/entry?path=${encodeURIComponent(entryPath)}`, {
      method: 'DELETE',
    }),
  search: (query) =>
    request(`/api/folder/search?q=${encodeURIComponent(query)}`),
};
