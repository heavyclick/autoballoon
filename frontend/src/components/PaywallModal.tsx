'use client';

import { useState } from 'react';

/**
 * PaywallModal - Investment Loss Doctrine Enforcement
 *
 * Triggered when:
 * - User clicks Export without active subscription
 * - User exceeds daily/monthly usage caps
 *
 * Features:
 * - Two-tier pricing display
 * - LemonSqueezy checkout integration
 * - Email pre-fill (if authenticated)
 */

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  trigger: 'export' | 'usage_limit';
}

export function PaywallModal({ isOpen, onClose, trigger }: PaywallModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'tier_20' | 'tier_99'>('tier_99');

  if (!isOpen) return null;

  const plans = [
    {
      id: 'tier_20' as const,
      name: 'Light',
      price: '$20',
      period: 'per month',
      description: 'Perfect for occasional validators',
      dailyCap: 30,
      monthlyCap: 150,
      features: [
        '30 uploads per day',
        '150 uploads per month',
        'Full workbench access',
        'AS9102 Excel exports',
        'Ballooned PDF exports',
        'CMM import & matching',
        'Email support',
      ],
      popular: false,
    },
    {
      id: 'tier_99' as const,
      name: 'Production',
      price: '$99',
      period: 'per month',
      description: 'For QA teams and high-volume users',
      dailyCap: 100,
      monthlyCap: 500,
      features: [
        '100 uploads per day',
        '500 uploads per month',
        'Everything in Light, plus:',
        'Priority processing',
        'Revision comparison',
        'Priority email support',
        'Early access to features',
      ],
      popular: true,
    },
  ];

  const handleSubscribe = async () => {
    setIsLoading(true);

    try {
      // Get visitor ID from localStorage
      const visitorId = localStorage.getItem('cie_visitor_id');

      // Call checkout creation API
      const response = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_type: selectedPlan,
          visitor_id: visitorId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout');
      }

      const { checkoutUrl } = await response.json();

      // Redirect to LemonSqueezy checkout
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error('Checkout failed:', error);
      alert('Failed to create checkout session. Please try again.');
      setIsLoading(false);
    }
  };

  const getMessage = () => {
    if (trigger === 'export') {
      return {
        title: '🎯 Your Work is Ready',
        subtitle: 'Subscribe to export your ballooned drawing and AS9102 data',
      };
    } else {
      return {
        title: '📊 Usage Limit Reached',
        subtitle: 'Upgrade your plan to continue processing drawings',
      };
    }
  };

  const message = getMessage();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-brand-gray-900 border border-brand-gray-800 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-brand-gray-900 border-b border-brand-gray-800 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">{message.title}</h2>
              <p className="text-brand-gray-400">{message.subtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="text-brand-gray-500 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {plans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`
                  relative bg-brand-dark border rounded-xl p-6 cursor-pointer transition-all
                  ${
                    selectedPlan === plan.id
                      ? 'border-brand-red shadow-lg shadow-brand-red/20 ring-2 ring-brand-red/30'
                      : 'border-brand-gray-800 hover:border-brand-gray-700'
                  }
                  ${plan.popular ? 'md:scale-105' : ''}
                `}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-brand-red text-white text-xs font-bold px-3 py-1 rounded-full">
                      MOST POPULAR
                    </span>
                  </div>
                )}

                {/* Selection indicator */}
                <div className="absolute top-4 right-4">
                  <div
                    className={`
                      w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                      ${
                        selectedPlan === plan.id
                          ? 'border-brand-red bg-brand-red'
                          : 'border-brand-gray-600'
                      }
                    `}
                  >
                    {selectedPlan === plan.id && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth={2} fill="none" />
                      </svg>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold text-white">{plan.price}</span>
                    <span className="text-brand-gray-500 text-sm">{plan.period}</span>
                  </div>
                  <p className="text-brand-gray-400 text-sm">{plan.description}</p>
                </div>

                <ul className="space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <svg
                        className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span
                        className={
                          feature.startsWith('Everything')
                            ? 'text-brand-gray-500 text-xs'
                            : 'text-brand-gray-300 text-xs'
                        }
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <button
            onClick={handleSubscribe}
            disabled={isLoading}
            className="w-full bg-brand-red hover:bg-brand-red/90 disabled:bg-brand-gray-800 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Redirecting to checkout...
              </>
            ) : (
              <>
                Subscribe to {plans.find((p) => p.id === selectedPlan)?.name} Plan
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </>
            )}
          </button>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-brand-gray-500 mb-2">
              Secure payment powered by LemonSqueezy • Cancel anytime • 7-day money-back guarantee
            </p>
            <p className="text-xs text-brand-gray-600">
              Zero-storage security • ITAR/EAR compliant • Your data never touches our servers
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
