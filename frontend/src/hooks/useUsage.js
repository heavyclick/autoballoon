import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
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
  const { user, token, isPro } = useAuth();
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
      const params = new URLSearchParams();
      if (!user) {
        params.append('visitor_id', visitorId);
      }

      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${API_BASE_URL}/usage/check?${params.toString()}`,
        { headers }
      );

      if (response.ok) {
        const data = await response.json();
        setUsage({
          count: data.count,
          limit: data.limit,
          remaining: data.remaining,
          canProcess: data.can_process,
          isPro: data.is_pro || isPro,
        });
      }
    } catch (err) {
      console.error('Failed to fetch usage:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, token, visitorId, isPro]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const incrementUsage = useCallback(async () => {
    if (isPro) return;

    try {
      const params = new URLSearchParams();
      if (!user) {
        params.append('visitor_id', visitorId);
      }

      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${API_BASE_URL}/usage/increment?${params.toString()}`,
        { method: 'POST', headers }
      );

      if (response.ok) {
        const data = await response.json();
        setUsage({
          count: data.count,
          limit: data.limit,
          remaining: data.remaining,
          canProcess: data.can_process,
          isPro: data.is_pro || isPro,
        });
      }
    } catch (err) {
      console.error('Failed to increment usage:', err);
    }
  }, [user, token, visitorId, isPro]);

  const canProcess = useCallback(() => {
    if (isPro) return true;
    return usage.remaining > 0;
  }, [isPro, usage.remaining]);

  const shouldShowPaywall = useCallback(() => {
    if (isPro) return false;
    return usage.count >= FREE_TIER_LIMIT;
  }, [isPro, usage.count]);

  return {
    usage,
    isLoading,
    visitorId,
    incrementUsage,
    canProcess,
    shouldShowPaywall,
    refreshUsage: fetchUsage,
  };
}
