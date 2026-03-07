'use strict';
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const http       = require('http');
const WebSocket  = require('ws');
const cron       = require('node-cron');
const db         = require('./db');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// ── Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [process.env.FRONTEND_URL || '*', 'app://kazi', 'null'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));  // screenshots can be large

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
const agentLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many requests' } });
app.use(limiter);
app.use('/agent', agentLimiter);

// ── Routes ────────────────────────────────────────────────────
app.use('/auth',     require('./routes/auth'));
app.use('/agent',    require('./routes/agent'));
app.use('/payments', require('./routes/payments'));
app.use('/workflows',require('./routes/workflows'));
app.use('/admin',    require('./routes/admin'));

app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── WebSocket (for workflow push notifications) ────────────────
const clients = new Map();  // userId → Set<WebSocket>

wss.on('connection', (ws, req) => {
  const params  = new URL(req.url, 'http://localhost').searchParams;
  const token   = params.get('token');
  let userId    = null;

  try {
    const jwt     = require('jsonwebtoken');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    userId        = payload.sub;
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);
    ws.send(JSON.stringify({ type: 'connected' }));
  } catch (_) {
    ws.close(1008, 'Invalid token');
    return;
  }

  ws.on('close', () => {
    if (userId && clients.has(userId)) {
      clients.get(userId).delete(ws);
      if (clients.get(userId).size === 0) clients.delete(userId);
    }
  });
});

function pushToUser(userId, data) {
  const sockets = clients.get(userId);
  if (!sockets) return;
  const msg = JSON.stringify(data);
  sockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

// ── Cron Jobs ─────────────────────────────────────────────────

// 1. Reset free-plan tokens at midnight (Nairobi time = UTC+3)
cron.schedule('0 21 * * *', async () => {   // 21:00 UTC = midnight EAT
  try {
    const { rowCount } = await db.query(
      "UPDATE users SET tokens_balance = tokens_daily_cap WHERE plan='free' AND tokens_balance < tokens_daily_cap"
    );
    console.log(`[Cron] Daily token reset: ${rowCount} users refreshed`);
  } catch (e) { console.error('[Cron] Token reset error:', e); }
});

// 2. Workflow scheduler — check every minute
cron.schedule('* * * * *', async () => {
  try {
    const { rows } = await db.query(
      "SELECT w.*, u.tokens_balance FROM workflows w JOIN users u ON u.id=w.user_id WHERE w.enabled=true AND w.next_run <= NOW()"
    );
    for (const wf of rows) {
      if (wf.tokens_balance < 1) {
        pushToUser(wf.user_id, { type: 'workflow:error', id: wf.id, name: wf.name, reason: 'insufficient_tokens' });
        continue;
      }
      // Push workflow trigger to user's desktop app
      pushToUser(wf.user_id, { type: 'workflow:trigger', id: wf.id, name: wf.name, command: wf.command });
      // Update last_run and next_run
      await db.query(
        "UPDATE workflows SET last_run=NOW(), run_count=run_count+1, next_run=NOW() + INTERVAL '1 minute' WHERE id=$1",
        [wf.id]  // simplified; in production compute from cron expression
      );
    }
  } catch (e) { console.error('[Cron] Workflow scheduler error:', e); }
});

// ── Auto-migrate on startup ───────────────────────────────────
async function runMigrations() {
  try {
    const schemaPath = require('path').join(__dirname, 'db', 'schema.sql');
    const sql = require('fs').readFileSync(schemaPath, 'utf8');
    await db.query(sql);
    console.log('✅ DB migrations applied');
  } catch (e) {
    console.error('⚠️  Migration warning (non-fatal):', e.message);
  }
}

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
runMigrations().then(() => {
  server.listen(PORT, () => {
    console.log(`⚡ Kazi Backend running on port ${PORT}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`   DB:       ${process.env.DATABASE_URL ? 'connected' : 'NOT SET'}`);
    console.log(`   Gemini:   ${process.env.GEMINI_API_KEY ? 'configured' : 'NOT SET'}`);
  });
});

module.exports = { app, pushToUser };
