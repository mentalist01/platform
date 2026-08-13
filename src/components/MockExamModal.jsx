import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileDown,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import MockExamBadges, { MockExamBadgeSticker } from './MockExamBadges';
import MockChestOpeningOverlay from './MockChestOpeningOverlay';
import MockExamTimerConfirmDialog from './MockExamTimerConfirmDialog';
import { normalizeMockExamBadges } from '../utils/mockExamBadges';
import useMockExamTimerConfirmation from '../hooks/useMockExamTimerConfirmation';
import { subscribeQuestionSolveEnvironment } from '../hooks/useQuestionSolveTimer';
import { Button } from './ui';

const artifactImageModules = import.meta.glob('../assets/artefacts/**/*.png', { eager: true, import: 'default' });

const ARTIFACT_IMAGE_BY_ID = new Map(
  Object.entries(artifactImageModules)
    .map(([path, src]) => {
      const match = path.match(/\/artefacts\/[^/]+\/([^/]+)\.png$/);
      if (!match) return null;
      return [String(match[1] || '').trim(), src];
    })
    .filter(Boolean)
);

const MOCK_ARTIFACT_DROP_RANK_ORDER = ['S', 'A', 'B', 'C'];
const MOCK_ARTIFACT_SHARD_COUNT = 28;
const MOCK_ATTEMPT_MODE_CLASSIC = 'classic';
const MOCK_ATTEMPT_MODE_TIMER = 'timer';
const MOCK_EXAM_TIMER_DURATION_MS = 235 * 60 * 1000;
const MOCK_EXAM_ANSWER_DRAFT_PREFIX = 'mock-exam-answer-draft-v2';
const MOCK_EXAM_CLOSE_ANIMATION_MS = 340;
const MOCK_EXAM_COACH_NOTE_ROTATION_MS = 5 * 60 * 1000;
const MOCK_EXAM_COACH_NOTES = [
  {
    id: 'move-on',
    title: 'Не застревай на одном',
    text: 'Долго не получается — переходи дальше. Вернёшься на втором круге.',
  },
  {
    id: 'steady-pace',
    title: 'Держи ровный темп',
    text: 'Один сложный номер не должен забрать время у нескольких простых.',
  },
  {
    id: 'read-to-end',
    title: 'Дочитай вопрос до конца',
    text: 'Одно слово в условии иногда меняет весь ответ.',
  },
  {
    id: 'save-review-time',
    title: 'Оставь время на проверку',
    text: 'В конце вернись к пропускам и проверь формат ответов.',
  },
];

const MOCK_TASK_ACTIVE_DURATION_MAX_MS = 4 * 60 * 60 * 1000;

const normalizeMockTaskDurationsMs = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((result, [taskKey, rawDurationMs]) => {
    const key = String(taskKey || '').trim();
    const durationMs = Number(rawDurationMs);
    if (!key || !Number.isFinite(durationMs) || durationMs <= 0) return result;
    result[key] = Math.min(MOCK_TASK_ACTIVE_DURATION_MAX_MS, Math.max(1, Math.round(durationMs)));
    return result;
  }, {});
};

const getMockAnswerFieldLabel = (taskNumber, index) => {
  const numericTaskNumber = Number(taskNumber);
  if (numericTaskNumber === 20) return `20.${index + 1}`;
  if (numericTaskNumber === 25) return `Строка ${index + 1}`;
  return `Ответ ${index + 1}`;
};

const normalizeMockAttemptMode = (value, fallback = MOCK_ATTEMPT_MODE_CLASSIC) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === MOCK_ATTEMPT_MODE_TIMER) return MOCK_ATTEMPT_MODE_TIMER;
  if (normalized === MOCK_ATTEMPT_MODE_CLASSIC) return MOCK_ATTEMPT_MODE_CLASSIC;
  return fallback;
};

const normalizeMockExamTaskKeys = (taskKeys) => Array.from(new Set(
  (Array.isArray(taskKeys) ? taskKeys : [])
    .map((taskKey) => String(taskKey || '').trim())
    .filter(Boolean)
));

const buildMockExamDraftAttemptKey = ({ attempt, targetTaskKeys, scoped = false }) => {
  const attemptIdentity = [
    attempt?.attemptId ? `attempt:${String(attempt.attemptId).trim()}` : '',
    attempt?.homeworkId ? `homework:${String(attempt.homeworkId).trim()}` : '',
    attempt?.homeworkIssuedAt ? `issued:${String(attempt.homeworkIssuedAt).trim()}` : '',
    attempt?.timerStartedAt ? `timer:${String(attempt.timerStartedAt).trim()}` : '',
    attempt?.modeLockedAt ? `locked:${String(attempt.modeLockedAt).trim()}` : '',
  ].find(Boolean) || 'default';
  const normalizedTaskKeys = normalizeMockExamTaskKeys(targetTaskKeys)
    .sort((left, right) => left.localeCompare(right, 'ru', { numeric: true }));
  const scopeIdentity = scoped
    ? (normalizedTaskKeys.length > 0 ? normalizedTaskKeys.join(',') : 'none')
    : 'all';
  return `${attemptIdentity}|scope:${scopeIdentity}`;
};

const buildMockExamDraftKey = ({ studentId, examId, mode, attemptKey = 'default' }) => {
  const normalizedStudentId = String(studentId || 'anonymous').trim() || 'anonymous';
  const normalizedExamId = String(examId || '').trim() || 'exam';
  const normalizedMode = normalizeMockAttemptMode(mode);
  const normalizedAttemptKey = String(attemptKey || 'default').trim() || 'default';
  return `${MOCK_EXAM_ANSWER_DRAFT_PREFIX}:${normalizedStudentId}:${normalizedExamId}:${normalizedMode}:${encodeURIComponent(normalizedAttemptKey)}`;
};

const canUseMockExamDraftStorage = () => (
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
);

const hasMockExamDraftValue = (value) => {
  if (Array.isArray(value)) return value.some((entry) => String(entry ?? '').trim());
  return Boolean(String(value ?? '').trim());
};

const normalizeMockExamDraftAnswers = (answers) => {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {};
  return Object.entries(answers).reduce((acc, [taskKey, value]) => {
    const key = String(taskKey || '').trim();
    if (!key || !hasMockExamDraftValue(value)) return acc;
    acc[key] = Array.isArray(value)
      ? value.map((entry) => String(entry ?? ''))
      : String(value ?? '');
    return acc;
  }, {});
};

const filterMockExamAnswersToTaskKeys = (answers, targetTaskKeys, scoped = false) => {
  const source = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  if (!scoped) return { ...source };
  const allowedTaskKeys = new Set(normalizeMockExamTaskKeys(targetTaskKeys));
  return Object.entries(source).reduce((result, [taskKey, value]) => {
    const normalizedTaskKey = String(taskKey || '').trim();
    if (allowedTaskKeys.has(normalizedTaskKey)) result[normalizedTaskKey] = value;
    return result;
  }, {});
};

const readMockExamAnswerDraft = ({
  studentId,
  examId,
  mode,
  attemptKey,
  targetTaskKeys,
  scoped = false,
}) => {
  if (!canUseMockExamDraftStorage()) return {};
  const key = buildMockExamDraftKey({ studentId, examId, mode, attemptKey });
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    return filterMockExamAnswersToTaskKeys(
      normalizeMockExamDraftAnswers(parsed?.answers),
      targetTaskKeys,
      scoped
    );
  } catch {
    return {};
  }
};

const writeMockExamAnswerDraft = ({
  studentId,
  examId,
  mode,
  attemptKey,
  targetTaskKeys,
  scoped = false,
  answers,
}) => {
  if (!canUseMockExamDraftStorage() || !examId) return;
  const key = buildMockExamDraftKey({ studentId, examId, mode, attemptKey });
  const normalizedAnswers = normalizeMockExamDraftAnswers(
    filterMockExamAnswersToTaskKeys(answers, targetTaskKeys, scoped)
  );
  if (Object.keys(normalizedAnswers).length === 0) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    answers: normalizedAnswers,
  }));
};

const clearMockExamAnswerDraft = ({ studentId, examId, mode, attemptKey }) => {
  if (!canUseMockExamDraftStorage() || !examId) return;
  const key = buildMockExamDraftKey({ studentId, examId, mode, attemptKey });
  window.localStorage.removeItem(key);
};

const mergeMockExamAnswersWithDraft = (attemptAnswers, draftAnswers) => ({
  ...(attemptAnswers && typeof attemptAnswers === 'object' && !Array.isArray(attemptAnswers) ? attemptAnswers : {}),
  ...(draftAnswers && typeof draftAnswers === 'object' && !Array.isArray(draftAnswers) ? draftAnswers : {}),
});

