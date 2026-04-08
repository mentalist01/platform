import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, BookOpen, FileText, Pencil, PlayCircle, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import MockExamBadges, { MockExamBadgeSticker } from './MockExamBadges';
import MockExamEditorModal from './MockExamEditorModal';
import MockExamModal from './MockExamModal';
import ProgressReviewModal from './ProgressReviewModal';
import StudentTestModal from './StudentTestModal';
import { Button, Card, ProgressBar } from './ui';
import { normalizeMockExamBadges } from '../utils/mockExamBadges';

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

const ProgressSection = ({
  progress,
  onUpdateProgress,
  theme = '',
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
  getStudentLabel,
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
  const [studentData, setStudentData] = useState({ progress: {}, notes: '', notesByTask: {}, mocks: [] });
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
  const [hoveredMockTaskPoint, setHoveredMockTaskPoint] = useState(null);
  const [mockEditorExam, setMockEditorExam] = useState(null);
  const [activeMockExam, setActiveMockExam] = useState(null);
  const [activeMockAttempt, setActiveMockAttempt] = useState(null);
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
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const mockAttemptStudentId = role === 'student' ? null : effectiveStudentId;
  const prevEffectiveStudentIdRef = useRef(effectiveStudentId);

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
      const answersMap = attempt?.answers && typeof attempt.answers === 'object' ? attempt.answers : {};
      const solvedMap = attempt?.solved && typeof attempt.solved === 'object' ? attempt.solved : {};
      const taskStats = getMockExamTaskKeys(exam).map((taskKey) => {
        const answerCount = getMockAnswerCountForTask(taskKey);
        const attempted = hasMockAnswerValue(answersMap[taskKey], answerCount);
        return {
          taskKey,
          label: formatMockTaskLabel(taskKey, GAME_THEORY_TASK),
          attempted,
          solved: Boolean(solvedMap[String(taskKey)]),
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
      const hasStarted = attemptedCount > 0;
      const isCompleted = totalCount > 0 && solvedCount >= totalCount;

      return {
        examId: exam.id,
        examTitle: exam.title,
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
        updatedAt: typeof attempt?.updatedAt === 'string' ? attempt.updatedAt : '',
        updatedLabel: formatMockUpdatedAt(attempt?.updatedAt),
        actionLabel: isCompleted ? 'Повторить' : hasStarted ? 'Продолжить' : 'Начать',
        taskStats,
      };
    });

    const examStatsById = examStats.reduce((acc, examStat) => {
      acc[examStat.examId] = examStat;
      return acc;
    }, {});

    const startedExams = examStats.filter((examStat) => examStat.hasStarted);
    const completedExams = examStats.filter((examStat) => examStat.isCompleted);
    const inProgressExams = examStats
      .filter((examStat) => examStat.hasStarted && !examStat.isCompleted)
      .sort((left, right) => {
        if (left.progressPercent !== right.progressPercent) return right.progressPercent - left.progressPercent;
        if (left.solvedCount !== right.solvedCount) return right.solvedCount - left.solvedCount;
        return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
      });
    const freshExams = examStats.filter((examStat) => !examStat.hasStarted);
    const repeatCandidates = [...completedExams].sort((left, right) => {
      if (left.secondary !== right.secondary) return left.secondary - right.secondary;
      return compareMockTaskKeys(left.examTitle, right.examTitle);
    });

    const focusExam = inProgressExams[0] || freshExams[0] || repeatCandidates[0] || null;
    const focusMode = focusExam
      ? (focusExam.isCompleted ? 'repeat' : focusExam.hasStarted ? 'continue' : 'start')
      : '';

    const totalTaskCount = examStats.reduce((sum, examStat) => sum + examStat.totalCount, 0);
    const totalAttemptedCount = examStats.reduce((sum, examStat) => sum + examStat.attemptedCount, 0);
    const totalSolvedCount = examStats.reduce((sum, examStat) => sum + examStat.solvedCount, 0);
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
        };
        current.totalCount += 1;
        if (taskStat.attempted) {
          current.attemptedCount += 1;
          if (taskStat.solved) current.solvedCount += 1;
        }
        acc[taskStat.taskKey] = current;
      });
      return acc;
    }, {});

    const taskInsights = Object.values(taskPerformance)
      .filter((taskStat) => taskStat.attemptedCount > 0)
      .map((taskStat) => ({
        ...taskStat,
        accuracyPercent: Math.max(
          0,
          Math.min(100, Math.round((taskStat.solvedCount / taskStat.attemptedCount) * 100))
        ),
      }));

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
      totalExams: examStats.length,
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
      setStudentData({ progress: {}, notes: '', notesByTask: {}, mocks: [] });
      return;
    }
    let cancelled = false;
    api.getStudentData(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setStudentData({
          progress: data?.progress || {},
          notes: data?.notes || '',
          notesByTask: data?.notesByTask && typeof data.notesByTask === 'object' ? data.notesByTask : {},
          mocks: Array.isArray(data?.mocks) ? data.mocks : []
        });
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
      { min: 55, label: 'Сильная половина' },
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
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="w-full min-w-0 sm:min-w-[180px] rounded-xl border border-purple-100 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-purple-500 disabled:opacity-70"
        >
          <option value="" disabled>Выберите ученика</option>
          {studentsList.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
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
      }
      if (mockAccessExamId === examId) closeMockAccessEditor();
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleOpenMockExam = async (exam) => {
    if (!exam) return;
    const requestId = mockAttemptRequestIdRef.current + 1;
    mockAttemptRequestIdRef.current = requestId;
    setActiveMockExam(exam);
    const cachedAttempt = mockAttemptsByExam?.[exam.id];
    setActiveMockAttempt(cachedAttempt && typeof cachedAttempt === 'object' ? cachedAttempt : null);
    if (!effectiveStudentId) return;
    if (!isMockExamAccessible(exam, effectiveStudentId)) {
      setActiveMockAttempt({});
      return;
    }
    try {
      const attempt = await api.getMockAttempt(mockAttemptStudentId, exam.id);
      if (mockAttemptRequestIdRef.current !== requestId) return;
      setActiveMockAttempt(attempt && typeof attempt === 'object' ? attempt : {});
      setMockAttemptsByExam((prev) => ({
        ...prev,
        [exam.id]: attempt && typeof attempt === 'object' ? attempt : {}
      }));
    } catch {
      if (mockAttemptRequestIdRef.current !== requestId) return;
      setActiveMockAttempt({});
    }
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
  }, [GAME_THEORY_TASK, role, studentMockOverview]);

  const renderStudentMockCard = (exam) => {
    if (!exam) return null;
    const stickerSurface = String(theme || '').trim().toLowerCase() === 'dark' ? 'dark' : 'light';
    const examBadges = normalizeMockExamBadges(exam.badges);
    const primaryBadge = examBadges[0] || null;
    const secondaryBadges = examBadges.slice(1);
    const attempt = mockAttemptsByExam?.[exam.id];
    const primary = getPrimaryScoreFromSolved(attempt?.solved);
    const secondary = getSecondaryScoreFromPrimary(primary);
    const examStats = studentMockOverview?.examStatsById?.[exam.id] || {
      primary,
      secondary,
      totalCount: 0,
      attemptedCount: 0,
      solvedCount: 0,
      remainingCount: 0,
      progressPercent: 0,
      hasStarted: false,
      isCompleted: false,
      actionLabel: 'Начать',
      updatedLabel: '',
    };
    const isFocusExam = studentMockOverview?.focusExamId === exam.id;
    const isBestExam = studentMockOverview?.bestExamId === exam.id;
    const borderClass = isFocusExam
      ? 'border-purple-300/80'
      : examStats.isCompleted
        ? 'border-emerald-200/80'
        : 'border-slate-200/70';
    const statusLabel = examStats.isCompleted
      ? 'Все задания закрыты'
      : examStats.hasStarted
        ? `${examStats.remainingCount} осталось`
        : 'Ещё не начат';

    return (
      <div
        key={exam.id}
        role="button"
        tabIndex={0}
        onClick={() => handleOpenMockExam(exam)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleOpenMockExam(exam);
          }
        }}
        className={`surface-card group relative overflow-hidden rounded-[30px] border p-0 text-left transition-all duration-300 hover:-translate-y-1 hover:border-purple-300/80 hover:shadow-[0_22px_48px_rgba(79,70,229,0.18)] ${borderClass} cursor-pointer`}
      >
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-purple-500 via-fuchsia-500 to-sky-400 opacity-80" />
        {(isFocusExam || isBestExam) && (
          <div
            className={`pointer-events-none absolute inset-0 ${
              isFocusExam
                ? 'bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.12),transparent_34%)]'
                : 'bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.10),transparent_34%)]'
            }`}
          />
        )}

        <div className="relative grid gap-0 xl:grid-cols-[minmax(0,1fr)_208px]">
          <div className="p-3 md:p-4">
            <div className="flex items-start gap-2.5">
              <div
                className={`mock-action-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] ${
                  isFocusExam
                    ? 'mock-action-icon--focus text-purple-500'
                    : isBestExam
                      ? 'mock-action-icon--best text-emerald-500'
                      : 'text-slate-500'
                }`}
              >
                <BookOpen size={18} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isFocusExam && (
                        <span className="rounded-full border border-purple-200 bg-purple-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-purple-700">
                          Фокус
                        </span>
                      )}
                      {isBestExam && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          Лучший
                        </span>
                      )}
                      {examStats.isCompleted && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          Готово
                        </span>
                      )}
                      {!examStats.isCompleted && examStats.hasStarted && !isFocusExam && (
                        <span className="rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                          В работе
                        </span>
                      )}
                    </div>

                    {secondaryBadges.length > 0 && (
                      <MockExamBadges badges={secondaryBadges} className="pt-0.5" />
                    )}

                    <div>
                      <p className="truncate text-lg font-display font-bold leading-tight text-gray-900 md:text-xl">{exam.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500 md:text-[11px]">
                        <span className="mock-meta-pill mock-meta-pill--score rounded-full px-2.5 py-[5px]">
                          Баллы: <span className="font-semibold text-purple-700">{examStats.secondary}</span>
                          <span className="text-gray-400">{` (${examStats.primary} перв.)`}</span>
                        </span>
                        <span className="mock-meta-pill rounded-full px-2.5 py-[5px]">
                          {`${examStats.solvedCount}/${examStats.totalCount} решено`}
                        </span>
                        <span className="mock-meta-pill rounded-full px-2.5 py-[5px]">
                          {`${examStats.attemptedCount}/${examStats.totalCount} начато`}
                        </span>
                        {examStats.updatedLabel && (
                          <span className="mock-meta-pill rounded-full px-2.5 py-[5px]">
                            {`Обновлён ${examStats.updatedLabel}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {primaryBadge && (
                    <div className="flex justify-start xl:justify-end xl:pl-4">
                      <MockExamBadgeSticker badge={primaryBadge} size="md" surface={stickerSurface} />
                    </div>
                  )}
                </div>

                <div className="mt-3 mock-progress-shell rounded-[20px] p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>Готовность пробника</span>
                    <span>{`${examStats.progressPercent}%`}</span>
                  </div>
                  <ProgressBar value={examStats.progressPercent} />
                </div>
              </div>
            </div>
          </div>

          <div className="mock-action-dock flex flex-col justify-between gap-2.5 border-t p-3 md:p-4 xl:border-l xl:border-t-0">
            <div className="mock-score-box rounded-2xl px-3 py-2.5 text-center">
              <div className="font-display text-[2rem] font-bold leading-none text-gray-900">{examStats.secondary}</div>
              <div className="mt-1 text-xs text-gray-500">{`${examStats.primary} перв.`}</div>
            </div>

            <div className="space-y-1.5">
              <Button
                variant={examStats.isCompleted ? 'secondary' : 'primary'}
                onClick={() => handleOpenMockExam(exam)}
                className="w-full py-2 sm:py-2 shadow-lg shadow-purple-300/25"
              >
                <PlayCircle size={16} />
                {examStats.actionLabel}
              </Button>
              <div className="mock-status-pill rounded-full px-3 py-1.5 text-center text-xs text-gray-500">
                {statusLabel}
              </div>
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

    return (
      <div key={exam.id} className="bg-white rounded-xl border p-3 md:p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">{exam.title}</p>
                <p className="text-xs text-gray-500">{accessLabel}</p>
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
            <button
              onClick={() => handleDeleteMockExamDefinition(exam.id)}
              className="p-2 rounded-lg text-red-500 hover:bg-red-50"
            >
              <Trash2 size={16} />
            </button>
            <Button onClick={() => handleOpenMockExam(exam)} className="w-full sm:w-auto">
              Открыть
            </Button>
          </div>
        </div>
        {mockAccessExamId === exam.id && (
          <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4 space-y-3">
            <div className="text-xs font-semibold text-gray-500">Доступ к пробнику</div>
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

  return (
    <div className="space-y-4 md:space-y-6 animate-fadeIn" data-tour="progress">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-3 md:gap-5">
          <div className="flex flex-col gap-3 md:gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2.5 md:space-y-3">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-gray-900">Успеваемость</h2>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {renderStudentPicker()}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-purple-200/80 bg-white/80 p-3 md:p-4 shadow-[0_10px_24px_rgba(99,102,241,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-600 px-2.5 py-1 text-[10px] md:text-xs font-bold uppercase tracking-[0.14em] md:tracking-widest text-white">
                  {getProgressHeadline(totalMasteryRounded)}
                </div>
              </div>
              <div className="text-2xl md:text-3xl font-extrabold text-purple-700 drop-shadow-sm">
                {totalMasteryLabel} {getBallLabel(totalMasteryRounded)}
              </div>
            </div>
            <div className="relative mt-2.5 md:mt-3 h-6 md:h-8 w-full overflow-hidden rounded-full border border-purple-100 bg-white/90">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 shadow-[0_0_18px_rgba(168,85,247,0.45)] transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, Number(totalMastery) || 0))}%` }}
              />
              <div
                key={`sheen-${totalMasteryRounded}`}
                className="absolute inset-0 pointer-events-none bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.6),transparent)] animate-sheen"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-white/85 p-1.5 md:inline-flex md:w-fit md:flex-wrap md:gap-2 md:p-2">
        {sectionTabs.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`inline-flex min-w-0 items-center justify-center gap-1.5 md:gap-2 rounded-xl border px-2 py-2 md:px-4 md:py-2 text-[11px] sm:text-xs md:text-sm font-semibold transition-all ${
                active
                  ? 'border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-200'
                  : 'border-transparent bg-white text-slate-600 hover:border-purple-200 hover:text-purple-700'
              }`}
            >
              <Icon size={14} />
              <span className="truncate sm:hidden">{sectionShortLabels[item.id] || item.label}</span>
              <span className="hidden sm:inline truncate">{item.label}</span>
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
                        ? 'Сильная'
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
                          aria-label={`Открыть тему ${node.task.title}`}
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

          <div className={`${role === 'student' ? 'hidden md:grid' : 'grid'} grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 stagger-children`}>
            {taskList.map((task, idx) => {
              const val = progressMap[task.id] || 0;
              const clickable = role === 'student' || role === 'teacher';
              const cardTone = val >= 85
                ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50/60 via-white to-emerald-50/50'
                : (val >= 60
                    ? 'border-purple-200/90 bg-gradient-to-br from-purple-50/65 via-white to-fuchsia-50/45'
                    : (val >= 40
                        ? 'border-amber-200/90 bg-gradient-to-br from-amber-50/60 via-white to-orange-50/35'
                        : 'border-slate-200/90 bg-gradient-to-br from-white via-slate-50 to-slate-100/70'));
              const statusLabel = val >= 85 ? 'Сильная тема' : (val >= 60 ? 'В работе' : (val >= 40 ? 'Нужна практика' : 'Зона внимания'));
              return (
                <div key={task.id} style={{ '--i': idx }} className="space-y-2">
                  <Card
                    className={`group relative p-3.5 md:p-4 ${cardTone} ${clickable ? 'cursor-pointer' : ''}`}
                    onClick={
                      clickable
                        ? () => {
                            if (role === 'teacher') setReviewTask(task);
                            else {
                              setForceInitialLevelLaunch(false);
                              setActiveLevel(null);
                              setActiveQuestionIndex(null);
                              setActiveTask(task);
                            }
                          }
                        : undefined
                    }
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-lg border border-purple-200 bg-white/90 px-2 py-1 text-[11px] md:text-xs font-bold text-purple-700">
                        №{getTaskDisplayNumber(task)}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-[10px] md:text-xs font-semibold text-slate-600">
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
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
                        <h3 className="font-bold text-[15px] md:text-base leading-snug text-gray-800">{task.title}</h3>
                      )}
                      {role === 'teacher' && editingTaskId !== task.number && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); startEditTaskTitle(task); }}
                          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-purple-600 hover:border-purple-200"
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
                    <div className="mt-2 flex items-center justify-between text-[11px] md:text-xs text-slate-500">
                      <span>
                        <span className="sm:hidden">Тема</span>
                        <span className="hidden sm:inline">Прогресс темы</span>
                      </span>
                      <span className="text-sm md:text-base font-bold text-slate-700">{val}%</span>
                    </div>
                    <ProgressBar value={val} />

                    {role === 'student' && clickable && (
                      <div className="absolute inset-0 hidden md:flex bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center rounded-2xl cursor-pointer backdrop-blur-[2px]">
                        <div className="flex items-center gap-2 text-purple-600 font-bold bg-white px-4 py-2 rounded-full shadow-lg border border-purple-100">
                          <PlayCircle size={20} /> Решать
                        </div>
                      </div>
                    )}
                    {role === 'student' && clickable && (
                      <div className="mt-3 md:hidden text-xs font-semibold text-purple-600">Открыть тему</div>
                    )}
                    {role === 'teacher' && (
                      <div className="mt-3 text-xs font-semibold text-purple-600">Смотреть ответы</div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>

          {role === 'student' && activeTask && (
        <StudentTestModal 
          theme={theme}
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
        <div className="space-y-3 md:space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-gray-800">Заметки учителя</h3>
            <span className="hidden md:inline text-xs text-gray-400">Комментируйте задания кратко</span>
          </div>
          <div className="md:hidden rounded-2xl border border-purple-100/80 bg-white/90 p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-purple-700">
                {`Всего: ${notesCards.length}`}
              </span>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                {`С заметкой: ${notesFilledCount}`}
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
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
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/75 px-4 py-6 text-center text-sm text-slate-500">
              По этим параметрам заметок не найдено.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 md:gap-3 stagger-children">
              {filteredNotesCards.map(({ task, idx, num, note, hasNote }) => (
                <div
                  key={task.id ?? num}
                  style={{ '--i': idx }}
                  className={`rounded-2xl md:rounded-3xl border p-3 md:p-4 flex flex-col gap-2.5 md:gap-3 transition-all duration-200 shadow-sm hover:shadow-md ${
                    hasNote
                      ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50'
                      : 'border-gray-200 bg-gradient-to-br from-white via-gray-50 to-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-start gap-2.5">
                      <div
                        className={`w-9 h-9 md:w-9 md:h-9 shrink-0 rounded-xl md:rounded-2xl flex items-center justify-center text-sm font-bold ${
                          hasNote ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-white text-gray-500 border border-gray-200'
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
                        className={`w-full min-h-[92px] md:min-h-[70px] text-[13px] md:text-xs px-3 py-2.5 rounded-2xl border outline-none resize-none transition-colors ${
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
        <div className="space-y-4 md:space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Пробники для решения</h3>
              <p className="hidden md:block text-xs text-gray-500">Примерно такое будет на экзамене.</p>
            </div>
          </div>

          {mockExamsError && <div className="text-xs text-red-500">{mockExamsError}</div>}
          {showStudentMockPreview && mockAttemptsLoading && (
            <div className="text-xs text-gray-400">Обновляем прогресс...</div>
          )}
          {mockExamsLoading ? (
            <Card className="text-sm text-gray-500">Загрузка пробников...</Card>
          ) : (
            <>
              {hasStudentMockPreview && studentMockOverview && (
                <Card className="space-y-3 md:space-y-4">
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="surface-panel rounded-2xl border border-slate-200/60 p-4 shadow-none md:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-purple-200/70 bg-purple-50/80 text-purple-600">
                            <BarChart2 size={18} />
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
                              Общая готовность
                            </div>
                            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                              <div className="font-display text-3xl font-bold text-gray-900">
                                {studentMockOverview.overallProgressPercent}%
                              </div>
                              <div className="text-sm text-gray-500">
                                {`${studentMockOverview.totalSolvedCount}/${studentMockOverview.totalTaskCount} решено`}
                              </div>
                            </div>
                          </div>
                        </div>
                        {studentMockOverview.bestExamId && (
                          <div className="mock-summary-best rounded-2xl px-3 py-2 text-right">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                              Лучший результат
                            </div>
                            <div className="mt-1 text-lg font-display font-bold text-gray-900">
                              {studentMockOverview.bestScore}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mock-summary-track mt-4 rounded-[24px] p-3 md:p-4">
                        <div className="flex items-center justify-between text-[11px] text-gray-400">
                          <span>Все задания в пробниках</span>
                          <span>{`${studentMockOverview.totalAttemptedCount}/${studentMockOverview.totalTaskCount} начато`}</span>
                        </div>
                        <ProgressBar value={studentMockOverview.overallProgressPercent} />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                        <div className="mock-summary-stat rounded-xl px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Начато</div>
                          <div className="mt-1 text-xl font-display font-bold text-gray-900">
                            {`${studentMockOverview.startedExamsCount}/${studentMockOverview.totalExams}`}
                          </div>
                        </div>
                        <div className="mock-summary-stat rounded-xl px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Завершено</div>
                          <div className="mt-1 text-xl font-display font-bold text-gray-900">
                            {`${studentMockOverview.completedExamsCount}/${studentMockOverview.totalExams}`}
                          </div>
                        </div>
                        <div className="mock-summary-stat rounded-xl px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Точность</div>
                          <div className="mt-1 text-xl font-display font-bold text-gray-900">
                            {`${studentMockOverview.accuracyPercent}%`}
                          </div>
                        </div>
                        <div className="mock-summary-stat rounded-xl px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Средний балл</div>
                          <div className="mt-1 text-xl font-display font-bold text-gray-900">
                            {studentMockOverview.hasAnyAttempt ? studentMockOverview.averageSecondaryScore : '—'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="surface-panel rounded-2xl border border-slate-200/60 p-3 shadow-none md:p-4">
                      <div className="mock-focus-card flex h-full min-h-[220px] flex-col justify-between gap-4 rounded-[22px] p-4">
                        <div className="flex items-start gap-3">
                          <div className="mock-focus-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-purple-500">
                            <BookOpen size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">Фокус</div>
                            <div className="mt-2 text-lg font-display font-bold leading-tight text-gray-900">
                              {studentMockOverview.focusTitle || 'Выбери пробник'}
                            </div>
                            <div className="mt-2 text-sm text-gray-500">
                              {studentMockOverview.focusTitle
                                ? studentMockOverview.focusDescription
                                : 'Пробники появятся здесь.'}
                            </div>
                          </div>
                        </div>

                        {studentMockOverview.focusExamId && (
                          <Button
                            onClick={() => {
                              const focusExam = studentVisibleMockExams.find(
                                (exam) => exam.id === studentMockOverview.focusExamId
                              );
                              if (focusExam) handleOpenMockExam(focusExam);
                            }}
                            className="w-full shadow-lg shadow-purple-300/25"
                          >
                            <PlayCircle size={16} />
                            {studentMockOverview.focusActionLabel}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">
                      {role === 'teacher' ? 'Пробники и управление' : 'Список пробников'}
                    </div>
                    {role === 'teacher' && visibleMockExams.length > 0 && (
                      <div className="text-xs text-gray-500">
                        {`${studentVisibleMockExams.length}/${visibleMockExams.length} доступны ученику`}
                      </div>
                    )}
                  </div>
                  {role === 'teacher' && (
                    <div className="flex w-full sm:w-auto flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={newMockTitle}
                        onChange={(e) => setNewMockTitle(e.target.value)}
                        placeholder="Название пробника"
                        className="w-full sm:w-auto px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                      />
                      <Button onClick={handleCreateMockExam} className="w-full sm:w-auto">
                        <Plus size={16}/> Создать
                      </Button>
                    </div>
                  )}
                </div>

                {role === 'teacher' ? (
                  <>
                    {hasStudentMockPreview ? (
                      <div className="space-y-6">
                        {studentVisibleMockExams.map((exam) => renderStudentMockCard(exam))}
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
                ) : (
                  <div className="space-y-6">
                    {studentVisibleMockExams.map((exam) => renderStudentMockCard(exam))}
                  </div>
                )}
              </Card>

              {hasStudentMockPreview && studentMockOverview && (
                <Card className="space-y-3 md:space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/70 bg-white/70 text-slate-600">
                        <BarChart2 size={16} />
                      </div>
                      <span>Статистика по заданиям</span>
                    </div>
                    <span className="rounded-full border border-purple-100 bg-purple-50/80 px-3 py-1 text-xs font-semibold text-purple-700">
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
                        className="relative mt-3"
                        onMouseLeave={() => setHoveredMockTaskPoint(null)}
                      >
                        {hoveredMockTaskPoint && (
                          <div
                            className="mock-task-chart-tooltip pointer-events-none absolute z-10 w-max max-w-[220px] rounded-2xl px-3 py-2 text-xs shadow-lg"
                            style={{
                              left: `${(hoveredMockTaskPoint.x / studentMockTaskChart.width) * 100}%`,
                              top: `${(hoveredMockTaskPoint.y / studentMockTaskChart.height) * 100}%`,
                              transform: 'translate(-50%, calc(-100% - 14px))',
                            }}
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
                              className="rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-xs font-semibold text-gray-700"
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
                              <span
                                key={`weak-${taskStat.taskKey}`}
                                className="rounded-full border border-white/80 bg-white/85 px-3 py-1.5 text-xs font-semibold text-gray-700"
                              >
                                {`№ ${taskStat.label} · ${taskStat.accuracyPercent}% · ${taskStat.solvedCount}/${taskStat.attemptedCount}`}
                              </span>
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

          <div className="space-y-2">
            {(studentData.mocks || []).length === 0 ? (
              <div className="text-gray-500">Истории пробников пока нет.</div>
            ) : (
              studentData.mocks.map((mock) => (
                <div key={mock.id} className="bg-white rounded-xl border p-3 md:p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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

          {activeMockExam && (
            <MockExamModal
              exam={activeMockExam}
              studentId={effectiveStudentId}
              initialAttempt={activeMockAttempt}
              theme={theme}
              MOCK_TASK_NUMBERS={MOCK_TASK_NUMBERS}
              getMockAnswerCountForTask={getMockAnswerCountForTask}
              allowsPartialAnswers={allowsPartialAnswers}
              getPrimaryScoreFromSolved={getPrimaryScoreFromSolved}
              getSecondaryScoreFromPrimary={getSecondaryScoreFromPrimary}
              withStudentId={withStudentId}
              onAttemptSaved={(examId, attempt) => {
                setActiveMockAttempt(attempt);
                setMockAttemptsByExam((prev) => ({ ...prev, [examId]: attempt }));
                onMockAttemptSaved?.(examId, attempt);
              }}
              onClose={() => {
                mockAttemptRequestIdRef.current += 1;
                setActiveMockExam(null);
                setActiveMockAttempt(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};



export default ProgressSection;

