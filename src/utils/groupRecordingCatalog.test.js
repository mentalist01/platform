import test from 'node:test';
import assert from 'node:assert/strict';
import {groupRecordingCatalog} from './groupRecordingCatalog.js';
test('group shelves use numeric names and chronological dates, without mutating the API catalog',()=>{
  const groups=[{id:'g10',name:'Группа 10'},{id:'g2',name:'Группа 2'},{id:'g1',name:'Группа 1'}];
  const recordings=[{id:'later',groupId:'g2',startAt:'2026-10-18T19:00:00+03:00'},{id:'early',groupId:'g2',startAt:'2026-10-01T20:00:00+03:00'},
    {id:'same-day',groupId:'g2',startAt:'2026-10-01T16:30:00Z'},{id:'unlisted',groupId:'private',startAt:'2026-09-01T00:00:00Z'}];
  const before=JSON.stringify({groups,recordings}),result=groupRecordingCatalog(groups,recordings);
  assert.deepEqual(result.map(g=>g.id),['g1','g2','g10']);
  assert.deepEqual(result[1].recordings.map(r=>r.id),['same-day','early','later']);
  assert.deepEqual(result[1].recordings.map(r=>r.lessonNumber),[1,2,3]);
  assert.equal(result[0].count,0);assert.equal(result[1].count,3);
  assert.equal(JSON.stringify({groups,recordings}),before);assert.ok(!JSON.stringify(result).includes('unlisted'));
});
