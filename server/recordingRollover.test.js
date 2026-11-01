import test from 'node:test';
import assert from 'node:assert/strict';
import { currentScheduledSuccessor, isAdjacentRecordingSuccessor } from './recordingRollover.js';

const first = { key:'first', studentId:'p', startMs:1000, endMs:61000 };
const second = { key:'second', studentId:'p', startMs:61000, endMs:121000 };

test('the exact end boundary selects the next scheduled lesson while preserving the first deadline', () => {
  assert.equal(currentScheduledSuccessor(first, [first,second], 60999), null);
  assert.equal(currentScheduledSuccessor(first, [first,second], 61000), second);
  assert.equal(isAdjacentRecordingSuccessor(first, second, 61000), true);
  assert.equal(first.endMs,61000);
});

test('never starts an early, expired, different pupil, group, or separated lesson automatically', () => {
  for (const [next,now] of [[second,61000-1],[second,second.endMs],
    [{...second,studentId:'other'},61000],[{...second,lessonId:'group'},61000],
    [{...second,startMs:62000},63000],[{...second,key:first.key},61000]]) {
    assert.equal(isAdjacentRecordingSuccessor(first,next,now),false);
  }
  assert.equal(currentScheduledSuccessor(first,[first],61000),null);
  assert.equal(currentScheduledSuccessor(first,[{...second,studentId:'other'}],61000),null);
});
