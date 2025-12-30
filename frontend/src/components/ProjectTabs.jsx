/**
 * ProjectTabs.jsx
 * Navigation switcher for different project views (BOM, Specs, Characteristics).
 * Sits just above the TableManager.
 */
import React from 'react';

export function ProjectTabs({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'characteristics', label: 'Characteristics' },
    { id: 'bom', label: 'Bill of Material' },
    { id: 'specs', label: 'Specifications' },
  ];

  return (
    <div className="flex items-center gap-1 px-4 bg-[#161616] border-t border-[#2a2a2a]">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              relative px-4 py-3 text-sm font-medium transition-colors
              ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}
            `}
          >
            {tab.label}
            
            {/* Active Indicator Line */}
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}
