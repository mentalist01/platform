import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { api } from '../services/api';
import { Button } from './ui';
const MockExamEditorModal = ({
  exam,
  onClose,
  onSave,
  MOCK_TASK_NUMBERS,
  getMockAnswerCountForTask,
  getExpectedAnswers,
  allowsPartialAnswers,
}) => {
  const [title, setTitle] = useState(exam?.title || '');
  const [selectedTask, setSelectedTask] = useState(MOCK_TASK_NUMBERS[0]);
  const [question, setQuestion] = useState('');
  const [answerInputs, setAnswerInputs] = useState(['']);
  const [existingScreenshots, setExistingScreenshots] = useState([]);
  const [existingFiles, setExistingFiles] = useState([]);
  const [newScreenshots, setNewScreenshots] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [removedScreenshots, setRemovedScreenshots] = useState([]);
  const [removedFiles, setRemovedFiles] = useState([]);
  const [previewScreens, setPreviewScreens] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDraggingScreens, setIsDraggingScreens] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const screenshotsRef = useRef(null);
  const filesRef = useRef(null);

  useEffect(() => {
    setTitle(exam?.title || '');
  }, [exam?.id]);

  useEffect(() => {
    setSelectedTask(MOCK_TASK_NUMBERS[0]);
  }, [exam?.id]);

  useEffect(() => {
    const previews = newScreenshots.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviewScreens(previews);
    return () => previews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [newScreenshots]);

  const loadTask = (taskNumber) => {
    const key = String(taskNumber);
    const entry = exam?.tasks?.[key] || null;
    const requiredCount = getMockAnswerCountForTask(taskNumber);
    setQuestion(entry?.question || '');
    setAnswerInputs(getExpectedAnswers(entry, requiredCount));
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
  }, [exam, selectedTask]);

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
    setIsDraggingScreens(false);
    addScreenshotFiles(e.dataTransfer?.files || []);
  };

  const handleFilesDrop = (e) => {
    e.preventDefault();
    setIsDraggingFiles(false);
    addExtraFiles(e.dataTransfer?.files || []);
  };

  const handleSaveTask = async () => {
    if (!exam) return;
    const requiredCount = getMockAnswerCountForTask(selectedTask);
    const trimmedAnswers = answerInputs.map((val) => String(val ?? '').trim());
    const answersSlice = trimmedAnswers.slice(0, requiredCount);
    const hasEmpty = answersSlice.some((val) => !val);
    const hasAny = answersSlice.some((val) => val);
    if (requiredCount > 1 && allowsPartialAnswers(selectedTask)) {
      if (!hasAny) {
        setError('Введите хотя бы один правильный ответ');
        return;
      }
    } else if (hasEmpty) {
      setError(requiredCount > 1 ? 'Введите все правильные ответы' : 'Введите правильный ответ');
      return;
    }
    const hasAnyAttachments = existingScreenshots.length > 0 || existingFiles.length > 0 || newScreenshots.length > 0 || newFiles.length > 0;
    if (!question.trim() && !hasAnyAttachments) {
      setError('Добавьте текст вопроса или прикрепите файл/скриншот');
      return;
    }
    setSaving(true);
    setError('');
    let uploadedScreens = [];
    let uploadedFiles = [];
    try {
      if (newScreenshots.length > 0) {
        uploadedScreens = await Promise.all(newScreenshots.map((file) => api.uploadTestFile(file)));
      }
      if (newFiles.length > 0) {
        uploadedFiles = await Promise.all(newFiles.map((file) => api.uploadTestFile(file)));
      }
    } catch (err) {
      setError(err?.message || err);
      setSaving(false);
      return;
    }

    const finalScreens = [...existingScreenshots, ...uploadedScreens];
    const finalFiles = [...existingFiles, ...uploadedFiles];
    const taskEntry = {
      id: exam?.tasks?.[String(selectedTask)]?.id || Date.now(),
      question: question.trim(),
      screenshots: finalScreens,
      files: finalFiles,
      ...(requiredCount > 1
        ? { answers: answersSlice }
        : { answer: trimmedAnswers[0] })
    };

    const nextTasks = { ...(exam.tasks || {}) };
    nextTasks[String(selectedTask)] = taskEntry;
    const nextTitle = title.trim() || exam.title;
    try {
      const saved = await onSave({ ...exam, title: nextTitle, tasks: nextTasks });
      const removed = [...removedScreenshots, ...removedFiles];
      await Promise.all(removed.map((item) => api.deleteTestFile(item?.storageName)));
      if (saved?.tasks) {
        loadTask(selectedTask);
      }
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!exam) return;
    const nextTitle = title.trim() || exam.title;
    setSaving(true);
    setError('');
    try {
      await onSave({ ...exam, title: nextTitle, tasks: exam.tasks || {} });
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setSaving(false);
    }
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
      await onSave({ ...exam, title: title.trim() || exam.title, tasks: nextTasks });
      const toRemove = [
        ...(Array.isArray(current?.screenshots) ? current.screenshots : []),
        ...(Array.isArray(current?.files) ? current.files : [])
      ];
      await Promise.all(toRemove.map((item) => api.deleteTestFile(item?.storageName)));
      loadTask(selectedTask);
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setSaving(false);
    }
  };

  if (!exam) return null;

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="surface-card modal-card rounded-3xl w-full max-w-5xl max-h-[90vh] p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Пробник</div>
            <h3 className="text-lg font-bold text-gray-900">Редактирование пробника</h3>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
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
              <div className="mt-2">
                <Button variant="secondary" onClick={handleSaveTitle} disabled={saving}>Сохранить название</Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Задание</label>
              <select
                value={selectedTask}
                onChange={(e) => setSelectedTask(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
              >
                {MOCK_TASK_NUMBERS.map((num) => (
                  <option key={num} value={num}>Задание {num}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
              Добавьте текст, фото, файлы и правильные ответы для задания {selectedTask}.
            </div>
          </div>

            <div className="lg:col-span-2 space-y-4" onPaste={handlePasteImages}>
            <div>
              <label className="text-xs font-semibold text-gray-500">Текст задания</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="mt-1 w-full min-h-[120px] px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                placeholder="Условие задания"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500">Скриншоты</label>
                <div
                  onDrop={handleScreensDrop}
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingScreens(true); }}
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
                    {existingScreenshots.map((item, idx) => (
                      <div key={item.storageName || item.id || idx} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                        <span className="truncate">{item.name || 'Скриншот'}</span>
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
                    ))}
                    {previewScreens.map((item, idx) => (
                      <div key={`new-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white border border-gray-200 rounded-lg px-2 py-1">
                        <span className="truncate">{item.file.name}</span>
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
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingFiles(true); }}
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
              <label className="text-xs font-semibold text-gray-500">Правильные ответы</label>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                {Array.from({ length: getMockAnswerCountForTask(selectedTask) }).map((_, idx) => (
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
                <Button variant="secondary" onClick={onClose}>Закрыть</Button>
                <Button onClick={handleSaveTask} disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить задание'}
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

