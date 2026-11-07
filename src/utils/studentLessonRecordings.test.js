import test from 'node:test';import assert from 'node:assert/strict';
import {matchLessonRecording,lessonRecordingState,recordingMonthGroups,lessonRecordingTopic} from './studentLessonRecordings.js';
test('recording search uses topics, dates and task numbers without requiring a saved topic',()=>{
  const lesson={dayKey:'2026-10-20',time:'18:00',topic:{text:'Строки и срезы',taskNumbers:[17]}};
  assert.ok(matchLessonRecording(lesson,'СТРОКИ 17'));assert.ok(matchLessonRecording(lesson,'2026-10'));assert.equal(matchLessonRecording(lesson,'черепаха'),false);
  assert.equal(lessonRecordingTopic({subject:'ЕГЭ'}),'ЕГЭ');assert.equal(lessonRecordingTopic({}),'Индивидуальное занятие');
});
test('ready, processing and absent recordings have distinct honest states and months keep input order',()=>{
  assert.equal(lessonRecordingState({available:true}).tone,'ready');assert.equal(lessonRecordingState({status:'uploading'}).tone,'pending');assert.equal(lessonRecordingState(null).tone,'unavailable');
  const groups=recordingMonthGroups([{dayKey:'2026-11-02'},{dayKey:'2026-10-29'},{dayKey:'2026-10-20'}]);assert.deepEqual(groups.map(group=>group.items.length),[1,2]);assert.match(groups[0].label,/ноябрь/);
});
