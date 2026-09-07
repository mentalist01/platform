import { createLessonReplayJournalStore } from './lessonReplayJournalStore.js';

export const REPLAY_LOCAL_STORAGE_ERROR = 'Не удалось сохранить резерв записи в браузере. Не закрывайте страницу до завершения отправки.';
export const REPLAY_UPLOAD_PENDING = 'Часть записи сохранена в браузере и будет отправлена автоматически после восстановления связи.';

const descriptor = (session = {}) => ({
  pendingKey: session.pendingKey || session.sessionId,
  sessionId: session.sessionId || '',
  studentId: session.studentId || '',
  learningLessonId: session.learningLessonId || '',
  occurrenceKey: session.occurrenceKey || '',
  via: session.via || 'platform',
  clockOffsetMs: Number(session.clockOffsetMs) || 0,
  createdAt: session.createdAt || Date.now(),
  endedAt: session.endedAt || '',
});
const adjustTime = (value, session) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time + session.clockOffsetMs).toISOString() : value;
};

// The journal is separate from the live recorder so it also drains on the
// dashboard after a reload, before another call has been opened.
export function createLessonReplayJournal({ owner, api, store = createLessonReplayJournalStore(), onError = () => {}, isCurrent = () => true }) {
  let tail = Promise.resolve();
  let draining;
  let sequence = 0;
  let pendingWrites = 0;
  let storageFailed = false;
  const descriptors = new Map();
  const active = new Set();
  const blocked = new Map();
  const enabled = Boolean(owner);
  const keyFor = (session) => `${owner}:${session.pendingKey || session.sessionId}`;
  const enqueue = (operation) => {
    pendingWrites++;
    const next = tail.catch(() => {}).then(operation);
    tail = next;
    next.catch(() => { storageFailed = true; if (isCurrent()) onError(REPLAY_LOCAL_STORAGE_ERROR); })
      .finally(() => { pendingWrites--; });
    return next;
  };
  const register = (session, { live = true, closed = false } = {}) => {
    if (!enabled || !session || !(session.pendingKey || session.sessionId)) return Promise.resolve();
    const key = keyFor(session);
    const previous = descriptors.get(key);
    const entry = { ...previous, ...descriptor(session), endedAt: session.endedAt || previous?.endedAt || '',
      key, owner, closed, updatedAt: Date.now() };
    descriptors.set(key, entry);
    if (live) active.add(key); else active.delete(key);
    return enqueue(() => store.save(entry));
  };
  const save = (session, kind, content, id) => {
    if (!enabled) return Promise.resolve(null);
    const sessionKey = keyFor(session);
    const record = {
      key: `${sessionKey}:${String(++sequence).padStart(12, '0')}:${id}`,
      sessionKey, kind, id, ...content,
    };
    // Capture ownership and payload now; a later student switch cannot reassign it.
    const initial = descriptor(session);
    return enqueue(async () => {
      const entry = descriptors.get(sessionKey) || { ...initial, owner, key: sessionKey, closed: false };
      await store.save(entry, record);
      return record;
    });
  };
  const acknowledge = async (session, ids) => {
    if (!enabled) return;
    await tail.catch(() => {});
    // Only delete the acknowledged IDs, including when new edits arrived in flight.
    await store.acknowledgeEvents(keyFor(session), ids);
  };
  const sendMedia = async (entry, record) => {
    const checkOwner = () => { if (!isCurrent()) throw new Error('Recording owner changed'); };
    checkOwner();
    const metadata = { ...record.metadata, occurredAt: adjustTime(record.metadata.occurredAt, entry), clientUploadId: record.id };
    if (record.kind === 'screen') {
      return api.uploadLessonReplaySnapshot(entry.sessionId, record.blob, { ...metadata, recovery: true });
    }
    const prepared = await api.prepareLessonReplayAudioSegment(entry.sessionId, {
      ...metadata, mimeType: record.blob.type || metadata.mimeType, sizeBytes: record.blob.size,
    }, { recovery: true });
    if (prepared.completed) return prepared;
    checkOwner();
    if (prepared.storage === 'local') {
      await api.uploadPreparedLessonReplayAudioSegment(prepared.audioId, record.blob, metadata);
    } else {
      const response = await fetch(prepared.uploadUrl, {
        method: 'PUT', headers: prepared.headers, body: record.blob,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw Object.assign(new Error('Audio upload failed'), { status: response.status });
    }
    checkOwner();
    return api.completeLessonReplayAudioSegment(prepared.audioId);
  };
  const drain = () => {
    if (!enabled || !isCurrent()) return Promise.resolve();
    if (draining) return draining;
    const run = async () => {
      await tail.catch(() => {});
      let failed = false;
      let permanentError = '';
      for (let entry of await store.sessions(owner)) {
        if (!isCurrent()) return;
        if (blocked.has(entry.key)) {
          permanentError ||= blocked.get(entry.key);
          continue;
        }
        try {
          let records = await store.records(entry.key);
          if (!isCurrent()) return;
          if (!records.length) {
            if (!active.has(entry.key)) {
              if (entry.closed && entry.sessionId) await api.finishLessonReplaySession(entry.sessionId, { recovery: true, endedAt: adjustTime(entry.endedAt, entry) });
              await store.removeEmptySession(entry.key);
            }
            continue;
          }
          // Live board events retain their existing batching/order. Media uploads
          // are journal-owned, while orphaned events are recovered after reload.
          if (active.has(entry.key) && records.every((record) => record.kind === 'event')) continue;
          if (!entry.sessionId) {
            const response = await api.startLessonReplaySession(entry.studentId, {
              ...entry, clientSessionId: entry.pendingKey, recovery: true,
            });
            entry = { ...entry, sessionId: response.sessionId, occurrenceKey: response.occurrenceKey,
              clockOffsetMs: Number.isFinite(Number(response.clockOffsetMs)) ? Number(response.clockOffsetMs) : entry.clockOffsetMs };
            descriptors.set(entry.key, entry);
            await store.save(entry);
          }
          // Bound each session's turn to keep other lessons responsive.
          for (let batch = 0; batch < 12 && records.length && isCurrent(); batch++) {
            const first = records.find((record) => !active.has(entry.key) || record.kind !== 'event');
            if (!first) break;
            if (first.kind === 'event') {
              const events = records.slice(0, records.findIndex((record) => record.kind !== 'event') < 0
                ? records.length : records.findIndex((record) => record.kind !== 'event'));
              await api.appendLessonReplayEvents(entry.sessionId, events.map((record) => ({
                ...record.event, occurredAt: adjustTime(record.event.occurredAt, entry),
              })), { recovery: true, durable: true });
              if (!isCurrent()) return;
              await store.acknowledge(events.map((record) => record.key));
            } else {
              await sendMedia(entry, first);
              if (!isCurrent()) return;
              await store.acknowledge([first.key]);
            }
            records = await store.records(entry.key);
          }
          if (!isCurrent()) return;
          if (!records.length && !active.has(entry.key)) {
            if (entry.closed) await api.finishLessonReplaySession(entry.sessionId, { recovery: true, endedAt: adjustTime(entry.endedAt, entry) });
            await store.removeEmptySession(entry.key);
          }
        } catch (error) {
          failed = true;
          if ([400, 403, 404, 409, 413, 507].includes(error?.status)) {
            permanentError = error.message;
            blocked.set(entry.key, permanentError);
          }
        }
      }
      if (isCurrent()) onError(storageFailed ? REPLAY_LOCAL_STORAGE_ERROR : permanentError
        ? `Часть записи остаётся в браузере. ${permanentError}` : failed ? REPLAY_UPLOAD_PENDING : '');
    };
    draining = (async () => {
      if (globalThis.navigator?.locks?.request) {
        await navigator.locks.request(`lesson-replay-upload:${owner}`, { ifAvailable: true }, (lock) => lock ? run() : undefined);
      } else await run();
    })().catch(() => { if (isCurrent()) onError(REPLAY_LOCAL_STORAGE_ERROR); }).finally(() => { draining = null; });
    return draining;
  };
  return {
    register,
    saveEvent: (session, event) => save(session, 'event', { event: structuredClone(event) }, event.id),
    saveMedia: (session, kind, blob, metadata) => save(session, kind, { blob, metadata }, crypto.randomUUID()),
    acknowledge,
    settle: () => tail.catch(() => {}),
    snapshot: async () => {
      if (!enabled) return [];
      await tail.catch(() => {});
      const sessions = await store.sessions(owner);
      return Promise.all(sessions.map(async (session) => ({ session, records: await store.records(session.key, { all: true }) })));
    },
    needsPageProtection: () => pendingWrites > 0 || storageFailed,
    detach: (session) => register(session, { live: false, closed: true }),
    drain,
    retry: () => { blocked.clear(); return drain(); },
  };
}
