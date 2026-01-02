'use client';

import { useCallback, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { extractPDFPages } from '@/lib/pdfExtractor';

/**
 * DropZone Component
 *
 * The "Gateway" to the Workbench
 * - Accepts PDF/Image files
 * - Triggers the extraction pipeline
 * - NO confirmation dialogs - Drop = Start
 */
export function DropZone() {
  const [isDragging, setIsDragging] = useState(false);
  const initializeProject = useAppStore((state) => state.initializeProject);
  const setMode = useAppStore((state) => state.setMode);
  const setProcessing = useAppStore((state) => state.setProcessing);

  const handleFile = useCallback(
    async (file: File) => {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'];
      if (!allowedTypes.includes(file.type)) {
        alert('Please upload a PDF or image file (PNG, JPG, TIFF)');
        return;
      }

      // Validate file size (50MB max)
      const maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) {
        alert('File size must be less than 50MB');
        return;
      }

      // Initialize project immediately (NO confirmation)
      const metadata = {
        filename: file.name,
        uploadedAt: new Date(),
        totalPages: 0, // Will be updated during extraction
        processedPages: 0,
      };

      initializeProject(file, metadata);

      // Start extraction pipeline
      setProcessing({
        isProcessing: true,
        currentStep: 'Loading PDF...',
        progress: 10,
      });

      try {
        // Extract pages using pdf.js (Vector-first extraction)
        await extractPDFPages(file);

        // Transition to workbench
        setMode('workbench');
      } catch (error) {
        console.error('Extraction failed:', error);
        setProcessing({
          isProcessing: false,
          currentStep: 'Extraction failed',
          progress: 0,
        });
        alert('Failed to process file. Please try again.');
      }
    },
    [initializeProject, setMode, setProcessing]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      className={`
        relative overflow-hidden
        bg-brand-gray-900 border-2 border-dashed rounded-2xl p-12
        transition-all duration-300 cursor-pointer
        ${
          isDragging
            ? 'border-brand-red bg-brand-red/5 scale-[1.02]'
            : 'border-brand-gray-800 hover:border-brand-gray-700'
        }
      `}
    >
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.tiff"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />

      <div className="text-center pointer-events-none">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-brand-red/10 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-brand-red"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        {/* Text */}
        <h3 className="text-2xl font-bold text-white mb-2">
          Drop your drawing here
        </h3>
        <p className="text-brand-gray-400 mb-6">
          or click to browse • PDF, PNG, JPG, TIFF • Max 50MB
        </p>

        {/* Features */}
        <div className="flex items-center justify-center gap-8 text-sm text-brand-gray-500">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Vector-first extraction</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>AI-powered parsing</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Zero server storage</span>
          </div>
        </div>
      </div>

      {/* Animated border gradient (subtle) */}
      <div
        className={`
        absolute inset-0 rounded-2xl pointer-events-none
        transition-opacity duration-300
        ${isDragging ? 'opacity-100' : 'opacity-0'}
      `}
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(230, 57, 70, 0.3), transparent)',
          backgroundSize: '200% 100%',
          animation: isDragging ? 'shimmer 2s infinite' : 'none',
        }}
      />

      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
      `}</style>
    </div>
  );
}
