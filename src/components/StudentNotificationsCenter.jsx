import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BookOpen, Check, Gift, Megaphone, Paperclip, X } from 'lucide-react';
import { api, resolveAuthenticatedUploadsUrl, withStoredAuthToken } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import { getNotificationsWsUrl } from '../utils/runtimeUrls';
import LinkifiedText from './LinkifiedText';
import MockExamBadges from './MockExamBadges';
import { Button } from './ui';
import CoinGuideIcon from './CoinGuideTooltip';

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

const NotificationAttachment = ({ attachment, isImage = false, dark = false }) => {
  if (!attachment?.url) return null;
  const href = resolveAuthenticatedUploadsUrl(attachment.url);
  if (!href) return null;

  if (isImage) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`block overflow-hidden rounded-2xl border ${dark ? 'border-white/10 bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}
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
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
        dark
          ? 'border-white/10 bg-slate-950/40 text-slate-200 hover:border-fuchsia-300/35 hover:bg-fuchsia-500/10'
          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-purple-200 hover:bg-purple-50'
      }`}
    >
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-900">{attachment?.name || 'Файл'}</div>
        <div className="mt-0.5 text-xs text-slate-500">{attachment?.size || ''}</div>
      </div>
      <Paperclip size={16} className="shrink-0 text-purple-600" />
    </a>
  );
};

