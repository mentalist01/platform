import { useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, Clock3, RotateCcw } from 'lucide-react';

const toDayKey = (value = new Date(), calendarOffsetMinutes = null) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  const hasStoredOffset = calendarOffsetMinutes != null && String(calendarOffsetMinutes).trim() !== '';
  const offset = Number(calendarOffsetMinutes);
  if (hasStoredOffset && Number.isFinite(offset)) {
    const shifted = new Date(date.getTime() + (offset * 60 * 1000));
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatDayLabel = (value) => {
  const date = new Date(`${String(value || '').trim()}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).replace(' г.', '');
};

const findGoalView = (item, goalViews) => {
  const views = Array.isArray(goalViews) ? goalViews : [];
  const sourceGoalIndex = Number(item?.sourceGoalIndex);
  if (Number.isInteger(sourceGoalIndex) && sourceGoalIndex >= 0) {
    const indexedView = views.find((view) => Number(view?.sourceGoalIndex) === sourceGoalIndex);
    if (indexedView) return indexedView;
  }
  if (item?.type === 'mock-target' || item?.type === 'mock-goal') {
    const mockExamId = String(item?.mockExamId || item?.goal?.mockExamId || '').trim();
    return views.find((view) => view?.type === 'mock' && String(view?.mockExamId || '') === mockExamId) || null;
  }
  const taskNumber = Number(item?.taskNumber ?? item?.goal?.taskNumber);
  const levelId = String(item?.levelId || item?.goal?.levelId || '').trim();
  return views.find((view) => (
    view?.type === 'task'
    && Number(view?.taskNumber) === taskNumber
    && (!levelId || String(view?.levelId || '') === levelId)
  )) || null;
};

const resolveItemState = (item, goalViews, checklistItems) => {
  if (item?.type === 'text') {
    const checklist = Array.isArray(checklistItems) ? checklistItems : [];
    const byId = item?.checklistItemId
      ? checklist.find((entry) => String(entry?.id || '') === String(item.checklistItemId))
      : null;
    const byIndex = checklist[Number(item?.sourceIndex)];
    const matched = byId || byIndex || null;
    return {
      completed: matched ? Boolean(matched.completedAt) : Boolean(item?.completedAt),
      view: null,
    };
  }
  const view = findGoalView(item, goalViews);
  if (!view) return { completed: false, view: null };
  if (item?.type === 'task-target') {
    const target = (Array.isArray(view.targetStatus) ? view.targetStatus : []).find((entry) => (
      (item.questionId && String(entry?.questionId || '') === String(item.questionId))
      || (!item.questionId && Number(entry?.num) === Number(item?.questionNumber))
    ));
    if (!target && item.questionId) {
      return {
        completed: false,
        currentQuestionNumber: null,
        unavailable: true,
        view: null,
      };
    }
    return {
      completed: Boolean(target?.solved),
      currentQuestionNumber: Number(target?.num) || item?.questionNumber || null,
      view,
    };
  }
  if (item?.type === 'mock-target') {
    const target = (Array.isArray(view.targetStatus) ? view.targetStatus : []).find((entry) => (
      String(entry?.taskKey || '') === String(item?.taskKey || '')
    ));
    return { completed: Boolean(target?.solved), view };
  }
  return {
    completed: Number(view.totalCount) > 0 && Number(view.solvedCount) >= Number(view.totalCount),
    view,
  };
};

const getItemLabel = (item, mockExamById = {}) => {
  if (item?.type === 'text') return item.text || 'Дополнительный пункт';
  if (item?.type === 'task-target') {
    if (item.unavailable) return `Задание ${item.taskNumber} · удалённый номер`;
    return `Задание ${item.taskNumber} · номер ${item.currentQuestionNumber || item.questionNumber || '—'}`;
  }
  if (item?.type === 'task-goal') return `Задание ${item?.goal?.taskNumber || ''} целиком`.trim();
  if (item?.type === 'mock-target') {
    const title = mockExamById?.[String(item.mockExamId || '')]?.title || 'Пробник';
    return `${title} · задание ${item.taskKey}`;
  }
  if (item?.type === 'mock-goal') {
    return mockExamById?.[String(item?.mockExamId || item?.goal?.mockExamId || '')]?.title || 'Пробник целиком';
  }
  return 'Часть домашней работы';
};

const HomeworkDayPlan = ({
  entry,
  goalViews = [],
  checklistItems = [],
  mockExamById = {},
  role = 'student',
  onOpenTask,
  onOpenMockGoal,
}) => {
  const storedPlan = entry?.dayPlan && typeof entry.dayPlan === 'object' ? entry.dayPlan : null;
  const days = Array.isArray(storedPlan?.dayPlan) ? storedPlan.dayPlan : [];
  const todayKey = toDayKey(new Date(), storedPlan?.calendarOffsetMinutes);
  const enrichedDays = days.map((day) => {
    const plannedGoals = Array.isArray(day?.goals) ? day.goals : [];
    const items = (Array.isArray(day?.items) ? day.items : []).map((item) => {
      const plannedGoal = plannedGoals.find((goal) => (
        Number(goal?.sourceGoalIndex) === Number(item?.sourceGoalIndex)
      ));
      return {
        ...item,
        dayTargetTaskKeys: Array.isArray(plannedGoal?.targetTaskKeys)
          ? plannedGoal.targetTaskKeys
          : [],
        ...resolveItemState(item, goalViews, checklistItems),
      };
    });
    const completedCount = items.filter((item) => item.completed).length;
    return {
      ...day,
      items,
      completedCount,
      remainingCount: Math.max(0, items.length - completedCount),
      completed: items.length > 0 && completedCount >= items.length,
    };
  });
  const relevantDay = enrichedDays.find((day) => day.date === todayKey)
    || [...enrichedDays].reverse().find((day) => String(day.date || '') < todayKey && !day.completed)
    || enrichedDays.find((day) => String(day.date || '') > todayKey)
    || enrichedDays[enrichedDays.length - 1]
    || null;
  const entryKey = String(entry?.id || storedPlan?.generatedAt || '');
  const [selection, setSelection] = useState(() => ({
    entryKey,
    date: relevantDay?.date || '',
  }));
  const selectedDate = selection.entryKey === entryKey
    && enrichedDays.some((day) => day.date === selection.date)
    ? selection.date
    : relevantDay?.date || '';

  if (!storedPlan?.enabled || enrichedDays.length === 0) return null;

  const selectedDay = enrichedDays.find((day) => day.date === selectedDate) || relevantDay || enrichedDays[0];
  const overdueItems = enrichedDays
    .filter((day) => String(day.date || '') < todayKey)
    .flatMap((day) => day.items.filter((item) => !item.completed).map((item) => ({ ...item, plannedDate: day.date })));
  const selectedPending = selectedDay?.items?.filter((item) => !item.completed) || [];
  const firstActionable = overdueItems.find((item) => item.view)
    || selectedPending.find((item) => item.view)
    || null;

  const openItem = (item) => {
    if (!item?.view) return;
    if (item.view.type === 'mock') {
      const scopedTaskKeys = item?.type === 'mock-target'
        ? (item.dayTargetTaskKeys?.length > 0 ? item.dayTargetTaskKeys : [item.taskKey].filter(Boolean))
        : item.view.targetTaskKeys;
      onOpenMockGoal?.(item.view.mockExamId, item?.taskKey || scopedTaskKeys?.[0] || null, {
        fromHomework: true,
        mode: item.view.mode,
        targetTaskKeys: scopedTaskKeys,
      });
      return;
    }
    const targetNumbers = item?.type === 'task-target' && (item.currentQuestionNumber || item.questionNumber)
      ? [item.currentQuestionNumber || item.questionNumber]
      : item.view.targetNumbers;
    onOpenTask?.(item.view.taskNumber, item.view.levelId, targetNumbers);
  };

  return (
    <section className="student-homework-day-plan rounded-[20px] border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-purple-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
            <CalendarDays size={17} />
          </span>
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-500">План по дням</span>
            <strong className="mt-0.5 block text-sm text-slate-950">
              {role === 'student' ? 'Что делать сегодня' : `${enrichedDays.length} учебных дней`}
            </strong>
          </div>
        </div>
        {overdueItems.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">
            <RotateCcw size={12} /> Долг: {overdueItems.length}
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {enrichedDays.map((day) => {
          const active = day.date === selectedDay?.date;
          const isToday = day.date === todayKey;
          const isPast = day.date < todayKey;
          return (
            <button
              key={day.id || day.date}
              type="button"
              onClick={() => setSelection({ entryKey, date: day.date })}
              className={`min-w-[94px] shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                active
                  ? 'border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : day.completed
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : isPast
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-indigo-100 bg-white text-slate-700'
              }`}
            >
              <span className="block text-[9px] font-black uppercase tracking-wide">{isToday ? 'Сегодня' : formatDayLabel(day.date)}</span>
              <span className="mt-1 flex items-center gap-1 text-[11px] font-black">
                {day.completed ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
                {`${day.completedCount}/${day.items.length}`}
              </span>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-white/90 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-xs capitalize text-slate-900">{formatDayLabel(selectedDay.date)}</strong>
            <span className="text-[10px] font-bold text-slate-500">
              {selectedDay.completed ? 'План выполнен' : `Осталось: ${selectedDay.remainingCount}`}
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {selectedDay.items.map((item) => (
              <button
                key={item.itemId}
                type="button"
                disabled={!item.view}
                onClick={() => openItem(item)}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left ${
                  item.completed
                    ? 'border-emerald-100 bg-emerald-50/70 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-700'
                } disabled:cursor-default`}
              >
                <span className={`inline-grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                  item.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'
                }`}>
                  {item.completed ? <CheckCircle2 size={12} /> : null}
                </span>
                <span className={`min-w-0 flex-1 text-xs font-bold ${item.completed ? 'line-through opacity-70' : ''}`}>{getItemLabel(item, mockExamById)}</span>
                {item.view ? <ChevronRight size={14} className="shrink-0 opacity-50" /> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {role === 'student' && firstActionable && (
        <button
          type="button"
          onClick={() => openItem(firstActionable)}
          className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black text-white shadow-md shadow-indigo-500/20 hover:bg-indigo-700 sm:w-auto"
        >
          Начать по плану <ChevronRight size={15} />
        </button>
      )}
    </section>
  );
};

export default HomeworkDayPlan;
