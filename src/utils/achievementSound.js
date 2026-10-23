// Original short three-note chime. No external audio requests or dependencies.
export function createAchievementSound() {
  let context = null;
  const prime = () => {
    try {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return;
      context ||= new Context();
      void context.resume().catch(() => {});
    } catch { /* Sound must never block a reward. */ }
  };
  return {
    prime,
    play() {
      prime();
      if (!context || context.state !== 'running') return false;
      const start = context.currentTime;
      [523.25, 659.25, 1046.5].forEach((frequency, index) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        const at = start + index * .105;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(.055, at + .015);
        gain.gain.exponentialRampToValueAtTime(.001, at + .34);
        oscillator.connect(gain).connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at); oscillator.stop(at + .36);
      });
      return true;
    },
    dispose() { void context?.close().catch(() => {}); context = null; },
  };
}
