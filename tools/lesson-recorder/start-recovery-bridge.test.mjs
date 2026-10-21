import test from 'node:test';
import assert from 'node:assert/strict';
import { failedStartRecoveryTarget, recoverFailedStart } from './start-recovery-bridge.mjs';
const id = 'c0b33b1c-bf9b-442a-b19f-51090b43e882', now = 100000;
const obsProcess = { pid: 101, startedAt: 85000 };
const state = () => ({ ready: true, obs: { outputActive: false }, recordDirectory: 'D:/recordings',
  currentLesson: { id, desired: 'record', cutoffAt: 200000, occurrence: { key: 'current' } },
  jobs: [{ id, status: 'error', error: 'Не удалось начать запись: OBS отключился.', createdAt: 80000, occurrence: { key: 'current' } }],
});

test('restored idle filenames do not prevent recovery, while a different OBS profile does', async () => {
  for (const mode of ['old-filename', 'different-profile']) {
    let retried = false;
    const obs = {
      assertCollection: async () => { if (mode === 'different-profile') throw Error('Different OBS profile'); },
      call: async type => type === 'GetProfileParameter' ? { parameterValue: 'old-lesson' } : { outputActive: false },
    };
    const operation = recoverFailedStart({ state: state(), process: obsProcess, obs, now, exists: () => false,
      request: async route => { if (route === '/retry-start') retried = true; return state(); } });
    if (mode === 'different-profile') await assert.rejects(operation, /Different OBS profile/);
    else assert.equal(await operation, true);
    assert.equal(retried, mode === 'old-filename');
  }
});

test('bridge only accepts an unrecorded live lesson after a proven OBS process replacement', () => {
  assert.equal(failedStartRecoveryTarget(state(), obsProcess, now).id, id);
  for (const change of [s => { s.obs.outputActive = true; }, s => { s.jobs[0].status = 'recording'; },
    s => { s.jobs[0].file = 'preserved.mkv'; }, s => { s.currentLesson.desired = 'stop'; },
    s => { s.currentLesson.cutoffAt = 1; }, s => { s.jobs[0].error = 'OBS ещё не подтвердил запуск записи'; },
    s => { s.jobs[0].local = true; }, s => { s.currentLesson.occurrence.key = 'other'; },
    s => { s.jobs.push({ status: 'starting' }); }, s => { s.ready = false; }]) {
    const s = state(); change(s); assert.equal(failedStartRecoveryTarget(s, obsProcess, now), null);
  }
  assert.equal(failedStartRecoveryTarget(state(), { ...obsProcess, startedAt: 79000 }, now), null);
});
test('bridge retries through existing panel API only after independent ownership/stream/file checks', async () => {
  for (const mode of ['ok', 'stream', 'record', 'file', 'changed']) {
    const requests = [];
    const obs = { assertCollection: async () => {}, call: async type => type === 'GetProfileParameter'
      ? { parameterValue: mode === 'foreign' ? 'foreign' : `lesson-${id}` }
      : { outputActive: (type === 'GetRecordStatus' && mode === 'record') || (type === 'GetStreamStatus' && mode === 'stream') } };
    const request = async (route, body) => {
      requests.push([route, body]); const fresh = state(); if (mode === 'changed') fresh.jobs[0].status = 'starting'; return fresh;
    };
    assert.equal(await recoverFailedStart({ state: state(), process: obsProcess, obs, request, exists: () => mode === 'file', now }), mode === 'ok', mode);
    assert.equal(requests.some(([route]) => route === '/retry-start'), mode === 'ok', mode);
  }
});
