import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, FREE_TIER_LIMIT } from '../constants/config';

const VISITOR_ID_KEY = 'autoballoon_visitor_id';

function generateVisitorId() {
  return 'v_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function getVisitorId() {
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);
  if (!visitorId) {
    visitorId = generateVisitorId();
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }
  return visitorId;
}

export function useUsage() {
  const [usage, setUsage] = useState({
    count: 0,
    limit: FREE_TIER_LIMIT,
    remaining: FREE_TIER_LIMIT,
    canProcess: true,
    isPro: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const visitorId = getVisitorId();

  const fetchUsage = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/usage/check?visitor_id=${visitorId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Usage data from API:', data); // Debug log
        setUsage({
          count: data.count || 0,
          limit: data.limit || FREE_TIER_LIMIT,
          remaining: data.remaining ?? (FREE_TIER_LIMIT - (data.count || 0)),
          canProcess: data.can_process !== false,
          isPro: data.is_pro || false,
        });
      }
    } catch (err) {
      console.error('Failed to fetch usage:', err);
    } finally {
      setIsLoading(false);
    }
  }, [visitorId]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const incrementUsage = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/usage/increment?visitor_id=${visitorId}`, { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        console.log('Increment response:', data); // Debug log
        setUsage({
          count: data.count || 0,
          limit: data.limit || FREE_TIER_LIMIT,
          remaining: data.remaining ?? 0,
          canProcess: data.can_process !== false,
          isPro: data.is_pro || false,
        });
        return data;
      }
    } catch (err) {
      console.error('Failed to increment usage:', err);
    }
    return null;
  }, [visitorId]);

  return {
    usage,
    isLoading,
    visitorId,
    incrementUsage,
    refreshUsage: fetchUsage,
    canProcess: () => usage.remaining > 0 || usage.isPro,
    shouldShowPaywall: () => !usage.isPro && usage.remaining <= 0,
  };
}
