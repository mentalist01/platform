import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BarChart2, BookOpen, CheckCircle, Pencil, Plus, RefreshCcw, Sparkles, Target, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import CoinGuideIcon from './CoinGuideTooltip';
import ProgressReviewModal from './ProgressReviewModal';
import PythonReviewModal from './PythonReviewModal';
import PythonTestModal from './PythonTestModal';
import StudentSearchSelect from './StudentSearchSelect';
import StudentTestModal from './StudentTestModal';
import TheoryRecordingEditor from './TheoryRecordingEditor';
import { Button, Card } from './ui';
import {
  buildPythonSubsectionModel,
  createPythonSubsectionId,
  getPythonTaskEntry,
  PYTHON_DEFAULT_SUBSECTION_ID,
} from '../utils/pythonSubsections';
import {
  estimateTheoryRecordingSizeBytes,
  getTheoryRecordingAudioSegments,
  getTheoryRecordingStorageNames,
  normalizeTheoryRecording,
  THEORY_RECORDING_MAX_JSON_BYTES,
  THEORY_RECORDING_TYPE,
} from '../utils/theoryRecording';
import { deleteTheoryRecordingDraftSnapshot } from '../utils/theoryRecordingDraftStore';

const PYTHON_TASK_SECTION_META = {
  topics: {
    title: 'Темы Python',
    description: 'Базовые темы курса и последовательное изучение синтаксиса.',
  },
  'exam-prep': {
    title: 'Подготовка к заданиям',
    description: 'Отдельные карточки для точечной тренировки задач ЕГЭ на Python.',
  },
};

const PYTHON_TASKS_CATALOG_KEY = '__pythonTaskCatalog';
const PYTHON_TASK_SECTION_IDS = ['topics', 'exam-prep'];
const PYTHON_COIN_MIN_REWARD = 4;
const PYTHON_COIN_MAX_REWARD = 17;
const PYTHON_COIN_TASK_ORDER = [
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
  205, 208, 214, 216, 217, 223, 224, 225, 226, 227,
];
const PYTHON_COIN_ARTIFACT_BONUSES = {
  'amulet-of-import': 0.5,
  python: 1,
  whileTrue: 0.2,
};
const PYTHON_ARTIFACT_MAX_LEVEL = 5;

const PYTHON_TASK_SECTION_UI = {
  topics: {
    icon: BookOpen,
    badge: 'Фундамент',
    shellClass: 'border-purple-200/70 bg-gradient-to-br from-purple-50/70 via-white to-fuchsia-50/40',
    headerClass: 'from-purple-500/18 via-violet-500/14 to-fuchsia-500/16',
    chipClass: 'border-purple-300/70 bg-purple-100/90 text-purple-800',
    cardClass: 'border-purple-200/80 bg-gradient-to-br from-purple-50/70 via-white to-fuchsia-50/45',
    hoverClass: 'hover:border-purple-300/80 hover:shadow-[0_18px_32px_rgba(147,51,234,0.18)]',
    numberClass: 'border-purple-200 bg-purple-100/80 text-purple-800',
  },
  'exam-prep': {
    icon: Target,
    badge: 'Практика ЕГЭ',
    shellClass: 'border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/45',
    headerClass: 'from-violet-500/18 via-purple-500/14 to-fuchsia-500/18',
    chipClass: 'border-violet-200/80 bg-violet-50/70 text-fuchsia-700',
    cardClass: 'border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/45',
    hoverClass: 'hover:border-purple-300/80 hover:shadow-[0_18px_32px_rgba(168,85,247,0.18)]',
    numberClass: 'border-violet-200 bg-violet-50/70 text-fuchsia-700',
  },
};

const normalizePythonTaskSectionId = (value) => {
  const sectionId = String(value || 'topics').trim();
  return sectionId === 'exam-prep' ? 'exam-prep' : 'topics';
};

const PYTHON_DISPLAY_NUMBER_COLLATOR = new Intl.Collator('ru', {
  numeric: true,
  sensitivity: 'base',
});

const comparePythonTaskDisplayNumber = (left, right) => {
  const leftDisplay = String(left?.displayNumber || left?.number || '').trim();
  const rightDisplay = String(right?.displayNumber || right?.number || '').trim();
  if (!leftDisplay && !rightDisplay) return 0;
  if (!leftDisplay) return 1;
  if (!rightDisplay) return -1;
  const byDisplay = PYTHON_DISPLAY_NUMBER_COLLATOR.compare(leftDisplay, rightDisplay);
  if (byDisplay !== 0) return byDisplay;
  return Number(left?.number || 0) - Number(right?.number || 0);
};

const normalizeCoinAmount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
};

const formatCoinAmount = (value) => normalizeCoinAmount(value).toLocaleString('ru-RU');

