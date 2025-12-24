/**
 * useUsage Hook
 * Tracks free tier usage limits
 */

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants/config';

// Generate a unique visitor ID
function generateVisitorId() {
  const stored = localStorage.getItem('autoballoon_visitor_id');
  if (stored) return stored;
  
  const newId = 'v_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  localStorage.setItem('autoballoon_visitor_id', newId);
  return newId;
}

export function useUsage() {
  const [visitorId] = useState(generateVisitorId);
  const [usage, setUsage] = useState({ used: 0, limit: 3, remaining: 3 });
  const [loading, setLoading] = useState(true);

  // Fetch current usage on mount
  useEffect(() => {
    async function fetchUsage() {
      try {
        const response = await fetch(`${API_BASE_URL}/usage/check?visitor_id=${visitorId}`);
        if (response.ok) {
          const data = await response.json();
          setUsage(data);
        }
      } catch (err) {
        console.log('Usage check failed:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsage();
  }, [visitorId]);

  // Increment usage after processing
  const incrementUsage = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/usage/increment?visitor_id=${visitorId}`, {
        method: 'POST'
      });
      if (response.ok) {
        const data = await response.json();
        setUsage(prev => ({
          ...prev,
          used: data.used,
          remaining: data.remaining
        }));
      }
    } catch (err) {
      console.log('Usage increment failed:', err);
    }
  };

  // Check if should show paywall
  const shouldShowPaywall = () => {
    return usage.remaining <= 0;
  };

  return {
    visitorId,
    usage,
    loading,
    incrementUsage,
    shouldShowPaywall,
    remaining: usage.remaining
  };
}
