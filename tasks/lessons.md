# Kazi Agent — Lessons Learned

> Per the CLAUDE.md Self-Improvement Loop: after ANY correction, log the pattern here.
> Review this file at the start of each session.

---

## Lesson 001 — Gemini Model Name (2026-03-08)
**Mistake:** Used `models/gemini-2.5-flash` as model ID in Python agent.
**Cause:** Assumed newer version number = better/available.
**Fix:** Changed to `gemini-2.0-flash` — the correct model ID for the Gemini 2.0 Flash API.
**Rule:** Always verify the exact model ID string against the Gemini API docs before using it.

---

## Lesson 002 — Edit Tool Requires Read First (2026-03-08)
**Mistake:** Tried to `Edit` a file without reading it first in the current session.
**Cause:** Assumed file content was still in context from a previous turn.
**Fix:** Always call `Read` on the specific file (or relevant line range) before any `Edit`.
**Rule:** Context does not persist across sessions. Read before every Edit, no exceptions.

---

## Lesson 003 — GitHub OAuth Redirect URI (2026-03-08)
**Mistake:** GitHub OAuth token exchange failed — missing `redirect_uri` in POST body.
**Cause:** GitHub requires `redirect_uri` in both the auth URL and the token exchange request.
**Fix:** Added `redirect_uri` param to the token exchange fetch in `backend/src/routes/auth.js`.
**Rule:** For any OAuth provider, pass `redirect_uri` consistently in both steps.

---

## Lesson 004 — Chrome File Upload Blocked by Browser Security (2026-03-08)
**Mistake:** Attempted automated file upload of Chrome passwords CSV via `file_upload` tool.
**Cause:** Browser security blocks automated uploads of sensitive files from untrusted paths.
**Error:** `{"code":-32000,"message":"Not allowed"}`
**Fix:** Cannot automate — user must click "Choose File" manually for CSV imports.
**Rule:** File uploads for sensitive data (passwords, credentials) always require manual user action.

---

## Lesson 005 — Bitwarden Import Format Selector (2026-03-08)
**Mistake:** Typed "Chrome (csv)" into the format dropdown — `form_input` returned "No items found".
**Cause:** The exact string didn't match the dropdown option name.
**Fix:** Used `triple_click` to clear, then typed just "Chrome" — found the option correctly.
**Rule:** For dropdowns with search, use the shortest unambiguous term, not the full label.

---

## Lesson 006 — .tmp File Was JPEG Image (2026-03-08)
**Mistake:** Assumed user's `.tmp` file was text (CLAUDE.md content) and tried to `Read` it as text.
**Cause:** `.tmp` extension gives no type hint. File was actually a JPEG screenshot.
**Detection:** File content started with JFIF header bytes — classic JPEG signature.
**Fix:** Copied to `.jpg` extension, split into 4 sections with PowerShell + System.Drawing, read each section as image.
**Rule:** When reading unknown binary files, check the magic bytes first. JFIF/FFD8 = JPEG.

---

## Lesson 007 — About Section Had Hardcoded Version (2026-03-08)
**Mistake:** About section showed "v3.0.0" even though app was at v4.x.
**Cause:** Version string was hardcoded in HTML — never updated when package.json changed.
**Fix:** Added `<span id="about-version">` populated dynamically via `app:version` IPC.
**Rule:** Any value that changes with releases (version, build date) must be dynamic, not hardcoded.

---

## Lesson 008 — Workflows Tab Was Empty Shell (2026-03-08)
**Mistake:** Workflows tab had HTML modal + IPC handlers in main.js but zero renderer.js logic.
**Cause:** Feature was scaffolded but not completed — IPC existed, UI didn't.
**Fix:** Implemented full CRUD: `renderWorkflowList()`, `loadWorkflowsUI()`, `openWorkflowModal()`, `deleteWorkflow()`, save handler.
**Rule:** Before shipping a feature, check: does the renderer actually call the IPC? Is there a UI to trigger it?

---

## Template (copy for new lessons)

## Lesson 00X — [Short Title] ([Date])
**Mistake:** What went wrong.
**Cause:** Why it happened.
**Fix:** What was done to resolve it.
**Rule:** The general rule to prevent this class of mistake.
