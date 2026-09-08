export const TABLET_WS_PATH = '/collab/tablet';
export const TABLET_MAX_POINTS = 1400;
export const TABLET_COLORS = ['#8247e5', '#172033', '#e54545', '#16794b', '#2563eb'];
export const tabletId = () => globalThis.crypto?.randomUUID?.()
  || Array.from(globalThis.crypto.getRandomValues(new Uint8Array(20)), (n) => n.toString(16).padStart(2, '0')).join('');

export const normalizeTabletStroke = (value) => {
  if (!value || typeof value.id !== 'string' || typeof value.frameId !== 'string'
    || !/^[\w-]{1,80}$/.test(value.id) || !/^[\w-]{1,80}$/.test(value.frameId)) return null;
  if (typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color) || !Number.isFinite(value.width) || value.width < 1 || value.width > 12) return null;
  if (!Array.isArray(value.points) || !value.points.length || value.points.length > TABLET_MAX_POINTS) return null;
  const points = [];
  for (const point of value.points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
    points.push({ x: point.x, y: point.y });
  }
  return { id: value.id, frameId: value.frameId, color: value.color, width: value.width, points };
};

// The frame captured at pointer-down defines the coordinate system for the
// entire stroke, even if the computer pans or zooms while the pen is down.
export const tabletStrokeToBoard = (stroke, frame, authorId) => ({
  id: `tablet-${stroke.id}`,
  type: 'stroke',
  authorId,
  color: stroke.color,
  width: stroke.width / frame.zoom,
  points: (stroke.points.length === 1 ? [stroke.points[0], stroke.points[0]] : stroke.points).map((point) => ({
    x: frame.x + point.x * frame.width / frame.zoom,
    y: frame.y + point.y * frame.height / frame.zoom,
  })),
});

export const tabletFrameState = (value) => {
  if (!Number.isSafeInteger(value?.revision) || value.revision < 0
    || !Number.isFinite(value.view?.x) || !Number.isFinite(value.view?.y)
    || !Number.isFinite(value.view?.zoom) || value.view.zoom <= 0) return null;
  return { revision: value.revision, view: { x: value.view.x, y: value.view.y, zoom: value.view.zoom } };
};

// An acknowledgement means the board accepted the stroke, not that the image
// currently on the phone contains it. Keep local ink until that image is drawn.
export const tabletInkForFrame = (entry, frame) => {
  if (Number.isSafeInteger(entry.revision) && Number.isSafeInteger(frame.revision)
    && frame.revision >= entry.revision) return null;
  if (entry.stroke.frameId === frame.id) return entry.stroke;
  if (!entry.frame.view || !frame.view) return null;
  const source = entry.frame;
  const target = frame;
  return { ...entry.stroke, width: entry.stroke.width * target.view.zoom / source.view.zoom,
    points: entry.stroke.points.map((point) => ({
      x: (source.view.x + point.x * source.width / source.view.zoom - target.view.x) * target.view.zoom / target.width,
      y: (source.view.y + point.y * source.height / source.view.zoom - target.view.y) * target.view.zoom / target.height,
    })) };
};

export const tabletSocketUrl = (collabUrl) => {
  const url = new URL(collabUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/tablet`;
  url.search = '';
  url.hash = '';
  return url.toString();
};

export const readTabletLink = (hash) => {
  const match = /^#tablet=([\w-]{20,80})\.([\w-]{30,100})$/.exec(hash || '');
  return match ? { id: match[1], key: match[2] } : null;
};

export const tabletJoinOrigin = (origin, localHost = '') => {
  const url = new URL(origin);
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)[\d.]+$/.test(localHost)) {
    url.hostname = localHost;
  }
  return url.origin;
};
