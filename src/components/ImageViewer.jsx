import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Expand, Minimize2, Minus, Plus, RefreshCcw } from 'lucide-react';
import OpenSeadragon from 'openseadragon';

const VIEW_MODE_CHECKING = 'checking';
const VIEW_MODE_SINGLE = 'single';
const VIEW_MODE_TILED = 'tiled';
const MIN_ZOOM = 0.01;
const MAX_ZOOM = 6;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const buildTileUrl = (manifestUrl, manifest, level, x, y) => {
  const url = new URL(manifestUrl, window.location.href);
  url.pathname = `${url.pathname.replace(/\/manifest\/?$/i, '')}/${level}/${x}_${y}.${manifest.format}`;
  if (manifest.version) url.searchParams.set('v', manifest.version);
  return url.toString();
};

const isTiledManifest = (value) => Boolean(
  value?.tiled
  && Number.isFinite(Number(value.width))
  && Number(value.width) > 0
  && Number.isFinite(Number(value.height))
  && Number(value.height) > 0
  && Number.isFinite(Number(value.tileSize))
  && Number(value.tileSize) > 0
  && Number.isFinite(Number(value.maxLevel))
  && String(value.format || '').trim()
);

const ImageViewer = ({
  src,
  alt,
  maxHeight = '72vh',
  allowFullscreen = true,
  fitScaleMultiplier = 1,
  tileManifestUrl = '',
}) => {
  const rootRef = useRef(null);
  const singleContainerRef = useRef(null);
  const tileContainerRef = useRef(null);
  const imgRef = useRef(null);
  const tiledViewerRef = useRef(null);
  const [viewMode, setViewMode] = useState(tileManifestUrl ? VIEW_MODE_CHECKING : VIEW_MODE_SINGLE);
  const [tileManifest, setTileManifest] = useState(null);
  const [viewerMessage, setViewerMessage] = useState('');
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

  const fitSingleImageToView = useCallback(() => {
    const container = singleContainerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth || !img.naturalHeight) return;
    const rect = container.getBoundingClientRect();
    const scale = clamp(
      Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight, 1) * fitScaleMultiplier,
      MIN_ZOOM,
      MAX_ZOOM,
    );
    const displayWidth = img.naturalWidth * scale;
    const displayHeight = img.naturalHeight * scale;
    setZoom(scale);
    setOffset({
      x: (rect.width - displayWidth) / 2,
      y: (rect.height - displayHeight) / 2,
    });
  }, [fitScaleMultiplier]);

  const syncTiledZoom = useCallback((viewer = tiledViewerRef.current) => {
    if (!viewer?.viewport) return;
    const viewportZoom = viewer.viewport.getZoom(true);
    const imageZoom = viewer.viewport.viewportToImageZoom(viewportZoom);
    if (Number.isFinite(imageZoom) && imageZoom > 0) setZoom(imageZoom);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setViewerMessage('');
    setTileManifest(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    if (!tileManifestUrl) {
      setViewMode(VIEW_MODE_SINGLE);
      return () => controller.abort();
    }

    setViewMode(VIEW_MODE_CHECKING);
    fetch(tileManifestUrl, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Не удалось подготовить просмотр (${response.status})`);
        return response.json();
      })
      .then((manifest) => {
        if (cancelled) return;
        if (!isTiledManifest(manifest)) {
          setViewMode(VIEW_MODE_SINGLE);
          return;
        }
        setTileManifest(manifest);
        setViewMode(VIEW_MODE_TILED);
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return;
        setViewerMessage('Чёткий режим недоступен — открываем обычное изображение.');
        setViewMode(VIEW_MODE_SINGLE);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [src, tileManifestUrl]);

  useEffect(() => {
    const container = tileContainerRef.current;
    if (viewMode !== VIEW_MODE_TILED || !container || !tileManifest || !tileManifestUrl) return undefined;

    let opened = false;
    const viewer = OpenSeadragon({
      element: container,
      tileSources: {
        width: Number(tileManifest.width),
        height: Number(tileManifest.height),
        tileSize: Number(tileManifest.tileSize),
        tileOverlap: Number(tileManifest.overlap) || 0,
        minLevel: Number(tileManifest.minLevel) || 0,
        maxLevel: Number(tileManifest.maxLevel),
        getTileUrl: (level, x, y) => buildTileUrl(tileManifestUrl, tileManifest, level, x, y),
      },
      showNavigationControl: false,
      showNavigator: false,
      animationTime: 0.25,
      blendTime: 0,
      constrainDuringPan: false,
      visibilityRatio: 0.05,
      minZoomImageRatio: 0.7,
      maxZoomPixelRatio: 2.5,
      immediateRender: true,
      placeholderFillStyle: '#ffffff',
      gestureSettingsMouse: {
        clickToZoom: false,
        dblClickToZoom: true,
        scrollToZoom: true,
        pinchToZoom: true,
        flickEnabled: true,
      },
      gestureSettingsTouch: {
        clickToZoom: false,
        dblClickToZoom: true,
        scrollToZoom: false,
        pinchToZoom: true,
        flickEnabled: true,
      },
    });
    tiledViewerRef.current = viewer;

    const handleOpen = () => {
      opened = true;
      setViewerMessage('');
      syncTiledZoom(viewer);
    };
    const handleZoom = () => syncTiledZoom(viewer);
    const handleOpenFailed = () => {
      setViewerMessage('Не удалось открыть чёткий режим — показываем исходный файл.');
      setViewMode(VIEW_MODE_SINGLE);
    };
    const handleTileFailed = () => {
      if (opened) setViewerMessage('Один из фрагментов не загрузился. Можно повторить или скачать оригинал.');
    };
    viewer.addHandler('open', handleOpen);
    viewer.addHandler('zoom', handleZoom);
    viewer.addHandler('animation', handleZoom);
    viewer.addHandler('open-failed', handleOpenFailed);
    viewer.addHandler('tile-load-failed', handleTileFailed);

    return () => {
      if (tiledViewerRef.current === viewer) tiledViewerRef.current = null;
      viewer.destroy();
    };
  }, [syncTiledZoom, tileManifest, tileManifestUrl, viewMode]);

  useEffect(() => {
    if (viewMode !== VIEW_MODE_SINGLE) return undefined;
    fitSingleImageToView();
    const container = singleContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => fitSingleImageToView());
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitSingleImageToView, src, viewMode]);

  const zoomSingleAt = (nextZoom, clientX, clientY) => {
    const container = singleContainerRef.current;
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
    if (viewMode === VIEW_MODE_TILED) {
      const viewer = tiledViewerRef.current;
      if (!viewer?.viewport) return;
      viewer.viewport.zoomBy(factor);
      viewer.viewport.applyConstraints();
      syncTiledZoom(viewer);
      return;
    }
    const container = singleContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    zoomSingleAt((zoomRef.current || 1) * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const fitToView = () => {
    if (viewMode === VIEW_MODE_TILED) {
      const viewer = tiledViewerRef.current;
      if (!viewer?.viewport) return;
      viewer.viewport.goHome(true);
      syncTiledZoom(viewer);
      return;
    }
    fitSingleImageToView();
  };

  const handleWheel = useCallback((event) => {
    if (viewMode !== VIEW_MODE_SINGLE) return;
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 1.12 : 0.9;
    zoomSingleAt((zoomRef.current || 1) * factor, event.clientX, event.clientY);
  }, [viewMode]);

  const handlePointerDown = (event) => {
    if (viewMode !== VIEW_MODE_SINGLE) return;
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
    setOffset({
      x: panRef.current.originX + event.clientX - panRef.current.startX,
      y: panRef.current.originY + event.clientY - panRef.current.startY,
    });
  };

  const handlePointerUp = (event) => {
    if (!panRef.current.active) return;
    panRef.current.active = false;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (typeof document === 'undefined') return;
      const fullscreen = document.fullscreenElement === rootRef.current;
      setIsFullscreen(fullscreen);
      window.setTimeout(() => {
        const viewer = tiledViewerRef.current;
        if (viewer) {
          viewer.forceResize();
          viewer.viewport.applyConstraints();
          syncTiledZoom(viewer);
        } else {
          fitSingleImageToView();
        }
      }, 80);
    };
    if (typeof document === 'undefined') return undefined;
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [fitSingleImageToView, syncTiledZoom]);

  const toggleFullscreen = async () => {
    if (!allowFullscreen || typeof document === 'undefined') return;
    const root = rootRef.current;
    try {
      if (!document.fullscreenElement && root?.requestFullscreen) {
        await root.requestFullscreen();
      } else if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen is optional and can be rejected by the browser or an embedded web view.
    }
  };

  useEffect(() => {
    const container = singleContainerRef.current;
    if (viewMode !== VIEW_MODE_SINGLE || !container) return undefined;
    const onWheel = (event) => handleWheel(event);
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [handleWheel, viewMode]);

  const isChecking = viewMode === VIEW_MODE_CHECKING;
  const zoomLabel = isChecking ? '…' : `${Math.round((zoom || 1) * 100)}%`;

  return (
    <div
      ref={rootRef}
      data-image-viewer-mode={viewMode}
      className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-white"
      style={{ height: isFullscreen ? '100vh' : maxHeight }}
    >
      {viewMode === VIEW_MODE_TILED && <div ref={tileContainerRef} className="absolute inset-0 bg-white" />}
      {viewMode === VIEW_MODE_SINGLE && (
        <div
          ref={singleContainerRef}
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
            onLoad={() => {
              setViewerMessage('');
              fitSingleImageToView();
            }}
            onError={() => setViewerMessage('Изображение не загрузилось. Скачайте оригинал или повторите попытку.')}
          />
        </div>
      )}
      {isChecking && (
        <div className="absolute inset-0 grid place-items-center bg-white text-sm font-semibold text-gray-500">
          Готовим чёткий просмотр…
        </div>
      )}
      {viewerMessage && !isChecking && (
        <div className="absolute bottom-2 left-2 right-2 z-10 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-semibold text-amber-800 shadow-sm">
          {viewerMessage}
        </div>
      )}
      <div className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/90 px-2 py-1 text-xs font-semibold text-gray-600 shadow-sm">
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.12)}
          disabled={isChecking}
          className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-gray-100 disabled:opacity-50"
          aria-label="Отдалить"
        >
          <Minus size={14} />
        </button>
        <span className="min-w-[46px] text-center">{zoomLabel}</span>
        <button
          type="button"
          onClick={() => zoomBy(1.12)}
          disabled={isChecking}
          className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-gray-100 disabled:opacity-50"
          aria-label="Приблизить"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={fitToView}
          disabled={isChecking}
          className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-gray-100 disabled:opacity-50"
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
