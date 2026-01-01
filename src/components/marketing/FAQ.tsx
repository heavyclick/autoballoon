'use client';

import { useState } from 'react';

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: 'Is my drawing data secure?',
      answer:
        'Yes. All processing happens in your browser using pdf.js and client-side AI. Your drawings never hit our servers. We physically cannot see your files.',
    },
    {
      question: 'What file formats do you support?',
      answer:
        'PDF (vector or raster), PNG, JPG, and TIFF. Multi-page PDFs are fully supported with continuous vertical scrolling.',
    },
    {
      question: 'How accurate is the dimension detection?',
      answer:
        'Vector PDFs: 95%+ accuracy (exact text extraction). Scanned/Raster: 85-90% accuracy (OCR-based). GD&T, threads, and fits are parsed using Gemini AI for high structural accuracy.',
    },
    {
      question: 'Can I import CMM measurement data?',
      answer:
        'Yes. Upload your PC-DMIS, Calypso, or CSV report and the system will fuzzy-match measurements to balloons, automatically filling in actual values and pass/fail status.',
    },
    {
      question: 'What happens when I hit my daily/monthly cap?',
      answer:
        "You'll see a friendly notification. You can either upgrade to the next tier or wait for the daily reset. Your work is saved in your browser.",
    },
    {
      question: 'Do you support ITAR/EAR compliance?',
      answer:
        'Yes. Zero-server-storage architecture means your controlled drawings never leave your device, making us ITAR/EAR compliant by design.',
    },
  ];

  return (
    <div>
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-white mb-4">
          Frequently Asked Questions
        </h2>
        <p className="text-brand-gray-400 max-w-2xl mx-auto">
          Everything you need to know about AutoBalloon CIE.
        </p>
      </div>

      <div className="max-w-3xl mx-auto space-y-4">
        {faqs.map((faq, index) => (
          <div
            key={index}
            className="bg-brand-gray-900 border border-brand-gray-800 rounded-xl overflow-hidden"
          >
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-brand-gray-800/50 transition-colors"
            >
              <span className="font-medium text-white">{faq.question}</span>
              <svg
                className={`w-5 h-5 text-brand-gray-400 transition-transform ${
                  openIndex === index ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {openIndex === index && (
              <div className="px-6 pb-4 text-brand-gray-400 text-sm leading-relaxed">
                {faq.answer}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
