import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pin,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';

import { api, resolveAuthenticatedUploadsUrl } from '../services/api';
import { formatHomeworkQuestionRanges } from '../utils/homeworkComposer';
import {
  HOMEWORK_ASSIGNMENT_TIER_OPTIONAL,
  normalizeHomeworkAssignmentTier,
} from '../utils/homeworkAssignmentTier';
import { buildHomeworkDayPlan } from '../utils/homeworkDayPlan';
import {
  buildHomeworkDurationEstimate,
  formatHomeworkDurationEstimate,
} from '../utils/homeworkDurationEstimate';
import {
  HOMEWORK_DUE_AT_MODE_MANUAL,
  HOMEWORK_DUE_AT_MODE_NEXT_LESSON,
} from '../utils/homeworkDueAt';

const EMPTY_GOALS = [];
const QUESTION_SELECTION_CLICK_SUPPRESS_MS = 450;
const HOMEWORK_PLAN_WEEKDAYS = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 7, label: 'Вс' },
];

const formatPlanDate = (value) => {
  const date = new Date(`${String(value || '').trim()}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).replace(' г.', '');
};

const addCalendarDaysToKey = (value, amount) => {
  const date = new Date(`${String(value || '').trim()}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + amount);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const describePlanItem = (item) => {
  if (item?.type === 'text') return item.text || 'Дополнительный пункт';
  if (item?.type === 'task-target') {
    return `Задание ${item.taskNumber} · №${item.questionNumber || '—'}`;
  }
  if (item?.type === 'mock-target') return `Пробник · №${item.taskKey}`;
  if (item?.type === 'mock-goal') return 'Пробник целиком';
  if (item?.type === 'task-goal') return `Задание ${item?.goal?.taskNumber || ''} целиком`.trim();
  return 'Часть домашней работы';
};

const asPositiveIntegers = (values) => (
  Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => Math.trunc(Number(value)))
      .filter((value) => Number.isFinite(value) && value > 0)
  )).sort((left, right) => left - right)
);

const getAttachmentUrl = (attachment) => {
  const raw = String(
    attachment?.url
    || (attachment?.storageName ? `/uploads/${attachment.storageName}` : '')
    || ''
  ).trim();
  return raw ? String(resolveAuthenticatedUploadsUrl(raw) || raw) : '';
};

const getQuestionLabel = (question, fallback) => {
  const rawLabel = question?.label;
  const label = String(
    typeof rawLabel === 'string'
      ? rawLabel
      : rawLabel?.text || rawLabel?.label || ''
  ).trim();
  return label || fallback;
};

