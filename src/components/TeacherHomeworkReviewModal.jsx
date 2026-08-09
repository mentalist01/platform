import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle, ChevronLeft, ChevronRight, Copy, Download, History, ListChecks, RefreshCcw, X } from 'lucide-react';
import { api } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import { writeBoardTaskToClipboard } from '../utils/boardTaskClipboard';
import { normalizeQuestionLabel, getQuestionLabelStyle } from '../utils/questionLabel';
import {
  getPendingTeacherHomeworkReviewItems,
  mergeTeacherHomeworkReviewTaskProgress,
} from '../utils/teacherHomeworkReview';
import { Button } from './ui';

const BOARD_COPY_FEEDBACK_MS = 1800;

const normalizeAnswerHistoryPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const result = {};
  Object.entries(payload).forEach(([questionId, entries]) => {
    const key = String(questionId ?? '').trim();
    if (!key || !Array.isArray(entries)) return;
    const history = entries
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const submittedAt = String(entry.submittedAt || '').trim();
        const answers = Array.isArray(entry.answers)
          ? entry.answers.map((value) => String(value ?? ''))
          : (typeof entry.answer !== 'undefined' ? [String(entry.answer ?? '')] : []);
        if (!answers.length) return null;
        return {
          id: String(entry.id || `${key}:${submittedAt}:${answers.join('|')}`),
          submittedAt,
          correct: entry.correct === true,
          answers,
        };
      })
      .filter(Boolean)
      .sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt));
    if (history.length) result[key] = history;
  });
  return result;
};

const normalizeAnswerValues = (values, count) => Array.from(
  { length: Math.max(1, count) },
  (_, index) => String(values?.[index] ?? '')
);

const formatAnswerValues = (values, answerCount) => {
  const normalized = normalizeAnswerValues(values, answerCount);
  if (answerCount <= 1) return normalized[0].trim() || '—';
  if (answerCount === 20) {
    return Array.from({ length: 10 }, (_, index) => {
      const left = normalized[index].trim() || '—';
      const right = normalized[index + 10].trim() || '—';
      return `${index + 1}: ${left} | ${right}`;
    }).join('; ');
  }
  return normalized.map((value, index) => `${index + 1}: ${value.trim() || '—'}`).join('; ');
};

