/**
 * Supabase Client Configuration
 * Handles authentication and database access
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Client with anon key (for public operations)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Service role client (for admin operations)
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Type definitions
export interface User {
  id: string;
  email: string;
  is_pro: boolean;
  subscription_status: 'free' | 'tier_20' | 'tier_99' | 'cancelled';
  subscription_tier?: 'tier_20' | 'tier_99';
  subscription_ends_at?: string;
}

export interface UsageRecord {
  id: string;
  user_id?: string;
  visitor_id?: string;
  daily_count: number;
  monthly_count: number;
  daily_reset_at: string;
  monthly_reset_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  lemonsqueezy_subscription_id: string;
  plan_type: 'tier_20' | 'tier_99';
  status: 'active' | 'cancelled' | 'expired' | 'paused' | 'past_due';
  renews_at?: string;
  ends_at?: string;
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as User;
}

/**
 * Get or create usage record for a user or visitor
 */
export async function getUsageRecord(
  userId?: string,
  visitorId?: string
): Promise<UsageRecord | null> {
  if (!userId && !visitorId) return null;

  let query = supabase.from('usage').select('*').limit(1);

  if (userId) {
    query = query.eq('user_id', userId);
  } else if (visitorId) {
    query = query.eq('visitor_id', visitorId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    // Create new usage record
    const newRecord = {
      user_id: userId,
      visitor_id: visitorId,
      daily_count: 0,
      monthly_count: 0,
      daily_reset_at: new Date().toISOString().split('T')[0],
      monthly_reset_at: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .split('T')[0],
    };

    const { data: created } = await supabase
      .from('usage')
      .insert(newRecord)
      .select()
      .single();

    return created as UsageRecord;
  }

  return data as UsageRecord;
}

/**
 * Increment upload count
 */
export async function incrementUsage(
  userId?: string,
  visitorId?: string
): Promise<{ success: boolean; remaining: { daily: number; monthly: number } }> {
  const record = await getUsageRecord(userId, visitorId);

  if (!record) {
    return { success: false, remaining: { daily: 0, monthly: 0 } };
  }

  // Get user's subscription tier
  let dailyCap = 0;
  let monthlyCap = 0;

  if (userId) {
    const user = await getUserById(userId);
    if (user?.subscription_tier === 'tier_20') {
      dailyCap = parseInt(process.env.TIER_20_DAILY_CAP || '30');
      monthlyCap = parseInt(process.env.TIER_20_MONTHLY_CAP || '150');
    } else if (user?.subscription_tier === 'tier_99') {
      dailyCap = parseInt(process.env.TIER_99_DAILY_CAP || '100');
      monthlyCap = parseInt(process.env.TIER_99_MONTHLY_CAP || '500');
    }
  }

  // Check if user has hit caps
  if (dailyCap > 0 && record.daily_count >= dailyCap) {
    return {
      success: false,
      remaining: { daily: 0, monthly: Math.max(0, monthlyCap - record.monthly_count) },
    };
  }

  if (monthlyCap > 0 && record.monthly_count >= monthlyCap) {
    return {
      success: false,
      remaining: { daily: Math.max(0, dailyCap - record.daily_count), monthly: 0 },
    };
  }

  // Increment counters
  const { data: updated } = await supabase
    .from('usage')
    .update({
      daily_count: record.daily_count + 1,
      monthly_count: record.monthly_count + 1,
    })
    .eq('id', record.id)
    .select()
    .single();

  if (!updated) {
    return { success: false, remaining: { daily: 0, monthly: 0 } };
  }

  return {
    success: true,
    remaining: {
      daily: dailyCap > 0 ? Math.max(0, dailyCap - (updated as UsageRecord).daily_count) : 999,
      monthly: monthlyCap > 0 ? Math.max(0, monthlyCap - (updated as UsageRecord).monthly_count) : 999,
    },
  };
}
