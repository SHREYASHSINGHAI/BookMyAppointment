const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const jwt = require('jsonwebtoken');
const { getDentistById, updateDentist } = require('../services/database');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    req.dentist = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// POST /api/payment/create-order (For Frontend to trigger payment)
router.post('/create-order', auth, async (req, res) => {
  try {
    const { amount, currency, plan } = req.body;
    
    const options = {
      amount: amount * 100, // Razorpay works in paise
      currency: currency || "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        plan: plan
      }
    };

    const order = await razorpay.orders.create(options);
    res.json({ success: true, order });
  } catch (error) {
    console.error("[Razorpay Create Order Error]", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/payment/verify (To verify payment signature after frontend success)
router.post('/verify', auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      // Payment is authentic. Update database user record with active subscription
      const dentist = await getDentistById(req.dentist.dentistId);
      if (!dentist) return res.status(404).json({ error: "Dentist not found" });

      await updateDentist(dentist.id, {
        subscriptionStatus: plan || "active"
      });

      res.json({ success: true, message: "Payment verified successfully" });
    } else {
      res.status(400).json({ success: false, error: "Invalid signature" });
    }
  } catch (error) {
    console.error("[Razorpay Verify Error]", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/webhook/razorpay (For Razorpay background Webhooks)
const webhookRouter = express.Router();
webhookRouter.post('/', express.json(), (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET is not configured.');
    return res.status(400).send('Webhook secret not configured');
  }

  // Verify Webhook Signature
  const signature = req.headers['x-razorpay-signature'];
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(400).send('Invalid signature');
  }

  const event = req.body.event;
  
  switch (event) {
    case 'payment.captured':
      console.log('Payment Captured:', req.body.payload.payment.entity);
      break;
    case 'payment.failed':
      console.log('Payment Failed:', req.body.payload.payment.entity);
      break;
    case 'subscription.charged':
      console.log('Subscription Charged:', req.body.payload.subscription.entity);
      break;
    default:
      console.log(`Unhandled event type ${event}`);
  }

  res.json({ status: 'ok' });
});

module.exports = { paymentRouter: router, webhookRouter };
