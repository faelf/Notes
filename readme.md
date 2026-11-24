# Notes

A clean, fast, self-hosted Markdown notes web app themed after **GitHub Light & GitHub Dark**. Designed to run completely self-contained in a single local Docker container on your homelab behind a **Cloudflare Tunnel (`cloudflared`)**.

# Features

- **Focused Markdown workspace**:
  - Recursive folder and `.md` file explorer with create, rename, move, and delete
  - **Edit**, **Split**, and **Preview** modes with debounced auto-save
  - GitHub-Flavored Markdown (tables, syntax-highlighted code blocks with copy button, interactive task checkboxes)
  - `[[wikilink]]` navigation and YAML frontmatter cards
  - Quick Switcher and full-text search
  - OS-aware shortcut badges (`⌘` on macOS, `Ctrl` on Windows/Linux)
- **Self-contained `Notes/` folder**:
  - All Markdown files live inside `./Notes` (created automatically on first launch and gitignored)
  - Built-in **Settings → Folder location** modal with an interactive **Folder Locator** jailed to `Notes/` (`🏠 Home`) so you can browse, create, and switch between subfolders without leaving the notes root
  - Zero external CDN dependencies
- **GitHub Light & Dark themes**:
  - Authentic GitHub Primer Light & Dark color palettes and matching syntax highlighting, persisted in `localStorage`
- **Single-user authentication & security**:
  - Salted `scrypt` password verification (`timingSafeEqual`) stored in `.env` as `AUTH_PASSWORD_HASH`
  - HMAC-SHA256 signed `HttpOnly`, `SameSite=Lax`, `Secure` (`auto`) session cookies
  - **3-attempt lockout** (15 minutes) on both the login screen and Settings password verification (`CF-Connecting-IP` aware)
  - Automatic invalidation of all older sessions on password change and logout
  - Strict `Content-Security-Policy` (`script-src 'self'`, `frame-ancestors 'none'`), `Cache-Control: no-store` on `/api/*`, and same-origin CSRF checks on `POST`/`PUT`/`DELETE`
  - Non-root Docker container (`USER node`) with `cap_drop: [ALL]` and `no-new-privileges:true`

# Keyboard Shortcuts

| macOS | Windows / Linux | Action                            |
| ----- | --------------- | --------------------------------- |
| `⌘ K` | `Ctrl + K`      | Quick switcher & full-text search |
| `⌘ S` | `Ctrl + S`      | Save current note                 |
| `⌘ E` | `Ctrl + E`      | Toggle Edit / Preview             |
| `⌘ B` | `Ctrl + B`      | Toggle sidebar                    |

# Quick Start (Local)

```bash
npm install
cp .env.example .env
```

Edit `.env` with your credentials (generate a password hash with `npm run hash-password` and a random session secret with `openssl rand -hex 32`), then build and run:

```bash
npm run build
npm start
```

Open `http://127.0.0.1:3000`. The `./Notes` folder is created automatically on first launch.

For development with hot reload:

```bash
npm run dev
```

# Homelab Deployment (Docker + Cloudflare Tunnel)

The container runs **completely self-contained** with no host volumes — `.env` is copied into `/app/.env` at build time and `/app/Notes` is created automatically on first launch.

1. Create and configure `.env` from `.env.example`:

   ```bash
   cp .env.example .env
   npm run hash-password
   openssl rand -hex 32
   ```

   Update `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, and `SESSION_SECRET` in `.env`, then lock file permissions on the host:

   ```bash
   chmod 600 .env
   ```

2. Build and start the container:

   ```bash
   docker compose up -d --build
   ```

   - Runs as non-root `node` (UID `1000`) with `cap_drop: [ALL]` and `no-new-privileges:true`.
   - Automatically binds `0.0.0.0:3000` inside Docker and publishes host port `8007` (`http://<homelab-host>:8007`).

3. Connect your **Cloudflare Tunnel**:
   - In **Cloudflare Zero Trust → Networks → Tunnels**, point your public hostname (e.g. `notes.yourdomain.com`) to `http://notes:3000` (Docker network) or `http://127.0.0.1:8007`.
   - **Recommended**: Add a **Cloudflare Access** policy in front of your hostname for edge MFA (email OTP, GitHub/Google SSO, or Passkey).

## Important Notes (Volume-Free Container)

- `docker compose stop`, `start`, and `restart` preserve all notes and Settings edits inside the container.
- Running `docker compose down` or rebuilding (`docker compose up --build`) creates a fresh container. Always back up your notes before recreating the container:

  ```bash
  docker cp notes:/app/Notes ./Notes-backup
  ```

- Because `.env` is embedded inside the local image, **never push the built image to a public Docker registry**.

# Environment Variables (`.env`)

| Variable             | Description                                                             | Default                                    |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------ |
| `PORT`               | HTTP server port                                                        | `"3000"`                                   |
| `HOST`               | Bind address locally (Docker always binds `0.0.0.0`)                    | `"127.0.0.1"`                              |
| `AUTH_USERNAME`      | Single-user login username                                              | _(required)_                               |
| `AUTH_PASSWORD_HASH` | Salted `scrypt` hash (`npm run hash-password`, recommended)             | _(required unless `AUTH_PASSWORD` is set)_ |
| `AUTH_PASSWORD`      | Plaintext password fallback (replaced by hash when changed in Settings) | —                                          |
| `SESSION_SECRET`     | Random 64-char hex secret (`openssl rand -hex 32`)                      | _(ephemeral if omitted)_                   |
| `COOKIE_SECURE`      | `"auto"` (HTTPS/Cloudflare + local HTTP), `"true"`, or `"false"`        | `"auto"`                                   |
| `SESSION_TTL_DAYS`   | Default session duration in days (30 days with "Keep me signed in")     | `"7"`                                      |
| `ACTIVE_FOLDER`      | Optional subfolder inside `Notes/` (managed automatically by Settings)  | _(root `Notes/`)_                          |
