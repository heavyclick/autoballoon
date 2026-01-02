/**
 * DropZone.jsx - FIXED & ENHANCED
 * * NEW FEATURES:
 * 1. Measurement Method Column (Auto-detect logic)
 * 2. Snippet Verification Sidebar (Speed check)
 * 3. Confidence Heatmap (Green/Yellow/Red)
 * 4. Local Project Saving (.ab files via JSZip)
 * 5. CMM Import: Raw Text Support & Weighted Scoring
 * 6. Revision Compare: Balloon Porting Workflow
 * * PREVIOUS FIXES:
 * 1. 422 Error Fix
 * 2. Invisible Bridge Tooltip
 * 3. Smart Click Add Balloon
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip'; // REQUIRES: npm install jszip
import { useAuth } from '../context/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { API_BASE_URL, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS } from '../constants/config';
import { GlassWallPaywall } from './GlassWallPaywall';
import { PreviewWatermark } from './PreviewWatermark';

export function DropZone({ onBeforeProcess, hasPromoAccess = false, userEmail = '' }) {
  const { token, isPro } = useAuth();
  const { visitorId, incrementUsage, usage, refreshUsage } = useUsage();
  const fileInputRef = useRef(null);
  const projectInputRef = useRef(null);
  
  // User has access if: isPro OR hasPromoAccess (from URL promo code)
  const canDownload = isPro || hasPromoAccess;
  
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [showGlassWall, setShowGlassWall] = useState(false);
  const [showRevisionCompare, setShowRevisionCompare] = useState(false);
  
  // Multi-page state
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
      // Ensure file is sent as binary for backend Vector/PDF extraction
      formData.append('file', file);
      if (!token) formData.append('visitor_id', visitorId);
      
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const response = await fetch(`${API_BASE_URL}/process`, { method: 'POST', headers, body: formData });
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

  // ============ SAVE / LOAD PROJECT (.ab) ============
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
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
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

  const handleOpenCompare = () => {
    setShowRevisionCompare(true);
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
        <button onClick={handleOpenCompare} className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl transition-all text-sm flex items-center gap-2 font-medium shadow-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          Compare Revisions
        </button>
        <button onClick={() => projectInputRef.current?.click()} className="px-6 py-3 bg-[#1a1a1a] border border-[#333] hover:bg-[#252525] text-white rounded-xl transition-all text-sm flex items-center gap-2 font-medium shadow-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          Load Project (.ab)
        </button>
        <input ref={projectInputRef} type="file" accept=".ab" onChange={handleLoadProject} className="hidden" />
      </div>
      <div
        className={`relative border-2 border-dashed rounded-xl p-12 transition-all duration-200 cursor-pointer ${isDragging ? 'border-[#E63946] bg-[#E63946]/10' : 'border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#1a1a1a]'} ${isProcessing ? 'pointer-events-none' : ''}`}
        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} onClick={handleClick}
      >
        <input ref={fileInputRef} type="file" accept={ALLOWED_EXTENSIONS.join(',')} onChange={handleFileChange} className="hidden" />
        {isProcessing ? (
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-[#E63946] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xl font-medium text-white mb-2">Processing...</p>
            <p className="text-gray-400 text-sm">Detecting dimensions & analyzing tolerances...</p>
          </div>
        ) : (
          <div className="text-center">
            <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${isDragging ? 'bg-[#E63946]/20' : 'bg-[#1a1a1a]'}`}>
              <svg className={`w-10 h-10 ${isDragging ? 'text-[#E63946]' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-xl font-medium text-white mb-2">{isDragging ? 'Drop your file here' : 'Drag & drop your blueprint'}</p>
            <p className="text-gray-400 mb-4">or <span className="text-[#E63946]">click to browse</span></p>
            <p className="text-gray-500 text-sm">PDF (Vector/OCR), PNG, JPEG, TIFF</p>
          </div>
        )}
        {error && <div className="absolute inset-x-0 bottom-4 text-center"><p className="text-red-500 text-sm">{error}</p></div>}
      </div>
    </div>
  );
}

// ============ REVISION COMPARE ============
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
      const [formDataA, formDataB] = [new FormData(), new FormData()];
      formDataA.append('file', revA.file);
      formDataB.append('file', revB.file);
      const [responseA, responseB] = await Promise.all([
        fetch(`${API_BASE_URL}/process`, { method: 'POST', body: formDataA }),
        fetch(`${API_BASE_URL}/process`, { method: 'POST', body: formDataB })
      ]);
      const [dataA, dataB] = await Promise.all([responseA.json(), responseB.json()]);
      
      if (dataA.success && dataB.success) {
        const dimsA = dataA.dimensions || [];
        const dimsB = dataB.dimensions || [];
        const changes = { added: [], removed: [], modified: [], unchanged: [] };
        
        // Simple geometric matching for quick visual diff
        // (Production note: Backend alignment service should be used for better precision)
        const filterTitleBlock = (dims) => dims.filter(d => {
          const centerY = (d.bounding_box.ymin + d.bounding_box.ymax) / 2;
          return centerY < 800; // Rough title block filter
        });
        const filteredA = filterTitleBlock(dimsA);
        const filteredB = filterTitleBlock(dimsB);
        const TOLERANCE = 20;
        
        filteredB.forEach(dimB => {
          const centerBX = (dimB.bounding_box.xmin + dimB.bounding_box.xmax) / 2;
          const centerBY = (dimB.bounding_box.ymin + dimB.bounding_box.ymax) / 2;
          const matchA = filteredA.find(dimA => {
            const centerAX = (dimA.bounding_box.xmin + dimA.bounding_box.xmax) / 2;
            const centerAY = (dimA.bounding_box.ymin + dimA.bounding_box.ymax) / 2;
            return Math.abs(centerAX - centerBX) < TOLERANCE && Math.abs(centerAY - centerBY) < TOLERANCE;
          });
          if (!matchA) changes.added.push({ ...dimB, changeType: 'added' });
          else if (matchA.value !== dimB.value) changes.modified.push({ ...dimB, changeType: 'modified', oldValue: matchA.value, newValue: dimB.value });
          else changes.unchanged.push({ ...dimB, changeType: 'unchanged' });
        });
        
        filteredA.forEach(dimA => {
          const centerAX = (dimA.bounding_box.xmin + dimA.bounding_box.xmax) / 2;
          const centerAY = (dimA.bounding_box.ymin + dimA.bounding_box.ymax) / 2;
          const matchB = filteredB.find(dimB => {
            const centerBX = (dimB.bounding_box.xmin + dimB.bounding_box.xmax) / 2;
            const centerBY = (dimB.bounding_box.ymin + dimB.bounding_box.ymax) / 2;
            return Math.abs(centerAX - centerBX) < TOLERANCE && Math.abs(centerAY - centerBY) < TOLERANCE;
          });
          if (!matchB) changes.removed.push({ ...dimA, changeType: 'removed' });
        });
        
        setComparisonResult({ revA: dataA, revB: dataB, changes, summary: { added: changes.added.length, removed: changes.removed.length, modified: changes.modified.length, unchanged: changes.unchanged.length } });
      }
    } catch (err) {
      console.error('Comparison failed:', err);
    } finally {
      setIsComparing(false);
    }
  };

  const handlePortBalloons = async () => {
    if (!isPro) { onShowGlassWall(); return; }
    if (!comparisonResult) return;
    
    setIsPorting(true);
    try {
        // In a real implementation, this would call /api/align/port
        // For now, we simulate the porting by taking Rev A's IDs and applying them to Rev B's matching locations
        const portedDimensions = [];
        
        // 1. Port unchanged/modified dimensions (Maintain IDs from Rev A)
        comparisonResult.revB.dimensions.forEach(dimB => {
            const matchA = comparisonResult.revA.dimensions.find(dimA => {
                 // Simple bounding box overlap check or centroid distance
                 // Real backend would use vector alignment matrix
                 const cxA = (dimA.bounding_box.xmin + dimA.bounding_box.xmax) / 2;
                 const cyA = (dimA.bounding_box.ymin + dimA.bounding_box.ymax) / 2;
                 const cxB = (dimB.bounding_box.xmin + dimB.bounding_box.xmax) / 2;
                 const cyB = (dimB.bounding_box.ymin + dimB.bounding_box.ymax) / 2;
                 return Math.abs(cxA - cxB) < 30 && Math.abs(cyA - cyB) < 30;
            });
            
            if (matchA) {
                portedDimensions.push({ ...dimB, id: matchA.id }); // Keep old ID
            } else {
                // It's a new feature, assign new high ID
                portedDimensions.push({ ...dimB, id: 9000 + Math.floor(Math.random() * 1000) }); // Temporary ID for new items
            }
        });

        onComplete({ 
            dimensions: portedDimensions.sort((a,b) => a.id - b.id), 
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

  const handleUseChanges = () => {
    if (!isPro) { onShowGlassWall(); return; }
    if (comparisonResult && onComplete) {
      const changedDimensions = [...comparisonResult.changes.added, ...comparisonResult.changes.modified].map((dim, idx) => ({ ...dim, id: idx + 1 }));
      onComplete({ dimensions: changedDimensions, image: comparisonResult.revB.image, metadata: comparisonResult.revB.metadata, comparison: comparisonResult });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161616] rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-[#2a2a2a] flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white"><span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">Delta FAI</span> - Revision Compare</h2>
            <p className="text-gray-400 text-sm">Upload two revisions to find only what changed or port balloons</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {!comparisonResult ? (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-white font-medium mb-3 flex items-center gap-2"><span className="w-6 h-6 rounded bg-gray-600 flex items-center justify-center text-xs">A</span>Old Revision</h3>
                <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${revA ? 'border-green-500/50 bg-green-500/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'}`} onClick={() => fileInputARef.current?.click()}>
                  <input ref={fileInputARef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => handleFileSelect(e.target.files[0], setRevA)} className="hidden" />
                  {revA ? (<div><img src={revA.preview} alt="Rev A" className="max-h-48 mx-auto rounded mb-2" /><p className="text-green-400 text-sm">{revA.name}</p></div>) : (<div><svg className="w-10 h-10 text-gray-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><p className="text-gray-400">Upload Rev A (Old)</p></div>)}
                </div>
              </div>
              <div>
                <h3 className="text-white font-medium mb-3 flex items-center gap-2"><span className="w-6 h-6 rounded bg-[#E63946] flex items-center justify-center text-xs text-white">B</span>New Revision</h3>
                <div className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${revB ? 'border-[#E63946]/50 bg-[#E63946]/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'}`} onClick={() => fileInputBRef.current?.click()}>
                  <input ref={fileInputBRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => handleFileSelect(e.target.files[0], setRevB)} className="hidden" />
                  {revB ? (<div><img src={revB.preview} alt="Rev B" className="max-h-48 mx-auto rounded mb-2" /><p className="text-[#E63946] text-sm">{revB.name}</p></div>) : (<div><svg className="w-10 h-10 text-gray-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><p className="text-gray-400">Upload Rev B (New)</p></div>)}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center"><div className="text-3xl font-bold text-green-400">{comparisonResult.summary.added}</div><div className="text-green-400/70 text-sm">Added</div></div>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center"><div className="text-3xl font-bold text-yellow-400">{comparisonResult.summary.modified}</div><div className="text-yellow-400/70 text-sm">Modified</div></div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center"><div className="text-3xl font-bold text-red-400">{comparisonResult.summary.removed}</div><div className="text-red-400/70 text-sm">Removed</div></div>
                <div className="bg-gray-500/10 border border-gray-500/30 rounded-xl p-4 text-center"><div className="text-3xl font-bold text-gray-400">{comparisonResult.summary.unchanged}</div><div className="text-gray-400/70 text-sm">Unchanged</div></div>
              </div>
              <div className="bg-[#0a0a0a] rounded-xl overflow-hidden max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-[#1a1a1a] sticky top-0"><tr><th className="px-4 py-2 text-left text-gray-400">Status</th><th className="px-4 py-2 text-left text-gray-400">Zone</th><th className="px-4 py-2 text-left text-gray-400">Old</th><th className="px-4 py-2 text-left text-gray-400">New</th></tr></thead>
                  <tbody>
                    {comparisonResult.changes.added.map((dim, i) => (<tr key={`a${i}`} className="border-t border-[#1a1a1a]"><td className="px-4 py-2"><span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">ADDED</span></td><td className="px-4 py-2 text-gray-300">{dim.zone || '-'}</td><td className="px-4 py-2 text-gray-500">-</td><td className="px-4 py-2 text-white font-mono">{dim.value}</td></tr>))}
                    {comparisonResult.changes.modified.map((dim, i) => (<tr key={`m${i}`} className="border-t border-[#1a1a1a]"><td className="px-4 py-2"><span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">MODIFIED</span></td><td className="px-4 py-2 text-gray-300">{dim.zone || '-'}</td><td className="px-4 py-2 text-gray-500 font-mono line-through">{dim.oldValue}</td><td className="px-4 py-2 text-white font-mono">{dim.newValue}</td></tr>))}
                    {comparisonResult.changes.removed.map((dim, i) => (<tr key={`r${i}`} className="border-t border-[#1a1a1a]"><td className="px-4 py-2"><span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">REMOVED</span></td><td className="px-4 py-2 text-gray-300">{dim.zone || '-'}</td><td className="px-4 py-2 text-red-400 font-mono">{dim.value}</td><td className="px-4 py-2 text-gray-500">-</td></tr>))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-between">
          {!comparisonResult ? (
            <><div className="text-gray-500 text-sm">{revA && revB ? 'Ready to compare' : 'Upload both revisions'}</div>
            <button onClick={handleCompare} disabled={!revA || !revB || isComparing} className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg disabled:opacity-50 flex items-center gap-2">
              {isComparing ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Comparing...</> : 'Compare Revisions'}
            </button></>
          ) : (
            <div className="flex gap-4 w-full justify-between items-center">
              <button onClick={() => setComparisonResult(null)} className="text-gray-400 hover:text-white">Compare Different Files</button>
              <div className="flex gap-2">
                 <button onClick={handlePortBalloons} disabled={isPorting} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center gap-2">
                    {isPorting ? "Porting..." : "Port Balloons to Rev B"}
                 </button>
                 <button onClick={handleUseChanges} className="px-6 py-2 bg-[#E63946] hover:bg-[#c62d39] text-white font-medium rounded-lg flex items-center gap-2">
                  {!isPro && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                  Just Changes ({comparisonResult.summary.added + comparisonResult.summary.modified})
                 </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ BLUEPRINT VIEWER WITH UX IMPROVEMENTS ============
function BlueprintViewer({ result, onReset, token, isPro, onShowGlassWall, currentPage, setCurrentPage, totalPages: initialTotalPages }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedDimId, setSelectedDimId] = useState(null); // For snippet view
  
  // Multi-page support
  const hasMultiplePages = result.pages && result.pages.length > 1;
  const totalPages = hasMultiplePages ? result.pages.length : (initialTotalPages || 1);
  
  const getCurrentPageData = () => {
    if (hasMultiplePages) {
      return result.pages.find(p => p.page_number === currentPage) || result.pages[0];
    }
    return { image: result.image, dimensions: result.dimensions || [], grid_detected: result.grid?.detected };
  };
  
  const currentPageData = getCurrentPageData();
  const currentImage = hasMultiplePages ? `data:image/png;base64,${currentPageData.image}` : (currentPageData.image?.startsWith('data:') ? currentPageData.image : `data:image/png;base64,${currentPageData.image}`);
  
  const getPageDimensions = () => {
    if (hasMultiplePages) return currentPageData.dimensions || [];
    return result.dimensions || [];
  };
  
  // Initialize dimensions with calculated fields
  const [dimensions, setDimensions] = useState(() => {
    const dims = getPageDimensions();
    return dims.map(d => initializeDimension(d));
  });
  
  // Re-sync when page changes
  useEffect(() => {
    const pageDims = getPageDimensions();
    setDimensions(prev => {
        return pageDims.map(d => {
            const existing = prev.find(p => p.id === d.id);
            if (existing) return existing; 
            return initializeDimension(d);
        });
    });
    setSelectedDimId(null);
  }, [currentPage, result]);

  // Helper: Initialize Dimension with Method & Coordinates
  function initializeDimension(d) {
    return {
      ...d,
      anchorX: (d.bounding_box.xmin + d.bounding_box.xmax) / 2 / 10,
      anchorY: (d.bounding_box.ymin + d.bounding_box.ymax) / 2 / 10,
      balloonX: (d.bounding_box.xmin + d.bounding_box.xmax) / 2 / 10 + 4,
      balloonY: (d.bounding_box.ymin + d.bounding_box.ymax) / 2 / 10 - 4,
      method: d.method || detectMethod(d), // Auto-detect method
      confidence: d.confidence !== undefined ? d.confidence : 0.95 // Default to high if missing
    };
  }

  // FIX: Measurement Method Logic
  function detectMethod(dim) {
    if (dim.parsed) {
        if (dim.parsed.is_gdt) return "CMM"; 
        if (dim.parsed.tolerance_type === 'basic') return "CMM";
        
        const totalTol = (dim.parsed.max_limit - dim.parsed.min_limit);
        if (totalTol > 0 && totalTol < 0.01) return "Micrometer";
    }
    if (dim.value.includes('±') && dim.value.includes('0.00')) return "Micrometer";
    if (dim.value.startsWith('Ø')) return "Caliper";
    return "Caliper"; 
  }

  // ===== UX: Keyboard Navigation for Speed Verification =====
  useEffect(() => {
    const handleKeyDown = (e) => {
        if (!selectedDimId && dimensions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            setSelectedDimId(dimensions[0].id);
            return;
        }
        
        if (selectedDimId) {
            const currentIndex = dimensions.findIndex(d => d.id === selectedDimId);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = dimensions[currentIndex + 1];
                if (next) {
                    setSelectedDimId(next.id);
                    document.getElementById(`row-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = dimensions[currentIndex - 1];
                if (prev) {
                    setSelectedDimId(prev.id);
                    document.getElementById(`row-${prev.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDimId, dimensions]);

  const [drawMode, setDrawMode] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [drawEnd, setDrawEnd] = useState(null);
  
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
  
  // Save Project Handler
  const handleSaveProject = async () => {
    setIsDownloading(true);
    try {
        const zip = new JSZip();
        
        const stateToSave = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            result: {
                ...result,
                pages: result.pages.map(p => {
                    if (p.page_number === currentPage) return { ...p, dimensions };
                    return p;
                })
            },
            totalPages,
            cmmResults
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
        const isInside = d.balloonX >= finalMinX && d.balloonX <= finalMaxX && d.balloonY >= finalMinY && d.balloonY <= finalMaxY;
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
    
    console.log('[AddBalloon] Sending request to:', `${API_BASE_URL}/detect-region`);

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
      
      let croppedBase64;
      try {
        croppedBase64 = canvas.toDataURL('image/png').split(',')[1];
      } catch (e) {
        console.error('Canvas error:', e);
        setDetectionError('Image security error. Enter value manually.');
        setIsDetecting(false);
        return;
      }
      
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
            const val = data.dimensions[0].value || data.dimensions[0];
            setNewBalloonValue(val);
          } else {
            setDetectionError('No text detected. Enter value manually.');
          }
        } else {
          const errorText = await response.text();
          console.error('[AddBalloon] Request failed:', response.status, errorText);
          setDetectionError('Auto-detect unavailable. Enter value manually.');
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('[AddBalloon] Request timed out');
          setDetectionError('Detection timed out. Enter value manually.');
        } else {
          console.error('[AddBalloon] Fetch error:', fetchError);
          setDetectionError('Connection error. Enter value manually.');
        }
      }
    } catch (err) {
      console.error('[AddBalloon] Unexpected error:', err);
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
      method: "Visual", 
      confidence: 1.0
    }]);
    
    setShowValueInput(false);
    setNewBalloonRect(null);
    setNewBalloonValue('');
    setDetectionError(null);
  };
  
  const handleDownloadPDF = async () => {
    if (!isPro) { onShowGlassWall(); return; }
    setIsDownloading(true);
    try {
      const payload = {
        pages: hasMultiplePages 
          ? result.pages.map(p => ({ page_number: p.page_number, image: p.image, width: p.width || 1700, height: p.height || 2200, dimensions: p.dimensions || [], grid_detected: p.grid_detected !== false }))
          : [{ page_number: 1, image: result.image?.replace(/^data:image\/\w+;base64,/, '') || '', width: result.metadata?.width || 1700, height: result.metadata?.height || 2200, dimensions: result.dimensions || [], grid_detected: result.grid?.detected !== false }],
        part_number: result.metadata?.part_number || '',
        revision: result.metadata?.revision || '',
        grid_detected: hasMultiplePages ? result.pages.every(p => p.grid_detected !== false) : (result.grid?.detected !== false)
      };
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/download/pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }) },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'ballooned_drawing.pdf';
        downloadBlob(blob, filename);
      }
    } catch (err) { console.error('PDF download failed:', err); }
    finally { setIsDownloading(false); }
  };

  const handleDownloadZIP = async () => {
    if (!isPro) { onShowGlassWall(); return; }
    setIsDownloading(true);
    try {
      const payload = {
        pages: hasMultiplePages 
          ? result.pages.map(p => ({ page_number: p.page_number, image: p.image, width: p.width || 1700, height: p.height || 2200, dimensions: p.dimensions || [], grid_detected: p.grid_detected !== false }))
          : [{ page_number: 1, image: result.image?.replace(/^data:image\/\w+;base64,/, '') || '', width: result.metadata?.width || 1700, height: result.metadata?.height || 2200, dimensions: result.dimensions || [], grid_detected: result.grid?.detected !== false }],
        part_number: result.metadata?.part_number || '',
        revision: result.metadata?.revision || '',
        grid_detected: hasMultiplePages ? result.pages.every(p => p.grid_detected !== false) : (result.grid?.detected !== false)
      };
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/download/zip`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }) },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'FAI_package.zip';
        downloadBlob(blob, filename);
      }
    } catch (err) { console.error('ZIP download failed:', err); }
    finally { setIsDownloading(false); }
  };

  const handleDownloadExcel = async () => {
    if (!isPro) { onShowGlassWall(); return; }
    setIsDownloading(true);
    try {
      const payload = {
        pages: hasMultiplePages 
          ? result.pages.map(p => ({ page_number: p.page_number, image: p.image, width: p.width || 1700, height: p.height || 2200, dimensions: p.dimensions || [], grid_detected: p.grid_detected !== false }))
          : [{ page_number: 1, image: result.image?.replace(/^data:image\/\w+;base64,/, '') || '', width: result.metadata?.width || 1700, height: result.metadata?.height || 2200, dimensions: result.dimensions || [], grid_detected: result.grid?.detected !== false }],
        part_number: result.metadata?.part_number || '',
        revision: result.metadata?.revision || '',
        grid_detected: hasMultiplePages ? result.pages.every(p => p.grid_detected !== false) : (result.grid?.detected !== false)
      };
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/download/excel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }) },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'AS9102_Form3.xlsx';
        downloadBlob(blob, filename);
      }
    } catch (err) { console.error('Excel download failed:', err); }
    finally { setIsDownloading(false); }
  };
  
  const handleExport = async (format = 'xlsx') => {
    if (!isPro) { onShowGlassWall(); return; }
    setIsExporting(true);
    try {
      const allDimensions = hasMultiplePages 
        ? result.pages.flatMap(p => (p.dimensions || []).map(d => ({ ...d, page: p.page_number })))
        : dimensions.map(d => ({ id: d.id, value: d.value, zone: d.zone, actual: cmmResults[d.id]?.actual || '' }));
      const response = await fetch(`${API_BASE_URL}/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { 'Authorization': `Bearer ${token}` }) },
        body: JSON.stringify({ format, template: 'AS9102_FORM3', dimensions: allDimensions, filename: result.metadata?.filename || 'inspection', total_pages: totalPages }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `${result.metadata?.filename || 'inspection'}_FAI.${format}`;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); a.remove();
      }
    } catch (err) { console.error('Export failed:', err); }
    finally { setIsExporting(false); }
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
        ctx.beginPath(); ctx.moveTo(anchorX, anchorY); ctx.lineTo(balloonX, balloonY);
        ctx.strokeStyle = '#E63946'; ctx.lineWidth = lineWidth; ctx.stroke();
        ctx.beginPath(); ctx.arc(anchorX, anchorY, Math.max(2.5, lineWidth * 0.8), 0, Math.PI * 2);
        ctx.fillStyle = '#E63946'; ctx.fill();
        ctx.beginPath(); ctx.arc(balloonX, balloonY, balloonRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'white'; ctx.fill(); ctx.strokeStyle = '#E63946'; ctx.lineWidth = lineWidth; ctx.stroke();
        ctx.fillStyle = '#E63946'; ctx.font = `bold ${fontSize}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(dim.id.toString(), balloonX, balloonY);
      });
      
      canvas.toBlob((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `${result.metadata?.filename || 'blueprint'}_page${currentPage}_ballooned.png`;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); a.remove();
        setIsDownloading(false);
      }, 'image/png');
    } catch (err) { console.error('Download failed:', err); setIsDownloading(false); }
  };

  const handleDeleteDimension = (id) => { setDimensions(prev => prev.filter(d => d.id !== id)); };

  const handleBalloonDrag = (id, deltaX, deltaY) => {
    setDimensions(prev => prev.map(d => {
      if (d.id !== id) return d;
      return { ...d, anchorX: d.anchorX + deltaX, anchorY: d.anchorY + deltaY, balloonX: d.balloonX + deltaX, balloonY: d.balloonY + deltaY };
    }));
  };

  const handleCMMImport = (results) => { setCmmResults(results); setShowCMMImport(false); };

  const handleUpdateMethod = (id, newMethod) => {
    setDimensions(prev => prev.map(d => d.id === id ? { ...d, method: newMethod } : d));
  };

  const selectionRect = isDrawing && drawStart && drawEnd ? {
    left: `${Math.min(drawStart.x, drawEnd.x)}%`,
    top: `${Math.min(drawStart.y, drawEnd.y)}%`,
    width: `${Math.abs(drawEnd.x - drawStart.x)}%`,
    height: `${Math.abs(drawEnd.y - drawStart.y)}%`,
  } : null;

  return (
    <div className="space-y-6">
      {showCMMImport && <CMMImportModal dimensions={dimensions} onClose={() => setShowCMMImport(false)} onImport={handleCMMImport} />}
      
      {/* Value Input Popup with OCR detection status */}
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
            <input
              type="text"
              value={newBalloonValue}
              onChange={(e) => setNewBalloonValue(e.target.value)}
              placeholder="e.g., 0.45&quot;, 21 Teeth 0.080in Pitch..."
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm mb-4"
              autoFocus
              disabled={isDetecting}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isDetecting) handleAddBalloonConfirm();
                if (e.key === 'Escape') { setShowValueInput(false); setNewBalloonRect(null); setNewBalloonValue(''); setDetectionError(null); }
              }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowValueInput(false); setNewBalloonRect(null); setNewBalloonValue(''); setDetectionError(null); }} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleAddBalloonConfirm} disabled={!newBalloonValue.trim() || isDetecting} className="px-4 py-2 bg-[#E63946] hover:bg-[#c62d39] text-white rounded-lg text-sm disabled:opacity-50">Add Balloon</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={onReset} className="text-gray-400 hover:text-white transition-colors flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            New Upload
          </button>
          <div className="h-6 w-px bg-[#2a2a2a]" />
          
          <button onClick={handleSaveProject} className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2 text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
            Save Project
          </button>
          
          {totalPages > 1 && (
            <>
              <div className="h-6 w-px bg-[#2a2a2a]" />
              <PageNavigator currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} gridDetected={currentPageData.grid_detected} />
              <div className="h-6 w-px bg-[#2a2a2a]" />
            </>
          )}
          
          <span className="text-sm">
            <span className="text-gray-400">This page: </span>
            <span className="text-white font-medium">{dimensions.length} dimensions</span>
            {totalPages > 1 && <span className="text-gray-500 ml-2">({getTotalDimensions()} total)</span>}
          </span>
          
          {result.grid?.detected && !hasMultiplePages && <><div className="h-6 w-px bg-[#2a2a2a]" /><span className="text-sm"><span className="text-gray-400">Grid: </span><span className="text-white font-medium">{result.grid.columns?.length}x{result.grid.rows?.length}</span></span></>}
        </div>
        
        {/* Right side - ALL action buttons in one row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Add Balloon */}
          <button
            onClick={() => setDrawMode(drawMode === 'addBalloon' ? null : 'addBalloon')}
            className={`px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-2 ${drawMode === 'addBalloon' ? 'bg-[#E63946] text-white' : 'bg-[#1a1a1a] hover:bg-[#252525] text-gray-300'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {drawMode === 'addBalloon' ? 'Cancel' : 'Add Balloon'}
          </button>
          
          {/* Clear Area */}
          <button
            onClick={() => setDrawMode(drawMode === 'clearArea' ? null : 'clearArea')}
            className={`px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-2 ${drawMode === 'clearArea' ? 'bg-red-600 text-white' : 'bg-[#1a1a1a] hover:bg-[#252525] text-gray-300'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            {drawMode === 'clearArea' ? 'Cancel' : 'Clear Area'}
          </button>
          
          <div className="h-6 w-px bg-[#2a2a2a]" />
          
          {/* Import CMM */}
          <button onClick={() => setShowCMMImport(true)} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Import CMM
          </button>
          
          {/* Save Page */}
          <button onClick={handleDownloadImage} disabled={isDownloading} className="px-3 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
            {!isPro && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
            Save Page {currentPage}
          </button>
          
          {/* Download Menu */}
          <DownloadMenu onDownloadPDF={handleDownloadPDF} onDownloadZIP={handleDownloadZIP} onDownloadExcel={handleDownloadExcel} isDownloading={isDownloading} totalPages={totalPages} totalDimensions={getTotalDimensions()} isPro={isPro} />
        </div>
      </div>

      {/* Mode indicator / Tip */}
      <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 text-sm text-gray-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {drawMode === 'addBalloon' ? (
                <span className="text-[#E63946]">Draw a rectangle around the dimension. Text will be auto-detected. Press Escape to cancel.</span>
            ) : drawMode === 'clearArea' ? (
                <span className="text-red-400">Draw a rectangle over the balloons you want to delete. Press Escape to cancel.</span>
            ) : (
                <span>Click a table row to inspect snippet (use <kbd className="bg-[#333] px-1 rounded">↓</kbd> / <kbd className="bg-[#333] px-1 rounded">↑</kbd> keys).</span>
            )}
        </div>
        {selectedDimId && <span className="text-[#E63946] font-medium">Dimension #{selectedDimId} Selected</span>}
      </div>

      {/* Canvas Area */}
      <div
        ref={containerRef}
        className={`relative bg-[#0a0a0a] rounded-xl overflow-hidden select-none ${drawMode ? 'cursor-crosshair' : ''}`}
        style={{ minHeight: '500px' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); setDrawStart(null); setDrawEnd(null); } }}
      >
        {currentImage && <img ref={imageRef} src={currentImage} alt={`Blueprint Page ${currentPage}`} className="w-full h-auto pointer-events-none" crossOrigin="anonymous" />}
        
        {/* Leader lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {dimensions.map((dim) => (
            <g key={`leader-${dim.id}`}>
              <line 
                x1={`${dim.anchorX}%`} y1={`${dim.anchorY - 0.8}%`} 
                x2={`${dim.balloonX}%`} y2={`${dim.balloonY}%`} 
                stroke={selectedDimId === dim.id ? "#fff" : "#E63946"} 
                strokeWidth={selectedDimId === dim.id ? "3" : "2"} 
              />
              <circle cx={`${dim.anchorX}%`} cy={`${dim.anchorY - 0.8}%`} r="2.5" fill="#E63946" />
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
            onClick={(e) => { e.stopPropagation(); setSelectedDimId(dim.id); }}
            cmmResult={cmmResults[dim.id]}
            containerRef={containerRef}
            disabled={drawMode !== null}
          />
        ))}
        
        {/* Selection rectangle while drawing */}
        {selectionRect && (
          <div
            className={`absolute border-2 border-dashed pointer-events-none ${drawMode === 'addBalloon' ? 'border-[#E63946] bg-[#E63946]/10' : 'border-red-500 bg-red-500/10'}`}
            style={selectionRect}
          />
        )}
        
        {/* Preview watermark for non-pro */}
        {!isPro && <PreviewWatermark isVisible={true} />}
      </div>

      {/* Dimensions Table & Snippet Split View */}
      <div className="grid grid-cols-12 gap-6 h-[500px]">
         {/* Left: Table (8 cols) */}
         <div className="col-span-8 bg-[#0a0a0a] rounded-xl overflow-hidden flex flex-col border border-[#2a2a2a]">
            <div className="px-4 py-3 bg-[#1a1a1a] border-b border-[#2a2a2a] flex items-center justify-between">
              <h3 className="font-medium text-white">Dimensions {totalPages > 1 ? `(Page ${currentPage})` : ''}</h3>
              <span className="text-xs text-gray-500">Showing {dimensions.length} of {getTotalDimensions()} total</span>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-[#161616] sticky top-0 z-10">
                    <tr>
                        <th className="px-4 py-2 text-left text-gray-400 font-medium">#</th>
                        <th className="px-4 py-2 text-left text-gray-400 font-medium">Zone</th>
                        <th className="px-4 py-2 text-left text-gray-400 font-medium">Nominal</th>
                        <th className="px-4 py-2 text-left text-gray-400 font-medium">Method</th>
                        <th className="px-4 py-2 text-left text-gray-400 font-medium">Actual</th>
                        <th className="px-4 py-2 text-left text-gray-400 font-medium">Status</th>
                        <th className="px-4 py-2 text-right text-gray-400 font-medium">Actions</th>
                    </tr>
                </thead>
                <tbody>
                  {dimensions.map((dim) => {
                    // Confidence Color Logic
                    const confColor = dim.confidence > 0.98 ? 'border-l-4 border-green-500 bg-green-500/5' :
                                      dim.confidence > 0.8 ? 'border-l-4 border-yellow-500 bg-yellow-500/5' :
                                      'border-l-4 border-red-500 bg-red-500/5';
                    const isSelected = selectedDimId === dim.id;
                    
                    return (
                        <tr 
                            key={dim.id} 
                            id={`row-${dim.id}`}
                            onClick={() => setSelectedDimId(dim.id)}
                            className={`border-b border-[#1a1a1a] cursor-pointer transition-colors ${confColor} ${isSelected ? 'bg-[#252525]' : 'hover:bg-[#161616]'}`}
                        >
                          <td className="px-4 py-2 text-white font-medium">{dim.id}</td>
                          <td className="px-4 py-2 text-gray-300">{dim.zone || '-'}</td>
                          <td className="px-4 py-2 text-white font-mono">{dim.value}</td>
                          <td className="px-4 py-2">
                             <select 
                                value={dim.method} 
                                onChange={(e) => handleUpdateMethod(dim.id, e.target.value)}
                                className="bg-[#0a0a0a] border border-[#333] rounded text-xs text-gray-300 py-1 focus:border-[#E63946] focus:outline-none"
                                onClick={(e) => e.stopPropagation()}
                             >
                                <option value="Caliper">Caliper</option>
                                <option value="Micrometer">Micrometer</option>
                                <option value="CMM">CMM</option>
                                <option value="Visual">Visual</option>
                                <option value="Height Gage">Height Gage</option>
                             </select>
                          </td>
                          <td className="px-4 py-2 text-white font-mono">{cmmResults[dim.id]?.actual || '-'}</td>
                          <td className="px-4 py-2">{cmmResults[dim.id]?.status && <span className={`px-2 py-1 rounded text-xs ${cmmResults[dim.id].status === 'PASS' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{cmmResults[dim.id].status}</span>}</td>
                          <td className="px-4 py-2 text-right"><button onClick={(e) => {e.stopPropagation(); handleDeleteDimension(dim.id)}} className="text-gray-500 hover:text-red-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></td>
                        </tr>
                    );
                  })}
                </tbody>
              </table>
              {dimensions.length === 0 && <div className="px-4 py-8 text-center text-gray-500">No dimensions on this page.</div>}
            </div>
         </div>
         
         {/* Right: Smart Snippet View (4 cols) */}
         <div className="col-span-4 bg-[#161616] rounded-xl border border-[#2a2a2a] flex flex-col">
             <div className="px-4 py-3 border-b border-[#2a2a2a]">
                 <h3 className="font-medium text-white">Snippet Verification</h3>
             </div>
             <div className="flex-1 p-4 flex flex-col items-center justify-center relative bg-black/50 overflow-hidden">
                 {selectedDimId ? (
                     <SnippetViewer 
                        dimension={dimensions.find(d => d.id === selectedDimId)} 
                        imageSrc={currentImage} 
                     />
                 ) : (
                     <div className="text-center text-gray-500">
                         <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                         <p>Select a dimension to inspect</p>
                         <p className="text-xs mt-2">Use <kbd className="bg-[#2a2a2a] px-1 rounded">↓</kbd> / <kbd className="bg-[#2a2a2a] px-1 rounded">↑</kbd> to navigate</p>
                     </div>
                 )}
             </div>
         </div>
      </div>
    </div>
  );
}

// ============ SNIPPET VIEWER COMPONENT ============
function SnippetViewer({ dimension, imageSrc }) {
    const canvasRef = useRef(null);
    
    useEffect(() => {
        if (!dimension || !imageSrc || !canvasRef.current) return;
        
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageSrc;
        img.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            // Coords are 0-1000 scale. Convert to pixels.
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            
            const bb = dimension.bounding_box;
            // Add significant padding for context (50% of the box size)
            const padX = (bb.xmax - bb.xmin) * 0.5; 
            const padY = (bb.ymax - bb.ymin) * 0.5;
            
            const sx = Math.max(0, (bb.xmin - padX) / 1000 * w);
            const sy = Math.max(0, (bb.ymin - padY) / 1000 * h);
            const sWidth = Math.min(w - sx, (bb.xmax - bb.xmin + padX*2) / 1000 * w);
            const sHeight = Math.min(h - sy, (bb.ymax - bb.ymin + padY*2) / 1000 * h);
            
            canvas.width = sWidth;
            canvas.height = sHeight;
            
            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
        };
    }, [dimension, imageSrc]);

    if (!dimension) return null;

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-1 bg-black border border-[#333] rounded-lg overflow-hidden flex items-center justify-center mb-4">
                <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
            </div>
            <div className="space-y-3 bg-[#1a1a1a] p-3 rounded-lg border border-[#2a2a2a]">
                <div className="flex justify-between text-sm items-center">
                    <span className="text-gray-400">Value:</span>
                    <span className="text-white font-mono font-bold text-lg bg-[#000] px-2 py-0.5 rounded border border-[#333]">{dimension.value}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Zone:</span>
                    <span className="text-white">{dimension.zone}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Confidence:</span>
                    <span className={`font-medium ${dimension.confidence > 0.98 ? 'text-green-400' : dimension.confidence > 0.8 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {(dimension.confidence * 100).toFixed(1)}%
                    </span>
                </div>
                 <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Method:</span>
                    <span className="text-blue-400">{dimension.method}</span>
                </div>
            </div>
        </div>
    );
}

// ============ DRAGGABLE BALLOON ============
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
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${isDragging ? 'cursor-grabbing z-50' : disabled ? '' : 'cursor-grab'}`}
      style={{ left: `${left}%`, top: `${top}%`, zIndex: isHovered || isDragging || isSelected ? 100 : 10 }}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={handleMouseDown}
    >
      {/* The balloon circle */}
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
      
      {/* Tooltip */}
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
            {cmmResult?.status && <div className={`text-xs ${cmmResult.status === 'PASS' ? 'text-green-400' : 'text-red-400'}`}>{cmmResult.status}</div>}
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

// ============ PAGE NAVIGATOR ============
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

// ============ DOWNLOAD MENU ============
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
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
            <p className="text-xs text-gray-400 mt-0.5">{totalPages} page{totalPages !== 1 ? 's' : ''} • {totalDimensions} dimension{totalDimensions !== 1 ? 's' : ''}</p>
          </div>

          <div className="p-2">
            <button onClick={() => handleDownload(onDownloadPDF)} className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-[#252525] transition-colors text-left group">
              <div className="p-2 rounded-lg bg-[#E63946]/10 text-[#E63946] group-hover:bg-[#E63946]/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Ballooned PDF</p>
                <p className="text-xs text-gray-400 mt-0.5">All pages with balloon markers</p>
              </div>
              {!isPro && <svg className="w-4 h-4 text-gray-500 self-center" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
            </button>

            <button onClick={() => handleDownload(onDownloadZIP)} className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-[#252525] transition-colors text-left group">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">FAI Package (ZIP)</p>
                <p className="text-xs text-gray-400 mt-0.5">Images + AS9102 Excel + README</p>
              </div>
              {isPro ? (
                <span className="text-[10px] font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full self-center">RECOMMENDED</span>
              ) : (
                <svg className="w-4 h-4 text-gray-500 self-center" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              )}
            </button>

            <button onClick={() => handleDownload(onDownloadExcel)} className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-[#252525] transition-colors text-left group">
              <div className="p-2 rounded-lg bg-green-500/10 text-green-400 group-hover:bg-green-500/20">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">AS9102 Excel Only</p>
                <p className="text-xs text-gray-400 mt-0.5">Form 3 spreadsheet</p>
              </div>
              {!isPro && <svg className="w-4 h-4 text-gray-500 self-center" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
            </button>
          </div>

          <div className="px-4 py-2.5 border-t border-[#2a2a2a] bg-[#0a0a0a]">
            <p className="text-[11px] text-gray-500">{isPro ? 'All exports include AS9102 Rev C compliant formatting' : 'Upgrade to Pro to unlock exports'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ HELPER FUNCTION ============
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

// ============ CMM IMPORT MODAL ============
function CMMImportModal({ dimensions, onClose, onImport }) {
  const [csvData, setCsvData] = useState(null);
  const [mappings, setMappings] = useState([]);
  const fileInputRef = useRef(null);

  // Helper to calculate match score
  const calculateMatchScore = (cmmRow, dimension) => {
    let score = 0;
    
    // 1. Nominal Match (50 pts)
    // Attempt to parse nominal from CMM row
    const cmmNominal = parseFloat(cmmRow.nominal || cmmRow.nom || cmmRow.theoretical || cmmRow.theo || 0);
    // Parse nominal from dimension value (remove text chars)
    const dimNominal = parseFloat(dimension.value.replace(/[^\d.-]/g, ''));
    
    if (!isNaN(cmmNominal) && !isNaN(dimNominal) && Math.abs(cmmNominal - dimNominal) < 0.001) {
        score += 50;
    }
    
    // 2. ID Match (30 pts)
    const cmmId = (cmmRow.feature || cmmRow.id || cmmRow['feature #'] || '').toString().toLowerCase();
    const dimId = dimension.id.toString();
    if (cmmId === dimId || cmmId.endsWith(dimId) || dimId.endsWith(cmmId)) {
        score += 30;
    }
    
    // 3. Tolerance Match (10 pts)
    // (Simplified check for now)
    
    return score;
  };

  const parseFileContent = (text, fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    
    if (ext === 'csv') {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        return lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim());
            const row = {};
            headers.forEach((h, i) => row[h] = values[i] || '');
            return row;
        });
    } else {
        // Basic parser for TXT/RPT files (Tab delimited or whitespace)
        // This is a simple frontend implementation. 
        // Ideally, this should use the backend 'Parser Factory' service.
        const lines = text.trim().split('\n');
        const parsedRows = [];
        let headers = [];
        
        // Try to find a header line
        const headerIndex = lines.findIndex(l => 
            l.toLowerCase().includes('feature') || 
            l.toLowerCase().includes('actual') || 
            l.toLowerCase().includes('meas')
        );
        
        if (headerIndex >= 0) {
            // Assume tab or multiple spaces
            headers = lines[headerIndex].split(/[\t,]+|\s{2,}/).map(h => h.trim().toLowerCase()).filter(Boolean);
            
            for (let i = headerIndex + 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const values = lines[i].split(/[\t,]+|\s{2,}/).map(v => v.trim()).filter(Boolean);
                if (values.length >= Math.min(3, headers.length)) {
                    const row = {};
                    // Best effort mapping
                    headers.forEach((h, idx) => {
                        if (values[idx]) row[h] = values[idx];
                    });
                    
                    // If no explicit feature ID, use implicit index or first col
                    if (!row.feature && !row.id) row.feature = values[0];
                    if (!row.actual && !row.measured) {
                        // try to find numeric value
                        const numericVal = values.find(v => !isNaN(parseFloat(v)) && v.includes('.'));
                        if (numericVal) row.actual = numericVal;
                    }
                    
                    parsedRows.push(row);
                }
            }
        }
        return parsedRows.length > 0 ? parsedRows : null;
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = parseFileContent(event.target.result, file.name);
      if (!data) {
          alert("Could not parse file. Ensure it has headers like 'Feature', 'Nominal', 'Actual'.");
          return;
      }
      setCsvData(data);
      
      const autoMappings = data.map((row, idx) => {
        // Find best match using Weighted Scoring
        let bestMatch = null;
        let maxScore = 0;
        
        dimensions.forEach(dim => {
            const score = calculateMatchScore(row, dim);
            if (score > maxScore && score > 20) { // Threshold
                maxScore = score;
                bestMatch = dim;
            }
        });

        return { 
          cmmIndex: idx, 
          cmmData: row, 
          matchedBalloon: bestMatch?.id || null, 
          matchScore: maxScore,
          actualValue: row.actual || row.measured || row.result || row.axis || '', 
          status: row.status || (row.pass === 'true' || row.pass === '1' || row.outtol === '0' ? 'PASS' : 'FAIL') // Basic status guess
        };
      });
      setMappings(autoMappings);
    };
    reader.readAsText(file);
  };

  const handleMappingChange = (idx, balloonId) => { 
    setMappings(prev => prev.map((m, i) => i === idx ? { ...m, matchedBalloon: balloonId ? parseInt(balloonId) : null } : m)); 
  };

  const handleImport = () => {
    const results = {};
    mappings.forEach(m => { 
      if (m.matchedBalloon) results[m.matchedBalloon] = { actual: m.actualValue, status: m.status }; 
    });
    onImport(results);
  };

  const matchedCount = mappings.filter(m => m.matchedBalloon).length;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161616] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-[#2a2a2a] flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">Import CMM Results</h2>
            <p className="text-gray-400 text-sm">Upload your CMM report to auto-fill measurement results</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {!csvData ? (
            <div 
              className="border-2 border-dashed border-[#2a2a2a] rounded-xl p-12 text-center cursor-pointer hover:border-[#3a3a3a]" 
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.txt,.rpt" onChange={handleFileUpload} className="hidden" />
              <svg className="w-12 h-12 text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-white font-medium mb-2">Upload CMM File</p>
              <p className="text-gray-500 text-sm">Supports CSV, TXT, RPT (PC-DMIS/Calypso)</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-green-500 font-medium">{matchedCount} of {mappings.length} matched (Weighted Scoring)</span>
                <button onClick={() => { setCsvData(null); setMappings([]); }} className="text-gray-400 hover:text-white text-sm">Upload different file</button>
              </div>
              <div className="bg-[#0a0a0a] rounded-xl overflow-hidden max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-[#1a1a1a] sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-400">CMM Feature</th>
                      <th className="px-4 py-3 text-left text-gray-400">Actual</th>
                      <th className="px-4 py-3 text-left text-gray-400">Match to Balloon</th>
                      <th className="px-4 py-3 text-left text-gray-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((m, idx) => (
                      <tr key={idx} className="border-t border-[#1a1a1a]">
                        <td className="px-4 py-3 text-white">
                            {m.cmmData.feature || m.cmmData.id || `Row ${idx + 1}`}
                            <div className="text-[10px] text-gray-500">Nom: {m.cmmData.nominal || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-white font-mono">{m.actualValue || '-'}</td>
                        <td className="px-4 py-3">
                          <select 
                            value={m.matchedBalloon || ''} 
                            onChange={(e) => handleMappingChange(idx, e.target.value)} 
                            className={`bg-[#1a1a1a] border rounded px-2 py-1 text-white text-sm ${m.matchScore > 40 ? 'border-green-500/50' : 'border-[#2a2a2a]'}`}
                          >
                            <option value="">No match</option>
                            {dimensions.map(d => <option key={d.id} value={d.id}>#{d.id} - {d.value} {m.matchedBalloon === d.id && `(Score: ${m.matchScore})`}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {m.status && (
                            <span className={`px-2 py-1 rounded text-xs ${m.status === 'PASS' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                              {m.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        {csvData && (
          <div className="px-6 py-4 border-t border-[#2a2a2a] flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
            <button 
              onClick={handleImport} 
              disabled={matchedCount === 0} 
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50"
            >
              Import {matchedCount} Results
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default DropZone;
