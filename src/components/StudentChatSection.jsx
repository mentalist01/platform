import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, ImagePlus, MessageSquare, SendHorizontal, X } from 'lucide-react';
import { api } from '../services/api';
import { Button, Card } from './ui';
import LinkifiedText from './LinkifiedText';

const POLL_INTERVAL_MS = 5000;
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CHAT_ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) {
    reject(new Error('Файл не выбран'));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    if (!result) {
      reject(new Error('Не удалось прочитать файл'));
      return;
    }
    resolve(result);
  };
  reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
  reader.readAsDataURL(file);
});

const formatTime = (value) => {
  const parsed = Date.parse(value || '');
  if (!Number.isFinite(parsed)) return '';
  try {
    return new Date(parsed).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const StudentChatSection = ({
  user,
  pushSupported = false,
  pushPermission = 'default',
  pushEnabled = false,
  pushSyncing = false,
  pushBusy = false,
  pushReady = false,
  pushError = '',
  onTogglePush = null,
}) => {
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const imageInputRef = useRef(null);
  const prevMessageCountRef = useRef(0);

  const loadMessages = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const payload = await api.getStudentChatMessages();
      setChat(payload?.chat || null);
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
      setError('');
    } catch (err) {
      if (!silent) {
        setError(err?.message || String(err));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
    const timerId = setInterval(() => {
      loadMessages({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timerId);
  }, [loadMessages]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const hasNew = messages.length > prevMessageCountRef.current;
    if (hasNew || prevMessageCountRef.current === 0) {
      node.scrollTop = node.scrollHeight;
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  const clearImage = useCallback(() => {
    setImageDataUrl('');
    setImageName('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  const handleImageSelect = useCallback(async (file) => {
    if (!file) return;
    const mimeType = String(file.type || '').toLowerCase();
    if (!mimeType || !CHAT_ALLOWED_IMAGE_TYPES.has(mimeType)) {
      setError('Можно отправлять только изображения: PNG, JPG, WEBP, GIF.');
      return;
    }
    if (Number(file.size) > CHAT_IMAGE_MAX_BYTES) {
      setError('Изображение должно быть не больше 5 МБ.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageDataUrl(dataUrl);
      setImageName(String(file.name || '').trim());
      setError('');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }, []);

  const handleSend = async () => {
    const nextText = text.trim();
    const nextImageDataUrl = String(imageDataUrl || '').trim();
    const nextImageName = String(imageName || '').trim();
    if ((!nextText && !nextImageDataUrl) || sending) return;
    setSending(true);
    setError('');
    try {
      await api.sendStudentChatMessage({
        text: nextText,
        imageDataUrl: nextImageDataUrl,
        imageName: nextImageName,
      });
      setText('');
      clearImage();
      await loadMessages({ silent: true });
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSending(false);
    }
  };

  const teacherName = useMemo(
    () => String(chat?.teacherName || 'Преподаватель').trim() || 'Преподаватель',
    [chat?.teacherName]
  );

  const pushStatusText = useMemo(() => {
    if (pushSyncing) return 'Проверяем статус push...';
    if (!pushSupported) return 'Push не поддерживается в этом браузере.';
    if (pushPermission === 'denied') return 'Уведомления заблокированы в настройках браузера.';
    if (pushEnabled) return 'Push включены: уведомления о новых сообщениях приходят в браузер.';
    return 'Включите push, чтобы не пропускать новые сообщения преподавателя.';
  }, [pushEnabled, pushPermission, pushSupported, pushSyncing]);

  const canTogglePush = typeof onTogglePush === 'function' && !pushBusy && !pushSyncing && pushReady;
  const PushIcon = pushEnabled ? BellOff : Bell;

  return (
    <div className="animate-fadeIn pb-10">
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <MessageSquare className="text-purple-600" />
              Чат с учителем
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Диалог с {teacherName}.
            </p>
          </div>
          <span className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
            {user?.name || 'Ученик'}
          </span>
        </div>
      </Card>

      <Card className="mb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-purple-600">Push</div>
            <div className="mt-1 text-xs text-slate-600">{pushStatusText}</div>
            {pushError && <div className="mt-1 text-xs text-red-500">{pushError}</div>}
          </div>
          <Button
            type="button"
            variant={pushEnabled ? 'secondary' : 'primary'}
            onClick={() => onTogglePush?.()}
            disabled={!canTogglePush || (!pushSupported && !pushEnabled)}
            className="sm:ml-3"
          >
            <PushIcon size={16} />
            {pushBusy || pushSyncing ? 'Сохраняем...' : (pushEnabled ? 'Отключить push' : 'Включить push')}
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div
          ref={listRef}
          className="max-h-[420px] min-h-[260px] space-y-2 overflow-y-auto bg-gray-50/80 px-3 py-3"
        >
          {loading ? (
            <div className="text-sm text-gray-500">Загружаем переписку...</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-gray-500">Пока сообщений нет. Напишите первым.</div>
          ) : (
            messages.map((message) => {
              const isMine = message?.senderRole === 'student' || message?.senderId === user?.id;
              const messageText = String(message?.text || '');
              const messageImageDataUrl = String(message?.imageDataUrl || '').trim();
              const messageImageName = String(message?.imageName || '').trim();
              return (
                <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      isMine
                        ? 'bg-purple-600 text-white'
                        : 'border border-gray-200 bg-white text-gray-800'
                    }`}
                  >
                    {!isMine && (
                      <div className="mb-1 text-[11px] font-semibold text-purple-600">
                        {message?.senderName || teacherName}
                      </div>
                    )}
                    {messageImageDataUrl && (
                      <a
                        href={messageImageDataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-2 block overflow-hidden rounded-lg border border-white/20"
                        title={messageImageName || 'Открыть изображение'}
                      >
                        <img
                          src={messageImageDataUrl}
                          alt={messageImageName || 'Изображение'}
                          className="max-h-[260px] w-full object-contain bg-black/10"
                          loading="lazy"
                        />
                      </a>
                    )}
                    {messageText && (
                      <LinkifiedText
                        text={messageText}
                        className="whitespace-pre-wrap break-words"
                        linkClassName={isMine ? 'underline decoration-white/70 underline-offset-2' : 'text-purple-700 underline decoration-purple-400 underline-offset-2'}
                      />
                    )}
                    <div className={`mt-1 text-[10px] ${isMine ? 'text-purple-100' : 'text-gray-400'}`}>
                      {formatTime(message?.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-gray-100 bg-white px-3 py-3">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleImageSelect(file);
            }}
          />
          {imageDataUrl && (
            <div className="mb-2 flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2 py-2">
              <img
                src={imageDataUrl}
                alt={imageName || 'Изображение'}
                className="h-12 w-12 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-gray-700">{imageName || 'Изображение'}</p>
                <p className="text-[11px] text-gray-500">До 5 МБ</p>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100"
                onClick={clearImage}
                aria-label="Убрать изображение"
                title="Убрать изображение"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onPaste={(event) => {
                const items = Array.from(event.clipboardData?.items || []);
                const imageItem = items.find((item) => item.kind === 'file' && String(item.type || '').toLowerCase().startsWith('image/'));
                if (!imageItem) return;
                const file = imageItem.getAsFile?.();
                if (!file) return;
                event.preventDefault();
                handleImageSelect(file);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              rows={3}
              placeholder="Напишите сообщение..."
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => imageInputRef.current?.click()}
              disabled={sending}
              className="h-[46px] min-w-[48px] self-end px-0 sm:self-stretch"
              title="Добавить изображение (до 5 МБ)"
            >
              <ImagePlus size={16} />
            </Button>
            <Button
              type="button"
              onClick={handleSend}
              disabled={sending || (!text.trim() && !imageDataUrl)}
              className="h-[46px] min-w-[132px] self-end sm:self-stretch"
            >
              <SendHorizontal size={16} />
              {sending ? 'Отправка...' : 'Отправить'}
            </Button>
          </div>
          {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        </div>
      </Card>
    </div>
  );
};

export default StudentChatSection;
