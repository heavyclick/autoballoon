/**
 * DropZone.jsx - REFACTORED & SIMPLIFIED
 * Handles file upload UI and delegates to BlueprintViewer for editing
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { useAuth } from '../context/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { API_BASE_URL, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS } from '../constants/config';
import { GlassWallPaywall } from './GlassWallPaywall';
import { BlueprintViewer } from './BlueprintViewer';
import { RevisionCompare } from './RevisionCompare';

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

  // Revision Compare Modal
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

  // Blueprint Viewer (after processing)
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
        visitorId={visitorId}
        userEmail={userEmail}
      />
    </>
  );

  // Upload UI (initial state) - CENTERED with container
  return (
    <div className="px-4 pb-16">
      <div className="max-w-5xl mx-auto">
        <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl p-6 md:p-8 relative overflow-hidden">
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
      {!isPro && (
        <p className="text-center text-gray-500 text-sm mt-6">
          Try it free • No signup required • Your data is never stored
        </p>
      )}
    </div>
        </div>
      </div>
    </div>
  );
}

export default DropZone;
