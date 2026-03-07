# Changelog
All notable changes to Kazi Agent are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — [Semantic Versioning](https://semver.org/)

---

## [4.1.0] — 2026-03-07

### Added
- **Dark / Light Mode** — Toggle button in titlebar (☀️/🌙) or `Ctrl+Shift+T`. Theme persists across sessions.
- **Command Palette** — Press `Ctrl+K` to open a searchable command launcher (like VS Code or Linear).
  - Search and navigate to any tab, action, or setting
  - Keyboard navigable (↑/↓ arrows + Enter)
- **Keyboard Shortcuts** — Full keyboard control:
  - `Ctrl+1` → Chat tab
  - `Ctrl+2` → Browser tab
  - `Ctrl+3` → History tab
  - `Ctrl+4` → Settings tab
  - `Ctrl+N` → New chat session
  - `Ctrl+K` → Command palette
  - `Ctrl+Shift+T` → Toggle theme
  - `Escape` → Close modals

### Fixed
- **OAuth error messages** — Now show human-readable errors instead of technical codes
  - `access_denied` → "Sign-in was cancelled."
  - `bad_verification_code` → "Auth code expired. Please try signing in again."
  - Google test-mode error → "This account is not on the allowed list. Contact support."
- **Backend auth brute force** — Stricter rate limiting on `/auth/login`, `/signup`, `/oauth`
  (20 attempts per 15 minutes per IP)

---

## [4.0.0] — 2026-03-06

### Added
- **GitHub OAuth** — Sign in / sign up with GitHub (loopback callback)
- **Google OAuth** — Sign in / sign up with Google (loopback callback)
- **Multi-AI Model Bar** — Switch between Gemini Flash, Gemini Pro, ChatGPT, Claude, NotebookLM
- **Session History** — Every conversation auto-saved; browse in History tab
- **Chrome-like Tab UI** — Chat, Browser, Workflows, Memory, Settings tabs
- **Token Balance Pill** — Live token balance in titlebar

### Fixed
- `BACKEND_URL` pointing to dead domain → now correctly points to `kazi-backend-stzv.onrender.com`
- JWT token field mismatch (`jwt` vs `token`) — now accepts both
- GitHub OAuth `redirect_uri` missing from token exchange → included in exchange body
- OAuth result check `!data.jwt` failed even on success → now checks `(!data.jwt && !data.token)`

---

## [3.0.0] — (previous)

### Added
- Initial Python AI agent integration (Gemini 2.0 Flash)
- Basic chat UI
- Electron desktop shell

---

## Roadmap (v4.2.0+)
- [ ] Sentry error tracking
- [ ] PostHog analytics
- [ ] Export conversations as Markdown/PDF
- [ ] System tray with quick actions
- [ ] Auto-update with release notes
- [ ] Dark mode persistence per-window
- [ ] Plugin system for community extensions
