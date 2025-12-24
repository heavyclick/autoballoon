import { useState, useEffect } from 'react';

const API_BASE_URL = "https://autoballoon-production.up.railway.app/api";

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

  useEffect(() => {
    setLoading(false);
  }, []);

  const incrementUsage = async () => {
    setUsage(prev => ({
      ...prev,
      used: prev.used + 1,
      remaining: Math.max(0, prev.remaining - 1)
    }));
  };

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
