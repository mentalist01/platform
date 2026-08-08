const OFFLINE_HOMEWORK_DB_NAME = 'ivan-ege-offline-homework';
const OFFLINE_HOMEWORK_DB_VERSION = 1;
const OFFLINE_HOMEWORK_STORE = 'packages';
const OFFLINE_HOMEWORK_ASSET_CACHE_PREFIX = 'ivan-ege-homework-assets-v1-';
const OFFLINE_SERVICE_WORKER_URL = '/sw-push.js';
const OFFLINE_STATIC_CACHE_NAME = 'ivan-ege-static-v2';
const OFFLINE_SHELL_CACHE_NAME = 'ivan-ege-shell-v2';

const normalizeId = (value) => String(value || '').trim();

const hasIndexedDb = () => (
  typeof window !== 'undefined'
  && typeof window.indexedDB !== 'undefined'
);

const hasCacheStorage = () => (
  typeof window !== 'undefined'
  && typeof window.caches !== 'undefined'
);

const hashOwnerKey = (value) => {
  const source = normalizeId(value) || 'student';
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const getAssetCacheName = (studentId) => (
  `${OFFLINE_HOMEWORK_ASSET_CACHE_PREFIX}${hashOwnerKey(studentId)}`
);

const openOfflineHomeworkDb = () => new Promise((resolve, reject) => {
  if (!hasIndexedDb()) {
    reject(new Error('Офлайн-хранилище не поддерживается этим браузером.'));
    return;
  }
  const request = window.indexedDB.open(
    OFFLINE_HOMEWORK_DB_NAME,
    OFFLINE_HOMEWORK_DB_VERSION,
  );
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(OFFLINE_HOMEWORK_STORE)) {
      db.createObjectStore(OFFLINE_HOMEWORK_STORE, { keyPath: 'studentId' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Не удалось открыть офлайн-хранилище.'));
  request.onblocked = () => reject(new Error('Офлайн-хранилище занято другой вкладкой.'));
});

const readPackageRecord = async (studentId) => {
  const normalizedStudentId = normalizeId(studentId);
  if (!normalizedStudentId || !hasIndexedDb()) return null;
  const db = await openOfflineHomeworkDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(OFFLINE_HOMEWORK_STORE, 'readonly');
      const request = transaction.objectStore(OFFLINE_HOMEWORK_STORE).get(normalizedStudentId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Не удалось прочитать офлайн-домашку.'));
      transaction.onabort = () => reject(transaction.error || new Error('Чтение офлайн-домашки прервано.'));
    });
  } finally {
    db.close();
  }
};

const writePackageRecord = async (record) => {
  const db = await openOfflineHomeworkDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(OFFLINE_HOMEWORK_STORE, 'readwrite');
      transaction.objectStore(OFFLINE_HOMEWORK_STORE).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Не удалось сохранить офлайн-домашку.'));
      transaction.onabort = () => reject(transaction.error || new Error('Сохранение офлайн-домашки прервано.'));
    });
  } finally {
    db.close();
  }
};

const deletePackageRecord = async (studentId) => {
  const normalizedStudentId = normalizeId(studentId);
  if (!normalizedStudentId || !hasIndexedDb()) return;
  const db = await openOfflineHomeworkDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(OFFLINE_HOMEWORK_STORE, 'readwrite');
      transaction.objectStore(OFFLINE_HOMEWORK_STORE).delete(normalizedStudentId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Не удалось удалить офлайн-домашку.'));
      transaction.onabort = () => reject(transaction.error || new Error('Удаление офлайн-домашки прервано.'));
    });
  } finally {
    db.close();
  }
};

const getHomeworkEntries = (homeworkResponse) => (
  Array.isArray(homeworkResponse?.homeworks) ? homeworkResponse.homeworks : []
);

const getHomeworkGoals = (homework) => {
  if (Array.isArray(homework?.goals) && homework.goals.length > 0) return homework.goals;
  const taskNumber = Number(homework?.taskNumber);
  const levelId = normalizeId(homework?.levelId);
  if (!Number.isFinite(taskNumber) || !levelId) return [];
  return [{
    type: 'task',
    taskNumber,
    levelId,
    includeAll: Boolean(homework?.includeAll),
    targetQuestions: Array.isArray(homework?.targetQuestions) ? homework.targetQuestions : [],
    targetQuestionIds: Array.isArray(homework?.targetQuestionIds) ? homework.targetQuestionIds : [],
  }];
};

