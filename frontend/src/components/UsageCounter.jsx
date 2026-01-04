/**
 * UsageCounter Component
 * Displays upload usage stats for subscribed users
 *
 * For Lite users: "99/100 uploads remaining this month"
 * For Pro users: "You've used 70% of your daily limit" (only if >70%)
 */

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants/config';
import { useAuth } from '../context/AuthContext';

export function UsageCounter({ className = '' }) {
  const { user, isPro } = useAuth();
  const [usageStats, setUsageStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.email || !isPro) {
      setIsLoading(false);
      return;
    }

    fetchUsageStats();
  }, [user?.email, isPro]);

  const fetchUsageStats = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/payments/usage-stats?email=${encodeURIComponent(user.email)}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch usage stats');
      }

      const data = await response.json();
      setUsageStats(data);
    } catch (err) {
      console.error('Error fetching usage stats:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh stats after upload
  const refreshStats = () => {
    if (user?.email && isPro) {
      fetchUsageStats();
    }
  };

  // Don't render if not subscribed or loading
  if (!isPro || isLoading) {
    return null;
  }

  // Don't render if no stats or counter shouldn't be shown
  if (!usageStats || !usageStats.show_counter) {
    return null;
  }

  // Determine styling based on counter type
  const getCounterStyles = () => {
    switch (usageStats.counter_type) {
      case 'warning':
        return {
          container: 'bg-amber-500/10 border-amber-500/30',
          icon: 'text-amber-500',
          text: 'text-amber-400',
        };
      case 'error':
        return {
          container: 'bg-red-500/10 border-red-500/30',
          icon: 'text-red-500',
          text: 'text-red-400',
        };
      default:
        return {
          container: 'bg-blue-500/10 border-blue-500/30',
          icon: 'text-blue-500',
          text: 'text-blue-400',
        };
    }
  };

  const styles = getCounterStyles();

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${styles.container} ${className}`}>
      {usageStats.counter_type === 'warning' ? (
        <svg className={`w-4 h-4 ${styles.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      ) : (
        <svg className={`w-4 h-4 ${styles.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      )}
      <span className={`text-sm font-medium ${styles.text}`}>
        {usageStats.display_text}
      </span>
    </div>
  );
}

/**
 * UsageBar Component
 * A more detailed usage display with progress bar
 */
export function UsageBar({ className = '' }) {
  const { user, isPro } = useAuth();
  const [usageStats, setUsageStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.email || !isPro) {
      setIsLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/payments/usage-stats?email=${encodeURIComponent(user.email)}`
        );
        if (response.ok) {
          const data = await response.json();
          setUsageStats(data);
        }
      } catch (err) {
        console.error('Error fetching usage stats:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [user?.email, isPro]);

  if (!isPro || isLoading || !usageStats?.has_subscription) {
    return null;
  }

  const isLitePlan = usageStats.plan_tier?.includes('lite');
  const monthlyLimit = usageStats.monthly_limit || 100;
  const monthlyRemaining = usageStats.monthly_remaining || 0;
  const monthlyUsed = monthlyLimit - monthlyRemaining;
  const usagePercent = Math.min(100, (monthlyUsed / monthlyLimit) * 100);

  // Determine bar color based on usage
  const getBarColor = () => {
    if (usagePercent >= 90) return 'bg-red-500';
    if (usagePercent >= 70) return 'bg-amber-500';
    return 'bg-green-500';
  };

  // Pro users with "unlimited" display don't need bar
  if (!isLitePlan && !usageStats.show_counter) {
    return null;
  }

  return (
    <div className={`bg-[#161616] border border-[#2a2a2a] rounded-lg p-4 ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-gray-400 text-sm">Monthly Usage</span>
        <span className="text-white text-sm font-medium">
          {monthlyUsed} / {monthlyLimit}
        </span>
      </div>

      <div className="w-full h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
        <div
          className={`h-full ${getBarColor()} transition-all duration-300`}
          style={{ width: `${usagePercent}%` }}
        />
      </div>

      <div className="flex justify-between items-center mt-2">
        <span className="text-gray-500 text-xs">
          {monthlyRemaining} remaining
        </span>
        {usagePercent >= 70 && (
          <span className="text-amber-400 text-xs">
            {usagePercent >= 90 ? 'Almost at limit!' : 'Getting close to limit'}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * DailyUsageWarning Component
 * Shows warning banner when Pro users exceed 70% daily usage
 */
export function DailyUsageWarning({ className = '' }) {
  const { user, isPro } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [usagePercent, setUsagePercent] = useState(0);

  useEffect(() => {
    if (!user?.email || !isPro) {
      return;
    }

    const checkDailyUsage = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/payments/usage-stats?email=${encodeURIComponent(user.email)}`
        );
        if (response.ok) {
          const data = await response.json();
          // Only show for Pro users with >70% daily usage
          if (data.plan_tier?.includes('pro') && data.show_counter && data.counter_type === 'warning') {
            setShowWarning(true);
            // Extract percentage from display text
            const match = data.display_text?.match(/(\d+)%/);
            if (match) {
              setUsagePercent(parseInt(match[1]));
            }
          } else {
            setShowWarning(false);
          }
        }
      } catch (err) {
        console.error('Error checking daily usage:', err);
      }
    };

    checkDailyUsage();
  }, [user?.email, isPro]);

  if (!showWarning) {
    return null;
  }

  return (
    <div className={`bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 ${className}`}>
      <div className="flex items-center gap-3">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div>
          <p className="text-amber-400 font-medium text-sm">
            You've used {usagePercent}% of your daily limit
          </p>
          <p className="text-amber-500/70 text-xs mt-0.5">
            Your daily limit resets at midnight UTC
          </p>
        </div>
      </div>
    </div>
  );
}

export default UsageCounter;
