import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, ChevronDown, Clock3, RefreshCcw } from 'lucide-react';
import { api } from '../services/api';
import { getMonthlyMockPeriod, MONTHLY_MOCK_TIME_ZONE } from '../utils/monthlyMockExam';
import './MonthlyMockExamStatus.css';

const labels = { completed: 'Пройден', in_progress: 'Начат, не завершён', pending: 'Нужно пройти' };
function Status({ row }) {
  const Icon = row?.status === 'completed' ? CheckCircle2 : Clock3;
  return <span className="monthly-mock__status" data-status={row?.status || 'unknown'}>
    <Icon size={14} aria-hidden="true" />{labels[row?.status] || 'Нет данных'}
    {row?.completion && <span> · {new Date(row.completion.finishedAt).toLocaleDateString('ru-RU', {
      timeZone: MONTHLY_MOCK_TIME_ZONE, day: 'numeric', month: 'long',
    })}</span>}
  </span>;
}

export default function MonthlyMockExamStatus({ role, userId, activeStudentId, students = [], refreshKey, onAssign, onOpenMocks }) {
  const teacher = role === 'teacher';
  const [selectedMonth, setSelectedMonth] = useState('');
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestKey = `${role}:${userId}:${selectedMonth}`;
  const data = result?.key === requestKey ? result.data : null;
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      setBusy(true);
      try {
        const next = await api.getMonthlyMockStatus(selectedMonth);
        if (!disposed) { setResult({ key: requestKey, data: next }); setError(''); }
      } catch (failure) {
        if (!disposed) setError(String(failure?.message || 'Не удалось обновить статус пробника'));
      } finally {
        pending = false;
        if (!disposed) setBusy(false);
      }
    };
    const refreshVisible = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    void refresh();
    const timer = window.setInterval(refreshVisible, 30_000);
    window.addEventListener('focus', refreshVisible);
    window.addEventListener('online', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('online', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [requestKey, selectedMonth, refreshKey, revision]);
  const names = useMemo(() => new Map(students.map((s) => [String(s.id), s.nickname || s.name])), [students]);
  const rows = data?.rows || [];
  const selected = rows.find((row) => row.studentId === (teacher ? activeStudentId : userId));
  const filteredRows = rows.filter((row) => (
    (filter === 'all' || (filter === 'completed' ? row.status === 'completed' : row.status !== 'completed'))
    && String(names.get(row.studentId) || row.name).toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))
  )).sort((a, b) => String(names.get(a.studentId) || a.name).localeCompare(String(names.get(b.studentId) || b.name), 'ru'));
  const months = data ? Array.from({ length: 12 }, (_, index) => {
    const [year, month] = data.currentMonth.split('-').map(Number);
    return getMonthlyMockPeriod(new Date(Date.UTC(year, month - 1 - index, 1)).toISOString().slice(0, 7));
  }) : [];
  const current = data?.period.month === data?.currentMonth;
  return <section className="monthly-mock" aria-label="Пробник за месяц">
    <div className="monthly-mock__bar">
      <BookOpen size={18} className="monthly-mock__icon" aria-hidden="true" />
      <div className="monthly-mock__heading">
        <strong>Пробник · {data?.period.label || 'этот месяц'}</strong>
        {teacher && data && <small>Прошли {data.summary.completed} из {data.summary.total} · ещё не прошли {data.summary.pending}</small>}
        {!data && <small>{error ? 'Статус недоступен' : 'Проверяем результаты…'}</small>}
      </div>
      {selected && <div className="monthly-mock__selected">
        {teacher && <span className="monthly-mock__name">{names.get(selected.studentId) || selected.name}</span>}
        <Status row={selected} />
      </div>}
      <div className="monthly-mock__actions">
        {teacher && selected && current && selected.status !== 'completed' && <button type="button" onClick={() => onAssign?.(selected.studentId)}>Задать пробник</button>}
        {!teacher && selected && <button type="button" onClick={() => onOpenMocks?.()}>{selected.status === 'completed' ? 'Мои пробники' : 'Открыть пробники'}</button>}
        {teacher && <button type="button" aria-expanded={expanded} aria-controls="monthly-mock-roster" onClick={() => setExpanded(!expanded)}>Все ученики <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} /></button>}
        <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={busy} aria-label="Обновить статусы пробников" title="Обновить статусы"><RefreshCcw size={14} className={busy ? 'animate-spin' : ''} /></button>
      </div>
    </div>
    {error && <p className="monthly-mock__error" role="status">{data ? 'Показаны последние полученные данные. ' : ''}{error}</p>}
    {teacher && expanded && <div id="monthly-mock-roster" className="monthly-mock__roster">
      <div className="monthly-mock__filters">
        <label>Месяц<select value={selectedMonth || data?.currentMonth || ''} onChange={(e) => setSelectedMonth(e.target.value === data?.currentMonth ? '' : e.target.value)}>{months.map((period) => <option key={period.month} value={period.month}>{period.label}</option>)}</select></label>
        <div className="monthly-mock__tabs" aria-label="Фильтр учеников">{[['pending', 'Не прошли'], ['completed', 'Прошли'], ['all', 'Все']].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
        <input type="search" aria-label="Найти ученика по имени" placeholder="Найти ученика" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <p className="monthly-mock__help">Один завершённый пробник за календарный месяц, с любым результатом. Часовой пояс — Москва. Отдельные задания из пробника не засчитываются.</p>
      <div className="monthly-mock__rows">{filteredRows.map((row) => <div key={row.studentId} className="monthly-mock__row" data-selected={row.studentId === activeStudentId}>
        <div className="monthly-mock__person"><strong>{names.get(row.studentId) || row.name}</strong>{row.completion && <small>{row.completion.title}</small>}</div>
        <Status row={row} />
        <div className="monthly-mock__actions">
          {current && row.status !== 'completed' && <button type="button" onClick={() => onAssign?.(row.studentId)}>Задать пробник</button>}
          <button type="button" onClick={() => onOpenMocks?.(row.studentId)}>Пробники ученика</button>
        </div>
      </div>)}
      {data && !filteredRows.length && <p className="monthly-mock__help">{query ? 'Ученики не найдены.' : filter === 'pending' && rows.length ? 'Все ученики прошли пробник за этот месяц.' : 'В этом списке пока нет учеников.'}</p>}</div>
    </div>}
  </section>;
}