const getGoalQuestions = (goal, testsDb) => {
  if (String(goal?.type || 'task').trim().toLowerCase() === 'mock') return [];
  const taskNumber = Number(goal?.taskNumber);
  const levelId = taskNumber >= 100 ? 'python' : normalizeId(goal?.levelId);
  if (!Number.isFinite(taskNumber) || !levelId) return [];
  const questions = testsDb?.[String(taskNumber)]?.[levelId];
  if (!Array.isArray(questions)) return [];

  if (goal?.includeAll) return questions;
  const targetIds = new Set(
    (Array.isArray(goal?.targetQuestionIds) ? goal.targetQuestionIds : [])
      .map(normalizeId)
      .filter(Boolean),
  );
  const targetNumbers = new Set(
    (Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [])
      .map((value) => Math.trunc(Number(value)))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
  if (targetIds.size === 0 && targetNumbers.size === 0) return questions;
  return questions.filter((question, index) => (
    targetIds.has(normalizeId(question?.id)) || targetNumbers.has(index + 1)
  ));
};

const addAssetCandidate = (target, value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return;
  if (raw.startsWith('/uploads/')) {
    target.add(raw);
    return;
  }
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin && url.pathname.startsWith('/uploads/')) {
      target.add(`${url.pathname}${url.search}`);
    }
  } catch {
    // Ignore malformed or unsupported attachment URLs.
  }
};

const collectAssetsFromValue = (value, target, visited = new Set()) => {
  if (!value || typeof value !== 'object') return;
  if (visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectAssetsFromValue(item, target, visited));
    return;
  }
  addAssetCandidate(target, value.url);
  if (!value.url && typeof value.storageName === 'string' && value.storageName.trim()) {
    addAssetCandidate(target, `/uploads/${encodeURIComponent(value.storageName.trim())}`);
  }
  Object.values(value).forEach((item) => collectAssetsFromValue(item, target, visited));
};

const OFFLINE_PRIVATE_ANSWER_FIELD = /^(?:answer\d*|answers|correctAnswer|correctAnswers|correctIndex|expectedAnswer|expectedAnswers|solution)$/i;

const stripAnswerFields = (value, seen = new WeakMap()) => {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const safeArray = [];
    seen.set(value, safeArray);
    value.forEach((item) => safeArray.push(stripAnswerFields(item, seen)));
    return safeArray;
  }
  const safeObject = {};
  seen.set(value, safeObject);
  Object.entries(value).forEach(([key, item]) => {
    if (OFFLINE_PRIVATE_ANSWER_FIELD.test(key)) return;
    safeObject[key] = stripAnswerFields(item, seen);
  });
  return safeObject;
};

export const sanitizeTestsDbForOfflineHomework = (testsDb) => (
  testsDb && typeof testsDb === 'object' ? stripAnswerFields(testsDb) : {}
);

export const collectOfflineHomeworkAssetUrls = (homeworkResponse, testsDb) => {
  const urls = new Set();
  getHomeworkEntries(homeworkResponse).forEach((homework) => {
    getHomeworkGoals(homework).forEach((goal) => {
      getGoalQuestions(goal, testsDb).forEach((question) => {
        collectAssetsFromValue(question, urls);
      });
    });
  });
  return Array.from(urls).sort();
};

const getCacheRequest = (assetUrl) => {
  if (typeof window === 'undefined') return assetUrl;
  return new Request(new URL(assetUrl, window.location.origin).toString(), {
    method: 'GET',
    credentials: 'include',
  });
};

const prefetchAsset = async ({ cache, assetUrl, fetchAsset }) => {
  const cacheRequest = getCacheRequest(assetUrl);
  const existing = await cache.match(cacheRequest);
  if (existing) {
    return {
      ok: true,
      cached: true,
      sizeBytes: Math.max(0, Number(existing.headers.get('content-length')) || 0),
    };
  }
  const response = await fetchAsset(assetUrl, { method: 'GET', cache: 'no-store' });
  if (!response?.ok) {
    throw new Error(`Не удалось скачать материал (${response?.status || 'network'}).`);
  }
  const cachedResponse = response.clone();
  await cache.put(cacheRequest, cachedResponse);
  return {
    ok: true,
    cached: false,
    sizeBytes: Math.max(0, Number(response.headers.get('content-length')) || 0),
  };
};

