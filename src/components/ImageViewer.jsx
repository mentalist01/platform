import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Expand, Minimize2, Minus, Plus, RefreshCcw } from 'lucide-react';

const ImageViewer = ({ src, alt, maxHeight = '72vh', allowFullscreen = true }) => {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const panRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 6;

  const fitToView = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth || !img.naturalHeight) return;
    const rect = container.getBoundingClientRect();
    const scale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight, 1);
    const displayWidth = img.naturalWidth * scale;
    const displayHeight = img.naturalHeight * scale;
    const nextOffset = {
      x: (rect.width - displayWidth) / 2,
      y: (rect.height - displayHeight) / 2,
    };
    setZoom(scale);
    setOffset(nextOffset);
  }, []);

  useEffect(() => {
    fitToView();
  }, [src, fitToView]);

  const zoomAt = (nextZoom, clientX, clientY) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const currentZoom = zoomRef.current || 1;
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const worldX = (screenX - offsetRef.current.x) / currentZoom;
    const worldY = (screenY - offsetRef.current.y) / currentZoom;
    setZoom(clamped);
    setOffset({
      x: screenX - worldX * clamped,
      y: screenY - worldY * clamped,
    });
  };

  const zoomBy = (factor) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    zoomAt((zoomRef.current || 1) * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 1.12 : 0.9;
    zoomAt((zoomRef.current || 1) * factor, event.clientX, event.clientY);
  }, []);

  const handlePointerDown = (event) => {
    event.preventDefault();
    setIsPanning(true);
    panRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!panRef.current.active) return;
    const dx = event.clientX - panRef.current.startX;
    const dy = event.clientY - panRef.current.startY;
    setOffset({
      x: panRef.current.originX + dx,
      y: panRef.current.originY + dy,
    });
  };

  const handlePointerUp = (event) => {
    if (!panRef.current.active) return;
    panRef.current.active = false;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (typeof document === 'undefined') return;
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    if (typeof document === 'undefined') return undefined;
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const timer = setTimeout(() => {
      fitToView();
    }, 80);
    return () => clearTimeout(timer);
  }, [isFullscreen, fitToView]);

  const toggleFullscreen = async () => {
    if (!allowFullscreen || typeof document === 'undefined') return;
    const root = containerRef.current;
    try {
      if (!document.fullscreenElement && root?.requestFullscreen) {
        await root.requestFullscreen();
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {}
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const onWheel = (event) => handleWheel(event);
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [handleWheel]);

  return (
    <div
      className="relative w-full rounded-xl border border-gray-200 bg-white overflow-hidden"
      style={{ height: isFullscreen ? '100vh' : maxHeight }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none', cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt || 'Изображение'}
          className="absolute left-0 top-0 select-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'top left',
          }}
          loading="lazy"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onLoad={fitToView}
        />
      </div>
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/90 px-2 py-1 text-xs font-semibold text-gray-600 shadow-sm">
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.12)}
          className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-gray-100"
          aria-label="Отдалить"
        >
          <Minus size={14} />
        </button>
        <span className="min-w-[46px] text-center">{`${Math.round((zoom || 1) * 100)}%`}</span>
        <button
          type="button"
          onClick={() => zoomBy(1.12)}
          className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-gray-100"
          aria-label="Приблизить"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={fitToView}
          className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-gray-100"
          aria-label="По размеру"
          title="По размеру"
        >
          <RefreshCcw size={14} />
        </button>
        {allowFullscreen && (
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-gray-100"
            aria-label={isFullscreen ? 'Обычный экран' : 'Полный экран'}
            title={isFullscreen ? 'Обычный экран' : 'Полный экран'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Expand size={14} />}
          </button>
        )}
      </div>
    </div>
  );
};

export default ImageViewer;