const formatMockTimerDuration = (value) => {
  const totalSeconds = Math.max(0, Math.ceil(Number(value) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const getMockArtifactDropRankWeight = (rank) => {
  const index = MOCK_ARTIFACT_DROP_RANK_ORDER.indexOf(String(rank || '').trim().toUpperCase());
  return index >= 0 ? index : MOCK_ARTIFACT_DROP_RANK_ORDER.length;
};

const getFeaturedMockArtifactDrop = (saved) => {
  if (!saved || typeof saved !== 'object') return null;
  const drops = [
    ...(Array.isArray(saved.mockArtifactDrops) ? saved.mockArtifactDrops : []),
    saved.mockArtifactDrop,
  ].filter((drop) => drop && typeof drop === 'object' && String(drop.id || '').trim());
  if (drops.length <= 0) return null;
  return drops
    .slice()
    .sort((a, b) => getMockArtifactDropRankWeight(a.rank) - getMockArtifactDropRankWeight(b.rank))[0];
};

const getMockChestRewards = (saved) => (
  Array.isArray(saved?.mockChestRewards)
    ? saved.mockChestRewards.filter((reward) => reward && typeof reward === 'object')
    : []
);

const getMockArtifactRankClassName = (rank) => (
  String(rank || 'C').trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'c'
);

const getMockArtifactShardStyle = (index) => {
  const angle = Math.round((index * 137.5) % 360);
  const distance = 30 + ((index % 8) * 4) + (Math.floor(index / 8) * 5);
  const delay = (index % 10) * 42;
  const size = (0.36 + ((index % 6) * 0.07)).toFixed(2);
  return {
    '--angle': `${angle}deg`,
    '--distance': `${distance}vmin`,
    '--delay': `${delay}ms`,
    '--size': `${size}rem`,
  };
};

const MockExamModal = ({
  exam,
  studentId,
  initialAttempt,
  attemptMode = MOCK_ATTEMPT_MODE_CLASSIC,
  initialTaskNumber = null,
  targetTaskKeys = null,
  warnBeforeTimerClose = false,
  onClose,
  onAttemptSaved,
  onRestartTimerAttempt,
  onContinueTimerAttempt,
  MOCK_TASK_NUMBERS,
  getMockAnswerCountForTask,
  allowsPartialAnswers,
  getPrimaryScoreFromSolved,
  getSecondaryScoreFromPrimary,
  getLocalDayKey,
  withStudentId,
  theme = '',
}) => {
  const [selectedTask, setSelectedTask] = useState(MOCK_TASK_NUMBERS[0]);
  const [answers, setAnswers] = useState({});
  const [solved, setSolved] = useState({});
  const [results, setResults] = useState({});
  const [saveError, setSaveError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const [closing, setClosing] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [restartingTimer, setRestartingTimer] = useState(false);
  const [continuingTimer, setContinuingTimer] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [coachNoteIndex, setCoachNoteIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [successBurst, setSuccessBurst] = useState(null);
  const [artifactDropBurst, setArtifactDropBurst] = useState(null);
  const [chestOpeningRewards, setChestOpeningRewards] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [displayAttempt, setDisplayAttempt] = useState(() => (
    initialAttempt && typeof initialAttempt === 'object' ? initialAttempt : {}
  ));
  const {
    confirmationRequest: timerConfirmationRequest,
    requestTimerConfirmation,
    confirmTimerAction,
    cancelTimerAction,
  } = useMockExamTimerConfirmation();
  const hasLocalAttemptChangesRef = useRef(false);
  const skipNextDraftWriteRef = useRef(false);
  const latestInitialAttemptRef = useRef(initialAttempt);
  const autoAdvanceTimerRef = useRef(null);
  const successBurstTimerRef = useRef(null);
  const artifactDropTimerRef = useRef(null);
  const closeAnimationTimerRef = useRef(null);
  const modalCardRef = useRef(null);
  const compactTaskPickerRef = useRef(null);
  const questionScrollRef = useRef(null);
  const previousSelectedTaskRef = useRef(selectedTask);
  const finishConfirmDialogRef = useRef(null);
  const finishConfirmTriggerRef = useRef(null);
  const finishConfirmRestoreFrameRef = useRef(null);
  const taskDurationStateRef = useRef({
    durations: {},
    activeTaskKey: '',
    segmentStartedAt: null,
    environmentActive: true,
  });
  const normalizedTargetTaskKeys = useMemo(
    () => normalizeMockExamTaskKeys(targetTaskKeys),
    [targetTaskKeys]
  );
  const hasRequestedTaskScope = Array.isArray(targetTaskKeys);
  const modalTaskNumbers = useMemo(() => {
    const examTasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
    const available = (Array.isArray(MOCK_TASK_NUMBERS) ? MOCK_TASK_NUMBERS : [])
      .filter((taskNumber) => Boolean(examTasks[String(taskNumber)]));
    const requestedTaskKeys = new Set(normalizedTargetTaskKeys);
    if (hasRequestedTaskScope) {
      return available.filter((taskNumber) => requestedTaskKeys.has(String(taskNumber)));
    }
    return available.length > 0 ? available : (Array.isArray(MOCK_TASK_NUMBERS) ? MOCK_TASK_NUMBERS : []);
  }, [exam?.tasks, hasRequestedTaskScope, MOCK_TASK_NUMBERS, normalizedTargetTaskKeys]);
  const firstTaskNumber = modalTaskNumbers[0] ?? null;
  const activeAttempt = displayAttempt && typeof displayAttempt === 'object' ? displayAttempt : {};
  const effectiveAttemptMode = normalizeMockAttemptMode(activeAttempt?.mode, normalizeMockAttemptMode(attemptMode));
  const activeDraftAttemptKey = buildMockExamDraftAttemptKey({
    attempt: activeAttempt,
    targetTaskKeys: modalTaskNumbers,
    scoped: hasRequestedTaskScope,
  });
  const clearAnswerDraftForAttempt = (attempt = activeAttempt) => {
    const draftMode = normalizeMockAttemptMode(attempt?.mode, normalizeMockAttemptMode(attemptMode));
    clearMockExamAnswerDraft({
      studentId,
      examId: exam?.id,
      mode: draftMode,
      attemptKey: buildMockExamDraftAttemptKey({
        attempt,
        targetTaskKeys: modalTaskNumbers,
        scoped: hasRequestedTaskScope,
      }),
    });
  };
  const isTimerMode = effectiveAttemptMode === MOCK_ATTEMPT_MODE_TIMER;
  const rewardsDisabled = Boolean(exam?.rewardsDisabled || activeAttempt?.rewardsDisabled);
  const artifactHintText = rewardsDisabled
    ? 'Персональный пробник работает как тренировка: без опыта, монет, артефактов и сундуков.'
    : isTimerMode
      ? 'Артефакты выпадают только из сундуков за рубежи таймера.'
      : 'Артефакты не выпадают в обычном режиме. Запусти таймерный пробник и открывай сундуки за рубежи.';
  const timerPaused = isTimerMode && Boolean(String(activeAttempt?.timerPausedAt || '').trim()) && !String(activeAttempt?.timerFinishedAt || '').trim();
  const timerExpiresAtMs = isTimerMode ? Date.parse(String(activeAttempt?.timerExpiresAt || '')) : Number.NaN;
  const timerDurationMs = Math.max(60 * 1000, Math.floor(Number(activeAttempt?.timerDurationMs) || MOCK_EXAM_TIMER_DURATION_MS));
  const timerRemainingMs = timerPaused
    ? Math.max(0, Math.floor(Number(activeAttempt?.timerRemainingMs) || 0))
    : (isTimerMode && Number.isFinite(timerExpiresAtMs)
    ? Math.max(0, timerExpiresAtMs - nowMs)
    : timerDurationMs);
  const timerExpired = isTimerMode && (timerPaused || Number.isFinite(timerExpiresAtMs)) && timerRemainingMs <= 0;
  const timerLabel = formatMockTimerDuration(timerRemainingMs);

  const commitActiveTaskDuration = useCallback(() => {
    const state = taskDurationStateRef.current;
    if (!state.activeTaskKey || state.segmentStartedAt === null) return;
    const segmentDurationMs = Math.max(0, performance.now() - state.segmentStartedAt);
    state.durations[state.activeTaskKey] = Math.min(
      MOCK_TASK_ACTIVE_DURATION_MAX_MS,
      Math.max(0, Math.round((state.durations[state.activeTaskKey] || 0) + segmentDurationMs))
    );
    state.segmentStartedAt = null;
  }, []);

  const startActiveTaskDuration = useCallback(() => {
    const state = taskDurationStateRef.current;
    if (!state.environmentActive || !state.activeTaskKey || state.segmentStartedAt !== null) return;
    state.segmentStartedAt = performance.now();
  }, []);

  const getTaskDurationsForSave = useCallback(() => {
    commitActiveTaskDuration();
    const durations = normalizeMockTaskDurationsMs(taskDurationStateRef.current.durations);
    startActiveTaskDuration();
    return durations;
  }, [commitActiveTaskDuration, startActiveTaskDuration]);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => modalCardRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [exam?.id]);

  const readAttemptAnswers = useCallback((attempt) => (
    attempt?.answers && typeof attempt.answers === 'object' ? attempt.answers : {}
  ), []);
  const readAttemptSolved = useCallback((attempt) => (
    attempt?.solved && typeof attempt.solved === 'object' ? attempt.solved : {}
  ), []);
  const isTimerAttemptFinished = useCallback((attempt) => (
    Boolean(String(attempt?.timerFinishedAt || '').trim())
  ), []);
  const readAttemptResults = useCallback((attempt) => {
    const attemptIsFinished = Boolean(
      isTimerAttemptFinished(attempt)
      || String(attempt?.finishedAt || '').trim()
      || String(attempt?.status || '').trim().toLowerCase() === 'finished'
    );
    if (!attemptIsFinished) return {};
    const solvedMap = readAttemptSolved(attempt);
    return modalTaskNumbers.reduce((acc, taskNumber) => {
      const key = String(taskNumber);
      if (Object.prototype.hasOwnProperty.call(solvedMap, key)) {
        acc[key] = Boolean(solvedMap[key]);
      }
      return acc;
    }, {});
  }, [isTimerAttemptFinished, modalTaskNumbers, readAttemptSolved]);

  const getNextUnsolvedTask = (solvedMap = solved, fromTask = selectedTask) => {
    const currentIndex = Math.max(0, modalTaskNumbers.indexOf(fromTask));
    const orderedTasks = [
      ...modalTaskNumbers.slice(currentIndex + 1),
      ...modalTaskNumbers.slice(0, currentIndex),
    ];
    return orderedTasks.find((taskNumber) => (
      exam?.tasks?.[String(taskNumber)] && !solvedMap?.[String(taskNumber)]
    )) || null;
  };

  useEffect(() => {
    latestInitialAttemptRef.current = initialAttempt;
  }, [initialAttempt]);

  useEffect(() => {
    hasLocalAttemptChangesRef.current = false;
    if (closeAnimationTimerRef.current) {
      window.clearTimeout(closeAnimationTimerRef.current);
      closeAnimationTimerRef.current = null;
    }
    const nextAttempt = latestInitialAttemptRef.current && typeof latestInitialAttemptRef.current === 'object'
      ? latestInitialAttemptRef.current
      : {};
    taskDurationStateRef.current = {
      durations: normalizeMockTaskDurationsMs(nextAttempt?.taskDurationsMs),
      activeTaskKey: '',
      segmentStartedAt: null,
      environmentActive: document.visibilityState !== 'hidden' && document.hasFocus(),
    };
    setDisplayAttempt(nextAttempt);
    const nextMode = normalizeMockAttemptMode(nextAttempt?.mode, normalizeMockAttemptMode(attemptMode));
    const nextDraftAttemptKey = buildMockExamDraftAttemptKey({
      attempt: nextAttempt,
      targetTaskKeys: modalTaskNumbers,
      scoped: hasRequestedTaskScope,
    });
    setAnswers(filterMockExamAnswersToTaskKeys(
      mergeMockExamAnswersWithDraft(
        readAttemptAnswers(nextAttempt),
        readMockExamAnswerDraft({
          studentId,
          examId: exam?.id,
          mode: nextMode,
          attemptKey: nextDraftAttemptKey,
          targetTaskKeys: modalTaskNumbers,
          scoped: hasRequestedTaskScope,
        })
      ),
      modalTaskNumbers,
      hasRequestedTaskScope
    ));
    setSolved(readAttemptSolved(nextAttempt));
    setResults(readAttemptResults(nextAttempt));
    setSaveError('');
    setSaveStatus('');
    setChecking(false);
    setClosing(false);
    setIsExiting(false);
    setRestartingTimer(false);
    setContinuingTimer(false);
    setArtifactDropBurst(null);
    setChestOpeningRewards([]);
    setFinishConfirmOpen(false);
    const requestedTask = String(initialTaskNumber ?? '').trim();
    const initialTask = requestedTask
      ? modalTaskNumbers.find((taskNumber) => String(taskNumber) === requestedTask)
      : null;
    const nextSelectedTask = initialTask || firstTaskNumber;
    previousSelectedTaskRef.current = nextSelectedTask;
    setSelectedTask(nextSelectedTask);
  }, [attemptMode, exam?.id, studentId, firstTaskNumber, hasRequestedTaskScope, initialTaskNumber, modalTaskNumbers, readAttemptAnswers, readAttemptResults, readAttemptSolved]);

  useEffect(() => {
    if (hasLocalAttemptChangesRef.current) return;
    const nextAttempt = initialAttempt && typeof initialAttempt === 'object' ? initialAttempt : {};
    setDisplayAttempt(nextAttempt);
    const nextMode = normalizeMockAttemptMode(nextAttempt?.mode, normalizeMockAttemptMode(attemptMode));
    const nextDraftAttemptKey = buildMockExamDraftAttemptKey({
      attempt: nextAttempt,
      targetTaskKeys: modalTaskNumbers,
      scoped: hasRequestedTaskScope,
    });
    setAnswers(filterMockExamAnswersToTaskKeys(
      mergeMockExamAnswersWithDraft(
        readAttemptAnswers(nextAttempt),
        readMockExamAnswerDraft({
          studentId,
          examId: exam?.id,
          mode: nextMode,
          attemptKey: nextDraftAttemptKey,
          targetTaskKeys: modalTaskNumbers,
          scoped: hasRequestedTaskScope,
        })
      ),
      modalTaskNumbers,
      hasRequestedTaskScope
    ));
    setSolved(readAttemptSolved(nextAttempt));
    setResults(readAttemptResults(nextAttempt));
    setSaveError('');
    setSaveStatus('');
  }, [attemptMode, exam?.id, hasRequestedTaskScope, initialAttempt, modalTaskNumbers, readAttemptAnswers, readAttemptResults, readAttemptSolved, studentId]);

  useEffect(() => {
    if (skipNextDraftWriteRef.current) {
      skipNextDraftWriteRef.current = false;
      return;
    }
    writeMockExamAnswerDraft({
      studentId,
      examId: exam?.id,
      mode: effectiveAttemptMode,
      attemptKey: activeDraftAttemptKey,
      targetTaskKeys: modalTaskNumbers,
      scoped: hasRequestedTaskScope,
      answers,
    });
  }, [activeDraftAttemptKey, answers, effectiveAttemptMode, exam?.id, hasRequestedTaskScope, modalTaskNumbers, studentId]);

  useEffect(() => {
    if (!isTimerMode || timerPaused) return undefined;
    setNowMs(Date.now());
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [isTimerMode, timerPaused, activeAttempt?.timerExpiresAt]);

  useEffect(() => {
    setCoachNoteIndex(0);
    if (!isTimerMode || MOCK_EXAM_COACH_NOTES.length <= 1) return undefined;
    const rotationTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setCoachNoteIndex((currentIndex) => (
        (currentIndex + 1) % MOCK_EXAM_COACH_NOTES.length
      ));
    }, MOCK_EXAM_COACH_NOTE_ROTATION_MS);
    return () => window.clearInterval(rotationTimer);
  }, [exam?.id, isTimerMode]);

  useEffect(() => {
    setSaveError('');
    setSaveStatus('');
  }, [selectedTask]);

  useEffect(() => {
    if (questionScrollRef.current) questionScrollRef.current.scrollTop = 0;
    commitActiveTaskDuration();
    taskDurationStateRef.current.activeTaskKey = selectedTask == null ? '' : String(selectedTask);
    startActiveTaskDuration();
    const previousTask = previousSelectedTaskRef.current;
    previousSelectedTaskRef.current = selectedTask;
    if (previousTask === selectedTask) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const card = modalCardRef.current;
      const taskbar = card?.querySelector('.mock-exam-modal-card__taskbar');
      if (!card || !taskbar || card.scrollHeight <= card.clientHeight + 1) return;
      const cardRect = card.getBoundingClientRect();
      const taskbarRect = taskbar.getBoundingClientRect();
      const nextScrollTop = card.scrollTop + taskbarRect.top - cardRect.top - 8;
      card.scrollTo({
        top: Math.max(0, nextScrollTop),
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [commitActiveTaskDuration, exam?.id, selectedTask, startActiveTaskDuration]);

  useEffect(() => {
    const setEnvironmentActive = (active) => {
      const state = taskDurationStateRef.current;
      if (state.environmentActive === active) return;
      commitActiveTaskDuration();
      state.environmentActive = active;
      if (active) startActiveTaskDuration();
    };
    const unsubscribe = subscribeQuestionSolveEnvironment(setEnvironmentActive);
    return () => {
      commitActiveTaskDuration();
      unsubscribe();
    };
  }, [commitActiveTaskDuration, startActiveTaskDuration]);

  useEffect(() => {
    const picker = compactTaskPickerRef.current;
    if (!picker) return undefined;
    let frameId = null;
    const centerSelectedButton = (behavior = 'auto') => {
      if (picker.offsetParent === null || picker.clientWidth <= 0) return;
      const selectedButton = picker.querySelector(`[data-mock-task-number="${selectedTask}"]`);
      if (!selectedButton) return;
      const pickerRect = picker.getBoundingClientRect();
      const buttonRect = selectedButton.getBoundingClientRect();
      const nextScrollLeft = picker.scrollLeft
        + (buttonRect.left - pickerRect.left)
        - ((pickerRect.width - buttonRect.width) / 2);
      picker.scrollTo({
        left: Math.max(0, nextScrollLeft),
        behavior,
      });
    };
    const queueCenter = (behavior = 'auto') => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        centerSelectedButton(behavior);
      });
    };
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    queueCenter(reduceMotion ? 'auto' : 'smooth');
    const resizeObserver = typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(() => queueCenter('auto'))
      : null;
    resizeObserver?.observe(picker);
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
    };
  }, [selectedTask]);

  useEffect(() => () => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (successBurstTimerRef.current) {
      clearTimeout(successBurstTimerRef.current);
      successBurstTimerRef.current = null;
    }
    if (artifactDropTimerRef.current) {
      clearTimeout(artifactDropTimerRef.current);
      artifactDropTimerRef.current = null;
    }
    if (closeAnimationTimerRef.current) {
      clearTimeout(closeAnimationTimerRef.current);
      closeAnimationTimerRef.current = null;
    }
    if (finishConfirmRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(finishConfirmRestoreFrameRef.current);
      finishConfirmRestoreFrameRef.current = null;
    }
  }, []);

  const triggerSuccessBurst = (burstTaskKey) => {
    const burstId = `${burstTaskKey}-${Date.now()}`;
    if (successBurstTimerRef.current) clearTimeout(successBurstTimerRef.current);
    setSuccessBurst({ id: burstId, taskKey: burstTaskKey });
    successBurstTimerRef.current = setTimeout(() => {
      setSuccessBurst((current) => (current?.id === burstId ? null : current));
      successBurstTimerRef.current = null;
    }, 1650);
  };

  const triggerArtifactDropBurst = (drop) => {
    const artifactId = String(drop?.id || '').trim();
    if (!artifactId) return;
    const burstId = `${artifactId}-${Date.now()}`;
    if (successBurstTimerRef.current) {
      clearTimeout(successBurstTimerRef.current);
      successBurstTimerRef.current = null;
    }
    if (artifactDropTimerRef.current) clearTimeout(artifactDropTimerRef.current);
    setSuccessBurst(null);
    setArtifactDropBurst({ id: burstId, artifact: drop });
    artifactDropTimerRef.current = setTimeout(() => {
      setArtifactDropBurst((current) => (current?.id === burstId ? null : current));
      artifactDropTimerRef.current = null;
    }, 3900);
  };

  const taskKey = String(selectedTask);
  const currentQuestion = exam?.tasks?.[taskKey];
  const answerCount = getMockAnswerCountForTask(selectedTask);
  const rawAnswer = answers[taskKey];
  const currentAnswers = Array.isArray(rawAnswer)
    ? rawAnswer
    : (typeof rawAnswer === 'string'
      ? [rawAnswer, ...Array.from({ length: Math.max(0, answerCount - 1) }, () => '')]
      : Array.from({ length: answerCount }, () => '')
    );
  const singleAnswer = typeof rawAnswer === 'string'
    ? rawAnswer
    : (Array.isArray(rawAnswer) ? (rawAnswer[0] ?? '') : '');
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const files = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
  const getFilledAnswerCountForTask = (taskNumber, answersMap = answers) => {
    const key = String(taskNumber);
    const count = getMockAnswerCountForTask(taskNumber);
    const value = answersMap?.[key];
    const values = Array.isArray(value)
      ? value
      : (typeof value === 'string'
        ? [value, ...Array.from({ length: Math.max(0, count - 1) }, () => '')]
        : Array.from({ length: count }, () => '')
      );
    return values
      .slice(0, count)
      .filter((entry) => String(entry ?? '').trim()).length;
  };
  const hasAnswerForTask = (taskNumber, answersMap = answers) => {
    const count = getMockAnswerCountForTask(taskNumber);
    const filledCount = getFilledAnswerCountForTask(taskNumber, answersMap);
    if (count <= 1) return filledCount > 0;
    return allowsPartialAnswers(taskNumber)
      ? filledCount > 0
      : filledCount >= count;
  };
  const questionText = String(currentQuestion?.question || '').trim();
  const hasQuestionText = Boolean(questionText);
  const questionLineCount = hasQuestionText ? questionText.split(/\r?\n/).length : 0;
  const hasCompactQuestion = Boolean(
    hasQuestionText
    && screenshots.length === 0
    && files.length === 0
    && questionText.length <= 520
    && questionLineCount <= 10
  );
  const screenshotMaxHeightClass = hasQuestionText
    ? 'max-h-[30vh] sm:max-h-[36vh] lg:max-h-[42vh] xl:max-h-[50vh]'
    : 'max-h-[36vh] sm:max-h-[44vh] lg:max-h-[50vh] xl:max-h-[58vh]';
  const shouldFitSingleScreenshot = !hasQuestionText && screenshots.length === 1;
  const isDarkTheme = String(theme || '').trim().toLowerCase() === 'dark';
  const stickerSurface = isDarkTheme ? 'dark' : 'light';
  const examBadges = normalizeMockExamBadges(exam?.badges);
  const primaryBadge = examBadges[0] || null;
  const secondaryBadges = examBadges.slice(1);
  const totalTaskCount = modalTaskNumbers.length;
  const attemptFinished = Boolean(
    String(activeAttempt?.finishedAt || '').trim()
    || String(activeAttempt?.status || '').trim().toLowerCase() === 'finished'
  );
  const timerAttemptFinished = isTimerAttemptFinished(activeAttempt);
  const timerResultsVisible = isTimerMode && (
    timerAttemptFinished
    || attemptFinished
    || Object.keys(results || {}).length >= Math.max(1, totalTaskCount)
  );
  const timerInputsLocked = isTimerMode && (timerResultsVisible || timerExpired);
  const inputsLocked = attemptFinished || timerInputsLocked || closing || isExiting;
  const visibleSolvedSource = isTimerMode && !timerResultsVisible ? {} : solved;
  const visibleSolved = modalTaskNumbers.reduce((result, taskNumber) => {
    const key = String(taskNumber);
    if (Object.prototype.hasOwnProperty.call(visibleSolvedSource || {}, key)) {
      result[key] = Boolean(visibleSolvedSource[key]);
    }
    return result;
  }, {});
  const isCurrentTaskAnswered = hasAnswerForTask(selectedTask);
  const currentFilledAnswerCount = getFilledAnswerCountForTask(selectedTask);
  const isCurrentTaskSolved = Boolean(visibleSolved[taskKey]);
  const allowPartialForTask = answerCount > 1 ? allowsPartialAnswers(selectedTask) : false;
  const hasLargeAnswerGrid = answerCount > 6;
  const answerFieldLabels = Array.from(
    { length: answerCount },
    (_, index) => getMockAnswerFieldLabel(selectedTask, index)
  );
  const isAnswerReady = isCurrentTaskAnswered;
  const answeredCount = modalTaskNumbers.filter((taskNumber) => hasAnswerForTask(taskNumber)).length;
  const solvedCount = Object.values(visibleSolved || {}).filter(Boolean).length;
  const primaryScore = getPrimaryScoreFromSolved(visibleSolved);
  const secondaryScore = getSecondaryScoreFromPrimary(primaryScore);
  const displayProgressCount = isTimerMode && !timerResultsVisible ? answeredCount : solvedCount;
  const currentTaskStatusLabel = isTimerMode && !timerResultsVisible
    ? (
        answerCount > 1 && currentFilledAnswerCount > 0
          ? `${currentFilledAnswerCount} из ${answerCount} введено`
          : (isCurrentTaskAnswered ? 'Заполнено' : 'Открыто')
      )
    : (isCurrentTaskSolved ? 'Решено' : 'Открыто');
  const currentCoachNote = MOCK_EXAM_COACH_NOTES[
    coachNoteIndex % MOCK_EXAM_COACH_NOTES.length
  ];
  const selectedTaskIndex = Math.max(0, modalTaskNumbers.indexOf(selectedTask));
  const progressPercent = totalTaskCount > 0
    ? Math.min(100, Math.round((displayProgressCount / totalTaskCount) * 100))
    : 0;
  const isFirstTask = selectedTaskIndex <= 0;
  const isLastTask = selectedTaskIndex >= totalTaskCount - 1;
  const getNextUnansweredTask = (fromTask = selectedTask) => {
    const currentIndex = Math.max(0, modalTaskNumbers.indexOf(fromTask));
    const orderedTasks = [
      ...modalTaskNumbers.slice(currentIndex + 1),
      ...modalTaskNumbers.slice(0, currentIndex),
    ];
    return orderedTasks.find((taskNumber) => (
      exam?.tasks?.[String(taskNumber)] && !hasAnswerForTask(taskNumber)
    )) || null;
  };
  const nextUnsolvedTask = isTimerMode && !timerResultsVisible
    ? getNextUnansweredTask(selectedTask)
    : getNextUnsolvedTask(visibleSolved, selectedTask);
  const canCheck = Boolean(
    currentQuestion
    && studentId
    && isAnswerReady
    && !checking
    && !timerExpired
    && !isTimerMode
    && !attemptFinished
  );
  const canFinishExam = Boolean(
    currentQuestion
    && studentId
    && !checking
    && !closing
    && !restartingTimer
    && !attemptFinished
    && (!isTimerMode || !timerResultsVisible)
  );

  useEffect(() => {
    if (!canFinishExam) setFinishConfirmOpen(false);
  }, [canFinishExam]);

  const handlePrevTask = () => {
    if (isFirstTask) return;
    setSelectedTask(modalTaskNumbers[selectedTaskIndex - 1]);
  };

  const handleNextTask = () => {
    if (isLastTask) return;
    setSelectedTask(modalTaskNumbers[selectedTaskIndex + 1]);
  };

  const handleNextUnsolvedTask = () => {
    if (!nextUnsolvedTask) return;
    setSelectedTask(nextUnsolvedTask);
  };

  const handleCheck = async (event) => {
    if (!currentQuestion || !studentId || !isAnswerReady || checking || timerExpired || isTimerMode || attemptFinished) return;
    const buttonRect = event?.currentTarget?.getBoundingClientRect?.();
    const sourceRect = (
      buttonRect
      && Number.isFinite(buttonRect.left)
      && Number.isFinite(buttonRect.top)
      && Number.isFinite(buttonRect.width)
      && Number.isFinite(buttonRect.height)
    )
      ? {
        left: buttonRect.left,
        top: buttonRect.top,
        width: buttonRect.width,
        height: buttonRect.height,
      }
      : null;
    hasLocalAttemptChangesRef.current = true;
    setSaveError('');
    setSaveStatus('');
    setChecking(true);
    try {
      const saved = await api.saveMockAttempt(studentId, exam.id, {
        answers,
        taskDurationsMs: getTaskDurationsForSave(),
        mode: effectiveAttemptMode,
        localDay: typeof getLocalDayKey === 'function' ? getLocalDayKey() : undefined,
      });
      if (saved && typeof saved === 'object') {
        skipNextDraftWriteRef.current = true;
        clearAnswerDraftForAttempt(activeAttempt);
        clearAnswerDraftForAttempt(saved);
        setDisplayAttempt(saved);
        setAnswers(filterMockExamAnswersToTaskKeys(
          readAttemptAnswers(saved),
          modalTaskNumbers,
          hasRequestedTaskScope
        ));
        const savedSolved = readAttemptSolved(saved);
        const isCorrect = Boolean(savedSolved[taskKey]);
        setSolved(savedSolved);
        setResults((prev) => ({ ...prev, [taskKey]: isCorrect }));
        const mockChestRewards = getMockChestRewards(saved);
        const mockArtifactDrop = mockChestRewards.length > 0 ? null : getFeaturedMockArtifactDrop(saved);
        if (mockChestRewards.length > 0) {
          setChestOpeningRewards(mockChestRewards);
        } else if (mockArtifactDrop) {
          triggerArtifactDropBurst(mockArtifactDrop);
        } else if (isCorrect) {
          triggerSuccessBurst(taskKey);
        }
          const timerChestsGained = Math.max(0, Math.floor(Number(saved?.timerChestsGained) || 0));
          setSaveStatus(
            timerChestsGained > 0
              ? `Верно! Получено сундуков: ${timerChestsGained}. Они ждут в рейтинге.`
              : (isCorrect ? 'Ответ верный и сохранён.' : 'Ответ сохранён, но пока неверный.')
          );
        onAttemptSaved?.(exam.id, saved, { sourceRect });
        const nextTaskAfterSave = getNextUnsolvedTask(savedSolved, selectedTask);
        if (autoAdvance && isCorrect && nextTaskAfterSave) {
          if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
          autoAdvanceTimerRef.current = setTimeout(() => {
            setSelectedTask(nextTaskAfterSave);
            autoAdvanceTimerRef.current = null;
          }, 1250);
        }
      }
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message : '';
      setSaveError(message || 'Не удалось сохранить ответ. Попробуйте снова.');
    } finally {
      setChecking(false);
    }
  };

  const handleRequestFinishExam = (event) => {
    if (!canFinishExam) return;
    finishConfirmTriggerRef.current = event?.currentTarget || document.activeElement;
    setSaveError('');
    setFinishConfirmOpen(true);
  };

  const dismissFinishConfirm = useCallback(() => {
    if (checking) return;
    setFinishConfirmOpen(false);
    if (finishConfirmRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(finishConfirmRestoreFrameRef.current);
    }
    finishConfirmRestoreFrameRef.current = window.requestAnimationFrame(() => {
      finishConfirmRestoreFrameRef.current = null;
      finishConfirmTriggerRef.current?.focus?.();
    });
  }, [checking]);

  useEffect(() => {
    if (!finishConfirmOpen) return undefined;
    const dialog = finishConfirmDialogRef.current;
    if (!dialog) return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      dialog.querySelector('[data-mock-confirm-autofocus]')?.focus?.();
    });
    const handleConfirmKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissFinishConfirm();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === firstFocusable || !dialog.contains(activeElement))) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && (activeElement === lastFocusable || !dialog.contains(activeElement))) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };
    document.addEventListener('keydown', handleConfirmKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleConfirmKeyDown);
    };
  }, [dismissFinishConfirm, finishConfirmOpen]);

  const handleFinishExam = async (event) => {
    if (!canFinishExam) return;
    const buttonRect = event?.currentTarget?.getBoundingClientRect?.();
    const sourceRect = (
      buttonRect
      && Number.isFinite(buttonRect.left)
      && Number.isFinite(buttonRect.top)
      && Number.isFinite(buttonRect.width)
      && Number.isFinite(buttonRect.height)
    )
      ? {
        left: buttonRect.left,
        top: buttonRect.top,
        width: buttonRect.width,
        height: buttonRect.height,
      }
      : null;
    hasLocalAttemptChangesRef.current = true;
    setFinishConfirmOpen(false);
    finishConfirmTriggerRef.current = null;
    window.requestAnimationFrame(() => modalCardRef.current?.focus?.());
    setSaveError('');
    setSaveStatus('');
    setChecking(true);
    try {
      const saved = await api.saveMockAttempt(studentId, exam.id, {
        answers,
        taskDurationsMs: getTaskDurationsForSave(),
        mode: effectiveAttemptMode,
        finishAttempt: true,
        ...(isTimerMode ? { finishTimerExam: true } : {}),
        localDay: typeof getLocalDayKey === 'function' ? getLocalDayKey() : undefined,
      });
      if (saved && typeof saved === 'object') {
        skipNextDraftWriteRef.current = true;
        clearAnswerDraftForAttempt(activeAttempt);
        clearAnswerDraftForAttempt(saved);
        const savedSolved = readAttemptSolved(saved);
        setDisplayAttempt(saved);
        setAnswers(filterMockExamAnswersToTaskKeys(
          readAttemptAnswers(saved),
          modalTaskNumbers,
          hasRequestedTaskScope
        ));
        latestInitialAttemptRef.current = saved;
        const nextResults = modalTaskNumbers.reduce((acc, taskNumber) => {
          const key = String(taskNumber);
          acc[key] = Boolean(savedSolved[key]);
          return acc;
        }, {});
        setSolved(savedSolved);
        setResults(nextResults);
        const mockChestRewards = getMockChestRewards(saved);
        const mockArtifactDrop = mockChestRewards.length > 0 ? null : getFeaturedMockArtifactDrop(saved);
        if (mockChestRewards.length > 0) {
          setChestOpeningRewards(mockChestRewards);
        } else if (mockArtifactDrop) {
          triggerArtifactDropBurst(mockArtifactDrop);
        }
        const savedSecondaryScore = getSecondaryScoreFromPrimary(getPrimaryScoreFromSolved(savedSolved));
        const timerChestsGained = Math.max(0, Math.floor(Number(saved?.timerChestsGained) || 0));
        setSaveStatus(
          saved?.timerRewardsDisabled
            ? `Пробник завершён и заморожен. Баллы: ${savedSecondaryScore}. Награды таймера отключены.`
            : (timerChestsGained > 0
              ? `Пробник завершён и заморожен. Баллы: ${savedSecondaryScore}. Получено сундуков: ${timerChestsGained}. Они ждут в рейтинге.`
              : `Пробник завершён и заморожен. Баллы: ${savedSecondaryScore}.`)
        );
        onAttemptSaved?.(exam.id, saved, { sourceRect });
      }
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message : '';
      setSaveError(message || 'Не удалось завершить экзамен. Попробуйте снова.');
    } finally {
      setChecking(false);
    }
  };

  const closeWithAnimation = () => {
    if (isExiting) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduceMotion) {
      onClose?.();
      return;
    }

    setIsExiting(true);
    closeAnimationTimerRef.current = window.setTimeout(() => {
      closeAnimationTimerRef.current = null;
      onClose?.();
    }, MOCK_EXAM_CLOSE_ANIMATION_MS);
  };

  const handleClose = async () => {
    if (restartingTimer || closing || isExiting) return;
    if (
      warnBeforeTimerClose
      && isTimerMode
      && !timerResultsVisible
      && !timerExpired
      && !await requestTimerConfirmation({
        kind: 'close',
        examTitle: exam?.title || '',
        remainingLabel: timerLabel,
      })
    ) return;
    if (!isTimerMode || timerResultsVisible || !studentId) {
      closeWithAnimation();
      return;
    }
    setClosing(true);
    setSaveError('');
    setSaveStatus('Сохраняем ответы. Таймер продолжает идти...');
    try {
      const saved = await api.saveMockTimerProgress(studentId, exam.id, {
        answers,
        taskDurationsMs: getTaskDurationsForSave(),
        mode: effectiveAttemptMode,
        localDay: typeof getLocalDayKey === 'function' ? getLocalDayKey() : undefined,
      });
      if (saved && typeof saved === 'object') {
        onAttemptSaved?.(exam.id, saved);
      }
      skipNextDraftWriteRef.current = true;
      clearAnswerDraftForAttempt(activeAttempt);
      if (saved && typeof saved === 'object') clearAnswerDraftForAttempt(saved);
    } catch {
      // The local draft remains available if the server cannot save during closing.
    } finally {
      setClosing(false);
      closeWithAnimation();
    }
  };

  const canRestartTimerExam = Boolean(
    isTimerMode
    && (timerExpired || timerResultsVisible)
    && typeof onRestartTimerAttempt === 'function'
    && !checking
    && !closing
    && !restartingTimer
  );
  const shouldShowContinueTimerExam = Boolean(
    isTimerMode
    && timerAttemptFinished
    && !attemptFinished
    && typeof onContinueTimerAttempt === 'function'
  );
  const canContinueTimerExam = Boolean(
    shouldShowContinueTimerExam
    && !checking
    && !closing
    && !restartingTimer
    && !continuingTimer
  );

  const handleRestartTimerExam = async () => {
    if (!canRestartTimerExam) return;
    if (!await requestTimerConfirmation({
      kind: 'restart',
      examTitle: exam?.title || '',
    })) return;
    hasLocalAttemptChangesRef.current = false;
    setRestartingTimer(true);
    setSaveError('');
    setSaveStatus('Запускаем новый таймер без наград...');
    try {
      const restarted = await onRestartTimerAttempt?.();
      if (restarted && typeof restarted === 'object') {
        skipNextDraftWriteRef.current = true;
        clearAnswerDraftForAttempt(activeAttempt);
        clearAnswerDraftForAttempt(restarted);
        latestInitialAttemptRef.current = restarted;
        setDisplayAttempt(restarted);
        setAnswers(filterMockExamAnswersToTaskKeys(
          readAttemptAnswers(restarted),
          modalTaskNumbers,
          hasRequestedTaskScope
        ));
        setSolved(readAttemptSolved(restarted));
        setResults(readAttemptResults(restarted));
        setChestOpeningRewards([]);
        setArtifactDropBurst(null);
        setSuccessBurst(null);
        setNowMs(Date.now());
        setSelectedTask(firstTaskNumber);
        setSaveStatus('Новый таймер запущен без наград.');
      }
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message : '';
      setSaveError(message || 'Не удалось запустить повторный таймер.');
      setSaveStatus('');
    } finally {
      setRestartingTimer(false);
    }
  };

  const handleContinueTimerExam = async () => {
    if (!canContinueTimerExam) return;
    setContinuingTimer(true);
    setSaveError('');
    setSaveStatus('Открываем экзамен для продолжения...');
    try {
      const continued = await onContinueTimerAttempt?.();
      if (continued && typeof continued === 'object') {
        skipNextDraftWriteRef.current = true;
        clearAnswerDraftForAttempt(activeAttempt);
        clearAnswerDraftForAttempt(continued);
        latestInitialAttemptRef.current = continued;
        setDisplayAttempt(continued);
        setAnswers(filterMockExamAnswersToTaskKeys(
          readAttemptAnswers(continued),
          modalTaskNumbers,
          hasRequestedTaskScope
        ));
        setSolved(readAttemptSolved(continued));
        setResults(readAttemptResults(continued));
        setNowMs(Date.now());
        setFinishConfirmOpen(false);
        setSaveStatus('Экзамен снова открыт для продолжения.');
      } else {
        setSaveStatus('');
      }
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message : '';
      setSaveError(message || 'Не удалось продолжить экзамен.');
      setSaveStatus('');
    } finally {
      setContinuingTimer(false);
    }
  };

  const handleAnswerKeyDown = (event, answerIndex = 0) => {
    if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    if (
      isTimerMode
      && allowPartialForTask
      && (event.ctrlKey || event.metaKey)
      && isAnswerReady
    ) {
      if (!isLastTask) handleNextTask();
      return;
    }
    if (answerCount > 1 && answerIndex < answerCount - 1) {
      const nextInput = event.currentTarget
        ?.closest('[data-mock-answer-grid]')
        ?.querySelector(`[data-mock-answer-index="${answerIndex + 1}"]`);
      nextInput?.focus?.();
      return;
    }
    if (isTimerMode) {
      if (isAnswerReady && !isLastTask) handleNextTask();
      return;
    }
    handleCheck(event);
  };

  const shellClassName = isTimerMode
    ? (isDarkTheme ? 'border-slate-600/70 text-slate-100' : 'border-slate-300/80 text-slate-900')
    : (isDarkTheme
      ? 'border-white/10 text-slate-100'
      : 'border-purple-100/70 text-slate-900');
  const shellStyle = isTimerMode
    ? (isDarkTheme
      ? {
        background: [
          'radial-gradient(circle at 8% 0%, rgba(45, 212, 191, 0.11), transparent 29%)',
          'radial-gradient(circle at 100% 0%, rgba(96, 165, 250, 0.1), transparent 28%)',
          'linear-gradient(180deg, rgba(8, 20, 31, 0.995), rgba(12, 27, 40, 0.99))',
        ].join(', '),
      }
      : {
        background: [
          'radial-gradient(circle at 7% 0%, rgba(20, 184, 166, 0.075), transparent 30%)',
          'radial-gradient(circle at 100% 0%, rgba(59, 130, 246, 0.06), transparent 27%)',
          'linear-gradient(180deg, rgba(248, 250, 249, 0.995), rgba(239, 244, 246, 0.985))',
        ].join(', '),
      })
    : (isDarkTheme
      ? {
        background: [
          'radial-gradient(circle at 0% 0%, rgba(124, 58, 237, 0.24), transparent 28%)',
          'radial-gradient(circle at 100% 0%, rgba(56, 189, 248, 0.16), transparent 24%)',
          'linear-gradient(180deg, rgba(7, 17, 31, 0.98), rgba(12, 23, 40, 0.98))',
        ].join(', '),
      }
      : {
        background: [
          'radial-gradient(circle at 0% 0%, rgba(168, 85, 247, 0.12), transparent 28%)',
          'radial-gradient(circle at 100% 0%, rgba(56, 189, 248, 0.08), transparent 24%)',
          'linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 245, 255, 0.96))',
        ].join(', '),
      });
  const panelClassName = isTimerMode
    ? (isDarkTheme
      ? 'border-slate-600/60 bg-slate-900/60 shadow-[0_18px_42px_rgba(2,8,23,0.38)] backdrop-blur-xl'
      : 'border-slate-200/90 bg-white/[0.88] shadow-[0_16px_36px_rgba(15,23,42,0.07)] backdrop-blur-xl')
    : (isDarkTheme
      ? 'border-white/10 bg-white/[0.05] shadow-[0_18px_40px_rgba(2,6,23,0.34)] backdrop-blur-xl'
      : 'border-slate-200/70 bg-white/[0.92] shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl');
  const mutedPanelClassName = isTimerMode
    ? (isDarkTheme
      ? 'border-slate-600/[0.55] bg-slate-900/[0.48] shadow-[0_12px_30px_rgba(2,8,23,0.3)] backdrop-blur-xl'
      : 'border-slate-200/[0.85] bg-white/[0.82] shadow-[0_12px_28px_rgba(15,23,42,0.055)] backdrop-blur-xl')
    : (isDarkTheme
      ? 'border-white/10 bg-white/[0.04] shadow-[0_12px_28px_rgba(2,6,23,0.26)] backdrop-blur-xl'
      : 'border-slate-200/70 bg-white/[0.88] shadow-[0_12px_26px_rgba(15,23,42,0.07)] backdrop-blur-xl');
  const summaryPanelClassName = isTimerMode
    ? (isDarkTheme
      ? 'border-slate-600/70 bg-slate-900/[0.64] shadow-[0_24px_54px_rgba(2,8,23,0.34)] backdrop-blur-xl'
      : 'border-slate-200/90 bg-white/90 shadow-[0_18px_44px_rgba(15,23,42,0.075)] backdrop-blur-xl')
    : (isDarkTheme
      ? 'border-violet-400/20 bg-white/[0.06] shadow-[0_24px_50px_rgba(76,29,149,0.24)] backdrop-blur-xl'
      : 'border-purple-200/80 bg-white/90 shadow-[0_18px_40px_rgba(124,58,237,0.14)] backdrop-blur-xl');
  const summaryPanelStyle = isTimerMode
    ? (isDarkTheme
      ? {
        background: [
          'linear-gradient(145deg, rgba(20, 184, 166, 0.1), rgba(59, 130, 246, 0.045) 125%)',
          'linear-gradient(180deg, rgba(30, 41, 59, 0.78), rgba(15, 23, 42, 0.66))',
        ].join(', '),
      }
      : {
        background: [
          'linear-gradient(145deg, rgba(20, 184, 166, 0.065), rgba(59, 130, 246, 0.035) 122%)',
          'linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.91))',
        ].join(', '),
      })
    : (isDarkTheme
      ? {
        background: [
          'linear-gradient(145deg, rgba(124, 58, 237, 0.22), rgba(14, 165, 233, 0.08) 140%)',
          'linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03))',
        ].join(', '),
      }
      : {
        background: [
          'linear-gradient(145deg, rgba(139, 92, 246, 0.14), rgba(236, 72, 153, 0.08) 120%)',
          'linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(250, 245, 255, 0.9))',
        ].join(', '),
      });
  const labelClassName = 'text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400';
  const metaPillClassName = isTimerMode
    ? (isDarkTheme
      ? 'rounded-full border border-slate-600/70 bg-slate-800/[0.72] px-3 py-1.5 text-xs text-slate-200'
      : 'rounded-full border border-slate-200 bg-white/[0.88] px-3 py-1.5 text-xs text-slate-600')
    : (isDarkTheme
      ? 'rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-200'
      : 'rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-600');
  const closeButtonClassName = isDarkTheme
    ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]'
    : 'border-slate-200 bg-white/90 text-slate-600 hover:bg-slate-100';
  const navButtonClassName = isTimerMode
    ? (isDarkTheme
      ? 'border-slate-600/[0.65] bg-slate-800/[0.62] text-slate-200 hover:border-teal-400/50 hover:bg-teal-500/10 disabled:opacity-[0.35] disabled:cursor-not-allowed'
      : 'border-slate-200 bg-white/[0.92] text-slate-600 hover:border-teal-300 hover:bg-teal-50/70 disabled:opacity-40 disabled:cursor-not-allowed')
    : (isDarkTheme
      ? 'border-white/10 bg-white/[0.05] text-slate-200 hover:border-violet-400/40 hover:bg-violet-500/10 disabled:opacity-[0.35] disabled:cursor-not-allowed'
      : 'border-slate-200 bg-white/95 text-slate-600 hover:border-purple-300 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed');
  const inputClassName = isTimerMode
    ? (isDarkTheme
      ? 'w-full rounded-2xl border border-slate-600/70 bg-slate-950/[0.48] px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-teal-400 outline-none'
      : 'w-full rounded-2xl border border-slate-200 bg-white/[0.92] px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-teal-500 outline-none')
    : (isDarkTheme
      ? 'w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-violet-400 outline-none'
      : 'w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:border-purple-500 outline-none');
  const compactInputClassName = isTimerMode
    ? (isDarkTheme
      ? 'w-full rounded-xl border border-slate-600/70 bg-slate-950/[0.48] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-teal-400 outline-none'
      : 'w-full rounded-xl border border-slate-200 bg-white/[0.92] px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 outline-none')
    : (isDarkTheme
      ? 'w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 outline-none'
      : 'w-full rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-purple-500 outline-none');
  const answerInputClassName = hasLargeAnswerGrid ? compactInputClassName : inputClassName;
  const attachmentLinkClassName = isTimerMode
    ? (isDarkTheme
      ? 'flex items-center justify-between gap-3 rounded-2xl border border-slate-600/[0.65] bg-slate-900/[0.55] px-4 py-3 text-sm text-slate-200 transition hover:border-teal-400/50 hover:bg-teal-500/10'
      : 'flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition hover:border-teal-300 hover:bg-teal-50/70')
    : (isDarkTheme
      ? 'flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:border-violet-400/40 hover:bg-violet-500/10'
      : 'flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition hover:border-purple-300 hover:bg-purple-50');
  const statusPillClassName = isTimerMode && !timerResultsVisible
    ? (isCurrentTaskAnswered
      ? (isDarkTheme
        ? 'border border-teal-400/[0.28] bg-teal-500/[0.12] text-teal-100'
        : 'border border-teal-200 bg-teal-50 text-teal-700')
      : (isDarkTheme
        ? 'border border-slate-600/70 bg-slate-800/60 text-slate-300'
        : 'border border-slate-200 bg-slate-100/80 text-slate-600'))
    : (isCurrentTaskSolved
      ? (isDarkTheme
        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
        : 'border border-emerald-200 bg-emerald-50 text-emerald-700')
      : (isDarkTheme
        ? 'border border-white/10 bg-white/[0.05] text-slate-300'
        : 'border border-slate-200 bg-slate-100 text-slate-600'));
  const progressBarClassName = isTimerMode
    ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500'
    : (isDarkTheme ? 'bg-white' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500');

  const getTaskButtonClassName = (taskNumber, compact = false) => {
    const isSelected = taskNumber === selectedTask;
    const isSolvedTask = Boolean(visibleSolved[String(taskNumber)]);
    const isAnsweredTask = hasAnswerForTask(taskNumber);
    const sizeClassName = compact
      ? 'h-11 min-w-[2.9rem] px-3 rounded-2xl text-sm'
      : 'h-11 rounded-2xl text-sm';

    if (isSelected) {
      if (isTimerMode) {
        return `${sizeClassName} border border-slate-700 bg-slate-800 text-white shadow-[0_12px_24px_rgba(15,23,42,0.2)]`;
      }
      return `${sizeClassName} border border-violet-400 bg-violet-500 text-white shadow-[0_14px_24px_rgba(139,92,246,0.32)]`;
    }

    if (isTimerMode && !timerResultsVisible && isAnsweredTask) {
      return isDarkTheme
        ? `${sizeClassName} border border-teal-400/30 bg-teal-500/[0.12] text-teal-100 hover:border-teal-300/50 hover:bg-teal-500/[0.16]`
        : `${sizeClassName} border border-teal-200 bg-teal-50 text-teal-700 hover:border-teal-300 hover:bg-teal-100`;
    }

    if (isSolvedTask) {
      return isDarkTheme
        ? `${sizeClassName} border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400/50 hover:bg-emerald-500/[0.14]`
        : `${sizeClassName} border border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100`;
    }

    if (isTimerMode) {
      return isDarkTheme
        ? `${sizeClassName} border border-slate-600/[0.65] bg-slate-900/[0.44] text-slate-300 hover:border-teal-400/40 hover:bg-teal-500/10 hover:text-white`
        : `${sizeClassName} border border-slate-200 bg-white/[0.88] text-slate-600 hover:border-teal-300 hover:bg-teal-50/70`;
    }

    return isDarkTheme
      ? `${sizeClassName} border border-white/10 bg-white/[0.04] text-slate-300 hover:border-violet-400/[0.35] hover:bg-violet-500/10 hover:text-white`
      : `${sizeClassName} border border-slate-200 bg-white/90 text-slate-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700`;
  };

  const getTaskNavigationStatusLabel = (taskNumber) => {
    const taskAnswerCount = getMockAnswerCountForTask(taskNumber);
    const filledAnswerCount = getFilledAnswerCountForTask(taskNumber);
    const completionLabel = filledAnswerCount > 0
      ? (
          taskAnswerCount > 1
            ? `Введено ${filledAnswerCount} из ${taskAnswerCount}`
            : 'Ответ заполнен'
        )
      : 'Без ответа';
    if (taskNumber === selectedTask) return `Текущее. ${completionLabel}`;
    if (isTimerMode && !timerResultsVisible && filledAnswerCount > 0) return completionLabel;
    if (visibleSolved[String(taskNumber)]) return 'Решено';
    return completionLabel;
  };

  if (!exam) return null;

  const artifactDropArtifact = artifactDropBurst?.artifact || null;
  const artifactDropRank = String(artifactDropArtifact?.rank || 'C').trim().toUpperCase() || 'C';
  const artifactDropImage = artifactDropArtifact
    ? ARTIFACT_IMAGE_BY_ID.get(String(artifactDropArtifact.id || '').trim()) || ''
    : '';

  const renderTaskPicker = (compact = false) => (
    <div
      ref={compact ? compactTaskPickerRef : undefined}
      className={`mock-exam-task-picker ${
        compact
          ? 'mock-exam-task-picker--compact'
          : 'mock-exam-task-picker--sidebar'
      }`}
      aria-label="Переход к заданию"
    >
      {modalTaskNumbers.map((taskNumber) => (
        <button
          key={taskNumber}
          type="button"
          onClick={() => setSelectedTask(taskNumber)}
          data-mock-task-number={taskNumber}
          data-mock-task-state={
            taskNumber === selectedTask
              ? 'current'
              : (isTimerMode && !timerResultsVisible && hasAnswerForTask(taskNumber))
                ? 'answered'
                : visibleSolved[String(taskNumber)]
                  ? 'solved'
                  : 'idle'
          }
          aria-current={taskNumber === selectedTask ? 'step' : undefined}
          aria-label={`Задание № ${taskNumber}. ${getTaskNavigationStatusLabel(taskNumber)}`}
          title={`Задание № ${taskNumber} — ${getTaskNavigationStatusLabel(taskNumber)}`}
          className={`${getTaskButtonClassName(taskNumber, compact)} transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 ${isTimerMode ? 'focus-visible:ring-teal-400/[0.65]' : 'focus-visible:ring-purple-400/60'}`}
        >
          {taskNumber}
        </button>
      ))}
    </div>
  );

  const renderTimerExamActions = (compact = false) => {
    if (!isTimerMode) return null;

    return (
      <div className={`mock-exam-timer-actions ${compact ? 'mb-3 flex flex-col gap-2 sm:flex-row' : 'mt-3 flex flex-col gap-2'}`}>
        {(timerExpired || timerResultsVisible) && typeof onRestartTimerAttempt === 'function' && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleRestartTimerExam}
            disabled={!canRestartTimerExam}
            className={`min-h-[2.8rem] w-full rounded-2xl ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
          >
            <Clock3 size={17} />
            {restartingTimer ? 'Запускаем...' : 'Решить заново без наград'}
          </Button>
        )}
        {shouldShowContinueTimerExam ? (
          <Button
            type="button"
            onClick={handleContinueTimerExam}
            disabled={!canContinueTimerExam}
            className="min-h-[3.15rem] w-full rounded-2xl text-sm shadow-[0_18px_34px_rgba(34,211,238,0.24)]"
            style={{
              background: 'linear-gradient(135deg, #0891b2, #2563eb 58%, #7c3aed)',
              color: '#fff',
            }}
          >
            <Clock3 size={18} />
            {continuingTimer ? 'Открываем...' : 'Продолжить экзамен'}
          </Button>
        ) : timerResultsVisible ? (
          <div className={`mock-exam-finished-status flex min-h-[2.55rem] w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold ${
            isDarkTheme
              ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}>
            <CheckCircle2 size={17} />
            Результат сохранён
          </div>
        ) : (
          <Button
            type="button"
            onClick={handleRequestFinishExam}
            disabled={!canFinishExam}
            className="mock-exam-finish-button min-h-[3.15rem] w-full rounded-2xl text-sm"
            style={{
              background: 'linear-gradient(135deg, #0f766e, #0f5f66 55%, #1e3a5f)',
              color: '#fff',
            }}
          >
            <CheckCircle2 size={18} />
            {timerResultsVisible ? 'Пробник завершён' : (checking ? 'Завершаем...' : 'Завершить пробник')}
          </Button>
        )}
      </div>
    );
  };

  const modal = (
    <div className={`fixed inset-0 z-50 modal-backdrop mock-exam-launch ${isTimerMode ? 'mock-exam-launch--timer' : ''} ${isExiting ? 'mock-exam-launch--closing' : ''} flex items-center justify-center bg-black/[0.65] p-1 backdrop-blur-md sm:p-2 lg:p-3`}>
      <div className="mock-exam-launch__field" aria-hidden="true">
        <span className="mock-exam-launch__ray mock-exam-launch__ray--one" />
        <span className="mock-exam-launch__ray mock-exam-launch__ray--two" />
        <span className="mock-exam-launch__spark mock-exam-launch__spark--one" />
        <span className="mock-exam-launch__spark mock-exam-launch__spark--two" />
        <span className="mock-exam-launch__spark mock-exam-launch__spark--three" />
      </div>
      <div
        ref={modalCardRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Пробник «${exam.title || 'Без названия'}»`}
        aria-hidden={finishConfirmOpen || timerConfirmationRequest ? 'true' : undefined}
        inert={finishConfirmOpen || timerConfirmationRequest ? true : undefined}
        tabIndex={-1}
        className={`modal-card mock-exam-modal-card ${isTimerMode ? 'mock-exam-modal--timer' : ''} relative flex h-[calc(100dvh-0.5rem)] max-h-none w-full max-w-[112rem] flex-col overflow-hidden rounded-[1.5rem] border p-3 shadow-2xl sm:h-[calc(100dvh-1rem)] sm:p-4 lg:h-[calc(100dvh-1.5rem)] ${shellClassName}`}
        style={shellStyle}
      >
        <div className="mock-exam-modal-card__launch-glow" aria-hidden="true" />
        <div className="mock-exam-modal-card__launch-sheen" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.08] to-transparent" />

        <div className="mock-exam-modal-card__header relative mb-3 flex items-start gap-3">
          <div className="mock-exam-modal-card__header-content min-w-0 flex-1">
            <div className="mock-exam-modal-card__meta-row flex flex-wrap items-center gap-2">
              <span className={`${isTimerMode
                ? (isDarkTheme ? 'border border-teal-400/[0.24] bg-teal-500/10 text-teal-100' : 'border border-teal-200/80 bg-teal-50/80 text-teal-800')
                : (isDarkTheme ? 'border border-violet-400/20 bg-violet-500/[0.12] text-violet-100' : 'bg-purple-50 text-purple-700')
              } inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]`}>
                Пробник
              </span>
              <span className={`${isTimerMode
                ? (isDarkTheme ? 'border-slate-600/70 bg-slate-800/[0.58] text-slate-300' : 'border-slate-200 bg-white/[0.78] text-slate-500')
                : (isDarkTheme ? 'border-white/10 bg-white/[0.05] text-slate-300' : 'border-purple-100 bg-white/80 text-gray-500')
              } inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest`}>
                ЕГЭ
              </span>
              {isTimerMode && (
                <span className={`mock-exam-timer-chip ${timerExpired ? 'mock-exam-timer-chip--expired' : ''}`}>
                  <Clock3 size={13} />
                  <span className="mock-exam-live-value">{timerExpired ? 'Время вышло' : timerLabel}</span>
                </span>
              )}
              <div
                className={`mock-exam-artifact-hint ${isTimerMode ? 'mock-exam-artifact-hint--timer' : ''}`}
                title={artifactHintText}
              >
                <Sparkles size={14} />
                <span>{artifactHintText}</span>
              </div>
            </div>

            <div className="mock-exam-modal-card__title-row mt-2 flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 space-y-3">
                <h3 className={`mock-exam-modal-card__title break-words text-xl font-bold tracking-[-0.04em] sm:text-2xl lg:text-[2rem] ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {exam.title}
                </h3>
                {secondaryBadges.length > 0 && <MockExamBadges badges={secondaryBadges} size="sm" className="gap-2" />}
                <div className="mock-exam-header-mobile-stats flex flex-wrap items-center gap-2 xl:hidden">
                  {(!isTimerMode || timerResultsVisible) && (
                    <span className={metaPillClassName}>
                      Баллы <span className="mock-exam-live-value ml-1">{secondaryScore}</span>
                    </span>
                  )}
                  <span className={metaPillClassName}>
                    {isTimerMode && !timerResultsVisible ? 'Заполнено' : 'Решено'}{' '}
                    <span className="mock-exam-live-value ml-1">{displayProgressCount}/{totalTaskCount}</span>
                  </span>
                  {isTimerMode && (
                    <span className={`mock-exam-timer-mobile ${timerExpired ? 'mock-exam-timer-mobile--expired' : ''}`}>
                      <Clock3 size={13} />
                      <span className="mock-exam-live-value">{timerExpired ? 'Время вышло' : timerLabel}</span>
                    </span>
                  )}
                </div>
              </div>

              {primaryBadge && (
                <div className={`${isTimerMode ? 'hidden xl:flex' : 'hidden md:flex'} shrink-0 justify-end`}>
                  <MockExamBadgeSticker badge={primaryBadge} size="sm" surface={stickerSurface} />
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={closing || isExiting}
            aria-label="Закрыть пробник"
            className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${closeButtonClassName}`}
          >
            <X size={20} />
          </button>
        </div>

        {totalTaskCount === 0 ? (
          <div className={`relative flex min-h-0 flex-1 items-center justify-center rounded-[1.75rem] border border-dashed p-6 text-center ${
            isDarkTheme
              ? 'border-white/10 bg-white/[0.04] text-slate-200'
              : 'border-slate-200 bg-white/70 text-slate-700'
          }`}>
            <div className="max-w-lg">
              <CircleAlert className={`mx-auto mb-4 ${isDarkTheme ? 'text-amber-300' : 'text-amber-500'}`} size={34} />
              <h3 className="text-xl font-display font-bold">Назначенные задания больше недоступны</h3>
              <p className={`mt-2 text-sm leading-6 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                Похоже, состав пробника изменился после выдачи домашки. Попросите преподавателя обновить задание.
              </p>
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={closing || isExiting}
                className={`mt-5 ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
              >
                {closing ? 'Закрываем...' : 'Закрыть'}
              </Button>
            </div>
          </div>
        ) : (
        <div className="mock-exam-modal-card__workspace relative grid min-h-0 flex-1 gap-2.5 xl:grid-cols-[18.5rem_minmax(0,1fr)]">
          <aside className="mock-exam-modal-card__sidebar hidden min-h-0 flex-col gap-2.5 xl:flex">
            <div
              className={`mock-exam-summary rounded-[1.4rem] border p-3 ${summaryPanelClassName}`}
              style={summaryPanelStyle}
            >
              <div className="mock-exam-summary__headline">
                <div>
                  <div className={labelClassName}>{isTimerMode && !timerResultsVisible ? 'Сдача' : 'Прогресс'}</div>
                  <div className={`mock-exam-summary__score mock-exam-live-value mt-1.5 text-2xl font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    {isTimerMode && !timerResultsVisible ? `${answeredCount}/${totalTaskCount}` : `${secondaryScore} баллов`}
                  </div>
                  <div className={`mt-0.5 text-xs ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                    {isTimerMode && !timerResultsVisible ? 'заданий с ответом' : `${primaryScore} первичных`}
                  </div>
                </div>
              </div>

              {isTimerMode && (
                <div className={`mock-exam-timer-panel mock-exam-summary__timer mt-3 ${timerExpired ? 'mock-exam-timer-panel--expired' : ''}`}>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
                    <Clock3 size={13} />
                    Режим таймера
                  </div>
                  <div className="mock-exam-live-value text-xl font-bold">{timerLabel}</div>
                </div>
              )}

              <div className="mock-exam-summary__stats mt-3 grid grid-cols-2 gap-2">
                <div className={`${isDarkTheme ? 'border-white/10 bg-black/10 text-slate-200' : 'border-white/50 bg-white/50 text-slate-700'} rounded-2xl border px-3 py-2`}>
                  <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">
                    {isTimerMode && !timerResultsVisible ? 'Заполнено' : 'Решено'}
                  </div>
                  <div className="mock-exam-live-value mt-1 text-base">{displayProgressCount}/{totalTaskCount}</div>
                </div>
                <div className={`${isDarkTheme ? 'border-white/10 bg-black/10 text-slate-200' : 'border-white/50 bg-white/50 text-slate-700'} rounded-2xl border px-3 py-2`}>
                  <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">Готово</div>
                  <div className="mock-exam-live-value mt-1 text-base">{progressPercent}%</div>
                </div>
              </div>

              <div className={`mock-exam-summary__progress mt-3 h-1.5 overflow-hidden rounded-full ${isDarkTheme ? 'bg-white/10' : 'bg-white/60'}`}>
                <div
                  className={`h-full rounded-full ${progressBarClassName}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {renderTimerExamActions(false)}
            </div>

            <div className={`mock-exam-task-rail flex min-h-0 flex-1 flex-col rounded-[1.4rem] border p-3 ${panelClassName}`}>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div className={labelClassName}>Задания</div>
                <div className={`${isDarkTheme ? 'text-slate-500' : 'text-slate-400'} text-xs`}>
                  1-{totalTaskCount}
                </div>
              </div>

              <div className="mock-exam-task-rail__picker min-h-0">
                {renderTaskPicker(false)}
              </div>

              <div className={`mock-exam-task-legend shrink-0 flex flex-wrap gap-x-3 gap-y-1.5 pt-2.5 text-[11px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${isTimerMode ? 'bg-slate-700' : 'bg-violet-500'}`} />
                  Текущее
                </div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${isTimerMode && !timerResultsVisible ? 'bg-teal-400' : 'bg-emerald-400'}`} />
                  {isTimerMode && !timerResultsVisible ? 'Заполнено' : 'Решено'}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${isDarkTheme ? 'bg-slate-600' : 'bg-slate-300'}`} />
                  Остальные
                </div>
              </div>
            </div>
            {isTimerMode && (
              <div className="mock-exam-focus-note" aria-live="polite" aria-atomic="true">
                <div key={currentCoachNote.id} className="mock-exam-focus-note__content">
                  <span>{currentCoachNote.title}</span>
                  <small>{currentCoachNote.text}</small>
                </div>
                <div className="mock-exam-focus-note__steps" aria-hidden="true">
                  {MOCK_EXAM_COACH_NOTES.map((note, index) => (
                    <i
                      key={note.id}
                      className={index === coachNoteIndex ? 'is-active' : ''}
                    />
                  ))}
                </div>
              </div>
            )}
          </aside>

          <section className={`mock-exam-modal-card__main flex min-h-0 flex-col gap-2.5 ${hasCompactQuestion ? 'mock-exam-modal-card__main--compact-question' : ''} ${hasLargeAnswerGrid ? 'mock-exam-modal-card__main--dense-answer' : ''}`}>
            <div className={`mock-exam-mobile-nav rounded-[1.35rem] border p-3 xl:hidden ${mutedPanelClassName}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className={labelClassName}>Навигация</div>
                <div className={`${isDarkTheme ? 'text-slate-400' : 'text-slate-500'} flex flex-wrap items-center justify-end gap-x-2 text-xs`}>
                  <span>{selectedTaskIndex + 1} из {totalTaskCount}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {displayProgressCount}/{totalTaskCount}{' '}
                    {isTimerMode && !timerResultsVisible ? 'с ответом' : 'решено'}
                  </span>
                </div>
              </div>

              <div className="mock-exam-mobile-nav__stats mb-3 flex flex-wrap items-center gap-2">
                {(!isTimerMode || timerResultsVisible) && (
                  <span className={metaPillClassName}>
                    Баллы <span className="ml-1 font-semibold">{secondaryScore}</span>
                  </span>
                )}
                <span className={metaPillClassName}>
                  {isTimerMode && !timerResultsVisible ? 'Заполнено' : 'Решено'}{' '}
                  <span className="mock-exam-live-value ml-1">{displayProgressCount}/{totalTaskCount}</span>
                </span>
              </div>

              <div className={`mock-exam-mobile-nav__progress mb-3 h-2 overflow-hidden rounded-full ${isDarkTheme ? 'bg-white/10' : 'bg-slate-200/80'}`}>
                <div
                  className={`h-full rounded-full ${progressBarClassName}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {renderTimerExamActions(true)}

              {renderTaskPicker(true)}
            </div>

            <div className={`mock-exam-modal-card__taskbar rounded-[1.35rem] border px-3.5 py-3 ${panelClassName}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={labelClassName}>Задание</div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className={`mock-exam-current-task mock-exam-live-value text-2xl font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                      № {selectedTask}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusPillClassName}`}>
                      {currentTaskStatusLabel}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={metaPillClassName}>
                    <span className="mock-exam-live-value">{selectedTaskIndex + 1}/{totalTaskCount}</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleNextUnsolvedTask}
                    disabled={!nextUnsolvedTask}
                    className={`hidden items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition sm:inline-flex ${navButtonClassName}`}
                  >
                    <ArrowRight size={14} />
                    К следующему
                  </button>
                  <button
                    type="button"
                    onClick={handlePrevTask}
                    disabled={isFirstTask}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${navButtonClassName}`}
                    aria-label="Предыдущее задание"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextTask}
                    disabled={isLastTask}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${navButtonClassName}`}
                    aria-label="Следующее задание"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div ref={questionScrollRef} className={`mock-exam-modal-card__question mock-exam-scroll min-h-0 pr-1 ${
              hasCompactQuestion
                ? 'mock-exam-modal-card__question--compact shrink-0'
                : 'flex-1'
            } ${shouldFitSingleScreenshot ? 'overflow-hidden' : 'overflow-y-auto'}`}>
              {!currentQuestion ? (
                <div className={`rounded-[1.75rem] border border-dashed p-6 text-sm ${isDarkTheme ? 'border-white/10 bg-white/[0.04] text-slate-300' : 'border-slate-200 bg-white/70 text-slate-500'}`}>
                  Задание {selectedTask} ещё не добавлено преподавателем.
                </div>
              ) : (
                <div className={shouldFitSingleScreenshot ? 'flex h-full min-h-0 flex-col' : 'space-y-4'}>
                  <section className={`rounded-[1.75rem] border p-3.5 sm:p-4 ${panelClassName} ${shouldFitSingleScreenshot ? 'flex h-full min-h-0 flex-col' : ''}`}>
                    <div className={`flex flex-wrap items-center justify-between gap-3 ${shouldFitSingleScreenshot ? 'mb-3' : 'mb-4'}`}>
                      <div className={labelClassName}>Условие</div>
                      {(screenshots.length > 0 || files.length > 0) && (
                        <div className={`${isDarkTheme ? 'text-slate-500' : 'text-slate-400'} text-xs`}>
                          {screenshots.length > 0 && `${screenshots.length} изображ.`}
                          {screenshots.length > 0 && files.length > 0 ? ' · ' : ''}
                          {files.length > 0 && `${files.length} файл.`}
                        </div>
                      )}
                    </div>

                    {currentQuestion?.question && (
                      <div className={`mock-exam-question-text whitespace-pre-wrap text-[15px] leading-7 sm:text-base ${isDarkTheme ? 'text-slate-100' : 'text-slate-800'}`}>
                        {currentQuestion.question}
                      </div>
                    )}

                    {screenshots.length > 0 && (
                      <div className={`${currentQuestion?.question ? 'mt-5' : (shouldFitSingleScreenshot ? 'mt-1' : '')} ${shouldFitSingleScreenshot ? 'flex min-h-0 flex-1 items-center justify-center' : 'space-y-3'}`}>
                        {screenshots.map((img) => (
                          <img
                            key={img.storageName || img.url}
                            src={img.url}
                            alt={img.name || 'Скриншот'}
                            className={`mx-auto block ${shouldFitSingleScreenshot ? 'h-full max-h-full w-auto max-w-full' : `w-auto max-w-full ${screenshotMaxHeightClass}`} cursor-zoom-in rounded-[1.4rem] border object-contain shadow-sm transition-shadow hover:shadow-lg ${isDarkTheme ? 'border-white/10 bg-slate-950/80' : 'border-slate-200 bg-white'}`}
                            onClick={() => setExpandedImage(img.url)}
                          />
                        ))}
                      </div>
                    )}

                    {files.length > 0 && (
                      <div className="mt-5 grid gap-2 sm:grid-cols-2">
                        {files.map((file) => (
                          <a
                            key={file.storageName || file.url}
                            href={buildDownloadUrl(file.url)}
                            download={file?.name || undefined}
                            className={attachmentLinkClassName}
                          >
                            <span className="min-w-0 truncate">{file.name || 'Файл'}</span>
                            <FileDown size={18} className="shrink-0 text-violet-500" />
                          </a>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>

            {currentQuestion ? (
              <div
                className={`mock-exam-modal-card__answer relative shrink-0 overflow-hidden rounded-[1.4rem] border p-3.5 ${panelClassName} ${hasLargeAnswerGrid ? 'mock-exam-modal-card__answer--dense flex min-h-0 flex-col' : ''}`}
              >
                <div className={`flex min-h-0 flex-col gap-4 xl:flex-row xl:justify-between ${hasLargeAnswerGrid ? 'h-full' : ''}`}>
                  <div className="min-w-0 flex flex-1 flex-col gap-3 min-h-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className={labelClassName}>Ответ</div>
                      {(!isTimerMode || timerResultsVisible) && results[taskKey] !== undefined && (
                        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                          results[taskKey]
                            ? (isDarkTheme
                              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                              : 'border border-emerald-200 bg-emerald-50 text-emerald-700')
                            : (isDarkTheme
                              ? 'border border-rose-500/30 bg-rose-500/10 text-rose-200'
                              : 'border border-rose-200 bg-rose-50 text-rose-600')
                        }`}>
                          {results[taskKey] ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
                          {results[taskKey] ? 'Верно' : 'Неверно'}
                        </div>
                      )}
                    </div>

                    <div className={hasLargeAnswerGrid ? 'min-h-0 flex-1' : ''}>
                      <div className={`mb-2 text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                        {isTimerMode && !timerResultsVisible
                          ? (
                              answerCount > 1
                                ? (
                                    allowPartialForTask
                                      ? 'Ответы проверятся после завершения. Enter — следующее поле, Ctrl/⌘+Enter — следующее задание.'
                                      : 'Ответы проверятся после завершения. Enter переходит к следующему полю.'
                                  )
                                : 'Ответ проверится после завершения экзамена. Enter переходит к следующему заданию.'
                            )
                          : (answerCount > 1
                          ? (
                            allowPartialForTask
                              ? 'Можно заполнить часть ответов. Enter проверяет.'
                              : `Нужно заполнить ${answerCount} ответов. Enter проверяет.`
                          )
                          : 'Введите ответ без лишних пробелов. Enter проверяет.')}
                      </div>
                      {answerCount > 1 ? (
                        <div
                          className={`mock-exam-answer-grid ${
                            hasLargeAnswerGrid
                              ? 'mock-exam-answer-grid--dense'
                              : answerCount >= 4
                                ? 'mock-exam-answer-grid--medium'
                                : 'mock-exam-answer-grid--regular'
                          }`}
                          data-mock-answer-grid
                        >
                          {Array.from({ length: answerCount }).map((_, idx) => (
                            <label key={idx} className="mock-exam-answer-field">
                              <span className="mock-exam-answer-field__label">
                                {answerFieldLabels[idx]}
                              </span>
                              <input
                                type="text"
                                value={currentAnswers[idx] ?? ''}
                                disabled={inputsLocked}
                                data-mock-answer-index={idx}
                                onKeyDown={(event) => handleAnswerKeyDown(event, idx)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  hasLocalAttemptChangesRef.current = true;
                                  setSaveError('');
                                  setSaveStatus('');
                                  setAnswers((prev) => {
                                    const next = { ...prev };
                                    const prevEntry = next[taskKey];
                                    const arr = Array.isArray(prevEntry)
                                      ? [...prevEntry]
                                      : (typeof prevEntry === 'string'
                                        ? [prevEntry, ...Array.from({ length: Math.max(0, answerCount - 1) }, () => '')]
                                        : Array.from({ length: answerCount }, () => '')
                                      );
                                    arr[idx] = value;
                                    next[taskKey] = arr;
                                    return next;
                                  });
                                }}
                                placeholder="Введите значение"
                                aria-label={answerFieldLabels[idx]}
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                inputMode="text"
                                enterKeyHint={idx < answerCount - 1 ? 'next' : 'done'}
                                className={answerInputClassName}
                              />
                            </label>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={singleAnswer}
                          disabled={inputsLocked}
                          onKeyDown={(event) => handleAnswerKeyDown(event, 0)}
                          onChange={(e) => {
                            hasLocalAttemptChangesRef.current = true;
                            setSaveError('');
                            setSaveStatus('');
                            setAnswers((prev) => ({ ...prev, [taskKey]: e.target.value }));
                          }}
                          placeholder="Введите ответ..."
                          aria-label={`Ответ на задание № ${selectedTask}`}
                          autoComplete="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          inputMode="text"
                          enterKeyHint={isLastTask ? 'done' : 'next'}
                          className={answerInputClassName}
                        />
                      )}
                    </div>

                    {timerExpired && !timerResultsVisible && (
                      <div className={`rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold ${isDarkTheme ? 'text-rose-200' : 'text-rose-700'}`}>
                        Время вышло. Завершите экзамен, чтобы увидеть результаты.
                      </div>
                    )}
                    {saveError && (
                      <div className="text-sm text-rose-500">{saveError}</div>
                    )}
                    {saveStatus && !saveError && (
                      <div className={`text-sm ${isTimerMode ? (isDarkTheme ? 'text-teal-200' : 'text-teal-700') : (results[taskKey] ? 'text-emerald-600' : 'text-amber-600')}`}>
                        {saveStatus}
                      </div>
                    )}
                  </div>

                  {!isTimerMode && (
                    <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row xl:w-auto xl:flex-col xl:self-end">
                      <label className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold sm:w-auto xl:min-w-[9rem] ${
                        isDarkTheme
                          ? 'border-white/10 bg-white/[0.04] text-slate-300'
                          : 'border-slate-200 bg-white/80 text-slate-600'
                      }`}>
                        <input
                          type="checkbox"
                          checked={autoAdvance}
                          onChange={(event) => setAutoAdvance(event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                        />
                        Автодалее
                      </label>
                      <Button
                        variant="secondary"
                        onClick={handleNextUnsolvedTask}
                        disabled={!nextUnsolvedTask}
                        className={`w-full sm:w-auto xl:min-w-[9rem] sm:hidden ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
                      >
                        <ArrowRight size={16} />
                        Следующее
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleClose}
                        disabled={closing || isExiting}
                        className={`w-full sm:w-auto xl:min-w-[9rem] ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
                      >
                        {closing ? 'Сохраняем...' : 'Закрыть'}
                      </Button>
                      <Button
                        onClick={handleCheck}
                        disabled={!canCheck}
                        className="w-full sm:w-auto xl:min-w-[9rem]"
                      >
                        {checking ? 'Проверяем...' : 'Проверить'}
                      </Button>
                      <Button
                        type="button"
                        onClick={handleRequestFinishExam}
                        disabled={!canFinishExam}
                        className="mock-exam-finish-button w-full sm:w-auto xl:min-w-[9rem]"
                        style={{
                          background: 'linear-gradient(135deg, #0f766e, #0f5f66 55%, #1e3a5f)',
                          color: '#fff',
                        }}
                      >
                        <CheckCircle2 size={16} />
                        {attemptFinished ? 'Пробник завершён' : 'Завершить пробник'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className={`rounded-[1.5rem] border p-4 ${mutedPanelClassName}`}>
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={handleClose}
                    disabled={closing || isExiting}
                    className={`w-full sm:w-auto ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
                  >
                    {closing ? 'Сохраняем...' : 'Закрыть'}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
        )}
      </div>

      <MockExamTimerConfirmDialog
        request={timerConfirmationRequest}
        onConfirm={confirmTimerAction}
        onCancel={cancelTimerAction}
      />

      {finishConfirmOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xl"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) dismissFinishConfirm();
          }}
        >
          <div
            ref={finishConfirmDialogRef}
            className={`w-full max-w-md rounded-[1.75rem] border p-5 shadow-2xl ${
              isDarkTheme
                ? 'border-slate-600/70 bg-slate-950/95 text-slate-100 shadow-slate-950/50'
                : 'border-slate-200 bg-white text-slate-950 shadow-slate-300/[0.35]'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mock-finish-confirm-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                isDarkTheme ? 'bg-amber-400/[0.12] text-amber-200' : 'bg-amber-50 text-amber-700'
              }`}>
                <CircleAlert size={22} />
              </div>
              <div className="min-w-0">
                <h2 id="mock-finish-confirm-title" className="text-lg font-black">
                  Завершить пробник?
                </h2>
                <p className={`mt-1 text-sm leading-6 ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                  После завершения результат заморозится, а нерешённые задания попадут в ваше «Тестирование» с меткой этого пробника.
                </p>
              </div>
            </div>

            <div className={`mt-4 grid grid-cols-2 gap-2 rounded-2xl border p-3 text-sm ${
              isDarkTheme
                ? 'border-white/10 bg-white/[0.04] text-slate-200'
                : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest opacity-60">Ответы</div>
                <div className="mock-exam-live-value mt-1 text-base">{`${answeredCount}/${totalTaskCount}`}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest opacity-60">
                  {isTimerMode ? 'Таймер' : 'Режим'}
                </div>
                <div className="mock-exam-live-value mt-1 text-base">{isTimerMode ? timerLabel : 'Обычный'}</div>
              </div>
            </div>

            <div className={`mt-3 rounded-2xl border px-3 py-2 text-sm font-semibold ${
              isDarkTheme
                ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              После проверки все незачтённые задания будут добавлены в «Тестирование».
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                onClick={dismissFinishConfirm}
                disabled={checking}
                data-mock-confirm-autofocus
                className={`min-h-[2.75rem] rounded-2xl ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
              >
                Вернуться
              </Button>
              <Button
                type="button"
                onClick={handleFinishExam}
                disabled={!canFinishExam}
                className="mock-exam-finish-button min-h-[2.75rem] rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, #0f766e, #0f5f66 55%, #1e3a5f)',
                  color: '#fff',
                }}
              >
                <CheckCircle2 size={17} />
                {checking ? 'Завершаем...' : 'Завершить'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {successBurst && (
        <div key={successBurst.id} className="mock-answer-burst mock-answer-burst--fullscreen" aria-hidden="true">
          <div className="mock-answer-burst__ring" />
          <div className="mock-answer-burst__badge">
            <Sparkles size={20} />
            <span>{'\u0412\u0435\u0440\u043d\u043e!'}</span>
          </div>
          {Array.from({ length: 18 }).map((_, idx) => (
            <span
              key={idx}
              className={`mock-answer-burst__particle mock-answer-burst__particle--${idx + 1}`}
            />
          ))}
        </div>
      )}

      {artifactDropBurst && artifactDropArtifact && (
        <div
          key={artifactDropBurst.id}
          className={`mock-artifact-drop mock-artifact-drop--rank-${getMockArtifactRankClassName(artifactDropRank)}`}
          aria-hidden="true"
        >
          <div className="mock-artifact-drop__orbit mock-artifact-drop__orbit--outer" />
          <div className="mock-artifact-drop__orbit mock-artifact-drop__orbit--inner" />
          <div className="mock-artifact-drop__card">
            <div className="mock-artifact-drop__kicker">Артефакт выбит</div>
            <div className="mock-artifact-drop__image-shell">
              {artifactDropImage ? (
                <img
                  src={artifactDropImage}
                  alt=""
                  className="mock-artifact-drop__image"
                  decoding="async"
                />
              ) : (
                <Sparkles size={72} />
              )}
            </div>
            <div className="mock-artifact-drop__rank">{`Ранг ${artifactDropRank}`}</div>
            <div className="mock-artifact-drop__name">{artifactDropArtifact.name || 'Артефакт'}</div>
          </div>
          {Array.from({ length: MOCK_ARTIFACT_SHARD_COUNT }).map((_, idx) => (
            <span
              key={idx}
              className="mock-artifact-drop__shard"
              style={getMockArtifactShardStyle(idx)}
            />
          ))}
        </div>
      )}

      {chestOpeningRewards.length > 0 && (
        <MockChestOpeningOverlay
          rewards={chestOpeningRewards}
          onClose={() => setChestOpeningRewards([])}
        />
      )}

      {expandedImage && (
        <div
          className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setExpandedImage(null)}
        >
          <img src={expandedImage} alt="Просмотр" className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

export default MockExamModal;
