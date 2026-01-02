/**
 * Usage Check API
 *
 * Returns current usage statistics and remaining quota
 *
 * Supports:
 * - Authenticated users (via Authorization header)
 * - Anonymous users (via visitor fingerprint)
 */

import { Router } from 'express';
import { supabase, getUserById, getUsageRecord, incrementUsage } from '../lib/supabase.js';

const router = Router();

/**
 * GET /api/usage/check
 * Check current usage statistics
 */
router.get('/check', async (req, res) => {
  try {
    const visitorId = req.query.visitor_id as string | undefined;
    const authHeader = req.headers.authorization;

    let userId: string | undefined;

    // Get user from authorization token if provided
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    if (!userId && !visitorId) {
      return res.status(400).json({ error: 'No user ID or visitor ID provided' });
    }

    // Get usage record
    const record = await getUsageRecord(userId, visitorId);

    if (!record) {
      return res.status(404).json({ error: 'Usage record not found' });
    }

    // Get user details if authenticated
    const user = userId ? await getUserById(userId) : null;

    // Determine caps based on subscription tier
    let dailyCap = 0;
    let monthlyCap = 0;

    if (user?.subscription_tier === 'tier_20') {
      dailyCap = parseInt(process.env.TIER_20_DAILY_CAP || '30');
      monthlyCap = parseInt(process.env.TIER_20_MONTHLY_CAP || '150');
    } else if (user?.subscription_tier === 'tier_99') {
      dailyCap = parseInt(process.env.TIER_99_DAILY_CAP || '100');
      monthlyCap = parseInt(process.env.TIER_99_MONTHLY_CAP || '500');
    }

    // Calculate remaining
    const dailyRemaining = dailyCap > 0 ? Math.max(0, dailyCap - record.daily_count) : 999;
    const monthlyRemaining = monthlyCap > 0 ? Math.max(0, monthlyCap - record.monthly_count) : 999;

    // Check if at limit
    const atDailyLimit = dailyCap > 0 && record.daily_count >= dailyCap;
    const atMonthlyLimit = monthlyCap > 0 && record.monthly_count >= monthlyCap;

    return res.json({
      usage: {
        daily: record.daily_count,
        monthly: record.monthly_count,
      },
      caps: {
        daily: dailyCap,
        monthly: monthlyCap,
      },
      remaining: {
        daily: dailyRemaining,
        monthly: monthlyRemaining,
      },
      limits: {
        daily: atDailyLimit,
        monthly: atMonthlyLimit,
        any: atDailyLimit || atMonthlyLimit,
      },
      subscription: {
        tier: user?.subscription_tier || 'free',
        status: user?.subscription_status || 'free',
        is_pro: user?.is_pro || false,
      },
      reset_dates: {
        daily: record.daily_reset_at,
        monthly: record.monthly_reset_at,
      },
    });
  } catch (error: any) {
    console.error('Usage check error:', error);
    return res.status(500).json({
      error: 'Failed to check usage',
      message: error.message,
    });
  }
});

/**
 * POST /api/usage/increment
 * Increment usage counter after successful upload/processing
 */
router.post('/increment', async (req, res) => {
  try {
    const { visitor_id } = req.body;
    const visitorId = visitor_id;
    const authHeader = req.headers.authorization;

    let userId: string | undefined;

    // Get user from authorization token if provided
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    if (!userId && !visitorId) {
      return res.status(400).json({ error: 'No user ID or visitor ID provided' });
    }

    // Increment usage
    const result = await incrementUsage(userId, visitorId);

    if (!result.success) {
      return res.status(429).json({
        error: 'Usage limit reached',
        remaining: result.remaining,
      });
    }

    return res.json({
      success: true,
      remaining: result.remaining,
    });
  } catch (error: any) {
    console.error('Usage increment error:', error);
    return res.status(500).json({
      error: 'Failed to increment usage',
      message: error.message,
    });
  }
});

export default router;
