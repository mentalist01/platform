import { useEffect, useRef, useState } from 'react';
import { preparedRequest } from '../services/preparedLessonTasks.js';
import './MessageTemplates.css';

const changedEvent = 'platform:review-request-changed';

export default function ReviewRequestStatus({ studentId, month }) {
  const [record, setRecord] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const saving = useRef(false), sequence = useRef(0);
  const endpoint = '/api/message-templates/review-status/' + encodeURIComponent(studentId) + '/' + encodeURIComponent(month);
  useEffect(() => {
    const controller = new AbortController();
    const ownSequence = ++sequence.current;
    setRecord(null); setError('');
    preparedRequest(endpoint, undefined, 'GET', controller.signal).then(result => {
      if (!controller.signal.aborted && ownSequence === sequence.current) setRecord(result.record);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => { controller.abort(); sequence.current = ownSequence + 1; };
  }, [endpoint, refresh]);
  useEffect(() => {
    const changed = event => { if (event.detail?.endpoint === endpoint) { sequence.current++; setRecord(event.detail.record); } };
    window.addEventListener(changedEvent, changed);
    return () => window.removeEventListener(changedEvent, changed);
  }, [endpoint]);
  const update = async status => {
    if (saving.current || !record) return;
    const ownSequence = sequence.current;
    saving.current = true; setBusy(true); setError('');
    try {
      const result = await preparedRequest(endpoint, { status, revision: record.revision }, 'PUT');
      window.dispatchEvent(new CustomEvent(changedEvent, { detail: { endpoint, record: result.record } }));
    } catch (failure) { if (ownSequence === sequence.current) setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  };
  const label = new Date(month + '-01T12:00:00+03:00').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' });
  return <section className="review-request-status" aria-label="Отметка просьбы об отзыве">
    <span>Просьба об отзыве · {label}</span>
    <div><label><input type="checkbox" checked={['asked', 'received'].includes(record?.status)} disabled={!record || busy} onChange={event => { void update(event.target.checked ? 'asked' : 'not-asked'); }} />Попросил отзыв</label>
      <button type="button" aria-pressed={record?.status === 'later'} disabled={!record || busy} onClick={() => { void update(record.status === 'later' ? 'not-asked' : 'later'); }}>{record?.status === 'later' ? 'Отложено на другой раз' : 'В другой раз'}</button>
      <button type="button" className="review-request-status__received" aria-pressed={record?.status === 'received'} disabled={!record || busy} onClick={() => { void update(record.status === 'received' ? 'asked' : 'received'); }}>{record?.status === 'received' ? '✓ Отзыв оставили' : 'Оставили отзыв'}</button>
      <small role="status">{busy ? 'Сохраняем…' : !record && !error ? 'Загружаем отметку…' : record?.status === 'asked' ? 'Отмечено вручную' : record?.status === 'not-asked' ? 'Пока не просил' : ''}</small></div>
    {error && <p role="alert">{error}<button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Обновить отметку</button></p>}
  </section>;
}
