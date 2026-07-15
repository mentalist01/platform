import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_CANVAS_WIDTH = 800;
const DEFAULT_CANVAS_HEIGHT = 600;
const CANVAS_PADDING_PX = 18;
const MAX_DEVICE_PIXEL_RATIO = 3;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_FACTOR = 1.25;

const clampZoom = (value) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

const toFiniteNumber = (value, fallback = null) => {
  if (value === null || typeof value === 'undefined' || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizePoint = (point) => {
  if (Array.isArray(point)) {
    const x = toFiniteNumber(point[0]);
    const y = toFiniteNumber(point[1]);
    return x === null || y === null ? null : { x, y };
  }
  if (!point || typeof point !== 'object') return null;
  const x = toFiniteNumber(point.x);
  const y = toFiniteNumber(point.y);
  return x === null || y === null ? null : { x, y };
};

const normalizePoints = (points) => {
  if (!Array.isArray(points)) return [];
  if (points.length > 0 && !Array.isArray(points[0]) && typeof points[0] !== 'object') {
    const normalized = [];
    for (let index = 0; index + 1 < points.length; index += 2) {
      const point = normalizePoint([points[index], points[index + 1]]);
      if (point) normalized.push(point);
    }
    return normalized;
  }
  return points.map(normalizePoint).filter(Boolean);
};

const normalizeColor = (value, fallback) => {
  if (Array.isArray(value) && value.length >= 3) {
    const channels = value.slice(0, 4).map((channel) => toFiniteNumber(channel, 0));
    const usesUnitRange = channels.slice(0, 3).every((channel) => channel >= 0 && channel <= 1);
    const rgb = channels.slice(0, 3).map((channel) => (
      Math.max(0, Math.min(255, Math.round(usesUnitRange ? channel * 255 : channel)))
    ));
    const alphaSource = channels.length > 3 ? channels[3] : 1;
    const alpha = Math.max(0, Math.min(1, alphaSource > 1 ? alphaSource / 255 : alphaSource));
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.toLowerCase() === 'none') return fallback;
  return text;
};

const readWorldBounds = (world) => {
  if (Array.isArray(world) && world.length >= 4) {
    const [minX, minY, maxX, maxY] = world.map((value) => toFiniteNumber(value));
    if ([minX, minY, maxX, maxY].every((value) => value !== null)) {
      return { minX, minY, maxX, maxY };
    }
    return null;
  }
  if (!world || typeof world !== 'object') return null;

  const candidates = [
    [world.minX, world.minY, world.maxX, world.maxY],
    [world.xMin, world.yMin, world.xMax, world.yMax],
    [world.xmin, world.ymin, world.xmax, world.ymax],
    [world.left, world.bottom, world.right, world.top],
  ];
  for (const candidate of candidates) {
    const [minX, minY, maxX, maxY] = candidate.map((value) => toFiniteNumber(value));
    if ([minX, minY, maxX, maxY].every((value) => value !== null)) {
      return { minX, minY, maxX, maxY };
    }
  }

  const x = toFiniteNumber(world.x);
  const y = toFiniteNumber(world.y);
  const width = toFiniteNumber(world.width);
  const height = toFiniteNumber(world.height);
  if ([x, y, width, height].every((value) => value !== null) && width > 0 && height > 0) {
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
  return null;
};

const normalizeBounds = (bounds) => {
  if (!bounds) return null;
  let minX = Math.min(bounds.minX, bounds.maxX);
  let maxX = Math.max(bounds.minX, bounds.maxX);
  let minY = Math.min(bounds.minY, bounds.maxY);
  let maxY = Math.max(bounds.minY, bounds.maxY);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  if (maxX - minX <= 0) {
    minX -= 1;
    maxX += 1;
  }
  if (maxY - minY <= 0) {
    minY -= 1;
    maxY += 1;
  }
  return { minX, minY, maxX, maxY };
};

const extendBounds = (bounds, x, y, radius = 0) => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return bounds;
  const safeRadius = Math.max(0, toFiniteNumber(radius, 0));
  if (!bounds) {
    return {
      minX: x - safeRadius,
      minY: y - safeRadius,
      maxX: x + safeRadius,
      maxY: y + safeRadius,
    };
  }
  bounds.minX = Math.min(bounds.minX, x - safeRadius);
  bounds.minY = Math.min(bounds.minY, y - safeRadius);
  bounds.maxX = Math.max(bounds.maxX, x + safeRadius);
  bounds.maxY = Math.max(bounds.maxY, y + safeRadius);
  return bounds;
};

const getPrimitiveBounds = (primitives) => {
  let bounds = null;
  primitives.forEach((primitive) => {
    if (!primitive || typeof primitive !== 'object') return;
    if (primitive.type === 'line') {
      const width = Math.max(0, toFiniteNumber(primitive.width, 1));
      bounds = extendBounds(bounds, toFiniteNumber(primitive.x1), toFiniteNumber(primitive.y1), width / 2);
      bounds = extendBounds(bounds, toFiniteNumber(primitive.x2), toFiniteNumber(primitive.y2), width / 2);
      return;
    }
    if (primitive.type === 'dot') {
      const radius = Math.max(0, toFiniteNumber(primitive.size, 1)) / 2;
      bounds = extendBounds(bounds, toFiniteNumber(primitive.x), toFiniteNumber(primitive.y), radius);
      return;
    }
    if (primitive.type === 'polygon') {
      const radius = Math.max(0, toFiniteNumber(primitive.width, 1)) / 2;
      normalizePoints(primitive.points).forEach((point) => {
        bounds = extendBounds(bounds, point.x, point.y, radius);
      });
      return;
    }
    if (primitive.type === 'text') {
      bounds = extendBounds(bounds, toFiniteNumber(primitive.x), toFiniteNumber(primitive.y), 1);
    }
  });
  return bounds;
};

const mergeBounds = (left, right) => {
  if (!left) return right ? { ...right } : null;
  if (!right) return { ...left };
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
};

const getDrawingBounds = (drawing, primitives) => {
  const width = Math.max(1, toFiniteNumber(drawing?.width, DEFAULT_CANVAS_WIDTH));
  const height = Math.max(1, toFiniteNumber(drawing?.height, DEFAULT_CANVAS_HEIGHT));
  const screenBounds = {
    minX: -width / 2,
    minY: -height / 2,
    maxX: width / 2,
    maxY: height / 2,
  };
  const worldBounds = normalizeBounds(readWorldBounds(drawing?.world));
  const primitiveBounds = normalizeBounds(getPrimitiveBounds(primitives));
  const baseBounds = worldBounds || screenBounds;
  return normalizeBounds(mergeBounds(baseBounds, primitiveBounds)) || screenBounds;
};

const getCanvasFont = (font) => {
  if (Array.isArray(font)) {
    const family = String(font[0] || 'Arial, sans-serif');
    const size = Math.max(8, toFiniteNumber(font[1], 14));
    const style = String(font[2] || '').trim();
    return `${style} ${size}px ${family}`.trim().replace(/\s+/g, ' ');
  }
  if (font && typeof font === 'object') {
    const size = Math.max(8, toFiniteNumber(font.size, 14));
    const family = String(font.family || 'Arial, sans-serif');
    const style = String(font.style || '').trim();
    const weight = String(font.weight || '').trim();
    return `${style} ${weight} ${size}px ${family}`.trim().replace(/\s+/g, ' ');
  }
  const text = typeof font === 'string' ? font.trim() : '';
  return text || '14px Arial, sans-serif';
};

const renderPrimitive = (context, primitive, mapPoint, scale) => {
  if (!primitive || typeof primitive !== 'object') return;
  if (primitive.type === 'line') {
    const start = mapPoint(primitive.x1, primitive.y1);
    const end = mapPoint(primitive.x2, primitive.y2);
    if (!start || !end) return;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.strokeStyle = normalizeColor(primitive.color, '#111827');
    context.lineWidth = Math.max(1.25, Math.min(96, Math.max(0, toFiniteNumber(primitive.width, 1)) * scale));
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();
    return;
  }
  if (primitive.type === 'dot') {
    const center = mapPoint(primitive.x, primitive.y);
    if (!center) return;
    const radius = Math.max(0.3, Math.min(256, (Math.max(0, toFiniteNumber(primitive.size, 1)) * scale) / 2));
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fillStyle = normalizeColor(primitive.color, '#111827');
    context.fill();
    return;
  }
  if (primitive.type === 'polygon') {
    const points = normalizePoints(primitive.points)
      .map((point) => mapPoint(point.x, point.y))
      .filter(Boolean);
    if (points.length < 2) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    const fill = normalizeColor(primitive.fill, null);
    if (fill) {
      context.fillStyle = fill;
      context.fill();
    }
    const outline = normalizeColor(primitive.outline, null);
    if (outline) {
      context.strokeStyle = outline;
      context.lineWidth = Math.max(1.25, Math.min(96, Math.max(0, toFiniteNumber(primitive.width, 1)) * scale));
      context.lineJoin = 'round';
      context.stroke();
    }
    return;
  }
  if (primitive.type === 'text') {
    const point = mapPoint(primitive.x, primitive.y);
    if (!point) return;
    context.fillStyle = normalizeColor(primitive.color, '#111827');
    context.font = getCanvasFont(primitive.font);
    context.textAlign = ['left', 'center', 'right'].includes(primitive.align) ? primitive.align : 'left';
    context.textBaseline = 'middle';
    context.fillText(String(primitive.text ?? ''), point.x, point.y);
  }
};

const TurtleCanvas = ({ drawing, className = '' }) => {
  const hostRef = useRef(null);
  const scrollContentRef = useRef(null);
  const canvasRef = useRef(null);
  const pendingScrollCenterRef = useRef(null);
  const scrollRestoreFrameRef = useRef(null);
  const previousDrawingRef = useRef(drawing);
  const panRef = useRef({ active: false, pointerId: null });
  const [isPanning, setIsPanning] = useState(false);
  const [zoomState, setZoomState] = useState(() => ({ drawing, value: 1 }));
  const zoom = zoomState.drawing === drawing ? zoomState.value : 1;
  const setZoom = useCallback((nextValue) => {
    const host = hostRef.current;
    if (host) {
      pendingScrollCenterRef.current = {
        x: (host.scrollLeft + host.clientWidth / 2) / Math.max(1, host.scrollWidth),
        y: (host.scrollTop + host.clientHeight / 2) / Math.max(1, host.scrollHeight),
      };
    }
    setZoomState((currentState) => {
      const currentZoom = currentState.drawing === drawing ? currentState.value : 1;
      const value = typeof nextValue === 'function' ? nextValue(currentZoom) : nextValue;
      return { drawing, value };
    });
  }, [drawing]);
  const primitives = useMemo(
    () => (Array.isArray(drawing?.primitives) ? drawing.primitives : []),
    [drawing]
  );
  const drawingBounds = useMemo(
    () => getDrawingBounds(drawing, primitives),
    [drawing, primitives]
  );
  const changeZoom = useCallback((direction) => {
    setZoom((currentZoom) => {
      const nextZoom = direction > 0
        ? currentZoom * ZOOM_FACTOR
        : currentZoom / ZOOM_FACTOR;
      return clampZoom(Math.round(nextZoom * 10_000) / 10_000);
    });
  }, [setZoom]);
  const resetZoom = useCallback(() => setZoom(1), [setZoom]);

  const stopPanning = useCallback((event = null) => {
    const host = hostRef.current;
    const pointerId = panRef.current.pointerId;
    if (
      host
      && pointerId !== null
      && host.hasPointerCapture?.(pointerId)
      && (!event || event.pointerId === pointerId)
    ) {
      host.releasePointerCapture(pointerId);
    }
    panRef.current = { active: false, pointerId: null };
    setIsPanning(false);
  }, []);

  const handlePanStart = useCallback((event) => {
    const host = hostRef.current;
    if (!host || zoom <= 1 || event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    const isOnVerticalScrollbar = event.clientX >= rect.left + host.clientWidth;
    const isOnHorizontalScrollbar = event.clientY >= rect.top + host.clientHeight;
    if (isOnVerticalScrollbar || isOnHorizontalScrollbar) return;
    event.preventDefault();
    host.setPointerCapture?.(event.pointerId);
    panRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: host.scrollLeft,
      scrollTop: host.scrollTop,
    };
    setIsPanning(true);
  }, [zoom]);

  const handlePanMove = useCallback((event) => {
    const host = hostRef.current;
    const pan = panRef.current;
    if (!host || !pan.active || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    host.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    host.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
  }, []);

  const draw = useCallback(() => {
    const host = hostRef.current;
    const scrollContent = scrollContentRef.current;
    const canvas = canvasRef.current;
    if (!host || !scrollContent || !canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const rect = host.getBoundingClientRect();
    const viewportWidth = Math.max(1, Math.round(host.clientWidth || rect.width || DEFAULT_CANVAS_WIDTH));
    const viewportHeight = Math.max(1, Math.round(host.clientHeight || rect.height || DEFAULT_CANVAS_HEIGHT));
    const scrollScale = Math.max(1, zoom);
    const contentWidth = Math.max(viewportWidth, Math.round(viewportWidth * scrollScale));
    const contentHeight = Math.max(viewportHeight, Math.round(viewportHeight * scrollScale));
    const pixelRatio = Math.max(1, Math.min(MAX_DEVICE_PIXEL_RATIO, window.devicePixelRatio || 1));
    const pixelWidth = Math.max(1, Math.round(viewportWidth * pixelRatio));
    const pixelHeight = Math.max(1, Math.round(viewportHeight * pixelRatio));

    scrollContent.style.width = `${contentWidth}px`;
    scrollContent.style.height = `${contentHeight}px`;
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${viewportHeight}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    context.fillStyle = normalizeColor(drawing?.background, '#ffffff');
    context.fillRect(0, 0, viewportWidth, viewportHeight);

    const worldWidth = Math.max(1e-9, drawingBounds.maxX - drawingBounds.minX);
    const worldHeight = Math.max(1e-9, drawingBounds.maxY - drawingBounds.minY);
    const availableWidth = Math.max(1, viewportWidth - CANVAS_PADDING_PX * 2);
    const availableHeight = Math.max(1, viewportHeight - CANVAS_PADDING_PX * 2);
    const fitScale = Math.max(1e-9, Math.min(availableWidth / worldWidth, availableHeight / worldHeight));
    const scale = fitScale * zoom;
    const renderedWidth = worldWidth * scale;
    const renderedHeight = worldHeight * scale;
    const offsetX = (contentWidth - renderedWidth) / 2 - host.scrollLeft;
    const offsetY = (contentHeight - renderedHeight) / 2 - host.scrollTop;
    const mapPoint = (xValue, yValue) => {
      const x = toFiniteNumber(xValue);
      const y = toFiniteNumber(yValue);
      if (x === null || y === null) return null;
      return {
        x: offsetX + (x - drawingBounds.minX) * scale,
        y: offsetY + (drawingBounds.maxY - y) * scale,
      };
    };

    primitives.forEach((primitive) => renderPrimitive(context, primitive, mapPoint, scale));

    if (previousDrawingRef.current !== drawing) {
      previousDrawingRef.current = drawing;
      pendingScrollCenterRef.current = { x: 0.5, y: 0.5 };
    }
    const pendingCenter = pendingScrollCenterRef.current;
    if (pendingCenter) {
      pendingScrollCenterRef.current = null;
      if (scrollRestoreFrameRef.current) window.cancelAnimationFrame(scrollRestoreFrameRef.current);
      scrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
        scrollRestoreFrameRef.current = null;
        const currentHost = hostRef.current;
        if (!currentHost) return;
        currentHost.scrollLeft = pendingCenter.x * currentHost.scrollWidth - currentHost.clientWidth / 2;
        currentHost.scrollTop = pendingCenter.y * currentHost.scrollHeight - currentHost.clientHeight / 2;
      });
    }
  }, [drawing?.background, drawingBounds, primitives, zoom]);

  useLayoutEffect(() => {
    let animationFrame = window.requestAnimationFrame(draw);
    const scheduleDraw = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(draw);
    };
    const host = hostRef.current;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleDraw) : null;
    if (host && observer) observer.observe(host);
    host?.addEventListener('scroll', scheduleDraw, { passive: true });
    if (!observer) window.addEventListener('resize', scheduleDraw);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (scrollRestoreFrameRef.current) window.cancelAnimationFrame(scrollRestoreFrameRef.current);
      observer?.disconnect();
      host?.removeEventListener('scroll', scheduleDraw);
      if (!observer) window.removeEventListener('resize', scheduleDraw);
    };
  }, [draw]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const handleWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (event.deltaY === 0) return;
      changeZoom(event.deltaY < 0 ? 1 : -1);
    };

    host.addEventListener('wheel', handleWheel, { passive: false });
    return () => host.removeEventListener('wheel', handleWheel);
  }, [changeZoom]);

  if (!drawing?.used) return null;

  const primitiveCount = primitives.length;
  const turtleLabel = `Рисунок turtle · ${primitiveCount.toLocaleString('ru-RU')} ${
    primitiveCount === 1 ? 'элемент' : 'элементов'
  }`;
  const canvasLabel = drawing?.truncated
    ? `${turtleLabel}. Рисунок сокращён из-за ограничения количества элементов.`
    : turtleLabel;
  const zoomPercent = Math.round(zoom * 100);

  return (
    <figure className={['student-test-code-focus__turtle', 'turtle-canvas', className].filter(Boolean).join(' ')}>
      <div
        ref={hostRef}
        className={`student-test-code-focus__turtle-surface turtle-canvas__surface${
          zoom > 1 ? ' is-pannable' : ''
        }${isPanning ? ' is-panning' : ''}`}
        title="Масштаб: Ctrl + колесо мыши. Перемещение: перетаскивание, полосы прокрутки или обычное колесо."
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={stopPanning}
        onPointerCancel={stopPanning}
        onLostPointerCapture={stopPanning}
      >
        <div ref={scrollContentRef} className="turtle-canvas__scroll-content">
          <canvas ref={canvasRef} role="img" aria-label={canvasLabel}>
            {canvasLabel}
          </canvas>
        </div>
      </div>
      <figcaption className="student-test-code-focus__turtle-caption turtle-canvas__caption">
        <div className="turtle-canvas__summary">
          <span>{turtleLabel}</span>
          {drawing.truncated && (
            <strong role="status">Рисунок сокращён: достигнут лимит элементов.</strong>
          )}
        </div>
        <div className="turtle-canvas__zoom-controls" role="group" aria-label="Масштаб рисунка">
          <button
            type="button"
            className="turtle-canvas__zoom-button turtle-canvas__zoom-button--out"
            onClick={() => changeZoom(-1)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Уменьшить рисунок"
            title="Уменьшить"
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            className="turtle-canvas__zoom-value"
            onClick={resetZoom}
            disabled={zoom === 1}
            aria-label={`Сбросить масштаб. Текущий масштаб ${zoomPercent}%`}
            title="Вернуть масштаб 100%"
          >
            {zoomPercent}%
          </button>
          <button
            type="button"
            className="turtle-canvas__zoom-button turtle-canvas__zoom-button--in"
            onClick={() => changeZoom(1)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Увеличить рисунок"
            title="Увеличить"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </figcaption>
    </figure>
  );
};

export default TurtleCanvas;
