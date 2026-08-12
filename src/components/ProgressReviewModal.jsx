import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, FileCode2, History, ListChecks, ListPlus, RefreshCcw, X } from 'lucide-react';
import { api } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from '../utils/monacoTheme';
import { getQuestionLabelStyle, normalizeQuestionLabel } from '../utils/questionLabel';
import { getHomeworkLessonBasketItemKey } from '../utils/homeworkLessonBasket';
import { writeBoardTaskToClipboard } from '../utils/boardTaskClipboard';
import QuestionDifficultyBadge from './QuestionDifficultyBadge';
import { Button } from './ui';

const TEACHER_CODE_COPY_FEEDBACK_MS = 1800;

const ReviewAnswerFields = ({
  values = [],
  answerCount = 1,
  answerLabels = [],
  variant = 'student',
}) => {
  const safeCount = Math.max(1, Number(answerCount) || 1);
  const safeValues = Array.from(
    { length: safeCount },
    (_, index) => String(values?.[index] ?? '')
  );
  const inputClassName = `teacher-test-review-answer-input is-${variant} w-full rounded-xl border px-3 py-2.5 text-sm`;
  const renderField = (index, label) => (
    <input
      key={`${variant}-answer-${index}`}
      type="text"
      value={safeValues[index] || '—'}
      readOnly
      aria-label={`${variant === 'correct' ? 'Правильный ответ' : 'Ответ ученика'} ${label}`}
      className={inputClassName}
    />
  );

  if (safeCount === 20) {
    return (
      <div className="grid grid-cols-[26px_1fr_1fr] gap-1.5 md:grid-cols-[32px_1fr_1fr] md:gap-2">
        <div aria-hidden="true" />
        <div className="px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Ответ 1</div>
        <div className="px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Ответ 2</div>
        {Array.from({ length: 10 }, (_, rowIndex) => (
          <React.Fragment key={`${variant}-answer-row-${rowIndex}`}>
            <div className="flex items-center justify-center text-xs font-bold text-gray-500">
              {rowIndex + 1}
            </div>
            {renderField(rowIndex, `${rowIndex + 1}.1`)}
            {renderField(rowIndex + 10, `${rowIndex + 1}.2`)}
          </React.Fragment>
        ))}
      </div>
    );
  }

  if (safeCount > 1) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {safeValues.map((_, index) => (
          <label key={`${variant}-answer-wrap-${index}`} className="space-y-1">
            <span className="block text-xs font-semibold text-gray-500">
              Ответ {answerLabels[index] || index + 1}
            </span>
            {renderField(index, answerLabels[index] || index + 1)}
          </label>
        ))}
      </div>
    );
  }

  return renderField(0, 1);
};

const writeTeacherCodeToClipboard = async (value) => {
  const code = String(value ?? '');
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(code);
      return;
    } catch {
      // Fall back when clipboard permissions are restricted by the browser.
    }
  }
  if (typeof document === 'undefined') throw new Error('Clipboard is unavailable');
  const textarea = document.createElement('textarea');
  textarea.value = code;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  let copied = false;
  try {
    textarea.select();
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
  }
  if (!copied) throw new Error('Copy failed');
};

