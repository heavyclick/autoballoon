/**
 * LemonSqueezy Webhook Handler
 */

import { Router } from 'express';
import { verifyWebhookSignature, processWebhookEvent } from '../lib/lemonsqueezy.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { sendSubscriptionConfirmationEmail } from '../lib/resend.js';

const router = Router();

router.post('/lemonsqueezy', async (req, res) => {
  try {
    // Get raw body for signature verification (Express needs raw body middleware)
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-signature'] as string;

    if (!signature) {
      console.error('Missing webhook signature');
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Verify signature
    const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET!;
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse event
    const event = req.body;
    const eventType = event.meta?.event_name;
    const eventId = event.meta?.custom_data?.lemonsqueezy_event_id;

    console.log('Webhook received:', eventType, eventId);

    // Check if event already processed (idempotency)
    if (eventId) {
      const { data: existingEvent } = await supabaseAdmin
        .from('webhook_events')
        .select('id')
        .eq('lemonsqueezy_event_id', eventId)
        .single();

      if (existingEvent) {
        console.log('Event already processed:', eventId);
        return res.json({ message: 'Event already processed' });
      }
    }

    // Log webhook event
    const { data: webhookLog } = await supabaseAdmin
      .from('webhook_events')
      .insert({
        event_type: eventType,
        lemonsqueezy_event_id: eventId,
        payload: event,
        processed: false,
      })
      .select()
      .single();

    // Process event
    const { action, subscriptionData } = await processWebhookEvent(event);

    // Extract relevant data
    const customData = event.meta?.custom_data || {};
    const userId = customData.user_id;
    const customerEmail = event.data?.attributes?.user_email;

    // Update user subscription status
    if (userId && subscriptionData) {
      const updateData: any = {
        subscription_tier: subscriptionData.plan_type,
        subscription_status: subscriptionData.status,
        is_pro: subscriptionData.status === 'active',
      };

      if (subscriptionData.renews_at) {
        updateData.subscription_ends_at = subscriptionData.renews_at;
      }

      await supabaseAdmin.from('users').update(updateData).eq('id', userId);

      // Send confirmation email for new subscriptions
      if (action === 'subscription_created' && customerEmail) {
        const planName = subscriptionData.plan_type === 'tier_20' ? 'Light' : 'Production';
        const amount = subscriptionData.plan_type === 'tier_20' ? '$20' : '$99';

        await sendSubscriptionConfirmationEmail(customerEmail, planName, amount);
      }
    }

    // Mark webhook as processed
    if (webhookLog) {
      await supabaseAdmin
        .from('webhook_events')
        .update({ processed: true })
        .eq('id', webhookLog.id);
    }

    return res.json({ message: 'Webhook processed' });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message,
    });
  }
});

export default router;
