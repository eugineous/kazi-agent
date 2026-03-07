'use strict';
const express = require('express');
const db      = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// ── GET /admin/users ──────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { q, plan, role } = req.query;
  let where = [];
  let params = [];
  let idx = 1;

  if (q) { where.push(`(email ILIKE $${idx} OR name ILIKE $${idx})`); params.push(`%${q}%`); idx++; }
  if (plan) { where.push(`plan=$${idx}`); params.push(plan); idx++; }
  if (role) { where.push(`role=$${idx}`); params.push(role); idx++; }

  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const { rows } = await db.query(
    `SELECT id, name, email, role, plan, tokens_balance, is_active, created_at, last_login
     FROM users ${clause} ORDER BY created_at DESC LIMIT 200`,
    params
  );
  return res.json({ success: true, users: rows });
});

// ── PUT /admin/users/:id/role ─────────────────────────────────
router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin', 'super_admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  await db.query('UPDATE users SET role=$1 WHERE id=$2', [role, req.params.id]);
  return res.json({ success: true });
});

// ── PUT /admin/users/:id/tokens ───────────────────────────────
router.put('/users/:id/tokens', async (req, res) => {
  const { tokens, mode = 'set' } = req.body; // mode: 'set' | 'add'
  if (typeof tokens !== 'number') return res.status(400).json({ error: 'tokens (number) required' });
  const sql = mode === 'add'
    ? 'UPDATE users SET tokens_balance = tokens_balance + $1 WHERE id=$2'
    : 'UPDATE users SET tokens_balance = $1 WHERE id=$2';
  await db.query(sql, [tokens, req.params.id]);
  return res.json({ success: true });
});

// ── PUT /admin/users/:id/status ───────────────────────────────
router.put('/users/:id/status', async (req, res) => {
  const { is_active } = req.body;
  await db.query('UPDATE users SET is_active=$1 WHERE id=$2', [!!is_active, req.params.id]);
  return res.json({ success: true });
});

// ── GET /admin/usage ──────────────────────────────────────────
router.get('/usage', async (req, res) => {
  const { rows: daily } = await db.query(`
    SELECT DATE(created_at) as date, SUM(tokens_used) as tokens, COUNT(*) as requests
    FROM usage_log
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at) ORDER BY date DESC
  `);
  const { rows: topUsers } = await db.query(`
    SELECT u.email, u.name, SUM(l.tokens_used) as total_tokens, COUNT(l.*) as total_requests
    FROM usage_log l JOIN users u ON u.id = l.user_id
    WHERE l.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY u.id, u.email, u.name ORDER BY total_tokens DESC LIMIT 20
  `);
  const { rows: totals } = await db.query(`
    SELECT COUNT(DISTINCT id) as total_users,
           SUM(CASE WHEN plan='free' THEN 1 ELSE 0 END) as free_users,
           SUM(CASE WHEN plan='basic' THEN 1 ELSE 0 END) as basic_users,
           SUM(CASE WHEN plan='pro' THEN 1 ELSE 0 END) as pro_users
    FROM users WHERE is_active=true
  `);
  return res.json({ success: true, daily, top_users: topUsers, totals: totals[0] });
});

// ── GET /admin/payments ───────────────────────────────────────
router.get('/payments', async (req, res) => {
  const { rows } = await db.query(`
    SELECT p.*, u.email, u.name
    FROM payments p JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC LIMIT 100
  `);
  return res.json({ success: true, payments: rows });
});

module.exports = router;
