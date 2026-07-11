import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpDown,
  BarChart2,
  BookOpen,
  ChevronRight,
  Clock3,
  Copy,
  Crown,
  Eye,
  FileText,
  Flame,
  ListChecks,
  ListFilter,
  PackageOpen,
  Pencil,
  PlayCircle,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { api } from '../services/api';
import MockExamBadges, { MockExamBadgeSticker } from './MockExamBadges';
import MockChestOpeningOverlay from './MockChestOpeningOverlay';
import MockExamEditorModal from './MockExamEditorModal';
import MockExamModal from './MockExamModal';
import ProgressReviewModal from './ProgressReviewModal';
import StudentSearchSelect from './StudentSearchSelect';
import StudentTestModal from './StudentTestModal';
import { Button, Card } from './ui';
import chestClosedImage from '../assets/mock-chest/chest-closed.png';
import { ARTIFACT_CATALOG_METADATA } from '../data/artifactCatalog';
import { normalizeMockExamBadges } from '../utils/mockExamBadges';
import CoinGuideIcon from './CoinGuideTooltip';

const compareMockTaskKeys = (left, right) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return String(left || '').localeCompare(String(right || ''), 'ru', {
    sensitivity: 'base',
    numeric: true,
  });
};

const getMockExamTaskKeys = (exam) => {
  const examTasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  return Object.keys(examTasks)
    .map((taskKey) => String(taskKey || '').trim())
    .filter(Boolean)
    .sort(compareMockTaskKeys);
};

const hasMockAnswerValue = (value, answerCount = 1) => {
  if (answerCount <= 1) return Boolean(String(value ?? '').trim());
  if (Array.isArray(value)) return value.some((item) => Boolean(String(item ?? '').trim()));
  return Boolean(String(value ?? '').trim());
};

const formatMockUpdatedAt = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

const formatMockTaskLabel = (taskKey, gameTheoryTask) => {
  const taskNumber = Number(taskKey);
  if (Number.isFinite(taskNumber) && taskNumber === gameTheoryTask) return '19-21';
  return Number.isFinite(taskNumber) ? String(taskNumber) : String(taskKey || '');
};

const MOCK_COIN_MILESTONES = [
  { score: 30, coins: 30 },
  { score: 50, coins: 50 },
  { score: 80, coins: 80 },
  { score: 100, coins: 100 },
];
const MOCK_ATTEMPT_MODE_CLASSIC = 'classic';
const MOCK_ATTEMPT_MODE_TIMER = 'timer';
const MOCK_EXAM_TIMER_DURATION_MS = 235 * 60 * 1000;
const MOCK_TIMER_CHEST_MILESTONES = [
  { score: 30, chests: 1 },
  { score: 50, chests: 1 },
  { score: 80, chests: 1 },
  { score: 100, chests: 1 },
];
const MOCK_CHEST_TEST_DISABLED_ARTIFACT_IDS = new Set(['transfer-agreement']);
const MOCK_CHEST_TEST_ARTIFACTS = ARTIFACT_CATALOG_METADATA
  .map((artifact) => {
    const id = String(artifact?.id || '').trim();
    if (!id || MOCK_CHEST_TEST_DISABLED_ARTIFACT_IDS.has(id)) return null;
    return {
      id,
      rank: String(artifact?.rank || 'C').trim().toUpperCase() || 'C',
      name: String(artifact?.name || id).trim() || id,
      description: typeof artifact?.description === 'string' ? artifact.description : '',
    };
  })
  .filter(Boolean);

const handleMockPremiumCardPointerMove = (event) => {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
  const pointerY = ((event.clientY - rect.top) / rect.height) * 100;
  const tiltX = ((50 - pointerY) / 50) * 0.28;
  const tiltY = ((pointerX - 50) / 50) * 0.38;

  element.classList.add('mock-premium-card--interactive');
  element.style.setProperty('--mock-card-pointer-x', `${pointerX.toFixed(2)}%`);
  element.style.setProperty('--mock-card-pointer-y', `${pointerY.toFixed(2)}%`);
  element.style.setProperty('--mock-card-tilt-x', `${tiltX.toFixed(2)}deg`);
  element.style.setProperty('--mock-card-tilt-y', `${tiltY.toFixed(2)}deg`);
  element.style.setProperty('--mock-card-lift', '-0.65px');
};

const handleMockPremiumCardPointerLeave = (event) => {
  const element = event.currentTarget;
  element.classList.remove('mock-premium-card--interactive');
  element.style.setProperty('--mock-card-pointer-x', '50%');
  element.style.setProperty('--mock-card-pointer-y', '42%');
  element.style.setProperty('--mock-card-tilt-x', '0deg');
  element.style.setProperty('--mock-card-tilt-y', '0deg');
  element.style.setProperty('--mock-card-lift', '0px');
};

const createMockChestTestRewards = () => {
  const usedArtifactIds = new Set();
  const pickArtifact = () => {
    if (MOCK_CHEST_TEST_ARTIFACTS.length === 0) return null;
    const freshPool = MOCK_CHEST_TEST_ARTIFACTS.filter((artifact) => !usedArtifactIds.has(artifact.id));
    const pool = freshPool.length > 0 ? freshPool : MOCK_CHEST_TEST_ARTIFACTS;
    const artifact = pool[Math.floor(Math.random() * pool.length)] || null;
    if (artifact?.id) usedArtifactIds.add(artifact.id);
    return artifact;
  };

  return [{
    id: `mock-chest-test-${Date.now()}`,
    coinsGained: 50 + Math.floor(Math.random() * 71),
    milestoneScore: 80,
    chestIndex: 1,
    artifacts: [pickArtifact(), pickArtifact()].filter(Boolean),
  }];
};
const MOCK_EXAM_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'focus', label: 'Фокус' },
  { id: 'active', label: 'В работе' },
  { id: 'new', label: 'Новые' },
  { id: 'timer', label: 'Таймер' },
  { id: 'reward', label: 'Рядом награда' },
  { id: 'done', label: 'Готовые' },
];
const MOCK_EXAM_SORTS = [
  { id: 'smart', label: 'Умная очередь' },
  { id: 'progress', label: 'Прогресс' },
  { id: 'score', label: 'Баллы' },
  { id: 'reward', label: 'Награды рядом' },
  { id: 'title', label: 'Название' },
];
const PROGRESS_XP_GLOBAL_ARTIFACT_BONUSES = {
  krylov: 1,
  duck: 0.15,
  crutch: 0.1,
};
const PROGRESS_XP_TASK_ARTIFACT_BONUSES = {
  '1tbssd': {
    tasks: [15, 16],
    perCopyBonus: 0.5,
  },
  fleshka: {
    tasks: [17, 24, 26, 27],
    perCopyBonus: 0.25,
  },
  'list-comprehension': {
    tasks: [17],
    perCopyBonus: 0.5,
  },
  'recursive scroll': {
    tasks: [16],
    perCopyBonus: 0.5,
  },
  'ring-of-cache': {
    tasks: [16, 19, 20, 21],
    perCopyBonus: 0.5,
  },
  rocks: {
    tasks: [19, 20, 21],
    perCopyBonus: 0.5,
  },
  tears: {
    tasks: [24, 25, 26, 27],
    perCopyBonus: 3,
  },
  turtle: {
    tasks: [6],
    perCopyBonus: 1,
  },
};
const PROGRESS_ARTIFACT_MAX_LEVEL = 5;

const normalizeProgressXpAmount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
};

const formatProgressXpAmount = (value) => normalizeProgressXpAmount(value).toLocaleString('ru-RU');

