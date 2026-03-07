# Kazi Agent — Task Tracker

> Updated: 2026-03-08
> Current Version: v4.3.0

---

## ✅ Completed (v4.2.0 — 2026-03-08)

- [x] Bump version 4.1.0 → 4.2.0 in package.json
- [x] Add `app:version` IPC handler in main.js
- [x] Expose `getVersion()` via preload.js context bridge
- [x] Fix About section — dynamic version via `<span id="about-version">`
- [x] Auto-update UI — banner, progress bar, download + install buttons
- [x] Workflows CRUD — full list / create / edit / delete in renderer.js
- [x] Cron preset buttons in workflow modal
- [x] Tab switch triggers `loadWorkflowsUI()` for workflows tab
- [x] Push to GitHub: `feat(app): v4.2.0 — workflows CRUD, auto-update UI, dynamic version`

## ✅ Completed (Infrastructure — 2026-03-08)

- [x] Configure Context7 MCP in ~/.claude/settings.json
- [x] Configure GitHub MCP with PAT
- [x] Configure Git MCP pointing to kazi-agent repo
- [x] Configure Playwright MCP
- [x] Configure Figma MCP with real token (figd_VAt8...)
- [x] Create Bitwarden vault with "Kazi Agent — API Keys & Tokens" note
- [x] Create CLAUDE.md with Boris Cherny best practices
- [x] Create tasks/todo.md + tasks/lessons.md

---

## 🔄 In Progress

- [ ] Sentry MCP — needs account + SENTRY_AUTH_TOKEN + SENTRY_ORG slug
- [ ] Chrome passwords CSV import into Bitwarden (user must click "Choose File" manually)
- [ ] Delete Chrome Passwords CSV from Downloads after import (security)

---

## ✅ Completed (v4.3.0 — 2026-03-08)

- [x] Fix startNewSession() — clears chat DOM, memory, input, focuses textarea
- [x] Onboarding wizard — 3-step first-run modal (Welcome → Choose AI → All Set)
- [x] Gemini API key (BYOK) — Settings card with password field + show/hide toggle
- [x] Persist AI model selection — saved to settings.aiModel, restored on load
- [x] Theme toggle in Settings — light/dark switch persisted in settings
- [x] DEFAULT_SETTINGS — added aiModel + geminiApiKey fields to main.js
- [x] Python agent spawn uses user's Gemini API key when set

## 📋 Next Up (v4.4.0)

- [ ] Workflow scheduler — actually run cron jobs (node-cron in main.js), not just define
- [ ] Session restore — clicking history card loads actual messages into chat
- [ ] Export chat — as Markdown or PDF from the Export button
- [ ] M-Pesa payment flow — complete the buy tokens UI end-to-end
- [ ] Notification center — aggregate agent events, workflow runs, update alerts
- [ ] App auto-launch on Windows startup (startWithWindows already wired in main.js)

---

## 🗓 Backlog

- [ ] Dark/light mode toggle in titlebar (not just settings)
- [ ] Export chat history as PDF/Markdown
- [ ] M-Pesa integration for Africa payment workflows
- [ ] App auto-launch on Windows startup (startWithWindows already wired in main.js)
- [ ] Plugin system — user-installable workflow templates
- [ ] Mobile companion app (React Native)

---

## Review Notes

### v4.2.0 Retrospective
**What went well:** Full workflows CRUD was zero from hero — modal HTML existed but no renderer logic, now it's fully functional. Auto-update UI is production-grade with progress bar and install-on-restart flow.

**What to watch:** Workflows IPC calls rely on `window.kazi.workflows.*` — ensure backend returns consistent `{ success, workflows }` shape. Test with empty workflow list (no crash).

**Lessons learned:** See `tasks/lessons.md`
