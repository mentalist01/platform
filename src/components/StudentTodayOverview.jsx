import React, { useMemo } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Code2,
  MessageSquare,
  PlayCircle,
  Sparkles,
  Target,
} from 'lucide-react';

const HOMEWORK_DAY_MS = 24 * 60 * 60 * 1000;

const getFirstName = (value) => String(value || '').trim().split(/\s+/)[0] || 'ученик';

const resolveHomeworkDueAt = (entry) => {
  const explicitDueAt = new Date(entry?.dueAt || '');
  if (!Number.isNaN(explicitDueAt.getTime())) return explicitDueAt;
  const issuedAt = new Date(entry?.issuedAt || '');
  if (Number.isNaN(issuedAt.getTime())) return null;
  const rawDays = Number(entry?.daysToComplete);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 7;
  return new Date(issuedAt.getTime() + (days * HOMEWORK_DAY_MS));
};

const formatRelativeAmount = (value, forms) => {
  const amount = Math.max(1, Math.ceil(Number(value) || 1));
  const mod10 = amount % 10;
  const mod100 = amount % 100;
  if (mod10 === 1 && mod100 !== 11) return `${amount} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${amount} ${forms[1]}`;
  }
  return `${amount} ${forms[2]}`;
};

const getDeadlineSummary = (entry) => {
  const dueAt = resolveHomeworkDueAt(entry);
  if (!dueAt) return null;
  const remainingMs = dueAt.getTime() - Date.now();
  const absoluteMs = Math.abs(remainingMs);
  const dateLabel = dueAt.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).replace(' г.', '');
  const timeLabel = dueAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  let relativeLabel = '';
  if (absoluteMs < 60 * 60 * 1000) {
    relativeLabel = formatRelativeAmount(absoluteMs / (60 * 1000), ['минута', 'минуты', 'минут']);
  } else if (absoluteMs < HOMEWORK_DAY_MS) {
    relativeLabel = formatRelativeAmount(absoluteMs / (60 * 60 * 1000), ['час', 'часа', 'часов']);
  } else {
    relativeLabel = formatRelativeAmount(absoluteMs / HOMEWORK_DAY_MS, ['день', 'дня', 'дней']);
  }
  const overdue = remainingMs < 0;
  return {
    overdue,
    urgent: !overdue && remainingMs <= HOMEWORK_DAY_MS,
    dateLabel: `${dateLabel}, ${timeLabel}`,
    relativeLabel: overdue ? `Просрочено на ${relativeLabel}` : `Осталось ${relativeLabel}`,
  };
};

const getGoalLabel = (goal) => {
  if (!goal) return '';
  if (goal.type === 'mock') return goal.mockExamTitle || 'Продолжить пробник';
  if (goal.taskTitle) return goal.taskTitle;
  if (goal.taskNumber) return `Задание ${goal.taskNumber}`;
  return 'Продолжить домашку';
};

const QuickAction = ({ icon, eyebrow, title, hint, badge, onClick, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`student-today-overview__quick-action group flex min-h-[104px] min-w-0 flex-col rounded-2xl border border-slate-200/85 bg-white/88 p-3.5 text-left shadow-[0_8px_22px_rgba(71,85,105,0.08)] transition hover:-translate-y-0.5 hover:border-purple-200 hover:bg-white hover:shadow-[0_12px_26px_rgba(124,58,237,0.12)] ${className}`}
  >
    <div className="flex w-full items-start justify-between gap-2">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-purple-100 bg-purple-50 text-purple-600">
        {React.createElement(icon, { size: 17 })}
      </span>
      {badge ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-purple-600 px-1.5 py-0.5 text-[10px] font-black text-white">
          {badge}
        </span>
      ) : null}
    </div>
    <span className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-purple-500">{eyebrow}</span>
    <strong className="mt-0.5 text-sm text-slate-900">{title}</strong>
    <span className="mt-1 text-[11px] leading-relaxed text-slate-500">{hint}</span>
  </button>
);