const formatProgressBonusPercent = (value) => {
  const multiplier = Number(value);
  if (!Number.isFinite(multiplier) || multiplier <= 1) return '+0%';
  const percent = Math.round((multiplier - 1) * 10000) / 100;
  return `+${percent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
};

const normalizeProgressArtifactInventory = (inventory = {}) => {
  const next = {};
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) return next;
  Object.entries(inventory).forEach(([rawId, rawCount]) => {
    const id = String(rawId || '').trim();
    if (!id) return;
    const count = Math.max(0, Math.floor(Number(rawCount) || 0));
    if (count > 0) next[id] = count;
  });
  return next;
};

const normalizeProgressArtifactLevels = (levels = {}, inventory = {}) => {
  const safeInventory = normalizeProgressArtifactInventory(inventory);
  const next = {};
  if (levels && typeof levels === 'object' && !Array.isArray(levels)) {
    Object.entries(levels).forEach(([rawId, rawLevel]) => {
      const id = String(rawId || '').trim();
      if (!id) return;
      const level = Number(rawLevel);
      if (!Number.isFinite(level) || level <= 0) return;
      next[id] = Math.min(PROGRESS_ARTIFACT_MAX_LEVEL, Math.max(1, Math.floor(level)));
    });
  }
  Object.entries(safeInventory).forEach(([id, count]) => {
    if (count > 0 && !next[id]) next[id] = 1;
  });
  return next;
};

const getProgressArtifactLevel = (levels = {}, artifactId) => (
  Math.min(PROGRESS_ARTIFACT_MAX_LEVEL, Math.max(0, Math.floor(Number(levels?.[artifactId]) || 0)))
);

const normalizeProgressTaskForXp = (value, gameTheoryTask) => {
  const taskNum = Number(value);
  if (!Number.isFinite(taskNum)) return null;
  const normalized = Math.trunc(taskNum);
  if (normalized === 20 || normalized === 21) return gameTheoryTask;
  return normalized;
};

const getProgressTaskXpMultiplier = (artifactLevels = {}, taskNumber, gameTheoryTask) => {
  const safeLevels = normalizeProgressArtifactLevels(artifactLevels);
  const normalizedTask = normalizeProgressTaskForXp(taskNumber, gameTheoryTask);
  let multiplier = 1;

  Object.entries(PROGRESS_XP_GLOBAL_ARTIFACT_BONUSES).forEach(([artifactId, perCopyBonus]) => {
    const level = getProgressArtifactLevel(safeLevels, artifactId);
    if (level <= 0) return;
    multiplier *= (1 + (Number(perCopyBonus) * level));
  });

  if (Number.isFinite(normalizedTask)) {
    Object.entries(PROGRESS_XP_TASK_ARTIFACT_BONUSES).forEach(([artifactId, entry]) => {
      if (!Array.isArray(entry?.tasks) || !entry.tasks.includes(normalizedTask)) return;
      const level = getProgressArtifactLevel(safeLevels, artifactId);
      if (level <= 0) return;
      multiplier *= (1 + (Number(entry.perCopyBonus) * level));
    });
  }

  return Math.max(1, multiplier);
};

const applyProgressTaskXpMultiplier = (baseReward, artifactLevels = {}, taskNumber, gameTheoryTask) => {
  const reward = normalizeProgressXpAmount(baseReward);
  if (reward <= 0) return 0;
  return normalizeProgressXpAmount(
    Math.round(reward * getProgressTaskXpMultiplier(artifactLevels, taskNumber, gameTheoryTask))
  );
};

const getProgressQuestionId = (question, index) => String(question?.id ?? index ?? '').trim();

const normalizeProgressSectionStudentData = (data) => {
  const artifactInventory = normalizeProgressArtifactInventory(data?.artifactInventory);
  const artifactLevels = normalizeProgressArtifactLevels(data?.artifactLevels, artifactInventory);
  return data && typeof data === 'object'
    ? {
        ...data,
        progress: data?.progress || {},
        notes: data?.notes || '',
        notesByTask: data?.notesByTask && typeof data.notesByTask === 'object' ? data.notesByTask : {},
        mocks: Array.isArray(data?.mocks) ? data.mocks : [],
        solvedByTask: data?.solvedByTask && typeof data.solvedByTask === 'object' ? data.solvedByTask : {},
        solvedEvents: Array.isArray(data?.solvedEvents) ? data.solvedEvents : [],
        artifactInventory,
        artifactLevels,
      }
    : {
        progress: {},
        notes: '',
        notesByTask: {},
        mocks: [],
        solvedByTask: {},
        solvedEvents: [],
        artifactInventory,
        artifactLevels,
      };
};

const getProgressTaskXpStats = ({
  task,
  testsDb,
  studentData,
  levels,
  getTaskLevelXpReward,
  gameTheoryTask,
}) => {
  const taskNumber = Number(task?.number ?? task?.id);
  if (!Number.isFinite(taskNumber)) {
    return {
      earnedXp: 0,
      possibleXp: 0,
      multiplier: 1,
    };
  }

  const normalizedTask = normalizeProgressTaskForXp(taskNumber, gameTheoryTask);
  const taskKeys = [
    taskNumber,
    normalizedTask,
    task?.number,
    task?.id,
  ].map((value) => String(value ?? '').trim()).filter(Boolean);
  const taskKeySet = new Set(taskKeys);
  const taskLevels = testsDb?.[String(taskNumber)] || testsDb?.[String(normalizedTask)] || testsDb?.[taskNumber] || {};
  const artifactLevels = normalizeProgressArtifactLevels(
    studentData?.artifactLevels,
    studentData?.artifactInventory
  );
  const multiplier = getProgressTaskXpMultiplier(artifactLevels, taskNumber, gameTheoryTask);
  let earnedXp = 0;
  let possibleXp = 0;

  const events = Array.isArray(studentData?.solvedEvents) ? studentData.solvedEvents : [];
  const levelList = Object.values(levels || {});
  levelList.forEach((level) => {
    const levelId = String(level?.id || '').trim();
    if (!levelId) return;
    const questions = Array.isArray(taskLevels?.[levelId]) ? taskLevels[levelId] : [];
    if (questions.length <= 0) return;

    const questionIds = questions
      .map((question, index) => getProgressQuestionId(question, index))
      .filter(Boolean);
    const knownQuestionIds = new Set(questionIds);
    const baseReward = typeof getTaskLevelXpReward === 'function'
      ? normalizeProgressXpAmount(getTaskLevelXpReward(taskNumber, levelId))
      : 0;
    if (baseReward <= 0) return;
    const boostedReward = applyProgressTaskXpMultiplier(baseReward, artifactLevels, taskNumber, gameTheoryTask);

    const solvedRaw = taskKeys.reduce((found, key) => {
      if (found) return found;
      const entry = studentData?.solvedByTask?.[key]?.[levelId];
      return Array.isArray(entry?.solved) ? entry.solved : null;
    }, null);
    const solvedIds = (Array.isArray(solvedRaw) ? solvedRaw : [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);
    const solvedQuestionIds = questionIds.length
      ? questionIds.filter((id) => solvedIds.includes(id))
      : solvedIds;
    const solvedQuestionIdSet = new Set(solvedQuestionIds);

    const eventXpByQuestionId = new Map();
    events.forEach((event) => {
      const eventTask = normalizeProgressTaskForXp(event?.taskNumber, gameTheoryTask);
      if (!taskKeySet.has(String(eventTask ?? '').trim())) return;
      if (String(event?.levelId || '').trim() !== levelId) return;
      const questionId = String(event?.questionId ?? '').trim();
      if (!questionId) return;
      if (knownQuestionIds.size > 0 && !knownQuestionIds.has(questionId)) return;
      const eventXp = normalizeProgressXpAmount(event?.xpGained);
      eventXpByQuestionId.set(questionId, eventXp || baseReward);
    });

    const earnedLevelXp = solvedQuestionIds.reduce((sum, questionId) => (
      sum + (eventXpByQuestionId.has(questionId) ? eventXpByQuestionId.get(questionId) : baseReward)
    ), 0);
    const remainingQuestions = Math.max(0, questionIds.length - solvedQuestionIdSet.size);

    earnedXp += earnedLevelXp;
    possibleXp += earnedLevelXp + (remainingQuestions * boostedReward);
  });

  return {
    earnedXp: normalizeProgressXpAmount(earnedXp),
    possibleXp: normalizeProgressXpAmount(possibleXp),
    multiplier,
  };
};

const normalizeMockCoinMilestones = (value) => {
  if (!Array.isArray(value)) return [];
  const allowedScores = new Set(MOCK_COIN_MILESTONES.map((milestone) => milestone.score));
  return [...new Set(
    value
      .map((item) => Math.max(0, Math.min(100, Math.floor(Number(item) || 0))))
      .filter((score) => allowedScores.has(score))
  )].sort((left, right) => left - right);
};

const normalizeMockAttemptMode = (value, fallback = MOCK_ATTEMPT_MODE_CLASSIC) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === MOCK_ATTEMPT_MODE_TIMER) return MOCK_ATTEMPT_MODE_TIMER;
  if (normalized === MOCK_ATTEMPT_MODE_CLASSIC) return MOCK_ATTEMPT_MODE_CLASSIC;
  return fallback;
};

const getMockModeLabel = (mode) => (
  normalizeMockAttemptMode(mode) === MOCK_ATTEMPT_MODE_TIMER ? 'Таймер' : 'Обычный'
);

const getMockMilestonesForMode = (mode) => (
  normalizeMockAttemptMode(mode) === MOCK_ATTEMPT_MODE_TIMER
    ? MOCK_TIMER_CHEST_MILESTONES
    : MOCK_COIN_MILESTONES
);

const getMockChestCountLabel = (count) => {
  const value = Math.max(0, Math.floor(Number(count) || 0));
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} сундук`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} сундука`;
  return `${value} сундуков`;
};

const getMockNextRewardInfo = (score, mode) => {
  const scoreValue = Math.max(0, Math.min(100, Math.floor(Number(score) || 0)));
  const milestone = getMockMilestonesForMode(mode).find((item) => scoreValue < item.score) || null;
  return {
    scoreValue,
    milestone,
    gap: milestone ? Math.max(0, milestone.score - scoreValue) : 0,
  };
};

const getMockTimerRemainingMs = (attempt, nowMs = Date.now()) => {
  if (String(attempt?.timerPausedAt || '').trim()) {
    const pausedRemainingMs = Math.max(0, Math.floor(Number(attempt?.timerRemainingMs) || 0));
    return Number.isFinite(pausedRemainingMs) ? pausedRemainingMs : 0;
  }
  const expiresAtMs = Date.parse(String(attempt?.timerExpiresAt || ''));
  if (!Number.isFinite(expiresAtMs)) return null;
  return Math.max(0, expiresAtMs - nowMs);
};

const getMockTimerRemainingAtFinishMs = (attempt) => {
  const finishedAtMs = Date.parse(String(attempt?.timerFinishedAt || ''));
  const expiresAtMs = Date.parse(String(attempt?.timerExpiresAt || ''));
  if (!Number.isFinite(finishedAtMs) || !Number.isFinite(expiresAtMs)) return 0;
  return Math.max(0, expiresAtMs - finishedAtMs);
};

const isMockTimerAttemptPaused = (attempt) => (
  normalizeMockAttemptMode(attempt?.mode) === MOCK_ATTEMPT_MODE_TIMER
  && Boolean(String(attempt?.timerPausedAt || '').trim())
  && !String(attempt?.timerFinishedAt || '').trim()
);

const isMockTimerAttemptEnded = (attempt, nowMs = Date.now()) => {
  if (normalizeMockAttemptMode(attempt?.mode) !== MOCK_ATTEMPT_MODE_TIMER) return false;
  if (String(attempt?.timerFinishedAt || '').trim()) return true;
  const remainingMs = getMockTimerRemainingMs(attempt, nowMs);
  const hasTimerStarted = Boolean(
    String(attempt?.timerStartedAt || '').trim()
    || String(attempt?.timerExpiresAt || '').trim()
    || String(attempt?.timerPausedAt || '').trim()
  );
  return hasTimerStarted && remainingMs === 0;
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

const buildMockChartLinePath = (points) => {
  if (!Array.isArray(points) || points.length === 0) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
};

const buildMockChartAreaPath = (points, baselineY) => {
  if (!Array.isArray(points) || points.length === 0) return '';
  const linePath = buildMockChartLinePath(points);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  return `${linePath} L ${lastPoint.x} ${baselineY} L ${firstPoint.x} ${baselineY} Z`;
};

const getMockTaskChartTooltipStyle = (point, chart) => {
  const chartWidth = Math.max(1, Number(chart?.width) || 1);
  const chartHeight = Math.max(1, Number(chart?.height) || 1);
  const xRatio = Math.max(0, Math.min(1, (Number(point?.x) || 0) / chartWidth));
  const yRatio = Math.max(0, Math.min(1, (Number(point?.y) || 0) / chartHeight));
  let transform = 'translate(-50%, calc(-100% - 14px))';

  if (xRatio > 0.82) {
    transform = 'translate(calc(-100% + 18px), calc(-100% - 14px))';
  } else if (xRatio < 0.18) {
    transform = 'translate(-18px, calc(-100% - 14px))';
  }

  return {
    left: `${xRatio * 100}%`,
    top: `${yRatio * 100}%`,
    transform,
  };
};

const ProgressSection = ({
  progress,
  onUpdateProgress,
  theme = '',
  onThemeToggle,
  role,
  studentId,
  students,
  tasks,
  onTaskTitleUpdate,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  openTask,
  onOpenTaskHandled,
  openMockExamId,
  onOpenMockExamHandled,
  initialSection,
  sectionJumpToken,
  onSectionChange,
  mockNavNewCount = 0,
  onTaskStateChange,
  onStreakSaved,
  onMockAttemptSaved,
  onXpGain,
  MOCK_TASKS,
  isMockExamAccessible,
  mergeRuntimeErrorText,
  createPyodideWorker,
  ensurePyodideReady,
  isPythonTaskNumber,
  normalizeTaskNumber,
  getTaskDisplayNumber,
  normalizeMockExamAccess,
  LEGACY_MOCK_EXAM_ACCESS,
  LEVELS,
  LEVEL_WEIGHTS,
  GAME_THEORY_TASK,
  PYODIDE_RUN_TIMEOUT_MS,
  ALLOW_MAIN_THREAD_PYTHON_FALLBACK,
  getTaskLevelXpReward,
  getAnswerCountForTask,
  getExpectedAnswers,
  allowsPartialAnswers,
  buildIdleConsoleText,
  getLocalDayKey,
  normalizeXpTotal,
  parseIdleConsoleInput,
  PY_IDLE_STDIN_HEADER,
  withStudentId,
  getPrimaryScoreFromSolved,
  getSecondaryScoreFromPrimary,
  MOCK_TASK_NUMBERS,
  getMockAnswerCountForTask,
}) => {
  const taskList = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const [activeTask, setActiveTask] = useState(null);
  const [reviewTask, setReviewTask] = useState(null);
  const [autoLevel, setAutoLevel] = useState(null);
  const [autoTargetQuestions, setAutoTargetQuestions] = useState(null);
  const [activeLevel, setActiveLevel] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(null);
  const [mobileLevelPickerTaskId, setMobileLevelPickerTaskId] = useState(null);
  const [mobileLevelPopupView, setMobileLevelPopupView] = useState(null);
  const [mobileLevelPopupClosing, setMobileLevelPopupClosing] = useState(false);
  const [forceInitialLevelLaunch, setForceInitialLevelLaunch] = useState(false);
  const [section, setSection] = useState(() => (
    ['progress', 'notes', 'mocks'].includes(initialSection) ? initialSection : 'progress'
  ));
  const requestedSectionRef = useRef(
    ['progress', 'notes', 'mocks'].includes(initialSection) ? initialSection : 'progress'
  );
  const [studentData, setStudentData] = useState(() => normalizeProgressSectionStudentData(null));
  const [dataError, setDataError] = useState('');
  const [testsDb, setTestsDb] = useState(null);
  const [testsDbError, setTestsDbError] = useState('');
  const [notesSavingId, setNotesSavingId] = useState(null);
  const [notesMobileFilter, setNotesMobileFilter] = useState('all');
  const [notesMobileQuery, setNotesMobileQuery] = useState('');
  const [mockForm, setMockForm] = useState({ date: '', score: '', comment: '' });
  const [mockExams, setMockExams] = useState([]);
  const [mockExamsError, setMockExamsError] = useState('');
  const [mockExamsLoading, setMockExamsLoading] = useState(false);
  const [mockAttemptsByExam, setMockAttemptsByExam] = useState({});
  const [mockAttemptsLoading, setMockAttemptsLoading] = useState(false);
  const [restoringMockTimerRewardsExamId, setRestoringMockTimerRewardsExamId] = useState(null);
  const [continuingMockTimerExamId, setContinuingMockTimerExamId] = useState(null);
  const [hoveredMockTaskPoint, setHoveredMockTaskPoint] = useState(null);
  const [mockEditorExam, setMockEditorExam] = useState(null);
  const [activeMockExam, setActiveMockExam] = useState(null);
  const [activeMockAttempt, setActiveMockAttempt] = useState(null);
  const [activeMockInitialTask, setActiveMockInitialTask] = useState(null);
  const [activeMockMode, setActiveMockMode] = useState(MOCK_ATTEMPT_MODE_CLASSIC);
  const [mockModeByExamId, setMockModeByExamId] = useState({});
  const [startingMockExamId, setStartingMockExamId] = useState(null);
  const [classicModeWarning, setClassicModeWarning] = useState(null);
  const [mockExamFilter, setMockExamFilter] = useState('all');
  const [mockExamQuery, setMockExamQuery] = useState('');
  const [mockExamSort, setMockExamSort] = useState('smart');
  const [mockModePreset, setMockModePreset] = useState(MOCK_ATTEMPT_MODE_CLASSIC);
  const [mockChestTestRewards, setMockChestTestRewards] = useState([]);
  const [timerChestFlights, setTimerChestFlights] = useState([]);
  const [duplicatingMockExamId, setDuplicatingMockExamId] = useState(null);
  const [newMockTitle, setNewMockTitle] = useState('');
  const [mockAccessExamId, setMockAccessExamId] = useState(null);
  const [mockAccessAll, setMockAccessAll] = useState(false);
  const [mockAccessStudents, setMockAccessStudents] = useState([]);
  const [mockAccessSaving, setMockAccessSaving] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [savingTaskTitleId, setSavingTaskTitleId] = useState(null);
  const [openTaskCodeNumber, setOpenTaskCodeNumber] = useState(null);
  const [taskCodeCache, setTaskCodeCache] = useState({});
  const [taskCodeLoadingNumber, setTaskCodeLoadingNumber] = useState(null);
  const [taskCodeSavingNumber, setTaskCodeSavingNumber] = useState(null);
  const [_TASK_CODE_ERROR_BY_TASK, setTaskCodeErrorByTask] = useState({});
  const [_TASK_RUN_STATE_BY_TASK, setTaskRunStateByTask] = useState({});
  const mobilePathCanvasRef = useRef(null);
  const [mobilePathCanvasWidth, setMobilePathCanvasWidth] = useState(0);
  const taskRunnerWorkerRef = useRef(null);
  const taskRunnerPendingRef = useRef(new Map());
  const mockAttemptRequestIdRef = useRef(0);
  const timerChestFlightTimersRef = useRef([]);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const mockAttemptStudentId = role === 'student' ? null : effectiveStudentId;
  const prevEffectiveStudentIdRef = useRef(effectiveStudentId);

  useEffect(() => () => {
    timerChestFlightTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timerChestFlightTimersRef.current = [];
  }, []);

  const triggerTimerChestFlight = (count, sourceRect) => {
    const chestCount = Math.max(0, Math.floor(Number(count) || 0));
    if (chestCount <= 0 || typeof window === 'undefined' || typeof document === 'undefined') return;
    const normalizeRect = (rect) => {
      if (!rect || typeof rect !== 'object') return null;
      const left = Number(rect.left);
      const top = Number(rect.top);
      const width = Number(rect.width);
      const height = Number(rect.height);
      if (![left, top, width, height].every(Number.isFinite)) return null;
      return { left, top, width, height };
    };
    const startRect = normalizeRect(sourceRect) || {
      left: window.innerWidth * 0.5 - 28,
      top: window.innerHeight * 0.72 - 28,
      width: 56,
      height: 56,
    };
    const targetElement = document.querySelector('[data-tour="rating-timer-chests"]')
      || document.querySelector('[data-tour="rating-nav"]');
    const targetRect = targetElement?.getBoundingClientRect?.();
    const endRect = normalizeRect(targetRect) || {
      left: window.innerWidth - 96,
      top: 96,
      width: 72,
      height: 72,
    };
    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;
    const endCenterX = endRect.left + endRect.width / 2;
    const endCenterY = endRect.top + endRect.height / 2;
    const createdAt = Date.now();
    const spread = Math.min(78, Math.max(18, chestCount * 18));
    const flights = Array.from({ length: chestCount }, (_, index) => {
      const centered = index - (chestCount - 1) / 2;
      const stagger = index * 105;
      const endX = endCenterX + centered * Math.min(22, spread / Math.max(1, chestCount));
      const endY = endCenterY + ((index % 2) - 0.5) * 12;
      const midX = startX + (endX - startX) * (0.42 + (index % 3) * 0.04) + centered * 28;
      const midY = Math.min(startY, endY) - 135 - (index % 3) * 28 - Math.abs(centered) * 8;
      return {
        id: `timer-chest-flight-${createdAt}-${index}`,
        startX,
        startY,
        dx: endX - startX,
        dy: endY - startY,
        midDx: midX - startX,
        midDy: midY - startY,
        nearDx: (endX - startX) * 0.84,
        nearDy: (endY - startY) * 0.86,
        delay: stagger,
        rotate: centered * 11,
      };
    });
    const flightIds = new Set(flights.map((flight) => flight.id));
    setTimerChestFlights((prev) => [...prev, ...flights]);
    const timerId = window.setTimeout(() => {
      setTimerChestFlights((prev) => prev.filter((flight) => !flightIds.has(flight.id)));
      timerChestFlightTimersRef.current = timerChestFlightTimersRef.current.filter((id) => id !== timerId);
    }, 1780 + (chestCount - 1) * 105);
    timerChestFlightTimersRef.current.push(timerId);
  };

  useEffect(() => {
    if (!classicModeWarning || typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setClassicModeWarning(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [classicModeWarning]);

  const visibleMockExams = useMemo(() => {
    const baseList = role !== 'student'
      ? [...(mockExams || [])]
      : (mockExams || []).filter((exam) => isMockExamAccessible(exam, effectiveStudentId));

    return baseList.sort((left, right) => {
      const leftTitle = String(left?.title || '').trim();
      const rightTitle = String(right?.title || '').trim();
      const byTitle = leftTitle.localeCompare(rightTitle, 'ru', {
        sensitivity: 'base',
        numeric: true,
      });
      if (byTitle !== 0) return byTitle;
      return String(left?.id || '').localeCompare(String(right?.id || ''), 'ru', {
        sensitivity: 'base',
        numeric: true,
      });
      });
  }, [mockExams, role, effectiveStudentId]);

  const studentVisibleMockExams = useMemo(() => {
    if (!effectiveStudentId) return [];
    return (visibleMockExams || []).filter((exam) => isMockExamAccessible(exam, effectiveStudentId));
  }, [effectiveStudentId, isMockExamAccessible, visibleMockExams]);

  const studentMockOverview = useMemo(() => {
    if (!effectiveStudentId) return null;

    const examStats = (studentVisibleMockExams || []).map((exam) => {
      const attempt = mockAttemptsByExam?.[exam.id];
      const attemptMode = normalizeMockAttemptMode(attempt?.mode);
      const timerRemainingMs = attemptMode === MOCK_ATTEMPT_MODE_TIMER
        ? getMockTimerRemainingMs(attempt)
        : null;
      const isTimerExpired = attemptMode === MOCK_ATTEMPT_MODE_TIMER && timerRemainingMs === 0;
      const canRestartTimerAttempt = isMockTimerAttemptEnded(attempt);
      const isEndedTimerAttempt = attemptMode === MOCK_ATTEMPT_MODE_TIMER && canRestartTimerAttempt;
      const answersMap = attempt?.answers && typeof attempt.answers === 'object' ? attempt.answers : {};
      const storedSolvedMap = attempt?.solved && typeof attempt.solved === 'object' ? attempt.solved : {};
      const timerResultsVisible = attemptMode !== MOCK_ATTEMPT_MODE_TIMER || Boolean(String(attempt?.timerFinishedAt || '').trim());
      const solvedMap = timerResultsVisible ? storedSolvedMap : {};
      const taskStats = getMockExamTaskKeys(exam).map((taskKey) => {
        const answerCount = getMockAnswerCountForTask(taskKey);
        const attempted = hasMockAnswerValue(answersMap[taskKey], answerCount);
        const solved = Boolean(solvedMap[String(taskKey)]);
        return {
          taskKey,
          label: formatMockTaskLabel(taskKey, GAME_THEORY_TASK),
          attempted,
          solved,
        };
      });

      const totalCount = taskStats.length;
      const attemptedCount = taskStats.filter((item) => item.attempted).length;
      const solvedCount = taskStats.filter((item) => item.solved).length;
      const primary = getPrimaryScoreFromSolved(solvedMap);
      const secondary = getSecondaryScoreFromPrimary(primary);
      const progressPercent = totalCount > 0
        ? Math.max(0, Math.min(100, Math.round((solvedCount / totalCount) * 100)))
        : 0;
      const attemptedPercent = totalCount > 0
        ? Math.max(0, Math.min(100, Math.round((attemptedCount / totalCount) * 100)))
        : 0;
      const isModeLocked = Boolean(attempt?.modeLockedAt || attempt?.timerStartedAt || attemptedCount > 0);
      const hasStarted = attemptedCount > 0 || isModeLocked;
      const isCompleted = totalCount > 0 && solvedCount >= totalCount;

      return {
        examId: exam.id,
        examTitle: exam.title,
        attemptMode,
        isModeLocked,
        timerStartedAt: typeof attempt?.timerStartedAt === 'string' ? attempt.timerStartedAt : '',
        timerExpiresAt: typeof attempt?.timerExpiresAt === 'string' ? attempt.timerExpiresAt : '',
        timerPausedAt: typeof attempt?.timerPausedAt === 'string' ? attempt.timerPausedAt : '',
        timerDurationMs: Math.max(0, Math.floor(Number(attempt?.timerDurationMs) || MOCK_EXAM_TIMER_DURATION_MS)),
        timerRemainingMs,
        isTimerPaused: isMockTimerAttemptPaused(attempt),
        isTimerExpired,
        totalCount,
        attemptedCount,
        solvedCount,
        remainingCount: Math.max(0, totalCount - solvedCount),
        primary,
        secondary,
        progressPercent,
        attemptedPercent,
        hasStarted,
        isCompleted,
        canRestartTimerAttempt,
        updatedAt: typeof attempt?.updatedAt === 'string' ? attempt.updatedAt : '',
        updatedLabel: formatMockUpdatedAt(attempt?.updatedAt),
        actionLabel: isEndedTimerAttempt ? 'Открыть' : (isCompleted ? 'Повторить' : hasStarted ? 'Продолжить' : 'Начать'),
        taskStats,
      };
    });

    const examStatsById = examStats.reduce((acc, examStat) => {
      acc[examStat.examId] = examStat;
      return acc;
    }, {});

    const playableExamStats = examStats.filter((examStat) => examStat.totalCount > 0);
    const startedExams = playableExamStats.filter((examStat) => examStat.hasStarted);
    const completedExams = playableExamStats.filter((examStat) => examStat.isCompleted);
    const inProgressExams = playableExamStats
      .filter((examStat) => examStat.hasStarted && !examStat.isCompleted)
      .sort((left, right) => {
        if (left.progressPercent !== right.progressPercent) return right.progressPercent - left.progressPercent;
        if (left.solvedCount !== right.solvedCount) return right.solvedCount - left.solvedCount;
        return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
      });
    const freshExams = playableExamStats.filter((examStat) => !examStat.hasStarted);
    const repeatCandidates = [...completedExams].sort((left, right) => {
      if (left.secondary !== right.secondary) return left.secondary - right.secondary;
      return compareMockTaskKeys(left.examTitle, right.examTitle);
    });

    const focusExam = inProgressExams[0] || freshExams[0] || repeatCandidates[0] || null;
    const focusMode = focusExam
      ? (focusExam.isCompleted ? 'repeat' : focusExam.hasStarted ? 'continue' : 'start')
      : '';
    const focusNextTask = focusExam
      ? (
        focusExam.taskStats.find((taskStat) => !taskStat.solved && taskStat.attempted)
        || focusExam.taskStats.find((taskStat) => !taskStat.solved)
        || focusExam.taskStats[0]
        || null
      )
      : null;

    const totalTaskCount = playableExamStats.reduce((sum, examStat) => sum + examStat.totalCount, 0);
    const totalAttemptedCount = playableExamStats.reduce((sum, examStat) => sum + examStat.attemptedCount, 0);
    const totalSolvedCount = playableExamStats.reduce((sum, examStat) => sum + examStat.solvedCount, 0);
    const overallProgressPercent = totalTaskCount > 0
      ? Math.max(0, Math.min(100, Math.round((totalSolvedCount / totalTaskCount) * 100)))
      : 0;
    const accuracyPercent = totalAttemptedCount > 0
      ? Math.max(0, Math.min(100, Math.round((totalSolvedCount / totalAttemptedCount) * 100)))
      : 0;
    const averageSecondaryScore = startedExams.length > 0
      ? Math.round(startedExams.reduce((sum, examStat) => sum + examStat.secondary, 0) / startedExams.length)
      : 0;

    const bestExam = startedExams.reduce((best, examStat) => {
      if (!best) return examStat;
      if (examStat.secondary !== best.secondary) return examStat.secondary > best.secondary ? examStat : best;
      if (examStat.solvedCount !== best.solvedCount) return examStat.solvedCount > best.solvedCount ? examStat : best;
      return compareMockTaskKeys(examStat.examTitle, best.examTitle) < 0 ? examStat : best;
    }, null);

    const taskPerformance = examStats.reduce((acc, examStat) => {
      examStat.taskStats.forEach((taskStat) => {
        const current = acc[taskStat.taskKey] || {
          taskKey: taskStat.taskKey,
          label: taskStat.label,
          attemptedCount: 0,
          solvedCount: 0,
          totalCount: 0,
          openTargets: [],
        };
        current.totalCount += 1;
        if (taskStat.attempted) {
          current.attemptedCount += 1;
          if (taskStat.solved) current.solvedCount += 1;
        }
        if (!taskStat.solved) {
          current.openTargets.push({
            examId: examStat.examId,
            examTitle: examStat.examTitle,
            attempted: taskStat.attempted,
          });
        }
        acc[taskStat.taskKey] = current;
      });
      return acc;
    }, {});

    const taskInsights = Object.values(taskPerformance)
      .filter((taskStat) => taskStat.attemptedCount > 0)
      .map((taskStat) => {
        const sortedTargets = [...(taskStat.openTargets || [])].sort((left, right) => {
          if (left.attempted !== right.attempted) return left.attempted ? -1 : 1;
          return compareMockTaskKeys(left.examTitle, right.examTitle);
        });
        return {
          ...taskStat,
          openExamId: sortedTargets[0]?.examId || '',
          accuracyPercent: Math.max(
            0,
            Math.min(100, Math.round((taskStat.solvedCount / taskStat.attemptedCount) * 100))
          ),
        };
      });

    const strongestTasks = [...taskInsights]
      .sort((left, right) => {
        if (left.accuracyPercent !== right.accuracyPercent) return right.accuracyPercent - left.accuracyPercent;
        if (left.attemptedCount !== right.attemptedCount) return right.attemptedCount - left.attemptedCount;
        return compareMockTaskKeys(left.taskKey, right.taskKey);
      })
      .slice(0, 3);

    const weakestTasks = [...taskInsights]
      .filter((taskStat) => taskStat.solvedCount < taskStat.attemptedCount)
      .sort((left, right) => {
        if (left.accuracyPercent !== right.accuracyPercent) return left.accuracyPercent - right.accuracyPercent;
        if (left.attemptedCount !== right.attemptedCount) return right.attemptedCount - left.attemptedCount;
        return compareMockTaskKeys(left.taskKey, right.taskKey);
      })
      .slice(0, 3);

    const taskChartData = (Array.isArray(MOCK_TASK_NUMBERS) ? MOCK_TASK_NUMBERS : []).map((taskNumber) => {
      const taskKey = String(taskNumber);
      const taskStat = taskPerformance[taskKey] || null;
      const totalCount = Number(taskStat?.totalCount) || 0;
      const attemptedCount = Number(taskStat?.attemptedCount) || 0;
      const solvedCount = Number(taskStat?.solvedCount) || 0;
      return {
        taskKey,
        taskNumber,
        label: String(taskNumber),
        detailLabel: formatMockTaskLabel(taskNumber, GAME_THEORY_TASK),
        totalCount,
        attemptedCount,
        solvedCount,
        completionPercent: totalCount > 0
          ? Math.max(0, Math.min(100, Math.round((solvedCount / totalCount) * 100)))
          : 0,
        accuracyPercent: attemptedCount > 0
          ? Math.max(0, Math.min(100, Math.round((solvedCount / attemptedCount) * 100)))
          : 0,
      };
    });

    return {
      examStatsById,
      totalExams: playableExamStats.length,
      visibleExamsCount: examStats.length,
      hasMockTasks: totalTaskCount > 0,
      startedExamsCount: startedExams.length,
      completedExamsCount: completedExams.length,
      totalTaskCount,
      totalAttemptedCount,
      totalSolvedCount,
      overallProgressPercent,
      accuracyPercent,
      averageSecondaryScore,
      bestExamId: bestExam?.examId || '',
      bestScore: bestExam?.secondary ?? null,
      focusExamId: focusExam?.examId || '',
      focusMode,
      focusActionLabel: focusExam?.actionLabel || '',
      focusTitle: focusExam?.examTitle || '',
      focusTaskKey: focusNextTask?.taskKey || '',
      focusTaskLabel: focusNextTask?.label || '',
      focusDescription: focusExam
        ? (
          focusMode === 'continue'
            ? `${focusExam.solvedCount}/${focusExam.totalCount} решено`
            : focusMode === 'repeat'
              ? `${focusExam.secondary} баллов`
              : `${focusExam.totalCount} заданий`
        )
        : '',
      taskChartData,
      strongestTasks,
      weakestTasks,
      hasAnyAttempt: startedExams.length > 0,
    };
  }, [
    GAME_THEORY_TASK,
    MOCK_TASK_NUMBERS,
    getMockAnswerCountForTask,
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
    mockAttemptsByExam,
    effectiveStudentId,
    studentVisibleMockExams,
  ]);

  const getTaskCodeEntry = (taskNumber) => {
    const key = String(taskNumber);
    const cached = taskCodeCache?.[key];
    if (!cached || typeof cached !== 'object') {
      return { code: '', input: '', updatedAt: '', loaded: false };
    }
    return {
      code: typeof cached.code === 'string' ? cached.code : '',
      input: typeof cached.input === 'string' ? cached.input : '',
      updatedAt: typeof cached.updatedAt === 'string' ? cached.updatedAt : '',
      loaded: Boolean(cached.loaded),
    };
  };

  const setTaskCodeEntry = (taskNumber, patch) => {
    const key = String(taskNumber);
    setTaskCodeCache((prev) => {
      const current = prev?.[key] && typeof prev[key] === 'object'
        ? prev[key]
        : { code: '', input: '', updatedAt: '', loaded: false };
      return {
        ...(prev || {}),
        [key]: {
          ...current,
          ...(patch || {}),
          loaded: true
        }
      };
    });
  };

  const clearTaskCodeError = (taskNumber) => {
    const key = String(taskNumber);
    setTaskCodeErrorByTask((prev) => {
      if (!prev?.[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setTaskCodeError = (taskNumber, message) => {
    const key = String(taskNumber);
    setTaskCodeErrorByTask((prev) => ({ ...(prev || {}), [key]: message || '' }));
  };

  const resolveTaskRunnerPending = (message) => {
    taskRunnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({ output, error });
    });
    taskRunnerPendingRef.current.clear();
  };

  const disposeTaskRunnerWorker = (message = '') => {
    if (taskRunnerWorkerRef.current) {
      taskRunnerWorkerRef.current.terminate();
      taskRunnerWorkerRef.current = null;
    }
    if (message) resolveTaskRunnerPending(message);
  };

  const ensureTaskRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (taskRunnerWorkerRef.current) return taskRunnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = taskRunnerPendingRef.current.get(data.id);
        if (!pending) return;
        const messageType = typeof data.type === 'string' ? data.type : 'result';
        if (messageType === 'stdout' || messageType === 'stderr') {
          const chunk = typeof data.chunk === 'string' ? data.chunk : String(data.chunk ?? '');
          if (!chunk) return;
          if (messageType === 'stdout') {
            pending.output = `${pending.output || ''}${chunk}`;
          } else {
            pending.error = `${pending.error || ''}${chunk}`;
          }
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({
              output: pending.output || '',
              error: pending.error || '',
              done: false,
            });
          }
          return;
        }
        clearTimeout(pending.timer);
        taskRunnerPendingRef.current.delete(data.id);
        const output = typeof data.output === 'string'
          ? data.output
          : (data.output ? String(data.output) : (pending.output || ''));
        const error = typeof data.error === 'string'
          ? data.error
          : (data.error ? String(data.error) : (pending.error || ''));
        if (typeof pending.onProgress === 'function') {
          pending.onProgress({ output, error, done: true });
        }
        pending.resolve({ output, error });
      };
      worker.onerror = () => disposeTaskRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposeTaskRunnerWorker('Ошибка выполнения Python.');
      taskRunnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  const runTaskCodeMainThread = async (source, inputValue) => {
    const pyodide = await ensurePyodideReady();
    const wrapped = [
      'import sys, io, traceback',
      `_input = ${JSON.stringify(String(inputValue ?? ''))}`,
      '_stdout = io.StringIO()',
      '_stderr = io.StringIO()',
      'sys.stdin = io.StringIO(_input)',
      'sys.stdout = _stdout',
      'sys.stderr = _stderr',
      '_globals = {}',
      'try:',
      `    exec(${JSON.stringify(String(source ?? ''))}, _globals, _globals)`,
      'except Exception:',
      '    traceback.print_exc()',
      '__output = _stdout.getvalue()',
      '__error = _stderr.getvalue()',
    ].join('\n');
    await pyodide.runPythonAsync(wrapped);
    const output = pyodide.globals.get('__output') || '';
    const error = pyodide.globals.get('__error') || '';
    pyodide.globals.delete('__output');
    pyodide.globals.delete('__error');
    return { output: String(output), error: String(error) };
  };

  const runTaskCode = async (source, inputValue, onProgress = null) => {
    const worker = ensureTaskRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = taskRunnerPendingRef.current.get(id);
          if (!pending) return;
          taskRunnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error });
          disposeTaskRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        taskRunnerPendingRef.current.set(id, {
          resolve,
          timer,
          output: '',
          error: '',
          onProgress: typeof onProgress === 'function' ? onProgress : null,
        });
        worker.postMessage({ id, source, input: inputValue });
      });
    }
    if (!ALLOW_MAIN_THREAD_PYTHON_FALLBACK) {
      return {
        output: '',
        error: 'Не удалось запустить Python в изолированном режиме. Перезагрузите страницу.'
      };
    }
    return runTaskCodeMainThread(source, inputValue);
  };

  const loadTaskCode = async (taskNumber, force = false) => {
    if (!effectiveStudentId || !Number.isFinite(Number(taskNumber))) return;
    const key = String(taskNumber);
    const cached = getTaskCodeEntry(taskNumber);
    if (cached.loaded && !force) return;
    if (taskCodeLoadingNumber === taskNumber) return;
    setTaskCodeLoadingNumber(taskNumber);
    try {
      const payload = await api.getTaskCode(effectiveStudentId, taskNumber);
      setTaskCodeEntry(taskNumber, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: typeof payload?.input === 'string' ? payload.input : '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      clearTaskCodeError(taskNumber);
      setTaskRunStateByTask((prev) => ({ ...(prev || {}), [key]: { loading: false, output: '', error: '' } }));
    } catch (err) {
      setTaskCodeError(taskNumber, err?.message || err);
    } finally {
      setTaskCodeLoadingNumber(null);
    }
  };

  const _toggleTaskCodePanel = async (taskNumber) => {
    if (!Number.isFinite(Number(taskNumber))) return;
    if (openTaskCodeNumber === taskNumber) {
      setOpenTaskCodeNumber(null);
      return;
    }
    setOpenTaskCodeNumber(taskNumber);
    await loadTaskCode(taskNumber);
  };

  const _saveTaskCode = async (taskNumber) => {
    if (!effectiveStudentId || !Number.isFinite(Number(taskNumber))) return;
    if (taskCodeSavingNumber === taskNumber) return;
    const entry = getTaskCodeEntry(taskNumber);
    setTaskCodeSavingNumber(taskNumber);
    try {
      const payload = await api.saveTaskCode(effectiveStudentId, taskNumber, {
        code: entry.code,
        input: entry.input
      });
      setTaskCodeEntry(taskNumber, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: typeof payload?.input === 'string' ? payload.input : '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      clearTaskCodeError(taskNumber);
    } catch (err) {
      setTaskCodeError(taskNumber, err?.message || err);
    } finally {
      setTaskCodeSavingNumber(null);
    }
  };

  const _runTaskCodeForTask = async (taskNumber) => {
    if (!Number.isFinite(Number(taskNumber))) return;
    const key = String(taskNumber);
    const entry = getTaskCodeEntry(taskNumber);
    setTaskRunStateByTask((prev) => ({ ...(prev || {}), [key]: { loading: true, output: '', error: '' } }));
    try {
      const result = await runTaskCode(entry.code || '', entry.input || '', (progress) => {
        setTaskRunStateByTask((prev) => ({
          ...(prev || {}),
          [key]: {
            loading: !progress?.done,
            output: progress?.output || '',
            error: progress?.error || '',
          }
        }));
      });
      setTaskRunStateByTask((prev) => ({
        ...(prev || {}),
        [key]: { loading: false, output: result?.output || '', error: result?.error || '' }
      }));
    } catch (err) {
      setTaskRunStateByTask((prev) => ({
        ...(prev || {}),
        [key]: { loading: false, output: '', error: err?.message || 'Ошибка выполнения Python' }
      }));
    }
  };

  useEffect(() => () => disposeTaskRunnerWorker('Python runner stopped.'), []);

  const startEditTaskTitle = (task) => {
    if (!task) return;
    setEditingTaskId(task.number);
    setEditingTaskTitle(task.title || '');
  };

  const cancelEditTaskTitle = () => {
    setEditingTaskId(null);
    setEditingTaskTitle('');
  };

  const saveTaskTitle = async (task) => {
    if (!task) return;
    const title = editingTaskTitle.trim();
    setSavingTaskTitleId(task.number);
    try {
      await api.updateTaskTitle(task.number, title);
      onTaskTitleUpdate?.(task.number, title);
      cancelEditTaskTitle();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setSavingTaskTitleId(null);
    }
  };

  useEffect(() => {
    if (!effectiveStudentId) {
      setStudentData(normalizeProgressSectionStudentData(null));
      return;
    }
    let cancelled = false;
    api.getStudentData(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setStudentData(normalizeProgressSectionStudentData(data));
        setDataError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setDataError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId]);

  useEffect(() => {
    let cancelled = false;
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setTestsDb(data && typeof data === 'object' ? data : {});
        setTestsDbError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTestsDb({});
        setTestsDbError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMockExamsLoading(true);
    api.getMockExams(role === 'student' ? effectiveStudentId : null)
      .then((data) => {
        if (cancelled) return;
        setMockExams(Array.isArray(data) ? data : []);
        setMockExamsError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setMockExams([]);
        setMockExamsError(err?.message || err);
      })
      .finally(() => {
        if (!cancelled) setMockExamsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!effectiveStudentId) {
      setMockAttemptsByExam({});
      setMockAttemptsLoading(false);
      return;
    }
    const accessibleMockExams = studentVisibleMockExams || [];
    if (accessibleMockExams.length === 0) {
      setMockAttemptsByExam({});
      setMockAttemptsLoading(false);
      return;
    }
    let cancelled = false;
    setMockAttemptsLoading(true);
    Promise.all(
      accessibleMockExams.map((exam) =>
        api.getMockAttempt(mockAttemptStudentId, exam.id).catch(() => null)
      )
    )
      .then((results) => {
        if (cancelled) return;
        const map = {};
        accessibleMockExams.forEach((exam, idx) => {
          const attempt = results[idx];
          if (attempt && typeof attempt === 'object') {
            map[exam.id] = attempt;
          }
        });
        setMockAttemptsByExam(map);
      })
      .finally(() => {
        if (!cancelled) setMockAttemptsLoading(false);
      });
    return () => { cancelled = true; };
  }, [mockAttemptStudentId, effectiveStudentId, studentVisibleMockExams]);

  useEffect(() => {
    const studentChanged = prevEffectiveStudentIdRef.current !== effectiveStudentId;
    prevEffectiveStudentIdRef.current = effectiveStudentId;
    const sectionChangedAwayFromProgress = section !== 'progress';
    if (studentChanged || sectionChangedAwayFromProgress) {
      setActiveTask(null);
      setReviewTask(null);
      setAutoLevel(null);
      setAutoTargetQuestions(null);
      setActiveLevel(null);
      setActiveQuestionIndex(null);
      setForceInitialLevelLaunch(false);
    }
    setMobileLevelPickerTaskId(null);
    setOpenTaskCodeNumber(null);
    setTaskCodeCache({});
    setTaskCodeLoadingNumber(null);
    setTaskCodeSavingNumber(null);
    setTaskCodeErrorByTask({});
    setTaskRunStateByTask({});
    disposeTaskRunnerWorker();
    cancelEditTaskTitle();
    closeMockAccessEditor();
  }, [section, effectiveStudentId]);

  useEffect(() => {
    requestedSectionRef.current = ['progress', 'notes', 'mocks'].includes(initialSection)
      ? initialSection
      : 'progress';
  }, [initialSection]);

  useEffect(() => {
    const nextSection = requestedSectionRef.current;
    setSection((prev) => (prev === nextSection ? prev : nextSection));
  }, [sectionJumpToken]);

  useEffect(() => {
    onSectionChange?.(section);
  }, [section, onSectionChange]);

  useEffect(() => {
    if (role !== 'student' || !openTask) return;
    if (openTask.section === 'python' || isPythonTaskNumber(openTask.taskNumber)) {
      onOpenTaskHandled?.();
      return;
    }
    const target = taskList.find((task) => Number(task.number) === Number(openTask.taskNumber));
    if (!target) {
      onOpenTaskHandled?.();
      return;
    }
    setSection('progress');
    setActiveLevel(null);
    setForceInitialLevelLaunch(false);
    setActiveTask(target);
    setAutoLevel(openTask.levelId || null);
    setAutoTargetQuestions(Array.isArray(openTask.targetQuestions) ? openTask.targetQuestions : null);
    if (Number.isFinite(openTask.questionIndex)) {
      setActiveQuestionIndex(openTask.questionIndex);
    } else {
      setActiveQuestionIndex(null);
    }
    onOpenTaskHandled?.();
  }, [openTask, role, taskList, onOpenTaskHandled]);

  useEffect(() => {
    if (role !== 'student' || !openMockExamId) return;
    setSection('mocks');
    if (mockExamsLoading) return;

    const targetId = String(openMockExamId);
    const targetExam = (visibleMockExams || []).find((exam) => String(exam?.id) === targetId)
      || (mockExams || []).find((exam) => String(exam?.id) === targetId);
    if (!targetExam) return;

    handleOpenMockExam(targetExam);
    onOpenMockExamHandled?.();
  }, [
    role,
    openMockExamId,
    mockExamsLoading,
    visibleMockExams,
    mockExams,
    onOpenMockExamHandled
  ]);

  useEffect(() => {
    if (activeTask) setMobileLevelPickerTaskId(null);
  }, [activeTask]);

  useEffect(() => {
    if (role !== 'student') return;
    if (!activeTask) {
      if (openTask) return;
      onTaskStateChange?.(null);
      return;
    }
    onTaskStateChange?.({
      taskNumber: activeTask.number,
      levelId: activeLevel || autoLevel || null,
      targetQuestions: autoTargetQuestions,
      section: 'progress',
      questionIndex: Number.isFinite(activeQuestionIndex) ? activeQuestionIndex : null
    });
  }, [activeTask, activeLevel, autoLevel, autoTargetQuestions, activeQuestionIndex, role, onTaskStateChange, openTask]);

  useLayoutEffect(() => {
    if (role !== 'student' || section !== 'progress') return undefined;
    const element = mobilePathCanvasRef.current;
    if (!element) return undefined;
    const updateWidth = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      if (!Number.isFinite(width) || width <= 0) return;
      setMobilePathCanvasWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev));
    };
    updateWidth();

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateWidth());
      observer.observe(element);
      return () => observer.disconnect();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    return undefined;
  }, [role, section, taskList.length]);

  const progressMap = role === 'teacher'
    ? (studentData.progress || {})
    : (Object.keys(progress || {}).length ? progress : (studentData.progress || {}));

  const totalMastery = (() => {
    if (!taskList.length) return 0;
    const total = taskList.reduce((sum, task) => {
      const val = Number(progressMap[task.id] || 0);
      return sum + (Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0);
    }, 0);
    return Math.round((total / taskList.length) * 10) / 10;
  })();
  const totalMasteryRounded = Math.round(totalMastery);
  const totalMasteryLabel = Number.isFinite(totalMasteryRounded)
    ? totalMasteryRounded.toString()
    : '0';
  const sectionTabs = [
    { id: 'progress', label: 'Тестирования', icon: BarChart2 },
    { id: 'notes', label: 'Заметки учителя', icon: FileText },
    { id: 'mocks', label: 'Пробники', icon: BookOpen }
  ];
  const sectionShortLabels = {
    progress: 'Тесты',
    notes: 'Заметки',
    mocks: 'Пробники'
  };
  const isStudentMocksSection = role === 'student' && section === 'mocks';
  const isStudentProgressSection = role === 'student';
  const mobilePathLayout = useMemo(() => {
    const ringSize = 124;
    const strokeWidth = 10;
    const radius = (ringSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const labelGap = 7;
    const labelHeight = 42;
    const topPadding = 10;
    const bottomPadding = 24;
    const nodeWidth = 156;
    const labelBoxWidth = 154;
    const pathWidth = Math.max(296, Math.round(mobilePathCanvasWidth || 336));
    const xPattern = [24, 74, 36, 70, 27, 78, 44, 66, 30, 76, 41, 69];
    const stepPattern = [136, 148, 142, 156, 138, 150, 144, 152, 140, 154];
    const connectorPresets = [
      { sway: 22, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -20, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 19, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -21, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 18, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -19, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 20, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -22, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 17, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -20, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 19, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -21, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 18, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -19, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 20, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -22, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 17, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -20, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 19, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -21, lift: 19, pullA: 0.02, pullB: 0.02 },
    ];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const manualNodeShiftPxByNumber = {
      7: -28,
      19: -22,
      20: -22,
      21: -22
    };
    const manualNodeShiftPxByDisplayNumber = {
      '19-21': -22
    };
    const pointInRect = (x, y, rect) => (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
    const segmentHitsRect = (x1, y1, x2, y2, rect) => {
      if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
      const steps = 30;
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        const x = x1 + ((x2 - x1) * t);
        const y = y1 + ((y2 - y1) * t);
        if (pointInRect(x, y, rect)) return true;
      }
      return false;
    };
    const nodeHalfWidth = nodeWidth / 2;
    const centerMin = nodeHalfWidth + 4;
    const centerMax = Math.max(centerMin, pathWidth - nodeHalfWidth - 4);
    let currentTop = topPadding;
    const nodes = taskList.map((task, idx) => {
      const rawVal = Number(progressMap[task.id] || 0);
      const val = Number.isFinite(rawVal) ? Math.max(0, Math.min(100, rawVal)) : 0;
      const ringColor = val >= 85
        ? '#10b981'
        : (val >= 60 ? '#8b5cf6' : (val >= 40 ? '#f59e0b' : '#9ca3af'));
      const numericSeed = Number(task?.number);
      const seed = Number.isFinite(numericSeed) ? numericSeed : (idx + 1);
      const jitter = ((seed * 23) % 11) - 5;
      const xBase = clamp(xPattern[idx % xPattern.length] + jitter, 22, 78);
      const numericShiftPx = Number.isFinite(numericSeed)
        ? (manualNodeShiftPxByNumber[numericSeed] || 0)
        : 0;
      const displayShiftPxRaw = manualNodeShiftPxByDisplayNumber[String(task?.displayNumber || '')];
      const manualShiftPx = Number.isFinite(displayShiftPxRaw) ? displayShiftPxRaw : numericShiftPx;
      const centerX = clamp(((xBase / 100) * pathWidth) + manualShiftPx, centerMin, centerMax);
      const top = currentTop;
      const centerY = top + (ringSize / 2);
      currentTop += stepPattern[idx % stepPattern.length];
      const compactTitle = String(task.title || '').replace(/\s+/g, ' ').trim();
      const title = compactTitle.length > 52 ? `${compactTitle.slice(0, 52)}...` : compactTitle;
      const labelTop = top + ringSize + labelGap;
      const labelLeft = centerX - (labelBoxWidth / 2);
      const labelRight = centerX + (labelBoxWidth / 2);
      const labelBottom = labelTop + labelHeight;
      return {
        task,
        idx,
        val,
        ringColor,
        centerX,
        centerY,
        top,
        labelTop,
        labelLeft,
        labelRight,
        labelBottom,
        title
      };
    });
    const curves = nodes.slice(0, -1).map((node, idx) => {
      const next = nodes[idx + 1];
      const preset = connectorPresets[idx % connectorPresets.length];
      const deltaX = next.centerX - node.centerX;
      const deltaY = next.centerY - node.centerY;
      const distance = Math.max(0.001, Math.hypot(deltaX, deltaY));
      const unitX = deltaX / distance;
      const unitY = deltaY / distance;
      const anchorOffset = (ringSize / 2) + (strokeWidth / 2) + 2;
      const startX = node.centerX + (unitX * anchorOffset);
      const startY = node.centerY + (unitY * anchorOffset);
      const endX = next.centerX - (unitX * anchorOffset);
      const endY = next.centerY - (unitY * anchorOffset);

      const currentLabelRect = {
        left: node.labelLeft - 4,
        right: node.labelRight + 4,
        top: node.labelTop - 4,
        bottom: node.labelBottom + 4
      };
      const nextLabelRect = {
        left: next.labelLeft - 4,
        right: next.labelRight + 4,
        top: next.labelTop - 4,
        bottom: next.labelBottom + 4
      };
      const shouldBypassLabels = segmentHitsRect(startX, startY, endX, endY, currentLabelRect)
        || segmentHitsRect(startX, startY, endX, endY, nextLabelRect);
      if (!shouldBypassLabels) {
        return {
          id: `${node.task.id}-${next.task.id}`,
          d: `M ${startX.toFixed(2)} ${startY.toFixed(2)} L ${endX.toFixed(2)} ${endY.toFixed(2)}`
        };
      }

      const safeY = Math.min(node.labelTop, next.labelTop) - 16;
      const straightMidY = (startY + endY) / 2;
      const requiredLift = Math.max(0, straightMidY - safeY + 4);
      const tangentOut = clamp(distance * (0.23 + preset.pullA * 0.45), 18, 34);
      const tangentIn = clamp(distance * (0.23 + preset.pullB * 0.45), 18, 34);
      const baseC1X = startX + (unitX * tangentOut);
      const baseC1Y = startY + (unitY * tangentOut);
      const baseC2X = endX - (unitX * tangentIn);
      const baseC2Y = endY - (unitY * tangentIn);
      const nearVertical = Math.abs(deltaX) < 72 && Math.abs(deltaY) > 36;
      const swayFactor = nearVertical
        ? Math.max(0.28, Math.min(0.9, (72 - Math.abs(deltaX)) / 72))
        : 0.18;
      const lateral = preset.sway * swayFactor * 0.34;
      const lift = clamp((preset.lift * 0.58) + requiredLift, 8, 30);
      let c1x = clamp(baseC1X + lateral, 8, pathWidth - 8);
      let c2x = clamp(baseC2X - (lateral * 0.78), 8, pathWidth - 8);
      let c1y = baseC1Y - lift;
      let c2y = baseC2Y - (lift * 0.92);
      const yOvershoot = Math.max(c1y - safeY, c2y - safeY, 0);
      if (yOvershoot > 0) {
        c1y -= yOvershoot;
        c2y -= yOvershoot;
      }
      const minCurveY = Math.min(startY, endY) - 58;
      c1y = Math.max(minCurveY, c1y);
      c2y = Math.max(minCurveY + 6, c2y);
      const minControlGap = Math.max(8, Math.abs(deltaX) * 0.06);
      if (deltaX >= 0 && c2x < c1x + minControlGap) {
        const mid = (c1x + c2x) / 2;
        c1x = clamp(mid - (minControlGap / 2), 8, pathWidth - 8);
        c2x = clamp(mid + (minControlGap / 2), 8, pathWidth - 8);
      } else if (deltaX < 0 && c2x > c1x - minControlGap) {
        const mid = (c1x + c2x) / 2;
        c1x = clamp(mid + (minControlGap / 2), 8, pathWidth - 8);
        c2x = clamp(mid - (minControlGap / 2), 8, pathWidth - 8);
      }
      return {
        id: `${node.task.id}-${next.task.id}`,
        d: `M ${startX.toFixed(2)} ${startY.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${endX.toFixed(2)} ${endY.toFixed(2)}`
      };
    });
    const lastNode = nodes[nodes.length - 1];
    const height = lastNode
      ? Math.round(lastNode.top + ringSize + labelGap + labelHeight + bottomPadding)
      : 200;
    return {
      nodes,
      curves,
      width: pathWidth,
      height,
      nodeWidth,
      ringSize,
      strokeWidth,
      radius,
      circumference
    };
  }, [taskList, progressMap, mobilePathCanvasWidth]);
  const mobileLevelPopupLayout = useMemo(() => {
    if (!mobileLevelPickerTaskId) return null;
    const selectedNode = mobilePathLayout.nodes.find((node) => String(node.task.id) === String(mobileLevelPickerTaskId));
    if (!selectedNode) return null;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const popupMinWidth = 248;
    const popupMaxWidth = 314;
    const variantSeed = Number(selectedNode.task?.number);
    const variantOffset = Number.isFinite(variantSeed)
      ? (((variantSeed * 17) % 41) - 20)
      : 0;
    const preferredWidth = 282 + variantOffset;
    const popupWidth = clamp(
      preferredWidth,
      popupMinWidth,
      Math.min(popupMaxWidth, Math.max(popupMinWidth, mobilePathLayout.width - 38))
    );
    const popupHeight = 214;
    const left = clamp(
      selectedNode.centerX - (popupWidth / 2),
      8,
      Math.max(8, mobilePathLayout.width - popupWidth - 8)
    );
    const aboveTop = selectedNode.top - popupHeight - 8;
    const belowTop = selectedNode.top + mobilePathLayout.ringSize + 8;
    let top = aboveTop;
    let placeBelow = false;
    if (typeof window !== 'undefined' && mobilePathCanvasRef.current) {
      const rect = mobilePathCanvasRef.current.getBoundingClientRect();
      const safeTop = 64;
      const safeBottom = 92;
      const screenMinTop = safeTop;
      const screenMaxTop = Math.max(screenMinTop, window.innerHeight - safeBottom - popupHeight);

      const aboveScreenTopRaw = rect.top + aboveTop;
      const belowScreenTopRaw = rect.top + belowTop;
      const aboveScreenTop = clamp(aboveScreenTopRaw, screenMinTop, screenMaxTop);
      const belowScreenTop = clamp(belowScreenTopRaw, screenMinTop, screenMaxTop);
      const aboveShift = Math.abs(aboveScreenTop - aboveScreenTopRaw);
      const belowShift = Math.abs(belowScreenTop - belowScreenTopRaw);

      if (belowShift + 4 < aboveShift) {
        placeBelow = true;
      } else if (aboveShift + 4 < belowShift) {
        placeBelow = false;
      } else {
        const nodeScreenTop = rect.top + selectedNode.top;
        const nodeScreenBottom = nodeScreenTop + mobilePathLayout.ringSize;
        const availableAbove = nodeScreenTop - screenMinTop - 8;
        const availableBelow = (window.innerHeight - safeBottom) - nodeScreenBottom - 8;
        placeBelow = availableBelow > availableAbove;
      }

      const chosenScreenTop = placeBelow ? belowScreenTop : aboveScreenTop;
      top = chosenScreenTop - rect.top;
    } else {
      const minTop = 6;
      const maxTop = Math.max(minTop, mobilePathLayout.height - popupHeight - 6);
      const aboveClamped = clamp(aboveTop, minTop, maxTop);
      const belowClamped = clamp(belowTop, minTop, maxTop);
      const aboveShift = Math.abs(aboveClamped - aboveTop);
      const belowShift = Math.abs(belowClamped - belowTop);
      placeBelow = belowShift < aboveShift;
      top = placeBelow ? belowClamped : aboveClamped;
    }

    const nodeCenterY = selectedNode.top + (mobilePathLayout.ringSize / 2);
    const popupCenterY = top + (popupHeight / 2);
    placeBelow = popupCenterY >= nodeCenterY;

    const arrowLeft = clamp(selectedNode.centerX - left - 7, 14, popupWidth - 22);
    return {
      node: selectedNode,
      width: popupWidth,
      height: popupHeight,
      left,
      top,
      placeBelow,
      arrowLeft
    };
  }, [mobileLevelPickerTaskId, mobilePathLayout]);

  useEffect(() => {
    if (mobileLevelPopupLayout) {
      setMobileLevelPopupView(mobileLevelPopupLayout);
      setMobileLevelPopupClosing(false);
      return undefined;
    }
    if (!mobileLevelPopupView) return undefined;
    setMobileLevelPopupClosing(true);
    const timer = setTimeout(() => {
      setMobileLevelPopupView(null);
      setMobileLevelPopupClosing(false);
    }, 220);
    return () => clearTimeout(timer);
  }, [mobileLevelPopupLayout, mobileLevelPopupView]);

  const openTaskFromMobilePath = (task, levelId) => {
    if (!task) return;
    setMobileLevelPickerTaskId(null);
    setActiveLevel(null);
    setActiveQuestionIndex(null);
    setAutoTargetQuestions(null);
    setAutoLevel(['basic', 'advanced', 'expert'].includes(levelId) ? levelId : null);
    setForceInitialLevelLaunch(true);
    setActiveTask(task);
  };
  const getBallLabel = (value) => {
    if (!Number.isFinite(value)) return 'баллов';
    if (value % 1 !== 0) return 'балла';
    const abs = Math.abs(Math.round(value));
    const mod100 = abs % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'баллов';
    const mod10 = abs % 10;
    if (mod10 === 1) return 'балл';
    if (mod10 >= 2 && mod10 <= 4) return 'балла';
    return 'баллов';
  };
  const getProgressHeadline = (value) => {
    if (!Number.isFinite(value)) return 'Хорошее начало';
    const score = Math.max(0, Math.min(100, Math.round(value)));
    const labels = [
      { min: 0, label: 'Хорошее начало' },
      { min: 5, label: 'Разогрев в пути' },
      { min: 10, label: 'Первые победы' },
      { min: 15, label: 'Набираем темп' },
      { min: 20, label: 'Уверенный старт' },
      { min: 25, label: 'Держим курс' },
      { min: 30, label: 'Ровный прогресс' },
      { min: 35, label: 'Ритм пойман' },
      { min: 40, label: 'Середина пути' },
      { min: 45, label: 'Хорошая динамика' },
      { min: 50, label: 'Экватор' },
      { min: 55, label: 'Больше половины выполнено' },
      { min: 60, label: 'Уровень растёт' },
      { min: 65, label: 'Уже близко' },
      { min: 70, label: 'Уверенный результат' },
      { min: 75, label: 'Фокус на детали' },
      { min: 80, label: 'Очень близко' },
      { min: 85, label: 'Финишная подготовка' },
      { min: 90, label: 'Финишная прямая' },
      { min: 95, label: 'Почти 100' },
      { min: 100, label: 'Сотка!' }
    ];
    let current = labels[0].label;
    for (const entry of labels) {
      if (score >= entry.min) current = entry.label;
    }
    return current;
  };

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="inline-flex w-full sm:w-auto items-center gap-2 rounded-2xl border border-purple-200/80 bg-white/90 px-3 py-2 shadow-sm shadow-purple-100/40">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-purple-500">Ученик</span>
        <StudentSearchSelect
          students={studentsList}
          value={activeStudentId || ''}
          onChange={(value) => onSelectStudent?.(value || null)}
          disabled={studentsLoading || studentsList.length === 0}
          className="w-full min-w-0 sm:min-w-[180px] rounded-xl border border-purple-100 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-purple-500 disabled:opacity-70"
          dark={String(theme || '').trim().toLowerCase() === 'dark'}
        />
      </div>
    );
  };

  const getNotesTaskKeys = (value) => {
    const normalized = normalizeTaskNumber(value);
    if (!Number.isFinite(normalized)) return [];
    if (normalized === GAME_THEORY_TASK) return [19, 20, 21];
    return [normalized];
  };

  const getMergedNote = (value) => {
    const keys = getNotesTaskKeys(value);
    if (!keys.length) return '';
    for (const key of keys) {
      const noteValue = studentData.notesByTask?.[key];
      if (typeof noteValue === 'string' && noteValue.trim()) return noteValue;
    }
    const fallback = studentData.notesByTask?.[keys[0]];
    return typeof fallback === 'string' ? fallback : '';
  };

  useEffect(() => {
    setNotesMobileFilter('all');
    setNotesMobileQuery('');
  }, [effectiveStudentId]);

  const notesCards = taskList.map((task, idx) => {
    const num = task.number;
    const note = getMergedNote(num);
    const hasNote = Boolean(note && note.trim());
    const searchable = `${getTaskDisplayNumber(task)} ${task.title || ''}`.toLowerCase();
    return {
      task,
      idx,
      num,
      note,
      hasNote,
      searchable
    };
  });
  const notesFilledCount = notesCards.filter((item) => item.hasNote).length;
  const notesEmptyCount = Math.max(0, notesCards.length - notesFilledCount);
  const notesQueryNormalized = notesMobileQuery.trim().toLowerCase();
  const filteredNotesCards = notesCards.filter((item) => {
    const passFilter = notesMobileFilter === 'filled'
      ? item.hasNote
      : (notesMobileFilter === 'empty' ? !item.hasNote : true);
    const passQuery = !notesQueryNormalized || item.searchable.includes(notesQueryNormalized);
    return passFilter && passQuery;
  });

  const saveTaskNote = async (taskNumber, note) => {
    if (!effectiveStudentId || role !== 'teacher') return;
    const nextNotes = { ...(studentData.notesByTask || {}) };
    const keys = getNotesTaskKeys(taskNumber);
    if (keys.length === 0) return;
    if (note) {
      keys.forEach((key) => { if (key !== keys[0]) delete nextNotes[key]; });
      nextNotes[keys[0]] = note;
    } else {
      keys.forEach((key) => delete nextNotes[key]);
    }
    setNotesSavingId(taskNumber);
    try {
      const res = await api.updateStudentNotes(effectiveStudentId, { notesByTask: nextNotes });
      setStudentData((prev) => ({ ...prev, notesByTask: res?.notesByTask || nextNotes }));
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setNotesSavingId(null);
    }
  };

  const handleAddMock = async () => {
    if (!effectiveStudentId || role !== 'teacher') return;
    const scoreValue = Number(mockForm.score);
    if (!Number.isFinite(scoreValue)) {
      setDataError('Введите корректный балл');
      return;
    }
    try {
      const entry = await api.addMockExam(effectiveStudentId, {
        date: mockForm.date,
        score: scoreValue,
        comment: mockForm.comment,
      });
      setStudentData((prev) => ({ ...prev, mocks: [entry, ...(prev.mocks || [])] }));
      setMockForm({ date: '', score: '', comment: '' });
      setDataError('');
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleDeleteMock = async (id) => {
    if (!effectiveStudentId || role !== 'teacher') return;
    if (!confirm('Удалить пробник?')) return;
    try {
      await api.deleteMockExam(effectiveStudentId, id);
      setStudentData((prev) => ({ ...prev, mocks: (prev.mocks || []).filter((m) => m.id !== id) }));
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleCreateMockExam = async () => {
    if (role !== 'teacher') return;
    const title = newMockTitle.trim();
    try {
      const created = await api.createMockExam(title);
      setMockExams((prev) => [created, ...(prev || [])]);
      setNewMockTitle('');
      setMockEditorExam(created);
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleSaveMockExam = async (nextExam) => {
    if (!nextExam?.id) return null;
    const payload = { title: nextExam.title, tasks: nextExam.tasks, badges: nextExam.badges };
    const saved = await api.updateMockExam(nextExam.id, payload);
    setMockExams((prev) => (prev || []).map((exam) => (exam.id === saved.id ? saved : exam)));
    setMockEditorExam(saved);
    return saved;
  };

  const handleDuplicateMockExam = async (exam) => {
    if (role !== 'teacher' || !exam?.id || duplicatingMockExamId) return;
    setDuplicatingMockExamId(exam.id);
    try {
      const sourceTitle = String(exam.title || 'Пробник').trim() || 'Пробник';
      const created = await api.createMockExam(`Копия: ${sourceTitle}`);
      const access = normalizeMockExamAccess(exam.access, LEGACY_MOCK_EXAM_ACCESS);
      const saved = await api.updateMockExam(created.id, {
        title: created.title || `Копия: ${sourceTitle}`,
        tasks: exam.tasks || {},
        badges: exam.badges || [],
        access,
      });
      setMockExams((prev) => [saved, ...(prev || [])]);
      setMockEditorExam(saved);
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setDuplicatingMockExamId(null);
    }
  };

  const openMockAccessEditor = (exam) => {
    if (!exam) return;
    if (mockAccessExamId === exam.id) {
      closeMockAccessEditor();
      return;
    }
    const access = normalizeMockExamAccess(exam.access, LEGACY_MOCK_EXAM_ACCESS);
    setMockAccessExamId(exam.id);
    setMockAccessAll(access.all);
    setMockAccessStudents(access.students);
  };

  const closeMockAccessEditor = () => {
    setMockAccessExamId(null);
    setMockAccessAll(false);
    setMockAccessStudents([]);
    setMockAccessSaving(false);
  };

  const toggleMockAccessStudent = (studentIdValue) => {
    const id = String(studentIdValue);
    setMockAccessStudents((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const handleSaveMockAccess = async () => {
    if (!mockAccessExamId) return;
    setMockAccessSaving(true);
    try {
      const payload = {
        access: {
          all: Boolean(mockAccessAll),
          students: mockAccessAll ? [] : mockAccessStudents
        }
      };
      const saved = await api.updateMockExam(mockAccessExamId, payload);
      setMockExams((prev) => (prev || []).map((exam) => (exam.id === saved.id ? saved : exam)));
      const normalized = normalizeMockExamAccess(saved.access, LEGACY_MOCK_EXAM_ACCESS);
      setMockAccessAll(normalized.all);
      setMockAccessStudents(normalized.students);
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setMockAccessSaving(false);
    }
  };

  const handleDeleteMockExamDefinition = async (examId) => {
    if (role !== 'teacher') return;
    if (!confirm('Удалить пробник полностью?')) return;
    try {
      await api.deleteMockExamDefinition(examId);
      setMockExams((prev) => (prev || []).filter((exam) => exam.id !== examId));
      if (mockEditorExam?.id === examId) setMockEditorExam(null);
      if (activeMockExam?.id === examId) {
        mockAttemptRequestIdRef.current += 1;
        setActiveMockExam(null);
        setActiveMockAttempt(null);
        setActiveMockInitialTask(null);
        setActiveMockMode(MOCK_ATTEMPT_MODE_CLASSIC);
        setStartingMockExamId(null);
      }
      if (mockAccessExamId === examId) closeMockAccessEditor();
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleOpenMockExam = async (exam, options = {}) => {
    if (!exam) return;
    const cachedAttempt = mockAttemptsByExam?.[exam.id];
    const cachedStats = exam?.id ? studentMockOverview?.examStatsById?.[exam.id] || null : null;
    const cachedMode = normalizeMockAttemptMode(cachedStats?.attemptMode || cachedAttempt?.mode);
    const requestedMode = normalizeMockAttemptMode(options?.mode, cachedMode);
    const modeLocked = Boolean(
      cachedStats?.isModeLocked
      || cachedAttempt?.modeLockedAt
      || cachedAttempt?.timerStartedAt
      || cachedStats?.attemptedCount > 0
    );
    const canSwitchClassicAttemptToTimer = Boolean(
      modeLocked
      && cachedMode === MOCK_ATTEMPT_MODE_CLASSIC
      && requestedMode === MOCK_ATTEMPT_MODE_TIMER
      && !cachedAttempt?.timerFinishedAt
    );
    const resolvedMode = canSwitchClassicAttemptToTimer
      ? MOCK_ATTEMPT_MODE_TIMER
      : (modeLocked ? cachedMode : requestedMode);
    const canWarnClassicModeLock = Boolean(effectiveStudentId) && isMockExamAccessible(exam, effectiveStudentId);
    if (
      canWarnClassicModeLock
      && !modeLocked
      && resolvedMode === MOCK_ATTEMPT_MODE_CLASSIC
      && !options?.skipClassicModeWarning
    ) {
      setClassicModeWarning({
        exam,
        options: {
          ...options,
          mode: MOCK_ATTEMPT_MODE_CLASSIC,
        },
      });
      return;
    }
    const requestId = mockAttemptRequestIdRef.current + 1;
    mockAttemptRequestIdRef.current = requestId;
    setStartingMockExamId(exam.id);
    setActiveMockMode(resolvedMode);
    setActiveMockExam(exam);
    setActiveMockInitialTask(options?.initialTaskNumber || null);
    setActiveMockAttempt(cachedAttempt && typeof cachedAttempt === 'object' ? cachedAttempt : null);
    if (!effectiveStudentId) {
      setStartingMockExamId(null);
      return;
    }
    if (!isMockExamAccessible(exam, effectiveStudentId)) {
      setActiveMockAttempt({});
      setStartingMockExamId(null);
      return;
    }
    setMockExamsError('');
    try {
      const shouldStartAttempt = role === 'student' && (!modeLocked || canSwitchClassicAttemptToTimer);
      const fetchedAttempt = shouldStartAttempt
        ? await api.startMockAttempt(mockAttemptStudentId, exam.id, {
          mode: resolvedMode,
        })
        : await api.getMockAttempt(mockAttemptStudentId, exam.id);
      const shouldResumeTimer = role === 'student'
        && isMockTimerAttemptPaused(fetchedAttempt)
        && !isMockTimerAttemptEnded(fetchedAttempt);
      const attempt = shouldResumeTimer
        ? await api.resumeMockAttempt(mockAttemptStudentId, exam.id, { mode: MOCK_ATTEMPT_MODE_TIMER })
        : fetchedAttempt;
      if (mockAttemptRequestIdRef.current !== requestId) return;
      setActiveMockAttempt(attempt && typeof attempt === 'object' ? attempt : {});
      setActiveMockMode(normalizeMockAttemptMode(attempt?.mode, resolvedMode));
      setMockAttemptsByExam((prev) => ({
        ...prev,
        [exam.id]: attempt && typeof attempt === 'object' ? attempt : {}
      }));
    } catch (err) {
      if (mockAttemptRequestIdRef.current !== requestId) return;
      setMockExamsError(err?.message || 'Не удалось открыть пробник.');
      setActiveMockAttempt({});
    } finally {
      if (mockAttemptRequestIdRef.current === requestId) {
        setStartingMockExamId(null);
      }
    }
  };

  const handleRestoreMockTimerRewards = async (exam) => {
    if (role !== 'teacher' || !effectiveStudentId || !exam?.id) return;
    if (!confirm('Вернуть ученику награды таймера для этого пробника? Уже выданные раньше рубежи снова смогут дать сундуки.')) return;
    const examId = exam.id;
    setRestoringMockTimerRewardsExamId(examId);
    try {
      const attempt = await api.restoreMockTimerRewards(effectiveStudentId, examId);
      const normalizedAttempt = attempt && typeof attempt === 'object' ? attempt : {};
      setMockAttemptsByExam((prev) => ({
        ...(prev || {}),
        [examId]: normalizedAttempt,
      }));
      setActiveMockAttempt((current) => (
        String(activeMockExam?.id || '') === String(examId || '')
          ? normalizedAttempt
          : current
      ));
      setMockExamsError('');
    } catch (err) {
      alert(err?.message || 'Не удалось вернуть награды таймера.');
    } finally {
      setRestoringMockTimerRewardsExamId((current) => (
        String(current || '') === String(examId || '') ? null : current
      ));
    }
  };

  const handleContinueMockTimerAttempt = async (exam, options = {}) => {
    if (role !== 'teacher' || !effectiveStudentId || !exam?.id) return null;
    if (!options?.skipConfirm && !confirm('Продолжить завершённый таймерный экзамен? Результаты снова скроются до повторного завершения, уже выданные награды не снимутся.')) {
      return null;
    }
    const examId = exam.id;
    setContinuingMockTimerExamId(examId);
    try {
      const attempt = await api.continueMockTimerAttempt(effectiveStudentId, examId);
      const normalizedAttempt = attempt && typeof attempt === 'object' ? attempt : {};
      setMockAttemptsByExam((prev) => ({
        ...(prev || {}),
        [examId]: normalizedAttempt,
      }));
      setActiveMockAttempt((current) => (
        String(activeMockExam?.id || '') === String(examId || '')
          ? normalizedAttempt
          : current
      ));
      setActiveMockMode(MOCK_ATTEMPT_MODE_TIMER);
      setMockExamsError('');
      onMockAttemptSaved?.(examId, normalizedAttempt);
      return normalizedAttempt;
    } catch (err) {
      if (!options?.silentErrors) alert(err?.message || 'Не удалось продолжить экзамен.');
      throw err;
    } finally {
      setContinuingMockTimerExamId((current) => (
        String(current || '') === String(examId || '') ? null : current
      ));
    }
  };

  const closeClassicModeWarning = () => {
    setClassicModeWarning(null);
  };

  const confirmClassicModeStart = () => {
    const pending = classicModeWarning;
    setClassicModeWarning(null);
    if (!pending?.exam) return;
    handleOpenMockExam(pending.exam, {
      ...(pending.options || {}),
      mode: MOCK_ATTEMPT_MODE_CLASSIC,
      skipClassicModeWarning: true,
    });
  };

  const showStudentMockPreview = Boolean(effectiveStudentId);
  const hasStudentMockPreview = showStudentMockPreview && studentVisibleMockExams.length > 0;
  const studentMockTaskChart = useMemo(() => {
    const taskChartData = Array.isArray(studentMockOverview?.taskChartData)
      ? studentMockOverview.taskChartData
      : [];
    if (taskChartData.length === 0) return null;

    const width = 760;
    const height = 220;
    const padding = { top: 14, right: 12, bottom: 34, left: 34 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const baselineY = padding.top + plotHeight;
    const pointCount = Math.max(taskChartData.length - 1, 1);

    const points = taskChartData.map((item, index) => {
      const x = padding.left + (plotWidth * index) / pointCount;
      const y = padding.top + ((100 - item.completionPercent) / 100) * plotHeight;
      return {
        ...item,
        x,
        y,
      };
    });

    const yTicks = [0, 25, 50, 75, 100].map((value) => ({
      value,
      y: padding.top + ((100 - value) / 100) * plotHeight,
    }));
    const xTicks = points;

    return {
      width,
      height,
      baselineY,
      points,
      yTicks,
      xTicks,
      linePath: buildMockChartLinePath(points),
      areaPath: buildMockChartAreaPath(points, baselineY),
      gradientId: `mock-task-chart-gradient-${role === 'teacher' ? 'teacher' : 'student'}`,
    };
  }, [role, studentMockOverview]);

  const getStudentMockStats = (exam) => (
    exam?.id ? studentMockOverview?.examStatsById?.[exam.id] || null : null
  );

  const studentMockExamRows = useMemo(() => (
    (studentVisibleMockExams || []).map((exam, index) => {
      const attempt = mockAttemptsByExam?.[exam.id];
      const fallbackAttemptMode = normalizeMockAttemptMode(attempt?.mode);
      const fallbackSolvedMap = fallbackAttemptMode === MOCK_ATTEMPT_MODE_TIMER && !String(attempt?.timerFinishedAt || '').trim()
        ? {}
        : attempt?.solved;
      const primary = getPrimaryScoreFromSolved(fallbackSolvedMap);
      const secondary = getSecondaryScoreFromPrimary(primary);
      const fallbackStats = {
        examId: exam?.id || '',
        examTitle: exam?.title || 'Пробник',
        primary,
        secondary,
        attemptMode: normalizeMockAttemptMode(attempt?.mode),
        isModeLocked: Boolean(attempt?.modeLockedAt || attempt?.timerStartedAt),
        timerRemainingMs: getMockTimerRemainingMs(attempt),
        isTimerPaused: isMockTimerAttemptPaused(attempt),
        isTimerExpired: false,
        totalCount: 0,
        attemptedCount: 0,
        solvedCount: 0,
        remainingCount: 0,
        progressPercent: 0,
        attemptedPercent: 0,
        hasStarted: false,
        isCompleted: false,
        canRestartTimerAttempt: false,
        actionLabel: 'Начать',
        updatedLabel: '',
        taskStats: [],
      };
      const stats = studentMockOverview?.examStatsById?.[exam.id] || fallbackStats;
      const lockedMode = normalizeMockAttemptMode(stats.attemptMode || attempt?.mode);
      const modeLocked = Boolean(
        stats.isModeLocked
        || attempt?.modeLockedAt
        || attempt?.timerStartedAt
        || stats.attemptedCount > 0
      );
      const canSwitchClassicAttemptToTimer = Boolean(
        modeLocked
        && lockedMode === MOCK_ATTEMPT_MODE_CLASSIC
        && !attempt?.timerFinishedAt
      );
      const selectedMode = modeLocked && !canSwitchClassicAttemptToTimer
        ? lockedMode
        : normalizeMockAttemptMode(
          mockModeByExamId?.[exam.id] || (canSwitchClassicAttemptToTimer ? lockedMode : mockModePreset),
          lockedMode
        );
      const isTimerMode = selectedMode === MOCK_ATTEMPT_MODE_TIMER;
      const canRestartTimerAttempt = Boolean(isTimerMode && (stats.canRestartTimerAttempt || isMockTimerAttemptEnded(attempt)));
      const timerRewardsDisabled = Boolean(attempt?.timerRewardsDisabled || (canSwitchClassicAttemptToTimer && isTimerMode));
      const rewardInfo = getMockNextRewardInfo(stats.secondary, selectedMode);
      const taskStats = Array.isArray(stats.taskStats) ? stats.taskStats : [];
      const nextOpenTask = taskStats.find((taskStat) => !taskStat.solved && taskStat.attempted)
        || taskStats.find((taskStat) => !taskStat.solved)
        || taskStats[0]
        || null;
      const badgesText = normalizeMockExamBadges(exam.badges)
        .map((badge) => badge.label)
        .join(' ');
      const searchText = [
        exam?.title,
        badgesText,
        getMockExamTaskKeys(exam).join(' '),
        taskStats.map((taskStat) => `${taskStat.taskKey} ${taskStat.label}`).join(' '),
        getMockModeLabel(selectedMode),
      ]
        .join(' ')
        .toLowerCase();
      const isFocus = String(stats.examId || '') === String(studentMockOverview?.focusExamId || '');
      const isBest = String(stats.examId || '') === String(studentMockOverview?.bestExamId || '');
      const hasExamTasks = stats.totalCount > 0;
      const rewardIsNear = Boolean(rewardInfo.milestone && rewardInfo.gap <= 10 && !timerRewardsDisabled);
      let smartRank = 50;
      if (isFocus) {
        smartRank = 0;
      } else if (stats.hasStarted && !stats.isCompleted) {
        smartRank = 10;
      } else if (!stats.hasStarted && hasExamTasks) {
        smartRank = 25;
      } else if (stats.isCompleted) {
        smartRank = 70;
      }
      if (isTimerMode && stats.hasStarted && !stats.isTimerExpired && !stats.isCompleted) smartRank -= 4;
      if (rewardIsNear) smartRank -= 3;
      if (stats.isTimerExpired && !stats.isCompleted) smartRank += 18;

      return {
        exam,
        attempt,
        stats,
        index,
        hasExamTasks,
        lockedMode,
        modeLocked,
        canSwitchClassicAttemptToTimer,
        selectedMode,
        isTimerMode,
        canRestartTimerAttempt,
        timerRewardsDisabled,
        scoreValue: rewardInfo.scoreValue,
        nextRewardMilestone: rewardInfo.milestone,
        rewardGap: rewardInfo.gap,
        rewardIsNear,
        nextOpenTask,
        searchText,
        isFocus,
        isBest,
        smartRank,
      };
    })
  ), [
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
    mockAttemptsByExam,
    mockModeByExamId,
    mockModePreset,
    studentMockOverview,
    studentVisibleMockExams,
  ]);

  const mockFilterCounts = useMemo(() => {
    const counts = {
      all: studentMockExamRows.length,
      focus: 0,
      active: 0,
      new: 0,
      timer: 0,
      reward: 0,
      done: 0,
    };
    studentMockExamRows.forEach((row) => {
      const stats = row.stats;
      if (!stats || stats.totalCount <= 0) return;
      if (row.isFocus || row.rewardIsNear || (stats.hasStarted && !stats.isCompleted)) counts.focus += 1;
      if (row.isTimerMode || stats.attemptMode === MOCK_ATTEMPT_MODE_TIMER) counts.timer += 1;
      if (row.rewardIsNear) counts.reward += 1;
      if (stats.isCompleted) {
        counts.done += 1;
      } else if (stats.hasStarted) {
        counts.active += 1;
      } else {
        counts.new += 1;
      }
    });
    return counts;
  }, [studentMockExamRows]);

  const filteredStudentMockRows = useMemo(() => {
    const normalizedQuery = mockExamQuery.trim().toLowerCase();
    const rows = studentMockExamRows.filter((row) => {
      const stats = row.stats;
      if (!stats || stats.totalCount <= 0) return mockExamFilter === 'all' && !normalizedQuery;
      if (mockExamFilter === 'focus' && !(row.isFocus || row.rewardIsNear || (stats.hasStarted && !stats.isCompleted))) return false;
      if (mockExamFilter === 'active' && !(stats.hasStarted && !stats.isCompleted)) return false;
      if (mockExamFilter === 'new' && stats.hasStarted) return false;
      if (mockExamFilter === 'timer' && !(row.isTimerMode || stats.attemptMode === MOCK_ATTEMPT_MODE_TIMER)) return false;
      if (mockExamFilter === 'reward' && !row.rewardIsNear) return false;
      if (mockExamFilter === 'done' && !stats.isCompleted) return false;
      if (normalizedQuery && !row.searchText.includes(normalizedQuery)) return false;
      return true;
    });

    return [...rows].sort((left, right) => {
      if (mockExamSort === 'title') {
        return String(left.exam?.title || '').localeCompare(String(right.exam?.title || ''), 'ru', {
          sensitivity: 'base',
          numeric: true,
        });
      }
      if (mockExamSort === 'progress') {
        if (left.stats.progressPercent !== right.stats.progressPercent) {
          return right.stats.progressPercent - left.stats.progressPercent;
        }
        return right.stats.solvedCount - left.stats.solvedCount;
      }
      if (mockExamSort === 'score') {
        if (left.stats.secondary !== right.stats.secondary) return right.stats.secondary - left.stats.secondary;
        return right.stats.primary - left.stats.primary;
      }
      if (mockExamSort === 'reward') {
        const leftGap = left.nextRewardMilestone ? left.rewardGap : 999;
        const rightGap = right.nextRewardMilestone ? right.rewardGap : 999;
        if (leftGap !== rightGap) return leftGap - rightGap;
        return right.stats.secondary - left.stats.secondary;
      }
      if (left.smartRank !== right.smartRank) return left.smartRank - right.smartRank;
      if (left.stats.hasStarted !== right.stats.hasStarted) return left.stats.hasStarted ? -1 : 1;
      if (left.stats.progressPercent !== right.stats.progressPercent) {
        return right.stats.progressPercent - left.stats.progressPercent;
      }
      return left.index - right.index;
    });
  }, [mockExamFilter, mockExamQuery, mockExamSort, studentMockExamRows]);

  const studentMockDashboard = useMemo(() => {
    const playableRows = studentMockExamRows.filter((row) => row.hasExamTasks);
    const activeTimerRows = playableRows.filter((row) => (
      row.isTimerMode
      && row.stats.hasStarted
      && !row.stats.isCompleted
      && !row.stats.isTimerExpired
    ));
    const expiredTimerRows = playableRows.filter((row) => row.isTimerMode && row.stats.isTimerExpired && !row.stats.isCompleted);
    const nearRewardRows = playableRows.filter((row) => row.rewardIsNear);
    const untouchedTimerRows = playableRows.filter((row) => row.isTimerMode && !row.modeLocked && !row.stats.hasStarted);
    const priorityRows = [...playableRows]
      .filter((row) => !row.stats.isCompleted || row.rewardIsNear || row.isFocus)
      .sort((left, right) => {
        if (left.smartRank !== right.smartRank) return left.smartRank - right.smartRank;
        if (left.rewardGap !== right.rewardGap) return left.rewardGap - right.rewardGap;
        return right.stats.secondary - left.stats.secondary;
      })
      .slice(0, 3);
    const timerChestsTotal = Math.max(0, Math.floor(Number(studentData?.mockTimerChestsTotal) || 0));
    const potentialTimerChests = playableRows
      .filter((row) => !row.timerRewardsDisabled)
      .length * MOCK_TIMER_CHEST_MILESTONES.length;

    return {
      activeTimerCount: activeTimerRows.length,
      expiredTimerCount: expiredTimerRows.length,
      nearRewardCount: nearRewardRows.length,
      untouchedTimerCount: untouchedTimerRows.length,
      timerChestsTotal,
      potentialTimerChests,
      priorityRows,
      bestNearRewardRow: nearRewardRows
        .sort((left, right) => {
          if (left.rewardGap !== right.rewardGap) return left.rewardGap - right.rewardGap;
          return right.stats.secondary - left.stats.secondary;
        })[0] || null,
    };
  }, [studentData?.mockTimerChestsTotal, studentMockExamRows]);

  const focusMockExam = useMemo(() => (
    studentVisibleMockExams.find((exam) => String(exam?.id) === String(studentMockOverview?.focusExamId || '')) || null
  ), [studentMockOverview?.focusExamId, studentVisibleMockExams]);

  const openFocusMockExam = () => {
    if (!focusMockExam) return;
    handleOpenMockExam(focusMockExam, { initialTaskNumber: studentMockOverview?.focusTaskKey || null });
  };

  const openMockTaskFromInsight = (taskStat) => {
    if (!taskStat) return;
    const targetExam = studentVisibleMockExams.find((exam) => String(exam?.id) === String(taskStat.openExamId || ''))
      || focusMockExam
      || studentVisibleMockExams[0]
      || null;
    if (!targetExam) return;
    handleOpenMockExam(targetExam, { initialTaskNumber: taskStat.taskKey });
  };

  const renderStudentMockCard = (exam, examRow = null) => {
    if (!exam) return null;
    const stickerSurface = String(theme || '').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
    const examBadges = normalizeMockExamBadges(exam.badges);
    const primaryBadge = examBadges[0] || null;
    const secondaryBadges = examBadges.slice(1);
    const attempt = examRow?.attempt || mockAttemptsByExam?.[exam.id];
    const fallbackAttemptMode = normalizeMockAttemptMode(attempt?.mode);
    const fallbackSolvedMap = fallbackAttemptMode === MOCK_ATTEMPT_MODE_TIMER && !String(attempt?.timerFinishedAt || '').trim()
      ? {}
      : attempt?.solved;
    const primary = getPrimaryScoreFromSolved(fallbackSolvedMap);
    const secondary = getSecondaryScoreFromPrimary(primary);
    const awardedCoinMilestones = normalizeMockCoinMilestones(attempt?.coinsAwardedMilestones);
    const awardedTimerChestMilestones = normalizeMockCoinMilestones(attempt?.timerChestAwardedMilestones);
    const examStats = examRow?.stats || getStudentMockStats(exam) || {
      primary,
      secondary,
      attemptMode: normalizeMockAttemptMode(attempt?.mode),
      isModeLocked: Boolean(attempt?.modeLockedAt || attempt?.timerStartedAt),
      timerRemainingMs: getMockTimerRemainingMs(attempt),
      isTimerPaused: isMockTimerAttemptPaused(attempt),
      isTimerExpired: false,
      totalCount: 0,
      attemptedCount: 0,
      solvedCount: 0,
      remainingCount: 0,
      progressPercent: 0,
      hasStarted: false,
      isCompleted: false,
      canRestartTimerAttempt: false,
      actionLabel: 'Начать',
      updatedLabel: '',
      taskStats: [],
    };
    const hasExamTasks = examStats.totalCount > 0;
    const lockedMode = examRow?.lockedMode || normalizeMockAttemptMode(examStats.attemptMode || attempt?.mode);
    const modeLocked = Boolean(examRow?.modeLocked || examStats.isModeLocked);
    const canSwitchClassicAttemptToTimer = Boolean(
      examRow?.canSwitchClassicAttemptToTimer
      || (
        modeLocked
        && lockedMode === MOCK_ATTEMPT_MODE_CLASSIC
        && !attempt?.timerFinishedAt
      )
    );
    const selectedMode = examRow?.selectedMode || (
      modeLocked && !canSwitchClassicAttemptToTimer
        ? lockedMode
        : normalizeMockAttemptMode(
          mockModeByExamId?.[exam.id] || (canSwitchClassicAttemptToTimer ? lockedMode : mockModePreset),
          lockedMode
        )
    );
    const isTimerMode = Boolean(examRow?.isTimerMode ?? (selectedMode === MOCK_ATTEMPT_MODE_TIMER));
    const timerResultsHidden = Boolean(
      isTimerMode
      && normalizeMockAttemptMode(attempt?.mode) === MOCK_ATTEMPT_MODE_TIMER
      && modeLocked
      && !String(attempt?.timerFinishedAt || '').trim()
      && examStats.attemptedCount > 0
    );
    const shouldWarnClassicLock = hasExamTasks && !modeLocked && !isTimerMode;
    const visibleMilestones = isTimerMode ? MOCK_TIMER_CHEST_MILESTONES : MOCK_COIN_MILESTONES;
    const achievedCoinMilestones = new Set(
      MOCK_COIN_MILESTONES
        .filter((milestone) => examStats.secondary >= milestone.score)
        .map((milestone) => milestone.score)
    );
    const awardedMilestoneSet = new Set(isTimerMode ? awardedTimerChestMilestones : awardedCoinMilestones);
    const nextRewardMilestone = examRow?.nextRewardMilestone
      || visibleMilestones.find((milestone) => examStats.secondary < milestone.score);
    const isFocusExam = studentMockOverview?.focusExamId === exam.id;
    const isBestExam = studentMockOverview?.bestExamId === exam.id;
    const cardStateClass = isFocusExam
      ? 'mock-student-card--focus'
      : isBestExam
        ? 'mock-student-card--best'
        : examStats.isCompleted
          ? 'mock-student-card--done'
          : '';
    const numericSecondaryScore = Number(examStats.secondary);
    const scoreValue = Number.isFinite(numericSecondaryScore)
      ? Math.max(0, Math.min(100, numericSecondaryScore))
      : 0;
    const progressValue = Math.max(0, Math.min(100, Number(examStats.progressPercent) || 0));
    const scoreGap = examRow?.rewardGap ?? (nextRewardMilestone ? Math.max(0, nextRewardMilestone.score - scoreValue) : 0);
    const canRestartTimerAttempt = Boolean(isTimerMode && (examRow?.canRestartTimerAttempt || examStats.canRestartTimerAttempt || isMockTimerAttemptEnded(attempt)));
    const timerRewardsDisabled = Boolean(attempt?.timerRewardsDisabled || (canSwitchClassicAttemptToTimer && isTimerMode));
    const nextRewardText = timerResultsHidden
      ? 'Результат после завершения'
      : (timerRewardsDisabled
      ? 'Награды таймера отключены'
      : (nextRewardMilestone
        ? `До ${isTimerMode ? 'сундука' : nextRewardMilestone.score}: ${scoreGap} ${getBallLabel(scoreGap)}.`
        : (isTimerMode ? 'Все сундуки открыты' : 'Все рубежи забраны')));
    const scoreRewardValue = timerResultsHidden
      ? '—'
      : (timerRewardsDisabled && isTimerMode
      ? (nextRewardMilestone ? `x${nextRewardMilestone.chests}` : '✓')
      : (nextRewardMilestone
        ? (isTimerMode ? `x${nextRewardMilestone.chests}` : nextRewardMilestone.coins)
        : '✓'));
    const scoreRewardCaption = timerResultsHidden
      ? 'после финиша'
      : (timerRewardsDisabled && isTimerMode
      ? 'недоступно'
      : (nextRewardMilestone
        ? `через ${scoreGap} б.`
        : 'забрано'));
    const timerRemainingLabel = isTimerMode && examStats.timerRemainingMs !== null
      ? formatMockTimerDuration(examStats.timerRemainingMs)
      : formatMockTimerDuration(MOCK_EXAM_TIMER_DURATION_MS);
    const actionLabel = canRestartTimerAttempt ? 'Открыть' : examStats.actionLabel;
    const isStartingThisMock = String(startingMockExamId || '') === String(exam.id || '');
    const actionButtonStateClass = !hasExamTasks
      ? 'mock-start-button--soon'
      : canRestartTimerAttempt
        ? 'mock-start-button--open'
        : examStats.isCompleted
          ? 'mock-start-button--repeat'
          : examStats.hasStarted
            ? 'mock-start-button--continue'
            : 'mock-start-button--start';
    const attemptHasTimerMarkers = Boolean(
      normalizeMockAttemptMode(attempt?.mode) === MOCK_ATTEMPT_MODE_TIMER
      || String(attempt?.timerStartedAt || '').trim()
      || String(attempt?.timerFinishedAt || '').trim()
      || String(attempt?.timerExpiresAt || '').trim()
      || String(attempt?.timerPausedAt || '').trim()
    );
    const finishedTimerRemainingMs = getMockTimerRemainingAtFinishMs(attempt);
    const canTeacherContinueTimerAttempt = Boolean(
      role === 'teacher'
      && effectiveStudentId
      && hasExamTasks
      && normalizeMockAttemptMode(attempt?.mode) === MOCK_ATTEMPT_MODE_TIMER
      && String(attempt?.timerFinishedAt || '').trim()
      && finishedTimerRemainingMs > 0
    );
    const canTeacherRestoreTimerRewards = Boolean(
      role === 'teacher'
      && effectiveStudentId
      && hasExamTasks
      && attempt?.timerRewardsDisabled
      && (isTimerMode || attemptHasTimerMarkers)
    );
    const isRestoringTimerRewards = String(restoringMockTimerRewardsExamId || '') === String(exam.id || '');
    const isContinuingTimerAttempt = String(continuingMockTimerExamId || '') === String(exam.id || '');
    const openStudentMockExam = () => {
      if (!hasExamTasks || isStartingThisMock) return;
      handleOpenMockExam(exam, { mode: selectedMode });
    };
    const setStudentMockMode = (nextMode) => {
      if (modeLocked && !canSwitchClassicAttemptToTimer) return;
      setMockModeByExamId((prev) => ({
        ...(prev || {}),
        [exam.id]: normalizeMockAttemptMode(nextMode),
      }));
    };

    return (
      <div
        key={exam.id}
        role={hasExamTasks ? 'button' : 'group'}
        tabIndex={hasExamTasks ? 0 : undefined}
        onClick={openStudentMockExam}
        onKeyDown={(event) => {
          if (!hasExamTasks) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleOpenMockExam(exam, { mode: selectedMode });
          }
        }}
        onPointerMove={handleMockPremiumCardPointerMove}
        onPointerLeave={handleMockPremiumCardPointerLeave}
        style={{
          '--mock-card-pointer-x': '50%',
          '--mock-card-pointer-y': '42%',
          '--mock-card-tilt-x': '0deg',
          '--mock-card-tilt-y': '0deg',
          '--mock-card-lift': '0px',
        }}
        className={`mock-student-card mock-student-card--compact mock-premium-card group relative overflow-hidden rounded-[26px] border p-0 text-left transition-all duration-300 ${hasExamTasks ? 'cursor-pointer hover:-translate-y-0.5' : 'mock-student-card--empty cursor-default'} ${cardStateClass} ${isTimerMode ? 'mock-student-card--timer-mode' : ''} ${timerRewardsDisabled ? 'mock-student-card--timer-rewards-disabled' : ''}`}
      >
        <div className="mock-quest-grid relative grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="mock-quest-body p-3.5 md:p-4">
            <div className="mock-quest-heading flex flex-col gap-3 md:flex-row md:items-start">
              <div className="mock-ticket-mark mock-quest-emblem flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sky-300">
                <span className="mock-quest-emblem__ring" aria-hidden="true" />
                {isTimerMode ? <Flame size={19} /> : <ShieldCheck size={19} />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mock-quest-badges flex flex-wrap items-center gap-1.5">
                      {isFocusExam && <span className="mock-state-chip mock-state-chip--focus">Фокус</span>}
                      {isBestExam && <span className="mock-state-chip mock-state-chip--best">Лучший</span>}
                      {examStats.isCompleted && <span className="mock-state-chip mock-state-chip--done">Готово</span>}
                      {!hasExamTasks && <span className="mock-state-chip">Скоро</span>}
                      {hasExamTasks && !examStats.isCompleted && examStats.hasStarted && !isFocusExam && (
                        <span className="mock-state-chip mock-state-chip--progress">В работе</span>
                      )}
                      {hasExamTasks && !examStats.hasStarted && (
                        <span className="mock-state-chip">Новый</span>
                      )}
                      {hasExamTasks && isTimerMode && (
                        <span className="mock-state-chip mock-state-chip--timer">
                          <Flame size={11} />
                          Таймер
                        </span>
                      )}
                      {hasExamTasks && isTimerMode && timerRewardsDisabled && (
                        <span className="mock-state-chip mock-state-chip--timer mock-state-chip--no-rewards">
                          <PackageOpen size={11} />
                          Без наград
                        </span>
                      )}
                      {hasExamTasks && isTimerMode && examStats.isTimerPaused && (
                        <span className="mock-state-chip mock-state-chip--timer">
                          <Clock3 size={11} />
                          Пауза
                        </span>
                      )}
                      {hasExamTasks && modeLocked && !isTimerMode && (
                        <span className="mock-state-chip mock-state-chip--classic">Обычный</span>
                      )}
                    </div>

                    <div className="mt-2">
                      <p className="mock-quest-title text-xl font-display font-bold leading-tight text-gray-900 md:text-[1.35rem]">{exam.title}</p>
                    </div>

                    <div className="mock-quest-stats mt-2 flex flex-wrap items-center gap-1.5">
                      {hasExamTasks ? (
                        <>
                          <span>
                            <Target size={12} />
                            {`${progressValue}% пути`}
                          </span>
                          <span>
                            <BookOpen size={12} />
                            {`${examStats.solvedCount}/${examStats.totalCount} заданий`}
                          </span>
                          <span>
                            <Trophy size={12} />
                            {`${scoreValue}/100`}
                          </span>
                          {isTimerMode && (
                            <span className="mock-quest-stat--timer">
                              <Flame size={12} />
                              {modeLocked ? `${examStats.isTimerPaused ? 'Пауза: ' : ''}${timerRemainingLabel}` : 'Таймер 235 мин'}
                            </span>
                          )}
                        </>
                      ) : (
                        <span>
                          <Sparkles size={12} />
                          Задания готовятся
                        </span>
                      )}
                    </div>
                  </div>

                  {primaryBadge && (
                    <div className="mock-quest-sticker flex justify-start xl:justify-end xl:pl-4">
                      <MockExamBadgeSticker badge={primaryBadge} size="sm" className="mock-card-sticker" surface={stickerSurface} />
                    </div>
                  )}
                </div>

                {secondaryBadges.length > 0 && (
                  <MockExamBadges badges={secondaryBadges} className="mt-2" />
                )}

                {hasExamTasks ? (
                  <>
                  <div
                    className={`mock-mode-choice mt-3 ${isTimerMode ? 'mock-mode-choice--timer' : 'mock-mode-choice--classic'} ${modeLocked && !canSwitchClassicAttemptToTimer ? 'mock-mode-choice--locked' : ''} ${shouldWarnClassicLock ? 'mock-mode-choice--warning' : ''}`}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <div className={`mock-mode-switch ${modeLocked && !canSwitchClassicAttemptToTimer ? 'mock-mode-switch--locked' : ''}`}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setStudentMockMode(MOCK_ATTEMPT_MODE_CLASSIC);
                        }}
                        disabled={modeLocked && !canSwitchClassicAttemptToTimer && isTimerMode}
                        aria-pressed={!isTimerMode}
                        className={`mock-mode-switch__option ${!isTimerMode ? 'mock-mode-switch__option--active' : ''}`}
                      >
                        <BookOpen size={14} />
                        <span>Обычный</span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setStudentMockMode(MOCK_ATTEMPT_MODE_TIMER);
                        }}
                        disabled={modeLocked && !canSwitchClassicAttemptToTimer && !isTimerMode}
                        aria-pressed={isTimerMode}
                        className={`mock-mode-switch__option mock-mode-switch__option--timer ${isTimerMode ? 'mock-mode-switch__option--active' : ''}`}
                      >
                        <Clock3 size={14} />
                        <span>Таймер</span>
                      </button>
                    </div>
                  </div>

                  <div className={`mock-reward-shell mock-quest-reward mt-3 rounded-2xl p-2.5 ${isTimerMode ? 'mock-reward-shell--timer' : ''} ${timerRewardsDisabled ? 'mock-reward-shell--disabled' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
                      <span className="mock-reward-title inline-flex items-center gap-1.5 font-semibold">
                        {isTimerMode ? <Flame size={13} /> : <Crown size={13} />}
                        {isTimerMode
                          ? (timerResultsHidden ? 'Таймер: ответы сохранены' : `Таймер: ${scoreValue}/100`)
                          : `Награды: ${scoreValue}/100`}
                      </span>
                      <span className="mock-reward-next">
                        {isTimerMode && modeLocked ? `${examStats.isTimerPaused ? 'Пауза: ' : ''}${timerRemainingLabel} · ` : ''}
                        {nextRewardText}
                      </span>
                    </div>
                    <div className="mock-reward-track mt-2">
                      <div className="mock-reward-track__bar">
                        <div
                          className="mock-reward-track__fill"
                          style={{ width: `${scoreValue}%` }}
                        />
                      </div>
                      {visibleMilestones.map((milestone) => {
                        const rewardDisabled = timerRewardsDisabled && isTimerMode;
                        const achieved = !rewardDisabled && achievedCoinMilestones.has(milestone.score);
                        const awarded = !rewardDisabled && awardedMilestoneSet.has(milestone.score);
                        const isNextRewardMilestone = Boolean(
                          !timerResultsHidden
                          && !rewardDisabled
                          && nextRewardMilestone
                          && milestone.score === nextRewardMilestone.score
                        );
                        const edgeClass = milestone.score >= 100
                          ? 'mock-reward-milestone--edge-end'
                          : milestone.score <= 30
                            ? 'mock-reward-milestone--edge-start'
                            : '';
                        const chestTooltipText = isTimerMode ? (() => {
                          const chestLabel = getMockChestCountLabel(milestone.chests);
                          const scoreLabel = `${milestone.score} ${getBallLabel(milestone.score)}`;
                          if (rewardDisabled) {
                            return `${chestLabel} за ${scoreLabel} сейчас недоступен: награды таймера для этого пробника отключены.`;
                          }
                          if (awarded) {
                            return `${chestLabel} за ${scoreLabel} уже добавлен в хранилище сундуков.`;
                          }
                          if (achieved) {
                            return `${chestLabel} за ${scoreLabel} уже заработан и появится после сохранения результата.`;
                          }
                          return `${chestLabel} за ${scoreLabel}: набери этот результат в режиме таймера, чтобы получить сундук с наградой.`;
                        })() : '';
                        return (
                          <div
                            key={milestone.score}
                            className={`mock-reward-milestone ${achieved ? 'mock-reward-milestone--achieved' : ''} ${awarded ? 'mock-reward-milestone--awarded' : ''} ${isNextRewardMilestone ? 'mock-reward-milestone--next' : ''} ${rewardDisabled ? 'mock-reward-milestone--disabled' : ''} ${edgeClass}`}
                            style={{ left: `${milestone.score}%` }}
                          >
                            <div
                              className={`mock-reward-milestone__label ${isTimerMode ? 'mock-reward-milestone__label--chest' : ''}`}
                              data-tooltip={chestTooltipText || undefined}
                              aria-label={chestTooltipText || undefined}
                              tabIndex={isTimerMode ? 0 : undefined}
                              onClick={isTimerMode ? (event) => event.stopPropagation() : undefined}
                              onKeyDown={isTimerMode ? (event) => event.stopPropagation() : undefined}
                            >
                              {isTimerMode ? (
                                <>
                                  <img
                                    src={chestClosedImage}
                                    alt=""
                                    draggable="false"
                                    className="mock-reward-milestone__chest-icon"
                                  />
                                  <span>{`x${milestone.chests}`}</span>
                                  <span className="mock-reward-milestone__tooltip" role="tooltip">
                                    {chestTooltipText}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span>{milestone.coins}</span>
                                  <CoinGuideIcon className="h-3 w-3 object-contain" />
                                </>
                              )}
                              {awarded && <span className="mock-reward-milestone__check">✓</span>}
                            </div>
                            <div className="mock-reward-milestone__tick" />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  </>
                ) : (
                  <div className="mock-empty-note mt-4 rounded-[22px] px-3 py-2.5 text-xs font-semibold text-gray-500">
                    Учитель ещё добавляет задания.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mock-card-command flex flex-col justify-between gap-3 border-t p-3 lg:border-l lg:border-t-0">
            <div className="mock-command-cta space-y-1.5">
              <Button
                variant={examStats.isCompleted ? 'secondary' : 'primary'}
                onClick={openStudentMockExam}
                disabled={!hasExamTasks || isStartingThisMock}
                aria-busy={isStartingThisMock || undefined}
                className={`mock-start-button ${actionButtonStateClass} ${isStartingThisMock ? 'mock-start-button--loading' : ''} w-full py-1.5 sm:py-2`}
              >
                <span className="mock-start-button__icon">
                  <PlayCircle size={16} />
                </span>
                <span className="mock-start-button__label">
                  {isStartingThisMock ? 'Запускаем...' : (hasExamTasks ? actionLabel : 'Скоро')}
                </span>
                <ChevronRight className="mock-start-button__arrow" size={17} />
              </Button>
            </div>
            <div className="mock-score-panel rounded-2xl border p-3">
              <div className="mock-score-panel__hero flex items-start justify-between gap-3">
                <div className="mock-score-main min-w-0">
                  <div className="mock-score-label inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em]">
                    <Crown size={12} />
                    {hasExamTasks ? 'Баллы' : 'Статус'}
                  </div>
                  <div className="mock-score-value mt-1 font-display text-3xl font-bold leading-none">
                    {hasExamTasks ? (timerResultsHidden ? '—' : examStats.secondary) : '-'}
                  </div>
                </div>
                <div className="mock-score-crown flex shrink-0 items-center justify-center">
                  {isTimerMode ? <Flame size={18} /> : <Trophy size={18} />}
                </div>
              </div>

              {hasExamTasks && (
                <div className="mock-score-stats">
                  <div className="mock-score-stat">
                      <BookOpen size={13} />
                      <div>
                        <strong>{timerResultsHidden ? `${examStats.attemptedCount}/${examStats.totalCount}` : `${examStats.solvedCount}/${examStats.totalCount}`}</strong>
                        <span>{timerResultsHidden ? 'заполнено' : 'решено'}</span>
                      </div>
                  </div>
                  <div className={`mock-score-stat mock-score-stat--reward ${timerRewardsDisabled && isTimerMode ? 'mock-score-stat--reward-disabled' : ''}`}>
                    {isTimerMode ? (
                      <img
                        src={chestClosedImage}
                        alt=""
                        draggable="false"
                        className="mock-score-stat__chest-icon"
                      />
                    ) : (
                      <CoinGuideIcon className="h-3.5 w-3.5 object-contain" />
                    )}
                    <div>
                      <strong>{scoreRewardValue}</strong>
                      <span>{scoreRewardCaption}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="mock-score-track mt-3 h-1.5 overflow-hidden rounded-full">
                <div
                  className="mock-score-track__fill h-full rounded-full"
                  style={{ width: `${scoreValue}%` }}
                />
              </div>
              {canTeacherContinueTimerAttempt && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleContinueMockTimerAttempt(exam);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  disabled={isContinuingTimerAttempt}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] font-black text-cyan-700 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-100 disabled:cursor-wait disabled:opacity-60"
                >
                  <Clock3 size={14} />
                  <span>{isContinuingTimerAttempt ? 'Открываем...' : 'Продолжить экзамен'}</span>
                </button>
              )}
              {canTeacherRestoreTimerRewards && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRestoreMockTimerRewards(exam);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  disabled={isRestoringTimerRewards}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-700 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
                >
                  <PackageOpen size={14} />
                  <span>{isRestoringTimerRewards ? 'Возвращаем...' : 'Вернуть награды таймера'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTeacherMockCard = (exam) => {
    if (!exam) return null;
    const stickerSurface = String(theme || '').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
    const examBadges = normalizeMockExamBadges(exam.badges);
    const primaryBadge = examBadges[0] || null;
    const secondaryBadges = examBadges.slice(1);
    const access = normalizeMockExamAccess(exam.access, LEGACY_MOCK_EXAM_ACCESS);
    const accessLabel = access.all
      ? 'Доступ: всем'
      : access.students.length > 0
        ? `Доступ: ${access.students.length} ученикам`
        : 'Скрыт от учеников';
    const filledTaskCount = getMockExamTaskKeys(exam).length;
    const totalMockTasks = Array.isArray(MOCK_TASK_NUMBERS) ? MOCK_TASK_NUMBERS.length : 0;
    const isDuplicating = String(duplicatingMockExamId || '') === String(exam.id);

    return (
      <div key={exam.id} className="mock-teacher-card rounded-[26px] border p-3 md:p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">{exam.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>{accessLabel}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/75 px-2 py-0.5">
                    <ListChecks size={12} />
                    {`${filledTaskCount}/${totalMockTasks || '27'} заданий`}
                  </span>
                </div>
                {secondaryBadges.length > 0 && <MockExamBadges badges={secondaryBadges} className="mt-2" />}
              </div>
              {primaryBadge && (
                <div className="self-start md:self-center shrink-0">
                  <MockExamBadgeSticker badge={primaryBadge} size="sm" surface={stickerSurface} />
                </div>
              )}
            </div>
          </div>
          <div className="flex w-full xl:w-auto flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setMockEditorExam(exam)} className="w-full sm:w-auto">Редактировать</Button>
            <Button variant="secondary" onClick={() => openMockAccessEditor(exam)} className="w-full sm:w-auto">Доступ</Button>
            <Button
              variant="secondary"
              onClick={() => handleDuplicateMockExam(exam)}
              disabled={isDuplicating}
              className="w-full sm:w-auto"
            >
              <Copy size={16} />
              {isDuplicating ? 'Копируем...' : 'Дублировать'}
            </Button>
            <button
              type="button"
              onClick={() => handleDeleteMockExamDefinition(exam.id)}
              className="p-2 rounded-lg text-red-500 hover:bg-red-50"
              aria-label="Удалить пробник"
            >
              <Trash2 size={16} />
            </button>
            <Button onClick={() => handleOpenMockExam(exam)} className="w-full sm:w-auto">
              <Eye size={16} />
              Предпросмотр
            </Button>
          </div>
        </div>
        {mockAccessExamId === exam.id && (
          <div className="mock-access-panel rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500">
                <Users size={14} />
                Доступ к пробнику
              </div>
              {!mockAccessAll && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMockAccessStudents(studentsList.map((student) => String(student.id)))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-sky-200 hover:text-sky-700"
                  >
                    Все
                  </button>
                  {effectiveStudentId && (
                    <button
                      type="button"
                      onClick={() => setMockAccessStudents([String(effectiveStudentId)])}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-sky-200 hover:text-sky-700"
                    >
                      Только выбранный
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMockAccessStudents([])}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-rose-200 hover:text-rose-600"
                  >
                    Снять
                  </button>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                checked={mockAccessAll}
                onChange={(e) => setMockAccessAll(e.target.checked)}
              />
              Всем ученикам
            </label>
            {!mockAccessAll && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                {studentsList.map((student) => {
                  const studentIdValue = String(student.id);
                  const isChecked = mockAccessStudents.includes(studentIdValue);
                  return (
                    <label key={student.id} className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        checked={isChecked}
                        onChange={() => toggleMockAccessStudent(studentIdValue)}
                      />
                      <span className="truncate">{student.nickname || student.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={closeMockAccessEditor} disabled={mockAccessSaving}>Закрыть</Button>
              <Button onClick={handleSaveMockAccess} disabled={mockAccessSaving}>
                {mockAccessSaving ? 'Сохранение...' : 'Сохранить доступ'}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (role === 'teacher' && studentsList.length === 0) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Успеваемость</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">
          {studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'}
        </div>
      </div>
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Успеваемость</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">Выберите ученика, чтобы посмотреть его прогресс.</div>
      </div>
    );
  }

  const mockReadinessPercent = Math.max(0, Math.min(100, Number(studentMockOverview?.overallProgressPercent) || 0));
  const overviewProgressValue = isStudentMocksSection
    ? mockReadinessPercent
    : Math.max(0, Math.min(100, Number(totalMastery) || 0));
  const overviewHeadline = isStudentMocksSection
    ? 'Готовность'
    : getProgressHeadline(totalMasteryRounded);
  const overviewValue = isStudentMocksSection
    ? `${mockReadinessPercent}%`
    : `${totalMasteryLabel} ${getBallLabel(totalMasteryRounded)}`;
  const overviewDetail = isStudentMocksSection
    ? (
      studentMockOverview?.hasMockTasks
        ? `${studentMockOverview.totalSolvedCount}/${studentMockOverview.totalTaskCount} закрыто`
        : 'Заданий пока нет'
    )
    : '';
  const mockCommandStats = [
    {
      id: 'available',
      label: 'Доступно',
      value: String(studentMockOverview?.visibleExamsCount ?? studentVisibleMockExams.length),
    },
    {
      id: 'started',
      label: 'В работе',
      value: String(studentMockOverview?.startedExamsCount ?? 0),
    },
    {
      id: 'timer',
      label: 'Таймеров',
      value: String(studentMockDashboard?.activeTimerCount ?? 0),
    },
    {
      id: 'reward',
      label: 'Рядом наград',
      value: String(studentMockDashboard?.nearRewardCount ?? 0),
    },
    {
      id: 'chests',
      label: 'Сундуки',
      value: String(studentMockDashboard?.timerChestsTotal ?? 0),
    },
    {
      id: 'best',
      label: 'Лучший',
      value: studentMockOverview?.bestScore != null ? `${studentMockOverview.bestScore} б.` : '-',
    },
  ];
  return (
    <div className={`progress-section progress-section--${section} ${isStudentProgressSection ? 'progress-section--student' : ''} ${isStudentProgressSection ? 'space-y-3 md:space-y-4' : 'space-y-4 md:space-y-6'} animate-fadeIn`} data-tour="progress">
      <div className={`progress-overview-card relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 shadow-[0_16px_34px_rgba(99,102,241,0.14)] ${isStudentProgressSection ? 'progress-overview-card--compact' : 'p-4 md:p-6'}`}>
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className={`relative z-10 flex flex-col ${isStudentProgressSection ? 'gap-2.5 md:gap-3' : 'gap-3 md:gap-5'}`}>
          <div className={`flex flex-col ${isStudentProgressSection ? 'gap-2.5 md:gap-3' : 'gap-3 md:gap-4'} lg:flex-row lg:items-start lg:justify-between`}>
            <div className={isStudentProgressSection ? 'space-y-1.5' : 'space-y-2.5 md:space-y-3'}>
              <div>
                <h2 className={`${isStudentProgressSection ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'} font-bold text-gray-900`}>
                  {isStudentMocksSection ? 'Готовность к пробникам' : 'Успеваемость'}
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {renderStudentPicker()}
            </div>
          </div>

          <div className={`progress-overview-meter relative overflow-hidden rounded-2xl border border-purple-200/80 bg-white/80 shadow-[0_10px_24px_rgba(99,102,241,0.12)] ${isStudentProgressSection ? 'progress-overview-meter--compact' : 'p-3 md:p-4'} ${isStudentMocksSection ? 'progress-overview-meter--mocks' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="progress-overview-badge rounded-full bg-purple-600 px-2.5 py-1 text-[10px] md:text-xs font-bold uppercase tracking-[0.14em] md:tracking-widest text-white">
                  {overviewHeadline}
                </div>
              </div>
              <div className="flex flex-wrap items-end justify-end gap-x-3 gap-y-1">
                <div className={`${isStudentProgressSection ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'} progress-overview-value font-extrabold text-purple-700 drop-shadow-sm`}>
                  {overviewValue}
                </div>
                {overviewDetail && (
                <div className="progress-overview-detail pb-0.5 text-xs font-semibold text-slate-400 md:text-sm">
                  {overviewDetail}
                </div>
                )}
              </div>
            </div>
            <div
              className={`progress-overview-track ${!isStudentMocksSection ? 'progress-overview-track--wave' : ''} relative ${isStudentProgressSection ? 'mt-2 h-4 md:h-5' : 'mt-2.5 md:mt-3 h-6 md:h-8'} w-full overflow-hidden rounded-full border border-purple-100 bg-white/90`}
              role="progressbar"
              aria-label={isStudentMocksSection ? 'Готовность к пробникам' : 'Общий прогресс'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overviewProgressValue}
            >
              <div
                className={`progress-overview-fill ${!isStudentMocksSection ? 'progress-overview-fill--wave' : ''} absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 shadow-[0_0_18px_rgba(168,85,247,0.45)] transition-[width] duration-700 ease-out`}
                style={{ width: `${overviewProgressValue}%` }}
              >
                {!isStudentMocksSection && (
                  <span aria-hidden className="progress-overview-wave-tip" />
                )}
              </div>
              <div
                key={`sheen-${isStudentMocksSection ? mockReadinessPercent : totalMasteryRounded}`}
                className="absolute inset-0 pointer-events-none bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.6),transparent)] animate-sheen"
              />
            </div>
          </div>
        </div>
      </div>

      <div className={`progress-section-tabs grid w-full grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-white/85 p-1.5 md:inline-flex md:w-fit md:flex-wrap md:gap-2 md:p-2 ${isStudentProgressSection ? 'progress-section-tabs--compact' : ''}`}>
        {sectionTabs.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`progress-section-tab progress-section-tab--${item.id} ${active ? 'is-active' : ''} relative inline-flex min-w-0 items-center justify-center gap-1.5 md:gap-2 rounded-xl border px-2 py-2 md:px-4 md:py-2 text-[11px] sm:text-xs md:text-sm font-semibold transition-all ${
                active
                  ? 'border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-200'
                  : 'border-transparent bg-white text-slate-600 hover:border-purple-200 hover:text-purple-700'
              }`}
            >
              <Icon size={14} />
              <span className="truncate sm:hidden">{sectionShortLabels[item.id] || item.label}</span>
              <span className="hidden sm:inline truncate">{item.label}</span>
              {role === 'student' && item.id === 'mocks' && Number(mockNavNewCount) > 0 && (
                <span className="progress-section-tab-new-badge">
                  {Number(mockNavNewCount) > 99 ? '99+' : mockNavNewCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {(dataError || testsDbError) && (
        <div className="space-y-2">
          {dataError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-600">
              {dataError}
            </div>
          )}
          {testsDbError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-700">
              {testsDbError}
            </div>
          )}
        </div>
      )}

      {section === 'progress' && (
        <>
          {role === 'student' && (
            <div className="md:hidden">
              <div className="mobile-topic-path-card rounded-3xl border border-purple-200/80 bg-white/85 p-3 shadow-[0_10px_24px_rgba(99,102,241,0.12)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Путь по темам</h3>
                  <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-semibold text-purple-700">
                    {`Средний: ${totalMasteryLabel}%`}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">Открывай круги по очереди и поднимай прогресс.</div>
                <div className="mt-3">
                  <div
                    ref={mobilePathCanvasRef}
                    className="mobile-topic-path-canvas relative overflow-visible rounded-2xl border border-purple-100/80 bg-gradient-to-b from-white/95 via-purple-50/55 to-sky-50/45 px-1.5 py-2"
                    style={{ height: `${mobilePathLayout.height}px` }}
                    onClick={() => setMobileLevelPickerTaskId(null)}
                  >
                    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
                      <svg
                        className="h-full w-full"
                        viewBox={`0 0 ${mobilePathLayout.width} ${mobilePathLayout.height}`}
                        preserveAspectRatio="none"
                      >
                        {mobilePathLayout.curves.map((curve, curveIdx) => (
                          <path
                            key={`mobile-curve-${curve.id}`}
                            d={curve.d}
                            fill="none"
                            stroke="var(--mobile-path-curve, rgba(168,85,247,0.44))"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeDasharray={curveIdx % 2 === 0 ? '7.5 6.4' : '6.8 6'}
                          />
                        ))}
                      </svg>
                    </div>
                    {mobileLevelPopupView && (
                      <div
                        key={`mobile-level-popover-${mobileLevelPopupView.node.task.id}`}
                        className={`mobile-level-popover absolute z-20 rounded-2xl px-2.5 py-2 backdrop-blur ${
                          mobileLevelPopupView.placeBelow ? 'mobile-level-popover--below' : 'mobile-level-popover--above'
                        } ${mobileLevelPopupClosing ? 'mobile-level-popover--closing' : ''}`}
                        style={{
                          width: `${mobileLevelPopupView.width}px`,
                          left: `${mobileLevelPopupView.left}px`,
                          top: `${mobileLevelPopupView.top}px`
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mobile-level-popover__inner">
                          <div className="mobile-level-popover__title text-[11px] font-bold uppercase tracking-[0.08em] text-purple-700">
                            Выбери уровень
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {Object.values(LEVELS).map((lvl, lvlIdx) => {
                            const tone = lvl.id === 'basic'
                              ? {
                                  accent: '#f59e0b',
                                  variant: 'mobile-level-option--basic',
                                  title: 'text-amber-700',
                                  badge: 'mobile-level-option-badge--basic',
                                  desc: 'text-slate-600'
                                }
                              : (lvl.id === 'advanced'
                                  ? {
                                      accent: '#8b5cf6',
                                      variant: 'mobile-level-option--advanced',
                                      title: 'text-purple-700',
                                      badge: 'mobile-level-option-badge--advanced',
                                      desc: 'text-slate-600'
                                    }
                                  : {
                                      accent: '#10b981',
                                      variant: 'mobile-level-option--expert',
                                      title: 'text-emerald-700',
                                      badge: 'mobile-level-option-badge--expert',
                                      desc: 'text-slate-600'
                                    });
                            const description = lvl.id === 'basic'
                              ? 'Прототипы с реальных ЕГЭ и Демоверсий.'
                              : (lvl.id === 'advanced'
                                  ? 'Усложненные условия.'
                                  : 'Статград и сложнее.');
                            const levelAngle = `${Math.max(0, Math.min(100, Number(lvl.maxScore) || 0)) * 3.6}deg`;
                            return (
                              <button
                                key={`mobile-level-${lvl.id}`}
                                type="button"
                                className={`mobile-level-option w-full rounded-2xl border px-2.5 py-2.5 text-left transition-transform active:scale-[0.99] ${tone.variant}`}
                                style={{
                                  '--i': lvlIdx,
                                  '--level-accent': tone.accent,
                                  '--level-angle': levelAngle
                                }}
                                onClick={() => openTaskFromMobilePath(mobileLevelPopupView.node.task, lvl.id)}
                              >
                                <div className="flex items-start gap-2.5">
                                  <span className="mobile-level-option-ring" aria-hidden="true">
                                    <span className="mobile-level-option-ring__inner">{`${lvl.maxScore}%`}</span>
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className={`text-[12px] font-bold ${tone.title}`}>
                                        {lvl.id === 'basic' ? 'Базовый' : (lvl.id === 'advanced' ? 'Продвинутый' : 'Эксперт')}
                                      </div>
                                      <span className={`mobile-level-option-badge ${tone.badge}`}>
                                        {`до ${lvl.maxScore}%`}
                                      </span>
                                    </div>
                                    <div className={`mt-1 text-[11px] leading-tight ${tone.desc}`}>
                                      {description}
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                            })}
                          </div>
                        </div>
                        <div
                          className={`mobile-level-arrow pointer-events-none absolute ${
                            mobileLevelPopupView.placeBelow ? 'mobile-level-arrow--up' : 'mobile-level-arrow--down'
                          }`}
                          style={{ left: `${mobileLevelPopupView.arrowLeft}px` }}
                        />
                      </div>
                    )}
                    {mobilePathLayout.nodes.map((node) => {
                      const dashOffset = mobilePathLayout.circumference - (node.val / 100) * mobilePathLayout.circumference;
                      const isSelected = String(mobileLevelPickerTaskId) === String(node.task.id);
                      const isMastered = node.val >= 85;
                      const isStable = node.val >= 60 && node.val < 85;
                      const isWarmingUp = node.val >= 40 && node.val < 60;
                      const ringGlow = isMastered
                        ? 'rgba(16,185,129,0.34)'
                        : (isStable ? 'rgba(139,92,246,0.34)' : (isWarmingUp ? 'rgba(245,158,11,0.34)' : 'rgba(148,163,184,0.26)'));
                      const progressAngle = Math.max(0, Math.min(360, Number(node.val || 0) * 3.6));
                      const statusLabel = isMastered
                        ? 'Выполнено 85%+'
                        : (isStable ? 'В темпе' : (isWarmingUp ? 'Практика' : 'Фокус'));
                      const statusTone = isMastered
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : (isStable
                            ? 'border-purple-200 bg-purple-50 text-purple-700'
                            : (isWarmingUp
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-slate-200 bg-slate-50 text-slate-600'));
                      return (
                        <button
                          key={`mobile-path-${node.task.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMobileLevelPickerTaskId((prev) => (
                              String(prev) === String(node.task.id) ? null : node.task.id
                            ));
                          }}
                          className={`mobile-path-node group absolute z-10 rounded-2xl bg-transparent px-1 transition-transform ${
                            isSelected ? 'mobile-path-node--selected scale-[1.03]' : ''
                          }`}
                          style={{
                            left: `${node.centerX}px`,
                            top: `${node.top}px`,
                            width: `${mobilePathLayout.nodeWidth}px`,
                            transform: isSelected ? 'translateX(-50%) scale(1.03)' : 'translateX(-50%)',
                            '--ring-accent': node.ringColor,
                            '--ring-glow': ringGlow,
                            '--progress-angle': `${progressAngle}deg`,
                            '--ring-size': `${mobilePathLayout.ringSize}px`,
                            '--ring-stroke': `${mobilePathLayout.strokeWidth}px`,
                            '--node-delay': `${Math.max(0, node.idx % 8) * 60}ms`
                          }}
                          aria-label={`Открыть тему ${node.task.title}. Выполнено ${node.val}%`}
                          aria-expanded={isSelected}
                        >
                          <div
                            className={`mobile-topic-ring-shell relative mx-auto ${
                              isSelected ? 'mobile-topic-ring-shell--selected' : ''
                            } ${isMastered ? 'mobile-topic-ring-shell--mastered' : ''}`}
                            style={{ height: `${mobilePathLayout.ringSize}px`, width: `${mobilePathLayout.ringSize}px` }}
                          >
                            <div className="mobile-topic-glow absolute inset-[-8px] rounded-full" />
                            <div className="mobile-topic-orbit" />
                            <div className="mobile-topic-conic" />
                            <svg
                              className="relative z-[4] h-full w-full -rotate-90"
                              viewBox={`0 0 ${mobilePathLayout.ringSize} ${mobilePathLayout.ringSize}`}
                              aria-hidden="true"
                            >
                              <circle
                                cx={mobilePathLayout.ringSize / 2}
                                cy={mobilePathLayout.ringSize / 2}
                                r={mobilePathLayout.radius}
                                fill="none"
                                stroke="var(--mobile-ring-track, #d7dee8)"
                                strokeWidth={mobilePathLayout.strokeWidth}
                              />
                              <circle
                                cx={mobilePathLayout.ringSize / 2}
                                cy={mobilePathLayout.ringSize / 2}
                                r={mobilePathLayout.radius}
                                fill="none"
                                stroke={node.ringColor}
                                strokeWidth={mobilePathLayout.strokeWidth}
                                strokeLinecap="round"
                                strokeDasharray={mobilePathLayout.circumference}
                                strokeDashoffset={dashOffset}
                                style={{ transition: 'stroke-dashoffset 420ms ease, stroke 220ms ease' }}
                              />
                            </svg>
                            {node.val > 2 && <span className="mobile-topic-marker" />}
                            <div className="mobile-topic-core absolute inset-[12px] z-[5] rounded-full border border-white/90 bg-gradient-to-br from-white to-purple-50 shadow-[0_12px_22px_rgba(15,23,42,0.18)]" />
                            <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center px-2">
                              <div className="text-[22px] font-black leading-none text-slate-900">№{getTaskDisplayNumber(node.task)}</div>
                              <div className="mt-1 text-[14px] font-bold leading-tight text-slate-600">{`${node.val}%`}</div>
                            </div>
                            <div className="mobile-topic-shine" />
                            {isMastered && <span className="mobile-topic-sparkle" />}
                          </div>
                          <div className="mt-1.5 flex justify-center px-1">
                            <div className={`mobile-topic-label-card max-w-[148px] rounded-xl border border-white/80 bg-white/88 px-2.5 py-1 shadow-[0_7px_14px_rgba(148,163,184,0.22)] ${isSelected ? 'ring-2 ring-purple-200/80' : ''}`}>
                              <div className="text-center text-[12.5px] font-semibold leading-[1.05rem] text-slate-700 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
                                {node.title}
                              </div>
                              <div className="mt-1.5 flex justify-center">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${statusTone}`}>
                                  {statusLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={`${role === 'student' ? 'hidden md:grid' : 'grid'} progress-tests-grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 stagger-children`}>
            {taskList.map((task, idx) => {
              const val = Math.max(0, Math.min(100, Number(progressMap[task.id] || 0)));
              const clickable = role === 'student' || role === 'teacher';
              const xpStats = getProgressTaskXpStats({
                task,
                testsDb,
                studentData,
                levels: LEVELS,
                getTaskLevelXpReward,
                gameTheoryTask: GAME_THEORY_TASK,
              });
              const hasXpBonus = xpStats.multiplier > 1.0001;
              const statusKey = val >= 85 ? 'strong' : (val >= 60 ? 'active' : (val >= 40 ? 'practice' : 'focus'));
              const statusLabel = val >= 85 ? 'Выполнено 85%+' : (val >= 60 ? 'В работе' : (val >= 40 ? 'Нужна практика' : 'Зона внимания'));
              const openTopic = () => {
                if (role === 'teacher') setReviewTask(task);
                else {
                  setForceInitialLevelLaunch(false);
                  setActiveLevel(null);
                  setActiveQuestionIndex(null);
                  setActiveTask(task);
                }
              };
              return (
                <div key={task.id} style={{ '--i': idx }}>
                  <Card
                    className={`progress-topic-card progress-topic-card--${statusKey} ${val > 0 ? 'progress-topic-card--has-progress' : ''} group relative flex min-h-full flex-col overflow-hidden p-3.5 md:p-4 ${clickable ? 'cursor-pointer' : ''}`}
                    onClick={clickable ? openTopic : undefined}
                    onKeyDown={role === 'student' && clickable ? (event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openTopic();
                      }
                    } : undefined}
                    role={role === 'student' && clickable ? 'button' : undefined}
                    tabIndex={role === 'student' && clickable ? 0 : undefined}
                    aria-label={role === 'student' && clickable ? `${task.title}. ${statusLabel}. Выполнено ${val}%` : undefined}
                  >
                    <span className="progress-topic-card__glint" aria-hidden="true" />
                    <div className="progress-topic-card__header flex items-start justify-between gap-2.5">
                      <span className="progress-topic-number inline-flex shrink-0 items-center rounded-lg border px-2 py-1 text-[11px] font-extrabold md:text-xs">
                        №{getTaskDisplayNumber(task)}
                      </span>
                      <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
                        <span
                          className={`progress-task-xp-badge ${hasXpBonus ? 'progress-task-xp-badge--boosted' : ''} inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black`}
                          title={`Опыт за тему: получено ${formatProgressXpAmount(xpStats.earnedXp)} из ${formatProgressXpAmount(xpStats.possibleXp)}${hasXpBonus ? `, бонус ${formatProgressBonusPercent(xpStats.multiplier)}` : ''}`}
                        >
                          <span className="progress-task-xp-badge__label text-[9px] font-black uppercase tracking-[0.12em]">XP</span>
                          <span>{`${formatProgressXpAmount(xpStats.earnedXp)} / ${formatProgressXpAmount(xpStats.possibleXp)}`}</span>
                          {hasXpBonus && (
                            <span className="progress-task-xp-badge__bonus rounded-full border px-1 py-0 text-[9px] leading-4">
                              {formatProgressBonusPercent(xpStats.multiplier)}
                            </span>
                          )}
                        </span>
                        <span className="progress-topic-status inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold md:text-[11px]">
                          <span className="progress-topic-status__dot" aria-hidden="true" />
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2.5 flex min-h-10 items-start justify-between gap-2">
                      {editingTaskId === task.number ? (
                        <input
                          type="text"
                          value={editingTaskTitle}
                          onChange={(e) => setEditingTaskTitle(e.target.value)}
                          onBlur={() => saveTaskTitle(task)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveTaskTitle(task);
                            if (e.key === 'Escape') cancelEditTaskTitle();
                          }}
                          className="w-full px-2 py-1 rounded-lg bg-white border border-purple-200 focus:border-purple-500 outline-none text-sm font-semibold text-gray-800"
                          placeholder="Название темы"
                          autoFocus
                        />
                      ) : (
                        <h3 className="progress-topic-title text-[16px] font-extrabold leading-[1.25] md:text-[17px]">{task.title}</h3>
                      )}
                      {role === 'teacher' && editingTaskId !== task.number && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); startEditTaskTitle(task); }}
                          className="progress-topic-edit shrink-0 rounded-lg border p-1.5 transition-colors"
                          title="Переименовать тему"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {role === 'teacher' && editingTaskId === task.number && (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => { e.stopPropagation(); saveTaskTitle(task); }}
                          className="p-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 disabled:opacity-50"
                          title="Сохранить"
                          disabled={savingTaskTitleId === task.number}
                        >
                          <Save size={14} />
                        </button>
                      )}
                    </div>
                    <div className="progress-topic-progress mt-3">
                      <div
                        className="progress-topic-progress__track overflow-hidden rounded-full"
                        role="progressbar"
                        aria-label={`Выполнение темы «${task.title}»`}
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={val}
                      >
                        <span className="progress-topic-progress__fill relative block h-full rounded-full" style={{ width: `${val}%` }} />
                      </div>
                    </div>

                    {clickable && (
                      <div className="progress-topic-action mt-auto flex items-center gap-2 pt-2.5 text-xs font-bold">
                        <span className="progress-topic-action__label inline-flex items-center gap-1.5">
                          {role === 'student' && <PlayCircle size={15} aria-hidden="true" />}
                          {role === 'teacher' ? 'Смотреть ответы' : (val > 0 ? 'Продолжить практику' : 'Начать практику')}
                        </span>
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>

          {role === 'student' && activeTask && (
        <StudentTestModal 
          theme={theme}
          onThemeToggle={onThemeToggle}
          task={activeTask} 
          onClose={() => {
            setActiveTask(null);
            setAutoLevel(null);
            setAutoTargetQuestions(null);
            setActiveLevel(null);
            setActiveQuestionIndex(null);
            setForceInitialLevelLaunch(false);
          }}
          progress={progressMap}
          studentId={studentId}
          testDb={testsDb}
          initialLevel={autoLevel}
          targetQuestions={autoTargetQuestions}
          initialQuestionIndex={activeQuestionIndex}
          onLevelSelect={setActiveLevel}
          onQuestionChange={setActiveQuestionIndex}
          onStreakSaved={onStreakSaved}
          onXpGain={onXpGain}
          forceInitialLevelLaunch={forceInitialLevelLaunch}
          LEVELS={LEVELS}
          LEVEL_WEIGHTS={LEVEL_WEIGHTS}
          GAME_THEORY_TASK={GAME_THEORY_TASK}
          PYODIDE_RUN_TIMEOUT_MS={PYODIDE_RUN_TIMEOUT_MS}
          ALLOW_MAIN_THREAD_PYTHON_FALLBACK={ALLOW_MAIN_THREAD_PYTHON_FALLBACK}
          getTaskLevelXpReward={getTaskLevelXpReward}
          getTaskDisplayNumber={getTaskDisplayNumber}
          getAnswerCountForTask={getAnswerCountForTask}
          getExpectedAnswers={getExpectedAnswers}
          allowsPartialAnswers={allowsPartialAnswers}
          ensurePyodideReady={ensurePyodideReady}
          mergeRuntimeErrorText={mergeRuntimeErrorText}
          createPyodideWorker={createPyodideWorker}
          buildIdleConsoleText={buildIdleConsoleText}
          getLocalDayKey={getLocalDayKey}
          normalizeXpTotal={normalizeXpTotal}
          parseIdleConsoleInput={parseIdleConsoleInput}
          PY_IDLE_STDIN_HEADER={PY_IDLE_STDIN_HEADER}
          withStudentId={withStudentId}
          onComplete={(taskId, score, options) => {
            onUpdateProgress(taskId, score, options);
            if (effectiveStudentId) {
              api.getStudentData(effectiveStudentId)
                .then((data) => setStudentData(normalizeProgressSectionStudentData(data)))
                .catch(() => {});
            }
            // setActiveTask(null); // Убрали закрытие, чтобы можно было решать дальше
          }}
        />
      )}
          {role === 'teacher' && reviewTask && (
            <ProgressReviewModal
              theme={theme}
              task={reviewTask}
              onClose={() => setReviewTask(null)}
              studentId={effectiveStudentId}
              testDb={testsDb}
              LEVELS={LEVELS}
              GAME_THEORY_TASK={GAME_THEORY_TASK}
              getAnswerCountForTask={getAnswerCountForTask}
              getExpectedAnswers={getExpectedAnswers}
              withStudentId={withStudentId}
            />
          )}
        </>
      )}

      {section === 'notes' && (
        <div className="notes-teacher-section space-y-3 md:space-y-4">
          <div className="notes-teacher-header flex flex-wrap items-center justify-between gap-3 rounded-3xl border p-3 md:p-4">
            <h3 className="text-base md:text-lg font-bold text-gray-800">Заметки учителя</h3>
            <div className="hidden md:flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              <span className="notes-summary-pill notes-summary-pill--total">
                {`Всего ${notesCards.length}`}
              </span>
              <span className="notes-summary-pill notes-summary-pill--filled">
                {`С заметкой ${notesFilledCount}`}
              </span>
              <span className="notes-summary-pill notes-summary-pill--empty">
                {`Пусто ${notesEmptyCount}`}
              </span>
            </div>
          </div>
          <div className="notes-mobile-tools md:hidden rounded-2xl border border-purple-100/80 bg-white/90 p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              <span className="notes-summary-pill notes-summary-pill--total">
                {`Всего: ${notesCards.length}`}
              </span>
              <span className="notes-summary-pill notes-summary-pill--filled">
                {`С заметкой: ${notesFilledCount}`}
              </span>
              <span className="notes-summary-pill notes-summary-pill--empty">
                {`Пусто: ${notesEmptyCount}`}
              </span>
            </div>
            <div className="mt-2.5">
              <input
                type="text"
                value={notesMobileQuery}
                onChange={(e) => setNotesMobileQuery(e.target.value.slice(0, 80))}
                placeholder="Поиск по номеру или теме"
                className="w-full rounded-xl border border-purple-100 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-purple-400"
              />
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
              {[
                { id: 'all', label: 'Все' },
                { id: 'filled', label: 'С заметкой' },
                { id: 'empty', label: 'Пустые' }
              ].map((filterItem) => (
                <button
                  key={filterItem.id}
                  type="button"
                  onClick={() => setNotesMobileFilter(filterItem.id)}
                  className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                    notesMobileFilter === filterItem.id
                      ? 'bg-purple-600 text-white shadow-sm shadow-purple-200'
                      : 'bg-white text-slate-600 border border-transparent'
                  }`}
                >
                  {filterItem.label}
                </button>
              ))}
            </div>
          </div>

          {filteredNotesCards.length === 0 ? (
            <div className="notes-empty-state rounded-2xl border border-dashed border-slate-200 bg-white/75 px-4 py-6 text-center text-sm text-slate-500">
              По этим параметрам заметок не найдено.
            </div>
          ) : (
            <div className="notes-card-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 md:gap-3 stagger-children">
              {filteredNotesCards.map(({ task, idx, num, note, hasNote }) => (
                <div
                  key={task.id ?? num}
                  style={{ '--i': idx }}
                  className={`notes-card rounded-2xl md:rounded-3xl border p-3 md:p-4 flex flex-col gap-2.5 md:gap-3 transition-all duration-200 shadow-sm hover:shadow-md ${
                    hasNote
                      ? 'notes-card--filled border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50'
                      : 'notes-card--empty border-gray-200 bg-gradient-to-br from-white via-gray-50 to-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2.5">
                      <div
                        className={`notes-task-badge w-9 h-9 md:w-9 md:h-9 shrink-0 rounded-xl md:rounded-2xl flex items-center justify-center text-sm font-bold ${
                          hasNote ? 'notes-task-badge--filled bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-white text-gray-500 border border-gray-200'
                        }`}
                      >
                        {getTaskDisplayNumber(task)}
                      </div>
                      <div className="min-w-0">
                        <span className={`text-xs font-semibold ${hasNote ? 'text-emerald-700' : 'text-gray-400'}`}>
                          {hasNote ? 'Есть заметка' : 'Пусто'}
                        </span>
                        <div className="mt-0.5 text-[11px] leading-tight text-slate-500 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
                          {task.title}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {role === 'teacher' && hasNote && notesSavingId !== num && (
                        <button
                          type="button"
                          onClick={() => saveTaskNote(num, '')}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-600"
                        >
                          Очистить
                        </button>
                      )}
                      {notesSavingId === num && (
                        <span className="text-[10px] text-gray-400">Сохранение…</span>
                      )}
                    </div>
                  </div>
                  {role === 'teacher' ? (
                    <>
                      <textarea
                        value={note}
                        onChange={(e) => {
                          const value = e.target.value.slice(0, 80);
                          const keys = getNotesTaskKeys(num);
                          if (!keys.length) return;
                          setStudentData((prev) => ({
                            ...prev,
                            notesByTask: (() => {
                              const nextNotes = { ...(prev.notesByTask || {}) };
                              keys.forEach((key) => { if (key !== keys[0]) delete nextNotes[key]; });
                              nextNotes[keys[0]] = value;
                              return nextNotes;
                            })()
                          }));
                        }}
                        onBlur={(e) => saveTaskNote(num, e.target.value.trim())}
                        placeholder="Комментарий..."
                        className={`notes-textarea w-full min-h-[92px] md:min-h-[70px] text-[13px] md:text-xs px-3 py-2.5 rounded-2xl border outline-none resize-none transition-colors ${
                          hasNote
                            ? 'bg-white/80 border-emerald-200 focus:border-emerald-500'
                            : 'bg-white border-gray-200 focus:border-purple-500'
                        }`}
                      />
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Автосохранение при выходе из поля</span>
                        <span>{`${note.length}/80`}</span>
                      </div>
                    </>
                  ) : (
                    <div className={`text-[13px] md:text-xs min-h-[70px] whitespace-pre-wrap ${hasNote ? 'text-gray-700' : 'text-gray-400'}`}>
                      {hasNote ? note : 'Нет заметки'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {section === 'mocks' && (
        <div className={role === 'student' ? 'mock-page-shell mock-student-page space-y-4 md:space-y-5' : 'mock-page-shell mock-teacher-page space-y-4 md:space-y-6'}>
          {role === 'student' ? (
            <div className="mock-student-hero mock-command-center relative overflow-hidden rounded-[24px] p-3.5 md:p-4">
              <div className="mock-student-hero__grid mock-command-grid relative z-[1] grid gap-3">
                <div className="mock-command-copy min-w-0 space-y-3">
                  <div className="mock-command-topline flex flex-wrap items-center gap-2">
                    <div className="mock-hero-kicker inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
                      <BookOpen size={14} />
                      Пробники
                    </div>
                    {mockCommandStats.map((item) => (
                      <span key={item.id} className="mock-command-stat rounded-full px-2.5 py-1 text-[10px] font-bold">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </span>
                    ))}
                  </div>

                  <div className="mock-command-focus flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/78 p-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mock-focus-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700">
                        <Target size={17} />
                      </div>
                      <div className="min-w-0">
                        <div className="mock-focus-eyebrow text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                          Сейчас лучше открыть
                        </div>
                        <div className="mock-focus-title mt-1 text-sm font-semibold text-gray-900 md:text-base">
                          {focusMockExam ? studentMockOverview.focusTitle : 'Пробников пока нет'}
                        </div>
                        <div className="mock-focus-detail mt-1 text-xs text-gray-500">
                          {focusMockExam
                            ? (
                              studentMockOverview.focusTaskLabel
                                ? `${studentMockOverview.focusDescription} · следующее задание ${studentMockOverview.focusTaskLabel}`
                                : studentMockOverview.focusDescription
                            )
                            : 'Когда учитель добавит пробник, он появится здесь.'}
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={openFocusMockExam}
                      disabled={!focusMockExam}
                      className="mock-focus-button w-full shrink-0 md:w-auto"
                    >
                      <PlayCircle size={16} />
                      {studentMockOverview?.focusActionLabel || 'Открыть'}
                    </Button>
                  </div>

                  <div className="mock-command-dock grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(220px,0.9fr)_minmax(190px,0.7fr)]">
                    <div className="mock-mode-preset rounded-2xl border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="mock-dock-kicker text-[10px] font-bold uppercase tracking-[0.16em]">
                            Режим новых стартов
                          </div>
                          <div className="mock-dock-title mt-1 text-sm font-bold">
                            {mockModePreset === MOCK_ATTEMPT_MODE_TIMER ? 'Таймерный заход' : 'Спокойное прохождение'}
                          </div>
                        </div>
                        <div className="mock-mode-preset__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                          {mockModePreset === MOCK_ATTEMPT_MODE_TIMER ? <Flame size={17} /> : <BookOpen size={17} />}
                        </div>
                      </div>
                      <div
                        className="mock-mode-switch mock-mode-switch--global mt-3"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setMockModePreset(MOCK_ATTEMPT_MODE_CLASSIC)}
                          aria-pressed={mockModePreset === MOCK_ATTEMPT_MODE_CLASSIC}
                          className={`mock-mode-switch__option ${mockModePreset === MOCK_ATTEMPT_MODE_CLASSIC ? 'mock-mode-switch__option--active' : ''}`}
                        >
                          <BookOpen size={14} />
                          <span>Обычный</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMockModePreset(MOCK_ATTEMPT_MODE_TIMER)}
                          aria-pressed={mockModePreset === MOCK_ATTEMPT_MODE_TIMER}
                          className={`mock-mode-switch__option mock-mode-switch__option--timer ${mockModePreset === MOCK_ATTEMPT_MODE_TIMER ? 'mock-mode-switch__option--active' : ''}`}
                        >
                          <Clock3 size={14} />
                          <span>Таймер</span>
                        </button>
                      </div>
                    </div>

                    <div className="mock-priority-queue rounded-2xl border p-3">
                      <div className="mock-dock-kicker text-[10px] font-bold uppercase tracking-[0.16em]">
                        Очередь на сегодня
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {studentMockDashboard.priorityRows.length > 0 ? (
                          studentMockDashboard.priorityRows.map((row) => (
                            <button
                              key={`priority-${row.exam.id}`}
                              type="button"
                              className="mock-priority-row flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left"
                              onClick={() => handleOpenMockExam(row.exam, {
                                mode: row.selectedMode,
                                initialTaskNumber: row.nextOpenTask?.taskKey || null,
                              })}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-bold">{row.exam.title}</span>
                                <span className="mt-0.5 block truncate text-[11px]">
                                  {row.nextOpenTask ? `№ ${row.nextOpenTask.label}` : `${row.stats.secondary} баллов`}
                                </span>
                              </span>
                              <span className="mock-priority-score shrink-0 rounded-full px-2 py-1 text-[11px] font-bold">
                                {`${row.stats.progressPercent}%`}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="mock-priority-empty rounded-xl px-2.5 py-2 text-xs">
                            Очередь появится после доступа к пробникам.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mock-timer-vault rounded-2xl border p-3">
                      <div className="flex items-start gap-3">
                        <div className="mock-timer-vault__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                          <PackageOpen size={17} />
                        </div>
                        <div className="min-w-0">
                          <div className="mock-dock-kicker text-[10px] font-bold uppercase tracking-[0.16em]">
                            Таймер-сундуки
                          </div>
                          <div className="mock-dock-title mt-1 text-sm font-bold">
                            {`${studentMockDashboard.timerChestsTotal}/${studentMockDashboard.potentialTimerChests || 0}`}
                          </div>
                          <div className="mt-1 text-[11px]">
                            {studentMockDashboard.activeTimerCount > 0
                              ? `${studentMockDashboard.activeTimerCount} активн. таймер`
                              : `${studentMockDashboard.nearRewardCount} наград рядом`}
                          </div>
                        </div>
                      </div>
                      {studentMockDashboard.expiredTimerCount > 0 && (
                        <div className="mock-vault-alert mt-2 rounded-xl px-2.5 py-2 text-[11px] font-bold">
                          {`${studentMockDashboard.expiredTimerCount} таймер истёк`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mock-teacher-hero flex flex-wrap items-center justify-between gap-3 rounded-[28px] p-4 md:p-5">
              <div>
                <div className="mock-teacher-kicker inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
                  <BookOpen size={14} />
                  Пробники
                </div>
                <h3 className="mock-teacher-title mt-3 text-lg font-bold md:text-[1.35rem]">Пробники для решения</h3>
                <p className="mock-teacher-subtitle hidden md:block text-xs">Примерно такое будет на экзамене.</p>
              </div>
            </div>
          )}

          {mockExamsError && <div className="text-xs text-red-500">{mockExamsError}</div>}
          {showStudentMockPreview && mockAttemptsLoading && (
            <div className="text-xs text-gray-400">Обновляем прогресс...</div>
          )}
          {mockExamsLoading ? (
            <Card className="text-sm text-gray-500">Загрузка пробников...</Card>
          ) : (
            <>
              <Card className={role === 'student' ? 'mock-list-shell space-y-5' : 'mock-list-shell space-y-4'}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="mock-list-heading space-y-1">
                    <div className="mock-list-title inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">
                      <BookOpen size={14} />
                      {role === 'teacher' ? 'Пробники и управление' : 'Пробники'}
                    </div>
                    {role === 'student' && (
                      <div className="mock-list-subtitle text-xs text-gray-500">
                        {studentMockOverview?.hasMockTasks
                          ? `${studentMockOverview.totalSolvedCount}/${studentMockOverview.totalTaskCount} закрыто`
                          : 'Заданий пока нет'}
                      </div>
                    )}
                    {role === 'teacher' && visibleMockExams.length > 0 && (
                      <div className="text-xs text-gray-500">
                        {`${studentVisibleMockExams.length}/${visibleMockExams.length} доступны ученику`}
                      </div>
                    )}
                  </div>
                  {role === 'student' && (
                    <div className="mock-list-toolbar flex w-full flex-col gap-3 lg:w-auto lg:items-end">
                      <div className="mock-list-metrics flex flex-wrap items-center gap-2">
                        <span className="mock-list-chip rounded-full px-3 py-1 text-xs font-semibold">
                          {`${studentVisibleMockExams.length} доступно`}
                        </span>
                        <span className="mock-list-chip rounded-full px-3 py-1 text-xs font-semibold">
                          {`${studentMockOverview?.averageSecondaryScore ?? 0} ср. балл`}
                        </span>
                        <span className="mock-list-chip rounded-full px-3 py-1 text-xs font-semibold">
                          {`${studentMockOverview?.completedExamsCount ?? 0} закрыто`}
                        </span>
                      </div>
                    </div>
                  )}
                  {role === 'teacher' && (
                    <div className="flex w-full sm:w-auto flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={newMockTitle}
                        onChange={(e) => setNewMockTitle(e.target.value)}
                        placeholder="Название пробника"
                        className="mock-create-input w-full sm:w-auto px-3 py-2 rounded-xl border outline-none text-sm"
                      />
                      <Button onClick={handleCreateMockExam} className="w-full sm:w-auto">
                        <Plus size={16}/> Создать
                      </Button>
                    </div>
                  )}
                </div>

                {role === 'student' && studentVisibleMockExams.length > 0 && (
                  <div className="mock-filter-row flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-2">
                    <div className="mock-tools-row grid gap-2 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.35fr)_auto]">
                      <label className="mock-search-field flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-2">
                        <Search size={15} />
                        <input
                          type="search"
                          value={mockExamQuery}
                          onChange={(event) => setMockExamQuery(event.target.value)}
                          placeholder="Поиск по названию, метке или номеру задания"
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        />
                      </label>
                      <label className="mock-sort-field flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-2">
                        <ArrowUpDown size={15} />
                        <select
                          value={mockExamSort}
                          onChange={(event) => setMockExamSort(event.target.value)}
                          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                        >
                          {MOCK_EXAM_SORTS.map((item) => (
                            <option key={item.id} value={item.id}>{item.label}</option>
                          ))}
                        </select>
                      </label>
                      {(mockExamQuery || mockExamFilter !== 'all' || mockExamSort !== 'smart') && (
                        <button
                          type="button"
                          onClick={() => {
                            setMockExamQuery('');
                            setMockExamFilter('all');
                            setMockExamSort('smart');
                          }}
                          className="mock-filter-reset rounded-2xl px-3 py-2 text-xs font-bold"
                        >
                          Сбросить
                        </button>
                      )}
                    </div>

                    <div className="mock-filter-strip flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="inline-flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        <ListFilter size={14} />
                        Показать
                      </div>
                      <div className="mock-filter-group flex min-w-0 flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/70 p-1">
                        {MOCK_EXAM_FILTERS.map((item) => {
                          const active = mockExamFilter === item.id;
                          const count = mockFilterCounts[item.id] ?? 0;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setMockExamFilter(item.id)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                                active
                                  ? 'bg-white text-sky-700 shadow-sm ring-1 ring-sky-100'
                                  : 'text-slate-500 hover:bg-white/80 hover:text-sky-700'
                              }`}
                            >
                              {`${item.label} ${count}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {role === 'teacher' ? (
                  <>
                    {hasStudentMockPreview ? (
                      <div className="space-y-6">
                        {studentMockExamRows.map((row) => renderStudentMockCard(row.exam, row))}
                      </div>
                    ) : visibleMockExams.length > 0 ? (
                      <div className="text-gray-500">Для выбранного ученика пока нет доступных пробников.</div>
                    ) : null}

                    <div className="space-y-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">
                        Управление пробниками
                      </div>
                      {visibleMockExams.length === 0 ? (
                        <div className="text-gray-500">Пробников пока нет.</div>
                      ) : (
                        <div className="space-y-4">
                          {visibleMockExams.map((exam) => renderTeacherMockCard(exam))}
                        </div>
                      )}
                    </div>
                  </>
                ) : studentVisibleMockExams.length === 0 ? (
                  <div className="text-gray-500">Пробников пока нет.</div>
                ) : filteredStudentMockRows.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-gray-500">
                    В этом фильтре пока пусто.
                  </div>
                ) : (
                  <div className="mock-ticket-list space-y-4">
                    {filteredStudentMockRows.map((row) => renderStudentMockCard(row.exam, row))}
                  </div>
                )}
              </Card>

              {hasStudentMockPreview && studentMockOverview?.hasMockTasks && studentMockOverview.totalTaskCount > 1 && (
                <Card className="mock-statistics-card space-y-3 md:space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <div className="mock-chart-icon flex h-9 w-9 items-center justify-center rounded-xl border">
                        <BarChart2 size={16} />
                      </div>
                      <span>Статистика по заданиям</span>
                    </div>
                    <span className="mock-chart-badge rounded-full px-3 py-1 text-xs font-semibold">
                      {`${studentMockOverview.accuracyPercent}% точность`}
                    </span>
                  </div>

                  {studentMockTaskChart && (
                    <div className="mock-task-chart-panel rounded-[24px] p-3 md:p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                          Выполнение по заданиям
                        </div>
                        <div className="text-[11px] text-gray-400">0-100%</div>
                      </div>

                      <div
                        className="relative mt-3 w-full"
                        style={{ maxWidth: `${studentMockTaskChart.width}px` }}
                        onMouseLeave={() => setHoveredMockTaskPoint(null)}
                      >
                        {hoveredMockTaskPoint && (
                          <div
                            className="mock-task-chart-tooltip pointer-events-none absolute z-10 w-max max-w-[220px] rounded-2xl px-3 py-2 text-xs shadow-lg"
                            style={getMockTaskChartTooltipStyle(hoveredMockTaskPoint, studentMockTaskChart)}
                          >
                            <div className="font-semibold text-gray-900">
                              {`Задание ${hoveredMockTaskPoint.label}`}
                              {hoveredMockTaskPoint.detailLabel !== hoveredMockTaskPoint.label
                                ? ` (${hoveredMockTaskPoint.detailLabel})`
                                : ''}
                            </div>
                            <div className="mt-1 text-gray-500">
                              {`${hoveredMockTaskPoint.completionPercent}% выполнено`}
                            </div>
                            <div className="mt-1 text-gray-500">
                              {`${hoveredMockTaskPoint.solvedCount}/${hoveredMockTaskPoint.totalCount} закрыто`}
                            </div>
                            <div className="text-gray-500">
                              {`${hoveredMockTaskPoint.accuracyPercent}% точность`}
                            </div>
                          </div>
                        )}

                        <svg
                          viewBox={`0 0 ${studentMockTaskChart.width} ${studentMockTaskChart.height}`}
                          className="h-[220px] w-full overflow-visible"
                          role="img"
                          aria-label="График выполнения заданий по пробникам"
                        >
                          <defs>
                            <linearGradient id={studentMockTaskChart.gradientId} x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="rgba(168,85,247,0.28)" />
                              <stop offset="100%" stopColor="rgba(168,85,247,0.02)" />
                            </linearGradient>
                          </defs>

                          {studentMockTaskChart.yTicks.map((tick) => (
                            <g key={`mock-chart-y-${tick.value}`}>
                              <line
                                x1="34"
                                x2={studentMockTaskChart.width - 12}
                                y1={tick.y}
                                y2={tick.y}
                                className="mock-task-chart-grid"
                              />
                              <text
                                x="0"
                                y={tick.y + 4}
                                className="mock-task-chart-axis"
                              >
                                {`${tick.value}%`}
                              </text>
                            </g>
                          ))}

                          <path
                            d={studentMockTaskChart.areaPath}
                            fill={`url(#${studentMockTaskChart.gradientId})`}
                          />
                          <path d={studentMockTaskChart.linePath} className="mock-task-chart-line" />

                          {studentMockTaskChart.points.map((point) => (
                            <g
                              key={`mock-chart-point-${point.taskNumber}`}
                              onMouseEnter={() => setHoveredMockTaskPoint(point)}
                              onMouseMove={() => setHoveredMockTaskPoint(point)}
                              onFocus={() => setHoveredMockTaskPoint(point)}
                              onBlur={() => setHoveredMockTaskPoint(null)}
                            >
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r="11"
                                className="mock-task-chart-hit"
                              />
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r={point.completionPercent > 0 ? 4 : 3}
                                className={`mock-task-chart-point ${point.completionPercent > 0 ? 'mock-task-chart-point--active' : ''}`}
                              />
                            </g>
                          ))}

                          {studentMockTaskChart.xTicks.map((point) => (
                            <text
                              key={`mock-chart-x-${point.taskNumber}`}
                              x={point.x}
                              y={studentMockTaskChart.baselineY + 22}
                              textAnchor="middle"
                              className="mock-task-chart-axis"
                            >
                              {point.label}
                            </text>
                          ))}
                        </svg>
                      </div>
                    </div>
                  )}

                  {studentMockOverview.hasAnyAttempt ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="mock-insight-card mock-insight-card--strong rounded-xl p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          Лучше всего
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {studentMockOverview.strongestTasks.map((taskStat) => (
                            <span
                              key={`strong-${taskStat.taskKey}`}
                              className="mock-insight-pill rounded-full px-3 py-1.5 text-xs font-semibold"
                            >
                              {`№ ${taskStat.label} · ${taskStat.accuracyPercent}% · ${taskStat.solvedCount}/${taskStat.attemptedCount}`}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mock-insight-card mock-insight-card--weak rounded-xl p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                          Добить в первую очередь
                        </div>
                        {studentMockOverview.weakestTasks.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {studentMockOverview.weakestTasks.map((taskStat) => (
                              <button
                                key={`weak-${taskStat.taskKey}`}
                                type="button"
                                onClick={() => openMockTaskFromInsight(taskStat)}
                                className="mock-insight-pill rounded-full px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                              >
                                {`№ ${taskStat.label} · ${taskStat.accuracyPercent}% · ${taskStat.solvedCount}/${taskStat.attemptedCount}`}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-sm text-gray-500">Пока без явных просадок.</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">Статистика появится после первых ответов.</div>
                  )}
                </Card>
              )}
            </>
          )}

          {role === 'teacher' && (
            <Card className="space-y-3">
              <h3 className="text-lg font-bold text-gray-800">Добавить результат пробника</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="date"
                  value={mockForm.date}
                  onChange={(e) => setMockForm((prev) => ({ ...prev, date: e.target.value }))}
                  className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={mockForm.score}
                  onChange={(e) => setMockForm((prev) => ({ ...prev, score: e.target.value }))}
                  placeholder="Баллы (0-100)"
                  className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                />
                <input
                  type="text"
                  value={mockForm.comment}
                  onChange={(e) => setMockForm((prev) => ({ ...prev, comment: e.target.value }))}
                  placeholder="Комментарий"
                  className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                />
              </div>
              <Button onClick={handleAddMock}>
                <Plus size={16}/> Добавить
              </Button>
            </Card>
          )}

          <div className="mock-history-list space-y-2">
            {(studentData.mocks || []).length === 0 ? (
              <div className="mock-history-empty rounded-2xl px-4 py-3 text-sm font-semibold">
                Истории пробников пока нет.
              </div>
            ) : (
              studentData.mocks.map((mock) => (
                <div key={mock.id} className="mock-history-item rounded-2xl border p-3 md:p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">Пробник от {mock.date}</p>
                    <p className="text-sm text-gray-500">Баллы: <span className="font-bold text-purple-600">{mock.score}</span></p>
                    {mock.comment && <p className="text-sm text-gray-600 mt-1">{mock.comment}</p>}
                  </div>
                  {role === 'teacher' && (
                    <button
                      onClick={() => handleDeleteMock(mock.id)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {mockEditorExam && (
            <MockExamEditorModal
              exam={mockEditorExam}
              onClose={() => setMockEditorExam(null)}
              onSave={handleSaveMockExam}
              MOCK_TASK_NUMBERS={MOCK_TASK_NUMBERS}
              getMockAnswerCountForTask={getMockAnswerCountForTask}
              getExpectedAnswers={getExpectedAnswers}
              allowsPartialAnswers={allowsPartialAnswers}
            />
          )}

          {classicModeWarning && typeof document !== 'undefined' && createPortal((
            <div
              className="mock-classic-lock-modal fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/78 p-4 backdrop-blur-md"
              role="dialog"
              aria-modal="true"
              aria-labelledby="classic-mode-warning-title"
              onClick={closeClassicModeWarning}
            >
              <div
                className="mock-classic-lock-card relative w-full max-w-[34rem] overflow-hidden rounded-[28px] border p-4 shadow-2xl md:p-5"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mock-classic-lock-card__glow" aria-hidden="true" />
                <div className="relative flex items-start gap-3">
                  <div className="mock-classic-lock-card__icon flex shrink-0 items-center justify-center">
                    <Clock3 size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mock-classic-lock-card__kicker">
                      Подтверждение
                    </div>
                    <h3 id="classic-mode-warning-title" className="mock-classic-lock-card__title mt-1">
                      Начать пробник в обычном режиме?
                    </h3>
                    <p className="mock-classic-lock-card__text mt-2">
                      Ты уверен? Таймерный режим потом останется доступен, но сундуки таймера за этот пробник уже не начислятся.
                    </p>
                  </div>
                </div>

                <div className="mock-classic-lock-card__rules relative mt-4 grid gap-2 sm:grid-cols-2">
                  <div>
                    <BookOpen size={15} />
                    <span>Обычный режим запустится сразу после подтверждения</span>
                  </div>
                  <div>
                    <Flame size={15} />
                    <span>Таймер можно пройти позже, но уже без сундуков</span>
                  </div>
                </div>

                <div className="relative mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={closeClassicModeWarning}
                    className="mock-classic-lock-card__cancel"
                  >
                    Нет
                  </Button>
                  <Button
                    type="button"
                    onClick={confirmClassicModeStart}
                    className="mock-classic-lock-card__start"
                  >
                    <BookOpen size={16} />
                    Да, начать
                  </Button>
                </div>
              </div>
            </div>
          ), document.body)}

          {activeMockExam && activeMockAttempt !== null && (
            <MockExamModal
              exam={activeMockExam}
              studentId={effectiveStudentId}
              initialAttempt={activeMockAttempt}
              initialTaskNumber={activeMockInitialTask}
              attemptMode={activeMockMode}
              theme={theme}
              MOCK_TASK_NUMBERS={MOCK_TASK_NUMBERS}
              getMockAnswerCountForTask={getMockAnswerCountForTask}
              allowsPartialAnswers={allowsPartialAnswers}
              getPrimaryScoreFromSolved={getPrimaryScoreFromSolved}
              getSecondaryScoreFromPrimary={getSecondaryScoreFromPrimary}
              getLocalDayKey={getLocalDayKey}
              withStudentId={withStudentId}
              onAttemptSaved={(examId, attempt, meta) => {
                setActiveMockAttempt(attempt);
                setActiveMockMode(normalizeMockAttemptMode(attempt?.mode, activeMockMode));
                setMockAttemptsByExam((prev) => ({ ...prev, [examId]: attempt }));
                const timerChestsGained = Math.max(0, Math.floor(Number(attempt?.timerChestsGained) || 0));
                if (timerChestsGained > 0) {
                  triggerTimerChestFlight(timerChestsGained, meta?.sourceRect);
                }
                if (Number.isFinite(Number(attempt?.timerChestsTotal))) {
                  setStudentData((prev) => ({
                    ...prev,
                    mockTimerChestsTotal: Math.max(0, Math.floor(Number(attempt.timerChestsTotal) || 0)),
                  }));
                }
                onMockAttemptSaved?.(examId, attempt, meta);
              }}
              onRestartTimerAttempt={async () => {
                if (!activeMockExam || !effectiveStudentId) return null;
                const requestId = mockAttemptRequestIdRef.current + 1;
                mockAttemptRequestIdRef.current = requestId;
                setStartingMockExamId(activeMockExam.id);
                try {
                  const attempt = await api.startMockAttempt(mockAttemptStudentId, activeMockExam.id, {
                    mode: MOCK_ATTEMPT_MODE_TIMER,
                    restartTimerExam: true,
                  });
                  if (mockAttemptRequestIdRef.current !== requestId) return null;
                  setActiveMockAttempt(attempt && typeof attempt === 'object' ? attempt : {});
                  setActiveMockMode(normalizeMockAttemptMode(attempt?.mode, MOCK_ATTEMPT_MODE_TIMER));
                  setMockAttemptsByExam((prev) => ({
                    ...prev,
                    [activeMockExam.id]: attempt && typeof attempt === 'object' ? attempt : {},
                  }));
                  onMockAttemptSaved?.(activeMockExam.id, attempt);
                  return attempt;
                } finally {
                  if (mockAttemptRequestIdRef.current === requestId) setStartingMockExamId(null);
                }
              }}
              onContinueTimerAttempt={role === 'teacher' ? async () => {
                if (!activeMockExam || !effectiveStudentId) return null;
                return handleContinueMockTimerAttempt(activeMockExam, { silentErrors: true });
              } : undefined}
              onClose={() => {
                mockAttemptRequestIdRef.current += 1;
                setActiveMockExam(null);
                setActiveMockAttempt(null);
                setActiveMockInitialTask(null);
                setActiveMockMode(MOCK_ATTEMPT_MODE_CLASSIC);
                setStartingMockExamId(null);
              }}
            />
          )}

          {mockChestTestRewards.length > 0 && (
            <MockChestOpeningOverlay
              rewards={mockChestTestRewards}
              onClose={() => setMockChestTestRewards([])}
            />
          )}

        </div>
      )}
      {timerChestFlights.length > 0 && typeof document !== 'undefined' && createPortal(
        <div className="mock-timer-chest-flight-layer" aria-hidden="true">
          {timerChestFlights.map((flight) => (
            <div
              key={flight.id}
              className="mock-timer-chest-flight"
              style={{
                left: `${flight.startX}px`,
                top: `${flight.startY}px`,
                '--mock-timer-chest-flight-x': `${flight.dx}px`,
                '--mock-timer-chest-flight-y': `${flight.dy}px`,
                '--mock-timer-chest-flight-mid-x': `${flight.midDx}px`,
                '--mock-timer-chest-flight-mid-y': `${flight.midDy}px`,
                '--mock-timer-chest-flight-near-x': `${flight.nearDx}px`,
                '--mock-timer-chest-flight-near-y': `${flight.nearDy}px`,
                '--mock-timer-chest-flight-delay': `${flight.delay}ms`,
                '--mock-timer-chest-flight-rotate': `${flight.rotate}deg`,
              }}
            >
              <span className="mock-timer-chest-flight__spark" />
              <img src={chestClosedImage} alt="" draggable="false" />
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};



export default ProgressSection;

