// Text sharing needs readable pixels before it needs a high animation rate.
export const SCREEN_CAPTURE_MAX_FPS = 30;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const delta = (next, previous, key) => finite(next?.[key]) && finite(previous?.[key]) && next[key] >= previous[key]
  ? next[key] - previous[key] : null;
const video = row => (row.kind || row.mediaType) === 'video' && !row.isRemote;

export function findScreenVideoReport(stats, { direction, mid, trackId } = {}) {
  if (!stats || !['outbound', 'inbound'].includes(direction)) return null;
  const rows = [];
  stats.forEach(row => {
    if (row.type !== `${direction}-rtp` || !video(row)) return;
    const source = row.mediaSourceId ? stats.get(row.mediaSourceId) : null;
    if (mid != null && String(row.mid) === String(mid)
      || trackId && (row.trackIdentifier === trackId || source?.trackIdentifier === trackId)) rows.push(row);
  });
  // This app uses one encoding per screen. Never guess from a camera report.
  return rows.length === 1 ? rows[0] : null;
}

export function createScreenVideoSampler() {
  let previous = null;
  return {
    reset() { previous = null; },
    sample(stats, selector) {
      const row = findScreenVideoReport(stats, selector);
      if (!row) { previous = null; return null; }
      const remote = row.remoteId ? stats.get(row.remoteId) : null;
      const inbound = selector.direction === 'inbound';
      const snapshot = { ...row, lost: inbound ? row.packetsLost : remote?.packetsLost };
      const same = previous?.id === row.id && previous?.ssrc === row.ssrc && previous?.trackId === selector.trackId;
      const elapsed = same ? row.timestamp - previous.timestamp : 0;
      const valid = elapsed >= 250 && elapsed <= 15000;
      const framesKey = inbound ? 'framesDecoded' : 'framesEncoded';
      const frames = valid ? delta(snapshot, previous, framesKey) : null;
      const bytes = valid ? delta(snapshot, previous, inbound ? 'bytesReceived' : 'bytesSent') : null;
      const packets = valid ? delta(snapshot, previous, inbound ? 'packetsReceived' : 'packetsSent') : null;
      const lost = valid ? delta(snapshot, previous, 'lost') : null;
      const processing = valid ? delta(snapshot, previous, inbound ? 'totalDecodeTime' : 'totalEncodeTime') : null;
      const codec = stats.get(row.codecId);
      let availableBitrate;
      const transport = stats.get(row.transportId);
      const pair = stats.get(transport?.selectedCandidatePairId);
      if (!inbound && finite(pair?.availableOutgoingBitrate)) availableBitrate = pair.availableOutgoingBitrate;
      const sample = {
        direction: selector.direction, measured: Boolean(valid && frames !== null && bytes !== null),
        width: row.frameWidth, height: row.frameHeight,
        fps: frames === null ? undefined : frames * 1000 / elapsed,
        bitrate: bytes === null ? undefined : bytes * 8000 / elapsed,
        lossPercent: lost !== null && packets !== null && packets + (inbound ? lost : 0) > 0
          ? Math.min(100, lost / (packets + (inbound ? lost : 0)) * 100) : undefined,
        processingMs: processing !== null && frames > 0 ? processing * 1000 / frames : undefined,
        processingLoad: processing !== null ? processing * 1000 / elapsed : undefined,
        framesDropped: valid ? delta(snapshot, previous, 'framesDropped') : undefined,
        freezes: valid ? delta(snapshot, previous, 'freezeCount') : undefined,
        limitation: ['cpu', 'bandwidth', 'other', 'none'].includes(row.qualityLimitationReason) ? row.qualityLimitationReason : 'unknown',
        availableBitrate, codec: codec?.mimeType,
        powerEfficient: inbound ? row.powerEfficientDecoder : row.powerEfficientEncoder,
      };
      previous = { ...snapshot, trackId: selector.trackId };
      return sample;
    },
  };
}

