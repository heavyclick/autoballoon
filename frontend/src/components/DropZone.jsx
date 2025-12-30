import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { useAuth } from '../context/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { API_BASE_URL, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS } from '../constants/config';

// --- External Specialized Components ---
import { TableManager } from './TableManager';
import { PropertiesPanel } from './PropertiesPanel';
import { CMMImport } from './CMMImport';
import { RevisionCompare } from './RevisionCompare';
import { GlassWallPaywall } from './GlassWallPaywall';
import { PreviewWatermark } from './PreviewWatermark';

/**
 * DropZone.jsx - Production "Cockpit" Controller
 * * Responsibilities:
 * 1. State Container: Manages Dimensions, BOM, Specs, and Image data.
 * 2. Layout Manager: Renders the 3-pane layout (Properties, Canvas, Table).
 * 3. Tool Coordinator: Orchestrates CMM Import, Revision Compare, and Exports.
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
  
  // Balloon Detection & Input State
  const [showValueInput, setShowValueInput] = useState(false);
  const [newBalloonRect, setNewBalloonRect] = useState(null);
  const [newBalloonValue, setNewBalloonValue] = useState('');
  const [newBalloonType, setNewBalloonType] = useState('dimension'); // 'dimension' | 'note' | 'weld' | 'finish'
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState(null);

  // --- INITIALIZATION & SYNC ---

  // Sync dimensions when result loads or page changes
  useEffect(() => {
    if (result && result.pages) {
        const pageData = result.pages.find(p => p.page_number === currentPage) || result.pages[0];
        
        // If we just loaded a file and dimensions are empty, populate them from the result
        // (In a full app, you might want to merge, but for now we reset on page load if empty)
        if (dimensions.length === 0 && pageData.dimensions?.length > 0) {
             const initDims = pageData.dimensions.map(initializeDimension);
             setDimensions(initDims);
        }
    }
  }, [result, currentPage]);

  // Helper: Initialize Dimension with UI positions and default Parsed data
  function initializeDimension(d) {
    // If it already has UI coordinates (from project load), keep them.
    if (d.anchorX !== undefined) return d;
    
    return {
      ...d,
      anchorX: (d.bounding_box.xmin + d.bounding_box.xmax) / 2 / 10,
      anchorY: (d.bounding_box.ymin + d.bounding_box.ymax) / 2 / 10,
      balloonX: (d.bounding_box.xmin + d.bounding_box.xmax) / 2 / 10 + 4,
      balloonY: (d.bounding_box.ymin + d.bounding_box.ymax) / 2 / 10 - 4,
      method: d.method || detectMethod(d),
      confidence: d.confidence ?? 0.95,
      // Ensure 'parsed' object exists for TableManager/PropertiesPanel
      parsed: d.parsed || {
          nominal: parseFloat(d.value.replace(/[^\d.-]/g, '')) || 0,
          units: 'in',
          tolerance_type: 'bilateral',
          subtype: 'Linear',
          inspection_method: d.method || detectMethod(d),
          full_specification: d.value
      }
    };
  }

  // Enhanced Method Detection Logic
  function detectMethod(dim) {
    if (dim.parsed) {
        if (dim.parsed.is_gdt) return "CMM"; 
        const totalTol = Math.abs((dim.parsed.upper_limit || 0) - (dim.parsed.lower_limit || 0));
        if (totalTol > 0 && totalTol < 0.001) return "Gage Block";
        if (totalTol > 0 && totalTol < 0.01) return "Micrometer";
    }
    const val = String(dim.value);
    if (val.includes('±') && val.includes('0.00')) return "Micrometer";
    if (val.startsWith('Ø')) return "Caliper";
    if (val.includes('NOTE')) return "Visual";
    return "Caliper"; 
  }

  // --- DATA HANDLERS (The "Store") ---

  const handleUpdateDimension = (id, updates) => {
    setDimensions(prev => prev.map(d => {
        if (d.id === id) {
            // Deep merge for 'parsed' object to avoid overwriting nested fields
            if (updates.parsed) {
                return { ...d, ...updates, parsed: { ...d.parsed, ...updates.parsed } };
            }
            return { ...d, ...updates };
        }
        return d;
    }));
  };

  const handleDeleteDimension = (id) => { 
      setDimensions(prev => prev.filter(d => d.id !== id)); 
      if (selectedDimensionId === id) setSelectedDimensionId(null);
  };

  const handleUpdateBOM = (id, updates) => {
    setBomItems(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const handleUpdateSpec = (id, updates) => {
    setSpecItems(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };
  
  // --- EXTERNAL COMPONENT CALLBACKS ---

  const handleCMMResults = (resultsMap) => {
    // Merge CMM results (actuals/status) into dimensions
    setDimensions(prev => prev.map(d => {
        if (resultsMap[d.id]) {
            return { 
                ...d, 
                actual: resultsMap[d.id].actual, 
                status: resultsMap[d.id].status, 
                deviation: resultsMap[d.id].deviation 
            };
        }
        return d;
    }));
    setShowCMMImport(false);
  };

  const handleRevisionComplete = (data) => {
     // Replace current state with data from Revision Compare (Ported balloons + New Image)
     setResult(prev => ({ ...prev, image: data.image, metadata: data.metadata }));
     setDimensions(data.dimensions.map(initializeDimension));
     setShowRevisionCompare(false);
  };

  // --- FILE & PROJECT OPERATIONS ---

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
        // Initialize empty lists for new project
        setBomItems([]); 
        setSpecItems([]);
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

  const handleSaveProject = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const stateToSave = {
        version: "2.0",
        timestamp: new Date().toISOString(),
        result: {
          ...result,
          pages: result.pages?.map(p => {
            if (p.page_number === currentPage) return { ...p, dimensions };
            return p;
          })
        },
        dimensions, // Save current working dimensions
        bomItems,
        specItems,
        totalPages
      };
      
      zip.file("state.json", JSON.stringify(stateToSave));
      const blob = await zip.generateAsync({ type: "blob" });
      const filename = `${result.metadata?.filename || 'project'}.ab`;
      downloadBlob(blob, filename);
    } catch (err) { console.error("Save failed:", err); } 
    finally { setIsDownloading(false); }
  };

  // --- CANVAS & DRAWING LOGIC ---

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
      
      // Handle Type Logic
      let subtype = 'Linear';
      let method = 'Visual';
      if (newBalloonType === 'note') subtype = 'Note';
      else if (newBalloonType === 'weld') subtype = 'Weld';
      else if (newBalloonType === 'finish') subtype = 'Finish';
      else method = detectMethod({ value: newBalloonValue, parsed: {} });

      setDimensions(prev => [...prev, {
          id: newId, value: newBalloonValue, zone: 'A1', page: currentPage,
          bounding_box: { xmin: centerX*10 - 20, xmax: centerX*10 + 20, ymin: centerY*10 - 10, ymax: centerY*10 + 10 },
          anchorX: centerX, anchorY: centerY, balloonX: centerX + 2, balloonY: centerY - 2,
          method: method, 
          confidence: 1.0,
          parsed: {
              subtype: subtype,
              inspection_method: method
          }
      }]);
      setShowValueInput(false);
      setNewBalloonType('dimension');
  };

  // --- EXPORT HANDLERS ---

  const handleDownloadPDF = async () => { handleExport('pdf'); };
  const handleDownloadZIP = async () => { handleExport('zip'); };
  const handleDownloadExcel = async () => { handleExport('excel'); };

  const handleExport = async (type) => {
      if (!canDownload) { setShowGlassWall(true); return; }
      setIsDownloading(true);
      try {
          const payload = {
              pages: result.pages || [],
              dimensions,
              bom: bomItems,
              specifications: specItems,
              metadata: result.metadata
          };
          
          const endpoint = type === 'pdf' ? '/download/pdf' : type === 'zip' ? '/download/zip' : '/download/excel';
          const response = await fetch(`${API_BASE_URL.replace('/api', '')}${endpoint}`, {
              method: 'POST', 
              headers: { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }) },
              body: JSON.stringify(payload)
          });
          
          if(response.ok) {
              const blob = await response.blob();
              const ext = type === 'excel' ? 'xlsx' : type;
              downloadBlob(blob, `export.${ext}`);
          }
      } catch (e) { console.error(e); }
      finally { setIsDownloading(false); }
  };

  const currentImageSrc = result?.pages 
    ? (result.pages.find(p => p.page_number === currentPage)?.image || "")
    : (result?.image || "");
  const imgSrc = currentImageSrc.startsWith('data:') ? currentImageSrc : `data:image/png;base64,${currentImageSrc}`;

  // ================= RENDER =================

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
                 <button 
                    onClick={() => setDrawMode(drawMode === 'addBalloon' ? null : 'addBalloon')}
                    className={`px-3 py-1.5 rounded text-sm ${drawMode === 'addBalloon' ? 'bg-[#E63946]' : 'bg-[#2a2a2a] text-gray-300'}`}
                 >
                    + Add Balloon
                 </button>
                 <button 
                    onClick={() => setDrawMode(drawMode === 'clearArea' ? null : 'clearArea')}
                    className={`px-3 py-1.5 rounded text-sm ${drawMode === 'clearArea' ? 'bg-red-900 text-red-200' : 'bg-[#2a2a2a] text-gray-300'}`}
                 >
                    Eraser
                 </button>
                 <div className="h-6 w-px bg-[#333] mx-2" />
                 <button onClick={() => setShowCMMImport(true)} className="px-3 py-1.5 bg-blue-700 rounded text-sm hover:bg-blue-600">Import CMM</button>
                 <button onClick={handleSaveProject} className="px-3 py-1.5 bg-[#2a2a2a] rounded text-sm hover:bg-[#333]">Save .ab</button>
                 <DownloadMenu isPro={canDownload} isDownloading={isDownloading} onDownloadPDF={handleDownloadPDF} onDownloadZIP={handleDownloadZIP} onDownloadExcel={handleDownloadExcel} /> 
            </div>
        </div>

        {/* MAIN WORKSPACE */}
        <div className="flex-1 flex overflow-hidden">
            
            {/* LEFT SIDEBAR: PROPERTIES */}
            <div className="flex-none z-20 shadow-xl border-r border-[#2a2a2a] w-80 bg-[#111]">
                <PropertiesPanel 
                    selectedDimension={dimensions.find(d => d.id === selectedDimensionId)}
                    onUpdate={handleUpdateDimension}
                />
            </div>

            {/* RIGHT SIDE: CANVAS + TABLE */}
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
                <div className="h-[350px] border-t border-[#333] bg-[#161616] flex flex-col shadow-[0_-5px_15px_rgba(0,0,0,0.5)] z-10">
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
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                 <div className="bg-[#222] p-6 rounded-xl w-96 border border-[#444] shadow-2xl">
                     <h3 className="text-white mb-4 text-lg font-bold">Add Balloon</h3>
                     
                     <label className="block text-gray-400 text-xs mb-1">Feature Type</label>
                     <select 
                        value={newBalloonType} 
                        onChange={(e) => setNewBalloonType(e.target.value)}
                        className="w-full bg-[#111] border border-[#333] p-2 text-white rounded mb-4 focus:border-blue-500 outline-none"
                     >
                        <option value="dimension">Dimension</option>
                        <option value="note">Note</option>
                        <option value="weld">Weld Symbol</option>
                        <option value="finish">Surface Finish</option>
                     </select>

                     {isDetecting && <div className="flex items-center gap-2 mb-2 text-yellow-400 text-sm"><div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse"></div>Detecting text...</div>}
                     
                     <label className="block text-gray-400 text-xs mb-1">Value / Text</label>
                     <input 
                        className="w-full bg-[#111] border border-[#333] p-2 text-white rounded mb-4 font-mono focus:border-blue-500 outline-none"
                        value={newBalloonValue}
                        onChange={e => setNewBalloonValue(e.target.value)}
                        placeholder={newBalloonType === 'note' ? 'e.g. NOTE 1' : 'e.g. 0.250'}
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && confirmAddBalloon()}
                     />
                     <div className="flex justify-end gap-2">
                         <button onClick={() => setShowValueInput(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                         <button onClick={confirmAddBalloon} className="bg-[#E63946] px-6 py-2 rounded text-white font-medium hover:bg-red-700">Add</button>
                     </div>
                 </div>
             </div>
        )}
        
        <GlassWallPaywall isOpen={showGlassWall} onClose={() => setShowGlassWall(false)} />
        {!canDownload && <PreviewWatermark />}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

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

  // Color Logic based on Status
  const statusColor = dimension.status === 'PASS' ? 'bg-green-600 border-green-400 text-white' : 
                      dimension.status === 'FAIL' ? 'bg-red-600 border-red-400 text-white' : 
                      isSelected ? 'bg-[#E63946] text-white border-white' : 'bg-white text-[#E63946] border-[#E63946]';
  
  const scale = isSelected ? 'scale-110 z-50' : 'z-10';

  return (
    <div
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${disabled ? '' : 'cursor-grab'} ${scale}`}
      style={{ left: `${dimension.balloonX}%`, top: `${dimension.balloonY}%` }}
      onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onMouseDown={handleMouseDown}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-lg border-2 ${statusColor}`}>
        {dimension.id}
      </div>
      {isHovered && !disabled && (
        <div className="absolute left-full top-1/2 ml-2 -translate-y-1/2 bg-[#1a1a1a] p-2 rounded border border-[#333] z-50 whitespace-nowrap shadow-xl">
            <div className="text-white text-xs font-mono font-bold">{dimension.value}</div>
            <div className="text-gray-400 text-[10px]">{dimension.parsed?.subtype || 'Dimension'}</div>
            {dimension.actual && <div className="text-blue-400 text-[10px]">Actual: {dimension.actual}</div>}
            <div className="text-red-500 text-[10px] cursor-pointer hover:text-red-400 mt-1" onClick={(e) => {e.stopPropagation(); onDelete();}}>Delete</div>
        </div>
      )}
    </div>
  );
}

