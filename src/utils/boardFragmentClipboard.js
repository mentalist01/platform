export const BOARD_FRAGMENT_MARKER = '__IVAN100_BOARD_FRAGMENT_V1__:';
export const BOARD_FRAGMENT_STORAGE = 'ivan100_board_fragment_v1';
export const BOARD_FRAGMENT_TTL = 30 * 60 * 1000;
const MAX_BYTES = 12 * 1024 * 1024;
const TYPES = new Set(['stroke', 'line', 'arrow', 'shape', 'text', 'image', 'task']);
const FIELDS = ['color', 'width', 'height', 'x', 'y', 'strokeWidth', 'fontSize', 'shape', 'text',
  'naturalWidth', 'naturalHeight', 'flipX', 'hasFrame', 'hyperlink', 'heading', 'taskNumber',
  'taskDisplayNumber', 'taskTitle', 'levelId', 'levelLabel', 'questionId', 'questionNumber',
  'questionLabel', 'questionText', 'answerCount', 'answerLabels', 'contentWidth', 'contentHeight',
  'codePanelLayoutVersion'];
let memory = null;

const point = value => {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || Math.abs(value.x) > 1e7 || Math.abs(value.y) > 1e7) return null;
  return { x: value.x, y: value.y, ...(Number.isFinite(value.pressure) ? { pressure: value.pressure } : {}) };
};
const imageFields = value => {
  const result = {};
  if (typeof value?.assetUrl === 'string') {
    try {
      const path = new URL(value.assetUrl, 'https://board.local').pathname;
      if (/^\/uploads\/board-asset-[a-f0-9]{64}\.(png|jpe?g|webp|gif)$/i.test(path)) {
        result.assetUrl = path;
        result.assetId = String(value.assetId || '').slice(0, 120);
      }
    } catch { /* Invalid sources cannot be transferred. */ }
  }
  if (!result.assetUrl && /^data:image\/(png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(value?.dataUrl || '')) result.dataUrl = value.dataUrl;
  return Object.keys(result).length ? result : null;
};
const normalizeItem = source => {
  if (!source || !TYPES.has(source.type)) return null;
  const item = { type: source.type };
  for (const key of FIELDS) {
    const value = source[key];
    if (typeof value === 'string') item[key] = value.slice(0, key === 'questionText' ? 12000 : key === 'text' ? 4000 : 500);
    else if (typeof value === 'number' && Number.isFinite(value)) item[key] = value;
    else if (typeof value === 'boolean') item[key] = value;
    else if (key === 'answerLabels' && Array.isArray(value)) item[key] = value.slice(0, 100).map(v => String(v).slice(0, 40));
  }
  if (item.type === 'stroke') {
    if (!Array.isArray(source.points) || source.points.length > 1400) return null;
    item.points = source.points.map(point);
    if (!item.points.length || item.points.some(p => !p)) return null;
  } else if (item.type === 'line' || item.type === 'arrow') {
    item.start = point(source.start); item.end = point(source.end);
    if (!item.start || !item.end) return null;
  } else if (!point(item) || !(item.width > 0) || !(item.height > 0) || item.width > 1e7 || item.height > 1e7) return null;
  if (item.type === 'image') {
    const image = imageFields(source); if (!image) return null;
    Object.assign(item, image);
    if (source.crop && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(source.crop[key]))) {
      item.crop = { x: source.crop.x, y: source.crop.y, width: source.crop.width, height: source.crop.height };
    }
  }
  if (item.type === 'task') {
    if (source.screenshots != null && !Array.isArray(source.screenshots)) return null;
    item.screenshots = (source.screenshots || []).slice(0, 12).map(image => {
      const stored = imageFields(image); if (!stored) return null;
      return { ...stored, name: String(image.name || '').slice(0, 240),
        naturalWidth: Number(image.naturalWidth) || 1, naturalHeight: Number(image.naturalHeight) || 1,
        displayHeight: Number(image.displayHeight) || 220 };
    });
    if (item.screenshots.some(image => !image)) return null;
    item.answerCount = Math.max(1, Math.min(100, Math.floor(Number(item.answerCount) || 1)));
    // A copied question is a new attempt, without another student's answers or code.
    item.userAnswers = Array(item.answerCount).fill(''); item.studentAnswers = [];
    item.studentCode = ''; item.sourceStudentId = ''; item.checkState = 'idle';
  }
  return item;
};

export const fragmentBounds = items => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); };
  for (const item of items) {
    if (item.type === 'stroke') item.points.forEach(include);
    else if (item.type === 'line' || item.type === 'arrow') { include(item.start); include(item.end); }
    else { include(item); include({ x: item.x + item.width, y: item.y + item.height }); }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
};

export const normalizeBoardFragment = value => {
  if (!value || value.version !== 1 || !Array.isArray(value.items) || !value.items.length || value.items.length > 2500) return null;
  try { if (JSON.stringify(value).length > MAX_BYTES) return null; } catch { return null; }
  let items; try { items = value.items.map(normalizeItem); } catch { return null; }
  if (items.some(item => !item) || !fragmentBounds(items)) return null;
  return { version: 1, items };
};

export const cloneBoardFragment = (value, targetPoint, userId, makeId = () => crypto.randomUUID()) => {
  const payload = normalizeBoardFragment(value), destination = point(targetPoint);
  if (!payload || !destination) throw new Error('Некорректный фрагмент доски');
  const bounds = fragmentBounds(payload.items);
  const dx = destination.x - bounds.x - bounds.width / 2, dy = destination.y - bounds.y - bounds.height / 2;
  const translate = p => ({ ...p, x: p.x + dx, y: p.y + dy });
  return payload.items.map(item => ({ ...item, id: makeId(), authorId: userId,
    ...(item.type === 'stroke' ? { points: item.points.map(translate) }
      : item.type === 'line' || item.type === 'arrow' ? { start: translate(item.start), end: translate(item.end) }
        : { x: item.x + dx, y: item.y + dy }), locked: false, superLocked: false, votes: 0 }));
};

const storageOrNull = supplied => { if (supplied !== undefined) return supplied; try { return window.localStorage; } catch { return null; } };
export const saveBoardFragment = (value, userId, { storage, now = Date.now(), token = crypto.randomUUID() } = {}) => {
  const payload = normalizeBoardFragment(value);
  if (!payload || !userId) throw new Error('Не удалось скопировать выделение');
  memory = { token, ownerId: userId, expiresAt: now + BOARD_FRAGMENT_TTL, payload, persisted: false };
  try { const target = storageOrNull(storage); if (target) { target.setItem(BOARD_FRAGMENT_STORAGE, JSON.stringify(memory)); memory.persisted = true; } } catch { /* Same-tab copying still works when storage is full. */ }
  return BOARD_FRAGMENT_MARKER + token;
};
export const readBoardFragment = (marker, userId, { storage, now = Date.now() } = {}) => {
  if (marker != null && (typeof marker !== 'string' || !marker.startsWith(BOARD_FRAGMENT_MARKER))) return null;
  let record = memory;
  try {
    const stored = storageOrNull(storage)?.getItem(BOARD_FRAGMENT_STORAGE);
    if (stored) {
      const next = JSON.parse(stored);
      if (!record || (marker != null ? marker !== BOARD_FRAGMENT_MARKER + record.token : record.persisted)) record = next;
    }
  } catch { /* Optional storage. */ }
  if (!record || record.ownerId !== userId || !(record.expiresAt > now) || (marker != null && marker !== BOARD_FRAGMENT_MARKER + record.token)) return null;
  return normalizeBoardFragment(record.payload);
};
