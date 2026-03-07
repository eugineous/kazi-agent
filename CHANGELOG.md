# Changelog
All notable changes to Kazi Agent are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) — [Semantic Versioning](https://semver.org/)

---

## [4.2.0] — 2026-03-08

### Added
- **Tray: 🆕 New Chat** — Right-click system tray → "New Chat" instantly opens the app and starts a fresh session
- **Auto-updater IPC bridge** — `window.kazi.update.{check,download,install,onAvailable,onProgress,onReady}`
  exposes auto-updater events to the renderer process for in-app update notifications
- **Navigate 'new-chat' route** — `window.kazi.onNavigate('new-chat')` now properly calls `startNewSession()`
  before switching to the chat tab (mirrors Ctrl+N shortcut)
- **6 MCPs configured** for Claude Code AI-assisted development:
  - **Context7** — Pulls live, up-to-date library docs directly into Claude's context (no hallucinated APIs)
  - **GitHub MCP** — Claude reads issues, PRs, and repo directly (say "implement issue #42")
  - **Git MCP** — Claude handles commits, branches, diffs without leaving the session
  - **Playwright MCP** — Claude runs and tests UI in a real browser, sees what breaks, fixes it
  - **Figma MCP** — Claude reads Figma designs and implements them (design→code gap eliminated)
  - **Sentry MCP** — Claude pulls real errors from Sentry with full context and resolves them
- **CI/CD Workflows** (GitHub Actions):
  - `backend-ci.yml` — Runs backend tests on every PR
  - `frontend-ci.yml` — Runs Electron app build validation
  - `deploy-backend.yml` — Auto-triggers Render redeploy on `backend/**` changes
  - `release.yml` — Auto-creates GitHub releases with changelogs
- **World-class landing page** — Complete overhaul at https://kazi-agent.vercel.app
  - Hero section with animated gradient, feature grid, download CTA
  - Social proof section, pricing tiers, FAQ
- **Chat quality improvements** (from frontend agent):
  - Copy button on agent messages (hover → clipboard icon → "Copied!" toast)
  - Markdown rendering in agent bubbles (bold, italic, code, lists, headers, code blocks)
  - Export conversation as `.md` file (date-stamped)
  - History tab search with live filtering and match highlighting
  - Character count shown below input when content is present
  - Send button auto-disabled when input is empty or agent is not ready
- **Backend: Zod input validation** on all auth endpoints (login, signup, OAuth)
- **Backend: `/metrics` endpoint** — uptime, request count, memory usage, Node version
- **Backend: export endpoint** — `GET /agent/history/export` (paginated, auth-gated)
- **Structured JSON error logging** — All backend errors log `{level,ts,method,path,status,message}`
- **`.env.example` files** — For both root and backend to guide new contributors

### Fixed
- **GitHub OAuth** — `redirect_uri` now correctly passed in the token exchange request
- **Token field normalization** — Backend returns `token`, frontend now checks both `token` and `jwt`

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
