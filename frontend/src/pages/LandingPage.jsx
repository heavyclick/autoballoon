/**
 * LandingPage Component
 * Updated for Glass Wall system - NO upload blocking
 * Users can always upload and process; paywall shows at export
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import { HowItWorks } from '../components/HowItWorks';
import { PricingCard } from '../components/PricingCard';
import { FAQ } from '../components/FAQ';
import { Footer } from '../components/Footer';
import { DropZone } from '../components/DropZone';
import { PromoRedemption, usePromoCode } from '../components/PromoRedemption';
import { API_BASE_URL } from '../constants/config';

export function LandingPage() {
  const { isPro } = useAuth();
  const { promoCode, clearPromo } = usePromoCode();
  const [hasAccess, setHasAccess] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  // Check if user has access on page load
  useEffect(() => {
    const checkExistingAccess = async () => {
      const email = localStorage.getItem('autoballoon_user_email');
      if (email) {
        setUserEmail(email);
        try {
          const response = await fetch(`${API_BASE_URL}/access/check?email=${encodeURIComponent(email)}`);
          const data = await response.json();
          if (data.has_access) {
            setHasAccess(true);
          }
        } catch (err) {
          console.error('Access check error:', err);
        }
      }
    };
    checkExistingAccess();
  }, []);

  const handlePromoSuccess = (email) => {
    setUserEmail(email);
    setHasAccess(true);
    clearPromo();
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <Navbar />
      
      {/* Promo Code Modal - Shows when ?promo=LINKEDIN24 in URL */}
      {promoCode && (
        <PromoRedemption 
          promoCode={promoCode}
          onSuccess={handlePromoSuccess}
          onClose={clearPromo}
        />
      )}
      
      {/* Hero Section */}
      <section className="pt-24 pb-8 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-full px-4 py-2 mb-8">
            <span className="text-green-500">●</span>
            <span className="text-gray-400 text-sm">Trusted by aerospace & manufacturing QC teams</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Stop Manually Ballooning
            <br />
            <span className="text-[#E63946]">PDF Drawings</span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            Get your AS9102 Excel Report in <span className="text-white font-semibold">10 seconds</span>.
            <br />
            AI-powered dimension detection for First Article Inspection.
          </p>

          {/* Access Status Indicator */}
          {hasAccess && (
            <div className="inline-flex items-center gap-2 text-sm mb-8 bg-green-500/10 border border-green-500/30 px-4 py-2 rounded-full">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-400">Free access activated for {userEmail}</span>
            </div>
          )}

          {/* Pro indicator - only show for pro users */}
          {isPro && (
            <div className="inline-flex items-center gap-2 text-sm mb-8">
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold px-2 py-0.5 rounded text-xs">
                PRO
              </span>
              <span className="text-gray-400">Unlimited processing enabled</span>
            </div>
          )}
        </div>
      </section>

      {/* Interactive DropZone - THE TOOL */}
      <section className="px-4 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-6 md:p-8">
            {/* Pass hasAccess so DropZone knows if user can download */}
            <DropZone hasPromoAccess={hasAccess} userEmail={userEmail} />
            
            {/* Encouragement text for non-pro users */}
            {!isPro && (
              <p className="text-center text-gray-500 text-sm mt-6">
                Try it free • No signup required • Pay only when you export
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="py-20 px-4 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* The Old Way */}
            <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-8">
              <div className="text-red-500 text-sm font-bold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                THE OLD WAY
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">4+ Hours Per Drawing</h3>
              <ul className="space-y-3 text-gray-400">
                <li className="flex items-start gap-3">
                  <span className="text-red-500 mt-1">•</span>
                  Manually count and circle every dimension
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-500 mt-1">•</span>
                  Hand-write balloon numbers on printouts
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-500 mt-1">•</span>
                  Type each dimension into Excel spreadsheet
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-500 mt-1">•</span>
                  Cross-reference grid zones manually
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-500 mt-1">•</span>
                  Prone to human error and missed dimensions
                </li>
              </ul>
            </div>

            {/* The New Way */}
            <div className="bg-[#161616] border-2 border-[#E63946] rounded-2xl p-8 relative">
              <div className="absolute -top-3 -right-3 bg-[#E63946] text-white text-xs font-bold px-3 py-1 rounded-full">
                AutoBalloon
              </div>
              <div className="text-green-500 text-sm font-bold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                THE NEW WAY
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">5 Minutes, Done</h3>
              <ul className="space-y-3 text-gray-400">
                <li className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  Drop PDF → AI detects all dimensions instantly
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  Automatic balloon numbering with drag-to-adjust
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  One-click AS9102 Form 3 Excel export
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  Grid zones auto-detected and assigned
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-green-500 mt-1">✓</span>
                  Review, adjust, export — it's that simple
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <HowItWorks />

      {/* Compliance Section */}
      <section className="py-20 px-4 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Built for Compliance
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'AS9102 Form 3',
                description: 'Export directly to FAI Form 3 format with balloon numbers, zone references, and requirements.',
                icon: '📋',
              },
              {
                title: 'ISO 13485 Ready',
                description: 'Medical device manufacturers trust AutoBalloon for their quality documentation.',
                icon: '🏥',
              },
              {
                title: 'Secure Processing',
                description: 'Enterprise-grade encryption. Files processed securely and never stored without permission.',
                icon: '🔒',
              },
            ].map((item, i) => (
              <div key={i} className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-6 text-center">
                <div className="text-4xl mb-4">{item.icon}</div>
                <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-gray-400 mb-12">
            No per-drawing fees. No hidden costs. Just unlimited processing.
          </p>
          <PricingCard />
        </div>
      </section>

      {/* FAQ */}
      <FAQ />

      {/* Footer */}
      <Footer />

      {/* NOTE: Glass Wall paywall is handled INSIDE DropZone now, not here */}
    </div>
  );
}
