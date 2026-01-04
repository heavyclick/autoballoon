-- Add marketing consent fields to access_passes table
-- Run this in Supabase SQL Editor

-- Add marketing_consent column (boolean, default false for GDPR compliance)
ALTER TABLE access_passes
ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE;

-- Add marketing_consent_at column (timestamp when user gave consent)
ALTER TABLE access_passes
ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;

-- Create index for querying users who consented to marketing
CREATE INDEX IF NOT EXISTS idx_access_passes_marketing_consent
ON access_passes(marketing_consent)
WHERE marketing_consent = TRUE;

-- Comment the columns
COMMENT ON COLUMN access_passes.marketing_consent IS 'User consent to receive promotional emails and product updates';
COMMENT ON COLUMN access_passes.marketing_consent_at IS 'Timestamp when user gave marketing consent';
