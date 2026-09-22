// Kept as an explicit fallback. OBS/Rutube is the default recording pipeline.
export const legacyRecordingEnabled = process.env.LEGACY_LESSON_RECORDING_ENABLED === '1';

export const legacyRecordingWriteGuard = (enabled = legacyRecordingEnabled) => (req, res, next) => {
  // Finishing the lesson is also used by OBS and must remain available.
  if (enabled || req.method !== 'POST' || req.path === '/lesson/finish') return next();
  return res.status(410).json({
    code: 'LEGACY_RECORDING_DISABLED',
    error: 'Встроенная запись отключена. Используйте помощник записи OBS.',
  });
};
