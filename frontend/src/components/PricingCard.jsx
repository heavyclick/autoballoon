/**
 * PricingCard Component - Updated with Zero-Storage Security Messaging
 */

import React, { useState } from 'react';
import { API_BASE_URL } from '../constants/config';

export function PricingCard() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleStartTrial = async () => {
    if (!email) {
      setError('Please enter your email');
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          plan_type: 'pro_monthly',
        }),
      });

      const data = await response.json();

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setError(data.message || 'Failed to start checkout');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      {/* Early Adopter Badge */}
      <div className="flex justify-center mb-4">
        <span className="bg-[#E63946] text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wide">
          Early Adopter Pricing
        </span>
      </div>

      {/* Card */}
      <div className="bg-[#161616] border-2 border-[#E63946] rounded-2xl p-8">
        <h3 className="text-xl font-bold text-white text-center mb-2">Pro Plan</h3>
        
        {/* Price */}
        <div className="text-center mb-2">
          <span className="text-gray-500 text-xl line-through mr-2">$199</span>
          <span className="text-5xl font-bold text-white">$99</span>
          <span className="text-gray-400 text-lg">/month</span>
        </div>

        {/* Lock-in message */}
        <p className="text-center text-amber-400 text-sm mb-6 flex items-center justify-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Locked in for life when you subscribe now
        </p>

        {/* Features */}
        <ul className="space-y-3 mb-6">
          <li className="flex items-center gap-3 text-gray-300">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Unlimited blueprint processing
          </li>
          <li className="flex items-center gap-3 text-gray-300">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            AS9102 Form 3 Excel exports
          </li>
          <li className="flex items-center gap-3 text-gray-300">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Zero-storage security (ITAR/EAR ready)
          </li>
          <li className="flex items-center gap-3 text-gray-300">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Priority processing speed
          </li>
          <li className="flex items-center gap-3 text-gray-300">
            <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Email support
          </li>
        </ul>

        {/* Email Input */}
        <div className="mb-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#E63946] transition-colors"
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* CTA Button */}
        <button
          onClick={handleStartTrial}
          disabled={isLoading}
          className="w-full bg-[#E63946] hover:bg-[#d32f3d] text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Processing...' : 'Start 7-Day Free Trial'}
        </button>

        {/* Subtext */}
        <p className="text-center text-gray-500 text-sm mt-4">
          Cancel anytime • No questions asked
        </p>
      </div>

      {/* Security Note */}
      <div className="mt-6 text-center">
        <p className="text-gray-500 text-xs flex items-center justify-center gap-2">
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Your drawings are never stored. Processed in memory, deleted immediately.
        </p>
      </div>
    </div>
  );
}

export default PricingCard;
