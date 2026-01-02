'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

/**
 * Processing View (The Transition State)
 *
 * Shown while:
 * - PDF is being extracted
 * - Vector text is being harvested
 * - OCR fallback is running
 * - Gemini is structuring dimensions
 *
 * This is a "proof of work" loading state that builds trust.
 */
export function ProcessingView() {
  const processing = useAppStore((state) => state.processing);
  const metadata = useAppStore((state) => state.project.metadata);

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark">
      <div className="max-w-md w-full px-6">
        {/* Logo */}
        <div className="text-center mb-12">
          <span className="text-3xl font-bold">
            Auto<span className="text-brand-red">Balloon</span>
          </span>
        </div>

        {/* Progress Card */}
        <div className="bg-brand-gray-900 border border-brand-gray-800 rounded-2xl p-8">
          {/* Animated Icon */}
          <div className="w-16 h-16 mx-auto mb-6 relative">
            <div className="absolute inset-0 rounded-full border-4 border-brand-gray-800" />
            <div
              className="absolute inset-0 rounded-full border-4 border-brand-red border-t-transparent animate-spin"
              style={{ animationDuration: '1s' }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-brand-red"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>

          {/* File Info */}
          {metadata && (
            <div className="text-center mb-6">
              <p className="text-white font-medium mb-1">{metadata.filename}</p>
              <p className="text-sm text-brand-gray-500">
                Processing {metadata.totalPages} page{metadata.totalPages !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="h-2 bg-brand-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-red to-orange-500 transition-all duration-500 ease-out"
                style={{ width: `${processing.progress}%` }}
              />
            </div>
          </div>

          {/* Current Step */}
          <div className="text-center space-y-4">
            <p className="text-brand-gray-400 text-sm">{processing.currentStep}</p>

            {/* Step Checklist (Static for now) */}
            <div className="text-left space-y-2 text-sm">
              <StepItem
                label="Extracting vector text"
                isActive={processing.progress >= 10}
                isComplete={processing.progress > 30}
              />
              <StepItem
                label="Running OCR fallback"
                isActive={processing.progress >= 30}
                isComplete={processing.progress > 50}
              />
              <StepItem
                label="AI dimension parsing"
                isActive={processing.progress >= 50}
                isComplete={processing.progress > 70}
              />
              <StepItem
                label="Detecting grid zones"
                isActive={processing.progress >= 70}
                isComplete={processing.progress > 90}
              />
              <StepItem
                label="Finalizing balloons"
                isActive={processing.progress >= 90}
                isComplete={processing.progress >= 100}
              />
            </div>
          </div>
        </div>

        {/* Privacy Reassurance */}
        <p className="text-center text-xs text-brand-gray-600 mt-6">
          All processing happens in your browser. Zero server uploads.
        </p>
      </div>
    </div>
  );
}

function StepItem({
  label,
  isActive,
  isComplete,
}: {
  label: string;
  isActive: boolean;
  isComplete: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`
        w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
        ${
          isComplete
            ? 'bg-green-500 border-green-500'
            : isActive
            ? 'border-brand-red animate-pulse'
            : 'border-brand-gray-700'
        }
      `}
      >
        {isComplete && (
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
      <span
        className={`
        ${isComplete ? 'text-green-500' : isActive ? 'text-white' : 'text-brand-gray-600'}
      `}
      >
        {label}
      </span>
    </div>
  );
}