function PageNavigator({ currentPage, totalPages, onPageChange }) {
  return (
    <div className="flex items-center gap-2 bg-[#1a1a1a] px-2 py-1 rounded border border-[#333]">
        <button disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="text-gray-400 hover:text-white disabled:opacity-30 px-2">◀</button>
        <span className="text-xs text-gray-300 font-mono">Page {currentPage}/{totalPages}</span>
        <button disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className="text-gray-400 hover:text-white disabled:opacity-30 px-2">▶</button>
    </div>
  );
}

function DownloadMenu({ isPro, isDownloading, onDownloadPDF, onDownloadZIP, onDownloadExcel }) {
    const [open, setOpen] = useState(false);
    
    if (!isPro) return (
        <button className="px-3 py-1.5 bg-[#2a2a2a] text-gray-500 rounded text-sm cursor-not-allowed">Export (Pro)</button>
    );

    return (
        <div className="relative">
            <button onClick={() => setOpen(!open)} className="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-sm flex items-center gap-2">
                {isDownloading ? 'Exporting...' : 'Export'}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-[#333] rounded shadow-xl z-50 py-1">
                    <button onClick={() => {onDownloadPDF(); setOpen(false)}} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white">Ballooned PDF</button>
                    <button onClick={() => {onDownloadExcel(); setOpen(false)}} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white">AS9102 Excel</button>
                    <button onClick={() => {onDownloadZIP(); setOpen(false)}} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#333] hover:text-white">Full Package (ZIP)</button>
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
