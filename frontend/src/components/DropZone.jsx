import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { useAuth } from '../context/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { API_BASE_URL, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS } from '../constants/config';

// External Specialized Components
import { TableManager } from './TableManager';
import { PropertiesPanel } from './PropertiesPanel';
import { CMMImport } from './CMMImport';
import { RevisionCompare } from './RevisionCompare';
import { GlassWallPaywall } from './GlassWallPaywall';
import { PreviewWatermark } from './PreviewWatermark';

/**
 * DropZone "Cockpit" Controller
 * Manages the layout, state, and coordination between the Canvas, Properties, and Data Table.
 */
export function DropZone({ onBeforeProcess, hasPromoAccess = false }) {
  const { token, isPro } = useAuth();
  const { visitorId, incrementUsage, refreshUsage } = useUsage();
  
  // Refs
  const fileInputRef = useRef(null);
  const projectInputRef = useRef(null);
  const containerRef = useRef(null);
  const imageRef = useRef(null);

  // Access Control
  const canDownload = isPro || hasPromoAccess;

  // --- GLOBAL STATE ---
  const [result, setResult] = useState(null); // The processed file result
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  // Data State (Single Source of Truth)
  const [dimensions, setDimensions] = useState([]);
  const [bomItems, setBomItems] = useState([]);
  const [specItems, setSpecItems] = useState([]);
  
  // UI State
  const [selectedDimensionId, setSelectedDimensionId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  
  // Modal Visibility
  const [showRevisionCompare, setShowRevisionCompare] = useState(false);
  const [showCMMImport, setShowCMMImport] = useState(false);
  const [showGlassWall, setShowGlassWall] = useState(false);

  // Canvas Tools State
  const [drawMode, setDrawMode] = useState(null); // 'addBalloon' | 'clearArea' | null
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawEnd, setDrawEnd] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Balloon Detection State
  const [showValueInput, setShowValueInput] = useState(false);
  const [newBalloonRect, setNewBalloonRect] = useState(null);
  const [newBalloonValue, setNewBalloonValue] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState(null);

  // Sync dimensions when result loads or page changes
  useEffect(() => {
    if (result && result.pages) {
        const pageData = result.pages.find(p => p.page_number === currentPage) || result.pages[0];
        // Only initialize if dimensions are empty or we switched pages and need to load that page's data
        // Note: In a real app, you might want to merge state more carefully.
        // For this refactor, we re-initialize visuals based on the loaded result + current edits would be stored in 'dimensions' state
        if (dimensions.length === 0) {
             const initDims = (pageData.dimensions || []).map(initializeDimension);
             setDimensions(initDims);
        }
    }
  }, [result, currentPage]);

  // Helper: Initialize Dimension positions
  function initializeDimension(d) {
    if (d.anchorX !== undefined) return d;
    return {
      ...d,
      anchorX: (d.bounding_box.xmin + d.bounding_box.xmax) / 2 / 10,
      anchorY: (d.bounding_box.ymin + d.bounding_box.ymax) / 2 / 10,
      balloonX: (d.bounding_box.xmin + d.bounding_box.xmax) / 2 / 10 + 4,
      balloonY: (d.bounding_box.ymin + d.bounding_box.ymax) / 2 / 10 - 4,
      method: d.method || detectMethod(d),
      confidence: d.confidence ?? 0.95
    };
  }

  function detectMethod(dim) {
    if (dim.parsed) {
        if (dim.parsed.is_gdt) return "CMM"; 
        const totalTol = (dim.parsed.max_limit - dim.parsed.min_limit);
        if (totalTol > 0 && totalTol < 0.01) return "Micrometer";
    }
    if (String(dim.value).includes('±') && String(dim.value).includes('0.00')) return "Micrometer";
    if (String(dim.value).startsWith('Ø')) return "Caliper";
    return "Caliper"; 
  }

  // --- DATA UPDATE HANDLERS ---
  const handleUpdateDimension = (id, updates) => {
    setDimensions(prev => prev.map(d => {
        if (d.id === id) {
            if (updates.parsed) {
                return { ...d, ...updates, parsed: { ...d.parsed, ...updates.parsed } };
            }
            return { ...d, ...updates };
        }
        return d;
    }));
  };

  const handleUpdateBOM = (id, updates) => {
    setBomItems(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const handleUpdateSpec = (id, updates) => {
    setSpecItems(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };
  
  const handleDeleteDimension = (id) => { 
      setDimensions(prev => prev.filter(d => d.id !== id)); 
      if (selectedDimensionId === id) setSelectedDimensionId(null);
  };

  // --- FILE PROCESSING ---
  const processFile = async (file) => {
    if (onBeforeProcess && !onBeforeProcess()) return;
    setIsProcessing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (!token) formData.append('visitor_id', visitorId);
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const response = await fetch(`${API_BASE_URL}/process`, { method: 'POST', headers, body: formData });
      const data = await response.json();
      
      if (data.success) {
        if (data.pages?.length > 0) {
            setTotalPages(data.total_pages || data.pages.length);
            setCurrentPage(1);
        }
        setResult(data);
        setBomItems([]); setSpecItems([]);
        setDimensions((data.pages?.[0]?.dimensions || []).map(initializeDimension));
        await incrementUsage();
        if (refreshUsage) await refreshUsage();
      } else {
        setError(data.error?.message || 'Processing failed');
      }
    } catch (err) { setError('Network error. Please check connection.'); } 
    finally { setIsProcessing(false); }
  };

  const handleLoadProject = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
        const zip = await JSZip.loadAsync(file);
        const stateFile = zip.file("state.json");
        if (!stateFile) throw new Error("Invalid .ab project");
        const stateStr = await stateFile.async("string");
        const loaded = JSON.parse(stateStr);
        setResult(loaded.result);
        setDimensions(loaded.dimensions || []); 
        setBomItems(loaded.bomItems || []);
        setSpecItems(loaded.specItems || []);
        setTotalPages(loaded.totalPages || 1);
        setCurrentPage(1);
    } catch (err) { console.error(err); setError("Failed to load project."); } 
    finally { setIsProcessing(false); }
  };

  // --- EXTERNAL HANDLERS ---
  const handleCMMResults = (resultsMap) => {
    setDimensions(prev => prev.map(d => {
        if (resultsMap[d.id]) {
            return { ...d, actual: resultsMap[d.id].actual, status: resultsMap[d.id].status, deviation: resultsMap[d.id].deviation };
        }
        return d;
    }));
    setShowCMMImport(false);
  };

  const handleRevisionComplete = (data) => {
     setResult(prev => ({ ...prev, image: data.image, metadata: data.metadata }));
     setDimensions(data.dimensions.map(initializeDimension));
     setShowRevisionCompare(false);
  };

  // --- CANVAS INTERACTION ---
  const handleMouseDown = (e) => {
    if (!drawMode || !containerRef.current) return;
    e.preventDefault(); e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setIsDrawing(true); setDrawStart({ x, y }); setDrawEnd({ x, y });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setDrawEnd({ x, y });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !drawStart || !drawEnd) { setIsDrawing(false); return; }
    setIsDrawing(false);
    
    const minX = Math.min(drawStart.x, drawEnd.x);
    const maxX = Math.max(drawStart.x, drawEnd.x);
    const minY = Math.min(drawStart.y, drawEnd.y);
    const maxY = Math.max(drawStart.y, drawEnd.y);

    if ((maxX - minX) < 0.5 || (maxY - minY) < 0.5) return; 

    if (drawMode === 'addBalloon') {
        setNewBalloonRect({ minX, maxX, minY, maxY });
        setNewBalloonValue('');
        setShowValueInput(true);
        detectTextInRegion(minX, maxX, minY, maxY);
        setDrawMode(null);
    } else if (drawMode === 'clearArea') {
        setDimensions(prev => prev.filter(d => !(d.balloonX >= minX && d.balloonX <= maxX && d.balloonY >= minY && d.balloonY <= maxY)));
        setDrawMode(null);
    }
    setDrawStart(null); setDrawEnd(null);
  };

  const handleBalloonDrag = (id, deltaX, deltaY) => {
    setDimensions(prev => prev.map(d => {
      if (d.id !== id) return d;
      return { ...d, anchorX: d.anchorX + deltaX, anchorY: d.anchorY + deltaY, balloonX: d.balloonX + deltaX, balloonY: d.balloonY + deltaY };
    }));
  };

  const detectTextInRegion = async (minX, maxX, minY, maxY) => {
      setIsDetecting(true);
      try {
          const img = imageRef.current;
          if(!img) return;
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const iw = img.naturalWidth; const ih = img.naturalHeight;
          const x = (minX/100)*iw; const y = (minY/100)*ih;
          const w = ((maxX-minX)/100)*iw; const h = ((maxY-minY)/100)*ih;
          canvas.width = w; canvas.height = h;
          ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
          const base64 = canvas.toDataURL('image/png').split(',')[1];

          const res = await fetch(`${API_BASE_URL}/detect-region`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: base64 })
          });
          const data = await res.json();
          if(data.success && data.detected_text) setNewBalloonValue(data.detected_text);
          else setDetectionError("No text detected");
      } catch(e) { setDetectionError("Detection failed"); }
      finally { setIsDetecting(false); }
  };

  const confirmAddBalloon = () => {
      if(!newBalloonRect) return;
      const centerX = (newBalloonRect.minX + newBalloonRect.maxX) / 2;
      const centerY = (newBalloonRect.minY + newBalloonRect.maxY) / 2;
      const newId = dimensions.length > 0 ? Math.max(...dimensions.map(d => d.id)) + 1 : 1;
      setDimensions(prev => [...prev, {
          id: newId, value: newBalloonValue, zone: 'A1', page: currentPage,
          bounding_box: { xmin: centerX*10 - 20, xmax: centerX*10 + 20, ymin: centerY*10 - 10, ymax: centerY*10 + 10 },
          anchorX: centerX, anchorY: centerY, balloonX: centerX + 2, balloonY: centerY - 2,
          method: 'Visual', confidence: 1.0
      }]);
      setShowValueInput(false);
  };

  const currentImageSrc = result?.pages 
    ? (result.pages.find(p => p.page_number === currentPage)?.image || "")
    : (result?.image || "");
  const imgSrc = currentImageSrc.startsWith('data:') ? currentImageSrc : `data:image/png;base64,${currentImageSrc}`;

  // --- RENDER ---
  if (!result) return (
     <div className="p-12 border-2 border-dashed border-[#333] rounded-xl text-center">
        <input ref={fileInputRef} type="file" onChange={(e) => processFile(e.target.files[0])} className="hidden" />
        <button onClick={() => fileInputRef.current.click()} className="bg-[#E63946] text-white px-6 py-3 rounded-xl hover:bg-red-700 transition">
             {isProcessing ? "Processing..." : "Upload Blueprint"}
        </button>
        <div className="mt-4">
             <button onClick={() => setShowRevisionCompare(true)} className="text-gray-400 text-sm underline">Compare Revisions</button>
        </div>
        {showRevisionCompare && (
            <RevisionCompare 
                onClose={() => setShowRevisionCompare(false)}
                onComplete={handleRevisionComplete} 
                canDownload={canDownload} 
                onShowGlassWall={() => setShowGlassWall(true)} 
            />
        )}
     </div>
  );

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white overflow-hidden">
        {/* TOP TOOLBAR */}
        <div className="h-14 border-b border-[#2a2a2a] bg-[#161616] flex items-center justify-between px-4">
            <div className="flex items-center gap-4">
                <span className="font-bold text-lg">AutoBalloon</span>
                <div className="h-6 w-px bg-[#333]" />
                <button onClick={() => {setResult(null); setDimensions([]);}} className="text-gray-400 hover:text-white text-sm">Close</button>
                {totalPages > 1 && (
                     <PageNavigator currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                )}
            </div>
            
            <div className="flex items-center gap-2">
                 <button onClick={() => setDrawMode(drawMode === 'addBalloon' ? null : 'addBalloon')} className={`px-3 py-1.5 rounded text-sm ${drawMode === 'addBalloon' ? 'bg-[#E63946]' : 'bg-[#2a2a2a] text-gray-300'}`}>+ Add Balloon</button>
                 <button onClick={() => setDrawMode(drawMode === 'clearArea' ? null : 'clearArea')} className={`px-3 py-1.5 rounded text-sm ${drawMode === 'clearArea' ? 'bg-red-900 text-red-200' : 'bg-[#2a2a2a] text-gray-300'}`}>Eraser</button>
                 <div className="h-6 w-px bg-[#333] mx-2" />
                 <button onClick={() => setShowCMMImport(true)} className="px-3 py-1.5 bg-blue-700 rounded text-sm hover:bg-blue-600">Import CMM</button>
                 <DownloadMenu isPro={canDownload} isDownloading={isDownloading} onDownload={() => {}} /> 
            </div>
        </div>

        {/* MAIN WORKSPACE */}
        <div className="flex-1 flex overflow-hidden">
            {/* LEFT SIDEBAR */}
            <div className="flex-none z-20 shadow-xl border-r border-[#2a2a2a]">
                <PropertiesPanel 
                    selectedDimension={dimensions.find(d => d.id === selectedDimensionId)}
                    onUpdate={handleUpdateDimension}
                />
            </div>

            {/* RIGHT SIDE */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* CANVAS */}
                <div 
                    ref={containerRef}
                    className={`flex-1 relative bg-[#111] overflow-hidden ${drawMode ? 'cursor-crosshair' : 'cursor-grab'}`}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                >
                    <img ref={imageRef} src={imgSrc} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 max-h-[90%] max-w-[90%] object-contain" alt="Blueprint" />
                    
                    {/* SVG Leaders */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                        {dimensions.map(d => (
                            <React.Fragment key={`line-${d.id}`}>
                                <line x1={`${d.anchorX}%`} y1={`${d.anchorY}%`} x2={`${d.balloonX}%`} y2={`${d.balloonY}%`} stroke="#E63946" strokeWidth="2" />
                            </React.Fragment>
                        ))}
                    </svg>

                    {/* Balloons */}
                    {dimensions.map(d => (
                        <DraggableBalloon 
                            key={d.id} dimension={d} 
                            isSelected={selectedDimensionId === d.id}
                            onDelete={() => handleDeleteDimension(d.id)}
                            onDrag={handleBalloonDrag}
                            onClick={(e) => { e.stopPropagation(); setSelectedDimensionId(d.id); }}
                            containerRef={containerRef}
                            disabled={!!drawMode}
                        />
                    ))}

                    {/* Drawing Box */}
                    {isDrawing && drawStart && drawEnd && (
                        <div className="absolute border-2 border-dashed border-[#E63946] bg-[#E63946]/10"
                            style={{
                                left: Math.min(drawStart.x, drawEnd.x) + '%', top: Math.min(drawStart.y, drawEnd.y) + '%',
                                width: Math.abs(drawEnd.x - drawStart.x) + '%', height: Math.abs(drawEnd.y - drawStart.y) + '%'
                            }}
                        />
                    )}
                </div>

                {/* BOTTOM GRID */}
                <div className="h-[350px] border-t border-[#333] bg-[#161616] flex flex-col">
                    <TableManager 
                        dimensions={dimensions} bomItems={bomItems} specItems={specItems}
                        selectedId={selectedDimensionId} onSelect={setSelectedDimensionId}
                        onUpdate={handleUpdateDimension} onUpdateBOM={handleUpdateBOM} onUpdateSpec={handleUpdateSpec}
                    />
                </div>
            </div>
        </div>

        {/* MODALS & POPUPS */}
        {showCMMImport && <CMMImport dimensions={dimensions} onResultsImported={handleCMMResults} />}
        {showValueInput && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                 <div className="bg-[#222] p-6 rounded-xl w-80 border border-[#444]">
                     <h3 className="text-white mb-4">Add Balloon</h3>
                     {isDetecting && <p className="text-yellow-400 text-sm mb-4">Detecting text...</p>}
                     <input className="w-full bg-[#111] border border-[#333] p-2 text-white rounded mb-4" value={newBalloonValue} onChange={e => setNewBalloonValue(e.target.value)} placeholder="Value" />
                     <div className="flex justify-end gap-2">
                         <button onClick={() => setShowValueInput(false)} className="text-gray-400">Cancel</button>
                         <button onClick={confirmAddBalloon} className="bg-[#E63946] px-4 py-2 rounded text-white">Add</button>
                     </div>
                 </div>
             </div>
        )}
        <GlassWallPaywall isOpen={showGlassWall} onClose={() => setShowGlassWall(false)} />
        {!canDownload && <PreviewWatermark />}
    </div>
  );
}

