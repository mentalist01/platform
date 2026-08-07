export const getReplayAudioDurationMs = (event) => (
  Math.max(250, Number(event?.payload?.durationMs) || 30_000)
);

export const findReplayAudioEventIndex = (audioEvents, positionMs) => {
  const events = Array.isArray(audioEvents) ? audioEvents : [];
  const position = Math.max(0, Number(positionMs) || 0);
  let candidateIndex = -1;
  for (let index = 0; index < events.length; index += 1) {
    if (Number(events[index]?.offsetMs) > position) break;
    candidateIndex = index;
  }
  if (candidateIndex < 0) return -1;
  for (let index = candidateIndex; index >= 0; index -= 1) {
    const candidate = events[index];
    const segmentEnd = Number(candidate?.offsetMs) + getReplayAudioDurationMs(candidate);
    if (position <= segmentEnd + 50) return index;
  }
  return -1;
};

export const findUpcomingReplayAudioEventIndex = (audioEvents, positionMs) => {
  const events = Array.isArray(audioEvents) ? audioEvents : [];
  const position = Math.max(0, Number(positionMs) || 0);
  return events.findIndex((event) => Number(event?.offsetMs) > position);
};

export const getReplayTimelineDurationMs = (events, reportedDurationMs = 0) => {
  const source = Array.isArray(events) ? events : [];
  return Math.max(
    1000,
    Number(reportedDurationMs) || 0,
    ...source.map((event) => (
      (Number(event?.offsetMs) || 0)
      + (event?.type === 'audio' ? getReplayAudioDurationMs(event) : 0)
    ))
  );
};
