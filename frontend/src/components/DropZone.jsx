/**
 * DropZone Component
 * File upload, processing, and results display with balloon editing
 */

import React, { useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { API_BASE_URL, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS } from '../constants/config';

export function DropZone({ onBeforeProcess }) {
  const { token, isPro } = useAuth();
  const { visitorId, incrementUsage } = useUsage();
  const fileInputRef = useRef(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const validateFile = (file) => {
    if (!file) return 'No file selected';
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File too large. Maximum size: ${MAX_FILE_SIZE_MB}MB`;
    }
    return null;
  };

  const processFile = async (file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (onBeforeProcess && !onBeforeProcess()) {
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (!token) {
        formData.append('visitor_id', visitorId);
      }

      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/process`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
        await incrementUsage();
      } else {
        if (data.error?.code === 'USAGE_LIMIT_EXCEEDED') {
          if (onBeforeProcess) onBeforeProcess();
        } else {
          setError(data.error?.message || 'Processing failed');
        }
      }
    } catch (err) {
      setError('Network error. Please check your connection.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, [token, visitorId, onBeforeProcess]);

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  if (result) {
    return (
      <BlueprintViewer 
        result={result} 
        onReset={handleReset}
        token={token}
      />
    );
  }

  return (
    <div
      className={`
        relative border-2 border-dashed rounded-xl p-12
        transition-all duration-200 cursor-pointer
        ${isDragging 
          ? 'border-[#E63946] bg-[#E63946]/10' 
          : 'border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#1a1a1a]'
        }
        ${isProcessing ? 'pointer-events-none' : ''}
      `}
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
          <p className="text-gray-400 text-sm">Detecting dimensions, this may take a moment</p>
        </div>
      ) : (
        <div className="text-center">
          <div className={`
            w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center
            ${isDragging ? 'bg-[#E63946]/20' : 'bg-[#1a1a1a]'}
          `}>
            <svg 
              className={`w-10 h-10 ${isDragging ? 'text-[#E63946]' : 'text-gray-400'}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-xl font-medium text-white mb-2">
            {isDragging ? 'Drop your file here' : 'Drag & drop your blueprint'}
          </p>
          <p className="text-gray-400 mb-4">
            or <span className="text-[#E63946]">click to browse</span>
          </p>
          <p className="text-gray-500 text-sm">
            PDF, PNG, JPEG, TIFF • Max {MAX_FILE_SIZE_MB}MB
          </p>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-0 bottom-4 text-center">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}


function BlueprintViewer({ result, onReset, token }) {
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [dimensions, setDimensions] = useState(result.dimensions || []);
  const [isAddingBalloon, setIsAddingBalloon] = useState(false);
  const [newBalloonValue, setNewBalloonValue] = useState('');
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  
  const handleExport = async (format = 'xlsx') => {
    setIsExporting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({
          format,
          template: 'AS9102_FORM3',
          dimensions: dimensions.map(d => ({
            id: d.id,
            value: d.value,
            zone: d.zone,
          })),
          filename: result.metadata?.filename || 'inspection',
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${result.metadata?.filename || 'inspection'}_FAI.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadImage = async () => {
    setIsDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = imageRef.current;
      
      if (!img) return;
      
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      
      // Draw balloons with leader lines
      dimensions.forEach(dim => {
        const centerX = ((dim.bounding_box.xmin + dim.bounding_box.xmax) / 2 / 1000) * canvas.width;
        const centerY = ((dim.bounding_box.ymin + dim.bounding_box.ymax) / 2 / 1000) * canvas.height;
        
        // Offset balloon (30px right, 25px up)
        const balloonX = centerX + 30;
        const balloonY = centerY - 25;
        const radius = 16;
        
        // Leader line
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(balloonX, balloonY);
        ctx.strokeStyle = '#E63946';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Small dot at dimension
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#E63946';
        ctx.fill();
        
        // Balloon circle
        ctx.beginPath();
        ctx.arc(balloonX, balloonY, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#E63946';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Balloon number
        ctx.fillStyle = '#E63946';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dim.id.toString(), balloonX, balloonY);
      });
      
      canvas.toBlob((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${result.metadata?.filename || 'blueprint'}_ballooned.png`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }, 'image/png');
      
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteDimension = (id) => {
    setDimensions(prev => prev.filter(d => d.id !== id));
  };

  // Add new balloon on click
  const handleImageClick = (e) => {
    if (!isAddingBalloon || !newBalloonValue.trim()) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;
    
    // Calculate zone based on position
    const colIndex = Math.floor(x / 125);
    const rowIndex = Math.floor(y / 250);
    const columns = ["H", "G", "F", "E", "D", "C", "B", "A"];
    const rows = ["4", "3", "2", "1"];
    const zone = `${columns[Math.min(colIndex, 7)]}${rows[Math.min(rowIndex, 3)]}`;
    
    const newId = Math.max(...dimensions.map(d => d.id), 0) + 1;
    
    const newDimension = {
      id: newId,
      value: newBalloonValue.trim(),
      zone: zone,
      bounding_box: {
        xmin: x - 20,
        xmax: x + 20,
        ymin: y - 10,
        ymax: y + 10
      }
    };
    
    setDimensions(prev => [...prev, newDimension]);
    setNewBalloonValue('');
    setIsAddingBalloon(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
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
          
          <div className="text-sm">
            <span className="text-gray-400">Detected: </span>
            <span className="text-white font-medium">{dimensions.length} dimensions</span>
          </div>
          
          {result.grid?.detected && (
            <>
              <div className="h-6 w-px bg-[#2a2a2a]" />
              <div className="text-sm">
                <span className="text-gray-400">Grid: </span>
                <span className="text-white font-medium">
                  {result.grid.columns?.length}×{result.grid.rows?.length}
                </span>
              </div>
            </>
          )}
          
          {result.metadata?.processing_time_ms && (
            <>
              <div className="h-6 w-px bg-[#2a2a2a]" />
              <div className="text-sm">
                <span className="text-gray-400">Time: </span>
                <span className="text-white font-medium">
                  {(result.metadata.processing_time_ms / 1000).toFixed(1)}s
                </span>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {/* Add Balloon */}
          {isAddingBalloon ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newBalloonValue}
                onChange={(e) => setNewBalloonValue(e.target.value)}
                placeholder="Enter value..."
                className="px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-white text-sm w-32"
                autoFocus
              />
              <span className="text-gray-400 text-xs">Click on image to place</span>
              <button
                onClick={() => setIsAddingBalloon(false)}
                className="text-gray-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingBalloon(true)}
              className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 rounded-lg transition-colors text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Balloon
            </button>
          )}
          
          <button
            onClick={handleDownloadImage}
            disabled={isDownloading}
            className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {isDownloading ? 'Saving...' : 'Download Image'}
          </button>
          
          <button
            onClick={() => handleExport('csv')}
            disabled={isExporting}
            className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 rounded-lg transition-colors text-sm disabled:opacity-50"
          >
            Export CSV
          </button>
          
          <button
            onClick={() => handleExport('xlsx')}
            disabled={isExporting}
            className="px-4 py-2 bg-[#E63946] hover:bg-[#c62d39] text-white font-medium rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {isExporting ? 'Exporting...' : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                AS9102 Excel
              </>
            )}
          </button>
        </div>
      </div>

      {/* Blueprint with balloons */}
      <div 
        ref={containerRef}
        className={`relative bg-[#0a0a0a] rounded-xl overflow-hidden ${isAddingBalloon ? 'cursor-crosshair' : ''}`}
        style={{ minHeight: '500px' }}
        onClick={handleImageClick}
      >
        {result.image && (
          <img 
            ref={imageRef}
            src={result.image} 
            alt="Blueprint" 
            className="w-full h-auto"
            crossOrigin="anonymous"
          />
        )}

        {/* SVG for leader lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {dimensions.map((dim) => {
            const centerX = (dim.bounding_box.xmin + dim.bounding_box.xmax) / 2 / 10;
            const centerY = (dim.bounding_box.ymin + dim.bounding_box.ymax) / 2 / 10;
            const balloonX = centerX + 3;
            const balloonY = Math.max(2.5, centerY - 2.5);
            
            return (
              <g key={`line-${dim.id}`}>
                <line
                  x1={`${centerX}%`}
                  y1={`${centerY}%`}
                  x2={`${balloonX}%`}
                  y2={`${balloonY}%`}
                  stroke="#E63946"
                  strokeWidth="2"
                />
                <circle
                  cx={`${centerX}%`}
                  cy={`${centerY}%`}
                  r="4"
                  fill="#E63946"
                />
              </g>
            );
          })}
        </svg>

        {/* Balloon markers */}
        {dimensions.map((dim) => {
          const centerX = (dim.bounding_box.xmin + dim.bounding_box.xmax) / 2 / 10;
          const centerY = (dim.bounding_box.ymin + dim.bounding_box.ymax) / 2 / 10;
          const balloonX = centerX + 3;
          const balloonY = Math.max(2.5, centerY - 2.5);
          
          return (
            <Balloon 
              key={dim.id} 
              dimension={dim}
              left={balloonX}
              top={balloonY}
              onDelete={() => handleDeleteDimension(dim.id)}
            />
          );
        })}
        
        {isAddingBalloon && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
            <span className="bg-[#E63946] text-white px-4 py-2 rounded-lg">
              Click anywhere to place balloon
            </span>
          </div>
        )}
      </div>

      {/* Dimensions table */}
      <div className="bg-[#0a0a0a] rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-[#1a1a1a] border-b border-[#2a2a2a]">
          <h3 className="font-medium text-white">Detected Dimensions</h3>
        </div>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#161616] sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-gray-400 font-medium">#</th>
                <th className="px-4 py-2 text-left text-gray-400 font-medium">Zone</th>
                <th className="px-4 py-2 text-left text-gray-400 font-medium">Value</th>
                <th className="px-4 py-2 text-right text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((dim) => (
                <tr key={dim.id} className="border-b border-[#1a1a1a] hover:bg-[#161616]">
                  <td className="px-4 py-2 text-white">{dim.id}</td>
                  <td className="px-4 py-2 text-gray-300">{dim.zone || '—'}</td>
                  <td className="px-4 py-2 text-white font-mono">{dim.value}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDeleteDimension(dim.id)}
                      className="text-gray-500 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {dimensions.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-500">
              No dimensions detected. Click "Add Balloon" to add manually.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function Balloon({ dimension, left, top, onDelete }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer"
      style={{ left: `${left}%`, top: `${top}%` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`
        w-8 h-8 rounded-full flex items-center justify-center
        font-bold text-sm transition-all duration-200 shadow-lg
        ${isHovered 
          ? 'bg-[#E63946] text-white scale-110' 
          : 'bg-white text-[#E63946] border-2 border-[#E63946]'
        }
      `}>
        {dimension.id}
      </div>

      {isHovered && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 whitespace-nowrap z-10 shadow-xl">
          <div className="text-white font-mono text-sm">{dimension.value}</div>
          {dimension.zone && (
            <div className="text-gray-400 text-xs">Zone: {dimension.zone}</div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-red-500 text-xs hover:underline mt-1"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
LEMONSQUEEZY_API_KEY=your_api_key
LEMONSQUEEZY_STORE_ID=your_store_id
LEMONSQUEEZY_VARIANT_ID=your_variant_id
LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret
