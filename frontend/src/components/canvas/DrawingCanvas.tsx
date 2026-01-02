'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

/**
 * DrawingCanvas - The Core Rendering Engine
 *
 * Features:
 * - Infinite zoom/pan (mouse wheel + drag)
 * - Multi-layer rendering (drawing base + balloons + watermark)
 * - Continuous vertical scroll for multi-page PDFs
 * - Click-to-select balloons
 * - Manual balloon addition (draw box mode)
 */
export function DrawingCanvas() {
  const pages = useAppStore((state) => state.project.pages);
  const characteristics = useAppStore((state) => state.project.characteristics);
  const activeCharacteristicId = useAppStore((state) => state.activeCharacteristicId);
  const selectedTool = useAppStore((state) => state.selectedTool);
  const showWatermark = useAppStore((state) => state.canvas.showWatermark);
  const setActiveCharacteristic = useAppStore((state) => state.setActiveCharacteristic);

  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Handle mouse events for balloon drawing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (selectedTool === 'balloon') {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          setDrawStart({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
          setDrawCurrent({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
        }
      }
    },
    [selectedTool]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (selectedTool === 'balloon' && drawStart) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          setDrawCurrent({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
        }
      }
    },
    [selectedTool, drawStart]
  );

  const handleMouseUp = useCallback(async () => {
    if (selectedTool === 'balloon' && drawStart && drawCurrent) {
      // Calculate bounding box
      const xmin = Math.min(drawStart.x, drawCurrent.x);
      const ymin = Math.min(drawStart.y, drawCurrent.y);
      const xmax = Math.max(drawStart.x, drawCurrent.x);
      const ymax = Math.max(drawStart.y, drawCurrent.y);

      // Ignore tiny clicks
      if (xmax - xmin < 10 || ymax - ymin < 10) {
        setDrawStart(null);
        setDrawCurrent(null);
        return;
      }

      // Trigger local crop OCR
      await handleManualBalloonAdd({ xmin, ymin, xmax, ymax });

      setDrawStart(null);
      setDrawCurrent(null);
    }
  }, [selectedTool, drawStart, drawCurrent]);

  const handleManualBalloonAdd = async (box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  }) => {
    // This will be implemented in Phase 7
    console.log('Manual balloon add:', box);
  };

  if (pages.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-brand-gray-600">
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-brand-gray-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p>No drawing loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={canvasRef}
      className={`w-full h-full bg-[#050505] overflow-hidden relative ${
        selectedTool === 'balloon' ? 'cursor-crosshair' : ''
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <TransformWrapper
        initialScale={1}
        minScale={0.2}
        maxScale={5}
        wheel={{ step: 0.1 }}
        panning={{ disabled: selectedTool === 'balloon' }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              wrapperClass="w-full h-full"
              contentClass="w-full h-full flex flex-col items-center"
            >
              <div className="relative space-y-8 py-8">
                {/* Render all pages vertically */}
                {pages.map((page) => (
                  <div key={page.pageNumber} className="relative">
                    {/* Base Drawing Image */}
                    <img
                      src={page.image}
                      alt={`Page ${page.pageNumber}`}
                      className="max-w-none shadow-2xl select-none"
                      draggable={false}
                    />

                    {/* Balloon Overlays */}
                    {characteristics
                      .filter((char) => char.page === page.pageNumber)
                      .map((char) => {
                        const isSelected = char.id === activeCharacteristicId;
                        const isLowConfidence = char.confidence < 0.8;

                        return (
                          <div
                            key={char.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveCharacteristic(char.id);
                            }}
                            style={{
                              position: 'absolute',
                              left: `${(char.bounding_box.xmin / 1000) * page.width}px`,
                              top: `${(char.bounding_box.ymin / 1000) * page.height}px`,
                              width: `${
                                ((char.bounding_box.xmax - char.bounding_box.xmin) /
                                  1000) *
                                page.width
                              }px`,
                              height: `${
                                ((char.bounding_box.ymax - char.bounding_box.ymin) /
                                  1000) *
                                page.height
                              }px`,
                            }}
                            className={`
                              border-2 rounded-sm cursor-pointer transition-all
                              ${
                                isSelected
                                  ? 'border-blue-500 bg-blue-500/20 z-20'
                                  : isLowConfidence
                                  ? 'border-amber-500/70 bg-amber-500/10 z-10'
                                  : 'border-red-500/50 hover:border-red-500 hover:bg-red-500/10 z-10'
                              }
                              ${isLowConfidence ? 'animate-pulse' : ''}
                            `}
                          >
                            {/* Balloon ID Badge */}
                            <div
                              className={`
                                absolute -top-3 -right-3 w-6 h-6 rounded-full
                                flex items-center justify-center text-[10px] font-bold
                                shadow-sm transition-transform
                                ${
                                  isSelected
                                    ? 'bg-blue-600 text-white scale-110'
                                    : isLowConfidence
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-red-500 text-white'
                                }
                              `}
                            >
                              {char.id}
                            </div>
                          </div>
                        );
                      })}

                    {/* Watermark (if not Pro) */}
                    {showWatermark && (
                      <div className="absolute inset-0 pointer-events-none">
                        <svg
                          width="100%"
                          height="100%"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <defs>
                            <pattern
                              id="watermark"
                              x="0"
                              y="0"
                              width="400"
                              height="400"
                              patternUnits="userSpaceOnUse"
                            >
                              <text
                                x="50"
                                y="200"
                                fill="rgba(230, 57, 70, 0.15)"
                                fontSize="32"
                                fontWeight="bold"
                                transform="rotate(-45 200 200)"
                              >
                                PREVIEW MODE
                              </text>
                            </pattern>
                          </defs>
                          <rect width="100%" height="100%" fill="url(#watermark)" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}

                {/* Drawing Box (Manual Balloon Add) */}
                {drawStart && drawCurrent && (
                  <div
                    className="absolute border-2 border-purple-500 bg-purple-500/20 pointer-events-none z-50"
                    style={{
                      left: Math.min(drawStart.x, drawCurrent.x),
                      top: Math.min(drawStart.y, drawCurrent.y),
                      width: Math.abs(drawCurrent.x - drawStart.x),
                      height: Math.abs(drawCurrent.y - drawStart.y),
                    }}
                  />
                )}
              </div>
            </TransformComponent>

            {/* Zoom Controls */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-2 bg-brand-gray-900 border border-brand-gray-800 rounded-lg p-2">
              <button
                onClick={() => zoomIn()}
                className="w-10 h-10 flex items-center justify-center hover:bg-brand-gray-800 rounded transition-colors text-white"
                title="Zoom In"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
              <button
                onClick={() => resetTransform()}
                className="w-10 h-10 flex items-center justify-center hover:bg-brand-gray-800 rounded transition-colors text-brand-gray-400 text-xs font-mono"
                title="Reset View"
              >
                1:1
              </button>
              <button
                onClick={() => zoomOut()}
                className="w-10 h-10 flex items-center justify-center hover:bg-brand-gray-800 rounded transition-colors text-white"
                title="Zoom Out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 12H4"
                  />
                </svg>
              </button>
            </div>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
