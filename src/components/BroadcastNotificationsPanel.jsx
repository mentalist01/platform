import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BookOpen, ChevronDown, ChevronUp, Gift, Image as ImageIcon, Paperclip, SendHorizontal, Trash2, X } from 'lucide-react';
import { api, resolveAuthenticatedUploadsUrl } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import LinkifiedText from './LinkifiedText';
import MockExamBadges from './MockExamBadges';
import { Button, Card } from './ui';
import ivanCoin from '../assets/ivan-coin-badge.png';

const formatNotificationDate = (value) => {
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

const formatFileSizeKb = (size) => `${Math.max(1, Math.round(Number(size || 0) / 1024))} КБ`;

const getNotificationAudienceHint = (role) => (
  role === 'admin'
    ? 'После отправки уведомление увидят все ученики платформы.'
    : 'После отправки уведомление увидят все ваши ученики.'
);

const getNotificationAuthorLabel = (item, role) => {
  if (role !== 'admin') return '';
  const author = String(item?.createdByName || '').trim();
  return author ? `Отправил: ${author}` : '';
};

const NotificationAttachmentPreview = ({ attachment, isImage = false }) => {
  if (!attachment?.url) return null;
  const href = resolveAuthenticatedUploadsUrl(attachment.url);
  if (!href) return null;

  if (isImage) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="teacher-broadcast-history__attachment teacher-broadcast-history__attachment--image mt-3 block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
      >
        <img
          src={href}
          alt={attachment?.name || 'Изображение'}
          className="max-h-72 w-full object-contain"
        />
      </a>
    );
  }

  return (
    <a
      href={buildDownloadUrl(href)}
      download={attachment?.name || undefined}
      className="teacher-broadcast-history__attachment teacher-broadcast-history__attachment--file mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition hover:border-purple-200 hover:bg-purple-50"
    >
      <div className="min-w-0">
        <div className="teacher-broadcast-history__attachment-name truncate font-semibold text-slate-900">
          {attachment?.name || 'Файл'}
        </div>
        <div className="teacher-broadcast-history__attachment-size mt-0.5 text-xs text-slate-500">
          {attachment?.size || ''}
        </div>
      </div>
      <Paperclip size={16} className="shrink-0 text-purple-600" />
    </a>
  );
};

const getFirstImageFile = (list) => {
  const files = Array.from(list || []);
  return files.find((file) => String(file?.type || '').toLowerCase().startsWith('image/')) || null;
};

const getFirstFile = (list) => Array.from(list || []).find(Boolean) || null;

const getMockExamTaskCount = (exam) => {
  const tasks = exam?.tasks && typeof exam.tasks === 'object' ? exam.tasks : {};
  return Object.keys(tasks).filter((key) => Boolean(tasks[key])).length;
};

const getNotificationCollapsedPreview = (item) => {
  const text = String(item?.text || '').replace(/\s+/g, ' ').trim();
  if (text) {
    return text.length > 140 ? `${text.slice(0, 140).trim()}...` : text;
  }
  if (item?.gift?.coins > 0) return `Подарок: +${item.gift.coins} монет`;
  if (item?.mockExam?.title) return `Пробник: ${item.mockExam.title}`;
  if (item?.image?.name) return `Картинка: ${item.image.name}`;
  if (item?.file?.name) return `Файл: ${item.file.name}`;
  return 'Нажмите, чтобы посмотреть детали уведомления.';
};

