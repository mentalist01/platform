import React, { useEffect, useState } from 'react';
import { Check, Monitor, Video } from 'lucide-react';
import { api } from '../services/api';
import './StudentLessonVenue.css';

export default function StudentLessonVenue({ student, onUpdated, transport = api }) {
  const [venue, setVenue] = useState(student.lessonVenue === 'telemost' ? 'telemost' : 'platform');
  const [url, setUrl] = useState(student.telemostUrl || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => {
    setVenue(student.lessonVenue === 'telemost' ? 'telemost' : 'platform');
    setUrl(student.telemostUrl || ''); setSaved(false); setError('');
  }, [student.id, student.lessonVenue, student.telemostUrl]);
  const dirty = venue !== (student.lessonVenue === 'telemost' ? 'telemost' : 'platform') || url !== (student.telemostUrl || '');
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false);
    try {
      const result = await transport.updateStudent(student.id, { lessonVenue: venue, telemostUrl: url });
      onUpdated?.({ ...student, ...result }); setSaved(true);
    } catch (failure) { setError(failure.message || 'Не удалось сохранить способ занятия'); }
    finally { setBusy(false); }
  };
  return <form className="student-lesson-venue" onSubmit={save} onClick={event => event.stopPropagation()} aria-label={`Способ занятия · ${student.name}`}>
    <label className="student-lesson-venue__choice">{venue === 'telemost' ? <Video size={16} /> : <Monitor size={16} />}
      <span>Где занимаемся</span>
      <select value={venue} disabled={busy} onChange={event => { setVenue(event.target.value); setSaved(false); }}>
        <option value="platform">На платформе</option><option value="telemost">В Телемосте</option>
      </select>
    </label>
    {venue === 'telemost' && <label className="student-lesson-venue__link"><span className="sr-only">Ссылка Телемоста</span>
      <input type="url" value={url} placeholder="Ссылка Телемоста" disabled={busy} onChange={event => { setUrl(event.target.value); setSaved(false); }} />
    </label>}
    {dirty && <button type="submit" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>}
    {saved && !dirty && <span className="student-lesson-venue__saved" role="status"><Check size={14} />Сохранено</span>}
    {venue === 'telemost' && !url && <small>Добавьте ссылку, чтобы открывать звонок из напоминания.</small>}
    {error && <small role="alert" className="student-lesson-venue__error">{error}</small>}
  </form>;
}
