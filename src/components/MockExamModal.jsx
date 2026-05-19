import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileDown,
  Flame,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import MockExamBadges, { MockExamBadgeSticker } from './MockExamBadges';
import MockChestOpeningOverlay from './MockChestOpeningOverlay';
import { normalizeMockExamBadges } from '../utils/mockExamBadges';
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

const normalizeMockAttemptMode = (value, fallback = MOCK_ATTEMPT_MODE_CLASSIC) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === MOCK_ATTEMPT_MODE_TIMER) return MOCK_ATTEMPT_MODE_TIMER;
  if (normalized === MOCK_ATTEMPT_MODE_CLASSIC) return MOCK_ATTEMPT_MODE_CLASSIC;
  return fallback;
};

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
  const [restartingTimer, setRestartingTimer] = useState(false);
  const [continuingTimer, setContinuingTimer] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [successBurst, setSuccessBurst] = useState(null);
  const [artifactDropBurst, setArtifactDropBurst] = useState(null);
  const [chestOpeningRewards, setChestOpeningRewards] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [displayAttempt, setDisplayAttempt] = useState(() => (
    initialAttempt && typeof initialAttempt === 'object' ? initialAttempt : {}
  ));
  const hasLocalAttemptChangesRef = useRef(false);
  const latestInitialAttemptRef = useRef(initialAttempt);
  const autoAdvanceTimerRef = useRef(null);
  const successBurstTimerRef = useRef(null);
  const artifactDropTimerRef = useRef(null);
  const modalTaskNumbers = useMemo(() => {
    const examTasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
    const available = (Array.isArray(MOCK_TASK_NUMBERS) ? MOCK_TASK_NUMBERS : [])
      .filter((taskNumber) => Boolean(examTasks[String(taskNumber)]));
    return available.length > 0 ? available : (Array.isArray(MOCK_TASK_NUMBERS) ? MOCK_TASK_NUMBERS : []);
  }, [exam?.tasks, MOCK_TASK_NUMBERS]);
  const firstTaskNumber = modalTaskNumbers[0] ?? MOCK_TASK_NUMBERS[0];
  const activeAttempt = displayAttempt && typeof displayAttempt === 'object' ? displayAttempt : {};
  const effectiveAttemptMode = normalizeMockAttemptMode(activeAttempt?.mode, normalizeMockAttemptMode(attemptMode));
  const isTimerMode = effectiveAttemptMode === MOCK_ATTEMPT_MODE_TIMER;
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
    const attemptModeValue = normalizeMockAttemptMode(attempt?.mode, normalizeMockAttemptMode(attemptMode));
    if (attemptModeValue !== MOCK_ATTEMPT_MODE_TIMER || !isTimerAttemptFinished(attempt)) return {};
    const solvedMap = readAttemptSolved(attempt);
    return modalTaskNumbers.reduce((acc, taskNumber) => {
      const key = String(taskNumber);
      if (Object.prototype.hasOwnProperty.call(solvedMap, key)) {
        acc[key] = Boolean(solvedMap[key]);
      }
      return acc;
    }, {});
  }, [attemptMode, isTimerAttemptFinished, modalTaskNumbers, readAttemptSolved]);

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
    setDisplayAttempt(latestInitialAttemptRef.current && typeof latestInitialAttemptRef.current === 'object'
      ? latestInitialAttemptRef.current
      : {});
    setAnswers(readAttemptAnswers(latestInitialAttemptRef.current));
    setSolved(readAttemptSolved(latestInitialAttemptRef.current));
    setResults(readAttemptResults(latestInitialAttemptRef.current));
    setSaveError('');
    setSaveStatus('');
    setChecking(false);
    setClosing(false);
    setRestartingTimer(false);
    setContinuingTimer(false);
    setArtifactDropBurst(null);
    setChestOpeningRewards([]);
    setFinishConfirmOpen(false);
    const requestedTask = String(initialTaskNumber ?? '').trim();
    const initialTask = requestedTask
      ? modalTaskNumbers.find((taskNumber) => String(taskNumber) === requestedTask)
      : null;
    setSelectedTask(initialTask || firstTaskNumber);
  }, [exam?.id, studentId, firstTaskNumber, initialTaskNumber, modalTaskNumbers, readAttemptAnswers, readAttemptResults, readAttemptSolved]);

  useEffect(() => {
    if (hasLocalAttemptChangesRef.current) return;
    setDisplayAttempt(initialAttempt && typeof initialAttempt === 'object' ? initialAttempt : {});
    setAnswers(readAttemptAnswers(initialAttempt));
    setSolved(readAttemptSolved(initialAttempt));
    setResults(readAttemptResults(initialAttempt));
    setSaveError('');
    setSaveStatus('');
  }, [initialAttempt, readAttemptAnswers, readAttemptResults, readAttemptSolved]);

  useEffect(() => {
    if (!isTimerMode || timerPaused) return undefined;
    setNowMs(Date.now());
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [isTimerMode, timerPaused, activeAttempt?.timerExpiresAt]);

  useEffect(() => {
    setSaveError('');
    setSaveStatus('');
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
  const hasAnswerForTask = (taskNumber, answersMap = answers) => {
    const key = String(taskNumber);
    const count = getMockAnswerCountForTask(taskNumber);
    const value = answersMap?.[key];
    if (count <= 1) {
      const singleValue = Array.isArray(value) ? value[0] : value;
      return Boolean(String(singleValue ?? '').trim());
    }
    const values = Array.isArray(value)
      ? value
      : (typeof value === 'string'
        ? [value, ...Array.from({ length: Math.max(0, count - 1) }, () => '')]
        : Array.from({ length: count }, () => '')
      );
    return allowsPartialAnswers(taskNumber)
      ? values.some((entry) => String(entry ?? '').trim())
      : values.slice(0, count).every((entry) => String(entry ?? '').trim());
  };
  const hasQuestionText = Boolean(String(currentQuestion?.question || '').trim());
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
  const timerAttemptFinished = isTimerAttemptFinished(activeAttempt);
  const timerResultsVisible = isTimerMode && (
    timerAttemptFinished
    || Object.keys(results || {}).length >= Math.max(1, totalTaskCount)
  );
  const visibleSolved = isTimerMode && !timerResultsVisible ? {} : solved;
  const isCurrentTaskAnswered = hasAnswerForTask(selectedTask);
  const isCurrentTaskSolved = Boolean(visibleSolved[taskKey]);
  const allowPartialForTask = answerCount > 1 ? allowsPartialAnswers(selectedTask) : false;
  const hasLargeAnswerGrid = answerCount > 6;
  const isAnswerReady = isCurrentTaskAnswered;
  const answeredCount = modalTaskNumbers.filter((taskNumber) => hasAnswerForTask(taskNumber)).length;
  const solvedCount = Object.values(visibleSolved || {}).filter(Boolean).length;
  const primaryScore = getPrimaryScoreFromSolved(visibleSolved);
  const secondaryScore = getSecondaryScoreFromPrimary(primaryScore);
  const displayProgressCount = isTimerMode && !timerResultsVisible ? answeredCount : solvedCount;
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
  const canCheck = Boolean(currentQuestion && studentId && isAnswerReady && !checking && !timerExpired && !isTimerMode);
  const canFinishTimerExam = Boolean(isTimerMode && currentQuestion && studentId && !checking && !closing && !restartingTimer && !timerResultsVisible);

  useEffect(() => {
    if (!canFinishTimerExam) setFinishConfirmOpen(false);
  }, [canFinishTimerExam]);

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
    if (!currentQuestion || !studentId || !isAnswerReady || checking || timerExpired || isTimerMode) return;
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
        mode: effectiveAttemptMode,
        localDay: typeof getLocalDayKey === 'function' ? getLocalDayKey() : undefined,
      });
      if (saved && typeof saved === 'object') {
        setDisplayAttempt(saved);
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

  const handleRequestFinishTimerExam = () => {
    if (!canFinishTimerExam) return;
    setSaveError('');
    setFinishConfirmOpen(true);
  };

  const handleFinishTimerExam = async (event) => {
    if (!canFinishTimerExam) return;
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
    setSaveError('');
    setSaveStatus('');
    setChecking(true);
    try {
      const saved = await api.saveMockAttempt(studentId, exam.id, {
        answers,
        mode: effectiveAttemptMode,
        finishTimerExam: true,
        localDay: typeof getLocalDayKey === 'function' ? getLocalDayKey() : undefined,
      });
      if (saved && typeof saved === 'object') {
        const savedSolved = readAttemptSolved(saved);
        setDisplayAttempt(saved);
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
              ? `Экзамен завершён. Баллы: ${savedSecondaryScore}. Награды таймера отключены.`
              : (timerChestsGained > 0
            ? `Экзамен завершён. Баллы: ${savedSecondaryScore}. Получено сундуков: ${timerChestsGained}. Они ждут в рейтинге.`
            : `Экзамен завершён. Баллы: ${savedSecondaryScore}.`)
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

  const handleClose = async () => {
    if (restartingTimer) return;
    if (!isTimerMode || timerResultsVisible || !studentId || closing) {
      onClose?.();
      return;
    }
    setClosing(true);
    setSaveError('');
    setSaveStatus('Ставим таймер на паузу...');
    try {
      const saved = await api.pauseMockAttempt(studentId, exam.id, {
        answers,
        mode: effectiveAttemptMode,
        localDay: typeof getLocalDayKey === 'function' ? getLocalDayKey() : undefined,
      });
      if (saved && typeof saved === 'object') {
        onAttemptSaved?.(exam.id, saved);
      }
      onClose?.();
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message : '';
      setSaveError(message || 'Не удалось поставить таймер на паузу. Попробуйте закрыть ещё раз.');
      setSaveStatus('');
    } finally {
      setClosing(false);
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
    hasLocalAttemptChangesRef.current = false;
    setRestartingTimer(true);
    setSaveError('');
    setSaveStatus('Запускаем новый таймер без наград...');
    try {
      const restarted = await onRestartTimerAttempt?.();
      if (restarted && typeof restarted === 'object') {
        latestInitialAttemptRef.current = restarted;
        setDisplayAttempt(restarted);
        setAnswers(readAttemptAnswers(restarted));
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
        latestInitialAttemptRef.current = continued;
        setDisplayAttempt(continued);
        setAnswers(readAttemptAnswers(continued));
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

  const handleAnswerKeyDown = (event) => {
    if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    if (isTimerMode) {
      if (isAnswerReady && !isLastTask) handleNextTask();
      return;
    }
    handleCheck(event);
  };

  const shellClassName = isTimerMode
    ? (isDarkTheme ? 'border-rose-500/20 text-slate-100' : 'border-rose-200/80 text-slate-900')
    : (isDarkTheme
      ? 'border-white/10 text-slate-100'
      : 'border-purple-100/70 text-slate-900');
  const shellStyle = isTimerMode
    ? (isDarkTheme
      ? {
        background: [
          'radial-gradient(circle at 0% 0%, rgba(225, 29, 72, 0.24), transparent 28%)',
          'radial-gradient(circle at 100% 0%, rgba(168, 85, 247, 0.2), transparent 25%)',
          'linear-gradient(180deg, rgba(17, 10, 24, 0.99), rgba(25, 12, 32, 0.98))',
        ].join(', '),
      }
      : {
        background: [
          'radial-gradient(circle at 0% 0%, rgba(244, 63, 94, 0.14), transparent 28%)',
          'radial-gradient(circle at 100% 0%, rgba(168, 85, 247, 0.12), transparent 24%)',
          'linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(255, 241, 247, 0.96))',
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
      ? 'border-rose-400/16 bg-rose-500/[0.055] shadow-[0_18px_42px_rgba(76,5,25,0.38)] backdrop-blur-xl'
      : 'border-rose-100/80 bg-white/94 shadow-[0_16px_36px_rgba(190,18,60,0.1)] backdrop-blur-xl')
    : (isDarkTheme
      ? 'border-white/10 bg-white/[0.05] shadow-[0_18px_40px_rgba(2,6,23,0.34)] backdrop-blur-xl'
      : 'border-slate-200/70 bg-white/92 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl');
  const mutedPanelClassName = isTimerMode
    ? (isDarkTheme
      ? 'border-fuchsia-400/14 bg-white/[0.045] shadow-[0_12px_30px_rgba(76,5,25,0.3)] backdrop-blur-xl'
      : 'border-rose-100/80 bg-white/90 shadow-[0_12px_28px_rgba(190,18,60,0.08)] backdrop-blur-xl')
    : (isDarkTheme
      ? 'border-white/10 bg-white/[0.04] shadow-[0_12px_28px_rgba(2,6,23,0.26)] backdrop-blur-xl'
      : 'border-slate-200/70 bg-white/88 shadow-[0_12px_26px_rgba(15,23,42,0.07)] backdrop-blur-xl');
  const summaryPanelClassName = isTimerMode
    ? (isDarkTheme
      ? 'border-rose-400/22 bg-white/[0.06] shadow-[0_24px_54px_rgba(136,19,55,0.28)] backdrop-blur-xl'
      : 'border-rose-200/80 bg-white/92 shadow-[0_18px_44px_rgba(225,29,72,0.14)] backdrop-blur-xl')
    : (isDarkTheme
      ? 'border-violet-400/20 bg-white/[0.06] shadow-[0_24px_50px_rgba(76,29,149,0.24)] backdrop-blur-xl'
      : 'border-purple-200/80 bg-white/90 shadow-[0_18px_40px_rgba(124,58,237,0.14)] backdrop-blur-xl');
  const summaryPanelStyle = isTimerMode
    ? (isDarkTheme
      ? {
        background: [
          'linear-gradient(145deg, rgba(190, 18, 60, 0.24), rgba(147, 51, 234, 0.13) 130%)',
          'linear-gradient(180deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.03))',
        ].join(', '),
      }
      : {
        background: [
          'linear-gradient(145deg, rgba(244, 63, 94, 0.13), rgba(168, 85, 247, 0.1) 120%)',
          'linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 241, 247, 0.9))',
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
      ? 'rounded-full border border-rose-400/18 bg-rose-500/[0.07] px-3 py-1.5 text-xs text-rose-100'
      : 'rounded-full border border-rose-100 bg-white/92 px-3 py-1.5 text-xs text-rose-800')
    : (isDarkTheme
      ? 'rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-200'
      : 'rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-600');
  const closeButtonClassName = isDarkTheme
    ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]'
    : 'border-slate-200 bg-white/90 text-slate-600 hover:bg-slate-100';
  const navButtonClassName = isTimerMode
    ? (isDarkTheme
      ? 'border-rose-400/16 bg-rose-500/[0.06] text-rose-100 hover:border-fuchsia-300/42 hover:bg-fuchsia-500/12 disabled:opacity-35 disabled:cursor-not-allowed'
      : 'border-rose-100 bg-white/95 text-rose-700 hover:border-fuchsia-200 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed')
    : (isDarkTheme
      ? 'border-white/10 bg-white/[0.05] text-slate-200 hover:border-violet-400/40 hover:bg-violet-500/10 disabled:opacity-35 disabled:cursor-not-allowed'
      : 'border-slate-200 bg-white/95 text-slate-600 hover:border-purple-300 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed');
  const inputClassName = isTimerMode
    ? (isDarkTheme
      ? 'w-full rounded-2xl border border-rose-400/18 bg-slate-950/52 px-4 py-3 text-slate-100 placeholder:text-rose-200/35 focus:border-fuchsia-300 outline-none'
      : 'w-full rounded-2xl border border-rose-100 bg-white/90 px-4 py-3 text-slate-900 placeholder:text-rose-300 focus:border-rose-500 outline-none')
    : (isDarkTheme
      ? 'w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-violet-400 outline-none'
      : 'w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:border-purple-500 outline-none');
  const compactInputClassName = isTimerMode
    ? (isDarkTheme
      ? 'w-full rounded-xl border border-rose-400/18 bg-slate-950/52 px-3 py-2.5 text-sm text-slate-100 placeholder:text-rose-200/35 focus:border-fuchsia-300 outline-none'
      : 'w-full rounded-xl border border-rose-100 bg-white/90 px-3 py-2.5 text-sm text-slate-900 placeholder:text-rose-300 focus:border-rose-500 outline-none')
    : (isDarkTheme
      ? 'w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 outline-none'
      : 'w-full rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-purple-500 outline-none');
  const answerInputClassName = hasLargeAnswerGrid ? compactInputClassName : inputClassName;
  const answerPanelStyle = hasLargeAnswerGrid
    ? { height: 'min(35vh, 21rem)' }
    : undefined;
  const attachmentLinkClassName = isTimerMode
    ? (isDarkTheme
      ? 'flex items-center justify-between gap-3 rounded-2xl border border-rose-400/16 bg-rose-500/[0.045] px-4 py-3 text-sm text-rose-100 transition hover:border-fuchsia-300/42 hover:bg-fuchsia-500/12'
      : 'flex items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm text-rose-800 transition hover:border-fuchsia-200 hover:bg-rose-50')
    : (isDarkTheme
      ? 'flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:border-violet-400/40 hover:bg-violet-500/10'
      : 'flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition hover:border-purple-300 hover:bg-purple-50');
  const statusPillClassName = isTimerMode && !timerResultsVisible
    ? (isCurrentTaskAnswered
      ? (isDarkTheme
        ? 'border border-fuchsia-400/28 bg-fuchsia-500/12 text-fuchsia-100'
        : 'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700')
      : (isDarkTheme
        ? 'border border-rose-400/16 bg-rose-500/[0.06] text-rose-100'
        : 'border border-rose-100 bg-rose-50 text-rose-700'))
    : (isCurrentTaskSolved
      ? (isDarkTheme
        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
        : 'border border-emerald-200 bg-emerald-50 text-emerald-700')
      : (isDarkTheme
        ? 'border border-white/10 bg-white/[0.05] text-slate-300'
        : 'border border-slate-200 bg-slate-100 text-slate-600'));
  const progressBarClassName = isTimerMode
    ? (isDarkTheme ? 'bg-gradient-to-r from-rose-500 via-fuchsia-500 to-violet-500' : 'bg-gradient-to-r from-rose-500 via-fuchsia-500 to-violet-500')
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
        return `${sizeClassName} border border-rose-300 bg-gradient-to-br from-rose-600 via-fuchsia-600 to-violet-600 text-white shadow-[0_14px_26px_rgba(225,29,72,0.34)]`;
      }
      return `${sizeClassName} border border-violet-400 bg-violet-500 text-white shadow-[0_14px_24px_rgba(139,92,246,0.32)]`;
    }

    if (isTimerMode && !timerResultsVisible && isAnsweredTask) {
      return isDarkTheme
        ? `${sizeClassName} border border-fuchsia-400/30 bg-fuchsia-500/12 text-fuchsia-100 hover:border-fuchsia-300/50 hover:bg-fuchsia-500/16`
        : `${sizeClassName} border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:border-fuchsia-300 hover:bg-fuchsia-100`;
    }

    if (isSolvedTask) {
      return isDarkTheme
        ? `${sizeClassName} border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400/50 hover:bg-emerald-500/14`
        : `${sizeClassName} border border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100`;
    }

    if (isTimerMode) {
      return isDarkTheme
        ? `${sizeClassName} border border-rose-400/16 bg-rose-500/[0.055] text-rose-100/80 hover:border-rose-300/38 hover:bg-rose-500/12 hover:text-white`
        : `${sizeClassName} border border-rose-100 bg-white/90 text-rose-700 hover:border-rose-200 hover:bg-rose-50`;
    }

    return isDarkTheme
      ? `${sizeClassName} border border-white/10 bg-white/[0.04] text-slate-300 hover:border-violet-400/35 hover:bg-violet-500/10 hover:text-white`
      : `${sizeClassName} border border-slate-200 bg-white/90 text-slate-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700`;
  };

  if (!exam) return null;

  const artifactDropArtifact = artifactDropBurst?.artifact || null;
  const artifactDropRank = String(artifactDropArtifact?.rank || 'C').trim().toUpperCase() || 'C';
  const artifactDropImage = artifactDropArtifact
    ? ARTIFACT_IMAGE_BY_ID.get(String(artifactDropArtifact.id || '').trim()) || ''
    : '';

  const renderTaskPicker = (compact = false) => (
    <div className={compact ? 'flex gap-2 overflow-x-auto pb-1' : 'grid grid-cols-4 gap-2'}>
      {modalTaskNumbers.map((taskNumber) => (
        <button
          key={taskNumber}
          type="button"
          onClick={() => setSelectedTask(taskNumber)}
          className={`${getTaskButtonClassName(taskNumber, compact)} transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 ${isTimerMode ? 'focus-visible:ring-rose-400/65' : 'focus-visible:ring-purple-400/60'}`}
        >
          {taskNumber}
        </button>
      ))}
    </div>
  );

  const renderTimerExamActions = (compact = false) => {
    if (!isTimerMode) return null;

    return (
      <div className={`${compact ? 'mb-3 flex flex-col gap-2 sm:flex-row' : 'mt-4 flex flex-col gap-2'}`}>
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
        ) : (
          <Button
            type="button"
            onClick={handleRequestFinishTimerExam}
            disabled={!canFinishTimerExam}
            className="min-h-[3.15rem] w-full rounded-2xl text-sm shadow-[0_18px_34px_rgba(225,29,72,0.28)]"
            style={{
              background: 'linear-gradient(135deg, #e11d48, #c026d3 58%, #7c3aed)',
              color: '#fff',
            }}
          >
            <Flame size={18} />
            {timerResultsVisible ? 'Экзамен завершён' : (checking ? 'Завершаем...' : 'Завершить экзамен')}
          </Button>
        )}
      </div>
    );
  };

  const modal = (
    <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center bg-black/65 p-3 backdrop-blur-md sm:p-4">
      <div
        className={`modal-card mock-exam-modal-card ${isTimerMode ? 'mock-exam-modal--timer' : ''} relative flex max-h-[96vh] w-full max-w-[96rem] flex-col overflow-hidden rounded-[2rem] border p-4 shadow-2xl md:p-6 ${shellClassName}`}
        style={shellStyle}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/8 to-transparent" />

        <div className="relative mb-4 flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${isTimerMode
                ? (isDarkTheme ? 'border border-rose-400/24 bg-rose-500/14 text-rose-100' : 'bg-rose-50 text-rose-700')
                : (isDarkTheme ? 'border border-violet-400/20 bg-violet-500/12 text-violet-100' : 'bg-purple-50 text-purple-700')
              } inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]`}>
                Пробник
              </span>
              <span className={`${isTimerMode
                ? (isDarkTheme ? 'border-fuchsia-400/18 bg-fuchsia-500/10 text-fuchsia-100' : 'border-fuchsia-100 bg-white/85 text-fuchsia-700')
                : (isDarkTheme ? 'border-white/10 bg-white/[0.05] text-slate-300' : 'border-purple-100 bg-white/80 text-gray-500')
              } inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest`}>
                ЕГЭ
              </span>
              {isTimerMode && (
                <span className={`mock-exam-timer-chip ${timerExpired ? 'mock-exam-timer-chip--expired' : ''}`}>
                  <Flame size={13} />
                  <span>{timerExpired ? 'Время вышло' : timerLabel}</span>
                </span>
              )}
            </div>

            <div className={`mock-exam-artifact-hint ${isTimerMode ? 'mock-exam-artifact-hint--timer' : ''}`}>
              <Sparkles size={15} />
              <span>
                {isTimerMode
                  ? 'Артефакты выпадают только из сундуков за рубежи таймера.'
                  : 'Артефакты не выпадают в обычном режиме. Запусти таймерный пробник и открывай сундуки за рубежи.'}
              </span>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 space-y-3">
                <h3 className={`text-2xl font-display font-bold tracking-[-0.04em] md:text-[2.25rem] ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {exam.title}
                </h3>
                {secondaryBadges.length > 0 && <MockExamBadges badges={secondaryBadges} size="sm" className="gap-2" />}
                <div className="flex flex-wrap items-center gap-2 lg:hidden">
                  {(!isTimerMode || timerResultsVisible) && (
                    <span className={metaPillClassName}>
                      Баллы <span className="ml-1 font-semibold">{secondaryScore}</span>
                    </span>
                  )}
                  <span className={metaPillClassName}>
                    {isTimerMode && !timerResultsVisible ? 'Заполнено' : 'Решено'}{' '}
                    <span className="ml-1 font-semibold">{displayProgressCount}/{totalTaskCount}</span>
                  </span>
                  {isTimerMode && (
                    <span className={`mock-exam-timer-mobile ${timerExpired ? 'mock-exam-timer-mobile--expired' : ''}`}>
                      <Clock3 size={13} />
                      {timerExpired ? 'Время вышло' : timerLabel}
                    </span>
                  )}
                </div>
              </div>

              {primaryBadge && (
                <div className="hidden shrink-0 justify-end md:flex">
                  <MockExamBadgeSticker badge={primaryBadge} size="sm" surface={stickerSurface} />
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={closing}
            aria-label="Закрыть пробник"
            className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${closeButtonClassName}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative grid min-h-0 flex-1 gap-3 lg:grid-cols-[18.5rem_minmax(0,1fr)] xl:gap-4">
          <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
            <div
              className={`rounded-[1.75rem] border p-3.5 ${summaryPanelClassName}`}
              style={summaryPanelStyle}
            >
              <div className={labelClassName}>{isTimerMode && !timerResultsVisible ? 'Сдача' : 'Прогресс'}</div>
              <div className={`mt-3 text-3xl font-display font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                {isTimerMode && !timerResultsVisible ? `${answeredCount}/${totalTaskCount}` : `${secondaryScore} баллов`}
              </div>
              <div className={`mt-1 text-sm ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                {isTimerMode && !timerResultsVisible ? 'ответов заполнено' : `${primaryScore} первичных`}
              </div>

              {isTimerMode && (
                <div className={`mock-exam-timer-panel mt-4 ${timerExpired ? 'mock-exam-timer-panel--expired' : ''}`}>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
                    <Clock3 size={13} />
                    Режим таймера
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold">{timerLabel}</div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className={`${isDarkTheme ? 'border-white/10 bg-black/10 text-slate-200' : 'border-white/50 bg-white/50 text-slate-700'} rounded-2xl border px-3 py-2`}>
                  <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">
                    {isTimerMode && !timerResultsVisible ? 'Заполнено' : 'Решено'}
                  </div>
                  <div className="mt-1 text-base font-semibold">{displayProgressCount}/{totalTaskCount}</div>
                </div>
                <div className={`${isDarkTheme ? 'border-white/10 bg-black/10 text-slate-200' : 'border-white/50 bg-white/50 text-slate-700'} rounded-2xl border px-3 py-2`}>
                  <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">Готово</div>
                  <div className="mt-1 text-base font-semibold">{progressPercent}%</div>
                </div>
              </div>

              <div className={`mt-4 h-2 overflow-hidden rounded-full ${isDarkTheme ? 'bg-white/10' : 'bg-white/60'}`}>
                <div
                  className={`h-full rounded-full ${progressBarClassName}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {renderTimerExamActions(false)}
            </div>

            <div className={`flex min-h-0 flex-1 flex-col rounded-[1.75rem] border p-3.5 ${panelClassName}`}>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div className={labelClassName}>Задания</div>
                <div className={`${isDarkTheme ? 'text-slate-500' : 'text-slate-400'} text-xs`}>
                  1-{totalTaskCount}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {renderTaskPicker(false)}
              </div>

              <div className={`shrink-0 grid gap-1.5 pt-3 text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${isTimerMode ? 'bg-rose-500' : 'bg-violet-500'}`} />
                  Текущее
                </div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${isTimerMode && !timerResultsVisible ? 'bg-fuchsia-400' : 'bg-emerald-400'}`} />
                  {isTimerMode && !timerResultsVisible ? 'Заполнено' : 'Решено'}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${isDarkTheme ? 'bg-slate-600' : 'bg-slate-300'}`} />
                  Остальные
                </div>
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col gap-3">
            <div className={`rounded-[1.5rem] border p-3.5 lg:hidden ${mutedPanelClassName}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className={labelClassName}>Навигация</div>
                <div className={`${isDarkTheme ? 'text-slate-400' : 'text-slate-500'} text-xs`}>
                  {selectedTaskIndex + 1} из {totalTaskCount}
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                {(!isTimerMode || timerResultsVisible) && (
                  <span className={metaPillClassName}>
                    Баллы <span className="ml-1 font-semibold">{secondaryScore}</span>
                  </span>
                )}
                <span className={metaPillClassName}>
                  {isTimerMode && !timerResultsVisible ? 'Заполнено' : 'Решено'}{' '}
                  <span className="ml-1 font-semibold">{displayProgressCount}/{totalTaskCount}</span>
                </span>
              </div>

              <div className={`mb-3 h-2 overflow-hidden rounded-full ${isDarkTheme ? 'bg-white/10' : 'bg-slate-200/80'}`}>
                <div
                  className={`h-full rounded-full ${progressBarClassName}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {renderTimerExamActions(true)}

              {renderTaskPicker(true)}
            </div>

            <div className={`rounded-[1.5rem] border p-3.5 ${panelClassName}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={labelClassName}>Задание</div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className={`text-2xl font-display font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                      № {selectedTask}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusPillClassName}`}>
                      {isTimerMode && !timerResultsVisible
                        ? (isCurrentTaskAnswered ? 'Заполнено' : 'Открыто')
                        : (isCurrentTaskSolved ? 'Решено' : 'Открыто')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={metaPillClassName}>
                    {selectedTaskIndex + 1}/{totalTaskCount}
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

            <div className={`mock-exam-scroll min-h-0 flex-1 pr-1 ${shouldFitSingleScreenshot ? 'overflow-hidden' : 'overflow-y-auto'}`}>
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
                      <div className={`whitespace-pre-wrap text-[15px] leading-7 sm:text-base ${isDarkTheme ? 'text-slate-100' : 'text-slate-800'}`}>
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
                className={`relative overflow-hidden rounded-[1.75rem] border p-3.5 ${panelClassName} ${hasLargeAnswerGrid ? 'flex min-h-0 shrink-0 flex-col' : ''}`}
                style={answerPanelStyle}
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

                    <div className={hasLargeAnswerGrid ? 'min-h-0 flex-1 overflow-y-auto pr-1' : ''}>
                      <div className={`mb-2 text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                        {isTimerMode && !timerResultsVisible
                          ? 'Ответы проверятся только после завершения экзамена. Enter переходит дальше, когда задание заполнено.'
                          : (answerCount > 1
                          ? (
                            allowPartialForTask
                              ? 'Можно заполнить часть ответов. Enter проверяет.'
                              : `Нужно заполнить ${answerCount} ответов. Enter проверяет.`
                          )
                          : 'Введите ответ без лишних пробелов. Enter проверяет.')}
                      </div>
                      {answerCount > 1 ? (
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {Array.from({ length: answerCount }).map((_, idx) => (
                            <input
                              key={idx}
                              type="text"
                              value={currentAnswers[idx] ?? ''}
                              disabled={isTimerMode && timerResultsVisible}
                              onKeyDown={handleAnswerKeyDown}
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
                              placeholder={`Ответ ${idx + 1}`}
                              className={answerInputClassName}
                            />
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={singleAnswer}
                          disabled={isTimerMode && timerResultsVisible}
                          onKeyDown={handleAnswerKeyDown}
                          onChange={(e) => {
                            hasLocalAttemptChangesRef.current = true;
                            setSaveError('');
                            setSaveStatus('');
                            setAnswers((prev) => ({ ...prev, [taskKey]: e.target.value }));
                          }}
                          placeholder="Введите ответ..."
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
                      <div className={`text-sm ${isTimerMode ? (isDarkTheme ? 'text-fuchsia-200' : 'text-fuchsia-700') : (results[taskKey] ? 'text-emerald-600' : 'text-amber-600')}`}>
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
                        disabled={closing}
                        className={`w-full sm:w-auto xl:min-w-[9rem] ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
                      >
                        {closing ? 'Пауза...' : 'Закрыть'}
                      </Button>
                      <Button
                        onClick={handleCheck}
                        disabled={!canCheck}
                        className="w-full sm:w-auto xl:min-w-[9rem]"
                      >
                        {checking ? 'Проверяем...' : 'Проверить'}
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
                    disabled={closing}
                    className={`w-full sm:w-auto ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
                  >
                    {closing ? 'Пауза...' : 'Закрыть'}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {finishConfirmOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-xl"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !checking) setFinishConfirmOpen(false);
          }}
        >
          <div
            className={`w-full max-w-md rounded-[1.75rem] border p-5 shadow-2xl ${
              isDarkTheme
                ? 'border-rose-400/30 bg-slate-950/95 text-slate-100 shadow-rose-950/40'
                : 'border-rose-200 bg-white text-slate-950 shadow-rose-200/40'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mock-finish-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                isDarkTheme ? 'bg-rose-500/15 text-rose-200' : 'bg-rose-50 text-rose-600'
              }`}>
                <CircleAlert size={22} />
              </div>
              <div className="min-w-0">
                <h2 id="mock-finish-confirm-title" className="text-lg font-black">
                  Завершить экзамен?
                </h2>
                <p className={`mt-1 text-sm leading-6 ${isDarkTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                  После завершения ответы проверятся, таймер остановится, а продолжить этот запуск уже не получится.
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
                <div className="mt-1 text-base font-black">{`${answeredCount}/${totalTaskCount}`}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest opacity-60">Таймер</div>
                <div className="mt-1 text-base font-black">{timerLabel}</div>
              </div>
            </div>

            {answeredCount < totalTaskCount && (
              <div className={`mt-3 rounded-2xl border px-3 py-2 text-sm font-semibold ${
                isDarkTheme
                  ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}>
                Есть незаполненные задания. Их результат будет засчитан как неверный.
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFinishConfirmOpen(false)}
                disabled={checking}
                className={`min-h-[2.75rem] rounded-2xl ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
              >
                Вернуться
              </Button>
              <Button
                type="button"
                onClick={handleFinishTimerExam}
                disabled={!canFinishTimerExam}
                className="min-h-[2.75rem] rounded-2xl shadow-[0_16px_30px_rgba(225,29,72,0.25)]"
                style={{
                  background: 'linear-gradient(135deg, #e11d48, #f97316)',
                  color: '#fff',
                }}
              >
                <Flame size={17} />
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
