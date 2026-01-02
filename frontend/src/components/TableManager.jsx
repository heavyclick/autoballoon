/**
 * TableManager.jsx
 * Excel-like grid view for managing engineering characteristics, BOM, and Specifications.
 * Supports inline editing and matches InspectionXpert's bottom panel.
 */
import React, { useState } from 'react';

export function TableManager({
  dimensions = [],
  bomItems = [],
  specItems = [],
  selectedId,
  onSelect,
  onUpdate,
  onUpdateBOM,
  onUpdateSpec,
  cmmResults = {}
}) {
  const [activeTab, setActiveTab] = useState('characteristics');

  // Helper to safely get parsed values
  const getVal = (dim, field, fallback = '') => {
    return dim.parsed?.[field] ?? fallback;
  };

  const handleChange = (id, field, value) => {
    // Determine if we are updating the main value or parsed metadata
    if (field === 'value') {
      onUpdate(id, { value });
    } else {
      // For metadata updates (method, fit_class, etc.), we update the 'parsed' object
      // We retrieve the specific dimension to ensure we don't lose other parsed data
      const dim = dimensions.find(d => d.id === id);
      const newParsed = { ...dim.parsed, [field]: value };
      onUpdate(id, { parsed: newParsed });
    }
  };

  // Handlers for BOM and Specs
  const handleBOMChange = (id, field, value) => {
    if (!onUpdateBOM) return;
    const item = bomItems.find(b => b.id === id);
    if (item) {
        onUpdateBOM(id, { ...item, [field]: value });
    }
  };

  const handleSpecChange = (id, field, value) => {
    if (!onUpdateSpec) return;
    const item = specItems.find(s => s.id === id);
    if (item) {
        onUpdateSpec(id, { ...item, [field]: value });
    }
  };

  // --- Renderers ---

  const renderCharacteristicsTable = () => (
    <table className="min-w-full text-xs text-left border-collapse">
      <thead className="sticky top-0 bg-[#252525] text-gray-300 z-10 shadow-sm">
        <tr>
          <th className="p-2 border-r border-b border-[#333] w-12 text-center">#ID</th>
          <th className="p-2 border-r border-b border-[#333] w-16">Chart</th>
          <th className="p-2 border-r border-b border-[#333] w-16">Sheet</th>
          <th className="p-2 border-r border-b border-[#333] w-20">View</th>
          <th className="p-2 border-r border-b border-[#333] w-20">Type</th>
          <th className="p-2 border-r border-b border-[#333] w-24">Subtype</th>
          <th className="p-2 border-r border-b border-[#333] w-48">Full Specification</th>
          <th className="p-2 border-r border-b border-[#333] w-24">Nominal</th>
          <th className="p-2 border-r border-b border-[#333] w-16">Units</th>
          <th className="p-2 border-r border-b border-[#333] w-24">Tolerance</th>
          <th className="p-2 border-r border-b border-[#333] w-20">Lower</th>
          <th className="p-2 border-r border-b border-[#333] w-20">Upper</th>
          <th className="p-2 border-r border-b border-[#333] w-16 text-purple-400">Hole Fit</th>
          <th className="p-2 border-r border-b border-[#333] w-16 text-purple-400">Shaft Fit</th>
          <th className="p-2 border-r border-b border-[#333] w-24 text-blue-400">Method</th>
          <th className="p-2 border-r border-b border-[#333] w-20 text-cyan-400">Grid/Zone</th>
          <th className="p-2 border-r border-b border-[#333] w-24 text-orange-400">Results</th>
          <th className="p-2 border-r border-b border-[#333] w-20 text-green-400">Pass/Fail</th>
        </tr>
      </thead>
      <tbody className="bg-[#161616] text-gray-300">
        {dimensions.map((dim) => {
          const isSelected = selectedId === dim.id;
          // Determine Pass/Fail (cosmetic check)
          const min = getVal(dim, 'min_limit');
          const max = getVal(dim, 'max_limit');
          // Full Spec dynamic rebuild: Use stored value or construct it
          const fullSpecPlaceholder = `${dim.value} ${getVal(dim, 'fit_class') || (getVal(dim, 'upper_tol') ? `±${getVal(dim, 'upper_tol')}` : '')}`;

          return (
            <tr 
              key={dim.id}
              onClick={() => onSelect(dim.id)}
              className={`border-b border-[#2a2a2a] hover:bg-[#2a2a2a] cursor-pointer transition-colors ${
                isSelected ? 'bg-[#3a3a3a]' : ''
              }`}
            >
              {/* ID */}
              <td className={`p-2 border-r border-[#2a2a2a] text-center font-bold ${isSelected ? 'text-white' : 'text-gray-500'}`}>
                {dim.id}
              </td>
              
              {/* Chart Char ID */}
              <td className="p-0 border-r border-[#2a2a2a]">
                <input 
                  className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-center"
                  value={getVal(dim, 'chart_char_id')}
                  onChange={(e) => handleChange(dim.id, 'chart_char_id', e.target.value)}
                />
              </td>

              {/* Sheet */}
              <td className="p-0 border-r border-[#2a2a2a]">
                 <input 
                  className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-center"
                  value={dim.page || getVal(dim, 'sheet', '1')}
                  onChange={(e) => handleChange(dim.id, 'sheet', e.target.value)}
                />
              </td>

               {/* View */}
               <td className="p-0 border-r border-[#2a2a2a]">
                 <input 
                  className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000]"
                  value={getVal(dim, 'view_name')}
                  onChange={(e) => handleChange(dim.id, 'view_name', e.target.value)}
                />
              </td>

              {/* Type */}
              <td className="p-2 border-r border-[#2a2a2a] text-gray-400">
                {getVal(dim, 'is_gdt') ? 'GD&T' : 'Dim'}
              </td>

              {/* Subtype (Expanded Enum) */}
              <td className="p-0 border-r border-[#2a2a2a]">
                <select 
                  className="w-full h-full p-2 bg-transparent border-none outline-none text-gray-300 focus:bg-[#000]"
                  value={getVal(dim, 'subtype', 'Linear')}
                  onChange={(e) => handleChange(dim.id, 'subtype', e.target.value)}
                >
                  <option value="Linear">Linear</option>
                  <option value="Diameter">Diameter (Ø)</option>
                  <option value="Radius">Radius (R)</option>
                  <option value="Angle">Angle (∠)</option>
                  <option value="Chamfer">Chamfer</option>
                  <option value="Weld">Weld</option>
                  <option value="Note">Note</option>
                  <option value="Finish">Finish</option>
                </select>
              </td>

              {/* Full Spec (Dynamic) */}
              <td className="p-0 border-r border-[#2a2a2a]">
                <input 
                  className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] font-mono text-yellow-500/80"
                  value={getVal(dim, 'full_specification')}
                  placeholder={fullSpecPlaceholder}
                  onChange={(e) => handleChange(dim.id, 'full_specification', e.target.value)}
                />
              </td>

              {/* Nominal */}
              <td className="p-0 border-r border-[#2a2a2a]">
                <input 
                  type="text"
                  className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] font-mono text-white"
                  value={dim.value}
                  onChange={(e) => handleChange(dim.id, 'value', e.target.value)}
                />
              </td>

              {/* Units */}
              <td className="p-2 border-r border-[#2a2a2a] text-gray-500 text-xs">
                {getVal(dim, 'units', 'in')}
              </td>

              {/* Tolerance Display */}
              <td className="p-2 border-r border-[#2a2a2a] text-gray-400 font-mono text-[10px]">
                {getVal(dim, 'tolerance_type') === 'fit' ? (
                  <span className="text-purple-400 font-bold">{getVal(dim, 'fit_class')}</span>
                ) : getVal(dim, 'tolerance_type') === 'limit' ? (
                  `+${getVal(dim, 'upper_tol')} / ${getVal(dim, 'lower_tol')}`
                ) : (
                  `± ${getVal(dim, 'upper_tol')}`
                )}
              </td>

              {/* Calculated Limits */}
              <td className="p-2 border-r border-[#2a2a2a] font-mono text-green-500/80 bg-green-900/10">
                {typeof min === 'number' ? min.toFixed(4) : '-'}
              </td>
              <td className="p-2 border-r border-[#2a2a2a] font-mono text-green-500/80 bg-green-900/10">
                {typeof max === 'number' ? max.toFixed(4) : '-'}
              </td>

              {/* Hole Fit */}
              <td className="p-0 border-r border-[#2a2a2a]">
                <input 
                  className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-purple-400 font-bold text-center"
                  value={getVal(dim, 'hole_fit_class')}
                  placeholder="-"
                  onChange={(e) => handleChange(dim.id, 'hole_fit_class', e.target.value)}
                />
              </td>

              {/* Shaft Fit */}
              <td className="p-0 border-r border-[#2a2a2a]">
                <input 
                  className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-purple-400 font-bold text-center"
                  value={getVal(dim, 'shaft_fit_class')}
                  placeholder="-"
                  onChange={(e) => handleChange(dim.id, 'shaft_fit_class', e.target.value)}
                />
              </td>

              {/* Method */}
              <td className="p-0 border-r border-[#2a2a2a]">
                <select
                  className="w-full h-full p-2 bg-transparent border-none outline-none text-blue-400 focus:bg-[#000]"
                  value={getVal(dim, 'inspection_method', '')}
                  onChange={(e) => handleChange(dim.id, 'inspection_method', e.target.value)}
                >
                  <option value="">(None)</option>
                  <option value="CMM">CMM</option>
                  <option value="Caliper">Caliper</option>
                  <option value="Micrometer">Micrometer</option>
                  <option value="Visual">Visual</option>
                  <option value="Gage Block">Gage Block</option>
                </select>
              </td>

              {/* Grid/Zone */}
              <td className="p-2 border-r border-[#2a2a2a] text-cyan-400 font-mono text-center">
                {dim.zone || '-'}
              </td>

              {/* Results (CMM Actual) */}
              <td className="p-2 border-r border-[#2a2a2a] font-mono text-orange-400">
                {cmmResults[dim.id]?.actual !== undefined
                  ? (typeof cmmResults[dim.id].actual === 'number'
                    ? cmmResults[dim.id].actual.toFixed(4)
                    : cmmResults[dim.id].actual)
                  : '-'}
              </td>

              {/* Pass/Fail */}
              <td className="p-2 border-r border-[#2a2a2a] text-center font-bold">
                {cmmResults[dim.id]?.status ? (
                  <span className={cmmResults[dim.id].status === 'PASS' ? 'text-green-500' : 'text-red-500'}>
                    {cmmResults[dim.id].status}
                  </span>
                ) : (
                  <span className="text-gray-600">-</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderBOMTable = () => (
    <table className="min-w-full text-xs text-left border-collapse">
       <thead className="sticky top-0 bg-[#252525] text-gray-300 z-10 shadow-sm">
        <tr>
          <th className="p-2 border-r border-b border-[#333] w-12">#</th>
          <th className="p-2 border-r border-b border-[#333] w-64">Part Name</th>
          <th className="p-2 border-r border-b border-[#333] w-48">Part Number</th>
          <th className="p-2 border-r border-b border-[#333] w-24">Qty</th>
          <th className="p-2 border-r border-b border-[#333] w-48">Manufacturer</th>
        </tr>
      </thead>
      <tbody className="bg-[#161616] text-gray-300">
         {bomItems.length === 0 && (
             <tr><td colSpan="5" className="p-4 text-center text-gray-500">No BOM items yet.</td></tr>
         )}
         {bomItems.map((item, idx) => (
           <tr key={item.id || idx} className="border-b border-[#2a2a2a] hover:bg-[#2a2a2a]">
              <td className="p-2 border-r border-[#2a2a2a] text-center text-gray-500">{idx + 1}</td>
              <td className="p-0 border-r border-[#2a2a2a]">
                 <input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white"
                   value={item.part_name || ''}
                   onChange={(e) => handleBOMChange(item.id, 'part_name', e.target.value)}
                 />
              </td>
              <td className="p-0 border-r border-[#2a2a2a]">
                 <input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white"
                   value={item.part_number || ''}
                   onChange={(e) => handleBOMChange(item.id, 'part_number', e.target.value)}
                 />
              </td>
              <td className="p-0 border-r border-[#2a2a2a]">
                 <input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white"
                   value={item.qty || ''}
                   onChange={(e) => handleBOMChange(item.id, 'qty', e.target.value)}
                 />
              </td>
              <td className="p-0 border-r border-[#2a2a2a]">
                 <input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white"
                   value={item.manufacturer || ''}
                   onChange={(e) => handleBOMChange(item.id, 'manufacturer', e.target.value)}
                 />
              </td>
           </tr>
         ))}
      </tbody>
    </table>
  );

  const renderSpecsTable = () => (
     <table className="min-w-full text-xs text-left border-collapse">
       <thead className="sticky top-0 bg-[#252525] text-gray-300 z-10 shadow-sm">
        <tr>
          <th className="p-2 border-r border-b border-[#333] w-12">#</th>
          <th className="p-2 border-r border-b border-[#333] w-64">Process</th>
          <th className="p-2 border-r border-b border-[#333] w-48">Spec Number</th>
          <th className="p-2 border-r border-b border-[#333] w-32">Code</th>
        </tr>
      </thead>
      <tbody className="bg-[#161616] text-gray-300">
         {specItems.length === 0 && (
             <tr><td colSpan="4" className="p-4 text-center text-gray-500">No specifications yet.</td></tr>
         )}
         {specItems.map((item, idx) => (
           <tr key={item.id || idx} className="border-b border-[#2a2a2a] hover:bg-[#2a2a2a]">
              <td className="p-2 border-r border-[#2a2a2a] text-center text-gray-500">{idx + 1}</td>
              <td className="p-0 border-r border-[#2a2a2a]">
                 <input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white"
                   value={item.process || ''}
                   onChange={(e) => handleSpecChange(item.id, 'process', e.target.value)}
                 />
              </td>
              <td className="p-0 border-r border-[#2a2a2a]">
                 <input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white"
                   value={item.spec_number || ''}
                   onChange={(e) => handleSpecChange(item.id, 'spec_number', e.target.value)}
                 />
              </td>
              <td className="p-0 border-r border-[#2a2a2a]">
                 <input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white"
                   value={item.code || ''}
                   onChange={(e) => handleSpecChange(item.id, 'code', e.target.value)}
                 />
              </td>
           </tr>
         ))}
      </tbody>
    </table>
  );

  return (
    <div className="flex flex-col h-full bg-[#161616] border-t border-[#2a2a2a] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]">
      {/* Toolbar / Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a1a] border-b border-[#2a2a2a]">
        <div className="flex space-x-6">
           <button 
             onClick={() => setActiveTab('characteristics')}
             className={`text-xs font-bold uppercase tracking-wider pb-1 border-b-2 transition-colors ${
                 activeTab === 'characteristics' ? 'text-white border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'
             }`}
           >
             Characteristics (Form 3)
           </button>
           <button 
             onClick={() => setActiveTab('bom')}
             className={`text-xs font-bold uppercase tracking-wider pb-1 border-b-2 transition-colors ${
                 activeTab === 'bom' ? 'text-white border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'
             }`}
           >
             Bill of Materials (Form 1)
           </button>
           <button 
             onClick={() => setActiveTab('specs')}
             className={`text-xs font-bold uppercase tracking-wider pb-1 border-b-2 transition-colors ${
                 activeTab === 'specs' ? 'text-white border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'
             }`}
           >
             Specifications (Form 2)
           </button>
        </div>
        <div className="text-xs text-gray-500">
           {activeTab === 'characteristics' ? `${dimensions.length} items` : 
            activeTab === 'bom' ? `${bomItems.length} items` : 
            `${specItems.length} items`}
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto">
         {activeTab === 'characteristics' && renderCharacteristicsTable()}
         {activeTab === 'bom' && renderBOMTable()}
         {activeTab === 'specs' && renderSpecsTable()}
      </div>
    </div>
  );
}
