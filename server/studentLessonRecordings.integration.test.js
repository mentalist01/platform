import test from 'node:test';import assert from 'node:assert/strict';
import {createGroupHomeworkFixture} from './groupHomework.fixture.js';

test('individual recording library is owner-authorized, searchable and paginated without exposing other pupils or video keys', {timeout:60000},async()=>{
  const f=await createGroupHomeworkFixture(undefined,write=>{
    const entries=[
      {studentId:'student-a',dayKey:'2026-10-20',time:'15:00',durationMinutes:60,topic:{source:'teacher',text:'Цикл for'}},
      {studentId:'student-a',dayKey:'2026-10-22',time:'15:00',durationMinutes:60,topic:{source:'teacher',text:'Строки и срезы'}},
      {studentId:'student-c',dayKey:'2026-10-23',time:'15:00',durationMinutes:60,topic:{source:'teacher',text:'Чужая запись'}},
    ];
    const occurrences=Object.fromEntries(entries.map((row,i)=>[String(i),row]));write('lesson-history',{occurrences});
    write('desktop-recordings',{teachers:{},devices:{},jobs:{'recording-a':{id:'recording-a',teacherId:'teacher-a',desired:'stop',status:'ready',
      occurrence:{key:'student-a|2026-10-20|15:00|60'},startedAt:Date.now()-4000000,stoppedAt:Date.now()-400000,updatedAt:Date.now(),durationMs:3600000,
      video:{url:'https://rutube.ru/video/private/1234567890abcdef1234567890abcdef/?p=secret-test',embedUrl:'https://rutube.ru/play/embed/1234567890abcdef1234567890abcdef/?p=secret-test'}}}});
  });
  try{
    const route='/api/lesson-recordings?studentId=student-a';
    const all=await f.request(route,f.tokens['student-a']);
    assert.equal(all.total,2);assert.equal(all.items[0].dayKey,'2026-10-22');
    assert.equal(all.items.find(item=>item.dayKey==='2026-10-20').recording.available,true);
    assert.equal(all.items.find(item=>item.dayKey==='2026-10-22').recording.available,false);
    assert.ok(!JSON.stringify(all).includes('secret-test'),'The list contains metadata, not private video links');
    const first=await f.request(route+'&limit=1',f.tokens['student-a']);assert.equal(first.items.length,1);assert.equal(first.hasMore,true);
    const next=await f.request(route+'&limit=1&offset='+first.nextOffset,f.tokens['student-a']);assert.equal(next.hasMore,false);assert.notEqual(next.items[0].key,first.items[0].key);
    const search=await f.request(route+'&query='+encodeURIComponent('ЦИКЛ for'),f.tokens['student-a']);assert.equal(search.total,1);assert.equal(search.items[0].dayKey,'2026-10-20');
    await f.request(route,f.tokens['teacher-a']);
    await f.request(route,f.tokens['teacher-b'],undefined,'GET',403);
    await f.request(route,f.tokens['student-b'],undefined,'GET',403);
    await f.request(route,'',undefined,'GET',401);
    const details=await f.request('/api/lesson-history/detail?studentId=student-a&occurrenceKey='+encodeURIComponent(search.items[0].key),f.tokens['student-a']);
    assert.equal(details.replay.available,true);assert.ok(details.replay.video.embedUrl.includes('secret-test'));
    await f.request('/api/lesson-history/detail?studentId=student-a&occurrenceKey='+encodeURIComponent(search.items[0].key),f.tokens['student-b'],undefined,'GET',404);
  }finally{await f.stop();}
});
