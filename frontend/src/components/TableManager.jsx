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
  onAddBOM,   // New Prop from DropZone
  onAddSpec   // New Prop from DropZone
}) {
  const [activeTab, setActiveTab] = useState('characteristics');

  // Helper to safely get parsed values
  const getVal = (dim, field, fallback = '') => {
    return dim.parsed?.[field] ?? fallback;
  };

  const handleChange = (id, field, value) => {
    if (field === 'value') {
      onUpdate(id, { value });
    } else {
      const dim = dimensions.find(d => d.id === id);
      const newParsed = { ...dim.parsed, [field]: value };
      onUpdate(id, { parsed: newParsed });
    }
  };

  const handleBOMChange = (id, field, value) => {
    if (!onUpdateBOM) return;
    const item = bomItems.find(b => b.id === id);
    if (item) onUpdateBOM(id, { ...item, [field]: value });
  };

  const handleSpecChange = (id, field, value) => {
    if (!onUpdateSpec) return;
    const item = specItems.find(s => s.id === id);
    if (item) onUpdateSpec(id, { ...item, [field]: value });
  };

  // --- Renderers ---

  const renderCharacteristicsTable = () => (
    <table className="min-w-full text-xs text-left border-collapse">
      <thead className="sticky top-0 bg-[#252525] text-gray-300 z-10 shadow-sm">
        <tr>
          <th className="p-2 border-r border-b border-[#333] w-12 text-center">#ID</th>
          <th className="p-2 border-r border-b border-[#333] w-16">Sheet</th>
          <th className="p-2 border-r border-b border-[#333] w-20">View</th>
          <th className="p-2 border-r border-b border-[#333] w-24">Subtype</th>
          <th className="p-2 border-r border-b border-[#333] w-48">Full Specification</th>
          <th className="p-2 border-r border-b border-[#333] w-24">Nominal</th>
          <th className="p-2 border-r border-b border-[#333] w-24">Tolerance</th>
          <th className="p-2 border-r border-b border-[#333] w-20 text-green-500/80">Lower</th>
          <th className="p-2 border-r border-b border-[#333] w-20 text-green-500/80">Upper</th>
          <th className="p-2 border-r border-b border-[#333] w-16 text-purple-400">Hole</th>
          <th className="p-2 border-r border-b border-[#333] w-16 text-purple-400">Shaft</th>
          <th className="p-2 border-r border-b border-[#333] w-24 text-blue-400">Method</th>
        </tr>
      </thead>
      <tbody className="bg-[#161616] text-gray-300">
        {dimensions.map((dim) => {
          const isSelected = selectedId === dim.id;
          const min = getVal(dim, 'min_limit');
          const max = getVal(dim, 'max_limit');
          const fullSpecPlaceholder = `${dim.value} ${getVal(dim, 'fit_class') || (getVal(dim, 'upper_tol') ? `±${getVal(dim, 'upper_tol')}` : '')}`;

          return (
            <tr 
              key={dim.id}
              onClick={() => onSelect(dim.id)}
              className={`border-b border-[#2a2a2a] hover:bg-[#2a2a2a] cursor-pointer transition-colors ${isSelected ? 'bg-[#3a3a3a]' : ''}`}
            >
              <td className={`p-2 border-r border-[#2a2a2a] text-center font-bold ${isSelected ? 'text-white' : 'text-gray-500'}`}>{dim.id}</td>
              <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-center" value={dim.page || getVal(dim, 'sheet', '1')} onChange={(e) => handleChange(dim.id, 'sheet', e.target.value)} /></td>
              <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000]" value={getVal(dim, 'view_name')} onChange={(e) => handleChange(dim.id, 'view_name', e.target.value)} /></td>
              <td className="p-0 border-r border-[#2a2a2a]">
                <select className="w-full h-full p-2 bg-transparent border-none outline-none text-gray-300 focus:bg-[#000]" value={getVal(dim, 'subtype', 'Linear')} onChange={(e) => handleChange(dim.id, 'subtype', e.target.value)}>
                  <option value="Linear">Linear</option><option value="Diameter">Diameter (Ø)</option><option value="Radius">Radius (R)</option><option value="Angle">Angle (∠)</option><option value="Chamfer">Chamfer</option><option value="Weld">Weld</option><option value="Note">Note</option><option value="Finish">Finish</option>
                </select>
              </td>
              <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] font-mono text-yellow-500/80" value={getVal(dim, 'full_specification')} placeholder={fullSpecPlaceholder} onChange={(e) => handleChange(dim.id, 'full_specification', e.target.value)} /></td>
              <td className="p-0 border-r border-[#2a2a2a]"><input type="text" className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] font-mono text-white" value={dim.value} onChange={(e) => handleChange(dim.id, 'value', e.target.value)} /></td>
              <td className="p-2 border-r border-[#2a2a2a] text-gray-400 font-mono text-[10px]">{getVal(dim, 'tolerance_type') === 'fit' ? <span className="text-purple-400 font-bold">{getVal(dim, 'fit_class')}</span> : getVal(dim, 'tolerance_type') === 'limit' ? `+${getVal(dim, 'upper_tol')} / ${getVal(dim, 'lower_tol')}` : `± ${getVal(dim, 'upper_tol')}`}</td>
              <td className="p-2 border-r border-[#2a2a2a] font-mono text-green-500/80 bg-green-900/10">{typeof min === 'number' ? min.toFixed(4) : '-'}</td>
              <td className="p-2 border-r border-[#2a2a2a] font-mono text-green-500/80 bg-green-900/10">{typeof max === 'number' ? max.toFixed(4) : '-'}</td>
              <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-purple-400 font-bold text-center" value={getVal(dim, 'hole_fit_class')} placeholder="-" onChange={(e) => handleChange(dim.id, 'hole_fit_class', e.target.value)} /></td>
              <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-purple-400 font-bold text-center" value={getVal(dim, 'shaft_fit_class')} placeholder="-" onChange={(e) => handleChange(dim.id, 'shaft_fit_class', e.target.value)} /></td>
              <td className="p-0 border-r border-[#2a2a2a]">
                 <select className="w-full h-full p-2 bg-transparent border-none outline-none text-blue-400 focus:bg-[#000]" value={getVal(dim, 'inspection_method', '')} onChange={(e) => handleChange(dim.id, 'inspection_method', e.target.value)}>
                  <option value="">(None)</option><option value="CMM">CMM</option><option value="Caliper">Caliper</option><option value="Micrometer">Micrometer</option><option value="Visual">Visual</option>
                </select>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderBOMTable = () => (
    <div className="flex flex-col h-full">
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
            {bomItems.map((item, idx) => (
                <tr key={item.id || idx} className="border-b border-[#2a2a2a] hover:bg-[#2a2a2a]">
                <td className="p-2 border-r border-[#2a2a2a] text-center text-gray-500">{idx + 1}</td>
                <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white" value={item.part_name || ''} onChange={(e) => handleBOMChange(item.id, 'part_name', e.target.value)} /></td>
                <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white" value={item.part_number || ''} onChange={(e) => handleBOMChange(item.id, 'part_number', e.target.value)} /></td>
                <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white" value={item.qty || ''} onChange={(e) => handleBOMChange(item.id, 'qty', e.target.value)} /></td>
                <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white" value={item.manufacturer || ''} onChange={(e) => handleBOMChange(item.id, 'manufacturer', e.target.value)} /></td>
                </tr>
            ))}
        </tbody>
        </table>
        <button onClick={onAddBOM} className="mt-2 mx-4 py-2 border-2 border-dashed border-[#333] rounded hover:bg-[#2a2a2a] text-gray-500 text-xs">+ Add BOM Item</button>
    </div>
  );

  const renderSpecsTable = () => (
    <div className="flex flex-col h-full">
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
            {specItems.map((item, idx) => (
                <tr key={item.id || idx} className="border-b border-[#2a2a2a] hover:bg-[#2a2a2a]">
                <td className="p-2 border-r border-[#2a2a2a] text-center text-gray-500">{idx + 1}</td>
                <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white" value={item.process || ''} onChange={(e) => handleSpecChange(item.id, 'process', e.target.value)} /></td>
                <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white" value={item.spec_number || ''} onChange={(e) => handleSpecChange(item.id, 'spec_number', e.target.value)} /></td>
                <td className="p-0 border-r border-[#2a2a2a]"><input className="w-full h-full p-2 bg-transparent border-none outline-none focus:bg-[#000] text-white" value={item.code || ''} onChange={(e) => handleSpecChange(item.id, 'code', e.target.value)} /></td>
                </tr>
            ))}
        </tbody>
        </table>
        <button onClick={onAddSpec} className="mt-2 mx-4 py-2 border-2 border-dashed border-[#333] rounded hover:bg-[#2a2a2a] text-gray-500 text-xs">+ Add Specification</button>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#161616] border-t border-[#2a2a2a]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a1a] border-b border-[#2a2a2a]">
        <div className="flex space-x-6">
           <button onClick={() => setActiveTab('characteristics')} className={`text-xs font-bold uppercase tracking-wider pb-1 border-b-2 transition-colors ${activeTab === 'characteristics' ? 'text-white border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>Characteristics (Form 3)</button>
           <button onClick={() => setActiveTab('bom')} className={`text-xs font-bold uppercase tracking-wider pb-1 border-b-2 transition-colors ${activeTab === 'bom' ? 'text-white border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>Bill of Materials (Form 1)</button>
           <button onClick={() => setActiveTab('specs')} className={`text-xs font-bold uppercase tracking-wider pb-1 border-b-2 transition-colors ${activeTab === 'specs' ? 'text-white border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>Specifications (Form 2)</button>
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-auto">
         {activeTab === 'characteristics' && renderCharacteristicsTable()}
         {activeTab === 'bom' && renderBOMTable()}
         {activeTab === 'specs' && renderSpecsTable()}
      </div>
    </div>
  );
}
