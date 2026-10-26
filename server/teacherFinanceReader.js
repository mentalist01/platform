import fs from 'node:fs';

// Keep the validated journal private. Every caller still receives an isolated,
// mutable snapshot; external edits and atomic replacements invalidate it.
export function createTeacherFinanceReader(filePath, normalize, corrupt) {
  let signature = '';
  let snapshot = null;
  const invalidate = () => { signature = ''; snapshot = null; };
  const freeze = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freeze(child);
    return Object.freeze(value);
  };
  const readSnapshot = () => {
    try {
      const stat = fs.statSync(filePath);
      const current = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      if (!snapshot || current !== signature) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid finance database');
        const normalized = normalize(raw);
        snapshot = freeze(normalized);
        signature = current;
      }
      return snapshot;
    } catch (error) {
      invalidate();
      if (error.code === 'ENOENT') return Object.freeze({});
      throw corrupt();
    }
  };
  const read = () => structuredClone(readSnapshot());
  return { read, readSnapshot, invalidate };
}
