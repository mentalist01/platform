import {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight, BookOpen, X} from 'lucide-react';
import {lessonReview, studentLessonReviews} from '../services/homeworkReminders';
import {HomeworkLessonNotePreview} from './TeacherHomeworkNotes';
import './TeacherLessonReview.css';

const dateLabel = value => new Date(value).toLocaleDateString('ru-RU', {timeZone:'Europe/Moscow', day:'numeric', month:'long'});

function ReviewDialog({title, subtitle, onClose, children}) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus?.(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="teacher-lesson-review" aria-labelledby={titleId} onCancel={event => {event.preventDefault();onClose();}}>
    <header><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      <button type="button" className="teacher-lesson-review__close" aria-label="Закрыть разбор" onClick={onClose}><X size={21}/></button>
    </header>
    <div className="teacher-lesson-review__body">{children}</div>
  </dialog>, document.body);
}

function ExamForecast({exam}) {
  return <section className="teacher-lesson-review__forecast"><h4>Прогноз ЕГЭ</h4>
    {exam?.latestMock && <p><b>{exam.latestMock.score} баллов</b> · пробник от {dateLabel(exam.latestMock.finishedAt)}</p>}
    <p>{exam?.text || 'Нужен самостоятельный полный пробник для начальной оценки.'}</p>
    {exam?.assessedAt && <small>Оценка от {dateLabel(exam.assessedAt)}</small>}
  </section>;
}

function StudentReview({row, review, teacherId, onAssign}) {
  const prep = row.preparation;
  const topics = (prep?.current || []).flatMap(work => work.topics || []);
  const parent = row.parentRecommendation || prep?.parent?.text;
  const tasks = row.tasks || [];
  return <article className="teacher-lesson-review__student">
    <h3>{row.name}</h3>
    <section><h4>Подготовка к уроку</h4>
      {prep?.available && topics.length ? <>
        <div className="teacher-lesson-review__counts"><span>Готово <b>{prep.ready}</b></span><span data-missing={prep.missing > 0}>Осталось <b>{prep.missing}</b></span>{prep.unknown > 0 && <span>Без точного времени <b>{prep.unknown}</b></span>}</div>
        <ul>{topics.map((topic,index) => <li key={index}><span>{topic.label}</span><b>{topic.ready}/{topic.ready+topic.missing+topic.unknown}</b>{topic.unknown > 0 && <small>Есть решения без времени</small>}</li>)}</ul>
        <small>Выполнение к началу занятия. Учтены задания ЕГЭ и Python.</small>
      </> : <p>{prep?.available ? 'В истории нет заданий с подтверждённым сроком к этому уроку.' : 'Данных для проверки подготовки пока недостаточно.'}</p>}
    </section>
    {row.concerns && <section><h4>Проблемы</h4><p>{row.concerns}</p></section>}
    {row.repeat && <section><h4>Что повторить</h4><p>{row.repeat}</p></section>}
    {row.context && <section><h4>Следующее занятие</h4><p>{row.context}</p></section>}
    <section><h4>Предлагаю задать</h4><p>{row.homework || 'Рекомендации появятся после разбора записи занятия.'}</p>
      {tasks.length > 0 && <small>{tasks.length} заданий подготовлено для редактора домашки.</small>}
    </section>
    <ExamForecast exam={row.exam}/>
    {parent && <section className={prep?.parent?.recommended ? 'teacher-lesson-review__parent' : ''}><h4>Связаться с родителем</h4><p>{parent}</p>
      {row.parentDraft && <details><summary>Текст для родителя</summary><p>{row.parentDraft}</p></details>}
    </section>}
    {onAssign && <button type="button" className="teacher-lesson-review__assign" onClick={() => onAssign({...review, studentId:row.studentId, targetStudentId:review.groupId ? row.studentId : undefined, suggestionTasks:tasks})}>
      <BookOpen size={17}/> {review.groupId ? `Задать ${row.name}` : 'Перейти задать'} <ArrowRight size={17}/>
    </button>}
    {teacherId && <HomeworkLessonNotePreview teacherId={teacherId} studentId={row.studentId} groupId={review.groupId} compact/>}
  </article>;
}

export function TeacherLessonReviewDialog({lesson, studentId, teacherId, onClose, onAssign}) {
  const [review, setReview] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    setReview(null);
    setError('');
    const refresh = async () => {
      if (fetching || controller.signal.aborted) return;
      fetching = true;
      try {
        const result = await lessonReview(lesson.id, studentId, controller.signal);
        if (!controller.signal.aborted) {setReview(result);setError('');}
      } catch {if (!controller.signal.aborted) setError('Не удалось загрузить разбор. Повторим автоматически.');}
      finally {fetching = false;}
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {controller.abort();window.clearInterval(timer);};
  }, [lesson.id, studentId]);
  return <ReviewDialog title={`После занятия · ${review?.name || lesson.name}`} subtitle={`${dateLabel(lesson.endedAt)}${lesson.lessonTime ? ` · ${lesson.lessonTime} · Москва` : ''}`} onClose={onClose}>
    {error && <p role="alert">{error}</p>}
    {!review && !error && <p role="status">Загружаем подготовку и разбор…</p>}
    {review && <div className="teacher-lesson-review__grid" data-group={review.rows.length > 1}>{review.rows.map(row => <StudentReview key={row.studentId} row={row} review={review} teacherId={teacherId} onAssign={onAssign ? request => {onClose();onAssign(request);} : undefined}/>)}</div>}
  </ReviewDialog>;
}

export default function StudentLessonReviewHistory({student, teacherId, onClose, onAssign}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    studentLessonReviews(student.id, controller.signal).then(value => {if(!controller.signal.aborted)setData(value);}).catch(() => {if(!controller.signal.aborted)setError('Не удалось загрузить историю разборов.');});
    return () => controller.abort();
  }, [student.id]);
  if (selected) return <TeacherLessonReviewDialog lesson={selected} studentId={student.id} teacherId={teacherId} onClose={() => setSelected(null)} onAssign={onAssign ? request => {onClose();onAssign(request);} : undefined}/>;
  return <ReviewDialog title={`Разборы занятий · ${student.name}`} onClose={onClose}>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Загружаем историю…</p>}
    {data && <><ExamForecast exam={data.exam}/>
      {data.lessons.length ? <div className="teacher-lesson-review__history">{data.lessons.map(lesson => <button type="button" key={lesson.id} onClick={() => setSelected(lesson)}><span><b>{dateLabel(lesson.endedAt)} · {lesson.lessonTime}</b><small>{lesson.name}</small></span><ArrowRight size={18}/></button>)}</div> : <p>После завершённых занятий здесь появятся разборы подготовки и рекомендации.</p>}
    </>}
  </ReviewDialog>;
}
