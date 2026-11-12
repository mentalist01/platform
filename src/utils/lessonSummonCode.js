import { lessonCodePageId, lessonPageSelectionKey, writeLessonPageSelection } from './lessonPageSelection.js';
import { isSummonRecipient } from './summonRecipients.js';

const solutionId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);

export function normalizeSummonCode(value) {
  return value && solutionId(value.solutionId) ? { solutionId: value.solutionId } : null;
}

// The room is derived from the authorized board, never supplied by the sender.
// A shared-group summon must not expose an individual pupil's code to everyone.
export function lessonSummonCodeRoom(bookRoom, studentId = '') {
  if (typeof bookRoom !== 'string' || !bookRoom.startsWith('board-') || !bookRoom.endsWith('~pages')) return '';
  const base = bookRoom.slice(6, -6);
  if (!base || base.includes('~') || (studentId && !/^[a-zA-Z0-9_-]{1,160}$/.test(studentId))) return '';
  return `collab-${base}${studentId ? `~student~${studentId}` : ''}`;
}

export function readTeacherSummonCode({ bookRoom, pageId, studentId = '', role, userId, current, storage = globalThis.localStorage }) {
  if (role !== 'teacher' && role !== 'admin') return null;
  const room = lessonSummonCodeRoom(bookRoom, studentId), codePageId = lessonCodePageId(pageId);
  if (!room) return null;
  if (current?.room === room && current.pageId === codePageId) return normalizeSummonCode(current);
  try {
    const saved = JSON.parse(storage?.getItem(`collab-code-pages:${room}:${role}:${userId}`) || '{}');
    return normalizeSummonCode({ solutionId: saved.byPage?.[codePageId] || (saved.pageId === codePageId ? saved.solutionId : '') });
  } catch { return null; }
}

export function summonedCodeSelection(command, bookRoom, userId) {
  const code = command?.scope==='board'?null:normalizeSummonCode(command?.code);
  if (!code || !isSummonRecipient(command,userId)) return null;
  const room = lessonSummonCodeRoom(bookRoom, command.studentId);
  return room ? { room, pageId: lessonCodePageId(command.pageId), ...code } : null;
}

// Remember an accepted command before opening the editor, including cold loads.
// Only selection IDs are stored; no code is copied or overwritten.
export function rememberSummonedCode(command, bookRoom, userId, storage = globalThis.localStorage) {
  const selected = summonedCodeSelection(command, bookRoom, userId);
  if (!selected) return;
  try {
    const key = `collab-code-pages:${selected.room}:student:${userId}`;
    const saved = JSON.parse(storage?.getItem(key) || '{}');
    storage?.setItem(key, JSON.stringify({ ...saved, pageId: selected.pageId, solutionId: selected.solutionId,
      byPage: { ...saved.byPage, [selected.pageId]: selected.solutionId } }));
    writeLessonPageSelection(lessonPageSelectionKey(bookRoom,'student',userId,'code'),command.pageId,storage);
  } catch { /* The live command still works without local storage. */ }
}
