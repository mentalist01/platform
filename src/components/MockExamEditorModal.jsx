import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import {
  DEFAULT_MOCK_EXAM_BADGE_THEME_ID,
  MOCK_EXAM_BADGE_MAX_ITEMS,
  MOCK_EXAM_BADGE_SUGGESTIONS,
  MOCK_EXAM_BADGE_THEME_OPTIONS,
  getMockExamBadgeSignature,
  getMockExamBadgeTheme,
  normalizeMockExamBadgeLabel,
  normalizeMockExamBadges,
} from '../utils/mockExamBadges';
import { Button } from './ui';
import { resolveUploadsUrl } from '../utils/runtimeUrls';
import { formatDifficultyDuration } from '../utils/questionDifficulty';
import MockExamTaskDifficultyBadge from './MockExamTaskDifficultyBadge';
import {
  getAcceptedAnswerVariants,
  getAnswerVectorSignature,
  normalizeAnswerVector,
} from '../utils/answerVariants';

const getAttachmentKey = (item) => String(item?.storageName || item?.id || item?.url || item?.name || '').trim();
const buildAttachmentSignature = (items = []) => (
  items
    .map((item) => getAttachmentKey(item))
    .filter(Boolean)
    .sort()
    .join('|')
);
const normalizeAnswerValues = (values, count) => (
  Array.from({ length: count }, (_, idx) => String(values?.[idx] ?? '').trim())
);
const getAlternativeAnswerValues = (entry, count, getExpectedAnswers) => {
  const primary = normalizeAnswerValues(getExpectedAnswers(entry, count), count);
  const primarySignature = getAnswerVectorSignature(primary, count);
  return getAcceptedAnswerVariants(entry, count)
    .filter((variant) => getAnswerVectorSignature(variant, count) !== primarySignature)
    .map((variant) => normalizeAnswerValues(variant, count));
};
const buildAnswerVariantsSignature = (variants, count) => JSON.stringify(
  (Array.isArray(variants) ? variants : []).map((variant) => normalizeAnswerValues(variant, count))
);
const hasTaskContent = (entry, taskNumber, getMockAnswerCountForTask, getExpectedAnswers) => {
  if (!entry || typeof entry !== 'object') return false;
  const questionText = String(entry?.question || '').trim();
  const screenshotsCount = Array.isArray(entry?.screenshots) ? entry.screenshots.length : 0;
  const filesCount = Array.isArray(entry?.files) ? entry.files.length : 0;
  const answerCount = getMockAnswerCountForTask(taskNumber, entry);
  const answers = normalizeAnswerValues(getExpectedAnswers(entry, answerCount), answerCount);
  return Boolean(questionText || screenshotsCount > 0 || filesCount > 0 || answers.some(Boolean));
};

