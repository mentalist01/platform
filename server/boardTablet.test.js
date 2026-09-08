import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import http from 'node:http';
import express from 'express';
import { WebSocket } from 'ws';
import { createBoardTabletService } from './boardTablet.js';

const setup = async (t, options = {}) => {
  let allowed = true;
  let clock = 100_000;
  const service = createBoardTabletService({ authorize: (auth, room) => allowed && auth?.id === 'teacher' && room === 'board-teacher-student', now: () => clock, ...options });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.auth = { id: req.headers['x-test-user'] || 'teacher', role: 'teacher' }; next(); });
  app.post('/pair', service.create); app.delete('/pair/:id', service.remove);
  const server = http.createServer(app);
  server.on('upgrade', service.upgrade);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(async () => { for (const ws of sockets) ws.terminate(); service.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const create = async (roomId = 'board-teacher-student', user = 'teacher') => fetch(`${origin}/pair`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-User': user }, body: JSON.stringify({ roomId }),
  });
  const pair = await (await create()).json();
  const connect = async (side, override = {}) => {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + service.path); sockets.push(ws);
    const messages = [];
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    const waitFor = async (predicate) => {
      for (let count = 0; count < 300; count += 1) {
        const index = messages.findIndex(predicate);
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Missing message; received ${JSON.stringify(messages)}`);
    };
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'join', side, id: pair.id, key: side === 'host' ? pair.hostKey : pair.penKey, deviceId: 'test-device-1234567890', ...override }));
    return { ws, messages, waitFor, send: (value) => ws.send(JSON.stringify(value)) };
  };
  return { service, pair, connect, create, origin, advance: (ms) => { clock += ms; service.sweep(); }, deny: () => { allowed = false; service.sweep(); } };
};

test('pairing enforces owner, room, phone role and single device', async (t) => {
  const fixture = await setup(t);
  assert.equal((await fixture.create('board-other')).status, 403);
  assert.equal((await fixture.create('board-teacher-student', 'stranger')).status, 403);
  const bad = await fixture.connect('pen', { key: fixture.pair.hostKey });
  await bad.waitFor((m) => m.type === 'ended');
  const pen = await fixture.connect('pen'); await pen.waitFor((m) => m.type === 'ready');
  const second = await fixture.connect('pen', { deviceId: 'other-device-1234567890' });
  assert.match((await second.waitFor((m) => m.type === 'ended')).message, /другой телефон/);
  const res = await fetch(`${fixture.origin}/pair/${fixture.pair.id}`, { method: 'DELETE', headers: { 'X-Test-User': 'other' } });
  assert.equal(res.status, 403);
});

test('real sockets relay frame, ink and ack; retry after reconnect is idempotent', async (t) => {
  const { connect } = await setup(t);
  const host = await connect('host'); await host.waitFor((m) => m.type === 'ready');
  let pen = await connect('pen'); await pen.waitFor((m) => m.type === 'ready');
  const frame = { type: 'frame', id: 'frame-1', width: 1000, height: 500, image: 'data:image/jpeg;base64,YQ==', revision: 0, view: { x: -100, y: 200, zoom: 2 } };
  host.send(frame); assert.deepEqual(await pen.waitFor((m) => m.type === 'frame'), frame);
  const stroke = { id: 'stroke-1', frameId: 'frame-1', color: '#8247e5', width: 3, points: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }] };
  pen.send({ type: 'preview', stroke }); assert.deepEqual((await host.waitFor((m) => m.type === 'preview')).stroke, stroke);
  pen.send({ type: 'stroke', stroke }); await host.waitFor((m) => m.type === 'stroke');
  host.send({ type: 'ack', id: stroke.id, ok: true, revision: 1 });
  assert.equal((await pen.waitFor((m) => m.type === 'ack')).revision, 1);
  pen.ws.close(); await once(pen.ws, 'close');
  pen = await connect('pen'); await pen.waitFor((m) => m.type === 'ready');
  assert.deepEqual(await pen.waitFor((m) => m.type === 'frame'), frame);
  pen.send({ type: 'stroke', stroke });
  const retried = await pen.waitFor((m) => m.type === 'ack');
  assert.equal(retried.ok, true); assert.equal(retried.revision, 1);
  assert.equal(host.messages.filter((m) => m.type === 'stroke').length, 0);
  pen.send({ type: 'undo', id: 'undo-1', strokeId: stroke.id });
  assert.equal((await host.waitFor((m) => m.type === 'undo')).strokeId, stroke.id);
  host.send({ ...frame, id: 'rendered-stroke', revision: 1 });
  assert.equal((await pen.waitFor((m) => m.type === 'frame')).revision, 1);
});

test('expired QR, revoked account access and abandoned computer close access', async (t) => {
  const fixture = await setup(t, { pairingMs: 100, hostGraceMs: 50 });
  fixture.advance(101);
  const expired = await fixture.connect('pen'); await expired.waitFor((m) => m.type === 'ended');
  const second = await setup(t);
  const host = await second.connect('host'); await host.waitFor((m) => m.type === 'ready');
  const pen = await second.connect('pen'); await pen.waitFor((m) => m.type === 'ready');
  second.deny(); await pen.waitFor((m) => m.type === 'ended');
  const third = await setup(t, { hostGraceMs: 50 });
  const abandoned = await third.connect('pen'); await abandoned.waitFor((m) => m.type === 'ready');
  third.advance(51); await abandoned.waitFor((m) => m.type === 'ended');
});

test('phone cannot replace frame or forward arbitrary Yjs/code commands', async (t) => {
  const { connect } = await setup(t);
  const host = await connect('host'); await host.waitFor((m) => m.type === 'ready');
  const pen = await connect('pen'); await pen.waitFor((m) => m.type === 'ready');
  pen.send({ type: 'frame', id: 'forged', width: 20, height: 20, image: 'data:image/jpeg;base64,YQ==' });
  pen.send({ type: 'delete-all', room: 'other-board' });
  pen.send({ type: 'ping' }); await pen.waitFor((m) => m.type === 'pong');
  assert.equal(host.messages.filter((m) => ['frame', 'delete-all'].includes(m.type)).length, 0);
  pen.send({ type: 'stroke', stroke: { id: 'bad', frameId: 'f', width: 2, color: '#000000', points: [{ x: 100, y: 0 }] } });
  const [code] = await once(pen.ws, 'close'); assert.equal(code, 1008);
});
