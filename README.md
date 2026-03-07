# Kazi Agent ⚡

> Your AI Desktop Agent — automate anything on Windows with Gemini AI

[![Version](https://img.shields.io/badge/version-4.1.0-blue?style=flat-square)](https://github.com/eugineous/kazi-agent/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE.txt)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey?style=flat-square)](https://github.com/eugineous/kazi-agent/releases)
[![Stars](https://img.shields.io/github/stars/eugineous/kazi-agent?style=flat-square)](https://github.com/eugineous/kazi-agent/stargazers)

<!-- Add screenshot here -->

---

## What is Kazi?

Kazi is an AI-powered desktop agent for Windows that sees your screen and controls your computer. Tell it what to do in plain language — it handles the rest. Built on Google Gemini 2.0 Flash, it takes a screenshot, decides what action to take (click, type, scroll, hotkey, drag), executes it, and keeps going until the task is done.

No copy-pasting API keys. No configuration headaches. Sign in with GitHub or Google and you're running.

*Kazi means "work" in Swahili. Built for Africa. Ready for the world.*

---

## Features

- **Multi-AI Support** — Powered by Gemini 2.0 Flash Lite with screen vision; switch models from settings
- **OAuth Login** — Sign in with GitHub, Google, or email/password — zero manual setup
- **Built-in Browser** — Embedded BrowserView for browsing without leaving the app
- **Session History** — Every conversation automatically saved and searchable (up to 50 sessions)
- **Workflows** — Schedule recurring tasks with cron expressions; triggered via WebSocket push
- **Persistent Memory** — Last 100 messages of context carried across sessions per user
- **Dark/Light Mode** — Toggle with Ctrl+Shift+T or from Settings
- **Command Palette** — Ctrl+K for instant navigation across all app sections
- **Auto-Updater** — electron-updater checks GitHub Releases on startup; prompts to install
- **Picture-in-Picture** — Float a compact overlay window while working in other apps
- **System Tray** — Lives in the tray with Ctrl+Shift+K to show/hide; shows token balance
- **M-Pesa Payments** — Top up tokens directly from within the app (KES 500 / KES 1,000)
- **Encrypted JWT Storage** — Session tokens stored with OS-level encryption (safeStorage / AES-256-GCM)

---

## Quick Start

### Download (Recommended)

1. Go to [**Releases**](https://github.com/eugineous/kazi-agent/releases)
2. Download `Kazi Agent Setup 4.1.0.exe`
3. Run the installer — no admin rights required
4. Sign up or log in with GitHub or Google
5. Start chatting

**System requirements:** Windows 10/11 x64 · Python 3.8+ (required for screen control features)

### Try a command

```
Open Chrome and go to google.com
Click the search bar and type: Kazi Agent AI
Press Enter and take a screenshot of the results
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+K` | Show / hide the app window (global, works when minimized) |
| `Ctrl+K` | Open command palette |
| `Ctrl+1` | Switch to Chat tab |
| `Ctrl+2` | Switch to Browser tab |
| `Ctrl+3` | Switch to History tab |
| `Ctrl+4` | Switch to Settings tab |
| `Ctrl+N` | Start a new session |
| `Ctrl+Shift+T` | Toggle dark / light theme |
| `Escape` | Close modals and overlays |

---

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- [Python](https://www.python.org/downloads/) 3.8+
- [Git](https://git-scm.com/)

### Install and Run

```bash
# Clone the repo
git clone https://github.com/eugineous/kazi-agent.git
cd kazi-agent

# Install Electron app dependencies
cd kazi-agent
npm install

# Install Python agent dependencies
pip install -r ../python/requirements.txt

# Copy and fill in environment variables (see section below)
cp ../.env.example ../.env

# Start in development mode
npm start
```

### Build for distribution

```bash
# Windows installer (NSIS, x64)
npm run build:win

# macOS DMG (x64 + arm64)
npm run build:mac

# Linux AppImage + deb
npm run build:linux
```

Builds output to `kazi-agent/dist-electron/`.

---

## Project Structure

```
kazi-agent/                 Root repository
├── kazi-agent/             Electron desktop app
│   ├── src/
│   │   ├── main.js         Main process — window, IPC, OAuth, tray, updater
│   │   ├── renderer.js     Renderer — chat UI, tabs, history, settings
│   │   ├── preload.js      Context bridge — exposes safe IPC to renderer
│   │   ├── index.html      App shell, all CSS + HTML
│   │   └── pip.html        Picture-in-Picture overlay window
│   ├── assets/
│   │   ├── icon.png        App icon (512×512)
│   │   └── icon.ico        Windows taskbar icon
│   └── package.json
│
├── backend/                Node.js REST + WebSocket API (deployed to Render)
│   └── src/
│       ├── index.js        Express app, WebSocket server, cron jobs
│       ├── routes/
│       │   ├── auth.js     Login, signup, GitHub + Google OAuth
│       │   ├── agent.js    Gemini AI proxy, token deduction, usage logging
│       │   ├── workflows.js  CRUD for scheduled tasks
│       │   ├── payments.js M-Pesa STK Push + callback handler
│       │   └── admin.js    Admin user/metrics endpoints
│       ├── middleware/
│       │   ├── auth.js     JWT requireAuth middleware
│       │   └── validate.js Zod request validation
│       └── db/
│           ├── index.js    pg Pool singleton
│           ├── schema.sql  Auto-applied table definitions
│           └── migrate.js  Migration runner
│
├── python/                 Python AI agent (screen control)
│   ├── screen_agent.py     PyAutoGUI + mss + Gemini vision loop
│   ├── requirements.txt    Python dependencies
│   └── create_icon.py      Icon generation utility
│
└── web/                    Marketing site (deployed to Vercel)
    └── index.html
```

---

## Environment Variables

### Desktop app (`kazi-agent/.env`)

```env
# Override the backend URL (defaults to production Render deployment)
KAZI_BACKEND_URL=https://kazi-backend-stzv.onrender.com
```

### Backend (`backend/.env`)

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/kazi

# Auth
JWT_SECRET=your-very-long-random-secret
JWT_EXPIRES_IN=30d
SUPER_ADMIN_EMAIL=admin@example.com

# AI
GEMINI_API_KEY=your-gemini-api-key

# OAuth — GitHub App
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# OAuth — Google
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# M-Pesa (Safaricom Daraja)
MPESA_CONSUMER_KEY=your-consumer-key
MPESA_CONSUMER_SECRET=your-consumer-secret
MPESA_SHORTCODE=your-shortcode
MPESA_PASSKEY=your-passkey
MPESA_CALLBACK_URL=https://your-backend.onrender.com/payments/mpesa/callback
MPESA_ENV=sandbox

# Server
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://kazi-agent.vercel.app
```

---

## Deployment

### Backend (Render)

The backend auto-deploys to [Render](https://render.com) on every push to `master`.

Live API: `https://kazi-backend-stzv.onrender.com`

Manual deploy steps:
1. Fork / connect this repo to Render
2. Set root directory to `backend/`
3. Build command: `npm install`
4. Start command: `npm start`
5. Add all environment variables from the section above
6. Database: add a Render PostgreSQL instance and paste the `DATABASE_URL`

The backend runs `schema.sql` automatically on startup — no manual migration step needed.

### Web (Vercel)

The marketing site auto-deploys to [Vercel](https://vercel.com) on every push to `master`.

Live site: `https://kazi-agent.vercel.app`

Vercel project settings: Root directory = `web/`, Framework = Other.

### Desktop (GitHub Releases)

```bash
# Build the Windows installer
cd kazi-agent
npm run build:win

# Upload dist-electron/Kazi Agent Setup 4.1.0.exe to GitHub Releases
# The auto-updater checks this repo for new versions on app launch
```

electron-updater reads `package.json` `build.publish` to find the GitHub repo. Users are notified automatically when a new version is available.

---

## Token System

Kazi uses a token-based system to track AI usage:

| Plan | Price | Tokens | Daily Reset |
|---|---|---|---|
| Free | Free | 100/day | Yes, midnight EAT |
| Basic | KES 500 | 3,000 | No (one-time top-up) |
| Pro | KES 1,000 | 10,000 | No (one-time top-up) |

Each AI agent action (screenshot analysis via Gemini) costs 1 token. Top up directly in the app using M-Pesa.

---

## Safety

- **Mouse failsafe** — Move the mouse to any screen corner to abort the current AI action
- **Max steps** — The agent stops after 20 consecutive actions to prevent runaway loops
- **Token gate** — Agent calls are blocked when tokens reach 0, preventing unexpected charges
- **No API keys for users** — All Gemini calls are proxied through the backend; users never touch API keys

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit with conventional commits: `git commit -m "feat: add your feature"`
4. Push and open a Pull Request against `master`

Please keep PRs focused. One feature or fix per PR.

---

## License

MIT — see [LICENSE.txt](LICENSE.txt)

---

*Built for Africa. Ready for the world.*
