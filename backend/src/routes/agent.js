'use strict';
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router  = express.Router();
const genAI   = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model   = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

const TOKENS_PER_CALL = 1;

const SYSTEM_PROMPT = `You are Kazi, an AI desktop agent. You see a screenshot and control the computer.

Screen size: {w}x{h}. Cursor at: ({cx},{cy}).
Task: {cmd}
{ctx}

Respond with a SINGLE JSON object (no markdown):
{"action":"click","x":500,"y":300,"button":"left","description":"..."}

Actions: click, double_click, right_click, type, key, hotkey, scroll, move, drag, screenshot, wait, done, error, ask
- type: {"action":"type","text":"hello"}
- key: {"action":"key","key":"enter"}
- hotkey: {"action":"hotkey","keys":["ctrl","c"]}
- scroll: {"action":"scroll","x":500,"y":300,"direction":"down","amount":3}
- drag: {"action":"drag","x1":100,"y1":100,"x2":200,"y2":200}
- done: {"action":"done","message":"Task completed"}
- error: {"action":"error","message":"Could not complete: reason"}
- ask: {"action":"ask","message":"I need clarification: ..."}`;

// ── POST /agent/analyze ───────────────────────────────────────
// Body: { command, screenshot_b64, context? }
router.post('/analyze', requireAuth, async (req, res) => {
  try {
    const user = req.user;

    // Token gate
    if (user.tokens_balance < TOKENS_PER_CALL) {
      return res.status(402).json({
        error:   'insufficient_tokens',
        balance: user.tokens_balance,
        message: 'You have run out of tokens. Please top up to continue.'
      });
    }

    const { command, screenshot_b64, context = '', screen_w = 1920, screen_h = 1080, cursor_x = 0, cursor_y = 0 } = req.body;
    if (!command || !screenshot_b64) return res.status(400).json({ error: 'command and screenshot_b64 required' });

    const prompt = SYSTEM_PROMPT
      .replace('{w}', screen_w).replace('{h}', screen_h)
      .replace('{cx}', cursor_x).replace('{cy}', cursor_y)
      .replace('{cmd}', command)
      .replace('{ctx}', context ? `\nPREVIOUS STEPS:\n${context}` : '');

    // Call Gemini
    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/png', data: screenshot_b64 } }
    ]);

    let text = result.response.text().trim();
    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let action;
    try {
      action = JSON.parse(text);
    } catch (_) {
      action = { action: 'error', message: 'AI returned invalid JSON: ' + text.substring(0, 100) };
    }

    // Deduct token
    await db.query('UPDATE users SET tokens_balance = tokens_balance - $1 WHERE id = $2', [TOKENS_PER_CALL, user.id]);
    await db.query(
      'INSERT INTO usage_log (user_id, tokens_used, command, action_type) VALUES ($1,$2,$3,$4)',
      [user.id, TOKENS_PER_CALL, command.substring(0, 500), action.action]
    );

    const { rows } = await db.query('SELECT tokens_balance FROM users WHERE id=$1', [user.id]);
    return res.json({ success: true, action, tokens_remaining: rows[0].tokens_balance });
  } catch (e) {
    console.error('/agent/analyze:', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ── GET /agent/balance ────────────────────────────────────────
router.get('/balance', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT tokens_balance, plan FROM users WHERE id=$1', [req.user.id]);
  return res.json({ success: true, balance: rows[0].tokens_balance, plan: rows[0].plan });
});

module.exports = router;
