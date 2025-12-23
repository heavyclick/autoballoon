/**
 * Privacy Policy Page
 */

import React from 'react';
import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="text-[#E63946] hover:underline mb-8 inline-block">
          ← Back to Home
        </Link>
        
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-gray-400 mb-8">Last updated: December 2024</p>
        
        <div className="prose prose-invert max-w-none space-y-6 text-gray-300">
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">1. Information We Collect</h2>
            <p>We collect information you provide directly to us:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Account Information:</strong> Email address when you create an account or subscribe</li>
              <li><strong>Payment Information:</strong> Processed securely by Paystack; we don't store card details</li>
              <li><strong>Uploaded Files:</strong> Blueprint images and PDFs you upload for processing</li>
              <li><strong>Usage Data:</strong> How you interact with our service</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Process your blueprints and detect dimensions</li>
              <li>Send magic link emails for authentication</li>
              <li>Process payments and manage subscriptions</li>
              <li>Improve our AI detection algorithms</li>
              <li>Respond to support requests</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">3. File Storage & Retention</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Free Users:</strong> Uploaded files are automatically deleted after 24 hours</li>
              <li><strong>Pro Users:</strong> Files are stored securely with encryption; you can delete anytime</li>
              <li>All files are encrypted in transit (TLS 1.3) and at rest (AES-256)</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">4. Third-Party Services</h2>
            <p>We use the following services to operate:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Google Cloud Vision:</strong> For OCR text detection</li>
              <li><strong>Google Gemini:</strong> For AI dimension identification</li>
              <li><strong>Paystack:</strong> For payment processing</li>
              <li><strong>Supabase:</strong> For database and authentication</li>
              <li><strong>Resend:</strong> For email delivery</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">5. Data Security</h2>
            <p>We implement industry-standard security measures:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>TLS 1.3 encryption for all data in transit</li>
              <li>AES-256 encryption for data at rest</li>
              <li>Regular security audits</li>
              <li>Isolated processing environments</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Access your personal data</li>
              <li>Delete your account and all associated data</li>
              <li>Export your data</li>
              <li>Opt out of marketing communications</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">7. Contact Us</h2>
            <p>
              For privacy-related questions, contact us at:{' '}
              <a href="mailto:support@autoballoon.space" className="text-[#E63946] hover:underline">
                support@autoballoon.space
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
