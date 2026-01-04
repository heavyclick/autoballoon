/**
 * PricingCard Component - Updated for Lite/Pro Plans with Grandfather Pricing
 * Removed 24-hour pass, no free trial
 */

import React, { useState } from 'react';
import { API_BASE_URL } from '../constants/config';

export function PricingCard({ onSelectPlan, prefilledEmail = '' }) {
  const [email, setEmail] = useState(prefilledEmail);
  const [selectedPlan, setSelectedPlan] = useState('pro_monthly');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const plans = {
    lite_monthly: {
      name: 'Lite Plan',
      price: 20,
      originalPrice: 39,
      period: '/month',
      features: [
        '10 uploads per day',
        '100 uploads per month',
        'AS9102 Form 3 Excel exports',
        'Zero-storage security (ITAR/EAR ready)',
        'Email support',
      ],
      badge: 'Grandfather Price',
      badgeColor: 'bg-amber-500',
    },
    lite_annual: {
      name: 'Lite Plan',
      price: 200,
      originalPrice: 390,
      period: '/year',
      monthlyEquivalent: '$16.67/mo',
      features: [
        '10 uploads per day',
        '100 uploads per month',
        'AS9102 Form 3 Excel exports',
        'Zero-storage security (ITAR/EAR ready)',
        'Email support',
        '2 months FREE',
      ],
      badge: 'Grandfather Price',
      badgeColor: 'bg-amber-500',
      savingsBadge: 'SAVE $38/YEAR',
    },
    pro_monthly: {
      name: 'Pro Plan',
      price: 99,
      originalPrice: 199,
      period: '/month',
      features: [
        'Unlimited uploads',
        'AS9102 Form 3 Excel exports',
        'Zero-storage security (ITAR/EAR ready)',
        'Priority processing speed',
        'Priority email support',
      ],
      badge: 'Grandfather Price',
      badgeColor: 'bg-amber-500',
      recommended: true,
    },
    pro_annual: {
      name: 'Pro Plan',
      price: 990,
      originalPrice: 1990,
      period: '/year',
      monthlyEquivalent: '$82.50/mo',
      features: [
        'Unlimited uploads',
        'AS9102 Form 3 Excel exports',
        'Zero-storage security (ITAR/EAR ready)',
        'Priority processing speed',
        'Priority email support',
        '2 months FREE',
      ],
      badge: 'Grandfather Price',
      badgeColor: 'bg-amber-500',
      savingsBadge: 'SAVE $198/YEAR',
    },
  };

  const getCurrentPlanKey = () => {
    if (selectedPlan === 'lite') {
      return billingCycle === 'monthly' ? 'lite_monthly' : 'lite_annual';
    }
    return billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual';
  };

  const handleProceedToCheckout = async () => {
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

    const planKey = getCurrentPlanKey();

    try {
      const response = await fetch(`${API_BASE_URL}/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          plan_type: planKey,
        }),
      });

      const data = await response.json();

      if (data.checkout_url) {
        // Save email for post-payment
        localStorage.setItem('autoballoon_user_email', email);
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

  const currentPlanKey = getCurrentPlanKey();
  const currentPlan = plans[currentPlanKey];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Grandfather Price Badge */}
      <div className="flex justify-center mb-6">
        <span className="bg-amber-500 text-black text-sm font-bold px-6 py-2 rounded-full uppercase tracking-wide flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Grandfather Pricing - Lock In Your Rate Forever
        </span>
      </div>

      {/* Billing Toggle */}
      <div className="flex justify-center mb-8">
        <div className="bg-[#1a1a1a] rounded-full p-1 flex">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
              billingCycle === 'monthly'
                ? 'bg-[#E63946] text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('annual')}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              billingCycle === 'annual'
                ? 'bg-[#E63946] text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Annual
            <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
              Save 2 months
            </span>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Lite Plan */}
        <div
          onClick={() => setSelectedPlan('lite')}
          className={`relative bg-[#161616] rounded-2xl p-6 cursor-pointer transition-all ${
            selectedPlan === 'lite'
              ? 'border-2 border-[#E63946] shadow-lg shadow-[#E63946]/20'
              : 'border-2 border-[#2a2a2a] hover:border-[#3a3a3a]'
          }`}
        >
          {plans[billingCycle === 'monthly' ? 'lite_monthly' : 'lite_annual'].savingsBadge && (
            <div className="absolute -top-3 right-4">
              <span className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                {plans[billingCycle === 'monthly' ? 'lite_monthly' : 'lite_annual'].savingsBadge}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xl font-bold text-white">Lite Plan</h3>
            <span className="bg-amber-500/20 text-amber-400 text-xs font-medium px-2 py-1 rounded">
              Grandfather Price
            </span>
          </div>

          <div className="mb-4">
            <span className="text-gray-500 text-xl line-through mr-2">
              ${plans[billingCycle === 'monthly' ? 'lite_monthly' : 'lite_annual'].originalPrice}
            </span>
            <span className="text-4xl font-bold text-white">
              ${plans[billingCycle === 'monthly' ? 'lite_monthly' : 'lite_annual'].price}
            </span>
            <span className="text-gray-400">
              {plans[billingCycle === 'monthly' ? 'lite_monthly' : 'lite_annual'].period}
            </span>
            {billingCycle === 'annual' && (
              <div className="text-sm text-gray-500 mt-1">
                {plans.lite_annual.monthlyEquivalent}
              </div>
            )}
          </div>

          <ul className="space-y-3 mb-6">
            {plans[billingCycle === 'monthly' ? 'lite_monthly' : 'lite_annual'].features.map((feature, idx) => (
              <li key={idx} className="flex items-center gap-3 text-gray-300 text-sm">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>

          <div className={`w-full h-1 rounded-full ${selectedPlan === 'lite' ? 'bg-[#E63946]' : 'bg-[#2a2a2a]'}`} />
        </div>

        {/* Pro Plan */}
        <div
          onClick={() => setSelectedPlan('pro')}
          className={`relative bg-[#161616] rounded-2xl p-6 cursor-pointer transition-all ${
            selectedPlan === 'pro'
              ? 'border-2 border-[#E63946] shadow-lg shadow-[#E63946]/20'
              : 'border-2 border-[#E63946]/50 hover:border-[#E63946]'
          }`}
        >
          <div className="absolute -top-3 left-4">
            <span className="bg-[#E63946] text-white text-xs font-bold px-3 py-1 rounded-full">
              MOST POPULAR
            </span>
          </div>

          {plans[billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual'].savingsBadge && (
            <div className="absolute -top-3 right-4">
              <span className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                {plans[billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual'].savingsBadge}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 mb-2 mt-2">
            <h3 className="text-xl font-bold text-white">Pro Plan</h3>
            <span className="bg-amber-500/20 text-amber-400 text-xs font-medium px-2 py-1 rounded">
              Grandfather Price
            </span>
          </div>

          <div className="mb-4">
            <span className="text-gray-500 text-xl line-through mr-2">
              ${plans[billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual'].originalPrice}
            </span>
            <span className="text-4xl font-bold text-white">
              ${plans[billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual'].price}
            </span>
            <span className="text-gray-400">
              {plans[billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual'].period}
            </span>
            {billingCycle === 'annual' && (
              <div className="text-sm text-gray-500 mt-1">
                {plans.pro_annual.monthlyEquivalent}
              </div>
            )}
          </div>

          <ul className="space-y-3 mb-6">
            {plans[billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual'].features.map((feature, idx) => (
              <li key={idx} className="flex items-center gap-3 text-gray-300 text-sm">
                <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>

          <div className={`w-full h-1 rounded-full ${selectedPlan === 'pro' ? 'bg-[#E63946]' : 'bg-[#2a2a2a]'}`} />
        </div>
      </div>

      {/* Email Input and Checkout */}
      <div className="max-w-md mx-auto">
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-6">
          <div className="text-center mb-4">
            <div className="text-lg font-medium text-white mb-1">
              {currentPlan.name} - {billingCycle === 'monthly' ? 'Monthly' : 'Annual'}
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="text-gray-500 line-through">${currentPlan.originalPrice}</span>
              <span className="text-2xl font-bold text-white">${currentPlan.price}</span>
              <span className="text-gray-400">{currentPlan.period}</span>
            </div>
          </div>

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

          <button
            onClick={handleProceedToCheckout}
            disabled={isLoading}
            className="w-full bg-[#E63946] hover:bg-[#d32f3d] text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Processing...' : `Subscribe - $${currentPlan.price}${currentPlan.period}`}
          </button>

          <p className="text-center text-gray-500 text-sm mt-4">
            Cancel anytime. Secure payment via Dodo Payments.
          </p>
        </div>
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
