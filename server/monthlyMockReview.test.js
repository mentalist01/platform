import assert from 'node:assert/strict';
import test from 'node:test';
import { setMonthlyReviewVideo, monthlyReviewForStudent, recorderMockReviewCatalog, attachRecorderMockReview, monthlyReviewUrl } from './monthlyMockReview.js';
import { getMonthlyMockPeriod } from '../src/utils/monthlyMockExam.js';

const month = '2026-10';
const now = getMonthlyMockPeriod(month).startMs + 10_000;
const url = 'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=Review_Key';
const recordingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const exam = { id: 'exam', title: 'Пробник', access: { all: true }, tasks: { 1: {}, 2: {} }, monthlyAssignments: { a: [month], b: [month] } };
const withReview = setMonthlyReviewVideo(exam, 'a', url);

test('review remains locked for partial homework, another variant and exemption, then unlocks on finishing this whole variant', () => {
  const finishedAt = new Date(now).toISOString();
  const data = { mockAttempts: { exam: { status: 'finished', finishedAt, targetTaskKeys: ['1'] } }, monthlyMockExemptions: { [month]: finishedAt } };
  assert.deepEqual(monthlyReviewForStudent(withReview, 'a', data, month, now), { hasReviewVideo: true });
  data.monthlyMockCompletions = [{ examId: 'other', finishedAt }];
  assert.deepEqual(monthlyReviewForStudent(withReview, 'a', data, month, now), { hasReviewVideo: true });
  data.mockAttempts.exam.targetTaskKeys = [];
  assert.equal(monthlyReviewForStudent(withReview, 'a', data, month, now).reviewVideoUrl, url);
  assert.deepEqual(monthlyReviewForStudent(withReview, 'b', data, month, now), { hasReviewVideo: false });
});

test('older completion cannot unlock a newly assigned month; late finish unlocks review and ledger preserves it after restart', () => {
  const data = { monthlyMockCompletions: [{ examId: 'exam', finishedAt: '2026-09-30T12:00:00Z' }] };
  assert.ok(!monthlyReviewForStudent(withReview, 'a', data, month, now).reviewVideoUrl);
  data.monthlyMockCompletions.push({ examId: 'exam', finishedAt: '2026-11-02T12:00:00Z' });
  assert.equal(monthlyReviewForStudent(withReview, 'a', data, month, Date.parse('2026-11-03T12:00:00Z')).reviewVideoUrl, url);
});

test('manual links are validated and changes/removal affect only the current teacher', () => {
  const shared = setMonthlyReviewVideo(withReview, 'b', 'https://rutube.ru/video/other/');
  assert.equal(monthlyReviewUrl(setMonthlyReviewVideo(shared, 'a', ''), 'b'), 'https://rutube.ru/video/other/');
  assert.throws(() => setMonthlyReviewVideo(exam, 'a', 'javascript:alert(1)'), /ссылку/);
  assert.throws(() => setMonthlyReviewVideo(exam, 'a', 'https://rutube.ru.evil.test/video/abc/'), /ссылку/);
  assert.throws(() => setMonthlyReviewVideo(exam, 'a', {}), /ссылку/);
});

test('recorder attachment is scoped, retry-safe and refuses a changed/deleted/reassigned target', () => {
  const payload = { teacherId: 'a', examId: 'exam', month, recordingId, expectedUrl: '', url };
  assert.equal(recorderMockReviewCatalog([exam], 'a', month).exams[0].id, 'exam');
  assert.deepEqual(recorderMockReviewCatalog([exam], 'other', month).exams, []);
  assert.throws(() => attachRecorderMockReview([exam], 'b', payload), error => error.status === 403);
  assert.throws(() => attachRecorderMockReview([], 'a', payload), error => error.status === 404);
  const attached = attachRecorderMockReview([exam], 'a', payload);
  assert.equal(attached.created, true);
  assert.equal(attachRecorderMockReview(attached.exams, 'a', payload).created, false);
  const changed = setMonthlyReviewVideo(attached.exams[0], 'a', 'https://rutube.ru/video/new/');
  assert.throws(() => attachRecorderMockReview([changed], 'a', payload), error => error.status === 409);
  assert.throws(() => attachRecorderMockReview([{ ...exam, monthlyAssignments: { b: [month] } }], 'a', payload), error => error.status === 409);
  assert.throws(() => attachRecorderMockReview([withReview], 'a', { ...payload, recordingId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', expectedUrl: url }), /замену/);
});