export function createScreenVideoController() {
  let cpu = 0, network = 0, badCpu = 0, badNetwork = 0, healthy = 0, lastChange = -Infinity;
  return {
    profile() { return { cpu, network }; },
    sample(sample, now) {
      if (!sample?.measured || sample.direction !== 'outbound') return false;
      // A static sheet may legitimately produce almost no frames. Low fps alone
      // is not evidence of trouble and must never keep reducing screen quality.
      const busy = sample.bitrate > 10000 && sample.fps > 0;
      const cpuLimited = sample.limitation === 'cpu' || busy && sample.processingLoad > 0.8;
      const networkLimited = busy && (sample.limitation === 'bandwidth' || sample.lossPercent > 5);
      badCpu = cpuLimited ? badCpu + 1 : 0;
      badNetwork = networkLimited ? badNetwork + 1 : 0;
      healthy = !cpuLimited && !networkLimited && sample.limitation !== 'other' ? healthy + 1 : 0;
      if (now - lastChange < 10000) return false;
      let changed = false;
      if (badCpu >= 2 && cpu < 2) { cpu++; badCpu = 0; changed = true; }
      if (badNetwork >= 2 && network < 2) { network++; badNetwork = 0; changed = true; }
      if (healthy >= 8 && (cpu || network)) {
        if (cpu) cpu--;
        if (network) network--;
        healthy = 0; changed = true;
      }
      if (changed) lastChange = now;
      return changed;
    },
  };
}

export function screenVideoProfile({ quality = 'good', highVideoLoad = false, controller = {}, bitrate = 3500000, minBitrate = 500000, framerate = SCREEN_CAPTURE_MAX_FPS } = {}) {
  const cpu = Math.max(0, Math.min(2, controller.cpu || 0));
  const network = Math.max(0, Math.min(2, controller.network || 0));
  const fps = Math.min(SCREEN_CAPTURE_MAX_FPS, framerate, highVideoLoad ? 20 : 30,
    quality === 'poor' ? 12 : quality === 'ok' ? 24 : 30,
    cpu === 2 ? 10 : cpu === 1 ? 20 : 30,
    network === 2 ? 8 : network === 1 ? 15 : 30);
  const ratio = Math.min(quality === 'poor' ? 0.6 : quality === 'ok' ? 0.85 : 1,
    network === 2 ? 0.4 : network === 1 ? 0.75 : 1);
  return {
    screenBitrate: Math.min(bitrate, Math.max(minBitrate, Math.round(bitrate * ratio))),
    screenFramerate: fps,
    // Only sustained video congestion may downscale; microphone jitter, CPU
    // pressure, and merely enabling a webcam no longer blur the text.
    screenScale: network === 2 ? 1.25 : 1,
    degradationPreference: 'maintain-resolution',
  };
}

// setParameters is transactional: overlapping retunes can otherwise undo a
// newer decision or fail with InvalidModificationError. Coalesce to the latest.
export function createVideoSenderTuner(onError = () => {}, onApplied = () => {}) {
  const pending = new WeakMap();
  return (sender, budget) => {
    if (!sender || typeof sender.getParameters !== 'function') return Promise.resolve();
    let state = pending.get(sender);
    if (state) { state.next = budget; return state.promise; }
    state = { next: budget };
    pending.set(sender, state);
    state.promise = Promise.resolve().then(async () => {
      while (state.next) {
        const next = state.next; state.next = null;
        try {
          const params = sender.getParameters() || {};
          if (!params.encodings?.length) continue; // Wait until SDP creates it.
          if (params.degradationPreference === next.degradationPreference
            && params.encodings.every(encoding => Object.entries(next.encoding).every(([key, value]) => encoding[key] === value))) continue;
          params.encodings = params.encodings.map(encoding => ({ ...encoding, ...next.encoding }));
          params.degradationPreference = next.degradationPreference;
          await sender.setParameters(params);
          try { onApplied(sender); } catch { /* Optional diagnostics. */ }
        } catch (error) { try { onError(sender, error); } catch { /* Optional diagnostics. */ } }
      }
    }).finally(() => pending.delete(sender));
    return state.promise;
  };
}
