import React, { useMemo } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Code2,
  Flame,
  MessageSquare,
  Play,
  PlayCircle,
  Sparkles,
  Target,
} from 'lucide-react';
import { isOptionalHomeworkGoal } from '../utils/homeworkAssignmentTier';

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
  const taskTitle = String(goal.taskTitle || '').trim();
  const taskNumber = String(goal.taskNumber || '').trim();
  const isPythonGoal = String(goal.levelLabel || goal.levelId || '').trim().toLowerCase() === 'python';
  if (taskTitle) {
    if (!taskNumber || isPythonGoal || new RegExp(`^(?:№|задание\\s*)${taskNumber}(?:\\s|[.·:—-])`, 'i').test(taskTitle)) {
      return taskTitle;
    }
    return `№${taskNumber} ${taskTitle}`;
  }
  if (taskNumber) return `Задание №${taskNumber}`;
  return 'Продолжить домашку';
};

const getQuickTaskLabel = (task) => {
  if (!task) return '';
  if (task.kind === 'mock') {
    const examTitle = String(task.mockExamTitle || '').trim();
    const taskLabel = task.taskKey || task.taskNumber;
    return `${examTitle || 'Пробник'} · задание ${taskLabel}`;
  }
  const taskPrefix = task.isPython
    ? 'Python'
    : `Задание ${task.taskDisplay || task.taskNumber}`;
  const questionSuffix = task.questionNumber ? ` · №${task.questionNumber}` : '';
  return `${taskPrefix}${questionSuffix}`;
};

const getSolvedTaskCountLabel = (count) => {
  const value = Math.max(0, Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} задание`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} задания`;
  return `${value} заданий`;
};

