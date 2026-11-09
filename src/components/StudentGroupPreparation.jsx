import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ChevronDown, Users, X } from 'lucide-react';
import { api } from '../services/api';
import PreparationScheduleFields from './PreparationScheduleFields';
import { addCalendarDays, moscowDay, weekdayIndex } from '../utils/groupAvailability';
import './MessageTemplates.css';
import './StudentGroupPreparation.css';

const emptyPlan = { groupId: '', note: '', revision: '', joining: false };
const moscowDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow', weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});
const formatDate = value => moscowDate.format(new Date(value));

function JoinGroupDialog({ preview, student, busy, error, onClose, onConfirm }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [selected, setSelected] = useState(preview.selectedAssignmentIds);
  useLayoutEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(<dialog ref={dialog} aria-labelledby={titleId} className="message-templates-dialog group-preparation-dialog"
    onClick={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="message-templates">
      <header className="message-templates__header">
        <div><span>ПОДГОТОВКА К ГРУППЕ</span><h2 id={titleId}>Переход в группу</h2><p>{student.name} → {preview.group.name}</p></div>
        <button type="button" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={16} /></button>
      </header>
      <div className="message-templates__composer">
        <section>
          <h4>Оставшиеся занятия предподготовки</h4>
          <p>{preview.preparationLessonsToCancel?.length ? `${preview.preparationLessonsToCancel.length} будущих занятий отменятся на платформе и в Google Calendar.` : 'Будущих занятий этого плана нет.'}</p>
          <small>Прошедшие занятия останутся в истории.</small>
        </section>
        <section>
          <h4>Ближайшее групповое занятие</h4>
          <p>{preview.nextLesson ? `${formatDate(preview.nextLesson.startAt)} МСК` : 'Занятие пока не запланировано.'}</p>
        </section>
        <section>
          <h4>Другие индивидуальные занятия на ближайшие 30 дней</h4>
          {preview.individualLessons.length > 0
            ? <ul>{preview.individualLessons.map(lesson => <li key={lesson.key}>{formatDate(lesson.startAt)} МСК</li>)}</ul>
            : <p>В расписании нет ближайших индивидуальных занятий.</p>}
          <small>Их можно перенести или отменить отдельно в расписании.</small>
        </section>
        <fieldset disabled={busy || preview.joining}>
          <legend>Выдать открытую домашку группы</legend>
          {preview.assignments.length ? preview.assignments.map(assignment => (
            <label className="message-templates__check" key={assignment.id}>
              <input type="checkbox" checked={selected.includes(assignment.id)} onChange={event => {
                const checked = event.target.checked;
                setSelected(ids => checked ? [...ids, assignment.id] : ids.filter(id => id !== assignment.id));
              }} />
              <span>{assignment.title}{assignment.track === 'python' ? ' · Python' : assignment.track === 'ege' ? ' · ЕГЭ' : ''}
                {assignment.dueAt && <small>До {formatDate(assignment.dueAt)} МСК</small>}
              </span>
            </label>
          )) : <p>Открытых заданий для всей группы сейчас нет.</p>}
        </fieldset>
        {error && <p className="message-templates__warning" role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>Назад</button>
          <button type="button" className="message-templates__primary" disabled={busy} onClick={() => onConfirm(selected)}>
            {busy ? 'Добавляем…' : `Добавить в «${preview.group.name}»`} <ArrowRight size={15} />
          </button>
        </footer>
      </div>
    </div>
  </dialog>, document.fullscreenElement || document.body);
}

export default function StudentGroupPreparation({ student, groups, plan = emptyPlan, membership, onUpdate }) {
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const group = groups.find(row => row.id === plan.groupId);
  if (membership && !plan.joining) {
    const pending = plan.lessonPlan?.lessons.some(lesson => lesson.syncStatus !== 'synced');
    return notice || pending ? <p className="group-preparation__status" role="status">{notice}{pending && ' Отмена оставшихся занятий ожидает Google Calendar — повторим автоматически.'}</p> : null;
  }

  const run = async action => {
    setError('');
    setNotice('');
    setBusy(true);
    try { await action(); }
    catch (failure) { setError(failure.message || 'Не удалось выполнить действие.'); }
    finally { setBusy(false); }
  };
  const save = (groupId, note, lessonSchedule) => run(async () => {
    const result = await api.saveStudentGroupPreparation(student.id, { groupId, note, revision: plan.revision, ...(lessonSchedule ? { lessonSchedule } : {}) });
    onUpdate(result);
    setDraft(null);
    setNotice(groupId ? 'План сохранён.' : 'План снят. Будущие занятия предподготовки отменены.');
  });
  const openPreview = () => run(async () => setPreview(await api.getStudentGroupPreparationPreview(student.id)));
  const confirm = assignmentIds => run(async () => {
    const result = await api.joinStudentPreparationGroup(student.id, { revision: preview.revision, assignmentIds });
    onUpdate(result);
    setPreview(null);
    setNotice(`Ученик добавлен в «${result.group.name}».`);
  });

  return <section className="message-templates group-preparation" aria-label="Подготовка к группе" onClick={event => event.stopPropagation()}>
    <div className="group-preparation__bar">
      <button type="button" className="group-preparation__toggle" aria-expanded={Boolean(draft)} disabled={busy || Boolean(plan.joining && group)} onClick={() => {
        setError('');
        const startDate = addCalendarDays(moscowDay(), 1);
        const hasFuture = plan.lessonPlan?.lessons.some(lesson => !lesson.cancelled && Date.parse(`${lesson.date}T${lesson.time}:00+03:00`) > Date.now());
        setDraft(draft ? null : { groupId: plan.groupId, note: plan.note, lessonSchedule: hasFuture ? null : {
          count: 4, startDate, durationMinutes: 60, slots: [{ day: weekdayIndex(startDate), time: '16:00' }],
        } });
      }}>
        <Users size={16} aria-hidden="true" />
        <span><strong>Подготовка к группе</strong>{plan.groupId && <small>{group
          ? `${plan.joining ? 'Переход в процессе' : 'Индивидуально'} → ${group.name}`
          : 'Выбранная группа недоступна'}</small>}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {group && !draft && <button type="button" className="message-templates__primary" disabled={busy} onClick={openPreview}>
        {plan.joining ? 'Завершить переход' : `Перевести в «${group.name}»`} <ArrowRight size={14} />
      </button>}
    </div>
    {draft && <form className="group-preparation__fields" onSubmit={event => { event.preventDefault(); save(draft.groupId, draft.note, draft.lessonSchedule); }}>
      <label>Будущая группа<select required value={draft.groupId} onChange={event => setDraft({ ...draft, groupId: event.target.value })}>
        <option value="">Выберите группу</option>
        {group == null && plan.groupId && <option disabled value={plan.groupId}>Группа недоступна</option>}
        {groups.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <label>Что пройти индивидуально<textarea rows={2} maxLength={1000} value={draft.note}
        onChange={event => setDraft({ ...draft, note: event.target.value })} placeholder="Заметка для себя" /></label>
      {draft.lessonSchedule ? <PreparationScheduleFields value={draft.lessonSchedule} disabled={busy}
        onChange={lessonSchedule => setDraft({ ...draft, lessonSchedule })} />
        : <p>Занятия уже запланированы. Можно менять заметку; чтобы составить новый план, сначала снимите текущий.</p>}
      <div className="group-preparation__actions">
        <button type="submit" className="message-templates__primary" disabled={busy || !groups.some(row => row.id === draft.groupId)}>Сохранить план</button>
        {plan.groupId && <button type="button" disabled={busy} onClick={() => save('', '')}>Снять план</button>}
      </div>
    </form>}
    {plan.lessonPlan && <details className="group-preparation__lesson-list"><summary>Занятия предподготовки · максимум {plan.lessonPlan.config.count}</summary>
      <ul>{plan.lessonPlan.lessons.map(lesson => <li key={lesson.id}>
        {formatDate(`${lesson.date}T${lesson.time}:00+03:00`)} · {lesson.cancelled ? 'Отменено' : `${lesson.durationMinutes} мин`}
        <small>{lesson.syncStatus === 'synced' ? (lesson.cancelled ? 'Удалено из Google Calendar' : 'Есть в Google Calendar') : (lesson.syncError || 'Ожидает синхронизации с Google Calendar')}{lesson.syncStatus !== 'synced' && ' · повторим автоматически'}</small>
      </li>)}</ul>
    </details>}
    {!preview && error && <p className="group-preparation__status message-templates__warning" role="alert">{error}</p>}
    {notice && <p className="group-preparation__status" role="status">{notice}</p>}
    {preview && <JoinGroupDialog preview={preview} student={student} busy={busy} error={error} onConfirm={confirm}
      onClose={() => { setPreview(null); setError(''); }} />}
  </section>;
}
