import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  ListChecks,
  Sparkles,
  Target,
  X,
  XCircle,
} from 'lucide-react';

import { resolveAuthenticatedUploadsUrl } from '../services/api';
import { buildMockExamAnalysis } from '../utils/mockExamAnalysis';

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'problem', label: 'Нужно разобрать' },
  { id: 'incorrect', label: 'Ошибки' },
  { id: 'unanswered', label: 'Пропуски' },
  { id: 'correct', label: 'Верно' },
];

const STATUS_META = {
  correct: {
    label: 'Верно',
    icon: CheckCircle2,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  incorrect: {
    label: 'Ошибка',
    icon: XCircle,
    tone: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  unanswered: {
    label: 'Нет ответа',
    icon: AlertTriangle,
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  pending: {
    label: 'Ждёт проверки',
    icon: Clock3,
    tone: 'border-sky-200 bg-sky-50 text-sky-700',
  },
};

const formatDuration = (milliseconds) => {
  if (!Number.isFinite(Number(milliseconds)) || Number(milliseconds) < 0) return '—';
  const totalMinutes = Math.max(0, Math.round(Number(milliseconds) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} мин`;
  return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
};

const formatAnswer = (values) => {
  const list = (Array.isArray(values) ? values : []).map((value) => String(value ?? '').trim());
  return list.some(Boolean) ? list.map((value) => value || '—').join(' · ') : 'Нет ответа';
};

const getAttachmentUrl = (attachment) => {
  const raw = String(
    attachment?.url
    || (attachment?.storageName ? `/uploads/${attachment.storageName}` : '')
    || ''
  ).trim();
  return raw ? String(resolveAuthenticatedUploadsUrl(raw) || raw) : '';
};

const MockExamAnalysisModal = ({
  open,
  exam,
  attempt,
  studentLabel = '',
  taskCatalog = [],
  targetTaskKeys = null,
  getAnswerCountForTask,
  getExpectedAnswers,
  getPrimaryScoreFromSolved,
  getSecondaryScoreFromPrimary,
  onClose,
  onOpenTask,
  onAssignReview,
  revealUnansweredAnswers = false,
}) => {
  const [filterSelection, setFilterSelection] = useState({ viewKey: '', value: 'problem' });
  const [expandedSelection, setExpandedSelection] = useState({ viewKey: '', taskKey: '' });

  const analysis = useMemo(() => buildMockExamAnalysis({
    exam,
    attempt,
    taskCatalog,
    targetTaskKeys,
    getAnswerCountForTask,
    getExpectedAnswers,
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
  }), [
    attempt,
    exam,
    getAnswerCountForTask,
    getExpectedAnswers,
    getPrimaryScoreFromSolved,
    getSecondaryScoreFromPrimary,
    taskCatalog,
    targetTaskKeys,
  ]);

  const viewKey = [
    analysis.examId,
    attempt?.studentId || attempt?.userId || '',
    attempt?.finishedAt || attempt?.updatedAt || attempt?.startedAt || '',
  ].join(':');
  const defaultFilter = analysis.resultsVisible ? 'problem' : 'all';
  const filter = filterSelection.viewKey === viewKey ? filterSelection.value : defaultFilter;
  const expandedTaskKey = expandedSelection.viewKey === viewKey ? expandedSelection.taskKey : '';

  useEffect(() => {
    if (!open) return undefined;
    if (typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open || !exam) return null;

  const filteredTasks = analysis.tasks.filter((task) => {
    if (filter === 'problem') return ['incorrect', 'unanswered'].includes(task.status);
    if (filter === 'all') return true;
    return task.status === filter;
  });
  const priorityLabel = analysis.recommendedTaskKeys.length > 0
    ? analysis.recommendedTaskKeys.map((taskKey) => `№${taskKey}`).join(', ')
    : '';

  const content = (
    <div className="fixed inset-0 z-[1850] flex items-stretch justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:p-3 lg:p-5">
      <section
        className="flex h-[100dvh] w-full max-w-[1440px] flex-col overflow-hidden bg-[rgb(var(--surface-soft))] text-[rgb(var(--ink))] shadow-2xl sm:h-[calc(100dvh-1.5rem)] sm:rounded-[28px] sm:border sm:border-white/20 lg:h-[calc(100dvh-2.5rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mock-analysis-title"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/80 bg-[rgb(var(--surface))] px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
              <BarChart3 size={19} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Глубокий разбор пробника</div>
              <h2 id="mock-analysis-title" className="truncate text-lg font-black sm:text-xl">{analysis.examTitle}</h2>
              <p className="mt-0.5 text-xs font-semibold text-[rgb(var(--ink-soft))]">
                {studentLabel ? `${studentLabel} · ` : ''}{analysis.mode === 'timer' ? 'режим с таймером' : 'обычный режим'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-[rgb(var(--surface))] text-[rgb(var(--ink-soft))] hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
            aria-label="Закрыть разбор пробника"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
          {!analysis.hasStarted ? (
            <div className="grid min-h-[55vh] place-items-center rounded-[28px] border border-dashed border-indigo-200 bg-[rgb(var(--surface))] px-6 text-center">
              <div className="max-w-md">
                <BookOpen size={38} className="mx-auto text-indigo-300" />
                <h3 className="mt-4 text-lg font-black">Попытка ещё не начата</h3>
                <p className="mt-2 text-sm leading-relaxed text-[rgb(var(--ink-soft))]">
                  После первых ответов здесь появятся карта ошибок, потерянные баллы и список заданий для разбора.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-600 to-purple-600 p-4 text-white shadow-lg shadow-indigo-500/15">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-100">Результат</span>
                  <strong className="mt-2 block text-3xl font-black">{analysis.resultsVisible ? `${analysis.secondaryScore} б.` : 'Скрыт'}</strong>
                  <small className="mt-1 block font-semibold text-indigo-100">
                    {analysis.resultsVisible ? `${analysis.primaryScore}/${analysis.primaryMaximum} первичных` : 'До завершения таймера'}
                  </small>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-[rgb(var(--surface))] p-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[rgb(var(--ink-soft))]">Точность</span>
                  <strong className="mt-2 block text-3xl font-black">{analysis.accuracyPercent == null ? '—' : `${analysis.accuracyPercent}%`}</strong>
                  <small className="mt-1 block font-semibold text-[rgb(var(--ink-soft))]">{`${analysis.correctCount}/${analysis.answeredCount} верно`}</small>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-[rgb(var(--surface))] p-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[rgb(var(--ink-soft))]">Заполнено</span>
                  <strong className="mt-2 block text-3xl font-black">{analysis.completionPercent}%</strong>
                  <small className="mt-1 block font-semibold text-[rgb(var(--ink-soft))]">{`${analysis.answeredCount}/${analysis.totalCount} заданий`}</small>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-[rgb(var(--surface))] p-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[rgb(var(--ink-soft))]">Время</span>
                  <strong className="mt-2 block text-3xl font-black">{formatDuration(analysis.elapsedMs)}</strong>
                  <small className="mt-1 block font-semibold text-[rgb(var(--ink-soft))]">От старта до завершения</small>
                </div>
              </section>

              {!analysis.resultsVisible ? (
                <section className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-800">
                  <Clock3 size={20} className="mt-0.5 shrink-0" />
                  <div>
                    <strong className="block text-sm">Пробник ещё идёт</strong>
                    <p className="mt-1 text-xs leading-relaxed">Ответы сохранены, но правильность и верные ответы откроются только после завершения таймера.</p>
                  </div>
                </section>
              ) : (
                <section className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
                  <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700"><Target size={17} /></span>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-rose-500">Главный фокус</span>
                        <strong className="mt-1 block text-base text-slate-950">
                          {priorityLabel ? `Разобрать ${priorityLabel}` : 'Ошибок и пропусков нет'}
                        </strong>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">
                          {analysis.weakestSection
                            ? `Самая слабая зона — «${analysis.weakestSection.label}». Здесь потеряно больше всего относительно доступных баллов.`
                            : 'Пробник выполнен без явных зон риска.'}
                        </p>
                      </div>
                    </div>
                    {analysis.recommendedTaskKeys.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {typeof onAssignReview === 'function' && (
                          <button
                            type="button"
                            onClick={() => onAssignReview(analysis.recommendedTaskKeys, analysis)}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-black text-white shadow-lg shadow-rose-500/20 hover:bg-rose-700"
                          >
                            <ListChecks size={15} /> Подготовить ДЗ по ошибкам
                          </button>
                        )}
                        {typeof onOpenTask === 'function' && (
                          <button
                            type="button"
                            onClick={() => onOpenTask(analysis.recommendedTaskKeys[0])}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-xs font-black text-rose-700 hover:bg-rose-50"
                          >
                            Открыть первую ошибку <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4 sm:p-5">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-purple-500">Потенциал после разбора</span>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <strong className="text-2xl font-black text-purple-950">+{analysis.recoverablePrimary}</strong>
                      <span className="text-xs font-bold text-purple-700">первичных баллов</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-purple-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500"
                        style={{ width: `${analysis.primaryMaximum > 0 ? Math.round((analysis.primaryScore / analysis.primaryMaximum) * 100) : 0}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-purple-700">
                      При исправлении отмеченных заданий расчётный потолок — {analysis.projectedSecondary} баллов.
                    </p>
                  </div>
                </section>
              )}

              {analysis.resultsVisible && analysis.sections.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-[rgb(var(--surface))] p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-500" />
                    <h3 className="text-sm font-black">Карта по блокам</h3>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {analysis.sections.map((section) => (
                      <div key={section.id} className="rounded-xl border border-slate-200 bg-[rgb(var(--surface-soft))] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <strong className="block text-xs">{section.label}</strong>
                            <span className="text-[10px] font-bold text-[rgb(var(--ink-soft))]">№ {section.shortLabel}</span>
                          </div>
                          <b className={section.scorePercent >= 75 ? 'text-emerald-600' : section.scorePercent >= 45 ? 'text-amber-600' : 'text-rose-600'}>{section.scorePercent}%</b>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${section.scorePercent}%` }} />
                        </div>
                        <span className="mt-2 block text-[10px] font-semibold text-[rgb(var(--ink-soft))]">{`${section.correctCount}/${section.totalCount} закрыто`}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 bg-[rgb(var(--surface))] p-3 sm:p-4">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-500">По каждому номеру</span>
                    <h3 className="mt-0.5 text-base font-black">Ответы и причины потери баллов</h3>
                  </div>
                  <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
                    {FILTERS.map((item) => {
                      const disabled = !analysis.resultsVisible && !['all'].includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => setFilterSelection({ viewKey, value: item.id })}
                          className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[10px] font-black transition ${
                            filter === item.id
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-200 bg-[rgb(var(--surface-soft))] text-[rgb(var(--ink-soft))] hover:border-indigo-200'
                          } disabled:opacity-40`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {filteredTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-[rgb(var(--surface-soft))] px-4 py-8 text-center text-sm font-semibold text-[rgb(var(--ink-soft))]">
                      В этом фильтре заданий нет.
                    </div>
                  ) : filteredTasks.map((task) => {
                    const status = STATUS_META[task.status] || STATUS_META.unanswered;
                    const StatusIcon = status.icon;
                    const expanded = expandedTaskKey === task.taskKey;
                    const screenshots = (Array.isArray(task.question?.screenshots) ? task.question.screenshots : [])
                      .map((item) => ({ ...item, resolvedUrl: getAttachmentUrl(item) }))
                      .filter((item) => item.resolvedUrl);
                    const files = (Array.isArray(task.question?.files) ? task.question.files : [])
                      .map((item) => ({ ...item, resolvedUrl: getAttachmentUrl(item) }))
                      .filter((item) => item.resolvedUrl);
                    return (
                      <article key={task.taskKey} className="overflow-hidden rounded-xl border border-slate-200 bg-[rgb(var(--surface-soft))]">
                        <button
                          type="button"
                          onClick={() => setExpandedSelection({
                            viewKey,
                            taskKey: expanded ? '' : task.taskKey,
                          })}
                          className="flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4"
                        >
                          <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--surface))] text-sm font-black shadow-sm">{task.taskKey}</span>
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-sm">{task.title}</strong>
                            <small className="mt-0.5 block text-[11px] font-semibold text-[rgb(var(--ink-soft))]">
                              {task.status === 'correct'
                                ? `Получено ${task.primaryWeight} из ${task.primaryWeight}`
                                : task.status === 'pending'
                                  ? 'Ответ сохранён, результат скрыт'
                                  : `Потеряно: ${task.primaryWeight} ${task.primaryWeight === 1 ? 'первичный балл' : 'первичных балла'}`}
                            </small>
                          </span>
                          <span className={`hidden shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black sm:inline-flex ${status.tone}`}>
                            <StatusIcon size={12} /> {status.label}
                          </span>
                          <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        {expanded && (
                          <div className="border-t border-slate-200 bg-[rgb(var(--surface))] p-3 sm:p-4">
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
                              <div className="space-y-3">
                                {screenshots.length > 0 && (
                                  <div className={`grid gap-2 ${screenshots.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                                    {screenshots.map((image, index) => (
                                      <a key={image.id || image.resolvedUrl || index} href={image.resolvedUrl} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                        <img src={image.resolvedUrl} alt={image.name || `Задание ${task.taskKey}`} className="max-h-72 w-full object-contain" />
                                      </a>
                                    ))}
                                  </div>
                                )}
                                {String(task.question?.question || '').trim() ? (
                                  <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-[rgb(var(--surface-soft))] px-3 py-3 text-sm font-medium leading-6">
                                    {task.question.question}
                                  </div>
                                ) : screenshots.length === 0 ? (
                                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-[rgb(var(--ink-soft))]">Условие не заполнено.</div>
                                ) : null}
                                {files.map((file, index) => (
                                  <a key={file.id || file.resolvedUrl || index} href={file.resolvedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-indigo-600">
                                    <FileText size={14} /> {file.name || `Файл ${index + 1}`}
                                  </a>
                                ))}
                              </div>
                              <aside className="space-y-3">
                                <div className="rounded-xl border border-slate-200 bg-[rgb(var(--surface-soft))] p-3">
                                  <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[rgb(var(--ink-soft))]">Ответ ученика</span>
                                  <strong className={`mt-1 block break-words text-sm ${task.status === 'incorrect' ? 'text-rose-700' : ''}`}>{formatAnswer(task.providedAnswers)}</strong>
                                </div>
                                {analysis.resultsVisible && (task.answered || revealUnansweredAnswers) && (
                                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                                    <span className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-600">Правильный ответ</span>
                                    <strong className="mt-1 block break-words text-sm text-emerald-800">{formatAnswer(task.expectedAnswers)}</strong>
                                  </div>
                                )}
                                {typeof onOpenTask === 'function' && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenTask(task.taskKey)}
                                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-black text-indigo-700 hover:bg-indigo-100"
                                  >
                                    Открыть в пробнике <ArrowRight size={14} />
                                  </button>
                                )}
                              </aside>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>
      </section>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export default MockExamAnalysisModal;
