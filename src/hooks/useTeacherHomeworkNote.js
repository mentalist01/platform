import { useCallback, useSyncExternalStore } from 'react';
import { homeworkNoteStorageKey, parseHomeworkNote, writeHomeworkNote } from '../utils/teacherHomeworkNotes';

const EVENT = 'teacher-homework-note-changed';
// Keep an unsaved note visible when browser storage is unavailable.
const unsaved = new Map();
const getStorage = () => { try { return window.localStorage; } catch { return null; } };
const readRaw = key => {
  if (!key) return '';
  if (unsaved.has(key)) return unsaved.get(key);
  try { return getStorage()?.getItem(key) || ''; } catch { return ''; }
};

export default function useTeacherHomeworkNote(teacherId, target) {
  const key = homeworkNoteStorageKey(teacherId, target);
  const subscribe = useCallback(notify => {
    const changed = event => { if (!event.detail?.key || event.detail.key === key) notify(); };
    const external = event => { if (event.key === key || event.key === null) { unsaved.delete(key); notify(); } };
    window.addEventListener(EVENT, changed);
    window.addEventListener('storage', external);
    return () => { window.removeEventListener(EVENT, changed); window.removeEventListener('storage', external); };
  }, [key]);
  const snapshot = useCallback(() => readRaw(key), [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, () => '');
  const saveText = useCallback(text => {
    const result = writeHomeworkNote(getStorage(), key, text);
    if (result.ok) unsaved.delete(key); else unsaved.set(key, result.raw);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key } }));
    return result.ok;
  }, [key]);
  return { ...parseHomeworkNote(raw), saveText, storageFailed: unsaved.has(key) };
}
