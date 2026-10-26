import test from 'node:test';
import assert from 'node:assert/strict';
import { CellRoom, LivePeer, emptyCell, startLiveLoop } from './sync.mjs';
import { createRelay } from './relay.mjs';

const addresses = ['A1', 'B1', 'C1'];
const number = value => ({ kind: 'number', value });
const operation = (id, address, property, value, baseVersion = 0) => ({ id, address, property, value, baseVersion });
const memoryAdapter = () => {
  const cells = Object.fromEntries(addresses.map(address => [address, emptyCell()]));
  return { cells, async request(command) {
    if (command.type === 'snapshot') return { cells: structuredClone(cells) };
    const applied = [], skipped = [];
    for (const change of command.changes) for (const property of ['content', 'fill']) {
      if (!Object.hasOwn(change, property)) continue;
      if (command.type === 'apply' && !assertSame(cells[change.address][property], change.expected[property])) skipped.push({ address: change.address, property });
      else { cells[change.address][property] = structuredClone(change[property]); applied.push({ address: change.address, property }); }
    }
    return { applied, skipped };
  } };
};
function assertSame(a, b) { try { assert.deepEqual(a, b); return true; } catch { return false; } }
async function pair() {
  const room = new CellRoom(addresses), a = memoryAdapter(), b = memoryAdapter();
  const teacher = new LivePeer({ actor: 'teacher', adapter: a, exchange: async ops => room.submit('teacher', ops) });
  const pupil = new LivePeer({ actor: 'pupil', adapter: b, exchange: async ops => room.submit('pupil', ops) });
  await teacher.initialize(); await pupil.initialize();
  return { room, teacher, pupil, a, b };
}
async function settle(...peers) { for (let round = 0; round < 3; round++) await Promise.all(peers.map(peer => peer.sync())); }

test('concurrent edits to different cells merge without losing either author', async () => {
  const { room, teacher, pupil, a, b } = await pair();
  a.cells.A1.content = number(12); b.cells.B1.content = number(30);
  await settle(teacher, pupil);
  assert.deepEqual(a.cells, b.cells); assert.deepEqual(a.cells, room.cells);
  assert.equal(a.cells.A1.content.value, 12); assert.equal(a.cells.B1.content.value, 30);
  const revision = room.revision; await settle(teacher, pupil);
  assert.equal(room.revision, revision, 'remote writes must not echo as new local changes');
});

test('contents and fill of the same cell merge independently', async () => {
  const { teacher, pupil, a, b } = await pair();
  a.cells.A1.content = number(17); b.cells.A1.fill = 0xffcc00;
  await settle(teacher, pupil);
  assert.deepEqual(a.cells.A1, { content: number(17), fill: 0xffcc00 });
  assert.deepEqual(a.cells, b.cells);
});

test('same-property conflicts retain both versions and need an explicit decision', async () => {
  const { teacher, pupil, room, a, b } = await pair();
  a.cells.A1.content = number(1); b.cells.A1.content = number(2);
  await teacher.sync(); await pupil.sync();
  assert.equal(pupil.conflicts.size, 1); assert.equal(b.cells.A1.content.value, 2);
  assert.equal(room.cells.A1.content.value, 1);
  assert.equal(pupil.conflicts.get('A1:content').remote.value, 1);
  await pupil.resolve('A1', 'content', 'local'); await settle(teacher, pupil);
  assert.deepEqual(a.cells, b.cells); assert.equal(a.cells.A1.content.value, 2);
});

test('taking the remote conflict result does not discard unrelated local work', async () => {
  const { teacher, pupil, a, b } = await pair();
  a.cells.A1.content = number(1); b.cells.A1.content = number(2); b.cells.B1.content = number(99);
  await teacher.sync(); await pupil.sync(); await pupil.resolve('A1', 'content', 'remote');
  await settle(teacher, pupil);
  assert.equal(b.cells.A1.content.value, 1); assert.equal(b.cells.B1.content.value, 99);
  assert.deepEqual(a.cells, b.cells);
});

test('a local edit made during a network request is not overwritten by remote apply', async () => {
  const { teacher, pupil, room, a, b } = await pair();
  a.cells.A1.content = number(12); await teacher.sync();
  const exchange = pupil.exchange;
  pupil.exchange = async ops => { const result = await exchange(ops); b.cells.A1.content = number(88); return result; };
  await pupil.sync();
  assert.equal(b.cells.A1.content.value, 88); assert.equal(pupil.metrics.skipped, 1);
  pupil.exchange = exchange; await pupil.sync();
  assert.equal(pupil.conflicts.size, 1); assert.equal(room.cells.A1.content.value, 12);
});

