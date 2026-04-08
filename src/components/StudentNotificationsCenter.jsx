import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BookOpen, Check, Megaphone, Paperclip, X } from 'lucide-react';
import { api, resolveAuthenticatedUploadsUrl, withStoredAuthToken } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import { getNotificationsWsUrl } from '../utils/runtimeUrls';
import LinkifiedText from './LinkifiedText';
import { Button } from './ui';

const SYNC_INTERVAL_MS = 60 * 1000;
const LIVE_RECONNECT_DELAY_MS = 4 * 1000;

const formatNotificationDate = (value) => {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const NotificationAttachment = ({ attachment, isImage = false }) => {
  if (!attachment?.url) return null;
  const href = resolveAuthenticatedUploadsUrl(attachment.url);
  if (!href) return null;

  if (isImage) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
      >
        <img
          src={href}
          alt={attachment?.name || 'Изображение'}
          className="max-h-80 w-full object-contain"
        />
      </a>
    );
  }

  return (
    <a
      href={buildDownloadUrl(href)}
      download={attachment?.name || undefined}
      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 transition hover:border-purple-200 hover:bg-purple-50"
    >
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-900">{attachment?.name || 'Файл'}</div>
        <div className="mt-0.5 text-xs text-slate-500">{attachment?.size || ''}</div>
      </div>
      <Paperclip size={16} className="shrink-0 text-purple-600" />
    </a>
  );
};

const upsertNotificationItem = (list, nextItem) => {
  const safeList = Array.isArray(list) ? list : [];
  const notification = nextItem && typeof nextItem === 'object' ? nextItem : null;
  const notificationId = String(notification?.id || '').trim();
  if (!notificationId) return safeList;
  return [notification, ...safeList.filter((item) => String(item?.id || '').trim() !== notificationId)];
};

const removeNotificationItem = (list, targetId) => {
  const safeList = Array.isArray(list) ? list : [];
  const notificationId = String(targetId || '').trim();
  if (!notificationId) return safeList;
  return safeList.filter((item) => String(item?.id || '').trim() !== notificationId);
};

const NotificationCard = ({
  item,
  markingSeenId,
  onMarkSeen,
  onOpenMockExam,
  showAction = false,
}) => {
  const isUnread = !item?.seen;

  return (
    <div
      className={`rounded-[28px] border px-4 py-4 shadow-sm sm:px-5 sm:py-5 ${
        isUnread ? 'border-purple-200 bg-purple-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              isUnread
                ? 'border border-purple-200 bg-white text-purple-700'
                : 'border border-slate-200 bg-slate-50 text-slate-600'
            }`}>
              {isUnread ? 'Новое уведомление' : 'Уведомление'}
            </span>
            {item?.seen && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                Просмотрено
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {formatNotificationDate(item?.createdAt)}
            {item?.createdByName ? ` • ${item.createdByName}` : ''}
          </div>
        </div>

        {showAction && isUnread && (
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            onClick={() => onMarkSeen?.(item)}
            disabled={markingSeenId === item?.id}
          >
            <Check size={16} />
            {markingSeenId === item?.id ? 'Сохраняем...' : 'Отметить прочитанным'}
          </Button>
        )}
      </div>

      {item?.text && (
        <div className="mt-3 text-sm leading-6 text-slate-700">
          <LinkifiedText
            text={item.text}
            className="whitespace-pre-wrap break-words"
            linkClassName="text-purple-700 underline decoration-purple-300 underline-offset-2"
          />
        </div>
      )}

      <div className="mt-3 space-y-3">
        {item?.mockExam?.id && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-indigo-950">
                  <BookOpen size={16} />
                  {item?.mockExam?.title || 'Прикреплённый пробник'}
                </div>
                <div className="mt-1 text-xs text-indigo-700/80">
                  {Number(item?.mockExam?.taskCount) > 0
                    ? `Заданий в пробнике: ${item.mockExam.taskCount}`
                    : 'Откройте пробник прямо отсюда.'}
                </div>
              </div>
              {typeof onOpenMockExam === 'function' && (
                <Button type="button" variant="secondary" className="shrink-0" onClick={() => onOpenMockExam(item)}>
                  <BookOpen size={16} />
                  Открыть пробник
                </Button>
              )}
            </div>
          </div>
        )}

        <NotificationAttachment attachment={item?.image} isImage />
        <NotificationAttachment attachment={item?.file} />
      </div>
    </div>
  );
};

