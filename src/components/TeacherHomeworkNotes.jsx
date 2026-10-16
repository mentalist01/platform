import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, GripHorizontal, Minus, PencilLine, StickyNote, Undo2 } from 'lucide-react';
import useTeacherHomeworkNote from '../hooks/useTeacherHomeworkNote';
import { HOMEWORK_NOTE_MAX_LENGTH, homeworkNoteTarget } from '../utils/teacherHomeworkNotes';
import './TeacherHomeworkNotes.css';

export function HomeworkLessonNotePreview({ teacherId, studentId, groupId, onAppend, compact = false }) {
  const { text, saveText, storageFailed } = useTeacherHomeworkNote(teacherId, homeworkNoteTarget({ studentId, groupId }));
  const noteId = `${teacherId}:${homeworkNoteTarget({ studentId, groupId })}`;
  const [cleared, setCleared] = useState(null);
  const clearedText = cleared?.id === noteId ? cleared.text : '';
  if (!text.trim() && !clearedText) return null;
  return <details className={`homework-note-preview${compact ? ' is-compact' : ''}`} open={compact ? undefined : true}>
    <summary><StickyNote size={15} /> Что планировали в домашку</summary>
    {text.trim() && <p>{text}</p>}
    {storageFailed && <small role="alert">Заметка пока не сохранена. Скопируйте её перед закрытием страницы.</small>}
    {onAppend && <div className="homework-note-preview__actions">
      {text.trim() && <><button type="button" onClick={() => onAppend(text)}>Добавить в текст ДЗ</button>
        <button type="button" onClick={() => { setCleared({ id: noteId, text }); saveText(''); }}>Разобрано · очистить</button></>}
      {clearedText && !text.trim() && <button type="button" onClick={() => { saveText(clearedText); setCleared(null); }}><Undo2 size={13} /> Вернуть заметку</button>}
    </div>}
  </details>;
}

const clampPosition = ({ x, y }, height = 340) => ({
  x: Math.max(8, Math.min(x, window.innerWidth - Math.min(330, window.innerWidth - 16) - 8)),
  y: Math.max(8, Math.min(y, Math.max(8, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8))),
});

function NoteEditor({ teacherId, target, label }) {
  const { text, saveText, storageFailed } = useTeacherHomeworkNote(teacherId, target);
  return <>
    <label className="teacher-homework-notes__field"><span className="sr-only">Заметка для {label}</span>
      <textarea value={text} onChange={event => saveText(event.target.value)} maxLength={HOMEWORK_NOTE_MAX_LENGTH}
        placeholder={'Например:\n• дать ещё задачи на for\n• повторить №7: звук\n• отправить таблицу с урока'} rows={6} />
    </label>
    <footer>{storageFailed ? <span role="alert">Не удалось сохранить. Скопируйте заметку.</span> : <span><Check size={12} /> Сохранено в этом браузере</span>}<small>{text.length}/{HOMEWORK_NOTE_MAX_LENGTH}</small></footer>
    <p className="teacher-homework-notes__hint">Видно только вам. Покажем в напоминании и при выдаче ДЗ. Ученику отправится только то, что добавите в домашку.</p>
  </>;
}

export default function TeacherHomeworkNotes({ teacherId, students = [], groups = [], activeStudentId, activeGroupId, getStudentLabel, visible = true }) {
  const options = [
    ...groups.map(group => ({ key: homeworkNoteTarget({ groupId: group.id }), label: `Группа · ${group.name || group.title || 'Мини-группа'}` })),
    ...students.map(student => ({ key: homeworkNoteTarget({ studentId: student.id }), label: getStudentLabel?.(student) || student.name || 'Ученик' })),
  ];
  const contextTarget = homeworkNoteTarget({ studentId: activeStudentId, groupId: activeGroupId });
  const [choice, setChoice] = useState({ context: contextTarget, target: contextTarget });
  const chosenTarget = choice.context === contextTarget ? choice.target : contextTarget;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const [portalHost, setPortalHost] = useState(() => document.fullscreenElement || document.body);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  useEffect(() => {
    const resize = () => setPosition(current => current ? clampPosition(current, panelRef.current?.offsetHeight) : null);
    const fullscreen = () => { setPortalHost(document.fullscreenElement || document.body); resize(); };
    window.addEventListener('resize', resize);
    document.addEventListener('fullscreenchange', fullscreen);
    return () => { window.removeEventListener('resize', resize); document.removeEventListener('fullscreenchange', fullscreen); };
  }, []);
  const target = options.some(option => option.key === chosenTarget) ? chosenTarget : options[0]?.key || '';
  const label = options.find(option => option.key === target)?.label || 'Выберите ученика';
  if (!visible && !open) return null;
  return createPortal(open ? <aside ref={panelRef} className="teacher-homework-notes" aria-label="Заметки к домашке" style={position ? { left: position.x, top: position.y, right: 'auto' } : undefined}>
    <header onPointerDown={event => {
      if (event.target.closest('button') || event.button !== 0) return;
      const rect = panelRef.current.getBoundingClientRect();
      dragRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      if (dragRef.current) setPosition(clampPosition({ x: event.clientX - dragRef.current.x, y: event.clientY - dragRef.current.y }, panelRef.current?.offsetHeight));
    }} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
      <StickyNote size={17} /><strong>К домашке</strong><GripHorizontal size={16} aria-hidden="true" />
      <button type="button" onClick={() => setOpen(false)} aria-label="Свернуть заметки к домашке"><Minus size={18} /></button>
    </header>
    <div className="teacher-homework-notes__body">
      <label className="teacher-homework-notes__recipient"><span>Для кого</span><select aria-label="Для кого заметка" value={target} onChange={event => setChoice({ context: contextTarget, target: event.target.value })}>
        {!options.length && <option value="">Сначала добавьте ученика</option>}
        {options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select></label>
      {target && <NoteEditor key={`${teacherId}:${target}`} teacherId={teacherId} target={target} label={label} />}
    </div>
  </aside> : <button type="button" className="teacher-homework-notes-trigger" onClick={() => setOpen(true)} title="Записать, что задать после урока"><PencilLine size={16} /> К домашке</button>, portalHost);
}

