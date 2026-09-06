export const CALL_ALERT_SOUNDS = Object.freeze({
  connected: { source: '/sounds/call/soft-join-v1.mp3', volume: 0.85 },
  disconnected: { source: '/sounds/call/soft-leave-v1.mp3', volume: 0.75 },
  peerJoined: { source: '/sounds/call/soft-join-v1.mp3', volume: 0.85 },
  peerLeft: { source: '/sounds/call/soft-leave-v1.mp3', volume: 0.75 },
  screenOn: { source: '/sounds/call/soft-screen-on-v1.mp3', volume: 0.85 },
  screenOff: { source: '/sounds/call/soft-screen-off-v1.mp3', volume: 0.75 },
  micMuted: { source: '/sounds/mute.mp3', volume: 0.1 },
  micUnmuted: { source: '/sounds/unmute.mp3', volume: 0.1 },
});

const MAX_CUE_AGE_MS = 2500;
const RESUME_TIMEOUT_MS = 1500;

// UI cues have their own output, separate from microphone and recording tracks.
// Reuse one context: loading/cloning an HTMLAudioElement does not unlock playback.
export function createCallAlertPlayer({
  createContext = () => {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    return new AudioContext();
  },
  fetchAudio = (...args) => fetch(...args),
  now = () => Date.now(),
  onError = () => {},
} = {}) {
  let context;
  let disposed = false;
  let resumePending;
  const buffers = new Map();
  const active = new Set();
  const lastPlayed = new Map();
  const fetchController = new AbortController();

  function ensureContext() {
    if (disposed) return null;
    if (!context) context = createContext();
    return context;
  }

  function resume() {
    try {
      const audioContext = ensureContext();
      if (!audioContext) return Promise.resolve(false);
      if (audioContext.state === 'running') return Promise.resolve(true);
      // Call resume synchronously inside the user's gesture, before any fetch/await.
      const attempt = audioContext.resume();
      if (!resumePending) {
        resumePending = new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), RESUME_TIMEOUT_MS);
          Promise.resolve(attempt).then(() => {
            clearTimeout(timer);
            resolve(!disposed && audioContext.state === 'running');
          }, () => {
            clearTimeout(timer);
            resolve(false);
          });
        }).finally(() => { resumePending = null; });
      } else {
        // A later trusted gesture may unlock an earlier pending resume request.
        Promise.resolve(attempt).catch(() => {});
      }
      return resumePending;
    } catch {
      return Promise.resolve(false);
    }
  }

  function load(source) {
    if (buffers.has(source)) return buffers.get(source);
    const audioContext = ensureContext();
    if (!audioContext) return Promise.reject(new Error('Audio player closed'));
    const pending = (async () => {
      const response = await fetchAudio(source, { signal: fetchController.signal });
      if (!response.ok) throw new Error(`Sound HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (disposed) throw new Error('Audio player closed');
      return audioContext.decodeAudioData(bytes);
    })();
    buffers.set(source, pending);
    pending.catch(() => {
      // A temporary network/decode failure must not silence this cue forever.
      if (buffers.get(source) === pending) buffers.delete(source);
    });
    return pending;
  }

  function prime() {
    if (disposed) return;
    void resume();
    for (const source of new Set(Object.values(CALL_ALERT_SOUNDS).map((cue) => cue.source))) {
      try {
        void load(source).catch(() => {});
      } catch {
        // Report unavailable audio only when a cue is actually requested.
      }
    }
  }

  async function play(key) {
    const cue = CALL_ALERT_SOUNDS[key];
    if (!cue || disposed) return false;
    const requestedAt = now();
    const ready = resume();
    try {
      const [buffer, resumed] = await Promise.all([load(cue.source), ready]);
      if (disposed) return false;
      if (!resumed || context.state !== 'running') {
        onError('Нажмите «Проверить звук», чтобы включить звуки звонка.');
        return false;
      }
      // Do not replay old events in a burst after a slow network or an interruption.
      if (now() - requestedAt > MAX_CUE_AGE_MS) return false;
      if (now() - (lastPlayed.get(cue.source) ?? -Infinity) < 250 || active.size >= 3) return false;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value = cue.volume;
      source.connect(gain);
      gain.connect(context.destination);
      const entry = { source, gain };
      const finish = () => {
        active.delete(entry);
        source.onended = null;
        source.disconnect();
        gain.disconnect();
      };
      source.onended = finish;
      active.add(entry);
      try {
        source.start();
      } catch (error) {
        finish();
        throw error;
      }
      lastPlayed.set(cue.source, now());
      onError('');
      return true;
    } catch {
      if (!disposed) onError('Не удалось воспроизвести звук. Нажмите «Проверить звук», чтобы повторить.');
      return false;
    }
  }

  function dispose() {
    disposed = true;
    fetchController.abort();
    for (const { source, gain } of active) {
      source.onended = null;
      source.stop();
      source.disconnect();
      gain.disconnect();
    }
    active.clear();
    buffers.clear();
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  return { prime, play, resume, dispose };
}