const ProgressReviewModal = ({
  theme = '',
  task,
  onClose,
  studentId,
  testDb,
  LEVELS,
  GAME_THEORY_TASK,
  getTaskDisplayNumber,
  getAnswerCountForTask,
  getExpectedAnswers,
  withStudentId,
  homeworkLessonBasketItems = [],
  onAddToHomeworkLessonBasket,
}) => {
  const monacoTheme = resolveMonacoColorTheme(theme);
  const taskNumber = task?.number;
  const levelOptions = React.useMemo(() => Object.values(LEVELS || {}), [LEVELS]);
  const [levelId, setLevelId] = useState(levelOptions[0]?.id || 'basic');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [answerById, setAnswerById] = useState({});
  const [answerHistoryById, setAnswerHistoryById] = useState({});
  const [answerHistoryLoading, setAnswerHistoryLoading] = useState(false);
  const [answerHistoryError, setAnswerHistoryError] = useState('');
  const [questionDifficultyById, setQuestionDifficultyById] = useState({});
  const [questionCodeById, setQuestionCodeById] = useState({});
  const [questionCodeLoadingById, setQuestionCodeLoadingById] = useState({});
  const [questionCodeErrorById, setQuestionCodeErrorById] = useState({});
  const [questionCodeCopyState, setQuestionCodeCopyState] = useState('idle');
  const [questionBoardCopyState, setQuestionBoardCopyState] = useState('idle');
  const [questionCodePreviewOpen, setQuestionCodePreviewOpen] = useState(false);
  const [questionImageStateByKey, setQuestionImageStateByKey] = useState({});
  const [expandedImage, setExpandedImage] = useState(null);
  const questionCodeCopyResetTimerRef = React.useRef(null);
  const questionBoardCopyResetTimerRef = React.useRef(null);
  const questionCodeRequestScopeRef = React.useRef('');

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

  const setQuestionCodeError = (questionId, message) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeErrorById((prev) => ({ ...(prev || {}), [key]: message || '' }));
  };

  const loadQuestionCode = async (questionId, force = false) => {
    if (!studentId || !taskNumber || !levelId) return;
    const key = String(questionId ?? '').trim();
    if (!key) return;
    if (questionCodeLoadingById?.[key]) return;
    const cached = getQuestionCodeEntry(key);
    if (cached.loaded && !force) return;
    const requestScope = `${studentId}:${taskNumber}:${levelId}`;
    questionCodeRequestScopeRef.current = requestScope;
    setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.getQuestionCode(studentId, taskNumber, levelId, key);
      if (questionCodeRequestScopeRef.current !== requestScope) return;
      setQuestionCodeEntry(key, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: typeof payload?.input === 'string' ? payload.input : '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      setQuestionCodeErrorById((prev) => {
        if (!prev?.[key]) return prev;
        const next = { ...(prev || {}) };
        delete next[key];
        return next;
      });
    } catch (err) {
      if (questionCodeRequestScopeRef.current !== requestScope) return;
      setQuestionCodeError(key, err?.message || err);
    } finally {
      if (questionCodeRequestScopeRef.current === requestScope) {
        setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: false }));
      }
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
          const submittedAt = String(entry.submittedAt || '').trim();
          if (!Number.isFinite(Date.parse(submittedAt))) return null;
          const answers = Array.isArray(entry.answers)
            ? entry.answers.map((value) => String(value ?? ''))
            : (typeof entry.answer !== 'undefined' ? [String(entry.answer ?? '')] : []);
          if (answers.length === 0) return null;
          return {
            id: String(entry.id || `${key}:${submittedAt}:${answers.join('|')}`),
            submittedAt,
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

  useEffect(() => {
    if (!taskNumber) return;
    const available = levelOptions.filter((lvl) => {
      const list = testDb?.[taskNumber]?.[lvl.id];
      return Array.isArray(list) && list.length > 0;
    });
    const nextLevel = available[0]?.id || levelOptions[0]?.id || 'basic';
    setLevelId(nextLevel);
  }, [levelOptions, taskNumber, testDb]);

  useEffect(() => {
    if (!taskNumber || !levelId) return undefined;
    let active = true;
    const requestScope = `${studentId || ''}:${taskNumber}:${levelId}`;
    questionCodeRequestScopeRef.current = requestScope;
    const qs = testDb?.[taskNumber]?.[levelId] || [];
    setQuestions(Array.isArray(qs) ? qs : []);
    setCurrentIndex(0);
    setSolvedIds(new Set());
    setAnswerById({});
    setAnswerHistoryById({});
    setAnswerHistoryError('');
    setQuestionCodeById({});
    setQuestionCodeLoadingById({});
    setQuestionCodeErrorById({});
    setQuestionCodePreviewOpen(false);
    setQuestionImageStateByKey({});
    setExpandedImage(null);
    if (studentId) {
      api.getSolvedQuestions(studentId, taskNumber, levelId, { includeCode: true })
        .then((payload) => {
          if (!active) return;
          if (Array.isArray(payload)) {
            setSolvedIds(new Set(payload.map((id) => String(id))));
            setAnswerById({});
          } else {
            const ids = Array.isArray(payload?.ids) ? payload.ids : [];
            const codeById = payload?.codeById && typeof payload.codeById === 'object' ? payload.codeById : {};
            setSolvedIds(new Set(ids.map((id) => String(id))));
            setAnswerById(codeById);
          }
        })
        .catch((err) => {
          if (active) console.error(err);
        });
      setAnswerHistoryLoading(true);
      api.getAnswerHistory(studentId, taskNumber, levelId)
        .then((payload) => {
          if (active) setAnswerHistoryById(normalizeAnswerHistoryPayload(payload));
        })
        .catch((err) => {
          if (active) setAnswerHistoryError(String(err?.message || err || 'Не удалось загрузить историю ответов'));
        })
        .finally(() => {
          if (active) setAnswerHistoryLoading(false);
        });
    } else {
      setAnswerHistoryLoading(false);
    }
    return () => {
      active = false;
      if (questionCodeRequestScopeRef.current === requestScope) {
        questionCodeRequestScopeRef.current = '';
      }
    };
  }, [taskNumber, levelId, testDb, studentId]);

  useEffect(() => {
    if (!taskNumber || !levelId) {
      setQuestionDifficultyById({});
      return undefined;
    }
    let active = true;
    setQuestionDifficultyById({});
    api.getQuestionDifficulties(taskNumber, levelId)
      .then((payload) => {
        if (!active) return;
        setQuestionDifficultyById(
          payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
        );
      })
      .catch(() => {
        if (active) setQuestionDifficultyById({});
      });
    return () => {
      active = false;
    };
  }, [taskNumber, levelId]);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (expandedImage) {
        setExpandedImage(null);
        return;
      }
      onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedImage, onClose]);

  useEffect(() => {
    setQuestionCodeCopyState('idle');
    setQuestionBoardCopyState('idle');
    setQuestionCodePreviewOpen(false);
    setExpandedImage(null);
    if (questionCodeCopyResetTimerRef.current) {
      clearTimeout(questionCodeCopyResetTimerRef.current);
      questionCodeCopyResetTimerRef.current = null;
    }
    if (questionBoardCopyResetTimerRef.current) {
      clearTimeout(questionBoardCopyResetTimerRef.current);
      questionBoardCopyResetTimerRef.current = null;
    }
    return () => {
      if (questionCodeCopyResetTimerRef.current) {
        clearTimeout(questionCodeCopyResetTimerRef.current);
        questionCodeCopyResetTimerRef.current = null;
      }
      if (questionBoardCopyResetTimerRef.current) {
        clearTimeout(questionBoardCopyResetTimerRef.current);
        questionBoardCopyResetTimerRef.current = null;
      }
    };
  }, [currentIndex, levelId, studentId, taskNumber]);

  useEffect(() => {
    if (!studentId || !taskNumber || !levelId) return;
    const current = questions[currentIndex];
    const currentId = String(current?.id ?? currentIndex).trim();
    if (!currentId) return;
    loadQuestionCode(currentId);
  }, [studentId, taskNumber, levelId, questions, currentIndex]);

  if (!task) return null;

  const parseStoredAnswers = (raw) => {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const looksJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (looksJson) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((val) => String(val ?? ''));
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.answers)) return parsed.answers.map((val) => String(val ?? ''));
          if (typeof parsed.answer === 'string') return [parsed.answer];
        }
      } catch {
        // Ignore malformed stored answer payload.
      }
    }
    return [trimmed];
  };

  const buildAnswerLabels = (count) => {
    if (Number(task?.number) === GAME_THEORY_TASK && count === 4) {
      return ['19', '20.1', '20.2', '21'];
    }
    return Array.from({ length: count }, (_, idx) => String(idx + 1));
  };

  const hasQuestions = Array.isArray(questions) && questions.length > 0;
  const taskDisplayNumber = typeof getTaskDisplayNumber === 'function'
    ? getTaskDisplayNumber(task)
    : task?.number;
  const currentQuestion = hasQuestions ? questions[currentIndex] : null;
  const currentId = String(currentQuestion?.id ?? currentIndex);
  const currentBasketItem = currentQuestion ? {
    taskNumber,
    levelId,
    questionId: String(currentQuestion?.id ?? '').trim(),
    questionNumber: currentIndex + 1,
    taskTitle: String(task?.title || '').trim(),
  } : null;
  const currentBasketItemKey = getHomeworkLessonBasketItemKey(currentBasketItem);
  const currentQuestionInBasket = Boolean(currentBasketItemKey) && (
    Array.isArray(homeworkLessonBasketItems) ? homeworkLessonBasketItems : []
  ).some((item) => getHomeworkLessonBasketItemKey(item) === currentBasketItemKey);
  const isSolved = solvedIds.has(currentId);
  const answerCountOverride = Math.trunc(Number(currentQuestion?.answerCountOverride));
  const answerCount = Number.isFinite(answerCountOverride) && answerCountOverride > 0 && answerCountOverride <= 50
    ? answerCountOverride
    : Math.max(1, Number(getAnswerCountForTask(task?.number)) || 1);
  const answerLabels = buildAnswerLabels(answerCount);
  const activeLevel = levelOptions.find((level) => level.id === levelId) || levelOptions[0] || null;
  const currentQuestionLabel = normalizeQuestionLabel(currentQuestion?.label);
  const answerHistory = Array.isArray(answerHistoryById?.[currentId])
    ? answerHistoryById[currentId]
    : [];
  const answerHistoryLatestFirst = answerHistory.slice().reverse();
  const latestAttempt = answerHistory[answerHistory.length - 1] || null;
  const storedAnswers = parseStoredAnswers(answerById?.[currentId]);
  const normalizeAnswerValues = (values) => Array.from(
    { length: answerCount },
    (_, index) => String(values?.[index] ?? '')
  );
  const expectedAnswers = normalizeAnswerValues(
    currentQuestion ? getExpectedAnswers(currentQuestion, answerCount) : []
  );
  const latestAttemptAnswers = Array.isArray(latestAttempt?.answers)
    ? normalizeAnswerValues(latestAttempt.answers)
    : null;
  const studentAnswerValues = latestAttemptAnswers
    || (Array.isArray(storedAnswers) ? normalizeAnswerValues(storedAnswers) : normalizeAnswerValues([]));
  const hasStudentAnswer = studentAnswerValues.some((value) => value.trim());
  const studentAnswerStatus = latestAttempt
    ? (latestAttempt.correct ? 'correct' : 'wrong')
    : (isSolved ? 'correct' : 'empty');
  const studentAnswerStatusLabel = latestAttempt
    ? (latestAttempt.correct ? 'Последняя попытка верная' : 'Последняя попытка неверная')
    : (isSolved ? 'Решено' : 'Нет ответа');
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => {
      const rawUrl = file?.url || (file?.storageName ? `/uploads/${file.storageName}` : '');
      return { ...file, url: withStudentId(rawUrl, studentId) };
    });
  const solvedQuestionCount = questions.reduce((count, question, index) => (
    solvedIds.has(String(question?.id ?? index)) ? count + 1 : count
  ), 0);
  const completionPercent = questions.length > 0
    ? Math.round((solvedQuestionCount / questions.length) * 100)
    : 0;
  const getQuestionState = (question, index) => {
    const questionId = String(question?.id ?? index);
    if (solvedIds.has(questionId)) return 'solved';
    if (Array.isArray(answerHistoryById?.[questionId]) && answerHistoryById[questionId].length > 0) return 'wrong';
    return 'pending';
  };
  const previousQuestionState = currentIndex > 0
    ? getQuestionState(questions[currentIndex - 1], currentIndex - 1)
    : 'pending';
  const nextQuestionState = currentIndex < questions.length - 1
    ? getQuestionState(questions[currentIndex + 1], currentIndex + 1)
    : 'pending';
  const questionCodeEntry = getQuestionCodeEntry(currentId);
  const questionCodeLoading = Boolean(questionCodeLoadingById?.[currentId]);
  const questionCodeError = questionCodeErrorById?.[currentId] || '';
  const questionCodeUpdatedAtLabel = questionCodeEntry.updatedAt
    ? new Date(questionCodeEntry.updatedAt).toLocaleString('ru-RU')
    : '';
  const formatAnswerHistoryTime = (value) => {
    const parsed = Date.parse(String(value || ''));
    if (!Number.isFinite(parsed)) return '';
    return new Date(parsed).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  const formatAnswerHistoryValues = (answers = []) => {
    const values = Array.isArray(answers) ? answers : [];
    if (answerCount <= 1) return String(values[0] ?? '').trim() || '—';
    if (answerCount === 20) {
      return Array.from({ length: 10 }, (_, rowIndex) => {
        const leftValue = String(values[rowIndex] ?? '').trim() || '—';
        const rightValue = String(values[rowIndex + 10] ?? '').trim() || '—';
        return `${rowIndex + 1}: ${leftValue} | ${rightValue}`;
      }).join('; ');
    }
    return Array.from({ length: answerCount }, (_, index) => {
      const label = answerLabels[index] || String(index + 1);
      const value = String(values[index] ?? '').trim() || '—';
      return `${label}: ${value}`;
    }).join('; ');
  };
  const codeEditorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true,
    readOnly: true
  };

  const handleCopyQuestionCode = async () => {
    if (!questionCodeEntry.code) return;
    try {
      await writeTeacherCodeToClipboard(questionCodeEntry.code);
      setQuestionCodeCopyState('copied');
    } catch {
      setQuestionCodeCopyState('error');
    }
    if (questionCodeCopyResetTimerRef.current) {
      clearTimeout(questionCodeCopyResetTimerRef.current);
    }
    questionCodeCopyResetTimerRef.current = setTimeout(() => {
      setQuestionCodeCopyState('idle');
      questionCodeCopyResetTimerRef.current = null;
    }, TEACHER_CODE_COPY_FEEDBACK_MS);
  };

  const handleCopyQuestionToBoard = async () => {
    if (!currentQuestion) return;
    const copied = await writeBoardTaskToClipboard({
      metadata: {
        taskNumber,
        taskDisplayNumber,
        taskTitle: task?.title || '',
        levelId,
        levelTitle: activeLevel?.label || '',
        questionId: currentId,
        questionNumber: currentIndex + 1,
        questionLabel: currentQuestionLabel?.text || '',
      },
      questionText: currentQuestion.question || '',
      screenshots: Array.isArray(currentQuestion.screenshots) ? currentQuestion.screenshots : [],
      answerCount,
      answerLabels,
      studentAnswers: studentAnswerValues,
      studentCode: questionCodeEntry.code,
      sourceStudentId: studentId,
    });
    setQuestionBoardCopyState(copied ? 'copied' : 'error');
    if (questionBoardCopyResetTimerRef.current) {
      clearTimeout(questionBoardCopyResetTimerRef.current);
    }
    questionBoardCopyResetTimerRef.current = setTimeout(() => {
      setQuestionBoardCopyState('idle');
      questionBoardCopyResetTimerRef.current = null;
    }, TEACHER_CODE_COPY_FEEDBACK_MS);
  };

  const modal = (
    <>
      <div className="student-test-modal-backdrop fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-0 sm:p-3 md:p-5">
        <div className="student-test-workspace student-test-workspace--animated modal-card relative flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden sm:h-auto sm:max-h-[94dvh]">
        <header className="student-test-header shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="student-test-header-icon hidden sm:flex">
              <ListChecks size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {activeLevel && (
                  <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase sm:text-[11px] ${activeLevel.color || 'bg-purple-100 text-purple-700'}`}>
                    {activeLevel.label}
                  </span>
                )}
                <span className="student-test-xp-badge">Просмотр ученика</span>
              </div>
              <h2 className="student-test-title mt-1.5 truncate">
                Задание {taskDisplayNumber}: {task.title}
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
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="student-test-navigation shrink-0">
          <div className="teacher-test-review-levels">
            {levelOptions.map((levelOption) => {
              const levelQuestions = testDb?.[task.number]?.[levelOption.id];
              const questionCount = Array.isArray(levelQuestions) ? levelQuestions.length : 0;
              const active = levelOption.id === levelId;
              return (
                <button
                  key={levelOption.id}
                  type="button"
                  onClick={() => setLevelId(levelOption.id)}
                  disabled={questionCount === 0}
                  className={`teacher-test-review-level-button ${active ? 'is-active' : ''}`}
                  aria-pressed={active}
                >
                  <span>{levelOption.label}</span>
                  <small>{questionCount}</small>
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="student-test-question-caption">
              {hasQuestions ? `Вопрос ${currentIndex + 1} из ${questions.length}` : 'Вопросов пока нет'}
            </span>
            <span className="student-test-mobile-progress sm:hidden">
              {solvedQuestionCount}/{questions.length} решено
            </span>
          </div>

          {hasQuestions && (
            <div className="student-test-question-list mt-2 flex gap-2 overflow-x-auto">
              {questions.map((question, index) => {
                const questionId = String(question?.id ?? index);
                const state = getQuestionState(question, index);
                const current = index === currentIndex;
                const stateClass = state === 'solved' ? 'is-correct' : (state === 'wrong' ? 'is-wrong' : '');
                const title = state === 'solved'
                  ? `Вопрос №${index + 1} решён`
                  : (state === 'wrong' ? `Вопрос №${index + 1}: были неверные попытки` : `Вопрос №${index + 1}`);
                return (
                  <button
                    key={questionId}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`student-test-question-button ${current ? 'is-current' : ''} ${stateClass}`}
                    style={{ '--student-test-item-index': index }}
                    title={title}
                    aria-current={current ? 'step' : undefined}
                  >
                    {state === 'solved' ? <Check size={14} strokeWidth={3} /> : index + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          disabled={!hasQuestions || currentIndex === 0}
          className={`student-test-side-nav student-test-side-nav--prev is-${previousQuestionState}`}
          aria-label="Предыдущее задание"
        >
          <span className="student-test-side-nav__glow" aria-hidden="true" />
          <span className="student-test-side-nav__sheen" aria-hidden="true" />
          <ChevronLeft size={24} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
          disabled={!hasQuestions || currentIndex >= questions.length - 1}
          className={`student-test-side-nav student-test-side-nav--next is-${nextQuestionState}`}
          aria-label="Следующее задание"
        >
          <span className="student-test-side-nav__glow" aria-hidden="true" />
          <span className="student-test-side-nav__sheen" aria-hidden="true" />
          <ChevronRight size={24} strokeWidth={2.5} />
        </button>

        <div className="student-test-scroll flex-1 overflow-y-auto">
          <div key={`${levelId}:${currentId}`} className="student-test-content student-test-content--question-enter mx-auto w-full max-w-5xl">
            {!hasQuestions ? (
              <section className="student-test-question-panel student-test-panel-enter py-10 text-center text-gray-500">
                Для этого уровня пока нет задач.
              </section>
            ) : (
              <>
                <section className="student-test-question-panel student-test-panel-enter">
                  <div className="student-test-question-panel__toolbar flex-wrap">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {currentQuestionLabel && (
                        <span
                          className="inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-bold shadow-sm"
                          style={getQuestionLabelStyle(currentQuestionLabel)}
                        >
                          <span className="truncate">{currentQuestionLabel.text}</span>
                        </span>
                      )}
                      <QuestionDifficultyBadge
                        difficulty={questionDifficultyById?.[currentId]}
                        theme={theme}
                        showDetails
                        showWhenEmpty
                      />
                    </div>
                    <div className="student-test-question-panel__toolbar-actions">
                      <button
                        type="button"
                        className={`teacher-board-task-copy ${questionBoardCopyState === 'copied' ? 'is-copied' : ''} ${questionBoardCopyState === 'error' ? 'is-error' : ''}`}
                        onClick={() => { void handleCopyQuestionToBoard(); }}
                        title="Скопировать условие и интерактивные поля, затем вставить их на доску через Ctrl+V"
                      >
                        {questionBoardCopyState === 'copied' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                        <span>{questionBoardCopyState === 'copied'
                          ? 'Задание скопировано'
                          : (questionBoardCopyState === 'error' ? 'Не удалось скопировать' : 'Скопировать задание')}</span>
                      </button>
                      {typeof onAddToHomeworkLessonBasket === 'function' && (
                        <button
                          type="button"
                          onClick={() => onAddToHomeworkLessonBasket(currentBasketItem)}
                          disabled={!currentBasketItem || currentQuestionInBasket}
                          className={`inline-flex min-h-9 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 ${
                            currentQuestionInBasket
                              ? 'cursor-default border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-purple-200 bg-purple-50 text-purple-700 hover:border-purple-300 hover:bg-purple-100'
                          }`}
                          title={currentQuestionInBasket ? 'Это задание уже добавлено' : 'Добавить текущий номер в черновик домашки'}
                        >
                          {currentQuestionInBasket ? <Check size={15} aria-hidden="true" /> : <ListPlus size={15} aria-hidden="true" />}
                          <span>{currentQuestionInBasket ? 'В черновике ДЗ' : 'В черновик ДЗ'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={`student-test-code-preview-trigger ${questionCodePreviewOpen ? 'is-active' : ''}`}
                        onClick={() => setQuestionCodePreviewOpen((open) => !open)}
                        aria-expanded={questionCodePreviewOpen}
                        aria-controls="teacher-test-student-code-preview"
                      >
                        <FileCode2 size={16} aria-hidden="true" />
                        <span>{questionCodePreviewOpen ? 'Скрыть код' : 'Код ученика'}</span>
                        <ChevronDown size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {screenshots.length > 0 && (
                    <div className="mb-5 space-y-2.5 md:mb-6 md:space-y-3">
                      {screenshots.map((image, imageIndex) => {
                        const imageKey = String(image.id || image.storageName || image.url || imageIndex);
                        const imageState = questionImageStateByKey[imageKey] || {};
                        const storedWidth = Number(image.width);
                        const storedHeight = Number(image.height);
                        const aspectRatio = storedWidth > 0 && storedHeight > 0
                          ? Math.max(1.6, Math.min(5.8, storedWidth / storedHeight))
                          : 3.8;
                        return (
                          <div
                            key={imageKey}
                            className={`student-test-screenshot ${imageState.loaded ? 'is-loaded' : 'is-loading'} max-h-[42vh] overflow-hidden rounded-2xl border sm:max-h-[55vh] md:max-h-[65vh]`}
                            style={{
                              '--student-test-item-index': imageIndex,
                              '--student-test-image-aspect': imageState.aspectRatio || aspectRatio,
                            }}
                            aria-busy={!imageState.loaded}
                          >
                            <div className="student-test-screenshot__loader" aria-hidden={Boolean(imageState.loaded)}>
                              <RefreshCcw size={18} aria-hidden="true" />
                              <span>Загрузка изображения задания…</span>
                            </div>
                            <img
                              src={image.url}
                              alt={image.name || 'Скриншот'}
                              className="w-full cursor-zoom-in object-contain"
                              onLoad={(event) => {
                                const width = Number(event.currentTarget.naturalWidth);
                                const height = Number(event.currentTarget.naturalHeight);
                                setQuestionImageStateByKey((previous) => ({
                                  ...previous,
                                  [imageKey]: {
                                    loaded: true,
                                    aspectRatio: width > 0 && height > 0
                                      ? Math.max(1.6, Math.min(5.8, width / height))
                                      : aspectRatio,
                                  },
                                }));
                              }}
                              onError={() => setQuestionImageStateByKey((previous) => ({
                                ...previous,
                                [imageKey]: { ...(previous?.[imageKey] || {}), loaded: true },
                              }))}
                              onClick={() => setExpandedImage(image)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {extraFiles.length > 0 && (
                    <div className="mb-5 md:mb-6">
                      <p className="mb-2 text-xs font-bold uppercase text-gray-400">Доп. файлы</p>
                      <div className="space-y-2">
                        {extraFiles.map((file, fileIndex) => (
                          <a
                            key={file.id || file.url}
                            href={buildDownloadUrl(file.url)}
                            download={file?.name || undefined}
                            style={{ '--student-test-item-index': fileIndex }}
                            className="student-test-file flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                          >
                            <span className="truncate">{file.name}</span>
                            <Download size={16} className="text-purple-600" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {isSolved && (
                    <div className="student-test-solved-label mb-2 text-xs font-semibold uppercase tracking-wide text-green-600">
                      Решено учеником
                    </div>
                  )}
                  {!isSolved && answerHistory.length > 0 && (
                    <div className="student-test-solved-label mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                      Есть попытки решения
                    </div>
                  )}
                  {currentQuestion?.question && (
                    <p className="student-test-question-text mb-5 whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-gray-900 md:mb-6 md:text-lg">
                      {currentQuestion.question}
                    </p>
                  )}
                </section>

                <section className={`student-test-answer-panel student-test-panel-enter space-y-4 ${
                  isSolved
                    ? 'student-test-answer-panel--correct'
                    : (answerHistory.length > 0 ? 'student-test-answer-panel--wrong' : 'student-test-answer-panel--pending')
                }`}>
                  <div className="teacher-test-review-answer-grid">
                    <article className={`teacher-test-review-answer-card is-student is-${studentAnswerStatus}`}>
                      <div className="teacher-test-review-answer-card__header">
                        <div>
                          <span className="teacher-test-review-answer-card__eyebrow">Ответ ученика</span>
                          <strong>Последний введённый ответ</strong>
                        </div>
                        <span className={`teacher-test-review-answer-status is-${studentAnswerStatus}`}>
                          {studentAnswerStatusLabel}
                        </span>
                      </div>
                      <ReviewAnswerFields
                        values={studentAnswerValues}
                        answerCount={answerCount}
                        answerLabels={answerLabels}
                        variant={studentAnswerStatus === 'wrong' ? 'wrong' : 'student'}
                      />
                      {!hasStudentAnswer && (
                        <p className="teacher-test-review-answer-card__hint">Ученик ещё не вводил ответ на этот вопрос.</p>
                      )}
                    </article>

                    <article className="teacher-test-review-answer-card is-correct">
                      <div className="teacher-test-review-answer-card__header">
                        <div>
                          <span className="teacher-test-review-answer-card__eyebrow">Правильный ответ</span>
                          <strong>Ответ из базы заданий</strong>
                        </div>
                        <span className="teacher-test-review-answer-status is-correct">Эталон</span>
                      </div>
                      <ReviewAnswerFields
                        values={expectedAnswers}
                        answerCount={answerCount}
                        answerLabels={answerLabels}
                        variant="correct"
                      />
                    </article>
                  </div>

                  <div className="student-test-answer-meta">
                    <details
                      key={`${levelId}:${currentId}:history`}
                      className="student-test-history"
                      open={answerHistory.length > 0}
                    >
                      <summary className="student-test-history-summary" aria-label="История ответов ученика">
                        <span className="student-test-history-summary__label">
                          <History size={14} className="student-test-history-icon" />
                          <span>История ответов ученика</span>
                        </span>
                        <span className="student-test-history-summary__count">
                          {answerHistoryLoading ? '...' : answerHistory.length}
                        </span>
                        <ChevronDown size={14} className="student-test-history-summary__chevron" aria-hidden="true" />
                      </summary>
                      <div className="student-test-history__content space-y-2">
                        {answerHistoryLoading ? (
                          <div className="text-xs text-gray-500">Загрузка…</div>
                        ) : answerHistoryError ? (
                          <div className="text-xs text-red-500">{answerHistoryError}</div>
                        ) : answerHistoryLatestFirst.length > 0 ? (
                          answerHistoryLatestFirst.map((entry, index) => {
                            const timeLabel = formatAnswerHistoryTime(entry.submittedAt);
                            return (
                              <div
                                key={entry.id || `${entry.submittedAt}-${index}`}
                                className="student-test-history-entry rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs"
                                style={{ '--student-test-item-index': index }}
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
                  </div>
                </section>

                {questionCodePreviewOpen && (
                  <section className="student-test-code-panel student-test-panel-enter">
                    <div className="student-test-code-launch-card is-preview-open">
                      <div className="student-test-code-launch-card__main">
                        <span className="student-test-code-launch-card__icon" aria-hidden="true">
                          <FileCode2 size={18} />
                        </span>
                        <div className="min-w-0">
                          <div className="student-test-code-launch-card__title">Код ученика</div>
                          <div className="student-test-code-launch-card__meta">
                            {questionCodeUpdatedAtLabel ? `Сохранено ${questionCodeUpdatedAtLabel}` : 'Код для вопроса не сохранён'}
                          </div>
                        </div>
                      </div>
                      <div className="student-test-code-launch-card__actions">
                        <button
                          type="button"
                          onClick={handleCopyQuestionCode}
                          disabled={questionCodeLoading || !questionCodeEntry.code}
                          className={`student-test-code-launch-card__preview-toggle ${questionCodeCopyState === 'copied' ? 'is-copied' : ''}`}
                        >
                          {questionCodeCopyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
                          <span>{questionCodeCopyState === 'copied' ? 'Скопировано' : (questionCodeCopyState === 'error' ? 'Не удалось' : 'Копировать')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionCodePreviewOpen(false)}
                          className="student-test-code-launch-card__preview-toggle"
                        >
                          <span>Скрыть код</span>
                          <ChevronDown size={15} aria-hidden="true" />
                        </button>
                      </div>
                      <div id="teacher-test-student-code-preview" className="student-test-code-preview">
                        {questionCodeLoading ? (
                          <div className="student-test-code-preview__message" role="status">
                            <RefreshCcw size={16} className="animate-spin" />
                            Загружаем сохранённый код…
                          </div>
                        ) : questionCodeError ? (
                          <div className="student-test-code-preview__message is-error" role="alert">
                            <span>{questionCodeError}</span>
                            <button type="button" onClick={() => loadQuestionCode(currentId, true)}>Повторить</button>
                          </div>
                        ) : (
                          <div className="student-test-code-preview__editor">
                            <Editor
                              height="clamp(300px, 42dvh, 480px)"
                              language="python"
                              theme={monacoTheme}
                              beforeMount={ensureMonacoColorTheme}
                              value={questionCodeEntry.code || '# Код не сохранён'}
                              options={codeEditorOptions}
                              loading={<div className="student-test-code-preview__message">Загрузка редактора…</div>}
                            />
                          </div>
                        )}
                        <div className="teacher-test-review-stdin">
                          <strong>Ввод (stdin)</strong>
                          <pre>{questionCodeEntry.input || '—'}</pre>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>

          <footer className="student-test-footer shrink-0">
            <div className="teacher-test-review-footer-summary mr-auto">
              Решено: <strong>{solvedQuestionCount}/{questions.length}</strong>
            </div>
            <Button variant="secondary" onClick={onClose}>Закрыть</Button>
            <Button
              onClick={() => {
                if (!hasQuestions || currentIndex >= questions.length - 1) {
                  onClose();
                  return;
                }
                setCurrentIndex((index) => index + 1);
              }}
              disabled={!hasQuestions}
              className="student-test-primary-action is-ready"
            >
              {currentIndex >= questions.length - 1 ? 'Закрыть просмотр' : 'Следующее задание'}
            </Button>
          </footer>
        </div>
      </div>

      {expandedImage && (
        <div
          className="student-test-image-lightbox fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExpandedImage(null);
          }}
        >
          <div className="relative max-h-[95vh] max-w-[95vw]">
            <img
              src={expandedImage.url}
              alt={expandedImage.name || 'Скриншот'}
              className="student-test-image-lightbox__image h-full w-full rounded-2xl object-contain shadow-2xl"
              style={{ maxHeight: '95vh' }}
            />
            <button
              type="button"
              onClick={() => setExpandedImage(null)}
              className="absolute right-3 top-3 rounded-full bg-white/90 p-2 hover:bg-white"
              aria-label="Закрыть изображение"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};



export default ProgressReviewModal;

