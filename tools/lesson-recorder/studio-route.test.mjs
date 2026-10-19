import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { pythonProjects } from './python-projects.mjs';

const panel = fs.readFileSync(new URL('./panel.html', import.meta.url), 'utf8');
const routing = panel.slice(panel.indexOf('function recorderStudioRoute('), panel.indexOf('const studioRoute='));
const { route, url, changed } = vm.runInNewContext(`${routing}\n({route:recorderStudioRoute,url:mockReviewStudioUrl,changed:recorderStudioChanged})`, { URLSearchParams, encodeURIComponent });
const resolve = value => route(new URL(value, 'http://127.0.0.1:18765/'));

test('review launch retains the selected exam when an older desktop shell drops the query', () => {
  for (const exam of ['exam-1', 'пробник / & ? #']) {
    const target = new URL(url(exam), 'http://127.0.0.1:18765/');
    assert.equal(resolve(target.href).kind, 'mock-review');
    assert.equal(resolve(target.href).mockReview, exam);
    const desktopForward = target.pathname + target.hash;
    assert.equal(resolve(desktopForward).kind, 'mock-review');
    assert.equal(resolve(desktopForward).mockReview, exam);
  }
});

test('existing desktop review links without a query still open a review; Python and setup remain independent', () => {
  for (const target of ['/#mock-review', '/?studio=mock-review', url(), '/?mockReview=exam']) assert.equal(resolve(target).kind, 'mock-review');
  for (const target of ['/', '/#setup', '/?studio=python', '/#mock-review-other', '/archive']) assert.equal(resolve(target).kind, 'python');
});

test('the launch button navigates the current native recorder page, bypassing the shell window-open interceptor', () => {
  const handler = panel.match(/\$\('mock-review-start'\)\.onclick=([^;]+;[^\n]+)/)?.[1];
  assert.ok(handler);
  let navigated = '';
  const run = vm.runInNewContext(`(${handler.replace(/;$/, '')})`, {
    mockReviewSelection: () => ({ id: 'exam' }), mockReviewStudioUrl: url,
    location: { assign: target => navigated = target },
    window: { open: () => assert.fail('The native shell would strip the query and reuse the Python window') },
  });
  run();
  assert.equal(resolve(navigated).kind, 'mock-review');
  assert.equal(resolve(navigated).mockReview, 'exam');
});

test('a reused desktop page must reload when its studio or selected exam changes through a fragment-only navigation', () => {
  const python = resolve('/'), review = resolve('/#mock-review?mockReview=exam');
  assert.equal(changed(python, new URL('/#mock-review', 'http://127.0.0.1:18765')), true);
  assert.equal(changed(review, new URL('/', 'http://127.0.0.1:18765')), true);
  assert.equal(changed(review, new URL('/#mock-review?mockReview=other', 'http://127.0.0.1:18765')), true);
  assert.equal(changed(python, new URL('/#setup', 'http://127.0.0.1:18765')), false);
  assert.equal(changed(review, new URL(url('exam'), 'http://127.0.0.1:18765')), false);
});

test('opening a review with an unfinished Python draft selects no Python project or continuation', () => {
  const draft = { id: 'python', title: 'Цикл while', status: 'saved', createdAt: 1, file: 'lesson-python.mkv',
    pythonTheory: { taskTitle: 'Цикл while' }, pythonTimeline: { finalized: true, revision: 18, speed: 1, clips: Array.from({ length: 9 }, (_, i) => ({ id: String(i), start: i, end: i + 1 })) } };
  const jobs = { python: draft }, before = JSON.stringify(jobs);
  const kind = resolve('/#mock-review').kind;
  assert.equal(pythonProjects(jobs, kind).length, 0);
  const editor = fs.readFileSync(new URL('./python-editor.mjs', import.meta.url), 'utf8');
  const belongsSource = editor.slice(editor.indexOf('const belongs='), editor.indexOf('const publishLabel='));
  const belongs = vm.runInNewContext(`${belongsSource}\nbelongs`, { mockStudio: kind === 'mock-review' });
  assert.equal(belongs(draft), false);
  assert.equal(pythonProjects(jobs, 'python')[0].clips, 9);
  assert.equal(pythonProjects(jobs, 'python')[0].revision, 18);
  assert.equal(JSON.stringify(jobs), before);
});
