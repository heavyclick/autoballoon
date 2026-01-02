import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { LandingView } from './components/LandingView';
import { ProcessingView } from './components/ProcessingView';
import { WorkbenchView } from './components/WorkbenchView';

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
export default function App() {
  const [mounted, setMounted] = useState(false);
  const mode = useAppStore((state) => state.mode);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <main className="min-h-screen w-full overflow-hidden bg-brand-dark">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-brand-gray-500">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full overflow-hidden">
      {mode === 'landing' && <LandingView />}
      {mode === 'processing' && <ProcessingView />}
      {mode === 'workbench' && <WorkbenchView />}
    </main>
  );
}
