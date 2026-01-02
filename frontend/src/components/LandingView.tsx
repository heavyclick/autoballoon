'use client';

import { useState } from 'react';
import { DropZone } from './DropZone';
import { HowItWorks } from './marketing/HowItWorks';
import { FAQ } from './marketing/FAQ';
import { PricingCard } from './marketing/PricingCard';

/**
 * Landing View (The Entry State)
 *
 * Shows:
 * - Minimal header with logo
 * - Hero headline
 * - DropZone (The Primary CTA)
 * - Marketing content BELOW the fold (preserves SEO, doesn't violate proof-first)
 */
export function LandingView() {
  const [showMarketingContent, setShowMarketingContent] = useState(true);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-brand-dark/80 backdrop-blur-sm border-b border-brand-gray-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">
              Auto<span className="text-brand-red">Balloon</span>
            </span>
            <span className="text-xs text-brand-gray-500 font-mono">CIE v3.0</span>
          </div>

          <nav className="flex items-center gap-6">
            <button
              onClick={() => setShowMarketingContent(!showMarketingContent)}
              className="text-sm text-brand-gray-400 hover:text-white transition-colors"
            >
              {showMarketingContent ? 'Hide' : 'Show'} Info
            </button>
            <a
              href="#pricing"
              className="text-sm text-brand-gray-400 hover:text-white transition-colors"
            >
              Pricing
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-12 px-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto text-center">
          {/* Trust Badge */}
          <div className="inline-flex items-center gap-2 bg-brand-gray-900 border border-brand-gray-800 rounded-full px-4 py-2 mb-8">
            <svg
              className="w-4 h-4 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            <span className="text-brand-gray-400 text-sm">
              Zero-Storage Security • ITAR/EAR Compliant
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Stop Manually Ballooning
            <br />
            <span className="text-brand-red">PDF Drawings</span>
          </h1>

          <p className="text-xl text-brand-gray-400 mb-4 max-w-2xl mx-auto">
            Get your AS9102 Excel Report in{' '}
            <span className="text-white font-semibold">10 seconds</span>.
            <br />
            AI-powered dimension detection for First Article Inspection.
          </p>

          <p className="text-sm text-green-500/80 mb-12 flex items-center justify-center gap-2">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Your drawings never touch our servers. Processed in-browser, instant deletion.
          </p>
        </div>
      </section>

      {/* DropZone (The Primary Action) */}
      <section className="px-4 pb-16 flex-shrink-0">
        <div className="max-w-5xl mx-auto">
          <DropZone />
        </div>
      </section>

      {/* Marketing Content (Below the Fold) */}
      {showMarketingContent && (
        <section className="mt-24 border-t border-brand-gray-800">
          <div className="max-w-6xl mx-auto px-4 py-16 space-y-24">
            <HowItWorks />

            <div id="pricing">
              <PricingCard />
            </div>

            <FAQ />

            {/* Footer */}
            <footer className="border-t border-brand-gray-800 pt-8 mt-24">
              <div className="flex justify-between items-center text-sm text-brand-gray-500">
                <p>&copy; 2024 AutoBalloon. Built for Quality Engineers.</p>
                <div className="flex gap-6">
                  <a href="#privacy" className="hover:text-white transition-colors">
                    Privacy
                  </a>
                  <a href="#terms" className="hover:text-white transition-colors">
                    Terms
                  </a>
                  <a
                    href="mailto:support@autoballoon.space"
                    className="hover:text-white transition-colors"
                  >
                    Support
                  </a>
                </div>
              </div>
            </footer>
          </div>
        </section>
      )}
    </div>
  );
}