const prefetchAssets = async ({ studentId, assetUrls, fetchAsset }) => {
  if (!hasCacheStorage() || assetUrls.length === 0 || typeof fetchAsset !== 'function') {
    return {
      total: assetUrls.length,
      saved: 0,
      failed: assetUrls.length,
      sizeBytes: 0,
    };
  }
  const cache = await window.caches.open(getAssetCacheName(studentId));
  const summary = { total: assetUrls.length, saved: 0, failed: 0, sizeBytes: 0 };
  const queue = [...assetUrls];
  const worker = async () => {
    while (queue.length > 0) {
      const assetUrl = queue.shift();
      try {
        const result = await prefetchAsset({ cache, assetUrl, fetchAsset });
        summary.saved += 1;
        summary.sizeBytes += Math.max(0, Number(result?.sizeBytes) || 0);
      } catch {
        summary.failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, assetUrls.length) }, () => worker()));
  return summary;
};

export const isOfflineHomeworkStorageSupported = () => hasIndexedDb();

export const loadOfflineHomeworkPackage = async (studentId) => {
  try {
    const record = await readPackageRecord(studentId);
    if (!record || !record.homeworkResponse || !record.testsDb) return null;
    return record;
  } catch {
    return null;
  }
};

export const saveOfflineHomeworkPackage = async ({
  studentId,
  homeworkResponse,
  testsDb,
  fetchAsset = typeof fetch === 'function' ? fetch : null,
} = {}) => {
  const normalizedStudentId = normalizeId(studentId);
  if (!normalizedStudentId) throw new Error('Не удалось определить ученика для офлайн-домашки.');
  if (!homeworkResponse || typeof homeworkResponse !== 'object') {
    throw new Error('Нет данных домашней работы для сохранения.');
  }
  if (!testsDb || typeof testsDb !== 'object') {
    throw new Error('Нет условий заданий для сохранения.');
  }

  const savedAt = new Date().toISOString();
  const safeTestsDb = sanitizeTestsDbForOfflineHomework(testsDb);
  const assetUrls = collectOfflineHomeworkAssetUrls(homeworkResponse, safeTestsDb);
  const pendingRecord = {
    studentId: normalizedStudentId,
    savedAt,
    homeworkResponse,
    testsDb: safeTestsDb,
    assetUrls,
    assets: {
      total: assetUrls.length,
      saved: 0,
      failed: 0,
      sizeBytes: 0,
      status: assetUrls.length > 0 ? 'saving' : 'ready',
    },
  };
  await writePackageRecord(pendingRecord);

  const assetSummary = await prefetchAssets({
    studentId: normalizedStudentId,
    assetUrls,
    fetchAsset,
  });
  const record = {
    ...pendingRecord,
    assets: {
      ...assetSummary,
      status: assetSummary.failed > 0 ? 'partial' : 'ready',
    },
  };
  await writePackageRecord(record);
  return record;
};

export const clearOfflineHomeworkPackage = async (studentId) => {
  const normalizedStudentId = normalizeId(studentId);
  if (!normalizedStudentId) return;
  await Promise.allSettled([
    deletePackageRecord(normalizedStudentId),
    hasCacheStorage()
      ? window.caches.delete(getAssetCacheName(normalizedStudentId))
      : Promise.resolve(false),
  ]);
};

const warmOfflineAppShell = async () => {
  if (
    !hasCacheStorage()
    || typeof document === 'undefined'
    || typeof fetch !== 'function'
  ) {
    return;
  }
  const resourceUrls = Array.from(document.querySelectorAll('script[src], link[rel="stylesheet"][href]'))
    .map((element) => element.getAttribute('src') || element.getAttribute('href'))
    .filter(Boolean);
  const uniqueResourceUrls = Array.from(new Set(resourceUrls));
  const staticCache = await window.caches.open(OFFLINE_STATIC_CACHE_NAME);
  await Promise.all(uniqueResourceUrls.map(async (resourceUrl) => {
    const request = new Request(new URL(resourceUrl, window.location.origin).toString());
    if (await staticCache.match(request)) return;
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Unable to cache app resource: ${resourceUrl}`);
    await staticCache.put(request, response);
  }));

  const shellCache = await window.caches.open(OFFLINE_SHELL_CACHE_NAME);
  await Promise.allSettled(['/', '/logo1.png'].map(async (resourceUrl) => {
    const request = new Request(new URL(resourceUrl, window.location.origin).toString());
    if (await shellCache.match(request)) return;
    const response = await fetch(request);
    if (response.ok) await shellCache.put(request, response);
  }));
};

export const registerOfflineServiceWorker = async () => {
  if (
    typeof window === 'undefined'
    || typeof navigator === 'undefined'
    || !('serviceWorker' in navigator)
  ) {
    return null;
  }
  const registration = await navigator.serviceWorker.register(OFFLINE_SERVICE_WORKER_URL, {
    scope: '/',
    updateViaCache: 'none',
  });
  await warmOfflineAppShell();
  return registration;
};
