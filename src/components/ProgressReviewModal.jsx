import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import { Download, History, X } from 'lucide-react';
import { api } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from '../utils/monacoTheme';
import { Button } from './ui';
const ProgressReviewModal = ({
  theme = '',
  task,
  onClose,
  studentId,
  testDb,
  LEVELS,
  GAME_THEORY_TASK,
  getAnswerCountForTask,
  getExpectedAnswers,
  withStudentId,
}) => {
  const monacoTheme = resolveMonacoColorTheme(theme);
  const levelOptions = Object.values(LEVELS);
  const [levelId, setLevelId] = useState(levelOptions[0]?.id || 'basic');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [answerById, setAnswerById] = useState({});
  const [answerHistoryById, setAnswerHistoryById] = useState({});
  const [answerHistoryLoading, setAnswerHistoryLoading] = useState(false);
  const [answerHistoryError, setAnswerHistoryError] = useState('');
  const [questionCodeById, setQuestionCodeById] = useState({});
  const [questionCodeLoadingById, setQuestionCodeLoadingById] = useState({});
  const [questionCodeErrorById, setQuestionCodeErrorById] = useState({});

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
    if (!studentId || !task?.number || !levelId) return;
    const key = String(questionId ?? '').trim();
    if (!key) return;
    if (questionCodeLoadingById?.[key]) return;
    const cached = getQuestionCodeEntry(key);
    if (cached.loaded && !force) return;
    setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.getQuestionCode(studentId, task.number, levelId, key);
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
      setQuestionCodeError(key, err?.message || err);
    } finally {
      setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: false }));
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
    if (!task) return;
    const available = levelOptions.filter((lvl) => {
      const list = testDb?.[task.number]?.[lvl.id];
      return Array.isArray(list) && list.length > 0;
    });
    const nextLevel = available[0]?.id || levelOptions[0]?.id || 'basic';
    setLevelId(nextLevel);
  }, [task?.number, testDb]);

  useEffect(() => {
    if (!task || !levelId) return;
    const qs = testDb?.[task.number]?.[levelId] || [];
    setQuestions(Array.isArray(qs) ? qs : []);
    setCurrentIndex(0);
    setSolvedIds(new Set());
    setAnswerById({});
    setAnswerHistoryById({});
    setAnswerHistoryError('');
    setQuestionCodeById({});
    setQuestionCodeLoadingById({});
    setQuestionCodeErrorById({});
    if (studentId) {
      api.getSolvedQuestions(studentId, task.number, levelId, { includeCode: true })
        .then((payload) => {
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
        .catch((err) => console.error(err));
      setAnswerHistoryLoading(true);
      api.getAnswerHistory(studentId, task.number, levelId)
        .then((payload) => setAnswerHistoryById(normalizeAnswerHistoryPayload(payload)))
        .catch((err) => setAnswerHistoryError(String(err?.message || err || 'Не удалось загрузить историю ответов')))
        .finally(() => setAnswerHistoryLoading(false));
    } else {
      setAnswerHistoryLoading(false);
    }
  }, [task?.number, levelId, testDb, studentId]);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  useEffect(() => {
    if (!studentId || !task?.number || !levelId) return;
    const current = questions[currentIndex];
    const currentId = String(current?.id ?? currentIndex).trim();
    if (!currentId) return;
    loadQuestionCode(currentId);
  }, [studentId, task?.number, levelId, questions, currentIndex]);

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
  const currentQuestion = hasQuestions ? questions[currentIndex] : null;
  const currentId = String(currentQuestion?.id ?? currentIndex);
  const isSolved = solvedIds.has(currentId);
  const answerCount = getAnswerCountForTask(task?.number);
  const answerLabels = buildAnswerLabels(answerCount);
  const answerHistory = Array.isArray(answerHistoryById?.[currentId])
    ? answerHistoryById[currentId]
    : [];
  const answerHistoryLatestFirst = answerHistory.slice().reverse();
  const storedAnswers = parseStoredAnswers(answerById?.[currentId]);
  const expectedAnswers = currentQuestion ? getExpectedAnswers(currentQuestion, answerCount) : Array.from({ length: answerCount }, () => '');
  const hasStoredAnswer = Array.isArray(storedAnswers) && storedAnswers.some((val) => String(val ?? '').trim());
  const showingCorrectFallback = !hasStoredAnswer;
  const answerValues = showingCorrectFallback
    ? expectedAnswers
    : (storedAnswers || Array.from({ length: answerCount }, () => ''));
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
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

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="surface-card modal-card rounded-3xl w-full max-w-5xl max-h-[90vh] p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Задание</div>
              <div className="text-lg font-bold text-gray-900">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          </div>

          <div className="flex flex-wrap gap-2">
            {levelOptions.map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                onClick={() => setLevelId(lvl.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  levelId === lvl.id
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                }`}
              >
                {lvl.label}
              </button>
            ))}
          </div>

          {hasQuestions && (
            <div className="flex flex-wrap gap-2">
              {questions.map((q, idx) => {
                const qId = String(q?.id ?? idx);
                const solved = solvedIds.has(qId);
                const attempted = Array.isArray(answerHistoryById?.[qId]) && answerHistoryById[qId].length > 0;
                const isCurrent = idx === currentIndex;
                let btnClass = "w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";

                if (isCurrent && solved) {
                  btnClass += "border-green-400 ring-2 ring-green-100 bg-green-100 text-green-700";
                } else if (isCurrent) {
                  btnClass += "border-purple-600 ring-2 ring-purple-200 bg-purple-600 text-white shadow-sm";
                } else if (solved) {
                  btnClass += "border-green-200 bg-green-100 text-green-600";
                } else if (attempted) {
                  btnClass += "border-amber-200 bg-amber-100 text-amber-700";
                } else {
                  btnClass += "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200";
                }

              return (
                  <button
                    key={qId}
                    onClick={() => setCurrentIndex(idx)}
                    className={btnClass}
                    title={solved ? 'Решено' : (attempted ? 'Были попытки' : 'Не решено')}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {!hasQuestions && (
            <div className="text-center text-gray-500 py-10">Для этого уровня пока нет задач.</div>
          )}

          {hasQuestions && (
            <>
              {screenshots.length > 0 && (
                <div className="space-y-3 mb-6">
                  {screenshots.map((img) => (
                    <div
                      key={img.id || img.url}
                      className="border rounded-2xl overflow-hidden bg-gray-900/5"
                      style={{ maxHeight: '65vh' }}
                    >
                      <img
                        src={img.url}
                        alt={img.name || 'Скриншот'}
                        className="w-full object-contain"
                        style={{ maxHeight: '65vh' }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {extraFiles.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-2">Доп. файлы</p>
                  <div className="space-y-2">
                    {extraFiles.map((file) => (
                      <a
                        key={file.id || file.url}
                        href={buildDownloadUrl(file.url)}
                        download={file?.name || undefined}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white/90 text-sm text-gray-700 shadow-sm hover:border-purple-300 hover:bg-purple-50"
                      >
                        <span className="truncate">{file.name}</span>
                        <Download size={16} className="text-purple-600" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {currentQuestion?.question && (
                <p className="text-lg font-medium text-gray-900 mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
              )}

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-400 uppercase">Ответ ученика</label>
                  {isSolved && <span className="text-xs font-semibold text-emerald-600">Решено</span>}
                </div>
                {answerCount > 1 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Array.from({ length: answerCount }).map((_, idx) => (
                      <div key={`answer-${idx}`} className="space-y-1">
                        <div className="text-xs font-semibold text-gray-500">Ответ {answerLabels[idx]}</div>
                        <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700">
                          {answerValues[idx] ? answerValues[idx] : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700">
                    {answerValues[0] ? answerValues[0] : '—'}
                  </div>
                )}
                {!hasStoredAnswer && (
                  <div className="text-xs text-gray-500">
                    {isSolved ? 'Ответ ученика не сохранён.' : 'Ученик ещё не решил эту задачу.'}
                  </div>
                )}
                {showingCorrectFallback && (
                  <div className="text-xs text-purple-600">
                    Показан правильный ответ из базы.
                  </div>
                )}
              </div>

              <details
                className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                open={answerHistory.length > 0}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-gray-700">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <History size={16} className="text-purple-500" />
                    <span>История ответов ученика</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-gray-500">
                    {answerHistoryLoading ? '...' : answerHistory.length}
                  </span>
                </summary>
                <div className="mt-3 space-y-2">
                  {answerHistoryLoading ? (
                    <div className="text-xs text-gray-500">Загрузка...</div>
                  ) : answerHistoryError ? (
                    <div className="text-xs text-red-500">{answerHistoryError}</div>
                  ) : answerHistoryLatestFirst.length > 0 ? (
                    answerHistoryLatestFirst.map((entry, idx) => {
                      const timeLabel = formatAnswerHistoryTime(entry.submittedAt);
                      return (
                        <div
                          key={entry.id || `${entry.submittedAt}-${idx}`}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs"
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

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-400 uppercase">Код ученика</label>
                  <span className="text-xs text-gray-500">
                    {questionCodeUpdatedAtLabel ? `Сохранено: ${questionCodeUpdatedAtLabel}` : 'Код не сохранён'}
                  </span>
                </div>
                {questionCodeLoading ? (
                  <div className="text-sm text-gray-500">Загрузка кода...</div>
                ) : (
                  <div className="rounded-2xl overflow-hidden border border-gray-800">
                    <Editor
                      height="240px"
                      language="python"
                      theme={monacoTheme}
                      beforeMount={ensureMonacoColorTheme}
                      value={questionCodeEntry.code || '# Код не сохранён'}
                      options={codeEditorOptions}
                      loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                    />
                  </div>
                )}
                <div className="rounded-xl border p-2 bg-gray-50">
                  <div className="text-xs font-semibold text-gray-600 mb-2">Ввод (stdin)</div>
                  <pre className="text-xs bg-white border rounded-lg p-2 overflow-auto max-h-[140px] whitespace-pre-wrap break-words text-gray-800">{questionCodeEntry.input || '—'}</pre>
                </div>
                {questionCodeError && <div className="text-xs text-red-500">{questionCodeError}</div>}
              </div>
            </>
          )}
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Решено: {Array.from(solvedIds).length}/{questions.length}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>Закрыть</Button>
            <Button onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, Math.max(questions.length - 1, 0)))} disabled={!hasQuestions || currentIndex >= questions.length - 1}>
              Дальше
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};



export default ProgressReviewModal;

