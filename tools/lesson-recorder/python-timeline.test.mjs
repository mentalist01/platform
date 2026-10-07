import assert from 'node:assert/strict';
import test from 'node:test';
import { createTimeline, recordingSeconds, observeTimeline, closeTimelineClip, resumeTimeline, finishTimeline, finalizeTimeline, editTimeline, approveTimeline, timelineDuration } from './python-timeline.mjs';
const draft = () => { const timeline = createTimeline(); closeTimelineClip(timeline, 10); resumeTimeline(timeline, 10); closeTimelineClip(timeline, 20); return timeline; };
const apply = (timeline, action, extra = {}) => editTimeline(timeline, { revision: timeline.revision, action, clipId: timeline.clips[0]?.id, ...extra });
test('OBS timecode, pause boundaries and resume exclude pause time', () => {
  assert.equal(recordingSeconds({ outputTimecode: '01:02:03.456' }), 3723.456);
  for (const value of ['', 'bad', '1:2', '1:2:NaN']) assert.equal(recordingSeconds({ outputTimecode: value }), 0);
  const t = createTimeline(); observeTimeline(t, 5); closeTimelineClip(t, 10); closeTimelineClip(t, 10);
  assert.equal(t.clips.length, 1); resumeTimeline(t, 10); resumeTimeline(t, 10); closeTimelineClip(t, 18);
  assert.deepEqual(t.clips.map(({start,end}) => [start,end]), [[0,10],[10,18]]);
});
test('stop/crash finalization retains encoder tail exactly once; paused ending adds nothing', () => {
  const t = createTimeline(); observeTimeline(t, 4); finishTimeline(t, 0); finalizeTimeline(t, 4.4); finalizeTimeline(t, 5);
  assert.equal(timelineDuration(t), 4.4); assert.equal(t.clips.length, 1); assert.equal(t.openStart, null);
  const paused = draft(); finishTimeline(paused, 20); finalizeTimeline(paused, 20);
  assert.equal(paused.clips.length, 2); assert.equal(timelineDuration(paused), 20);
  const short = createTimeline(); finishTimeline(short, 0); finalizeTimeline(short, .3); assert.equal(short.clips[0].end,.3);
});
test('split/trim/delete produce nondestructive exact ranges and undo restores them', () => {
  const t = draft(), original = structuredClone(t.clips); apply(t,'split',{at:4});
  assert.equal(t.clips.length,3); assert.equal(timelineDuration(t),20);
  apply(t,'trim',{start:1,end:3}); assert.equal(timelineDuration(t),18);
  apply(t,'delete'); assert.equal(timelineDuration(t),16);
  apply(t,'undo'); apply(t,'undo'); apply(t,'undo'); assert.deepEqual(t.clips,original);
});
test('undo never removes a new take recorded after an edit', () => {
  const t = draft(); apply(t,'delete'); resumeTimeline(t,20); closeTimelineClip(t,30);
  const newest=t.clips.at(-1); apply(t,'undo'); assert.equal(t.clips.length,3); assert.deepEqual(t.clips.at(-1),newest);
});
test('move/duplicate/join preserve order and duration intentionally', () => {
  const t = draft(); apply(t,'split',{at:5}); apply(t,'join'); assert.equal(t.clips.length,2);
  apply(t,'duplicate'); assert.equal(timelineDuration(t),30); apply(t,'move',{direction:1}); assert.equal(t.clips[0].start,0);
  apply(t,'undo'); apply(t,'undo'); assert.equal(timelineDuration(t),20);
  assert.throws(()=>apply(t,'join',{clipId:t.clips[1].id}),/соседние/);
});
test('stale revisions, invalid numbers and ranges cannot modify the project', () => {
  const t = draft(), before = structuredClone(t);
  for(const args of [{action:'split',at:0},{action:'split',at:NaN},{action:'trim',start:-1,end:2},{action:'trim',start:0,end:11},{action:'delete',clipId:'missing'},{action:'move',direction:-1},{action:'wat'}]) {
    assert.throws(()=>editTimeline(t,{revision:t.revision,clipId:t.clips[0].id,...args})); assert.deepEqual(t,before);
  }
  assert.throws(()=>editTimeline(t,{revision:-1,action:'delete',clipId:t.clips[0].id}),/изменился/);
});
test('publication requires finished nonempty montage, freezes edits and preserves original ranges', () => {
  const t=createTimeline(); assert.throws(()=>approveTimeline(t,t.revision)); closeTimelineClip(t,10);
  apply(t,'delete'); assert.throws(()=>approveTimeline(t,t.revision),/хотя бы/); apply(t,'undo');
  const before=structuredClone(t.clips); approveTimeline(t,t.revision); assert.equal(t.approved,true); assert.deepEqual(t.clips,before); assert.throws(()=>apply(t,'delete'),/отправлен/);
});
test('edits remain durable through serialization and undo stays bounded', () => {
  const t=draft(); for(let i=0;i<40;i++)apply(t,'move',{clipId:t.clips[0].id,direction:1});
  assert.equal(t.history.length,30); const restored=JSON.parse(JSON.stringify(t)); apply(restored,'undo'); assert.equal(restored.clips.length,2);
});
test('undo and redo preserve newer recorded takes through several history entries and reload', () => {
  let t=draft(); const original=structuredClone(t.clips);
  apply(t,'split',{at:4}); const split=structuredClone(t.clips); apply(t,'trim',{start:1,end:3});
  apply(t,'undo'); apply(t,'undo'); assert.deepEqual(t.clips,original);
  resumeTimeline(t,20); closeTimelineClip(t,27); const recorded=structuredClone(t.clips.at(-1));
  t=JSON.parse(JSON.stringify(t)); apply(t,'redo'); assert.deepEqual(t.clips,[...split,recorded]);
  apply(t,'redo'); assert.equal(t.clips[0].start,1); assert.equal(t.clips[0].end,3); assert.deepEqual(t.clips.at(-1),recorded);
  apply(t,'undo'); assert.equal(t.future.length,1); apply(t,'delete'); assert.equal(t.future.length,0);
  assert.throws(()=>apply(t,'redo'),/Нет действий/);
});
test('direct reordering is atomic, handles both ends, survives undo/redo, and rejects stale targets', () => {
  const t=draft(); apply(t,'duplicate'); const [a,b,c]=t.clips.map(clip=>clip.id);
  apply(t,'reorder',{clipId:a,beforeId:null}); assert.deepEqual(t.clips.map(clip=>clip.id),[b,c,a]);
  apply(t,'reorder',{clipId:a,beforeId:b}); assert.deepEqual(t.clips.map(clip=>clip.id),[a,b,c]);
  apply(t,'undo'); apply(t,'redo'); assert.deepEqual(t.clips.map(clip=>clip.id),[a,b,c]);
  const before=structuredClone(t); apply(t,'reorder',{clipId:a,beforeId:b}); assert.deepEqual(t,before,'Dropping in place has no history side effect');
  assert.throws(()=>apply(t,'reorder',{clipId:a,beforeId:'missing'}),/изменилось/); assert.deepEqual(t,before);
  assert.throws(()=>editTimeline(t,{action:'reorder',revision:-1,clipId:a,beforeId:null}),/изменился/);
});
test('old projects without redo stack remain compatible and failed history restoration is atomic', () => {
  const t=draft(); delete t.future; assert.throws(()=>apply(t,'redo'),/Нет действий/);
  apply(t,'delete'); apply(t,'undo'); apply(t,'redo'); assert.equal(t.clips.length,1);
  const capped=draft(); apply(capped,'delete');
  while(capped.clips.length<300)capped.clips.push({...capped.clips[0],id:'new-'+capped.clips.length});
  const before=structuredClone(capped); assert.throws(()=>apply(capped,'undo'),/300/); assert.deepEqual(capped,before);
});
