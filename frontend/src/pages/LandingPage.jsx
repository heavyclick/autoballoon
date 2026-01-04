/**
 * LandingPage.jsx (Main Editor Controller)
 * * Functions:
 * 1. Marketing / Upload State: Shows standard landing page.
 * 2. Editor State: Activates after file upload.
 * - Integrates PropertiesPanel (Left)
 * - Integrates TableManager (Bottom)
 * - Implements "Smart Balloon" Drawing Logic (Canvas Overlay)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navbar } from '../components/Navbar';
import { HowItWorks } from '../components/HowItWorks';
import { PricingCard } from '../components/PricingCard';
import { FAQ } from '../components/FAQ';
import { Footer } from '../components/Footer';
import { DropZone } from '../components/DropZone';
import { PromoRedemption, usePromoCode } from '../components/PromoRedemption';
import { API_BASE_URL } from '../constants/config';

// Import New Editor Components
import { TableManager } from '../components/TableManager';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { ProjectTabs } from '../components/ProjectTabs';

export function LandingPage() {
  const { isPro } = useAuth();
  const { promoCode, clearPromo } = usePromoCode();
  const [hasAccess, setHasAccess] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  // ==========================================
  // EDITOR STATE
  // ==========================================
  const [editorData, setEditorData] = useState(null); // { dimensions, pages, file, metadata }
  const [currentFile, setCurrentFile] = useState(null); // The raw File object for Smart Extract
  const [activeTab, setActiveTab] = useState('characteristics');
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState('select'); // 'select' | 'balloon' | 'pan'
  
  // Canvas / Viewport State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Smart Balloon Drawing State
  const [drawStart, setDrawStart] = useState(null); // {x, y} relative to image
  const [drawCurrent, setDrawCurrent] = useState(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  // ==========================================
  // INITIALIZATION & ACCESS CHECK
  // ==========================================
  useEffect(() => {
    const checkExistingAccess = async () => {
      const email = localStorage.getItem('autoballoon_user_email');
      if (email) {
        setUserEmail(email);
        try {
          const response = await fetch(`${API_BASE_URL}/access/check?email=${encodeURIComponent(email)}`);
          const data = await response.json();
          if (data.has_access) {
            setHasAccess(true);
          } else {
            // Access expired or invalid - clear localStorage
            localStorage.removeItem('autoballoon_user_email');
            setHasAccess(false);
            setUserEmail('');
          }
        } catch (err) {
          console.error('Access check error:', err);
        }
      }
    };
    checkExistingAccess();
  }, []);

  // ==========================================
  // PERIODIC ACCESS REVALIDATION (5 minutes)
  // ==========================================
  useEffect(() => {
    const email = localStorage.getItem('autoballoon_user_email');
    if (!email || !hasAccess) return;

    const checkAccess = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/access/check?email=${encodeURIComponent(email)}`);
        const data = await response.json();

        if (!data.has_access) {
          // Access expired - clear localStorage and reset state
          localStorage.removeItem('autoballoon_user_email');
          setHasAccess(false);
          setUserEmail('');

          // Show expiry notification
          alert('Your promotional access has expired. Please purchase a plan to continue using AutoBalloon Pro features.');

          // Refresh page to reset state
          window.location.reload();
        }
      } catch (err) {
        console.error('Periodic access check error:', err);
      }
    };

    // Check every 5 minutes (300,000 ms)
    const intervalId = setInterval(checkAccess, 5 * 60 * 1000);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [hasAccess]);

  const handlePromoSuccess = (email) => {
    setUserEmail(email);
    setHasAccess(true);
    clearPromo();
  };

  // Callback from DropZone when processing finishes
  const handleAnalysisComplete = (data, file) => {
    // Ensure dimensions list exists
    const dims = data.dimensions || [];
    setEditorData({ ...data, dimensions: dims });
    setCurrentFile(file);
    // Reset View
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // ==========================================
  // SMART BALLOON LOGIC (The Core Requirement)
  // ==========================================
  const handleMouseDown = (e) => {
    if (!editorData || !imageRef.current) return;

    if (tool === 'balloon') {
      // Start Drawing Box
      const rect = imageRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;
      setDrawStart({ x, y });
      setDrawCurrent({ x, y });
    } else if (tool === 'pan') {
      // Start Panning
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (tool === 'balloon' && drawStart) {
      // Update Drawing Box
      const rect = imageRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;
      setDrawCurrent({ x, y });
    } else if (tool === 'pan' && isDragging) {
      // Update Pan
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = async () => {
    if (tool === 'balloon' && drawStart && drawCurrent) {
      // 1. Calculate Normalized Coordinates (0-1000)
      const imgW = imageRef.current.naturalWidth || 1000;
      const imgH = imageRef.current.naturalHeight || 1000;

      const x1 = Math.min(drawStart.x, drawCurrent.x);
      const y1 = Math.min(drawStart.y, drawCurrent.y);
      const x2 = Math.max(drawStart.x, drawCurrent.x);
      const y2 = Math.max(drawStart.y, drawCurrent.y);

      // Clamp coordinates
      const xmin = Math.max(0, Math.min(1000, (x1 / imgW) * 1000));
      const ymin = Math.max(0, Math.min(1000, (y1 / imgH) * 1000));
      const xmax = Math.max(0, Math.min(1000, (x2 / imgW) * 1000));
      const ymax = Math.max(0, Math.min(1000, (y2 / imgH) * 1000));

      // Reset Draw State immediately to clear UI
      setDrawStart(null);
      setDrawCurrent(null);

      // 2. Call Backend "Smart Extract"
      if ((xmax - xmin) < 10 || (ymax - ymin) < 10) return; // Ignore tiny clicks

      try {
        const formData = new FormData();
        formData.append('file', currentFile);
        formData.append('xmin', xmin);
        formData.append('xmax', xmax);
        formData.append('ymin', ymin);
        formData.append('ymax', ymax);

        // Show temp loader or optimistic update here if desired
        
        const res = await fetch(`${API_BASE_URL}/detect-region`, {
          method: 'POST',
          body: formData
        });

        if (!res.ok) throw new Error('Failed to detect region');

        const result = await res.json();
        
        if (result.success) {
           // 3. Add New Balloon to State
           const newId = Math.max(...editorData.dimensions.map(d => d.id), 0) + 1;
           
           const newDimension = {
             id: newId,
             value: result.parsed?.nominal?.toString() || result.text,
             zone: "Manual", // Could calculate grid here
             confidence: 1.0,
             page: 1, // Currently supporting single page editing for new tool
             bounding_box: { xmin, ymin, xmax, ymax },
             parsed: result.parsed // Contains the magic engineering logic (Fits, Tolerances)
           };

           setEditorData(prev => ({
             ...prev,
             dimensions: [...prev.dimensions, newDimension]
           }));
           setSelectedId(newId);
           setTool('select'); // Switch back to select mode
        }
      } catch (err) {
        console.error("Smart Balloon Failed", err);
        alert("Failed to extract data from region.");
      }
    }

    // Stop Panning
    setIsDragging(false);
  };

  // ==========================================
  // DATA MANAGEMENT (Updates from Panels)
  // ==========================================
  const handleUpdateDimension = (id, updates) => {
    setEditorData(prev => ({
      ...prev,
      dimensions: prev.dimensions.map(dim => 
        dim.id === id ? { ...dim, ...updates } : dim
      )
    }));
  };

  const getSelectedDimension = () => {
    return editorData?.dimensions?.find(d => d.id === selectedId);
  };

  const handleExport = async (format = 'xlsx') => {
    if (!editorData) return;
    try {
        const res = await fetch(`${API_BASE_URL}/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                format,
                template: 'AS9102_FORM3',
                dimensions: editorData.dimensions,
                metadata: { part_number: "DEMO-PN" }, // Connect to form later
                filename: "AutoBalloon_Export",
                total_pages: editorData.total_pages || 1
            })
        });
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Inspection_Report.${format}`;
        document.body.appendChild(a);
        a.click();
    } catch (e) {
        console.error("Export failed", e);
    }
  };


  // ==========================================
  // RENDER: EDITOR INTERFACE (Full Viewport)
  // ==========================================
  if (editorData) {
    const pageImage = editorData.image || (editorData.pages && editorData.pages[0]?.image);

    return (
      <div className="h-screen flex flex-col bg-[#0d0d0d] text-white overflow-hidden">
        {/* Editor Toolbar */}
        <div className="h-14 bg-[#161616] border-b border-[#2a2a2a] flex items-center justify-between px-4 shrink-0 z-50">
          <div className="flex items-center gap-4">
            <button onClick={() => setEditorData(null)} className="text-gray-400 hover:text-white flex items-center gap-1 text-sm">
              ← Back
            </button>
            <div className="h-6 w-px bg-[#333]"></div>
            <h1 className="font-bold text-sm">Inspection Editor</h1>
          </div>

          <div className="flex items-center gap-2 bg-[#0a0a0a] p-1 rounded-lg border border-[#333]">
             <button 
               onClick={() => setTool('select')}
               className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${tool === 'select' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
             >
               Pointer
             </button>
             <button 
               onClick={() => setTool('pan')}
               className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${tool === 'pan' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
             >
               Hand (Pan)
             </button>
             <button 
               onClick={() => setTool('balloon')}
               className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${tool === 'balloon' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
             >
               <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
               + Smart Balloon
             </button>
          </div>

          <div className="flex items-center gap-3">
             <button onClick={() => handleExport('xlsx')} className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-bold transition-colors">
               Export Excel
             </button>
          </div>
        </div>

        {/* Main Workspace - NO PADDING */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* LEFT: Properties Panel */}
          <div className="w-72 border-r border-[#2a2a2a] bg-[#161616] flex-shrink-0 z-40">
            <PropertiesPanel 
              selectedDimension={getSelectedDimension()} 
              onUpdate={handleUpdateDimension} 
            />
          </div>

          {/* CENTER: Canvas / Image Viewer - FULL VIEWPORT */}
          <div 
            ref={containerRef}
            className={`flex-1 relative bg-[#050505] overflow-hidden ${tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : tool === 'balloon' ? 'cursor-crosshair' : 'cursor-default'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={(e) => {
              if(e.ctrlKey) {
                 e.preventDefault();
                 setZoom(z => Math.max(0.2, Math.min(5, z - e.deltaY * 0.001)));
              }
            }}
          >
            {/* The Scalable/Pannable Content */}
            <div 
              className="absolute inset-0"
              style={{ 
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0'
              }}
            >
              {/* Base Image - FULL SIZE */}
              <img 
                ref={imageRef}
                src={`data:image/png;base64,${pageImage}`} 
                alt="Drawing" 
                className="w-full h-full object-contain pointer-events-none select-none"
                draggable={false}
              />

              {/* 2. Balloon Overlays */}
              {editorData.dimensions.map((dim) => {
                 const isSelected = dim.id === selectedId;
                 // Convert 0-1000 normalized to %
                 const style = {
                   left: `${dim.bounding_box.xmin / 10}%`,
                   top: `${dim.bounding_box.ymin / 10}%`,
                   width: `${(dim.bounding_box.xmax - dim.bounding_box.xmin) / 10}%`,
                   height: `${(dim.bounding_box.ymax - dim.bounding_box.ymin) / 10}%`
                 };
                 
                 return (
                   <div
                     key={dim.id}
                     style={style}
                     onClick={(e) => { e.stopPropagation(); setSelectedId(dim.id); }}
                     className={`
                       absolute border-2 rounded-sm flex items-center justify-center group
                       transition-colors duration-150
                       ${isSelected ? 'border-blue-500 bg-blue-500/20 z-20' : 'border-red-500/50 hover:border-red-500 hover:bg-red-500/10 z-10'}
                     `}
                   >
                     {/* Floating ID Bubble */}
                     <div className={`
                       absolute -top-3 -right-3 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm
                       ${isSelected ? 'bg-blue-600 text-white scale-110' : 'bg-red-500 text-white'}
                     `}>
                       {dim.id}
                     </div>
                   </div>
                 );
              })}

              {/* 3. Drawing Box (Visual Feedback) */}
              {drawStart && drawCurrent && (
                 <div 
                   className="absolute border-2 border-purple-500 bg-purple-500/20 z-50 pointer-events-none"
                   style={{
                     left: Math.min(drawStart.x, drawCurrent.x),
                     top: Math.min(drawStart.y, drawCurrent.y),
                     width: Math.abs(drawCurrent.x - drawStart.x),
                     height: Math.abs(drawCurrent.y - drawStart.y),
                   }}
                 />
              )}
            </div>
            
            {/* Canvas Controls Overlay */}
            <div className="absolute bottom-4 right-4 flex gap-2">
               <button onClick={() => setZoom(z => z + 0.1)} className="bg-[#161616] p-2 rounded border border-[#333] hover:text-blue-500">+</button>
               <span className="bg-[#161616] px-3 py-2 rounded border border-[#333] text-xs font-mono min-w-[60px] text-center">
                 {Math.round(zoom * 100)}%
               </span>
               <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="bg-[#161616] p-2 rounded border border-[#333] hover:text-blue-500">-</button>
            </div>
          </div>
        </div>

        {/* BOTTOM: Table Manager - FULL WIDTH */}
        <div className="h-72 flex-shrink-0 flex flex-col bg-[#161616] border-t border-[#2a2a2a] relative z-50">
           <ProjectTabs activeTab={activeTab} onTabChange={setActiveTab} />
           
           <div className="flex-1 overflow-hidden">
             {activeTab === 'characteristics' && (
               <TableManager 
                 dimensions={editorData.dimensions} 
                 selectedId={selectedId}
                 onSelect={setSelectedId}
                 onUpdate={handleUpdateDimension}
               />
             )}
             {/* Placeholders for BOM/Specs */}
             {activeTab !== 'characteristics' && (
               <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                 {activeTab === 'bom' ? 'Bill of Materials' : 'Specifications'} View Coming Soon
               </div>
             )}
           </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: MARKETING / UPLOAD INTERFACE (Centered Container)
  // ==========================================
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <Navbar />
      
      {promoCode && (
        <PromoRedemption 
          promoCode={promoCode}
          onSuccess={handlePromoSuccess}
          onClose={clearPromo}
        />
      )}
      
      {/* Hero Section - CENTERED */}
      <section className="pt-24 pb-8 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Security Trust Badge */}
          <div className="inline-flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-full px-4 py-2 mb-8">
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-gray-400 text-sm">Zero-Storage Security • ITAR/EAR Compliant</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Stop Manually Ballooning
            <br />
            <span className="text-[#E63946]">PDF Drawings</span>
          </h1>

          <p className="text-xl text-gray-400 mb-4 max-w-2xl mx-auto">
            Get your AS9102 Excel Report in <span className="text-white font-semibold">10 seconds</span>.
            <br />
            AI-powered dimension detection for First Article Inspection.
          </p>

          <p className="text-sm text-green-500/80 mb-8 flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Your drawings never touch our servers. Processed in memory, deleted immediately.
          </p>

          {hasAccess && (
            <div className="inline-flex items-center gap-2 text-sm mb-8 bg-green-500/10 border border-green-500/30 px-4 py-2 rounded-full">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-400">Free access activated for {userEmail}</span>
            </div>
          )}

          {isPro && (
            <div className="inline-flex items-center gap-2 text-sm mb-8">
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold px-2 py-0.5 rounded text-xs">PRO</span>
              <span className="text-gray-400">Unlimited processing enabled</span>
            </div>
          )}
        </div>
      </section>

      {/* Interactive DropZone - FULL SCREEN */}
      <section>
        <DropZone
           hasPromoAccess={hasAccess}
           userEmail={userEmail}
           onAnalysisComplete={handleAnalysisComplete}
        />
      </section>

      {/* SECURITY SECTION - CENTERED */}
      <section className="py-20 px-4 bg-gradient-to-b from-[#0a0a0a] to-[#0d0d0d]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">🔒 Military-Grade Privacy</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Built for aerospace, defense, and medical device manufacturers who can't risk their IP.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {[
              {
                icon: '🛡️',
                title: 'Zero Storage Architecture',
                description: 'Files are processed entirely in RAM and immediately deleted. No disk writes, no database storage, no cloud copies.'
              },
              {
                icon: '💾',
                title: 'Local History Only',
                description: 'Your processing history stays in your browser\'s localStorage. We have no access to it. Clear it anytime.'
              },
              {
                icon: '✅',
                title: 'Compliance Ready',
                description: 'ITAR, EAR, NIST 800-171, ISO 27001, GDPR compliant by design. We can\'t leak what we don\'t store.'
              },
            ].map((item, i) => (
              <div key={i} className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-6 hover:border-green-500/30 transition-colors">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works - CENTERED */}
      <HowItWorks />

      {/* Compliance Section - CENTERED */}
      <section className="py-20 px-4 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">Built for Compliance</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: 'AS9102 Form 3', description: 'Export directly to FAI Form 3 format.', icon: '📋' },
              { title: 'ISO 13485 Ready', description: 'Medical device quality documentation.', icon: '🏥' },
              { title: 'ITAR/EAR Compliant', description: 'Zero-storage architecture.', icon: '🔒' },
            ].map((item, i) => (
              <div key={i} className="bg-[#161616] border border-[#2a2a2a] rounded-xl p-6 text-center">
                <div className="text-4xl mb-4">{item.icon}</div>
                <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing - CENTERED */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
          <p className="text-gray-400 mb-12">No per-drawing fees. No hidden costs. No data storage.</p>
          <PricingCard />
        </div>
      </section>

      <FAQ />
      <Footer />
    </div>
  );
}
