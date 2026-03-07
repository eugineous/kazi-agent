'use strict';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db       = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });
}

function safeUser(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

// ── POST /auth/signup ─────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const emailKey = email.toLowerCase().trim();
    const exists   = await db.query('SELECT id FROM users WHERE email=$1', [emailKey]);
    if (exists.rows[0]) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const role = emailKey === process.env.SUPER_ADMIN_EMAIL ? 'super_admin' : 'user';
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, provider, role)
       VALUES ($1,$2,$3,'email',$4) RETURNING *`,
      [name.trim(), emailKey, hash, role]
    );
    const user  = rows[0];
    const token = signToken(user.id);
    await db.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);
    return res.json({ success: true, token, user: safeUser(user) });
  } catch (e) {
    console.error('/auth/signup:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /auth/login ──────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const emailKey = email.toLowerCase().trim();
    const { rows } = await db.query('SELECT * FROM users WHERE email=$1', [emailKey]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'No account with this email' });
    if (user.provider !== 'email') return res.status(401).json({ error: `This account uses ${user.provider} login` });
    if (!user.is_active) return res.status(403).json({ error: 'Account disabled' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect password' });

    const token = signToken(user.id);
    await db.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id]);
    return res.json({ success: true, token, user: safeUser(user) });
  } catch (e) {
    console.error('/auth/login:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /auth/oauth/github ───────────────────────────────────
router.post('/oauth/github', async (req, res) => {
  try {
    const { code, redirect_uri, redirectUri: redirectUriCamel } = req.body;
    const redirectUri = redirect_uri || redirectUriCamel || '';
    if (!code) return res.status(400).json({ error: 'code required' });

    // Exchange code for token — redirect_uri MUST match what was sent in authorization request
    const exchangeBody = { client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code };
    if (redirectUri) exchangeBody.redirect_uri = redirectUri;
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(exchangeBody)
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('[GitHub OAuth] token exchange failed:', JSON.stringify(tokenData));
      return res.status(400).json({ error: tokenData.error_description || tokenData.error || 'GitHub token exchange failed' });
    }

    const [userRes, emailRes] = await Promise.all([
      fetch('https://api.github.com/user',       { headers: { Authorization: `Bearer ${tokenData.access_token}` } }),
      fetch('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${tokenData.access_token}` } }),
    ]);
    const ghUser  = await userRes.json();
    const emails  = await emailRes.json();
    const primary = (Array.isArray(emails) ? emails.find(e => e.primary) : null)?.email
                    || `${ghUser.login}@users.noreply.github.com`;
    const emailKey = primary.toLowerCase();

    let { rows } = await db.query('SELECT * FROM users WHERE email=$1', [emailKey]);
    let user = rows[0];
    const role = emailKey === process.env.SUPER_ADMIN_EMAIL ? 'super_admin' : (user?.role || 'user');
    if (!user) {
      const ins = await db.query(
        `INSERT INTO users (name, email, provider, provider_id, avatar_url, role)
         VALUES ($1,$2,'github',$3,$4,$5) RETURNING *`,
        [ghUser.name || ghUser.login, emailKey, String(ghUser.id), ghUser.avatar_url, role]
      );
      user = ins.rows[0];
    } else {
      await db.query('UPDATE users SET avatar_url=$1, last_login=NOW() WHERE id=$2', [ghUser.avatar_url, user.id]);
      user.avatar_url = ghUser.avatar_url;
    }

    const token = signToken(user.id);
    return res.json({ success: true, token, user: safeUser(user) });
  } catch (e) {
    console.error('/auth/oauth/github:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /auth/oauth/google ───────────────────────────────────
router.post('/oauth/google', async (req, res) => {
  try {
    const { code, redirect_uri, redirectUri: redirectUriCamel } = req.body;
  const redirectUri = redirect_uri || redirectUriCamel || '';
    if (!code) return res.status(400).json({ error: 'code required' });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri || '', grant_type: 'authorization_code' })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('[Google OAuth] token exchange failed:', JSON.stringify(tokenData));
      return res.status(400).json({ error: tokenData.error_description || tokenData.error || 'Google token exchange failed' });
    }

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const gUser   = await userRes.json();
    const emailKey = gUser.email.toLowerCase();

    let { rows } = await db.query('SELECT * FROM users WHERE email=$1', [emailKey]);
    let user = rows[0];
    const role = emailKey === process.env.SUPER_ADMIN_EMAIL ? 'super_admin' : (user?.role || 'user');
    if (!user) {
      const ins = await db.query(
        `INSERT INTO users (name, email, provider, provider_id, avatar_url, role)
         VALUES ($1,$2,'google',$3,$4,$5) RETURNING *`,
        [gUser.name, emailKey, gUser.id, gUser.picture, role]
      );
      user = ins.rows[0];
    } else {
      await db.query('UPDATE users SET avatar_url=$1, last_login=NOW() WHERE id=$2', [gUser.picture, user.id]);
      user.avatar_url = gUser.picture;
    }

    const token = signToken(user.id);
    return res.json({ success: true, token, user: safeUser(user) });
  } catch (e) {
    console.error('/auth/oauth/google:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /auth/me ──────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, user: safeUser(req.user) });
});

module.exports = router;
