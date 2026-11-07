import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RtcVideoDiagnostics, normalizeRtcVideoDiagnostic } from './rtcVideoDiagnostics.js';

test('screen diagnostics accept only bounded metrics and enums, never screen contents or claimed identity', () => {
  assert.deepEqual(normalizeRtcVideoDiagnostic({ direction: 'outbound', fps: 900, width: 1920, bitrate: Infinity,
    limitation: 'cpu', codec: 'video/H264', powerEfficient: true, route: 'TURN/UDP', sdp: 'secret', token: 'secret',
    observerId: 'forged', title: 'Private sheet', processingMs: -4, network: '2', parameterError: 'private message' }),
  { direction: 'outbound', fps: 120, width: 1920, limitation: 'cpu', codec: 'video/h264', powerEfficient: true, route: 'TURN/UDP' });
  assert.equal(normalizeRtcVideoDiagnostic({ direction: 'anything' }), null);
});

test('video journal is bounded, expires, survives restart and limits each authenticated websocket', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtc-video-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'video.json'); let now = Date.parse('2026-11-07T12:00:00Z');
  const client = { clientId: 'ws', roomId: 'rtc:test', auth: { id: 'teacher', role: 'teacher' } }, peer = { auth: { id: 'student', role: 'student' } };
  const log = new RtcVideoDiagnostics({ file, now: () => now, maxRecords: 3 });
  for (let i = 0; i < 60; i++) assert.equal(log.record({ client, peer, event: { direction: 'inbound', fps: 12, observerId: 'forged' } }), true);
  assert.equal(log.record({ client, peer, event: { direction: 'inbound' } }), false);
  log.flush(); assert.equal(log.rows.length, 3);
  const restarted = new RtcVideoDiagnostics({ file, now: () => now, maxRecords: 3 }); assert.equal(restarted.rows.length, 3);
  assert.ok(!fs.readFileSync(file, 'utf8').includes('forged'));
  now += 4 * 86400000; restarted.record({ client, peer, event: { direction: 'outbound', fps: 30 } }); restarted.flush();
  assert.equal(restarted.rows.length, 1); assert.equal(restarted.rows[0].observerId, 'teacher');
});
