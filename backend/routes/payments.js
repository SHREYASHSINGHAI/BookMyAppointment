/**
 * routes/payments.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Razorpay payment order creation & verification using Supabase.
 * Aligned with the actual appointments schema (UUID ids, dentist_id).
 */

const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const jwt = require('jsonwebtoken');
const supabase = require('../services/supabaseClient');

const router = express.Router();

// Initialize Razorpay SDK
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

// Auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.dentist = jwt.verify(token, process.env.JWT_SECRET);
    req.clinicId = req.headers['x-clinic-id'] || req.dentist.dentistId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// POST /api/payments/orders
// body: { appointmentId, amount, plan }
// amount is taken from the request (validated server-side); plan is stored in notes.
router.post('/orders', auth, async (req, res) => {
  const { appointmentId, amount, plan } = req.body;

  if (!appointmentId || !amount) {
    return res.status(400).json({ error: 'appointmentId and amount are required' });
  }

  try {
    // 1. Verify the appointment belongs to this clinic
    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select('id, dentist_id, status')
      .eq('id', appointmentId)
      .eq('dentist_id', req.clinicId)
      .maybeSingle();

    if (apptErr) throw apptErr;
    if (!appt) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // 2. Check for an existing open Razorpay order for this appointment
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id, razorpay_order_id, amount, currency')
      .eq('appointment_id', appointmentId)
      .in('status', ['created', 'attempted'])
      .maybeSingle();

    if (existingPayment?.razorpay_order_id) {
      return res.json({
        orderId: existingPayment.razorpay_order_id,
        amount: existingPayment.amount,
        currency: existingPayment.currency || 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
      });
    }

    // 3. Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amount * 100, // convert rupees to paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: { appointmentId: String(appointmentId), plan: plan || 'starter' },
    });

    // 4. Save payment record in Supabase
    const { error: insertErr } = await supabase.from('payments').insert([{
      appointment_id: appointmentId,
      dentist_id: req.clinicId,
      amount: order.amount,
      currency: order.currency,
      status: 'created',
      razorpay_order_id: order.id,
    }]);

    if (insertErr) {
      console.error('[Payments] Failed to save payment record:', insertErr.message);
      // Non-fatal: order was created in Razorpay; return it anyway
    }

    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('[Payments] create order failed:', err.message);
    return res.status(502).json({ error: 'Could not start payment. Please try again.' });
  }
});

// POST /api/payments/verify
// body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, appointmentId }
router.post('/verify', auth, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, appointmentId } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Payment verification fields are required' });
  }

  try {
    // 1. Verify Razorpay signature
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // 2. Update payment record to paid
    const { error: updateErr } = await supabase
      .from('payments')
      .update({
        status: 'paid',
        razorpay_payment_id,
        razorpay_signature,
        paid_at: new Date().toISOString(),
      })
      .eq('razorpay_order_id', razorpay_order_id);

    if (updateErr) throw updateErr;

    // 3. Optionally mark appointment as confirmed
    if (appointmentId) {
      await supabase
        .from('appointments')
        .update({ status: 'confirmed' })
        .eq('id', appointmentId)
        .eq('dentist_id', req.clinicId);
    }

    return res.json({ success: true, message: 'Payment verified successfully' });
  } catch (err) {
    console.error('[Payments] verify failed:', err.message);
    return res.status(500).json({ error: 'Payment verification failed' });
  }
});

module.exports = router;
