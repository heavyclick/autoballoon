/**
 * BlueprintViewer.jsx
 * Main blueprint editor with canvas, balloons, and editing tools
 * Extracted from DropZone.jsx for better code organization
 */

import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { API_BASE_URL } from '../constants/config';
import { TableManager } from './TableManager';
import { PropertiesPanel } from './PropertiesPanel';
import { CMMImport } from './CMMImport';
import { PreviewWatermark } from './PreviewWatermark';
import { DraggableBalloon } from './DraggableBalloon';
import { PageNavigator } from './PageNavigator';
import { DownloadMenu } from './DownloadMenu';
import { downloadBlob } from '../utils/downloadHelpers';

export function BlueprintViewer({ result, onReset, token, isPro, onShowGlassWall, currentPage, setCurrentPage, totalPages }) {
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
    // FIXED: Use max_limit/min_limit (what backend sends) instead of upper_limit/lower_limit
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
        upper_tol: 0,  // FIXED: Use upper_tol (what backend sends)
        lower_tol: 0,  // FIXED: Use lower_tol (what backend sends)
        max_limit: 0,  // FIXED: Use max_limit (what backend sends)
        min_limit: 0,  // FIXED: Use min_limit (what backend sends)
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
    // FIXED: Use max_limit/min_limit
    const totalTol = Math.abs((dim.parsed.max_limit || 0) - (dim.parsed.min_limit || 0));
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

    // FIXED: Use max_limit/min_limit instead of upper_limit/lower_limit
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
        upper_tol: 0,      // FIXED
        lower_tol: 0,      // FIXED
        max_limit: 0,      // FIXED
        min_limit: 0,      // FIXED
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

  // Download handlers
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

      {/* Main Layout - FULL WIDTH Canvas (Left) + Sidebar (Right) */}
      <div className="flex-1 flex overflow-hidden">

        {/* Canvas Container - BIG and FULL WIDTH */}
        <div className="flex-1 overflow-auto bg-[#0a0a0a] relative flex items-center justify-center p-8">
          <div
            ref={containerRef}
            className={`relative inline-block select-none shadow-2xl ${drawMode ? 'cursor-crosshair' : ''}`}
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
            style={{ width: 'fit-content', height: 'fit-content' }}
          >
            {currentImage && (
              <img
                ref={imageRef}
                src={currentImage}
                alt={`Blueprint Page ${currentPage}`}
                className="block max-w-full h-auto pointer-events-none"
                crossOrigin="anonymous"
                style={{ maxHeight: 'calc(100vh - 400px)' }}
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

        {/* Properties Panel (Right Sidebar - Fixed Width) */}
        <div className="w-96 border-l border-[#2a2a2a] bg-[#161616] overflow-y-auto flex-shrink-0 z-20">
          <PropertiesPanel
            selectedDimension={dimensions.find(d => d.id === selectedDimId)}
            onUpdate={handleUpdateDimension}
          />
        </div>
      </div>

      {/* Table Manager (Bottom Panel) */}
      <div className="h-96 border-t-2 border-[#2a2a2a] z-30 bg-[#0a0a0a]">
        <TableManager
          dimensions={dimensions}
          bomItems={bomItems}
          specItems={specItems}
          selectedId={selectedDimId}
          onSelect={setSelectedDimId}
          onUpdate={handleUpdateDimension}
          onUpdateBOM={handleUpdateBOM}
          onUpdateSpec={handleUpdateSpec}
          cmmResults={cmmResults}
        />
      </div>
    </div>
  );
}
