import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {
  createLessonReplayBoardRecordingState,
  evaluateLessonReplayBoardPayload,
} from '../utils/lessonReplayBoardRecording.js';

// Run the hook's effects with a deterministic browser clock and API. No DOM
// is required: this hook only owns refs, timers, and background requests.
const source = (await readFile(new URL('./useLessonReplayRecorder.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
  .replace('export default useLessonReplayRecorder;', 'globalThis.useRecorder = useLessonReplayRecorder;');

const createHarness = async (configureApi = () => {}) => {
  let now = 1_700_000_000_000;
  let timerId = 0;
  const timers = new Map();
  const effects = [];
  const writes = [];
  const finishes = [];
  const messages = [];
  const listeners = new Map();
  const downloads = [];
  const hookSlots = [];
  let hookIndex = 0;
  const depsChanged = (previous, next) => !previous || !next
    || previous.length !== next.length || previous.some((value, index) => value !== next[index]);
  const api = {
    startLessonReplaySession: async () => ({ sessionId: 'session', serverNowMs: now }),
    appendLessonReplayEvents: async (id, events) => { writes.push({ id, events }); return {}; },
    finishLessonReplaySession: async (id, options) => { finishes.push({ id, options }); return {}; },
  };
  const window = {
    setTimeout: (callback, delay) => {
      timers.set(++timerId, { callback, at: now + delay });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  };
  configureApi(api, window);
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    api, window, Date: ClockDate, Blob, AbortController,
    URL: { createObjectURL: (blob) => { downloads.push(blob); return 'blob:backup'; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() {} }) },
    useRef: (value) => (hookSlots[hookIndex++] ||= { current: value }),
    useCallback: (callback, deps) => {
      const index = hookIndex++;
      if (depsChanged(hookSlots[index]?.deps, deps)) hookSlots[index] = { callback, deps };
      return hookSlots[index].callback;
    },
    useState: (value) => {
      const index = hookIndex++;
      hookSlots[index] ||= { value };
      return [hookSlots[index].value, (message) => { hookSlots[index].value = message; messages.push(message); }];
    },
    useEffect: (callback, deps) => {
      const index = hookIndex++;
      const previous = hookSlots[index];
      if (!depsChanged(previous?.deps, deps)) return;
      effects.push(() => {
        previous?.cleanup?.();
        hookSlots[index] = { deps, cleanup: callback() };
      });
    },
    createLessonReplayBoardRecordingState, evaluateLessonReplayBoardPayload,
  });
  vm.runInContext(source, context);
  let props = { active: true, studentId: 'student' };
  let hook;
  const render = (next = {}) => {
    props = { ...props, ...next };
    hookIndex = 0;
    hook = context.useRecorder(props);
    effects.splice(0).forEach((effect) => effect());
  };
  render();
  const settle = async () => { for (let index = 0; index < 50; index++) await Promise.resolve(); };
  await settle();
  const advance = async (elapsed) => {
    const target = now + elapsed;
    while (true) {
      await settle();
      const next = [...timers].filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].callback();
    }
    now = target;
    await settle();
  };
  await advance(0);
  return { get hook() { return hook; }, writes, finishes, messages, downloads, advance, settle, api, listeners, render };
};

test('continuous edits flush within eight seconds without waiting for a pause', async () => {
  const h = await createHarness();
  for (let index = 0; index < 20; index++) {
    h.hook.recordLessonReplayEvent('code', { code: `print(${index})` });
    await h.advance(1000);
    if (index === 7) assert.equal(h.writes.length, 1);
  }
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[0].events.length, 8);
  await h.hook.finishLessonReplayNow();
  assert.equal(h.finishes[0].options.events.length, 4);
});

test('finishing waits for queued audio even when draining takes over twenty seconds', async () => {
  let audioId = 0;
  let completed = 0;
  const h = await createHarness((api, window) => {
    api.prepareLessonReplayAudioSegment = async () => ({ storage: 'local', audioId: `${++audioId}` });
    api.uploadPreparedLessonReplayAudioSegment = () => new Promise((resolve) => window.setTimeout(resolve, 10_000));
    api.completeLessonReplayAudioSegment = async () => { completed++; return {}; };
  });
  const uploads = Array.from({ length: 3 }, () => h.hook.uploadLessonReplayAudioSegment(new Blob(['audio'])));
  const finish = h.hook.finishLessonReplayNow();
  await h.advance(21_000);
  assert.equal(completed, 2);
  assert.equal(h.finishes.length, 0, 'session must remain open for the last audio segment');
  await h.advance(10_000);
  await Promise.all(uploads);
  await finish;
  assert.equal(completed, 3);
  assert.equal(h.finishes.length, 1);
});