const QuestionCondition = ({ question, label, onExpandImage }) => {
  const screenshots = (Array.isArray(question?.screenshots) ? question.screenshots : [])
    .map((item) => ({ ...item, resolvedUrl: getAttachmentUrl(item) }))
    .filter((item) => item.resolvedUrl);
  const files = (Array.isArray(question?.files) ? question.files : [])
    .map((item) => ({ ...item, resolvedUrl: getAttachmentUrl(item) }))
    .filter((item) => item.resolvedUrl);
  const questionText = String(question?.question || '').trim();

  return (
    <div className="space-y-4">
      {screenshots.length > 0 && (
        <div className={`grid gap-3 ${screenshots.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {screenshots.map((image, index) => (
            <button
              key={image.id || image.storageName || image.resolvedUrl || index}
              type="button"
              onClick={() => onExpandImage?.(image)}
              className="group relative overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm transition hover:border-purple-300 hover:shadow-md"
            >
              <img
                src={image.resolvedUrl}
                alt={image.name || `${label}, изображение ${index + 1}`}
                className="h-auto max-h-[330px] w-full object-contain"
                loading="lazy"
              />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-950/75 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100">
                <Eye size={11} /> Увеличить
              </span>
            </button>
          ))}
        </div>
      )}

      {questionText && (
        <div className="whitespace-pre-wrap rounded-2xl border border-slate-200/80 bg-[rgb(var(--surface))] px-4 py-3.5 text-sm font-medium leading-7 text-[rgb(var(--ink))] shadow-sm sm:text-base">
          {questionText}
        </div>
      )}

      {!questionText && screenshots.length === 0 && (
        <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-slate-300 bg-[rgb(var(--surface-soft))] px-6 text-center text-sm text-[rgb(var(--ink-soft))]">
          <div>
            <ImageIcon size={26} className="mx-auto mb-2 opacity-45" />
            У этого задания нет текстового условия или изображения.
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[rgb(var(--ink-soft))]">Файлы задания</div>
          {files.map((file, index) => (
            <a
              key={file.id || file.storageName || file.resolvedUrl || index}
              href={file.resolvedUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-3 py-2 text-sm font-semibold text-[rgb(var(--ink))] transition hover:border-purple-300 hover:text-purple-600"
            >
              <span className="min-w-0 truncate">{file.name || `Файл ${index + 1}`}</span>
              <Download size={15} className="shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const TeacherHomeworkComposer = ({
  open,
  editing = false,
  preparing = false,
  preparationError = '',
  saving = false,
  draftSaving = false,
  discarding = false,
  draftRestoredAt = '',
  studentId = '',
  studentLabel = '',
  targetType = 'student',
  form,
  carryoverSummary = null,
  taskOptions = [],
  pythonTaskOptions = [],
  mockExams = [],
  mockExamsLoading = false,
  testsDb = {},
  levels = {},
  pythonLevelId = 'python',
  goalTypeTask = 'task',
  goalTypeMock = 'mock',
  normalizeGoalType,
  normalizeTaskNumber,
  isPythonTaskNumber,
  getTaskDisplayNumber,
  formatTaskNumber,
  getPythonTaskInfo,
  normalizeMockExamId,
  parseTargetInput,
  onChangeForm,
  onUpdateGoal,
  onAddGoal,
  onRemoveGoal,
  onClose,
  onSaveDraft,
  onSave,
}) => {
  const isGroupTarget = targetType === 'group';
  const goals = Array.isArray(form?.goals) ? form.goals : EMPTY_GOALS;
  const [activeGoalIndex, setActiveGoalIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [expandedImage, setExpandedImage] = useState(null);
  const [mobilePane, setMobilePane] = useState('compose');
  const [manualPlanDate, setManualPlanDate] = useState('');
  const [solvedQuestionIds, setSolvedQuestionIds] = useState(() => new Set());
  const [questionTimingIndex, setQuestionTimingIndex] = useState({});
  const [questionTimingState, setQuestionTimingState] = useState('loading');
  const [questionSelectionDragging, setQuestionSelectionDragging] = useState(false);
  const questionSelectionDragRef = useRef(null);
  const suppressQuestionSelectionClickRef = useRef(false);
  const suppressQuestionSelectionClickTimerRef = useRef(null);
  const composerBusy = saving || draftSaving || discarding;
  const restoredDraftDate = draftRestoredAt ? new Date(draftRestoredAt) : null;
  const restoredDraftLabel = restoredDraftDate && !Number.isNaN(restoredDraftDate.getTime())
    ? restoredDraftDate.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).replace(' г.', '')
    : '';

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (expandedImage) setExpandedImage(null);
        else onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [expandedImage, onClose, open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const finishQuestionSelectionDrag = (event) => {
      const gesture = questionSelectionDragRef.current;
      if (!gesture || (Number.isFinite(event?.pointerId) && event.pointerId !== gesture.pointerId)) return;
      if (gesture.dragging) {
        suppressQuestionSelectionClickRef.current = true;
        if (suppressQuestionSelectionClickTimerRef.current) {
          clearTimeout(suppressQuestionSelectionClickTimerRef.current);
        }
        suppressQuestionSelectionClickTimerRef.current = setTimeout(() => {
          suppressQuestionSelectionClickRef.current = false;
          suppressQuestionSelectionClickTimerRef.current = null;
        }, QUESTION_SELECTION_CLICK_SUPPRESS_MS);
      }
      questionSelectionDragRef.current = null;
      setQuestionSelectionDragging(false);
    };
    window.addEventListener('pointerup', finishQuestionSelectionDrag);
    window.addEventListener('pointercancel', finishQuestionSelectionDrag);
    return () => {
      window.removeEventListener('pointerup', finishQuestionSelectionDrag);
      window.removeEventListener('pointercancel', finishQuestionSelectionDrag);
      questionSelectionDragRef.current = null;
      setQuestionSelectionDragging(false);
      if (suppressQuestionSelectionClickTimerRef.current) {
        clearTimeout(suppressQuestionSelectionClickTimerRef.current);
        suppressQuestionSelectionClickTimerRef.current = null;
      }
      suppressQuestionSelectionClickRef.current = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    api.getQuestionDifficulties()
      .then((index) => {
        if (cancelled) return;
        setQuestionTimingIndex(index && typeof index === 'object' ? index : {});
        setQuestionTimingState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setQuestionTimingIndex({});
        setQuestionTimingState('error');
      });
    return () => { cancelled = true; };
  }, [open]);

  const safeActiveGoalIndex = Math.min(activeGoalIndex, Math.max(0, goals.length - 1));
  const activeGoal = goals[safeActiveGoalIndex] || null;
  const activeGoalType = activeGoal && typeof normalizeGoalType === 'function'
    ? normalizeGoalType(activeGoal)
    : String(activeGoal?.type || goalTypeTask);
  const normalizedActiveTaskNumber = normalizeTaskNumber?.(activeGoal?.taskNumber) ?? activeGoal?.taskNumber;
  const activeTaskNumberCandidate = Number(normalizedActiveTaskNumber);
  const activeTaskNumber = normalizedActiveTaskNumber !== ''
    && normalizedActiveTaskNumber != null
    && Number.isFinite(activeTaskNumberCandidate)
    && activeTaskNumberCandidate > 0
    ? activeTaskNumberCandidate
    : Number.NaN;
  const activeIsPython = Number.isFinite(activeTaskNumber) && Boolean(isPythonTaskNumber?.(activeTaskNumber));
  const activeLevelId = activeIsPython ? pythonLevelId : String(activeGoal?.levelId || 'basic');
  const activeQuestions = activeGoalType === goalTypeTask && Number.isFinite(activeTaskNumber)
    ? (Array.isArray(testsDb?.[String(activeTaskNumber)]?.[activeLevelId])
        ? testsDb[String(activeTaskNumber)][activeLevelId]
        : [])
    : [];
  const activeMockExamId = normalizeMockExamId?.(activeGoal?.mockExamId) || String(activeGoal?.mockExamId || '');
  const activeMockExam = activeGoalType === goalTypeMock
    ? mockExams.find((exam) => String(exam?.id || '') === String(activeMockExamId)) || null
    : null;
  const explicitActiveMockTargetKeys = new Set(
    (Array.isArray(activeGoal?.targetTaskKeys) ? activeGoal.targetTaskKeys : [])
      .map((taskKey) => String(taskKey || '').trim())
      .filter(Boolean)
  );
  const activeMockQuestions = activeMockExam?.tasks && typeof activeMockExam.tasks === 'object'
    ? Object.entries(activeMockExam.tasks)
        .map(([taskKey, question]) => ({ taskKey, question }))
        .sort((left, right) => {
          const leftNumber = Number(left.taskKey);
          const rightNumber = Number(right.taskKey);
          if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
          return String(left.taskKey).localeCompare(String(right.taskKey), 'ru', { numeric: true });
        })
    : [];
  const selectedMockTargetSet = explicitActiveMockTargetKeys.size > 0
    ? explicitActiveMockTargetKeys
    : new Set(activeMockQuestions.map((item) => String(item.taskKey)));
  const previewItems = activeGoalType === goalTypeMock
    ? activeMockQuestions.map((item) => ({ key: item.taskKey, label: item.taskKey, question: item.question }))
    : activeQuestions.map((question, index) => ({ key: question?.id || index, label: index + 1, question }));
  const safePreviewIndex = Math.min(Math.max(0, previewIndex), Math.max(0, previewItems.length - 1));
  const previewItem = previewItems[safePreviewIndex] || null;

  const selectedTargetNumbers = !activeGoal || activeGoalType !== goalTypeTask
    ? []
    : (activeGoal.includeAll
        ? activeQuestions.map((_, index) => index + 1)
        : asPositiveIntegers(parseTargetInput?.(activeGoal.targetInput, activeQuestions.length) || []));
  const selectedTargetSet = new Set(selectedTargetNumbers);
  const previewQuestionNumber = activeGoalType === goalTypeTask ? safePreviewIndex + 1 : null;
  const previewSelected = activeGoalType === goalTypeMock
    ? Boolean(previewItem && selectedMockTargetSet.has(String(previewItem.key)))
    : previewQuestionNumber != null && selectedTargetSet.has(previewQuestionNumber);
  const canLoadSolvedQuestions = Boolean(
    open
    && studentId
    && activeGoalType === goalTypeTask
    && Number.isFinite(activeTaskNumber)
    && activeLevelId
  );
  const visibleSolvedQuestionIds = canLoadSolvedQuestions ? solvedQuestionIds : new Set();

  useEffect(() => {
    if (!canLoadSolvedQuestions) return undefined;
    let cancelled = false;
    api.getSolvedQuestions(studentId, activeTaskNumber, activeLevelId)
      .then((items) => {
        if (!cancelled) setSolvedQuestionIds(new Set((Array.isArray(items) ? items : []).map(String)));
      })
      .catch(() => {
        if (!cancelled) setSolvedQuestionIds(new Set());
      });
    return () => { cancelled = true; };
  }, [activeLevelId, activeTaskNumber, canLoadSolvedQuestions, studentId]);

  const plannerGoals = goals.map((goal) => {
    const goalType = typeof normalizeGoalType === 'function'
      ? normalizeGoalType(goal)
      : String(goal?.type || goalTypeTask);
    if (goalType === goalTypeMock) {
      const mockExamId = normalizeMockExamId?.(goal?.mockExamId) || String(goal?.mockExamId || '').trim();
      if (!mockExamId) return null;
      const exam = mockExams.find((item) => String(item?.id || '') === String(mockExamId));
      const allTaskKeys = exam?.tasks && typeof exam.tasks === 'object'
        ? Object.keys(exam.tasks).sort((left, right) => Number(left) - Number(right))
        : [];
      const selectedKeys = (Array.isArray(goal?.targetTaskKeys) ? goal.targetTaskKeys : [])
        .map((taskKey) => String(taskKey || '').trim())
        .filter(Boolean);
      return {
        type: goalTypeMock,
        assignmentTier: normalizeHomeworkAssignmentTier(goal?.assignmentTier),
        mockExamId,
        mode: goal?.mode,
        targetTaskKeys: selectedKeys.length > 0 ? selectedKeys : allTaskKeys,
      };
    }
    const taskNumber = normalizeTaskNumber?.(goal?.taskNumber) ?? Number(goal?.taskNumber);
    if (!Number.isFinite(Number(taskNumber))) return null;
    const isPythonGoal = Boolean(isPythonTaskNumber?.(taskNumber));
    const levelId = isPythonGoal ? pythonLevelId : String(goal?.levelId || 'basic');
    const questions = Array.isArray(testsDb?.[String(taskNumber)]?.[levelId])
      ? testsDb[String(taskNumber)][levelId]
      : [];
    const targetQuestions = goal?.includeAll
      ? questions.map((_, index) => index + 1)
      : asPositiveIntegers(parseTargetInput?.(goal?.targetInput, questions.length || 200) || []);
    const storedIds = (Array.isArray(goal?.targetQuestionIds) ? goal.targetQuestionIds : [])
      .map((questionId) => String(questionId || '').trim())
      .filter(Boolean);
    const currentNumberById = new Map(
      questions.map((question, index) => [String(question?.id || '').trim(), index + 1])
    );
    const storedPairs = !goal?.targetSelectionDirty && storedIds.length > 0
      ? storedIds
          .map((questionId) => ({ questionId, questionNumber: currentNumberById.get(questionId) }))
          .filter((item) => Number.isFinite(item.questionNumber))
          .sort((left, right) => left.questionNumber - right.questionNumber)
      : [];
    const resolvedNumbers = storedPairs.length > 0
      ? storedPairs.map((item) => item.questionNumber)
      : targetQuestions;
    if (resolvedNumbers.length === 0) return null;
    const resolvedIds = storedPairs.length > 0
      ? storedPairs.map((item) => item.questionId)
      : resolvedNumbers
          .map((questionNumber) => String(questions[questionNumber - 1]?.id || '').trim())
          .filter(Boolean);
    return {
      type: goalTypeTask,
      assignmentTier: normalizeHomeworkAssignmentTier(goal?.assignmentTier),
      taskNumber: Number(taskNumber),
      levelId,
      includeAll: false,
      targetQuestions: resolvedNumbers,
      targetQuestionIds: resolvedIds,
    };
  }).filter(Boolean);
  const homeworkDurationEstimate = buildHomeworkDurationEstimate({
    goals: plannerGoals,
    testsDb,
    timingIndex: questionTimingIndex,
    taskGoalType: goalTypeTask,
  });
  const requiredDurationLabel = formatHomeworkDurationEstimate(
    homeworkDurationEstimate.required.estimatedDurationMs
  );
  const optionalDurationLabel = formatHomeworkDurationEstimate(
    homeworkDurationEstimate.optional.estimatedDurationMs
  );
  const totalDurationLabel = formatHomeworkDurationEstimate(
    homeworkDurationEstimate.total.estimatedDurationMs
  );
  const durationEstimateTitle = (() => {
    if (questionTimingState === 'loading') return 'Считаем нагрузку…';
    if (questionTimingState === 'error') return 'Оценка времени недоступна';
    if (homeworkDurationEstimate.total.selectedCount <= 0) return 'Выберите задания — оценим нагрузку';
    if (homeworkDurationEstimate.total.estimatedCount <= 0) return 'Пока недостаточно данных';
    return homeworkDurationEstimate.complete
      ? `Примерно ${totalDurationLabel}`
      : `Не менее ${totalDurationLabel}`;
  })();
  const durationEstimateDetails = (() => {
    if (questionTimingState === 'loading') return 'Используем реальные решения учеников';
    if (questionTimingState === 'error') return 'Не удалось загрузить статистику решений';
    if (homeworkDurationEstimate.total.selectedCount <= 0) {
      return 'В расчёт попадут выбранные номера';
    }
    if (homeworkDurationEstimate.total.estimatedCount <= 0) {
      return 'Для этих номеров и уровней ещё нет замеров';
    }
    const details = [];
    if (requiredDurationLabel && optionalDurationLabel) {
      details.push(`${requiredDurationLabel} обязательно`, `+ ${optionalDurationLabel} дополнительно`);
    } else if (optionalDurationLabel && !requiredDurationLabel) {
      details.push(`${optionalDurationLabel} дополнительно`);
    }
    if (homeworkDurationEstimate.total.fallbackCount > 0) {
      details.push(`по среднему номера и уровня: ${homeworkDurationEstimate.total.fallbackCount}`);
    }
    if (homeworkDurationEstimate.total.unknownCount > 0) {
      details.push(`без данных: ${homeworkDurationEstimate.total.unknownCount}`);
    }
    return details.length > 0 ? details.join(' · ') : 'По времени конкретных заданий';
  })();
  const selectedPlanWeekdays = asPositiveIntegers(form?.dayPlanWeekdays)
    .filter((weekday) => weekday >= 1 && weekday <= 7);
  const calendarOffsetMinutes = typeof Date !== 'undefined' ? -new Date().getTimezoneOffset() : 180;
  const dayPlanPreview = form?.dayPlanEnabled && String(form?.dueAt || '').trim()
    ? buildHomeworkDayPlan({
        goals: plannerGoals,
        homeWork: form?.homeWork || '',
        issuedAt: form?.issuedAt || new Date().toISOString(),
        dueAt: form?.dueAt || '',
        sessionCount: Math.max(2, Math.min(7, Number(form?.dayPlanSessionCount) || 3)),
        selectedWeekdays: selectedPlanWeekdays,
        calendarOffsetMinutes,
        manualLayout: form?.dayPlanManualLayout || null,
      })
    : null;

  const getPlanItemLayoutKey = (item) => String(item?.layoutKey || item?.itemId || '').trim();
  const getEditableManualLayout = () => {
    if (!dayPlanPreview?.dayPlan?.length) return null;
    const previewLayout = dayPlanPreview.manualLayout;
    if (previewLayout?.days?.length) {
      return {
        version: 1,
        days: previewLayout.days.map((day) => ({
          date: day.date,
          itemKeys: [...(Array.isArray(day.itemKeys) ? day.itemKeys : [])],
        })),
        pinnedItemKeys: [...(Array.isArray(previewLayout.pinnedItemKeys) ? previewLayout.pinnedItemKeys : [])],
      };
    }
    return {
      version: 1,
      days: dayPlanPreview.dayPlan.map((day) => ({
        date: day.date,
        itemKeys: day.items.map(getPlanItemLayoutKey).filter(Boolean),
      })),
      pinnedItemKeys: [],
    };
  };

  const updateManualLayout = (updater) => {
    const current = getEditableManualLayout();
    if (!current) return;
    const next = updater(current);
    if (next?.days?.length) onChangeForm?.({ dayPlanManualLayout: next });
  };

  const movePlanItem = (itemKey, fromDayIndex, direction) => {
    const targetDayIndex = fromDayIndex + direction;
    updateManualLayout((layout) => {
      if (!layout.days[targetDayIndex]) return layout;
      layout.days.forEach((day) => {
        day.itemKeys = day.itemKeys.filter((key) => key !== itemKey);
      });
      layout.days[targetDayIndex].itemKeys.push(itemKey);
      return layout;
    });
  };

  const togglePlanItemPinned = (itemKey) => {
    updateManualLayout((layout) => {
      const pinned = new Set(layout.pinnedItemKeys);
      if (pinned.has(itemKey)) pinned.delete(itemKey);
      else pinned.add(itemKey);
      layout.pinnedItemKeys = [...pinned];
      return layout;
    });
  };

  const removeManualPlanDay = (dayIndex) => {
    updateManualLayout((layout) => {
      if (layout.days.length <= 1) return layout;
      layout.days.splice(dayIndex, 1);
      return layout;
    });
  };

  const addManualPlanDay = () => {
    const date = String(manualPlanDate || '').trim();
    if (!date) return;
    updateManualLayout((layout) => {
      if (layout.days.some((day) => day.date === date) || layout.days.length >= 7) return layout;
      layout.days.push({ date, itemKeys: [] });
      layout.days.sort((left, right) => left.date.localeCompare(right.date));
      return layout;
    });
    setManualPlanDate('');
  };

  const rebalanceManualPlan = () => {
    updateManualLayout((layout) => {
      const pinned = new Set(layout.pinnedItemKeys);
      const allKeys = layout.days.flatMap((day) => day.itemKeys);
      const pinnedDayByKey = new Map();
      layout.days.forEach((day) => day.itemKeys.forEach((itemKey) => {
        if (pinned.has(itemKey)) pinnedDayByKey.set(itemKey, day.date);
      }));
      layout.days.forEach((day) => {
        day.itemKeys = allKeys.filter((itemKey) => pinnedDayByKey.get(itemKey) === day.date);
      });
      allKeys.filter((itemKey) => !pinned.has(itemKey)).forEach((itemKey) => {
        const target = layout.days.reduce((best, day) => (
          !best || day.itemKeys.length < best.itemKeys.length ? day : best
        ), null);
        target?.itemKeys.push(itemKey);
      });
      return layout;
    });
  };

  const setActiveGoal = (index, showPreview = false) => {
    setActiveGoalIndex(index);
    setPreviewIndex(0);
    if (showPreview) setMobilePane('preview');
  };

  const toggleTargetNumber = (questionNumber) => {
    if (!activeGoal || activeGoalType !== goalTypeTask || !Number.isFinite(questionNumber)) return;
    const next = new Set(selectedTargetNumbers);
    if (next.has(questionNumber)) next.delete(questionNumber);
    else next.add(questionNumber);
    onUpdateGoal?.(safeActiveGoalIndex, {
      includeAll: false,
      targetInput: formatHomeworkQuestionRanges(Array.from(next)),
      targetSelectionDirty: true,
    });
  };

  const toggleMockTarget = (taskKey) => {
    if (!activeGoal || activeGoalType !== goalTypeMock) return;
    const normalizedTaskKey = String(taskKey || '').trim();
    if (!normalizedTaskKey) return;
    const allTaskKeys = activeMockQuestions.map((item) => String(item.taskKey));
    const next = new Set(selectedMockTargetSet);
    if (next.has(normalizedTaskKey)) {
      if (next.size <= 1) return;
      next.delete(normalizedTaskKey);
    } else {
      next.add(normalizedTaskKey);
    }
    const ordered = allTaskKeys.filter((value) => next.has(value));
    onUpdateGoal?.(safeActiveGoalIndex, {
      targetTaskKeys: ordered.length === allTaskKeys.length ? [] : ordered,
      origin: 'new',
      carryover: null,
      continuationOfHomeworkId: '',
    });
  };

  const commitQuestionSelectionDragValue = (gesture, rawValue) => {
    if (!gesture || gesture.goalIndex !== safeActiveGoalIndex || gesture.kind !== activeGoalType) return;
    const normalizedValue = gesture.kind === goalTypeTask
      ? Math.trunc(Number(rawValue))
      : String(rawValue || '').trim();
    if (
      (gesture.kind === goalTypeTask && (!Number.isFinite(normalizedValue) || normalizedValue <= 0))
      || (gesture.kind === goalTypeMock && !normalizedValue)
      || gesture.visited.has(String(normalizedValue))
    ) return;

    gesture.visited.add(String(normalizedValue));
    if (gesture.mode === 'select') gesture.next.add(normalizedValue);
    else if (gesture.kind !== goalTypeMock || gesture.next.size > 1) gesture.next.delete(normalizedValue);

    if (gesture.kind === goalTypeTask) {
      const ordered = asPositiveIntegers(Array.from(gesture.next));
      const includesAll = activeQuestions.length > 0 && ordered.length === activeQuestions.length;
      onUpdateGoal?.(gesture.goalIndex, {
        includeAll: includesAll,
        targetInput: includesAll ? '' : formatHomeworkQuestionRanges(ordered),
        targetSelectionDirty: true,
      });
      return;
    }

    const allTaskKeys = activeMockQuestions.map((item) => String(item.taskKey));
    const ordered = allTaskKeys.filter((value) => gesture.next.has(value));
    onUpdateGoal?.(gesture.goalIndex, {
      targetTaskKeys: ordered.length === allTaskKeys.length ? [] : ordered,
      origin: 'new',
      carryover: null,
      continuationOfHomeworkId: '',
    });
  };

  const beginQuestionSelectionDrag = (event, rawValue, selected) => {
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const normalizedValue = activeGoalType === goalTypeTask
      ? Math.trunc(Number(rawValue))
      : String(rawValue || '').trim();
    if (
      (activeGoalType === goalTypeTask && (!Number.isFinite(normalizedValue) || normalizedValue <= 0))
      || (activeGoalType === goalTypeMock && !normalizedValue)
    ) return;
    questionSelectionDragRef.current = {
      pointerId: event.pointerId,
      kind: activeGoalType,
      goalIndex: safeActiveGoalIndex,
      mode: selected ? 'deselect' : 'select',
      startValue: normalizedValue,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      visited: new Set(),
      next: new Set(activeGoalType === goalTypeTask ? selectedTargetNumbers : selectedMockTargetSet),
    };
  };

  const handleQuestionSelectionDragMove = (event) => {
    const gesture = questionSelectionDragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.pointerType === 'mouse' && event.buttons !== 1) return;
    if (!gesture.dragging) {
      const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
      if (distance < 5) return;
      gesture.dragging = true;
      setQuestionSelectionDragging(true);
      commitQuestionSelectionDragValue(gesture, gesture.startValue);
    }
    const hovered = typeof document !== 'undefined'
      ? document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-homework-selection-value]')
      : null;
    if (hovered && hovered.dataset.homeworkSelectionKind === gesture.kind) {
      commitQuestionSelectionDragValue(gesture, hovered.dataset.homeworkSelectionValue);
    }
    if (event.cancelable) event.preventDefault();
  };

  const suppressQuestionSelectionClick = (event) => {
    if (!suppressQuestionSelectionClickRef.current) return;
    suppressQuestionSelectionClickRef.current = false;
    if (suppressQuestionSelectionClickTimerRef.current) {
      clearTimeout(suppressQuestionSelectionClickTimerRef.current);
      suppressQuestionSelectionClickTimerRef.current = null;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const selectAllActiveQuestions = () => {
    if (!activeGoal || activeQuestions.length === 0) return;
    onUpdateGoal?.(safeActiveGoalIndex, { includeAll: true, targetInput: '', targetSelectionDirty: true });
  };

  const clearActiveQuestions = () => {
    if (!activeGoal) return;
    onUpdateGoal?.(safeActiveGoalIndex, { includeAll: false, targetInput: '', targetSelectionDirty: true });
  };

  const renderAssignmentTierControl = (goal, index) => {
    const assignmentTier = normalizeHomeworkAssignmentTier(goal?.assignmentTier);
    return (
      <div className="mt-2.5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">В домашке</span>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => onUpdateGoal?.(index, { assignmentTier: 'required' })}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
              assignmentTier !== HOMEWORK_ASSIGNMENT_TIER_OPTIONAL
                ? 'bg-white text-purple-700 shadow-sm ring-1 ring-purple-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Нужно сделать
          </button>
          <button
            type="button"
            onClick={() => onUpdateGoal?.(index, { assignmentTier: HOMEWORK_ASSIGNMENT_TIER_OPTIONAL })}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
              assignmentTier === HOMEWORK_ASSIGNMENT_TIER_OPTIONAL
                ? 'bg-white text-fuchsia-700 shadow-sm ring-1 ring-fuchsia-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Если останутся силы
          </button>
        </div>
      </div>
    );
  };

  const renderTaskGoal = (goal, index) => {
    const normalizedTaskNumber = normalizeTaskNumber?.(goal?.taskNumber);
    const taskNumberCandidate = Number(normalizedTaskNumber);
    const taskNumber = normalizedTaskNumber !== ''
      && normalizedTaskNumber != null
      && Number.isFinite(taskNumberCandidate)
      && taskNumberCandidate > 0
      ? taskNumberCandidate
      : Number.NaN;
    const pythonGoal = Number.isFinite(taskNumber) && Boolean(isPythonTaskNumber?.(taskNumber));
    const effectiveLevel = pythonGoal ? pythonLevelId : String(goal?.levelId || 'basic');
    const questionCount = Number.isFinite(taskNumber)
      ? (Array.isArray(testsDb?.[String(taskNumber)]?.[effectiveLevel])
          ? testsDb[String(taskNumber)][effectiveLevel].length
          : 0)
      : 0;
    const selectedCount = goal?.includeAll
      ? questionCount
      : asPositiveIntegers(parseTargetInput?.(goal?.targetInput, questionCount) || []).length;
    const taskInfo = pythonGoal ? getPythonTaskInfo?.(taskNumber) : null;
    const taskLabel = pythonGoal
      ? `Python ${taskInfo?.displayNumber || taskNumber}`
      : (Number.isFinite(taskNumber) ? `Задание ${formatTaskNumber?.(taskNumber) || taskNumber}` : 'Новое задание');
    const isActive = index === safeActiveGoalIndex;

    return (
      <article
        key={`${index}-${goal?.origin || 'new'}-${goal?.taskNumber || 'empty'}`}
        className={`rounded-2xl border p-3.5 transition ${
          isActive
            ? 'border-purple-400 bg-purple-50/75 shadow-[0_10px_28px_rgba(124,58,237,0.12)]'
            : 'border-slate-200 bg-[rgb(var(--surface))] hover:border-purple-200'
        }`}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <button type="button" onClick={() => setActiveGoal(index)} className="min-w-0 text-left">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-purple-600">{taskLabel}</span>
              {goal?.origin === 'carryover' && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
                  Хвост с прошлого ДЗ
                </span>
              )}
              {normalizeHomeworkAssignmentTier(goal?.assignmentTier) === HOMEWORK_ASSIGNMENT_TIER_OPTIONAL && (
                <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-fuchsia-700">
                  Дополнительно
                </span>
              )}
            </div>
            <strong className="mt-1 block text-sm text-[rgb(var(--ink))]">
              {questionCount > 0
                ? `${selectedCount} из ${questionCount} номеров выбрано`
                : 'Выберите раздел и уровень'}
            </strong>
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveGoal(index, true)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-purple-200 bg-white px-2.5 text-[10px] font-bold text-purple-700 hover:bg-purple-50"
            >
              <Eye size={12} /> Смотреть
            </button>
            <button
              type="button"
              onClick={() => onRemoveGoal?.(index)}
              className="inline-grid h-8 w-8 place-items-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50"
              aria-label="Убрать цель из домашки"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">Раздел</span>
          <select
            value={goal?.taskNumber || ''}
            onFocus={() => setActiveGoal(index)}
            onChange={(event) => {
              const value = event.target.value;
              const nextNumber = value ? Number(value) : null;
              const nextPython = Number.isFinite(nextNumber) && Boolean(isPythonTaskNumber?.(nextNumber));
              const taskChanged = String(value) !== String(goal?.taskNumber || '');
              const nextLevelId = nextPython
                ? pythonLevelId
                : (goal?.levelId === pythonLevelId ? 'basic' : (goal?.levelId || 'basic'));
              onUpdateGoal?.(index, {
                taskNumber: value,
                levelId: nextLevelId,
                includeAll: false,
                targetInput: '',
                targetQuestionIds: [],
                targetSelectionDirty: true,
                ...(taskChanged ? { origin: 'new', carryover: null } : {}),
              });
              setActiveGoal(index);
            }}
            className="min-h-10 rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-3 text-sm font-semibold text-[rgb(var(--ink))] outline-none focus:border-purple-400"
          >
            <option value="">Выберите раздел</option>
            <optgroup label="ЕГЭ">
              {taskOptions.map((task) => (
                <option key={task.id ?? task.number} value={task.number}>
                  {`${getTaskDisplayNumber?.(task) || task.number}. ${task.title || 'Без названия'}`}
                </option>
              ))}
            </optgroup>
            <optgroup label="Python">
              {pythonTaskOptions.map((task) => (
                <option key={task.id ?? task.number} value={task.number}>
                  {`${task.displayNumber || task.number}. ${task.title || 'Без названия'}`}
                </option>
              ))}
            </optgroup>
          </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">Уровень задания</span>
          <select
            value={pythonGoal ? pythonLevelId : (goal?.levelId || 'basic')}
            onFocus={() => setActiveGoal(index)}
            onChange={(event) => {
              onUpdateGoal?.(index, { levelId: event.target.value, includeAll: false, targetInput: '', targetQuestionIds: [], targetSelectionDirty: true });
              setActiveGoal(index);
            }}
            disabled={!goal?.taskNumber || pythonGoal}
            className="min-h-10 rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-3 text-sm font-semibold text-[rgb(var(--ink))] outline-none focus:border-purple-400 disabled:opacity-55"
          >
            {pythonGoal ? (
              <option value={pythonLevelId}>Python</option>
            ) : (
              Object.values(levels).map((level) => (
                <option key={level.id} value={level.id}>{level.label}</option>
              ))
            )}
          </select>
          </label>
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={goal?.targetInput || ''}
            onFocus={() => setActiveGoal(index)}
            onChange={(event) => onUpdateGoal?.(index, { targetInput: event.target.value, includeAll: false, targetSelectionDirty: true })}
            placeholder="Номера: 1-5, 8, 11"
            disabled={!goal?.taskNumber || goal?.includeAll}
            className="min-h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-3 text-sm font-semibold text-[rgb(var(--ink))] outline-none focus:border-purple-400 disabled:opacity-55"
          />
          <label className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-3 text-xs font-bold text-[rgb(var(--ink-soft))]">
            <input
              type="checkbox"
              checked={Boolean(goal?.includeAll)}
              disabled={!goal?.taskNumber}
              onChange={(event) => onUpdateGoal?.(index, { includeAll: event.target.checked, targetInput: '', targetSelectionDirty: true })}
            />
            Все номера
          </label>
        </div>
        {renderAssignmentTierControl(goal, index)}
      </article>
    );
  };

  const renderMockGoal = (goal, index) => {
    const isActive = index === safeActiveGoalIndex;
    const selectedExam = mockExams.find((exam) => String(exam?.id || '') === String(goal?.mockExamId || ''));
    const remainingCount = Number(goal?.carryover?.remainingCount);
    const selectedMockTaskCount = Array.isArray(goal?.targetTaskKeys)
      ? goal.targetTaskKeys.filter((taskKey) => String(taskKey || '').trim()).length
      : 0;
    return (
      <article
        key={`${index}-${goal?.origin || 'new'}-${goal?.mockExamId || 'empty-mock'}`}
        className={`rounded-2xl border p-3.5 transition ${
          isActive
            ? 'border-purple-400 bg-purple-50/75 shadow-[0_10px_28px_rgba(124,58,237,0.12)]'
            : 'border-slate-200 bg-[rgb(var(--surface))] hover:border-purple-200'
        }`}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <button type="button" onClick={() => setActiveGoal(index)} className="min-w-0 text-left">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-purple-600">Пробник</span>
              {goal?.origin === 'carryover' && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
                  Хвост с прошлого ДЗ
                </span>
              )}
              {normalizeHomeworkAssignmentTier(goal?.assignmentTier) === HOMEWORK_ASSIGNMENT_TIER_OPTIONAL && (
                <span className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-fuchsia-700">
                  Дополнительно
                </span>
              )}
            </div>
            <strong className="mt-1 block text-sm text-[rgb(var(--ink))]">
              {selectedExam?.title || 'Выберите пробник'}
            </strong>
            {Number.isFinite(remainingCount) && (
              <span className="mt-1 block text-[11px] font-semibold text-amber-700">Осталось заданий: {remainingCount}</span>
            )}
            {!Number.isFinite(remainingCount) && selectedMockTaskCount > 0 && (
              <span className="mt-1 block text-[11px] font-semibold text-purple-700">Выбрано заданий: {selectedMockTaskCount}</span>
            )}
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveGoal(index, true)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-purple-200 bg-white px-2.5 text-[10px] font-bold text-purple-700 hover:bg-purple-50"
            >
              <Eye size={12} /> Смотреть
            </button>
            <button
              type="button"
              onClick={() => onRemoveGoal?.(index)}
              className="inline-grid h-8 w-8 place-items-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50"
              aria-label="Убрать пробник из домашки"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        <select
          value={goal?.mockExamId || ''}
          onFocus={() => setActiveGoal(index)}
          onChange={(event) => {
            const mockExamId = event.target.value;
            onUpdateGoal?.(index, {
              mockExamId,
              targetTaskKeys: [],
              continuationOfHomeworkId: '',
              ...(mockExamId !== goal?.mockExamId ? { origin: 'new', carryover: null } : {}),
            });
            setActiveGoal(index);
          }}
          className="min-h-10 w-full rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-3 text-sm font-semibold text-[rgb(var(--ink))] outline-none focus:border-purple-400"
        >
          <option value="">{mockExamsLoading ? 'Загружаем пробники…' : 'Выберите пробник'}</option>
          {mockExams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
        </select>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-purple-100 bg-purple-50/70 p-1">
          <button
            type="button"
            onClick={() => onUpdateGoal?.(index, {
              mode: 'timer',
              ...(String(goal?.mode || 'timer') !== 'timer'
                ? { origin: 'new', carryover: null, continuationOfHomeworkId: '' }
                : {}),
            })}
            className={`rounded-lg px-3 py-2 text-xs font-bold ${String(goal?.mode || 'timer') === 'timer' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}
          >
            С таймером
          </button>
          <button
            type="button"
            onClick={() => onUpdateGoal?.(index, {
              mode: 'classic',
              ...(String(goal?.mode || 'timer') !== 'classic'
                ? { origin: 'new', carryover: null, continuationOfHomeworkId: '' }
                : {}),
            })}
            className={`rounded-lg px-3 py-2 text-xs font-bold ${String(goal?.mode || '') === 'classic' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500'}`}
          >
            Обычный режим
          </button>
        </div>
        {renderAssignmentTierControl(goal, index)}
      </article>
    );
  };

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[1800] flex items-stretch justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:p-3 lg:p-5">
      <section
        className="flex h-[100dvh] w-full max-w-[1540px] flex-col overflow-hidden bg-[rgb(var(--surface-soft))] text-[rgb(var(--ink))] shadow-2xl sm:h-[calc(100dvh-1.5rem)] sm:rounded-[28px] sm:border sm:border-white/20 lg:h-[calc(100dvh-2.5rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-homework-composer-title"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/80 bg-[rgb(var(--surface))] px-4 py-3.5 sm:px-5 lg:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-500 text-white shadow-lg shadow-purple-500/20">
                <Sparkles size={18} />
              </span>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-500">Конструктор домашней работы</div>
                <h2 id="teacher-homework-composer-title" className="text-lg font-black tracking-tight sm:text-xl">
                  {editing ? 'Редактировать домашку' : 'Задать новую домашку'}
                  {studentLabel ? <span className="font-semibold text-[rgb(var(--ink-soft))]"> · {studentLabel}</span> : null}
                </h2>
              </div>
            </div>
            <p className="mt-1.5 max-w-3xl text-xs font-medium text-[rgb(var(--ink-soft))] sm:text-sm">
              {editing
                ? 'Проверьте состав домашки и условия заданий перед сохранением.'
                : (isGroupTarget
                    ? 'Одно задание появится в обычной домашке каждого участника группы. Выполнение и проверка останутся индивидуальными.'
                    : 'Незаконченные задания уже перенесены. Просматривайте условия справа и оставляйте только нужные номера.')}
            </p>
            {!editing && restoredDraftLabel ? (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-black text-purple-700">
                <Save size={11} />
                Черновик восстановлен · сохранён {restoredDraftLabel}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!editing ? (
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={composerBusy || preparing}
                title="Сохранить черновик и закрыть"
                className="inline-grid h-10 w-10 place-items-center rounded-xl border border-purple-200 bg-purple-50 text-purple-700 transition hover:border-purple-300 hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Сохранить черновик и закрыть конструктор"
              >
                {draftSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              disabled={composerBusy}
              title={editing ? 'Закрыть без сохранения' : 'Отменить домашку и удалить черновик'}
              className="inline-grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-[rgb(var(--surface))] text-[rgb(var(--ink-soft))] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={editing ? 'Закрыть конструктор без сохранения' : 'Отменить домашку, удалить черновик и закрыть конструктор'}
            >
              {discarding ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
            </button>
          </div>
        </header>

        {!preparing && (
          <nav className="grid shrink-0 grid-cols-2 gap-1 border-b border-slate-200 bg-[rgb(var(--surface))] p-2 lg:hidden" aria-label="Раздел конструктора домашки">
            <button
              type="button"
              onClick={() => setMobilePane('compose')}
              aria-pressed={mobilePane === 'compose'}
              className={`min-h-10 rounded-xl px-3 text-xs font-black transition ${
                mobilePane === 'compose'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                  : 'bg-[rgb(var(--surface-soft))] text-[rgb(var(--ink-soft))]'
              }`}
            >
              Состав ДЗ
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('preview')}
              aria-pressed={mobilePane === 'preview'}
              className={`min-h-10 rounded-xl px-3 text-xs font-black transition ${
                mobilePane === 'preview'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                  : 'bg-[rgb(var(--surface-soft))] text-[rgb(var(--ink-soft))]'
              }`}
            >
              Задания
            </button>
          </nav>
        )}

        {preparing ? (
          <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
            <div>
              <Loader2 size={34} className="mx-auto animate-spin text-purple-600" />
              <strong className="mt-4 block text-base">Собираем незавершённое с прошлого раза…</strong>
              <span className="mt-1 block text-sm text-[rgb(var(--ink-soft))]">Сверяем номера с текущей базой заданий.</span>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,0.92fr)_minmax(430px,1.08fr)]">
            <div className={`${mobilePane === 'compose' ? 'block' : 'hidden'} h-full min-h-0 overflow-y-auto p-4 sm:p-5 lg:block lg:border-r lg:border-slate-200/80 lg:p-6`}>
              {preparationError && (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {preparationError}
                </div>
              )}

              {!editing && carryoverSummary && (
                <div className={`mb-4 rounded-2xl border px-4 py-3 ${
                  Number(carryoverSummary.pendingGoalCount) > 0 || Number(carryoverSummary.pendingChecklistCount) > 0
                    ? 'border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50'
                    : 'border-emerald-200 bg-emerald-50'
                }`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 inline-grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                      Number(carryoverSummary.pendingGoalCount) > 0 || Number(carryoverSummary.pendingChecklistCount) > 0
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {Number(carryoverSummary.pendingGoalCount) > 0 || Number(carryoverSummary.pendingChecklistCount) > 0
                        ? <RotateCcw size={16} />
                        : <CheckCircle2 size={16} />}
                    </span>
                    <div>
                      <strong className="block text-sm text-slate-900">
                        {Number(carryoverSummary.pendingGoalCount) > 0 || Number(carryoverSummary.pendingChecklistCount) > 0
                          ? 'Добавил незавершённое с прошлого ДЗ'
                          : (carryoverSummary.hasSourceHomework ? 'Прошлая домашка закрыта' : 'Новая домашка с чистого листа')}
                      </strong>
                      <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                        {Number(carryoverSummary.pendingQuestionCount) > 0
                          ? `Осталось заданий: ${carryoverSummary.pendingQuestionCount}. Любой хвост можно изменить или удалить.`
                          : (Number(carryoverSummary.pendingChecklistCount) > 0
                              ? `Осталось пунктов: ${carryoverSummary.pendingChecklistCount}.`
                              : (carryoverSummary.hasSourceHomework
                                  ? 'Можно сразу задавать новый материал.'
                                  : 'Добавьте задания, комментарий и срок сдачи.'))}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--ink-soft))]">
                    <FileText size={14} /> Текст и дополнительные пункты
                  </span>
                  <textarea
                    value={form?.homeWork || ''}
                    onChange={(event) => onChangeForm?.({ homeWork: event.target.value })}
                    placeholder="Например: повторить конспект, посмотреть видео, закончить файл…"
                    rows={4}
                    className="min-h-[112px] w-full resize-y rounded-2xl border border-slate-200 bg-[rgb(var(--surface))] px-4 py-3 text-sm font-medium leading-relaxed text-[rgb(var(--ink))] shadow-inner outline-none transition focus:border-purple-400 focus:ring-4 focus:ring-purple-100/70"
                  />
                </label>

                <section>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[rgb(var(--ink-soft))]">
                        <Target size={14} /> Задания и пробники
                      </div>
                      <p className="mt-1 text-[11px] text-[rgb(var(--ink-soft))]">Нажмите «Смотреть», чтобы открыть номера справа.</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onAddGoal?.(goalTypeTask)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-purple-200 bg-[rgb(var(--surface))] px-3 text-xs font-bold text-purple-700 transition hover:bg-purple-50"
                      >
                        <Plus size={14} /> Задание
                      </button>
                      <button
                        type="button"
                        onClick={() => onAddGoal?.(goalTypeMock)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-sky-200 bg-[rgb(var(--surface))] px-3 text-xs font-bold text-sky-700 transition hover:bg-sky-50"
                      >
                        <Plus size={14} /> Пробник
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {goals.map((goal, index) => (
                      (typeof normalizeGoalType === 'function' ? normalizeGoalType(goal) : goal?.type) === goalTypeMock
                        ? renderMockGoal(goal, index)
                        : renderTaskGoal(goal, index)
                    ))}
                    {goals.length === 0 && (
                      <button
                        type="button"
                        onClick={() => onAddGoal?.(goalTypeTask)}
                        className="flex min-h-24 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-purple-300 bg-purple-50/55 text-sm font-bold text-purple-700 transition hover:bg-purple-50"
                      >
                        <Plus size={16} /> Добавить первое задание
                      </button>
                    )}
                  </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-1">
                    <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[rgb(var(--ink-soft))]">
                      <Clock3 size={12} /> Сдать до
                    </span>
                    <input
                      type="datetime-local"
                      value={form?.dueAt || ''}
                      onChange={(event) => onChangeForm?.({
                        dueAt: event.target.value,
                        dueAtMode: HOMEWORK_DUE_AT_MODE_MANUAL,
                      })}
                      className="min-h-11 w-full rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-3 text-sm font-semibold text-[rgb(var(--ink))] outline-none focus:border-purple-400"
                    />
                    {form?.dueAtMode === HOMEWORK_DUE_AT_MODE_NEXT_LESSON ? (
                      <span className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                        <CalendarDays size={11} /> Автоматически обновляется по ближайшему занятию
                      </span>
                    ) : (
                      <div className="mt-1.5 text-[10px] leading-relaxed">
                        <span className="block font-semibold text-amber-700">
                          Ручной срок не изменится вместе с расписанием.
                        </span>
                        <button
                          type="button"
                          onClick={() => onChangeForm?.({ dueAtMode: HOMEWORK_DUE_AT_MODE_NEXT_LESSON })}
                          className="font-bold text-purple-600 hover:text-purple-800"
                        >
                          Использовать ближайшее занятие
                        </button>
                      </div>
                    )}
                  </div>
                  <label>
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[rgb(var(--ink-soft))]">Ссылка на занятие</span>
                    <input
                      type="url"
                      value={form?.lessonLink || ''}
                      onChange={(event) => onChangeForm?.({ lessonLink: event.target.value })}
                      placeholder="https://…"
                      className="min-h-11 w-full rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-3 text-sm font-semibold text-[rgb(var(--ink))] outline-none focus:border-purple-400"
                    />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-[rgb(var(--ink-soft))]">Ссылка на доску</span>
                    <input
                      type="url"
                      value={form?.boardLink || ''}
                      onChange={(event) => onChangeForm?.({ boardLink: event.target.value })}
                      placeholder="https://…"
                      className="min-h-11 w-full rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-3 text-sm font-semibold text-[rgb(var(--ink))] outline-none focus:border-purple-400"
                    />
                  </label>
                </section>

                <section hidden aria-hidden="true" className={`rounded-2xl border p-4 transition ${
                  form?.dayPlanEnabled
                    ? 'border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-purple-50'
                    : 'border-slate-200 bg-[rgb(var(--surface))]'
                }`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={`inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                        form?.dayPlanEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <CalendarDays size={17} />
                      </span>
                      <div>
                        <strong className="block text-sm text-[rgb(var(--ink))]">Авторазбивка по дням</strong>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[rgb(var(--ink-soft))]">
                          Номера равномерно распределятся до срока. Ученик увидит, что сделать сегодня.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(form?.dayPlanEnabled)}
                      onClick={() => onChangeForm?.({ dayPlanEnabled: !form?.dayPlanEnabled })}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition ${form?.dayPlanEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${form?.dayPlanEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>

                  {form?.dayPlanEnabled && (
                    <div className="mt-4 space-y-4 border-t border-indigo-100 pt-4">
                      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                        <label>
                          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600">Количество подходов</span>
                          <select
                            value={Math.max(2, Math.min(7, Number(form?.dayPlanSessionCount) || 3))}
                            onChange={(event) => onChangeForm?.({
                              dayPlanSessionCount: Number(event.target.value),
                              dayPlanManualLayout: null,
                            })}
                            className="min-h-10 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400"
                          >
                            {[2, 3, 4, 5, 6, 7].map((count) => (
                              <option key={count} value={count}>{`${count} ${count < 5 ? 'дня' : 'дней'}`}</option>
                            ))}
                          </select>
                        </label>
                        <div>
                          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600">Когда ученик занимается</span>
                          <div className="flex flex-wrap gap-1.5">
                            {HOMEWORK_PLAN_WEEKDAYS.map((weekday) => {
                              const selected = selectedPlanWeekdays.includes(weekday.value);
                              return (
                                <button
                                  key={weekday.value}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => {
                                    const next = selected
                                      ? selectedPlanWeekdays.filter((value) => value !== weekday.value)
                                      : [...selectedPlanWeekdays, weekday.value].sort((left, right) => left - right);
                                    onChangeForm?.({ dayPlanWeekdays: next, dayPlanManualLayout: null });
                                  }}
                                  className={`h-10 min-w-10 rounded-xl border px-2 text-xs font-black transition ${
                                    selected
                                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                                      : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300'
                                  }`}
                                >
                                  {weekday.label}
                                </button>
                              );
                            })}
                          </div>
                          {selectedPlanWeekdays.length === 0 && (
                            <span className="mt-1.5 block text-[10px] font-semibold text-amber-700">Без ограничений по дням недели.</span>
                          )}
                        </div>
                      </div>

                      {dayPlanPreview?.dayPlan?.length > 0 ? (
                        <div>
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-purple-600">План по дням</span>
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                                  form?.dayPlanManualLayout
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {form?.dayPlanManualLayout ? 'Настроен вручную' : 'Авто'}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                                {`${dayPlanPreview.summary.requiredItemCount} нужно сделать${dayPlanPreview.summary.optionalItemCount > 0 ? ` · ${dayPlanPreview.summary.optionalItemCount} дополнительно` : ''} · ${dayPlanPreview.summary.sessionCount} дней`}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {form?.dayPlanManualLayout ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={rebalanceManualPlan}
                                    className="rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-purple-700 transition hover:bg-purple-50"
                                  >
                                    Выровнять
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onChangeForm?.({ dayPlanManualLayout: null })}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-600 transition hover:border-purple-200 hover:text-purple-700"
                                  >
                                    <RotateCcw size={11} /> Вернуть авто
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const layout = getEditableManualLayout();
                                    if (layout) onChangeForm?.({ dayPlanManualLayout: layout });
                                  }}
                                  className="rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-[10px] font-black text-purple-700 transition hover:bg-purple-50"
                                >
                                  Настроить вручную
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-2 lg:grid-cols-2">
                            {dayPlanPreview.dayPlan.map((day, dayIndex) => (
                              <div key={day.id} className="rounded-xl border border-purple-100 bg-white/95 p-3 shadow-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <strong className="block truncate text-xs capitalize text-slate-900">{formatPlanDate(day.date)}</strong>
                                    <span className="text-[9px] font-bold text-slate-400">{day.date}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[9px] font-black text-purple-700">{day.itemCount}</span>
                                    {form?.dayPlanManualLayout && dayPlanPreview.dayPlan.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => removeManualPlanDay(dayIndex)}
                                        className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                        aria-label={`Удалить день ${formatPlanDate(day.date)}`}
                                        title="Убрать день из плана"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-2 space-y-1.5">
                                  {day.items.map((item) => {
                                    const itemKey = getPlanItemLayoutKey(item);
                                    return (
                                      <div key={item.itemId} className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-1.5">
                                        <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-slate-600">{describePlanItem(item)}</span>
                                        {normalizeHomeworkAssignmentTier(item?.assignmentTier || item?.goal?.assignmentTier) === HOMEWORK_ASSIGNMENT_TIER_OPTIONAL && (
                                          <span className="shrink-0 rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[8px] font-black text-fuchsia-700">
                                            Доп.
                                          </span>
                                        )}
                                        {form?.dayPlanManualLayout && (
                                          <div className="flex shrink-0 items-center gap-0.5">
                                            <button
                                              type="button"
                                              onClick={() => togglePlanItemPinned(itemKey)}
                                              className={`grid h-6 w-6 place-items-center rounded-md transition ${
                                                item?.pinned
                                                  ? 'bg-purple-100 text-purple-700'
                                                  : 'text-slate-400 hover:bg-purple-50 hover:text-purple-600'
                                              }`}
                                              aria-pressed={Boolean(item?.pinned)}
                                              aria-label={item?.pinned ? 'Открепить задание от дня' : 'Закрепить задание за днём'}
                                              title={item?.pinned ? 'Закреплено: автоперенос не сдвинет' : 'Закрепить за этим днём'}
                                            >
                                              <Pin size={11} fill={item?.pinned ? 'currentColor' : 'none'} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => movePlanItem(itemKey, dayIndex, -1)}
                                              disabled={dayIndex === 0 || item?.pinned}
                                              className="grid h-6 w-6 place-items-center rounded-md text-slate-500 transition hover:bg-purple-50 hover:text-purple-700 disabled:cursor-not-allowed disabled:opacity-25"
                                              aria-label="Перенести в предыдущий день"
                                            >
                                              <ArrowLeft size={11} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => movePlanItem(itemKey, dayIndex, 1)}
                                              disabled={dayIndex >= dayPlanPreview.dayPlan.length - 1 || item?.pinned}
                                              className="grid h-6 w-6 place-items-center rounded-md text-slate-500 transition hover:bg-purple-50 hover:text-purple-700 disabled:cursor-not-allowed disabled:opacity-25"
                                              aria-label="Перенести в следующий день"
                                            >
                                              <ArrowRight size={11} />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {day.items.length === 0 && (
                                    <div className="rounded-lg border border-dashed border-slate-200 px-2 py-3 text-center text-[10px] font-semibold text-slate-400">
                                      Свободный день
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {form?.dayPlanManualLayout && (
                            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-purple-200 bg-white/75 p-2.5">
                              <label className="min-w-[180px] flex-1">
                                <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.1em] text-purple-600">Добавить день</span>
                                <input
                                  type="date"
                                  value={manualPlanDate}
                                  min={addCalendarDaysToKey(dayPlanPreview.issuedDay, 1)}
                                  max={dayPlanPreview.dueDay || undefined}
                                  onInput={(event) => setManualPlanDate(event.currentTarget.value)}
                                  onChange={(event) => setManualPlanDate(event.target.value)}
                                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-400"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={addManualPlanDay}
                                disabled={!manualPlanDate || dayPlanPreview.dayPlan.length >= 7}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-purple-600 px-3 text-[10px] font-black text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Plus size={12} /> Добавить
                              </button>
                              <p className="w-full text-[9px] font-semibold leading-relaxed text-slate-500">
                                Булавка фиксирует номер за выбранным днём: при пропуске платформа не перенесёт его автоматически.
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-indigo-200 bg-white/70 px-3 py-4 text-center text-xs font-semibold text-slate-500">
                          Добавьте номера и укажите срок — здесь появится готовый план.
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </div>

            <aside className={`${mobilePane === 'preview' ? 'block' : 'hidden'} h-full min-h-0 overflow-y-auto bg-gradient-to-b from-purple-50/75 via-[rgb(var(--surface-soft))] to-[rgb(var(--surface-soft))] p-4 sm:p-5 lg:block lg:p-6`}>
              <div className="sticky top-0 z-10 -mx-1 mb-4 rounded-2xl border border-purple-100 bg-[rgb(var(--surface))]/95 p-3 shadow-sm backdrop-blur">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-purple-500">Просмотр базы</div>
                    <strong className="mt-1 block truncate text-base text-[rgb(var(--ink))]">
                      {activeGoalType === goalTypeMock
                        ? (activeMockExam?.title || 'Выберите пробник слева')
                        : (Number.isFinite(activeTaskNumber)
                            ? `${activeIsPython ? 'Python' : 'Задание'} ${activeIsPython
                                ? (getPythonTaskInfo?.(activeTaskNumber)?.displayNumber || activeTaskNumber)
                                : (formatTaskNumber?.(activeTaskNumber) || activeTaskNumber)}`
                            : 'Выберите раздел слева')}
                    </strong>
                    {previewItems.length > 0 && (
                      <>
                        <span className="mt-0.5 block text-xs text-[rgb(var(--ink-soft))]">
                          {activeGoalType === goalTypeTask
                            ? `Выбрано ${selectedTargetNumbers.length} из ${previewItems.length}`
                            : `Выбрано ${selectedMockTargetSet.size} из ${previewItems.length}`}
                        </span>
                        <span className="mt-0.5 block text-[9px] font-bold text-purple-500">
                          Зажмите номер и проведите по остальным
                        </span>
                      </>
                    )}
                  </div>
                  {activeGoalType === goalTypeTask && activeQuestions.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={selectAllActiveQuestions} className="rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-purple-700 hover:bg-purple-50">Все</button>
                      <button type="button" onClick={clearActiveQuestions} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50">Снять</button>
                    </div>
                  )}
                  {activeGoalType === goalTypeMock && activeMockQuestions.length > 0 && explicitActiveMockTargetKeys.size > 0 && (
                    <button
                      type="button"
                      onClick={() => onUpdateGoal?.(safeActiveGoalIndex, { targetTaskKeys: [] })}
                      className="rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-purple-700 hover:bg-purple-50"
                    >
                      Выбрать весь пробник
                    </button>
                  )}
                </div>

                {previewItems.length > 0 && (
                  <div
                    className={`teacher-homework-question-selector mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto pr-1 ${questionSelectionDragging ? 'is-dragging' : ''}`}
                    onPointerMove={handleQuestionSelectionDragMove}
                    onClickCapture={suppressQuestionSelectionClick}
                  >
                    {previewItems.map((item, index) => {
                      const number = activeGoalType === goalTypeTask ? index + 1 : item.label;
                      const solved = activeGoalType === goalTypeTask
                        && visibleSolvedQuestionIds.has(String(item.question?.id ?? index));
                      const selected = activeGoalType === goalTypeMock
                        ? selectedMockTargetSet.has(String(item.key))
                        : selectedTargetSet.has(Number(number));
                      const current = index === safePreviewIndex;
                      return (
                        <div
                          key={item.key}
                          data-homework-selection-kind={activeGoalType}
                          data-homework-selection-value={activeGoalType === goalTypeTask ? index + 1 : String(item.key)}
                          onPointerDown={(event) => beginQuestionSelectionDrag(
                            event,
                            activeGoalType === goalTypeTask ? index + 1 : item.key,
                            selected
                          )}
                          className={`teacher-homework-question-selector__item inline-flex overflow-hidden rounded-lg border transition ${
                            current
                              ? 'border-purple-500 ring-2 ring-purple-200'
                              : (selected ? 'border-purple-200' : 'border-slate-200')
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setPreviewIndex(index)}
                            className={`min-w-9 px-2 py-1.5 text-[11px] font-black ${
                              solved
                                ? 'bg-emerald-100 text-emerald-700'
                                : (selected ? 'bg-purple-600 text-white' : 'bg-[rgb(var(--surface))] text-[rgb(var(--ink-soft))]')
                            }`}
                            title={solved ? `Задание №${item.label} уже решено учеником` : `Показать задание №${item.label}`}
                          >
                            {item.label}
                          </button>
                          {(activeGoalType === goalTypeTask || activeGoalType === goalTypeMock) && (
                            <button
                              type="button"
                              onClick={() => (
                                activeGoalType === goalTypeMock
                                  ? toggleMockTarget(item.key)
                                  : toggleTargetNumber(index + 1)
                              )}
                              className={`inline-grid w-7 place-items-center border-l text-xs ${
                                selected
                                  ? 'border-purple-400 bg-purple-50 text-purple-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-400 hover:text-purple-600'
                              }`}
                              aria-label={selected ? `Убрать номер ${item.label} из домашки` : `Добавить номер ${item.label} в домашку`}
                              title={selected ? 'Убрать из ДЗ' : 'Добавить в ДЗ'}
                            >
                              {selected ? <Check size={12} /> : <Plus size={12} />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {previewItem ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-purple-500">
                        {activeGoalType === goalTypeMock ? `Задание ${previewItem.label}` : `Номер ${previewQuestionNumber}`}
                      </span>
                      <strong className="mt-0.5 block text-sm text-[rgb(var(--ink))]">
                        {getQuestionLabel(previewItem.question, 'Условие задания')}
                      </strong>
                    </div>
                    {(activeGoalType === goalTypeTask || activeGoalType === goalTypeMock) && (
                      <button
                        type="button"
                        onClick={() => (
                          activeGoalType === goalTypeMock
                            ? toggleMockTarget(previewItem.key)
                            : toggleTargetNumber(previewQuestionNumber)
                        )}
                        className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black transition ${
                          previewSelected
                            ? 'border-purple-300 bg-purple-600 text-white shadow-lg shadow-purple-500/15'
                            : 'border-slate-300 bg-[rgb(var(--surface))] text-[rgb(var(--ink-soft))] hover:border-purple-300 hover:text-purple-700'
                        }`}
                      >
                        {previewSelected ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                        {previewSelected ? 'Включено в ДЗ' : 'Добавить в ДЗ'}
                      </button>
                    )}
                  </div>

                  <QuestionCondition
                    question={previewItem.question}
                    label={`Задание ${previewItem.label}`}
                    onExpandImage={setExpandedImage}
                  />

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setPreviewIndex(Math.max(0, safePreviewIndex - 1))}
                      disabled={safePreviewIndex <= 0}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-3 text-xs font-bold text-[rgb(var(--ink-soft))] hover:border-purple-200 disabled:opacity-40"
                    >
                      <ArrowLeft size={14} /> Предыдущее
                    </button>
                    <span className="text-[11px] font-bold text-[rgb(var(--ink-soft))]">{safePreviewIndex + 1} / {previewItems.length}</span>
                    <button
                      type="button"
                      onClick={() => setPreviewIndex(Math.min(previewItems.length - 1, safePreviewIndex + 1))}
                      disabled={safePreviewIndex >= previewItems.length - 1}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-3 text-xs font-bold text-[rgb(var(--ink-soft))] hover:border-purple-200 disabled:opacity-40"
                    >
                      Следующее <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-[360px] place-items-center rounded-[24px] border border-dashed border-purple-200 bg-[rgb(var(--surface))]/70 px-8 text-center">
                  <div>
                    <BookOpen size={34} className="mx-auto text-purple-300" />
                    <strong className="mt-3 block text-sm text-[rgb(var(--ink))]">Условия будут здесь</strong>
                    <span className="mt-1 block max-w-xs text-xs leading-relaxed text-[rgb(var(--ink-soft))]">
                      Выберите слева раздел, уровень или пробник. Отдельную вкладку с базой открывать больше не нужно.
                    </span>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-[rgb(var(--surface))] px-4 py-3 sm:px-5 lg:px-6">
          <div
            className="flex min-w-0 items-center gap-2.5 text-xs text-[rgb(var(--ink-soft))]"
            aria-live="polite"
            title="Оценка видна только учителю. Для задания без собственного замера используется среднее того же номера и уровня."
          >
            <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-600">
              {questionTimingState === 'loading'
                ? <Loader2 size={16} className="animate-spin" />
                : <Clock3 size={16} />}
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-xs text-[rgb(var(--ink))]">{durationEstimateTitle}</strong>
              <small className="mt-0.5 block truncate text-[10px] text-[rgb(var(--ink-soft))]">{durationEstimateDetails}</small>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={composerBusy}
              className="min-h-11 rounded-xl border border-slate-200 bg-[rgb(var(--surface))] px-4 text-sm font-bold text-[rgb(var(--ink-soft))] hover:bg-[rgb(var(--surface-soft))] disabled:opacity-50"
            >
              {discarding ? 'Отменяем…' : 'Отмена'}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={composerBusy || preparing}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-5 text-sm font-black text-white shadow-lg shadow-purple-500/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:opacity-55"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving
                ? 'Сохраняем…'
                : (editing ? 'Сохранить изменения' : (isGroupTarget ? 'Назначить группе' : 'Задать домашку'))}
            </button>
          </div>
        </footer>
      </section>

      {expandedImage && (
        <div
          className="fixed inset-0 z-[1900] grid place-items-center bg-slate-950/90 p-4"
          onClick={() => setExpandedImage(null)}
          role="presentation"
        >
          <button
            type="button"
            onClick={() => setExpandedImage(null)}
            className="absolute right-4 top-4 inline-grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20"
            aria-label="Закрыть изображение"
          >
            <X size={20} />
          </button>
          <img
            src={expandedImage.resolvedUrl || getAttachmentUrl(expandedImage)}
            alt={expandedImage.name || 'Условие задания'}
            className="max-h-[92vh] max-w-[96vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export default TeacherHomeworkComposer;
