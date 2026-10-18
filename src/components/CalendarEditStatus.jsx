import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function CalendarEditStatus({ teacherId, refreshKey, onChanged }) {
  const [edits, setEdits] = useState([]), [revision, setRevision] = useState(0), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    api.getTeacherCalendarEdits(teacherId).then(result => { if (!cancelled) { setEdits(result.edits || []); setError(''); } })
      .catch(failure => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [teacherId, refreshKey, revision]);
  useEffect(() => { window.addEventListener('focus', reload); return () => window.removeEventListener('focus', reload); }, [reload]);
  useEffect(() => {
    if (!edits.some(edit => edit.status === 'applying')) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') { reload(); void onChanged?.(); }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [edits, reload, onChanged]);
  const act = async (edit, action) => {
    setBusy(edit.id); setError('');
    try {
      await api.resolveTeacherCalendarEdit(edit.id, action, teacherId);
      await onChanged?.(); reload();
    } catch (failure) { setError(failure.message); reload(); }
    finally { setBusy(''); }
  };
  if (!edits.length && !error) return null;
  return <div className="calendar-edit-status" role="status">
    {edits.length > 0 && <strong>Google Calendar · незавершённые изменения</strong>}
    {edits.map(edit => <div key={edit.id}><span><b>{edit.title}</b> · {edit.date.split('-').reverse().join('.')} в {edit.time}<small>{edit.error || 'Ждём подтверждения Google. Повтор не создаст второе событие.'}</small></span><button type="button" disabled={!!busy} onClick={() => act(edit, 'retry')}>{busy === edit.id ? 'Проверяем…' : 'Повторить синхронизацию'}</button>{edit.status === 'pending' && <button type="button" disabled={!!busy} onClick={() => act(edit, 'cancel')}>Отменить изменение</button>}</div>)}
    {error && <p role="alert">{error} <button type="button" disabled={!!busy} onClick={reload}>Обновить статус</button></p>}
  </div>;
}