test('immediate events advance a scheduled flush and subsequent events cannot postpone it', async () => {
  const h = await createHarness();
  h.hook.recordLessonReplayEvent('code', { code: 'first' });
  await h.advance(1000);
  h.hook.recordLessonReplayEvent('navigation', { view: 'board' }, { immediate: true });
  h.hook.recordLessonReplayEvent('code', { code: 'second' });
  await h.advance(0);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].events.length, 3);
});

test('an overflowing offline queue keeps every board edit and saves them in order', async () => {
  const h = await createHarness();
  const write = h.api.appendLessonReplayEvents;
  h.api.appendLessonReplayEvents = async () => { throw new Error('offline'); };
  const expected = [];
  h.hook.recordLessonReplayEvent('board', { mode: 'snapshot', items: [] });
  for (let index = 0; index < 6201; index++) {
    const payload = { mode: 'delta', actorVerified: true, removedIds: [], upserts: [{
      index: 0, item: { id: `note-${index % 202}`, type: 'text', text: `${index}` },
    }] };
    expected.push(payload);
    assert.equal(h.hook.recordLessonReplayEvent('board', payload), true);
    if (index % 100 === 0) h.hook.recordLessonReplayEvent('viewport', { surface: 'board', x: index });
  }
  await h.advance(8000);
  assert.equal(h.writes.length, 0);
  assert.ok(h.messages.some((message) => message.includes('ожидает сохранения')));
  h.api.appendLessonReplayEvents = write;
  await h.hook.finishLessonReplayNow();
  const saved = [...h.writes.flatMap((entry) => entry.events), ...h.finishes.flatMap((entry) => entry.options.events)]
    .filter((event) => event.type === 'board');
  assert.equal(saved.length, 6202);
  assert.equal(saved[0].payload.mode, 'snapshot');
  assert.deepEqual(saved.slice(1).map((event) => event.payload), expected);
});

test('expired recording session restarts for the same lesson without losing queued board data', async () => {
  const starts = [];
  const h = await createHarness((api) => {
    api.startLessonReplaySession = async (studentId, options) => {
      starts.push(options);
      return { sessionId: `session-${starts.length}`, occurrenceKey: 'same-lesson' };
    };
  });
  const write = h.api.appendLessonReplayEvents;
  let calls = 0;
  h.api.appendLessonReplayEvents = async (...args) => {
    if (++calls === 1) throw Object.assign(new Error('Сессия записи истекла'), { status: 410 });
    return write(...args);
  };
  h.hook.recordLessonReplayEvent('board', { mode: 'snapshot', items: [{ id: 'kept' }] });
  await h.advance(11_000);
  assert.equal(starts.length, 2);
  assert.equal(starts[1].occurrenceKey, 'same-lesson');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].id, 'session-2');
  assert.equal(h.writes[0].events[0].payload.items[0].id, 'kept');
});

test('failed final save remains available for a later retry', async () => {
  const h = await createHarness();
  const finish = h.api.finishLessonReplaySession;
  h.api.finishLessonReplaySession = async () => { throw Object.assign(new Error('capacity'), { status: 413 }); };
  h.hook.recordLessonReplayEvent('board', { mode: 'snapshot', items: [{ id: 'unsaved' }] });
  await assert.rejects(h.hook.finishLessonReplayNow({ keepalive: true }), /capacity|последние действия/);
  h.api.finishLessonReplaySession = finish;
  await h.hook.retryLessonReplaySave();
  assert.equal(h.finishes.length, 1);
  assert.equal(h.finishes[0].options.events[0].payload.items[0].id, 'unsaved');
  assert.equal(h.finishes[0].options.keepalive, false, 'foreground retry must not have the unload body-size restriction');
  assert.equal(h.messages.at(-1), '');
});

test('a full recording preserves its queue without continuously retrying the capacity error', async () => {
  const h = await createHarness();
  const write = h.api.appendLessonReplayEvents;
  let calls = 0;
  h.api.appendLessonReplayEvents = async () => {
    calls++;
    throw Object.assign(new Error('capacity'), { status: 413 });
  };
  h.hook.recordLessonReplayEvent('board', { mode: 'snapshot', items: [{ id: 'kept' }] });
  await h.advance(60_000);
  assert.equal(calls, 1);
  h.api.appendLessonReplayEvents = write;
  await h.hook.retryLessonReplaySave();
  assert.equal(h.writes[0].events[0].payload.items[0].id, 'kept');
});

test('reconnection triggers a retry even if the board has not changed again', async () => {
  const h = await createHarness();
  const write = h.api.appendLessonReplayEvents;
  h.api.appendLessonReplayEvents = async () => { throw new Error('offline'); };
  h.hook.recordLessonReplayEvent('board', { mode: 'snapshot', items: [{ id: 'offline' }] });
  await h.advance(8000);
  h.api.appendLessonReplayEvents = write;
  h.listeners.get('online')();
  await h.settle();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].events[0].payload.items[0].id, 'offline');
});

