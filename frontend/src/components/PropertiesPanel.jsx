import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../constants/config';
import { cropDimensionImage } from '../utils/imageCropper';

/**
 * PropertiesPanel.jsx
 * Left sidebar for editing detailed properties of the selected dimension.
 * Matches InspectionXpert's "General Settings" / "Characteristic" panel.
 * * Updates:
 * - Added Chart ID, Sheet, View inputs (Dimension Model)
 * - Added Full Specification text area (Parsed Model)
 * - Updated Tolerance UI for Fits (Hole/Shaft) and Bilateral (+/-)
 * - Added Sampling Calculator inputs (ANSI Z1.4)
 * - Expanded Subtypes to include Weld, Surface Finish, GD&T
 * - Added zoomed dimension preview image
 */
export function PropertiesPanel({ selectedDimension, onUpdate, blueprintImage }) {
  const [zoomedImage, setZoomedImage] = useState(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  if (!selectedDimension) {
    return (
      <div className="w-64 bg-[#161616] border-r border-[#2a2a2a] p-6 text-center">
        <div className="text-gray-600 mt-10">
          <svg className="w-12 h-12 mx-auto mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <p className="text-sm font-medium">No Selection</p>
          <p className="text-xs mt-2">Click a balloon to edit properties</p>
        </div>
      </div>
    );
  }

  // Helper to safely get nested parsed values
  const getVal = (field, fallback = '') => {
    return selectedDimension.parsed?.[field] ?? fallback;
  };

  // Helper to safely get root values (fallback to empty string for inputs)
  const getRoot = (field, fallback = '') => {
    return selectedDimension[field] ?? fallback;
  };

  const updateParsed = (field, value) => {
    onUpdate(selectedDimension.id, {
      parsed: {
        ...selectedDimension.parsed,
        [field]: value
      }
    });
  };

  const updateRoot = (field, value) => {
    onUpdate(selectedDimension.id, { [field]: value });
  };

  // Load zoomed dimension image
  useEffect(() => {
    if (selectedDimension && blueprintImage) {
      setIsLoadingImage(true);
      setZoomedImage(null);
      cropDimensionImage(blueprintImage, selectedDimension)
        .then(img => {
          setZoomedImage(img);
          setIsLoadingImage(false);
        })
        .catch(error => {
          console.error('Failed to crop dimension image:', error);
          setIsLoadingImage(false);
        });
    } else {
      setZoomedImage(null);
    }
  }, [selectedDimension?.id, blueprintImage]);

  // Trigger calculation when inputs change
  useEffect(() => {
    const fetchSampling = async () => {
        const lotSize = getVal('lot_size');
        const aql = getVal('aql');
        const level = getVal('inspection_level');

        if (lotSize > 0) {
            try {
                const res = await fetch(`${API_BASE_URL}/sampling/calculate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        lot_size: Number(lotSize), 
                        aql: parseFloat(aql), 
                        level: level 
                    })
                });
                const data = await res.json();
                if (data.sample_size) {
                    updateParsed('sample_size', data.sample_size);
                }
            } catch (e) {
                console.error("Sampling calc failed", e);
            }
        }
    };

    // Debounce slightly to avoid too many requests
    const timer = setTimeout(fetchSampling, 500);
    return () => clearTimeout(timer);
  }, [
    selectedDimension?.parsed?.lot_size, 
    selectedDimension?.parsed?.aql, 
    selectedDimension?.parsed?.inspection_level
  ]);

  return (
    <div className="w-80 bg-[#161616] border-r border-[#2a2a2a] flex flex-col h-full overflow-y-auto text-gray-300 font-sans">
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a2a] bg-[#1a1a1a]">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs text-white">
            {selectedDimension.id}
          </span>
          Properties
        </h2>
      </div>

      <div className="p-4 space-y-6">

        {/* Section: Zoomed Dimension Preview */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Dimension Preview</h3>
          <div className="bg-[#0a0a0a] rounded-lg p-3 border border-[#2a2a2a]">
            {isLoadingImage ? (
              <div className="flex items-center justify-center h-24">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : zoomedImage ? (
              <img
                src={zoomedImage}
                alt={`Dimension ${selectedDimension.id}`}
                className="w-full h-auto rounded"
                style={{ imageRendering: 'crisp-edges' }}
              />
            ) : (
              <div className="flex items-center justify-center h-24 text-gray-600 text-xs">
                Preview not available
              </div>
            )}
          </div>
        </div>

        {/* Section: Identification */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Identification</h3>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Chart ID</label>
              <input 
                type="text" 
                className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500 transition-colors"
                value={getRoot('chart_char_id')}
                onChange={(e) => updateRoot('chart_char_id', e.target.value)}
                placeholder="e.g. 1.1"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Operation</label>
              <input 
                type="text" 
                className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500 transition-colors"
                value={getVal('operation')}
                onChange={(e) => updateParsed('operation', e.target.value)}
                placeholder="Op 10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Sheet</label>
              <input 
                type="text" 
                className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500 transition-colors"
                value={getRoot('sheet')}
                onChange={(e) => updateRoot('sheet', e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">View</label>
              <input 
                type="text" 
                className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500 transition-colors"
                value={getRoot('view_name')}
                onChange={(e) => updateRoot('view_name', e.target.value)}
                placeholder="Front"
              />
            </div>
          </div>
        </div>

        {/* Section: Definition */}
        <div className="space-y-3 pt-4 border-t border-[#2a2a2a]">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Definition</h3>
          
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Full Specification</label>
            <textarea 
              className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none resize-none h-16 font-mono"
              value={getVal('full_specification', selectedDimension.value || '')}
              onChange={(e) => updateParsed('full_specification', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Nominal Value</label>
              <input 
                type="text" 
                className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                value={getRoot('value')}
                onChange={(e) => updateRoot('value', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">Units</label>
              <select 
                className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs text-gray-300 outline-none"
                value={getVal('units', 'in')}
                onChange={(e) => updateParsed('units', e.target.value)}
              >
                <option value="in">Inch</option>
                <option value="mm">MM</option>
                <option value="deg">Deg</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400">Feature Type</label>
            <select 
              className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs text-gray-300 outline-none"
              value={getVal('subtype', 'Linear')}
              onChange={(e) => updateParsed('subtype', e.target.value)}
            >
              <option value="Linear">Linear</option>
              <option value="Diameter">Diameter</option>
              <option value="Radius">Radius</option>
              <option value="Angle">Angle</option>
              <option value="Chamfer">Chamfer</option>
              <option value="Note">Note</option>
              <option value="Weld">Weld</option>
              <option value="Surface Finish">Surface Finish</option>
              <option value="GD&T">GD&T</option>
            </select>
          </div>
        </div>

        {/* Section: Tolerancing */}
        <div className="space-y-3 pt-4 border-t border-[#2a2a2a]">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tolerancing</h3>
          
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Tolerance Type</label>
            <select 
              className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs text-gray-300 outline-none"
              value={getVal('tolerance_type', 'bilateral')}
              onChange={(e) => updateParsed('tolerance_type', e.target.value)}
            >
              <option value="bilateral">Bilateral (±)</option>
              <option value="limit">Limit (High/Low)</option>
              <option value="fit">ISO 286 Fit</option>
              <option value="max">Max</option>
              <option value="min">Min</option>
              <option value="basic">Basic</option>
            </select>
          </div>

          {/* Conditional Inputs based on Tolerance Type */}
          {getVal('tolerance_type') === 'fit' ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-purple-400 font-bold">Hole Fit</label>
                <input 
                  type="text" 
                  className="w-full bg-[#0a0a0a] border border-purple-900/50 rounded px-2 py-1.5 text-sm text-purple-400 focus:border-purple-500 outline-none font-mono uppercase"
                  value={getVal('hole_fit_class')}
                  placeholder="H7"
                  onChange={(e) => updateParsed('hole_fit_class', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-purple-400 font-bold">Shaft Fit</label>
                <input 
                  type="text" 
                  className="w-full bg-[#0a0a0a] border border-purple-900/50 rounded px-2 py-1.5 text-sm text-purple-400 focus:border-purple-500 outline-none font-mono uppercase"
                  value={getVal('shaft_fit_class')}
                  placeholder="g6"
                  onChange={(e) => updateParsed('shaft_fit_class', e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Plus (+)</label>
                <input 
                  type="number" step="0.001"
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-sm text-white outline-none font-mono"
                  value={getVal('plus_tolerance')}
                  onChange={(e) => updateParsed('plus_tolerance', e.target.value === '' ? '' : parseFloat(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Minus (-)</label>
                <input 
                  type="number" step="0.001"
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-sm text-white outline-none font-mono"
                  value={getVal('minus_tolerance')}
                  onChange={(e) => updateParsed('minus_tolerance', e.target.value === '' ? '' : parseFloat(e.target.value))}
                />
              </div>
            </div>
          )}

          <div className="bg-[#222] rounded p-2 mt-2 border border-[#333]">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">Upper Limit:</span>
              <span className="text-green-400 font-mono">{getVal('max_limit', 0).toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Lower Limit:</span>
              <span className="text-green-400 font-mono">{getVal('min_limit', 0).toFixed(4)}</span>
            </div>
          </div>
        </div>

        {/* Section: Inspection */}
        <div className="space-y-3 pt-4 border-t border-[#2a2a2a]">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Inspection</h3>
          
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Method</label>
            <select 
              className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs text-blue-400 font-medium outline-none"
              value={getVal('inspection_method', '')}
              onChange={(e) => updateParsed('inspection_method', e.target.value)}
            >
              <option value="">Select Method...</option>
              <option value="CMM">CMM</option>
              <option value="Visual">Visual</option>
              <option value="Caliper">Caliper</option>
              <option value="Micrometer">Micrometer</option>
              <option value="Gage Block">Gage Block</option>
              <option value="Pin Gage">Pin Gage</option>
              <option value="Height Gage">Height Gage</option>
            </select>
          </div>
        </div>

         {/* Section: Sampling (ANSI Z1.4) */}
         <div className="space-y-3 pt-4 border-t border-[#2a2a2a]">
          <h3 className="text-xs font-bold text-yellow-600 uppercase tracking-wider">Sampling (ANSI Z1.4)</h3>
          
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Lot Size</label>
            <input 
              type="number" 
              className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-sm text-white outline-none"
              value={getVal('lot_size', 0)}
              onChange={(e) => updateParsed('lot_size', parseInt(e.target.value) || 0)}
              placeholder="Total Lot Qty"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-gray-400">AQL</label>
                <select 
                    className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs text-gray-300 outline-none"
                    value={getVal('aql', '2.5')}
                    onChange={(e) => updateParsed('aql', e.target.value)}
                >
                    <option value="0.65">0.65</option>
                    <option value="1.0">1.0</option>
                    <option value="1.5">1.5</option>
                    <option value="2.5">2.5</option>
                    <option value="4.0">4.0</option>
                    <option value="6.5">6.5</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Level</label>
                <select 
                    className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs text-gray-300 outline-none"
                    value={getVal('inspection_level', 'II')}
                    onChange={(e) => updateParsed('inspection_level', e.target.value)}
                >
                    <option value="I">I (Reduced)</option>
                    <option value="II">II (Normal)</option>
                    <option value="III">III (Tight)</option>
                </select>
              </div>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-900/50 rounded p-2 mt-2 flex justify-between items-center">
             <span className="text-xs text-yellow-500">Required Sample Size:</span>
             <span className="text-lg font-bold text-white">{getVal('sample_size', 'N/A')}</span>
          </div>

        </div>

      </div>
    </div>
  );
}
