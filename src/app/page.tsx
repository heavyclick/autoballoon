'use client';

import { useAppStore } from '@/store/useAppStore';
import { LandingView } from '@/components/LandingView';
import { ProcessingView } from '@/components/ProcessingView';
import { WorkbenchView } from '@/components/WorkbenchView';

// Force dynamic rendering to prevent static generation issues with Zustand + IndexedDB
export const dynamic = 'force-dynamic';

/**
 * The Unified Surface
 *
 * This single page morphs between three states:
 * 1. Landing: Marketing + DropZone
 * 2. Processing: Extraction progress
 * 3. Workbench: Full canvas editor
 *
 * NO NAVIGATION. ONLY TRANSFORMATION.
 */
export default function Home() {
  const mode = useAppStore((state) => state.mode);

  return (
    <main className="min-h-screen w-full overflow-hidden">
      {mode === 'landing' && <LandingView />}
      {mode === 'processing' && <ProcessingView />}
      {mode === 'workbench' && <WorkbenchView />}
    </main>
  );
}
