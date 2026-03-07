# CLAUDE.md — Kazi Agent Engineering Standards

> Best practices for AI-assisted development on the Kazi Agent project.
> Combines Boris Cherny (Claude Code creator) workflow principles with Kazi-specific context.

---

## Project Context

```
App:     Kazi Agent — AI Desktop Assistant for Africa
Stack:   Electron 28 + Python (Gemini 2.0 Flash) + Node.js backend
Repo:    C:\Users\eugin\OneDrive\Documents\kazi-agent\
GitHub:  https://github.com/eugineous/kazi-agent
Live:    https://kazi-agent.vercel.app
Backend: https://kazi-backend-stzv.onrender.com

Key Files:
  src/main.js         → Electron main process, IPC, OAuth, tray
  src/renderer.js     → UI logic, chat, tabs, session history
  src/preload.js      → Context bridge (main ↔ renderer)
  src/index.html      → App UI shell + all CSS
  python/screen_agent.py → AI agent (Gemini, pyautogui, mss)
  backend/src/routes/ → All cloud API routes
  web/                → Vercel landing page
```

---

## Workflow Orchestration

### 1. Plan First (Default)
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity
- Always invoke `00-planning` skill before starting complex work

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## Kazi-Specific Rules

### IPC / Electron Bridge
- ALL new IPC handlers go in `main.js` with `ipcMain.handle('namespace:action', ...)`
- ALL new bridge methods go in `preload.js` inside the correct namespace object
- NEVER use `ipcRenderer.send` for two-way calls — always `ipcRenderer.invoke`
- Always add error handling: `try { ... } catch (e) { return { success: false, error: e.message }; }`

### UI / Renderer
- Dark mode variables defined in `:root` — never hardcode colors
- All modals use `hidden` class toggle — never `display:none` inline
- Tab content sections use `data-section` + `active-section` pattern
- Toast notifications via `showToast(msg, type)` — never `alert()`

### Python Agent
- Gemini model: `gemini-2.0-flash` (NOT `gemini-2.5-flash` — that breaks)
- Always check Python path: try `python`, `python3`, `py` in that order
- Screenshot capture uses `mss` — `pyautogui` for mouse/keyboard
- Agent must handle `SIGTERM` gracefully and clean up on exit

### Git Standards
- Branch naming: `feat/description`, `fix/description`, `chore/description`
- Commit format: `type(scope): description` (e.g. `feat(workflows): add CRUD UI`)
- Never force-push to master
- Tag releases: `git tag v4.2.0 && git push --tags`

### API / Backend
- All routes under `backend/src/routes/` with express Router
- Auth middleware applied to protected routes only
- Environment variables in `.env` — never hardcoded, never committed
- Render auto-deploys on push to master

---

## Known Issues & Gotchas

| Issue | Status | Fix |
|-------|--------|-----|
| Google OAuth fails for non-test users | Open | App in testing mode on Google Console |
| GitHub OAuth redirect_uri | Fixed | Pass redirect_uri in token exchange |
| Python path on Windows | Fixed | Auto-detect python/python3/py in main.js |
| Electron binary location | Fixed | `node_modules/electron/dist/electron.exe` |
| WSL broken on this machine | Known | Use PowerShell/CMD instead |
| Node.js not in bash PATH | Known | Use PowerShell or direct .exe paths |

---

## Environment

```
OS:       Windows 11
Python:   C:\Users\eugin\AppData\Local\Programs\Python\Python312\
Node:     Available via electron .exe directly
Electron: kazi-agent\node_modules\electron\dist\electron.exe
Launch:   RUN_KAZI.bat or INSTALL_AND_RUN.bat
```
