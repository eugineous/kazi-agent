-- ─────────────────────────────────────────────────────────────
-- KAZI AGENT — Database Schema
-- Run: psql $DATABASE_URL -f src/db/schema.sql
-- ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  password_hash   TEXT,                        -- NULL for OAuth users
  provider        TEXT NOT NULL DEFAULT 'email',  -- email | github | google
  provider_id     TEXT,                        -- OAuth provider user ID
  avatar_url      TEXT,
  role            TEXT NOT NULL DEFAULT 'user',   -- user | admin | super_admin
  plan            TEXT NOT NULL DEFAULT 'free',   -- free | basic | pro
  tokens_balance  INTEGER NOT NULL DEFAULT 300,
  tokens_daily_cap INTEGER NOT NULL DEFAULT 300,  -- daily free cap (free plan)
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_plan  ON users(plan);

-- ── Payments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_kes    INTEGER NOT NULL,
  tokens_added  INTEGER NOT NULL,
  plan          TEXT,                          -- basic | pro
  mpesa_ref     TEXT,                          -- M-Pesa transaction ID
  merchant_req  TEXT,                          -- MerchantRequestID
  checkout_req  TEXT,                          -- CheckoutRequestID
  phone         TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | complete | failed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_user   ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_mpesa  ON payments(mpesa_ref);

-- ── Usage Log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tokens_used INTEGER NOT NULL DEFAULT 1,
  command     TEXT,
  action_type TEXT,                            -- e.g. 'agent_analyze'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_log(created_at);

-- ── Workflows ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  command     TEXT NOT NULL,
  cron        TEXT NOT NULL,                   -- e.g. '0 9 * * 1-5'
  timezone    TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  last_run    TIMESTAMPTZ,
  next_run    TIMESTAMPTZ,
  run_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_user    ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_next    ON workflows(next_run) WHERE enabled = true;

-- ── WebSocket Sessions (for workflow push) ────────────────────
CREATE TABLE IF NOT EXISTS ws_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  socket_id   TEXT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
