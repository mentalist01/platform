import test from 'node:test';
import assert from 'node:assert/strict';
import { createLessonReplayJournal, REPLAY_LOCAL_STORAGE_ERROR } from './lessonReplayJournal.js';

const memoryStore = () => {
  const sessions = new Map();
  const records = new Map();
  return {
    sessions: async (owner) => [...sessions.values()].filter((session) => session.owner === owner).map((value) => structuredClone(value)),
    records: async (key, { all = false, mediaOnly = false } = {}) => [...records.values()].filter((record) => record.sessionKey === key && (!mediaOnly || record.kind !== 'event')).sort((a,b) => a.key.localeCompare(b.key)).slice(0, all ? undefined : 48).map((value) => structuredClone(value)),
    save: async (session, record) => { sessions.set(session.key, structuredClone(session)); if (record) records.set(record.key, structuredClone(record)); },
    acknowledge: async (keys) => keys.forEach((key) => records.delete(key)),
    acknowledgeEvents: async (sessionKey, ids) => { for (const [key, record] of records) if (record.sessionKey === sessionKey && record.kind === 'event' && ids.includes(record.id)) records.delete(key); },
    removeEmptySession: async (key) => { if (![...records.values()].some((record) => record.sessionKey === key)) sessions.delete(key); },
    removeSession: async (key) => {
      sessions.delete(key);
      for (const [recordKey, record] of records) if (record.sessionKey === key) records.delete(recordKey);
    },
  };
};
const session = { pendingKey: 'capture-one', sessionId: 'server-one', studentId: 'student-one', occurrenceKey: 'original-lesson', clockOffsetMs: 2000 };
const event = (id) => ({ id, type: 'board', occurredAt: '2026-09-06T12:00:00.000Z', payload: { mode: 'delta', upserts: [{ id }] } });
const harness = (store = memoryStore(), owner = 'teacher:one') => {
  const writes = [], audio = [], finishes = [], errors = [];
  const api = {
    appendLessonReplayEvents: async (id, events, options) => { writes.push({id,events,options}); return {ok:true}; },
    finishLessonReplaySession: async (id, options) => { finishes.push({id,options}); return {ok:true}; },
    prepareLessonReplayAudioSegment: async (id, metadata) => { audio.push({id,metadata}); return {audioId:metadata.clientUploadId,storage:'local'}; },
    uploadPreparedLessonReplayAudioSegment: async () => ({ok:true}),
    completeLessonReplayAudioSegment: async () => ({ok:true}),
  };
  const make = (extra={}) => createLessonReplayJournal({ owner,store,api,onError:(error)=>errors.push(error),...extra });
  return {store,api,writes,audio,finishes,errors,make};
};

test('reload recovers the exact original lesson, event IDs, clock and drawing order', async () => {
  const h = harness();
  const old = h.make();
  await old.register(session);
  for (let i=0;i<100;i++) await old.saveEvent(session,event(String(i)));
  await h.make().drain();
  assert.equal(h.writes.length,3);
  assert.deepEqual(h.writes.flatMap((write)=>write.events.map((e)=>e.id)), Array.from({length:100},(_,i)=>String(i)));
  assert.ok(h.writes.every((write)=>write.id==='server-one' && write.options.recovery && write.options.durable));
  assert.equal(h.writes[0].events[0].occurredAt,'2026-09-06T12:00:02.000Z');
  assert.equal((await h.store.sessions('teacher:one')).length,0);
});

test('offline data stays on disk across recovery attempts and sends when the server returns', async () => {
  const h=harness(); const old=h.make();
  await old.register(session); await old.saveEvent(session,event('kept'));
  const send=h.api.appendLessonReplayEvents;
  h.api.appendLessonReplayEvents=async()=>{throw new Error('503');};
  await h.make().drain();
  assert.equal((await h.store.records('teacher:one:capture-one')).length,1);
  h.api.appendLessonReplayEvents=send;
  await h.make().drain();
  assert.equal(h.writes[0].events[0].id,'kept');
});

