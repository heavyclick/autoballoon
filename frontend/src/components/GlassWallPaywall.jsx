/**
 * GlassWallPaywall Component - Updated for Lite/Pro Plans
 * Removed 24-hour pass, added Grandfather pricing display
 * Saves email and download preference to localStorage before redirect.
 */

import React, { useState } from 'react';
import { useGuestSession } from '../context/GuestSessionContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../constants/config';

const BLURRED_EXCEL_IMAGE = '/images/excel-preview-blurred.png';

export function GlassWallPaywall({
  isOpen,
  onClose,
  dimensionCount = 0,
  estimatedHours = 0,
  processingSeconds = 12,
}) {
  const { sessionData, captureEmail, sessionId } = useGuestSession();
  const { isPro } = useAuth();
  const [email, setEmail] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('pro_monthly');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(true);

  if (!isOpen || isPro) return null;

  const dims = dimensionCount || sessionData?.dimensionCount || 0;
  const rawMinutes = (dims * 1) + 10;
  const rawHours = rawMinutes / 60;

  const formatTimeSaved = () => {
    if (rawMinutes < 60) return `${Math.round(rawMinutes)} minutes`;
    if (rawHours < 2) {
      const hrs = Math.floor(rawHours);
      const mins = Math.round((rawHours - hrs) * 60);
      return mins > 0 ? `${hrs}h ${mins}m` : `${hrs} hour`;
    }
    return `${rawHours.toFixed(1)} hours`;
  };

  const timeSavedDisplay = formatTimeSaved();
  const timeSavedShort = rawMinutes < 60 ? `~${Math.round(rawMinutes)}m` : `~${rawHours.toFixed(1)}h`;
  const seconds = processingSeconds || 12;

  const plans = {
    lite_monthly: { price: 20, originalPrice: 39, period: '/month' },
    lite_annual: { price: 200, originalPrice: 390, period: '/year', monthlyEq: '$16.67/mo' },
    pro_monthly: { price: 99, originalPrice: 199, period: '/month' },
    pro_annual: { price: 990, originalPrice: 1990, period: '/year', monthlyEq: '$82.50/mo' },
  };

  const getCurrentPlanKey = () => {
    if (selectedPlan.startsWith('lite')) {
      return billingCycle === 'monthly' ? 'lite_monthly' : 'lite_annual';
    }
    return billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual';
  };

  const handleProceedToCheckout = async (planType) => {
    if (!email) {
      setError('Please enter your email to continue');
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSelectedPlan(planType);

    try {
      await captureEmail(email);

      const response = await fetch(`${API_BASE_URL}/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          plan_type: planType,
          session_id: sessionId,
          discount_code: promoCode || undefined,
        }),
      });

      const data = await response.json();

      if (data.checkout_url) {
        localStorage.setItem('autoballoon_user_email', email);
        localStorage.setItem('autoballoon_pending_payment_session', sessionId);
        localStorage.setItem('autoballoon_download_preference', 'zip');

        window.location.href = data.checkout_url;
      } else {
        setError(data.message || 'Failed to create checkout. Please try again.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const currentPlanKey = getCurrentPlanKey();
  const currentPlan = plans[currentPlanKey];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-[#161616] border border-[#2a2a2a] rounded-2xl max-w-4xl w-full shadow-2xl my-8">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-10"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <div className="grid md:grid-cols-2 gap-0">
          {/* Left side - Stats and Email */}
          <div className="p-8">
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-400 text-sm font-medium px-3 py-1 rounded-full mb-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Report Ready for Download
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Analysis Complete
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-[#0d0d0d] rounded-xl p-4 border border-[#2a2a2a]">
                <div className="text-3xl font-bold text-white mb-1">{dims}</div>
                <div className="text-gray-500 text-sm">Dimensions Detected</div>
              </div>
              <div className="bg-[#0d0d0d] rounded-xl p-4 border border-[#2a2a2a]">
                <div className="text-3xl font-bold text-white mb-1">A1-H4</div>
                <div className="text-gray-500 text-sm">Grid Zones Mapped</div>
              </div>
              <div className="bg-[#0d0d0d] rounded-xl p-4 border border-[#2a2a2a]">
                <div className="text-3xl font-bold text-amber-400 mb-1">{timeSavedShort}</div>
                <div className="text-gray-500 text-sm">Manual Time Saved</div>
              </div>
              <div className="bg-[#0d0d0d] rounded-xl p-4 border border-[#2a2a2a]">
                <div className="text-3xl font-bold text-green-400 mb-1">{seconds}s</div>
                <div className="text-gray-500 text-sm">AutoBalloon Time</div>
              </div>
            </div>

            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <div>
                  <p className="text-green-400 font-medium text-sm">Zero-Storage Security</p>
                  <p className="text-green-500/70 text-xs mt-1">
                    Your drawing was processed in memory and has already been deleted.
                    We never store your technical data.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-gray-400 mb-6">
              Your <span className="text-white font-medium">AS9102 Form 3</span> is ready.
              To download and save <span className="text-amber-400 font-medium">{timeSavedDisplay}</span> of
              work, select a plan below.
            </p>

            <div className="mb-4">
              <label className="block text-gray-400 text-sm mb-2">
                Enter email to proceed to checkout
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition-colors"
              />
            </div>

            <div className="mb-4">
              {!showPromoInput ? (
                <button
                  onClick={() => setShowPromoInput(true)}
                  className="text-gray-500 text-sm hover:text-gray-400 transition-colors"
                >
                  Have a promo code?
                </button>
              ) : (
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="Enter promo code"
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition-colors text-sm"
                />
              )}
            </div>

            {/* Marketing Consent Checkbox */}
            <label className="flex items-start gap-3 mb-4 cursor-pointer group">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded border-2 transition-all ${
                  marketingConsent
                    ? 'bg-[#E63946] border-[#E63946]'
                    : 'border-gray-600 group-hover:border-gray-500'
                }`}>
                  {marketingConsent && (
                    <svg className="w-full h-full text-white p-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-gray-400 text-sm leading-tight">
                I agree to receive promotional emails and product updates.{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#E63946] hover:text-[#c62d39] underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms of Service
                </a>
              </span>
            </label>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <p className="text-gray-600 text-xs flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secured by Dodo Payments. 256-bit encryption. ITAR/EAR Compliant
            </p>
          </div>

          <div className="bg-[#0d0d0d] p-8 rounded-r-2xl border-l border-[#2a2a2a]">
            {/* Preview Image */}
            <div className="mb-6 rounded-lg overflow-hidden border border-[#2a2a2a]">
              <img
                src={BLURRED_EXCEL_IMAGE}
                alt="AS9102 Form 3 Preview"
                className="w-full h-32 object-cover object-top"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>

            {/* Billing Toggle */}
            <div className="flex justify-center mb-6">
              <div className="bg-[#1a1a1a] rounded-full p-1 flex text-sm">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-4 py-1.5 rounded-full font-medium transition-all ${
                    billingCycle === 'monthly'
                      ? 'bg-[#E63946] text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('annual')}
                  className={`px-4 py-1.5 rounded-full font-medium transition-all ${
                    billingCycle === 'annual'
                      ? 'bg-[#E63946] text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Annual (Save 2mo)
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Lite Plan */}
              <div
                className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  selectedPlan.startsWith('lite')
                    ? 'border-[#E63946] bg-[#E63946]/5'
                    : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                }`}
                onClick={() => setSelectedPlan(billingCycle === 'monthly' ? 'lite_monthly' : 'lite_annual')}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-bold">Lite Plan</h3>
                      <span className="bg-amber-500/20 text-amber-400 text-xs font-medium px-2 py-0.5 rounded">
                        Grandfather Price
                      </span>
                    </div>
                    <p className="text-gray-500 text-sm">10/day, 100/month</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-baseline gap-1">
                      <span className="text-gray-500 text-sm line-through">
                        ${billingCycle === 'monthly' ? '39' : '390'}
                      </span>
                      <span className="text-2xl font-bold text-white">
                        ${billingCycle === 'monthly' ? '20' : '200'}
                      </span>
                    </div>
                    <div className="text-gray-500 text-xs">
                      {billingCycle === 'monthly' ? '/month' : '/year'}
                      {billingCycle === 'annual' && <span className="ml-1 text-green-400">($16.67/mo)</span>}
                    </div>
                  </div>
                </div>
                <ul className="space-y-2 text-sm mb-4">
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    10 uploads per day
                  </li>
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    100 uploads per month
                  </li>
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    AS9102 Excel exports
                  </li>
                </ul>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProceedToCheckout(billingCycle === 'monthly' ? 'lite_monthly' : 'lite_annual');
                  }}
                  disabled={isLoading && selectedPlan.startsWith('lite')}
                  className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading && selectedPlan.startsWith('lite')
                    ? 'Processing...'
                    : `Subscribe Lite - $${billingCycle === 'monthly' ? '20' : '200'}${billingCycle === 'monthly' ? '/mo' : '/yr'}`
                  }
                </button>
              </div>

              {/* Pro Plan */}
              <div
                className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  selectedPlan.startsWith('pro')
                    ? 'border-[#E63946] bg-[#E63946]/5'
                    : 'border-[#E63946]/50 hover:border-[#E63946]'
                }`}
                onClick={() => setSelectedPlan(billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual')}
              >
                <div className="absolute -top-3 left-4">
                  <span className="bg-[#E63946] text-white text-xs font-bold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </span>
                </div>

                <div className="flex justify-between items-start mb-3 mt-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-bold">Pro Plan</h3>
                      <span className="bg-amber-500/20 text-amber-400 text-xs font-medium px-2 py-0.5 rounded">
                        Grandfather Price
                      </span>
                    </div>
                    <p className="text-gray-500 text-sm">Unlimited uploads</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-baseline gap-1">
                      <span className="text-gray-500 text-sm line-through">
                        ${billingCycle === 'monthly' ? '199' : '1990'}
                      </span>
                      <span className="text-2xl font-bold text-white">
                        ${billingCycle === 'monthly' ? '99' : '990'}
                      </span>
                    </div>
                    <div className="text-gray-500 text-xs">
                      {billingCycle === 'monthly' ? '/month' : '/year'}
                      {billingCycle === 'annual' && <span className="ml-1 text-green-400">($82.50/mo)</span>}
                    </div>
                  </div>
                </div>
                <ul className="space-y-2 text-sm mb-4">
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Unlimited uploads
                  </li>
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Priority processing queue
                  </li>
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Priority email support
                  </li>
                </ul>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProceedToCheckout(billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual');
                  }}
                  disabled={isLoading && selectedPlan.startsWith('pro')}
                  className="w-full bg-[#E63946] hover:bg-[#d32f3d] text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading && selectedPlan.startsWith('pro')
                    ? 'Processing...'
                    : `Subscribe Pro - $${billingCycle === 'monthly' ? '99' : '990'}${billingCycle === 'monthly' ? '/mo' : '/yr'}`
                  }
                </button>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-[#2a2a2a]">
              <div className="flex items-center justify-center gap-6 text-gray-500 text-xs">
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Zero Storage
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  ITAR/EAR Ready
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  Secure Checkout
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GlassWallPaywall;
