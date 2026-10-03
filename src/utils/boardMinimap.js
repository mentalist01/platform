const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));

export function minimapGrab(geometry, point) {
  const { minX, minY, scale, pad, offset, viewWidth, viewHeight } = geometry;
  const x = minX + (point.x - pad) / scale;
  const y = minY + (point.y - pad) / scale;
  const tolerance = 4 / scale;
  const inside = x >= offset.x - tolerance && x <= offset.x + viewWidth + tolerance
    && y >= offset.y - tolerance && y <= offset.y + viewHeight + tolerance;
  return inside ? { x: x - offset.x, y: y - offset.y } : { x: viewWidth / 2, y: viewHeight / 2 };
}

export function minimapOffset(geometry, point, grab) {
  const { minX, minY, maxX, maxY, scale, pad, viewWidth, viewHeight } = geometry;
  return {
    x: clamp(minX + (point.x - pad) / scale - grab.x, minX, maxX - viewWidth),
    y: clamp(minY + (point.y - pad) / scale - grab.y, minY, maxY - viewHeight),
  };
}
