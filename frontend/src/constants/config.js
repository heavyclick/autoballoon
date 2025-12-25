/**
 * Application Configuration Constants
 * Updated for Glass Wall system
 */

// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://autoballoon-production.up.railway.app';

// Pricing
export const PRICE_PASS_24H = 49;
export const PRICE_PRO_MONTHLY = 99;
export const PRICE_FUTURE = 199;  // Future price for "locked in" messaging

// Free tier (now just for preview, not export)
export const FREE_TIER_LIMIT = 0;  // No free exports - Glass Wall blocks at export

// Session Configuration
export const GUEST_SESSION_EXPIRY_HOURS = 24;
export const SESSION_STORAGE_KEYS = {
  SESSION_ID: 'autoballoon_guest_session_id',
  SESSION_DATA: 'autoballoon_guest_session_data',
  SESSION_EXPIRY: 'autoballoon_guest_session_expiry',
  PENDING_PAYMENT_SESSION: 'autoballoon_pending_payment_session',
  VISITOR_ID: 'autoballoon_visitor_id',
  AUTH_TOKEN: 'autoballoon_token',
  USER_DATA: 'autoballoon_user',
};

// Processing Animation Timing
export const PROCESSING_MIN_DISPLAY_MS = 6000;  // Minimum 6 seconds for "value perception"
export const PROCESSING_STEPS = [
  { text: 'Scanning document...', delay: 800 },
  { text: 'Identifying GD&T frames...', delay: 1200 },
  { text: 'Extracting dimensions...', delay: 1500 },
  { text: 'Mapping grid zones...', delay: 1000 },
  { text: 'Generating AS9102 data...', delay: 1000 },
  { text: 'Finalizing...', delay: 500 },
];

// Manual time estimate (for paywall display)
export const MINUTES_PER_DIMENSION = 1;  // Estimated 1 minute per dimension manually
export const SETUP_TIME_MINUTES = 10;    // Setup/export time

// Feature flags
export const FEATURES = {
  GLASS_WALL_ENABLED: true,       // Enable Glass Wall paywall
  PREVIEW_WATERMARK: true,        // Show watermark in preview mode
  SESSION_TIMER: true,            // Show session expiry timer
  PROMO_CODES: true,              // Allow promo codes at checkout
  MAGIC_LINK_AUTH: true,          // Use magic link authentication
};

// URLs
export const URLS = {
  SUPPORT_EMAIL: 'hello@autoballoon.space',
  TERMS: '/terms',
  PRIVACY: '/privacy',
};

// Plan features for display
export const PLAN_FEATURES = {
  pass_24h: [
    'Download this file immediately',
    'Unlimited exports for 24 hours',
    'No subscription, no auto-renewal',
  ],
  pro_monthly: [
    'Everything in Pass, plus:',
    'Unlimited projects forever',
    'Cloud storage & revision history',
    'Priority support',
    'Rate locked for life',
  ],
};
