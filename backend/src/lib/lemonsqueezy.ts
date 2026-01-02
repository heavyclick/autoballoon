/**
 * LemonSqueezy Integration
 * Payment processing and subscription management
 */

const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY;
const LEMONSQUEEZY_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID;

if (!LEMONSQUEEZY_API_KEY) {
  console.warn('LemonSqueezy API key not configured');
}

// API Base URL
const API_BASE = 'https://api.lemonsqueezy.com/v1';

/**
 * Create a checkout session
 */
export async function createCheckout(params: {
  email?: string;
  variantId: string;
  customData?: Record<string, any>;
}): Promise<{ checkoutUrl: string }> {
  if (!LEMONSQUEEZY_API_KEY || !LEMONSQUEEZY_STORE_ID) {
    throw new Error('LemonSqueezy not configured');
  }

  const response = await fetch(`${API_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: params.email,
            custom: params.customData,
          },
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: LEMONSQUEEZY_STORE_ID,
            },
          },
          variant: {
            data: {
              type: 'variants',
              id: params.variantId,
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LemonSqueezy checkout failed: ${error}`);
  }

  const data = await response.json();
  return {
    checkoutUrl: data.data.attributes.url,
  };
}

/**
 * Get subscription details
 */
export async function getSubscription(subscriptionId: string) {
  if (!LEMONSQUEEZY_API_KEY) {
    throw new Error('LemonSqueezy not configured');
  }

  const response = await fetch(`${API_BASE}/subscriptions/${subscriptionId}`, {
    headers: {
      'Accept': 'application/vnd.api+json',
      'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch subscription');
  }

  return response.json();
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: string) {
  if (!LEMONSQUEEZY_API_KEY) {
    throw new Error('LemonSqueezy not configured');
  }

  const response = await fetch(`${API_BASE}/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Authorization': `Bearer ${LEMONSQUEEZY_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to cancel subscription');
  }

  return response.json();
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const digest = hmac.digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

/**
 * Process webhook event
 */
export async function processWebhookEvent(event: any): Promise<{
  userId?: string;
  action: 'created' | 'updated' | 'cancelled';
  subscriptionData: any;
}> {
  const eventType = event.meta.event_name;
  const subscriptionData = event.data.attributes;

  let action: 'created' | 'updated' | 'cancelled' = 'updated';

  if (eventType === 'subscription_created') {
    action = 'created';
  } else if (eventType === 'subscription_cancelled' || eventType === 'subscription_expired') {
    action = 'cancelled';
  } else if (eventType === 'subscription_updated' || eventType === 'subscription_payment_success') {
    action = 'updated';
  }

  return {
    action,
    subscriptionData,
  };
}

/**
 * Get pricing tier from variant ID
 */
export function getPlanTypeFromVariantId(variantId: string): 'tier_20' | 'tier_99' | null {
  const tier20Variant = process.env.LEMONSQUEEZY_TIER_20_VARIANT_ID;
  const tier99Variant = process.env.LEMONSQUEEZY_TIER_99_VARIANT_ID;

  if (variantId === tier20Variant) return 'tier_20';
  if (variantId === tier99Variant) return 'tier_99';

  return null;
}

/**
 * Get variant ID from plan type
 */
export function getVariantIdFromPlanType(planType: 'tier_20' | 'tier_99'): string {
  if (planType === 'tier_20') {
    return process.env.LEMONSQUEEZY_TIER_20_VARIANT_ID || '';
  }
  return process.env.LEMONSQUEEZY_TIER_99_VARIANT_ID || '';
}
