/**
 * DropZone.jsx - PRODUCTION READY WITH FULL FEATURE INTEGRATION
 * * Integrated Features:
 * 1. TableManager (Chart, Sheet, View, Fits, Method columns)
 * 2. PropertiesPanel (Sampling calculator, ISO fits, full spec)
 * 3. BOM & Specifications state management
 * 4. CMM Import
 * 5. Revision Porting
 * 6. Non-dimensional feature type selection
 * 7. Method auto-detection
 * * FIXED: Regex syntax for Base64 image replacement
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { useAuth } from '../context/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { API_BASE_URL, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS } from '../constants/config';
import { GlassWallPaywall } from './GlassWallPaywall';
import { PreviewWatermark } from './PreviewWatermark';
import { TableManager } from './TableManager';
import { PropertiesPanel } from './PropertiesPanel';
import { CMMImport } from './CMMImport';

export function DropZone({ onBeforeProcess, hasPromoAccess = false, userEmail = '' }) {
  const { token, isPro } = useAuth();
  const { visitorId, incrementUsage, usage, refreshUsage } = useUsage();
  const fileInputRef = useRef(null);
  const projectInputRef = useRef(null);
  const canDownload = isPro || hasPromoAccess;
  
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showGlassWall, setShowGlassWall] = useState(false);
  const [showRevisionCompare, setShowRevisionCompare] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { if (refreshUsage) refreshUsage(); }, []);
  
  const handleDragEnter = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  
  const validateFile = (file) => {
    if (!file) return 'No file selected';
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return `Unsupported format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return `File too large. Maximum: ${MAX_FILE_SIZE_MB}MB`;
    return null;
  };

  const processFile = async (file) => {
    const validationError = validateFile(file);
    if (validationError) { setError(validationError); return; }
    if (onBeforeProcess && !onBeforeProcess()) return;
    
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setCurrentPage(1);
    setTotalPages(1);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (!token) formData.append('visitor_id', visitorId);
      
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch(`${API_BASE_URL}/process`, { 
        method: 'POST', 
        headers, 
        body: formData 
      });
      
      const data = await response.json();
      
      if (data.success) {
        if (data.pages && data.pages.length > 0) {
          setTotalPages(data.total_pages || data.pages.length);
          setCurrentPage(1);
        }
        setResult(data);
        await incrementUsage();
        if (refreshUsage) await refreshUsage();
      } else {
        setError(data.error?.message || 'Processing failed');
      }
    } catch (err) {
      setError('Network error. Please check your connection.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadProject = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsProcessing(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const stateFile = zip.file("state.json");
      if (!stateFile) throw new Error("Invalid .ab project file");
      
      const stateStr = await stateFile.async("string");
      const loadedState = JSON.parse(stateStr);
      
      setResult(loadedState.result);
      setTotalPages(loadedState.totalPages);
      setCurrentPage(1);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to load project file. It may be corrupted.");
    } finally {
      setIsProcessing(false);
      if (projectInputRef.current) projectInputRef.current.value = '';
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault(); 
    e.stopPropagation(); 
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      if (files[0].name.endsWith('.ab')) {
        handleLoadProject({ target: { files: [files[0]] } });
      } else {
        processFile(files[0]);
      }
    }
  }, [token, visitorId, onBeforeProcess, usage]);

  const handleFileChange = (e) => { if (e.target.files?.[0]) processFile(e.target.files[0]); };
  const handleClick = () => { fileInputRef.current?.click(); };
  const handleReset = () => { setResult(null); setError(null); setCurrentPage(1); setTotalPages(1); };
  
  const handleRevisionCompareResult = async (comparisonData) => {
    await incrementUsage();
    if (refreshUsage) await refreshUsage();
    setResult(comparisonData);
    setShowRevisionCompare(false);
  };

  const getTotalDimensionCount = () => {
    if (!result) return 0;
    if (result.pages && result.pages.length > 0) {
      return result.pages.reduce((sum, p) => sum + (p.dimensions?.length || 0), 0);
    }
    return result.dimensions?.length || 0;
  };

  if (showRevisionCompare) return (
    <RevisionCompare 
      onClose={() => setShowRevisionCompare(false)} 
      onComplete={handleRevisionCompareResult} 
      visitorId={visitorId} 
      incrementUsage={incrementUsage} 
      isPro={canDownload} 
      onShowGlassWall={() => setShowGlassWall(true)} 
      token={token}
    />
  );

  if (result) return (
    <>
      <GlassWallPaywall 
        isOpen={showGlassWall}
        onClose={() => setShowGlassWall(false)}
        dimensionCount={getTotalDimensionCount()}
        estimatedHours={(getTotalDimensionCount() * 1 + 10) / 60}
      />
      <BlueprintViewer 
        result={result} 
        onReset={handleReset} 
        token={token}
        isPro={canDownload}
        onShowGlassWall={() => setShowGlassWall(true)}
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        totalPages={totalPages} 
      />
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-4">
        <button 
          onClick={() => setShowRevisionCompare(true)} 
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl transition-all text-sm flex items-center gap-2 font-medium shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Compare Revisions
        </button>
        <button 
          onClick={() => projectInputRef.current?.click()} 
          className="px-6 py-3 bg-[#1a1a1a] border border-[#333] hover:bg-[#252525] text-white rounded-xl transition-all text-sm flex items-center gap-2 font-medium shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Load Project (.ab)
        </button>
        <input ref={projectInputRef} type="file" accept=".ab" onChange={handleLoadProject} className="hidden" />
      </div>
      
      <div
        className={`relative border-2 border-dashed rounded-xl p-12 transition-all duration-200 cursor-pointer ${
          isDragging ? 'border-[#E63946] bg-[#E63946]/10' : 'border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#1a1a1a]'
        } ${isProcessing ? 'pointer-events-none' : ''}`}
        onDragEnter={handleDragEnter} 
        onDragLeave={handleDragLeave} 
        onDragOver={handleDragOver} 
        onDrop={handleDrop} 
        onClick={handleClick}
      >
        <input 
          ref={fileInputRef} 
          type="file" 
          accept={ALLOWED_EXTENSIONS.join(',')} 
          onChange={handleFileChange} 
          className="hidden" 
        />
        
        {isProcessing ? (
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#E63946] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xl font-medium text-white mb-2">Processing...</p>
            <p className="text-gray-400 text-sm">Detecting dimensions & analyzing tolerances...</p>
          </div>
        ) : (
          <div className="text-center">
            <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${
              isDragging ? 'bg-[#E63946]/20' : 'bg-[#1a1a1a]'
            }`}>
              <svg className={`w-10 h-10 ${isDragging ? 'text-[#E63946]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-xl font-medium text-white mb-2">
              {isDragging ? 'Drop your file here' : 'Drag & drop your blueprint'}
            </p>
            <p className="text-gray-400 mb-4">or <span className="text-[#E63946]">click to browse</span></p>
            <p className="text-gray-500 text-sm">PDF (Vector/OCR), PNG, JPEG, TIFF</p>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-x-0 bottom-4 text-center">
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// BLUEPRINT VIEWER - FULLY INTEGRATED WITH ALL COMPONENTS
// ============================================================================

function BlueprintViewer({ result, onReset, token, isPro, onShowGlassWall, currentPage, setCurrentPage, totalPages }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedDimId, setSelectedDimId] = useState(null);
  
  // Multi-page support
  const hasMultiplePages = result.pages && result.pages.length > 1;
  const getCurrentPageData = () => {
    if (hasMultiplePages) {
      return result.pages.find(p => p.page_number === currentPage) || result.pages[0];
    }
    return { 
      image: result.image, 
      dimensions: result.dimensions || [], 
      grid_detected: result.grid?.detected 
    };
  };
  
  const currentPageData = getCurrentPageData();
  const currentImage = hasMultiplePages 
    ? `data:image/png;base64,${currentPageData.image}` 
    : (currentPageData.image?.startsWith('data:') ? currentPageData.image : `data:image/png;base64,${currentPageData.image}`);

  // BOM & Specifications State
  const [bomItems, setBomItems] = useState([
    { id: 1, part_name: '', part_number: '', qty: '1', manufacturer: '' }
  ]);
  const [specItems, setSpecItems] = useState([
    { id: 1, process: '', spec_number: '', code: '' }
  ]);

  // Initialize dimensions with enhanced detection
  const [dimensions, setDimensions] = useState(() => {
    const dims = hasMultiplePages ? currentPageData.dimensions : (result.dimensions || []);
    return dims.map(d => initializeDimension(d));
  });

  // Re-sync when page changes
  useEffect(() => {
    const pageDims = hasMultiplePages ? currentPageData.dimensions : (result.dimensions || []);
    setDimensions(prev => {
      return pageDims.map(d => {
        const existing = prev.find(p => p.id === d.id);
        if (existing) return existing;
        return initializeDimension(d);
      });
    });
    setSelectedDimId(null);
  }, [currentPage, result]);

  // Initialize Dimension with better method detection
  function initializeDimension(d) {
    return {
      ...d,
      anchorX: (d.bounding_box.xmin + d.bounding_box.xmax) / 2 / 10,
      anchorY: (d.bounding_box.ymin + d.bounding_box.ymax) / 2 / 10,
      balloonX: (d.bounding_box.xmin + d.bounding_box.xmax) / 2 / 10 + 4,
      balloonY: (d.bounding_box.ymin + d.bounding_box.ymax) / 2 / 10 - 4,
      method: d.method || detectMethod(d),
      confidence: d.confidence !== undefined ? d.confidence : 0.95,
      parsed: d.parsed || {
        nominal: 0,
        units: 'in',
        tolerance_type: 'bilateral',
        plus_tolerance: 0,
        minus_tolerance: 0,
        upper_limit: 0,
        lower_limit: 0,
        subtype: 'Linear',
        inspection_method: d.method || detectMethod(d),
        lot_size: 0,
        aql: 2.5,
        inspection_level: 'II',
        sample_size: 0
      }
    };
  }

  // Better Method Auto-Detection
  function detectMethod(dim) {
    if (!dim.parsed) return "Caliper";
    // GD&T → CMM
    if (dim.parsed.is_gdt) return "CMM";
    // Thread callouts → CMM
    if (dim.value.includes('UN') || dim.value.includes('NPT') || dim.value.includes('M8') || dim.value.includes('M10')) {
      return "CMM";
    }
    // Surface Finish → Visual
    if (dim.parsed.subtype === 'Finish' || dim.value.includes('Ra')) {
      return "Visual";
    }
    // Notes → Visual
    if (dim.parsed.subtype === 'Note' || dim.value.includes('NOTE')) {
      return "Visual";
    }
    // Tight tolerance (< 0.001) → Micrometer or Gage Block
    const totalTol = Math.abs((dim.parsed.upper_limit || 0) - (dim.parsed.lower_limit || 0));
    if (totalTol > 0 && totalTol < 0.001) return "Gage Block";
    if (totalTol > 0 && totalTol < 0.01) return "Micrometer";
    // Basic dimensions → CMM
    if (dim.parsed.tolerance_type === 'basic') return "CMM";
    // Default based on feature type
    if (dim.value.startsWith('Ø')) return "Caliper";
    if (dim.value.startsWith('R')) return "Caliper";
    
    return "Caliper";
  }

  // Drawing mode state
  const [drawMode, setDrawMode] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawEnd, setDrawEnd] = useState(null);
  
  // Feature type selection for Add Balloon
  const [newBalloonType, setNewBalloonType] = useState('dimension');
  const [showValueInput, setShowValueInput] = useState(false);
  const [newBalloonRect, setNewBalloonRect] = useState(null);
  const [newBalloonValue, setNewBalloonValue] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState(null);
  const [showCMMImport, setShowCMMImport] = useState(false);
  const [cmmResults, setCmmResults] = useState({});
  
  const containerRef = useRef(null);
  const imageRef = useRef(null);

  const getTotalDimensions = () => {
    if (hasMultiplePages) return result.pages.reduce((sum, p) => sum + (p.dimensions?.length || 0), 0);
    return result.dimensions?.length || 0;
  };

  // Handlers for BOM & Specs
  const handleUpdateBOM = (id, updates) => {
    setBomItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleUpdateSpec = (id, updates) => {
    setSpecItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleAddBOMRow = () => {
    const newId = Math.max(...bomItems.map(b => b.id), 0) + 1;
    setBomItems(prev => [...prev, { id: newId, part_name: '', part_number: '', qty: '1', manufacturer: '' }]);
  };
  
  const handleAddSpecRow = () => {
    const newId = Math.max(...specItems.map(s => s.id), 0) + 1;
    setSpecItems(prev => [...prev, { id: newId, process: '', spec_number: '', code: '' }]);
  };

  // Update dimension handler that preserves parsed data
  const handleUpdateDimension = (id, updates) => {
    setDimensions(prev => prev.map(dim => {
      if (dim.id !== id) return dim;
      
      // If updating parsed field, merge deeply
      if (updates.parsed) {
        return {
          ...dim,
          parsed: {
            ...dim.parsed,
            ...updates.parsed
          }
        };
      }
      return { ...dim, ...updates };
    }));
  };

  // Save Project Handler with BOM & Specs
  const handleSaveProject = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const stateToSave = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        result: {
          ...result,
          pages: result.pages?.map(p => {
            if (p.page_number === currentPage) return { ...p, dimensions };
            return p;
          })
        },
        totalPages,
        cmmResults,
        bomItems,
        specItems
      };
      zip.file("state.json", JSON.stringify(stateToSave));
      
      const blob = await zip.generateAsync({ type: "blob" });
      const filename = `${result.metadata?.filename || 'project'}.ab`;
      downloadBlob(blob, filename);
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save project.");
    } finally {
      setIsDownloading(false);
    }
  };

  // Drawing handlers
  const handleMouseDown = (e) => {
    if (!drawMode || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setIsDrawing(true);
    setDrawStart({ x, y });
    setDrawEnd({ x, y });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setDrawEnd({ x, y });
  };

  const handleMouseUp = async () => {
    if (!isDrawing || !drawStart || !drawEnd) {
      setIsDrawing(false);
      return;
    }
    setIsDrawing(false);
    
    const dist = Math.sqrt(
      Math.pow(drawEnd.x - drawStart.x, 2) + 
      Math.pow(drawEnd.y - drawStart.y, 2)
    );
    let finalMinX, finalMaxX, finalMinY, finalMaxY;

    if (dist < 1) {
      if (drawMode === 'addBalloon') {
        const defaultW = 8;
        const defaultH = 4;
        finalMinX = Math.max(0, drawStart.x - (defaultW / 2));
        finalMaxX = Math.min(100, drawStart.x + (defaultW / 2));
        finalMinY = Math.max(0, drawStart.y - (defaultH / 2));
        finalMaxY = Math.min(100, drawStart.y + (defaultH / 2));
      } else {
        setDrawStart(null);
        setDrawEnd(null);
        return;
      }
    } else {
      finalMinX = Math.min(drawStart.x, drawEnd.x);
      finalMaxX = Math.max(drawStart.x, drawEnd.x);
      finalMinY = Math.min(drawStart.y, drawEnd.y);
      finalMaxY = Math.max(drawStart.y, drawEnd.y);
      
      if (finalMaxX - finalMinX < 0.5 || finalMaxY - finalMinY < 0.5) {
        setDrawStart(null);
        setDrawEnd(null);
        return;
      }
    }
    
    if (drawMode === 'addBalloon') {
      setNewBalloonRect({ minX: finalMinX, maxX: finalMaxX, minY: finalMinY, maxY: finalMaxY });
      setNewBalloonValue('');
      setDetectionError(null);
      setIsDetecting(true);
      setShowValueInput(true);
      setDrawMode(null);
      setDrawStart(null);
      setDrawEnd(null);
      
      setTimeout(() => {
        detectTextInRegion(finalMinX, finalMaxX, finalMinY, finalMaxY);
      }, 50);
    } else if (drawMode === 'clearArea') {
      setDimensions(prev => prev.filter(d => {
        const isInside = d.balloonX >= finalMinX && d.balloonX <= finalMaxX && 
                        d.balloonY >= finalMinY && d.balloonY <= finalMaxY;
        return !isInside;
      }));
      setDrawMode(null);
    }
    
    setDrawStart(null);
    setDrawEnd(null);
  };

  const detectTextInRegion = async (minX, maxX, minY, maxY) => {
    if (!imageRef.current) {
      setDetectionError('Image not loaded. Enter value manually.');
      setIsDetecting(false);
      return;
    }

    try {
      const img = imageRef.current;
      if (!img.naturalWidth || !img.naturalHeight) {
        setDetectionError('Image not ready. Enter value manually.');
        setIsDetecting(false);
        return;
      }
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;
      const cropX = (minX / 100) * imgWidth;
      const cropY = (minY / 100) * imgHeight;
      const cropW = ((maxX - minX) / 100) * imgWidth;
      const cropH = ((maxY - minY) / 100) * imgHeight;
      
      const paddingX = Math.max(cropW * 0.2, 30);
      const paddingY = Math.max(cropH * 0.2, 30);
      
      const finalX = Math.max(0, cropX - paddingX);
      const finalY = Math.max(0, cropY - paddingY);
      const finalW = Math.round(Math.min(imgWidth - finalX, cropW + paddingX * 2));
      const finalH = Math.round(Math.min(imgHeight - finalY, cropH + paddingY * 2));
      
      canvas.width = finalW;
      canvas.height = finalH;
      ctx.drawImage(img, finalX, finalY, finalW, finalH, 0, 0, finalW, finalH);
      
      const croppedBase64 = canvas.toDataURL('image/png').split(',')[1];
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      try {
        const response = await fetch(`${API_BASE_URL}/detect-region`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          },
          body: JSON.stringify({
            image: croppedBase64,
            width: finalW,
            height: finalH
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.detected_text) {
            setNewBalloonValue(data.detected_text);
          } else if (data.dimensions && data.dimensions.length > 0) {
            setNewBalloonValue(data.dimensions[0].value || data.dimensions[0]);
          } else {
            setDetectionError('No text detected. Enter value manually.');
          }
        } else {
          setDetectionError('Auto-detect unavailable. Enter value manually.');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        setDetectionError('Detection failed. Enter value manually.');
      }
    } catch (err) {
      console.error('Detection error:', err);
      setDetectionError('Detection failed. Enter value manually.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleAddBalloonConfirm = () => {
    if (!newBalloonRect || !newBalloonValue.trim()) {
      setShowValueInput(false);
      setNewBalloonRect(null);
      setNewBalloonValue('');
      setDetectionError(null);
      return;
    }
    
    const { minX, maxX, minY, maxY } = newBalloonRect;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const x = centerX * 10;
    const y = centerY * 10;
    const colIndex = Math.floor(x / 125);
    const rowIndex = Math.floor(y / 250);
    const columns = ["H", "G", "F", "E", "D", "C", "B", "A"];
    const rows = ["4", "3", "2", "1"];
    const zone = `${columns[Math.min(colIndex, 7)]}${rows[Math.min(rowIndex, 3)]}`;
    
    const newId = dimensions.length > 0 ? Math.max(...dimensions.map(d => d.id)) + 1 : 1;
    
    // Set subtype based on selected type
    let subtype = 'Linear';
    let inspectionMethod = 'Visual';
    if (newBalloonType === 'note') {
      subtype = 'Note';
      inspectionMethod = 'Visual';
    } else if (newBalloonType === 'weld') {
      subtype = 'Weld';
      inspectionMethod = 'Visual';
    } else if (newBalloonType === 'finish') {
      subtype = 'Finish';
      inspectionMethod = 'Visual';
    } else {
      inspectionMethod = detectMethod({ value: newBalloonValue, parsed: {} });
    }

    setDimensions(prev => [...prev, {
      id: newId,
      value: newBalloonValue.trim(),
      zone,
      page: currentPage,
      bounding_box: { xmin: x - 20, xmax: x + 20, ymin: y - 10, ymax: y + 10 },
      anchorX: centerX,
      anchorY: centerY,
      balloonX: centerX + 4,
      balloonY: centerY - 4,
      method: inspectionMethod,
      confidence: 1.0,
      parsed: {
        nominal: 0,
        units: 'in',
        tolerance_type: 'basic',
        plus_tolerance: 0,
        minus_tolerance: 0,
        upper_limit: 0,
        lower_limit: 0,
        subtype: subtype,
        inspection_method: inspectionMethod
      }
    }]);

    setShowValueInput(false);
    setNewBalloonRect(null);
    setNewBalloonValue('');
    setDetectionError(null);
    setNewBalloonType('dimension');
  };

  // Download handlers - FIXED REGEX SYNTAX HERE
  const handleDownloadPDF = async () => {
    if (!isPro) { onShowGlassWall(); return; }
    setIsDownloading(true);
    try {
      const payload = {
        pages: hasMultiplePages
        ? result.pages.map(p => ({
            page_number: p.page_number,
            image: p.image,
            width: p.width || 1700,
            height: p.height || 2200,
            dimensions: p.dimensions || [],
            grid_detected: p.grid_detected !== false
          }))
        : [{
            page_number: 1,
            // Fixed regex syntax below: added backslash escape before the forward slash
            image: result.image?.replace(/^data:image\/\w+;base64,/, '') || '',
            width: result.metadata?.width || 1700,
            height: result.metadata?.height || 2200,
            dimensions: result.dimensions || [],
            grid_detected: result.grid?.detected !== false
          }],
        part_number: result.metadata?.part_number || '',
        revision: result.metadata?.revision || '',
        grid_detected: hasMultiplePages ? result.pages.every(p => p.grid_detected !== false) : (result.grid?.detected !== false)
      };
      
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/download/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'ballooned_drawing.pdf';
        downloadBlob(blob, filename);
      }
    } catch (err) {
      console.error('PDF download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadZIP = async () => {
    if (!isPro) { onShowGlassWall(); return; }
    setIsDownloading(true);
    try {
      const payload = {
        pages: hasMultiplePages
        ? result.pages.map(p => ({
            page_number: p.page_number,
            image: p.image,
            width: p.width || 1700,
            height: p.height || 2200,
            dimensions: p.dimensions || [],
            grid_detected: p.grid_detected !== false
          }))
        : [{
            page_number: 1,
            // Fixed regex syntax below
            image: result.image?.replace(/^data:image\/\w+;base64,/, '') || '',
            width: result.metadata?.width || 1700,
            height: result.metadata?.height || 2200,
            dimensions: result.dimensions || [],
            grid_detected: result.grid?.detected !== false
          }],
        part_number: result.metadata?.part_number || '',
        revision: result.metadata?.revision || '',
        grid_detected: hasMultiplePages ? result.pages.every(p => p.grid_detected !== false) : (result.grid?.detected !== false)
      };
      
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/download/zip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'FAI_package.zip';
        downloadBlob(blob, filename);
      }
    } catch (err) {
      console.error('ZIP download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!isPro) { onShowGlassWall(); return; }
    setIsDownloading(true);
    try {
      const payload = {
        pages: hasMultiplePages
        ? result.pages.map(p => ({
            page_number: p.page_number,
            image: p.image,
            width: p.width || 1700,
            height: p.height || 2200,
            dimensions: p.dimensions || [],
            grid_detected: p.grid_detected !== false
          }))
        : [{
            page_number: 1,
            // Fixed regex syntax below
            image: result.image?.replace(/^data:image\/\w+;base64,/, '') || '',
            width: result.metadata?.width || 1700,
            height: result.metadata?.height || 2200,
            dimensions: result.dimensions || [],
            grid_detected: result.grid?.detected !== false
          }],
        bom: bomItems,
        specifications: specItems,
        part_number: result.metadata?.part_number || '',
        revision: result.metadata?.revision || '',
        grid_detected: hasMultiplePages ? result.pages.every(p => p.grid_detected !== false) : (result.grid?.detected !== false)
      };
      
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/download/excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'AS9102_Form3.xlsx';
        downloadBlob(blob, filename);
      }
    } catch (err) {
      console.error('Excel download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!isPro) { onShowGlassWall(); return; }
    setIsDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = imageRef.current;
      if (!img) { setIsDownloading(false); return; }
      
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      
      const balloonRadius = Math.max(24, canvas.width * 0.02);
      const fontSize = Math.max(16, canvas.width * 0.014);
      const lineWidth = Math.max(3, canvas.width * 0.002);
      
      dimensions.forEach(dim => {
        const anchorX = (dim.anchorX / 100) * canvas.width;
        const anchorY = (dim.anchorY / 100) * canvas.height - (canvas.height * 0.008);
        const balloonX = (dim.balloonX / 100) * canvas.width;
        const balloonY = (dim.balloonY / 100) * canvas.height;
        
        ctx.beginPath();
        ctx.moveTo(anchorX, anchorY);
        ctx.lineTo(balloonX, balloonY);
        ctx.strokeStyle = '#E63946';
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(anchorX, anchorY, Math.max(2.5, lineWidth * 0.8), 0, Math.PI * 2);
        ctx.fillStyle = '#E63946';
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(balloonX, balloonY, balloonRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#E63946';
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        
        ctx.fillStyle = '#E63946';
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dim.id.toString(), balloonX, balloonY);
      });
      
      canvas.toBlob((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${result.metadata?.filename || 'blueprint'}_page${currentPage}_ballooned.png`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        setIsDownloading(false);
      }, 'image/png');
    } catch (err) {
      console.error('Download failed:', err);
      setIsDownloading(false);
    }
  };

  const handleDeleteDimension = (id) => {
    setDimensions(prev => prev.filter(d => d.id !== id));
  };

  const handleBalloonDrag = (id, deltaX, deltaY) => {
    setDimensions(prev => prev.map(d => {
      if (d.id !== id) return d;
      return {
        ...d,
        anchorX: d.anchorX + deltaX,
        anchorY: d.anchorY + deltaY,
        balloonX: d.balloonX + deltaX,
        balloonY: d.balloonY + deltaY
      };
    }));
  };

  const handleCMMImport = (results) => {
    setCmmResults(results);
    setShowCMMImport(false);
  };

  const selectionRect = isDrawing && drawStart && drawEnd ? {
    left: `${Math.min(drawStart.x, drawEnd.x)}%`,
    top: `${Math.min(drawStart.y, drawEnd.y)}%`,
    width: `${Math.abs(drawEnd.x - drawStart.x)}%`,
    height: `${Math.abs(drawEnd.y - drawStart.y)}%`,
  } : null;

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a]">
      {/* CMM Import Modal */}
      {showCMMImport && (
        <CMMImport
          dimensions={dimensions}
          onResultsImported={handleCMMImport}
        />
      )}
      
      {/* Value Input Popup */}
      {showValueInput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 w-96">
            <h3 className="text-white font-medium mb-2">Add Balloon</h3>
            
            {isDetecting ? (
              <div className="flex items-center gap-3 mb-4">
                <div className="w-5 h-5 border-2 border-[#E63946] border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-400 text-sm">Detecting text in region...</span>
              </div>
            ) : (
              <>
                {detectionError && (
                  <p className="text-amber-400 text-xs mb-2">{detectionError}</p>
                )}
                <p className="text-gray-400 text-sm mb-3">
                  {newBalloonValue ? 'Detected value (edit if needed):' : 'Enter the dimension value:'}
                </p>
              </>
            )}
            
            {/* Feature Type Selector */}
            <select
              value={newBalloonType}
              onChange={(e) => setNewBalloonType(e.target.value)}
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm mb-3"
              disabled={isDetecting}
            >
              <option value="dimension">Dimension</option>
              <option value="note">Note</option>
              <option value="weld">Weld Symbol</option>
              <option value="finish">Surface Finish</option>
            </select>
            
            <input
              type="text"
              value={newBalloonValue}
              onChange={(e) => setNewBalloonValue(e.target.value)}
              placeholder={newBalloonType === 'note' ? 'e.g., NOTE 5' : 'e.g., 0.45", 21 Teeth...'}
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm mb-4"
              autoFocus
              disabled={isDetecting}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isDetecting) handleAddBalloonConfirm();
                if (e.key === 'Escape') {
                  setShowValueInput(false);
                  setNewBalloonRect(null);
                  setNewBalloonValue('');
                  setDetectionError(null);
                  setNewBalloonType('dimension');
                }
              }}
            />
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowValueInput(false);
                  setNewBalloonRect(null);
                  setNewBalloonValue('');
                  setDetectionError(null);
                  setNewBalloonType('dimension');
                }}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddBalloonConfirm}
                disabled={!newBalloonValue.trim() || isDetecting}
                className="px-4 py-2 bg-[#E63946] hover:bg-[#c62d39] text-white rounded-lg text-sm disabled:opacity-50"
              >
                Add Balloon
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-[#161616] border-b border-[#2a2a2a]">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={onReset}
            className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            New Upload
          </button>
          
          <div className="h-6 w-px bg-[#2a2a2a]" />
          
          <button
            onClick={handleSaveProject}
            className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save Project
          </button>
          
          {totalPages > 1 && (
            <>
              <div className="h-6 w-px bg-[#2a2a2a]" />
              <PageNavigator
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                gridDetected={currentPageData.grid_detected}
              />
              <div className="h-6 w-px bg-[#2a2a2a]" />
            </>
          )}
          
          <span className="text-sm">
            <span className="text-gray-400">This page: </span>
            <span className="text-white font-medium">{dimensions.length} dimensions</span>
            {totalPages > 1 && (
              <span className="text-gray-500 ml-2">({getTotalDimensions()} total)</span>
            )}
          </span>
        </div>
        
        {/* Right side actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setDrawMode(drawMode === 'addBalloon' ? null : 'addBalloon')}
            className={`px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-2 ${
              drawMode === 'addBalloon' ? 'bg-[#E63946] text-white' : 'bg-[#1a1a1a] hover:bg-[#252525] text-gray-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {drawMode === 'addBalloon' ? 'Cancel' : 'Add Balloon'}
          </button>
          
          <button
            onClick={() => setDrawMode(drawMode === 'clearArea' ? null : 'clearArea')}
            className={`px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-2 ${
              drawMode === 'clearArea' ? 'bg-red-600 text-white' : 'bg-[#1a1a1a] hover:bg-[#252525] text-gray-300'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {drawMode === 'clearArea' ? 'Cancel' : 'Clear Area'}
          </button>
          
          <div className="h-6 w-px bg-[#2a2a2a]" />
          
          <button
            onClick={() => setShowCMMImport(true)}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Import CMM
          </button>
          
          <button
            onClick={handleDownloadImage}
            disabled={isDownloading}
            className="px-3 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {!isPro && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
            Save Page {currentPage}
          </button>
          
          <DownloadMenu
            onDownloadPDF={handleDownloadPDF}
            onDownloadZIP={handleDownloadZIP}
            onDownloadExcel={handleDownloadExcel}
            isDownloading={isDownloading}
            totalPages={totalPages}
            totalDimensions={getTotalDimensions()}
            isPro={isPro}
          />
        </div>
      </div>
      
      {/* Mode indicator */}
      <div className="bg-[#1a1a1a] px-4 py-2 text-sm text-gray-400 flex items-center justify-between border-b border-[#2a2a2a]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {drawMode === 'addBalloon' ? (
            <span className="text-[#E63946]">Draw a rectangle around the feature. Press Escape to cancel.</span>
          ) : drawMode === 'clearArea' ? (
            <span className="text-red-400">Draw a rectangle over balloons to delete. Press Escape to cancel.</span>
          ) : (
            <span>Select a dimension in the table below to edit properties.</span>
          )}
        </div>
        {selectedDimId && (
          <span className="text-[#E63946] font-medium">Dimension #{selectedDimId} Selected</span>
        )}
      </div>
      
      {/* Main Layout - Properties Panel + Canvas */}
      <div className="flex-1 flex overflow-hidden">
        {/* Properties Panel (Left Sidebar) */}
        <PropertiesPanel
          selectedDimension={dimensions.find(d => d.id === selectedDimId)}
          onUpdate={handleUpdateDimension}
        />
        
        {/* Canvas Container */}
        <div className="flex-1 overflow-auto p-6">
          <div
            ref={containerRef}
            className={`relative bg-[#0a0a0a] rounded-xl overflow-hidden select-none ${drawMode ? 'cursor-crosshair' : ''}`}
            style={{ minHeight: '500px' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              if (isDrawing) {
                setIsDrawing(false);
                setDrawStart(null);
                setDrawEnd(null);
              }
            }}
          >
            {currentImage && (
              <img
                ref={imageRef}
                src={currentImage}
                alt={`Blueprint Page ${currentPage}`}
                className="w-full h-auto pointer-events-none"
                crossOrigin="anonymous"
              />
            )}
            
            {/* Leader lines */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {dimensions.map((dim) => (
                <g key={`leader-${dim.id}`}>
                  <line
                    x1={`${dim.anchorX}%`}
                    y1={`${dim.anchorY - 0.8}%`}
                    x2={`${dim.balloonX}%`}
                    y2={`${dim.balloonY}%`}
                    stroke={selectedDimId === dim.id ? "#fff" : "#E63946"}
                    strokeWidth={selectedDimId === dim.id ? "3" : "2"}
                  />
                  <circle
                    cx={`${dim.anchorX}%`}
                    cy={`${dim.anchorY - 0.8}%`}
                    r="2.5"
                    fill="#E63946"
                  />
                </g>
              ))}
            </svg>
            
            {/* Balloons */}
            {dimensions.map((dim) => (
              <DraggableBalloon
                key={dim.id}
                dimension={dim}
                left={dim.balloonX}
                top={dim.balloonY}
                isSelected={selectedDimId === dim.id}
                onDelete={() => handleDeleteDimension(dim.id)}
                onDrag={handleBalloonDrag}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDimId(dim.id);
                }}
                cmmResult={cmmResults[dim.id]}
                containerRef={containerRef}
                disabled={drawMode !== null}
              />
            ))}
            
            {/* Selection rectangle */}
            {selectionRect && (
              <div
                className={`absolute border-2 border-dashed pointer-events-none ${
                  drawMode === 'addBalloon' ? 'border-[#E63946] bg-[#E63946]/10' : 'border-red-500 bg-red-500/10'
                }`}
                style={selectionRect}
              />
            )}
            
            {/* Preview watermark */}
            {!isPro && <PreviewWatermark isVisible={true} />}
          </div>
        </div>
      </div>
      
      {/* Table Manager (Bottom Panel) */}
      <div className="h-96 border-t-2 border-[#2a2a2a]">
        <TableManager
          dimensions={dimensions}
          bomItems={bomItems}
          specItems={specItems}
          selectedId={selectedDimId}
          onSelect={setSelectedDimId}
          onUpdate={handleUpdateDimension}
          onUpdateBOM={handleUpdateBOM}
          onUpdateSpec={handleUpdateSpec}
        />
      </div>
    </div>
  );
}

