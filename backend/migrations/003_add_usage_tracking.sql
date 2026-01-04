-- Migration: Add Usage Tracking for Lite/Pro Plans
-- Run this in Supabase SQL Editor
-- This adds daily and monthly usage tracking with automatic reset

-- ============================================
-- ADD USAGE TRACKING COLUMNS TO USERS TABLE
-- ============================================

-- Add new columns for usage tracking
ALTER TABLE users
ADD COLUMN IF NOT EXISTS daily_uploads_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_uploads_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_uploads_reset_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS monthly_uploads_reset_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS daily_limit INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_limit INTEGER DEFAULT 0;

-- Add Dodo Payments related columns
ALTER TABLE users
ADD COLUMN IF NOT EXISTS dodo_customer_id TEXT,
ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT;

-- Create index for efficient usage queries
CREATE INDEX IF NOT EXISTS idx_users_usage_tracking
ON users(email, plan_tier);

CREATE INDEX IF NOT EXISTS idx_users_dodo_subscription
ON users(dodo_subscription_id);

-- ============================================
-- UPDATE PAYMENT_EVENTS TABLE FOR DODO
-- ============================================

-- Add Dodo-specific columns to payment_events
ALTER TABLE payment_events
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'dodo',
ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
ADD COLUMN IF NOT EXISTS product_type TEXT;

-- ============================================
-- USAGE RESET FUNCTIONS
-- ============================================

-- Function to reset daily uploads for all users
CREATE OR REPLACE FUNCTION reset_daily_uploads()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE users
    SET
        daily_uploads_count = 0,
        daily_uploads_reset_at = NOW()
    WHERE daily_uploads_count > 0
       OR daily_uploads_reset_at < NOW() - INTERVAL '24 hours';

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to reset monthly uploads for all users
CREATE OR REPLACE FUNCTION reset_monthly_uploads()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
    current_month TEXT;
BEGIN
    current_month := TO_CHAR(NOW(), 'YYYY-MM');

    UPDATE users
    SET
        monthly_uploads_count = 0,
        monthly_uploads_reset_at = NOW()
    WHERE TO_CHAR(monthly_uploads_reset_at, 'YYYY-MM') < current_month;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to check and reset usage for a specific user
CREATE OR REPLACE FUNCTION check_and_reset_user_usage(user_email TEXT)
RETURNS TABLE(
    daily_count INTEGER,
    monthly_count INTEGER,
    daily_reset BOOLEAN,
    monthly_reset BOOLEAN
) AS $$
DECLARE
    user_record RECORD;
    daily_was_reset BOOLEAN := FALSE;
    monthly_was_reset BOOLEAN := FALSE;
    current_month TEXT;
BEGIN
    current_month := TO_CHAR(NOW(), 'YYYY-MM');

    -- Get user record
    SELECT * INTO user_record FROM users WHERE email = user_email;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 0, 0, FALSE, FALSE;
        RETURN;
    END IF;

    -- Check if daily reset needed (more than 24 hours since last reset)
    IF user_record.daily_uploads_reset_at < NOW() - INTERVAL '24 hours' THEN
        UPDATE users
        SET daily_uploads_count = 0, daily_uploads_reset_at = NOW()
        WHERE email = user_email;
        daily_was_reset := TRUE;
    END IF;

    -- Check if monthly reset needed (different month)
    IF TO_CHAR(user_record.monthly_uploads_reset_at, 'YYYY-MM') < current_month THEN
        UPDATE users
        SET monthly_uploads_count = 0, monthly_uploads_reset_at = NOW()
        WHERE email = user_email;
        monthly_was_reset := TRUE;
    END IF;

    -- Get updated counts
    SELECT u.daily_uploads_count, u.monthly_uploads_count
    INTO user_record
    FROM users u WHERE email = user_email;

    RETURN QUERY SELECT
        COALESCE(user_record.daily_uploads_count, 0),
        COALESCE(user_record.monthly_uploads_count, 0),
        daily_was_reset,
        monthly_was_reset;
END;
$$ LANGUAGE plpgsql;

-- Function to increment usage and check limits
CREATE OR REPLACE FUNCTION increment_user_upload(
    user_email TEXT,
    OUT can_upload BOOLEAN,
    OUT daily_remaining INTEGER,
    OUT monthly_remaining INTEGER,
    OUT error_message TEXT
)
AS $$
DECLARE
    user_record RECORD;
    current_month TEXT;
BEGIN
    current_month := TO_CHAR(NOW(), 'YYYY-MM');
    can_upload := FALSE;
    error_message := NULL;

    -- Get user record with lock
    SELECT * INTO user_record
    FROM users
    WHERE email = user_email
    FOR UPDATE;

    IF NOT FOUND THEN
        error_message := 'User not found';
        daily_remaining := 0;
        monthly_remaining := 0;
        RETURN;
    END IF;

    -- Auto-reset daily if needed
    IF user_record.daily_uploads_reset_at < NOW() - INTERVAL '24 hours' THEN
        user_record.daily_uploads_count := 0;
        UPDATE users SET daily_uploads_count = 0, daily_uploads_reset_at = NOW()
        WHERE email = user_email;
    END IF;

    -- Auto-reset monthly if needed
    IF TO_CHAR(user_record.monthly_uploads_reset_at, 'YYYY-MM') < current_month THEN
        user_record.monthly_uploads_count := 0;
        UPDATE users SET monthly_uploads_count = 0, monthly_uploads_reset_at = NOW()
        WHERE email = user_email;
    END IF;

    -- Calculate remaining
    daily_remaining := GREATEST(0, COALESCE(user_record.daily_limit, 0) - COALESCE(user_record.daily_uploads_count, 0));
    monthly_remaining := GREATEST(0, COALESCE(user_record.monthly_limit, 0) - COALESCE(user_record.monthly_uploads_count, 0));

    -- Check limits
    IF user_record.daily_limit > 0 AND user_record.daily_uploads_count >= user_record.daily_limit THEN
        error_message := 'Daily upload limit reached';
        RETURN;
    END IF;

    IF user_record.monthly_limit > 0 AND user_record.monthly_uploads_count >= user_record.monthly_limit THEN
        error_message := 'Monthly upload limit reached';
        RETURN;
    END IF;

    -- Increment counters
    UPDATE users
    SET
        daily_uploads_count = COALESCE(daily_uploads_count, 0) + 1,
        monthly_uploads_count = COALESCE(monthly_uploads_count, 0) + 1
    WHERE email = user_email;

    -- Update remaining counts after increment
    daily_remaining := daily_remaining - 1;
    monthly_remaining := monthly_remaining - 1;
    can_upload := TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SCHEDULED JOBS (run via Supabase Edge Functions or external cron)
-- ============================================

-- To reset daily uploads, call: SELECT reset_daily_uploads();
-- To reset monthly uploads, call: SELECT reset_monthly_uploads();

-- Example cron setup (use Supabase pg_cron or external service):
-- Daily reset at midnight UTC:
-- SELECT cron.schedule('reset-daily-uploads', '0 0 * * *', 'SELECT reset_daily_uploads()');
-- Monthly reset on the 1st of each month:
-- SELECT cron.schedule('reset-monthly-uploads', '0 0 1 * *', 'SELECT reset_monthly_uploads()');
