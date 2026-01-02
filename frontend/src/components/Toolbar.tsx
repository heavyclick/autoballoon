'use client';

import { useAppStore } from '@/store/useAppStore';
import { usePaywall } from '@/hooks/usePaywall';
import { PaywallModal } from './PaywallModal';

/**
 * Toolbar - Minimal, Non-Distracting Top Bar
 *
 * Contains:
 * - Logo/Back button
 * - Tool selector (Select, Pan, Balloon)
 * - Export button (with paywall enforcement)
 */
export function Toolbar() {
  const selectedTool = useAppStore((state) => state.selectedTool);
  const setSelectedTool = useAppStore((state) => state.setSelectedTool);
  const clearProject = useAppStore((state) => state.clearProject);
  const metadata = useAppStore((state) => state.project.metadata);
  const characteristicsCount = useAppStore((state) => state.project.characteristics.length);

  const {
    isPaywallOpen,
    paywallTrigger,
    usageData,
    canExport,
    triggerPaywall,
    closePaywall,
  } = usePaywall();

  const handleExport = async () => {
    // Check if user can export
    const allowed = await canExport();

    if (!allowed) {
      // Trigger paywall modal (Investment Loss Doctrine)
      triggerPaywall('export');
      return;
    }

    // TODO: Proceed with export
    console.log('Export allowed, generating files...');
  };

  return (
    <>
      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={closePaywall}
        trigger={paywallTrigger}
      />

      <div className="h-14 bg-brand-gray-900 border-b border-brand-gray-800 flex items-center justify-between px-4 flex-shrink-0">
      {/* Left: Back + File Info */}
      <div className="flex items-center gap-4">
        <button
          onClick={clearProject}
          className="text-brand-gray-400 hover:text-white flex items-center gap-1 text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </button>

        <div className="h-6 w-px bg-brand-gray-800" />

        <div>
          <h1 className="font-semibold text-sm text-white">
            {metadata?.filename || 'Untitled'}
          </h1>
          <p className="text-xs text-brand-gray-500">
            {characteristicsCount} dimension{characteristicsCount !== 1 ? 's' : ''} detected
          </p>
        </div>
      </div>

      {/* Center: Tool Selector */}
      <div className="flex items-center gap-2 bg-brand-dark p-1 rounded-lg border border-brand-gray-800">
        <button
          onClick={() => setSelectedTool('select')}
          className={`
            px-3 py-1.5 rounded text-xs font-medium transition-colors
            ${
              selectedTool === 'select'
                ? 'bg-blue-600 text-white'
                : 'text-brand-gray-400 hover:text-white'
            }
          `}
        >
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
              />
            </svg>
            Select
          </span>
        </button>

        <button
          onClick={() => setSelectedTool('pan')}
          className={`
            px-3 py-1.5 rounded text-xs font-medium transition-colors
            ${
              selectedTool === 'pan'
                ? 'bg-blue-600 text-white'
                : 'text-brand-gray-400 hover:text-white'
            }
          `}
        >
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
              />
            </svg>
            Pan
          </span>
        </button>

        <button
          onClick={() => setSelectedTool('balloon')}
          className={`
            px-3 py-1.5 rounded text-xs font-medium transition-colors
            ${
              selectedTool === 'balloon'
                ? 'bg-purple-600 text-white'
                : 'text-brand-gray-400 hover:text-white'
            }
          `}
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            + Balloon
          </span>
        </button>
      </div>

      {/* Right: Export */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleExport}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-bold transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export
        </button>
      </div>
    </div>
    </>
  );
}
