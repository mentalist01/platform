import fs from 'node:fs';
import { ownedRecording } from './storage.mjs';

export function recordingSegments(job, jobs, directory) {
  const result = []; const seen = new Set(); const key = job.occurrence?.key;
  let current = job;
  while (current) {
    if (seen.has(current.id)) throw new Error('Повторяющаяся часть записи');
    seen.add(current.id);
    if (current.occurrence?.key !== key) throw new Error('Части относятся к разным ученикам или урокам');
    const file = ownedRecording(directory, current.id, current.file);
    if (!current.file || !fs.existsSync(file) || !fs.statSync(file).size) throw new Error('Не найдена предыдущая часть урока. Исходные файлы сохранены; проверьте папку записей.');
    result.unshift(file);
    if (!current.previousJobId) break;
    current = jobs[current.previousJobId];
    if (!current) throw new Error('Предыдущая часть записана на другом компьютере. Требуется восстановление записи.');
  }
  return result;
}

export const concatList = (files) => files.map((file) => `file '${file.replaceAll('\\', '/').replaceAll("'", "'\\''")}'`).join('\n') + '\n';
