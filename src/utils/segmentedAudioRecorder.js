const getDefaultMonotonicNow = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
);

/**
 * Records independently playable audio files without leaving an encoder gap
 * between them. A new recorder is started before the previous one is stopped;
 * the hand-off timestamp becomes the logical boundary between both segments.
 */
export const createSegmentedAudioRecorder = ({
  stream,
  mimeType,
  audioBitsPerSecond,
  segmentMs,
  onSegment,
  onDisabled,
  MediaRecorderClass = globalThis.MediaRecorder,
  BlobClass = globalThis.Blob,
  nowWall = () => Date.now(),
  nowMonotonic = getDefaultMonotonicNow,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timerId) => clearTimeout(timerId),
} = {}) => {
  if (!stream || typeof MediaRecorderClass !== 'function' || typeof BlobClass !== 'function') {
    throw new Error('Audio recording is not supported');
  }

  const safeSegmentMs = Math.max(1000, Math.round(Number(segmentMs) || 30_000));
  const activeSegments = new Set();
  const pendingUploads = new Set();
  let currentSegment = null;
  let stopping = false;
  let disabled = false;
  let captureSettled = false;
  let uploadsSettled = false;
  let resolveCaptureStopped;
  let resolveUploadsDrained;
  const captureStopped = new Promise((resolve) => {
    resolveCaptureStopped = resolve;
  });
  const uploadsDrained = new Promise((resolve) => {
    resolveUploadsDrained = resolve;
  });

  const finishIfIdle = () => {
    if (!captureSettled && (stopping || disabled) && activeSegments.size === 0) {
      captureSettled = true;
      resolveCaptureStopped?.();
      resolveCaptureStopped = null;
    }
    if (!uploadsSettled && captureSettled && pendingUploads.size === 0) {
      uploadsSettled = true;
      resolveUploadsDrained?.();
      resolveUploadsDrained = null;
    }
  };

  const stopSegment = (segment, boundaryMonotonic = nowMonotonic()) => {
    if (!segment || segment.stopRequested) return;
    segment.stopRequested = true;
    clearTimer(segment.timerId);
    segment.timerId = null;
    segment.durationMs = Math.max(250, Math.round(boundaryMonotonic - segment.startedMonotonic));
    if (segment.recorder.state === 'recording' || segment.recorder.state === 'paused') {
      try {
        segment.recorder.stop();
      } catch {
        activeSegments.delete(segment);
        finishIfIdle();
      }
    } else {
      activeSegments.delete(segment);
      finishIfIdle();
    }
  };

  const disable = (reason = null) => {
    if (disabled) return;
    disabled = true;
    currentSegment = null;
    activeSegments.forEach((segment) => stopSegment(segment));
    onDisabled?.(reason);
    finishIfIdle();
  };

  const startSegment = () => {
    if (stopping || disabled) return null;
    let recorder;
    try {
      recorder = new MediaRecorderClass(stream, {
        mimeType,
        audioBitsPerSecond,
      });
    } catch (error) {
      disable(error);
      return null;
    }

    const segment = {
      recorder,
      chunks: [],
      startedAtMs: nowWall(),
      startedMonotonic: nowMonotonic(),
      durationMs: null,
      timerId: null,
      stopRequested: false,
    };

    recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) segment.chunks.push(event.data);
    };
    recorder.onstop = () => {
      clearTimer(segment.timerId);
      segment.timerId = null;
      const durationMs = segment.durationMs
        || Math.max(250, Math.round(nowMonotonic() - segment.startedMonotonic));
      const blob = segment.chunks.length > 0
        ? new BlobClass(segment.chunks, { type: mimeType })
        : null;
      if (blob?.size > 0 && typeof onSegment === 'function') {
        let uploadResult;
        try {
          uploadResult = onSegment(blob, {
            occurredAt: new Date(segment.startedAtMs).toISOString(),
            durationMs,
            mimeType,
          });
        } catch (error) {
          uploadResult = Promise.reject(error);
        }
        const upload = Promise.resolve(uploadResult)
          .then((result) => {
            if (result?.disabled) disable(result?.error || null);
            return result;
          })
          .catch(() => null)
          .finally(() => {
            pendingUploads.delete(upload);
            finishIfIdle();
          });
        pendingUploads.add(upload);
      }
      // Register the upload before reporting captureStopped. Callers can safely
      // close the audio graph after stop() without racing the final Blob.
      activeSegments.delete(segment);
      if (currentSegment === segment) currentSegment = null;
      finishIfIdle();
    };

    try {
      recorder.start();
    } catch (error) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      disable(error);
      return null;
    }
    activeSegments.add(segment);
    currentSegment = segment;
    segment.timerId = setTimer(() => {
      if (stopping || disabled || currentSegment !== segment) return;
      // Start the next independent file first. Its start time is the exact
      // playback boundary, so the encoder finalization delay is never counted.
      const nextSegment = startSegment();
      const boundary = nextSegment?.startedMonotonic || nowMonotonic();
      stopSegment(segment, boundary);
    }, safeSegmentMs);
    return segment;
  };

  const initialSegment = startSegment();
  if (!initialSegment && !disabled) disable(new Error('Audio recorder failed to start'));

  return {
    stop: () => {
      if (!stopping) {
        stopping = true;
        currentSegment = null;
        activeSegments.forEach((segment) => stopSegment(segment));
        finishIfIdle();
      }
      return captureStopped;
    },
    captureStopped,
    uploadsDrained,
    done: uploadsDrained,
    // Kept as an alias for older call sites; new code should choose the exact
    // lifecycle boundary it needs.
    stopped: uploadsDrained,
    get disabled() {
      return disabled;
    },
  };
};

export default createSegmentedAudioRecorder;