const formatCoinBonusPercent = (value) => {
  const multiplier = Number(value);
  if (!Number.isFinite(multiplier) || multiplier <= 1) return '+0%';
  const percent = Math.round((multiplier - 1) * 10000) / 100;
  return `+${percent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
};

const getPythonCoinReward = (taskNumber) => {
  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum)) return 0;
  const lastIndex = PYTHON_COIN_TASK_ORDER.length - 1;
  if (lastIndex <= 0) return PYTHON_COIN_MIN_REWARD;
  let orderIndex = PYTHON_COIN_TASK_ORDER.findIndex((value) => value >= taskNum);
  if (orderIndex < 0) orderIndex = lastIndex;
  const progress = orderIndex / lastIndex;
  return Math.round(
    PYTHON_COIN_MIN_REWARD
    + ((PYTHON_COIN_MAX_REWARD - PYTHON_COIN_MIN_REWARD) * progress)
  );
};

const normalizePythonArtifactInventory = (inventory = {}) => {
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

const normalizePythonArtifactLevels = (levels = {}, inventory = {}) => {
  const safeInventory = normalizePythonArtifactInventory(inventory);
  const next = {};
  if (levels && typeof levels === 'object' && !Array.isArray(levels)) {
    Object.entries(levels).forEach(([rawId, rawLevel]) => {
      const id = String(rawId || '').trim();
      if (!id) return;
      const level = Number(rawLevel);
      if (!Number.isFinite(level) || level <= 0) return;
      next[id] = Math.min(PYTHON_ARTIFACT_MAX_LEVEL, Math.max(1, Math.floor(level)));
    });
  }
  Object.entries(safeInventory).forEach(([id, count]) => {
    if (count > 0 && !next[id]) next[id] = 1;
  });
  return next;
};

const getPythonArtifactLevel = (levels = {}, artifactId) => (
  Math.min(PYTHON_ARTIFACT_MAX_LEVEL, Math.max(0, Math.floor(Number(levels?.[artifactId]) || 0)))
);

const getPythonCoinRewardMultiplier = (artifactLevels = {}) => (
  Object.entries(PYTHON_COIN_ARTIFACT_BONUSES).reduce((multiplier, [artifactId, perCopyBonus]) => {
    const level = getPythonArtifactLevel(artifactLevels, artifactId);
    if (level <= 0) return multiplier;
    return multiplier * (1 + (Number(perCopyBonus) * level));
  }, 1)
);

const applyPythonCoinRewardMultiplier = (baseReward, artifactLevels = {}) => {
  const reward = normalizeCoinAmount(baseReward);
  if (reward <= 0) return 0;
  return normalizeCoinAmount(Math.round(reward * getPythonCoinRewardMultiplier(artifactLevels)));
};

const getQuestionIdForCoins = (question, index) => String(question?.id ?? index ?? '').trim();

const getPythonTaskCoinStats = ({ task, testsDb, studentData, levelId }) => {
  const taskNumber = Number(task?.number ?? task?.id);
  const taskKey = String(taskNumber || task?.id || '');
  const levelKey = String(levelId || '').trim();
  const questions = Array.isArray(testsDb?.[taskNumber]?.[levelKey])
    ? testsDb[taskNumber][levelKey]
    : [];
  const questionIds = questions
    .map((question, index) => getQuestionIdForCoins(question, index))
    .filter(Boolean);
  const knownQuestionIdSet = new Set(questionIds);
  const baseReward = getPythonCoinReward(taskNumber);
  const artifactLevels = normalizePythonArtifactLevels(
    studentData?.artifactLevels,
    studentData?.artifactInventory
  );
  const boostedReward = applyPythonCoinRewardMultiplier(baseReward, artifactLevels);
  const solvedRaw = studentData?.solvedByTask?.[taskKey]?.[levelKey]?.solved;
  const solvedIds = (Array.isArray(solvedRaw) ? solvedRaw : [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  const solvedQuestionIds = questionIds.length
    ? questionIds.filter((id) => solvedIds.includes(id))
    : solvedIds;
  const solvedQuestionIdSet = new Set(solvedQuestionIds);
  const eventCoinsByQuestionId = new Map();
  (Array.isArray(studentData?.solvedEvents) ? studentData.solvedEvents : []).forEach((event) => {
    if (Number(event?.taskNumber) !== taskNumber) return;
    if (String(event?.levelId || '').trim() !== levelKey) return;
    const questionId = String(event?.questionId ?? '').trim();
    if (!questionId) return;
    if (knownQuestionIdSet.size > 0 && !knownQuestionIdSet.has(questionId)) return;
    const eventCoins = normalizeCoinAmount(event?.coinsGained);
    eventCoinsByQuestionId.set(questionId, eventCoins || baseReward);
  });
  const earnedCoins = solvedQuestionIds.reduce((sum, questionId) => (
    sum + (eventCoinsByQuestionId.has(questionId) ? eventCoinsByQuestionId.get(questionId) : baseReward)
  ), 0);
  const totalQuestions = questionIds.length;
  const remainingQuestions = Math.max(0, totalQuestions - solvedQuestionIdSet.size);
  const possibleCoins = earnedCoins + (remainingQuestions * boostedReward);
  const multiplier = getPythonCoinRewardMultiplier(artifactLevels);
  return {
    earnedCoins: normalizeCoinAmount(earnedCoins),
    possibleCoins: normalizeCoinAmount(possibleCoins),
    totalQuestions,
    solvedQuestions: solvedQuestionIdSet.size,
    multiplier,
  };
};

const normalizeLoadedStudentData = (data) => {
  const artifactInventory = normalizePythonArtifactInventory(data?.artifactInventory);
  const artifactLevels = normalizePythonArtifactLevels(data?.artifactLevels, artifactInventory);
  return data && typeof data === 'object'
    ? {
        ...data,
        progress: data?.progress || {},
        artifactInventory,
        artifactLevels,
      }
    : {
        progress: {},
        artifactInventory,
        artifactLevels,
      };
};

const buildTheoryRecordingDraftStorageKey = (taskNumber, subsectionId) => {
  const safeTaskNumber = String(taskNumber || '').trim();
  const safeSubsectionId = normalizeTheorySubsectionId(subsectionId);
  if (!safeTaskNumber) return '';
  return `python-theory-recording-draft:${safeTaskNumber}:${safeSubsectionId}`;
};

const normalizePythonTaskCatalog = (value, fallback = []) => {
  const source = Array.isArray(value) ? value : (Array.isArray(fallback) ? fallback : []);
  const usedNumbers = new Set();
  const normalized = [];
  source.forEach((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const numberRaw = Number(item.number ?? item.id);
    if (!Number.isFinite(numberRaw)) return;
    const number = Math.max(100, Math.floor(numberRaw));
    if (usedNumbers.has(number)) return;
    const title = String(item.title || '').trim();
    if (!title) return;
    const sectionId = normalizePythonTaskSectionId(item.sectionId);
    const displayNumber = String(item.displayNumber || '').trim() || String(number);
    const showInPath = sectionId === 'topics' ? item.showInPath !== false : false;
    const task = {
      id: number,
      number,
      title,
      displayNumber,
      sectionId,
    };
    if (!showInPath) task.showInPath = false;
    normalized.push(task);
    usedNumbers.add(number);
  });
  normalized.sort((left, right) => {
    const leftSectionOrder = PYTHON_TASK_SECTION_IDS.indexOf(left.sectionId);
    const rightSectionOrder = PYTHON_TASK_SECTION_IDS.indexOf(right.sectionId);
    const leftSafeOrder = leftSectionOrder === -1 ? Number.MAX_SAFE_INTEGER : leftSectionOrder;
    const rightSafeOrder = rightSectionOrder === -1 ? Number.MAX_SAFE_INTEGER : rightSectionOrder;
    if (leftSafeOrder !== rightSafeOrder) return leftSafeOrder - rightSafeOrder;
    return comparePythonTaskDisplayNumber(left, right);
  });
  return normalized;
};

const getNextPythonTaskNumber = (taskList, sectionId) => {
  const safeSectionId = normalizePythonTaskSectionId(sectionId);
  const list = Array.isArray(taskList) ? taskList : [];
  const scopedNumbers = list
    .filter((task) => normalizePythonTaskSectionId(task?.sectionId) === safeSectionId)
    .map((task) => Math.floor(Number(task?.number)))
    .filter((number) => Number.isFinite(number) && number >= 100);
  if (safeSectionId === 'exam-prep') {
    const maxScoped = scopedNumbers.length ? Math.max(...scopedNumbers) : 200;
    return Math.max(201, maxScoped + 1);
  }
  const maxScoped = scopedNumbers.length ? Math.max(...scopedNumbers) : 100;
  return Math.max(101, maxScoped + 1);
};

const pythonTaskCatalogsEqual = (left, right) => {
  try {
    return JSON.stringify(left || []) === JSON.stringify(right || []);
  } catch {
    return false;
  }
};

const normalizeCodeText = (value) => (
  String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
);

const normalizeSubsectionMetaList = (value) => (
  (Array.isArray(value) ? value : [])
    .map((item, index) => {
      const id = String(item?.id || '').trim();
      const title = String(item?.title || '').trim();
      if (!id || !title) return null;
      return {
        id,
        title,
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
      };
    })
    .filter(Boolean)
);

const normalizeTheorySubsectionId = (value) => {
  const id = String(value || '').trim();
  return id || PYTHON_DEFAULT_SUBSECTION_ID;
};

const THEORY_VARIANT_ORDER = [THEORY_RECORDING_TYPE, 'text', 'gdoc'];

const normalizeTheoryItem = (value, fallbackType = '') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const detectedType = String(value.type || fallbackType || '').trim();
  if (detectedType === THEORY_RECORDING_TYPE) {
    const recording = normalizeTheoryRecording(value.content);
    return recording ? { type: THEORY_RECORDING_TYPE, content: recording } : null;
  }
  if (detectedType === 'gdoc') {
    const content = String(value.content || '').trim();
    return content ? { type: 'gdoc', content } : null;
  }
  const content = String(value.content || '').trim();
  return content ? { type: 'text', content } : null;
};

const normalizeTheoryVariantMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const singleTheory = normalizeTheoryItem(value);
  if (singleTheory) {
    return { [singleTheory.type]: singleTheory };
  }
  const source = (
    value.variants
    && typeof value.variants === 'object'
    && !Array.isArray(value.variants)
  )
    ? value.variants
    : value;
  const variants = {};
  Object.entries(source).forEach(([rawType, rawTheory]) => {
    const normalizedType = String(rawType || '').trim();
    if (!normalizedType) return;
    const theoryLike = (
      rawTheory
      && typeof rawTheory === 'object'
      && !Array.isArray(rawTheory)
    )
      ? rawTheory
      : { type: normalizedType, content: rawTheory };
    const theory = normalizeTheoryItem(theoryLike, normalizedType);
    if (!theory) return;
    variants[theory.type] = theory;
  });
  return variants;
};

const normalizeTheoryBySubsectionMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = {};
  Object.entries(value).forEach(([rawId, theory]) => {
    const id = normalizeTheorySubsectionId(rawId);
    const variants = normalizeTheoryVariantMap(theory);
    if (!Object.keys(variants).length) return;
    entries[id] = variants;
  });
  return entries;
};

const pickTheoryVariantType = (variants, preferredType = '') => {
  if (!variants || typeof variants !== 'object') return '';
  const preferred = String(preferredType || '').trim();
  if (preferred && variants[preferred]) return preferred;
  return THEORY_VARIANT_ORDER.find((type) => Boolean(variants[type])) || '';
};

const resolveTheoryVariantsForSubsection = (taskEntry, subsectionId, options = {}) => {
  const fallbackToDefault = options?.fallbackToDefault !== false;
  const fallbackToLegacy = options?.fallbackToLegacy !== false;
  const safeSubsectionId = normalizeTheorySubsectionId(subsectionId);
  const map = normalizeTheoryBySubsectionMap(taskEntry?.pythonTheoryBySubsection);
  if (map[safeSubsectionId]) return map[safeSubsectionId];
  if (fallbackToDefault && safeSubsectionId !== PYTHON_DEFAULT_SUBSECTION_ID && map[PYTHON_DEFAULT_SUBSECTION_ID]) {
    return map[PYTHON_DEFAULT_SUBSECTION_ID];
  }
  if (!fallbackToLegacy) return {};
  if (!fallbackToDefault && safeSubsectionId !== PYTHON_DEFAULT_SUBSECTION_ID) return {};
  return normalizeTheoryVariantMap(taskEntry?.pythonTheory);
};

const PythonSection = ({
  progress,
  onUpdateProgress,
  theme = '',
  role,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  openTask,
  onOpenTaskHandled,
  onTaskStateChange,
  homeworkLessonBasketItems = [],
  onAddToHomeworkLessonBasket,
  onStreakSaved,
  onXpGain,
  PYTHON_TASKS,
  PYTHON_LEVEL_ID,
  parseTestsFileContent,
  buildGoogleDocEmbedUrl,
  buildGoogleDocFullUrl,
  getTaskDisplayNumber,
  ensurePyodideReady,
  mergeRuntimeErrorText,
  createPyodideWorker,
  withStudentId,
  isGoogleDocEmbedUrl,
  normalizeOutput,
  normalizeOutputForComparison,
  normalizeRuntimeErrorForCheck,
  getLocalDayKey,
  normalizeXpTotal,
  PYODIDE_RUN_TIMEOUT_MS,
  ALLOW_MAIN_THREAD_PYTHON_FALLBACK,
}) => {
  const defaultTaskList = useMemo(
    () => normalizePythonTaskCatalog(PYTHON_TASKS, PYTHON_TASKS),
    [PYTHON_TASKS]
  );
  const [taskCatalog, setTaskCatalog] = useState(() => defaultTaskList);
  const taskList = taskCatalog;
  const taskSections = useMemo(() => {
    const sectionOrder = [...PYTHON_TASK_SECTION_IDS];
    const groups = new Map(
      sectionOrder.map((sectionId) => {
        const meta = PYTHON_TASK_SECTION_META[sectionId] || { title: 'Раздел Python', description: '' };
        return [sectionId, {
          id: sectionId,
          title: meta.title,
          description: meta.description,
          tasks: []
        }];
      })
    );
    taskList.forEach((task) => {
      const sectionId = String(task?.sectionId || 'topics');
      if (!groups.has(sectionId)) {
        const meta = PYTHON_TASK_SECTION_META[sectionId] || { title: 'Раздел Python', description: '' };
        groups.set(sectionId, {
          id: sectionId,
          title: meta.title,
          description: meta.description,
          tasks: []
        });
      }
      groups.get(sectionId).tasks.push(task);
    });
    return Array.from(groups.values()).sort((left, right) => {
      const leftOrder = sectionOrder.indexOf(left.id);
      const rightOrder = sectionOrder.indexOf(right.id);
      if (leftOrder === -1 && rightOrder === -1) return left.title.localeCompare(right.title, 'ru');
      if (leftOrder === -1) return 1;
      if (rightOrder === -1) return -1;
      return leftOrder - rightOrder;
    });
  }, [taskList]);
  const pathTaskList = useMemo(() => {
    const topicsTasks = taskList.filter((task) => String(task?.sectionId || 'topics') === 'topics');
    const visibleTasks = topicsTasks.filter((task) => task?.showInPath !== false);
    return visibleTasks.length > 0 ? visibleTasks : topicsTasks;
  }, [taskList]);
  const sectionTabs = useMemo(() => {
    const primarySections = taskSections.filter((section) => section.id === 'topics' || section.id === 'exam-prep');
    return primarySections.length > 0 ? primarySections : taskSections;
  }, [taskSections]);
  const [activeTaskSectionId, setActiveTaskSectionId] = useState('topics');
  const [activeTask, setActiveTask] = useState(null);
  const [reviewTask, setReviewTask] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(null);
  const [activeSubsectionId, setActiveSubsectionId] = useState(null);
  const [studentData, setStudentData] = useState({ progress: {} });
  const [dataError, setDataError] = useState('');
  const [testsDb, setTestsDb] = useState(null);
  const [testsDbError, setTestsDbError] = useState('');
  const [manageTaskNumber, setManageTaskNumber] = useState(taskList[0]?.number || '');
  const [cardTitle, setCardTitle] = useState('');
  const [cardDisplayNumber, setCardDisplayNumber] = useState('');
  const [cardSectionId, setCardSectionId] = useState('topics');
  const [cardShowInPath, setCardShowInPath] = useState(true);
  const [editingCardNumber, setEditingCardNumber] = useState(null);
  const isEditingCard = Number.isFinite(editingCardNumber);
  const [cardSaving, setCardSaving] = useState(false);
  const [cardError, setCardError] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPrompt, setNewTaskPrompt] = useState('');
  const [newStarterCode, setNewStarterCode] = useState('');
  const [newTests, setNewTests] = useState([{ input: '', output: '' }]);
  const [testsFileName, setTestsFileName] = useState('');
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [selectedSubsectionId, setSelectedSubsectionId] = useState(PYTHON_DEFAULT_SUBSECTION_ID);
  const [theorySubsectionId, setTheorySubsectionId] = useState(PYTHON_DEFAULT_SUBSECTION_ID);
  const [newSubsectionTitle, setNewSubsectionTitle] = useState('');
  const [editingSubsectionId, setEditingSubsectionId] = useState('');
  const [editingSubsectionTitle, setEditingSubsectionTitle] = useState('');
  const [subsectionSaving, setSubsectionSaving] = useState(false);
  const [subsectionError, setSubsectionError] = useState('');
  const [theoryType, setTheoryType] = useState('text');
  const [theoryText, setTheoryText] = useState('');
  const [theoryUrl, setTheoryUrl] = useState('');
  const [theoryRecordingDraft, setTheoryRecordingDraft] = useState(null);
  const [theorySaving, setTheorySaving] = useState(false);
  const [theoryError, setTheoryError] = useState('');
  const [showTeacherTaskToolsMobile, setShowTeacherTaskToolsMobile] = useState(false);
  const [showTeacherTheoryToolsMobile, setShowTeacherTheoryToolsMobile] = useState(false);
  const mobilePythonPathCanvasRef = useRef(null);
  const teacherTaskToolsRef = useRef(null);
  const [mobilePythonPathCanvasWidth, setMobilePythonPathCanvasWidth] = useState(0);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const codeSyncRoomId = effectiveStudentId
    ? `py-sync:${String(effectiveStudentId).trim()}`
    : '';

  useEffect(() => {
    if (!effectiveStudentId) {
      setStudentData({ progress: {} });
      return;
    }
    let cancelled = false;
    api.getStudentData(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setStudentData(normalizeLoadedStudentData(data));
        setDataError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setDataError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId]);

  useEffect(() => {
    setReviewTask(null);
    setActiveTask(null);
    setActiveQuestionIndex(null);
    setActiveSubsectionId(null);
  }, [effectiveStudentId]);

  useEffect(() => {
    setShowTeacherTaskToolsMobile(false);
    setShowTeacherTheoryToolsMobile(false);
  }, [effectiveStudentId, role]);

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
    const normalizedCatalog = normalizePythonTaskCatalog(
      testsDb?.[PYTHON_TASKS_CATALOG_KEY],
      defaultTaskList
    );
    setTaskCatalog((prev) => (
      pythonTaskCatalogsEqual(prev, normalizedCatalog) ? prev : normalizedCatalog
    ));
  }, [testsDb, defaultTaskList]);

  useEffect(() => {
    if (!sectionTabs.length) return;
    if (sectionTabs.some((section) => section.id === activeTaskSectionId)) return;
    setActiveTaskSectionId(sectionTabs[0].id);
  }, [sectionTabs, activeTaskSectionId]);

  useEffect(() => {
    if (role !== 'student' || !openTask) return;
    const target = taskList.find((task) => Number(task.number) === Number(openTask.taskNumber));
    if (!target) {
      onOpenTaskHandled?.();
      return;
    }
    setActiveTaskSectionId(String(target.sectionId || 'topics'));
    setActiveTask(target);
    setActiveSubsectionId(String(openTask.subsectionId || '').trim() || null);
    if (Number.isFinite(openTask.questionIndex)) {
      setActiveQuestionIndex(openTask.questionIndex);
    } else {
      setActiveQuestionIndex(null);
    }
    onOpenTaskHandled?.();
  }, [openTask, role, taskList, onOpenTaskHandled]);

  useEffect(() => {
    if (role !== 'student') return;
    if (!activeTask) {
      if (openTask) return;
      onTaskStateChange?.(null);
      return;
    }
    onTaskStateChange?.({
      taskNumber: activeTask.number,
      levelId: PYTHON_LEVEL_ID,
      targetQuestions: null,
      section: 'python',
      questionIndex: Number.isFinite(activeQuestionIndex) ? activeQuestionIndex : null,
      subsectionId: String(activeSubsectionId || '').trim() || null
    });
  }, [activeTask, activeQuestionIndex, activeSubsectionId, role, PYTHON_LEVEL_ID, onTaskStateChange, openTask]);

  useEffect(() => {
    if (!activeTask) return;
    const nextSectionId = String(activeTask.sectionId || 'topics');
    setActiveTaskSectionId((prev) => (prev === nextSectionId ? prev : nextSectionId));
  }, [activeTask]);

  useEffect(() => {
    if (!taskList.length) {
      setManageTaskNumber('');
      setReviewTask(null);
      return;
    }
    if (!taskList.some((task) => task.number === manageTaskNumber)) {
      setManageTaskNumber(taskList[0].number);
    }
    setEditingQuestionId(null);
    setReviewTask(null);
    setNewTaskTitle('');
    setNewTaskPrompt('');
    setNewStarterCode('');
    setNewTests([{ input: '', output: '' }]);
    setTestsFileName('');
    setQuestionError('');
    setSelectedSubsectionId(PYTHON_DEFAULT_SUBSECTION_ID);
    setTheorySubsectionId(PYTHON_DEFAULT_SUBSECTION_ID);
    setNewSubsectionTitle('');
    setEditingSubsectionId('');
    setEditingSubsectionTitle('');
    setSubsectionError('');
    setTheoryError('');
    setTheoryRecordingDraft(null);
    setCardError('');
  }, [taskList, manageTaskNumber]);

  useEffect(() => {
    if (!manageTaskNumber) return;
    const taskEntry = getPythonTaskEntry(testsDb, manageTaskNumber);
    const safeTheorySubsectionId = normalizeTheorySubsectionId(theorySubsectionId);
    const theoryVariants = resolveTheoryVariantsForSubsection(taskEntry, safeTheorySubsectionId, {
      fallbackToDefault: false,
      fallbackToLegacy: safeTheorySubsectionId === PYTHON_DEFAULT_SUBSECTION_ID,
    });
    setTheoryType((prevType) => pickTheoryVariantType(theoryVariants, prevType) || 'text');
    setTheoryError('');
  }, [testsDb, manageTaskNumber, theorySubsectionId]);

  useLayoutEffect(() => {
    if (role !== 'student') return undefined;
    const element = mobilePythonPathCanvasRef.current;
    if (!element) return undefined;
    const updateWidth = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      if (!Number.isFinite(width) || width <= 0) return;
      setMobilePythonPathCanvasWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev));
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
  }, [role, pathTaskList.length]);

  const progressMap = useMemo(() => (
    role === 'teacher'
      ? (studentData.progress || {})
      : (Object.keys(progress || {}).length ? progress : (studentData.progress || {}))
  ), [role, progress, studentData.progress]);
  const activeTaskSection = useMemo(
    () => sectionTabs.find((section) => section.id === activeTaskSectionId) || sectionTabs[0] || null,
    [sectionTabs, activeTaskSectionId]
  );
  const manageTaskEntry = useMemo(
    () => getPythonTaskEntry(testsDb, manageTaskNumber),
    [testsDb, manageTaskNumber]
  );
  const selectedManageTheoryVariants = useMemo(
    () => {
      const safeTheorySubsectionId = normalizeTheorySubsectionId(theorySubsectionId);
      return resolveTheoryVariantsForSubsection(manageTaskEntry, safeTheorySubsectionId, {
        fallbackToDefault: false,
        fallbackToLegacy: safeTheorySubsectionId === PYTHON_DEFAULT_SUBSECTION_ID,
      });
    },
    [manageTaskEntry, theorySubsectionId]
  );
  const selectedManageTheory = useMemo(
    () => selectedManageTheoryVariants[theoryType] || null,
    [selectedManageTheoryVariants, theoryType]
  );
  const savedTheoryRecording = useMemo(() => {
    const theory = selectedManageTheory;
    if (!theory || theory.type !== THEORY_RECORDING_TYPE) return null;
    return normalizeTheoryRecording(theory.content);
  }, [selectedManageTheory]);

  useEffect(() => {
    const theory = selectedManageTheory;
    setTheoryText(theoryType === 'text' ? String(theory?.content || '') : '');
    setTheoryUrl(theoryType === 'gdoc' ? String(theory?.content || '') : '');
    setTheoryRecordingDraft(
      theoryType === THEORY_RECORDING_TYPE
        ? normalizeTheoryRecording(theory?.content)
        : null
    );
    setTheoryError('');
  }, [selectedManageTheory, theoryType]);
  const manageSubsectionModel = useMemo(
    () => buildPythonSubsectionModel(manageTaskEntry, PYTHON_LEVEL_ID, {
      includeEmptySections: true,
      defaultSectionTitle: 'Без подраздела',
    }),
    [manageTaskEntry, PYTHON_LEVEL_ID]
  );
  const manageSubsections = useMemo(
    () => manageSubsectionModel.subsections.filter((section) => !section.isDefault),
    [manageSubsectionModel]
  );
  const manageTheorySubsections = useMemo(
    () => manageSubsectionModel.subsections,
    [manageSubsectionModel]
  );
  const manageQuestionGroups = useMemo(
    () => manageSubsectionModel.subsections.filter((section) => section.count > 0),
    [manageSubsectionModel]
  );
  const setActiveManageSubsection = useCallback((subsectionId) => {
    const nextSubsectionId = normalizeTheorySubsectionId(subsectionId);
    setSelectedSubsectionId(nextSubsectionId);
    setTheorySubsectionId(nextSubsectionId);
  }, []);

  useEffect(() => {
    if (!selectedSubsectionId || selectedSubsectionId === PYTHON_DEFAULT_SUBSECTION_ID) return;
    if (manageSubsections.some((section) => section.id === selectedSubsectionId)) return;
    setSelectedSubsectionId(PYTHON_DEFAULT_SUBSECTION_ID);
  }, [manageSubsections, selectedSubsectionId]);

  useEffect(() => {
    const safeTheorySubsectionId = normalizeTheorySubsectionId(theorySubsectionId);
    if (manageTheorySubsections.some((section) => section.id === safeTheorySubsectionId)) return;
    setTheorySubsectionId(PYTHON_DEFAULT_SUBSECTION_ID);
  }, [manageTheorySubsections, theorySubsectionId]);

  const manageQuestions = manageTaskNumber
    ? (testsDb?.[manageTaskNumber]?.[PYTHON_LEVEL_ID] || [])
    : [];

  const handleSavePythonTask = async () => {
    if (role !== 'teacher') return;
    const question = newTaskPrompt.trim();
    const title = newTaskTitle.trim();
    const starterCode = normalizeCodeText(newStarterCode).trim();
    if (!manageTaskNumber) return;
    const preparedTests = newTests
      .map((test) => ({
        input: String(test?.input ?? '').trimEnd(),
        output: String(test?.output ?? '').trimEnd(),
      }))
      .filter((test) => test.input || test.output);
    if (!question) {
      setQuestionError('Введите условие задачи.');
      return;
    }
    if (preparedTests.length === 0) {
      setQuestionError('Добавьте хотя бы один тест.');
      return;
    }
    const updatedDb = { ...(testsDb || {}) };
    if (!updatedDb[manageTaskNumber]) updatedDb[manageTaskNumber] = {};
    const currentSubsections = normalizeSubsectionMetaList(updatedDb[manageTaskNumber]?.pythonSubsections);
    const selectedSubsection = selectedSubsectionId && selectedSubsectionId !== PYTHON_DEFAULT_SUBSECTION_ID
      ? manageSubsections.find((section) => section.id === selectedSubsectionId) || null
      : null;
    if (selectedSubsection && !currentSubsections.some((section) => section.id === selectedSubsection.id)) {
      currentSubsections.push({
        id: selectedSubsection.id,
        title: selectedSubsection.title,
        order: currentSubsections.length,
      });
    }
    updatedDb[manageTaskNumber].pythonSubsections = currentSubsections;
    if (!Array.isArray(updatedDb[manageTaskNumber][PYTHON_LEVEL_ID])) {
      updatedDb[manageTaskNumber][PYTHON_LEVEL_ID] = [];
    }
    const list = updatedDb[manageTaskNumber][PYTHON_LEVEL_ID];
    const taskPayload = {
      title,
      question,
      starterCode,
      tests: preparedTests,
    };
    if (selectedSubsection) {
      taskPayload.subsectionId = selectedSubsection.id;
      taskPayload.subsectionTitle = selectedSubsection.title;
    }
    if (editingQuestionId) {
      const idx = list.findIndex((item) => item.id === editingQuestionId);
      if (idx === -1) {
        setQuestionError('Не удалось найти задачу для редактирования.');
        return;
      }
      const updatedTask = {
        ...list[idx],
        ...taskPayload
      };
      if (!selectedSubsection) {
        delete updatedTask.subsectionId;
        delete updatedTask.subsectionTitle;
      }
      list[idx] = updatedTask;
    } else {
      list.push({
        id: Date.now(),
        ...taskPayload
      });
    }
    setQuestionSaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      setNewTaskTitle('');
      setNewTaskPrompt('');
      setNewStarterCode('');
      setNewTests([{ input: '', output: '' }]);
      setQuestionError('');
      setEditingQuestionId(null);
      setTestsFileName('');
      setSelectedSubsectionId(PYTHON_DEFAULT_SUBSECTION_ID);
    } catch (err) {
      setQuestionError(err?.message || err);
    } finally {
      setQuestionSaving(false);
    }
  };

  const startEditPythonTask = (task) => {
    if (!task) return;
    setEditingQuestionId(task.id);
    setNewTaskTitle(task.title || '');
    setNewTaskPrompt(task.question || '');
    setNewStarterCode(task.starterCode || '');
    if (Array.isArray(task.tests) && task.tests.length > 0) {
      setNewTests(task.tests.map((test) => ({
        input: String(test?.input ?? ''),
        output: String(test?.output ?? '')
      })));
    } else if (task.answer) {
      setNewTests([{ input: '', output: String(task.answer) }]);
    } else {
      setNewTests([{ input: '', output: '' }]);
    }
    setActiveManageSubsection(String(task?.subsectionId || '').trim() || PYTHON_DEFAULT_SUBSECTION_ID);
    setQuestionError('');
    setTestsFileName('');
  };

  const cancelEditPythonTask = () => {
    setEditingQuestionId(null);
    setNewTaskTitle('');
    setNewTaskPrompt('');
    setNewStarterCode('');
    setNewTests([{ input: '', output: '' }]);
    setTestsFileName('');
    setSelectedSubsectionId(PYTHON_DEFAULT_SUBSECTION_ID);
    setQuestionError('');
  };

  const startEditTaskCard = (task) => {
    if (!task) return;
    const sectionId = normalizePythonTaskSectionId(task.sectionId);
    setEditingCardNumber(Number(task.number));
    setCardTitle(String(task.title || ''));
    setCardDisplayNumber(String(task.displayNumber || ''));
    setCardSectionId(sectionId);
    setCardShowInPath(sectionId === 'topics' ? task.showInPath !== false : false);
    setCardError('');
    setManageTaskNumber(Number(task.number));
    setShowTeacherTaskToolsMobile(true);
  };

  const cancelEditTaskCard = () => {
    setEditingCardNumber(null);
    setCardTitle('');
    setCardDisplayNumber('');
    setCardSectionId('topics');
    setCardShowInPath(true);
    setCardError('');
  };

  const scrollToTaskTools = () => {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      teacherTaskToolsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const startCreateTaskCard = (sectionId = 'topics') => {
    const nextSectionId = normalizePythonTaskSectionId(sectionId);
    const currentSection = taskSections.find((section) => section.id === nextSectionId);
    const nextManageTaskNumber = currentSection?.tasks?.[0]?.number ?? taskList[0]?.number ?? '';
    setEditingCardNumber(null);
    setCardTitle('');
    setCardDisplayNumber('');
    setCardSectionId(nextSectionId);
    setCardShowInPath(nextSectionId === 'topics');
    setCardError('');
    if (Number.isFinite(Number(nextManageTaskNumber))) {
      setManageTaskNumber(Number(nextManageTaskNumber));
    }
    setShowTeacherTheoryToolsMobile(false);
    setShowTeacherTaskToolsMobile(true);
    scrollToTaskTools();
  };

  const handleSaveTaskCard = async () => {
    if (role !== 'teacher') return;
    const title = String(cardTitle || '').trim();
    if (!title) {
      setCardError('Введите название карточки.');
      return;
    }
    const sectionId = normalizePythonTaskSectionId(cardSectionId);
    const displayNumber = String(cardDisplayNumber || '').trim();
    const nextCatalogBase = Array.isArray(taskList) ? [...taskList] : [];
    let targetNumber = isEditingCard ? editingCardNumber : NaN;
    if (isEditingCard) {
      const idx = nextCatalogBase.findIndex((task) => Number(task?.number) === targetNumber);
      if (idx < 0) {
        setCardError('Не удалось найти карточку для редактирования.');
        return;
      }
      const updatedTask = {
        ...nextCatalogBase[idx],
        title,
        displayNumber: displayNumber || String(nextCatalogBase[idx].displayNumber || nextCatalogBase[idx].number),
        sectionId,
      };
      if (sectionId !== 'topics' || !cardShowInPath) {
        updatedTask.showInPath = false;
      } else {
        delete updatedTask.showInPath;
      }
      nextCatalogBase[idx] = updatedTask;
    } else {
      targetNumber = getNextPythonTaskNumber(taskList, sectionId);
      const nextTask = {
        id: targetNumber,
        number: targetNumber,
        title,
        displayNumber: displayNumber || String(targetNumber),
        sectionId,
      };
      if (sectionId !== 'topics' || !cardShowInPath) {
        nextTask.showInPath = false;
      }
      nextCatalogBase.push(nextTask);
    }

    const normalizedCatalog = normalizePythonTaskCatalog(nextCatalogBase, defaultTaskList);
    const updatedDb = { ...(testsDb || {}) };
    updatedDb[PYTHON_TASKS_CATALOG_KEY] = normalizedCatalog;
    const targetKey = String(targetNumber);
    if (!updatedDb[targetKey] || typeof updatedDb[targetKey] !== 'object' || Array.isArray(updatedDb[targetKey])) {
      updatedDb[targetKey] = { [PYTHON_LEVEL_ID]: [] };
    } else if (!Array.isArray(updatedDb[targetKey]?.[PYTHON_LEVEL_ID])) {
      updatedDb[targetKey] = {
        ...updatedDb[targetKey],
        [PYTHON_LEVEL_ID]: [],
      };
    }

    const previousCatalog = taskList;
    const previousDb = testsDb;
    setCardSaving(true);
    setTaskCatalog(normalizedCatalog);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      setManageTaskNumber(targetNumber);
      cancelEditTaskCard();
    } catch (err) {
      setTaskCatalog(previousCatalog);
      setTestsDb(previousDb);
      setCardError(err?.message || err);
    } finally {
      setCardSaving(false);
    }
  };

  const handleDeleteTaskCard = async (task) => {
    const taskNumber = Number(task?.number);
    if (role !== 'teacher' || !Number.isFinite(taskNumber)) return;
    const currentTaskEntry = getPythonTaskEntry(testsDb, taskNumber) || {};
    const questionsCount = Array.isArray(currentTaskEntry?.[PYTHON_LEVEL_ID])
      ? currentTaskEntry[PYTHON_LEVEL_ID].length
      : 0;
    const removalHint = questionsCount > 0
      ? ` Это удалит ${questionsCount} ${questionsCount === 1 ? 'задачу' : 'задач'}.`
      : '';
    if (!confirm(`Удалить карточку "${task.title}"?${removalHint}`)) return;

    const recordingStorageNames = new Set();
    const theoryBySubsection = normalizeTheoryBySubsectionMap(currentTaskEntry?.pythonTheoryBySubsection);
    Object.values(theoryBySubsection).forEach((variants) => {
      Object.values(variants || {}).forEach((theory) => {
        getTheoryRecordingStorageNames(theory).forEach((storageName) => {
          if (storageName) recordingStorageNames.add(storageName);
        });
      });
    });
    const legacyTheoryVariants = normalizeTheoryVariantMap(currentTaskEntry?.pythonTheory);
    Object.values(legacyTheoryVariants).forEach((theory) => {
      getTheoryRecordingStorageNames(theory).forEach((storageName) => {
        if (storageName) recordingStorageNames.add(storageName);
      });
    });

    const nextCatalog = normalizePythonTaskCatalog(
      taskList.filter((item) => Number(item?.number) !== taskNumber),
      []
    );
    const updatedDb = { ...(testsDb || {}) };
    delete updatedDb[String(taskNumber)];
    delete updatedDb[taskNumber];
    if (nextCatalog.length > 0) {
      updatedDb[PYTHON_TASKS_CATALOG_KEY] = nextCatalog;
    } else {
      delete updatedDb[PYTHON_TASKS_CATALOG_KEY];
    }

    const previousCatalog = taskList;
    const previousDb = testsDb;
    setCardSaving(true);
    setTaskCatalog(nextCatalog);
    setTestsDb(updatedDb);
    if (Number(manageTaskNumber) === taskNumber) {
      setManageTaskNumber(nextCatalog[0]?.number || '');
      cancelEditPythonTask();
    }
    try {
      await api.saveTests(updatedDb);
      recordingStorageNames.forEach((storageName) => {
        api.deleteTestFile(storageName).catch(() => {});
      });
      if (isEditingCard && editingCardNumber === taskNumber) {
        cancelEditTaskCard();
      }
      setCardError('');
    } catch (err) {
      setTaskCatalog(previousCatalog);
      setTestsDb(previousDb);
      setCardError(err?.message || err);
    } finally {
      setCardSaving(false);
    }
  };

  useEffect(() => {
    if (!isEditingCard) return;
    if (taskList.some((task) => Number(task?.number) === editingCardNumber)) return;
    cancelEditTaskCard();
  }, [editingCardNumber, isEditingCard, taskList]);

  const handleSaveSubsection = async () => {
    if (role !== 'teacher' || !manageTaskNumber) return;
    const title = String(editingSubsectionId ? editingSubsectionTitle : newSubsectionTitle).trim();
    if (!title) {
      setSubsectionError('Введите название подраздела.');
      return;
    }
    const updatedDb = { ...(testsDb || {}) };
    if (!updatedDb[manageTaskNumber]) updatedDb[manageTaskNumber] = {};
    const currentTaskEntry = updatedDb[manageTaskNumber];
    const currentSubsections = normalizeSubsectionMetaList(currentTaskEntry?.pythonSubsections);
    const nextId = editingSubsectionId || createPythonSubsectionId(title, currentSubsections.map((section) => section.id));
    let updated = false;
    const nextSubsections = currentSubsections.map((section, index) => {
      if (section.id !== nextId) return { ...section, order: index };
      updated = true;
      return { id: nextId, title, order: index };
    });
    if (!updated) {
      nextSubsections.push({ id: nextId, title, order: nextSubsections.length });
    }
    const currentQuestions = Array.isArray(currentTaskEntry?.[PYTHON_LEVEL_ID])
      ? currentTaskEntry[PYTHON_LEVEL_ID]
      : [];
    updatedDb[manageTaskNumber] = {
      ...currentTaskEntry,
      pythonSubsections: nextSubsections,
      [PYTHON_LEVEL_ID]: currentQuestions.map((item) => {
        if (String(item?.subsectionId || '').trim() !== nextId) return item;
        return { ...item, subsectionTitle: title };
      })
    };
    setSubsectionSaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      setSubsectionError('');
      setNewSubsectionTitle('');
      setEditingSubsectionId('');
      setEditingSubsectionTitle('');
      setActiveManageSubsection(nextId);
    } catch (err) {
      setSubsectionError(err?.message || err);
    } finally {
      setSubsectionSaving(false);
    }
  };

  const startEditSubsection = (subsection) => {
    if (!subsection?.id || subsection.isDefault) return;
    setEditingSubsectionId(subsection.id);
    setEditingSubsectionTitle(subsection.title || '');
    setSubsectionError('');
  };

  const cancelEditSubsection = () => {
    setEditingSubsectionId('');
    setEditingSubsectionTitle('');
    setNewSubsectionTitle('');
    setSubsectionError('');
  };

  const handleDeleteSubsection = async (subsection) => {
    const subsectionId = String(subsection?.id || '').trim();
    if (role !== 'teacher' || !manageTaskNumber || !subsectionId || subsectionId === PYTHON_DEFAULT_SUBSECTION_ID) return;
    if (!confirm(`Удалить подраздел "${subsection.title}"? Задачи останутся, но выйдут из подраздела.`)) return;
    const updatedDb = { ...(testsDb || {}) };
    if (!updatedDb[manageTaskNumber]) return;
    const currentTaskEntry = updatedDb[manageTaskNumber];
    const currentTheoryBySubsection = normalizeTheoryBySubsectionMap(currentTaskEntry?.pythonTheoryBySubsection);
    const removedTheoryVariants = currentTheoryBySubsection[subsectionId] || {};
    const removedRecordingStorageNames = Array.from(
      new Set(
        Object.values(removedTheoryVariants)
          .flatMap((theory) => getTheoryRecordingStorageNames(theory))
          .filter(Boolean)
      )
    );
    const nextTheoryBySubsection = { ...currentTheoryBySubsection };
    delete nextTheoryBySubsection[subsectionId];
    const currentSubsections = normalizeSubsectionMetaList(currentTaskEntry?.pythonSubsections)
      .filter((section) => section.id !== subsectionId)
      .map((section, index) => ({ ...section, order: index }));
    const currentQuestions = Array.isArray(currentTaskEntry?.[PYTHON_LEVEL_ID])
      ? currentTaskEntry[PYTHON_LEVEL_ID]
      : [];
    const nextTaskEntry = {
      ...currentTaskEntry,
      pythonSubsections: currentSubsections,
      [PYTHON_LEVEL_ID]: currentQuestions.map((item) => {
        if (String(item?.subsectionId || '').trim() !== subsectionId) return item;
        const nextItem = { ...item };
        delete nextItem.subsectionId;
        delete nextItem.subsectionTitle;
        return nextItem;
      })
    };
    if (Object.keys(nextTheoryBySubsection).length > 0) {
      nextTaskEntry.pythonTheoryBySubsection = nextTheoryBySubsection;
    } else {
      delete nextTaskEntry.pythonTheoryBySubsection;
    }
    updatedDb[manageTaskNumber] = nextTaskEntry;
    setSubsectionSaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      removedRecordingStorageNames.forEach((storageName) => {
        api.deleteTestFile(storageName).catch(() => {});
      });
      setSubsectionError('');
      if (selectedSubsectionId === subsectionId) {
        setSelectedSubsectionId(PYTHON_DEFAULT_SUBSECTION_ID);
      }
      if (theorySubsectionId === subsectionId) {
        setTheorySubsectionId(PYTHON_DEFAULT_SUBSECTION_ID);
      }
      if (editingSubsectionId === subsectionId) {
        cancelEditSubsection();
      }
    } catch (err) {
      setSubsectionError(err?.message || err);
    } finally {
      setSubsectionSaving(false);
    }
  };

  const handleTestsFileUpload = (file) => {
    if (!file) return;
    setQuestionError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseTestsFileContent(reader.result);
        if (!parsed.length) {
          setQuestionError('Неверный формат тестов: добавьте хотя бы один тест.');
          return;
        }
        setNewTests(parsed);
        setTestsFileName(file.name);
      } catch (err) {
        setQuestionError(err?.message || 'Не удалось прочитать файл с тестами.');
      }
    };
    reader.onerror = () => {
      setQuestionError('Не удалось прочитать файл с тестами.');
    };
    reader.readAsText(file);
  };

  const handleSavePythonTheory = async (recordingOverride = null) => {
    if (role !== 'teacher') return;
    if (!manageTaskNumber) return;
    const safeTheorySubsectionId = normalizeTheorySubsectionId(theorySubsectionId);
    const currentTaskEntry = getPythonTaskEntry(testsDb, manageTaskNumber) || {};
    const currentTheoryBySubsection = normalizeTheoryBySubsectionMap(currentTaskEntry?.pythonTheoryBySubsection);
    const currentTheoryVariants = currentTheoryBySubsection[safeTheorySubsectionId]
      || (
        safeTheorySubsectionId === PYTHON_DEFAULT_SUBSECTION_ID
          ? normalizeTheoryVariantMap(currentTaskEntry?.pythonTheory)
          : {}
      );
    const currentTheory = currentTheoryVariants[theoryType] || null;
    const previousRecordingStorageNames = (
      theoryType === THEORY_RECORDING_TYPE
        ? getTheoryRecordingStorageNames(currentTheory)
        : []
    );
    const uploadedStorageNames = [];
    let nextRecordingStorageNames = [];
    let recordingDraftToPersist = null;
    let nextTheory = null;

    if (theoryType === THEORY_RECORDING_TYPE) {
      const normalizedDraft = normalizeTheoryRecording(recordingOverride || theoryRecordingDraft);
      if (!normalizedDraft || normalizedDraft.events.length === 0) {
        setTheoryError('Сначала запишите видеоразбор: голос и действия в редакторе.');
        return;
      }
      const rawAudioSegments = getTheoryRecordingAudioSegments(normalizedDraft);
      if (rawAudioSegments.length === 0) {
        setTheoryError('Для видеоразбора нужно записать аудио.');
        return;
      }
      const finalizedAudioSegments = [];
      for (const segment of rawAudioSegments) {
        if (segment.isNew && segment.file) {
          let uploaded = null;
          try {
            uploaded = await api.uploadTestFile(segment.file);
          } catch (error) {
            uploadedStorageNames.forEach((storageName) => {
              api.deleteTestFile(storageName).catch(() => {});
            });
            setTheoryError(error?.message || 'Не удалось загрузить аудио для видеоразбора.');
            return;
          }
          const uploadedStorageName = String(uploaded?.storageName || '').trim();
          if (uploadedStorageName) uploadedStorageNames.push(uploadedStorageName);
          finalizedAudioSegments.push({
            url: String(uploaded?.url || ''),
            storageName: uploadedStorageName,
            name: String(uploaded?.name || segment.name || segment.file.name || ''),
            sizeBytes: Math.max(0, Number(uploaded?.sizeBytes || segment.sizeBytes || segment.file.size || 0)),
            durationMs: Math.max(0, Number(segment.durationMs) || 0),
          });
          continue;
        }
        finalizedAudioSegments.push({
          url: String(segment.url || ''),
          storageName: String(segment.storageName || ''),
          name: String(segment.name || ''),
          sizeBytes: Math.max(0, Number(segment.sizeBytes) || 0),
          durationMs: Math.max(0, Number(segment.durationMs) || 0),
        });
      }
      if (!finalizedAudioSegments.every((segment) => segment.url)) {
        uploadedStorageNames.forEach((storageName) => {
          api.deleteTestFile(storageName).catch(() => {});
        });
        setTheoryError('Не удалось подготовить аудио для видеоразбора.');
        return;
      }
      nextRecordingStorageNames = finalizedAudioSegments
        .map((segment) => String(segment.storageName || '').trim())
        .filter(Boolean);

      const nowIso = new Date().toISOString();
      const persistedRecording = {
        version: Number.isFinite(Number(normalizedDraft.version)) ? Number(normalizedDraft.version) : 1,
        initialCode: String(normalizedDraft.initialCode || ''),
        durationMs: Math.max(0, Number(normalizedDraft.durationMs) || 0),
        events: normalizedDraft.events.map((event) => ({ ...event })),
        audio: {
          segments: finalizedAudioSegments,
        },
        createdAt: normalizedDraft.createdAt || nowIso,
        updatedAt: nowIso,
      };

      const jsonSizeBytes = estimateTheoryRecordingSizeBytes(persistedRecording);
      if (!Number.isFinite(jsonSizeBytes) || jsonSizeBytes > THEORY_RECORDING_MAX_JSON_BYTES) {
        uploadedStorageNames.forEach((storageName) => {
          api.deleteTestFile(storageName).catch(() => {});
        });
        setTheoryError('Видеоразбор слишком большой. Сократите запись или уменьшите количество действий.');
        return;
      }

      recordingDraftToPersist = {
        ...persistedRecording,
        audio: {
          segments: finalizedAudioSegments.map((segment) => ({
            ...segment,
            isNew: false,
            file: null,
          })),
        },
      };
      nextTheory = { type: THEORY_RECORDING_TYPE, content: persistedRecording };
    } else {
      const raw = theoryType === 'gdoc' ? theoryUrl.trim() : theoryText.trim();
      if (!raw) {
        setTheoryError('Добавьте текст теории или ссылку на Google Docs.');
        return;
      }
      let content = raw;
      if (theoryType === 'gdoc') {
        const embedUrl = buildGoogleDocEmbedUrl(raw);
        if (!embedUrl) {
          setTheoryError('Нужна ссылка на Google Docs (поддерживаются ссылки на документ или iframe).');
          return;
        }
        content = embedUrl;
        setTheoryUrl(embedUrl);
      }
      nextTheory = { type: theoryType, content };
    }

    const nextTheoryVariants = {
      ...currentTheoryVariants,
      [theoryType]: nextTheory,
    };
    const nextTheoryBySubsection = {
      ...currentTheoryBySubsection,
      [safeTheorySubsectionId]: nextTheoryVariants,
    };
    const updatedDb = { ...(testsDb || {}) };
    const nextTaskEntry = {
      ...(updatedDb[manageTaskNumber] || {}),
      pythonTheoryBySubsection: nextTheoryBySubsection,
    };
    if (safeTheorySubsectionId === PYTHON_DEFAULT_SUBSECTION_ID) {
      delete nextTaskEntry.pythonTheory;
    }
    updatedDb[manageTaskNumber] = nextTaskEntry;
    setTheorySaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      if (recordingDraftToPersist) {
        setTheoryRecordingDraft(recordingDraftToPersist);
        await deleteTheoryRecordingDraftSnapshot(buildTheoryRecordingDraftStorageKey(manageTaskNumber, safeTheorySubsectionId));
      } else {
        setTheoryRecordingDraft(null);
      }
      const nextStorageNameSet = new Set(nextRecordingStorageNames);
      previousRecordingStorageNames.forEach((storageName) => {
        if (!nextStorageNameSet.has(storageName)) {
          api.deleteTestFile(storageName).catch(() => {});
        }
      });
      setTheoryError('');
    } catch (err) {
      uploadedStorageNames.forEach((storageName) => {
        api.deleteTestFile(storageName).catch(() => {});
      });
      setTheoryError(err?.message || err);
    } finally {
      setTheorySaving(false);
    }
  };

  const handleClearPythonTheory = async () => {
    if (role !== 'teacher') return;
    if (!manageTaskNumber) return;
    const safeTheorySubsectionId = normalizeTheorySubsectionId(theorySubsectionId);
    const currentTaskEntry = getPythonTaskEntry(testsDb, manageTaskNumber) || {};
    const currentTheoryBySubsection = normalizeTheoryBySubsectionMap(currentTaskEntry?.pythonTheoryBySubsection);
    const currentTheoryVariants = currentTheoryBySubsection[safeTheorySubsectionId]
      || (
        safeTheorySubsectionId === PYTHON_DEFAULT_SUBSECTION_ID
          ? normalizeTheoryVariantMap(currentTaskEntry?.pythonTheory)
          : {}
      );
    const currentTheory = currentTheoryVariants[theoryType] || null;
    const previousRecordingStorageNames = (
      theoryType === THEORY_RECORDING_TYPE
        ? getTheoryRecordingStorageNames(currentTheory)
        : []
    );
    const nextTheoryVariants = { ...currentTheoryVariants };
    delete nextTheoryVariants[theoryType];
    const nextTheoryBySubsection = { ...currentTheoryBySubsection };
    if (Object.keys(nextTheoryVariants).length > 0) {
      nextTheoryBySubsection[safeTheorySubsectionId] = nextTheoryVariants;
    } else {
      delete nextTheoryBySubsection[safeTheorySubsectionId];
    }
    const updatedDb = { ...(testsDb || {}) };
    const nextTaskEntry = { ...(updatedDb[manageTaskNumber] || {}) };
    if (Object.keys(nextTheoryBySubsection).length > 0) {
      nextTaskEntry.pythonTheoryBySubsection = nextTheoryBySubsection;
    } else {
      delete nextTaskEntry.pythonTheoryBySubsection;
    }
    if (safeTheorySubsectionId === PYTHON_DEFAULT_SUBSECTION_ID) {
      delete nextTaskEntry.pythonTheory;
    }
    updatedDb[manageTaskNumber] = nextTaskEntry;
    setTheorySaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      previousRecordingStorageNames.forEach((storageName) => {
        api.deleteTestFile(storageName).catch(() => {});
      });
      if (theoryType === 'text') setTheoryText('');
      if (theoryType === 'gdoc') setTheoryUrl('');
      if (theoryType === THEORY_RECORDING_TYPE) {
        setTheoryRecordingDraft(null);
        await deleteTheoryRecordingDraftSnapshot(buildTheoryRecordingDraftStorageKey(manageTaskNumber, safeTheorySubsectionId));
      }
      setTheoryError('');
    } catch (err) {
      setTheoryError(err?.message || err);
    } finally {
      setTheorySaving(false);
    }
  };

  const handleDeletePythonQuestion = async (taskNumber, questionId) => {
    if (role !== 'teacher') return;
    if (!confirm('Удалить эту задачу?')) return;
    const updatedDb = { ...(testsDb || {}) };
    const list = Array.isArray(updatedDb?.[taskNumber]?.[PYTHON_LEVEL_ID])
      ? updatedDb[taskNumber][PYTHON_LEVEL_ID]
      : [];
    updatedDb[taskNumber] = {
      ...(updatedDb[taskNumber] || {}),
      [PYTHON_LEVEL_ID]: list.filter((q) => q.id !== questionId)
    };
    setQuestionSaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
    } catch (err) {
      setQuestionError(err?.message || err);
    } finally {
      setQuestionSaving(false);
    }
  };

  const totalMastery = (() => {
    if (!taskList.length) return 0;
    const total = taskList.reduce((sum, task) => {
      const val = Number(progressMap[task.id] || 0);
      return sum + (Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0);
    }, 0);
    return Math.round((total / taskList.length) * 10) / 10;
  })();
  const totalMasteryRounded = Math.round(totalMastery);
  const totalMasteryLabel = Number.isFinite(totalMastery) && totalMastery % 1 !== 0
    ? totalMastery.toFixed(1)
    : totalMasteryRounded.toString();
  const masteredTopicsCount = taskList.filter((task) => Number(progressMap[task.id] || 0) >= 85).length;
  const inProgressTopicsCount = taskList.filter((task) => {
    const value = Number(progressMap[task.id] || 0);
    return value > 0 && value < 85;
  }).length;
  const notStartedTopicsCount = taskList.filter((task) => Number(progressMap[task.id] || 0) <= 0).length;
  const focusSectionTasks = Array.isArray(activeTaskSection?.tasks) && activeTaskSection.tasks.length > 0
    ? activeTaskSection.tasks
    : taskList;
  const focusTask = (
    activeTask && focusSectionTasks.some((task) => String(task.id) === String(activeTask.id))
      ? activeTask
      : null
  ) || focusSectionTasks.find((task) => {
    const value = Number(progressMap[task.id] || 0);
    return value > 0 && value < 85;
  }) || focusSectionTasks.find((task) => Number(progressMap[task.id] || 0) < 85) || focusSectionTasks[0] || null;
  const focusTaskProgress = focusTask
    ? Math.max(0, Math.min(100, Number(progressMap[focusTask.id] || 0)))
    : 0;
  const focusTaskSection = focusTask
    ? taskSections.find((section) => section.id === String(focusTask.sectionId || 'topics'))
    : null;
  const openFocusTask = () => {
    if (!focusTask) return;
    setActiveTaskSectionId(String(focusTask.sectionId || 'topics'));
    if (role === 'teacher') {
      setReviewTask(focusTask);
      return;
    }
    setActiveQuestionIndex(null);
    setActiveSubsectionId(null);
    setActiveTask(focusTask);
  };
  const mobilePythonPathLayout = useMemo(() => {
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
    const pathWidth = Math.max(296, Math.round(mobilePythonPathCanvasWidth || 336));
    const xPattern = [22, 74, 34, 70, 28, 76, 40, 68, 30, 74, 42, 66];
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
    ];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
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
    const nodes = pathTaskList.map((task, idx) => {
      const rawVal = Number(progressMap[task.id] || 0);
      const val = Number.isFinite(rawVal) ? Math.max(0, Math.min(100, rawVal)) : 0;
      const ringColor = val >= 85
        ? '#8b5cf6'
        : (val >= 60 ? '#c026d3' : (val >= 40 ? '#7c3aed' : '#9ca3af'));
      const numericSeed = Number(task?.number);
      const seed = Number.isFinite(numericSeed) ? numericSeed : (idx + 1);
      const jitter = ((seed * 13) % 11) - 5;
      const xBase = clamp(xPattern[idx % xPattern.length] + jitter, 20, 80);
      const centerX = clamp((xBase / 100) * pathWidth, centerMin, centerMax);
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
  }, [pathTaskList, progressMap, mobilePythonPathCanvasWidth]);

  const renderTaskCard = (task, idx, section) => {
    const val = Math.max(0, Math.min(100, Number(progressMap[task.id] || 0)));
    const clickable = role === 'student';
    const isSelected = String(activeTask?.id || '') === String(task.id || '');
    const progressState = val >= 85 ? 'mastered' : (val >= 55 ? 'steady' : (val > 0 ? 'warming' : 'start'));
    const progressLabel = val >= 85 ? 'Уверенно' : (val >= 55 ? 'В темпе' : (val > 0 ? 'Закрепить' : 'Старт'));
    const coinStats = getPythonTaskCoinStats({
      task,
      testsDb,
      studentData,
      levelId: PYTHON_LEVEL_ID,
    });
    const hasCoinBonus = coinStats.multiplier > 1.0001;
    const sectionUi = PYTHON_TASK_SECTION_UI[section?.id] || {
      badge: 'Раздел',
      cardClass: 'border-purple-200/70 bg-gradient-to-br from-white via-purple-50/40 to-fuchsia-50/40',
      hoverClass: 'hover:border-purple-300/80 hover:shadow-[0_16px_28px_rgba(147,51,234,0.16)]',
      numberClass: 'border-purple-200 bg-purple-50/80 text-purple-700',
    };
    const openTaskCard = () => {
      if (!clickable) return;
      setActiveQuestionIndex(null);
      setActiveSubsectionId(null);
      setActiveTask(task);
    };
    return (
      <Card
        key={task.id}
        style={{ '--i': idx, '--python-card-i': `${idx}` }}
        data-section={section?.id || 'topics'}
        data-state={progressState}
        data-selected={isSelected ? 'true' : 'false'}
        className={`python-learning-task-card group relative min-h-[132px] overflow-hidden border p-0 transition-all duration-300 ${sectionUi.cardClass} ${sectionUi.hoverClass}`}
        onClick={clickable ? openTaskCard : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={clickable ? `Открыть тему ${task.title}. Выполнено ${val}%` : undefined}
        onKeyDown={clickable ? (event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openTaskCard();
        } : undefined}
      >
        {role === 'teacher' && (
          <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReviewTask(task)}
              className="python-learning-task-card__toolbar-btn inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/90 text-purple-600 transition hover:border-purple-200 hover:text-purple-800"
              title="Открыть прогресс по теме"
              aria-label={`Открыть прогресс по теме ${task.title}`}
            >
              <BookOpen size={14} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                startEditTaskCard(task);
              }}
              className="python-learning-task-card__toolbar-btn inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-600 transition hover:border-purple-200 hover:text-purple-700"
              title="Редактировать карточку"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleDeleteTaskCard(task);
              }}
              disabled={cardSaving}
              className="python-learning-task-card__toolbar-btn inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/90 text-rose-500 transition hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
              title="Удалить карточку"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
        <div className="python-learning-task-card__accent" aria-hidden="true" />
        <div className="relative z-10 p-3.5 md:p-4">
          <div className={`mb-2.5 flex items-start justify-between gap-2 ${role === 'teacher' ? 'pr-32' : ''}`}>
            <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] md:text-xs font-extrabold ${sectionUi.numberClass}`}>
              №{getTaskDisplayNumber(task)}
            </span>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <span className={`python-learning-task-status python-learning-task-status--${progressState}`}>
                {progressLabel}
              </span>
              <span
                className="python-task-coin-badge inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/90 px-2 py-1 text-[10px] font-black text-amber-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
                title={`Монеты за тему: получено ${formatCoinAmount(coinStats.earnedCoins)} из ${formatCoinAmount(coinStats.possibleCoins)}${hasCoinBonus ? `, бонус ${formatCoinBonusPercent(coinStats.multiplier)}` : ''}`}
              >
                <CoinGuideIcon className="h-3.5 w-3.5 object-contain" />
                <span>{`${formatCoinAmount(coinStats.earnedCoins)} / ${formatCoinAmount(coinStats.possibleCoins)}`}</span>
                {hasCoinBonus && (
                  <span className="rounded-full border border-amber-300/70 bg-white/75 px-1 py-0 text-[9px] leading-4 text-amber-700">
                    {formatCoinBonusPercent(coinStats.multiplier)}
                  </span>
                )}
              </span>
            </div>
          </div>
          <h3 className="python-learning-task-card__title font-bold text-sm md:text-[15px] leading-snug text-slate-900">{task.title}</h3>
          <div className="mt-2.5 flex items-center justify-between text-[11px] md:text-xs text-slate-500">
            <span>{section?.id === 'exam-prep' ? 'Прогресс подготовки' : 'Прогресс темы'}</span>
            <span className="python-learning-task-card__percent text-sm md:text-base font-extrabold text-slate-800">{val}%</span>
          </div>
          <div
            className="python-learning-task-card__progress mt-1.5 h-2 w-full overflow-hidden rounded-full border border-purple-100/80 bg-white/75 shadow-[inset_0_1px_1px_rgba(255,255,255,0.72)]"
            role="progressbar"
            aria-label={`Прогресс темы ${task.title}`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={val}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 via-violet-500 to-fuchsia-500 transition-[width] duration-700 ease-out shadow-[0_0_18px_rgba(168,85,247,0.26)]"
              style={{ width: `${val}%` }}
            />
          </div>
        </div>
      </Card>
    );
  };

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Ученик:</span>
        <StudentSearchSelect
          students={studentsList}
          value={activeStudentId || ''}
          onChange={(value) => onSelectStudent?.(value || null)}
          disabled={studentsLoading || studentsList.length === 0}
          className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
          dark={String(theme || '').trim().toLowerCase() === 'dark'}
        />
      </div>
    );
  };

  const renderPythonTeacherEmptyState = ({ title, message, loading = false }) => (
    <div className="python-learning-shell python-learning-shell--refined python-learning-shell--teacher animate-fadeIn">
      <section className="python-learning-overview-panel python-learning-overview-panel--refined">
        <div className="python-learning-overview-panel__glow" aria-hidden="true" />
        <div className="python-learning-overview-panel__content">
          <header className="python-learning-overview-header">
            <div className="python-learning-overview-heading">
              <span className="python-learning-overview-heading__icon" aria-hidden="true"><Sparkles size={19} /></span>
              <div className="min-w-0">
                <div className="python-learning-eyebrow">Прогресс ученика</div>
                <h2 className="python-learning-title">Изучение Python</h2>
                <p className="python-learning-subtitle">Темы курса и подготовка к заданиям ЕГЭ — в одном понятном маршруте.</p>
              </div>
            </div>
          </header>
          <div className="python-learning-teacher-empty">
            <span className="python-learning-teacher-empty__icon" aria-hidden="true">
              {loading ? <RefreshCcw className="animate-spin" size={21} /> : <Target size={21} />}
            </span>
            <div className="python-learning-teacher-empty__copy">
              <h3>{title}</h3>
              <p>{message}</p>
            </div>
            <div className="python-learning-teacher-empty__picker">{renderStudentPicker()}</div>
          </div>
        </div>
      </section>
    </div>
  );

  if (role === 'teacher' && studentsList.length === 0) {
    return renderPythonTeacherEmptyState({
      loading: studentsLoading,
      title: studentsLoading ? 'Загружаем учеников' : 'Пока нет учеников',
      message: studentsLoading ? 'Список появится через несколько секунд.' : 'Создайте ученика в панели учителя, чтобы открыть его маршрут Python.',
    });
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return renderPythonTeacherEmptyState({
      title: 'Выберите ученика',
      message: 'После выбора здесь появятся его текущая тема, прогресс и карточки для разбора.',
    });
  }

  return (
    <div className={`python-learning-shell python-learning-shell--refined ${role === 'student' ? 'python-learning-shell--student' : 'python-learning-shell--teacher'} space-y-4 md:space-y-5 animate-fadeIn`}>
      <div className="python-learning-overview-panel python-learning-overview-panel--refined">
        <div className="python-learning-overview-panel__glow" aria-hidden="true" />
        <div className="python-learning-overview-panel__content">
          <header className="python-learning-overview-header">
            <div className="python-learning-overview-heading">
              <span className="python-learning-overview-heading__icon" aria-hidden="true"><Sparkles size={19} /></span>
              <div className="min-w-0">
                <div className="python-learning-eyebrow">{role === 'teacher' ? 'Прогресс ученика' : 'Персональный трек Python'}</div>
                <h2 className="python-learning-title">Изучение Python</h2>
                <p className="python-learning-subtitle">Темы курса и подготовка к заданиям ЕГЭ — в одном понятном маршруте.</p>
              </div>
            </div>
            <div className="python-learning-score-summary">
              <div
                className="python-learning-score-ring"
                style={{ '--python-score': `${Math.max(0, Math.min(100, Number(totalMastery) || 0))}%` }}
                role="progressbar"
                aria-label={role === 'teacher' ? 'Общий прогресс ученика по Python' : 'Общий прогресс изучения Python'}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={Math.round(Number(totalMastery) || 0)}
              >
                <div className="python-learning-score-ring__inner">
                  <span>{totalMasteryLabel}</span><small>%</small>
                </div>
              </div>
              <div>
                <span>Общий прогресс</span>
                <strong>{`${masteredTopicsCount} из ${taskList.length}`}</strong>
                <small>тем выполнено на 85%+</small>
              </div>
            </div>
          </header>

          <div className="python-learning-dashboard">
            <button
              type="button"
              onClick={openFocusTask}
              disabled={!focusTask}
              className="python-learning-focus-next"
              aria-label={focusTask
                ? (role === 'teacher'
                    ? `Открыть прогресс ученика по теме ${focusTask.title}`
                    : `${focusTaskProgress > 0 ? 'Продолжить' : 'Начать'} тему ${focusTask.title}`)
                : 'Темы Python пока недоступны'}
            >
              <span className="python-learning-focus-next__orb" aria-hidden="true" />
              <div className="python-learning-focus-next__top">
                <span><Target size={13} /> {role === 'teacher' ? 'Тема для разбора' : 'Следующий шаг'}</span>
                {focusTask ? <strong>{`${focusTaskProgress}%`}</strong> : null}
              </div>
              <div className="python-learning-focus-next__body">
                <small>{focusTaskSection?.title || 'Python'}</small>
                <h3>{focusTask?.title || 'Новые темы скоро появятся'}</h3>
                {focusTask ? (
                  <p>{`Тема №${getTaskDisplayNumber(focusTask)} · ${role === 'teacher'
                    ? 'откройте карточку прогресса'
                    : (focusTaskProgress > 0 ? 'продолжим с текущего места' : 'начните с первой карточки')}`}</p>
                ) : null}
              </div>
              {focusTask ? (
                <div className="python-learning-focus-next__footer">
                  <div className="python-learning-focus-next__rail" aria-hidden="true">
                    <span style={{ width: `${focusTaskProgress}%` }} />
                  </div>
                  <span className="python-learning-focus-next__action">
                    {role === 'teacher' ? 'Открыть разбор' : (focusTaskProgress > 0 ? 'Продолжить тему' : 'Начать тему')} <ArrowUpRight size={15} />
                  </span>
                </div>
              ) : null}
            </button>

            <aside className="python-learning-progress-snapshot" aria-label={role === 'teacher' ? 'Сводка по прогрессу ученика' : 'Сводка по курсу Python'}>
              <div className="python-learning-progress-snapshot__header">
                <div>
                  <span>Статус тем</span>
                  <strong>{`${taskList.length} тем`}</strong>
                </div>
                <BarChart2 size={18} />
              </div>
              <div className="python-learning-progress-snapshot__stats">
                <div>
                  <span className="python-learning-progress-snapshot__icon python-learning-progress-snapshot__icon--done"><CheckCircle size={15} /></span>
                  <span><small>Выполнено 85%+</small><strong>{masteredTopicsCount}</strong></span>
                </div>
                <div>
                  <span className="python-learning-progress-snapshot__icon python-learning-progress-snapshot__icon--active"><RefreshCcw size={14} /></span>
                  <span><small>В процессе</small><strong>{inProgressTopicsCount}</strong></span>
                </div>
                <div>
                  <span className="python-learning-progress-snapshot__icon python-learning-progress-snapshot__icon--next"><Target size={14} /></span>
                  <span><small>Не начато</small><strong>{notStartedTopicsCount}</strong></span>
                </div>
              </div>
            </aside>
          </div>

          <div className="python-learning-student-picker">{renderStudentPicker()}</div>

          <div className="python-learning-section-picker" role="tablist" aria-label="Разделы Python">
            {sectionTabs.map((section, sectionIdx) => {
                const sectionUi = PYTHON_TASK_SECTION_UI[section.id] || PYTHON_TASK_SECTION_UI.topics;
                const SectionIcon = sectionUi.icon || Sparkles;
                const tasksInSection = Array.isArray(section.tasks) ? section.tasks : [];
                const sectionAvg = tasksInSection.length
                  ? Math.round(tasksInSection.reduce((sum, task) => sum + Number(progressMap[task.id] || 0), 0) / tasksInSection.length)
                  : 0;
                const isActive = section.id === activeTaskSection?.id;
                return (
                  <button
                    key={`overview-${section.id}`}
                    id={`python-section-tab-${section.id}`}
                    type="button"
                    role="tab"
                    onClick={() => setActiveTaskSectionId(section.id)}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                      event.preventDefault();
                      const direction = event.key === 'ArrowRight' ? 1 : -1;
                      const nextIndex = (sectionIdx + direction + sectionTabs.length) % sectionTabs.length;
                      const nextSection = sectionTabs[nextIndex];
                      if (!nextSection) return;
                      setActiveTaskSectionId(nextSection.id);
                      if (typeof requestAnimationFrame === 'function') {
                        requestAnimationFrame(() => document.getElementById(`python-section-tab-${nextSection.id}`)?.focus());
                      }
                    }}
                    aria-selected={isActive}
                    aria-controls={isActive ? `python-section-panel-${section.id}` : undefined}
                    tabIndex={isActive ? 0 : -1}
                    data-active={isActive ? 'true' : 'false'}
                    data-section={section.id}
                    style={{ '--python-overview-i': `${sectionIdx}` }}
                    className="python-learning-overview-card"
                  >
                    <span className="python-learning-overview-card__icon"><SectionIcon size={17} /></span>
                    <span className="python-learning-overview-card__copy">
                      <small>{sectionUi.badge}</small>
                      <strong>{section.title}</strong>
                      <span>{`${tasksInSection.length} тем · ${sectionAvg}%`}</span>
                    </span>
                    <span className="python-learning-overview-card__state" aria-hidden="true">
                      {isActive ? <CheckCircle size={15} /> : <ArrowUpRight size={15} />}
                    </span>
                    <span className="python-learning-overview-card__progress" aria-hidden="true">
                      <span style={{ width: `${Math.max(0, Math.min(100, Number(sectionAvg) || 0))}%` }} />
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
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

      {role === 'student' && (
        <div className="md:hidden">
          <div className="mobile-topic-path-card rounded-3xl border border-purple-200/80 bg-white/85 p-3 shadow-[0_10px_24px_rgba(99,102,241,0.12)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">Путь по темам Python</h3>
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-semibold text-purple-700">
                {`Средний: ${totalMasteryLabel}%`}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">Открывай темы по очереди и закрепляй прогресс.</div>
            <div className="mt-3">
              <div
                ref={mobilePythonPathCanvasRef}
                className="mobile-topic-path-canvas relative overflow-visible rounded-2xl border border-purple-100/80 bg-gradient-to-b from-white/95 via-purple-50/60 to-fuchsia-50/45 px-1.5 py-2"
                style={{ height: `${mobilePythonPathLayout.height}px` }}
              >
                <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
                  <svg
                    className="h-full w-full"
                    viewBox={`0 0 ${mobilePythonPathLayout.width} ${mobilePythonPathLayout.height}`}
                    preserveAspectRatio="none"
                  >
                    {mobilePythonPathLayout.curves.map((curve, curveIdx) => (
                      <path
                        key={`mobile-python-curve-${curve.id}`}
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
                {mobilePythonPathLayout.nodes.map((node) => {
                  const dashOffset = mobilePythonPathLayout.circumference - (node.val / 100) * mobilePythonPathLayout.circumference;
                  const isSelected = String(activeTask?.id) === String(node.task.id);
                  const isMastered = node.val >= 85;
                  const isStable = node.val >= 60 && node.val < 85;
                  const isWarmingUp = node.val >= 40 && node.val < 60;
                  const ringGlow = isMastered
                    ? 'rgba(139,92,246,0.36)'
                    : (isStable ? 'rgba(192,38,211,0.34)' : (isWarmingUp ? 'rgba(124,58,237,0.32)' : 'rgba(148,163,184,0.26)'));
                  const progressAngle = Math.max(0, Math.min(360, Number(node.val || 0) * 3.6));
                  const statusLabel = isMastered
                    ? 'Выполнено 85%+'
                    : (isStable ? 'В темпе' : (isWarmingUp ? 'Практика' : 'Фокус'));
                  const statusTone = isMastered
                    ? 'border-purple-200 bg-purple-50 text-purple-700'
                    : (isStable
                        ? 'border-violet-200 bg-violet-50 text-violet-700'
                        : (isWarmingUp
                            ? 'border-purple-200 bg-purple-50 text-fuchsia-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'));
                  return (
                    <button
                      key={`mobile-python-path-${node.task.id}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveQuestionIndex(null);
                        setActiveSubsectionId(null);
                        setActiveTask(node.task);
                      }}
                      className={`mobile-path-node group absolute z-10 rounded-2xl bg-transparent px-1 transition-transform ${
                        isSelected ? 'mobile-path-node--selected scale-[1.03]' : ''
                      }`}
                      style={{
                        left: `${node.centerX}px`,
                        top: `${node.top}px`,
                        width: `${mobilePythonPathLayout.nodeWidth}px`,
                        transform: isSelected ? 'translateX(-50%) scale(1.03)' : 'translateX(-50%)',
                        '--ring-accent': node.ringColor,
                        '--ring-glow': ringGlow,
                        '--progress-angle': `${progressAngle}deg`,
                        '--ring-size': `${mobilePythonPathLayout.ringSize}px`,
                        '--ring-stroke': `${mobilePythonPathLayout.strokeWidth}px`,
                        '--node-delay': `${Math.max(0, node.idx % 8) * 60}ms`
                      }}
                      aria-label={`Открыть тему ${node.task.title}. Выполнено ${node.val}%`}
                    >
                      <div
                        className={`mobile-topic-ring-shell relative mx-auto ${
                          isSelected ? 'mobile-topic-ring-shell--selected' : ''
                        } ${isMastered ? 'mobile-topic-ring-shell--mastered' : ''}`}
                        style={{ height: `${mobilePythonPathLayout.ringSize}px`, width: `${mobilePythonPathLayout.ringSize}px` }}
                      >
                        <div className="mobile-topic-glow absolute inset-[-8px] rounded-full" />
                        <div className="mobile-topic-orbit" />
                        <div className="mobile-topic-conic" />
                        <svg
                          className="relative z-[4] h-full w-full -rotate-90"
                          viewBox={`0 0 ${mobilePythonPathLayout.ringSize} ${mobilePythonPathLayout.ringSize}`}
                          aria-hidden="true"
                        >
                          <circle
                            cx={mobilePythonPathLayout.ringSize / 2}
                            cy={mobilePythonPathLayout.ringSize / 2}
                            r={mobilePythonPathLayout.radius}
                            fill="none"
                            stroke="var(--mobile-ring-track, #d7dee8)"
                            strokeWidth={mobilePythonPathLayout.strokeWidth}
                          />
                          <circle
                            cx={mobilePythonPathLayout.ringSize / 2}
                            cy={mobilePythonPathLayout.ringSize / 2}
                            r={mobilePythonPathLayout.radius}
                            fill="none"
                            stroke={node.ringColor}
                            strokeWidth={mobilePythonPathLayout.strokeWidth}
                            strokeLinecap="round"
                            strokeDasharray={mobilePythonPathLayout.circumference}
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

      <div className="space-y-4 md:space-y-6">
        {sectionTabs
          .filter((section) => section.id === activeTaskSection?.id)
          .map((section) => {
            const sectionIdx = sectionTabs.findIndex((item) => item.id === section.id);
            const sectionUi = PYTHON_TASK_SECTION_UI[section.id] || PYTHON_TASK_SECTION_UI.topics;
            const SectionIcon = sectionUi.icon || BookOpen;
            const sectionTasks = Array.isArray(section.tasks) ? section.tasks : [];
            const sectionAvg = sectionTasks.length
              ? Math.round(sectionTasks.reduce((sum, task) => sum + Number(progressMap[task.id] || 0), 0) / sectionTasks.length)
              : 0;
            return (
              <section
                key={section.id}
                id={`python-section-panel-${section.id}`}
                role="tabpanel"
                aria-labelledby={`python-section-tab-${section.id}`}
              >
                <div
                  style={{ '--python-section-i': `${sectionIdx}` }}
                  className={`python-learning-section-shell relative overflow-hidden rounded-3xl border p-4 md:p-5 shadow-[0_18px_36px_rgba(15,23,42,0.12)] ${sectionUi.shellClass}`}
                >
                  <div className={`python-learning-section-shell__wash pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r opacity-30 ${sectionUi.headerClass || 'from-slate-200/30 via-white/20 to-slate-200/30'}`} />
                  <div className="relative z-10">
                    <div className="python-learning-section-header flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={`python-learning-section-icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${sectionUi.chipClass}`}>
                          <SectionIcon size={18} />
                        </span>
                        <div className="min-w-0 space-y-1">
                          <div className="python-learning-section-badge text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{sectionUi.badge || 'Раздел'}</div>
                          <h3 className="python-learning-section-title text-lg md:text-xl font-black text-slate-900">{section.title}</h3>
                          {section.description && (
                            <p className="text-xs md:text-sm text-slate-600">{section.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {role === 'teacher' && (
                          <button
                            type="button"
                            onClick={() => startCreateTaskCard(section.id)}
                            className="python-learning-add-card-btn inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-white/90 px-2.5 py-1 text-[11px] font-bold text-purple-700 transition hover:border-purple-300 hover:bg-purple-50"
                          >
                            <Plus size={13} />
                            Добавить карточку
                          </button>
                        )}
                        <span className="python-learning-section-counter inline-flex items-center rounded-full border border-white/85 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                          {`${sectionTasks.length} карточек`}
                        </span>
                        <span className="python-learning-section-counter inline-flex items-center rounded-full border border-white/85 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                          {`Средний: ${sectionAvg}%`}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4">
                      {sectionTasks.length > 0 ? (
                        <div className="python-learning-task-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 stagger-children">
                          {sectionTasks.map((task, idx) => renderTaskCard(task, idx, section))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300/80 bg-white/75 px-4 py-5 text-sm font-medium text-slate-500">
                          {role === 'teacher'
                            ? 'Пока нет карточек. Добавьте первую задачу в этом разделе ниже.'
                            : 'Пока здесь нет карточек. Скоро появятся новые задания.'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
      </div>

      {role === 'teacher' && (
        <div className="md:hidden grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setShowTeacherTaskToolsMobile((prev) => {
                const next = !prev;
                if (next) setShowTeacherTheoryToolsMobile(false);
                return next;
              });
            }}
            className={`python-mobile-toggle rounded-xl border px-3 py-2 text-xs font-semibold ${
              showTeacherTaskToolsMobile
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {showTeacherTaskToolsMobile ? 'Скрыть задачи' : 'Задачи Python'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowTeacherTheoryToolsMobile((prev) => {
                const next = !prev;
                if (next) setShowTeacherTaskToolsMobile(false);
                return next;
              });
            }}
            className={`python-mobile-toggle rounded-xl border px-3 py-2 text-xs font-semibold ${
              showTeacherTheoryToolsMobile
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {showTeacherTheoryToolsMobile ? 'Скрыть теорию' : 'Теория'}
          </button>
        </div>
      )}

      {role === 'teacher' && (
        <div ref={teacherTaskToolsRef}>
          <Card className={`python-mobile-panel python-mobile-panel--task space-y-4 border-purple-200/60 bg-gradient-to-br from-white via-white to-purple-50/40 ${showTeacherTaskToolsMobile ? 'python-mobile-panel--open' : 'python-mobile-panel--closed'}`}>
          <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200">
                  Конструктор Python
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">
                    {editingQuestionId ? 'Редактирование задачи' : 'Добавление задачи'}
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm text-slate-300">
                    Сначала создайте или выберите карточку, затем соберите подразделы и только после этого добавляйте задачу с тестами.
                  </p>
                </div>
              </div>
              <div className="w-full xl:w-[360px]">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Активная карточка
                </div>
                <select
                  value={manageTaskNumber || ''}
                  onChange={(e) => setManageTaskNumber(Number(e.target.value))}
                  className="w-full rounded-xl border border-purple-100 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-purple-500"
                >
                  {taskSections.map((section) => (
                    <optgroup key={`manage-section-${section.id}`} label={section.title}>
                      {section.tasks.map((task) => (
                        <option key={task.id} value={task.number}>
                          {getTaskDisplayNumber(task)} · {task.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-purple-200/20 bg-gradient-to-br from-purple-500/10 via-slate-950/20 to-violet-500/8 p-4 md:p-5 space-y-4 shadow-[0_18px_36px_rgba(88,28,135,0.18)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200">Шаг 1</div>
                <h4 className="mt-1 text-lg font-black text-white">Карточка</h4>
                <p className="mt-1 max-w-2xl text-sm text-slate-300">
                  Здесь создается сама карточка темы. Это контейнер, внутри которого потом будут подразделы и задачи.
                </p>
              </div>
              {isEditingCard && (
                <span className="rounded-full border border-purple-300/30 bg-purple-400/10 px-3 py-1 text-[11px] font-semibold text-purple-100">
                  {`Редактирование карточки №${editingCardNumber}`}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px_220px] gap-2">
              <input
                type="text"
                value={cardTitle}
                onChange={(event) => setCardTitle(event.target.value)}
                placeholder="Название карточки"
                className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
              />
              <input
                type="text"
                value={cardDisplayNumber}
                onChange={(event) => setCardDisplayNumber(event.target.value)}
                placeholder="Номер отображения (например 9.1)"
                className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
              />
              <select
                value={cardSectionId}
                onChange={(event) => {
                  const nextSectionId = normalizePythonTaskSectionId(event.target.value);
                  setCardSectionId(nextSectionId);
                  if (nextSectionId !== 'topics') {
                    setCardShowInPath(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
              >
                <option value="topics">Темы Python</option>
                <option value="exam-prep">Подготовка к заданиям</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={cardSectionId === 'topics' ? cardShowInPath : false}
                  onChange={(event) => setCardShowInPath(Boolean(event.target.checked))}
                  disabled={cardSectionId !== 'topics'}
                  className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                Показывать карточку в пути тем
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {isEditingCard && (
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={cancelEditTaskCard}
                    disabled={cardSaving}
                  >
                    Отменить
                  </Button>
                )}
                <Button type="button" onClick={handleSaveTaskCard} disabled={cardSaving}>
                  {cardSaving
                    ? 'Сохранение...'
                    : (isEditingCard ? 'Сохранить карточку' : 'Добавить карточку')}
                </Button>
              </div>
            </div>
            {cardError && <div className="text-xs text-red-500">{cardError}</div>}
          </div>

          <div className="rounded-3xl border border-violet-200/20 bg-gradient-to-br from-violet-500/10 via-slate-950/20 to-fuchsia-500/8 p-4 md:p-5 space-y-4 shadow-[0_18px_36px_rgba(76,29,149,0.18)]">
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200">Шаг 2</div>
              <h4 className="text-lg font-black text-white">Подразделы карточки</h4>
              <div className="text-sm text-slate-300">Подразделы помогают разбить одну карточку на понятные группы задач: например, “Генераторы”, “Списки”, “Строки”.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {manageSubsections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-violet-300/20 bg-slate-950/20 px-3 py-3 text-sm text-slate-300">
                  Пока нет подразделов. Можно начать с задач без подраздела или сразу добавить первую группу ниже.
                </div>
              ) : (
                manageSubsections.map((subsection) => (
                  <div key={subsection.id} className="inline-flex items-center gap-2 rounded-xl border border-purple-100 bg-purple-50/70 px-3 py-2 text-sm text-slate-700">
                    <button
                      type="button"
                      onClick={() => setActiveManageSubsection(subsection.id)}
                      className={`font-semibold ${selectedSubsectionId === subsection.id ? 'text-purple-700' : 'text-slate-700'}`}
                    >
                      {subsection.title}
                    </button>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-purple-600">
                      {subsection.count}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEditSubsection(subsection)}
                      className="text-slate-500 hover:text-purple-600"
                      title="Переименовать подраздел"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSubsection(subsection)}
                      disabled={subsectionSaving}
                      className="text-rose-500 hover:text-rose-600 disabled:opacity-60"
                      title="Удалить подраздел"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                type="text"
                value={editingSubsectionId ? editingSubsectionTitle : newSubsectionTitle}
                onChange={(e) => {
                  const value = e.target.value;
                  if (editingSubsectionId) setEditingSubsectionTitle(value);
                  else setNewSubsectionTitle(value);
                }}
                placeholder="Например: Генераторы"
                className="px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
              />
              <div className="flex flex-wrap gap-2">
                {editingSubsectionId && (
                  <Button variant="secondary" type="button" onClick={cancelEditSubsection} disabled={subsectionSaving}>
                    Отменить
                  </Button>
                )}
                <Button type="button" onClick={handleSaveSubsection} disabled={subsectionSaving}>
                  {subsectionSaving ? 'Сохранение...' : (editingSubsectionId ? 'Сохранить подраздел' : 'Добавить подраздел')}
                </Button>
              </div>
            </div>
            {subsectionError && <div className="text-xs text-red-500">{subsectionError}</div>}
          </div>
          <div className="rounded-3xl border border-violet-200/20 bg-gradient-to-br from-violet-500/8 via-slate-950/20 to-fuchsia-500/8 p-4 md:p-5 space-y-4 shadow-[0_18px_36px_rgba(88,28,135,0.18)]">
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200">Шаг 3</div>
              <h4 className="text-lg font-black text-white">{editingQuestionId ? 'Редактирование задачи' : 'Задача внутри карточки'}</h4>
              <div className="text-sm text-slate-300">
                Здесь создается отдельная задача: название, условие, стартовый код, привязка к подразделу и тесты для проверки.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Короткое название задачи"
                className="md:col-span-1 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
              />
              <textarea
                value={newTaskPrompt}
                onChange={(e) => setNewTaskPrompt(e.target.value)}
                placeholder="Полное условие задачи"
                className="md:col-span-2 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none min-h-[96px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Стартовый код</label>
                <textarea
                  value={newStarterCode}
                  onChange={(e) => setNewStarterCode(e.target.value)}
                  placeholder="Например: print('Hello')"
                  className="w-full px-4 py-2 rounded-xl bg-gray-900 text-gray-100 font-mono text-sm border border-gray-800 focus:border-purple-400 outline-none min-h-[140px]"
                  spellCheck={false}
                />
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/25 p-3">
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Подраздел задачи</label>
                <select
                  value={selectedSubsectionId}
                  onChange={(e) => setActiveManageSubsection(e.target.value || PYTHON_DEFAULT_SUBSECTION_ID)}
                  className="w-full px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
                >
                  <option value={PYTHON_DEFAULT_SUBSECTION_ID}>Без подраздела</option>
                  {manageSubsections.map((subsection) => (
                    <option key={subsection.id} value={subsection.id}>
                      {subsection.title}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-gray-500">
                  Ученик увидит эти группы внутри карточки и сможет выбирать задачи более осмысленно.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/25 p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase">Тесты задачи</div>
                  <div className="mt-1 text-xs text-slate-400">Каждый тест состоит из входных данных и ожидаемого вывода.</div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <label className="cursor-pointer text-purple-600 hover:text-purple-700">
                    Загрузить из файла
                    <input
                      type="file"
                      accept=".json,.txt"
                      className="hidden"
                      onChange={(e) => handleTestsFileUpload(e.target.files?.[0])}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewTests((prev) => [...prev, { input: '', output: '' }])}
                    className="text-purple-600 hover:text-purple-700"
                  >
                    Добавить тест
                  </button>
                </div>
              </div>
              {testsFileName && (
                <div className="text-[11px] text-gray-400">Файл: {testsFileName}</div>
              )}
              <div className="space-y-2">
                {newTests.map((test, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <textarea
                      value={test.input}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewTests((prev) => prev.map((item, i) => (i === idx ? { ...item, input: value } : item)));
                      }}
                      placeholder="Входные данные"
                      className="px-3 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none min-h-[60px]"
                    />
                    <div className="relative">
                      <textarea
                        value={test.output}
                        onChange={(e) => {
                          const value = e.target.value;
                          setNewTests((prev) => prev.map((item, i) => (i === idx ? { ...item, output: value } : item)));
                        }}
                        placeholder="Ожидаемый вывод"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none min-h-[60px]"
                      />
                      {newTests.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewTests((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-600"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-2">
              {questionError && <span className="text-xs text-red-500">{questionError}</span>}
              <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {editingQuestionId && (
                  <Button variant="secondary" onClick={cancelEditPythonTask} disabled={questionSaving} className="w-full sm:w-auto">
                    Отменить
                  </Button>
                )}
                <Button onClick={handleSavePythonTask} disabled={questionSaving} className="w-full sm:w-auto">
                  {questionSaving ? 'Сохранение...' : (editingQuestionId ? 'Сохранить' : 'Добавить задачу')}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/20 p-3.5 space-y-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Уже добавленные задачи</div>
                <div className="mt-1 text-xs text-slate-400">Быстрый список всего, что уже лежит в выбранной карточке.</div>
              </div>
              {manageQuestions.length === 0 ? (
                <div className="text-sm text-gray-500">Пока нет задач для выбранной темы.</div>
              ) : (
                manageQuestionGroups.map((group) => (
                  <div key={`manage-group-${group.id}`} className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                      <span>{group.title}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-purple-600">{group.count}</span>
                    </div>
                    {group.items.map((item) => {
                      const q = item.question;
                      return (
                        <div key={q.id || item.questionIndex} className="p-3 rounded-xl border border-purple-100 bg-white/85 flex items-start justify-between gap-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{q.title || q.question || `Задача ${item.globalNumber}`}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                              <span>{`Задача ${item.localNumber} в подразделе`}</span>
                              <span>{`Тестов: ${Array.isArray(q.tests) ? q.tests.length : (q.answer ? 1 : 0)}`}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditPythonTask(q)}
                              className="p-2 rounded-lg text-gray-500 hover:text-purple-600 hover:bg-purple-50"
                              title="Редактировать"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePythonQuestion(manageTaskNumber, q.id)}
                              className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                              title="Удалить"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
          </Card>
        </div>
      )}

      {role === 'teacher' && (
        <Card className={`python-mobile-panel python-mobile-panel--theory space-y-4 border-slate-200 bg-white/90 ${showTeacherTheoryToolsMobile ? 'python-mobile-panel--open' : 'python-mobile-panel--closed'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Теория темы</h3>
              <p className="text-xs text-gray-500">Текст, Google Docs или видеоразбор с записью голоса и действий в редакторе</p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Подраздел теории
            </div>
            <select
              value={theorySubsectionId}
              onChange={(event) => setActiveManageSubsection(event.target.value)}
              disabled={theorySaving}
              className="w-full rounded-xl border border-purple-100 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-purple-500"
            >
              {manageTheorySubsections.map((section) => (
                <option key={`theory-subsection-${section.id}`} value={section.id}>
                  {section.isDefault ? 'Без подраздела (общая теория)' : section.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'text', label: 'Текст' },
              { id: 'gdoc', label: 'Google Docs' },
              { id: THEORY_RECORDING_TYPE, label: 'Видеоразбор' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTheoryType(item.id)}
                className={`python-theory-type-chip px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  theoryType === item.id
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-purple-100 hover:border-purple-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div
            key={`theory-stage-${theoryType}-${manageTaskNumber}-${theorySubsectionId}`}
            className="python-theory-editor-stage"
          >
            {theoryType === 'text' ? (
              <textarea
                value={theoryText}
                onChange={(e) => setTheoryText(e.target.value)}
                placeholder="Вставьте текст теории..."
                className="w-full min-h-[160px] px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
              />
            ) : theoryType === 'gdoc' ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={theoryUrl}
                  onChange={(e) => setTheoryUrl(e.target.value)}
                  placeholder="Вставьте ссылку на документ или iframe Google Docs"
                  className="w-full px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
                />
                <p className="hidden md:block text-xs text-gray-400">
                  Используйте ссылку для встраивания из Google Docs (Файл → Опубликовать в интернете → Встроить).
                </p>
                <p className="text-[11px] text-gray-400">
                  Подойдут и обычные ссылки на документ (view/edit) — они встроятся через preview. Для оглавления используйте «Открыть полностью».
                </p>
              </div>
            ) : (
              <TheoryRecordingEditor
                key={`theory-recording-editor-${manageTaskNumber}-${theorySubsectionId}-${savedTheoryRecording?.updatedAt || savedTheoryRecording?.createdAt || 'new'}`}
                initialRecording={theoryType === THEORY_RECORDING_TYPE ? savedTheoryRecording : null}
                draftStorageKey={buildTheoryRecordingDraftStorageKey(manageTaskNumber, theorySubsectionId)}
                onDraftChange={setTheoryRecordingDraft}
                ensurePyodideReady={ensurePyodideReady}
                disabled={theorySaving}
                theme={theme}
                onSave={handleSavePythonTheory}
                onClear={handleClearPythonTheory}
                saveError={theoryError}
                isSaving={theorySaving}
              />
            )}
          </div>

          {theoryType !== THEORY_RECORDING_TYPE && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {theoryError && <span className="text-xs text-red-500">{theoryError}</span>}
              <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Button variant="secondary" onClick={handleClearPythonTheory} disabled={theorySaving} className="w-full sm:w-auto">
                  Очистить текущий тип
                </Button>
                <Button onClick={handleSavePythonTheory} disabled={theorySaving} className="w-full sm:w-auto">
                  {theorySaving ? 'Сохранение...' : 'Сохранить теорию'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {role === 'student' && activeTask && (
        <PythonTestModal
          theme={theme}
          task={activeTask}
          onClose={() => {
            setActiveTask(null);
            setActiveQuestionIndex(null);
            setActiveSubsectionId(null);
          }}
          progress={progressMap}
          studentId={studentId}
          testDb={testsDb}
          initialQuestionIndex={activeQuestionIndex}
          initialSubsectionId={activeSubsectionId}
          onQuestionChange={setActiveQuestionIndex}
          onSubsectionChange={setActiveSubsectionId}
          onStreakSaved={onStreakSaved}
          onXpGain={onXpGain}
          PYTHON_LEVEL_ID={PYTHON_LEVEL_ID}
          ensurePyodideReady={ensurePyodideReady}
          mergeRuntimeErrorText={mergeRuntimeErrorText}
          createPyodideWorker={createPyodideWorker}
          withStudentId={withStudentId}
          isGoogleDocEmbedUrl={isGoogleDocEmbedUrl}
          normalizeOutput={normalizeOutput}
          normalizeOutputForComparison={normalizeOutputForComparison}
          normalizeRuntimeErrorForCheck={normalizeRuntimeErrorForCheck}
          getLocalDayKey={getLocalDayKey}
          normalizeXpTotal={normalizeXpTotal}
          buildGoogleDocFullUrl={buildGoogleDocFullUrl}
          codeSyncRoomId={codeSyncRoomId}
          PYODIDE_RUN_TIMEOUT_MS={PYODIDE_RUN_TIMEOUT_MS}
          ALLOW_MAIN_THREAD_PYTHON_FALLBACK={ALLOW_MAIN_THREAD_PYTHON_FALLBACK}
          onComplete={(taskId, score, options) => {
            onUpdateProgress(taskId, score, options);
            if (studentId) {
              api.getStudentData(studentId)
                .then((data) => setStudentData(normalizeLoadedStudentData(data)))
                .catch(() => {});
            }
          }}
        />
      )}
      {role === 'teacher' && reviewTask && (
        <PythonReviewModal
          theme={theme}
          task={reviewTask}
          onClose={() => setReviewTask(null)}
          studentId={effectiveStudentId}
          testDb={testsDb}
          PYTHON_LEVEL_ID={PYTHON_LEVEL_ID}
          ensurePyodideReady={ensurePyodideReady}
          mergeRuntimeErrorText={mergeRuntimeErrorText}
          createPyodideWorker={createPyodideWorker}
          normalizeOutput={normalizeOutput}
          normalizeOutputForComparison={normalizeOutputForComparison}
          normalizeRuntimeErrorForCheck={normalizeRuntimeErrorForCheck}
          PYODIDE_RUN_TIMEOUT_MS={PYODIDE_RUN_TIMEOUT_MS}
          ALLOW_MAIN_THREAD_PYTHON_FALLBACK={ALLOW_MAIN_THREAD_PYTHON_FALLBACK}
          getLocalDayKey={getLocalDayKey}
          isGoogleDocEmbedUrl={isGoogleDocEmbedUrl}
          buildGoogleDocFullUrl={buildGoogleDocFullUrl}
          codeSyncRoomId={codeSyncRoomId}
          homeworkLessonBasketItems={homeworkLessonBasketItems}
          onAddToHomeworkLessonBasket={(item) => onAddToHomeworkLessonBasket?.({
            ...item,
            studentId: effectiveStudentId,
          })}
        />
      )}
    </div>
  );
};



export default PythonSection;