test('backup includes both an in-flight batch and queued edits without credentials', async () => {
  const h = await createHarness((api) => {
    api.startLessonReplaySession = async () => ({ sessionId: 'session', token: 'secret' });
  });
  let complete;
  h.api.appendLessonReplayEvents = () => new Promise((resolve) => { complete = resolve; });
  h.hook.recordLessonReplayEvent('board', { mode: 'snapshot', items: [{ id: 'first' }] });
  await h.advance(8000);
  h.hook.recordLessonReplayEvent('board', { mode: 'delta', actorVerified: true, upserts: [{ index: 1, item: { id: 'second' } }] });
  h.hook.downloadLessonReplayBackup();
  const json = await h.downloads[0].text();
  const backup = JSON.parse(json);
  assert.equal(backup.sessions.length, 1);
  assert.equal(backup.sessions[0].studentId, 'student');
  assert.equal(backup.sessions[0].events.length, 2);
  assert.equal(backup.sessions[0].events[0].payload.items[0].id, 'first');
  assert.equal(json.includes('secret'), false);
  complete({});
  await h.settle();
});

test('leaving after session expiration preserves the original lesson backup', async () => {
  let starts = 0;
  const h = await createHarness((api) => {
    api.startLessonReplaySession = async () => {
      if (++starts > 1) throw new Error('offline');
      return { sessionId: 'expired', occurrenceKey: 'original-lesson' };
    };
    api.appendLessonReplayEvents = async () => { throw Object.assign(new Error('expired'), { status: 410 }); };
  });
  h.hook.recordLessonReplayEvent('board', { mode: 'snapshot', items: [{ id: 'offline' }] });
  await h.advance(8000);
  h.render({ active: false });
  await h.settle();
  h.hook.downloadLessonReplayBackup();
  const backup = JSON.parse(await h.downloads[0].text());
  assert.equal(backup.sessions[0].occurrenceKey, 'original-lesson');
  assert.equal(backup.sessions[0].events[0].payload.items[0].id, 'offline');
});

test('switching students keeps detached edits out of the new lesson', async () => {
  const h = await createHarness((api) => {
    api.startLessonReplaySession = async (studentId) => ({ sessionId: studentId, occurrenceKey: `${studentId}-lesson` });
    api.appendLessonReplayEvents = async () => { throw Object.assign(new Error('expired'), { status: 410 }); };
    api.finishLessonReplaySession = async () => { throw Object.assign(new Error('ended'), { status: 410 }); };
  });
  h.hook.recordLessonReplayEvent('board', { mode: 'snapshot', items: [{ id: 'old' }] });
  h.render({ studentId: 'next-student' });
  await h.settle();
  h.hook.recordLessonReplayEvent('board', { mode: 'snapshot', items: [{ id: 'new' }] });
  h.hook.downloadLessonReplayBackup();
  const backup = JSON.parse(await h.downloads[0].text());
  assert.equal(backup.sessions.length, 2);
  for (const session of backup.sessions) {
    assert.equal(session.events.length, 1);
    assert.equal(session.events[0].payload.items[0].id, session.studentId === 'student' ? 'old' : 'new');
  }
});

test('edits made before a session starts survive finish failure and retry', async () => {
  const h = await createHarness((api) => {
    api.startLessonReplaySession = async () => { throw Object.assign(new Error('offline'), { status: 503 }); };
  });
  h.hook.recordLessonReplayEvent('board', { mode: 'snapshot', items: [{ id: 'before-start' }] });
  await assert.rejects(h.hook.finishLessonReplayNow());
  h.hook.downloadLessonReplayBackup();
  assert.equal(JSON.parse(await h.downloads[0].text()).sessions[0].events.length, 1);
  h.api.startLessonReplaySession = async () => ({ sessionId: 'recovered' });
  // Recovering a session can itself encounter a final-save error. It must
  // replace the same recovery entry, not orphan the original backup.
  const finish = h.api.finishLessonReplaySession;
  h.api.finishLessonReplaySession = async () => { throw Object.assign(new Error('capacity'), { status: 413 }); };
  await h.hook.retryLessonReplaySave();
  h.api.finishLessonReplaySession = finish;
  await h.hook.retryLessonReplaySave();
  assert.equal(h.finishes.length, 1);
  assert.equal(h.finishes[0].options.events[0].payload.items[0].id, 'before-start');
  assert.equal(h.messages.at(-1), '');
  h.hook.downloadLessonReplayBackup();
  assert.equal(JSON.parse(await h.downloads[1].text()).sessions.flatMap((session) => session.events).length, 0);
});
