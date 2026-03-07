# Kazi Agent — Backend API

REST + WebSocket API for the Kazi Agent desktop app. Handles authentication, Gemini AI proxying, workflow scheduling, M-Pesa payments, and real-time push via WebSocket.

**Live:** `https://kazi-backend-stzv.onrender.com`
**Deployed on:** [Render](https://render.com) — auto-deploys from `master`

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | PostgreSQL (via `pg`) |
| Auth | JWT (jsonwebtoken), bcryptjs |
| AI | Google Gemini 2.0 Flash Lite (`@google/generative-ai`) |
| Payments | Safaricom Daraja M-Pesa STK Push |
| Real-time | WebSocket (`ws`) |
| Scheduling | node-cron |
| Validation | Zod |
| Security | helmet, express-rate-limit, CORS |

---

## Quick Start (Local)

```bash
cd backend
npm install

# Copy and fill in env vars
cp .env.example .env

# Apply DB schema (also runs automatically on start)
npm run db:migrate

# Start dev server with hot-reload
npm run dev

# Or production start
npm start
```

Server starts on `PORT` (default `3001`).

---

## Environment Variables

```env
# PostgreSQL
DATABASE_URL=postgresql://user:password@host:5432/kazi

# Auth
JWT_SECRET=your-very-long-random-secret-min-32-chars
JWT_EXPIRES_IN=30d
SUPER_ADMIN_EMAIL=admin@example.com

# Google Gemini
GEMINI_API_KEY=your-gemini-api-key

# GitHub OAuth App
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Google OAuth
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

## API Reference

All authenticated endpoints require the header:

```
Authorization: Bearer <jwt>
```

JWTs are issued on login/signup and expire after 30 days.

---

### Auth — `/auth`

#### `POST /auth/signup`

Create a new account.

**Body:**
```json
{
  "name": "Alice Njoroge",
  "email": "alice@example.com",
  "password": "min8chars"
}
```

**Response `200`:**
```json
{
  "success": true,
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "name": "Alice Njoroge",
    "email": "alice@example.com",
    "role": "user",
    "plan": "free",
    "tokens_balance": 100
  }
}
```

**Errors:** `400` missing fields / weak password · `409` email already registered · `500` server error

---

#### `POST /auth/login`

Log in with email and password.

**Body:**
```json
{
  "email": "alice@example.com",
  "password": "yourpassword"
}
```

**Response `200`:** Same shape as `/auth/signup`.

**Errors:** `400` missing fields · `401` wrong email or password / OAuth account · `403` account disabled

---

#### `POST /auth/oauth/github`

Exchange a GitHub OAuth authorization code for a Kazi JWT. The desktop app opens the GitHub auth URL in the system browser, captures the callback code via a local HTTP server, then calls this endpoint.

**Body:**
```json
{
  "code": "github-oauth-code",
  "redirect_uri": "http://127.0.0.1:PORT/callback"
}
```

**Response `200`:** Same shape as `/auth/signup`.

**Errors:** `400` missing code or GitHub token exchange failed · `500` server error

---

#### `POST /auth/oauth/google`

Exchange a Google OAuth authorization code for a Kazi JWT.

**Body:**
```json
{
  "code": "google-oauth-code",
  "redirect_uri": "http://127.0.0.1:PORT/callback"
}
```

**Response `200`:** Same shape as `/auth/signup`.

**Errors:** `400` missing code or Google token exchange failed · `500` server error

---

#### `GET /auth/me`

Return the current user's profile. Used by the desktop app to validate a stored JWT on launch.

**Auth:** Required

**Response `200`:**
```json
{
  "success": true,
  "user": { "id": "...", "name": "...", "email": "...", "role": "...", "plan": "...", "tokens_balance": 95 }
}
```

---

### Agent — `/agent`

#### `POST /agent/analyze`

Send a screenshot and command to Gemini. The backend deducts 1 token per call and logs usage.

**Auth:** Required

**Body (JSON, up to 10 MB):**
```json
{
  "command": "Click the blue Submit button",
  "screenshot_b64": "<base64-encoded PNG>",
  "context": "Previous steps: clicked search bar, typed query",
  "screen_w": 1920,
  "screen_h": 1080,
  "cursor_x": 500,
  "cursor_y": 300
}
```

**Response `200`:**
```json
{
  "success": true,
  "action": {
    "action": "click",
    "x": 847,
    "y": 423,
    "button": "left",
    "description": "Clicking the blue Submit button"
  },
  "tokens_remaining": 94
}
```

**Possible `action` values:**

| Action | Fields |
|---|---|
| `click` | `x`, `y`, `button` (`left`/`right`/`middle`) |
| `double_click` | `x`, `y` |
| `right_click` | `x`, `y` |
| `type` | `text` |
| `key` | `key` (e.g. `"enter"`, `"escape"`) |
| `hotkey` | `keys` (e.g. `["ctrl", "c"]`) |
| `scroll` | `x`, `y`, `direction` (`up`/`down`), `amount` |
| `drag` | `x1`, `y1`, `x2`, `y2` |
| `move` | `x`, `y` |
| `screenshot` | _(no extra fields — take another screenshot)_ |
| `wait` | _(pause briefly)_ |
| `done` | `message` |
| `error` | `message` |
| `ask` | `message` (clarification needed) |

**Errors:** `400` missing command or screenshot · `402` insufficient tokens · `500` Gemini error

---

#### `GET /agent/balance`

Get the authenticated user's current token balance and plan.

**Auth:** Required

**Response `200`:**
```json
{
  "success": true,
  "balance": 94,
  "plan": "free"
}
```

---

### Workflows — `/workflows`

Workflows are recurring tasks executed on a cron schedule. When a workflow fires, the backend pushes a `workflow:trigger` message over WebSocket to the user's connected desktop app.

#### `GET /workflows`

List all workflows for the current user.

**Auth:** Required

**Response `200`:**
```json
{
  "success": true,
  "workflows": [
    {
      "id": "uuid",
      "name": "Daily report",
      "command": "Open Excel and save the daily sheet",
      "cron": "0 9 * * 1-5",
      "timezone": "Africa/Nairobi",
      "enabled": true,
      "last_run": "2026-03-06T06:00:00.000Z",
      "next_run": "2026-03-07T06:00:00.000Z",
      "run_count": 12,
      "created_at": "2026-01-15T10:00:00.000Z"
    }
  ]
}
```

---

#### `POST /workflows`

Create a new workflow.

**Auth:** Required

**Body:**
```json
{
  "name": "Daily report",
  "command": "Open Excel and save the daily sheet",
  "cron": "0 9 * * 1-5",
  "timezone": "Africa/Nairobi"
}
```

**Response `200`:**
```json
{
  "success": true,
  "workflow": { "id": "uuid", ... }
}
```

**Errors:** `400` missing fields or invalid cron expression

---

#### `PUT /workflows/:id`

Update an existing workflow. All fields are optional — only provided fields are updated.

**Auth:** Required (must own the workflow)

**Body:**
```json
{
  "name": "Updated name",
  "enabled": false
}
```

**Response `200`:**
```json
{
  "success": true,
  "workflow": { "id": "uuid", ... }
}
```

**Errors:** `400` invalid cron · `404` not found / not owned

---

#### `DELETE /workflows/:id`

Delete a workflow.

**Auth:** Required (must own the workflow)

**Response `200`:**
```json
{ "success": true }
```

---

### Payments — `/payments`

M-Pesa integration via Safaricom Daraja API (STK Push). On successful payment, the user's token balance is credited and plan is upgraded automatically.

#### `POST /payments/mpesa/initiate`

Initiate an STK Push to the user's phone. The user will receive a payment prompt on their handset.

**Auth:** Required

**Body:**
```json
{
  "plan": "basic",
  "phone": "254712345678"
}
```

**Plans:**

| Plan | Amount (KES) | Tokens |
|---|---|---|
| `basic` | 500 | 3,000 |
| `pro` | 1,000 | 10,000 |

**Phone format:** `2547XXXXXXXX` (Kenyan format, no leading `+`)

**Response `200`:**
```json
{
  "success": true,
  "message": "STK Push sent. Check your phone to complete the payment.",
  "checkout_req_id": "ws_CO_..."
}
```

**Errors:** `400` invalid plan or phone · `500` Safaricom API error

---

#### `POST /payments/mpesa/callback`

Webhook called by Safaricom servers when a payment completes or fails. This endpoint is not authenticated — Safaricom calls it directly.

On success: credits `tokens_added` to the user's `tokens_balance` and updates their `plan`.
On failure: marks payment as `failed`.

Always responds `200` to Safaricom regardless of outcome (required by Daraja spec).

---

#### `GET /payments/history`

Get the current user's last 20 payment transactions.

**Auth:** Required

**Response `200`:**
```json
{
  "success": true,
  "payments": [
    {
      "id": "uuid",
      "amount_kes": 500,
      "tokens_added": 3000,
      "plan": "basic",
      "mpesa_ref": "RGJH4K2PXS",
      "status": "complete",
      "created_at": "2026-03-01T12:00:00.000Z",
      "completed_at": "2026-03-01T12:01:30.000Z"
    }
  ]
}
```

---

### System

#### `GET /health`

Health check. Returns `200` when the server is up.

```json
{ "status": "ok", "ts": "2026-03-07T09:00:00.000Z" }
```

#### `GET /metrics`

Runtime metrics (uptime, request count, memory).

```json
{
  "status": "ok",
  "uptime_seconds": 86400,
  "requests_total": 12500,
  "memory_mb": 128,
  "node_version": "v20.11.0",
  "ts": "2026-03-07T09:00:00.000Z"
}
```

---

## WebSocket

Connect to receive real-time events:

```
wss://kazi-backend-stzv.onrender.com/ws?token=<jwt>
```

The JWT is verified on connection. Invalid tokens are rejected with close code `1008`.

**Events pushed by the server:**

```json
// Workflow fired — desktop app should execute the command
{ "type": "workflow:trigger", "id": "uuid", "name": "Daily report", "command": "Open Excel..." }

