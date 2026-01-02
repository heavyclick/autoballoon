/**
 * Central Zustand Store with IndexedDB Persistence
 * The Single Source of Truth for CIE State
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import localforage from 'localforage';

// Configure IndexedDB only in browser environment
if (typeof window !== 'undefined') {
  localforage.config({
    name: 'AutoBalloon-CIE',
    storeName: 'app_state',
    description: 'Client-side project persistence',
  });
}

// Type Definitions
export interface BoundingBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface ParsedDimension {
  nominal: number | null;
  plus_tolerance: number | null;
  minus_tolerance: number | null;
  upper_limit: number | null;
  lower_limit: number | null;
  units: 'in' | 'mm' | 'deg' | null;
  tolerance_type: 'bilateral' | 'limit' | 'fit' | 'basic' | null;
  subtype: 'Linear' | 'Diameter' | 'Radius' | 'Angle' | 'Thread' | 'GD&T' | 'Note' | null;
  is_gdt: boolean;
  gdt_symbol?: string;
  fit_class?: string;
  thread_spec?: string;
  inspection_method?: 'CMM' | 'Caliper' | 'Micrometer' | 'Visual' | 'Gage Block' | null;
  full_specification?: string;
}

export interface Characteristic {
  id: number;
  value: string; // Raw extracted text
  zone: string | null; // Grid location (e.g., "C3")
  confidence: number; // 0-1
  page: number; // Page number (for continuous scroll)
  bounding_box: BoundingBox;
  parsed: ParsedDimension | null;
  // CMM Data (if imported)
  cmm_actual?: number;
  cmm_deviation?: number;
  cmm_status?: 'PASS' | 'FAIL' | 'UNKNOWN';
  // Revision Compare
  status?: 'added' | 'modified' | 'removed' | 'unchanged';
  old_value?: string;
}

export interface Page {
  pageNumber: number;
  image: string; // Base64 PNG
  width: number;
  height: number;
  vectorText: Array<{ text: string; x: number; y: number }>; // From pdf.js
}

export interface ProjectMetadata {
  filename: string;
  uploadedAt: Date;
  totalPages: number;
  processedPages: number;
  partNumber?: string;
  revision?: string;
}

export interface AppState {
  // UI State
  mode: 'landing' | 'processing' | 'workbench'; // The "morph" states
  activeCharacteristicId: number | null;
  selectedTool: 'select' | 'pan' | 'balloon';

  // Project Data
  project: {
    metadata: ProjectMetadata | null;
    pages: Page[];
    characteristics: Characteristic[];
  };

  // Canvas State
  canvas: {
    zoom: number;
    pan: { x: number; y: number };
    showWatermark: boolean;
  };

  // Processing State
  processing: {
    isProcessing: boolean;
    currentStep: string;
    progress: number; // 0-100
  };

  // Actions
  setMode: (mode: AppState['mode']) => void;
  setActiveCharacteristic: (id: number | null) => void;
  setSelectedTool: (tool: AppState['selectedTool']) => void;

  // Project Actions
  initializeProject: (file: File, metadata: ProjectMetadata) => void;
  addPage: (page: Page) => void;
  addCharacteristic: (characteristic: Characteristic) => void;
  updateCharacteristic: (id: number, updates: Partial<Characteristic>) => void;
  deleteCharacteristic: (id: number) => void;
  clearProject: () => void;

  // Canvas Actions
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setWatermark: (show: boolean) => void;

  // Processing Actions
  setProcessing: (state: Partial<AppState['processing']>) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial State
      mode: 'landing',
      activeCharacteristicId: null,
      selectedTool: 'select',

      project: {
        metadata: null,
        pages: [],
        characteristics: [],
      },

      canvas: {
        zoom: 1,
        pan: { x: 0, y: 0 },
        showWatermark: true,
      },

      processing: {
        isProcessing: false,
        currentStep: '',
        progress: 0,
      },

      // UI Actions
      setMode: (mode) => set({ mode }),

      setActiveCharacteristic: (id) => set({ activeCharacteristicId: id }),

      setSelectedTool: (tool) => set({ selectedTool: tool }),

      // Project Actions
      initializeProject: (file, metadata) =>
        set({
          project: {
            metadata,
            pages: [],
            characteristics: [],
          },
          mode: 'processing',
        }),

      addPage: (page) =>
        set((state) => ({
          project: {
            ...state.project,
            pages: [...state.project.pages, page],
          },
        })),

      addCharacteristic: (characteristic) =>
        set((state) => ({
          project: {
            ...state.project,
            characteristics: [...state.project.characteristics, characteristic],
          },
        })),

      updateCharacteristic: (id, updates) =>
        set((state) => ({
          project: {
            ...state.project,
            characteristics: state.project.characteristics.map((char) =>
              char.id === id ? { ...char, ...updates } : char
            ),
          },
        })),

      deleteCharacteristic: (id) =>
        set((state) => ({
          project: {
            ...state.project,
            characteristics: state.project.characteristics.filter(
              (char) => char.id !== id
            ),
          },
        })),

      clearProject: () =>
        set({
          project: {
            metadata: null,
            pages: [],
            characteristics: [],
          },
          activeCharacteristicId: null,
          mode: 'landing',
          canvas: {
            zoom: 1,
            pan: { x: 0, y: 0 },
            showWatermark: true,
          },
        }),

      // Canvas Actions
      setZoom: (zoom) =>
        set((state) => ({
          canvas: { ...state.canvas, zoom: Math.max(0.2, Math.min(5, zoom)) },
        })),

      setPan: (pan) =>
        set((state) => ({
          canvas: { ...state.canvas, pan },
        })),

      setWatermark: (show) =>
        set((state) => ({
          canvas: { ...state.canvas, showWatermark: show },
        })),

      // Processing Actions
      setProcessing: (updates) =>
        set((state) => ({
          processing: { ...state.processing, ...updates },
        })),
    }),
    {
      name: 'cie-app-storage',
      storage: typeof window !== 'undefined'
        ? createJSONStorage(() => localforage)
        : createJSONStorage(() => ({
            getItem: async () => null,
            setItem: async () => {},
            removeItem: async () => {},
          })),
      partialize: (state) => ({
        // Only persist project data, not UI state
        project: state.project,
        canvas: state.canvas,
      }),
      skipHydration: typeof window === 'undefined',
    }
  )
);
