import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoardSummonDelivery } from './boardSummonDelivery.js';

const harness = () => {
  const sent = [], states = [];
  let ready = false, time = 1000;
  const delivery = createBoardSummonDelivery({ isReady: () => ready, send: command => sent.push(command), onState: state => states.push(state), now: () => time });
  return { delivery, sent, states, ready(value) { ready = value; }, advance(ms) { time += ms; } };
};

test('one click made while disconnected is sent exactly once after recovery', () => {
  const h = harness();
  h.delivery.request({ id: 'one', pageId: 'main', zoom: 2, offset: { x: 30, y: 60 } }, ['pupil']);
  assert.equal(h.states.at(-1).phase, 'queued');
  h.advance(20_000); h.ready(true);
  assert.equal(h.delivery.flush(), true);
  assert.deepEqual(h.sent, [{ id: 'one', pageId: 'main', zoom: 2, offset: { x: 30, y: 60 }, ts: 21000 }]);
  assert.equal(h.delivery.flush(), false);
});

test('repeated clicks during reconnect send only the latest requested place', () => {
  const h = harness();
  h.delivery.request({ id: 'old', offset: { x: 1, y: 1 } }, ['pupil']);
  h.delivery.request({ id: 'latest', offset: { x: 900, y: 800 } }, ['pupil']);
  h.ready(true); h.delivery.flush();
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].id, 'latest');
  assert.deepEqual(h.sent[0].offset, { x: 900, y: 800 });
});

test('switching boards or leaving cancels a pending summon', () => {
  const h = harness();
  h.delivery.request({ id: 'old-room' }, ['pupil']);
  h.delivery.cancel(); h.ready(true); h.delivery.flush();
  assert.equal(h.sent.length, 0);
  h.delivery.request({ id: 'live' }, ['pupil']); h.delivery.dispose();
  const count = h.states.length;
  h.delivery.acknowledge('pupil', 'live');
  h.delivery.request({ id: 'after-unmount' });
  assert.equal(h.states.length, count);
  assert.equal(h.sent.length, 1);
});

test('only the current command and its addressed pupils can confirm delivery', () => {
  const h = harness(); h.ready(true);
  h.delivery.request({ id: 'group' }, ['a', 'b', 'a']);
  h.delivery.acknowledge('outside', 'group'); h.delivery.acknowledge('a', 'previous');
  assert.equal(h.states.at(-1).remaining, 2);
  h.delivery.acknowledge('a', 'group'); h.delivery.acknowledge('a', 'group');
  assert.equal(h.states.at(-1).remaining, 1);
  h.advance(50); h.delivery.acknowledge('b', 'group');
  assert.equal(h.states.at(-1).phase, 'confirmed');
  assert.equal(h.states.at(-1).elapsedMs, 50);
});

test('very old queued commands do not unexpectedly move a pupil after a long outage', () => {
  const h = harness();
  h.delivery.request({ id: 'stale' }, ['pupil']);
  h.advance(30_001); h.ready(true); h.delivery.flush();
  assert.equal(h.sent.length, 0);
  assert.equal(h.states.at(-1).phase, 'expired');
});

test('a pupil can confirm after a warning without a second summon; duplicate awareness is ignored', () => {
  const h = harness(); h.ready(true);
  h.delivery.request({ id: 'visible-later' }, ['pupil']);
  h.delivery.timeout();
  assert.equal(h.states.at(-1).phase, 'unconfirmed');
  h.delivery.acknowledge('pupil', 'visible-later');
  assert.equal(h.states.at(-1).phase, 'confirmed');
  const count = h.states.length;
  h.delivery.acknowledge('pupil', 'visible-later');
  assert.equal(h.states.length, count);
  assert.equal(h.sent.length, 1);
});

test('timeout cancels a disconnected command instead of dispatching it much later', () => {
  const h = harness();
  h.delivery.request({ id: 'never-sent' }, ['pupil']);
  h.delivery.timeout(); h.ready(true); h.delivery.flush();
  assert.equal(h.sent.length, 0);
  assert.equal(h.states.at(-1).phase, 'expired');
});

test('a connection failure during send preserves the click for a successful retry', () => {
  let failing=true;const sent=[],states=[];
  const d=createBoardSummonDelivery({isReady:()=>true,send:command=>{if(failing)throw Error('Socket closed');sent.push(command);},onState:state=>states.push(state)});
  assert.doesNotThrow(()=>d.request({id:'recover'},['pupil']));
  assert.equal(states.at(-1).phase,'queued');failing=false;
  assert.equal(d.flush(),true);assert.equal(sent.length,1);assert.equal(sent[0].id,'recover');
});