const QuickAction = ({ icon, eyebrow, title, hint, badge, onClick, tone = 'python', actionLabel = 'Открыть', className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    data-tone={tone}
    aria-label={`${actionLabel}: ${title}`}
    className={`student-today-overview__quick-action group flex min-h-[104px] min-w-0 flex-col rounded-2xl border border-slate-200/85 bg-white/88 p-3.5 text-left shadow-[0_8px_22px_rgba(71,85,105,0.08)] transition hover:-translate-y-0.5 hover:border-purple-200 hover:bg-white hover:shadow-[0_12px_26px_rgba(124,58,237,0.12)] ${className}`}
  >
    <div className="flex w-full items-start justify-between gap-2">
      <span className="student-today-overview__quick-icon inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-purple-100 bg-purple-50 text-purple-600">
        {React.createElement(icon, { size: 17 })}
      </span>
      <span className="flex items-center gap-1.5">
        {badge ? (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-purple-600 px-1.5 py-0.5 text-[10px] font-black text-white">
            {badge}
          </span>
        ) : null}
        <span className="student-today-overview__quick-arrow" aria-hidden="true">
          <ArrowRight size={14} />
        </span>
      </span>
    </div>
    <span className="student-today-overview__quick-eyebrow mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-purple-500">{eyebrow}</span>
    <strong className="student-today-overview__quick-title mt-0.5 text-sm text-slate-900">{title}</strong>
    <span className="student-today-overview__quick-hint mt-1 text-[11px] leading-relaxed text-slate-500">{hint}</span>
    <span className="student-today-overview__quick-cta">
      {actionLabel}<ArrowRight size={13} />
    </span>
  </button>
);

const StudentTodayOverview = ({
  studentName,
  homeworkEntry,
  goals = [],
  chatUnreadCount = 0,
  quickHomeworkStatus = 'idle',
  quickHomeworkAvailableCount = 0,
  quickHomeworkCompletedCount = 0,
  quickHomeworkCurrentTask = null,
  quickHomeworkPlans = [],
  quickHomeworkPlanKey = '',
  quickHomeworkMode = null,
  quickHomeworkBudgetMinutes = null,
  quickHomeworkPlannedCount = 0,
  quickHomeworkLoading = false,
  onStartQuickHomework,
  onStartQuickHomeworkPlan,
  onResumeQuickHomework,
  onContinueHomework,
  onOpenPractice,
  onOpenPython,
  onOpenLesson,
  onOpenChat,
}) => {
  const requiredGoals = goals.filter((goal) => !isOptionalHomeworkGoal(goal));
  const optionalGoals = goals.filter((goal) => isOptionalHomeworkGoal(goal));
  const requiredCompletedCount = requiredGoals.filter((goal) => goal?.completed).length;
  const pendingRequiredGoal = requiredGoals.find((goal) => !goal?.completed) || null;
  const pendingOptionalGoal = optionalGoals.find((goal) => !goal?.completed) || null;
  const pendingGoal = pendingRequiredGoal || pendingOptionalGoal || requiredGoals[0] || optionalGoals[0] || null;
  const homeworkChecklistItems = Array.isArray(homeworkEntry?.checklistItems)
    ? homeworkEntry.checklistItems
    : [];
  const hasTextHomework = Boolean(
    homeworkEntry
    && goals.length === 0
    && (String(homeworkEntry?.homeWork || '').trim() || homeworkChecklistItems.length > 0)
  );
  const textHomeworkCompleted = hasTextHomework
    && homeworkChecklistItems.length > 0
    && homeworkChecklistItems.every((item) => Boolean(item?.completedAt));
  const hasPendingTextHomework = hasTextHomework && !textHomeworkCompleted;
  const deadline = useMemo(() => getDeadlineSummary(homeworkEntry), [homeworkEntry]);
  const dateLabel = useMemo(() => (
    new Date().toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  ), []);
  const hasRequiredHomework = Boolean(
    homeworkEntry
    && requiredGoals.length > 0
    && requiredCompletedCount < requiredGoals.length
  );
  const hasOptionalHomework = Boolean(homeworkEntry && pendingOptionalGoal);
  const hasHomework = hasRequiredHomework || hasOptionalHomework || hasPendingTextHomework;
  const quickHomeworkFinished = quickHomeworkStatus === 'done' && quickHomeworkAvailableCount <= 0;
  const availableTimePlans = Array.isArray(quickHomeworkPlans) ? quickHomeworkPlans : [];
  const normalizedBudgetMinutes = Math.max(0, Math.round(Number(quickHomeworkBudgetMinutes) || 0));
  const normalizedPlannedCount = Math.max(0, Math.floor(Number(quickHomeworkPlannedCount) || 0));
  const isTimedQuickHomework = quickHomeworkMode === 'timed' && normalizedBudgetMinutes > 0;
  const hasActiveTimePlan = isTimedQuickHomework && ['solving', 'paused'].includes(quickHomeworkStatus);
  const isSelectedTimePlan = (plan) => {
    if (!hasActiveTimePlan) return false;
    const taskCount = Array.isArray(plan?.tasks) ? plan.tasks.length : 0;
    return Boolean(
      (quickHomeworkPlanKey && String(plan?.key || '') === String(quickHomeworkPlanKey))
      || (!quickHomeworkPlanKey
        && Number(plan?.budgetMinutes) === normalizedBudgetMinutes
        && taskCount === normalizedPlannedCount)
    );
  };
  const showTimePlanPicker = (quickHomeworkStatus === 'idle' || hasActiveTimePlan)
    && availableTimePlans.length > 0;
  const showQuickHomeworkLoading = quickHomeworkStatus === 'idle' && quickHomeworkLoading;
  const showQuickHomework = Boolean(
    (quickHomeworkAvailableCount > 0 && quickHomeworkCurrentTask)
    || (quickHomeworkFinished && quickHomeworkCompletedCount > 0)
  );
  const quickHomeworkTaskLabel = getQuickTaskLabel(quickHomeworkCurrentTask);
  const quickHomeworkConfig = (() => {
    if (quickHomeworkFinished) {
      return {
        eyebrow: 'Пять минут сработали',
        title: 'Готово — ты отлично разогнался!',
        hint: `В серии ${getSolvedTaskCountLabel(quickHomeworkCompletedCount)}. Все короткие задания из домашки уже решены.`,
        actionLabel: 'Выбрать ещё практику',
        previewLabel: '',
      };
    }
    if (quickHomeworkStatus === 'solving') {
      return {
        eyebrow: isTimedQuickHomework ? `План на ${normalizedBudgetMinutes} минут` : 'Один короткий шаг',
        title: 'Задание уже открыто',
        hint: isTimedQuickHomework
          ? `Выполнено ${quickHomeworkCompletedCount} из ${normalizedPlannedCount}. Вернись к текущему заданию.`
          : 'Вернись и доведи его до ответа — место сохранено.',
        actionLabel: 'Вернуться к заданию',
        previewLabel: 'Сейчас',
      };
    }
    if (quickHomeworkStatus === 'paused') {
      return {
        eyebrow: 'Ты уже в ритме',
        title: isTimedQuickHomework
          ? `Продолжить план на ${normalizedBudgetMinutes} минут?`
          : 'Ещё одно? Тоже около пяти минут.',
        hint: isTimedQuickHomework
          ? `Выполнено ${quickHomeworkCompletedCount} из ${normalizedPlannedCount}. Следующее задание плана ждёт.`
          : `В серии уже ${getSolvedTaskCountLabel(quickHomeworkCompletedCount)}. Следующий маленький шаг ждёт.`,
        actionLabel: isTimedQuickHomework ? 'Продолжить план' : 'Продолжить серию',
        previewLabel: 'Следующее',
      };
    }
    return {
      eyebrow: 'Лёгкий старт',
      title: 'Самое лёгкое задание из твоей домашки.',
      hint: '',
      actionLabel: 'Решить',
      previewLabel: '',
    };
  })();
  const fallbackPrimaryTitle = hasPendingTextHomework
    ? (String(homeworkEntry?.learningAssignmentTitle || '').trim() || 'Домашняя работа ждёт')
    : hasHomework ? getGoalLabel(pendingGoal) : 'Выберите короткую практику';
  const fallbackPrimaryHint = hasRequiredHomework
    ? `Обязательная часть: выполнено ${requiredCompletedCount} из ${requiredGoals.length} целей`
    : hasOptionalHomework
      ? 'Основная домашка готова — это дополнительное задание по желанию.'
      : hasPendingTextHomework
        ? (String(homeworkEntry?.learningGroupName || '').trim()
          ? `Общее задание мини-группы «${String(homeworkEntry.learningGroupName).trim()}» — откройте домашку ниже.`
          : 'Откройте домашку ниже и выполните пункты задания.')
      : 'Начните с одной темы — платформа сохранит место, где вы остановились.';
  const primaryTitle = showQuickHomework ? quickHomeworkConfig.title : fallbackPrimaryTitle;
  const primaryHint = showQuickHomework ? quickHomeworkConfig.hint : fallbackPrimaryHint;
  const primaryAction = showQuickHomework
    ? (quickHomeworkFinished
        ? onOpenPractice
        : (quickHomeworkStatus === 'idle' ? onStartQuickHomework : onResumeQuickHomework))
    : (hasHomework ? onContinueHomework : onOpenPractice);
  const primaryActionLabel = showQuickHomework
    ? quickHomeworkConfig.actionLabel
    : (hasHomework ? 'Продолжить' : 'Начать практику');

  const primaryCardClass = `student-today-overview__primary group relative w-full overflow-hidden rounded-[22px] border border-purple-300/80 bg-gradient-to-br from-purple-600 via-violet-600 to-fuchsia-600 p-4 text-left text-white shadow-[0_16px_32px_rgba(124,58,237,0.24)] transition duration-200 md:p-5 ${showQuickHomework ? 'student-today-overview__primary--quick-start' : ''} ${quickHomeworkFinished ? 'student-today-overview__primary--quick-finished' : ''}`;

  const renderTimePlanButton = (plan, planIndex) => {
    const taskCount = Array.isArray(plan.tasks) ? plan.tasks.length : 0;
    const taskCountLabel = getSolvedTaskCountLabel(taskCount);
    const planMinutes = Math.max(
      1,
      Math.ceil(Number(plan.displayMinutes ?? plan.budgetMinutes ?? plan.estimatedMinutes) || 0)
    );
    const isPrimaryPlan = planIndex === 0;
    const isSelectedPlan = isSelectedTimePlan(plan);
    const isUnavailablePlan = hasActiveTimePlan && !isSelectedPlan;
    const actionVerb = isSelectedPlan ? 'Продолжить' : 'Сделать';
    return (
      <button
        key={plan.key || `${planMinutes}-${taskCount}`}
        type="button"
        onClick={() => (isSelectedPlan ? onResumeQuickHomework?.() : onStartQuickHomeworkPlan?.(plan))}
        disabled={isUnavailablePlan}
        className={`student-today-overview__time-plan ${isPrimaryPlan ? 'student-today-overview__time-plan--primary' : ''} ${isSelectedPlan ? 'student-today-overview__time-plan--selected' : ''}`}
        aria-label={`${isSelectedPlan ? 'Продолжить' : 'Начать'} план примерно на ${planMinutes} минут: ${taskCountLabel}`}
      >
        <span className="student-today-overview__time-plan-icon" aria-hidden="true">
          <Play size={isPrimaryPlan ? 18 : 14} fill="currentColor" />
        </span>
        <span className="student-today-overview__time-plan-copy">
          <small>{isSelectedPlan ? 'Твой план' : (isPrimaryPlan ? 'Самый лёгкий старт' : 'Можно взять побольше')}</small>
          <strong>{actionVerb} {taskCountLabel} за ≈{planMinutes} минут</strong>
          <span>{taskCountLabel} — и можно отдыхать</span>
        </span>
        <ArrowRight size={isPrimaryPlan ? 20 : 16} aria-hidden="true" />
      </button>
    );
  };

  const renderPrimaryCardContent = (timePlanPicker = false) => (
    <>
      <div aria-hidden className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      {!timePlanPicker && showQuickHomework && !quickHomeworkFinished ? (
        <div className="student-today-overview__five-minute-visual" aria-hidden="true">
          <Clock3 size={22} />
          <strong>{isTimedQuickHomework ? normalizedBudgetMinutes : 1}</strong>
          <span>{isTimedQuickHomework ? 'минут' : 'задание'}</span>
        </div>
      ) : null}
      <div className={`relative flex h-full min-h-[154px] flex-col ${showQuickHomework && !quickHomeworkFinished && !timePlanPicker ? 'student-today-overview__primary-copy--quick' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/14 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]">
            {showQuickHomework ? <Clock3 size={12} /> : <Target size={12} />}
            {timePlanPicker ? 'Быстрый план' : (showQuickHomework
              ? quickHomeworkConfig.eyebrow
              : (hasRequiredHomework ? 'Главное на сегодня' : hasOptionalHomework ? 'Дополнительно' : 'Практика на сегодня'))}
          </span>
          {showQuickHomework && quickHomeworkCompletedCount > 0 ? (
            <span className="student-today-overview__quick-series"><Flame size={11} /> Серия: {quickHomeworkCompletedCount}</span>
          ) : null}
          {deadline ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${deadline.overdue ? 'bg-rose-100 text-rose-700' : deadline.urgent ? 'bg-amber-100 text-amber-800' : 'bg-white/16 text-white'}`}>
              <Clock3 size={11} />{deadline.relativeLabel}
            </span>
          ) : null}
        </div>
        {timePlanPicker ? (
          <h3
            id="quick-homework-time-plan-title"
            className="mt-4 max-w-2xl text-xl font-black leading-tight md:text-2xl"
          >
            Выбери свой темп решения домашки
          </h3>
        ) : (
          <strong className="mt-4 max-w-2xl text-xl font-black leading-tight md:text-2xl">
            {primaryTitle}
          </strong>
        )}
        {timePlanPicker ? (
          <>
            <div className="student-today-overview__time-plans mt-auto pt-4" aria-label="Выберите длительность домашней работы">
              {availableTimePlans.map(renderTimePlanButton)}
            </div>
          </>
        ) : (
          <>
            {primaryHint ? <span className="mt-1.5 text-sm text-purple-100">{primaryHint}</span> : null}
            {showQuickHomework && !quickHomeworkFinished && quickHomeworkCurrentTask ? (
              <span className="student-today-overview__quick-preview">
                {quickHomeworkConfig.previewLabel ? <small>{quickHomeworkConfig.previewLabel}</small> : null}
                <strong>{quickHomeworkTaskLabel}</strong>
                {quickHomeworkCurrentTask.taskTitle ? <span>{quickHomeworkCurrentTask.taskTitle}</span> : null}
              </span>
            ) : null}
            {deadline && !showQuickHomework ? <span className="mt-1 text-[11px] text-purple-100/80">Дедлайн: {deadline.dateLabel}</span> : null}
            <span className="student-today-overview__primary-action pointer-events-none mt-auto inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-purple-700 shadow-[0_10px_22px_rgba(49,46,129,0.24)] transition group-hover:-translate-y-0.5 group-hover:bg-purple-50">
              {showQuickHomework && !quickHomeworkFinished ? <Play size={15} fill="currentColor" /> : null}
              {primaryActionLabel}<ArrowRight size={16} />
            </span>
          </>
        )}
      </div>
    </>
  );

  const renderQuickHomeworkLoading = () => (
    <>
      <div aria-hidden className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      <div className="relative flex h-full min-h-[246px] flex-col" aria-live="polite" aria-busy="true">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/14 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]">
            <Clock3 size={12} />Быстрый план
          </span>
        </div>
        <h3 className="mt-4 max-w-2xl text-xl font-black leading-tight md:text-2xl">
          Собираем план домашки
        </h3>
        <span className="mt-1.5 text-sm text-purple-100">Подбираем задания и считаем примерное время…</span>
        <div className="student-today-overview__plan-loading mt-auto pt-4" aria-hidden="true">
          <span className="student-today-overview__plan-loading-primary" />
          <span />
          <span />
        </div>
      </div>
    </>
  );

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
        {showQuickHomeworkLoading ? (
          <section className={`${primaryCardClass} student-today-overview__primary--plan-loading`} aria-label="Собираем быстрый план домашней работы">
            {renderQuickHomeworkLoading()}
          </section>
        ) : showTimePlanPicker ? (
          <section className={primaryCardClass} aria-labelledby="quick-homework-time-plan-title">
            {renderPrimaryCardContent(true)}
          </section>
        ) : (
          <button
            type="button"
            onClick={primaryAction}
            aria-label={`${primaryActionLabel}: ${primaryTitle}`}
            className={`${primaryCardClass} cursor-pointer hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-[0_20px_42px_rgba(124,58,237,0.32)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-300/45`}
          >
            {renderPrimaryCardContent(false)}
          </button>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
          <QuickAction
            icon={Code2}
            eyebrow="Python"
            title="Продолжить курс"
            hint="Темы и практика ЕГЭ"
            onClick={onOpenPython}
            tone="python"
            actionLabel="Продолжить"
          />
          <QuickAction
            icon={PlayCircle}
            eyebrow="Урок"
            title="Открыть комнату"
            hint="Звонок, доска и код"
            onClick={onOpenLesson}
            tone="lesson"
          />
          {onOpenChat ? (
            <QuickAction
              icon={MessageSquare}
              eyebrow="Учитель"
              title={chatUnreadCount > 0 ? 'Есть новые сообщения' : 'Открыть чат'}
              hint={chatUnreadCount > 0 ? 'Ответьте, не теряя контекст' : 'Задать вопрос преподавателю'}
              badge={chatUnreadCount > 0 ? chatUnreadCount : null}
              onClick={onOpenChat}
              tone="chat"
              className="col-span-2 sm:col-span-1 lg:col-span-2"
            />
          ) : (
            <QuickAction
              icon={CheckCircle2}
              eyebrow="Практика"
              title="Выбрать тему"
              hint="Задания по текущим целям"
              onClick={onOpenPractice}
              tone="practice"
              className="col-span-2 sm:col-span-1 lg:col-span-2"
            />
          )}
        </div>
      </div>
    </section>
  );
};

export default StudentTodayOverview;
