/**
 * usePaywall Hook
 *
 * Manages subscription state and paywall enforcement
 *
 * Features:
 * - Check subscription status
 * - Check usage limits
 * - Trigger paywall modal
 * - Track visitor fingerprint (anonymous users)
 */

import { useState, useEffect, useCallback } from 'react';

interface UsageData {
  usage: {
    daily: number;
    monthly: number;
  };
  caps: {
    daily: number;
    monthly: number;
  };
  remaining: {
    daily: number;
    monthly: number;
  };
  limits: {
    daily: boolean;
    monthly: boolean;
    any: boolean;
  };
  subscription: {
    tier: 'free' | 'tier_20' | 'tier_99';
    status: string;
    is_pro: boolean;
  };
  reset_dates: {
    daily: string;
    monthly: string;
  };
}

interface PaywallState {
  isOpen: boolean;
  trigger: 'export' | 'usage_limit';
  usageData: UsageData | null;
  isLoading: boolean;
}

export function usePaywall() {
  const [state, setState] = useState<PaywallState>({
    isOpen: false,
    trigger: 'export',
    usageData: null,
    isLoading: false,
  });

  const [visitorId, setVisitorId] = useState<string | null>(null);

  // Generate visitor fingerprint for anonymous users
  useEffect(() => {
    const getVisitorId = () => {
      let id = localStorage.getItem('cie_visitor_id');
      if (!id) {
        id = `visitor_${Math.random().toString(36).substring(2, 15)}${Date.now()}`;
        localStorage.setItem('cie_visitor_id', id);
      }
      return id;
    };

    setVisitorId(getVisitorId());
  }, []);

  // Fetch usage data
  const checkUsage = useCallback(async () => {
    if (!visitorId) return null;

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const response = await fetch(`/api/usage/check?visitor_id=${visitorId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch usage data');
      }

      const data: UsageData = await response.json();
      setState((prev) => ({ ...prev, usageData: data, isLoading: false }));
      return data;
    } catch (error) {
      console.error('Usage check error:', error);
      setState((prev) => ({ ...prev, isLoading: false }));
      return null;
    }
  }, [visitorId]);

  // Check if user can export
  const canExport = useCallback(async (): Promise<boolean> => {
    const data = await checkUsage();
    if (!data) return false;

    // If user is pro, allow export
    if (data.subscription.is_pro) return true;

    // If user is at limit, deny
    if (data.limits.any) return false;

    return false; // Free users must subscribe to export
  }, [checkUsage]);

  // Trigger paywall modal
  const triggerPaywall = useCallback((trigger: 'export' | 'usage_limit') => {
    setState((prev) => ({ ...prev, isOpen: true, trigger }));
  }, []);

  // Close paywall modal
  const closePaywall = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Increment usage counter
  const incrementUsage = useCallback(async (): Promise<boolean> => {
    if (!visitorId) return false;

    try {
      const response = await fetch('/api/usage/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Usage limit reached
          triggerPaywall('usage_limit');
          return false;
        }
        throw new Error('Failed to increment usage');
      }

      // Refresh usage data
      await checkUsage();
      return true;
    } catch (error) {
      console.error('Usage increment error:', error);
      return false;
    }
  }, [visitorId, triggerPaywall, checkUsage]);

  return {
    isPaywallOpen: state.isOpen,
    paywallTrigger: state.trigger,
    usageData: state.usageData,
    isLoading: state.isLoading,
    canExport,
    triggerPaywall,
    closePaywall,
    checkUsage,
    incrementUsage,
  };
}
