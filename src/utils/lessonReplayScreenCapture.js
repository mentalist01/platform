export const getLessonReplayScreenFingerprintDifference = (previous, next) => {
  if (
    !Array.isArray(previous)
    || !Array.isArray(next)
    || previous.length !== next.length
    || next.length === 0
  ) return Number.POSITIVE_INFINITY;
  const total = next.reduce((sum, value, index) => sum + Math.abs(value - previous[index]), 0);
  return total / next.length;
};

export const shouldSaveLessonReplayScreenFrame = ({
  previousFingerprint,
  nextFingerprint,
  lastSavedAt = 0,
  nowMs = Date.now(),
  heartbeatMs = 60_000,
  changeThreshold = 1.5,
} = {}) => (
  Number(lastSavedAt) <= 0
  || Number(nowMs) - Number(lastSavedAt) >= Math.max(1000, Number(heartbeatMs) || 60_000)
  || getLessonReplayScreenFingerprintDifference(previousFingerprint, nextFingerprint)
    >= Math.max(0, Number(changeThreshold) || 0)
);
