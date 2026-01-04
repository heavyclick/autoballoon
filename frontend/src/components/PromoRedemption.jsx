/**
 * PromoRedemption Component
 * 
 * Shows when user lands with ?promo=LINKEDIN24 in URL
 * User enters email → gets 24h free access → can download immediately
 * 
 * ADD TO: frontend/src/components/PromoRedemption.jsx
 */

import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants/config';

export function PromoRedemption({ promoCode, onSuccess, onClose }) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [hoursGranted, setHoursGranted] = useState(24);
  const [marketingConsent, setMarketingConsent] = useState(true); // Pre-checked by default

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/promo/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          promo_code: promoCode,
          marketing_consent: marketingConsent
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSuccess(true);
        setHoursGranted(data.hours || 24);
        
        // Store email in localStorage so we can check access later
        localStorage.setItem('autoballoon_user_email', email);
        
        // Call success callback after 2 seconds
        setTimeout(() => {
          if (onSuccess) onSuccess(email);
        }, 2000);
      } else {
        setError(data.message || 'Failed to redeem promo code');
      }
    } catch (err) {
      console.error('Promo redemption error:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-8 max-w-md w-full text-center">
          {/* Success Animation */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2">You're In! 🎉</h2>
          <p className="text-gray-400 mb-4">
            You now have <span className="text-green-400 font-bold">{hoursGranted} hours</span> of free access.
          </p>
          <p className="text-gray-500 text-sm">
            Redirecting to AutoBalloon...
          </p>
          
          {/* Loading dots */}
          <div className="flex justify-center gap-1 mt-4">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
      <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-8 max-w-md w-full">
        {/* Close button */}
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        
        {/* Gift Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
        </div>
        
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 text-purple-400 text-sm font-medium px-3 py-1 rounded-full mb-3">
            <span>🎁</span> Special Offer
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            24 Hours Free Access
          </h2>
          <p className="text-gray-400">
            Enter your email to unlock AutoBalloon Pro features for free.
          </p>
        </div>
        
        {/* What you get */}
        <div className="bg-[#0d0d0d] rounded-xl p-4 mb-6">
          <p className="text-gray-500 text-sm mb-3">What you'll get:</p>
          <ul className="space-y-2">
            {[
              'Unlimited blueprint processing',
              'AS9102 Form 3 Excel exports',
              'Ballooned PDF downloads',
              'No credit card required'
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-gray-300 text-sm">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
        
        {/* Email Form */}
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 mb-4"
            disabled={isLoading}
          />
          
          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}

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
                  ? 'bg-purple-600 border-purple-600'
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
                className="text-purple-400 hover:text-purple-300 underline"
                onClick={(e) => e.stopPropagation()}
              >
                Terms of Service
              </a>
            </span>
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50"
          >
            {isLoading ? 'Activating...' : 'Activate Free Access'}
          </button>
        </form>

        <p className="text-gray-600 text-xs text-center mt-4">
          Your email is used for account access. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}


/**
 * Hook to detect promo code in URL
 * 
 * Usage in LandingPage:
 * 
 * const { promoCode, clearPromo } = usePromoCode();
 * 
 * {promoCode && (
 *   <PromoRedemption 
 *     promoCode={promoCode}
 *     onSuccess={() => clearPromo()}
 *     onClose={() => clearPromo()}
 *   />
 * )}
 */
export function usePromoCode() {
  const [promoCode, setPromoCode] = useState(null);
  
  useEffect(() => {
    // Check URL for promo parameter
    const params = new URLSearchParams(window.location.search);
    const promo = params.get('promo') || params.get('code');
    
    if (promo) {
      setPromoCode(promo.toUpperCase());
    }
  }, []);
  
  const clearPromo = () => {
    setPromoCode(null);
    // Remove from URL without reload
    const url = new URL(window.location.href);
    url.searchParams.delete('promo');
    url.searchParams.delete('code');
    window.history.replaceState({}, '', url);
  };
  
  return { promoCode, clearPromo };
}
