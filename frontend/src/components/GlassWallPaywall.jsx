/**
 * GlassWallPaywall Component
 * The "trap" modal that appears when user clicks Export.
 * Shows stats, blurred Excel preview, and pricing options.
 */

import React, { useState } from 'react';
import { useGuestSession } from '../context/GuestSessionContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../constants/config';

// Import the blurred Excel preview image
// You'll need to place this in your public/images folder
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
  const [selectedPlan, setSelectedPlan] = useState(null); // 'pass' or 'pro'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoCode, setPromoCode] = useState('');

  // Don't show if Pro user or modal not open
  if (!isOpen || isPro) return null;

  // Use session data if available
  const dims = dimensionCount || sessionData?.dimensionCount || 0;
  
  // Calculate time saved - 1 minute per dimension + 10 min setup
  const rawMinutes = (dims * 1) + 10;
  const rawHours = rawMinutes / 60;
  
  // Format the time nicely
  const formatTimeSaved = () => {
    if (rawMinutes < 60) {
      return `${Math.round(rawMinutes)} minutes`;
    } else if (rawHours < 2) {
      const hrs = Math.floor(rawHours);
      const mins = Math.round((rawHours - hrs) * 60);
      return mins > 0 ? `${hrs}h ${mins}m` : `${hrs} hour`;
    } else {
      return `${rawHours.toFixed(1)} hours`;
    }
  };
  
  const timeSavedDisplay = formatTimeSaved();
  const timeSavedShort = rawMinutes < 60 ? `~${Math.round(rawMinutes)}m` : `~${rawHours.toFixed(1)}h`;
  const seconds = processingSeconds || 12;

  const handleProceedToCheckout = async (plan) => {
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
    setSelectedPlan(plan);

    try {
      // Capture email for the guest session
      await captureEmail(email);

      // Create checkout session with LemonSqueezy
      const response = await fetch(`${API_BASE_URL}/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          plan_type: plan, // 'pass_24h' or 'pro_monthly'
          session_id: sessionId,
          promo_code: promoCode || undefined,
        }),
      });

      const data = await response.json();

      if (data.checkout_url) {
        // Store session ID in localStorage so we can restore after payment
        localStorage.setItem('autoballoon_pending_payment_session', sessionId);
        // Redirect to LemonSqueezy checkout
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/85 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#161616] border border-[#2a2a2a] rounded-2xl max-w-4xl w-full shadow-2xl my-8">
        {/* Close button - optional, can remove if you want hard paywall */}
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
            {/* Header */}
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

            {/* Stats Grid */}
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

            {/* Value proposition */}
            <p className="text-gray-400 mb-6">
              Your <span className="text-white font-medium">AS9102 Form 3</span> is ready. 
              To download this file and save <span className="text-amber-400 font-medium">{timeSavedDisplay}</span> of 
              work, select a plan below.
            </p>

            {/* Email Input */}
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

            {/* Promo Code Toggle */}
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

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Security Note */}
            <p className="text-gray-600 text-xs flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secured by LemonSqueezy • 256-bit encryption
            </p>
          </div>

          {/* Right side - Pricing Cards */}
          <div className="bg-[#0d0d0d] p-8 rounded-r-2xl border-l border-[#2a2a2a]">
            {/* Blurred Excel Preview */}
            <div className="mb-6 rounded-lg overflow-hidden border border-[#2a2a2a]">
              <img 
                src={BLURRED_EXCEL_IMAGE}
                alt="AS9102 Form 3 Preview"
                className="w-full h-32 object-cover object-top"
              />
            </div>

            {/* Pricing Cards */}
            <div className="space-y-4">
              {/* 24-Hour Pass */}
              <div 
                className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  selectedPlan === 'pass_24h' 
                    ? 'border-[#E63946] bg-[#E63946]/5' 
                    : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                }`}
                onClick={() => setSelectedPlan('pass_24h')}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-white font-bold">24-Hour Pass</h3>
                    <p className="text-gray-500 text-sm">One-time purchase</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">$49</div>
                    <div className="text-gray-500 text-xs">one-time</div>
                  </div>
                </div>
                <ul className="space-y-2 text-sm mb-4">
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Download this file immediately
                  </li>
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Unlimited exports for 24 hours
                  </li>
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    No subscription, no auto-renewal
                  </li>
                </ul>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProceedToCheckout('pass_24h');
                  }}
                  disabled={isLoading && selectedPlan === 'pass_24h'}
                  className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading && selectedPlan === 'pass_24h' ? 'Processing...' : 'Unlock Now - $49'}
                </button>
              </div>

              {/* Pro Monthly - Highlighted */}
              <div 
                className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  selectedPlan === 'pro_monthly' 
                    ? 'border-[#E63946] bg-[#E63946]/5' 
                    : 'border-[#E63946]/50 hover:border-[#E63946]'
                }`}
                onClick={() => setSelectedPlan('pro_monthly')}
              >
                {/* Early Adopter Badge */}
                <div className="absolute -top-3 left-4">
                  <span className="bg-[#E63946] text-white text-xs font-bold px-3 py-1 rounded-full">
                    EARLY ADOPTER - 50% OFF
                  </span>
                </div>
                
                <div className="flex justify-between items-start mb-3 mt-2">
                  <div>
                    <h3 className="text-white font-bold">Pro Monthly</h3>
                    <p className="text-gray-500 text-sm">For professionals</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-baseline gap-2">
                      <span className="text-gray-500 text-lg line-through">$199</span>
                      <span className="text-2xl font-bold text-white">$99</span>
                    </div>
                    <div className="text-gray-500 text-xs">/month</div>
                  </div>
                </div>
                <ul className="space-y-2 text-sm mb-4">
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Everything in Pass, plus:
                  </li>
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Unlimited projects forever
                  </li>
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Cloud storage & history
                  </li>
                  <li className="flex items-center gap-2 text-gray-400">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-amber-400">Rate locked for life</span>
                  </li>
                </ul>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleProceedToCheckout('pro_monthly');
                  }}
                  disabled={isLoading && selectedPlan === 'pro_monthly'}
                  className="w-full bg-[#E63946] hover:bg-[#c62d39] text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading && selectedPlan === 'pro_monthly' ? 'Processing...' : 'Subscribe - $99/mo'}
                </button>
              </div>
            </div>

            {/* Already have account link */}
            <p className="text-center text-gray-500 mt-6 text-sm">
              Already have an account?{' '}
              <button className="text-[#E63946] hover:underline">
                Log in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
