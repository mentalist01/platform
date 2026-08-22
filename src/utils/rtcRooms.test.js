import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLegacyRtcRoomId,
  buildLessonRtcRoomId,
  normalizeRtcParticipantIds,
  resolveCallRtcRoom,
} from './rtcRooms.js';

test('builds a canonical group lesson RTC room', () => {
  assert.equal(buildLessonRtcRoomId(' lesson-42_ab.cd~ef '), 'rtc:lesson:lesson-42_ab.cd~ef');
  assert.deepEqual(
    resolveCallRtcRoom({ lessonId: 'lesson-42', teacherId: '', studentId: '' }),
    {
      mode: 'group',
      isGroupLesson: true,
      lessonId: 'lesson-42',
      roomId: 'rtc:lesson:lesson-42',
    }
  );
});

test('does not fall back to an individual room for a malformed lesson id', () => {
  assert.deepEqual(
    resolveCallRtcRoom({ lessonId: 'bad/lesson', teacherId: 'teacher-1', studentId: 'student-1' }),
    {
      mode: 'group',
      isGroupLesson: true,
      lessonId: '',
      roomId: '',
    }
  );
});

test('keeps the legacy teacher-student RTC room format unchanged', () => {
  assert.equal(buildLegacyRtcRoomId(' teacher-1 ', ' student-2 '), 'rtc:teacher-1:student-2');
  assert.equal(buildLegacyRtcRoomId('teacher-1', ''), '');
  assert.deepEqual(
    resolveCallRtcRoom({ teacherId: 'teacher-1', studentId: 'student-2' }),
    {
      mode: 'individual',
      isGroupLesson: false,
      lessonId: '',
      roomId: 'rtc:teacher-1:student-2',
    }
  );
});

test('normalizes and deduplicates group participant ids', () => {
  assert.deepEqual(
    normalizeRtcParticipantIds([' student-1 ', '', 'student-2', 'student-1', null]),
    ['student-1', 'student-2']
  );
  assert.deepEqual(normalizeRtcParticipantIds(null), []);
});
