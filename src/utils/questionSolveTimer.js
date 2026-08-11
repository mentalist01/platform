const DEFAULT_MAX_DURATION_MS = 4 * 60 * 60 * 1000;
const STORAGE_VERSION = 1;

export const QUESTION_SOLVE_TIMER_STORAGE_PREFIX = 'question-solve-timer:v1';

const defaultNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const getDefaultStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
};

const normalizeDurationMs = (value, maxDurationMs = DEFAULT_MAX_DURATION_MS) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(Math.max(0, Math.round(numeric)), maxDurationMs);
};

const encodeStoragePart = (value, fallback = '') => {
  const normalized = String(value ?? '').trim() || fallback;
  return normalized ? encodeURIComponent(normalized) : '';
};

export const buildQuestionSolveTimerStorageKey = ({
  studentId,
  taskNumber,
  levelId,
  questionId,
} = {}) => {
  const parts = [
    encodeStoragePart(studentId, 'anonymous'),
    encodeStoragePart(taskNumber),
    encodeStoragePart(levelId),
    encodeStoragePart(questionId),
  ];
  if (parts.some((part) => !part)) return '';
  return `${QUESTION_SOLVE_TIMER_STORAGE_PREFIX}:${parts.join(':')}`;
};

export const readQuestionSolveTimerState = (
  storageKey,
  { storage = getDefaultStorage(), maxDurationMs = DEFAULT_MAX_DURATION_MS } = {}
) => {
  const key = String(storageKey || '').trim();
  if (!key || !storage || typeof storage.getItem !== 'function') {
    return { elapsedMs: 0, baselineMs: 0 };
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) return { elapsedMs: 0, baselineMs: 0 };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Accept the short-lived scalar format used while the timer was first introduced.
      parsed = { elapsedMs: raw };
    }
    if (typeof parsed === 'number' || typeof parsed === 'string') {
      parsed = { elapsedMs: parsed };
    }
    const elapsedMs = normalizeDurationMs(parsed?.elapsedMs, maxDurationMs);
    const baselineMs = Math.min(
      elapsedMs,
      normalizeDurationMs(parsed?.baselineMs, maxDurationMs)
    );
    return { elapsedMs, baselineMs };
  } catch {
    return { elapsedMs: 0, baselineMs: 0 };
  }
};

export const writeQuestionSolveTimerState = (
  storageKey,
  state,
  { storage = getDefaultStorage(), maxDurationMs = DEFAULT_MAX_DURATION_MS } = {}
) => {
  const key = String(storageKey || '').trim();
  if (!key || !storage || typeof storage.setItem !== 'function') return false;
  const elapsedMs = normalizeDurationMs(state?.elapsedMs, maxDurationMs);
  const baselineMs = Math.min(
    elapsedMs,
    normalizeDurationMs(state?.baselineMs, maxDurationMs)
  );
  try {
    if (elapsedMs <= 0) {
      storage.removeItem?.(key);
      return true;
    }
    storage.setItem(key, JSON.stringify({
      version: STORAGE_VERSION,
      elapsedMs,
      baselineMs,
    }));
    return true;
  } catch {
    return false;
  }
};

