import test from 'node:test';
import assert from 'node:assert/strict';
import { createCallAlertPlayer } from './callAlertSounds.js';

function setup(overrides = {}) {
  const calls = [];
  const sources = [];
  const gains = [];
  const errors = [];
  let time = 1000;
  const context = {
    state: 'suspended',
    destination: { speakers: true },
    resume() { calls.push('resume'); this.state = 'running'; return Promise.resolve(); },
    decodeAudioData(bytes) { calls.push('decode'); return Promise.resolve({ bytes }); },
    createBufferSource() {
      const source = {
        connect(node) { this.output = node; },
        disconnect() { this.disconnected = true; },
        start() { this.started = true; },
        stop() { this.stopped = true; },
      };
      sources.push(source);
      return source;
    },
    createGain() {
      const gain = {
        gain: { value: 1 },
        connect(node) { this.output = node; },
        disconnect() { this.disconnected = true; },
      };
      gains.push(gain);
      return gain;
    },
    close() { this.state = 'closed'; return Promise.resolve(); },
  };
  const player = createCallAlertPlayer({
    createContext: () => context,
    fetchAudio: async (url) => {
      calls.push(`fetch:${url}`);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
    },
    onError: (message) => errors.push(message),
    now: () => time,
    ...overrides,
  });
  return { player, context, calls, sources, gains, errors, advance: (ms) => { time += ms; } };
}

test('unlock happens in the gesture before loading; later remote cues reuse decoded audio', async () => {
  const env = setup();
  env.player.prime();
  assert.equal(env.calls[0], 'resume');
  assert.equal(await env.player.play('connected'), true);
  env.sources[0].onended();
  env.advance(1000);
  assert.equal(await env.player.play('peerJoined'), true);
  assert.equal(env.calls.filter((call) => call === 'fetch:/sounds/call/soft-join-v1.mp3').length, 1);
  assert.equal(env.calls.filter((call) => call === 'resume').length, 1);
  assert.equal(env.gains[1].output, env.context.destination);
  assert.equal(env.sources[0].disconnected, true);
  env.player.dispose();
});

test('an autoplay denial is visible and a subsequent gesture can restore cues', async () => {
  const env = setup();
  const resume = env.context.resume.bind(env.context);
  env.context.resume = () => Promise.reject(new Error('NotAllowedError'));
  assert.equal(await env.player.play('connected'), false);
  assert.match(env.errors.at(-1), /Проверить звук/);
  assert.equal(env.sources.length, 0);
  env.context.resume = resume;
  env.player.prime();
  assert.equal(await env.player.play('connected'), true);
  assert.equal(env.errors.at(-1), '');
  env.player.dispose();
});

test('an interrupted context resumes on the next cue', async () => {
  const env = setup();
  assert.equal(await env.player.play('connected'), true);
  env.context.state = 'interrupted';
  assert.equal(await env.player.play('screenOn'), true);
  assert.equal(env.calls.filter((call) => call === 'resume').length, 2);
  env.player.dispose();
});

test('a browser that leaves resume pending cannot queue a stale cue until the next click', async () => {
  const env = setup();
  const resume = env.context.resume.bind(env.context);
  env.context.resume = () => new Promise(() => {});
  assert.equal(await env.player.play('connected'), false);
  assert.match(env.errors.at(-1), /Проверить звук/);
  env.context.resume = resume;
  env.player.prime();
  assert.equal(env.sources.length, 0);
  assert.equal(await env.player.play('screenOn'), true);
  env.player.dispose();
});

test('a failed sound download is retried instead of caching silence', async () => {
  let requests = 0;
  const env = setup({ fetchAudio: async () => {
    requests++;
    return { ok: requests > 1, status: 503, arrayBuffer: async () => new ArrayBuffer(4) };
  } });
  assert.equal(await env.player.play('peerLeft'), false);
  assert.match(env.errors.at(-1), /Не удалось/);
  assert.equal(await env.player.play('peerLeft'), true);
  assert.equal(requests, 2);
  env.player.dispose();
});

test('a cue delayed by the network does not play after its event is stale', async () => {
  let finishDownload;
  const env = setup({ fetchAudio: () => new Promise((resolve) => { finishDownload = resolve; }) });
  const result = env.player.play('peerJoined');
  env.advance(5000);
  finishDownload({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  assert.equal(await result, false);
  assert.equal(env.sources.length, 0);
  env.player.dispose();
});

test('leaving the component cancels downloads and prevents late sounds', async () => {
  let finishDownload;
  let signal;
  const env = setup({ fetchAudio: (url, options) => {
    signal = options.signal;
    return new Promise((resolve) => { finishDownload = resolve; });
  } });
  const result = env.player.play('connected');
  env.player.dispose();
  assert.equal(signal.aborted, true);
  finishDownload({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  assert.equal(await result, false);
  assert.equal(env.sources.length, 0);
  assert.deepEqual(env.errors, []);
  assert.equal(await env.player.play('connected'), false);
});

test('duplicate join notifications and event bursts cannot stack unlimited gain', async () => {
  const env = setup();
  assert.equal(await env.player.play('connected'), true);
  assert.equal(await env.player.play('peerJoined'), false);
  assert.equal(await env.player.play('screenOn'), true);
  assert.equal(await env.player.play('peerLeft'), true);
  assert.equal(await env.player.play('screenOff'), false);
  env.player.dispose();
  assert.equal(env.sources.every((source) => source.stopped && source.disconnected), true);
});
