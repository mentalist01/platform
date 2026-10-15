import fs from 'node:fs';

// Marks contain flat maps of strings. Keep an immutable normalized snapshot
// for hot read paths and independent copies for the existing editing paths.
export const createTeacherCalendarMarksReader = (filePath, normalize) => {
  let signature = '';
  let snapshot = null;
  const invalidate = () => { signature = ''; snapshot = null; };
  const readSnapshot = () => {
    try {
      const stat = fs.statSync(filePath);
      const current = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      if (snapshot && current === signature) return snapshot;
      const normalized = normalize(JSON.parse(fs.readFileSync(filePath, 'utf8')));
      Object.values(normalized).forEach(Object.freeze);
      snapshot = Object.freeze(normalized);
      signature = current;
      return snapshot;
    } catch {
      invalidate();
      return Object.freeze({});
    }
  };
  const read = () => Object.fromEntries(
    Object.entries(readSnapshot()).map(([teacherId, marks]) => [teacherId, { ...marks }]),
  );
  return { read, readSnapshot, invalidate };
};
