export const HOMEWORK_LESSON_BASKET_VERSION = 1;

const HOMEWORK_LESSON_BASKET_STORAGE_PREFIX = 'ege_homework_lesson_basket_v1';
const MAX_STUDENTS = 300;
const MAX_ITEMS_PER_STUDENT = 500;

const normalizeText = (value, maxLength = 500) => (
  typeof value === 'string'
    ? value.trim().slice(0, maxLength)
    : String(value ?? '').trim().slice(0, maxLength)
);

const normalizeTimestamp = (value) => {
  const normalized = normalizeText(value, 100);
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
};

const normalizePositiveInteger = (value) => {
  const normalized = Math.trunc(Number(value));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
};

export const getHomeworkLessonBasketStorageKey = (teacherId) => {
  const normalizedTeacherId = normalizeText(teacherId, 240);
  return normalizedTeacherId
    ? `${HOMEWORK_LESSON_BASKET_STORAGE_PREFIX}:${encodeURIComponent(normalizedTeacherId)}`
    : '';
};

export const normalizeHomeworkLessonBasketItem = (value, { now = new Date() } = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const taskNumber = normalizePositiveInteger(value.taskNumber);
  const questionNumber = normalizePositiveInteger(value.questionNumber);
  const questionId = normalizeText(value.questionId, 240);
  if (!taskNumber || (!questionNumber && !questionId)) return null;
  const levelId = normalizeText(value.levelId, 80) || (taskNumber >= 100 ? 'python' : 'basic');
  const timestamp = now instanceof Date && !Number.isNaN(now.getTime())
    ? now.toISOString()
    : new Date().toISOString();
  return {
    taskNumber,
    levelId,
    questionId,
    questionNumber,
    taskTitle: normalizeText(value.taskTitle, 500),
    addedAt: normalizeTimestamp(value.addedAt) || timestamp,
  };
};

export const getHomeworkLessonBasketItemKey = (value) => {
  const item = normalizeHomeworkLessonBasketItem(value);
  if (!item) return '';
  const questionKey = item.questionId
    ? `id:${encodeURIComponent(item.questionId)}`
    : `number:${item.questionNumber}`;
  return `${item.taskNumber}:${encodeURIComponent(item.levelId)}:${questionKey}`;
};

const normalizeBasketItems = (values) => {
  const result = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const item = normalizeHomeworkLessonBasketItem(value);
    const key = getHomeworkLessonBasketItemKey(item);
    if (!item || !key || seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result.slice(0, MAX_ITEMS_PER_STUDENT);
};

export const normalizeHomeworkLessonBaskets = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? (value.baskets && typeof value.baskets === 'object' && !Array.isArray(value.baskets)
      ? value.baskets
      : value)
    : {};
  const baskets = {};
  Object.entries(source).slice(0, MAX_STUDENTS).forEach(([studentId, rawBasket]) => {
    const normalizedStudentId = normalizeText(studentId, 240);
    if (!normalizedStudentId || ['__proto__', 'constructor', 'prototype'].includes(normalizedStudentId)) return;
    const rawItems = Array.isArray(rawBasket) ? rawBasket : rawBasket?.items;
    const items = normalizeBasketItems(rawItems);
    if (items.length === 0) return;
    baskets[normalizedStudentId] = {
      items,
      updatedAt: normalizeTimestamp(rawBasket?.updatedAt) || items[items.length - 1]?.addedAt || '',
    };
  });
  return { version: HOMEWORK_LESSON_BASKET_VERSION, baskets };
};

export const getHomeworkLessonBasketItems = (value, studentId) => {
  const normalizedStudentId = normalizeText(studentId, 240);
  if (!normalizedStudentId) return [];
  return normalizeHomeworkLessonBaskets(value).baskets[normalizedStudentId]?.items || [];
};

export const hasHomeworkLessonBasketItem = (value, studentId, candidate) => {
  const candidateKey = getHomeworkLessonBasketItemKey(candidate);
  if (!candidateKey) return false;
  return getHomeworkLessonBasketItems(value, studentId)
    .some((item) => getHomeworkLessonBasketItemKey(item) === candidateKey);
};

export const addHomeworkLessonBasketItem = (value, studentId, candidate, { now = new Date() } = {}) => {
  const normalizedStudentId = normalizeText(studentId, 240);
  const item = normalizeHomeworkLessonBasketItem(candidate, { now });
  if (!normalizedStudentId || !item) return normalizeHomeworkLessonBaskets(value);
  const normalized = normalizeHomeworkLessonBaskets(value);
  const currentItems = normalized.baskets[normalizedStudentId]?.items || [];
  const itemKey = getHomeworkLessonBasketItemKey(item);
  if (currentItems.some((entry) => getHomeworkLessonBasketItemKey(entry) === itemKey)) return normalized;
  const timestamp = now instanceof Date && !Number.isNaN(now.getTime())
    ? now.toISOString()
    : new Date().toISOString();
  return {
    ...normalized,
    baskets: {
      ...normalized.baskets,
      [normalizedStudentId]: {
        items: [...currentItems, item].slice(0, MAX_ITEMS_PER_STUDENT),
        updatedAt: timestamp,
      },
    },
  };
};

export const clearHomeworkLessonBasket = (value, studentId) => {
  const normalizedStudentId = normalizeText(studentId, 240);
  const normalized = normalizeHomeworkLessonBaskets(value);
  if (!normalizedStudentId || !normalized.baskets[normalizedStudentId]) return normalized;
  const baskets = { ...normalized.baskets };
  delete baskets[normalizedStudentId];
  return { ...normalized, baskets };
};

const resolveStorage = (providedStorage) => {
  if (providedStorage) return providedStorage;
  try {
    return globalThis?.localStorage || null;
  } catch {
    return null;
  }
};

export const loadHomeworkLessonBaskets = (teacherId, providedStorage = null) => {
  const storage = resolveStorage(providedStorage);
  const storageKey = getHomeworkLessonBasketStorageKey(teacherId);
  if (!storageKey || !storage?.getItem) return normalizeHomeworkLessonBaskets(null);
  try {
    const raw = storage.getItem(storageKey);
    return normalizeHomeworkLessonBaskets(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeHomeworkLessonBaskets(null);
  }
};

export const saveHomeworkLessonBaskets = (teacherId, value, providedStorage = null) => {
  const storage = resolveStorage(providedStorage);
  const storageKey = getHomeworkLessonBasketStorageKey(teacherId);
  if (!storageKey || !storage?.setItem) return false;
  try {
    storage.setItem(storageKey, JSON.stringify(normalizeHomeworkLessonBaskets(value)));
    return true;
  } catch {
    return false;
  }
};
