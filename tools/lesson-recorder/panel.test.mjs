import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const panel = fs.readFileSync(new URL('./panel.html', import.meta.url), 'utf8');
const source = panel.slice(panel.indexOf('function recordingHeadline('), panel.indexOf('function renderRecordingHeadline('));
const headline = vm.runInNewContext(`(${source})`);
const job = { id: 'one', status: 'recording', lessonName: 'Олег', title: 'Урок 2026-09-26 17:00' };
const live = { jobs: [job], obs: { outputActive: true, outputTimecode: '00:12:34.500' } };

const startReason = vm.runInNewContext(`(${panel.slice(panel.indexOf('function pythonStartReason('), panel.indexOf('function pythonPauseView('))})`);
const pauseView = vm.runInNewContext(`(${panel.slice(panel.indexOf('function pythonPauseView('), panel.indexOf('function pythonButtons('))})`);

test('Python controls distinguish recording, pause, pending command and lost confirmation', () => {
  const state = { ...live, jobs: [{ ...job, pythonTheory: {} }] };
  assert.equal(pauseView(live).visible, false);
  assert.equal(pauseView(state).label, 'Пауза');
  assert.equal(pauseView(state).disabled, false);
  const paused = { ...state, obs: { ...state.obs, outputPaused: true } };
  assert.equal(pauseView(paused).label, 'Продолжить');
  assert.match(pauseView(paused).detail, /не записываются/);
  assert.equal(pauseView(state, { paused: true }).label, 'Ставим на паузу…');
  assert.equal(pauseView(paused, { paused: false }).label, 'Продолжаем…');
  assert.equal(pauseView(state, { paused: true }).disabled, true);
  assert.equal(pauseView(state, null, true).disabled, true);
  assert.equal(pauseView({ ...state, obs: null }).disabled, true);
  assert.equal(pauseView({ ...state, jobs: [{ ...state.jobs[0], status: 'stopping' }] }).disabled, true);
  assert.equal(pauseView({ ...state, jobs: [{ ...state.jobs[0], status: 'saved' }] }).visible, false);
});
test('Python record button explains temporary blockers and re-enables once idle', () => {
  const idle = { jobs: [], obs: { outputActive: false }, paired: true, ready: true };
  assert.equal(startReason(idle, {}), '');
  assert.match(startReason({ ...idle, uploadingId: 'previous' }, {}), /загрузки/);
  assert.match(startReason({ ...idle, preparingUpload: true }, {}), /подготовки/);
  assert.match(startReason({ ...idle, archiveBusy: true }, {}), /паузу/);
  assert.match(startReason({ ...idle, ...live }, {}), /текущую запись/);
  assert.match(startReason(idle, null), /тему и подраздел/);
  assert.match(startReason({ ...idle, ready: false }, {}), /OBS/);
  assert.equal(startReason(idle, {}), '');
});
test('independent Python readiness does not depend on the normal lesson window, but still respects an active output and update', () => {
  const python = { jobs: [], paired: true, ready: false, pythonReady: true, obs: { outputActive: false }, sourceWarnings: ['lesson window closed'] };
  assert.equal(startReason(python, {}, false, true), '');
  assert.equal(startReason(python, {}).includes('lesson window closed'), true);
  assert.match(startReason({ ...python, pythonReady: false, pythonSourceReason: 'Выберите микрофон для Python.' }, {}, false, true), /микрофон для Python/);
  assert.match(startReason({ ...python, obs: { outputActive: true } }, {}, false, true), /текущую запись/);
  assert.match(startReason({ ...python, updater: { busy: true } }, {}, false, true), /обновляется/);
});

test('review transport has the same confirmed pause and continue states as Python', () => {
  const state = { ...live, jobs: [{ ...job, mockReview: { examId: 'exam' } }] };
  assert.equal(pauseView(state).visible, true);
  assert.equal(pauseView(state).disabled, false);
  assert.equal(pauseView({ ...state, obs: { ...state.obs, outputPaused: true } }).label, 'Продолжить');
});

test('headline shows the actual recording student and OBS elapsed time', () => {
  const view = headline(live);
  assert.equal(view.name, 'Олег');
  assert.equal(view.status, 'Идёт запись');
  assert.equal(view.time, '00:12:34');
  assert.equal(view.detail, job.title);
  assert.equal(headline({ ...live, currentLesson: { lessonName: 'Другой ученик' } }).name, 'Олег');
});

test('crash recovery explains the preserved first part without claiming a running recording', () => {
  const recovering = { jobs: [{ ...job, status: 'saved', resumeAfterRestart: true }], obs: { outputActive: false } };
  const view = headline(recovering);
  assert.equal(view.status, 'Готовы продолжить запись');
  assert.match(view.detail, /Первая часть сохранена/);
  assert.equal(view.time, '');
  assert.equal(headline({ ...recovering, ...live }).status, 'Идёт запись');
});

test('a stale job, offline helper, or lost OBS connection cannot claim recording is running', () => {
  assert.equal(headline({ ...live, obs: { outputActive: false } }).status, 'Запись не идёт');
  for (const view of [headline(live, true), headline({ ...live, obs: null })]) {
    assert.equal(view.status, 'Статус записи неизвестен');
    assert.equal(view.name, 'Олег');
    assert.equal(view.time, '');
  }
});

test('idle, starting, stopping, pause and unbound recordings have distinct truthful labels', () => {
  assert.equal(headline({ jobs: [], obs: { outputActive: false } }).name, 'Ждём начала урока');
  assert.equal(headline({ jobs: [{ ...job, status: 'starting' }], obs: { outputActive: false } }).status, 'Запись запускается');
  assert.equal(headline({ jobs: [{ ...job, status: 'stopping' }], obs: live.obs }).status, 'Завершаем запись');
  assert.equal(headline({ ...live, obs: { ...live.obs, outputPaused: true } }).status, 'Запись на паузе');
  assert.equal(headline({ ...live, obs: { ...live.obs, scene: 'IVAN100 — Перерыв' } }).status, 'Перерыв в записи');
  assert.equal(headline({ jobs: [], currentLesson: job, obs: live.obs }).name, 'Урок не определён');
  assert.equal(headline({ jobs: [], currentLesson: job, obs: { outputActive: false } }).name, 'Олег');
});

test('switching to a group and continuing a lesson never retains the previous student', () => {
  const view = headline({ ...live, jobs: [{ ...job, id: 'two', lessonName: 'Группа 1', previousJobId: 'part-one' }] });
  assert.equal(view.name, 'Группа 1');
  assert.match(view.detail, /Продолжение урока/);
  const legacy = headline({ ...live, jobs: [{ ...job, lessonName: '' }] });
  assert.equal(legacy.name, job.title);
});
