import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, MessageSquare, SendHorizontal } from 'lucide-react';
import { api } from '../services/api';
import { Button, Card } from './ui';
import LinkifiedText from './LinkifiedText';

const CHATS_POLL_MS = 6000;
const MESSAGES_POLL_MS = 5000;

const formatDateTime = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const TeacherStudentChatsSection = ({
  role,
  initialChatId = '',
  notifySupported = false,
  notifyPermission = 'default',
  notifyEnabled = false,
  notifyBusy = false,
  notifySyncing = false,
  notifyReady = false,
  notifyStatusText = '',
  notifyError = '',
  onToggleNotify = null,
}) => {
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [chatsError, setChatsError] = useState('');
  const [selectedChatId, setSelectedChatId] = useState(() => String(initialChatId || '').trim());
  const [chatDetails, setChatDetails] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [messageText, setMessageText] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const messagesRef = useRef(null);
  const prevChatsSnapshotRef = useRef(new Map());
  const chatOrderRef = useRef(new Map());

  const getChatSortValue = useCallback((chat) => {
    const value = chat?.lastMessageAt || chat?.updatedAt || chat?.createdAt || '';
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const sortChats = useCallback((items) => (
    (Array.isArray(items) ? items : [])
      .map((chat, index) => ({ chat, index, id: String(chat?.id || '').trim() }))
      .filter((entry) => entry.id)
      .sort((left, right) => {
        const leftPrevOrder = chatOrderRef.current.get(left.id);
        const rightPrevOrder = chatOrderRef.current.get(right.id);
        const leftHasPrev = Number.isInteger(leftPrevOrder);
        const rightHasPrev = Number.isInteger(rightPrevOrder);

        if (leftHasPrev && rightHasPrev) {
          return leftPrevOrder - rightPrevOrder;
        }
        if (leftHasPrev && !rightHasPrev) return -1;
        if (!leftHasPrev && rightHasPrev) return 1;

        const diff = getChatSortValue(right.chat) - getChatSortValue(left.chat);
        if (diff !== 0) return diff;
        return left.index - right.index;
      })
      .map((entry) => entry.chat)
  ), [getChatSortValue]);

  const prioritizeIncomingStudentMessages = useCallback((sortedItems) => {
    const list = Array.isArray(sortedItems) ? sortedItems : [];
    const prevSnapshot = prevChatsSnapshotRef.current;
    if (!(prevSnapshot instanceof Map) || prevSnapshot.size === 0) {
      prevChatsSnapshotRef.current = new Map(
        list.map((chat) => [String(chat?.id || '').trim(), chat]).filter((entry) => entry[0])
      );
      chatOrderRef.current = new Map(
        list.map((chat, index) => [String(chat?.id || '').trim(), index]).filter((entry) => entry[0])
      );
      return list;
    }

    const incoming = [];
    const rest = [];
    list.forEach((chat) => {
      const chatId = String(chat?.id || '').trim();
      const prev = chatId ? prevSnapshot.get(chatId) : null;
      const currTs = Date.parse(chat?.lastMessageAt || '');
      const prevTs = Date.parse(prev?.lastMessageAt || '');
      const isNewIncomingFromStudent =
        chat?.lastMessageSenderRole === 'student'
        && Number.isFinite(currTs)
        && (!Number.isFinite(prevTs) || currTs > prevTs);

      if (isNewIncomingFromStudent) incoming.push(chat);
      else rest.push(chat);
    });

    incoming.sort((a, b) => getChatSortValue(b) - getChatSortValue(a));
    const next = [...incoming, ...rest];
    prevChatsSnapshotRef.current = new Map(
      list.map((chat) => [String(chat?.id || '').trim(), chat]).filter((entry) => entry[0])
    );
    chatOrderRef.current = new Map(
      next.map((chat, index) => [String(chat?.id || '').trim(), index]).filter((entry) => entry[0])
    );
    return next;
  }, [getChatSortValue]);

  useEffect(() => {
    const normalized = String(initialChatId || '').trim();
    if (!normalized) return;
    setSelectedChatId((prev) => (prev ? prev : normalized));
  }, [initialChatId]);

  const refreshChats = useCallback(async () => {
    const payload = await api.getStudentChats();
    const sorted = sortChats(Array.isArray(payload) ? payload : []);
    const list = prioritizeIncomingStudentMessages(sorted);
    setChats(list);
    setChatsError('');
    return list;
  }, [prioritizeIncomingStudentMessages, sortChats]);

  const fetchMessages = useCallback(async (chatId, options = {}) => {
    const { silent = false } = options;
    const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
    if (!normalizedChatId) {
      setChatDetails(null);
      setMessages([]);
      setMessagesError('');
      return null;
    }
    if (!silent) setMessagesLoading(true);
    try {
      const payload = await api.getStudentChatMessagesForTeacher(normalizedChatId);
      setChatDetails(payload?.chat || null);
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
      setMessagesError('');
      return payload;
    } catch (err) {
      if (!silent) {
        setMessagesError(err?.message || String(err));
      }
      return null;
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role !== 'teacher' && role !== 'admin') return undefined;
    let cancelled = false;
    const loadChats = async ({ silent = false } = {}) => {
      if (!silent) setChatsLoading(true);
      try {
        const payload = await api.getStudentChats();
        if (cancelled) return;
        const sorted = sortChats(Array.isArray(payload) ? payload : []);
        const list = prioritizeIncomingStudentMessages(sorted);
        setChats(list);
        setChatsError('');
        setSelectedChatId((prev) => {
          if (prev && list.some((item) => item.id === prev)) return prev;
          return list[0]?.id || '';
        });
      } catch (err) {
        if (cancelled) return;
        if (!silent) setChatsError(err?.message || String(err));
      } finally {
        if (!silent && !cancelled) setChatsLoading(false);
      }
    };

    loadChats();
    const timerId = setInterval(() => {
      loadChats({ silent: true });
    }, CHATS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [prioritizeIncomingStudentMessages, role, sortChats]);

  useEffect(() => {
    if (!selectedChatId) {
      setChatDetails(null);
      setMessages([]);
      setMessagesError('');
      return undefined;
    }
    let cancelled = false;
    const loadMessages = async ({ silent = false } = {}) => {
      if (cancelled) return;
      await fetchMessages(selectedChatId, { silent });
    };
    loadMessages();
    const timerId = setInterval(() => {
      loadMessages({ silent: true });
    }, MESSAGES_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [fetchMessages, selectedChatId]);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [selectedChatId, messages.length]);

  const handleSendMessage = async () => {
    const text = messageText.trim();
    if (!selectedChatId || !text || messageSending) return;
    setMessageSending(true);
    try {
      await api.sendStudentChatMessageForTeacher(selectedChatId, text);
      setMessageText('');
      await fetchMessages(selectedChatId, { silent: true });
      await refreshChats();
      setMessagesError('');
    } catch (err) {
      setMessagesError(err?.message || String(err));
    } finally {
      setMessageSending(false);
    }
  };

  const selectedSummary = chats.find((chat) => chat.id === selectedChatId) || null;
  const selectedChat = chatDetails?.id === selectedChatId ? chatDetails : selectedSummary;
  const canToggleNotify = typeof onToggleNotify === 'function'
    && !notifyBusy
    && !notifySyncing
    && notifyReady;
  const resolvedNotifyText = notifyStatusText
    || (notifyPermission === 'denied'
      ? 'Уведомления заблокированы в настройках браузера.'
      : 'Включите уведомления, чтобы не пропускать новые сообщения.');
  const NotifyIcon = notifyEnabled ? BellOff : Bell;

  return (
    <div className="animate-fadeIn pb-10">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <MessageSquare className="text-purple-600" />
          Чаты с учениками
        </h2>
        <p className="text-gray-500">
          Переписка с учениками в одном месте.
        </p>
      </div>

      <Card className="mb-6">
        <div className="rounded-xl border border-purple-200/80 bg-gradient-to-r from-purple-50 via-white to-fuchsia-50 px-3 py-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-purple-600">
                Уведомления
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {resolvedNotifyText}
              </div>
              {notifyError && (
                <div className="mt-1 text-xs text-red-500">{notifyError}</div>
              )}
            </div>
            <Button
              type="button"
              variant={notifyEnabled ? 'secondary' : 'primary'}
              onClick={() => onToggleNotify?.()}
              disabled={!canToggleNotify || (!notifySupported && !notifyEnabled)}
              className="sm:ml-3"
            >
              <NotifyIcon size={16} />
              {notifyBusy || notifySyncing
                ? 'Сохраняем...'
                : (notifyEnabled ? 'Отключить уведомления' : 'Включить уведомления')}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        {chatsError && <p className="mb-3 text-xs text-red-500">{chatsError}</p>}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
            {chatsLoading && chats.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                Загружаем чаты...
              </div>
            ) : chats.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                Пока нет учеников для переписки.
              </div>
            ) : (
              chats.map((chat) => {
                const isActive = chat.id === selectedChatId;
                const unread = Number(chat?.unreadForTeacher) || 0;
                const hasMessages = Number(chat?.messageCount) > 0;
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => setSelectedChatId(chat.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      isActive
                        ? 'border-purple-300 bg-purple-50'
                        : 'border-gray-200 bg-white hover:border-purple-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-800">
                          {chat.studentName || 'Ученик'}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                          {hasMessages
                            ? (chat.lastMessagePreview || 'Без текста')
                            : 'Диалог ещё не начат'}
                        </p>
                      </div>
                      {unread > 0 && (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-purple-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {unread}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      {formatDateTime(chat.lastMessageAt || chat.updatedAt || chat.createdAt)}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-3">
            {!selectedChatId ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white text-sm text-gray-500">
                Выберите ученика слева.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">
                      {selectedChat?.studentName || 'Ученик'}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {selectedChat?.messageCount || 0} сообщений
                    </p>
                  </div>
                </div>

                <div
                  ref={messagesRef}
                  className="mt-3 max-h-[340px] min-h-[220px] space-y-2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3"
                >
                  {messagesLoading ? (
                    <div className="text-sm text-gray-500">Загружаем переписку...</div>
                  ) : messages.length === 0 ? (
                    <div className="text-sm text-gray-500">Пока сообщений нет.</div>
                  ) : (
                    messages.map((message) => {
                      const isTeacherMessage = message?.senderRole === 'teacher';
                      return (
                        <div key={message.id} className={`flex ${isTeacherMessage ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                              isTeacherMessage
                                ? 'bg-purple-600 text-white'
                                : 'border border-gray-200 bg-gray-50 text-gray-800'
                            }`}
                          >
                            {!isTeacherMessage && (
                              <div className="mb-1 text-[11px] font-semibold text-purple-600">
                                {message?.senderName || selectedChat?.studentName || 'Ученик'}
                              </div>
                            )}
                            <LinkifiedText
                              text={message?.text || ''}
                              className="whitespace-pre-wrap break-words"
                              linkClassName={isTeacherMessage ? 'underline decoration-white/70 underline-offset-2' : 'text-purple-700 underline decoration-purple-400 underline-offset-2'}
                            />
                            <div className={`mt-1 text-[10px] ${isTeacherMessage ? 'text-purple-100' : 'text-gray-400'}`}>
                              {formatDateTime(message?.createdAt)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <textarea
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    rows={3}
                    placeholder="Ответить ученику..."
                    className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple-500"
                  />
                  <Button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={messageSending || !messageText.trim() || !selectedChatId}
                    className="h-[46px] min-w-[136px] self-end sm:self-stretch"
                  >
                    <SendHorizontal size={16} />
                    {messageSending ? 'Отправка...' : 'Отправить'}
                  </Button>
                </div>
                {messagesError && <p className="mt-2 text-xs text-red-500">{messagesError}</p>}
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TeacherStudentChatsSection;
