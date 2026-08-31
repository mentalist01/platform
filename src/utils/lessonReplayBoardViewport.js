const finiteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const normalizeSize = (value, fallback) => {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : fallback;
};

const normalizeBounds = (bounds) => {
  const minX = finiteNumber(bounds?.minX);
  const minY = finiteNumber(bounds?.minY);
  const maxX = finiteNumber(bounds?.maxX);
  const maxY = finiteNumber(bounds?.maxY);
  if (
    minX === null
    || minY === null
    || maxX === null
    || maxY === null
    || maxX < minX
    || maxY < minY
  ) return null;
  return { minX, minY, maxX, maxY };
};

const getItemBounds = (item) => {
  if (!item || typeof item !== 'object') return null;
  if (item.type === 'stroke') {
    const points = Array.isArray(item.points) ? item.points : [];
    if (points.length === 0) return null;
    return points.reduce((bounds, point) => ({
      minX: Math.min(bounds.minX, Number(point?.x) || 0),
      minY: Math.min(bounds.minY, Number(point?.y) || 0),
      maxX: Math.max(bounds.maxX, Number(point?.x) || 0),
      maxY: Math.max(bounds.maxY, Number(point?.y) || 0),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  }
  if (item.type === 'line' || item.type === 'arrow') {
    return {
      minX: Math.min(Number(item.start?.x) || 0, Number(item.end?.x) || 0),
      minY: Math.min(Number(item.start?.y) || 0, Number(item.end?.y) || 0),
      maxX: Math.max(Number(item.start?.x) || 0, Number(item.end?.x) || 0),
      maxY: Math.max(Number(item.start?.y) || 0, Number(item.end?.y) || 0),
    };
  }
  const x = Number(item.x) || 0;
  const y = Number(item.y) || 0;
  const fontSize = Math.max(8, Number(item.fontSize) || 22);
  const textLines = item.type === 'text' ? String(item.text || '').split('\n').slice(0, 20) : [];
  const textWidth = textLines.length > 0
    ? Math.max(12, Math.max(...textLines.map((line) => Math.max(1, line.length))) * fontSize * 0.62)
    : 1;
  const textHeight = textLines.length > 0
    ? Math.max(fontSize, textLines.length * fontSize * 1.25)
    : 1;
  return {
    minX: x,
    minY: y,
    maxX: x + Math.max(1, Number(item.width) || textWidth),
    maxY: y + Math.max(1, Number(item.height) || textHeight),
  };
};

export const getLessonReplayBoardContentBounds = (items) => {
  const bounds = (Array.isArray(items) ? items : []).map(getItemBounds).filter(Boolean);
  if (bounds.length === 0) return null;
  return {
    minX: Math.min(...bounds.map((entry) => entry.minX)),
    minY: Math.min(...bounds.map((entry) => entry.minY)),
    maxX: Math.max(...bounds.map((entry) => entry.maxX)),
    maxY: Math.max(...bounds.map((entry) => entry.maxY)),
  };
};

const viewportIntersectsBounds = (viewport, bounds) => {
  if (!bounds) return true;
  const width = viewport.width / viewport.zoom;
  const height = viewport.height / viewport.zoom;
  return (
    viewport.offset.x <= bounds.maxX
    && viewport.offset.x + width >= bounds.minX
    && viewport.offset.y <= bounds.maxY
    && viewport.offset.y + height >= bounds.minY
  );
};

const fitViewportToBounds = (bounds, width, height, minZoom, maxZoom) => {
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
  const padding = Math.max(32, Math.min(160, Math.max(contentWidth, contentHeight) * 0.06));
  const zoom = clamp(
    Math.min(width / (contentWidth + padding * 2), height / (contentHeight + padding * 2)),
    minZoom,
    maxZoom
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    zoom,
    offset: {
      x: centerX - width / zoom / 2,
      y: centerY - height / zoom / 2,
    },
  };
};

// Recorded offsets describe the top-left world coordinate for the board size
// that existed during the lesson. Reusing that top-left after fullscreen
// changes the surface size moves the visual center by hundreds of pixels.
// Preserve the recorded world center and fall back to visible content when a
// legacy viewport is missing or points completely outside the board.
export const resolveLessonReplayBoardViewport = (
  recordedViewport,
  targetSize,
  contentBounds = null,
  options = {}
) => {
  const width = normalizeSize(targetSize?.width, 900);
  const height = normalizeSize(targetSize?.height, 520);
  const minZoom = normalizeSize(options.minZoom, 0.25);
  const maxZoom = Math.max(minZoom, normalizeSize(options.maxZoom, 4));
  const bounds = normalizeBounds(contentBounds);
  const rawZoom = finiteNumber(recordedViewport?.zoom);
  const zoom = clamp(rawZoom !== null && rawZoom > 0 ? rawZoom : 1, minZoom, maxZoom);
  const offsetX = finiteNumber(recordedViewport?.offset?.x);
  const offsetY = finiteNumber(recordedViewport?.offset?.y);

  if (offsetX !== null && offsetY !== null) {
    const recordedWidth = normalizeSize(recordedViewport?.width, width);
    const recordedHeight = normalizeSize(recordedViewport?.height, height);
    const candidate = {
      zoom,
      width,
      height,
      offset: {
        x: offsetX + recordedWidth / zoom / 2 - width / zoom / 2,
        y: offsetY + recordedHeight / zoom / 2 - height / zoom / 2,
      },
    };
    if (viewportIntersectsBounds(candidate, bounds)) {
      return { zoom: candidate.zoom, offset: candidate.offset };
    }
  }

  if (bounds) return fitViewportToBounds(bounds, width, height, minZoom, maxZoom);
  return { zoom, offset: { x: offsetX || 0, y: offsetY || 0 } };
};

// Both the inline player and a restored lesson copy must start at the same
// part of a recovered board, not fit its entire (potentially very tall) history.
export const getLessonReplayInitialBoardViewport = (events) => {
  const initialFocusBounds = (Array.isArray(events) ? events : []).find((event) => (
    event?.type === 'board'
    && event.payload?.initialState === true
    && event.payload?.initialFocusBounds
  ))?.payload?.initialFocusBounds;
  if (!normalizeBounds(initialFocusBounds)) return null;
  const width = 900;
  const height = 520;
  return {
    surface: 'board',
    ...resolveLessonReplayBoardViewport(
      null,
      { width, height },
      initialFocusBounds,
      { minZoom: 0.15, maxZoom: 12 }
    ),
    width,
    height,
  };
};
