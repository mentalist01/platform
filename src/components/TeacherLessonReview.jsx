import {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight, BookOpen, Copy, Minus, X} from 'lucide-react';
import {lessonReview, studentLessonReviews} from '../services/homeworkReminders';
import {HomeworkLessonNotePreview} from './TeacherHomeworkNotes';
import './TeacherLessonReview.css';

const dateLabel = value => new Date(value).toLocaleDateString('ru-RU', {timeZone:'Europe/Moscow', day:'numeric', month:'long'});

function ReviewDialog({title, subtitle, onClose, children}) {
  const dialog = useRef(null);
  const titleId = useId();
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus?.(); };
  }, [minimized]);
  if (minimized) return createPortal(<button type="button" className="teacher-lesson-review__dock" onClick={() => setMinimized(false)}><BookOpen size={18}/><span>{title}</span><span>Развернуть</span></button>,document.body);
  return createPortal(<dialog ref={dialog} className="teacher-lesson-review" aria-labelledby={titleId} onCancel={event => {event.preventDefault();onClose();}}>
    <header><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      <div className="teacher-lesson-review__window-actions"><button type="button" className="teacher-lesson-review__close" aria-label="Свернуть разбор" onClick={() => setMinimized(true)}><Minus size={21}/></button><button type="button" className="teacher-lesson-review__close" aria-label="Закрыть разбор" onClick={onClose}><X size={21}/></button></div>
    </header>
    <div className="teacher-lesson-review__body">{children}</div>
  </dialog>, document.body);
}

function ExamForecast({exam}) {
  return <section className="teacher-lesson-review__forecast"><h4>Прогноз ЕГЭ</h4>
    {exam?.latestMock && <p><b>{exam.latestMock.score} баллов</b> · пробник от {dateLabel(exam.latestMock.finishedAt)}</p>}
    <p>{exam?.text || 'Индивидуальный прогноз ещё готовится.'}</p>
    {exam?.assessedAt && <small>Оценка от {dateLabel(exam.assessedAt)}</small>}
  </section>;
}

function TrackResult({result}) {
  if (!result?.total) return <span title="По этому направлению заданий не было">—</span>;
  return <span><b>{result.percent}%</b><small>{result.completed} из {result.total}</small></span>;
}

function HomeworkHistory({preparation}) {
  if (!preparation?.recent?.length) return <p>В истории нет домашек с наступившим сроком.</p>;
  return <table className="teacher-lesson-review__homeworks"><thead><tr><th scope="col">Домашка к</th><th scope="col">Python</th><th scope="col">ЕГЭ</th></tr></thead><tbody>
    {preparation.recent.map(work => <tr key={work.id}><th scope="row">{dateLabel(work.dueAt)}</th><td><TrackResult result={work.python}/></td><td><TrackResult result={work.ege}/></td></tr>)}
  </tbody></table>;
}

function ParentMiniReport({row}) {
  const [copyStatus,setCopyStatus]=useState('');
  const recommended=row.preparation?.parent?.recommended;
  const prompt=row.parentPrompt;
  const copyPrompt=async()=>{
    try{
      await navigator.clipboard.writeText(prompt);
      setCopyStatus('Скопировано');
    }catch{
      setCopyStatus('Выделите текст ниже и скопируйте его');
    }
  };
  return <section className={recommended ? 'teacher-lesson-review__parent' : ''}>
    <h4>{recommended ? 'Предлагаю мини-отчёт родителю' : 'Родителю'}</h4>
    <p>{row.preparation?.parent?.text || row.parentRecommendation || 'По последним домашкам повода для мини-отчёта не выявлено.'}</p>
    {prompt && <details><summary>Промпт для Gemini</summary>
      <button type="button" className="teacher-lesson-review__copy" onClick={copyPrompt}><Copy size={15}/>Скопировать промпт</button>
      {copyStatus && <small role="status">{copyStatus}</small>}
      <textarea className="teacher-lesson-review__parent-prompt" aria-label={`Промпт для Gemini по ученику ${row.name}`} readOnly value={prompt} rows={10}/>
    </details>}
    {row.parentDraft && <details><summary>Черновик мини-отчёта</summary><p>{row.parentDraft}</p></details>}
  </section>;
}

function StudentReview({row, review, teacherId, onAssign}) {
  const prep = row.preparation;
  const topics = (prep?.current || []).flatMap(work => work.topics || []);
  const tasks = row.tasks || [];
  const assigned = row.assignedHomework;
  const hasTheory = tasks.some(task => task.pythonTheoryType);
  if (review.phase === 'before') return <article className="teacher-lesson-review__student"><h3>{row.name}</h3>
    <section><h4>Последние три домашки</h4><HomeworkHistory preparation={prep}/></section>
    {topics.length > 0 && <section><h4>К этому уроку</h4><ul>{topics.map((topic,index) => <li key={index}><span>{topic.label}</span><b>{topic.ready}/{topic.ready+topic.missing+topic.unknown}</b></li>)}</ul><p>Готово {prep.ready} · осталось {prep.missing}{prep.unknown ? ` · без точного времени ${prep.unknown}` : ''}</p></section>}
    {prep?.parent?.recommended && <ParentMiniReport row={row}/>}
  </article>;
  return <article className="teacher-lesson-review__student">
    <h3>{row.name}</h3>
    <section className="teacher-lesson-review__proposal"><h4>{assigned ? 'Домашка к следующему уроку' : 'Предлагаю задать'}</h4>
      {assigned && <p className="teacher-lesson-review__assigned">Задано{assigned.python?.total ? ` · Python ${assigned.python.total}` : ''}{assigned.ege?.total ? ` · ЕГЭ ${assigned.ege.total}` : ''} · к {dateLabel(assigned.dueAt)}</p>}
      <p>{row.homework || 'Рекомендация готовится по учебной истории.'}</p>
      {!assigned && tasks.length > 0 && <small>{hasTheory ? 'Теория и ' : ''}{tasks.length} заданий подготовлено для редактора.</small>}
      {onAssign && <button type="button" className="teacher-lesson-review__assign" onClick={() => onAssign({...review,studentId:row.studentId,targetStudentId:review.groupId ? row.studentId : undefined,suggestionTasks:tasks,existingHomeworkId:assigned?.id})}>
        <BookOpen size={17}/> {assigned ? 'Открыть домашку' : review.groupId ? `Задать ${row.name}` : 'Перейти задать'} <ArrowRight size={17}/>
      </button>}
    </section>
    <section><h4>Последние домашки</h4><HomeworkHistory preparation={prep}/></section>
    {row.concerns && <section><h4>Что не получилось</h4><p>{row.concerns}</p></section>}
    <ExamForecast exam={row.exam}/>
    <ParentMiniReport row={row}/>
    <details><summary>Подробности урока</summary>
      {topics.length > 0 && <><p>К началу урока готово {prep.ready}, осталось {prep.missing}{prep.unknown > 0 ? `, без точного времени ${prep.unknown}` : ''}.</p><ul>{topics.map((topic,index) => <li key={index}><span>{topic.label}</span><b>{topic.ready}/{topic.ready+topic.missing+topic.unknown}</b></li>)}</ul></>}
      {row.repeat && <p>{row.repeat}</p>}{row.context && <p>{row.context}</p>}
    </details>
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
  return <ReviewDialog title={`${lesson.phase === 'before' ? 'Перед уроком' : 'После занятия'} · ${review?.name || lesson.name}`} subtitle={`${dateLabel(lesson.endedAt)}${lesson.lessonTime ? ` · ${lesson.lessonTime} · Москва` : ''}`} onClose={onClose}>
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
