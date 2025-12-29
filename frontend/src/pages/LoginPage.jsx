/**
 * Login Page
 * Magic link (passwordless) authentication
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../constants/config';
import { PaywallModal } from '../components/PaywallModal';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      // Handle "Payment Required" (402) - User exists/is new but not Pro
      if (response.status === 402) {
        setShowPaywall(true);
        setIsLoading(false);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setSent(true);
      } else {
        setError(data.message || 'Failed to send login link');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          {/* Success icon */}
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white mb-4">
            Check your email
          </h1>
          <p className="text-gray-400 mb-8">
            We sent a login link to <span className="text-white font-medium">{email}</span>.
            <br />
            Click the link to sign in. It expires in 15 minutes.
          </p>

          <div className="space-y-4">
            <button
              onClick={() => setSent(false)}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Didn't receive it? Try again
            </button>

            <Link
              to="/"
              className="block text-[#E63946] hover:underline text-sm"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center px-4">
      {/* Paywall Modal for non-pro users attempting to login */}
      <PaywallModal 
        isOpen={showPaywall} 
        initialEmail={email}
        hideLoginLink={true}
        onLoginClick={() => setShowPaywall(false)}
      />

      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <span className="text-2xl font-bold text-white">
              Auto<span className="text-[#E63946]">Balloon</span>
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            Welcome back
          </h1>
          <p className="text-gray-400 text-center mb-8">
            Enter your email and we'll send you a login link
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#E63946] transition-colors"
                required
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#E63946] hover:bg-[#c62d39] text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Sending...' : 'Send login link'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm">
              No account?{' '}
              <span className="text-gray-400">
                Just enter your email — we'll create one for you.
              </span>
            </p>
          </div>
        </div>

        {/* Back link */}
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
