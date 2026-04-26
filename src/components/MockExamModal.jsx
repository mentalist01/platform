import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileDown,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import MockExamBadges, { MockExamBadgeSticker } from './MockExamBadges';
import { normalizeMockExamBadges } from '../utils/mockExamBadges';
import { Button } from './ui';

const MockExamModal = ({
  exam,
  studentId,
  initialAttempt,
  initialTaskNumber = null,
  onClose,
  onAttemptSaved,
  MOCK_TASK_NUMBERS,
  getMockAnswerCountForTask,
  allowsPartialAnswers,
  getPrimaryScoreFromSolved,
  getSecondaryScoreFromPrimary,
  getLocalDayKey,
  withStudentId,
  theme = '',
}) => {
  const [selectedTask, setSelectedTask] = useState(MOCK_TASK_NUMBERS[0]);
  const [answers, setAnswers] = useState({});
  const [solved, setSolved] = useState({});
  const [results, setResults] = useState({});
  const [saveError, setSaveError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const hasLocalAttemptChangesRef = useRef(false);
  const latestInitialAttemptRef = useRef(initialAttempt);
  const autoAdvanceTimerRef = useRef(null);
  const firstTaskNumber = MOCK_TASK_NUMBERS[0];

  const readAttemptAnswers = (attempt) => (
    attempt?.answers && typeof attempt.answers === 'object' ? attempt.answers : {}
  );
  const readAttemptSolved = (attempt) => (
    attempt?.solved && typeof attempt.solved === 'object' ? attempt.solved : {}
  );

  const getNextUnsolvedTask = (solvedMap = solved, fromTask = selectedTask) => {
    const currentIndex = Math.max(0, MOCK_TASK_NUMBERS.indexOf(fromTask));
    const orderedTasks = [
      ...MOCK_TASK_NUMBERS.slice(currentIndex + 1),
      ...MOCK_TASK_NUMBERS.slice(0, currentIndex),
    ];
    return orderedTasks.find((taskNumber) => (
      exam?.tasks?.[String(taskNumber)] && !solvedMap?.[String(taskNumber)]
    )) || null;
  };

  useEffect(() => {
    latestInitialAttemptRef.current = initialAttempt;
  }, [initialAttempt]);

  useEffect(() => {
    hasLocalAttemptChangesRef.current = false;
    setAnswers(readAttemptAnswers(latestInitialAttemptRef.current));
    setSolved(readAttemptSolved(latestInitialAttemptRef.current));
    setResults({});
    setSaveError('');
    setSaveStatus('');
    setChecking(false);
    const requestedTask = String(initialTaskNumber ?? '').trim();
    const initialTask = requestedTask
      ? MOCK_TASK_NUMBERS.find((taskNumber) => String(taskNumber) === requestedTask)
      : null;
    setSelectedTask(initialTask || firstTaskNumber);
  }, [exam?.id, studentId, firstTaskNumber, initialTaskNumber, MOCK_TASK_NUMBERS]);

  useEffect(() => {
    if (hasLocalAttemptChangesRef.current) return;
    setAnswers(readAttemptAnswers(initialAttempt));
    setSolved(readAttemptSolved(initialAttempt));
    setResults({});
    setSaveError('');
    setSaveStatus('');
  }, [initialAttempt]);

  useEffect(() => {
    setSaveError('');
    setSaveStatus('');
  }, [selectedTask]);

  useEffect(() => () => {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

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
  const solvedCount = Object.values(solved || {}).filter(Boolean).length;
  const primaryScore = getPrimaryScoreFromSolved(solved);
  const secondaryScore = getSecondaryScoreFromPrimary(primaryScore);
  const totalTaskCount = MOCK_TASK_NUMBERS.length;
  const selectedTaskIndex = Math.max(0, MOCK_TASK_NUMBERS.indexOf(selectedTask));
  const progressPercent = totalTaskCount > 0
    ? Math.min(100, Math.round((solvedCount / totalTaskCount) * 100))
    : 0;
  const isFirstTask = selectedTaskIndex <= 0;
  const isLastTask = selectedTaskIndex >= totalTaskCount - 1;
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const files = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
  const hasQuestionText = Boolean(String(currentQuestion?.question || '').trim());
  const screenshotMaxHeightClass = hasQuestionText
    ? 'max-h-[30vh] sm:max-h-[36vh] lg:max-h-[42vh] xl:max-h-[50vh]'
    : 'max-h-[36vh] sm:max-h-[44vh] lg:max-h-[50vh] xl:max-h-[58vh]';
  const shouldFitSingleScreenshot = !hasQuestionText && screenshots.length === 1;
  const isDarkTheme = String(theme || '').trim().toLowerCase() === 'dark';
  const stickerSurface = isDarkTheme ? 'dark' : 'light';
  const examBadges = normalizeMockExamBadges(exam?.badges);
  const primaryBadge = examBadges[0] || null;
  const secondaryBadges = examBadges.slice(1);
  const isCurrentTaskSolved = Boolean(solved[taskKey]);
  const allowPartialForTask = answerCount > 1 ? allowsPartialAnswers(selectedTask) : false;
  const hasLargeAnswerGrid = answerCount > 6;
  const isAnswerReady = answerCount > 1
    ? (
      allowPartialForTask
        ? currentAnswers.some((value) => String(value ?? '').trim())
        : currentAnswers.every((value) => String(value ?? '').trim())
    )
    : Boolean(String(singleAnswer ?? '').trim());
  const nextUnsolvedTask = getNextUnsolvedTask(solved, selectedTask);
  const canCheck = Boolean(currentQuestion && studentId && isAnswerReady && !checking);

  const handlePrevTask = () => {
    if (isFirstTask) return;
    setSelectedTask(MOCK_TASK_NUMBERS[selectedTaskIndex - 1]);
  };

  const handleNextTask = () => {
    if (isLastTask) return;
    setSelectedTask(MOCK_TASK_NUMBERS[selectedTaskIndex + 1]);
  };

  const handleNextUnsolvedTask = () => {
    if (!nextUnsolvedTask) return;
    setSelectedTask(nextUnsolvedTask);
  };

  const handleCheck = async (event) => {
    if (!currentQuestion || !studentId || !isAnswerReady || checking) return;
    const buttonRect = event?.currentTarget?.getBoundingClientRect?.();
    const sourceRect = (
      buttonRect
      && Number.isFinite(buttonRect.left)
      && Number.isFinite(buttonRect.top)
      && Number.isFinite(buttonRect.width)
      && Number.isFinite(buttonRect.height)
    )
      ? {
        left: buttonRect.left,
        top: buttonRect.top,
        width: buttonRect.width,
        height: buttonRect.height,
      }
      : null;
    hasLocalAttemptChangesRef.current = true;
    setSaveError('');
    setSaveStatus('');
    setChecking(true);
    try {
      const saved = await api.saveMockAttempt(studentId, exam.id, {
        answers,
        localDay: typeof getLocalDayKey === 'function' ? getLocalDayKey() : undefined,
      });
      if (saved && typeof saved === 'object') {
        const savedSolved = readAttemptSolved(saved);
        const isCorrect = Boolean(savedSolved[taskKey]);
        setSolved(savedSolved);
        setResults((prev) => ({ ...prev, [taskKey]: isCorrect }));
        setSaveStatus(isCorrect ? 'Ответ верный и сохранён.' : 'Ответ сохранён, но пока неверный.');
        onAttemptSaved?.(exam.id, saved, { sourceRect });
        const nextTaskAfterSave = getNextUnsolvedTask(savedSolved, selectedTask);
        if (autoAdvance && isCorrect && nextTaskAfterSave) {
          if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
          autoAdvanceTimerRef.current = setTimeout(() => {
            setSelectedTask(nextTaskAfterSave);
            autoAdvanceTimerRef.current = null;
          }, 520);
        }
      }
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message : '';
      setSaveError(message || 'Не удалось сохранить ответ. Попробуйте снова.');
    } finally {
      setChecking(false);
    }
  };

  const handleAnswerKeyDown = (event) => {
    if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    handleCheck(event);
  };

  const shellClassName = isDarkTheme
    ? 'border-white/10 text-slate-100'
    : 'border-purple-100/70 text-slate-900';
  const shellStyle = isDarkTheme
    ? {
      background: [
        'radial-gradient(circle at 0% 0%, rgba(124, 58, 237, 0.24), transparent 28%)',
        'radial-gradient(circle at 100% 0%, rgba(56, 189, 248, 0.16), transparent 24%)',
        'linear-gradient(180deg, rgba(7, 17, 31, 0.98), rgba(12, 23, 40, 0.98))',
      ].join(', '),
    }
    : {
      background: [
        'radial-gradient(circle at 0% 0%, rgba(168, 85, 247, 0.12), transparent 28%)',
        'radial-gradient(circle at 100% 0%, rgba(56, 189, 248, 0.08), transparent 24%)',
        'linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 245, 255, 0.96))',
      ].join(', '),
    };
  const panelClassName = isDarkTheme
    ? 'border-white/10 bg-white/[0.05] shadow-[0_18px_40px_rgba(2,6,23,0.34)] backdrop-blur-xl'
    : 'border-slate-200/70 bg-white/92 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl';
  const mutedPanelClassName = isDarkTheme
    ? 'border-white/10 bg-white/[0.04] shadow-[0_12px_28px_rgba(2,6,23,0.26)] backdrop-blur-xl'
    : 'border-slate-200/70 bg-white/88 shadow-[0_12px_26px_rgba(15,23,42,0.07)] backdrop-blur-xl';
  const summaryPanelClassName = isDarkTheme
    ? 'border-violet-400/20 bg-white/[0.06] shadow-[0_24px_50px_rgba(76,29,149,0.24)] backdrop-blur-xl'
    : 'border-purple-200/80 bg-white/90 shadow-[0_18px_40px_rgba(124,58,237,0.14)] backdrop-blur-xl';
  const summaryPanelStyle = isDarkTheme
    ? {
      background: [
        'linear-gradient(145deg, rgba(124, 58, 237, 0.22), rgba(14, 165, 233, 0.08) 140%)',
        'linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03))',
      ].join(', '),
    }
    : {
      background: [
        'linear-gradient(145deg, rgba(139, 92, 246, 0.14), rgba(236, 72, 153, 0.08) 120%)',
        'linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(250, 245, 255, 0.9))',
      ].join(', '),
    };
  const labelClassName = 'text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400';
  const metaPillClassName = isDarkTheme
    ? 'rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-slate-200'
    : 'rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-600';
  const closeButtonClassName = isDarkTheme
    ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]'
    : 'border-slate-200 bg-white/90 text-slate-600 hover:bg-slate-100';
  const navButtonClassName = isDarkTheme
    ? 'border-white/10 bg-white/[0.05] text-slate-200 hover:border-violet-400/40 hover:bg-violet-500/10 disabled:opacity-35 disabled:cursor-not-allowed'
    : 'border-slate-200 bg-white/95 text-slate-600 hover:border-purple-300 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed';
  const inputClassName = isDarkTheme
    ? 'w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:border-violet-400 outline-none'
    : 'w-full rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:border-purple-500 outline-none';
  const compactInputClassName = isDarkTheme
    ? 'w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-400 outline-none'
    : 'w-full rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-purple-500 outline-none';
  const answerInputClassName = hasLargeAnswerGrid ? compactInputClassName : inputClassName;
  const answerPanelStyle = hasLargeAnswerGrid
    ? { height: 'min(35vh, 21rem)' }
    : undefined;
  const attachmentLinkClassName = isDarkTheme
    ? 'flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:border-violet-400/40 hover:bg-violet-500/10'
    : 'flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition hover:border-purple-300 hover:bg-purple-50';
  const statusPillClassName = isCurrentTaskSolved
    ? (isDarkTheme
      ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : 'border border-emerald-200 bg-emerald-50 text-emerald-700')
    : (isDarkTheme
      ? 'border border-white/10 bg-white/[0.05] text-slate-300'
      : 'border border-slate-200 bg-slate-100 text-slate-600');

  const getTaskButtonClassName = (taskNumber, compact = false) => {
    const isSelected = taskNumber === selectedTask;
    const isSolvedTask = Boolean(solved[String(taskNumber)]);
    const sizeClassName = compact
      ? 'h-11 min-w-[2.9rem] px-3 rounded-2xl text-sm'
      : 'h-11 rounded-2xl text-sm';

    if (isSelected) {
      return `${sizeClassName} border border-violet-400 bg-violet-500 text-white shadow-[0_14px_24px_rgba(139,92,246,0.32)]`;
    }

    if (isSolvedTask) {
      return isDarkTheme
        ? `${sizeClassName} border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400/50 hover:bg-emerald-500/14`
        : `${sizeClassName} border border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100`;
    }

    return isDarkTheme
      ? `${sizeClassName} border border-white/10 bg-white/[0.04] text-slate-300 hover:border-violet-400/35 hover:bg-violet-500/10 hover:text-white`
      : `${sizeClassName} border border-slate-200 bg-white/90 text-slate-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700`;
  };

  if (!exam) return null;

  const renderTaskPicker = (compact = false) => (
    <div className={compact ? 'flex gap-2 overflow-x-auto pb-1' : 'grid grid-cols-4 gap-2'}>
      {MOCK_TASK_NUMBERS.map((taskNumber) => (
        <button
          key={taskNumber}
          type="button"
          onClick={() => setSelectedTask(taskNumber)}
          className={`${getTaskButtonClassName(taskNumber, compact)} transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60`}
        >
          {taskNumber}
        </button>
      ))}
    </div>
  );

  const modal = (
    <div className="fixed inset-0 z-50 modal-backdrop flex items-center justify-center bg-black/65 p-3 backdrop-blur-md sm:p-4">
      <div
        className={`modal-card relative flex max-h-[96vh] w-full max-w-[96rem] flex-col overflow-hidden rounded-[2rem] border p-4 shadow-2xl md:p-6 ${shellClassName}`}
        style={shellStyle}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/8 to-transparent" />

        <div className="relative mb-4 flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${isDarkTheme ? 'border border-violet-400/20 bg-violet-500/12 text-violet-100' : 'bg-purple-50 text-purple-700'} inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]`}>
                Пробник
              </span>
              <span className={`${isDarkTheme ? 'border-white/10 bg-white/[0.05] text-slate-300' : 'border-purple-100 bg-white/80 text-gray-500'} inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest`}>
                ЕГЭ
              </span>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 space-y-3">
                <h3 className={`text-2xl font-display font-bold tracking-[-0.04em] md:text-[2.25rem] ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                  {exam.title}
                </h3>
                {secondaryBadges.length > 0 && <MockExamBadges badges={secondaryBadges} size="sm" className="gap-2" />}
                <div className="flex flex-wrap items-center gap-2 lg:hidden">
                  <span className={metaPillClassName}>
                    Баллы <span className="ml-1 font-semibold">{secondaryScore}</span>
                  </span>
                  <span className={metaPillClassName}>
                    Решено <span className="ml-1 font-semibold">{solvedCount}/{totalTaskCount}</span>
                  </span>
                </div>
              </div>

              {primaryBadge && (
                <div className="hidden shrink-0 justify-end md:flex">
                  <MockExamBadgeSticker badge={primaryBadge} size="sm" surface={stickerSurface} />
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть пробник"
            className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${closeButtonClassName}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative grid min-h-0 flex-1 gap-3 lg:grid-cols-[18.5rem_minmax(0,1fr)] xl:gap-4">
          <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
            <div
              className={`rounded-[1.75rem] border p-3.5 ${summaryPanelClassName}`}
              style={summaryPanelStyle}
            >
              <div className={labelClassName}>Прогресс</div>
              <div className={`mt-3 text-3xl font-display font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                {secondaryScore} баллов
              </div>
              <div className={`mt-1 text-sm ${isDarkTheme ? 'text-slate-300' : 'text-slate-500'}`}>
                {primaryScore} первичных
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className={`${isDarkTheme ? 'border-white/10 bg-black/10 text-slate-200' : 'border-white/50 bg-white/50 text-slate-700'} rounded-2xl border px-3 py-2`}>
                  <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">Решено</div>
                  <div className="mt-1 text-base font-semibold">{solvedCount}/{totalTaskCount}</div>
                </div>
                <div className={`${isDarkTheme ? 'border-white/10 bg-black/10 text-slate-200' : 'border-white/50 bg-white/50 text-slate-700'} rounded-2xl border px-3 py-2`}>
                  <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">Готово</div>
                  <div className="mt-1 text-base font-semibold">{progressPercent}%</div>
                </div>
              </div>

              <div className={`mt-4 h-2 overflow-hidden rounded-full ${isDarkTheme ? 'bg-white/10' : 'bg-white/60'}`}>
                <div
                  className={`h-full rounded-full ${isDarkTheme ? 'bg-white' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className={`flex min-h-0 flex-1 flex-col rounded-[1.75rem] border p-3.5 ${panelClassName}`}>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div className={labelClassName}>Задания</div>
                <div className={`${isDarkTheme ? 'text-slate-500' : 'text-slate-400'} text-xs`}>
                  1-{totalTaskCount}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {renderTaskPicker(false)}
              </div>

              <div className={`shrink-0 grid gap-1.5 pt-3 text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                  Текущее
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  Решено
                </div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${isDarkTheme ? 'bg-slate-600' : 'bg-slate-300'}`} />
                  Остальные
                </div>
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col gap-3">
            <div className={`rounded-[1.5rem] border p-3.5 lg:hidden ${mutedPanelClassName}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className={labelClassName}>Навигация</div>
                <div className={`${isDarkTheme ? 'text-slate-400' : 'text-slate-500'} text-xs`}>
                  {selectedTaskIndex + 1} из {totalTaskCount}
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={metaPillClassName}>
                  Баллы <span className="ml-1 font-semibold">{secondaryScore}</span>
                </span>
                <span className={metaPillClassName}>
                  Решено <span className="ml-1 font-semibold">{solvedCount}/{totalTaskCount}</span>
                </span>
              </div>

              <div className={`mb-3 h-2 overflow-hidden rounded-full ${isDarkTheme ? 'bg-white/10' : 'bg-slate-200/80'}`}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {renderTaskPicker(true)}
            </div>

            <div className={`rounded-[1.5rem] border p-3.5 ${panelClassName}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={labelClassName}>Задание</div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className={`text-2xl font-display font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                      № {selectedTask}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusPillClassName}`}>
                      {isCurrentTaskSolved ? 'Решено' : 'Открыто'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={metaPillClassName}>
                    {selectedTaskIndex + 1}/{totalTaskCount}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextUnsolvedTask}
                    disabled={!nextUnsolvedTask}
                    className={`hidden items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition sm:inline-flex ${navButtonClassName}`}
                  >
                    <ArrowRight size={14} />
                    К следующему
                  </button>
                  <button
                    type="button"
                    onClick={handlePrevTask}
                    disabled={isFirstTask}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${navButtonClassName}`}
                    aria-label="Предыдущее задание"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextTask}
                    disabled={isLastTask}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${navButtonClassName}`}
                    aria-label="Следующее задание"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className={`mock-exam-scroll min-h-0 flex-1 pr-1 ${shouldFitSingleScreenshot ? 'overflow-hidden' : 'overflow-y-auto'}`}>
              {!currentQuestion ? (
                <div className={`rounded-[1.75rem] border border-dashed p-6 text-sm ${isDarkTheme ? 'border-white/10 bg-white/[0.04] text-slate-300' : 'border-slate-200 bg-white/70 text-slate-500'}`}>
                  Задание {selectedTask} ещё не добавлено преподавателем.
                </div>
              ) : (
                <div className={shouldFitSingleScreenshot ? 'flex h-full min-h-0 flex-col' : 'space-y-4'}>
                  <section className={`rounded-[1.75rem] border p-3.5 sm:p-4 ${panelClassName} ${shouldFitSingleScreenshot ? 'flex h-full min-h-0 flex-col' : ''}`}>
                    <div className={`flex flex-wrap items-center justify-between gap-3 ${shouldFitSingleScreenshot ? 'mb-3' : 'mb-4'}`}>
                      <div className={labelClassName}>Условие</div>
                      {(screenshots.length > 0 || files.length > 0) && (
                        <div className={`${isDarkTheme ? 'text-slate-500' : 'text-slate-400'} text-xs`}>
                          {screenshots.length > 0 && `${screenshots.length} изображ.`}
                          {screenshots.length > 0 && files.length > 0 ? ' · ' : ''}
                          {files.length > 0 && `${files.length} файл.`}
                        </div>
                      )}
                    </div>

                    {currentQuestion?.question && (
                      <div className={`whitespace-pre-wrap text-[15px] leading-7 sm:text-base ${isDarkTheme ? 'text-slate-100' : 'text-slate-800'}`}>
                        {currentQuestion.question}
                      </div>
                    )}

                    {screenshots.length > 0 && (
                      <div className={`${currentQuestion?.question ? 'mt-5' : (shouldFitSingleScreenshot ? 'mt-1' : '')} ${shouldFitSingleScreenshot ? 'flex min-h-0 flex-1 items-center justify-center' : 'space-y-3'}`}>
                        {screenshots.map((img) => (
                          <img
                            key={img.storageName || img.url}
                            src={img.url}
                            alt={img.name || 'Скриншот'}
                            className={`mx-auto block ${shouldFitSingleScreenshot ? 'h-full max-h-full w-auto max-w-full' : `w-auto max-w-full ${screenshotMaxHeightClass}`} cursor-zoom-in rounded-[1.4rem] border object-contain shadow-sm transition-shadow hover:shadow-lg ${isDarkTheme ? 'border-white/10 bg-slate-950/80' : 'border-slate-200 bg-white'}`}
                            onClick={() => setExpandedImage(img.url)}
                          />
                        ))}
                      </div>
                    )}

                    {files.length > 0 && (
                      <div className="mt-5 grid gap-2 sm:grid-cols-2">
                        {files.map((file) => (
                          <a
                            key={file.storageName || file.url}
                            href={buildDownloadUrl(file.url)}
                            download={file?.name || undefined}
                            className={attachmentLinkClassName}
                          >
                            <span className="min-w-0 truncate">{file.name || 'Файл'}</span>
                            <FileDown size={18} className="shrink-0 text-violet-500" />
                          </a>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>

            {currentQuestion ? (
              <div
                className={`rounded-[1.75rem] border p-3.5 ${panelClassName} ${hasLargeAnswerGrid ? 'flex min-h-0 shrink-0 flex-col overflow-hidden' : ''}`}
                style={answerPanelStyle}
              >
                <div className={`flex min-h-0 flex-col gap-4 xl:flex-row xl:justify-between ${hasLargeAnswerGrid ? 'h-full' : ''}`}>
                  <div className="min-w-0 flex flex-1 flex-col gap-3 min-h-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className={labelClassName}>Ответ</div>
                      {results[taskKey] !== undefined && (
                        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                          results[taskKey]
                            ? (isDarkTheme
                              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                              : 'border border-emerald-200 bg-emerald-50 text-emerald-700')
                            : (isDarkTheme
                              ? 'border border-rose-500/30 bg-rose-500/10 text-rose-200'
                              : 'border border-rose-200 bg-rose-50 text-rose-600')
                        }`}>
                          {results[taskKey] ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
                          {results[taskKey] ? 'Верно' : 'Неверно'}
                        </div>
                      )}
                    </div>

                    <div className={hasLargeAnswerGrid ? 'min-h-0 flex-1 overflow-y-auto pr-1' : ''}>
                      <div className={`mb-2 text-xs ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                        {answerCount > 1
                          ? (
                            allowPartialForTask
                              ? 'Можно заполнить часть ответов. Enter проверяет.'
                              : `Нужно заполнить ${answerCount} ответов. Enter проверяет.`
                          )
                          : 'Введите ответ без лишних пробелов. Enter проверяет.'}
                      </div>
                      {answerCount > 1 ? (
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {Array.from({ length: answerCount }).map((_, idx) => (
                            <input
                              key={idx}
                              type="text"
                              value={currentAnswers[idx] ?? ''}
                              onKeyDown={handleAnswerKeyDown}
                              onChange={(e) => {
                                const value = e.target.value;
                                hasLocalAttemptChangesRef.current = true;
                                setSaveError('');
                                setSaveStatus('');
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
                              className={answerInputClassName}
                            />
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={singleAnswer}
                          onKeyDown={handleAnswerKeyDown}
                          onChange={(e) => {
                            hasLocalAttemptChangesRef.current = true;
                            setSaveError('');
                            setSaveStatus('');
                            setAnswers((prev) => ({ ...prev, [taskKey]: e.target.value }));
                          }}
                          placeholder="Введите ответ..."
                          className={answerInputClassName}
                        />
                      )}
                    </div>

                    {saveError && (
                      <div className="text-sm text-rose-500">{saveError}</div>
                    )}
                    {saveStatus && !saveError && (
                      <div className={`text-sm ${results[taskKey] ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {saveStatus}
                      </div>
                    )}
                  </div>

                  <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row xl:w-auto xl:flex-col xl:self-end">
                    <label className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold sm:w-auto xl:min-w-[9rem] ${
                      isDarkTheme
                        ? 'border-white/10 bg-white/[0.04] text-slate-300'
                        : 'border-slate-200 bg-white/80 text-slate-600'
                    }`}>
                      <input
                        type="checkbox"
                        checked={autoAdvance}
                        onChange={(event) => setAutoAdvance(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                      />
                      Автодалее
                    </label>
                    <Button
                      variant="secondary"
                      onClick={handleNextUnsolvedTask}
                      disabled={!nextUnsolvedTask}
                      className={`w-full sm:w-auto xl:min-w-[9rem] sm:hidden ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
                    >
                      <ArrowRight size={16} />
                      Следующее
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={onClose}
                      className={`w-full sm:w-auto xl:min-w-[9rem] ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
                    >
                      Закрыть
                    </Button>
                    <Button
                      onClick={handleCheck}
                      disabled={!canCheck}
                      className="w-full sm:w-auto xl:min-w-[9rem]"
                    >
                      {checking ? 'Проверяем...' : 'Проверить'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`rounded-[1.5rem] border p-4 ${mutedPanelClassName}`}>
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={onClose}
                    className={`w-full sm:w-auto ${isDarkTheme ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.1]' : ''}`}
                  >
                    Закрыть
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {expandedImage && (
        <div
          className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setExpandedImage(null)}
        >
          <img src={expandedImage} alt="Просмотр" className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

export default MockExamModal;
