import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, LogOut, Send } from 'lucide-react';
import { api } from '../services/api';
import { Button, Card } from './ui';
import { LogoMark } from './Identity';

const POLL_INTERVAL_MS = 5000;
const SIGNUP_CHAT_NOTIFY_PREF_KEY = 'ege_signup_chat_notify_enabled';

const isBrowserNotificationsSupported = () => (
  typeof window !== 'undefined'
  && typeof Notification !== 'undefined'
);

const getNotificationPermission = () => (
  isBrowserNotificationsSupported() ? (Notification.permission || 'default') : 'default'
);

const readNotifyPreference = () => {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(SIGNUP_CHAT_NOTIFY_PREF_KEY) === '1';
  } catch {
    return false;
  }
};

const writeNotifyPreference = (enabled) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SIGNUP_CHAT_NOTIFY_PREF_KEY, enabled ? '1' : '0');
  } catch {
    // ignore storage errors
  }
};

const formatMessageTime = (value) => {
  const parsed = Date.parse(value || '');
  if (!Number.isFinite(parsed)) return '';
  try {
    return new Date(parsed).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const SignupGuestChat = ({ user, onLogout }) => {
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [notifySupported] = useState(isBrowserNotificationsSupported());
  const [notifyPermission, setNotifyPermission] = useState(getNotificationPermission());
  const [notifyEnabled, setNotifyEnabled] = useState(() => readNotifyPreference());
  const [notifyError, setNotifyError] = useState('');
  const listRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const notificationsBootstrappedRef = useRef(false);
  const lastTeacherMessageIdRef = useRef('');
  const teacherName = useMemo(
    () => String(chat?.teacherName || 'преподавателем').trim(),
    [chat?.teacherName]
  );

  const loadMessages = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const payload = await api.getSignupChatMessages();
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
    const hasNewMessages = messages.length > prevMessageCountRef.current;
    if (hasNewMessages || prevMessageCountRef.current === 0) {
      node.scrollTop = node.scrollHeight;
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (!notifySupported) return undefined;
    const syncPermission = () => {
      setNotifyPermission(getNotificationPermission());
    };
    syncPermission();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', syncPermission);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', syncPermission);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', syncPermission);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', syncPermission);
      }
    };
  }, [notifySupported]);

  useEffect(() => {
    if (notifyPermission === 'granted') return;
    if (!notifyEnabled) return;
    setNotifyEnabled(false);
    writeNotifyPreference(false);
  }, [notifyEnabled, notifyPermission]);

  useEffect(() => {
    const teacherMessages = messages.filter((message) => (
      message?.senderRole === 'teacher' && typeof message?.id === 'string' && message.id.trim()
    ));
    const latestTeacherMessageId = teacherMessages.length > 0
      ? String(teacherMessages[teacherMessages.length - 1].id || '').trim()
      : '';

    if (!notificationsBootstrappedRef.current) {
      notificationsBootstrappedRef.current = true;
      lastTeacherMessageIdRef.current = latestTeacherMessageId;
      return;
    }

    const lastKnownId = lastTeacherMessageIdRef.current;
    let freshTeacherMessages = [];
    if (!lastKnownId) {
      freshTeacherMessages = teacherMessages;
    } else {
      const knownIndex = teacherMessages.findIndex((message) => String(message.id || '').trim() === lastKnownId);
      freshTeacherMessages = knownIndex >= 0 ? teacherMessages.slice(knownIndex + 1) : teacherMessages;
    }
    lastTeacherMessageIdRef.current = latestTeacherMessageId || lastKnownId;

    if (freshTeacherMessages.length === 0) return;
    if (!notifySupported || !notifyEnabled || notifyPermission !== 'granted') return;

    const canShowNotification = typeof document === 'undefined'
      ? true
      : (document.visibilityState !== 'visible'
          || (typeof document.hasFocus === 'function' ? !document.hasFocus() : true));
    if (!canShowNotification) return;

    const latest = freshTeacherMessages[freshTeacherMessages.length - 1];
    const totalFresh = freshTeacherMessages.length;
    const sender = String(latest?.senderName || teacherName || 'Преподаватель').trim();
    const preview = String(latest?.text || '').replace(/\s+/g, ' ').trim();
    const title = totalFresh > 1 ? `Новых сообщений: ${totalFresh}` : `Ответ от ${sender}`;
    const body = totalFresh > 1
      ? `${sender}: ${preview}`.slice(0, 180)
      : preview.slice(0, 180);

    try {
      const tagChatId = String(chat?.id || user?.chatId || 'guest').trim() || 'guest';
      new Notification(title, {
        body,
        tag: `signup-chat-${tagChatId}`,
      });
    } catch {
      // ignore notification failures
    }
  }, [chat?.id, messages, notifyEnabled, notifyPermission, notifySupported, teacherName, user?.chatId]);

  const handleToggleNotifications = async () => {
    if (!notifySupported) {
      setNotifyError('В этом браузере уведомления не поддерживаются.');
      return;
    }

    setNotifyError('');
    if (notifyEnabled) {
      setNotifyEnabled(false);
      writeNotifyPreference(false);
      return;
    }

    let permission = notifyPermission;
    if (permission !== 'granted') {
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = 'denied';
      }
      setNotifyPermission(permission || 'default');
    }

    if (permission === 'granted') {
      setNotifyEnabled(true);
      writeNotifyPreference(true);
      return;
    }

    setNotifyEnabled(false);
    writeNotifyPreference(false);
    if (permission === 'denied') {
      setNotifyError('Разрешите уведомления в настройках браузера для этого сайта.');
    }
  };

  const handleSend = async () => {
    const nextText = text.trim();
    if (!nextText || sending) return;
    setSending(true);
    setError('');
    try {
      const payload = await api.sendSignupChatMessage(nextText);
      setText('');
      if (payload?.chat) setChat(payload.chat);
      await loadMessages({ silent: true });
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSending(false);
    }
  };

  const notificationStatusText = useMemo(() => {
    if (!notifySupported) return 'Уведомления не поддерживаются в этом браузере.';
    if (notifyPermission === 'denied') return 'Уведомления заблокированы в браузере.';
    if (notifyEnabled && notifyPermission === 'granted') return 'Уведомления о новых ответах включены.';
    return 'Включите уведомления, чтобы не пропускать ответы преподавателя.';
  }, [notifyEnabled, notifyPermission, notifySupported]);

  return (
    <div className="app-min-h app-shell relative overflow-hidden p-4 md:p-6">
      <div className="mx-auto max-w-4xl">
        <Card className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-purple-600">Гостевой чат</div>
              <h1 className="text-xl font-bold text-slate-900">
                <LogoMark />
              </h1>
              <p className="text-sm text-slate-500">
                Вы общаетесь с {teacherName}. Представьтесь и задайте вопрос по занятиям.
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 self-start">
              <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                {user?.name || 'Гость'}
              </span>
              <Button variant="secondary" onClick={onLogout}>
                <LogOut size={16} />
                Выйти
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div
            ref={listRef}
            className="max-h-[56vh] min-h-[320px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/80 p-3"
          >
            {loading ? (
              <div className="p-3 text-sm text-slate-500">Загрузка переписки...</div>
            ) : messages.length === 0 ? (
              <div className="p-3 text-sm text-slate-500">Чат создан. Напишите первое сообщение.</div>
            ) : (
              <div className="space-y-2.5">
                {messages.map((message) => {
                  const isMine = message?.senderRole === 'lead' || message?.senderId === user?.id;
                  return (
                    <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          isMine
                            ? 'bg-purple-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-800'
                        }`}
                      >
                        {!isMine && (
                          <div className="mb-1 text-[11px] font-semibold text-purple-600">
                            {message?.senderName || 'Преподаватель'}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words leading-relaxed">{message?.text || ''}</div>
                        <div className={`mt-1 text-[10px] ${isMine ? 'text-purple-100' : 'text-slate-400'}`}>
                          {formatMessageTime(message?.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-3 rounded-2xl border border-purple-200/80 bg-gradient-to-r from-purple-50 via-white to-fuchsia-50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Не пропустите ответ преподавателя
                </div>
                <div className="text-xs text-slate-600">
                  {notificationStatusText}
                </div>
                {notifyError && <div className="mt-1 text-xs text-red-500">{notifyError}</div>}
              </div>
              <Button
                variant={notifyEnabled ? 'secondary' : 'primary'}
                type="button"
                onClick={handleToggleNotifications}
                disabled={!notifySupported && !notifyEnabled}
                className="sm:ml-3"
                title={notifySupported ? 'Уведомления о новых сообщениях' : 'Браузер не поддерживает уведомления'}
              >
                {notifyEnabled ? <BellOff size={16} /> : <Bell size={16} />}
                {notifyEnabled ? 'Отключить уведомления' : 'Включить уведомления'}
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
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
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple-500"
            />
            <Button
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="h-[46px] min-w-[130px] self-end sm:self-stretch"
            >
              <Send size={16} />
              {sending ? 'Отправка...' : 'Отправить'}
            </Button>
          </div>
          {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        </Card>
      </div>
    </div>
  );
};

export default SignupGuestChat;
