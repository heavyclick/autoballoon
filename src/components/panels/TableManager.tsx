'use client';

import { useAppStore, type ParsedDimension } from '@/store/useAppStore';

/**
 * Table Manager - The Excel-Like Grid View
 *
 * Features:
 * - Full-width bottom panel
 * - Inline editing
 * - Sync with sidebar (click row → highlight balloon, vice versa)
 * - Sort/filter capabilities
 */
export function TableManager() {
  const characteristics = useAppStore((state) => state.project.characteristics);
  const activeCharacteristicId = useAppStore((state) => state.activeCharacteristicId);
  const setActiveCharacteristic = useAppStore((state) => state.setActiveCharacteristic);
  const updateCharacteristic = useAppStore((state) => state.updateCharacteristic);

  if (characteristics.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-brand-gray-600">
        <p className="text-sm">No characteristics detected yet</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-2 border-b border-brand-gray-800 flex items-center justify-between bg-brand-gray-900/50">
        <h3 className="text-xs font-bold text-brand-gray-400 uppercase tracking-wider">
          Characteristics Table
        </h3>
        <span className="text-xs text-brand-gray-600">{characteristics.length} items</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="sticky top-0 bg-brand-gray-800 z-10">
            <tr>
              <th className="p-2 border-r border-brand-gray-700 w-12 text-center">#</th>
              <th className="p-2 border-r border-brand-gray-700 w-16">Page</th>
              <th className="p-2 border-r border-brand-gray-700 w-20">Zone</th>
              <th className="p-2 border-r border-brand-gray-700 w-48">Specification</th>
              <th className="p-2 border-r border-brand-gray-700 w-24">Nominal</th>
              <th className="p-2 border-r border-brand-gray-700 w-20">+Tol</th>
              <th className="p-2 border-r border-brand-gray-700 w-20">-Tol</th>
              <th className="p-2 border-r border-brand-gray-700 w-24">Lower Limit</th>
              <th className="p-2 border-r border-brand-gray-700 w-24">Upper Limit</th>
              <th className="p-2 border-r border-brand-gray-700 w-16">Units</th>
              <th className="p-2 border-r border-brand-gray-700 w-24">Type</th>
              <th className="p-2 border-r border-brand-gray-700 w-24">Method</th>
              <th className="p-2 border-r border-brand-gray-700 w-20">Conf.</th>
            </tr>
          </thead>
          <tbody className="bg-brand-dark text-brand-gray-300">
            {characteristics.map((char) => {
              const isSelected = char.id === activeCharacteristicId;
              const isLowConfidence = char.confidence < 0.8;

              return (
                <tr
                  key={char.id}
                  onClick={() => setActiveCharacteristic(char.id)}
                  className={`
                    border-b border-brand-gray-800 hover:bg-brand-gray-900 cursor-pointer transition-colors
                    ${isSelected ? 'bg-brand-gray-900' : ''}
                  `}
                >
                  {/* ID */}
                  <td
                    className={`p-2 border-r border-brand-gray-800 text-center font-bold ${
                      isSelected ? 'text-white' : 'text-brand-gray-500'
                    }`}
                  >
                    {char.id}
                  </td>

                  {/* Page */}
                  <td className="p-2 border-r border-brand-gray-800 text-center">
                    {char.page}
                  </td>

                  {/* Zone */}
                  <td className="p-2 border-r border-brand-gray-800">
                    {char.zone || '—'}
                  </td>

                  {/* Full Specification */}
                  <td className="p-0 border-r border-brand-gray-800">
                    <input
                      type="text"
                      value={char.parsed?.full_specification || char.value}
                      onChange={(e) =>
                        updateCharacteristic(char.id, {
                          parsed: { ...char.parsed, full_specification: e.target.value } as ParsedDimension,
                        })
                      }
                      className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-brand-gray-900 font-mono text-yellow-500/80"
                    />
                  </td>

                  {/* Nominal */}
                  <td className="p-0 border-r border-brand-gray-800">
                    <input
                      type="number"
                      step="0.001"
                      value={char.parsed?.nominal || ''}
                      onChange={(e) =>
                        updateCharacteristic(char.id, {
                          parsed: {
                            ...char.parsed,
                            nominal: parseFloat(e.target.value),
                          },
                        })
                      }
                      className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-brand-gray-900 font-mono text-white"
                    />
                  </td>

                  {/* +Tol */}
                  <td className="p-0 border-r border-brand-gray-800">
                    <input
                      type="number"
                      step="0.001"
                      value={char.parsed?.plus_tolerance || ''}
                      onChange={(e) =>
                        updateCharacteristic(char.id, {
                          parsed: {
                            ...char.parsed,
                            plus_tolerance: parseFloat(e.target.value),
                          },
                        })
                      }
                      className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-brand-gray-900 font-mono"
                    />
                  </td>

                  {/* -Tol */}
                  <td className="p-0 border-r border-brand-gray-800">
                    <input
                      type="number"
                      step="0.001"
                      value={char.parsed?.minus_tolerance || ''}
                      onChange={(e) =>
                        updateCharacteristic(char.id, {
                          parsed: {
                            ...char.parsed,
                            minus_tolerance: parseFloat(e.target.value),
                          },
                        })
                      }
                      className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-brand-gray-900 font-mono"
                    />
                  </td>

                  {/* Lower Limit */}
                  <td className="p-2 border-r border-brand-gray-800 font-mono text-green-500/80 bg-green-900/10">
                    {char.parsed?.lower_limit?.toFixed(4) || '—'}
                  </td>

                  {/* Upper Limit */}
                  <td className="p-2 border-r border-brand-gray-800 font-mono text-green-500/80 bg-green-900/10">
                    {char.parsed?.upper_limit?.toFixed(4) || '—'}
                  </td>

                  {/* Units */}
                  <td className="p-2 border-r border-brand-gray-800 text-brand-gray-500 text-xs">
                    {char.parsed?.units || 'in'}
                  </td>

                  {/* Type */}
                  <td className="p-0 border-r border-brand-gray-800">
                    <select
                      value={char.parsed?.subtype || 'Linear'}
                      onChange={(e) =>
                        updateCharacteristic(char.id, {
                          parsed: { ...char.parsed, subtype: e.target.value } as ParsedDimension,
                        })
                      }
                      className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-brand-gray-900"
                    >
                      <option value="Linear">Linear</option>
                      <option value="Diameter">Diameter</option>
                      <option value="Radius">Radius</option>
                      <option value="Angle">Angle</option>
                      <option value="Thread">Thread</option>
                      <option value="GD&T">GD&T</option>
                    </select>
                  </td>

                  {/* Method */}
                  <td className="p-0 border-r border-brand-gray-800">
                    <select
                      value={char.parsed?.inspection_method || ''}
                      onChange={(e) =>
                        updateCharacteristic(char.id, {
                          parsed: { ...char.parsed, inspection_method: e.target.value } as ParsedDimension,
                        })
                      }
                      className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-brand-gray-900 text-blue-400"
                    >
                      <option value="">(Auto)</option>
                      <option value="CMM">CMM</option>
                      <option value="Caliper">Caliper</option>
                      <option value="Micrometer">Micrometer</option>
                    </select>
                  </td>

                  {/* Confidence */}
                  <td className="p-2 border-r border-brand-gray-800 text-center">
                    <span
                      className={`
                        inline-block px-2 py-0.5 rounded text-xs font-medium
                        ${
                          char.confidence >= 0.95
                            ? 'bg-green-900/30 text-green-400'
                            : isLowConfidence
                            ? 'bg-amber-900/30 text-amber-400'
                            : 'bg-blue-900/30 text-blue-400'
                        }
                      `}
                    >
                      {Math.round(char.confidence * 100)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
