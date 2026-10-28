import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardList, Clock3, ListChecks, PlayCircle, RefreshCcw, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { getMonthlyMockMonth, getMonthlyMockPeriod, MONTHLY_MOCK_TIME_ZONE } from '../utils/monthlyMockExam';
import './StudentMonthlyMockHomework.css';
import './MonthlyMockReview.css';
import StudentMonthlyMockReview from './StudentMonthlyMockReview';

export function MonthlyMockHomeworkCard({ data, error, onOpen, onRefresh }) {
  const assignment = data?.assignment;
  const row = data?.rows?.[0];
  const period = data?.period || getMonthlyMockPeriod(getMonthlyMockMonth());
  const status = assignment ? row?.status || 'pending' : 'unassigned';
  const completed = status === 'completed';
  const exempt = status === 'exempt';
  const surrendered = row?.attemptPolicy?.surrendered;
  const perfect = row?.attemptPolicy?.perfect === true;
  const started = status === 'in_progress' && !surrendered;
  const deadlineMs = assignment?.availableUntilNext ? (assignment.dueAt ? Date.parse(assignment.dueAt) : null) : period.endMs - 1;
  const deadline = deadlineMs === null ? 'До следующего пробника' : new Date(deadlineMs).toLocaleDateString('ru-RU', {
    timeZone: MONTHLY_MOCK_TIME_ZONE, day: 'numeric', month: 'long',
  });
  const deadlineDay = deadlineMs === null ? '∞' : new Intl.DateTimeFormat('ru-RU', { timeZone: MONTHLY_MOCK_TIME_ZONE, day: 'numeric' }).format(deadlineMs);
  const deadlineMonth = deadlineMs === null ? '' : new Intl.DateTimeFormat('ru-RU', { timeZone: MONTHLY_MOCK_TIME_ZONE, month: 'long' }).format(deadlineMs);
  if (data?.publicationPending) return null;
  return <section className="student-monthly-mock" aria-label="Пробник месяца" data-status={status}>
    <header className="student-monthly-mock__header">
      <span className="student-monthly-mock__icon"><BookOpen size={22} aria-hidden="true" /></span>
      <div><h3>Пробник месяца</h3><p>{period.label}</p></div>
      {assignment && <span className="student-monthly-mock__status">
        {completed ? <CheckCircle2 size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}
        {surrendered ? 'Попытки закрыты' : completed ? 'Пройден' : exempt ? 'По желанию' : started ? 'В процессе' : 'Нужно пройти'}
      </span>}
    </header>
    {error ? <div className="student-monthly-mock__empty" role="status">
      <p>Не удалось проверить пробник месяца. {data ? 'Показаны последние полученные данные.' : 'Проверьте подключение к интернету.'}</p>
      <button type="button" onClick={onRefresh}><RefreshCcw size={15} aria-hidden="true" />Повторить</button>
    </div> : !data ? <p className="student-monthly-mock__empty" role="status">Проверяем назначение…</p> : !assignment ? (
      <p className="student-monthly-mock__empty">Преподаватель ещё не назначил пробник на этот месяц.</p>
    ) : null}
    {assignment && <div className="student-monthly-mock__body">
      <div className="student-monthly-mock__main">
        <div className="student-monthly-mock__art" aria-hidden="true">
          <div className="student-monthly-mock__orbit" />
          <div className="student-monthly-mock__paper student-monthly-mock__paper--back" />
          <div className="student-monthly-mock__paper">
            <span className="student-monthly-mock__paper-icon">{completed ? <CheckCircle2 size={34} /> : <ClipboardList size={34} />}</span>
            <span className="student-monthly-mock__paper-line" />
            <span className="student-monthly-mock__paper-line student-monthly-mock__paper-line--short" />
            <span className="student-monthly-mock__paper-check"><CheckCircle2 size={13} /><i /></span>
            <span className="student-monthly-mock__paper-check"><CheckCircle2 size={13} /><i /></span>
          </div>
          <span className="student-monthly-mock__art-spark"><Sparkles size={21} /></span>
          <span className="student-monthly-mock__art-dot" />
        </div>
        <div className="student-monthly-mock__description">
          <span className="student-monthly-mock__eyebrow">{perfect ? 'Все 100 — отличная работа!' : surrendered ? 'Разбор открыт' : completed ? 'Ещё один шаг вперёд' : started ? 'Осталось завершить пробник' : exempt ? 'Дополнительная практика' : 'Ваш следующий шаг'}</span>
          <h4>{assignment.title}</h4>
          {row?.attemptPolicy && <p><strong>Ваш пробник №{row.attemptPolicy.ordinal} · использовано {row.attemptPolicy.usedAttempts} из {row.attemptPolicy.maxAttempts} попыток</strong><br/>В отчёт идёт лучший результат.{perfect ? ' Пробник пройден на 100 баллов — повторные попытки не нужны.' : row.attemptPolicy.surrendered ? ' Оставшиеся попытки закрыты, разбор открыт.' : row.attemptPolicy.remainingAttempts > 0 ? ` Осталось попыток: ${row.attemptPolicy.remainingAttempts}.` : ' Все попытки использованы.'}</p>}
          <p>{surrendered ? 'Вы открыли разбор и закрыли оставшиеся попытки. Лучший завершённый результат сохранён.' : completed ? 'Вы завершили пробник этого месяца. Можно вернуться к заданиям и посмотреть свой результат.' : exempt ? 'Преподаватель разрешил не проходить пробник в этом месяце. Вы можете решить его для практики.' : started ? 'Пробник уже начат. Вернитесь к заданиям и доведите его до конца.' : 'Проверьте свои знания и узнайте, что уже получается, а над чем ещё стоит поработать.'}</p>
          <div className="student-monthly-mock__facts">
            <span><ListChecks size={16} aria-hidden="true" />{assignment.taskCount} заданий</span>
            <span><Clock3 size={16} aria-hidden="true" />{assignment.mode === 'classic' ? 'Без таймера' : 'С таймером'}</span>
          </div>
        </div>
      </div>
      <div className="student-monthly-mock__action-panel">
        {completed || surrendered ? <div className="student-monthly-mock__achievement"><span><CheckCircle2 size={25} aria-hidden="true" /></span><div><strong>{typeof row.score === 'number' ? `Лучший результат: ${row.score} из 100` : surrendered ? 'Разбор открыт' : 'Месяц — с результатом'}</strong><p>{completed ? 'Пробник пройден' : 'Оставшиеся попытки закрыты'}</p></div></div> : <div className="student-monthly-mock__deadline">
          <span className="student-monthly-mock__date" aria-hidden="true"><CalendarDays size={15} /><strong>{deadlineDay}</strong><small>{deadlineMonth}</small></span>
          <div><span className="student-monthly-mock__deadline-label">{deadlineMs === null ? 'Доступен для решения' : exempt ? 'Можно пройти до' : 'Решите весь пробник до'}</span><strong>{deadline}</strong><p>{deadlineMs === null ? 'Пока преподаватель не откроет следующий' : '23:59 · по Москве'}</p></div>
        </div>}
        <button className="student-monthly-mock__open" type="button" onClick={() => onOpen?.(assignment.examId, null, { mode: assignment.mode })}>
          <PlayCircle size={19} aria-hidden="true" /><span>{completed || row?.attemptPolicy?.surrendered ? 'Посмотреть пробник' : started ? 'Продолжить пробник' : 'Начать пробник'}</span><ArrowRight size={18} aria-hidden="true" />
        </button>
        <p className="student-monthly-mock__action-hint">{completed ? 'Результат этого месяца сохранён' : exempt ? 'Прохождение по желанию' : 'Один полный пробник за месяц'}</p>
      </div>
    </div>}
    {assignment && <StudentMonthlyMockReview examId={assignment.examId} month={period.month} title={assignment.title} initialReview={assignment} />}
  </section>;
}

export default function StudentMonthlyMockHomework({ studentId, refreshKey, onOpen }) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const data = result?.studentId === studentId ? result.data : null;
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await api.getMonthlyMockStatus('');
        if (!disposed) { setResult({ studentId, data: response }); setError(''); }
      } catch {
        if (!disposed) setError('load');
      } finally { pending = false; }
    };
    const loadVisible = () => { if (document.visibilityState !== 'hidden') void load(); };
    void load();
    const timer = setInterval(loadVisible, 30_000);
    window.addEventListener('focus', loadVisible);
    window.addEventListener('online', loadVisible);
    document.addEventListener('visibilitychange', loadVisible);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('focus', loadVisible);
      window.removeEventListener('online', loadVisible);
      document.removeEventListener('visibilitychange', loadVisible);
    };
  }, [studentId, refreshKey, revision]);
  return <MonthlyMockHomeworkCard data={data} error={error} onOpen={onOpen} onRefresh={() => setRevision(value => value + 1)} />;
}