// Workflow failed (not enough tokens)
{ "type": "workflow:error", "id": "uuid", "name": "Daily report", "reason": "insufficient_tokens" }

// Token balance updated after payment
{ "type": "tokens:updated", "balance": 3094 }

// Handshake confirmation
{ "type": "connected" }
```

---

## Rate Limits

| Scope | Limit |
|---|---|
| All endpoints | 200 requests / 15 minutes |
| `/agent/*` | 30 requests / 1 minute |
| `/auth/login` | 20 requests / 15 minutes |
| `/auth/signup` | 20 requests / 15 minutes |
| `/auth/oauth/*` | 20 requests / 15 minutes |

Exceeding a limit returns `429 Too Many Requests`.

---

## Cron Jobs

Two scheduled tasks run on the backend:

**Daily token reset** (`0 21 * * *` UTC = midnight EAT)
Resets `tokens_balance` to `tokens_daily_cap` for all users on the free plan whose balance is below the cap.

**Workflow scheduler** (every minute)
Checks for enabled workflows whose `next_run` has passed and pushes `workflow:trigger` events to connected WebSocket clients.

---

## Database Schema

Tables created automatically from `src/db/schema.sql` on server start:

| Table | Purpose |
|---|---|
| `users` | Accounts, plan, token balance, OAuth provider |
| `workflows` | Scheduled tasks with cron expressions |
| `payments` | M-Pesa transaction records |
| `usage_log` | Per-call AI usage log (user, tokens, command, action type) |

---

## Error Format

All error responses follow this shape:

```json
{ "error": "Human-readable message" }
```

Common HTTP status codes:

| Code | Meaning |
|---|---|
| `400` | Bad request — missing or invalid fields |
| `401` | Unauthorized — bad credentials or expired JWT |
| `402` | Payment required — insufficient tokens |
| `403` | Forbidden — account disabled or wrong role |
| `404` | Not found |
| `409` | Conflict — e.g. email already registered |
| `429` | Too many requests — rate limit exceeded |
| `500` | Internal server error |

---

## Deployment (Render)

1. Connect this repo to Render, set root directory to `backend/`
2. Build command: `npm install`
3. Start command: `npm start`
4. Add a **PostgreSQL** database instance on Render; copy the `DATABASE_URL` into env vars
5. Set all environment variables listed above
6. The first deploy applies `schema.sql` automatically — no manual migration needed

**Note:** The free Render tier spins down after 15 minutes of inactivity. The first request after a cold start takes ~30 seconds. Use a paid tier or an uptime monitor for production use.
