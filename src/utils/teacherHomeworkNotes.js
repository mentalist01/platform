export const HOMEWORK_NOTE_MAX_LENGTH = 6000;
const PREFIX = 'ivan100_teacher_homework_note_v1';

export function homeworkNoteTarget({ studentId, groupId } = {}) {
  const id = String(groupId || studentId || '').trim();
  return id ? `${groupId ? 'group' : 'student'}:${id}` : '';
}

export function homeworkNoteStorageKey(teacherId, target) {
  return teacherId && target ? `${PREFIX}:${encodeURIComponent(teacherId)}:${encodeURIComponent(target)}` : '';
}

export function parseHomeworkNote(raw) {
  try {
    const value = JSON.parse(raw);
    return { text: typeof value?.text === 'string' ? value.text.slice(0, HOMEWORK_NOTE_MAX_LENGTH) : '', updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : '' };
  } catch { return { text: '', updatedAt: '' }; }
}

export function writeHomeworkNote(storage, key, text, now = new Date()) {
  if (!key) return { ok: false, raw: '' };
  const raw = JSON.stringify({ text: String(text || '').slice(0, HOMEWORK_NOTE_MAX_LENGTH), updatedAt: now.toISOString() });
  try { storage.setItem(key, raw); return { ok: true, raw }; }
  catch { return { ok: false, raw }; }
}

export function appendHomeworkNote(currentText, note) {
  const addition = String(note || '').trim();
  const current = String(currentText || '').trim();
  if (!addition || current === addition || current.endsWith(`\n\n${addition}`)) return current;
  return [current, addition].filter(Boolean).join('\n\n');
}
