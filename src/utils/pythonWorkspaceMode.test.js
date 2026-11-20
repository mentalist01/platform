import test from 'node:test';
import assert from 'node:assert/strict';
import {currentPythonGroupLesson, pythonGroupLessonTiming, resolvePythonWorkspaceMode} from './pythonWorkspaceMode.js';

const start = Date.parse('2026-10-13T17:00:00Z');
const lesson = {lessonId:'lesson-1', groupId:'group-2', participantIds:['pupil'], startsAt:new Date(start).toISOString(), durationMinutes:60, status:'scheduled'};
const mode = overrides => resolvePythonWorkspaceMode({teacher:false, studentId:'pupil', now:start+1000, lesson, ...overrides});

test('a member has personal Python outside the lesson, including a stale initial group hint', () => {
  assert.equal(mode({lesson:null, initialGroupId:'group-2'}).target, '');
  assert.equal(mode({now:start-1}).target, '');
  assert.equal(mode({now:start+3_600_000}).target, '');
});
test('a scheduled current lesson selects the group only for its participants', () => {
  assert.equal(mode().target, 'learning-group:group-2');
  assert.equal(mode({studentId:'other'}).target, '');
  assert.equal(mode({lesson:{...lesson, participationOverrides:{pupil:false}}}).target, '');
  assert.equal(currentPythonGroupLesson({...lesson, participantIds:undefined}, 'pupil', start), null);
});
test('finished, cancelled, future and read-only lessons never auto-select a group', () => {
  for (const changes of [{status:'completed'}, {status:'cancelled'}, {readOnly:true}, {notStarted:true}, {startsAt:'invalid'}]) {
    assert.equal(mode({lesson:{...lesson, ...changes}}).target, '');
  }
});
test('an active lesson can overrun but a stale active status cannot last forever', () => {
  const active = {...lesson, status:'active'};
  assert.equal(mode({lesson:active, now:start+3_600_001}).target, 'learning-group:group-2');
  assert.equal(mode({lesson:active, now:start+5_400_000}).target, '');
});
test('opening homework overrides the group and persists an explicit personal choice', () => {
  assert.equal(mode({personalTask:true}).target, '');
  const manual = {scope:mode().scope, target:'', personalWork:true};
  assert.equal(mode({manual}).personalWork, true);
  assert.equal(mode({manual}).target, '');
  assert.equal(mode({manual:null}).target, 'learning-group:group-2', 'Returning to the lesson restores its group');
});
test('manual mode applies only to the same lesson and resets on completion or a new lesson', () => {
  const manual = {scope:mode().scope, target:'learning-group:group-2'};
  assert.equal(mode({manual}).target, manual.target);
  assert.equal(mode({manual, lesson:{...lesson, status:'completed'}}).target, '');
  const personal = {...manual, target:'', personalWork:true};
  assert.equal(mode({manual:personal, lesson:{...lesson, lessonId:'lesson-2'}}).target, manual.target);
  assert.equal(mode({manual:{scope:'personal', target:'', personalWork:true}}).target, manual.target);
});
test('teacher selection remains explicit and independent of student automatic mode', () => {
  assert.equal(mode({teacher:true, initialGroupId:'group-2'}).target, 'learning-group:group-2');
  assert.equal(mode({teacher:true, initialGroupId:'group-2', manual:{scope:'teacher', target:''}}).target, '');
});

test('the Python toolbar displays the end of the matching current group lesson', () => {
  const end = start + 3_600_000;
  assert.deepEqual(pythonGroupLessonTiming(lesson,start),{mode:'scheduled',endAt:end});
  assert.equal(pythonGroupLessonTiming(lesson,start-1),null);
  assert.equal(pythonGroupLessonTiming(lesson,end),null);
  assert.deepEqual(pythonGroupLessonTiming({...lesson,status:'active'},end),{mode:'overtime',endAt:end});
  const recording = {desired:'record', occurrence:{lessonId:lesson.lessonId}, cutoffAt:end+600_000,
    endControl:{version:1,mode:'timed',untilMs:end+600_000}};
  assert.deepEqual(pythonGroupLessonTiming(lesson,end,recording),{mode:'timed',endAt:end+600_000});
  assert.deepEqual(pythonGroupLessonTiming(lesson,end,{...recording,endControl:{version:1,mode:'manual'}}),{mode:'manual'});
  assert.equal(pythonGroupLessonTiming({...lesson,lessonId:'other'},end,recording),null);
  assert.equal(pythonGroupLessonTiming({...lesson,status:'completed'},end,recording),null);
});
