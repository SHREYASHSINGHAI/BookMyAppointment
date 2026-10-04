const express = require('express');
const Razorpay = require('razorpay');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Initialize Postgres connection pool (uses standard PG* environment variables or DATABASE_URL)
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      }
    : undefined
);

// Initialize Razorpay SDK
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

// Auth middleware that resolves and attaches req.user.id
function authMiddleware(req, res, next) {
  // If user is already attached by previous middleware
  if (req.user && req.user.id !== undefined) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required' });
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your_super_secret_key_change_this_in_production_make_it_long_and_random'
    );
    // Support various user id conventions
    req.user = {
      ...decoded,
      id: decoded.id ?? decoded.userId ?? decoded.ownerId ?? decoded.dentistId,
    };

    if (req.user.id === undefined) {
      return res.status(401).json({ error: 'Unauthorized: User identifier missing in token payload' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

// POST /api/payments/orders   body: { appointmentId }
// Assumes an auth middleware that sets req.user.id
router.post('/orders', authMiddleware, async (req, res) => {
  const appointmentId = Number(req.body.appointmentId);
  if (!Number.isInteger(appointmentId)) {
    return res.status(400).json({ error: 'appointmentId is required' });
  }

  let client;
  let paymentId;

  try {
    client = await pool.connect();
    // 1. Load appointment; price comes from the DB, never from the client
    const { rows } = await client.query(
      `SELECT id, user_id, status, fee_paise
         FROM appointments WHERE id = $1`,
      [appointmentId]
    );
    const appt = rows[0];

    if (!appt || String(appt.user_id) !== String(req.user.id)) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    if (appt.status !== 'pending_payment') {
      return res.status(409).json({ error: 'Appointment is not awaiting payment' });
    }

    // 2. Reuse an open order if one exists (idempotent on retry/refresh)
    const open = await client.query(
      `SELECT id, amount, currency, razorpay_order_id
         FROM payments
        WHERE appointment_id = $1 AND status IN ('created','attempted')`,
      [appointmentId]
    );
    if (open.rows[0]?.razorpay_order_id) {
      const p = open.rows[0];
      return res.json({
        orderId: p.razorpay_order_id,
        amount: p.amount,
        currency: p.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      });
    }

    // 3. Insert local record first; its UUID becomes the Razorpay receipt
    const ins = await client.query(
      `INSERT INTO payments (appointment_id, user_id, amount)
       VALUES ($1, $2, $3) RETURNING id`,
      [appointmentId, req.user.id, appt.fee_paise]
    );
    paymentId = ins.rows[0].id;

    // 4. Create the Razorpay order
    const order = await razorpay.orders.create({
      amount: appt.fee_paise,          // paise
      currency: 'INR',
      receipt: paymentId,              // 36 chars, within Razorpay's 40 limit
      notes: { appointmentId: String(appointmentId), userId: String(req.user.id) },
    });

    // 5. Save order id
    await client.query(
      `UPDATE payments SET razorpay_order_id = $1, updated_at = now() WHERE id = $2`,
      [order.id, paymentId]
    );

    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,  // public key; safe for the frontend
    });
  } catch (err) {
    // Razorpay failed after we inserted: mark failed so the unique index frees up
    if (client && paymentId) {
      await client
        .query(
          `UPDATE payments SET status = 'failed', failure_reason = $1, updated_at = now() WHERE id = $2`,
          [String(err.error?.description || err.message).slice(0, 255), paymentId]
        )
        .catch(() => {});
    }
    // Concurrent request hit the partial unique index
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A payment is already in progress. Please retry.' });
    }
    console.error('create order failed', err);
    return res.status(502).json({ error: 'Could not start payment. Please try again.' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
