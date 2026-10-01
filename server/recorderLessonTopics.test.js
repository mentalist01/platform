import test from 'node:test';
import assert from 'node:assert/strict';
import {recorderLessonTopic} from './recorderLessonTopics.js';
import {normalizeLessonTopicsStore,zonedLessonDateTimeToUtcMs,resolveLessonTopicsForOccurrences} from './lessonTopics.js';

function fixture(group=false) {
  let store=normalizeLessonTopicsStore(null),writes=0;
  const occurrence={studentId:'a',dayKey:'2026-09-30',time:'20:00',durationMinutes:60,startMs:zonedLessonDateTimeToUtcMs('2026-09-30','20:00'),...(group?{lessonId:'lesson'}:{})};
  const context={students:[{id:'a',teacherId:'teacher'},{id:'b',teacherId:'teacher'},{id:'c',teacherId:'other'}],lessons:group?[{id:'lesson',teacherId:'teacher',participantIds:['a','b','c'],topic:'Группа 2',source:'google-calendar'}]:[],
    read:()=>store,write:value=>{store=normalizeLessonTopicsStore(value);writes++;},files:[],now:'2026-10-01T08:00:00.000Z'};
  const job={id:'job',teacherId:'teacher',occurrence};
  return {context,job,get store(){return store;},get writes(){return writes;},sync:payload=>recorderLessonTopic('teacher',job,payload,context)};
}
test('transcript fills missing history, retries are idempotent and later notes/manual topic take priority',()=>{
  const f=fixture();assert.equal(f.sync({}).topic,null);
  assert.equal(f.sync({source:'transcript',text:'Задание №3 · Базы данных'}).topic.source,'transcript');
  const key='a|2026-09-30|20:00|60';assert.equal(f.store.transcriptTopics[key].text,'Задание №3 · Базы данных');
  f.sync({source:'transcript',text:'Задание №3 · Базы данных'});assert.equal(f.writes,1);
  f.store.activities.push({id:'note',studentId:'a',taskNumber:7,occurredAt:'2026-09-30T17:30:00.000Z'});
  assert.equal(f.sync({source:'transcript',text:'Нельзя затереть конспект'}).topic.source,'notes');
  assert.equal(f.writes,1);
  assert.equal(f.sync({source:'teacher',text:'Моя тема'}).topic.text,'Моя тема');
  assert.equal(f.sync({source:'transcript',text:'Нельзя затереть учителя'}).topic.text,'Моя тема');
  assert.equal(f.writes,2);
  const topics=resolveLessonTopicsForOccurrences({occurrences:[{...f.job.occurrence,key,endMs:f.job.occurrence.startMs+3600000}],manualTopics:f.store.topics,transcriptTopics:f.store.transcriptTopics});
  assert.equal(topics[key].source,'teacher');
});
test('group recording shares inferred topic only with its own participants and calendar name is not a lesson topic',()=>{
  const f=fixture(true);const result=f.sync({source:'transcript',text:'Задание №7 · Звук'});
  assert.equal(result.topic.source,'transcript');assert.equal(Object.keys(f.store.transcriptTopics).length,2);
  assert.ok(!Object.values(f.store.transcriptTopics).some(topic=>topic.studentId==='c'));
  f.context.lessons[0].source='manual';f.context.lessons[0].topic='Тема учителя';
  assert.equal(f.sync({source:'transcript',text:'Другая тема'}).topic.text,'Тема учителя');
});
test('cannot attach a topic to another teacher, unknown lesson or foreign student',()=>{
  const f=fixture();assert.throws(()=>recorderLessonTopic('other',f.job,{},f.context),{status:404});
  assert.throws(()=>recorderLessonTopic('teacher',{...f.job,occurrence:{...f.job.occurrence,studentId:'c'}},{},f.context),{status:404});
  assert.throws(()=>recorderLessonTopic('teacher',{...f.job,occurrence:{...f.job.occurrence,lessonId:'unknown'}},{},f.context),{status:404});
  assert.throws(()=>f.sync({text:'x',source:'invalid'}),{status:400});assert.equal(f.writes,0);
});
