import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { adaptHomeworkDayPlanForToday } from '../utils/homeworkDayPlan';

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
      checklistItem: matched,
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

const pluralize = (value, one, few, many) => {
  const count = Math.abs(Number(value) || 0);
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

const formatItemCount = (value) => (
  `${value} ${pluralize(value, 'задание', 'задания', 'заданий')}`
);

const formatDayParts = (value) => {
  const date = new Date(`${String(value || '').trim()}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { weekday: '', date: String(value || '') };
  }
  return {
    weekday: date.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', ''),
    date: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(' г.', ''),
  };
};

const getItemGroupKey = (item, index) => {
  if (item?.type === 'task-target') {
    return `task:${item.sourceGoalIndex}:${item.taskNumber}:${item.levelId || ''}`;
  }
  if (item?.type === 'mock-target') {
    return `mock:${item.sourceGoalIndex}:${item.mockExamId || ''}`;
  }
  return `item:${item?.itemId || index}`;
};

const buildItemGroups = (items, mockExamById) => {
  const groups = [];
  const groupByKey = new Map();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const key = getItemGroupKey(item, index);
    let group = groupByKey.get(key);
    if (!group) {
      group = { key, type: item?.type || 'unknown', items: [] };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  });
  return groups.map((group) => {
    const pendingItems = group.items.filter((item) => !item.completed && !item.unavailable);
    const availableItems = group.items.filter((item) => !item.unavailable);
    const completedCount = availableItems.filter((item) => item.completed).length;
    const firstItem = group.items[0] || {};
    const actionableItem = pendingItems.find((item) => item.view)
      || availableItems.find((item) => item.view)
      || null;
    const completed = availableItems.length === 0
      ? group.items.length > 0
      : completedCount >= availableItems.length;
    let title = getItemLabel(firstItem, mockExamById);
    if (group.type === 'task-target') title = `Задание ${firstItem.taskNumber || ''}`.trim();
    if (group.type === 'mock-target') {
      title = mockExamById?.[String(firstItem.mockExamId || '')]?.title || 'Пробник';
    }
    const targets = group.items.map((item) => {
      if (group.type === 'task-target') {
        const number = item.currentQuestionNumber || item.questionNumber;
        return {
          key: item.itemId || item.questionId || number,
          label: number ? `№${number}` : 'Недоступно',
          completed: Boolean(item.completed),
          unavailable: Boolean(item.unavailable),
        };
      }
      if (group.type === 'mock-target') {
        return {
          key: item.itemId || item.taskKey,
          label: item.taskKey ? `№${item.taskKey}` : 'Задание',
          completed: Boolean(item.completed),
          unavailable: Boolean(item.unavailable),
        };
      }
      return null;
    }).filter(Boolean);
    return {
      ...group,
      title,
      targets,
      actionableItem,
      completed,
      completedCount,
      totalCount: availableItems.length,
      unavailable: availableItems.length === 0 && group.items.length > 0,
      checklistItem: firstItem.checklistItem || null,
      movedCount: group.items.filter((item) => Boolean(item?.movedFromDate)).length,
    };
  });
};

const HomeworkDayPlan = ({
  entry,
  goalViews = [],
  checklistItems = [],
  mockExamById = {},
  role = 'student',
  onOpenTask,
  onOpenMockGoal,
  onToggleChecklistItem,
  isChecklistItemBusy,
}) => {
  const storedPlan = entry?.dayPlan && typeof entry.dayPlan === 'object' ? entry.dayPlan : null;
  const days = Array.isArray(storedPlan?.dayPlan) ? storedPlan.dayPlan : [];
  const todayKey = toDayKey(new Date(), storedPlan?.calendarOffsetMinutes);
  const sourceEnrichedDays = days.map((day) => {
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
    const availableItems = items.filter((item) => !item.unavailable);
    const completedCount = availableItems.filter((item) => item.completed).length;
    const remainingCount = availableItems.filter((item) => !item.completed).length;
    return {
      ...day,
      items,
      completedCount,
      remainingCount,
      totalCount: availableItems.length,
      completed: items.length > 0 && remainingCount === 0,
    };
  });
  const planAdaptation = adaptHomeworkDayPlanForToday({
    days: sourceEnrichedDays,
    todayKey,
  });
  const enrichedDays = planAdaptation.days;
  const adaptationMetadata = planAdaptation.metadata;
  const adaptationSourceLabel = adaptationMetadata.sourceDayCount === 1
    ? 'пропущенного дня'
    : 'пропущенных дней';
  const adaptationActionLabel = adaptationMetadata.movedItemCount === 1
    ? 'перенесено'
    : 'распределены';
  const adaptationDestinationLabel = adaptationMetadata.movedItemCount === 1
    ? 'в ближайший оставшийся день'
    : 'по оставшимся дням';
  const todayDay = enrichedDays.find((day) => day.date === todayKey) || null;
  const oldestOverdueDay = enrichedDays.find((day) => (
    String(day.date || '') < todayKey && day.remainingCount > 0
  )) || null;
  const nextPendingDay = enrichedDays.find((day) => (
    String(day.date || '') > todayKey && day.remainingCount > 0
  )) || null;
  const relevantDay = (todayDay?.remainingCount > 0 ? todayDay : null)
    || oldestOverdueDay
    || nextPendingDay
    || todayDay
    || enrichedDays[enrichedDays.length - 1]
    || null;
  const entryKey = String(entry?.id || storedPlan?.generatedAt || '');
  const planVersionKey = String(storedPlan?.generatedAt || storedPlan?.version || (
    enrichedDays.map((day) => day.id || day.date).join('|')
  ));
  const planKey = `${entryKey}:${planVersionKey}`;
  const domEntryKey = entryKey.replace(/[^a-zA-Z0-9_-]/g, '-') || 'homework';
  const [selection, setSelection] = useState(() => ({
    planKey: '',
    date: '',
    manual: false,
  }));
  const hasManualSelection = selection.planKey === planKey
    && selection.manual
    && enrichedDays.some((day) => day.date === selection.date)
  const selectedDate = hasManualSelection ? selection.date : relevantDay?.date || '';
  const timelineRef = useRef(null);
  const lastTimelineEntryKeyRef = useRef('');

  useEffect(() => {
    const timeline = timelineRef.current;
    const activeDay = timeline?.querySelector('[aria-selected="true"]');
    if (!timeline || !activeDay || timeline.scrollWidth <= timeline.clientWidth + 1) return;
    const isInitialPositioning = lastTimelineEntryKeyRef.current !== planKey;
    lastTimelineEntryKeyRef.current = planKey;
    const timelineRect = timeline.getBoundingClientRect();
    const activeRect = activeDay.getBoundingClientRect();
    const targetLeft = timeline.scrollLeft
      + (activeRect.left - timelineRect.left)
      - ((timeline.clientWidth - activeRect.width) / 2);
    const nextLeft = Math.max(0, Math.min(
      timeline.scrollWidth - timeline.clientWidth,
      targetLeft
    ));
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (typeof timeline.scrollTo === 'function') {
      timeline.scrollTo({
        left: nextLeft,
        behavior: reduceMotion || isInitialPositioning ? 'auto' : 'smooth',
      });
    } else {
      timeline.scrollLeft = nextLeft;
    }
  }, [planKey, selectedDate]);

  if (!storedPlan?.enabled || enrichedDays.length === 0) return null;

  const selectedDay = enrichedDays.find((day) => day.date === selectedDate) || relevantDay || enrichedDays[0];
  const overdueItems = enrichedDays
    .filter((day) => String(day.date || '') < todayKey)
    .flatMap((day) => day.items
      .filter((item) => !item.completed && !item.unavailable)
      .map((item) => ({ ...item, plannedDate: day.date })));
  const selectedGroups = buildItemGroups(selectedDay?.items, mockExamById);
  const canOpenGoalView = (view) => (
    role === 'student'
    && Boolean(view)
    && (
      (view.type === 'mock' && typeof onOpenMockGoal === 'function')
      || (view.type !== 'mock' && typeof onOpenTask === 'function')
    )
  );
  const selectedActionableGroup = selectedGroups.find((group) => (
    !group.completed && canOpenGoalView(group.actionableItem?.view)
  )) || null;
  const planCompleted = enrichedDays.every((day) => day.remainingCount === 0);
  const selectedIsRelevant = selectedDay?.date === relevantDay?.date;
  const relevantDayBadge = relevantDay?.date === oldestOverdueDay?.date
    ? 'Сначала'
    : 'Ближайший';
  const selectedIsToday = selectedDay?.date === todayKey;
  const selectedIsPast = String(selectedDay?.date || '') < todayKey;
  const selectedWasRescheduled = Number(selectedDay?.rescheduledOutCount) > 0
    && Number(selectedDay?.remainingCount) === 0;
  const selectedStatus = selectedWasRescheduled
    ? 'rescheduled'
    : selectedDay?.completed
      ? 'complete'
      : selectedIsPast
        ? 'overdue'
        : selectedIsToday
          ? 'today'
          : 'future';
  const selectedContext = planCompleted
    ? 'Всё готово'
    : selectedWasRescheduled
      ? 'Перенесено в новый план'
      : selectedDay?.completed
        ? 'День выполнен'
        : selectedIsPast
          ? 'Просрочено'
          : selectedIsToday
            ? 'Сегодня'
            : 'План на день';
  const selectedTitle = planCompleted
    ? 'Домашняя работа выполнена'
    : formatDayLabel(selectedDay?.date);
  const selectedRemainingLabel = selectedWasRescheduled
    ? 'План обновлён'
    : selectedDay?.completed
      ? 'Готово'
      : `Осталось: ${selectedDay?.remainingCount || 0}`;
  const nextDayAfterSelection = enrichedDays.find((day) => (
    String(day.date || '') > String(selectedDay?.date || '') && day.remainingCount > 0
  )) || enrichedDays.find((day) => day.date !== selectedDay?.date && day.remainingCount > 0) || null;

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

  const openGroup = (group) => {
    if (!group?.actionableItem?.view) return;
    const actionableItems = group.items.filter((item) => !item.completed && !item.unavailable);
    const fallbackItems = group.items.filter((item) => !item.unavailable);
    const scopedItems = actionableItems.length > 0 ? actionableItems : fallbackItems;
    if (group.type === 'task-target') {
      const item = group.actionableItem;
      const targetNumbers = [...new Set(scopedItems
        .map((entryItem) => Number(entryItem.currentQuestionNumber || entryItem.questionNumber))
        .filter((number) => Number.isFinite(number) && number > 0))];
      onOpenTask?.(item.view.taskNumber, item.view.levelId, targetNumbers);
      return;
    }
    if (group.type === 'mock-target') {
      const item = group.actionableItem;
      const scopedTaskKeys = [...new Set(scopedItems.map((entryItem) => entryItem.taskKey).filter(Boolean))];
      onOpenMockGoal?.(item.view.mockExamId, scopedTaskKeys[0] || null, {
        fromHomework: true,
        mode: item.view.mode,
        targetTaskKeys: scopedTaskKeys,
      });
      return;
    }
    openItem(group.actionableItem);
  };

  const selectDay = (date) => setSelection({ planKey, date, manual: true });
  const selectRelevantDay = () => setSelection({ planKey, date: '', manual: false });
  const handlePrimaryAction = () => {
    if (selectedActionableGroup) {
      openGroup(selectedActionableGroup);
      return;
    }
    if (selectedDay?.remainingCount === 0 && nextDayAfterSelection) selectDay(nextDayAfterSelection.date);
  };
  const primaryActionLabel = selectedActionableGroup
    ? selectedStatus === 'overdue'
      ? 'Закрыть долг'
      : selectedStatus === 'future'
        ? 'Начать заранее'
        : 'Начать по плану'
    : selectedDay?.remainingCount === 0 && nextDayAfterSelection
      ? 'К следующему дню'
      : '';
  const dayPanelId = `homework-day-panel-${domEntryKey}`;
  const selectedDayIndex = enrichedDays.findIndex((day) => day.date === selectedDay?.date);
  const selectedDayTabId = `homework-day-tab-${domEntryKey}-${Math.max(0, selectedDayIndex)}`;
  const handleDayKeyDown = (event, dayIndex) => {
    const keyActions = {
      ArrowRight: (dayIndex + 1) % enrichedDays.length,
      ArrowLeft: (dayIndex - 1 + enrichedDays.length) % enrichedDays.length,
      Home: 0,
      End: enrichedDays.length - 1,
    };
    const nextDayIndex = keyActions[event.key];
    if (!Number.isInteger(nextDayIndex)) return;
    event.preventDefault();
    selectDay(enrichedDays[nextDayIndex].date);
    window.requestAnimationFrame(() => {
      timelineRef.current
        ?.querySelector(`#homework-day-tab-${domEntryKey}-${nextDayIndex}`)
        ?.focus();
    });
  };

  return (
    <section className="student-homework-day-plan" aria-labelledby={`homework-day-plan-title-${domEntryKey}`}>
      <header className="student-homework-day-plan__header">
        <div className="student-homework-day-plan__identity">
          <span className="student-homework-day-plan__icon" aria-hidden>
            <CalendarDays size={18} />
          </span>
          <div className="student-homework-day-plan__heading">
            <span>План по дням</span>
            <h3 id={`homework-day-plan-title-${domEntryKey}`}>
              {role === 'student' ? 'Что делать дальше' : `${enrichedDays.length} учебных дней`}
            </h3>
          </div>
        </div>
      </header>

      {overdueItems.length > 0 && selectedStatus !== 'overdue' && oldestOverdueDay && (
        <button
          type="button"
          className="student-homework-day-plan__debt"
          onClick={() => selectDay(oldestOverdueDay.date)}
        >
          <span className="student-homework-day-plan__debt-icon"><RotateCcw size={15} /></span>
          <span>
            <strong>{formatItemCount(overdueItems.length)} осталось с прошлых дней</strong>
          </span>
          <span className="student-homework-day-plan__debt-action">Показать <ChevronRight size={14} /></span>
        </button>
      )}

      {adaptationMetadata.movedItemCount > 0 && (
        <div className="student-homework-day-plan__adapted" role="status">
          <span className="student-homework-day-plan__adapted-icon" aria-hidden>
            <Sparkles size={15} />
          </span>
          <span>
            <strong>План подстроен под пропуск</strong>
            <small>
              {formatItemCount(adaptationMetadata.movedItemCount)} из {adaptationSourceLabel} {adaptationActionLabel} {adaptationDestinationLabel}.
            </small>
          </span>
        </div>
      )}

      <div className="student-homework-day-plan__days">
        <div className="student-homework-day-plan__days-heading">
          <strong>Дни плана</strong>
          {!selectedIsRelevant && relevantDay && (
            <button
              type="button"
              className="student-homework-day-plan__return"
              onClick={selectRelevantDay}
            >
              <CalendarDays size={13} />
              К ближайшему
            </button>
          )}
        </div>
        <div
          ref={timelineRef}
          className="student-homework-day-plan__timeline"
          role="tablist"
          aria-label="Дни выполнения домашней работы"
        >
          {enrichedDays.map((day, dayIndex) => {
            const active = day.date === selectedDay?.date;
            const isToday = day.date === todayKey;
            const isPast = day.date < todayKey;
            const wasRescheduled = Number(day.rescheduledOutCount) > 0 && day.remainingCount === 0;
            const dayStatus = wasRescheduled
              ? 'rescheduled'
              : day.completed
                ? 'complete'
                : isPast
                  ? 'overdue'
                  : isToday
                    ? 'today'
                    : 'future';
            const dayParts = formatDayParts(day.date);
            const isRelevant = day.date === relevantDay?.date;
            const statusText = wasRescheduled
              ? `Перенесено ${day.rescheduledOutCount}`
              : day.completed
                ? `${day.completedCount} из ${day.totalCount} · готово`
                : dayStatus === 'overdue'
                  ? `Осталось ${day.remainingCount}`
                  : `${day.completedCount} из ${day.totalCount}`;
            return (
              <button
                key={day.id || day.date}
                id={`homework-day-tab-${domEntryKey}-${dayIndex}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-current={isToday ? 'date' : undefined}
                aria-controls={dayPanelId}
                aria-label={`${isToday ? 'Сегодня' : formatDayLabel(day.date)}: ${statusText}${isRelevant ? '. Рекомендуемый день' : ''}`}
                tabIndex={active ? 0 : -1}
                onClick={() => selectDay(day.date)}
                onKeyDown={(event) => handleDayKeyDown(event, dayIndex)}
                className={`student-homework-day-plan__day student-homework-day-plan__day--${dayStatus}${active ? ' student-homework-day-plan__day--active' : ''}`}
              >
                <span className="student-homework-day-plan__day-topline">
                  <span>{isToday ? 'Сегодня' : dayParts.weekday}</span>
                  {isRelevant && !isToday && !planCompleted && (
                    <span className="student-homework-day-plan__day-recommended">{relevantDayBadge}</span>
                  )}
                </span>
                <strong>{dayParts.date}</strong>
                <small>
                  {wasRescheduled
                    ? <RotateCcw size={12} />
                    : day.completed
                      ? <CheckCircle2 size={12} />
                      : dayStatus === 'overdue'
                        ? <RotateCcw size={12} />
                        : <Clock3 size={12} />}
                  <span>{statusText}</span>
                </small>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div
          key={`${entryKey}:${selectedDay.date}`}
          id={dayPanelId}
          role="tabpanel"
          aria-labelledby={selectedDayTabId}
          className={`student-homework-day-plan__focus student-homework-day-plan__focus--${selectedStatus}`}
        >
          <div className="student-homework-day-plan__focus-heading">
            <div className="student-homework-day-plan__focus-copy">
              <h4>{selectedTitle}</h4>
              <span className="student-homework-day-plan__context">
                {planCompleted
                  ? <Sparkles size={13} />
                  : selectedStatus === 'overdue' || selectedStatus === 'rescheduled'
                    ? <RotateCcw size={13} />
                    : <Clock3 size={13} />}
                {selectedContext}
              </span>
            </div>
            <span className="student-homework-day-plan__remaining">{selectedRemainingLabel}</span>
          </div>

          <div className="student-homework-day-plan__groups">
            {selectedGroups.map((group, groupIndex) => {
              const isTextGroup = group.type === 'text';
              const canToggleText = isTextGroup
                && role === 'student'
                && Boolean(group.checklistItem)
                && typeof onToggleChecklistItem === 'function';
              const textBusy = canToggleText && Boolean(isChecklistItemBusy?.(group.checklistItem));
              const canOpen = !group.completed && canOpenGoalView(group.actionableItem?.view);
              const canInteract = canOpen || canToggleText;
              const movedLabel = group.movedCount > 0
                ? `${group.movedCount} с прошлых дней`
                : '';
              const useFullWidth = selectedGroups.length === 1
                || group.targets.length > 5
                || String(group.title || '').length > 72;
              const groupProgressLabel = group.totalCount > 1
                ? `Выполнено ${group.completedCount} из ${group.totalCount}.`
                : group.completed
                  ? 'Выполнено.'
                  : 'Не выполнено.';
              const rowClassName = `student-homework-day-plan__group student-homework-day-plan__group--${isTextGroup ? 'text' : 'goal'}${
                group.completed ? ' student-homework-day-plan__group--complete' : ''
              }${group.unavailable ? ' student-homework-day-plan__group--unavailable' : ''}${
                useFullWidth ? ' student-homework-day-plan__group--wide' : ''
              }${canInteract ? ' student-homework-day-plan__group--interactive' : ''}`;
              const rowStyle = {
                '--student-day-plan-group-delay': `${35 + (Math.min(groupIndex, 4) * 32)}ms`,
              };
              const rowContent = (
                <>
                  <span className="student-homework-day-plan__group-state" aria-hidden>
                    {group.unavailable
                      ? <AlertTriangle size={16} />
                      : group.completed
                        ? <Check size={13} strokeWidth={3} />
                        : null}
                  </span>
                  <span className="student-homework-day-plan__group-content">
                    <span className="student-homework-day-plan__group-title">
                      <strong>{group.title}</strong>
                      {group.totalCount > 1 && (
                        <small>{group.completed ? 'Готово' : `${group.completedCount} из ${group.totalCount}`}</small>
                      )}
                    </span>
                    {movedLabel && (
                      <span className="student-homework-day-plan__group-origin">
                        <RotateCcw size={11} />
                        {movedLabel}
                      </span>
                    )}
                    {group.targets.length > 0 && (
                      <span className="student-homework-day-plan__targets">
                        {group.targets.map((target) => (
                          <span
                            key={target.key}
                            className={`${target.completed ? 'is-complete' : ''}${target.unavailable ? ' is-unavailable' : ''}`}
                            aria-label={`${target.label}: ${target.unavailable ? 'недоступно' : target.completed ? 'выполнено' : 'не выполнено'}`}
                          >
                            {target.unavailable
                              ? <AlertTriangle size={11} />
                              : target.completed
                                ? <Check size={11} strokeWidth={3} />
                                : <Circle size={12} />}
                            {target.label}
                          </span>
                        ))}
                      </span>
                    )}
                    {group.unavailable && <small className="student-homework-day-plan__warning">Номер больше недоступен и не мешает завершить день.</small>}
                  </span>
                  {canInteract && <ChevronRight size={16} className="student-homework-day-plan__group-arrow" />}
                </>
              );
              if (!canInteract) {
                return <div key={group.key} className={rowClassName} style={rowStyle}>{rowContent}</div>;
              }
              return (
                <button
                  key={group.key}
                  type="button"
                  className={rowClassName}
                  style={rowStyle}
                  disabled={textBusy}
                  aria-pressed={canToggleText ? group.completed : undefined}
                  aria-label={canToggleText
                    ? `${group.completed ? 'Вернуть в работу' : 'Отметить выполненным'}: ${group.title}. ${groupProgressLabel}`
                    : `Открыть: ${group.title}. ${groupProgressLabel}`}
                  onClick={() => {
                    if (canToggleText) {
                      onToggleChecklistItem(group.checklistItem);
                    } else {
                      openGroup(group);
                    }
                  }}
                >
                  {rowContent}
                </button>
              );
            })}
          </div>

          {selectedGroups.length === 0 && selectedWasRescheduled && (
            <div className="student-homework-day-plan__rescheduled-empty">
              <RotateCcw size={15} />
              Незавершённые задания уже перенесены в оставшиеся дни плана.
            </div>
          )}

          {primaryActionLabel && (
            <button
              type="button"
              onClick={handlePrimaryAction}
              className="student-homework-day-plan__cta student-homework-day-plan__cta--footer"
            >
              <span>
                {primaryActionLabel}
                <small>{selectedActionableGroup?.title || formatDayLabel(nextDayAfterSelection?.date)}</small>
              </span>
              <ChevronRight size={17} />
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default HomeworkDayPlan;