const StudentNotificationsCenter = ({ user, onOpenMockExam }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [featuredNotification, setFeaturedNotification] = useState(null);
  const [markingSeenId, setMarkingSeenId] = useState('');
  const initializedRef = useRef(false);
  const knownIdsRef = useRef(new Set());
  const panelOpenRef = useRef(false);
  const featuredNotificationRef = useRef(null);
  const liveSocketRef = useRef(null);
  const liveReconnectTimerRef = useRef(null);
  const liveSocketClosedManuallyRef = useRef(false);
  const notificationsWsUrl = useMemo(() => withStoredAuthToken(getNotificationsWsUrl()), []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item?.seen).length,
    [notifications]
  );

  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);

  useEffect(() => {
    featuredNotificationRef.current = featuredNotification;
  }, [featuredNotification]);

  const clearLiveReconnectTimer = useCallback(() => {
    if (!liveReconnectTimerRef.current) return;
    window.clearTimeout(liveReconnectTimerRef.current);
    liveReconnectTimerRef.current = null;
  }, []);

  const closeLiveSocket = useCallback(() => {
    liveSocketClosedManuallyRef.current = true;
    clearLiveReconnectTimer();
    const socket = liveSocketRef.current;
    liveSocketRef.current = null;
    if (!socket) return;
    try {
      socket.close();
    } catch {}
  }, [clearLiveReconnectTimer]);

  const showFeaturedNotification = useCallback((item) => {
    const notification = item && typeof item === 'object' ? item : null;
    const notificationId = String(notification?.id || '').trim();
    if (!notificationId || featuredNotificationRef.current) return false;
    panelOpenRef.current = false;
    setPanelOpen(false);
    featuredNotificationRef.current = notification;
    setFeaturedNotification(notification);
    return true;
  }, []);

  const syncNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);

    try {
      const payload = await api.getBroadcastNotifications();
      const list = Array.isArray(payload) ? payload : [];
      setNotifications(list);
      setError('');

      const nextKnownIds = new Set(knownIdsRef.current);
      const unseenItems = list.filter((item) => !item?.seen);
      const nextFeatured = initializedRef.current
        ? unseenItems.find((item) => !nextKnownIds.has(item.id))
        : unseenItems[0];

      list.forEach((item) => nextKnownIds.add(item.id));
      knownIdsRef.current = nextKnownIds;
      initializedRef.current = true;

      if (nextFeatured) {
        showFeaturedNotification(nextFeatured);
      }
    } catch (err) {
      if (!silent) {
        setError(err?.message || String(err));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showFeaturedNotification]);

  const applyIncomingNotification = useCallback((item) => {
    const notification = item && typeof item === 'object' ? item : null;
    const notificationId = String(notification?.id || '').trim();
    if (!notificationId) return;

    initializedRef.current = true;
    const nextKnownIds = new Set(knownIdsRef.current);
    nextKnownIds.add(notificationId);
    knownIdsRef.current = nextKnownIds;
    setNotifications((prev) => upsertNotificationItem(prev, notification));
    setError('');

    if (!notification?.seen) {
      showFeaturedNotification(notification);
    }
  }, [showFeaturedNotification]);

  const removeNotificationLocally = useCallback((notificationId) => {
    const normalizedId = String(notificationId || '').trim();
    if (!normalizedId) return;

    setNotifications((prev) => removeNotificationItem(prev, normalizedId));
    setFeaturedNotification((prev) => {
      if (String(prev?.id || '').trim() !== normalizedId) return prev;
      featuredNotificationRef.current = null;
      return null;
    });
  }, []);

  useEffect(() => {
    if (user?.role !== 'student') {
      initializedRef.current = false;
      knownIdsRef.current = new Set();
      panelOpenRef.current = false;
      featuredNotificationRef.current = null;
      setNotifications([]);
      setFeaturedNotification(null);
      setPanelOpen(false);
      setError('');
      return undefined;
    }

    initializedRef.current = false;
    knownIdsRef.current = new Set();
    panelOpenRef.current = false;
    featuredNotificationRef.current = null;
    setNotifications([]);
    setFeaturedNotification(null);
    setPanelOpen(false);
    setError('');

    let cancelled = false;
    const load = async (options = {}) => {
      if (cancelled) return;
      await syncNotifications(options);
    };

    load();
    const intervalId = window.setInterval(() => {
      load({ silent: true });
    }, SYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [syncNotifications, user?.id, user?.role]);

  useEffect(() => {
    if (user?.role !== 'student') {
      closeLiveSocket();
      return undefined;
    }
    if (!notificationsWsUrl || typeof window === 'undefined') return undefined;

    liveSocketClosedManuallyRef.current = false;
    let disposed = false;

    const scheduleReconnect = () => {
      if (disposed || liveSocketClosedManuallyRef.current) return;
      clearLiveReconnectTimer();
      liveReconnectTimerRef.current = window.setTimeout(() => {
        liveReconnectTimerRef.current = null;
        connect();
      }, LIVE_RECONNECT_DELAY_MS);
    };

    const connect = () => {
      if (disposed) return;
      const existing = liveSocketRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        return;
      }

      try {
        const socket = new WebSocket(notificationsWsUrl);
        liveSocketRef.current = socket;

        socket.onmessage = (event) => {
          if (liveSocketRef.current !== socket) return;

          let payload = null;
          try {
            payload = JSON.parse(String(event.data || ''));
          } catch {
            return;
          }

          if (payload?.type === 'broadcast-notification-created') {
            applyIncomingNotification(payload.notification);
            return;
          }

          if (payload?.type === 'broadcast-notification-deleted') {
            removeNotificationLocally(payload.notificationId);
          }
        };

        socket.onerror = () => {
          if (liveSocketRef.current !== socket) return;
          try {
            socket.close();
          } catch {}
        };

        socket.onclose = () => {
          if (liveSocketRef.current === socket) {
            liveSocketRef.current = null;
          }
          if (disposed || liveSocketClosedManuallyRef.current) return;
          scheduleReconnect();
        };
      } catch {
        scheduleReconnect();
      }
    };

    connect();

    return () => {
      disposed = true;
      closeLiveSocket();
    };
  }, [
    applyIncomingNotification,
    clearLiveReconnectTimer,
    closeLiveSocket,
    notificationsWsUrl,
    removeNotificationLocally,
    user?.id,
    user?.role,
  ]);

  const markNotificationSeen = useCallback(async (itemOrId) => {
    const notificationId = typeof itemOrId === 'string'
      ? itemOrId
      : String(itemOrId?.id || '').trim();
    if (!notificationId) return;

    setMarkingSeenId(notificationId);
    setNotifications((prev) => prev.map((item) => (
      item.id === notificationId ? { ...item, seen: true } : item
    )));
    setFeaturedNotification((prev) => (
      prev?.id === notificationId ? { ...prev, seen: true } : prev
    ));

    try {
      const updated = await api.markBroadcastNotificationSeen(notificationId);
      setNotifications((prev) => prev.map((item) => (
        item.id === notificationId ? { ...item, ...updated } : item
      )));
      setFeaturedNotification((prev) => (
        prev?.id === notificationId ? { ...prev, ...updated } : prev
      ));
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setMarkingSeenId((current) => (current === notificationId ? '' : current));
    }
  }, []);

  const handleOpenNotificationMockExam = useCallback((item, options = {}) => {
    const mockExamId = String(item?.mockExam?.id || '').trim();
    if (!mockExamId || typeof onOpenMockExam !== 'function') return;

    if (item?.id && !item?.seen) {
      markNotificationSeen(item.id);
    }

    if (options.closeFeatured) {
      featuredNotificationRef.current = null;
      setFeaturedNotification(null);
    }

    if (options.closePanel) {
      panelOpenRef.current = false;
      setPanelOpen(false);
    }

    onOpenMockExam(mockExamId);
  }, [markNotificationSeen, onOpenMockExam]);

  const closeFeaturedNotification = useCallback(() => {
    const current = featuredNotificationRef.current || featuredNotification;
    featuredNotificationRef.current = null;
    setFeaturedNotification(null);
    if (current?.id && !current?.seen) {
      markNotificationSeen(current.id);
    }
  }, [featuredNotification, markNotificationSeen]);

  if (user?.role !== 'student') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="fixed right-[7rem] top-[calc(env(safe-area-inset-top)+0.55rem)] z-30 flex h-10 w-10 items-center justify-center rounded-xl border border-purple-200/70 bg-white text-purple-700 shadow-sm transition hover:bg-purple-50 md:hidden"
        aria-label="Открыть уведомления"
        title="Уведомления"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="hidden fixed right-4 top-4 z-30 md:flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-200/80 bg-white text-purple-700 shadow-[0_14px_30px_rgba(15,23,42,0.14)] transition hover:-translate-y-[1px] hover:bg-purple-50"
        aria-label="Открыть уведомления"
        title="Уведомления"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {featuredNotification && (
        <div
          className="fixed inset-0 z-[1250] flex items-center justify-center bg-slate-950/78 px-3 py-4 backdrop-blur-[6px]"
          onClick={closeFeaturedNotification}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-[36px] border border-fuchsia-300/25 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.32),_rgba(15,23,42,0.96)_58%)] p-5 shadow-[0_40px_120px_rgba(15,23,42,0.65)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-10 top-0 h-28 rounded-full bg-fuchsia-400/20 blur-3xl" />

            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/35 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-fuchsia-100">
                  <Megaphone size={14} />
                  Важное уведомление
                </div>
                <div className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-300/80">
                  {formatNotificationDate(featuredNotification?.createdAt)}
                  {featuredNotification?.createdByName ? ` • ${featuredNotification.createdByName}` : ''}
                </div>
              </div>

              <button
                type="button"
                onClick={closeFeaturedNotification}
                className="rounded-2xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                aria-label="Закрыть уведомление"
              >
                <X size={16} />
              </button>
            </div>

            <div className="relative mt-6">
              {featuredNotification?.text ? (
                <div className="rounded-[30px] border border-white/10 bg-slate-950/65 px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-7 sm:py-7">
                  <div className="text-xl font-semibold leading-tight text-white sm:text-[2rem] sm:leading-[1.28]">
                    <LinkifiedText
                      text={featuredNotification.text}
                      className="whitespace-pre-wrap break-words"
                      linkClassName="text-fuchsia-200 underline decoration-fuchsia-300/70 underline-offset-4"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-[28px] border border-dashed border-white/20 bg-white/5 px-5 py-5 text-sm text-slate-200">
                  К уведомлению приложены материалы ниже.
                </div>
              )}

              {featuredNotification?.mockExam?.id && (
                <div className="mt-5 rounded-[28px] border border-fuchsia-300/25 bg-white/10 px-5 py-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-base font-semibold text-white">
                        <BookOpen size={18} />
                        {featuredNotification?.mockExam?.title || 'Прикреплённый пробник'}
                      </div>
                      <div className="mt-1 text-sm text-slate-200/80">
                        {Number(featuredNotification?.mockExam?.taskCount) > 0
                          ? `Заданий внутри: ${featuredNotification.mockExam.taskCount}`
                          : 'Пробник можно открыть сразу из этого уведомления.'}
                      </div>
                    </div>
                    {typeof onOpenMockExam === 'function' && (
                      <Button
                        type="button"
                        className="shrink-0 justify-center"
                        onClick={() => handleOpenNotificationMockExam(featuredNotification, { closeFeatured: true })}
                      >
                        <BookOpen size={16} />
                        Открыть пробник
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {(featuredNotification?.image || featuredNotification?.file) && (
                <div className="mt-5 space-y-4">
                  <NotificationAttachment attachment={featuredNotification?.image} isImage />
                  <NotificationAttachment attachment={featuredNotification?.file} />
                </div>
              )}
            </div>

            <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl text-sm leading-6 text-slate-300/80">
                Покажем это сообщение один раз крупно. Потом оно останется в колокольчике сверху.
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {featuredNotification?.mockExam?.id && typeof onOpenMockExam === 'function' && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-w-[180px] justify-center"
                    onClick={() => handleOpenNotificationMockExam(featuredNotification, { closeFeatured: true })}
                  >
                    <BookOpen size={16} />
                    К пробнику
                  </Button>
                )}
                <Button type="button" onClick={closeFeaturedNotification} className="min-w-[180px] justify-center">
                  Понятно
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {panelOpen && (
        <div
          className="fixed inset-0 z-[1240] flex items-center justify-center bg-slate-950/45 px-3 py-4 backdrop-blur-[2px]"
          onClick={() => setPanelOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[32px] border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <div className="text-xl font-bold text-slate-900">Уведомления</div>
                <div className="mt-1 text-sm text-slate-500">
                  {unreadCount > 0
                    ? `Новых: ${unreadCount}`
                    : 'Все уведомления просмотрены'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
                aria-label="Закрыть список уведомлений"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-4 sm:px-6">
              {loading && notifications.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  Загружаем уведомления...
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {!loading && notifications.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  Пока уведомлений нет.
                </div>
              )}

              <div className="space-y-3">
                {notifications.map((item) => (
                  <NotificationCard
                    key={item.id}
                    item={item}
                    markingSeenId={markingSeenId}
                    onMarkSeen={markNotificationSeen}
                    onOpenMockExam={(targetItem) => handleOpenNotificationMockExam(targetItem, { closePanel: true })}
                    showAction
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StudentNotificationsCenter;
