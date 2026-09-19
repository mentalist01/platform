import fs from 'node:fs';
import path from 'node:path';
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  const fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
}
export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export function ownedRecording(recordDirectory, id, value) {
  const root = path.resolve(recordDirectory);
  const file = path.resolve(value || path.join(root, `lesson-${id}.mkv`));
  if (path.dirname(file) !== root || path.basename(file) !== `lesson-${id}.mkv`) throw new Error('OBS сохранил файл вне ожидаемой папки. Проверьте запись вручную.');
  return file;
}
