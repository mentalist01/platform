import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, MessageSquare, SendHorizontal } from 'lucide-react';
import { api } from '../services/api';
import { Button, Card } from './ui';
import LinkifiedText from './LinkifiedText';

const POLL_INTERVAL_MS = 5000;

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
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
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

  const handleSend = async () => {
    const nextText = text.trim();
    if (!nextText || sending) return;
    setSending(true);
    setError('');
    try {
      await api.sendStudentChatMessage(nextText);
      setText('');
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
                    <LinkifiedText
                      text={message?.text || ''}
                      className="whitespace-pre-wrap break-words"
                      linkClassName={isMine ? 'underline decoration-white/70 underline-offset-2' : 'text-purple-700 underline decoration-purple-400 underline-offset-2'}
                    />
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
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
              onClick={handleSend}
              disabled={sending || !text.trim()}
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