const MockExamEditorModal = ({
  exam,
  onClose,
  onSave,
  MOCK_TASK_NUMBERS,
  getMockAnswerCountForTask,
  getExpectedAnswers,
  allowsPartialAnswers,
  taskAnalytics = {},
}) => {
  const [title, setTitle] = useState(exam?.title || '');
  const [badges, setBadges] = useState(() => normalizeMockExamBadges(exam?.badges));
  const [badgeDraftLabel, setBadgeDraftLabel] = useState('');
  const [badgeDraftTheme, setBadgeDraftTheme] = useState(DEFAULT_MOCK_EXAM_BADGE_THEME_ID);
  const [badgesExpanded, setBadgesExpanded] = useState(false);
  const [selectedTask, setSelectedTask] = useState(MOCK_TASK_NUMBERS[0] || 1);
  const [question, setQuestion] = useState('');
  const [answerInputs, setAnswerInputs] = useState(['']);
  const [alternativeAnswerInputs, setAlternativeAnswerInputs] = useState([]);
  const [existingScreenshots, setExistingScreenshots] = useState([]);
  const [existingFiles, setExistingFiles] = useState([]);
  const [newScreenshots, setNewScreenshots] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [removedScreenshots, setRemovedScreenshots] = useState([]);
  const [removedFiles, setRemovedFiles] = useState([]);
  const [previewScreens, setPreviewScreens] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDraggingTaskAttachments, setIsDraggingTaskAttachments] = useState(false);
  const [isDraggingScreens, setIsDraggingScreens] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const screenshotsRef = useRef(null);
  const filesRef = useRef(null);

  useEffect(() => {
    setTitle(exam?.title || '');
    setBadges(normalizeMockExamBadges(exam?.badges));
    setBadgeDraftLabel('');
    setBadgeDraftTheme(DEFAULT_MOCK_EXAM_BADGE_THEME_ID);
    setBadgesExpanded(false);
  }, [exam?.id]);

  useEffect(() => {
    setSelectedTask(MOCK_TASK_NUMBERS[0] || 1);
  }, [exam?.id, MOCK_TASK_NUMBERS]);

  useEffect(() => {
    const previews = newScreenshots.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviewScreens(previews);
    return () => previews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [newScreenshots]);

  const loadTask = (taskNumber, sourceExam = exam) => {
    const key = String(taskNumber);
    const entry = sourceExam?.tasks?.[key] || null;
    const requiredCount = getMockAnswerCountForTask(taskNumber, entry);
    setQuestion(entry?.question || '');
    setAnswerInputs(getExpectedAnswers(entry, requiredCount));
    setAlternativeAnswerInputs(getAlternativeAnswerValues(entry, requiredCount, getExpectedAnswers));
    setExistingScreenshots(Array.isArray(entry?.screenshots) ? entry.screenshots : []);
    setExistingFiles(Array.isArray(entry?.files) ? entry.files : []);
    setNewScreenshots([]);
    setNewFiles([]);
    setRemovedScreenshots([]);
    setRemovedFiles([]);
    setError('');
  };

  useEffect(() => {
    if (!exam) return;
    loadTask(selectedTask);
  }, [exam?.id, selectedTask]);

  const currentTaskEntry = exam?.tasks?.[String(selectedTask)] || null;
  const currentTaskAnalytics = taskAnalytics?.[String(selectedTask)] || null;
  const requiredAnswerCount = getMockAnswerCountForTask(selectedTask, currentTaskEntry);
  const initialAnswers = normalizeAnswerValues(
    getExpectedAnswers(currentTaskEntry, requiredAnswerCount),
    requiredAnswerCount
  );
  const currentAnswers = normalizeAnswerValues(answerInputs, requiredAnswerCount);
  const initialAlternativeAnswers = getAlternativeAnswerValues(
    currentTaskEntry,
    requiredAnswerCount,
    getExpectedAnswers
  );

  const questionDirty = String(question || '').trim() !== String(currentTaskEntry?.question || '').trim();
  const answersDirty = currentAnswers.join('||') !== initialAnswers.join('||');
  const answerVariantsDirty = buildAnswerVariantsSignature(alternativeAnswerInputs, requiredAnswerCount)
    !== buildAnswerVariantsSignature(initialAlternativeAnswers, requiredAnswerCount);
  const existingScreensDirty = buildAttachmentSignature(existingScreenshots)
    !== buildAttachmentSignature(Array.isArray(currentTaskEntry?.screenshots) ? currentTaskEntry.screenshots : []);
  const existingFilesDirty = buildAttachmentSignature(existingFiles)
    !== buildAttachmentSignature(Array.isArray(currentTaskEntry?.files) ? currentTaskEntry.files : []);
  const uploadsQueued = newScreenshots.length > 0 || newFiles.length > 0;
  const removedQueued = removedScreenshots.length > 0 || removedFiles.length > 0;
  const taskDirty = questionDirty || answersDirty || answerVariantsDirty || existingScreensDirty || existingFilesDirty || uploadsQueued || removedQueued;
  const titleDirty = String(title || '').trim() !== String(exam?.title || '').trim();
  const badgesDirty = getMockExamBadgeSignature(badges) !== getMockExamBadgeSignature(exam?.badges);
  const metadataDirty = titleDirty || badgesDirty;
  const hasUnsavedChanges = taskDirty || metadataDirty;

  const taskMeta = useMemo(
    () => MOCK_TASK_NUMBERS.map((taskNumber) => {
      const entry = exam?.tasks?.[String(taskNumber)] || null;
      return {
        taskNumber,
        isFilled: hasTaskContent(entry, taskNumber, getMockAnswerCountForTask, getExpectedAnswers),
      };
    }),
    [MOCK_TASK_NUMBERS, exam?.tasks, getMockAnswerCountForTask, getExpectedAnswers]
  );

  const filledTaskCount = taskMeta.filter((item) => item.isFilled).length;
  const selectedTaskIndex = MOCK_TASK_NUMBERS.indexOf(selectedTask);
  const prevTask = selectedTaskIndex > 0 ? MOCK_TASK_NUMBERS[selectedTaskIndex - 1] : null;
  const nextTask = selectedTaskIndex >= 0 && selectedTaskIndex < MOCK_TASK_NUMBERS.length - 1
    ? MOCK_TASK_NUMBERS[selectedTaskIndex + 1]
    : null;

  const addBadge = (rawLabel = badgeDraftLabel, rawThemeId = badgeDraftTheme) => {
    const label = normalizeMockExamBadgeLabel(rawLabel);
    if (!label) {
      setError('Введите текст бейджа');
      return;
    }
    const nextBadges = normalizeMockExamBadges([
      ...badges,
      { label, themeId: rawThemeId || DEFAULT_MOCK_EXAM_BADGE_THEME_ID }
    ]);
    if (getMockExamBadgeSignature(nextBadges) === getMockExamBadgeSignature(badges)) {
      setError(
        badges.length >= MOCK_EXAM_BADGE_MAX_ITEMS
          ? `Можно добавить до ${MOCK_EXAM_BADGE_MAX_ITEMS} бейджей`
          : 'Такой бейдж уже добавлен'
      );
      return;
    }
    setBadges(nextBadges);
    setBadgeDraftLabel('');
    setError('');
  };

  const removeBadge = (targetIndex) => {
    setBadges((prev) => prev.filter((_, index) => index !== targetIndex));
    setError('');
  };

  const addScreenshotFiles = (files) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!list.length) return;
    setNewScreenshots((prev) => [...prev, ...list]);
  };

  const addExtraFiles = (files) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setNewFiles((prev) => [...prev, ...list]);
  };

  const isTaskAttachmentDrag = (e) => {
    if ((e.dataTransfer?.files?.length || 0) > 0) return true;
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes('Files')) return true;
    return Array.from(e.dataTransfer?.items || []).some((item) => item?.kind === 'file');
  };

  const resetTaskAttachmentDragState = () => {
    setIsDraggingTaskAttachments(false);
    setIsDraggingScreens(false);
    setIsDraggingFiles(false);
  };

  const addTaskAttachmentFiles = (files) => {
    const incoming = Array.from(files || []).filter(Boolean);
    if (incoming.length === 0) return;
    const images = incoming.filter((file) => file.type?.startsWith('image/'));
    const extraFiles = incoming.filter((file) => !file.type?.startsWith('image/'));
    addScreenshotFiles(images);
    addExtraFiles(extraFiles);
  };

  const handlePasteImages = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const images = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (images.length === 0) return;
    e.preventDefault();
    addScreenshotFiles(images);
  };

  const handleScreensDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetTaskAttachmentDragState();
    addScreenshotFiles(e.dataTransfer?.files || []);
  };

  const handleFilesDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetTaskAttachmentDragState();
    addExtraFiles(e.dataTransfer?.files || []);
  };

  const handleTaskAttachmentDragEnter = (e) => {
    if (!isTaskAttachmentDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingTaskAttachments(true);
  };

  const handleTaskAttachmentDragOver = (e) => {
    if (!isTaskAttachmentDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    setIsDraggingTaskAttachments(true);
  };

  const handleTaskAttachmentDragLeave = (e) => {
    if (!isTaskAttachmentDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    setIsDraggingTaskAttachments(false);
  };

  const handleTaskAttachmentDrop = (e) => {
    if (!isTaskAttachmentDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    resetTaskAttachmentDragState();
    addTaskAttachmentFiles(e.dataTransfer?.files || []);
  };

  const requestTaskChange = (taskNumber) => {
    if (!Number.isFinite(taskNumber) || taskNumber === selectedTask) return;
    if (taskDirty && !confirm('Есть несохранённые изменения в текущем задании. Перейти без сохранения?')) return;
    setSelectedTask(taskNumber);
  };

  const handleRequestClose = () => {
    if (hasUnsavedChanges && !confirm('Есть несохранённые изменения. Закрыть редактор без сохранения?')) return;
    onClose();
  };

  const handleSaveTask = async () => {
    if (!exam) return null;
    const requiredCount = getMockAnswerCountForTask(selectedTask, currentTaskEntry);
    const trimmedAnswers = answerInputs.map((val) => String(val ?? '').trim());
    const answersSlice = trimmedAnswers.slice(0, requiredCount);
    const hasEmpty = answersSlice.some((val) => !val);
    const hasAny = answersSlice.some((val) => val);
    if (requiredCount > 1 && allowsPartialAnswers(selectedTask, currentTaskEntry)) {
      if (!hasAny) {
        setError('Введите хотя бы один правильный ответ');
        return null;
      }
    } else if (hasEmpty) {
      setError(requiredCount > 1 ? 'Введите все правильные ответы' : 'Введите правильный ответ');
      return null;
    }
    const acceptedAnswerVariants = [answersSlice];
    const acceptedSignatures = new Set([getAnswerVectorSignature(answersSlice, requiredCount)]);
    for (let index = 0; index < alternativeAnswerInputs.length; index += 1) {
      const variant = normalizeAnswerVector(alternativeAnswerInputs[index], requiredCount);
      if (variant.every((value) => !value)) continue;
      if (!allowsPartialAnswers(selectedTask, currentTaskEntry) && variant.some((value) => !value)) {
        setError(`Заполните все поля варианта ${index + 2} или удалите его`);
        return null;
      }
      const signature = getAnswerVectorSignature(variant, requiredCount);
      if (acceptedSignatures.has(signature)) {
        setError(`Вариант ${index + 2} повторяет уже добавленный ответ`);
        return null;
      }
      acceptedSignatures.add(signature);
      acceptedAnswerVariants.push(variant);
    }
    const hasAnyAttachments = existingScreenshots.length > 0 || existingFiles.length > 0 || newScreenshots.length > 0 || newFiles.length > 0;
    if (!question.trim() && !hasAnyAttachments) {
      setError('Добавьте текст вопроса или прикрепите файл/скриншот');
      return null;
    }

    setSaving(true);
    setError('');
    try {
      const uploadedScreens = newScreenshots.length > 0
        ? await Promise.all(newScreenshots.map((file) => api.uploadTestFile(file)))
        : [];
      const uploadedFiles = newFiles.length > 0
        ? await Promise.all(newFiles.map((file) => api.uploadTestFile(file)))
        : [];

      const finalScreens = [...existingScreenshots, ...uploadedScreens];
      const finalFiles = [...existingFiles, ...uploadedFiles];
      const previousTaskEntry = exam?.tasks?.[String(selectedTask)] || null;
      const taskIdentity = previousTaskEntry?.id || Date.now();
      const analyticsVersion = taskDirty
        ? Date.now()
        : (previousTaskEntry?.analyticsVersion || taskIdentity);
      const taskEntry = {
        ...(previousTaskEntry || {}),
        id: taskIdentity,
        analyticsVersion,
        question: question.trim(),
        screenshots: finalScreens,
        files: finalFiles,
        ...(requiredCount > 1
          ? { answers: answersSlice }
          : { answer: trimmedAnswers[0] })
      };
      if (requiredCount > 1) delete taskEntry.answer;
      else delete taskEntry.answers;
      Object.keys(taskEntry).forEach((key) => {
        if (/^answer\d+$/i.test(key)) delete taskEntry[key];
      });
      if (acceptedAnswerVariants.length > 1) taskEntry.acceptedAnswerVariants = acceptedAnswerVariants;
      else delete taskEntry.acceptedAnswerVariants;

      const nextTasks = { ...(exam.tasks || {}) };
      nextTasks[String(selectedTask)] = taskEntry;
      const nextTitle = title.trim() || exam.title;
      const nextBadges = normalizeMockExamBadges(badges);

      const saved = await onSave({ ...exam, title: nextTitle, badges: nextBadges, tasks: nextTasks });
      const removed = [...removedScreenshots, ...removedFiles].filter((item) => item?.storageName);
      if (removed.length > 0) {
        await Promise.all(removed.map((item) => api.deleteTestFile(item.storageName)));
      }
      setBadges(normalizeMockExamBadges(saved?.badges || nextBadges));
      if (saved?.tasks) {
        loadTask(selectedTask, saved);
      }
      return saved || null;
    } catch (err) {
      setError(err?.message || err);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveHeader = async () => {
    if (!exam) return null;
    const nextTitle = title.trim() || exam.title;
    const nextBadges = normalizeMockExamBadges(badges);
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({ ...exam, title: nextTitle, badges: nextBadges, tasks: exam.tasks || {} });
      if (saved?.title) setTitle(saved.title);
      setBadges(normalizeMockExamBadges(saved?.badges || nextBadges));
      return saved || null;
    } catch (err) {
      setError(err?.message || err);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndOpenNext = async () => {
    const saved = await handleSaveTask();
    if (!saved || !nextTask) return;
    setSelectedTask(nextTask);
  };

  const handleDeleteTask = async () => {
    if (!exam) return;
    if (!exam.tasks?.[String(selectedTask)]) return;
    if (!confirm('Удалить задание из пробника?')) return;
    const current = exam.tasks[String(selectedTask)];
    const nextTasks = { ...(exam.tasks || {}) };
    delete nextTasks[String(selectedTask)];
    setSaving(true);
    setError('');
    try {
      const nextBadges = normalizeMockExamBadges(badges);
      const saved = await onSave({ ...exam, title: title.trim() || exam.title, badges: nextBadges, tasks: nextTasks });
      const toRemove = [
        ...(Array.isArray(current?.screenshots) ? current.screenshots : []),
        ...(Array.isArray(current?.files) ? current.files : [])
      ].filter((item) => item?.storageName);
      if (toRemove.length > 0) {
        await Promise.all(toRemove.map((item) => api.deleteTestFile(item.storageName)));
      }
      setBadges(normalizeMockExamBadges(saved?.badges || nextBadges));
      if (saved?.tasks) {
        loadTask(selectedTask, saved);
      } else {
        loadTask(selectedTask);
      }
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setSaving(false);
    }
  };

  if (!exam) return null;

  const modal = (
    <div
      className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleRequestClose();
      }}
    >
      <div className="surface-card modal-card rounded-3xl w-full max-w-5xl max-h-[90vh] p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Пробник</div>
            <h3 className="text-lg font-bold text-gray-900">Редактирование пробника</h3>
            <div className={`mt-1 text-xs ${taskDirty ? 'text-amber-600' : 'text-gray-500'}`}>
              {taskDirty ? 'Есть несохранённые изменения в задании' : 'Изменения задания сохранены'}
            </div>
          </div>
          <button onClick={handleRequestClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500">Название пробника</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                  placeholder="Пробник"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button variant="secondary" onClick={handleSaveHeader} disabled={saving || !metadataDirty}>
                    {saving ? 'Сохранение...' : 'Сохранить шапку'}
                  </Button>
                  {metadataDirty && <span className="text-[11px] text-amber-600">Название или бейджи еще не сохранены</span>}
                </div>
              </div>

              <div className="rounded-2xl border border-purple-100 bg-gradient-to-br from-white via-purple-50/60 to-fuchsia-50/60 p-3">
                <button
                  type="button"
                  onClick={() => setBadgesExpanded((prev) => !prev)}
                  aria-expanded={badgesExpanded}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div>
                    <div className="text-xs font-semibold text-gray-700">Тематические бейджи</div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      Например: "Реальный экзамен", "Новый формат", "Сложный уровень".
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border border-white/80 bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-gray-500">
                      {`${badges.length}/${MOCK_EXAM_BADGE_MAX_ITEMS}`}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`mt-0.5 text-gray-400 transition-transform ${badgesExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {badgesExpanded && (
                  <>
                    {badges.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {badges.map((item, index) => {
                          const theme = getMockExamBadgeTheme(item.themeId);
                          return (
                            <button
                              key={`${item.themeId}-${item.label}-${index}`}
                              type="button"
                              onClick={() => removeBadge(index)}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition hover:scale-[1.01] ${theme.badgeClassName}`}
                              title="Удалить бейдж"
                            >
                              <span>{item.label}</span>
                              <span className="text-white/80">x</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3 space-y-2">
                      <input
                        type="text"
                        value={badgeDraftLabel}
                        onChange={(e) => {
                          setBadgeDraftLabel(e.target.value);
                          setError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addBadge();
                          }
                        }}
                        className="w-full rounded-xl border border-purple-200 bg-white/90 px-3 py-2 text-sm outline-none focus:border-purple-500"
                        placeholder="Текст бейджа"
                      />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <select
                          value={badgeDraftTheme}
                          onChange={(e) => setBadgeDraftTheme(e.target.value)}
                          className="w-full rounded-xl border border-purple-200 bg-white/90 px-3 py-2 text-sm outline-none focus:border-purple-500"
                        >
                          {MOCK_EXAM_BADGE_THEME_OPTIONS.map((theme) => (
                            <option key={theme.id} value={theme.id}>{theme.label}</option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          onClick={() => addBadge()}
                          disabled={saving || badges.length >= MOCK_EXAM_BADGE_MAX_ITEMS}
                          className="w-full justify-center sm:min-w-[132px]"
                        >
                          Добавить
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {MOCK_EXAM_BADGE_SUGGESTIONS.map((item) => {
                        const theme = getMockExamBadgeTheme(item.themeId);
                        return (
                          <button
                            key={`${item.themeId}-${item.label}`}
                            type="button"
                            onClick={() => addBadge(item.label, item.themeId)}
                            disabled={saving || badges.length >= MOCK_EXAM_BADGE_MAX_ITEMS}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${theme.badgeClassName}`}
                          >
                            <span className={`inline-block h-2.5 w-2.5 rounded-full border ${theme.swatchClassName}`} />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-gray-500">Задание</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => requestTaskChange(prevTask)}
                      disabled={!prevTask || saving}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      onClick={() => requestTaskChange(nextTask)}
                      disabled={!nextTask || saving}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 disabled:opacity-40"
                    >
                      Далее
                    </button>
                  </div>
                </div>
                <select
                  value={selectedTask}
                  onChange={(e) => requestTaskChange(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                >
                  {taskMeta.map((item) => (
                    <option key={item.taskNumber} value={item.taskNumber}>
                      {`Задание ${item.taskNumber}${item.isFilled ? ' • заполнено' : ''}`}
                    </option>
                  ))}
                </select>
                <div className="mt-2 rounded-2xl border border-gray-200 bg-gray-50 p-2.5">
                  <div className="text-[11px] font-semibold text-gray-500">
                    {`Заполнено заданий: ${filledTaskCount}/${MOCK_TASK_NUMBERS.length}`}
                  </div>
                  <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-9">
                    {taskMeta.map((item) => {
                      const isCurrent = item.taskNumber === selectedTask;
                      return (
                        <button
                          key={item.taskNumber}
                          type="button"
                          onClick={() => requestTaskChange(item.taskNumber)}
                          title={taskAnalytics?.[String(item.taskNumber)]
                            ? `Среднее активное время: ${formatDifficultyDuration(taskAnalytics[String(item.taskNumber)].averageDurationMs)}`
                            : undefined}
                          className={`rounded-md border px-1 py-1 text-[11px] font-semibold transition-colors ${
                            isCurrent
                              ? 'border-purple-500 bg-purple-600 text-white'
                              : item.isFilled
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300'
                                : 'border-gray-200 bg-white text-gray-500 hover:border-purple-200 hover:text-purple-700'
                          }`}
                        >
                          {item.taskNumber}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-gray-700">Метрики задания {selectedTask}</span>
                  <MockExamTaskDifficultyBadge
                    analytics={currentTaskAnalytics}
                    showWhenEmpty
                  />
                </div>
                {currentTaskAnalytics ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-white bg-white px-2.5 py-2">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Среднее время</span>
                      <strong className="mt-1 block text-sm text-gray-800">
                        {formatDifficultyDuration(currentTaskAnalytics.averageDurationMs)}
                      </strong>
                    </div>
                    <div className="rounded-xl border border-white bg-white px-2.5 py-2">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Точность</span>
                      <strong className="mt-1 block text-sm text-gray-800">{`${currentTaskAnalytics.accuracyPercent}%`}</strong>
                    </div>
                    <div className="rounded-xl border border-white bg-white px-2.5 py-2">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Решений</span>
                      <strong className="mt-1 block text-sm text-gray-800">{currentTaskAnalytics.sampleSize}</strong>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 leading-relaxed">
                    Среднее время и сложность появятся после первых решений с активным таймером.
                  </p>
                )}
              </div>
            </div>

            <div
              className={`mock-task-attachment-drop-zone lg:col-span-2 space-y-4 ${isDraggingTaskAttachments ? 'is-dragging-attachments' : ''}`}
              onPaste={handlePasteImages}
              onDragEnter={handleTaskAttachmentDragEnter}
              onDragOver={handleTaskAttachmentDragOver}
              onDragLeave={handleTaskAttachmentDragLeave}
              onDrop={handleTaskAttachmentDrop}
            >
              <div>
                <label className="text-xs font-semibold text-gray-500">Текст задания</label>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="mt-1 w-full min-h-[140px] px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                  placeholder="Условие задания"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500">Скриншоты</label>
                  <div
                    onDrop={handleScreensDrop}
                    onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; setIsDraggingScreens(true); }}
                    onDragLeave={() => setIsDraggingScreens(false)}
                    className={`mt-1 rounded-2xl border-2 border-dashed p-3 transition-colors ${
                      isDraggingScreens ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      ref={screenshotsRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => addScreenshotFiles(e.target.files)}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      <span>Перетащите изображения или вставьте Ctrl+V</span>
                      <button
                        type="button"
                        onClick={() => screenshotsRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50"
                      >
                        Выбрать
                      </button>
                    </div>
                  </div>
                  {(existingScreenshots.length > 0 || previewScreens.length > 0) && (
                    <div className="mt-2 space-y-2">
                      {existingScreenshots.map((item, idx) => {
                        const previewUrl = resolveUploadsUrl(item?.url || (item?.storageName ? `/uploads/${item.storageName}` : ''));
                        return (
                          <div key={item.storageName || item.id || idx} className="flex items-start justify-between gap-3 text-xs bg-white border border-gray-200 rounded-lg px-2 py-2">
                            <div className="flex min-w-0 items-start gap-3">
                              <button
                                type="button"
                                onClick={() => previewUrl && window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                                className="h-24 w-32 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-50"
                                title="Открыть изображение"
                              >
                                {previewUrl ? (
                                  <img
                                    src={previewUrl}
                                    alt={item.name || 'Скриншот'}
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-gray-400">
                                    IMG
                                  </div>
                                )}
                              </button>
                              <div className="min-w-0 pt-0.5">
                                <div className="truncate text-[12px] text-gray-700">{item.name || 'Скриншот'}</div>
                                {previewUrl && (
                                  <button
                                    type="button"
                                    onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                                    className="mt-1 text-[11px] text-purple-600 hover:text-purple-700"
                                  >
                                    Открыть крупно
                                  </button>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setRemovedScreenshots((prev) => [...prev, item]);
                                setExistingScreenshots((prev) => prev.filter((_, i) => i !== idx));
                              }}
                              className="text-red-500"
                            >
                              Удалить
                            </button>
                          </div>
                        );
                      })}
                      {previewScreens.map((item, idx) => (
                        <div key={`new-${idx}`} className="flex items-start justify-between gap-3 text-xs bg-white border border-gray-200 rounded-lg px-2 py-2">
                          <div className="flex min-w-0 items-start gap-3">
                            <button
                              type="button"
                              onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                              className="h-24 w-32 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-50"
                              title="Открыть изображение"
                            >
                              <img
                                src={item.url}
                                alt={item.file.name || 'Скриншот'}
                                className="h-full w-full object-contain"
                              />
                            </button>
                            <div className="min-w-0 pt-0.5">
                              <div className="truncate text-[12px] text-gray-700">{item.file.name}</div>
                              <button
                                type="button"
                                onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                                className="mt-1 text-[11px] text-purple-600 hover:text-purple-700"
                              >
                                Открыть крупно
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setNewScreenshots((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-red-500"
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-500">Доп. файлы</label>
                  <div
                    onDrop={handleFilesDrop}
                    onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; setIsDraggingFiles(true); }}
                    onDragLeave={() => setIsDraggingFiles(false)}
                    className={`mt-1 rounded-2xl border-2 border-dashed p-3 transition-colors ${
                      isDraggingFiles ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      ref={filesRef}
                      type="file"
                      multiple
                      onChange={(e) => addExtraFiles(e.target.files)}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      <span>Перетащите файлы сюда</span>
                      <button
                        type="button"
                        onClick={() => filesRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50"
                      >
                        Выбрать
                      </button>
                    </div>
                  </div>
                  {(existingFiles.length > 0 || newFiles.length > 0) && (
                    <div className="mt-2 space-y-2">
                      {existingFiles.map((item, idx) => (
                        <div key={item.storageName || item.id || idx} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                          <span className="truncate">{item.name || 'Файл'}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setRemovedFiles((prev) => [...prev, item]);
                              setExistingFiles((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            className="text-red-500"
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                      {newFiles.map((file, idx) => (
                        <div key={`new-file-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                          <span className="truncate">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-red-500"
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500">
                  {requiredAnswerCount > 1 ? 'Основной правильный набор ответов' : 'Основной правильный ответ'}
                </label>
                <div className="mt-1 text-[11px] text-gray-500">
                  {requiredAnswerCount > 1
                    ? (allowsPartialAnswers(selectedTask, currentTaskEntry)
                      ? 'Можно оставить часть ответов пустыми, но минимум один ответ обязателен.'
                      : `Нужно заполнить ${requiredAnswerCount} ответов.`)
                    : 'Нужно заполнить один ответ.'}
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Array.from({ length: requiredAnswerCount }).map((_, idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={answerInputs[idx] ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setAnswerInputs((prev) => {
                          const next = [...prev];
                          next[idx] = value;
                          return next;
                        });
                      }}
                      placeholder={`Ответ ${idx + 1}`}
                      className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                    />
                  ))}
                </div>
                {alternativeAnswerInputs.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {alternativeAnswerInputs.map((variant, variantIndex) => (
                      <div key={`answer-variant-${variantIndex}`} className="rounded-xl border border-purple-100 bg-purple-50/60 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-[11px] font-semibold text-purple-700">Допустимый вариант {variantIndex + 2}</span>
                          <button
                            type="button"
                            onClick={() => setAlternativeAnswerInputs((previous) => previous.filter((_, index) => index !== variantIndex))}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
                            aria-label={`Удалить допустимый вариант ${variantIndex + 2}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {Array.from({ length: requiredAnswerCount }).map((_, answerIndex) => (
                            <input
                              key={answerIndex}
                              type="text"
                              value={variant[answerIndex] ?? ''}
                              onChange={(event) => {
                                const value = event.target.value;
                                setAlternativeAnswerInputs((previous) => previous.map((entry, index) => {
                                  if (index !== variantIndex) return entry;
                                  const next = [...entry];
                                  next[answerIndex] = value;
                                  return next;
                                }));
                              }}
                              placeholder={requiredAnswerCount > 1 ? `Ответ ${answerIndex + 1}` : 'Ещё один верный ответ'}
                              className="w-full rounded-lg border border-purple-100 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500"
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setAlternativeAnswerInputs((previous) => (
                    previous.length >= 19
                      ? previous
                      : [...previous, Array.from({ length: requiredAnswerCount }, () => '')]
                  ))}
                  disabled={alternativeAnswerInputs.length >= 19}
                  className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={14} /> Добавить ещё вариант ответа
                </button>
                <p className="mt-1.5 text-[11px] text-gray-500">
                  При проверке будет принят любой из указанных вариантов.
                </p>
              </div>

              {error && <div className="text-xs text-red-500">{error}</div>}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleDeleteTask}
                  className="text-xs text-red-500 hover:text-red-600"
                  disabled={saving}
                >
                  Удалить задание
                </button>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={handleRequestClose}>Закрыть</Button>
                  <Button onClick={handleSaveTask} disabled={saving}>
                    {saving ? 'Сохранение...' : 'Сохранить задание'}
                  </Button>
                  <Button variant="secondary" onClick={handleSaveAndOpenNext} disabled={saving || !nextTask}>
                    Сохранить и далее
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

export default MockExamEditorModal;
