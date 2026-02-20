import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import { Download, RefreshCcw, X } from 'lucide-react';
import { api } from '../services/api';
import { Button } from './ui';
const PythonTestModal = ({
  task,
  onClose,
  onComplete,
  progress,
  studentId,
  testDb,
  initialQuestionIndex,
  onQuestionChange,
  onStreakSaved,
  onXpGain,
  PYTHON_LEVEL_ID,
  ensurePyodideReady,
  mergeRuntimeErrorText,
  createPyodideWorker,
  withStudentId,
  isGoogleDocEmbedUrl,
  normalizeOutput,
  PYODIDE_RUN_TIMEOUT_MS,
  ALLOW_MAIN_THREAD_PYTHON_FALLBACK,
  normalizeOutputForComparison,
  normalizeRuntimeErrorForCheck,
  getLocalDayKey,
  normalizeXpTotal,
  buildGoogleDocFullUrl,
}) => {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedCodeById, setSolvedCodeById] = useState({});
  const [expandedImage, setExpandedImage] = useState(null);
  const [code, setCode] = useState('');
  const [runnerLoading, setRunnerLoading] = useState(false);
  const [runnerError, setRunnerError] = useState('');
  const [testResults, setTestResults] = useState([]);
  const isMobileViewport = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 767px)').matches
    : false;
  const [showTheory, setShowTheory] = useState(() => (
    typeof window === 'undefined'
      ? true
      : !window.matchMedia('(max-width: 767px)').matches
  ));
  const [expandedTestIndex, setExpandedTestIndex] = useState(null);
  const currentQuestionIdRef = useRef(null);
  const runnerWorkerRef = useRef(null);
  const runnerPendingRef = useRef(new Map());
  const runnerWarmupStartedRef = useRef(false);

  const currentMastery = progress[task.id] || 0;
  const getQuestionIndexKey = () => {
    const safeStudentId = studentId || 'anon';
    const taskNum = task?.number || 'task';
    return `py_last_q_${safeStudentId}_${taskNum}`;
  };
  const getDraftKey = (questionId) => {
    const safeStudentId = studentId || 'anon';
    return `py_draft_${safeStudentId}_${task?.number || 'task'}_${questionId}`;
  };

  useEffect(() => {
    const qs = testDb?.[task.number]?.[PYTHON_LEVEL_ID] || [];
    const list = Array.isArray(qs) ? qs : [];
    let rawIndex = Number(initialQuestionIndex);
    if (!Number.isFinite(rawIndex) && typeof window !== 'undefined') {
      try {
        rawIndex = Number(window.localStorage.getItem(getQuestionIndexKey()));
      } catch {}
    }
    const safeIndex = Number.isFinite(rawIndex) && list.length > 0
      ? Math.max(0, Math.min(list.length - 1, Math.floor(rawIndex)))
      : 0;
    setQuestions(list);
    if (list.length > 0) {
      setCurrentIndex(safeIndex);
    }
    setSolvedIds(new Set());
    setSolvedCodeById({});
    setTestResults([]);
    setRunnerError('');
    if (studentId) {
      api.getSolvedQuestions(studentId, task.number, PYTHON_LEVEL_ID, { includeCode: true })
        .then((payload) => {
          if (Array.isArray(payload)) {
            setSolvedIds(new Set(payload.map((id) => String(id))));
            setSolvedCodeById({});
          } else {
            const ids = Array.isArray(payload?.ids) ? payload.ids : [];
            const codeById = payload?.codeById && typeof payload.codeById === 'object' ? payload.codeById : {};
            setSolvedIds(new Set(ids.map((id) => String(id))));
            setSolvedCodeById(codeById);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [task?.number, testDb, studentId, initialQuestionIndex]);

  useEffect(() => {
    if (!Number.isFinite(currentIndex)) return;
    if (!questions.length) return;
    onQuestionChange?.(currentIndex);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(getQuestionIndexKey(), String(currentIndex));
    } catch {}
  }, [currentIndex, questions.length, onQuestionChange]);

  useEffect(() => {
    const current = questions[currentIndex];
    const currentId = String(current?.id ?? currentIndex);
    currentQuestionIdRef.current = currentId;
    const starter = current?.starterCode || '';
    const solvedCode = solvedCodeById?.[currentId];
    let nextCode = typeof solvedCode === 'string' ? solvedCode : starter;
    if (typeof window !== 'undefined') {
      try {
        const draft = window.localStorage.getItem(getDraftKey(currentId));
        if (typeof draft === 'string' && draft.length > 0) {
          nextCode = draft;
        }
      } catch {}
    }
    setCode(nextCode);
    setTestResults([]);
    setRunnerError('');
    setExpandedTestIndex(null);
  }, [questions, currentIndex, solvedCodeById, studentId, task?.number]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentId = currentQuestionIdRef.current;
    if (!currentId) return;
    try {
      if (code && code.length > 0) {
        window.localStorage.setItem(getDraftKey(currentId), code);
      } else {
        window.localStorage.removeItem(getDraftKey(currentId));
      }
    } catch {}
  }, [code, studentId, task?.number]);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  const resolvePendingRuns = (message) => {
    runnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({ output, error });
    });
    runnerPendingRef.current.clear();
  };

  const disposeRunnerWorker = (message) => {
    if (runnerWorkerRef.current) {
      runnerWorkerRef.current.terminate();
      runnerWorkerRef.current = null;
    }
    if (message) resolvePendingRuns(message);
  };

  const ensureRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (runnerWorkerRef.current) return runnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = runnerPendingRef.current.get(data.id);
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
        runnerPendingRef.current.delete(data.id);
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
      worker.onerror = () => disposeRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposeRunnerWorker('Ошибка выполнения Python.');
      runnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  useEffect(() => () => disposeRunnerWorker('Python runner stopped.'), []);

  const runPythonInMainThread = async (source, inputValue) => {
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

  const runPythonCode = async (source, inputValue, onProgress = null) => {
    const worker = ensureRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = runnerPendingRef.current.get(id);
          if (!pending) return;
          runnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error });
          disposeRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        runnerPendingRef.current.set(id, {
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
    return runPythonInMainThread(source, inputValue);
  };

  useEffect(() => {
    if (runnerWarmupStartedRef.current) return;
    runnerWarmupStartedRef.current = true;
    runPythonCode('pass', '').catch(() => {});
  }, []);

  const handleRunTests = async (sourceRect = null) => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;
    setRunnerLoading(true);
    setRunnerError('');
    const rawTests = Array.isArray(currentQuestion.tests)
      ? currentQuestion.tests
      : (currentQuestion.answer ? [{ input: '', output: currentQuestion.answer }] : []);
    const hasExpectedOutputs = rawTests.every((test) => (
      Object.prototype.hasOwnProperty.call(test || {}, 'output')
    ));
    const sanitizedTests = rawTests.map((test) => ({
      input: String(test?.input ?? ''),
      output: hasExpectedOutputs ? String(test?.output ?? '') : '',
    }));
    if (sanitizedTests.length === 0) {
      setRunnerLoading(false);
      setRunnerError('Для этой задачи пока нет тестов.');
      setTestResults([]);
      return;
    }
    try {
      const resultsList = [];
      for (const test of sanitizedTests) {
        const res = await runPythonCode(code, test.input);
        const normalizedOut = normalizeOutputForComparison(res.output);
        const normalizedExpected = normalizeOutputForComparison(test.output);
        const runtimeErrorText = normalizeRuntimeErrorForCheck(res.error);
        const hasRuntimeError = runtimeErrorText.length > 0;
        const failReason = hasRuntimeError
          ? 'runtime'
          : (normalizedOut === normalizedExpected ? '' : 'mismatch');
        const passed = hasExpectedOutputs
          ? failReason === ''
          : undefined;
        resultsList.push({
          input: test.input,
          expected: test.output,
          output: res.output,
          error: runtimeErrorText,
          passed,
          failReason,
        });
      }
      setTestResults(resultsList);

      const allPassed = hasExpectedOutputs
        && resultsList.length > 0
        && resultsList.every((item) => item.passed === true);
      const canSubmitWithoutExpected = !hasExpectedOutputs
        && resultsList.length > 0
        && resultsList.every((item) => !String(item.error ?? '').trim());
      const shouldSubmit = allPassed || canSubmitWithoutExpected;

      if (shouldSubmit) {
        const currentId = String(currentQuestion?.id ?? currentIndex);
        if (studentId) {
          try {
            const resp = await api.solveQuestion({
              studentId,
              taskNumber: task.number,
              levelId: PYTHON_LEVEL_ID,
              questionId: currentQuestion.id,
              totalQuestions: questions.length,
              levelMax: 100,
              levelTotals: { [PYTHON_LEVEL_ID]: questions.length },
              code,
              localDay: getLocalDayKey(),
              pythonResults: resultsList.map((item) => ({
                input: String(item?.input ?? ''),
                output: String(item?.output ?? ''),
                error: String(item?.error ?? ''),
              })),
            });
            setSolvedIds((prev) => {
              const next = new Set(prev);
              next.add(currentId);
              return next;
            });
            setSolvedCodeById((prev) => ({ ...prev, [currentId]: code }));
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
                sourceRect: sourceRect && Number.isFinite(sourceRect.left) && Number.isFinite(sourceRect.top)
                  ? sourceRect
                  : null,
              });
            }
            if (typeof resp?.taskProgress === 'number') {
              onComplete(task.id, resp.taskProgress, { skipServer: true });
              setRunnerLoading(false);
              return;
            }
          } catch (err) {
            const message = String(err?.message || err || '');
            setRunnerError(message || 'Не удалось сохранить результат');
            return;
          }
        } else if (!allPassed) {
          setRunnerError('Проверка без эталонных ответов доступна только для ученика.');
          return;
        }
        const totalCount = questions.length;
        if (totalCount > 0) {
          const prevSolved = solvedIds.size;
          const nextSolved = solvedIds.has(currentId) ? prevSolved : prevSolved + 1;
          const nextProgress = Math.round((nextSolved / totalCount) * 100);
          onComplete(task.id, Math.min(100, nextProgress), { skipServer: true });
        }
      }
    } catch (err) {
      setRunnerError(err?.message || err);
    } finally {
      setRunnerLoading(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1);
    else onClose();
  };

  if (!task) return null;
  const testsLoading = testDb === null || typeof testDb === 'undefined';

  if (testsLoading) {
    const loadingModal = (
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4">
        <div className="surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <div className="mx-auto inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700">
            <RefreshCcw size={14} className="animate-spin" />
            Загрузка заданий...
          </div>
          <p className="text-gray-500 mt-3 text-sm">Подождите немного, загружаем задания и тесты.</p>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(loadingModal, document.body) : null;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    const emptyModal = (
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4">
        <div className="surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <h2 className="text-2xl font-bold text-gray-900">Заданий пока нет</h2>
          <p className="text-gray-500 mt-2">Учитель еще не добавил задания для этой темы.</p>
          <div className="mt-6">
            <Button onClick={onClose}>Закрыть</Button>
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(emptyModal, document.body) : null;
  }

  const currentQuestion = questions[currentIndex];
  const currentId = String(currentQuestion?.id ?? currentIndex);
  const isSolved = solvedIds.has(currentId);
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
  const rawTests = Array.isArray(currentQuestion?.tests)
    ? currentQuestion.tests
    : (currentQuestion?.answer ? [{ input: '', output: currentQuestion.answer }] : []);
  const testsToShow = rawTests.map((test) => ({
    input: String(test?.input ?? ''),
    output: String(test?.output ?? '')
  }));
  const solvedAllTests = isSolved && testResults.length === 0;
  const theory = testDb?.[task.number]?.pythonTheory || null;
  const theoryFullUrl = theory?.type === 'gdoc' ? buildGoogleDocFullUrl(theory.content) : '';
  const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoIndent: 'advanced',
    formatOnType: true,
    formatOnPaste: true
  };
  const codeEditorHeight = isMobileViewport ? '170px' : '260px';

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="surface-card modal-card rounded-2xl md:rounded-3xl w-full max-w-5xl max-h-[95svh] md:max-h-[90vh] p-3.5 sm:p-4 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex flex-col gap-3 md:gap-4 mb-3 md:mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Тема</div>
              <div className="text-base md:text-lg font-bold text-gray-900 leading-tight">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={18}/></button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 pr-1">
            {questions.map((q, idx) => {
              const qId = String(q?.id ?? idx);
              const solved = solvedIds.has(qId);
              const isCurrent = idx === currentIndex;
              let btnClass = "shrink-0 w-9 h-9 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";

              if (isCurrent && solved) {
                btnClass += "border-green-400 ring-2 ring-green-100 bg-green-100 text-green-700";
              } else if (isCurrent) {
                btnClass += "border-purple-600 ring-2 ring-purple-200 text-purple-600 bg-white";
              } else if (solved) {
                btnClass += "border-green-200 bg-green-100 text-green-600";
              } else {
                btnClass += "border-gray-300 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700";
              }

              return (
                <button
                  key={qId}
                  onClick={() => setCurrentIndex(idx)}
                  className={btnClass}
                  title={solved ? 'Решено' : undefined}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[11px] md:text-xs text-slate-500">
            <span>Задание {currentIndex + 1} из {questions.length}</span>
            {isSolved ? (
              <span className="font-semibold text-emerald-600">Решено</span>
            ) : (
              <span className="font-medium text-slate-400">Не решено</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-0 md:pr-1">
          {theory?.content && (
            <div className="mb-4 md:mb-6 rounded-2xl border border-purple-100 bg-purple-50/60 p-3 md:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Теория</div>
                <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs">
                  {theoryFullUrl && (
                    <a
                      href={theoryFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-700"
                    >
                      Открыть полностью
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTheory((prev) => !prev)}
                    className="text-purple-600 hover:text-purple-700"
                  >
                    {showTheory ? 'Свернуть' : 'Показать'}
                  </button>
                </div>
              </div>
              {showTheory && (
                theory.type === 'gdoc' ? (
                  isGoogleDocEmbedUrl(theory.content) ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-purple-100 bg-white">
                      <iframe
                        title={`theory-${task.number}`}
                        src={theory.content}
                        className="w-full h-[240px] md:h-[360px]"
                      />
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-red-500">
                      Нужна ссылка для встраивания Google Docs (Файл → Опубликовать в интернете → Встроить).
                    </div>
                  )
                ) : (
                  <div className="mt-3 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed max-h-[34svh] overflow-y-auto pr-1 md:max-h-none md:overflow-visible md:pr-0">
                    {theory.content}
                  </div>
                )
              )}
            </div>
          )}
          {screenshots.length > 0 && (
            <div className="space-y-2.5 md:space-y-3 mb-5 md:mb-6">
              {screenshots.map((img) => (
                <div
                  key={img.id || img.url}
                  className="border rounded-2xl overflow-hidden bg-gray-900/5 max-h-[42vh] sm:max-h-[55vh] md:max-h-[65vh]"
                >
                  <img
                    src={img.url}
                    alt={img.name || 'Скриншот'}
                    className="w-full object-contain cursor-zoom-in"
                    style={{ maxHeight: isMobileViewport ? '42vh' : '65vh' }}
                    onClick={() => setExpandedImage(img)}
                  />
                </div>
              ))}
            </div>
          )}

          {extraFiles.length > 0 && (
            <div className="mb-5 md:mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase mb-2">Доп. файлы</p>
              <div className="space-y-2">
                {extraFiles.map((file) => (
                  <a
                    key={file.id || file.url}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                  >
                    <span className="truncate">{file.name}</span>
                    <Download size={16} className="text-purple-600" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {isSolved && (
            <div className="mb-2 text-xs font-semibold text-green-600 uppercase tracking-wide">Решено ранее</div>
          )}
          {currentQuestion?.question && (
            <p className="text-[15px] md:text-lg font-medium leading-relaxed text-gray-900 mb-5 md:mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
          )}

          <div className="space-y-3 mb-5 md:mb-6">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-gray-400 uppercase">Код</label>
              <button
                type="button"
                onClick={() => setCode(currentQuestion?.starterCode || '')}
                className="text-xs text-purple-600 hover:text-purple-700"
              >
                Сбросить
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-gray-800">
              <Editor
                height={codeEditorHeight}
                language="python"
                theme="vs-dark"
                value={code}
                onChange={(value) => {
                  setCode(value ?? '');
                  if (testResults.length > 0) setTestResults([]);
                }}
                options={editorOptions}
                loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
              />
            </div>
          </div>

          {runnerError && (
            <div className="mb-4 text-sm text-red-500">{runnerError}</div>
          )}

          <div className="space-y-3 mb-5 md:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-xs font-bold text-gray-400 uppercase">Тесты</div>
              <Button
                onClick={(event) => {
                  const rect = event?.currentTarget?.getBoundingClientRect?.();
                  handleRunTests(rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)
                    ? {
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height,
                      }
                    : null);
                }}
                disabled={runnerLoading || !code.trim()}
                className="w-full sm:w-auto"
              >
                {runnerLoading ? 'Запуск...' : 'Запустить тесты'}
              </Button>
            </div>
            {testsToShow.length === 0 ? (
              <div className="text-sm text-gray-500">Учитель еще не добавил тесты.</div>
            ) : (
              <div className="space-y-2">
                {testsToShow.map((item, idx) => {
                  const result = testResults[idx];
                  const passed = result?.passed ?? (solvedAllTests ? true : undefined);
                  const showDetails = !isMobileViewport || Boolean(result) || expandedTestIndex === idx;
                  return (
                    <div
                      key={`${idx}-${item.input}`}
                      className={`rounded-2xl border p-2.5 md:p-3 text-xs md:text-sm ${
                        passed === undefined
                          ? 'border-gray-200 bg-gray-50'
                          : (passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50')
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">Тест {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] md:text-xs font-bold ${
                            passed === undefined ? 'text-gray-400' : (passed ? 'text-emerald-700' : 'text-red-600')
                          }`}>
                            {passed === undefined ? '—' : (passed ? 'OK' : 'Ошибка')}
                          </span>
                          {isMobileViewport && !result && (
                            <button
                              type="button"
                              onClick={() => setExpandedTestIndex((prev) => (prev === idx ? null : idx))}
                              className="text-[11px] font-semibold text-purple-600"
                            >
                              {showDetails ? 'Скрыть' : 'Детали'}
                            </button>
                          )}
                        </div>
                      </div>
                      {showDetails && (
                        <div className="mt-1.5 text-[11px] md:text-xs text-gray-600">
                          <div>
                            <span className="font-semibold">Вход:</span>
                            <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] md:text-xs">{item.input || '—'}</pre>
                          </div>
                          <div>
                            <span className="font-semibold">Ожидалось:</span>
                            <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] md:text-xs">{item.output || '—'}</pre>
                          </div>
                          {result && (
                            <>
                              <div>
                                <span className="font-semibold">Вывод:</span>
                                <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] md:text-xs">{normalizeOutput(result.output) || '—'}</pre>
                              </div>
                              {result.error && <div className="text-red-600 mt-1">{result.error}</div>}
                              {!result.error && result.passed === false && result.failReason === 'mismatch' && (
                                <div className="text-red-600 mt-1">Вывод отличается от ожидаемого из-за скрытых символов/форматирования.</div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-1 rounded-2xl border border-purple-200/80 bg-gradient-to-r from-violet-100/95 via-fuchsia-100/90 to-purple-100/95 px-3 py-3 md:py-3.5 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <div className="text-xs sm:text-sm text-gray-500">
            Прогресс темы: <span className="font-semibold text-purple-700">{currentMastery}%</span>
            <span className="text-gray-400"> • {currentIndex + 1}/{questions.length}</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">Закрыть</Button>
            <Button onClick={handleNext} className="w-full sm:w-auto">
              {currentIndex >= questions.length - 1 ? 'Готово' : 'Дальше'}
            </Button>
          </div>
        </div>
      </div>
      {expandedImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 modal-backdrop flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={expandedImage.url}
              alt={expandedImage.name || 'Скриншот'}
              className="w-full h-full object-contain rounded-2xl shadow-2xl"
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
};



export default PythonTestModal;

