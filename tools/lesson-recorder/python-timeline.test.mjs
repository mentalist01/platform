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
