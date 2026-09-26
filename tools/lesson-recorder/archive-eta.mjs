const valid = sample => Number.isFinite(sample?.audioSeconds) && sample.audioSeconds >= 20
  && Number.isFinite(sample?.wallSeconds) && sample.wallSeconds > 0;

export function rememberSpeed(samples = [], sample) {
  if (!valid(sample)) return samples;
  return [...samples.filter(valid), sample].slice(-40);
}

// Measure this computer and this model; never substitute video duration for
// processing time or count a pause as useful work.
export function queueEstimate({ items, queue, speedSamples = [], work, paused = false, blocked = false, now = Date.now() }) {
  const queued = [...new Set(queue)].map(id => items.find(item => item.id === id)).filter(item => item && item.status !== 'done');
  const stopped = paused || blocked || Boolean(work && work.kind !== 'transcribe');
  let seconds = 0, remainingAudioSeconds = 0, unknownCount = 0, unmeasuredCount = 0;
  for (const item of queued) {
    if (!Number.isFinite(item.duration) || item.duration <= 0) { unknownCount++; continue; }
    const current = !stopped && work?.kind === 'transcribe' && work.id === item.id ? work : null;
    const progress = Math.min(item.duration, Math.max(item.processed || 0, current?.seconds || 0));
    const remaining = Math.max(0, item.duration - progress);
    remainingAudioSeconds += remaining;
    const model = item.model || 'base';
    const samples = speedSamples.filter(s => valid(s) && s.model === model).slice(-10);
    let rate = samples.length ? samples.reduce((sum, s) => sum + s.wallSeconds, 0) / samples.reduce((sum, s) => sum + s.audioSeconds, 0) : null;
    // Give a preliminary forecast during the first chunk, before its checkpoint.
    if (!rate && current?.inferenceStartedAt && current.phase === 'transcribing') {
      const audio = progress - (current.chunkStart || 0);
      const elapsed = (now - current.inferenceStartedAt) / 1000;
      if (audio >= 30 && elapsed >= 3) rate = elapsed / audio;
    }
    // Other queued files can use the active chunk's measured speed too.
    if (!rate && !stopped && work?.kind === 'transcribe' && work.phase === 'transcribing' && work.inferenceStartedAt && work.model === model) {
      const audio = work.seconds - (work.chunkStart || 0);
      const elapsed = (now - work.inferenceStartedAt) / 1000;
      if (audio >= 30 && elapsed >= 3) rate = elapsed / audio;
    }
    if (remaining > 0 && !rate) unmeasuredCount++;
    else seconds += remaining * (rate || 0);
  }
  return {
    pendingCount: queued.length, remainingAudioSeconds, unknownCount, unmeasuredCount, paused: stopped,
    seconds: unknownCount || unmeasuredCount ? null : Math.ceil(seconds),
    stage: !queued.length ? 'empty' : unknownCount ? 'durations' : unmeasuredCount ? 'calibrating' : 'estimated',
  };
}
