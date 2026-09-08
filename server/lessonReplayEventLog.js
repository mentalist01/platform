import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

const getOccurrenceHash = (occurrenceKey) => (
  crypto.createHash('sha256').update(String(occurrenceKey || '').trim()).digest('hex')
);

const createCapacityError = () => {
  const error = new Error('Журнал записи урока достиг предельного размера.');
  error.code = 'LESSON_REPLAY_EVENT_LOG_CAPACITY';
  error.statusCode = 413;
  return error;
};

export const createLessonReplayEventLog = (directory, options = {}) => {
  const root = path.resolve(String(directory || '').trim());
  const maxBytes = Math.max(1024, Number(options.maxBytes) || DEFAULT_MAX_BYTES);
  fs.mkdirSync(root, { recursive: true });

  const getPath = (occurrenceKey) => path.join(root, `${getOccurrenceHash(occurrenceKey)}.jsonl`);

  const append = async (occurrenceKey, events) => {
    const normalizedKey = String(occurrenceKey || '').trim();
    const entries = Array.isArray(events) ? events.filter(Boolean) : [];
    if (!normalizedKey || entries.length === 0) return { bytes: 0, appended: 0 };
    const file = getPath(normalizedKey);
    const line = `${JSON.stringify({ version: 1, events: entries })}\n`;
    const lineBytes = Buffer.byteLength(line, 'utf8');
    let existingBytes = 0;
    try {
      existingBytes = fs.statSync(file).size;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (existingBytes + lineBytes > maxBytes) throw createCapacityError();

    const handle = await fs.promises.open(file, 'a', 0o600);
    try {
      await handle.writeFile(line, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    return { bytes: existingBytes + lineBytes, appended: entries.length };
  };

  const read = (occurrenceKey) => {
    const normalizedKey = String(occurrenceKey || '').trim();
    if (!normalizedKey) return [];
    const file = getPath(normalizedKey);
    let raw = '';
    try {
      const stats = fs.statSync(file);
      if (stats.size > maxBytes) throw createCapacityError();
      raw = fs.readFileSync(file, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    const events = [];
    raw.split('\n').forEach((line) => {
      if (!line.trim()) return;
      try {
        const record = JSON.parse(line);
        if (record?.version === 1 && Array.isArray(record.events)) events.push(...record.events);
      } catch {
        // A crash can leave only the final line incomplete. Earlier fsynced
        // records remain valid and are still replayed.
      }
    });
    return events;
  };

  const clear = async (occurrenceKey) => {
    const normalizedKey = String(occurrenceKey || '').trim();
    if (!normalizedKey) return false;
    try {
      await fs.promises.unlink(getPath(normalizedKey));
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  };

  return { append, clear, getPath, read };
};
