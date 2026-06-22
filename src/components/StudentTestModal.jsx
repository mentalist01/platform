import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import { Check, ChevronLeft, Download, History, ListChecks, PlayCircle, RefreshCcw, X } from 'lucide-react';
import { api } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from '../utils/monacoTheme';
import { getQuestionLabelStyle, normalizeQuestionLabel } from '../utils/questionLabel';
import { Button } from './ui';
const StudentTestModal = ({
  theme = '',
  task,
  onClose,
  onComplete,
  progress,
  studentId,
  testDb,
  initialLevel,
  targetQuestions,
  onLevelSelect,
  initialQuestionIndex,
  onQuestionChange,
  onStreakSaved,
  onXpGain,
  forceInitialLevelLaunch = false,
  LEVELS,
  LEVEL_WEIGHTS,
  GAME_THEORY_TASK,
  PYODIDE_RUN_TIMEOUT_MS,
  ALLOW_MAIN_THREAD_PYTHON_FALLBACK,
  getTaskLevelXpReward,
  getTaskDisplayNumber,
  getAnswerCountForTask,
  getExpectedAnswers,
  allowsPartialAnswers,
  ensurePyodideReady,
  mergeRuntimeErrorText,
  createPyodideWorker,
  buildIdleConsoleText,
  getLocalDayKey,
  normalizeXpTotal,
  parseIdleConsoleInput,
  PY_IDLE_STDIN_HEADER,
  withStudentId,
}) => {
  const monacoTheme = resolveMonacoColorTheme(theme);
  const [stage, setStage] = useState('select_level'); // select_level | testing
  const [level, setLevel] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [questionNumbers, setQuestionNumbers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); // { [idx]: string | { a: string, b: string } }
  const [results, setResults] = useState({}); // { [idx]: boolean }
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedAnswerById, setSolvedAnswerById] = useState({});
  const [answerHistoryById, setAnswerHistoryById] = useState({});
  const [answerHistoryLoading, setAnswerHistoryLoading] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [questionImageStateByKey, setQuestionImageStateByKey] = useState({});
  const [questionCodeById, setQuestionCodeById] = useState({});
  const [questionCodeOpen, setQuestionCodeOpen] = useState(false);
  const [questionCodeLoadingById, setQuestionCodeLoadingById] = useState({});
  const [questionCodeSavingById, setQuestionCodeSavingById] = useState({});
  const [questionCodeErrorById, setQuestionCodeErrorById] = useState({});
  const [questionRunStateById, setQuestionRunStateById] = useState({});
  const autoStartRef = useRef(false);
  const [autoStartFailed, setAutoStartFailed] = useState(false);
  const questionRunnerWorkerRef = useRef(null);
  const questionRunnerPendingRef = useRef(new Map());
  const autoStartLevel = ['basic', 'advanced', 'expert'].includes(initialLevel) ? initialLevel : null;

  const currentMastery = progress[task.id] || 0;
  const selectedLevelXpReward = getTaskLevelXpReward(task?.number, level);
  const selectedLevelXpRewardLabel = selectedLevelXpReward > 0
    ? `+${selectedLevelXpReward.toLocaleString('ru-RU')} XP`
    : '';
  const activeQuestion = questions[currentIndex];
  const activeQuestionId = activeQuestion ? String(activeQuestion?.id ?? currentIndex) : '';

  const getQuestionCodeEntry = (questionId) => {
    const key = String(questionId ?? '').trim();
    const cached = questionCodeById?.[key];
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

  const setQuestionCodeEntry = (questionId, patch) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeById((prev) => {
      const current = prev?.[key] && typeof prev[key] === 'object'
        ? prev[key]
        : { code: '', input: '', updatedAt: '', loaded: false };
      return {
        ...(prev || {}),
        [key]: {
          ...current,
          ...(patch || {}),
          loaded: true,
        },
      };
    });
  };

  const clearQuestionCodeError = (questionId) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeErrorById((prev) => {
      if (!prev?.[key]) return prev;
      const next = { ...(prev || {}) };
      delete next[key];
      return next;
    });
  };

  const setQuestionCodeError = (questionId, message) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeErrorById((prev) => ({ ...(prev || {}), [key]: message || '' }));
  };

  const resolveQuestionRunnerPending = (message) => {
    questionRunnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({ output, error });
    });
    questionRunnerPendingRef.current.clear();
  };

  const disposeQuestionRunnerWorker = (message = '') => {
    if (questionRunnerWorkerRef.current) {
      questionRunnerWorkerRef.current.terminate();
      questionRunnerWorkerRef.current = null;
    }
    if (message) resolveQuestionRunnerPending(message);
  };

  const ensureQuestionRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (questionRunnerWorkerRef.current) return questionRunnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = questionRunnerPendingRef.current.get(data.id);
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
        questionRunnerPendingRef.current.delete(data.id);
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
      worker.onerror = () => disposeQuestionRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposeQuestionRunnerWorker('Ошибка выполнения Python.');
      questionRunnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  const runQuestionCodeMainThread = async (source, inputValue) => {
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

  const runQuestionCode = async (source, inputValue, onProgress = null) => {
    const worker = ensureQuestionRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = questionRunnerPendingRef.current.get(id);
          if (!pending) return;
          questionRunnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error });
          disposeQuestionRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        questionRunnerPendingRef.current.set(id, {
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
    return runQuestionCodeMainThread(source, inputValue);
  };

  const loadQuestionCode = async (questionId, force = false) => {
    if (!studentId || !task?.number || !level) return;
    const key = String(questionId ?? '').trim();
    if (!key) return;
    if (questionCodeLoadingById?.[key]) return;
    const cached = getQuestionCodeEntry(key);
    if (cached.loaded && !force) return;
    setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.getQuestionCode(studentId, task.number, level, key);
      setQuestionCodeEntry(key, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: typeof payload?.input === 'string' ? payload.input : '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      clearQuestionCodeError(key);
    } catch (err) {
      setQuestionCodeError(key, err?.message || err);
    } finally {
      setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: false }));
    }
  };

  const saveQuestionCode = async (questionId) => {
    if (!studentId || !task?.number || !level) return;
    const key = String(questionId ?? '').trim();
    if (!key || questionCodeSavingById?.[key]) return;
    const entry = getQuestionCodeEntry(key);
    setQuestionCodeSavingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.saveQuestionCode(studentId, task.number, level, key, {
        code: entry.code,
        input: entry.input,
      });
      setQuestionCodeEntry(key, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: typeof payload?.input === 'string' ? payload.input : '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      clearQuestionCodeError(key);
    } catch (err) {
      setQuestionCodeError(key, err?.message || err);
    } finally {
      setQuestionCodeSavingById((prev) => ({ ...(prev || {}), [key]: false }));
    }
  };

  const normalizeAnswerHistoryPayload = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
    const normalized = {};
    Object.entries(payload).forEach(([questionId, entries]) => {
      const key = String(questionId ?? '').trim();
      if (!key || !Array.isArray(entries)) return;
      const list = entries
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const submittedAt = typeof entry.submittedAt === 'string' ? entry.submittedAt : '';
          const submittedAtMs = submittedAt ? Date.parse(submittedAt) : Number.NaN;
          if (!Number.isFinite(submittedAtMs)) return null;
          const answers = Array.isArray(entry.answers)
            ? entry.answers.map((value) => String(value ?? ''))
            : (typeof entry.answer !== 'undefined' ? [String(entry.answer ?? '')] : []);
          if (answers.length === 0) return null;
          return {
            id: typeof entry.id === 'string' && entry.id.trim()
              ? entry.id.trim()
              : `${key}:${submittedAt}:${answers.join('|')}`,
            submittedAt: new Date(submittedAtMs).toISOString(),
            correct: entry.correct === true,
            answers,
          };
        })
        .filter(Boolean)
        .sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt));
      if (list.length > 0) normalized[key] = list;
    });
    return normalized;
  };

  const loadAnswerHistory = async (lvlId = level, options = {}) => {
    if (!studentId || !task?.number || !lvlId) return {};
    if (!options?.silent) setAnswerHistoryLoading(true);
    try {
      const payload = await api.getAnswerHistory(studentId, task.number, lvlId);
      const normalized = normalizeAnswerHistoryPayload(payload);
      setAnswerHistoryById(normalized);
      return normalized;
    } finally {
      if (!options?.silent) setAnswerHistoryLoading(false);
    }
  };

  const addLocalAnswerHistoryAttempt = (questionId, answers, correct, submittedAt = new Date().toISOString()) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    const values = (Array.isArray(answers) ? answers : [answers])
      .map((value) => String(value ?? ''));
    if (values.every((value) => !value.trim())) return;
    setAnswerHistoryById((prev) => {
      const current = Array.isArray(prev?.[key]) ? prev[key] : [];
      const nextEntry = {
        id: `${key}:${submittedAt}:${Math.random().toString(36).slice(2, 8)}`,
        submittedAt,
        correct: correct === true,
        answers: values,
      };
      return {
        ...(prev || {}),
        [key]: [...current, nextEntry].slice(-20),
      };
    });
  };

  const runQuestionCodeForQuestion = async (questionId) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    const entry = getQuestionCodeEntry(key);
    setQuestionRunStateById((prev) => ({ ...(prev || {}), [key]: { loading: true, output: '', error: '' } }));
    try {
      const result = await runQuestionCode(entry.code || '', entry.input || '', (progress) => {
        setQuestionRunStateById((prev) => ({
          ...(prev || {}),
          [key]: {
            loading: !progress?.done,
            output: progress?.output || '',
            error: progress?.error || '',
          },
        }));
      });
      setQuestionRunStateById((prev) => ({
        ...(prev || {}),
        [key]: { loading: false, output: result?.output || '', error: result?.error || '' },
      }));
    } catch (err) {
      setQuestionRunStateById((prev) => ({
        ...(prev || {}),
        [key]: { loading: false, output: '', error: err?.message || 'Ошибка выполнения Python' },
      }));
    }
  };

  const startTest = async (lvlId, options = {}) => {
    if (!testDb) {
      if (!options?.silent) {
        alert("База тестов еще загружается. Попробуйте чуть позже.");
      }
      return false;
    }

    const allQuestions = testDb[task.number]?.[lvlId] || [];
    const requestedQuestionNumbers = Array.from(new Set(
      (Array.isArray(targetQuestions) ? targetQuestions : [])
        .map((value) => Math.trunc(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0 && value <= allQuestions.length)
    )).sort((left, right) => left - right);
    const hasRequestedQuestions = Array.isArray(targetQuestions) && targetQuestions.length > 0;
    const selectedEntries = requestedQuestionNumbers
      .map((number) => ({ question: allQuestions[number - 1], number }))
      .filter((entry) => entry.question);
    const qs = hasRequestedQuestions
      ? selectedEntries.map((entry) => entry.question)
      : allQuestions;
    const nextQuestionNumbers = hasRequestedQuestions
      ? selectedEntries.map((entry) => entry.number)
      : allQuestions.map((_, index) => index + 1);
    
    if (qs.length === 0) {
      if (!options?.silent) {
        alert(hasRequestedQuestions
          ? 'Выбранные для домашки вопросы не найдены.'
          : 'Учитель еще не загрузил задания для этого уровня.');
      }
      return false;
    }

    setQuestions(qs);
    setQuestionNumbers(nextQuestionNumbers);
    setLevel(lvlId);
    const wantsStoredIndex = Number.isFinite(Number(options?.initialIndex));
    const rawIndex = wantsStoredIndex ? Number(options.initialIndex) : 0;
    const safeIndex = qs.length > 0
      ? Math.max(0, Math.min(qs.length - 1, Math.floor(rawIndex)))
      : 0;
    setCurrentIndex(safeIndex);
    setUserAnswers({});
    setResults({});
    setSolvedIds(new Set());
    setSolvedAnswerById({});
    setAnswerHistoryById({});
    setAnswerHistoryLoading(false);
    setQuestionCodeById({});
    setQuestionCodeOpen(false);
    setQuestionCodeLoadingById({});
    setQuestionCodeSavingById({});
    setQuestionCodeErrorById({});
    setQuestionRunStateById({});
    disposeQuestionRunnerWorker();
    setStage('testing');
    onLevelSelect?.(lvlId);

    if (studentId) {
      try {
        const [solvedPayload, solvedAnswersPayload, answerHistoryPayload] = await Promise.all([
          api.getSolvedQuestions(studentId, task.number, lvlId).catch(() => []),
          api.getSolvedAnswers(studentId, task.number, lvlId).catch(() => ({})),
          api.getAnswerHistory(studentId, task.number, lvlId).catch(() => ({})),
        ]);
        const solvedIdsList = Array.isArray(solvedPayload) ? solvedPayload : [];
        setSolvedIds(new Set(solvedIdsList.map((id) => String(id))));
        setSolvedAnswerById(
          solvedAnswersPayload && typeof solvedAnswersPayload === 'object'
            ? solvedAnswersPayload
            : {}
        );
        setAnswerHistoryById(normalizeAnswerHistoryPayload(answerHistoryPayload));
      } catch (err) {
        console.error(err);
      }
    }
    return true;
  };

  useEffect(() => {
    if (stage !== 'select_level') return;
    if (!autoStartLevel || autoStartRef.current || autoStartFailed) return;
    if (!testDb) return;
    let cancelled = false;
    autoStartRef.current = true;
    const forceLaunch = Boolean(forceInitialLevelLaunch && autoStartLevel);
    (async () => {
      try {
        const started = await startTest(autoStartLevel, { silent: !forceLaunch, initialIndex: initialQuestionIndex });
        if (!cancelled && !started) {
          if (forceLaunch) {
            onClose?.();
            return;
          }
          setAutoStartFailed(true);
        }
      } catch {
        if (!cancelled) {
          if (forceLaunch) {
            onClose?.();
            return;
          }
          setAutoStartFailed(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [stage, autoStartLevel, initialQuestionIndex, testDb, autoStartFailed, forceInitialLevelLaunch, onClose]);

  useEffect(() => {
    autoStartRef.current = false;
    setAutoStartFailed(false);
    setQuestionCodeOpen(false);
    setQuestionCodeById({});
    setQuestionCodeLoadingById({});
    setQuestionCodeSavingById({});
    setQuestionCodeErrorById({});
    setQuestionRunStateById({});
    setSolvedAnswerById({});
    setAnswerHistoryById({});
    setAnswerHistoryLoading(false);
    disposeQuestionRunnerWorker();
  }, [task?.number]);

  useEffect(() => {
    if (stage !== 'testing') return;
    if (!Number.isFinite(currentIndex)) return;
    onQuestionChange?.(currentIndex);
  }, [currentIndex, stage, onQuestionChange]);

  useEffect(() => {
    if (stage !== 'testing' || !questionCodeOpen) return;
    if (!activeQuestionId) return;
    loadQuestionCode(activeQuestionId);
  }, [stage, questionCodeOpen, activeQuestionId, studentId, task?.number, level]);

  useEffect(() => () => disposeQuestionRunnerWorker('Python runner stopped.'), []);

  const normalizeAnswer = (value) => {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  };

  const parseStoredSolvedAnswers = (raw, count) => {
    const safeCount = Number.isFinite(Number(count)) ? Math.max(1, Number(count)) : 1;
    if (typeof raw !== 'string') {
      return Array.from({ length: safeCount }, () => '');
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return Array.from({ length: safeCount }, () => '');
    }
    let values = null;
    const looksJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (looksJson) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) values = parsed;
        else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.answers)) values = parsed.answers;
          else if (typeof parsed.answer !== 'undefined') values = [parsed.answer];
        }
      } catch {
        // Ignore malformed stored answer payload.
      }
    }
    if (!Array.isArray(values)) values = [trimmed];
    return Array.from({ length: safeCount }, (_, index) => String(values[index] ?? ''));
  };

  const handleCheck = async (sourceRect = null) => {
    const currentQuestion = questions[currentIndex];
    const answerCount = getAnswerCountForTask(task?.number);
    const submittedAt = new Date().toISOString();
    let submittedAnswerValues = [];
    let fallbackCorrect = false;
    let answerPayload = null;
    if (answerCount > 1) {
      const answerEntry = Array.isArray(userAnswers[currentIndex]) ? userAnswers[currentIndex] : [];
      const provided = Array.from({ length: answerCount }, (_, i) => String(answerEntry[i] ?? ''));
      const allowPartial = allowsPartialAnswers(task?.number);
      if (!allowPartial && provided.some((val) => !val.trim())) return;
      if (allowPartial && provided.every((val) => !val.trim())) return;
      const trimmedProvided = provided.map((val) => String(val ?? '').trim());
      submittedAnswerValues = trimmedProvided;
      if (trimmedProvided.some((val) => val)) {
        answerPayload = JSON.stringify({ answers: trimmedProvided });
      }
      if (!studentId) {
        const expectedAnswers = getExpectedAnswers(currentQuestion, answerCount);
        fallbackCorrect = expectedAnswers.every((exp, i) => {
          const expectedNorm = normalizeAnswer(exp);
          const providedNorm = normalizeAnswer(provided[i]);
          if (!expectedNorm) return !providedNorm;
          return providedNorm === expectedNorm;
        });
      }
    } else {
      const answerValue = userAnswers[currentIndex];
      if (!String(answerValue ?? '').trim()) return;
      const trimmedAnswer = String(answerValue ?? '').trim();
      submittedAnswerValues = [trimmedAnswer];
      answerPayload = trimmedAnswer;
      if (!studentId) {
        const expectedAnswers = getExpectedAnswers(currentQuestion, answerCount);
        fallbackCorrect = normalizeAnswer(answerValue) === normalizeAnswer(expectedAnswers[0]);
      }
    }

    let correct = false;
    let serverProgressApplied = false;
    const levelConfig = Object.values(LEVELS).find(l => l.id === level);
    if (studentId) {
      try {
        const resp = await api.solveQuestion({
          studentId,
          taskNumber: task.number,
          levelId: level,
          questionId: currentQuestion.id,
          ...(answerPayload ? { code: answerPayload } : {}),
          localDay: getLocalDayKey(),
        });
        correct = true;
        setSolvedIds((prev) => {
          const next = new Set(prev);
          next.add(String(currentQuestion.id));
          return next;
        });
        try {
          const solvedAnswersPayload = await api.getSolvedAnswers(studentId, task.number, level);
          if (solvedAnswersPayload && typeof solvedAnswersPayload === 'object') {
            setSolvedAnswerById((prev) => ({
              ...(prev || {}),
              ...solvedAnswersPayload,
            }));
          }
        } catch {
          // Keep solving flow even if loading solved answers fails.
        }
        if (typeof onStreakSaved === 'function') {
          if (resp?.streak) {
            onStreakSaved(resp.streak);
          } else {
            api.getStudentData(studentId)
              .then((data) => {
                if (data?.streak) onStreakSaved(data.streak);
              })
              .catch(() => {});
          }
        }
        if (typeof onXpGain === 'function' && Number.isFinite(Number(resp?.xpTotal))) {
          onXpGain({
            xpTotal: normalizeXpTotal(resp.xpTotal),
            xpGained: normalizeXpTotal(resp?.xpGained),
            coinsTotal: Number.isFinite(Number(resp?.coinsTotal)) ? Number(resp.coinsTotal) : undefined,
            coinsGained: Number.isFinite(Number(resp?.coinsGained)) ? Number(resp.coinsGained) : undefined,
            sourceRect: sourceRect && Number.isFinite(sourceRect.left) && Number.isFinite(sourceRect.top)
              ? sourceRect
              : null,
          });
        }
        if (typeof resp?.taskProgress === 'number') {
          onComplete(task.id, resp.taskProgress, { skipServer: true });
          serverProgressApplied = true;
        }
        try {
          await loadAnswerHistory(level, { silent: true });
        } catch {
          addLocalAnswerHistoryAttempt(currentQuestion.id, submittedAnswerValues, true, submittedAt);
        }
      } catch (err) {
        const message = String(err?.message || err || '');
        if (message !== 'Ответ неверный') {
          console.error(err);
          alert(message || 'Не удалось проверить ответ');
          return;
        }
        try {
          await loadAnswerHistory(level, { silent: true });
        } catch {
          addLocalAnswerHistoryAttempt(currentQuestion.id, submittedAnswerValues, false, submittedAt);
        }
      }
    } else {
      correct = fallbackCorrect;
      addLocalAnswerHistoryAttempt(currentQuestion.id, submittedAnswerValues, correct, submittedAt);
    }
    setResults((prev) => ({ ...prev, [currentIndex]: correct }));
    
    // Если ответ верный, обновляем прогресс
    if (correct) {
      if (serverProgressApplied) return;
      const weight = LEVEL_WEIGHTS[level] ?? levelConfig?.maxScore ?? 100;
      const totalCount = questions.length;
      if (Number.isFinite(weight) && totalCount > 0) {
        const prevSolved = solvedIds.size;
        const nextSolved = solvedIds.has(String(currentQuestion.id)) ? prevSolved : prevSolved + 1;
        const prevContribution = (prevSolved / totalCount) * weight;
        const nextContribution = (nextSolved / totalCount) * weight;
        const nextProgress = Math.round(Math.max(0, currentMastery - prevContribution + nextContribution));
        onComplete(task.id, Math.min(100, nextProgress), { skipServer: true });
      } else if (levelConfig?.maxScore > currentMastery) {
        onComplete(task.id, levelConfig.maxScore, { skipServer: true });
      }
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1);
    else onClose();
  };


  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  if (stage === 'select_level') {
    if (autoStartLevel && !autoStartFailed) {
      const waitingTests = testDb === null || typeof testDb === 'undefined';
      const loadingModal = (
        <div className="student-level-modal-backdrop fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4">
          <div className="student-level-modal student-level-modal--loading modal-card relative w-full text-center">
            <button onClick={onClose} className="student-level-modal__close" type="button" aria-label="Закрыть"><X size={19}/></button>
            <div className="student-level-modal__loading-badge mx-auto">
              <RefreshCcw size={14} className="animate-spin" />
              {waitingTests ? 'Загрузка заданий...' : 'Открываем задания...'}
            </div>
            <p className="text-gray-500 mt-3 text-sm">
              {waitingTests
                ? 'Подождите немного, загружаем тесты для этого задания.'
                : 'Подготавливаем выбранный уровень.'}
            </p>
          </div>
        </div>
      );
      return typeof document !== 'undefined' ? createPortal(loadingModal, document.body) : null;
    }

    const modal = (
      <div className="student-level-modal-backdrop fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-3 sm:p-4">
        <div className="student-level-modal modal-card relative w-full">
          <button onClick={onClose} className="student-level-modal__close" type="button" aria-label="Закрыть"><X size={19}/></button>

          <header className="student-level-modal__header">
            <span className="student-level-modal__task-chip">Задание №{getTaskDisplayNumber(task)}</span>
            <h2>Выберите уровень</h2>
            <p>{task.title}</p>
            <div className="student-level-modal__mastery">
              <div className="flex items-center justify-between gap-3">
                <span>Общий прогресс задания</span>
                <strong>{Math.round(currentMastery)}%</strong>
              </div>
              <div><span style={{ width: `${Math.max(0, Math.min(100, currentMastery))}%` }} /></div>
            </div>
          </header>

          <div className="student-level-modal__grid">
            {Object.values(LEVELS).map((lvl) => {
              const isCompleted = currentMastery >= lvl.maxScore;
              const levelXpReward = getTaskLevelXpReward(task?.number, lvl.id);
              const levelXpRewardLabel = levelXpReward > 0
                ? `+${levelXpReward.toLocaleString('ru-RU')} XP`
                : '';
              const levelQuestionCount = Array.isArray(testDb?.[task.number]?.[lvl.id])
                ? testDb[task.number][lvl.id].length
                : 0;

              return (
                <button
                  key={lvl.id}
                  type="button"
                  data-level={lvl.id}
                  data-completed={isCompleted ? 'true' : 'false'}
                  onClick={() => {
                    const shouldRestoreIndex = initialLevel && initialLevel === lvl.id;
                    startTest(lvl.id, shouldRestoreIndex ? { initialIndex: initialQuestionIndex } : {});
                  }}
                  className="student-level-card"
                >
                  <div className="student-level-card__topline">
                    <div className="student-level-card__icon">
                      {isCompleted ? <Check size={20} /> : <PlayCircle size={20} />}
                    </div>
                    <span>{isCompleted ? 'Пройдено' : `${levelQuestionCount} заданий`}</span>
                  </div>
                  <div className="student-level-card__content">
                    <h3>{lvl.label}</h3>
                    <p>
                      {lvl.id === 'basic' && 'Прототипы ЕГЭ и задания из демоверсий.'}
                      {lvl.id === 'advanced' && 'Усложнённые условия и нестандартные формулировки.'}
                      {lvl.id === 'expert' && 'Статград и самые сложные задачи.'}
                    </p>
                  </div>
                  <div className="student-level-card__footer">
                    <span>до {lvl.maxScore}%</span>
                    {levelXpReward > 0 && (
                      <span className="student-level-card__reward">
                        {levelXpRewardLabel}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
  }

  if (stage === 'testing' && questions.length > 0) {
    const currentQuestion = questions[currentIndex];
    const currentQuestionNumber = questionNumbers[currentIndex] ?? (currentIndex + 1);
    const currentQuestionLabel = normalizeQuestionLabel(currentQuestion?.label);
    const isChecked = results[currentIndex] !== undefined;
    const isCorrect = results[currentIndex];
    const answerCount = getAnswerCountForTask(task?.number);
    const expectedAnswers = getExpectedAnswers(currentQuestion, answerCount);
    const currentId = String(currentQuestion?.id ?? currentIndex);
    const isSolved = solvedIds.has(currentId);
    const solvedStoredAnswers = parseStoredSolvedAnswers(solvedAnswerById?.[currentId], answerCount);
    const solvedAnswerValues = Array.from({ length: answerCount }, (_, index) => {
      const expected = String(expectedAnswers[index] ?? '');
      if (expected.trim()) return expected;
      return String(solvedStoredAnswers[index] ?? '');
    });
    const storedAnswer = userAnswers[currentIndex];
    const answerValue = answerCount === 1
      ? (isSolved ? String(solvedAnswerValues[0] ?? '') : String(storedAnswer ?? ''))
      : '';
    const answerValues = answerCount > 1
      ? (
        isSolved
          ? solvedAnswerValues.map((val) => String(val ?? ''))
          : Array.from({ length: answerCount }, (_, i) => String((Array.isArray(storedAnswer) ? storedAnswer[i] : '') ?? ''))
      )
      : [];
    const answerLabels = Number(task?.number) === GAME_THEORY_TASK && answerCount === 4
      ? ['19', '20.1', '20.2', '21']
      : Array.from({ length: answerCount }, (_, idx) => String(idx + 1));
    const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
      .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
    const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
      .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
    const isAnswerReady = isSolved
      ? true
      : (
        answerCount > 1
          ? (allowsPartialAnswers(task?.number)
              ? answerValues.some((val) => String(val ?? '').trim())
              : answerValues.every((val) => String(val ?? '').trim()))
          : Boolean(answerValue.trim())
      );
    const computedChecked = isSolved || isChecked;
    const computedCorrect = isSolved ? true : isCorrect;
    const rawTargets = Array.isArray(targetQuestions) ? targetQuestions : [];
    const targetNumbers = rawTargets.length > 0 ? [...questionNumbers] : [];
    const targetStatus = targetNumbers.map((num) => {
      const localIndex = questionNumbers.indexOf(num);
      const question = localIndex >= 0 ? questions[localIndex] : null;
      const qId = question?.id;
      const solved = qId ? (solvedIds.has(String(qId)) || results[localIndex] === true) : false;
      return { num, solved };
    });
    const targetSolvedCount = targetStatus.filter((item) => item.solved).length;
    const solvedQuestionCount = questions.reduce((count, question, index) => {
      const questionId = String(question?.id ?? index);
      return solvedIds.has(questionId) || results[index] === true ? count + 1 : count;
    }, 0);
    const completionPercent = questions.length > 0
      ? Math.round((solvedQuestionCount / questions.length) * 100)
      : 0;
    const questionCodeEntry = getQuestionCodeEntry(currentId);
    const questionCodeLoading = Boolean(questionCodeLoadingById?.[currentId]);
    const questionCodeSaving = Boolean(questionCodeSavingById?.[currentId]);
    const questionCodeError = questionCodeErrorById?.[currentId] || '';
    const questionRunState = questionRunStateById?.[currentId] || { loading: false, output: '', error: '' };
    const questionIdleConsoleText = buildIdleConsoleText(
      questionCodeEntry.input,
      questionRunState.output,
      questionRunState.error
    );
    const questionCodeUpdatedAtLabel = questionCodeEntry.updatedAt
      ? new Date(questionCodeEntry.updatedAt).toLocaleString('ru-RU')
      : '';
    const isMobileViewport = typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 767px)').matches
      : false;
    const questionCodeEditorHeight = isMobileViewport ? '180px' : '240px';
    const answerHistory = Array.isArray(answerHistoryById?.[currentId])
      ? answerHistoryById[currentId]
      : [];
    const answerHistoryLatestFirst = answerHistory.slice().reverse();
    const formatAnswerHistoryTime = (value) => {
      const parsed = Date.parse(String(value || ''));
      if (!Number.isFinite(parsed)) return '';
      return new Date(parsed).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    };
    const formatAnswerHistoryValues = (answers = []) => {
      const values = Array.isArray(answers) ? answers : [];
      if (answerCount <= 1) return String(values[0] ?? '').trim() || '—';
      return Array.from({ length: answerCount }, (_, index) => {
        const label = answerLabels[index] || String(index + 1);
        const value = String(values[index] ?? '').trim() || '—';
        return `${label}: ${value}`;
      }).join('; ');
    };

    const modal = (
      <div className="student-test-modal-backdrop fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-0 sm:p-3 md:p-5">
        <div className="student-test-workspace student-test-workspace--animated modal-card w-full max-w-6xl h-[100dvh] sm:h-auto sm:max-h-[94dvh] relative flex flex-col overflow-hidden" data-level={level}>
          <header className="student-test-header shrink-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="student-test-header-icon hidden sm:flex">
                <ListChecks size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold uppercase ${LEVELS[level.toUpperCase()].color}`}>
                    {LEVELS[level.toUpperCase()].label}
                  </span>
                  {selectedLevelXpReward > 0 && (
                    <span className="student-test-xp-badge">
                      {selectedLevelXpRewardLabel}
                    </span>
                  )}
                </div>
                <h2 className="student-test-title mt-1.5 truncate">
                  Задание {getTaskDisplayNumber(task)}: {task.title}
                </h2>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <div className="student-test-progress-summary hidden sm:block">
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span>Выполнено</span>
                  <strong>{solvedQuestionCount}/{questions.length}</strong>
                </div>
                <div className="student-test-progress-track mt-1.5">
                  <div className="student-test-progress-fill" style={{ width: `${completionPercent}%` }} />
                </div>
              </div>
              <button onClick={onClose} className="student-test-close" type="button" aria-label="Закрыть">
                <X size={19}/>
              </button>
            </div>
          </header>

          <div className="student-test-navigation shrink-0">
            <div className="flex items-center justify-between gap-3">
              <span className="student-test-question-caption">
                {targetNumbers.length > 0
                  ? `Вопрос №${currentQuestionNumber} · ${currentIndex + 1} из ${questions.length}`
                  : `Вопрос ${currentIndex + 1} из ${questions.length}`}
              </span>
              <span className="student-test-mobile-progress sm:hidden">
                {solvedQuestionCount}/{questions.length} решено
              </span>
            </div>

            <div className="student-test-question-list mt-2 flex gap-2 overflow-x-auto">
              {questions.map((q, idx) => {
                const qId = String(q?.id ?? idx);
                const solved = solvedIds.has(qId);
                const status = results[idx];
                const isCurrent = idx === currentIndex;
                let btnClass = 'student-test-question-button ';

                if (isCurrent && (solved || status === true)) {
                  btnClass += 'is-current is-correct';
                } else if (isCurrent && status === false) {
                  btnClass += 'is-current is-wrong';
                } else if (isCurrent) {
                  btnClass += 'is-current';
                } else if (solved || status === true) {
                  btnClass += 'is-correct';
                } else if (status === false) {
                  btnClass += 'is-wrong';
                }

                return (
                  <button
                    key={qId}
                    onClick={() => setCurrentIndex(idx)}
                    className={btnClass}
                    style={{ '--student-test-item-index': idx }}
                    title={solved ? `Вопрос №${questionNumbers[idx] ?? (idx + 1)} решён` : `Вопрос №${questionNumbers[idx] ?? (idx + 1)}`}
                    type="button"
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {solved || status === true
                      ? <Check size={14} strokeWidth={3} />
                      : (questionNumbers[idx] ?? (idx + 1))}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="student-test-scroll flex-1 overflow-y-auto">
            <div key={`${level}:${currentId}`} className="student-test-content student-test-content--question-enter mx-auto w-full max-w-5xl">
            {targetStatus.length > 0 && (
              <div className="student-test-target mb-4 rounded-2xl px-3 py-2.5 md:px-4 md:py-3 text-xs">
                <div className="font-semibold">Цель: решить отмеченные задания</div>
                <div className="mt-1 text-[11px] md:hidden">
                  Выполнено {targetSolvedCount}/{targetStatus.length}
                </div>
                <div className="hidden md:flex flex-wrap gap-2 mt-2">
                  {targetStatus.map((item, targetIndex) => (
                    <span
                      key={item.num}
                      style={{ '--student-test-item-index': targetIndex }}
                      className={`px-2 py-1 rounded-lg border text-xs font-semibold ${
                        item.solved
                          ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                          : 'border-purple-200 bg-white text-purple-700'
                      }`}
                    >
                      №{item.num}{item.solved ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
                <div className="hidden md:block mt-2 text-[11px] text-purple-600">
                  Выполнено {targetSolvedCount}/{targetStatus.length}
                </div>
              </div>
            )}

            <section className="student-test-question-panel student-test-panel-enter">
            {currentQuestionLabel && (
              <div className="mb-3 md:mb-4">
                <span
                  className="inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-bold shadow-sm"
                  style={getQuestionLabelStyle(currentQuestionLabel)}
                >
                  <span className="truncate">{currentQuestionLabel.text}</span>
                </span>
              </div>
            )}
            {screenshots.length > 0 && (
              <div className="space-y-2.5 md:space-y-3 mb-5 md:mb-6">
                {screenshots.map((img, imageIndex) => {
                  const imageKey = String(img.id || img.storageName || img.url || imageIndex);
                  const imageState = questionImageStateByKey[imageKey] || {};
                  const storedWidth = Number(img.width);
                  const storedHeight = Number(img.height);
                  const storedAspectRatio = storedWidth > 0 && storedHeight > 0
                    ? storedWidth / storedHeight
                    : null;
                  const aspectRatio = Number(imageState.aspectRatio) > 0
                    ? Number(imageState.aspectRatio)
                    : (storedAspectRatio || 3.2);
                  return (
                    <div
                      key={imageKey}
                      className={`student-test-screenshot ${imageState.loaded ? 'is-loaded' : 'is-loading'} border rounded-2xl overflow-hidden bg-gray-900/5 max-h-[42vh] sm:max-h-[55vh] md:max-h-[65vh]`}
                      style={{
                        '--student-test-item-index': imageIndex,
                        '--student-test-image-aspect': aspectRatio,
                      }}
                      aria-busy={!imageState.loaded}
                    >
                      <div
                        className="student-test-screenshot__loader"
                        aria-live="polite"
                        aria-hidden={Boolean(imageState.loaded)}
                      >
                        <RefreshCcw size={18} aria-hidden="true" />
                        <span>Загрузка изображения задания…</span>
                      </div>
                      <img
                        src={img.url}
                        alt={img.name || 'Скриншот'}
                        className="w-full object-contain cursor-zoom-in"
                        onLoad={(event) => {
                          const naturalWidth = Number(event.currentTarget?.naturalWidth);
                          const naturalHeight = Number(event.currentTarget?.naturalHeight);
                          const naturalAspectRatio = naturalWidth > 0 && naturalHeight > 0
                            ? naturalWidth / naturalHeight
                            : aspectRatio;
                          setQuestionImageStateByKey((prev) => ({
                            ...prev,
                            [imageKey]: {
                              loaded: true,
                              aspectRatio: naturalAspectRatio,
                            },
                          }));
                        }}
                        onError={() => {
                          setQuestionImageStateByKey((prev) => ({
                            ...prev,
                            [imageKey]: {
                              loaded: true,
                              aspectRatio,
                            },
                          }));
                        }}
                        onClick={() => setExpandedImage(img)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {extraFiles.length > 0 && (
              <div className="mb-5 md:mb-6">
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Доп. файлы</p>
                <div className="space-y-2">
                    {extraFiles.map((file, fileIndex) => (
                      <a
                        key={file.id || file.url}
                        href={buildDownloadUrl(file.url)}
                        download={file?.name || undefined}
                        style={{ '--student-test-item-index': fileIndex }}
                        className="student-test-file flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                    >
                      <span className="truncate">{file.name}</span>
                      <Download size={16} className="text-purple-600" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {isSolved && (
              <div className="student-test-solved-label mb-2 text-xs font-semibold text-green-600 uppercase tracking-wide">Решено ранее</div>
            )}
            {currentQuestion.question && (
              <p className="student-test-question-text text-[15px] md:text-lg font-medium leading-relaxed text-gray-900 mb-5 md:mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
            )}
            </section>

            <section className={`student-test-answer-panel student-test-panel-enter space-y-3 ${
              computedChecked
                ? (computedCorrect ? 'student-test-answer-panel--correct' : 'student-test-answer-panel--wrong')
                : 'student-test-answer-panel--pending'
            }`}>
              <label className="block text-xs font-bold text-gray-400 uppercase">
                {isSolved ? 'Правильный ответ' : 'Ответ'}
              </label>
              {isSolved ? (
                answerCount > 1 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Array.from({ length: answerCount }).map((_, idx) => (
                        <div key={`solved-answer-${idx}`} className="student-test-solved-answer space-y-1" style={{ '--student-test-item-index': idx }}>
                        <div className="text-xs font-semibold text-gray-500">Ответ {answerLabels[idx]}</div>
                        <div className="w-full px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-gray-800">
                          {answerValues[idx] ? answerValues[idx] : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="student-test-solved-answer w-full px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-gray-800">
                    {answerValue ? answerValue : '—'}
                  </div>
                )
              ) : (
                answerCount > 1 ? (
                  Number(task?.number) === GAME_THEORY_TASK ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">19</label>
                        <input
                          type="text"
                          value={answerValues[0] ?? ''}
                          onChange={(e) => {
                            if (computedChecked) return;
                            const value = e.target.value;
                            setUserAnswers((prev) => {
                              const next = { ...prev };
                              const current = Array.isArray(next[currentIndex])
                                ? [...next[currentIndex]]
                                : Array.from({ length: answerCount }, () => '');
                              current[0] = value;
                              next[currentIndex] = current;
                              return next;
                            });
                          }}
                          placeholder="Ответ 19"
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                          disabled={computedChecked}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">20.1</label>
                          <input
                            type="text"
                            value={answerValues[1] ?? ''}
                            onChange={(e) => {
                              if (computedChecked) return;
                              const value = e.target.value;
                              setUserAnswers((prev) => {
                                const next = { ...prev };
                                const current = Array.isArray(next[currentIndex])
                                  ? [...next[currentIndex]]
                                  : Array.from({ length: answerCount }, () => '');
                                current[1] = value;
                                next[currentIndex] = current;
                                return next;
                              });
                            }}
                            placeholder="Ответ 20.1"
                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                            disabled={computedChecked}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">20.2</label>
                          <input
                            type="text"
                            value={answerValues[2] ?? ''}
                            onChange={(e) => {
                              if (computedChecked) return;
                              const value = e.target.value;
                              setUserAnswers((prev) => {
                                const next = { ...prev };
                                const current = Array.isArray(next[currentIndex])
                                  ? [...next[currentIndex]]
                                  : Array.from({ length: answerCount }, () => '');
                                current[2] = value;
                                next[currentIndex] = current;
                                return next;
                              });
                            }}
                            placeholder="Ответ 20.2"
                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                            disabled={computedChecked}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">21</label>
                        <input
                          type="text"
                          value={answerValues[3] ?? ''}
                          onChange={(e) => {
                            if (computedChecked) return;
                            const value = e.target.value;
                            setUserAnswers((prev) => {
                              const next = { ...prev };
                              const current = Array.isArray(next[currentIndex])
                                ? [...next[currentIndex]]
                                : Array.from({ length: answerCount }, () => '');
                              current[3] = value;
                              next[currentIndex] = current;
                              return next;
                            });
                          }}
                          placeholder="Ответ 21"
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                          disabled={computedChecked}
                        />
                      </div>
                    </div>
                  ) : answerCount === 20 ? (
                    <div className="grid grid-cols-[26px_1fr_1fr] md:grid-cols-[32px_1fr_1fr] gap-1.5 md:gap-2">
                      {Array.from({ length: 10 }).map((_, rowIdx) => {
                        const leftIdx = rowIdx;
                        const rightIdx = rowIdx + 10;
                        return (
                          <React.Fragment key={rowIdx}>
                            <div className="flex items-center justify-center text-xs font-bold text-gray-500">
                              {rowIdx + 1}
                            </div>
                            <input
                              type="text"
                              value={answerValues[leftIdx] ?? ''}
                              onChange={(e) => {
                                if (computedChecked) return;
                                const value = e.target.value;
                                setUserAnswers((prev) => {
                                  const next = { ...prev };
                                  const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                                  current[leftIdx] = value;
                                  next[currentIndex] = current;
                                  return next;
                                });
                              }}
                              placeholder="Ответ 1"
                              className="w-full px-2.5 md:px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                              disabled={computedChecked}
                            />
                            <input
                              type="text"
                              value={answerValues[rightIdx] ?? ''}
                              onChange={(e) => {
                                if (computedChecked) return;
                                const value = e.target.value;
                                setUserAnswers((prev) => {
                                  const next = { ...prev };
                                  const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                                  current[rightIdx] = value;
                                  next[currentIndex] = current;
                                  return next;
                                });
                              }}
                              placeholder="Ответ 2"
                              className="w-full px-2.5 md:px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                              disabled={computedChecked}
                            />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Array.from({ length: answerCount }).map((_, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={answerValues[idx] ?? ''}
                          onChange={(e) => {
                            if (computedChecked) return;
                            const value = e.target.value;
                            setUserAnswers((prev) => {
                              const next = { ...prev };
                              const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                              current[idx] = value;
                              next[currentIndex] = current;
                              return next;
                            });
                          }}
                          placeholder={`Ответ ${idx + 1}`}
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                          disabled={computedChecked}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <input
                    type="text"
                    value={answerValue}
                    onChange={(e) => {
                      if (computedChecked) return;
                      setUserAnswers({ ...userAnswers, [currentIndex]: e.target.value });
                    }}
                    placeholder="Введите ответ..."
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                    disabled={computedChecked}
                  />
                )
              )}
            {computedChecked && (
              <div className={`student-test-result-feedback text-sm ${computedCorrect ? 'is-correct text-green-600' : 'is-wrong text-red-600'}`}>
                {computedCorrect ? 'Верно!' : 'Неверно'}
              </div>
            )}
            <details className="student-test-history rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5">
              <summary className="student-test-history-summary flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-gray-700">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <History size={15} className="student-test-history-icon text-purple-500" />
                  <span>История ответов</span>
                </span>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-gray-500">
                  {answerHistoryLoading ? '...' : answerHistory.length}
                </span>
              </summary>
              <div className="mt-3 space-y-2">
                {answerHistoryLoading ? (
                  <div className="text-xs text-gray-500">Загрузка...</div>
                ) : answerHistoryLatestFirst.length > 0 ? (
                  answerHistoryLatestFirst.map((entry, idx) => {
                    const timeLabel = formatAnswerHistoryTime(entry.submittedAt);
                    return (
                      <div
                        key={entry.id || `${entry.submittedAt}-${idx}`}
                        className="student-test-history-entry rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs"
                        style={{ '--student-test-item-index': idx }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`font-bold ${entry.correct ? 'text-green-600' : 'text-red-600'}`}>
                            {entry.correct ? 'Верно' : 'Неверно'}
                          </span>
                          {timeLabel && <span className="text-gray-400">{timeLabel}</span>}
                        </div>
                        <div className="mt-1 break-words font-mono text-[11px] leading-5 text-gray-700">
                          {formatAnswerHistoryValues(entry.answers)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-gray-500">Попыток пока нет</div>
                )}
              </div>
            </details>
            </section>

            <div className="student-test-code-panel student-test-panel-enter rounded-2xl p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-gray-500 uppercase">
                  Код решения для вопроса №{currentQuestionNumber}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !questionCodeOpen;
                    setQuestionCodeOpen(nextOpen);
                    if (nextOpen && currentId) {
                      loadQuestionCode(currentId);
                    }
                  }}
                  className="student-test-code-toggle text-xs text-purple-600 hover:text-purple-700 font-semibold"
                >
                  {questionCodeOpen ? 'Скрыть код' : 'Открыть код'}
                </button>
              </div>

              {questionCodeOpen && (
                questionCodeLoading ? (
                  <div className="text-sm text-gray-500">Загрузка кода...</div>
                ) : (
                  <div className="student-test-code-reveal space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="text-xs text-gray-500">
                        {questionCodeUpdatedAtLabel ? `Сохранено: ${questionCodeUpdatedAtLabel}` : 'Код ещё не сохранён'}
                      </div>
                      <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => runQuestionCodeForQuestion(currentId)}
                          disabled={questionRunState.loading}
                          className="w-full sm:w-auto"
                        >
                          {questionRunState.loading ? 'Запуск...' : 'Запустить'}
                        </Button>
                        <Button
                          onClick={() => saveQuestionCode(currentId)}
                          disabled={questionCodeSaving || !studentId}
                          className="w-full sm:w-auto"
                        >
                          {questionCodeSaving ? 'Сохранение...' : 'Сохранить код'}
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-gray-800">
                      <Editor
                        height={questionCodeEditorHeight}
                        language="python"
                        theme={monacoTheme}
                        beforeMount={ensureMonacoColorTheme}
                        value={questionCodeEntry.code}
                        onChange={(value) => {
                          setQuestionCodeEntry(currentId, { code: value ?? '' });
                          clearQuestionCodeError(currentId);
                        }}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 14,
                          tabSize: 4,
                          insertSpaces: true,
                          wordWrap: 'on',
                          automaticLayout: true,
                        }}
                        loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                      />
                    </div>
                    <div className="rounded-xl border p-2 bg-gray-50 space-y-2">
                      <div className="text-xs font-semibold text-gray-600">
                        Консоль (IDLE): редактируйте секцию `{PY_IDLE_STDIN_HEADER}`
                      </div>
                      <textarea
                        value={questionIdleConsoleText}
                        onChange={(e) => {
                          setQuestionCodeEntry(currentId, {
                            input: parseIdleConsoleInput(e.target.value, questionCodeEntry.input),
                          });
                          clearQuestionCodeError(currentId);
                        }}
                        readOnly={questionRunState.loading}
                        spellCheck={false}
                        className="w-full min-h-[220px] text-xs font-mono leading-5 px-3 py-2 rounded-lg border border-gray-200 bg-white outline-none focus:border-purple-500 resize-y"
                      />
                    </div>
                    {questionCodeError && <div className="text-xs text-red-500">{questionCodeError}</div>}
                  </div>
                )
              )}
            </div>
          </div>
          </div>

          <footer className="student-test-footer shrink-0">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
              disabled={currentIndex === 0}
              className="student-test-back-action h-11 w-11 shrink-0 px-0 sm:w-auto sm:px-4"
            >
              <ChevronLeft size={18} />
              <span className="hidden sm:inline">Назад</span>
            </Button>
            <Button 
              onClick={(event) => {
                if (!computedChecked) {
                  const rect = event?.currentTarget?.getBoundingClientRect?.();
                  handleCheck(rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)
                    ? {
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height,
                      }
                    : null);
                  return;
                }
                if (!computedCorrect) {
                  setResults((prev) => {
                    const next = { ...prev };
                    delete next[currentIndex];
                    return next;
                  });
                  return;
                }
                handleNext();
              }} 
              disabled={!computedChecked && !isAnswerReady} 
              className={`student-test-primary-action h-11 flex-1 sm:flex-none sm:min-w-56 ${
                computedChecked
                  ? (computedCorrect ? 'is-correct' : 'is-wrong')
                  : (isAnswerReady ? 'is-ready' : 'is-disabled')
              }`}
              variant={computedChecked ? (computedCorrect ? 'success' : 'danger') : 'primary'}
            >
              {!computedChecked ? 'Проверить' : (
                currentIndex < questions.length - 1 
                  ? (computedCorrect ? 'Верно! Следующий вопрос' : 'Попробовать снова')
                  : 'Закрыть'
              )}
            </Button>
          </footer>
        </div>
        {expandedImage && (
          <div
            className="student-test-image-lightbox fixed inset-0 z-[60] bg-black/80 modal-backdrop flex items-center justify-center p-4"
            onClick={() => setExpandedImage(null)}
          >
            <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
              <img
                src={expandedImage.url}
                alt={expandedImage.name || 'Скриншот'}
                className="student-test-image-lightbox__image w-full h-full object-contain rounded-2xl shadow-2xl"
                style={{ maxHeight: '95vh' }}
              />
              <button
                onClick={() => setExpandedImage(null)}
                className="absolute top-3 right-3 p-2 rounded-full bg-white/90 hover:bg-white"
                type="button"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
  }
  
  return null;
};

/**
 * PAGE COMPONENTS (Updated Login & Progress)
 */



export default StudentTestModal;