test('a lost receipt retries the same operation once, without duplicate mutations', async () => {
  const { teacher, pupil, room, a, b } = await pair();
  a.cells.A1.content = number(42);
  const exchange = teacher.exchange;
  teacher.exchange = async ops => { await exchange(ops); throw Error('Connection interrupted after server commit'); };
  await assert.rejects(teacher.sync(), /Connection interrupted/);
  assert.equal(teacher.pending.length, 1); assert.equal(room.revision, 1);
  teacher.exchange = exchange; await settle(teacher, pupil);
  assert.equal(room.revision, 1); assert.deepEqual(a.cells, b.cells);
});

test('formula and text content keep their types; clear and fill reset propagate', async () => {
  const { teacher, pupil, a, b } = await pair();
  a.cells.A1.content = { kind: 'formula', value: '=SUM(B1,C1)' };
  b.cells.B1.content = { kind: 'text', value: '=not a formula' };
  b.cells.C1.fill = 0x12ab34; await settle(teacher, pupil);
  assert.deepEqual(a.cells, b.cells);
  a.cells.A1.content = { kind: 'empty' }; b.cells.C1.fill = null;
  await settle(teacher, pupil);
  assert.equal(b.cells.A1.content.kind, 'empty'); assert.equal(a.cells.C1.fill, null);
});

test('invalid batches and unsupported external formulas do not partially change state', () => {
  const room = new CellRoom(addresses), before = room.snapshot();
  for (const invalid of [operation('b', 'Z99', 'content', number(1)), operation('b', 'A1', 'fill', -1),
    operation('b', 'A1', 'content', { kind: 'formula', value: '=HYPERLINK("https://example.com")' }),
    operation('b', 'A1', 'content', number(Infinity))]) {
    assert.throws(() => room.submit('teacher', [operation('a', 'B1', 'content', number(1)), invalid]));
    assert.deepEqual(room.snapshot(), before);
  }
});

test('reusing an operation id with different contents is rejected', () => {
  const room = new CellRoom(addresses);
  room.submit('teacher', [operation('one', 'A1', 'content', number(1))]);
  assert.throws(() => room.submit('teacher', [operation('one', 'A1', 'content', number(2))]), /reused/);
  assert.equal(room.cells.A1.content.value, 1);
});

test('conflicting duplicate ids in the same batch are rejected before any mutation', () => {
  const room = new CellRoom(addresses), before = room.snapshot();
  assert.throws(() => room.submit('teacher', [operation('one', 'A1', 'content', number(1)), operation('one', 'A1', 'content', number(2))]), /reused/);
  assert.deepEqual(room.snapshot(), before);
});

test('the automatic loop transfers new edits and stops without leaving timers', async () => {
  const { teacher, pupil, a, b } = await pair();
  const loop = startLiveLoop([teacher, pupil], { intervalMs: 5 });
  try {
    a.cells.A1.content = number(71);
    const deadline = Date.now() + 1000;
    while (b.cells.A1.content.value !== 71 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(b.cells.A1.content.value, 71);
  } finally { await loop.stop(); }
  const cycles = teacher.metrics.cycles;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(teacher.metrics.cycles, cycles);
});

test('a workbook with pre-existing different data cannot be silently replaced on join', async () => {
  const room = new CellRoom(addresses), adapter = memoryAdapter(); adapter.cells.B1.content = number(19);
  const peer = new LivePeer({ actor: 'teacher', adapter, exchange: async ops => room.submit('teacher', ops) });
  await assert.rejects(peer.initialize(), /never replaces existing work/);
  assert.equal(adapter.cells.B1.content.value, 19);
});

test('loopback relay rejects unscoped clients and transports only cell operations', async () => {
  const relay = await createRelay(addresses);
  try {
    assert.equal((await fetch(relay.url, { method: 'POST', body: '{}' })).status, 401);
    const response = await relay.exchange('teacher')([operation('first', 'A1', 'content', number(7))]);
    assert.equal(response.cells.A1.content.value, 7);
    assert.equal(relay.metrics().requests, 1);
  } finally { await relay.close(); }
});
