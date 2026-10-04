-- ============================================================================
-- Payment Gateway Schema for BookMyAppointment
-- ============================================================================

-- 1. Payment Status Enum
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM
      ('created', 'attempted', 'paid', 'failed', 'partially_refunded', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id      BIGINT NOT NULL REFERENCES appointments(id),
  user_id             BIGINT NOT NULL REFERENCES users(id),
  amount              BIGINT NOT NULL CHECK (amount > 0),   -- in paise, never floats
  currency            CHAR(3) NOT NULL DEFAULT 'INR',
  status              payment_status NOT NULL DEFAULT 'created',
  razorpay_order_id   TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_signature  TEXT,
  method              TEXT,            -- upi / card / netbanking / wallet
  failure_reason      TEXT,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most ONE open (unpaid) payment per appointment
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_open_per_appointment
  ON payments (appointment_id)
  WHERE status IN ('created', 'attempted');

CREATE INDEX IF NOT EXISTS idx_payments_appointment ON payments (appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments (user_id, created_at DESC);

-- 3. Refunds Table
CREATE TABLE IF NOT EXISTS refunds (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id         UUID NOT NULL REFERENCES payments(id),
  amount             BIGINT NOT NULL CHECK (amount > 0),
  razorpay_refund_id TEXT UNIQUE,
  status             TEXT NOT NULL DEFAULT 'pending',   -- pending / processed / failed
  reason             TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds (payment_id);

-- 4. Payment Events Table (Webhook Event Deduping & Audit Log)
CREATE TABLE IF NOT EXISTS payment_events (
  id                BIGSERIAL PRIMARY KEY,
  razorpay_event_id TEXT NOT NULL UNIQUE,   -- from X-Razorpay-Event-Id header; dedupes retries
  event_type        TEXT NOT NULL,          -- payment.captured, payment.failed, ...
  payload           JSONB NOT NULL,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Companion Schema Notes / Prerequisites:
-- If your `appointments` or `users` tables are not yet configured with BIGINT IDs
-- or missing `fee_paise` and `user_id`, run the following migration helpers:
--
-- 1. Ensure `users` table exists:
-- CREATE TABLE IF NOT EXISTS users (
--   id BIGSERIAL PRIMARY KEY,
--   email TEXT UNIQUE NOT NULL,
--   name TEXT,
--   created_at TIMESTAMPTZ DEFAULT now()
-- );
--
-- 2. Ensure `appointments` has `user_id` and `fee_paise`:
-- ALTER TABLE appointments ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id);
-- ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee_paise BIGINT NOT NULL DEFAULT 50000;
--
-- 3. Note for UUID-based schemas (e.g. Supabase default schema where appointments.id is UUID):
-- If `appointments.id` is UUID, change `appointment_id` and `user_id` in `payments` to UUID.
-- ============================================================================

