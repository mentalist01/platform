import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, X } from 'lucide-react';
import { api } from '../services/api';
import { Button } from './ui';
const MockExamModal = ({
  exam,
  studentId,
  initialAttempt,
  onClose,
  onAttemptSaved,
  MOCK_TASK_NUMBERS,
  getMockAnswerCountForTask,
  allowsPartialAnswers,
  getPrimaryScoreFromSolved,
  getSecondaryScoreFromPrimary,
  withStudentId,
}) => {
  const [selectedTask, setSelectedTask] = useState(MOCK_TASK_NUMBERS[0]);
  const [answers, setAnswers] = useState({});
  const [solved, setSolved] = useState({});
  const [results, setResults] = useState({});
  const [saveError, setSaveError] = useState('');
  const [expandedImage, setExpandedImage] = useState(null);
  const hasLocalAttemptChangesRef = useRef(false);

  const readAttemptAnswers = (attempt) => (
    attempt?.answers && typeof attempt.answers === 'object' ? attempt.answers : {}
  );
  const readAttemptSolved = (attempt) => (
    attempt?.solved && typeof attempt.solved === 'object' ? attempt.solved : {}
  );

  useEffect(() => {
    hasLocalAttemptChangesRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswers(readAttemptAnswers(initialAttempt));
    setSolved(readAttemptSolved(initialAttempt));
    setResults({});
    setSaveError('');
    setSelectedTask(MOCK_TASK_NUMBERS[0]);
  }, [exam?.id, studentId]);

  useEffect(() => {
    if (hasLocalAttemptChangesRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswers(readAttemptAnswers(initialAttempt));
    setSolved(readAttemptSolved(initialAttempt));
    setResults({});
    setSaveError('');
  }, [initialAttempt]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveError('');
  }, [selectedTask]);

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

  const handleCheck = async () => {
    if (!currentQuestion || !studentId) return;
    if (answerCount > 1) {
      const allowPartial = allowsPartialAnswers(selectedTask);
      const provided = Array.from({ length: answerCount }, (_, i) => String(currentAnswers[i] ?? ''));
      if (!allowPartial && provided.some((val) => !val.trim())) return;
      if (allowPartial && provided.every((val) => !val.trim())) return;
    } else {
      if (!String(singleAnswer ?? '').trim()) return;
    }
    hasLocalAttemptChangesRef.current = true;
    setSaveError('');
    try {
      const saved = await api.saveMockAttempt(studentId, exam.id, { answers });
      if (saved && typeof saved === 'object') {
        const savedSolved = readAttemptSolved(saved);
        const isCorrect = Boolean(savedSolved[taskKey]);
        setSolved(savedSolved);
        setResults((prev) => ({ ...prev, [taskKey]: isCorrect }));
        onAttemptSaved?.(exam.id, saved);
      }
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message : '';
      setSaveError(message || 'Не удалось сохранить ответ. Попробуйте снова.');
    }
  };

  const solvedCount = Object.values(solved || {}).filter(Boolean).length;
  const primaryScore = getPrimaryScoreFromSolved(solved);
  const secondaryScore = getSecondaryScoreFromPrimary(primaryScore);
  const firstTaskNumber = MOCK_TASK_NUMBERS[0];
  const lastTaskNumber = MOCK_TASK_NUMBERS[MOCK_TASK_NUMBERS.length - 1];
  const progressPercent = Math.min(100, Math.round((solvedCount / lastTaskNumber) * 100));
  const isFirstTask = selectedTask === firstTaskNumber;
  const isLastTask = selectedTask === lastTaskNumber;
  const handlePrevTask = () => setSelectedTask((prev) => Math.max(firstTaskNumber, prev - 1));
  const handleNextTask = () => setSelectedTask((prev) => Math.min(lastTaskNumber, prev + 1));
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const files = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));

  if (!exam) return null;

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="surface-card modal-card rounded-3xl w-full max-w-6xl max-h-[92vh] p-4 md:p-6 shadow-2xl relative flex flex-col overflow-hidden bg-gradient-to-br from-white via-white to-purple-50/60 border border-purple-100/60">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-purple-50 text-purple-700 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]">
                Пробник
              </span>
              <span className="inline-flex items-center rounded-full border border-purple-100 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                ЕГЭ
              </span>
            </div>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 md:gap-4">
              <h3 className="text-2xl md:text-3xl font-display font-bold text-gray-900">{exam.title}</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="px-2 py-1 rounded-full border border-purple-100 bg-white/80 hidden sm:inline-flex">
                  Баллы: <span className="font-semibold text-purple-700">{secondaryScore}</span>
                  <span className="text-gray-400">{` (${primaryScore} перв.)`}</span>
                </span>
                <span className="px-2 py-1 rounded-full border border-gray-200 bg-white/80 hidden sm:inline-flex">
                  Решено: <span className="font-semibold text-gray-700">{solvedCount}</span>/27
                </span>
                <span className="px-2 py-1 rounded-full border border-purple-100 bg-white/80 sm:hidden">
                  Баллы: <span className="font-semibold text-purple-700">{secondaryScore}</span>
                </span>
              </div>
            </div>
            <div className="max-w-xs hidden sm:block">
              <div className="flex items-center justify-between text-[11px] text-gray-400">
                <span>Прогресс</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-purple-100/70 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/90 border border-gray-200 rounded-full hover:bg-gray-100"><X size={20}/></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 flex-1 overflow-hidden">
          <div className="surface-panel rounded-2xl p-3 overflow-y-auto hidden sm:block">
            <div className="rounded-2xl bg-gradient-to-br from-purple-600 via-purple-600 to-fuchsia-500 text-white p-4 shadow-sm relative overflow-hidden hidden sm:block">
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-purple-100">Прогресс</div>
              <div className="mt-2 text-2xl font-display font-bold">{secondaryScore} баллов</div>
              <div className="text-xs text-purple-100">{primaryScore} первичных</div>
              <div className="mt-3 h-2 rounded-full bg-white/25 overflow-hidden">
                <div className="h-2 rounded-full bg-white transition-all duration-500" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="mt-2 text-[11px] text-purple-100">{solvedCount} из 27 решено</div>
            </div>

            <div className="mt-3 sm:mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500">Задания</div>
                <div className="text-[10px] text-gray-400">1–27</div>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-4 gap-2">
                {MOCK_TASK_NUMBERS.map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSelectedTask(num)}
                    className={`h-10 rounded-xl border text-xs font-semibold transition-all duration-200 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 ${
                      num === selectedTask
                        ? 'border-purple-500 bg-purple-600 text-white shadow-md shadow-purple-200'
                        : (solved[String(num)] ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400' : 'border-gray-200 text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700')
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 text-[11px] text-gray-500">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-purple-600" />
                Текущее
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Решено
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
                Не решено
              </div>
            </div>
          </div>

          <div className="overflow-y-auto pr-1">
            {!currentQuestion ? (
              <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-gray-500 text-sm bg-white/70">
                Задание {selectedTask} ещё не добавлено преподавателем.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/90 border border-purple-100/60 px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-purple-500">Задание</span>
                    <span className="text-lg font-display font-bold text-gray-900">№ {selectedTask}</span>
                    <span className="text-[10px] uppercase tracking-widest text-gray-400">ЕГЭ</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrevTask}
                      disabled={isFirstTask}
                      className="h-9 w-9 rounded-full border border-gray-200 bg-white/90 text-gray-500 transition hover:border-purple-300 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Предыдущее задание"
                    >
                      <ChevronRight size={16} className="rotate-180 mx-auto" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextTask}
                      disabled={isLastTask}
                      className="h-9 w-9 rounded-full border border-gray-200 bg-white/90 text-gray-500 transition hover:border-purple-300 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Следующее задание"
                    >
                      <ChevronRight size={16} className="mx-auto" />
                    </button>
                  </div>
                </div>
                {currentQuestion?.question && (
                  <div className="whitespace-pre-wrap text-gray-900 text-base leading-relaxed bg-white/90 border border-purple-100/60 border-l-4 border-l-purple-400/60 rounded-2xl p-4 pl-5 shadow-sm">
                    {currentQuestion.question}
                  </div>
                )}

                {screenshots.length > 0 && (
                  <div className="space-y-4">
                    {screenshots.map((img) => (
                      <img
                        key={img.storageName || img.url}
                        src={img.url}
                        alt={img.name || 'Скриншот'}
                        className="w-full max-h-[70vh] rounded-2xl border border-gray-200 object-contain bg-white cursor-pointer shadow-sm hover:shadow-lg transition-shadow"
                        onClick={() => setExpandedImage(img.url)}
                      />
                    ))}
                  </div>
                )}

                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file) => (
                      <a
                        key={file.storageName || file.url}
                        href={file.url}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="truncate">{file.name || 'Файл'}</span>
                        <Download size={16} className="text-purple-600" />
                      </a>
                    ))}
                  </div>
                )}

                <div className="rounded-2xl border border-purple-100/70 bg-white/95 p-4 shadow-sm">
                  <div className="text-xs font-bold text-gray-400 uppercase mb-2">Ответ ученика</div>
                  {answerCount > 1 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {Array.from({ length: answerCount }).map((_, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={currentAnswers[idx] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            hasLocalAttemptChangesRef.current = true;
                            setSaveError('');
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
                          className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                        />
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={singleAnswer}
                      onChange={(e) => {
                        hasLocalAttemptChangesRef.current = true;
                        setSaveError('');
                        setAnswers((prev) => ({ ...prev, [taskKey]: e.target.value }));
                      }}
                      placeholder="Введите ответ..."
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                    />
                  )}
                  {results[taskKey] !== undefined && (
                    <div className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      results[taskKey]
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-600 border border-rose-200'
                    }`}>
                      {results[taskKey] ? 'Верно' : 'Неверно'}
                    </div>
                  )}
                  {saveError && (
                    <div className="mt-2 text-xs text-rose-600">{saveError}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-gray-500 bg-white/80 border border-gray-200 rounded-full px-3 py-1 self-start whitespace-nowrap">
            Задание {selectedTask} из 27
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">Закрыть</Button>
            <Button onClick={handleCheck} disabled={!currentQuestion} className="w-full sm:w-auto">Проверить</Button>
          </div>
        </div>
      </div>

      {expandedImage && (
        <div className="fixed inset-0 z-[60] bg-black/80 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setExpandedImage(null)}>
          <img src={expandedImage} alt="Просмотр" className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};



export default MockExamModal;

