'use strict';
const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Helper: compute next run from cron expression (simple, uses node-cron)
function getNextRun(cronExpr) {
  try {
    const cron = require('node-cron');
    // node-cron doesn't expose nextDate natively; use rough calculation
    // For production use 'cron' npm package which does expose nextDate
    return new Date(Date.now() + 60000); // fallback: 1 min from now
  } catch (_) { return null; }
}

// ── GET /workflows ────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM workflows WHERE user_id=$1 ORDER BY created_at DESC',
    [req.user.id]
  );
  return res.json({ success: true, workflows: rows });
});

// ── POST /workflows ───────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, command, cron, timezone = 'Africa/Nairobi' } = req.body;
    if (!name || !command || !cron) return res.status(400).json({ error: 'name, command, cron required' });

    // Validate cron
    const nodeCron = require('node-cron');
    if (!nodeCron.validate(cron)) return res.status(400).json({ error: 'Invalid cron expression' });

    const nextRun = getNextRun(cron);
    const { rows } = await db.query(
      `INSERT INTO workflows (user_id, name, command, cron, timezone, next_run)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, name, command, cron, timezone, nextRun]
    );
    return res.json({ success: true, workflow: rows[0] });
  } catch (e) {
    console.error('/workflows POST:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /workflows/:id ────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, command, cron, timezone, enabled } = req.body;
    const { rows } = await db.query('SELECT * FROM workflows WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Workflow not found' });

    const wf = rows[0];
    const newCron = cron || wf.cron;
    if (cron) {
      const nodeCron = require('node-cron');
      if (!nodeCron.validate(cron)) return res.status(400).json({ error: 'Invalid cron expression' });
    }

    const { rows: updated } = await db.query(
      `UPDATE workflows SET
         name=$1, command=$2, cron=$3, timezone=$4, enabled=$5, next_run=$6
       WHERE id=$7 AND user_id=$8 RETURNING *`,
      [
        name ?? wf.name, command ?? wf.command, newCron,
        timezone ?? wf.timezone, enabled ?? wf.enabled,
        getNextRun(newCron), req.params.id, req.user.id
      ]
    );
    return res.json({ success: true, workflow: updated[0] });
  } catch (e) {
    console.error('/workflows PUT:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /workflows/:id ─────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  await db.query('DELETE FROM workflows WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  return res.json({ success: true });
});

module.exports = router;