// ============================================================================
// SUPPORTING COMPONENTS
// ============================================================================

function RevisionCompare({ onClose, onComplete, visitorId, incrementUsage, isPro, onShowGlassWall, token }) {
  const [revA, setRevA] = useState(null);
  const [revB, setRevB] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [isPorting, setIsPorting] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);
  const fileInputARef = useRef(null);
  const fileInputBRef = useRef(null);

  const handleFileSelect = (file, setRev) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setRev({ file, name: file.name, preview: e.target.result });
    reader.readAsDataURL(file);
  };

  const handleCompare = async () => {
    if (!revA || !revB) return;
    setIsComparing(true);
    try {
      const formData = new FormData();
      formData.append('file_a', revA.file);
      formData.append('file_b', revB.file);
      
      const response = await fetch(`${API_BASE_URL}/compare`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });
      const data = await response.json();
      
      if (data.success) {
        const added = data.dimensions.filter(d => d.status === 'added');
        const modified = data.dimensions.filter(d => d.status === 'modified');
        const unchanged = data.dimensions.filter(d => d.status === 'unchanged');
        const removed = data.removed_dimensions || [];
        
        setComparisonResult({
          revA: { image: revA.preview, dimensions: [] },
          revB: {
            image: data.image,
            metadata: data.metadata,
            dimensions: data.dimensions
          },
          changes: { added, modified, removed, unchanged },
          summary: data.summary || {
            added: added.length,
            removed: removed.length,
            modified: modified.length,
            unchanged: unchanged.length
          }
        });
      }
    } catch (err) {
      console.error('Comparison failed:', err);
      alert("Network error during comparison");
    } finally {
      setIsComparing(false);
    }
  };

  const handlePortBalloons = async () => {
    if (!isPro) {
      onShowGlassWall();
      return;
    }
    setIsPorting(true);
    try {
      // Use the comparison result directly
      onComplete({
        dimensions: comparisonResult.revB.dimensions,
        image: comparisonResult.revB.image,
        metadata: comparisonResult.revB.metadata,
        comparison: comparisonResult
      });
    } catch (err) {
      console.error("Porting failed", err);
    } finally {
      setIsPorting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161616] rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-[#2a2a2a] flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">
              <span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                Delta FAI
              </span>
              {" "}- Revision Compare
            </h2>
            <p className="text-gray-400 text-sm">Upload two revisions to find changes</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {!comparisonResult ? (
            <div className="grid grid-cols-2 gap-6">
              {/* Upload Rev A */}
              <div>
                <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-gray-600 flex items-center justify-center text-xs">A</span>
                  Old Revision
                </h3>
                <div
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    revA ? 'border-green-500/50 bg-green-500/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                  }`}
                  onClick={() => fileInputARef.current?.click()}
                >
                  <input
                    ref={fileInputARef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => handleFileSelect(e.target.files[0], setRevA)}
                    className="hidden"
                  />
                  {revA ? (
                    <div>
                      <img src={revA.preview} alt="Rev A" className="max-h-48 mx-auto rounded mb-2" />
                      <p className="text-green-400 text-sm">{revA.name}</p>
                    </div>
                  ) : (
                    <div>
                      <svg className="w-10 h-10 text-gray-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-gray-400">Upload Rev A (Old)</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Upload Rev B */}
              <div>
                <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-[#E63946] flex items-center justify-center text-xs text-white">B</span>
                  New Revision
                </h3>
                <div
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    revB ? 'border-[#E63946]/50 bg-[#E63946]/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                  }`}
                  onClick={() => fileInputBRef.current?.click()}
                >
                  <input
                    ref={fileInputBRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => handleFileSelect(e.target.files[0], setRevB)}
                    className="hidden"
                  />
                  {revB ? (
                    <div>
                      <img src={revB.preview} alt="Rev B" className="max-h-48 mx-auto rounded mb-2" />
                      <p className="text-[#E63946] text-sm">{revB.name}</p>
                    </div>
                  ) : (
                    <div>
                      <svg className="w-10 h-10 text-gray-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-gray-400">Upload Rev B (New)</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-green-400">{comparisonResult.summary.added}</div>
                  <div className="text-green-400/70 text-sm">Added</div>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-yellow-400">{comparisonResult.summary.modified}</div>
                  <div className="text-yellow-400/70 text-sm">Modified</div>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-red-400">{comparisonResult.summary.removed}</div>
                  <div className="text-red-400/70 text-sm">Removed</div>
                </div>
                <div className="bg-gray-500/10 border border-gray-500/30 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-gray-400">{comparisonResult.summary.unchanged}</div>
                  <div className="text-gray-400/70 text-sm">Unchanged</div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-between">
          {!comparisonResult ? (
            <>
              <div className="text-gray-500 text-sm">
                {revA && revB ? 'Ready to compare' : 'Upload both revisions'}
              </div>
              <button
                onClick={handleCompare}
                disabled={!revA || !revB || isComparing}
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {isComparing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Comparing...
                  </>
                ) : (
                  'Compare Revisions'
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setComparisonResult(null)}
                className="text-gray-400 hover:text-white"
              >
                Compare Different Files
              </button>
              <button
                onClick={handlePortBalloons}
                disabled={isPorting}
                className="px-6 py-2 bg-[#E63946] hover:bg-[#c62d39] text-white font-medium rounded-lg flex items-center gap-2"
              >
                {isPorting ? "Porting..." : "Port Balloons to Rev B"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableBalloon({ dimension, left, top, onDelete, onDrag, cmmResult, containerRef, disabled = false, isSelected, onClick }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const hasResult = cmmResult?.actual;
  const isPassing = cmmResult?.status === 'PASS';
  
  const handleMouseDown = (e) => {
    if (disabled) return;
    if (onClick) onClick(e);
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    startPos.current = { x: e.clientX, y: e.clientY };
    
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = ((e.clientX - startPos.current.x) / rect.width) * 100;
      const deltaY = ((e.clientY - startPos.current.y) / rect.height) * 100;
      startPos.current = { x: e.clientX, y: e.clientY };
      onDrag(dimension.id, deltaX, deltaY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
        isDragging ? 'cursor-grabbing z-50' : disabled ? '' : 'cursor-grab'
      }`}
      style={{ left: `${left}%`, top: `${top}%`, zIndex: isHovered || isDragging || isSelected ? 100 : 10 }}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-lg ${
          isSelected ? 'ring-4 ring-white/50 scale-110' : ''
        } ${
          hasResult 
            ? (isPassing ? 'bg-green-500 text-white border-2 border-green-400' : 'bg-red-500 text-white border-2 border-red-400') 
            : (isHovered || isDragging ? 'bg-[#E63946] text-white scale-110' : 'bg-white text-[#E63946] border-2 border-[#E63946]')
        }`}
      >
        {dimension.id}
      </div>
      {isHovered && !isDragging && !disabled && (
        <div
          className="absolute left-full top-1/2 -translate-y-1/2 flex items-center"
          style={{ paddingLeft: '8px' }}
        >
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 whitespace-nowrap shadow-xl min-w-[120px]">
            <div className="text-white font-mono text-sm mb-1">{dimension.value}</div>
            {dimension.zone && <div className="text-gray-400 text-xs">Zone: {dimension.zone}</div>}
            <div className="text-gray-500 text-[10px] mt-1 italic">Method: {dimension.method}</div>
            {cmmResult?.actual && <div className="text-blue-400 text-xs mt-1">Actual: {cmmResult.actual}</div>}
            {cmmResult?.status && (
              <div className={`text-xs ${cmmResult.status === 'PASS' ? 'text-green-400' : 'text-red-400'}`}>
                {cmmResult.status}
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-red-500 text-xs hover:text-red-400 hover:underline mt-2 block"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PageNavigator({ currentPage, totalPages, onPageChange, gridDetected }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-lg px-3 py-2">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-sm text-gray-300">
          Page{' '}
          <select
            value={currentPage}
            onChange={(e) => onPageChange(Number(e.target.value))}
            className="bg-transparent text-white font-medium appearance-none cursor-pointer hover:text-[#E63946] transition-colors"
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <option key={page} value={page} className="bg-[#1a1a1a]">{page}</option>
            ))}
          </select>
          <span className="text-gray-500"> of {totalPages}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="p-2 rounded-lg bg-[#1a1a1a] text-gray-300 hover:bg-[#252525] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="p-2 rounded-lg bg-[#1a1a1a] text-gray-300 hover:bg-[#252525] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      
      {gridDetected === false && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400/80 bg-amber-400/10 px-3 py-1.5 rounded-lg">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Standard grid</span>
        </div>
      )}
    </div>
  );
}

function DownloadMenu({ onDownloadPDF, onDownloadZIP, onDownloadExcel, isDownloading, totalPages, totalDimensions, isPro }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDownload = (action) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isDownloading}
        className="flex items-center gap-2 px-4 py-2 bg-[#E63946] hover:bg-[#c62d39] text-white font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {isDownloading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : !isPro ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
        <span>{isDownloading ? 'Preparing...' : (isPro ? 'Download' : 'Export (Pro)')}</span>
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && !isDownloading && (
        <div className="absolute right-0 mt-2 w-72 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-[#2a2a2a] bg-[#161616]">
            <p className="text-sm font-medium text-white">Export Options</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {totalPages} page{totalPages !== 1 ? 's' : ''} • {totalDimensions} dimension{totalDimensions !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="p-2">
            <button
              onClick={() => handleDownload(onDownloadPDF)}
              className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-[#252525] transition-colors text-left group"
            >
              <div className="p-2 rounded-lg bg-[#E63946]/10 text-[#E63946] group-hover:bg-[#E63946]/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Ballooned PDF</p>
                <p className="text-xs text-gray-400 mt-0.5">All pages with balloon markers</p>
              </div>
              {!isPro && (
                <svg className="w-4 h-4 text-gray-500 self-center" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </button>

            <button
              onClick={() => handleDownload(onDownloadZIP)}
              className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-[#252525] transition-colors text-left group"
            >
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">FAI Package (ZIP)</p>
                <p className="text-xs text-gray-400 mt-0.5">Images + AS9102 Excel + README</p>
              </div>
              {isPro ? (
                <span className="text-[10px] font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full self-center">
                  RECOMMENDED
                </span>
              ) : (
                <svg className="w-4 h-4 text-gray-500 self-center" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </button>

            <button
              onClick={() => handleDownload(onDownloadExcel)}
              className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-[#252525] transition-colors text-left group"
            >
              <div className="p-2 rounded-lg bg-green-500/10 text-green-400 group-hover:bg-green-500/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">AS9102 Excel Only</p>
                <p className="text-xs text-gray-400 mt-0.5">Form 3 spreadsheet</p>
              </div>
              {!isPro && (
                <svg className="w-4 h-4 text-gray-500 self-center" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </button>
          </div>

          <div className="px-4 py-2.5 border-t border-[#2a2a2a] bg-[#0a0a0a]">
            <p className="text-[11px] text-gray-500">
              {isPro ? 'All exports include AS9102 Rev C compliant formatting' : 'Upgrade to Pro to unlock exports'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}

export default DropZone;