const formatAttemptTime = (value) => {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const AnswerPreview = ({ title, status, values, answerCount, tone }) => {
  const normalized = normalizeAnswerValues(values, answerCount);
  const displayValues = normalized.length > 0 ? normalized : [''];
  return (
    <article className={`teacher-test-review-answer-card ${title === 'Ответ ученика' ? 'is-student' : ''} ${tone}`}>
      <div className="teacher-test-review-answer-card__header">
        <div>
          <span className="teacher-test-review-answer-card__eyebrow">{title}</span>
          <strong>{title === 'Ответ ученика' ? 'Последний введённый ответ' : 'Ответ из базы заданий'}</strong>
        </div>
        <span className={`teacher-test-review-answer-status ${tone}`}>{status}</span>
      </div>
      <div className={answerCount > 1 ? 'grid grid-cols-1 gap-2 md:grid-cols-2' : ''}>
        {displayValues.map((value, index) => (
          <label key={`${title}-${index}`} className="space-y-1">
            {answerCount > 1 && (
              <span className="block text-xs font-semibold text-gray-500">Ответ {index + 1}</span>
            )}
            <input
              type="text"
              readOnly
              value={value || '—'}
              aria-label={`${title} ${index + 1}`}
              className={`teacher-test-review-answer-input w-full rounded-xl border px-3 py-2.5 text-sm ${tone}`}
            />
          </label>
        ))}
      </div>
    </article>
  );
};

const TeacherHomeworkReviewModal = ({
  open,
  studentId,
  studentLabel = '',
  items = [],
  getAnswerCountForTask,
  getExpectedAnswers,
  gameTheoryTask,
  withStudentId = (url) => url,
  sourceLoading = false,
  sourceError = '',
  onClose,
}) => {
  const itemSignature = useMemo(() => (
    (Array.isArray(items) ? items : [])
      .map((item) => `${item?.key}:${item?.solved ? 1 : 0}:${item?.attempted ? 1 : 0}:${JSON.stringify(item?.studentAnswers || [])}`)
      .join('|')
  ), [items]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [resolvedItems, setResolvedItems] = useState(items);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expandedImage, setExpandedImage] = useState(null);
  const [questionImageStateByKey, setQuestionImageStateByKey] = useState({});
  const [questionBoardCopyState, setQuestionBoardCopyState] = useState('idle');
  const questionBoardCopyResetTimerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const sourceItems = Array.isArray(itemsRef.current) ? itemsRef.current : [];
    setResolvedItems(sourceItems);
    setCurrentIndex(0);
    setLoadError('');

    const taskScopes = Array.from(new Map(
      sourceItems
        .filter((item) => item?.sourceType === 'task' && item?.taskNumber && item?.levelId)
        .map((item) => [`${item.taskNumber}|${item.levelId}`, {
          key: `${item.taskNumber}|${item.levelId}`,
          taskNumber: item.taskNumber,
          levelId: item.levelId,
        }])
    ).values());

    if (!studentId || taskScopes.length === 0) {
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    Promise.all(taskScopes.map(async (scope) => {
      const scopeItems = sourceItems.filter((item) => (
        item?.sourceType === 'task'
        && String(item.taskNumber) === String(scope.taskNumber)
        && String(item.levelId) === String(scope.levelId)
      ));
      const fallbackSolvedIds = new Set(
        scopeItems.filter((item) => item.solved).map((item) => String(item.questionId || ''))
      );
      const [solvedResult, historyResult] = await Promise.allSettled([
        api.getSolvedQuestions(studentId, scope.taskNumber, scope.levelId),
        api.getAnswerHistory(studentId, scope.taskNumber, scope.levelId),
      ]);
      const solvedPayload = solvedResult.status === 'fulfilled' ? solvedResult.value : null;
      const solvedList = Array.isArray(solvedPayload)
        ? solvedPayload
        : (Array.isArray(solvedPayload?.ids) ? solvedPayload.ids : null);
      return {
        key: scope.key,
        solvedIds: solvedList
          ? new Set(solvedList.map((value) => String(value ?? '').trim()).filter(Boolean))
          : fallbackSolvedIds,
        historyById: historyResult.status === 'fulfilled'
          ? normalizeAnswerHistoryPayload(historyResult.value)
          : {},
        failed: solvedResult.status === 'rejected' || historyResult.status === 'rejected',
      };
    }))
      .then((scopeEntries) => {
        if (!active) return;
        const scopeResults = Object.fromEntries(scopeEntries.map((scope) => [scope.key, scope]));
        setResolvedItems(mergeTeacherHomeworkReviewTaskProgress(sourceItems, scopeResults));
        if (scopeEntries.some((scope) => scope.failed)) {
          setLoadError('Часть свежих статусов не загрузилась — показаны последние данные с экрана.');
        }
      })
      .catch((error) => {
        if (active) setLoadError(error?.message || 'Не удалось обновить статусы заданий.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [itemSignature, open, studentId]);

  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('overflow-hidden');
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (expandedImage) setExpandedImage(null);
      else onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('overflow-hidden');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [expandedImage, onClose, open]);

  const pendingItems = getPendingTeacherHomeworkReviewItems(resolvedItems);
  const currentItemKey = pendingItems[currentIndex]?.key || '';
  useEffect(() => {
    if (currentIndex < pendingItems.length) return;
    setCurrentIndex(Math.max(0, pendingItems.length - 1));
  }, [currentIndex, pendingItems.length]);

  useEffect(() => {
    setQuestionImageStateByKey({});
    setQuestionBoardCopyState('idle');
    if (questionBoardCopyResetTimerRef.current) {
      clearTimeout(questionBoardCopyResetTimerRef.current);
      questionBoardCopyResetTimerRef.current = null;
    }
    return () => {
      if (questionBoardCopyResetTimerRef.current) {
        clearTimeout(questionBoardCopyResetTimerRef.current);
        questionBoardCopyResetTimerRef.current = null;
      }
    };
  }, [currentItemKey, open]);

  if (!open || typeof document === 'undefined') return null;

  const currentItem = pendingItems[currentIndex] || null;
  const currentQuestion = currentItem?.question || {};
  const answerCountOverride = Math.floor(Number(currentQuestion?.answerCountOverride));
  const answerCount = Number.isFinite(answerCountOverride) && answerCountOverride > 0 && answerCountOverride <= 50
    ? answerCountOverride
    : Math.max(1, Number(getAnswerCountForTask?.(currentItem?.taskNumber)) || 1);
  const rawExpectedAnswers = currentItem
    ? (getExpectedAnswers?.(currentQuestion, answerCount)
      || currentQuestion?.answers
      || [currentQuestion?.answer])
    : [];
  const expectedAnswers = normalizeAnswerValues(
    Array.isArray(rawExpectedAnswers) ? rawExpectedAnswers : [rawExpectedAnswers],
    answerCount
  );
  const studentAnswers = normalizeAnswerValues(currentItem?.studentAnswers, answerCount);
  const answerHistory = Array.isArray(currentItem?.answerHistory) ? currentItem.answerHistory : [];
  const answerHistoryLatestFirst = answerHistory.slice().reverse();
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((image) => {
      const rawUrl = image?.url || (image?.storageName ? `/uploads/${image.storageName}` : '');
      return { ...image, url: withStudentId(rawUrl, studentId) };
    })
    .filter((image) => image.url);
  const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => {
      const url = file?.url || (file?.storageName ? `/uploads/${file.storageName}` : '');
      return { ...file, url: withStudentId(url, studentId) };
    });
  const questionLabel = normalizeQuestionLabel(currentQuestion?.label);
  const answerLabels = Number(currentItem?.taskNumber) === Number(gameTheoryTask) && answerCount === 4
    ? ['19', '20.1', '20.2', '21']
    : Array.from({ length: answerCount }, (_, index) => String(index + 1));
  const title = currentItem?.sourceType === 'mock'
    ? `${currentItem.mockExamTitle} · задание ${currentItem.taskDisplay}`
    : `Задание ${currentItem?.taskDisplay || ''} · №${currentItem?.questionNumber || ''}`;

  const handleCopyQuestionToBoard = async () => {
    if (!currentItem) return;
    setQuestionBoardCopyState('copying');
    const copied = await writeBoardTaskToClipboard({
      metadata: {
        taskNumber: currentItem.taskNumber,
        taskDisplayNumber: currentItem.taskDisplay,
        taskTitle: currentItem.sourceType === 'mock' ? currentItem.mockExamTitle : '',
        levelId: currentItem.levelId,
        levelTitle: currentItem.levelLabel,
        questionId: currentItem.questionId,
        questionNumber: Number(currentItem.questionNumber) || currentIndex + 1,
        questionLabel: questionLabel?.text || '',
      },
      questionText: currentQuestion?.question || '',
      screenshots,
      answerCount,
      answerLabels,
      studentAnswers,
      sourceStudentId: studentId,
    });
    setQuestionBoardCopyState(copied ? 'copied' : 'error');
    if (questionBoardCopyResetTimerRef.current) clearTimeout(questionBoardCopyResetTimerRef.current);
    questionBoardCopyResetTimerRef.current = setTimeout(() => {
      setQuestionBoardCopyState('idle');
      questionBoardCopyResetTimerRef.current = null;
    }, BOARD_COPY_FEEDBACK_MS);
  };

  const modal = (
    <>
      <div className="student-test-modal-backdrop fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-0 sm:p-3 md:p-5">
        <div className="student-test-workspace student-test-workspace--animated modal-card relative flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden sm:h-auto sm:max-h-[94dvh]">
          <header className="student-test-header shrink-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="student-test-header-icon hidden sm:flex"><ListChecks size={20} /></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-800 sm:text-[11px]">
                    Не выполнено к занятию
                  </span>
                  <span className="student-test-xp-badge">Просмотр ученика</span>
                </div>
                <h2 className="student-test-title mt-1.5 truncate">
                  Домашка · {studentLabel || 'Ученик'}
                </h2>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <div className="student-test-progress-summary hidden sm:block">
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span>Осталось</span>
                  <strong>{pendingItems.length}</strong>
                </div>
                <div className="student-test-progress-track mt-1.5">
                  <div className="student-test-progress-fill bg-amber-500" style={{ width: pendingItems.length ? '100%' : '0%' }} />
                </div>
              </div>
              <button onClick={onClose} className="student-test-close" type="button" aria-label="Закрыть">
                <X size={19} />
              </button>
            </div>
          </header>

          <div className="student-test-navigation shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="student-test-question-caption">
                {currentItem
                  ? `Задание ${currentIndex + 1} из ${pendingItems.length}`
                  : sourceLoading
                    ? 'Загружаем задания…'
                    : 'Невыполненных заданий нет'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-hidden="true" />
                Жёлтые — ученик уже пытался решить
              </span>
            </div>
            {pendingItems.length > 0 && (
              <div className="student-test-question-list mt-2 flex gap-2 overflow-x-auto">
                {pendingItems.map((item, index) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className={`student-test-question-button ${index === currentIndex ? 'is-current' : ''} ${item.attempted ? 'is-wrong' : ''}`}
                    style={{ '--student-test-item-index': index }}
                    title={item.attempted
                      ? `${item.sourceType === 'mock' ? 'Пробник' : `Задание ${item.taskDisplay}`}, №${item.questionNumber}: были попытки`
                      : `${item.sourceType === 'mock' ? 'Пробник' : `Задание ${item.taskDisplay}`}, №${item.questionNumber}`}
                    aria-current={index === currentIndex ? 'step' : undefined}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            )}
            {loading && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                <RefreshCcw size={13} className="animate-spin" /> Обновляем ответы ученика…
              </div>
            )}
            {loadError && <div className="mt-2 text-xs font-semibold text-amber-700">{loadError}</div>}
          </div>

          <button
            type="button"
            onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            disabled={!currentItem || currentIndex === 0}
            className={`student-test-side-nav student-test-side-nav--prev ${pendingItems[currentIndex - 1]?.attempted ? 'is-wrong' : 'is-pending'}`}
            aria-label="Предыдущее задание"
          >
            <span className="student-test-side-nav__glow" aria-hidden="true" />
            <span className="student-test-side-nav__sheen" aria-hidden="true" />
            <ChevronLeft size={24} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex((index) => Math.min(pendingItems.length - 1, index + 1))}
            disabled={!currentItem || currentIndex >= pendingItems.length - 1}
            className={`student-test-side-nav student-test-side-nav--next ${pendingItems[currentIndex + 1]?.attempted ? 'is-wrong' : 'is-pending'}`}
            aria-label="Следующее задание"
          >
            <span className="student-test-side-nav__glow" aria-hidden="true" />
            <span className="student-test-side-nav__sheen" aria-hidden="true" />
            <ChevronRight size={24} strokeWidth={2.5} />
          </button>

          <div className="student-test-scroll flex-1 overflow-y-auto">
            <div key={currentItem?.key || 'empty'} className="student-test-content student-test-content--question-enter mx-auto w-full max-w-5xl">
              {!currentItem ? (
                <section className="student-test-question-panel student-test-panel-enter py-12 text-center">
                  {sourceLoading ? (
                    <>
                      <RefreshCcw size={32} className="mx-auto animate-spin text-violet-500" />
                      <h3 className="mt-3 text-lg font-black text-slate-900">Загружаем домашку</h3>
                      <p className="mt-1 text-sm text-slate-500">Собираем условия и свежие статусы ученика.</p>
                    </>
                  ) : sourceError ? (
                    <>
                      <ListChecks size={34} className="mx-auto text-amber-500" />
                      <h3 className="mt-3 text-lg font-black text-slate-900">Не удалось собрать все задания</h3>
                      <p className="mx-auto mt-1 max-w-xl text-sm text-amber-700">{sourceError}</p>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={36} className="mx-auto text-emerald-500" />
                      <h3 className="mt-3 text-lg font-black text-slate-900">Все задания выполнены</h3>
                      <p className="mt-1 text-sm text-slate-500">К этой домашке у ученика не осталось невыполненных тестовых заданий.</p>
                    </>
                  )}
                </section>
              ) : (
                <>
                  <section className="student-test-question-panel student-test-panel-enter">
                    <div className="student-test-question-panel__toolbar">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                          {title}
                        </span>
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
                          {currentItem.levelLabel}
                        </span>
                        {currentItem.optional && (
                          <span className="inline-flex rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-bold text-fuchsia-700">Дополнительно</span>
                        )}
                        {questionLabel && (
                          <span className="inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-bold shadow-sm" style={getQuestionLabelStyle(questionLabel)}>
                            <span className="truncate">{questionLabel.text}</span>
                          </span>
                        )}
                      </div>
                      <div className="student-test-question-panel__toolbar-actions">
                        <button
                          type="button"
                          className={`teacher-board-task-copy ${questionBoardCopyState === 'copied' ? 'is-copied' : ''} ${questionBoardCopyState === 'error' ? 'is-error' : ''}`}
                          onClick={() => { void handleCopyQuestionToBoard(); }}
                          disabled={questionBoardCopyState === 'copying'}
                          title="Скопировать условие и интерактивные поля, затем вставить их на доску через Ctrl+V"
                        >
                          {questionBoardCopyState === 'copied'
                            ? <Check size={15} aria-hidden="true" />
                            : <Copy size={15} aria-hidden="true" />}
                          <span>{questionBoardCopyState === 'copied'
                            ? 'Задание скопировано'
                            : questionBoardCopyState === 'error'
                              ? 'Не удалось скопировать'
                              : questionBoardCopyState === 'copying'
                                ? 'Копируем…'
                                : 'Скопировать задание'}</span>
                        </button>
                      </div>
                    </div>

                    {screenshots.length > 0 && (
                      <div className="mb-5 space-y-3 md:mb-6">
                        {screenshots.map((image, index) => {
                          const imageKey = String(image.id || image.storageName || image.url || index);
                          const imageState = questionImageStateByKey[imageKey] || {};
                          const storedWidth = Number(image.width);
                          const storedHeight = Number(image.height);
                          const fallbackAspectRatio = storedWidth > 0 && storedHeight > 0
                            ? Math.max(1.6, Math.min(5.8, storedWidth / storedHeight))
                            : 3.8;
                          return (
                            <div
                              key={imageKey}
                              className={`student-test-screenshot ${imageState.loaded ? 'is-loaded' : 'is-loading'} max-h-[65vh] overflow-hidden rounded-2xl border`}
                              style={{
                                '--student-test-item-index': index,
                                '--student-test-image-aspect': imageState.aspectRatio || fallbackAspectRatio,
                              }}
                              aria-busy={!imageState.loaded}
                            >
                              <div className="student-test-screenshot__loader" aria-hidden={Boolean(imageState.loaded)}>
                                <RefreshCcw size={18} aria-hidden="true" />
                                <span>Загрузка изображения задания…</span>
                              </div>
                              <img
                                src={image.url}
                                alt={image.name || 'Скриншот задания'}
                                className="max-h-[65vh] w-full cursor-zoom-in object-contain"
                                onLoad={(event) => {
                                  const width = Number(event.currentTarget.naturalWidth);
                                  const height = Number(event.currentTarget.naturalHeight);
                                  setQuestionImageStateByKey((previous) => ({
                                    ...previous,
                                    [imageKey]: {
                                      loaded: true,
                                      aspectRatio: width > 0 && height > 0
                                        ? Math.max(1.6, Math.min(5.8, width / height))
                                        : fallbackAspectRatio,
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
                      <div className="mb-5 space-y-2 md:mb-6">
                        {extraFiles.map((file, index) => (
                          <a key={file.id || file.url || index} href={buildDownloadUrl(file.url)} download={file.name || undefined} className="student-test-file flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50">
                            <span className="truncate">{file.name || 'Файл к заданию'}</span>
                            <Download size={16} className="text-purple-600" />
                          </a>
                        ))}
                      </div>
                    )}

                    {currentItem.attempted && (
                      <div className="student-test-solved-label mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                        Есть попытки решения
                      </div>
                    )}
                    {currentQuestion?.question ? (
                      <p className="student-test-question-text mb-5 whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-gray-900 md:mb-6 md:text-lg">
                        {currentQuestion.question}
                      </p>
                    ) : screenshots.length === 0 ? (
                      <p className="mb-5 text-sm font-medium text-slate-500">Условие задания недоступно, но оно входит в домашнюю работу.</p>
                    ) : null}
                  </section>

                  <section className={`student-test-answer-panel student-test-panel-enter space-y-4 ${currentItem.attempted ? 'student-test-answer-panel--wrong' : 'student-test-answer-panel--pending'}`}>
                    <div className="teacher-test-review-answer-grid">
                      <AnswerPreview
                        title="Ответ ученика"
                        status={currentItem.attempted ? 'Последняя попытка неверная' : 'Нет ответа'}
                        values={studentAnswers}
                        answerCount={answerCount}
                        tone={currentItem.attempted ? 'is-wrong' : 'is-empty'}
                      />
                      <AnswerPreview
                        title="Правильный ответ"
                        status="Эталон"
                        values={expectedAnswers}
                        answerCount={answerCount}
                        tone="is-correct"
                      />
                    </div>

                    <details className="student-test-history" open={answerHistory.length > 0}>
                      <summary className="student-test-history-summary" aria-label="История ответов ученика">
                        <span className="student-test-history-summary__label"><History size={14} /><span>История ответов ученика</span></span>
                        <span className="student-test-history-summary__count">{answerHistory.length}</span>
                      </summary>
                      <div className="student-test-history__content space-y-2">
                        {answerHistoryLatestFirst.length > 0 ? answerHistoryLatestFirst.map((entry, index) => (
                          <div key={entry.id || `${entry.submittedAt}-${index}`} className="student-test-history-entry rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className={`font-bold ${entry.correct ? 'text-green-600' : 'text-red-600'}`}>{entry.correct ? 'Верно' : 'Неверно'}</span>
                              <span className="text-gray-400">{formatAttemptTime(entry.submittedAt)}</span>
                            </div>
                            <div className="mt-1 break-words font-mono text-[11px] leading-5 text-gray-700">{formatAnswerValues(entry.answers, answerCount)}</div>
                          </div>
                        )) : (
                          <div className="text-xs text-gray-500">Попыток пока нет</div>
                        )}
                      </div>
                    </details>
                  </section>
                </>
              )}
            </div>
          </div>

          <footer className="student-test-footer shrink-0">
            <div className="teacher-test-review-footer-summary mr-auto">Не выполнено: <strong>{pendingItems.length}</strong></div>
            <Button variant="secondary" onClick={onClose}>Закрыть</Button>
            <Button
              onClick={() => {
                if (!currentItem || currentIndex >= pendingItems.length - 1) onClose?.();
                else setCurrentIndex((index) => index + 1);
              }}
              className="student-test-primary-action is-ready"
            >
              {!currentItem || currentIndex >= pendingItems.length - 1 ? 'Закрыть просмотр' : 'Следующее задание'}
            </Button>
          </footer>
        </div>
      </div>

      {expandedImage && (
        <div className="student-test-image-lightbox fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpandedImage(null); }}>
          <div className="relative max-h-[95vh] max-w-[95vw]">
            <img src={expandedImage.url} alt={expandedImage.name || 'Скриншот'} className="h-full w-full rounded-2xl object-contain shadow-2xl" style={{ maxHeight: '95vh' }} />
            <button type="button" onClick={() => setExpandedImage(null)} className="absolute right-3 top-3 rounded-full bg-white/90 p-2 hover:bg-white" aria-label="Закрыть изображение"><X size={18} /></button>
          </div>
        </div>
      )}
    </>
  );

  return createPortal(modal, document.body);
};

export default TeacherHomeworkReviewModal;
