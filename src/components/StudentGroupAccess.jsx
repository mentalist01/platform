import React, { useState } from 'react';
import { Check, Headphones, Loader2, Video } from 'lucide-react';
import { setStudentGroupAccess } from '../services/groupLibrary';
import './StudentGroupAccess.css';

export default function StudentGroupAccess({ student, onUpdated, transport = setStudentGroupAccess }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const enabled = student.groupLibraryAccess?.enabled === true
    && student.groupLibraryAccess.teacherId === student.teacherId;
  const toggle = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await transport(student.id, !enabled);
      onUpdated?.({ ...student, groupLibraryAccess: result.access });
      setMessage(result.access.enabled ? 'Доступ открыт. Ученик может зайти в «Группы и записи».'
        : result.allowed ? 'Отдельное разрешение снято. Доступ по действующей группе сохраняется.' : 'Отдельный доступ закрыт.');
    } catch (err) {
      setError(err.message || 'Не удалось изменить доступ');
    } finally {
      setBusy(false);
    }
  };
  return <section className={`student-group-access ${enabled ? 'is-enabled' : ''}`} aria-label="Доступ к групповым занятиям" onClick={event => event.stopPropagation()}>
    <div className="student-group-access__icon"><Headphones size={21} aria-hidden="true" /></div>
    <div className="student-group-access__copy">
      <h4>Доступ к групповым занятиям {enabled && <span><Check size={13} />Открыт учителем</span>}</h4>
      <p><Video size={14} aria-hidden="true" />Все записи и участие слушателем — даже до вступления в группу.</p>
      {enabled && <small>Действует до отключения. В группу ученика добавлять не нужно.</small>}
      {message && <div className="student-group-access__message" role="status">{message}</div>}
      {error && <div className="student-group-access__error" role="alert">{error}</div>}
    </div>
    <button type="button" disabled={busy} aria-label={`${enabled ? 'Закрыть' : 'Открыть'} групповой доступ: ${student.name}`} onClick={toggle}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : enabled ? <Check size={16} /> : <Headphones size={16} />}
      {busy ? 'Сохраняем…' : enabled ? 'Закрыть доступ' : 'Открыть доступ'}
    </button>
  </section>;
}
