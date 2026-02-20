import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import { X } from 'lucide-react';
import { api } from '../services/api';
import { Button } from './ui';
const PythonReviewModal = ({
  task,
  onClose,
  studentId,
  testDb,
  PYTHON_LEVEL_ID,
  isGoogleDocEmbedUrl,
  buildGoogleDocFullUrl,
}) => {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedCodeById, setSolvedCodeById] = useState({});
  const [showTheory, setShowTheory] = useState(true);
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
    if (!studentId || !task?.number) return;
    const key = String(questionId ?? '').trim();
    if (!key) return;
    if (questionCodeLoadingById?.[key]) return;
    const cached = getQuestionCodeEntry(key);
    if (cached.loaded && !force) return;
    setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.getQuestionCode(studentId, task.number, PYTHON_LEVEL_ID, key);
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

  useEffect(() => {
    const qs = testDb?.[task.number]?.[PYTHON_LEVEL_ID] || [];
    setQuestions(Array.isArray(qs) ? qs : []);
    setCurrentIndex(0);
    setSolvedIds(new Set());
    setSolvedCodeById({});
    setQuestionCodeById({});
    setQuestionCodeLoadingById({});
    setQuestionCodeErrorById({});
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
  }, [task?.number, testDb, studentId]);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  useEffect(() => {
    if (!studentId || !task?.number) return;
    const current = questions[currentIndex];
    const currentId = String(current?.id ?? currentIndex).trim();
    if (!currentId) return;
    loadQuestionCode(currentId);
  }, [studentId, task?.number, questions, currentIndex]);

  if (!task) return null;
  const testsLoading = testDb === null || typeof testDb === 'undefined';

  if (testsLoading) {
    const loadingModal = (
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
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
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <h2 className="text-2xl font-bold text-gray-900">Заданий пока нет</h2>
          <p className="text-gray-500 mt-2">Для этой темы нет задач.</p>
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
  const questionCodeEntry = getQuestionCodeEntry(currentId);
  const fallbackSolvedCode = typeof solvedCodeById?.[currentId] === 'string' ? solvedCodeById[currentId] : '';
  const code = questionCodeEntry.code || fallbackSolvedCode;
  const questionCodeLoading = Boolean(questionCodeLoadingById?.[currentId]);
  const questionCodeError = questionCodeErrorById?.[currentId] || '';
  const updatedAtLabel = questionCodeEntry.updatedAt
    ? new Date(questionCodeEntry.updatedAt).toLocaleString('ru-RU')
    : '';
  const theory = testDb?.[task.number]?.pythonTheory || null;
  const theoryFullUrl = theory?.type === 'gdoc' ? buildGoogleDocFullUrl(theory.content) : '';
  const editorOptions = {
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
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Тема</div>
              <div className="text-lg font-bold text-gray-900">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          </div>

          <div className="flex flex-wrap gap-2">
            {questions.map((q, idx) => {
              const qId = String(q?.id ?? idx);
              const solved = solvedIds.has(qId);
              const isCurrent = idx === currentIndex;
              let btnClass = "w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";

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
                  title={solved ? 'Решено' : 'Не решено'}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {theory?.content && (
            <div className="mb-6 rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Теория</div>
                <div className="flex items-center gap-3">
                  {theoryFullUrl && (
                    <a
                      href={theoryFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-600 hover:text-purple-700"
                    >
                      Открыть полностью
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTheory((prev) => !prev)}
                    className="text-xs text-purple-600 hover:text-purple-700"
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
                        title={`theory-review-${task.number}`}
                        src={theory.content}
                        className="w-full h-[300px]"
                      />
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-red-500">
                      Нужна ссылка для встраивания Google Docs (Файл → Опубликовать в интернете → Встроить).
                    </div>
                  )
                ) : (
                  <div className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                    {theory.content}
                  </div>
                )
              )}
            </div>
          )}
          {currentQuestion?.question && (
            <p className="text-lg font-medium text-gray-900 mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
          )}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-gray-400 uppercase">Код ученика</div>
              <div className="text-xs text-gray-500">
                {updatedAtLabel ? `Сохранено: ${updatedAtLabel}` : (fallbackSolvedCode ? 'Код из решения' : 'Код не сохранён')}
              </div>
            </div>
            {questionCodeLoading ? (
              <div className="text-sm text-gray-500">Загрузка кода...</div>
            ) : (
              <div className="rounded-2xl overflow-hidden border border-gray-800">
                <Editor
                  height="280px"
                  language="python"
                  theme="vs-dark"
                  value={code || '# Решение еще не сохранено'}
                  options={editorOptions}
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
          {!isSolved && (
            <div className="mt-3 text-sm text-gray-500">Ученик еще не решил эту задачу.</div>
          )}
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Решено: {Array.from(solvedIds).length}/{questions.length}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>Закрыть</Button>
            <Button onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1))} disabled={currentIndex >= questions.length - 1}>
              Дальше
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};



export default PythonReviewModal;