export const clearQuestionSolveTimerState = (
  storageKey,
  { storage = getDefaultStorage() } = {}
) => {
  const key = String(storageKey || '').trim();
  if (!key || !storage || typeof storage.removeItem !== 'function') return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

export class ActiveQuestionSolveTimer {
  constructor({
    now = defaultNow,
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
    storage = getDefaultStorage(),
  } = {}) {
    this.now = typeof now === 'function' ? now : defaultNow;
    this.maxDurationMs = Math.max(1000, Number(maxDurationMs) || DEFAULT_MAX_DURATION_MS);
    this.storage = storage;
    this.elapsedByKey = new Map();
    this.baselineByKey = new Map();
    this.hydratedKeys = new Set();
    this.activeKey = '';
    this.segmentStartedAt = null;
    this.environmentActive = true;
    this.manuallyPaused = false;
  }

  hydrate(questionKey) {
    const key = String(questionKey || '').trim();
    if (!key || this.hydratedKeys.has(key)) return;
    const persisted = readQuestionSolveTimerState(key, {
      storage: this.storage,
      maxDurationMs: this.maxDurationMs,
    });
    this.elapsedByKey.set(key, persisted.elapsedMs);
    this.baselineByKey.set(key, persisted.baselineMs);
    this.hydratedKeys.add(key);
  }

  persist(questionKey = this.activeKey) {
    const key = String(questionKey || '').trim();
    if (!key) return;
    writeQuestionSolveTimerState(key, {
      elapsedMs: this.elapsedByKey.get(key) || 0,
      baselineMs: this.baselineByKey.get(key) || 0,
    }, {
      storage: this.storage,
      maxDurationMs: this.maxDurationMs,
    });
  }

  commitActiveSegment() {
    if (!this.activeKey || this.segmentStartedAt === null) return;
    const elapsed = Math.max(0, this.now() - this.segmentStartedAt);
    const current = this.elapsedByKey.get(this.activeKey) || 0;
    this.elapsedByKey.set(
      this.activeKey,
      normalizeDurationMs(current + elapsed, this.maxDurationMs)
    );
    this.segmentStartedAt = null;
    this.persist(this.activeKey);
  }

  startActiveSegment() {
    if (
      !this.environmentActive
      || this.manuallyPaused
      || !this.activeKey
      || this.segmentStartedAt !== null
    ) return;
    this.segmentStartedAt = this.now();
  }

  applyBaseline(questionKey, initialDurationMs, mode = 'max') {
    const key = String(questionKey || '').trim();
    if (!key) return;
    this.hydrate(key);
    const baseline = normalizeDurationMs(initialDurationMs, this.maxDurationMs);
    const previousBaseline = this.baselineByKey.get(key) || 0;
    if (baseline <= previousBaseline) return;
    const current = this.elapsedByKey.get(key) || 0;
    const nextElapsed = mode === 'late'
      ? normalizeDurationMs(current + (baseline - previousBaseline), this.maxDurationMs)
      : Math.max(current, baseline);
    this.elapsedByKey.set(key, nextElapsed);
    this.baselineByKey.set(key, baseline);
    this.persist(key);
  }

  activate(questionKey, initialDurationMs = 0, { baselineMode = 'max' } = {}) {
    const nextKey = String(questionKey || '').trim();
    const changedQuestion = nextKey !== this.activeKey;
    this.commitActiveSegment();
    if (changedQuestion) this.manuallyPaused = false;
    this.activeKey = nextKey;
    if (!nextKey) return;
    this.hydrate(nextKey);
    this.applyBaseline(nextKey, initialDurationMs, baselineMode);
    this.startActiveSegment();
  }

  acknowledgeBaseline(durationMs, questionKey = this.activeKey) {
    const key = String(questionKey || '').trim();
    if (!key) return;
    const wasRunning = key === this.activeKey && this.segmentStartedAt !== null;
    if (wasRunning) this.commitActiveSegment();
    this.applyBaseline(key, durationMs, 'max');
    if (wasRunning) this.startActiveSegment();
  }

  setEnvironmentActive(active) {
    const nextActive = active === true;
    if (nextActive === this.environmentActive) return;
    this.commitActiveSegment();
    this.environmentActive = nextActive;
    if (nextActive) this.startActiveSegment();
  }

  pause() {
    this.commitActiveSegment();
    this.manuallyPaused = true;
  }

  resume() {
    this.manuallyPaused = false;
    this.startActiveSegment();
  }

  checkpoint() {
    const wasRunning = this.segmentStartedAt !== null;
    this.commitActiveSegment();
    if (wasRunning) this.startActiveSegment();
  }

  clear(questionKey = this.activeKey) {
    const key = String(questionKey || '').trim();
    if (!key) return;
    if (key === this.activeKey) {
      this.segmentStartedAt = null;
      this.activeKey = '';
      this.manuallyPaused = false;
    }
    this.elapsedByKey.delete(key);
    this.baselineByKey.delete(key);
    this.hydratedKeys.delete(key);
    clearQuestionSolveTimerState(key, { storage: this.storage });
  }

  getElapsedMs(questionKey = this.activeKey) {
    const key = String(questionKey || '').trim();
    if (!key) return 0;
    this.hydrate(key);
    let elapsed = this.elapsedByKey.get(key) || 0;
    if (key === this.activeKey && this.segmentStartedAt !== null) {
      elapsed += Math.max(0, this.now() - this.segmentStartedAt);
    }
    return normalizeDurationMs(elapsed, this.maxDurationMs);
  }
}

export const getLatestUnsolvedDurationMs = (history) => {
  const entries = Array.isArray(history) ? history : [];
  let latest = 0;
  for (const entry of entries) {
    if (entry?.correct === true) return 0;
    latest = Math.max(latest, normalizeDurationMs(entry?.solveDurationMs));
  }
  return latest;
};

export { DEFAULT_MAX_DURATION_MS as QUESTION_SOLVE_TIMER_MAX_DURATION_MS };
