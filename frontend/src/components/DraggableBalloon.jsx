import React, { useState, useRef } from 'react';

export function DraggableBalloon({ 
  dimension, 
  left, 
  top, 
  onDelete, 
  onDrag, 
  cmmResult, 
  containerRef, 
  disabled = false, 
  isSelected, 
  onClick 
}) {
  // Use passed left/top or fallback to dimension properties
  const x = left ?? dimension.balloonX;
  const y = top ?? dimension.balloonY;

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
      if (!containerRef?.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      // Calculate delta as percentage of container size
      const deltaX = ((e.clientX - startPos.current.x) / rect.width) * 100;
      const deltaY = ((e.clientY - startPos.current.y) / rect.height) * 100;
      
      startPos.current = { x: e.clientX, y: e.clientY };
      
      if (onDrag) {
        onDrag(deltaX, deltaY);
      }
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
      style={{ 
        left: `${x}%`, 
        top: `${y}%`, 
        zIndex: isHovered || isDragging || isSelected ? 100 : 10 
      }}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={handleMouseDown}
    >
      {/* Balloon Circle */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all shadow-lg select-none ${
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
          className="absolute left-full top-1/2 -translate-y-1/2 flex items-center z-50"
          style={{ paddingLeft: '8px' }}
        >
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 whitespace-nowrap shadow-xl min-w-[120px]">
            <div className="text-white font-mono text-sm mb-1">{dimension.value}</div>
            {dimension.zone && <div className="text-gray-400 text-xs">Zone: {dimension.zone}</div>}
            <div className="text-gray-500 text-[10px] mt-1 italic">Method: {dimension.method}</div>
            
            {cmmResult?.actual && (
                <div className="text-blue-400 text-xs mt-1">Actual: {cmmResult.actual}</div>
            )}
            
            {onDelete && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(dimension.id); }} 
                  className="text-red-500 text-xs hover:text-red-400 hover:underline mt-2 block"
                >
                  Delete
                </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
