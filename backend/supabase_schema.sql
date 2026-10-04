-- ============================================================================
-- BookMyAppointment - Complete Master Database Schema
-- Multi-Clinic AI Dental SaaS + Razorpay Payment Gateway
--
-- How to apply:
-- 1. Create a new project at https://supabase.com
-- 2. Open the SQL Editor in your Supabase Dashboard
-- 3. Paste and run this entire script
-- ============================================================================

-- ─── 0. EXTENSIONS ──────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. ENUMS ───────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM
      ('created', 'attempted', 'paid', 'failed', 'partially_refunded', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ─── 2. DENTIST USERS (Doctor Login & Authentication) ───────────────────────
CREATE TABLE IF NOT EXISTS dentist_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT, -- Doctor's professional name
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── 3. USERS (Customer / Patient Auth for Direct Appointments & Payments) ──
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── 4. DENTISTS / CLINICS (Individual Clinic Locations & Bot Configs) ──────
CREATE TABLE IF NOT EXISTS dentists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    dentist_id TEXT UNIQUE NOT NULL, -- Unique clinic code (e.g. DT_A1B2C3D4)
    owner_id UUID REFERENCES dentist_users(id) ON DELETE CASCADE,
    name TEXT, -- Clinic location name
    clinic_name TEXT,
    email TEXT,
    whatsapp_number TEXT,
    working_hours JSONB DEFAULT '{}'::jsonb,
    subscription_status TEXT DEFAULT 'trial',
    trial_ends_at TIMESTAMPTZ,
    slack_notification_mode TEXT DEFAULT 'none',
    slack_webhook TEXT,
    google_calendar_token JSONB DEFAULT '{}'::jsonb,
    google_calendar_id TEXT DEFAULT 'primary',
    clinic_address TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── 5. PATIENTS (Patient CRM & Chat History per Clinic) ────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    dentist_id TEXT REFERENCES dentists(dentist_id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    name TEXT,
    email TEXT,
    conversation_history JSONB DEFAULT '[]'::jsonb,
    last_contact TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(dentist_id, phone_number)
);

-- ─── 6. APPOINTMENTS (Booking Records & Payment Amount) ──────────────────────
CREATE TABLE IF NOT EXISTS appointments (
    id BIGSERIAL PRIMARY KEY,
    dentist_id TEXT REFERENCES dentists(dentist_id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    patient_name TEXT,
    patient_phone TEXT,
    service TEXT,
    date_time TIMESTAMPTZ,
    duration INTEGER DEFAULT 60,
    status TEXT DEFAULT 'pending_payment', -- 'pending_payment', 'pending_confirmation', 'confirmed', 'cancelled'
    fee_paise BIGINT NOT NULL DEFAULT 50000, -- Consultation fee in paise (e.g., 50000 = ₹500.00)
    reminder_sent BOOLEAN DEFAULT false,
    notes TEXT,
    event_id TEXT, -- Google Calendar event ID
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── 7. DENTIST KNOWLEDGE (Vector Store for RAG Chatbot) ────────────────────
CREATE TABLE IF NOT EXISTS dentist_knowledge (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    dentist_id TEXT REFERENCES dentists(dentist_id) ON DELETE CASCADE,
    type TEXT DEFAULT 'general',
    title TEXT,
    content TEXT,
    embedding VECTOR(384),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ─── 8. RAG COSINE SIMILARITY SEARCH FUNCTION ───────────────────────────────
CREATE OR REPLACE FUNCTION match_knowledge (
  query_embedding VECTOR(384),
  match_threshold FLOAT,
  match_count INT,
  filter_dentist_id TEXT
)
RETURNS TABLE (
  id UUID,
  dentist_id TEXT,
  type TEXT,
  title TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dk.id,
    dk.dentist_id,
    dk.type,
    dk.title,
    dk.content,
    1 - (dk.embedding <=> query_embedding) AS similarity
  FROM dentist_knowledge dk
  WHERE dk.dentist_id = filter_dentist_id
    AND 1 - (dk.embedding <=> query_embedding) > match_threshold
  ORDER BY dk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── 9. PAYMENTS (Razorpay Payment Records) ──────────────────────────────────
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

-- ─── 10. REFUNDS ─────────────────────────────────────────────────────────────
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

-- ─── 11. PAYMENT EVENTS (Webhook Retries Deduplication & Audit Log) ─────────
CREATE TABLE IF NOT EXISTS payment_events (
  id                BIGSERIAL PRIMARY KEY,
  razorpay_event_id TEXT NOT NULL UNIQUE,   -- from X-Razorpay-Event-Id header; dedupes retries
  event_type        TEXT NOT NULL,          -- payment.captured, payment.failed, ...
  payload           JSONB NOT NULL,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 12. OPTIONAL SAMPLE DATA (Uncomment to test immediately) ────────────────
-- INSERT INTO users (id, email, name, phone)
-- VALUES (1, 'patient@example.com', 'Test Patient', '+919876543210')
-- ON CONFLICT (id) DO NOTHING;

-- INSERT INTO appointments (id, user_id, patient_name, patient_phone, service, date_time, status, fee_paise)
-- VALUES (1, 1, 'Test Patient', '+919876543210', 'Dental Cleaning', NOW() + INTERVAL '1 day', 'pending_payment', 50000)
-- ON CONFLICT (id) DO NOTHING;
