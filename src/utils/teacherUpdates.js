export function compareDesktopVersions(left, right) {
  const parse = value => /^\d+\.\d+\.\d+$/.test(String(value || '')) ? String(value).split('.').map(Number) : null;
  const a = parse(left), b = parse(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

export function availableTeacherUpdates(catalog, { role, teacherId, desktop }) {
  if (role !== 'teacher' || !teacherId || desktop?.isDesktop !== true) return [];
  return [...catalog.cabinet, ...catalog.desktop.filter(release => {
    const comparison = compareDesktopVersions(desktop.version, release.version);
    return comparison !== null && comparison >= 0;
  })];
}

const memory = new Map();
export const teacherUpdatesStorageKey = teacherId => `teacher-updates-seen:v1:${teacherId}`;
export function readTeacherUpdates(teacherId, storage) {
  const key = teacherUpdatesStorageKey(teacherId);
  let stored = [];
  try {
    const value = JSON.parse(storage?.getItem(key) || '[]');
    if (Array.isArray(value)) stored = value.filter(id => typeof id === 'string' && id.length <= 120).slice(-1000);
  } catch { /* A blocked or damaged device store must not prevent using the cabinet. */ }
  return [...new Set([...stored, ...(memory.get(key) || [])])];
}
export function acknowledgeTeacherUpdates(teacherId, releases, storage) {
  const key = teacherUpdatesStorageKey(teacherId);
  const seen = [...new Set([...readTeacherUpdates(teacherId, storage), ...releases.map(release => release.id)])];
  memory.set(key, seen);
  try { storage?.setItem(key, JSON.stringify(seen)); } catch { /* Retain acknowledgement for this session. */ }
  return seen;
}
export const unreadTeacherUpdates = (releases, seen) => releases.filter(release => !seen.includes(release.id));
