/**
 * Create LemonSqueezy Checkout Session
 */

import { Router } from 'express';
import { createCheckout } from '../lib/lemonsqueezy.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

router.post('/create', async (req, res) => {
  try {
    const { plan_type, visitor_id } = req.body;
    const authHeader = req.headers.authorization;

    // Validate plan type
    if (!plan_type || !['tier_20', 'tier_99'].includes(plan_type)) {
      return res.status(400).json({ error: 'Invalid plan type' });
    }

    // Get variant ID from environment
    const variantId =
      plan_type === 'tier_20'
        ? process.env.LEMONSQUEEZY_TIER_20_VARIANT_ID!
        : process.env.LEMONSQUEEZY_TIER_99_VARIANT_ID!;

    if (!variantId) {
      return res.status(500).json({ error: 'Product variant not configured' });
    }

    // Get current user if authenticated
    let userId: string | undefined;
    let email: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
      email = user?.email;
    }

    // Create checkout session
    const { checkoutUrl } = await createCheckout({
      email,
      variantId,
      customData: {
        user_id: userId,
        visitor_id,
        plan_type,
      },
    });

    return res.json({ checkoutUrl });
  } catch (error: any) {
    console.error('Checkout creation error:', error);
    return res.status(500).json({
      error: 'Failed to create checkout',
      message: error.message,
    });
  }
});

export default router;
