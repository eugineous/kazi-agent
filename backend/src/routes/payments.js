'use strict';
const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PLANS = {
  basic: { kes: 500,   tokens: 3000  },
  pro:   { kes: 1000,  tokens: 10000 },
};

// ── Get M-Pesa OAuth token ────────────────────────────────────
async function getMpesaToken() {
  const creds = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const base  = process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
  const res   = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` }
  });
  const data  = await res.json();
  return { token: data.access_token, base };
}

// ── POST /payments/mpesa/initiate ─────────────────────────────
router.post('/mpesa/initiate', requireAuth, async (req, res) => {
  try {
    const { plan, phone } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan. Use: basic | pro' });
    if (!phone)       return res.status(400).json({ error: 'phone required (format: 2547XXXXXXXX)' });

    const { kes, tokens } = PLANS[plan];
    const { token, base } = await getMpesaToken();

    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password  = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

    const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: process.env.MPESA_SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        TransactionType:   'CustomerPayBillOnline',
        Amount:            kes,
        PartyA:            phone,
        PartyB:            process.env.MPESA_SHORTCODE,
        PhoneNumber:       phone,
        CallBackURL:       process.env.MPESA_CALLBACK_URL,
        AccountReference:  'KaziAgent',
        TransactionDesc:   `Kazi ${plan} plan - ${tokens} tokens`
      })
    });
    const stk = await stkRes.json();
    if (stk.ResponseCode !== '0') {
      return res.status(400).json({ error: stk.errorMessage || 'STK Push failed', raw: stk });
    }

    // Save pending payment
    await db.query(
      `INSERT INTO payments (user_id, amount_kes, tokens_added, plan, merchant_req, checkout_req, phone, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
      [req.user.id, kes, tokens, plan, stk.MerchantRequestID, stk.CheckoutRequestID, phone]
    );

    return res.json({
      success:          true,
      message:          'STK Push sent. Check your phone to complete the payment.',
      checkout_req_id:  stk.CheckoutRequestID
    });
  } catch (e) {
    console.error('/payments/mpesa/initiate:', e);
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ── POST /payments/mpesa/callback ─────────────────────────────
// Called by Safaricom servers on payment completion
router.post('/mpesa/callback', async (req, res) => {
  try {
    const body = req.body?.Body?.stkCallback;
    if (!body) return res.sendStatus(200);

    const checkoutReqId = body.CheckoutRequestID;
    const resultCode    = body.ResultCode;

    const { rows } = await db.query('SELECT * FROM payments WHERE checkout_req=$1 AND status=$2', [checkoutReqId, 'pending']);
    const payment = rows[0];
    if (!payment) return res.sendStatus(200);

    if (resultCode === 0) {
      // Success — find M-Pesa receipt
      const items = body.CallbackMetadata?.Item || [];
      const mpesaRef = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value || '';

      await db.query('BEGIN');
      await db.query(
        `UPDATE payments SET status='complete', mpesa_ref=$1, completed_at=NOW() WHERE id=$2`,
        [mpesaRef, payment.id]
      );
      await db.query(
        `UPDATE users SET tokens_balance = tokens_balance + $1, plan = $2 WHERE id = $3`,
        [payment.tokens_added, payment.plan, payment.user_id]
      );
      await db.query('COMMIT');

      console.log(`[Payment] ✓ ${payment.user_id} topped up ${payment.tokens_added} tokens (${payment.plan})`);
    } else {
      await db.query("UPDATE payments SET status='failed' WHERE id=$1", [payment.id]);
      console.log(`[Payment] ✗ ${payment.user_id} payment failed: ResultCode ${resultCode}`);
    }

    return res.sendStatus(200);
  } catch (e) {
    console.error('/payments/mpesa/callback:', e);
    return res.sendStatus(200); // Always 200 to Safaricom
  }
});

// ── GET /payments/history ─────────────────────────────────────
router.get('/history', requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, amount_kes, tokens_added, plan, mpesa_ref, status, created_at, completed_at
     FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
    [req.user.id]
  );
  return res.json({ success: true, payments: rows });
});

module.exports = router;
