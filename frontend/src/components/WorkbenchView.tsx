'use client';

import { useAppStore } from '@/store/useAppStore';
import { DrawingCanvas } from './canvas/DrawingCanvas';
import { PropertiesSidebar } from './panels/PropertiesSidebar';
import { TableManager } from './panels/TableManager';
import { Toolbar } from './Toolbar';

/**
 * Workbench View (The Professional State)
 *
 * Layout:
 * - Top: Toolbar (minimal, non-distracting)
 * - Center: DrawingCanvas (the focal point)
 * - Right: PropertiesSidebar (slides in when characteristic selected)
 * - Bottom: TableManager (collapsible, 40px when hidden)
 *
 * NO NAVIGATION. ONLY FOCUSED WORK.
 */
export function WorkbenchView() {
  const activeCharacteristicId = useAppStore((state) => state.activeCharacteristicId);

  return (
    <div className="h-screen flex flex-col bg-brand-dark overflow-hidden">
      {/* Toolbar */}
      <Toolbar />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas (Primary Focus) */}
        <div className="flex-1 relative">
          <DrawingCanvas />
        </div>

        {/* Properties Sidebar (Conditional) */}
        {activeCharacteristicId !== null && (
          <div className="w-80 border-l border-brand-gray-800 bg-brand-gray-900 flex-shrink-0 animate-slide-in">
            <PropertiesSidebar />
          </div>
        )}
      </div>

      {/* Table Manager (Bottom) */}
      <div className="h-72 border-t border-brand-gray-800 bg-brand-gray-900 flex-shrink-0">
        <TableManager />
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        .animate-slide-in {
          animation: slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>
    </div>
  );
}
