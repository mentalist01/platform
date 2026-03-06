const THEORY_RECORDING_DRAFT_DB_NAME = 'theory-recording-drafts';
const THEORY_RECORDING_DRAFT_STORE_NAME = 'drafts';
const THEORY_RECORDING_DRAFT_DB_VERSION = 1;

let theoryRecordingDraftDbPromise = null;

const canUseTheoryRecordingDraftStore = () => (
  typeof window !== 'undefined'
  && typeof window.indexedDB !== 'undefined'
);

const openTheoryRecordingDraftDb = () => {
  if (!canUseTheoryRecordingDraftStore()) return Promise.resolve(null);
  if (theoryRecordingDraftDbPromise) return theoryRecordingDraftDbPromise;
  theoryRecordingDraftDbPromise = new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open(
        THEORY_RECORDING_DRAFT_DB_NAME,
        THEORY_RECORDING_DRAFT_DB_VERSION
      );
      request.onerror = () => reject(request.error || new Error('Не удалось открыть IndexedDB.'));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(THEORY_RECORDING_DRAFT_STORE_NAME)) {
          db.createObjectStore(THEORY_RECORDING_DRAFT_STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result || null);
    } catch (error) {
      reject(error);
    }
  }).catch(() => null);
  return theoryRecordingDraftDbPromise;
};

const withTheoryRecordingDraftStore = async (mode, callback) => {
  const db = await openTheoryRecordingDraftDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(THEORY_RECORDING_DRAFT_STORE_NAME, mode);
      const store = transaction.objectStore(THEORY_RECORDING_DRAFT_STORE_NAME);
      const result = callback(store, transaction);
      transaction.oncomplete = () => resolve(result ?? null);
      transaction.onerror = () => reject(transaction.error || new Error('Ошибка транзакции IndexedDB.'));
      transaction.onabort = () => reject(transaction.error || new Error('Транзакция IndexedDB была прервана.'));
    } catch (error) {
      reject(error);
    }
  }).catch(() => null);
};

export const loadTheoryRecordingDraftSnapshot = async (draftKey) => {
  const normalizedKey = String(draftKey || '').trim();
  if (!normalizedKey) return null;
  const db = await openTheoryRecordingDraftDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(THEORY_RECORDING_DRAFT_STORE_NAME, 'readonly');
      const store = transaction.objectStore(THEORY_RECORDING_DRAFT_STORE_NAME);
      const request = store.get(normalizedKey);
      request.onsuccess = () => resolve(request.result?.snapshot || null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

export const saveTheoryRecordingDraftSnapshot = async (draftKey, snapshot) => {
  const normalizedKey = String(draftKey || '').trim();
  if (!normalizedKey || !snapshot || typeof snapshot !== 'object') return false;
  const result = await withTheoryRecordingDraftStore('readwrite', (store) => {
    store.put({
      id: normalizedKey,
      updatedAtMs: Date.now(),
      snapshot,
    });
    return true;
  });
  return result === true;
};

export const deleteTheoryRecordingDraftSnapshot = async (draftKey) => {
  const normalizedKey = String(draftKey || '').trim();
  if (!normalizedKey) return false;
  const result = await withTheoryRecordingDraftStore('readwrite', (store) => {
    store.delete(normalizedKey);
    return true;
  });
  return result === true;
};

export const isTheoryRecordingDraftStoreSupported = () => canUseTheoryRecordingDraftStore();
