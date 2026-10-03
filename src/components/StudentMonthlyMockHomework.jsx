import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Clock3, PlayCircle, RefreshCcw } from 'lucide-react';
import { api } from '../services/api';
import { getMonthlyMockMonth, getMonthlyMockPeriod, MONTHLY_MOCK_TIME_ZONE } from '../utils/monthlyMockExam';
import './StudentMonthlyMockHomework.css';

export function MonthlyMockHomeworkCard({ data, error, onOpen, onRefresh }) {
  const assignment = data?.assignment;
  const row = data?.rows?.[0];
  const period = data?.period || getMonthlyMockPeriod(getMonthlyMockMonth());
  const status = assignment ? row?.status || 'pending' : 'unassigned';
  const completed = status === 'completed';
  const exempt = status === 'exempt';
  const started = status === 'in_progress';
  const deadline = new Date(period.endMs - 1).toLocaleDateString('ru-RU', {
    timeZone: MONTHLY_MOCK_TIME_ZONE, day: 'numeric', month: 'long',
  });
  return <section className="student-monthly-mock" aria-label="Пробник месяца" data-status={status}>
    <header className="student-monthly-mock__header">
      <span className="student-monthly-mock__icon"><BookOpen size={21} aria-hidden="true" /></span>
      <div><h3>Пробник месяца</h3><p>{period.label}</p></div>
      {assignment && <span className="student-monthly-mock__status">
        {completed ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}
        {completed ? 'Пройден' : exempt ? 'По желанию' : started ? 'Начат' : 'Нужно пройти'}
      </span>}
    </header>
    {error ? <div className="student-monthly-mock__empty" role="status">
      <p>Не удалось проверить пробник месяца. {data ? 'Показаны последние полученные данные.' : 'Проверьте подключение к интернету.'}</p>
      <button type="button" onClick={onRefresh}><RefreshCcw size={15} />Повторить</button>
    </div> : !data ? <p className="student-monthly-mock__empty" role="status">Проверяем назначение…</p> : !assignment ? (
      <p className="student-monthly-mock__empty">Преподаватель ещё не назначил пробник на этот месяц.</p>
    ) : null}
    {assignment && <div className="student-monthly-mock__body">
      <div className="student-monthly-mock__description">
        <strong>{assignment.title}</strong>
        <p>{completed ? 'Вы завершили пробник этого месяца.' : exempt ? 'Преподаватель разрешил не проходить пробник в этом месяце.' : `Решите весь пробник до ${deadline}, 23:59 по Москве.`}</p>
        <small>{assignment.taskCount} заданий · {assignment.mode === 'classic' ? 'Без таймера' : 'С таймером'} · Срок до {deadline}</small>
      </div>
      <button className="student-monthly-mock__open" type="button" onClick={() => onOpen?.(assignment.examId, null, { mode: assignment.mode })}>
        <PlayCircle size={18} />{completed ? 'Посмотреть пробник' : started ? 'Продолжить пробник' : 'Начать пробник'}
      </button>
    </div>}
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
