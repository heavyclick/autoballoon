# Database Migrations

This folder contains SQL migration scripts for the AutoBalloon database.

## How to Run Migrations

1. **Log in to Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your AutoBalloon project

2. **Open SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy and Run Migration**
   - Copy the contents of the migration file
   - Paste into the SQL Editor
   - Click "Run" or press `Cmd+Enter`

4. **Verify Success**
   - Check for success message
   - Verify columns exist: `Table Editor > access_passes > check for marketing_consent and marketing_consent_at columns`

## Migrations

### `add_marketing_consent.sql`
**Purpose:** Add marketing consent tracking to `access_passes` table

**What it does:**
- Adds `marketing_consent` column (boolean, default false)
- Adds `marketing_consent_at` column (timestamp)
- Creates index for efficient marketing list queries
- Adds documentation comments

**When to run:** Before deploying promo code feature

**GDPR Compliance:** Default is `FALSE` - users must explicitly opt-in

## Best Practices

1. **Always backup before running migrations**
2. **Test migrations on staging environment first**
3. **Run migrations during low-traffic periods**
4. **Keep migration files for documentation**
