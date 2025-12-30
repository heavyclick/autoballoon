import React, { useState, useRef, useEffect } from 'react';
import { API_BASE_URL } from '../constants/config';
import { DraggableBalloon } from './DraggableBalloon'; // Extracted small component

export function BlueprintViewer({ 
  imageSrc, 
  dimensions, 
  selectedDimId, 
  onSelect, 
  onUpdate, 
  onDelete, 
  isPro,
  onShowPaywall
}) {
  const containerRef = useRef(null);
  const [drawing, setDrawing] = useState(null); // { startX, startY, currentX, currentY }

  // ============ ADD BALLOON LOGIC (Hybrid Detection) ============
  const handleMouseUp = async () => {
    if (!drawing) return;
    
    // 1. Calculate Crop Region
    const rect = containerRef.current.getBoundingClientRect();
    const minX = Math.min(drawing.startX, drawing.currentX);
    const maxX = Math.max(drawing.startX, drawing.currentX);
    const minY = Math.min(drawing.startY, drawing.currentY);
    const maxY = Math.max(drawing.startY, drawing.currentY);
    
    // Ignore small accidental clicks
    if ((maxX - minX) < 1 || (maxY - minY) < 1) {
        setDrawing(null);
        return;
    }

    // 2. Call Backend Detection (Hybrid: Vector Check -> OCR)
    // Note: We use the new '/detect-region' endpoint you set up
    try {
        const cropPayload = {
            image: imageSrc.split(',')[1], // Base64
            region: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } // Percentage
        };
        
        const res = await fetch(`${API_BASE_URL}/detect-region`, {
             method: 'POST',
             body: JSON.stringify(cropPayload),
             headers: {'Content-Type': 'application/json'}
        });
        const data = await res.json();
        
        // 3. Create New Dimension
        const newDim = {
            id: Math.max(0, ...dimensions.map(d => d.id)) + 1,
            value: data.detected_text || "", 
            method: "Visual",
            confidence: data.confidence || 0.0,
            bounding_box: { xmin: minX * 10, xmax: maxX * 10, ymin: minY * 10, ymax: maxY * 10 },
            anchorX: (minX + maxX) / 2,
            anchorY: (minY + maxY) / 2,
            balloonX: (minX + maxX) / 2 + 2,
            balloonY: (minY + maxY) / 2 - 2
        };
        
        onUpdate(newDim); // Add to parent state
        
    } catch (e) {
        console.error("Detection failed", e);
    } finally {
        setDrawing(null);
    }
  };

  return (
    <div 
        ref={containerRef}
        className="relative w-full h-full select-none cursor-crosshair"
        onMouseDown={(e) => {
            const rect = containerRef.current.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            setDrawing({ startX: x, startY: y, currentX: x, currentY: y });
        }}
        onMouseMove={(e) => {
            if (!drawing) return;
            const rect = containerRef.current.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            setDrawing(prev => ({ ...prev, currentX: x, currentY: y }));
        }}
        onMouseUp={handleMouseUp}
    >
        <img src={imageSrc} className="w-full pointer-events-none" alt="Blueprint" />
        
        {/* Render Balloons */}
        {dimensions.map(dim => (
            <DraggableBalloon 
                key={dim.id}
                dimension={dim}
                isSelected={dim.id === selectedDimId}
                onClick={() => onSelect(dim.id)}
                onDrag={(dx, dy) => onUpdate({...dim, balloonX: dim.balloonX + dx, balloonY: dim.balloonY + dy})}
            />
        ))}

        {/* Selection Box */}
        {drawing && (
            <div className="absolute border-2 border-[#E63946] bg-[#E63946]/20" style={{
                left: `${Math.min(drawing.startX, drawing.currentX)}%`,
                top: `${Math.min(drawing.startY, drawing.currentY)}%`,
                width: `${Math.abs(drawing.currentX - drawing.startX)}%`,
                height: `${Math.abs(drawing.currentY - drawing.startY)}%`
            }} />
        )}
    </div>
  );
}