// --- HELPER COMPONENTS (INCLUDED HERE FOR STANDALONE USAGE) ---

function DraggableBalloon({ dimension, isSelected, onDelete, onDrag, onClick, containerRef, disabled }) {
  const [isHovered, setIsHovered] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (disabled) return;
    if (onClick) onClick(e);
    e.preventDefault(); e.stopPropagation();
    startPos.current = { x: e.clientX, y: e.clientY };

    const handleMouseMove = (ev) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = ((ev.clientX - startPos.current.x) / rect.width) * 100;
      const deltaY = ((ev.clientY - startPos.current.y) / rect.height) * 100;
      startPos.current = { x: ev.clientX, y: ev.clientY };
      onDrag(dimension.id, deltaX, deltaY);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${disabled ? '' : 'cursor-grab'} ${isSelected ? 'z-50' : 'z-10'}`}
      style={{ left: `${dimension.balloonX}%`, top: `${dimension.balloonY}%` }}
      onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onMouseDown={handleMouseDown}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 ${isSelected ? 'bg-[#E63946] text-white border-white scale-110' : 'bg-white text-[#E63946] border-[#E63946]'}`}>
        {dimension.id}
      </div>
      {isHovered && !disabled && (
        <div className="absolute left-full top-1/2 ml-2 -translate-y-1/2 bg-[#1a1a1a] p-2 rounded border border-[#333] z-50 whitespace-nowrap">
            <div className="text-white text-xs font-mono">{dimension.value}</div>
            <div className="text-gray-500 text-[10px] cursor-pointer hover:text-red-500" onClick={(e) => {e.stopPropagation(); onDelete();}}>Delete</div>
        </div>
      )}
    </div>
  );
}

function PageNavigator({ currentPage, totalPages, onPageChange }) {
  return (
    <div className="flex items-center gap-2 bg-[#1a1a1a] px-2 py-1 rounded">
        <button disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="text-gray-400 hover:text-white disabled:opacity-30">◀</button>
        <span className="text-xs text-gray-300">Page {currentPage} / {totalPages}</span>
        <button disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className="text-gray-400 hover:text-white disabled:opacity-30">▶</button>
    </div>
  );
}

function DownloadMenu({ isPro }) {
    return (
        <button className={`px-3 py-1.5 rounded text-sm ${isPro ? 'bg-green-700 text-white' : 'bg-[#2a2a2a] text-gray-400 cursor-not-allowed'}`}>
            {isPro ? 'Download Package' : 'Export (Pro)'}
        </button>
    );
}
