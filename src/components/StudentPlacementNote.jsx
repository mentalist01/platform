import { useEffect, useId, useRef, useState } from 'react';
import { Check, NotebookPen } from 'lucide-react';
import { api } from '../services/api.js';
import './StudentPlacementNote.css';

// Mount a separate editor for each student: a late response cannot overwrite another pupil's note.
export default function StudentPlacementNote(props) {
  return props.studentId ? <PlacementNoteEditor key={props.studentId} {...props} /> : null;
}

function PlacementNoteEditor({ studentId, studentName = '', transport = api, onDirtyChange, onNoteChange, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen), [note, setNote] = useState(null), [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const alive = useRef(true), dirtyRef = useRef(false), callbackRef = useRef(onDirtyChange);
  const inputId = useId();
  const dirty = note !== null && draft !== note.text;
  useEffect(() => {
    alive.current = true;
    const notifyDirty = callbackRef.current;
    const warn = event => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { alive.current = false; window.removeEventListener('beforeunload', warn); notifyDirty?.(false); };
  }, []);
  useEffect(() => { dirtyRef.current = dirty; callbackRef.current?.(dirty); }, [dirty]);
  useEffect(() => { onNoteChange?.(note); }, [note, onNoteChange]);
  useEffect(() => {
    if (!initialOpen) return undefined;
    let cancelled = false;
    transport.studentPlacementNote(studentId).then(result => {
      if (!cancelled) { setNote(result.note); setDraft(result.note.text); }
    }).catch(failure => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [initialOpen, studentId, transport]);
  const load = async () => {
    setBusy(true); setError(''); setSaved(false);
    try {
      const result = await transport.studentPlacementNote(studentId);
      if (alive.current) { setNote(result.note); setDraft(result.note.text); }
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError(''); setSaved(false);
    try {
      const result = await transport.saveStudentPlacementNote(studentId, { text: draft, revision: note.revision });
      window.dispatchEvent(new CustomEvent('student-placement-note-changed', { detail: { studentId } }));
      if (alive.current) { setNote(result.note); setDraft(result.note.text); setSaved(true); }
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  };
  return <section className="student-placement-note" onClick={event => event.stopPropagation()} aria-label={`Уровень для подбора группы${studentName ? ` · ${studentName}` : ''}`}>
    <button type="button" className="student-placement-note__toggle" aria-expanded={open} aria-controls={`${inputId}-body`} onClick={() => { setOpen(value => !value); if (!open && !note && !busy) void load(); }}>
      <NotebookPen size={15} /><span>Уровень для подбора группы</span><small>{dirty ? 'Не сохранено' : open ? 'Свернуть' : 'Открыть'}</small>
    </button>
    {open && <div id={`${inputId}-body`} className="student-placement-note__body">
      <p>Личная заметка преподавателя. Ученик и родитель её не видят.</p>
      {!note && !error && <p role="status">Загружаем заметку…</p>}
      {note && <>
        <label htmlFor={inputId}>Что важно учесть при выборе группы</label>
        <textarea id={inputId} value={draft} maxLength={6000} rows={5} disabled={busy}
          placeholder="Например: Python с нуля. По ЕГЭ знакомы задания 4 и 7, решает с подсказкой. Нужна группа, где начинают циклы."
          onChange={event => { setDraft(event.target.value); setSaved(false); }} />
        <div className="student-placement-note__actions"><button type="button" disabled={busy || !dirty} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить заметку'}</button>
          <span>{draft.length}/6000</span>{saved && <span role="status"><Check size={14} />Сохранено</span>}
        </div>
        {note.updatedAt && <small>Обновлено {new Date(note.updatedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</small>}
      </>}
      {error && <div className="student-placement-note__error" role="alert">{error}<button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm('Загрузить сохранённую заметку вместо несохранённого текста?')) void load(); }}>Загрузить сохранённую версию</button></div>}
    </div>}
  </section>;
}
