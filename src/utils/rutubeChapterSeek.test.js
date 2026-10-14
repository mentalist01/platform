import test from 'node:test';import assert from 'node:assert/strict';
import { chapterPlayerUrl, createChapterSeek } from './rutubeChapterSeek.js';

test('cold player starts at the requested chapter with the documented autoplay value and preserves private access', () => {
  const url = new URL(chapterPlayerUrl('https://rutube.ru/play/embed/abc/?p=private', 145));
  assert.equal(url.searchParams.get('p'), 'private');
  assert.equal(url.searchParams.get('t'), '145');
  assert.equal(url.searchParams.get('autoplay'), 'true');
  assert.equal(new URL(chapterPlayerUrl('https://rutube.ru/play/embed/abc', null)).searchParams.has('t'), false);
});

test('a ready event followed by canPlay retries a pending chapter rather than losing the request', () => {
  const sent = [], states = [], seek = createChapterSeek(message => sent.push(message), time => states.push(time));
  assert.equal(seek.select(145), false);assert.equal(sent.length, 0);
  seek.receive({ type: 'player:ready' });
  assert.deepEqual(sent.map(message => message.type), ['player:setCurrentTime'], 'play waits for the asynchronous seek to finish');
  seek.receive({ type: 'player:currentTime', data: { time: 145 } });
  assert.equal(states.at(-1), 145, 'seeking without playing does not complete the requested start');
  seek.receive({ type: 'player:changeState', data: { state: 'seeked' } });
  seek.receive({ type: 'player:canPlay' });assert.equal(sent.at(-1).type, 'player:play');
  seek.receive({ type: 'player:changeState', data: { state: 'play' } });assert.equal(states.at(-1), null);
  const count = sent.length;seek.receive({ type: 'player:canPlay' });assert.equal(sent.length, count);
});

test('the latest click during an advert is applied once content can resume', () => {
  const sent = [], seek = createChapterSeek(message => sent.push(message));
  seek.receive({ type: 'player:ready' });seek.receive({ type: 'player:adStart' });
  seek.select(60);seek.select(145);assert.equal(sent.length, 0);
  seek.receive({ type: 'player:currentTime', data: { time: 145 } });
  seek.receive({ type: 'player:adEnd' });
  assert.deepEqual(sent[0], { type: 'player:setCurrentTime', data: { time: 145 } });
  assert.equal(sent.length, 1, 'adEnd must not restart an advertisement with another play command');
  seek.receive({ type: 'player:canPlay' });assert.equal(sent.length, 1);
  seek.receive({ type: 'player:currentTime', data: { time: 145 } });assert.equal(sent.at(-1).type, 'player:play');
  seek.reset();const count = sent.length;seek.receive({ type: 'player:ready' });assert.equal(sent.length, count, 'switching videos clears an old chapter request');
});

test('a slow or blocked player receives a bounded number of play commands instead of an autoplay loop', () => {
  const sent = [], seek = createChapterSeek(message => sent.push(message));
  seek.receive({ type: 'player:ready' });seek.select(145);
  seek.receive({ type: 'player:currentTime', data: { time: 145 } });
  seek.receive({ type: 'player:changeState', data: { state: 'seeked' } });
  for (let n = 0; n < 20; n++) seek.receive({ type: 'player:canPlay' });
  assert.equal(sent.filter(message => message.type === 'player:play').length, 2);
});