test('capacity failure stops automatic journal retries until the user retries', async () => {
  const h = harness(); const journal = h.make();
  await journal.register(session, { live: false });
  await journal.saveEvent(session, event('too-large'));
  let attempts = 0;
  const send = h.api.appendLessonReplayEvents;
  h.api.appendLessonReplayEvents = async () => {
    attempts += 1;
    throw Object.assign(new Error('capacity'), { status: 413 });
  };
  await journal.drain();
  await journal.drain();
  assert.equal(attempts, 1);
  assert.equal((await h.store.records('teacher:one:capture-one')).length, 1);
  h.api.appendLessonReplayEvents = send;
  await journal.retry();
  assert.equal(h.writes[0].events[0].id, 'too-large');
});

test('a blocked local copy can be discarded without touching saved server data', async () => {
  const h = harness(); const journal = h.make();
  await journal.register(session, { live: false });
  await journal.saveEvent(session, event('too-large'));
  h.api.appendLessonReplayEvents = async () => {
    throw Object.assign(new Error('capacity'), { status: 413 });
  };
  await journal.drain();
  assert.equal(await journal.discardBlocked(), 1);
  assert.equal((await h.store.sessions('teacher:one')).length, 0);
  assert.equal((await h.store.records('teacher:one:capture-one')).length, 0);
  assert.equal(h.errors.at(-1), '');
});

test('response loss repeats the same IDs and leaves deduplication possible', async () => {
  const h=harness(); const old=h.make();
  await old.register(session); await old.saveEvent(session,event('same-id'));
  let requests=0; const send=h.api.appendLessonReplayEvents;
  h.api.appendLessonReplayEvents=async(...args)=>{await send(...args);if(++requests===1)throw new Error('response lost');return {ok:true};};
  await h.make().drain(); await h.make().drain();
  assert.deepEqual(h.writes.map((write)=>write.events[0].id),['same-id','same-id']);
});

test('another account cannot enumerate or upload the previous account recordings', async () => {
  const h=harness(); const old=h.make(); await old.register(session); await old.saveEvent(session,event('private'));
  await h.make({owner:'student:two'}).drain();
  assert.equal(h.writes.length,0);
  assert.equal((await h.store.records('teacher:one:capture-one')).length,1);
});

test('live acknowledgments cannot delete a newer event recorded while sending', async () => {
  const h=harness(); const live=h.make();await live.register(session);
  await live.saveEvent(session,event('first')); await live.saveEvent(session,event('second'));
  await live.acknowledge(session,['first']);
  assert.deepEqual((await h.store.records('teacher:one:capture-one')).map((record)=>record.id),['second']);
  await live.drain(); assert.equal(h.writes.length,0,'live events remain owned by the recorder');
});

test('blobs survive reload and use the same upload ID after an expired upload ticket', async () => {
  const h=harness(); const live=h.make();await live.register(session);
  await live.saveMedia(session,'audio',new Blob(['voice'],{type:'audio/webm'}),{occurredAt:event('x').occurredAt,durationMs:1000});
  let attempts=0;
  h.api.completeLessonReplayAudioSegment=async()=>{if(++attempts===1)throw new Error('ticket expired');return {ok:true};};
  await h.make().drain(); await h.make().drain();
  assert.equal(h.audio.length,2);
  assert.equal(h.audio[0].metadata.clientUploadId,h.audio[1].metadata.clientUploadId);
  assert.equal(h.audio[0].metadata.sizeBytes,5);
  assert.equal((await h.store.sessions('teacher:one')).length,0);
});

test('session binding survives a lost start response without guessing the next lesson', async () => {
  const h=harness(); const draft={...session,sessionId:''}; const live=h.make();
  await live.register(draft);await live.saveEvent(draft,event('offline-start'));
  h.api.startLessonReplaySession=async(id,options)=>{
    assert.equal(id,'student-one');assert.equal(options.clientSessionId,'capture-one');assert.equal(options.recovery,true);
    return {sessionId:'recovered-original',occurrenceKey:'original-lesson',clockOffsetMs:2000};
  };
  await h.make().drain();assert.equal(h.writes[0].id,'recovered-original');
});

test('a failed final confirmation is retried even after every event was accepted', async () => {
  const h=harness();const live=h.make();await live.register(session);await live.saveEvent(session,event('final'));
  await live.detach({...session,endedAt:'2026-09-06T13:00:00.000Z'});
  let attempts=0;h.api.finishLessonReplaySession=async()=>{if(++attempts===1)throw new Error('offline');};
  await h.make().drain();assert.equal((await h.store.sessions('teacher:one')).length,1);
  await h.make().drain();assert.equal(attempts,2);assert.equal((await h.store.sessions('teacher:one')).length,0);
});