const BroadcastNotificationsPanel = ({ role = 'teacher' }) => {
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [fileAttachment, setFileAttachment] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [imageDropActive, setImageDropActive] = useState(false);
  const [fileDropActive, setFileDropActive] = useState(false);
  const [mockExams, setMockExams] = useState([]);
  const [mockExamsLoading, setMockExamsLoading] = useState(false);
  const [selectedMockExamId, setSelectedMockExamId] = useState('');
  const [giftCoinsInput, setGiftCoinsInput] = useState('');
  const [expandedNotificationIds, setExpandedNotificationIds] = useState([]);
  const [isComposerExpanded, setIsComposerExpanded] = useState(role !== 'teacher');
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(role !== 'teacher');

  const audienceHint = useMemo(() => getNotificationAudienceHint(role), [role]);
  const selectedMockExam = useMemo(
    () => (mockExams || []).find((exam) => String(exam?.id || '') === String(selectedMockExamId || '')) || null,
    [mockExams, selectedMockExamId]
  );
  const giftCoins = useMemo(() => {
    const raw = String(giftCoinsInput || '').replace(',', '.').trim();
    if (!raw) return 0;
    const numeric = Math.floor(Number(raw));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }, [giftCoinsInput]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [imageFile]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getBroadcastNotifications()
      .then((payload) => {
        if (cancelled) return;
        setItems(Array.isArray(payload) ? payload : []);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMockExamsLoading(true);
    api.getMockExams()
      .then((payload) => {
        if (cancelled) return;
        setMockExams(Array.isArray(payload) ? payload : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setMockExamsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setExpandedNotificationIds((prev) => prev.filter((id) => items.some((item) => item?.id === id)));
  }, [items]);

  const clearComposerFeedback = useCallback(() => {
    setError('');
    setSuccessMessage('');
  }, []);

  const clearImageSelection = useCallback(() => {
    setImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  const clearFileSelection = useCallback(() => {
    setFileAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const resetComposer = useCallback(() => {
    setText('');
    clearImageSelection();
    clearFileSelection();
    setSelectedMockExamId('');
    setGiftCoinsInput('');
    setSuccessMessage('');
    setImageDropActive(false);
    setFileDropActive(false);
  }, [clearFileSelection, clearImageSelection]);

  const applyImageFile = useCallback((nextFile, options = {}) => {
    const file = nextFile || null;
    const shouldClearWhenEmpty = options.clearWhenEmpty !== false;
    if (!file) {
      if (shouldClearWhenEmpty) clearImageSelection();
      return false;
    }
    if (!String(file.type || '').toLowerCase().startsWith('image/')) {
      setError('Для картинки выберите файл изображения.');
      return false;
    }
    clearComposerFeedback();
    setImageFile(file);
    return true;
  }, [clearComposerFeedback, clearImageSelection]);

  const applyAttachmentFile = useCallback((nextFile, options = {}) => {
    const file = nextFile || null;
    const shouldClearWhenEmpty = options.clearWhenEmpty !== false;
    if (!file) {
      if (shouldClearWhenEmpty) clearFileSelection();
      return false;
    }
    clearComposerFeedback();
    setFileAttachment(file);
    return true;
  }, [clearComposerFeedback, clearFileSelection]);

  const handleImageChange = useCallback((event) => {
    const nextFile = event.target.files?.[0] || null;
    const applied = applyImageFile(nextFile);
    if (!applied && event.target) {
      event.target.value = '';
    }
  }, [applyImageFile]);

  const handleFileChange = useCallback((event) => {
    const nextFile = event.target.files?.[0] || null;
    applyAttachmentFile(nextFile);
  }, [applyAttachmentFile]);

  const handleComposerPaste = useCallback((event) => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const imageFromFiles = getFirstImageFile(clipboardData.files);
    if (imageFromFiles) {
      event.preventDefault();
      applyImageFile(imageFromFiles, { clearWhenEmpty: false });
      return;
    }

    const imageFromItems = Array.from(clipboardData.items || [])
      .find((item) => item?.kind === 'file' && String(item.type || '').toLowerCase().startsWith('image/'))
      ?.getAsFile?.() || null;

    if (imageFromItems) {
      event.preventDefault();
      applyImageFile(imageFromItems, { clearWhenEmpty: false });
    }
  }, [applyImageFile]);

  const handleImageDragOver = useCallback((event) => {
    const imageFromDrop = getFirstImageFile(event.dataTransfer?.files);
    if (!imageFromDrop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!imageDropActive) setImageDropActive(true);
  }, [imageDropActive]);

  const handleImageDragLeave = useCallback(() => {
    setImageDropActive(false);
  }, []);

  const handleImageDrop = useCallback((event) => {
    event.preventDefault();
    setImageDropActive(false);
    const imageFromDrop = getFirstImageFile(event.dataTransfer?.files);
    if (!imageFromDrop) {
      setError('В блок картинки можно перетащить только изображение.');
      return;
    }
    applyImageFile(imageFromDrop, { clearWhenEmpty: false });
  }, [applyImageFile]);

  const handleFileDragOver = useCallback((event) => {
    const droppedFile = getFirstFile(event.dataTransfer?.files);
    if (!droppedFile) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!fileDropActive) setFileDropActive(true);
  }, [fileDropActive]);

  const handleFileDragLeave = useCallback(() => {
    setFileDropActive(false);
  }, []);

  const handleFileDrop = useCallback((event) => {
    event.preventDefault();
    setFileDropActive(false);
    const droppedFile = getFirstFile(event.dataTransfer?.files);
    if (!droppedFile) return;
    applyAttachmentFile(droppedFile, { clearWhenEmpty: false });
  }, [applyAttachmentFile]);

  const handleSend = async () => {
    const trimmedText = String(text || '').trim();
    if (!trimmedText && !imageFile && !fileAttachment && !selectedMockExamId && !giftCoins) {
      setError('Добавьте текст, картинку, файл, пробник или подарок.');
      return;
    }

    setSending(true);
    setError('');
    setSuccessMessage('');
    const uploadedAttachments = [];

    try {
      let uploadedImage = null;
      let uploadedFile = null;

      if (imageFile) {
        uploadedImage = await api.uploadBroadcastNotificationAsset(imageFile);
        uploadedAttachments.push(uploadedImage);
      }
      if (fileAttachment) {
        uploadedFile = await api.uploadBroadcastNotificationAsset(fileAttachment);
        uploadedAttachments.push(uploadedFile);
      }

      const created = await api.createBroadcastNotification({
        text: trimmedText,
        image: uploadedImage,
        file: uploadedFile,
        mockExamId: selectedMockExamId || '',
        giftCoins,
      });

      setItems((prev) => [created, ...prev.filter((item) => item.id !== created?.id)]);
      resetComposer();
      setSuccessMessage('Уведомление отправлено.');
    } catch (err) {
      await Promise.allSettled(
        uploadedAttachments.map((attachment) => api.deleteBroadcastNotificationAsset(attachment?.storageName))
      );
      setError(err?.message || String(err));
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (item) => {
    if (!item?.id) return;
    if (!window.confirm('Удалить это уведомление?')) return;
    setDeletingId(item.id);
    setError('');
    setSuccessMessage('');
    try {
      await api.deleteBroadcastNotification(item.id);
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setDeletingId('');
    }
  };

  const toggleNotificationExpanded = useCallback((notificationId) => {
    const targetId = String(notificationId || '').trim();
    if (!targetId) return;
    setExpandedNotificationIds((prev) => (
      prev.includes(targetId)
        ? prev.filter((id) => id !== targetId)
        : [...prev, targetId]
    ));
  }, []);

  return (
    <div className="space-y-6">
      <Card className="border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Bell size={20} className="text-purple-600" />
              Рассылка уведомлений
            </h3>
            <p className="mt-1 text-sm text-slate-500">{audienceHint}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-2xl border border-purple-100 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700">
              {role === 'admin' ? 'Режим: всем ученикам' : 'Режим: всем вашим ученикам'}
            </div>
            <button
              type="button"
              onClick={() => setIsComposerExpanded((prev) => !prev)}
              className="teacher-broadcast-history__toggle inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-purple-200 hover:text-purple-700"
              aria-expanded={isComposerExpanded}
            >
              {isComposerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {isComposerExpanded ? 'Свернуть' : 'Развернуть'}
            </button>
          </div>
        </div>

        {!isComposerExpanded ? (
          <div className="mt-4 text-sm text-slate-500">
            Разверни блок, чтобы создать и отправить новое уведомление.
          </div>
        ) : (
        <div className="mt-4 space-y-4" onPasteCapture={handleComposerPaste}>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Текст уведомления
            </label>
            <textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                clearComposerFeedback();
              }}
              rows={5}
              placeholder="Напишите важное сообщение для учеников..."
              className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-purple-400 focus:bg-white"
            />
            <div className="mt-2 text-xs text-slate-500">
              Сюда можно вставить картинку через `Ctrl+V`, если она есть в буфере обмена.
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div
              className={`rounded-2xl border border-dashed p-4 transition ${
                imageDropActive
                  ? 'border-purple-400 bg-purple-50'
                  : 'border-slate-200 bg-slate-50/70'
              }`}
              onDragOver={handleImageDragOver}
              onDragLeave={handleImageDragLeave}
              onDrop={handleImageDrop}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <ImageIcon size={16} className="text-purple-600" />
                    Картинка
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Необязательно. Можно выбрать файл, вставить изображение через `Ctrl+V` или перетащить его сюда.
                  </div>
                </div>
                <Button type="button" variant="secondary" className="shrink-0" onClick={() => imageInputRef.current?.click()}>
                  Выбрать
                </Button>
              </div>

              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />

              {imageFile && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{imageFile.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatFileSizeKb(imageFile.size)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={clearImageSelection}
                      className="rounded-lg border border-slate-200 p-1 text-slate-400 transition hover:border-rose-200 hover:text-rose-500"
                      aria-label="Удалить картинку"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {imagePreviewUrl && (
                    <img
                      src={imagePreviewUrl}
                      alt={imageFile.name}
                      className="mt-3 max-h-48 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain"
                    />
                  )}
                </div>
              )}
            </div>

            <div
              className={`rounded-2xl border border-dashed p-4 transition ${
                fileDropActive
                  ? 'border-purple-400 bg-purple-50'
                  : 'border-slate-200 bg-slate-50/70'
              }`}
              onDragOver={handleFileDragOver}
              onDragLeave={handleFileDragLeave}
              onDrop={handleFileDrop}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Paperclip size={16} className="text-purple-600" />
                    Файл
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Необязательно. Можно приложить документ, архив или любой другой файл и просто перетащить его сюда.
                  </div>
                </div>
                <Button type="button" variant="secondary" className="shrink-0" onClick={() => fileInputRef.current?.click()}>
                  Выбрать
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />

              {fileAttachment && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{fileAttachment.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatFileSizeKb(fileAttachment.size)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={clearFileSelection}
                      className="rounded-lg border border-slate-200 p-1 text-slate-400 transition hover:border-rose-200 hover:text-rose-500"
                      aria-label="Удалить файл"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <BookOpen size={16} className="text-purple-600" />
                  Прикрепить пробник
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  В уведомлении появится кнопка, по которой ученик сразу откроет нужный пробник.
                </div>
              </div>
              {mockExamsLoading && (
                <div className="text-xs font-semibold text-slate-400">Загружаем пробники...</div>
              )}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <select
                value={selectedMockExamId}
                onChange={(event) => {
                  setSelectedMockExamId(event.target.value);
                  clearComposerFeedback();
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-purple-400"
              >
                <option value="">Без прикреплённого пробника</option>
                {(mockExams || []).map((exam) => {
                  const taskCount = getMockExamTaskCount(exam);
                  return (
                    <option key={exam.id} value={exam.id}>
                      {taskCount > 0 ? `${exam.title} • заданий: ${taskCount}` : exam.title}
                    </option>
                  );
                })}
              </select>

              {selectedMockExamId && (
                <Button type="button" variant="secondary" onClick={() => setSelectedMockExamId('')}>
                  <X size={14} />
                  Убрать
                </Button>
              )}
            </div>

            {!mockExamsLoading && mockExams.length === 0 && (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                Пока нет доступных пробников для прикрепления.
              </div>
            )}

            {selectedMockExam && (
              <div className="mt-3 rounded-2xl border border-purple-200 bg-white px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">{selectedMockExam.title}</div>
                <MockExamBadges badges={selectedMockExam.badges} className="mt-2" />
                <div className="mt-1 text-xs text-slate-500">
                  {getMockExamTaskCount(selectedMockExam) > 0
                    ? `Заданий внутри: ${getMockExamTaskCount(selectedMockExam)}`
                    : 'В пробнике пока нет заданий'}
                </div>
              </div>
            )}
          </div>

          <div className="teacher-broadcast-gift rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-50/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="teacher-broadcast-gift__title flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Gift size={16} className="teacher-broadcast-gift__icon text-amber-600" />
                  Подарок к уведомлению
                </div>
                <div className="teacher-broadcast-gift__hint mt-1 text-xs text-slate-500">
                  Ученики смогут нажать <span className="teacher-broadcast-gift__hint-accent font-semibold text-slate-700">«Забрать подарок»</span> и
                  получить монеты один раз.
                </div>
              </div>
              {giftCoins > 0 && (
                <div className="teacher-broadcast-gift__amount inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold text-amber-700">
                  <img src={ivanCoin} alt="" aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {`+${giftCoins} монет`}
                </div>
              )}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <label className="block">
                <span className="teacher-broadcast-gift__label mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Сколько монет подарить
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={giftCoinsInput}
                  onChange={(event) => {
                    setGiftCoinsInput(event.target.value);
                    clearComposerFeedback();
                  }}
                  placeholder="0"
                  className="teacher-broadcast-gift__input w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-amber-400"
                />
              </label>

              {giftCoinsInput && (
                <Button type="button" variant="secondary" onClick={() => setGiftCoinsInput('')}>
                  <X size={14} />
                  Убрать подарок
                </Button>
              )}
            </div>
          </div>

          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          {successMessage && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div>}

          <div className="flex justify-end">
            <Button type="button" onClick={handleSend} disabled={sending}>
              <SendHorizontal size={16} />
              {sending ? 'Отправляем...' : 'Разослать уведомление'}
            </Button>
          </div>
        </div>
        )}
      </Card>

      <Card className="teacher-broadcast-history border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="teacher-broadcast-history__title text-lg font-bold text-slate-900">Последние уведомления</h3>
            <p className="teacher-broadcast-history__subtitle mt-1 text-sm text-slate-500">{`Всего отправлено: ${items.length}`}</p>
          </div>
          <div className="flex items-center gap-2">
            {loading && <div className="teacher-broadcast-history__loading text-xs font-semibold text-slate-400">Загрузка...</div>}
            <button
              type="button"
              onClick={() => setIsHistoryExpanded((prev) => !prev)}
              className="teacher-broadcast-history__toggle inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-purple-200 hover:text-purple-700"
              aria-expanded={isHistoryExpanded}
            >
              {isHistoryExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {isHistoryExpanded ? 'Свернуть всё' : 'Развернуть всё'}
            </button>
          </div>
        </div>

        {!isHistoryExpanded ? (
          <div className="teacher-broadcast-history__preview mt-4 text-sm text-slate-500">
            Разверни блок, чтобы посмотреть историю всех уведомлений.
          </div>
        ) : (
        <div className="mt-4 space-y-3">
          {!loading && items.length === 0 && (
            <div className="teacher-broadcast-history__empty rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-sm text-slate-500">
              Уведомлений пока нет.
            </div>
          )}

          {items.map((item) => {
            const authorLabel = getNotificationAuthorLabel(item, role);
            const isExpanded = expandedNotificationIds.includes(item.id);
            const collapsedPreview = getNotificationCollapsedPreview(item);
            return (
              <div key={item.id} className="teacher-broadcast-history__item rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="teacher-broadcast-history__audience-pill rounded-full border border-purple-200 bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-purple-700">
                        {item?.audienceLabel || 'Рассылка'}
                      </span>
                      {item?.unreadCount > 0 && (
                        <span className="teacher-broadcast-history__unread-pill rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                          {`Не прочитали: ${item.unreadCount}`}
                        </span>
                      )}
                    </div>
                    <div className="teacher-broadcast-history__meta mt-2 text-xs text-slate-500">
                      {formatNotificationDate(item?.createdAt)}
                      {authorLabel ? ` • ${authorLabel}` : ''}
                    </div>
                    {!isExpanded && (
                      <div className="teacher-broadcast-history__preview mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                        {collapsedPreview}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleNotificationExpanded(item.id)}
                      className="teacher-broadcast-history__toggle inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-purple-200 hover:text-purple-700"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      {isExpanded ? 'Свернуть' : 'Развернуть'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      className="teacher-broadcast-history__delete rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-rose-200 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Удалить уведомление"
                      title="Удалить уведомление"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <>
                {item?.text && (
                  <div className="teacher-broadcast-history__text mt-3 text-sm leading-6 text-slate-700">
                    <LinkifiedText
                      text={item.text}
                      className="whitespace-pre-wrap break-words"
                      linkClassName="text-purple-700 underline decoration-purple-300 underline-offset-2"
                    />
                  </div>
                )}

                <NotificationAttachmentPreview attachment={item?.image} isImage />
                <NotificationAttachmentPreview attachment={item?.file} />

                {item?.mockExam?.id && (
                  <div className="teacher-broadcast-history__mock-exam mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900">
                    <div className="flex items-center gap-2 font-semibold">
                      <BookOpen size={16} />
                      {item.mockExam.title || 'Прикреплённый пробник'}
                    </div>
                    <MockExamBadges badges={item?.mockExam?.badges} className="teacher-broadcast-history__mock-exam-badges mt-2" />
                    <div className="teacher-broadcast-history__mock-exam-meta mt-1 text-xs text-indigo-700/80">
                      {Number(item?.mockExam?.taskCount) > 0
                        ? `Заданий в пробнике: ${item.mockExam.taskCount}`
                        : 'Ученик сможет открыть этот пробник прямо из уведомления.'}
                    </div>
                  </div>
                )}

                {item?.gift?.coins > 0 && (
                  <div className="teacher-broadcast-history__gift mt-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white px-4 py-3 text-sm text-slate-800">
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-amber-800">
                      <Gift size={16} />
                      Подарок в уведомлении
                      <span className="teacher-broadcast-history__gift-amount inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-bold text-amber-700">
                        <img src={ivanCoin} alt="" aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        {`+${item.gift.coins} монет`}
                      </span>
                    </div>
                    <div className="teacher-broadcast-history__gift-stats mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="teacher-broadcast-history__gift-stat rounded-full border border-slate-200 bg-white px-2.5 py-1">
                        {`Забрали: ${item?.gift?.claimedCount ?? 0} из ${item?.recipientCount ?? 0}`}
                      </span>
                      <span className="teacher-broadcast-history__gift-stat rounded-full border border-slate-200 bg-white px-2.5 py-1">
                        {`Ещё не забрали: ${item?.gift?.unclaimedCount ?? Math.max(0, (item?.recipientCount ?? 0) - (item?.gift?.claimedCount ?? 0))}`}
                      </span>
                    </div>
                  </div>
                )}
                  </>
                )}

                <div className="teacher-broadcast-history__footer mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="teacher-broadcast-history__footer-chip rounded-full border border-slate-200 bg-white px-2.5 py-1">
                    {`Открыли: ${item?.seenCount ?? 0} из ${item?.recipientCount ?? 0}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </Card>
    </div>
  );
};

export default BroadcastNotificationsPanel;
