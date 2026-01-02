'use client';

import { useAppStore, type ParsedDimension } from '@/store/useAppStore';
import { useState } from 'react';

/**
 * Properties Sidebar - The Detail Layer
 *
 * Progressive Disclosure:
 * - Tier 1 (Always Visible): Nominal, Tolerances, Limits
 * - Tier 2 (Collapsible): Feature Type, Units, Inspection Method
 * - Tier 3 (Advanced): AQL Sampling, GD&T Details
 */
export function PropertiesSidebar() {
  const activeCharacteristicId = useAppStore((state) => state.activeCharacteristicId);
  const characteristics = useAppStore((state) => state.project.characteristics);
  const updateCharacteristic = useAppStore((state) => state.updateCharacteristic);
  const setActiveCharacteristic = useAppStore((state) => state.setActiveCharacteristic);

  const [showTier2, setShowTier2] = useState(false);
  const [showTier3, setShowTier3] = useState(false);

  const char = characteristics.find((c) => c.id === activeCharacteristicId);

  if (!char) return null;

  const handleParsedUpdate = (field: string, value: any) => {
    updateCharacteristic(char.id, {
      parsed: {
        ...char.parsed,
        [field]: value === undefined ? null : value
      } as ParsedDimension,
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-brand-gray-800 flex items-center justify-between">
        <h3 className="font-semibold text-white">Characteristic #{char.id}</h3>
        <button
          onClick={() => setActiveCharacteristic(null)}
          className="text-brand-gray-500 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-6">
        {/* Source Proof */}
        <div className="bg-brand-dark rounded-lg p-3 border border-brand-gray-800">
          <p className="text-xs text-brand-gray-500 mb-2">Source Text</p>
          <p className="text-white font-mono text-sm">{char.value}</p>
          {char.confidence < 0.8 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-500">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              Low confidence - verify
            </div>
          )}
        </div>

        {/* Tier 1: Core Data (Always Visible) */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-brand-gray-500 uppercase tracking-wider">
            Specification
          </h4>

          <div>
            <label className="block text-xs text-brand-gray-400 mb-1">Nominal Value</label>
            <input
              type="text"
              value={char.parsed?.nominal || char.value}
              onChange={(e) => handleParsedUpdate('nominal', parseFloat(e.target.value))}
              className="w-full bg-brand-dark border border-brand-gray-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-brand-gray-400 mb-1">+ Tolerance</label>
              <input
                type="number"
                step="0.001"
                value={char.parsed?.plus_tolerance || ''}
                onChange={(e) =>
                  handleParsedUpdate('plus_tolerance', parseFloat(e.target.value))
                }
                className="w-full bg-brand-dark border border-brand-gray-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-brand-gray-400 mb-1">- Tolerance</label>
              <input
                type="number"
                step="0.001"
                value={char.parsed?.minus_tolerance || ''}
                onChange={(e) =>
                  handleParsedUpdate('minus_tolerance', parseFloat(e.target.value))
                }
                className="w-full bg-brand-dark border border-brand-gray-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Calculated Limits */}
          <div className="bg-green-900/10 border border-green-900/30 rounded-lg p-3">
            <p className="text-xs text-green-400 mb-2 font-semibold">Calculated Limits</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-brand-gray-500">Lower:</span>
                <span className="ml-2 text-white font-mono">
                  {char.parsed?.lower_limit?.toFixed(4) || '—'}
                </span>
              </div>
              <div>
                <span className="text-brand-gray-500">Upper:</span>
                <span className="ml-2 text-white font-mono">
                  {char.parsed?.upper_limit?.toFixed(4) || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tier 2: Feature Details (Collapsible) */}
        <div>
          <button
            onClick={() => setShowTier2(!showTier2)}
            className="w-full flex items-center justify-between text-xs font-bold text-brand-gray-500 uppercase tracking-wider mb-3 hover:text-white transition-colors"
          >
            <span>Feature Details</span>
            <svg
              className={`w-4 h-4 transition-transform ${showTier2 ? 'rotate-180' : ''}`}
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

          {showTier2 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-brand-gray-400 mb-1">Type</label>
                <select
                  value={char.parsed?.subtype || 'Linear'}
                  onChange={(e) => handleParsedUpdate('subtype', e.target.value)}
                  className="w-full bg-brand-dark border border-brand-gray-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="Linear">Linear</option>
                  <option value="Diameter">Diameter (Ø)</option>
                  <option value="Radius">Radius (R)</option>
                  <option value="Angle">Angle (∠)</option>
                  <option value="Thread">Thread</option>
                  <option value="GD&T">GD&T</option>
                  <option value="Note">Note</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-brand-gray-400 mb-1">Units</label>
                <select
                  value={char.parsed?.units || 'in'}
                  onChange={(e) => handleParsedUpdate('units', e.target.value)}
                  className="w-full bg-brand-dark border border-brand-gray-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="in">Inch</option>
                  <option value="mm">Millimeter</option>
                  <option value="deg">Degree</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-brand-gray-400 mb-1">
                  Inspection Method
                </label>
                <select
                  value={char.parsed?.inspection_method || ''}
                  onChange={(e) => handleParsedUpdate('inspection_method', e.target.value)}
                  className="w-full bg-brand-dark border border-brand-gray-800 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">(Auto-detect)</option>
                  <option value="CMM">CMM</option>
                  <option value="Caliper">Caliper</option>
                  <option value="Micrometer">Micrometer</option>
                  <option value="Visual">Visual</option>
                  <option value="Gage Block">Gage Block</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Tier 3: Advanced (Collapsible) */}
        <div>
          <button
            onClick={() => setShowTier3(!showTier3)}
            className="w-full flex items-center justify-between text-xs font-bold text-brand-gray-500 uppercase tracking-wider mb-3 hover:text-white transition-colors"
          >
            <span>Advanced</span>
            <svg
              className={`w-4 h-4 transition-transform ${showTier3 ? 'rotate-180' : ''}`}
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

          {showTier3 && (
            <div className="text-sm text-brand-gray-500">
              <p>AQL Sampling, GD&T details, and other advanced features will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