test('a full local disk never reports that the audio has been safely queued', async () => {
  const h=harness();h.store.save=async()=>{throw new Error('QuotaExceededError');};const live=h.make();
  await assert.rejects(live.saveMedia(session,'audio',new Blob(['voice']),{}));
  assert.equal(h.errors.at(-1),REPLAY_LOCAL_STORAGE_ERROR);
});

test('logout during audio preparation stops later upload requests', async () => {
  const h=harness();const live=h.make();await live.register(session);await live.saveMedia(session,'audio',new Blob(['voice']),{});
  let current=true;let uploads=0;
  h.api.prepareLessonReplayAudioSegment=async()=>{current=false;return {audioId:'id',storage:'local'};};
  h.api.uploadPreparedLessonReplayAudioSegment=async()=>{uploads++;};
  await h.make({isCurrent:()=>current}).drain();assert.equal(uploads,0);
});

test('acknowledgement reaches events behind a media backlog without dropping that media', async () => {
  const h = harness(); const live = h.make(); await live.register(session);
  for (let i = 0; i < 50; i++) await live.saveMedia(session, 'audio', new Blob(['voice']), {});
  await live.saveEvent(session, event('accepted'));
  await live.acknowledge(session, ['accepted']);
  const backup = await h.make().snapshot();
  assert.equal(backup[0].records.length, 50);
  assert.ok(backup[0].records.every((record) => record.kind === 'audio'));
});

test('final time and clock offset survive rebinding and later retries', async () => {
  const h = harness(); const live = h.make();
  await live.detach({ ...session, endedAt: '2026-09-06T13:00:00.000Z' });
  await live.register(session, { live: false, closed: true });
  await h.make().drain();
  assert.equal(h.finishes[0].options.endedAt, '2026-09-06T13:00:02.000Z');
});

test('page protection remains active until the local transaction commits', async () => {
  const h = harness(); const live = h.make(); let commit;
  const save = h.store.save;
  h.store.save = (...args) => new Promise((resolve) => { commit = async () => { await save(...args); resolve(); }; });
  const saving = live.saveEvent(session, event('pending'));
  assert.equal(live.needsPageProtection(), true);
  await Promise.resolve(); await Promise.resolve();
  await commit(); await saving; await Promise.resolve();
  assert.equal(live.needsPageProtection(), false);
});

test('live audio behind more than one batch of board events is still uploaded', async () => {
  const h = harness(); const live = h.make(); await live.register(session);
  for (let i = 0; i < 60; i++) await live.saveEvent(session, event(`queued-${i}`));
  await live.saveMedia(session, 'audio', new Blob(['voice'], { type: 'audio/webm' }), { occurredAt: event('x').occurredAt, durationMs: 1000 });
  await live.drain();
  assert.equal(h.audio.length, 1);
  assert.equal(h.writes.length, 0, 'the live recorder retains ownership of board events');
});

test('closing a draft while recovery starts it preserves its final confirmation', async () => {
  const h = harness(); const live = h.make(); const draft = { ...session, sessionId: '' };
  await live.register(draft);
  await live.saveMedia(draft, 'audio', new Blob(['voice'], { type: 'audio/webm' }), { occurredAt: event('x').occurredAt, durationMs: 1000 });
  h.api.startLessonReplaySession = async () => {
    await live.detach({ ...draft, endedAt: '2026-09-06T13:00:00.000Z' });
    return { sessionId: 'recovered-original', occurrenceKey: 'original-lesson', clockOffsetMs: 2000 };
  };
  await live.drain();
  assert.equal(h.finishes.length, 1);
  assert.equal(h.finishes[0].options.endedAt, '2026-09-06T13:00:02.000Z');
});

test('closing a live session during an empty outbox read still confirms its end', async () => {
  const h = harness(); const live = h.make(); await live.register(session);
  h.store.records = async () => {
    await live.detach({ ...session, endedAt: '2026-09-06T13:00:00.000Z' });
    return [];
  };
  await live.drain();
  assert.equal(h.finishes.length, 1);
  assert.equal(h.finishes[0].options.endedAt, '2026-09-06T13:00:02.000Z');
});
