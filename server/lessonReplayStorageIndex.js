export const LESSON_REPLAY_STORAGE_INDEX_VERSION = 1;

const STORAGE_FIELDS = ['dataBytes', 'snapshotBytes', 'audioBytes'];

const normalizeBytes = (value) => (
  Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0
);

export const normalizeLessonReplayStorageEntry = (value = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const entry = {
    dataBytes: normalizeBytes(source.dataBytes),
    snapshotBytes: normalizeBytes(source.snapshotBytes),
    audioBytes: normalizeBytes(source.audioBytes),
    updatedAt: String(source.updatedAt || '').trim().slice(0, 40),
  };
  return {
    ...entry,
    totalBytes: entry.dataBytes + entry.snapshotBytes + entry.audioBytes,
  };
};

export const mergeLessonReplayStorageEntry = (current, patch = {}, increments = {}) => {
  const previous = normalizeLessonReplayStorageEntry(current);
  const next = { ...previous };
  STORAGE_FIELDS.forEach((field) => {
    if (Object.hasOwn(patch || {}, field) && Number.isFinite(Number(patch[field]))) {
      next[field] = normalizeBytes(patch[field]);
    }
    if (Number.isFinite(Number(increments?.[field]))) {
      next[field] = normalizeBytes(next[field] + Number(increments[field]));
    }
  });
  next.updatedAt = String(patch?.updatedAt || previous.updatedAt || '').trim().slice(0, 40);
  next.totalBytes = next.dataBytes + next.snapshotBytes + next.audioBytes;
  return next;
};

export const normalizeLessonReplayStorageIndex = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const entries = source.entries && typeof source.entries === 'object' ? source.entries : {};
  const result = new Map();
  Object.entries(entries).forEach(([hash, entry]) => {
    const normalizedHash = String(hash || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalizedHash)) return;
    result.set(normalizedHash, normalizeLessonReplayStorageEntry(entry));
  });
  return result;
};

export const serializeLessonReplayStorageIndex = (entries) => ({
  version: LESSON_REPLAY_STORAGE_INDEX_VERSION,
  entries: Object.fromEntries(
    Array.from(entries instanceof Map ? entries.entries() : [])
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([hash, entry]) => [hash, normalizeLessonReplayStorageEntry(entry)])
  ),
});