const NotificationGiftBanner = ({
  gift,
  onClaim,
  claiming = false,
  dark = false,
}) => {
  if (!gift?.coins) return null;
  const claimed = Boolean(gift?.claimed);

  return (
    <div className={`rounded-2xl border px-4 py-4 ${
      dark
        ? 'border-amber-300/25 bg-amber-400/10 text-white'
        : 'border-amber-200 bg-gradient-to-r from-amber-50 to-white text-slate-900'
    }`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className={`flex flex-wrap items-center gap-2 text-sm font-semibold ${
            dark ? 'text-amber-100' : 'text-amber-800'
          }`}>
            <Gift size={16} />
            Подарок от преподавателя
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
              dark
                ? 'border border-amber-200/25 bg-slate-950/40 text-amber-100'
                : 'border border-amber-200 bg-white text-amber-700'
            }`}>
              <CoinGuideIcon className="h-3.5 w-3.5 shrink-0" />
              {`+${gift.coins} монет`}
            </span>
          </div>
          <div className={`mt-1 text-xs ${
            dark ? 'text-slate-200/80' : 'text-slate-600'
          }`}>
            {claimed
              ? 'Подарок уже забран и монеты лежат на балансе.'
              : 'Монеты можно получить один раз по кнопке ниже.'}
          </div>
        </div>

        {typeof onClaim === 'function' && (
          <Button
            type="button"
            variant={claimed ? 'secondary' : (dark ? 'secondary' : 'primary')}
            className={dark
              ? 'min-w-[180px] justify-center border-white/15 bg-white/10 text-white hover:bg-white/15'
              : 'min-w-[180px] justify-center'}
            onClick={onClaim}
            disabled={claiming || claimed}
          >
            <Gift size={16} />
            {claimed ? 'Подарок получен' : (claiming ? 'Забираем...' : 'Забрать подарок')}
          </Button>
        )}
      </div>
    </div>
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
  claimingGiftId,
  onMarkSeen,
  onClaimGift,
  onOpenMockExam,
  showAction = false,
  dark = false,
}) => {
  const isUnread = !item?.seen;

  return (
    <div
      className={`rounded-[28px] border px-4 py-4 shadow-sm sm:px-5 sm:py-5 ${
        dark
          ? (isUnread
              ? 'border-fuchsia-300/25 bg-fuchsia-500/10 text-white [&_.text-slate-900]:!text-white [&_.text-slate-700]:!text-slate-200 [&_.text-slate-600]:!text-slate-300 [&_.text-slate-500]:!text-slate-400 [&_.border-slate-200]:!border-white/10 [&_.bg-slate-50]:!bg-white/5'
              : 'border-white/10 bg-slate-950/35 text-white [&_.text-slate-900]:!text-white [&_.text-slate-700]:!text-slate-200 [&_.text-slate-600]:!text-slate-300 [&_.text-slate-500]:!text-slate-400 [&_.border-slate-200]:!border-white/10 [&_.bg-slate-50]:!bg-white/5')
          : (isUnread ? 'border-purple-200 bg-purple-50/40' : 'border-slate-200 bg-white')
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              dark
                ? (isUnread
                    ? 'border border-fuchsia-300/30 bg-white/10 text-fuchsia-100'
                    : 'border border-white/10 bg-white/5 text-slate-300')
                : (isUnread
                    ? 'border border-purple-200 bg-white text-purple-700'
                    : 'border border-slate-200 bg-slate-50 text-slate-600')
            }`}>
              {isUnread ? 'Новое уведомление' : 'Уведомление'}
            </span>
            {item?.seen && (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                dark
                  ? 'border border-emerald-300/25 bg-emerald-500/10 text-emerald-200'
                  : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}>
                Просмотрено
              </span>
            )}
          </div>
          <div className={`mt-2 text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
            {formatNotificationDate(item?.createdAt)}
            {item?.createdByName ? ` • ${item.createdByName}` : ''}
          </div>
        </div>

        {showAction && isUnread && (
          <Button
            type="button"
            variant="secondary"
            className={dark ? 'shrink-0 border-white/10 bg-white/10 text-white hover:bg-white/15' : 'shrink-0'}
            onClick={() => onMarkSeen?.(item)}
            disabled={markingSeenId === item?.id}
          >
            <Check size={16} />
            {markingSeenId === item?.id ? 'Сохраняем...' : 'Отметить прочитанным'}
          </Button>
        )}
      </div>

      {item?.text && (
        <div className={`mt-3 text-sm leading-6 ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
          <LinkifiedText
            text={item.text}
            className="whitespace-pre-wrap break-words"
            linkClassName={dark
              ? 'text-fuchsia-200 underline decoration-fuchsia-300/70 underline-offset-2'
              : 'text-purple-700 underline decoration-purple-300 underline-offset-2'}
          />
        </div>
      )}

      <div className="mt-3 space-y-3">
        <NotificationGiftBanner
          gift={item?.gift}
          dark={dark}
          claiming={claimingGiftId === item?.id}
          onClaim={item?.gift?.claimed ? undefined : (event) => onClaimGift?.(item, event?.currentTarget?.getBoundingClientRect?.() || null)}
        />

        {item?.mockExam?.id && (
          <div className={`rounded-2xl border px-4 py-4 ${
            dark
              ? 'border-sky-300/20 bg-sky-500/10'
              : 'border-indigo-200 bg-indigo-50/80'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className={`flex items-center gap-2 text-sm font-semibold ${dark ? 'text-sky-100' : 'text-indigo-950'}`}>
                  <BookOpen size={16} />
                  {item?.mockExam?.title || 'Прикреплённый пробник'}
                </div>
                <MockExamBadges badges={item?.mockExam?.badges} className="mt-2" />
                <div className={`mt-1 text-xs ${dark ? 'text-sky-100/80' : 'text-indigo-700/80'}`}>
                  {Number(item?.mockExam?.taskCount) > 0
                    ? `Заданий в пробнике: ${item.mockExam.taskCount}`
                    : 'Откройте пробник прямо отсюда.'}
                </div>
              </div>
              {typeof onOpenMockExam === 'function' && (
                <Button type="button" variant="secondary" className={dark ? 'shrink-0 border-white/10 bg-white/10 text-white hover:bg-white/15' : 'shrink-0'} onClick={() => onOpenMockExam(item)}>
                  <BookOpen size={16} />
                  Открыть пробник
                </Button>
              )}
            </div>
          </div>
        )}

        <NotificationAttachment attachment={item?.image} isImage dark={dark} />
        <NotificationAttachment attachment={item?.file} dark={dark} />
      </div>
    </div>
  );
};

const StudentNotificationsCenter = ({
  user,
  onOpenMockExam,
  onStudentCoinsChange,
  onGiftCoinsClaim,
  theme = 'light',
}) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [featuredNotification, setFeaturedNotification] = useState(null);
  const [markingSeenId, setMarkingSeenId] = useState('');
  const [claimingGiftId, setClaimingGiftId] = useState('');
  const initializedRef = useRef(false);
  const knownIdsRef = useRef(new Set());
  const panelOpenRef = useRef(false);
  const featuredNotificationRef = useRef(null);
  const liveSocketRef = useRef(null);
  const liveReconnectTimerRef = useRef(null);
  const liveSocketClosedManuallyRef = useRef(false);
  const notificationsWsUrl = useMemo(() => withStoredAuthToken(getNotificationsWsUrl()), []);
  const isDarkTheme = String(theme || '').trim() === 'dark';
  const hasFeaturedGiftToClaim = Boolean(
    featuredNotification?.gift?.coins > 0 && !featuredNotification?.gift?.claimed
  );
  const featuredNotificationTheme = isDarkTheme
    ? {
      overlay: 'fixed inset-0 z-[1250] flex items-center justify-center bg-slate-950/78 px-3 py-4 backdrop-blur-[6px]',
      shell: 'relative w-full max-w-3xl overflow-hidden rounded-[36px] border border-fuchsia-300/25 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.32),_rgba(15,23,42,0.96)_58%)] p-5 shadow-[0_40px_120px_rgba(15,23,42,0.65)] sm:p-7',
      glow: 'pointer-events-none absolute inset-x-10 top-0 h-28 rounded-full bg-fuchsia-400/20 blur-3xl',
      badge: 'inline-flex items-center gap-2 rounded-full border border-fuchsia-300/35 bg-fuchsia-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-fuchsia-100',
      meta: 'mt-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-300/80',
      giftNotice: 'rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100',
      closeButton: 'rounded-2xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white',
      messageCard: 'rounded-[30px] border border-white/10 bg-slate-950/65 px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-7 sm:py-7',
      messageText: 'text-xl font-semibold leading-tight text-white sm:text-[2rem] sm:leading-[1.28]',
      messageLink: 'text-fuchsia-200 underline decoration-fuchsia-300/70 underline-offset-4',
      emptyCard: 'rounded-[28px] border border-dashed border-white/20 bg-white/5 px-5 py-5 text-sm text-slate-200',
      mockExamCard: 'mt-5 rounded-[28px] border border-fuchsia-300/25 bg-white/10 px-5 py-5',
      mockExamTitle: 'flex items-center gap-2 text-base font-semibold text-white',
      mockExamMeta: 'mt-1 text-sm text-slate-200/80',
      attachments: 'mt-5 space-y-4 [&_.text-slate-900]:!text-white [&_.text-slate-500]:!text-slate-400 [&_.text-purple-600]:!text-fuchsia-200',
      footerHint: 'max-w-xl text-sm leading-6 text-slate-300/80',
      secondaryButton: 'min-w-[180px] justify-center',
      primaryButton: 'min-w-[180px] justify-center',
    }
    : {
      overlay: 'fixed inset-0 z-[1250] flex items-center justify-center bg-slate-900/24 px-3 py-4 backdrop-blur-[4px]',
      shell: 'relative w-full max-w-3xl overflow-hidden rounded-[36px] border border-purple-100 bg-[radial-gradient(circle_at_top,_rgba(221,214,254,0.72),_rgba(255,255,255,0.98)_56%)] p-5 text-slate-900 shadow-[0_34px_90px_rgba(88,28,135,0.18),0_0_0_1px_rgba(255,255,255,0.8)_inset] sm:p-7',
      glow: 'pointer-events-none absolute inset-x-10 top-0 h-28 rounded-full bg-purple-200/55 blur-3xl',
      badge: 'inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white/76 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-purple-700 shadow-sm',
      meta: 'mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500',
      giftNotice: 'rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700',
      closeButton: 'rounded-2xl border border-slate-200 bg-white/85 p-2 text-slate-500 shadow-sm transition hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700',
      messageCard: 'rounded-[30px] border border-purple-100/80 bg-white px-5 py-6 shadow-[0_18px_45px_rgba(88,28,135,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-7 sm:py-7',
      messageText: 'text-xl font-semibold leading-tight text-slate-950 sm:text-[2rem] sm:leading-[1.28]',
      messageLink: 'text-purple-700 underline decoration-purple-300 underline-offset-4',
      emptyCard: 'rounded-[28px] border border-dashed border-purple-200 bg-white/78 px-5 py-5 text-sm text-slate-600',
      mockExamCard: 'mt-5 rounded-[28px] border border-purple-100 bg-white/82 px-5 py-5 shadow-sm',
      mockExamTitle: 'flex items-center gap-2 text-base font-semibold text-slate-900',
      mockExamMeta: 'mt-1 text-sm text-slate-500',
      attachments: 'mt-5 space-y-4',
      footerHint: 'max-w-xl text-sm leading-6 text-slate-500',
      secondaryButton: 'min-w-[180px] justify-center border-purple-100 bg-white text-purple-700 hover:bg-purple-50',
      primaryButton: 'min-w-[180px] justify-center shadow-[0_12px_24px_rgba(124,58,237,0.22)]',
    };

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
      setClaimingGiftId('');
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
    setClaimingGiftId('');
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

  const handleClaimGift = useCallback(async (itemOrId, sourceRect = null) => {
    const notificationId = typeof itemOrId === 'string'
      ? itemOrId
      : String(itemOrId?.id || '').trim();
    if (!notificationId) return;

    setClaimingGiftId(notificationId);
    setError('');

    try {
      const payload = await api.claimBroadcastNotificationGift(notificationId);
      const updatedNotification = payload?.notification && typeof payload.notification === 'object'
        ? payload.notification
        : null;

      if (updatedNotification?.id) {
        setNotifications((prev) => prev.map((item) => (
          item.id === updatedNotification.id ? { ...item, ...updatedNotification } : item
        )));
        setFeaturedNotification((prev) => (
          prev?.id === updatedNotification.id ? { ...prev, ...updatedNotification } : prev
        ));
      }

      if (Number.isFinite(Number(payload?.coinsTotal))) {
        onStudentCoinsChange?.(Number(payload.coinsTotal));
      }
      if (Number.isFinite(Number(payload?.giftCoins)) && Number(payload.giftCoins) > 0) {
        onGiftCoinsClaim?.({
          coinsGained: Number(payload.giftCoins),
          coinsTotal: Number.isFinite(Number(payload?.coinsTotal)) ? Number(payload.coinsTotal) : null,
          sourceRect: sourceRect && Number.isFinite(sourceRect.left) && Number.isFinite(sourceRect.top)
            ? {
              left: Number(sourceRect.left),
              top: Number(sourceRect.top),
              width: Number(sourceRect.width) || 0,
              height: Number(sourceRect.height) || 0,
            }
            : null,
        });
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setClaimingGiftId((current) => (current === notificationId ? '' : current));
    }
  }, [onGiftCoinsClaim, onStudentCoinsChange]);

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
    if (current?.gift?.coins > 0 && !current?.gift?.claimed) {
      return;
    }
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
        className={`fixed right-[7rem] top-[calc(env(safe-area-inset-top)+0.55rem)] z-30 flex h-10 w-10 items-center justify-center rounded-xl border shadow-sm transition md:hidden ${
          isDarkTheme
            ? 'border-fuchsia-300/20 bg-slate-950/85 text-fuchsia-100 hover:bg-slate-900'
            : 'border-purple-200/70 bg-white text-purple-700 hover:bg-purple-50'
        }`}
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
        className={`hidden fixed right-4 top-4 z-30 md:flex h-12 w-12 items-center justify-center rounded-2xl border shadow-[0_14px_30px_rgba(15,23,42,0.14)] transition hover:-translate-y-[1px] ${
          isDarkTheme
            ? 'border-fuchsia-300/20 bg-slate-950/88 text-fuchsia-100 hover:bg-slate-900'
            : 'border-purple-200/80 bg-white text-purple-700 hover:bg-purple-50'
        }`}
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
          className={featuredNotificationTheme.overlay}
          onClick={() => {
            if (!hasFeaturedGiftToClaim) closeFeaturedNotification();
          }}
        >
          <div
            className={featuredNotificationTheme.shell}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={featuredNotificationTheme.glow} />

            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className={featuredNotificationTheme.badge}>
                  <Megaphone size={14} />
                  Важное уведомление
                </div>
                <div className={featuredNotificationTheme.meta}>
                  {formatNotificationDate(featuredNotification?.createdAt)}
                  {featuredNotification?.createdByName ? ` • ${featuredNotification.createdByName}` : ''}
                </div>
              </div>

              {hasFeaturedGiftToClaim && (
                <div className={featuredNotificationTheme.giftNotice}>
                  Сначала забери подарок
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!hasFeaturedGiftToClaim) closeFeaturedNotification();
                }}
                className={`${featuredNotificationTheme.closeButton} ${hasFeaturedGiftToClaim ? 'pointer-events-none opacity-0' : ''}`}
                aria-label="Закрыть уведомление"
              >
                <X size={16} />
              </button>
            </div>

            <div className="relative mt-6">
              {featuredNotification?.text ? (
                <div className={featuredNotificationTheme.messageCard}>
                  <div className={featuredNotificationTheme.messageText}>
                    <LinkifiedText
                      text={featuredNotification.text}
                      className="whitespace-pre-wrap break-words"
                      linkClassName={featuredNotificationTheme.messageLink}
                    />
                  </div>
                </div>
              ) : (
                <div className={featuredNotificationTheme.emptyCard}>
                  {featuredNotification?.gift?.coins > 0
                    ? 'Тут есть подарок. Монеты можно забрать ниже.'
                    : 'К уведомлению приложены материалы ниже.'}
                </div>
              )}

              {featuredNotification?.gift?.coins > 0 && (
                <div className="mt-5">
                  <NotificationGiftBanner
                    gift={featuredNotification?.gift}
                    claiming={claimingGiftId === featuredNotification?.id}
                    onClaim={featuredNotification?.gift?.claimed ? undefined : (event) => handleClaimGift(featuredNotification, event?.currentTarget?.getBoundingClientRect?.() || null)}
                    dark={isDarkTheme}
                  />
                </div>
              )}

              {featuredNotification?.mockExam?.id && (
                <div className={featuredNotificationTheme.mockExamCard}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className={featuredNotificationTheme.mockExamTitle}>
                        <BookOpen size={18} />
                        {featuredNotification?.mockExam?.title || 'Прикреплённый пробник'}
                      </div>
                      <MockExamBadges badges={featuredNotification?.mockExam?.badges} size="md" className="mt-2" />
                      <div className={featuredNotificationTheme.mockExamMeta}>
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
                <div className={featuredNotificationTheme.attachments}>
                  <NotificationAttachment attachment={featuredNotification?.image} isImage dark={isDarkTheme} />
                  <NotificationAttachment attachment={featuredNotification?.file} dark={isDarkTheme} />
                </div>
              )}
            </div>

            <div className="relative mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className={featuredNotificationTheme.footerHint}>
                Покажем это сообщение один раз крупно. Потом оно останется в колокольчике сверху.
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {featuredNotification?.mockExam?.id && typeof onOpenMockExam === 'function' && (
                  <Button
                    type="button"
                    variant="secondary"
                    className={featuredNotificationTheme.secondaryButton}
                    onClick={() => handleOpenNotificationMockExam(featuredNotification, { closeFeatured: true })}
                    disabled={hasFeaturedGiftToClaim}
                  >
                    <BookOpen size={16} />
                    К пробнику
                  </Button>
                )}
                {!hasFeaturedGiftToClaim && (
                <Button type="button" onClick={closeFeaturedNotification} className={featuredNotificationTheme.primaryButton}>
                  Понятно
                </Button>
                )}
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
            className={`flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[32px] border shadow-2xl ${
              isDarkTheme
                ? 'border-white/10 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.12),_rgba(2,6,23,0.98)_58%)] text-white [&_.text-slate-900]:!text-white [&_.text-slate-700]:!text-slate-200 [&_.text-slate-600]:!text-slate-300 [&_.text-slate-500]:!text-slate-400 [&_.border-slate-200]:!border-white/10 [&_.bg-white]:!bg-white/5 [&_.bg-slate-50]:!bg-white/5'
                : 'border-slate-200 bg-white'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex items-start justify-between gap-3 border-b px-4 py-4 sm:px-6 ${
              isDarkTheme ? 'border-white/10' : 'border-slate-200'
            }`}>
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
                    claimingGiftId={claimingGiftId}
                    onMarkSeen={markNotificationSeen}
                    onClaimGift={handleClaimGift}
                    onOpenMockExam={(targetItem) => handleOpenNotificationMockExam(targetItem, { closePanel: true })}
                    showAction
                    dark={isDarkTheme}
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
