/**
 * Supabase Client Configuration
 * Handles authentication and database access
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Client-side Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
 * Get current user from session
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;

  return data as User;
}
