import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const panel = fs.readFileSync(new URL('./panel.html', import.meta.url), 'utf8');
const source = panel.slice(panel.indexOf('function recordingHeadline('), panel.indexOf('function renderRecordingHeadline('));
const headline = vm.runInNewContext(`(${source})`);
const job = { id: 'one', status: 'recording', lessonName: 'Олег', title: 'Урок 2026-09-26 17:00' };
const live = { jobs: [job], obs: { outputActive: true, outputTimecode: '00:12:34.500' } };

test('headline shows the actual recording student and OBS elapsed time', () => {
  const view = headline(live);
  assert.equal(view.name, 'Олег');
  assert.equal(view.status, 'Идёт запись');
  assert.equal(view.time, '00:12:34');
  assert.equal(view.detail, job.title);
  assert.equal(headline({ ...live, currentLesson: { lessonName: 'Другой ученик' } }).name, 'Олег');
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
