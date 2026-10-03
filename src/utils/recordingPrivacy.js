export const PRIVATE_TEACHER_VIEWS = new Set(['finance', 'teacher-calendar', 'teacher-settings', 'recording', 'teacher-students']);

export const setRecordingPrivacy = async (reason, hidden) => {
  const bridge = typeof window !== 'undefined' && window.teacherDesktop;
  if (!bridge?.setRecordingPrivacy) return;
  await bridge.setRecordingPrivacy(reason, hidden);
};

// Restore the picture only after React has replaced the private section and painted.
export const afterRecordingSafePaint = callback => {
  let second;
  const first = requestAnimationFrame(() => { second = requestAnimationFrame(callback); });
  return () => { cancelAnimationFrame(first); if (second) cancelAnimationFrame(second); };
};