const StudentTodayOverview = ({
  studentName,
  homeworkEntry,
  goals = [],
  completedGoalCount = 0,
  chatUnreadCount = 0,
  onContinueHomework,
  onOpenPractice,
  onOpenPython,
  onOpenLesson,
  onOpenChat,
}) => {
  const pendingGoal = goals.find((goal) => !goal?.completed) || goals[0] || null;
  const deadline = useMemo(() => getDeadlineSummary(homeworkEntry), [homeworkEntry]);
  const dateLabel = useMemo(() => (
    new Date().toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  ), []);
  const hasHomework = Boolean(homeworkEntry && goals.length > 0 && completedGoalCount < goals.length);
  const primaryTitle = hasHomework ? getGoalLabel(pendingGoal) : 'Выберите короткую практику';
  const primaryHint = hasHomework
    ? `Выполнено ${completedGoalCount} из ${goals.length} целей`
    : 'Начните с одной темы — платформа сохранит место, где вы остановились.';
  const primaryAction = hasHomework ? onContinueHomework : onOpenPractice;

  return (
    <section className="student-today-overview mb-4 overflow-hidden rounded-[26px] border border-purple-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(245,243,255,0.94)_52%,rgba(240,249,255,0.92))] p-4 shadow-[0_18px_40px_rgba(99,102,241,0.13)] md:mb-6 md:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-purple-600">
            <Sparkles size={13} />
            Сегодня · {dateLabel}
          </div>
          <h2 className="student-today-overview__headline mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-[30px]">
            {`С чего начнём, ${getFirstName(studentName)}?`}
          </h2>
        </div>
        <span className="text-xs font-medium text-slate-500">Один понятный следующий шаг</span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <div className="relative overflow-hidden rounded-[22px] border border-purple-300/80 bg-gradient-to-br from-purple-600 via-violet-600 to-fuchsia-600 p-4 text-white shadow-[0_16px_32px_rgba(124,58,237,0.24)] md:p-5">
          <div aria-hidden className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <div className="relative flex h-full min-h-[154px] flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/14 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]">
                <Target size={12} />
                {hasHomework ? 'Главное на сегодня' : 'Практика на сегодня'}
              </span>
              {deadline ? (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  deadline.overdue
                    ? 'bg-rose-100 text-rose-700'
                    : deadline.urgent
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-white/16 text-white'
                }`}>
                  <Clock3 size={11} />
                  {deadline.relativeLabel}
                </span>
              ) : null}
            </div>
            <strong className="mt-4 max-w-2xl text-xl font-black leading-tight md:text-2xl">{primaryTitle}</strong>
            <span className="mt-1.5 text-sm text-purple-100">{primaryHint}</span>
            {deadline ? <span className="mt-1 text-[11px] text-purple-100/80">Дедлайн: {deadline.dateLabel}</span> : null}
            <button
              type="button"
              onClick={primaryAction}
              className="student-today-overview__primary-action mt-auto inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-purple-700 shadow-[0_10px_22px_rgba(49,46,129,0.24)] transition hover:-translate-y-0.5 hover:bg-purple-50"
            >
              {hasHomework ? 'Продолжить' : 'Начать практику'}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
          <QuickAction
            icon={Code2}
            eyebrow="Python"
            title="Продолжить курс"
            hint="Темы и практика ЕГЭ"
            onClick={onOpenPython}
          />
          <QuickAction
            icon={PlayCircle}
            eyebrow="Урок"
            title="Открыть комнату"
            hint="Звонок, доска и код"
            onClick={onOpenLesson}
          />
          {onOpenChat ? (
            <QuickAction
              icon={MessageSquare}
              eyebrow="Учитель"
              title={chatUnreadCount > 0 ? 'Есть новые сообщения' : 'Открыть чат'}
              hint={chatUnreadCount > 0 ? 'Ответьте, не теряя контекст' : 'Задать вопрос преподавателю'}
              badge={chatUnreadCount > 0 ? chatUnreadCount : null}
              onClick={onOpenChat}
              className="col-span-2 sm:col-span-1 lg:col-span-2"
            />
          ) : (
            <QuickAction
              icon={CheckCircle2}
              eyebrow="Практика"
              title="Выбрать тему"
              hint="Задания по текущим целям"
              onClick={onOpenPractice}
              className="col-span-2 sm:col-span-1 lg:col-span-2"
            />
          )}
        </div>
      </div>
    </section>
  );
};

export default StudentTodayOverview;
