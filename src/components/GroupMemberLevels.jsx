import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

const EMPTY_MEMBERS = [];
export default function GroupMemberLevels({ members = EMPTY_MEMBERS, memberCount = 0, candidate, candidateNote, transport = api }) {
  const [notes, setNotes] = useState(null), [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(members.map(member => transport.studentPlacementNote(member.id))).then(results => {
      if (!cancelled) setNotes(Object.fromEntries(members.map((member, i) => [member.id, results[i].status === 'fulfilled'
        ? { text: results[i].value.note.text } : { error: true }])));
    });
    return () => { cancelled = true; };
  }, [members, transport, revision]);
  useEffect(() => {
    const refresh = event => { if (members.some(member => member.id === event.detail?.studentId)) setRevision(value => value + 1); };
    window.addEventListener('student-placement-note-changed', refresh);
    return () => window.removeEventListener('student-placement-note-changed', refresh);
  }, [members]);
  return <section className="placement-member-levels" aria-label="Уровень участников группы">
    <h4>Сравнить подготовку</h4>
    {candidate && <div className="placement-levels-candidate"><strong>{candidate.name} · подбираем группу</strong><p className={candidateNote?.text ? 'has-note' : ''}>{candidateNote ? candidateNote.text || 'Заметка об уровне пока не заполнена.' : 'Заметка выбранного ученика загружается в блоке выше.'}</p><small>Сохранённая заметка выбранного ученика</small></div>}
    <h5>Участники группы</h5>
    {!members.length ? <p>{memberCount ? 'Список участников нужно обновить, чтобы показать заметки.' : 'В группе пока нет участников — можно собрать её с нуля.'}</p> : <div className="placement-member-levels__grid">{members.map(member => <article key={member.id}>
      <strong>{member.name}</strong>{!notes?.[member.id] ? <p role="status">Загружаем заметку…</p> : notes[member.id].error ? <p role="alert">Не удалось загрузить заметку. <button type="button" onClick={() => setRevision(value => value + 1)}>Повторить</button></p>
        : <p className={notes[member.id].text ? 'has-note' : ''}>{notes[member.id].text || 'Заметка об уровне пока не заполнена.'}</p>}
    </article>)}</div>}
  </section>;
}
