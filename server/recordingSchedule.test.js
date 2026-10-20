import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { refreshedRecordingOccurrence } from './recordingSchedule.js';
const hash = value => crypto.createHash('sha1').update(value).digest('hex').slice(0, 18);
const startMs = Date.parse('2026-10-20T18:00:00+03:00');
const job = { teacherId: 'teacher', occurrence: { key: 'original-replay', studentId: 'pupil', dayKey: '2026-10-20',
  time: '18:00', startMs, endMs: startMs + 3600_000, durationMinutes: 60,
  sourceEntryId: `google-student-${hash('teacher:pupil:lesson-uid:2026-10-20:18:00')}` } };
const event = { id: 'new-google-id', externalEventId: 'lesson-uid', studentId: 'pupil', source: 'google-ical',
  date: '2026-10-20', time: '18:20', durationMinutes: 60, startAt: '2026-10-20T18:20:00+03:00' };

test('legacy student and teacher calendar IDs follow the same Google event when its start and end change', () => {
  for (const sourceEntryId of [job.occurrence.sourceEntryId, `google-ical-${hash(`teacher:lesson-uid:${new Date(startMs).toISOString()}`)}`]) {
    const updated = refreshedRecordingOccurrence({ ...job, occurrence: { ...job.occurrence, sourceEntryId } }, [event]);
    assert.equal(updated.key, job.occurrence.key); assert.equal(updated.time, '18:20');
    assert.equal(updated.endMs, Date.parse('2026-10-20T19:20:00+03:00'));
    const movedAgain = refreshedRecordingOccurrence({ ...job, occurrence: updated }, [{ ...event, time: '18:10', durationMinutes: 50 }]);
    assert.equal(movedAgain.endMs, Date.parse('2026-10-20T19:00:00+03:00'));
  }
});

test('fresh Google overrides stale imported progress while another pupil or an ambiguous event never binds', () => {
  const stale = { ...event, id: job.occurrence.sourceEntryId, source: 'google-calendar', time: '18:00' };
  assert.equal(refreshedRecordingOccurrence(job, [stale, event]).time, '18:20');
  assert.equal(refreshedRecordingOccurrence(job, [{ ...event, studentId: 'other' }]), null);
  assert.equal(refreshedRecordingOccurrence(job, [event, { ...event, time: '18:25' }]), null);
  assert.equal(refreshedRecordingOccurrence(job, [{ ...event, externalEventId: 'unrelated' }]), null);
});

test('weekly Google instances keep the original instance even when moved across a date', () => {
  const recurring = { ...event, date: '2026-10-21', calendarIsRecurring: true, calendarOriginalStartAt: new Date(startMs).toISOString() };
  const nextWeek = { ...event, date: '2026-10-27', calendarIsRecurring: true, calendarOriginalStartAt: '2026-10-27T15:00:00.000Z' };
  const result = refreshedRecordingOccurrence(job, [nextWeek, recurring]);
  assert.equal(result.dayKey, '2026-10-21'); assert.equal(result.key, job.occurrence.key);
  assert.equal(refreshedRecordingOccurrence(job, [nextWeek]), null);
});

test('local weekly sources update only their bound date and skip cancelled or excluded lessons', () => {
  const local = { ...job, occurrence: { ...job.occurrence, sourceEntryId: 'weekly' } };
  const entry = { id: 'weekly', time: '18:20', durationMinutes: 60 };
  assert.equal(refreshedRecordingOccurrence(local, [entry]).endMs, Date.parse('2026-10-20T19:20:00+03:00'));
  assert.equal(refreshedRecordingOccurrence(local, [{ ...entry, excludedDates: ['2026-10-20'] }]), null);
  assert.equal(refreshedRecordingOccurrence(local, [{ ...entry, status: 'cancelled' }]), null);
});
