import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedGroupStudySchedule, groupHomeworkDefaultDueAt, groupHomeworkLessonChoices, groupHomeworkStudyTrackAt, groupLessonStudyTrack } from './groupStudyPlan.js';
const schedule = [{ id: 'wed', weekdayKey: 'wednesday', time: '20:00', subject: 'Занятие' }, { id: 'fri', weekdayKey: 'friday', time: '20:00', subject: 'Занятие' }];
const group = { id: 'g', schedule, studyPlan: { mode: 'split', pythonWeekday: 'friday' } };
const now = Date.parse('2026-10-07T18:10Z');
test('split deadlines follow the selected direction; EGE-only uses the immediately next lesson', () => {
  assert.equal(groupHomeworkDefaultDueAt(group, 'ege', now), '2026-10-14T17:00:00.000Z');
  assert.equal(groupHomeworkDefaultDueAt(group, 'python', now), '2026-10-09T17:00:00.000Z');
  assert.equal(groupHomeworkDefaultDueAt({ ...group, studyPlan: { mode: 'ege-only' } }, 'ege', now), '2026-10-09T17:00:00.000Z');
  const swapped = { ...group, studyPlan: { mode: 'split', pythonWeekday: 'wednesday' } };
  assert.equal(groupHomeworkDefaultDueAt(swapped, 'ege', now), '2026-10-09T17:00:00.000Z');
  assert.equal(groupHomeworkDefaultDueAt(swapped, 'python', now), '2026-10-14T17:00:00.000Z');
});
test('homework issued on a lesson day goes to the next day of that direction, even before class starts', () => {
  assert.equal(groupHomeworkStudyTrackAt(group, Date.parse('2026-10-09T09:00Z')), 'python');
  assert.equal(groupHomeworkStudyTrackAt(group, now), 'ege');
  assert.equal(groupHomeworkStudyTrackAt({ ...group, studyPlan: { mode: 'ege-only' } }, Date.parse('2026-10-09T09:00Z')), 'ege');
  assert.equal(groupHomeworkDefaultDueAt(group, 'python', Date.parse('2026-10-09T16:59:59Z')), '2026-10-16T17:00:00.000Z');
  assert.equal(groupHomeworkDefaultDueAt(group, 'python', Date.parse('2026-10-09T17:00Z')), '2026-10-16T17:00:00.000Z');
  assert.equal(groupHomeworkDefaultDueAt({ ...group, schedule: [{ id: 'sun', weekdayKey: 'sunday', time: '01:00' }], studyPlan: { mode: 'ege-only' } }, 'ege', Date.parse('2026-10-10T20:30Z')), '2026-10-10T22:00:00.000Z');
});
test('known cancellation and moved lesson override the slot without generating sessions', () => {
  const lessons = [{ id: 'cancel', groupId: 'g', scheduleEntryId: 'fri', startAt: '2026-10-09T17:00Z', status: 'cancelled' }];
  assert.equal(groupHomeworkDefaultDueAt(group, 'python', now, lessons), '2026-10-16T17:00:00.000Z');
  lessons[0] = { ...lessons[0], id: 'moved', startAt: '2026-10-10T17:20Z', participationSlot: 'friday|20:00', status: 'scheduled' };
  assert.deepEqual(groupHomeworkLessonChoices(group, 'python', now, lessons)[0], { dueAt: '2026-10-10T17:20:00.000Z', subject: 'Занятие', studyTrack: 'python', lessonId: 'moved' });
  assert.equal(groupLessonStudyTrack(group, lessons[0]), 'python');
});
test('unconfigured groups retain weekly deadlines; missing directions cannot silently use the other track', () => {
  assert.equal(groupHomeworkDefaultDueAt({ schedule }, 'ege', now), '2026-10-14T18:10:00.000Z');
  assert.equal(groupHomeworkDefaultDueAt({ ...group, schedule: [schedule[0]] }, 'python', now), '');
});

test('approved availability provides both directions without duplicating the calendar and respects its start date', () => {
  const studySchedule = approvedGroupStudySchedule({ id: 'approved', config: { startDate: '2026-10-26', durationMinutes: 60, startMinute: 600, endMinute: 1380, days: [0,1,2,3,4,5,6] }, slots: ['1-960', '3-1140'] });
  assert.deepEqual(studySchedule.map(entry => [entry.weekdayKey, entry.time]), [['tuesday', '16:00'], ['thursday', '19:00']]);
  const approved = { ...group, schedule: [], studySchedule, studyPlan: { mode: 'split', pythonWeekday: 'thursday' } };
  assert.equal(groupHomeworkDefaultDueAt(approved, 'ege', Date.parse('2026-10-22T20:00Z')), '2026-10-27T13:00:00.000Z');
  assert.equal(groupHomeworkDefaultDueAt(approved, 'python', Date.parse('2026-10-22T20:00Z')), '2026-10-29T16:00:00.000Z');
});
