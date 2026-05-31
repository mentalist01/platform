import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  FileText,
  Image as ImageIcon,
  Link,
  Pin,
  GraduationCap,
  Hash,
  MessageSquare,
  MoreVertical,
  PanelRight,
  Paperclip,
  Pencil,
  Forward,
  Reply,
  Search,
  SendHorizontal,
  SmilePlus,
  Trash2,
  UploadCloud,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { Button, Card } from './ui';
import ChatInfoDrawer from './ChatInfoDrawer';
import LinkifiedText from './LinkifiedText';
import StudentLeaderboardProfileModal from './StudentLeaderboardProfileModal';

const POLL_INTERVAL_MS = 3000;
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const CHAT_FILE_SIZE_LABEL = '10 МБ';
const CHAT_MESSAGE_PAGE_SIZE = 15;
const CHAT_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CHAT_TARGET_HIGHLIGHT_DELAY_MS = 180;
const CHAT_TARGET_HIGHLIGHT_DURATION_MS = 2400;
const CHAT_REACTION_EMOJIS = Object.freeze(['👍', '❤️', '😂', '🔥', '👏', '😮', '😢', '🙏']);
const CHAT_CONTENT_FILTERS = Object.freeze([
  { id: 'all', label: 'Все', Icon: MessageSquare },
  { id: 'media', label: 'Медиа', Icon: ImageIcon },
  { id: 'files', label: 'Файлы', Icon: FileText },
  { id: 'links', label: 'Ссылки', Icon: Link },
]);
const CHAT_LINK_PATTERN = /https?:\/\/[^\s<>"']+|(?:^|\s)(?:www\.)[^\s<>"']+/i;
const EMPTY_CHAT_MESSAGES_PAGINATION = Object.freeze({
  hasMoreBefore: false,
  nextBefore: '',
});

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

const getDataUrlMimeType = (dataUrl) => {
  const match = String(dataUrl || '').trim().match(/^data:([^;,]+);base64,/i);
  return String(match?.[1] || '').trim().toLowerCase();
};

const normalizeAttachmentMimeType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
};

const formatFileSize = (value) => {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  if (size >= 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${Math.round(size)} Б`;
};

const hasDraggedFiles = (event) => Array.from(event?.dataTransfer?.types || []).includes('Files');

const getChatMessagesPagination = (payload) => {
  const pagination = payload?.pagination || {};
  return {
    hasMoreBefore: Boolean(pagination.hasMoreBefore),
    nextBefore: String(pagination.nextBefore || pagination.oldestMessageId || '').trim(),
  };
};

const getChatMessageKey = (message) => {
  const id = String(message?.id || '').trim();
  if (id) return id;
  return [
    String(message?.createdAt || '').trim(),
    String(message?.senderId || '').trim(),
    String(message?.text || '').trim(),
  ].join(':');
};

const mergeChatMessages = (...groups) => {
  const seen = new Set();
  const byKey = new Map();
  const merged = [];
  groups.forEach((group) => {
    (Array.isArray(group) ? group : []).forEach((message) => {
      const key = getChatMessageKey(message);
      if (!key) return;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(key);
      }
      byKey.set(key, message);
    });
  });
  return merged.map((key) => byKey.get(key)).filter(Boolean);
};

const upsertChatSummary = (list = [], chat = null) => {
  const chatId = String(chat?.id || '').trim();
  if (!chatId) return Array.isArray(list) ? list : [];
  const source = Array.isArray(list) ? list : [];
  return [
    chat,
    ...source.filter((item) => String(item?.id || '').trim() !== chatId),
  ];
};

const getPinnedReferenceMessageId = (reference) => String(reference?.messageId || reference?.id || '').trim();

const confirmUnpinMessage = () => (
  typeof window === 'undefined'
  || typeof window.confirm !== 'function'
  || window.confirm('Убрать закреплённое сообщение?')
);

const isMessageDeleteAllowed = (message) => {
  const createdAt = Date.parse(message?.createdAt || '');
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt <= CHAT_DELETE_WINDOW_MS;
};

const normalizeMessageReactions = (message) => (
  (Array.isArray(message?.reactions) ? message.reactions : [])
    .map((reaction) => ({
      emoji: String(reaction?.emoji || '').trim(),
      count: Math.max(0, Math.trunc(Number(reaction?.count) || 0)),
      reactedByMe: Boolean(reaction?.reactedByMe || reaction?.mine),
      names: Array.isArray(reaction?.names) ? reaction.names : [],
    }))
    .filter((reaction) => reaction.emoji && reaction.count > 0)
);

const normalizeMessageReadReceipts = (message) => (
  (Array.isArray(message?.readBy) ? message.readBy : [])
    .map((reader) => ({
      id: String(reader?.id || '').trim(),
      role: String(reader?.role || '').trim(),
      name: String(reader?.name || '').trim(),
      readAt: String(reader?.readAt || '').trim(),
    }))
    .filter((reader) => reader.id && reader.name)
);

const getMessageReceiptState = (message) => {
  const id = String(message?.id || '').trim();
  if (!id || message?.pending || message?.sending || message?.localOnly || message?.status === 'pending') return 'pending';
  if (normalizeMessageReadReceipts(message).length > 0 || Number(message?.viewCount) > 0 || message?.read === true) return 'read';
  return 'sent';
};

const MessageDeliveryStatus = ({ message }) => {
  const state = getMessageReceiptState(message);
  const Icon = state === 'pending' ? Check : CheckCheck;
  return (
    <span
      className={`student-message-read-status student-message-read-status--${state}`}
      aria-label={state === 'read' ? 'Прочитано' : (state === 'sent' ? 'Отправлено' : 'Отправляется')}
      title={state === 'read' ? 'Прочитано' : (state === 'sent' ? 'Отправлено' : 'Отправляется')}
    >
      <Icon size={15} strokeWidth={2.7} />
    </span>
  );
};

const MessageReadReceiptSummary = ({ readers = [] }) => {
  const visibleReaders = (Array.isArray(readers) ? readers : []).slice(0, 8);
  const restCount = Math.max(0, (Array.isArray(readers) ? readers.length : 0) - visibleReaders.length);
  return (
    <div className="student-message-context-menu__readers" role="group" aria-label="Кто прочитал">
      <div className="student-message-context-menu__readers-head">
        <CheckCheck size={15} />
        <span>Прочитали</span>
        <strong>{readers.length}</strong>
      </div>
      {visibleReaders.length > 0 ? (
        <div className="student-message-context-menu__reader-list">
          {visibleReaders.map((reader) => (
            <span key={`${reader.role}:${reader.id}`} className="student-message-context-menu__reader">
              <span className="student-message-context-menu__reader-avatar">{getInitials(reader.name)}</span>
              <span className="student-message-context-menu__reader-name">{reader.name}</span>
            </span>
          ))}
          {restCount > 0 && (
            <span className="student-message-context-menu__reader student-message-context-menu__reader--more">
              +{restCount}
            </span>
          )}
        </div>
      ) : (
        <div className="student-message-context-menu__reader-empty">Еще не прочитали</div>
      )}
    </div>
  );
};

const hasMessageLink = (message) => CHAT_LINK_PATTERN.test(String(message?.text || ''));

const getMessageSearchText = (message) => [
  message?.text,
  message?.senderName,
  message?.imageName,
  message?.fileName,
  message?.replyTo?.text,
  message?.replyTo?.senderName,
  message?.forwardFrom?.text,
  message?.forwardFrom?.senderName,
].map((value) => String(value || '').toLowerCase()).join(' ');

const messageMatchesContentFilter = (message, filter) => {
  if (filter === 'media') return Boolean(message?.imageDataUrl);
  if (filter === 'files') return Boolean(message?.fileDataUrl);
  if (filter === 'links') return hasMessageLink(message);
  return true;
};

const getChatContentCounts = (messages = []) => {
  const list = Array.isArray(messages) ? messages : [];
  return list.reduce((acc, message) => {
    acc.all += 1;
    if (message?.imageDataUrl) acc.media += 1;
    if (message?.fileDataUrl) acc.files += 1;
    if (hasMessageLink(message)) acc.links += 1;
    return acc;
  }, { all: 0, media: 0, files: 0, links: 0 });
};

const getVisibleChatMessages = (messages = [], query = '', filter = 'all') => {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  return (Array.isArray(messages) ? messages : []).filter((message) => (
    messageMatchesContentFilter(message, filter)
    && (!normalizedQuery || getMessageSearchText(message).includes(normalizedQuery))
  ));
};

const copyTextToClipboard = async (value) => {
  const text = String(value || '');
  if (!text.trim()) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
};

const getMessageContextMenuPosition = (event, width = 210, height = 266) => {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
  return {
    x: viewportWidth > 0
      ? Math.max(10, Math.min(event.clientX, viewportWidth - width - 10))
      : event.clientX,
    y: viewportHeight > 0
      ? Math.max(10, Math.min(event.clientY, viewportHeight - height - 10))
      : event.clientY,
  };
};

const shouldIgnoreMessagePrimaryClick = (event) => {
  if (event.defaultPrevented) return true;
  if (event.button && event.button !== 0) return true;
  const target = event.target;
  if (target?.closest?.('button,a,input,textarea,select,label,[contenteditable="true"],[data-message-menu-ignore]')) {
    return true;
  }
  const selectedText = typeof window !== 'undefined'
    ? String(window.getSelection?.()?.toString() || '').trim()
    : '';
  return Boolean(selectedText);
};

const waitForChatPaint = () => new Promise((resolve) => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    setTimeout(resolve, 0);
    return;
  }
  window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
});

const getChatMessageElement = (container, messageId) => {
  const id = String(messageId || '').trim();
  if (!container || !id) return null;
  return Array.from(container.querySelectorAll('[data-chat-message-id]'))
    .find((element) => element.dataset.chatMessageId === id) || null;
};

const getChatMessageFocusDelay = (element, container = null) => {
  if (!element) return CHAT_TARGET_HIGHLIGHT_DELAY_MS;
  const elementRect = element.getBoundingClientRect?.();
  const containerRect = container?.getBoundingClientRect?.();
  if (!elementRect) return CHAT_TARGET_HIGHLIGHT_DELAY_MS;
  const viewportCenter = containerRect
    ? containerRect.top + (containerRect.height / 2)
    : (typeof window !== 'undefined' ? window.innerHeight / 2 : elementRect.top);
  const elementCenter = elementRect.top + (elementRect.height / 2);
  const distance = Math.abs(elementCenter - viewportCenter);
  return Math.min(760, Math.max(CHAT_TARGET_HIGHLIGHT_DELAY_MS, Math.round(distance * 0.42)));
};

const scrollChatMessageIntoView = (element, container = null) => {
  if (!element) return CHAT_TARGET_HIGHLIGHT_DELAY_MS;
  const highlightDelay = getChatMessageFocusDelay(element, container);
  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  return highlightDelay;
};

const getMessageReferencePreview = (reference) => {
  const text = String(reference?.text || '').replace(/\s+/g, ' ').trim();
  if (text) return text;
  if (reference?.hasImage) return reference?.imageName || 'Изображение';
  if (reference?.hasFile) return reference?.fileName || 'Файл';
  return 'Сообщение';
};

const getMessageReferenceSender = (reference) => (
  String(reference?.senderName || '').trim()
  || (reference?.senderRole === 'teacher' ? 'Преподаватель' : 'Ученик')
);

const buildMessageReferencePayload = (message, options = {}) => {
  const messageId = String(message?.id || '').trim();
  const senderId = String(message?.senderId || '').trim();
  const text = String(message?.text || '').replace(/\s+/g, ' ').trim();
  const imageName = String(message?.imageName || '').trim();
  const fileName = String(message?.fileName || '').trim();
  const hasImage = Boolean(message?.imageDataUrl || imageName);
  const hasFile = Boolean(message?.fileDataUrl || fileName);
  if (!messageId || !senderId || (!text && !hasImage && !hasFile)) return null;
  return {
    messageId,
    chatId: String(options.chatId || '').trim(),
    chatKind: String(options.chatKind || '').trim(),
    chatTitle: String(options.chatTitle || '').trim(),
    senderRole: message?.senderRole === 'teacher' ? 'teacher' : 'student',
    senderId,
    senderName: String(message?.senderName || '').trim() || getMessageSenderName(message, options.fallbackSenderName || ''),
    text,
    hasImage,
    hasFile,
    imageName,
    fileName,
    createdAt: String(message?.createdAt || '').trim(),
  };
};

const MessageReferenceCard = ({
  reference,
  type = 'reply',
  mine = false,
  compact = false,
  onCancel = null,
  onOpenTarget = null,
}) => {
  if (!reference) return null;
  const targetId = String(reference?.messageId || '').trim();
  const canOpenTarget = Boolean(targetId && typeof onOpenTarget === 'function');
  const className = `student-message-reference student-message-reference--${type} ${mine ? 'student-message-reference--mine' : ''} ${compact ? 'student-message-reference--compact' : ''} ${canOpenTarget ? 'student-message-reference--clickable' : ''}`;
  const openTarget = () => {
    if (canOpenTarget) onOpenTarget(reference);
  };
  const handleReferenceKeyDown = (event) => {
    if (!canOpenTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openTarget();
  };
  const content = (
    <>
      <span className="student-message-reference__rail" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="student-message-reference__label">
          {type === 'forward' ? 'Переслано' : (type === 'pin' ? 'Закреплено' : 'Ответ')}
          {type === 'forward' && reference.chatTitle ? ` · ${reference.chatTitle}` : ''}
        </span>
        <span className="student-message-reference__author">{getMessageReferenceSender(reference)}</span>
        <span className="student-message-reference__text">{getMessageReferencePreview(reference)}</span>
      </span>
      {typeof onCancel === 'function' && (
        <button
          type="button"
          className="student-message-reference__close"
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
          aria-label="Убрать"
          title="Убрать"
        >
          <X size={13} />
        </button>
      )}
    </>
  );
  if (canOpenTarget) {
    return (
      <div
        className={className}
        onClick={(event) => {
          event.stopPropagation();
          openTarget();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          handleReferenceKeyDown(event);
        }}
        role="button"
        tabIndex={0}
      >
        {content}
      </div>
    );
  }
  return (
    <div className={className}>
      {content}
    </div>
  );
};

const ChatMessageTools = ({
  searchQuery,
  onSearchQueryChange,
  contentFilter,
  onContentFilterChange,
  counts,
}) => (
  <div className="student-chat-message-tools">
    <label className="student-chat-message-search">
      <Search size={14} />
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        placeholder="Поиск"
      />
    </label>
    <div className="student-chat-content-tabs" role="tablist" aria-label="Материалы чата">
      {CHAT_CONTENT_FILTERS.map(({ id, label, Icon: FilterIcon }) => {
        const active = contentFilter === id;
        return (
          <button
            key={id}
            type="button"
            className={`student-chat-content-tab ${active ? 'student-chat-content-tab--active' : ''}`}
            onClick={() => onContentFilterChange(id)}
            role="tab"
            aria-selected={active}
          >
            {React.createElement(FilterIcon, { size: 13 })}
            <span>{label}</span>
            <strong>{counts?.[id] || 0}</strong>
          </button>
        );
      })}
    </div>
  </div>
);

const isChatScrolledNearBottom = (node) => (
  !node || (node.scrollHeight - node.scrollTop - node.clientHeight) < 160
);

const shouldShowChatScrollBottomButton = (node) => (
  Boolean(node && (node.scrollHeight - node.scrollTop - node.clientHeight) > 36)
);

const isPinAnnouncementMessage = (message) => (
  message?.senderRole === 'system' && message?.systemType === 'pin'
);

const canDeletePinAnnouncementForActor = (message, actor = {}) => {
  if (!isPinAnnouncementMessage(message)) return false;
  const actorId = String(actor?.id || '').trim();
  const actorRole = String(actor?.role || '').trim();
  const actorName = String(actor?.name || '').trim();
  const systemActorId = String(message?.systemActorId || '').trim();
  const systemActorRole = String(message?.systemActorRole || '').trim();
  if (systemActorId) {
    return systemActorId === actorId && (!systemActorRole || systemActorRole === actorRole);
  }
  return Boolean(actorName && String(message?.senderName || '').trim() === actorName);
};

const ChatMessageTopTools = ({
  searchQuery,
  onSearchQueryChange,
  contentFilter,
  onContentFilterChange,
  counts,
  menuActions = [],
  drawerInfo = null,
  pinnedMessage = null,
  onPinnedOpen = null,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!searchOpen) return;
    if (typeof window === 'undefined') return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = () => setMenuOpen(false);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className={`student-chat-message-tools student-chat-message-tools--compact ${searchOpen ? 'student-chat-message-tools--search-open' : ''}`} data-message-menu-ignore="true">
      <label
        className={`student-chat-message-search ${searchOpen ? 'student-chat-message-search--open' : ''}`}
        aria-hidden={!searchOpen}
      >
          <Search size={14} />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Поиск"
            tabIndex={searchOpen ? 0 : -1}
          />
          <button
            type="button"
            className="student-chat-tool-icon"
            onClick={() => {
              onSearchQueryChange('');
              setSearchOpen(false);
            }}
            tabIndex={searchOpen ? 0 : -1}
            aria-label="Закрыть поиск"
            title="Закрыть"
          >
            <X size={14} />
          </button>
        </label>
      <div className="student-chat-message-tool-actions">
        <button
          type="button"
          className={`student-chat-tool-icon ${searchOpen ? 'student-chat-tool-icon--active' : ''}`}
          onClick={() => setSearchOpen((value) => !value)}
          aria-label="Поиск"
          title="Поиск"
        >
          <Search size={16} />
        </button>
        <button
          type="button"
          className={`student-chat-tool-icon ${infoOpen ? 'student-chat-tool-icon--active' : ''}`}
          onClick={() => {
            setMenuOpen(false);
            setInfoOpen(true);
          }}
          aria-label="Информация о чате"
          title="Информация"
        >
          <PanelRight size={17} />
        </button>
        <div className="student-chat-tools-menu-wrap">
          <button
            type="button"
            className={`student-chat-tool-icon ${menuOpen ? 'student-chat-tool-icon--active' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((value) => !value);
            }}
            aria-label="Меню чата"
            title="Меню"
          >
            <MoreVertical size={17} />
          </button>
          {menuOpen && (
            <div className="student-chat-tools-menu" onClick={(event) => event.stopPropagation()}>
              <div className="student-chat-tools-menu__section">
                {CHAT_CONTENT_FILTERS.map(({ id, label, Icon: FilterIcon }) => {
                  const active = contentFilter === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`student-chat-tools-menu__item ${active ? 'student-chat-tools-menu__item--active' : ''}`}
                      onClick={() => {
                        onContentFilterChange(id);
                        setMenuOpen(false);
                      }}
                    >
                      {React.createElement(FilterIcon, { size: 15 })}
                      <span>{label}</span>
                      <strong>{counts?.[id] || 0}</strong>
                    </button>
                  );
                })}
              </div>
              {menuActions.length > 0 && (
                <div className="student-chat-tools-menu__section student-chat-tools-menu__section--actions">
                  {menuActions.map((action) => (
                    <button
                      key={action.id || action.label}
                      type="button"
                      className={`student-chat-tools-menu__item ${action.danger ? 'student-chat-tools-menu__item--danger' : ''}`}
                      onClick={(event) => {
                        action.onClick?.(event);
                        setMenuOpen(false);
                      }}
                      disabled={action.disabled}
                    >
                      {action.Icon ? React.createElement(action.Icon, { size: 15 }) : null}
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <ChatInfoDrawer
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        info={drawerInfo}
        counts={counts}
        pinnedMessage={pinnedMessage}
        menuActions={menuActions}
        onFilterSelect={onContentFilterChange}
        onPinnedOpen={onPinnedOpen}
        onOpenSearch={() => setSearchOpen(true)}
      />
    </div>
  );
};

const markChatScrollToBottom = (listRef, behaviorRef, { force = false } = {}) => {
  const node = listRef.current;
  behaviorRef.current = {
    type: force || isChatScrolledNearBottom(node) ? 'bottom' : 'none',
  };
};

const markChatScrollPreserve = (listRef, behaviorRef) => {
  const node = listRef.current;
  behaviorRef.current = node
    ? {
      type: 'preserve',
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    }
    : { type: 'none' };
};

const scrollChatNodeToBottom = (node) => {
  if (!node) return;
  const scroll = () => {
    node.scrollTop = node.scrollHeight;
  };
  scroll();
  window.requestAnimationFrame(scroll);
  window.requestAnimationFrame(() => {
    scroll();
    window.requestAnimationFrame(scroll);
  });
  window.setTimeout(scroll, 80);
  window.setTimeout(scroll, 220);
  window.setTimeout(scroll, 480);
};

const applyChatScrollBehavior = (listRef, behaviorRef) => {
  const node = listRef.current;
  const behavior = behaviorRef.current;
  if (!node || !behavior) return;
  behaviorRef.current = null;
  if (behavior.type === 'bottom') {
    scrollChatNodeToBottom(node);
    return;
  }
  if (behavior.type === 'preserve') {
    node.scrollTop = node.scrollHeight - behavior.scrollHeight + behavior.scrollTop;
  }
};

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

const getSocialSettings = (payload) => ({
  directEnabled: payload?.settings?.directEnabled !== false,
  groupEnabled: payload?.settings?.groupEnabled !== false,
});

const CHAT_ACCENTS = [
  {
    avatar: 'from-fuchsia-500 via-purple-500 to-indigo-500',
    soft: 'border-fuchsia-300/50 bg-fuchsia-50/80 text-fuchsia-700',
    active: 'border-fuchsia-300/80 bg-gradient-to-br from-fuchsia-50 via-white to-indigo-50 shadow-fuchsia-200/60',
    rgb: '217 70 239',
    rgb2: '99 102 241',
  },
  {
    avatar: 'from-cyan-400 via-sky-500 to-blue-600',
    soft: 'border-cyan-300/50 bg-cyan-50/80 text-cyan-700',
    active: 'border-cyan-300/80 bg-gradient-to-br from-cyan-50 via-white to-blue-50 shadow-cyan-200/60',
    rgb: '34 211 238',
    rgb2: '37 99 235',
  },
  {
    avatar: 'from-emerald-400 via-teal-500 to-cyan-600',
    soft: 'border-emerald-300/50 bg-emerald-50/80 text-emerald-700',
    active: 'border-emerald-300/80 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 shadow-emerald-200/60',
    rgb: '52 211 153',
    rgb2: '8 145 178',
  },
  {
    avatar: 'from-amber-400 via-orange-500 to-rose-500',
    soft: 'border-amber-300/50 bg-amber-50/80 text-amber-700',
    active: 'border-amber-300/80 bg-gradient-to-br from-amber-50 via-white to-rose-50 shadow-amber-200/60',
    rgb: '251 191 36',
    rgb2: '244 63 94',
  },
];

const getChatAccent = (value = '') => {
  const source = String(value || '');
  const total = source.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return CHAT_ACCENTS[total % CHAT_ACCENTS.length];
};

const getInitials = (value = '') => {
  const words = String(value || 'Ученик')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const chars = words.length >= 2
    ? [words[0][0], words[1][0]]
    : [words[0]?.[0], words[0]?.[1]];
  return chars.filter(Boolean).join('').toUpperCase() || 'У';
};

const getChatProfileLeagueIconClassName = (leagueId, size = 'default') => {
  if (leagueId === 'blank') {
    return size === 'sm' ? 'h-8 w-8' : 'h-[2.35rem] w-[2.35rem]';
  }

  if (leagueId === 'celestial') {
    if (size === 'sm') return 'h-10 w-10 max-w-none scale-[1.12]';
    if (size === 'md') return 'h-[2.8rem] w-[2.8rem] max-w-none scale-[1.22]';
    return 'h-12 w-12 max-w-none scale-[1.24]';
  }

  if (size === 'sm') return 'h-10 w-10 max-w-none scale-[1.12]';
  if (size === 'md') return 'h-11 w-11 max-w-none scale-[1.16]';
  return 'h-12 w-12 max-w-none scale-[1.2]';
};

const getMessageSenderName = (message, fallbackSenderName, own = false) => {
  if (own) return 'Вы';
  const senderName = String(message?.senderName || fallbackSenderName || '').trim();
  return senderName || 'Ученик';
};

const getMessageAvatarName = (message, fallbackSenderName, own = false) => {
  const senderName = String(message?.senderName || '').trim();
  const fallbackName = String(fallbackSenderName || '').trim();
  return senderName || fallbackName || (own ? 'Вы' : 'Ученик');
};

const ChatMessages = ({
  listRef,
  messages,
  loading,
  hasMoreBefore = false,
  olderLoading = false,
  onLoadOlder = null,
  emptyText,
  emptyTitle = 'Пока тихо',
  EmptyIcon = MessageSquare,
  isMine,
  fallbackSenderName,
  onOpenImage = null,
  onOpenSenderProfile = null,
  onEditMessage = null,
  onDeleteMessage = null,
  onReactMessage = null,
  onReplyMessage = null,
  onForwardMessage = null,
  onPinMessage = null,
  canDeleteSystemMessage = null,
  onEnsureMessageLoaded = null,
  openReferenceRequest = null,
  pinnedMessageId = '',
  pinnedMessage = null,
  onPinnedCancel = null,
  onPinnedOpen = null,
  chatKind = '',
  menuActions = [],
  drawerInfo = null,
  headerContent = null,
}) => {
  const [editingMessageId, setEditingMessageId] = useState('');
  const [editingText, setEditingText] = useState('');
  const [busyMessageAction, setBusyMessageAction] = useState('');
  const [confirmingDeleteMessageId, setConfirmingDeleteMessageId] = useState('');
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState('');
  const [busyReactionKey, setBusyReactionKey] = useState('');
  const [reactionBurst, setReactionBurst] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [selectionDeleteConfirm, setSelectionDeleteConfirm] = useState(false);
  const [selectionActionBusy, setSelectionActionBusy] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [contentFilter, setContentFilter] = useState('all');
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const reactionBurstTimerRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const highlightFrameRef = useRef(null);
  const highlightDelayTimerRef = useRef(null);

  const contentCounts = useMemo(() => getChatContentCounts(messages), [messages]);
  const visibleMessages = useMemo(
    () => getVisibleChatMessages(messages, searchQuery, contentFilter),
    [contentFilter, messages, searchQuery]
  );
  const selectedMessageIdSet = useMemo(() => new Set(selectedMessageIds), [selectedMessageIds]);
  const selectedMessages = useMemo(() => (
    selectedMessageIds
      .map((id) => messages.find((message) => String(message?.id || '').trim() === id))
      .filter(Boolean)
  ), [messages, selectedMessageIds]);
  const selectedDeletableMessages = useMemo(() => selectedMessages.filter((message) => (
    isMine(message) && typeof onDeleteMessage === 'function' && isMessageDeleteAllowed(message)
  )), [isMine, onDeleteMessage, selectedMessages]);
  const canDeleteSelectedMessages = selectedMessages.length > 0
    && selectedDeletableMessages.length === selectedMessages.length
    && !selectionActionBusy;
  const canForwardSelectedMessages = selectedMessages.length > 0
    && typeof onForwardMessage === 'function'
    && !selectionActionBusy;
  const canDeleteSystemMessageNow = useCallback((message) => (
    typeof canDeleteSystemMessage === 'function' && canDeleteSystemMessage(message)
  ), [canDeleteSystemMessage]);

  const clearMessageSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
    setSelectionDeleteConfirm(false);
    setSelectionActionBusy('');
  }, []);

  const toggleMessageSelected = useCallback((message) => {
    const id = String(message?.id || '').trim();
    if (!id) return;
    setSelectionMode(true);
    setSelectionDeleteConfirm(false);
    setSelectedMessageIds((current) => {
      const exists = current.includes(id);
      const next = exists ? current.filter((item) => item !== id) : [...current, id];
      if (next.length === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const startMessageSelection = useCallback((message) => {
    const id = String(message?.id || '').trim();
    if (!id) return;
    setMessageContextMenu(null);
    setReactionPickerMessageId('');
    setConfirmingDeleteMessageId('');
    setEditingMessageId('');
    setEditingText('');
    setSelectionMode(true);
    setSelectionDeleteConfirm(false);
    setSelectedMessageIds([id]);
  }, []);

  const forwardSelectedMessages = useCallback(() => {
    if (!canForwardSelectedMessages) return;
    onForwardMessage(selectedMessages);
    clearMessageSelection();
  }, [canForwardSelectedMessages, clearMessageSelection, onForwardMessage, selectedMessages]);

  const deleteSelectedMessages = useCallback(async () => {
    if (!canDeleteSelectedMessages) return;
    setSelectionActionBusy('delete');
    try {
      for (const message of selectedDeletableMessages) {
        await onDeleteMessage(message);
      }
      clearMessageSelection();
    } catch {
      setSelectionActionBusy('');
    }
  }, [canDeleteSelectedMessages, clearMessageSelection, onDeleteMessage, selectedDeletableMessages]);

  const updateScrollToBottomButton = useCallback((node) => {
    const nextVisible = shouldShowChatScrollBottomButton(node);
    setShowScrollToBottom((current) => (current === nextVisible ? current : nextVisible));
  }, []);

  const scrollToBottom = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    scrollChatNodeToBottom(node);
    setShowScrollToBottom(false);
  }, [listRef]);

  const handleScroll = (event) => {
    const node = event.currentTarget;
    setMessageContextMenu(null);
    setReactionPickerMessageId('');
    updateScrollToBottomButton(node);
    if (!hasMoreBefore || olderLoading || loading || typeof onLoadOlder !== 'function') return;
    if (node.scrollTop <= 96) {
      onLoadOlder();
    }
  };

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      setShowScrollToBottom(false);
      return undefined;
    }
    updateScrollToBottomButton(node);
    if (typeof window === 'undefined' || !window.requestAnimationFrame) return undefined;
    const frameId = window.requestAnimationFrame(() => updateScrollToBottomButton(node));
    return () => {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(frameId);
    };
  }, [listRef, loading, olderLoading, messages.length, updateScrollToBottomButton, visibleMessages.length]);

  useEffect(() => {
    if (!messageContextMenu && !reactionPickerMessageId) return undefined;
    const close = () => {
      setMessageContextMenu(null);
      setReactionPickerMessageId('');
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', close);
    };
  }, [messageContextMenu, reactionPickerMessageId]);

  useEffect(() => () => {
    if (reactionBurstTimerRef.current) clearTimeout(reactionBurstTimerRef.current);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    if (highlightDelayTimerRef.current) clearTimeout(highlightDelayTimerRef.current);
    if (highlightFrameRef.current && typeof window !== 'undefined' && window.cancelAnimationFrame) {
      window.cancelAnimationFrame(highlightFrameRef.current);
    }
  }, []);

  const highlightMessage = useCallback((messageId) => {
    const id = String(messageId || '').trim();
    if (!id) return;
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    if (highlightFrameRef.current && typeof window !== 'undefined' && window.cancelAnimationFrame) {
      window.cancelAnimationFrame(highlightFrameRef.current);
      highlightFrameRef.current = null;
    }
    const playHighlight = () => {
      const element = getChatMessageElement(listRef.current, id);
      if (element) {
        element.classList.remove('chat-message-target--active');
        // Restart the CSS animation even when the same referenced message is opened twice.
        void element.offsetWidth;
        element.classList.add('chat-message-target--active');
      }
      setHighlightedMessageId(id);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedMessageId('');
        element?.classList.remove('chat-message-target--active');
      }, CHAT_TARGET_HIGHLIGHT_DURATION_MS);
    };
    setHighlightedMessageId('');
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      highlightFrameRef.current = window.requestAnimationFrame(() => {
        highlightFrameRef.current = null;
        playHighlight();
      });
      return;
    }
    setTimeout(playHighlight, 0);
  }, [listRef]);

  const highlightMessageAfterScroll = useCallback((messageId, delayMs = CHAT_TARGET_HIGHLIGHT_DELAY_MS) => {
    const id = String(messageId || '').trim();
    if (!id) return;
    if (highlightDelayTimerRef.current) clearTimeout(highlightDelayTimerRef.current);
    const normalizedDelay = Math.min(820, Math.max(0, Number(delayMs) || CHAT_TARGET_HIGHLIGHT_DELAY_MS));
    highlightDelayTimerRef.current = setTimeout(() => {
      highlightDelayTimerRef.current = null;
      highlightMessage(id);
    }, normalizedDelay);
  }, [highlightMessage]);

  const openReferencedMessage = useCallback(async (reference) => {
    const targetId = String(reference?.messageId || reference?.id || '').trim();
    if (!targetId) return;
    setMessageContextMenu(null);
    setReactionPickerMessageId('');
    setConfirmingDeleteMessageId('');
    setSearchQuery('');
    setContentFilter('all');

    await waitForChatPaint();
    let element = getChatMessageElement(listRef.current, targetId);
    if (!element && typeof onEnsureMessageLoaded === 'function') {
      await onEnsureMessageLoaded(targetId);
      await waitForChatPaint();
      element = getChatMessageElement(listRef.current, targetId);
    }
    if (!element) {
      await waitForChatPaint();
      element = getChatMessageElement(listRef.current, targetId);
    }
    if (!element) return;
    const highlightDelay = scrollChatMessageIntoView(element, listRef.current);
    highlightMessageAfterScroll(targetId, highlightDelay);
  }, [highlightMessageAfterScroll, listRef, onEnsureMessageLoaded]);

  useEffect(() => {
    if (!openReferenceRequest?.messageId) return;
    void openReferencedMessage(openReferenceRequest);
  }, [openReferenceRequest, openReferencedMessage]);

  const triggerReactionBurst = (messageId, emoji) => {
    if (reactionBurstTimerRef.current) clearTimeout(reactionBurstTimerRef.current);
    setReactionBurst({ messageId, emoji, key: `${messageId}:${emoji}:${Date.now()}` });
    reactionBurstTimerRef.current = setTimeout(() => setReactionBurst(null), 900);
  };

  const startEditMessage = (message) => {
    const id = String(message?.id || '').trim();
    if (!id) return;
    setConfirmingDeleteMessageId('');
    setReactionPickerMessageId('');
    setEditingMessageId(id);
    setEditingText(String(message?.text || ''));
  };

  const cancelEditMessage = () => {
    setEditingMessageId('');
    setEditingText('');
  };

  const submitEditMessage = async (message) => {
    const id = String(message?.id || '').trim();
    const nextText = editingText.trim();
    if (!id || !nextText || typeof onEditMessage !== 'function') return;
    if (nextText === String(message?.text || '').trim()) {
      cancelEditMessage();
      return;
    }
    setBusyMessageAction(`edit:${id}`);
    try {
      await onEditMessage(message, nextText);
      cancelEditMessage();
      setConfirmingDeleteMessageId('');
    } catch {
      // Parent callbacks already expose the error in the chat panel.
    } finally {
      setBusyMessageAction('');
    }
  };

  const deleteMessage = async (message) => {
    const id = String(message?.id || '').trim();
    const canDeleteSystem = canDeleteSystemMessageNow(message);
    if (!id || typeof onDeleteMessage !== 'function') return;
    if (!canDeleteSystem && !isMessageDeleteAllowed(message)) return;
    setBusyMessageAction(`delete:${id}`);
    try {
      await onDeleteMessage(message);
      if (editingMessageId === id) cancelEditMessage();
      setConfirmingDeleteMessageId('');
    } catch {
      // Parent callbacks already expose the error in the chat panel.
    } finally {
      setBusyMessageAction('');
    }
  };

  const requestDeleteMessage = (message) => {
    const id = String(message?.id || '').trim();
    if (!id || (!canDeleteSystemMessageNow(message) && !isMessageDeleteAllowed(message))) return;
    setEditingMessageId('');
    setEditingText('');
    setMessageContextMenu(null);
    setReactionPickerMessageId('');
    setConfirmingDeleteMessageId(id);
  };

  const toggleReaction = async (message, emoji) => {
    const id = String(message?.id || '').trim();
    const normalizedEmoji = String(emoji || '').trim();
    if (isMine(message)) return;
    if (!id || !normalizedEmoji || typeof onReactMessage !== 'function') return;
    const busyKey = `${id}:${normalizedEmoji}`;
    setBusyReactionKey(busyKey);
    setConfirmingDeleteMessageId('');
    setEditingMessageId('');
    setEditingText('');
    setMessageContextMenu(null);
    try {
      await onReactMessage(message, normalizedEmoji);
      triggerReactionBurst(id, normalizedEmoji);
      setReactionPickerMessageId('');
    } catch {
      // Parent callbacks already expose the error in the chat panel.
    } finally {
      setBusyReactionKey('');
    }
  };

  const openMessageContextMenu = (event, message) => {
    event.preventDefault();
    event.stopPropagation();
    const id = String(message?.id || '').trim();
    if (!id) return;
    const position = getMessageContextMenuPosition(event);
    setEditingMessageId('');
    setEditingText('');
    setConfirmingDeleteMessageId('');
    setReactionPickerMessageId('');
    setMessageContextMenu({
      messageId: id,
      x: position.x,
      y: position.y,
    });
  };

  const contextMenuMessage = messageContextMenu
    ? messages.find((message) => String(message?.id || '').trim() === messageContextMenu.messageId)
    : null;
  const contextMenuOwn = Boolean(contextMenuMessage && isMine(contextMenuMessage));
  const contextMenuSystemPin = Boolean(contextMenuMessage && isPinAnnouncementMessage(contextMenuMessage));
  const contextMenuCanDeleteSystem = Boolean(contextMenuSystemPin && canDeleteSystemMessageNow(contextMenuMessage));
  const contextMenuCanReact = Boolean(
    contextMenuMessage
      && !contextMenuOwn
      && !contextMenuSystemPin
      && typeof onReactMessage === 'function'
      && String(contextMenuMessage?.id || '').trim()
  );
  const contextMenuReactedEmojis = new Set(
    contextMenuCanReact
      ? normalizeMessageReactions(contextMenuMessage)
        .filter((reaction) => reaction.reactedByMe)
        .map((reaction) => reaction.emoji)
      : []
  );
  const contextMenuReadReceipts = contextMenuMessage ? normalizeMessageReadReceipts(contextMenuMessage) : [];
  const contextMenuShowReadReceipts = Boolean(
    contextMenuOwn
      && chatKind === 'group'
      && !contextMenuSystemPin
  );
  const closeContextMenu = () => setMessageContextMenu(null);

  useEffect(() => {
    if (!selectionMode) return;
    const liveIds = new Set(messages.map((message) => String(message?.id || '').trim()).filter(Boolean));
    setSelectedMessageIds((current) => {
      const next = current.filter((id) => liveIds.has(id));
      if (next.length === current.length) return current;
      if (next.length === 0) setSelectionMode(false);
      return next;
    });
  }, [messages, selectionMode]);

  const topTools = (
    <ChatMessageTopTools
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      contentFilter={contentFilter}
      onContentFilterChange={setContentFilter}
      counts={contentCounts}
      menuActions={menuActions}
      drawerInfo={drawerInfo}
      pinnedMessage={pinnedMessage}
      onPinnedOpen={onPinnedOpen}
    />
  );

  return (
    <div className="student-chat-messages-shell flex min-h-0 flex-1 flex-col">
      {headerContent ? (
        <div className="student-chat-message-top-row">
          <div className="student-chat-message-top-main">{headerContent}</div>
          {topTools}
        </div>
      ) : topTools}
      {selectionMode && (
        <div className="student-message-selection-bar" data-message-menu-ignore="true">
          <div className="student-message-selection-count">
            <span>{selectedMessages.length}</span>
            <strong>Выбрано</strong>
          </div>
          <div className="student-message-selection-actions">
            {selectionDeleteConfirm ? (
              <>
                <span className="student-message-selection-confirm">Удалить?</span>
                <button
                  type="button"
                  className="student-message-selection-action student-message-selection-action--danger"
                  onClick={() => {
                    void deleteSelectedMessages();
                  }}
                  disabled={!canDeleteSelectedMessages}
                  aria-label="Удалить"
                  title="Удалить"
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  className="student-message-selection-action"
                  onClick={() => setSelectionDeleteConfirm(false)}
                  disabled={Boolean(selectionActionBusy)}
                  aria-label="Отмена"
                  title="Отмена"
                >
                  <X size={15} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="student-message-selection-action"
                  onClick={forwardSelectedMessages}
                  disabled={!canForwardSelectedMessages}
                  aria-label="Переслать"
                  title="Переслать"
                >
                  <Forward size={15} />
                </button>
                <button
                  type="button"
                  className="student-message-selection-action student-message-selection-action--danger"
                  onClick={() => setSelectionDeleteConfirm(true)}
                  disabled={!canDeleteSelectedMessages}
                  aria-label="Удалить"
                  title="Удалить"
                >
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  className="student-message-selection-action"
                  onClick={clearMessageSelection}
                  disabled={Boolean(selectionActionBusy)}
                  aria-label="Сбросить"
                  title="Сбросить"
                >
                  <X size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="student-chat-messages-wrap min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="student-chat-messages h-full min-h-0 space-y-3.5 overflow-y-auto rounded-[1.35rem] border border-slate-200/80 p-3 pb-4"
        >
    {pinnedMessage && (
      <div className="student-chat-pinned-message-row" data-message-menu-ignore="true">
        <MessageReferenceCard
          reference={pinnedMessage}
          type="pin"
          compact
          onCancel={typeof onPinnedCancel === 'function' ? () => onPinnedCancel(pinnedMessage) : null}
          onOpenTarget={typeof onPinnedOpen === 'function' ? onPinnedOpen : null}
        />
      </div>
    )}
    {olderLoading && !loading && (
      <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-cyan-200/70 bg-cyan-50/90 px-3 py-1.5 text-[11px] font-black text-cyan-700 shadow-sm">
        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
        Загрузка...
      </div>
    )}
    {loading ? (
      <div className="student-message-loading space-y-3 py-1" aria-label="Загрузка сообщений">
        {[
          { id: 'left-1', own: false, metaWidth: 118, bubbleWidth: 170 },
          { id: 'right-1', own: true, metaWidth: 88, bubbleWidth: 220 },
          { id: 'left-2', own: false, metaWidth: 96, bubbleWidth: 132 },
        ].map((item) => (
          <div
            key={item.id}
            className={`student-message-skeleton-row flex items-start gap-2.5 ${item.own ? 'justify-end' : 'justify-start'}`}
          >
            {!item.own && <div className="student-message-skeleton-avatar mt-5" />}
            <div className={`flex flex-col ${item.own ? 'items-end' : 'items-start'}`}>
              <div
                className="student-message-skeleton-meta mb-1.5"
                style={{ width: item.metaWidth }}
              />
              <div
                className="student-message-skeleton-bubble"
                style={{ width: item.bubbleWidth }}
              />
            </div>
            {item.own && <div className="student-message-skeleton-avatar mt-5" />}
          </div>
        ))}
      </div>
    ) : messages.length === 0 ? (
      <div className="flex h-full min-h-[160px] items-center justify-center">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-purple-200/70 bg-gradient-to-br from-purple-500 via-fuchsia-500 to-cyan-400 text-white shadow-lg shadow-purple-200/60">
            {React.createElement(EmptyIcon, { size: 24 })}
          </div>
          <div className="mt-3 text-base font-extrabold text-slate-900">{emptyTitle}</div>
          <div className="mt-1 text-sm text-slate-500">{emptyText}</div>
        </div>
      </div>
    ) : visibleMessages.length === 0 ? (
      <div className="flex h-full min-h-[160px] items-center justify-center">
        <div className="max-w-sm text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-cyan-200/70 bg-cyan-50/90 text-cyan-600 shadow-sm">
            <Search size={20} />
          </div>
          <div className="mt-3 text-base font-extrabold text-slate-900">Ничего не найдено</div>
        </div>
      </div>
    ) : (
      visibleMessages.map((message) => {
        const messageId = String(message?.id || '').trim();
        if (message?.senderRole === 'system' || message?.systemType) {
          const canDeleteSystem = canDeleteSystemMessageNow(message);
          return (
            <div
              key={message.id}
              data-chat-message-id={messageId}
              className="student-message-system-row"
              onContextMenu={canDeleteSystem ? (event) => openMessageContextMenu(event, message) : undefined}
            >
              <span className="student-message-system-pill">{String(message?.text || '')}</span>
            </div>
          );
        }
        const own = isMine(message);
        const messageText = String(message?.text || '');
        const canEditMessage = Boolean(own && messageId && messageText.trim() && typeof onEditMessage === 'function');
        const canDeleteMessage = Boolean(own && messageId && typeof onDeleteMessage === 'function' && isMessageDeleteAllowed(message));
        const canReplyMessage = Boolean(messageId && typeof onReplyMessage === 'function');
        const canForwardMessage = Boolean(messageId && typeof onForwardMessage === 'function');
        const isEditingMessage = editingMessageId === messageId;
        const selected = selectedMessageIdSet.has(messageId);
        const editBusy = busyMessageAction === `edit:${messageId}`;
        const deleteBusy = busyMessageAction === `delete:${messageId}`;
        const isConfirmingDelete = confirmingDeleteMessageId === messageId;
        const reactions = normalizeMessageReactions(message);
        const canReactMessage = Boolean(!own && messageId && typeof onReactMessage === 'function');
        const showMessageToolbar = Boolean(
          !isEditingMessage
          && (canEditMessage || canDeleteMessage || canReactMessage || canReplyMessage || canForwardMessage || reactions.length > 0)
        );
        const messageImageDataUrl = String(message?.imageDataUrl || '').trim();
        const messageImageName = String(message?.imageName || '').trim();
        const messageFileDataUrl = String(message?.fileDataUrl || '').trim();
        const messageFileName = String(message?.fileName || '').trim();
        const messageFileMimeType = normalizeAttachmentMimeType(message?.fileMimeType || getDataUrlMimeType(messageFileDataUrl));
        const messageFileSizeText = formatFileSize(message?.fileSize);
        const renderedImageDataUrl = messageImageDataUrl || (messageFileMimeType.startsWith('image/') ? messageFileDataUrl : '');
        const renderedImageName = messageImageDataUrl ? messageImageName : messageFileName;
        const renderedFileDataUrl = renderedImageDataUrl === messageFileDataUrl ? '' : messageFileDataUrl;
        const isTextOnlyForward = Boolean(message?.forwardFrom && messageText.trim() && !renderedImageDataUrl && !renderedFileDataUrl);
        const shouldRenderMessageText = Boolean(messageText && !isTextOnlyForward);
        const senderName = getMessageSenderName(message, fallbackSenderName, own);
        const avatarName = getMessageAvatarName(message, fallbackSenderName, own);
        const avatarDataUrl = String(message?.senderAvatarDataUrl || '').trim();
        const accent = getChatAccent(message?.senderId || avatarName);
        const senderOnline = message?.senderOnline === true || message?.isOnline === true;
        const senderStudentId = String(message?.senderId || '').trim();
        const canOpenSenderProfile = Boolean(
          senderStudentId
          && message?.senderRole === 'student'
          && typeof onOpenSenderProfile === 'function'
        );
        const messageAccentStyle = {
          '--student-message-accent': accent.rgb || '34 211 238',
          '--student-message-accent-2': accent.rgb2 || '168 85 247',
        };
        const avatarClassName = `student-message-avatar mt-6 grid h-9 w-9 shrink-0 place-items-center rounded-[0.95rem] bg-gradient-to-br ${accent.avatar} text-[11px] font-black text-white shadow-lg shadow-slate-300/40 ${senderOnline ? 'student-message-avatar--online' : ''}`;
        const avatar = canOpenSenderProfile ? (
          <button
            type="button"
            className={`${avatarClassName} student-message-avatar--profile border-0 p-0`}
            onClick={() => onOpenSenderProfile({
              studentId: senderStudentId,
              displayName: avatarName,
              message,
            })}
            title={`Открыть профиль: ${avatarName}`}
            aria-label={`Открыть профиль: ${avatarName}`}
          >
            {avatarDataUrl ? (
              <img src={avatarDataUrl} alt={avatarName} className="h-full w-full rounded-[inherit] object-cover" />
            ) : getInitials(avatarName)}
          </button>
        ) : (
          <div
            className={avatarClassName}
            aria-hidden="true"
          >
            {avatarDataUrl ? (
              <img src={avatarDataUrl} alt={avatarName} className="h-full w-full rounded-[inherit] object-cover" />
            ) : getInitials(avatarName)}
          </div>
        );
        return (
          <div
            key={message.id}
            data-chat-message-id={messageId}
            className={`student-message-row flex items-start gap-2.5 ${own ? 'justify-end' : 'justify-start'} ${highlightedMessageId === messageId ? 'student-message-row--highlighted' : ''} ${selectionMode ? 'student-message-row--selecting' : ''} ${selected ? 'student-message-row--selected' : ''}`}
            onContextMenu={(event) => openMessageContextMenu(event, message)}
          >
            {!own && avatar}
            <div
              className={`flex max-w-[min(78%,_42rem)] flex-col ${own ? 'items-end' : 'items-start'}`}
              style={messageAccentStyle}
            >
              <div className={`student-message-meta ${own ? 'student-message-meta--mine' : 'student-message-meta--other'} mb-1 flex items-center gap-1.5 px-1 text-[10.5px] font-bold leading-none`}>
                <span>
                  {senderName}
                </span>
                <span className="student-message-time">
                  {formatTime(message?.createdAt)}
                </span>
              </div>
              <div
                className={`student-message-bubble relative overflow-hidden rounded-[1.15rem] border px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${isEditingMessage ? 'student-message-bubble--editing' : ''} ${selected ? 'student-message-bubble--selected' : ''} ${
                  own
                    ? 'student-message-bubble--mine student-message-bubble--with-status text-white'
                    : 'student-message-bubble--other text-slate-800'
                }`}
                onClick={(event) => {
                  if (selectionMode) {
                    if (isEditingMessage || shouldIgnoreMessagePrimaryClick(event)) return;
                    toggleMessageSelected(message);
                    return;
                  }
                  if (isEditingMessage || shouldIgnoreMessagePrimaryClick(event)) return;
                  openMessageContextMenu(event, message);
                }}
              >
                {message?.forwardFrom && (
                  <MessageReferenceCard reference={message.forwardFrom} type="forward" mine={own} />
                )}
                {message?.replyTo && (
                  <MessageReferenceCard reference={message.replyTo} type="reply" mine={own} onOpenTarget={openReferencedMessage} />
                )}
                {renderedImageDataUrl && (
                  <button
                    type="button"
                    onClick={() => onOpenImage?.({
                      src: renderedImageDataUrl,
                      name: renderedImageName || messageImageName || 'Изображение',
                    })}
                    className={`student-message-image-trigger mb-2 block w-full overflow-hidden rounded-2xl border text-left ${
                      own ? 'border-white/20 bg-white/10' : 'border-slate-200 bg-slate-950/5'
                    }`}
                    title={renderedImageName || messageImageName || 'Открыть изображение'}
                  >
                    <img
                      src={renderedImageDataUrl}
                      alt={renderedImageName || messageImageName || 'Изображение'}
                      className="max-h-[240px] w-full object-contain"
                      loading="lazy"
                    />
                    {renderedImageName && (
                      <span className={`block truncate px-3 py-2 text-[11px] font-bold ${own ? 'text-white/80' : 'text-slate-500'}`}>
                        {renderedImageName}
                      </span>
                    )}
                  </button>
                )}
                {renderedFileDataUrl && (
                  <a
                    href={renderedFileDataUrl}
                    download={messageFileName || undefined}
                    className={`student-message-file mb-2 flex items-center gap-2 rounded-2xl border px-3 py-2.5 ${
                      own ? 'border-white/20 bg-white/12 text-white' : 'border-slate-200 bg-white/75 text-slate-800'
                    }`}
                    title={messageFileName || 'Скачать файл'}
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                      own ? 'bg-white/14 text-white' : 'bg-cyan-50 text-cyan-600'
                    }`}>
                      <FileText size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black">
                        {messageFileName || 'Файл'}
                      </span>
                      {(messageFileSizeText || messageFileMimeType) && (
                        <span className={`mt-0.5 block truncate text-[10.5px] font-bold ${own ? 'text-white/72' : 'text-slate-500'}`}>
                          {[messageFileSizeText, messageFileMimeType].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                  </a>
                )}
                {isEditingMessage ? (
                  <form
                    className="student-message-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitEditMessage(message);
                    }}
                  >
                    <textarea
                      value={editingText}
                      onChange={(event) => setEditingText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelEditMessage();
                        }
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void submitEditMessage(message);
                        }
                      }}
                      className="student-message-edit-textarea"
                      rows={Math.min(5, Math.max(2, editingText.split('\n').length))}
                      autoFocus
                    />
                    <div className="student-message-edit-actions">
                      <button
                        type="button"
                        className="student-message-edit-button student-message-edit-button--ghost"
                        onClick={cancelEditMessage}
                        disabled={editBusy}
                        aria-label="Отменить"
                        title="Отменить"
                      >
                        <X size={14} />
                      </button>
                      <button
                        type="button"
                        className="student-message-edit-button student-message-edit-button--save"
                        onClick={() => {
                          void submitEditMessage(message);
                        }}
                        disabled={editBusy || !editingText.trim()}
                        aria-label="Сохранить"
                        title="Сохранить"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </form>
                ) : shouldRenderMessageText && (
                  <LinkifiedText
                    text={messageText}
                    className="whitespace-pre-wrap break-words"
                    linkClassName={own ? 'underline decoration-white/70 underline-offset-2' : 'text-cyan-600 underline decoration-cyan-300 underline-offset-2'}
                  />
                )}
                {own && <MessageDeliveryStatus message={message} />}
              </div>
              {showMessageToolbar && (
                <div className={`student-message-toolbar ${own ? 'student-message-toolbar--mine' : 'student-message-toolbar--other'}`}>
                  <div className={`student-message-reaction-strip ${own ? 'student-message-reaction-strip--mine' : 'student-message-reaction-strip--other'}`}>
                    {reactionBurst?.messageId === messageId && (
                      <span key={reactionBurst.key} className="student-message-reaction-burst" aria-hidden="true">
                        <span className="student-message-reaction-burst__halo" />
                        <span className="student-message-reaction-burst__emoji">{reactionBurst.emoji}</span>
                        {[0, 1, 2, 3, 4, 5].map((index) => (
                          <span key={index} className={`student-message-reaction-burst__spark student-message-reaction-burst__spark--${index}`} />
                        ))}
                      </span>
                    )}
                    {reactions.map((reaction) => (
                      <button
                        key={reaction.emoji}
                        type="button"
                        className={`student-message-reaction-pill ${reaction.reactedByMe ? 'student-message-reaction-pill--mine' : ''}`}
                        onClick={canReactMessage ? () => toggleReaction(message, reaction.emoji) : undefined}
                        disabled={!canReactMessage || Boolean(busyReactionKey)}
                        title={`${reaction.emoji} ${reaction.count}`}
                        aria-label={`Reaction ${reaction.emoji}`}
                      >
                        <span>{reaction.emoji}</span>
                        <strong>{reaction.count}</strong>
                      </button>
                    ))}
                    {canReactMessage && (
                      <span className={`student-message-reaction-wrap ${own ? 'student-message-reaction-wrap--mine' : 'student-message-reaction-wrap--other'}`}>
                        <button
                          type="button"
                          className={`student-message-reaction-add ${reactionPickerMessageId === messageId ? 'student-message-reaction-add--active' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setMessageContextMenu(null);
                            setReactionPickerMessageId((current) => (current === messageId ? '' : messageId));
                          }}
                          disabled={Boolean(busyReactionKey)}
                          title="Reaction"
                          aria-label="Reaction"
                        >
                          <SmilePlus size={12} />
                        </button>
                        {reactionPickerMessageId === messageId && (
                          <span
                            className="student-message-reaction-picker"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {CHAT_REACTION_EMOJIS.map((emoji) => {
                              const active = reactions.some((reaction) => reaction.emoji === emoji && reaction.reactedByMe);
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  className={`student-message-reaction-option ${active ? 'student-message-reaction-option--active' : ''}`}
                                  onClick={() => toggleReaction(message, emoji)}
                                  disabled={Boolean(busyReactionKey)}
                                  aria-label={`Reaction ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              );
                            })}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  {isConfirmingDelete ? (
                    <div className="student-message-delete-confirm">
                      <span>Удалить?</span>
                      <button
                        type="button"
                        className="student-message-action-button student-message-action-button--confirm"
                        onClick={() => deleteMessage(message)}
                        disabled={Boolean(busyMessageAction)}
                        aria-label="Да"
                        title="Да"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        className="student-message-action-button"
                        onClick={() => setConfirmingDeleteMessageId('')}
                        disabled={deleteBusy}
                        aria-label="Нет"
                        title="Нет"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      {canReplyMessage && (
                        <button
                          type="button"
                          className="student-message-action-button"
                          onClick={() => {
                            setConfirmingDeleteMessageId('');
                            setReactionPickerMessageId('');
                            onReplyMessage(message);
                          }}
                          disabled={Boolean(busyMessageAction)}
                          title="Ответить"
                          aria-label="Ответить"
                        >
                          <Reply size={11} />
                        </button>
                      )}
                      {canForwardMessage && (
                        <button
                          type="button"
                          className="student-message-action-button"
                          onClick={() => {
                            setConfirmingDeleteMessageId('');
                            setReactionPickerMessageId('');
                            onForwardMessage(message);
                          }}
                          disabled={Boolean(busyMessageAction)}
                          title="Переслать"
                          aria-label="Переслать"
                        >
                          <Forward size={11} />
                        </button>
                      )}
                      {canEditMessage && (
                        <button
                          type="button"
                          className="student-message-action-button"
                          onClick={() => startEditMessage(message)}
                          disabled={Boolean(busyMessageAction)}
                          title="Редактировать"
                          aria-label="Редактировать"
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                      {canDeleteMessage && (
                        <button
                          type="button"
                          className="student-message-action-button student-message-action-button--danger"
                          onClick={() => requestDeleteMessage(message)}
                          disabled={Boolean(busyMessageAction)}
                          title="Удалить"
                          aria-label="Удалить"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            {own && avatar}
            {selectionMode && (
              <button
                type="button"
                className={`student-message-select-button ${selected ? 'student-message-select-button--active' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleMessageSelected(message);
                }}
                aria-label={selected ? 'Снять выбор' : 'Выбрать'}
                title={selected ? 'Снять выбор' : 'Выбрать'}
              >
                {selected && <Check size={13} />}
              </button>
            )}
          </div>
        );
      })
    )}
    {messageContextMenu && contextMenuMessage && typeof document !== 'undefined' && createPortal((
      <div
        className="student-message-context-menu"
        style={{
          left: messageContextMenu.x,
          top: messageContextMenu.y,
        }}
        onClick={(event) => event.stopPropagation()}
        role="menu"
      >
        {contextMenuSystemPin ? (
          <button
            type="button"
            className="student-message-context-menu__button student-message-context-menu__button--danger"
            onClick={() => {
              closeContextMenu();
              void deleteMessage(contextMenuMessage);
            }}
            disabled={!contextMenuCanDeleteSystem || typeof onDeleteMessage !== 'function' || Boolean(busyMessageAction)}
            role="menuitem"
          >
            <Trash2 size={14} />
            <span>Удалить</span>
          </button>
        ) : (
          <>
            {contextMenuShowReadReceipts ? (
              <MessageReadReceiptSummary readers={contextMenuReadReceipts} />
            ) : contextMenuCanReact && (
              <div className="student-message-context-menu__reactions" role="group" aria-label="Reactions">
                {CHAT_REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`student-message-context-menu__reaction ${contextMenuReactedEmojis.has(emoji) ? 'student-message-context-menu__reaction--active' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleReaction(contextMenuMessage, emoji);
                    }}
                    disabled={Boolean(busyReactionKey)}
                    aria-label={`Reaction ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="student-message-context-menu__button"
              onClick={() => {
                closeContextMenu();
                onReplyMessage?.(contextMenuMessage);
              }}
              disabled={typeof onReplyMessage !== 'function'}
              role="menuitem"
            >
              <Reply size={14} />
              <span>Ответить</span>
            </button>
            <button
              type="button"
              className="student-message-context-menu__button"
              onClick={() => {
                closeContextMenu();
                void copyTextToClipboard(contextMenuMessage.text);
              }}
              disabled={!String(contextMenuMessage?.text || '').trim()}
              role="menuitem"
            >
              <Copy size={14} />
              <span>Копировать</span>
            </button>
            <button
              type="button"
              className="student-message-context-menu__button"
              onClick={() => {
                closeContextMenu();
                onForwardMessage?.(contextMenuMessage);
              }}
              disabled={typeof onForwardMessage !== 'function'}
              role="menuitem"
            >
              <Forward size={14} />
              <span>Переслать</span>
            </button>
            <button
              type="button"
              className="student-message-context-menu__button"
              onClick={() => {
                startMessageSelection(contextMenuMessage);
              }}
              role="menuitem"
            >
              <Check size={14} />
              <span>Выбрать</span>
            </button>
            <button
              type="button"
              className="student-message-context-menu__button"
              onClick={() => {
                closeContextMenu();
                onPinMessage?.(contextMenuMessage);
              }}
              disabled={typeof onPinMessage !== 'function'}
              role="menuitem"
            >
              <Pin size={14} />
              <span>{String(pinnedMessageId || '') === String(contextMenuMessage?.id || '') ? 'Открепить' : 'Закрепить'}</span>
            </button>
            {contextMenuOwn && (
            <button
              type="button"
              className="student-message-context-menu__button"
              onClick={() => {
                closeContextMenu();
                startEditMessage(contextMenuMessage);
              }}
              disabled={!String(contextMenuMessage?.text || '').trim() || typeof onEditMessage !== 'function' || Boolean(busyMessageAction)}
              role="menuitem"
            >
              <Pencil size={14} />
              <span>Изменить</span>
            </button>
            )}
            {contextMenuOwn && (
            <button
              type="button"
              className="student-message-context-menu__button student-message-context-menu__button--danger"
              onClick={() => {
                closeContextMenu();
                requestDeleteMessage(contextMenuMessage);
              }}
              disabled={typeof onDeleteMessage !== 'function' || !isMessageDeleteAllowed(contextMenuMessage) || Boolean(busyMessageAction)}
              role="menuitem"
            >
              <Trash2 size={14} />
              <span>Удалить</span>
            </button>
            )}
          </>
        )}
      </div>
    ), document.body)}
        </div>
        {showScrollToBottom && (
          <button
            type="button"
            className="student-chat-scroll-bottom-button"
            onClick={scrollToBottom}
            aria-label="Вниз"
            title="Вниз"
            data-message-menu-ignore="true"
          >
            <ChevronDown size={23} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
};

const ChatImageViewer = ({ image, onClose }) => {
  const src = String(image?.src || '').trim();
  const name = String(image?.name || '').trim();

  useEffect(() => {
    if (!src) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, src]);

  if (!src) return null;

  return (
    <div
      className="student-chat-image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={name || 'Просмотр изображения'}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="student-chat-image-viewer__topbar">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{name || 'Изображение'}</p>
          <p className="text-xs font-semibold text-white/58">Полный размер</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={src}
            download={name || undefined}
            className="student-chat-image-viewer__action"
            onMouseDown={(event) => event.stopPropagation()}
          >
            Скачать
          </a>
          <button
            type="button"
            className="student-chat-image-viewer__close"
            onClick={onClose}
            aria-label="Закрыть изображение"
            title="Закрыть"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      <img
        src={src}
        alt={name || 'Изображение'}
        className="student-chat-image-viewer__image"
        onMouseDown={(event) => event.stopPropagation()}
      />
    </div>
  );
};

const ChatComposer = ({
  text,
  setText,
  imageDataUrl,
  imageName,
  fileDataUrl = '',
  fileName = '',
  fileMimeType = '',
  fileSize = 0,
  onImageSelect,
  onClearImage,
  onSend,
  sending,
  disabled = false,
  disabledText = '',
  placeholder = 'Напишите сообщение...',
  error = '',
  replyTo = null,
  onCancelReply = null,
}) => {
  const imageInputRef = useRef(null);
  const hasAttachment = Boolean(imageDataUrl || fileDataUrl);
  const canSend = !disabled && !sending && (text.trim() || hasAttachment);

  return (
    <div className="student-chat-composer mt-2 shrink-0 rounded-[1.15rem] border border-slate-200/80 p-2">
      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImageSelect(file);
          if (imageInputRef.current) imageInputRef.current.value = '';
        }}
      />
      {disabled && disabledText && (
        <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
          {disabledText}
        </div>
      )}
      {replyTo && (
        <MessageReferenceCard
          reference={replyTo}
          type="reply"
          compact
          onCancel={onCancelReply}
        />
      )}
      {hasAttachment && (
        <div className="student-chat-attachment-preview mb-2 flex items-start gap-2 rounded-xl border border-gray-200 bg-white px-2 py-2">
          {!imageDataUrl && (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-cyan-50 text-cyan-600">
              <FileText size={20} />
            </span>
          )}
          <img
            src={imageDataUrl}
            alt={imageName || 'Изображение'}
            className={`${imageDataUrl ? '' : 'hidden'} h-12 w-12 rounded-md object-cover`}
          />
          <div className="min-w-0 flex-1">
            {!imageDataUrl && (
              <>
                <p className="truncate text-xs text-gray-700">{fileName || 'Файл'}</p>
                <p className="text-[11px] text-gray-500">
                  {[formatFileSize(fileSize), fileMimeType].filter(Boolean).join(' · ') || `До ${CHAT_FILE_SIZE_LABEL}`}
                </p>
              </>
            )}
            <p className={`${imageDataUrl ? '' : 'hidden'} truncate text-xs text-gray-700`}>{imageName || 'Изображение'}</p>
            <p className={`${imageDataUrl ? '' : 'hidden'} text-[11px] text-gray-500`}>До 5 МБ</p>
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100"
            onClick={onClearImage}
            aria-label="Убрать изображение"
            title="Убрать изображение"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="student-chat-composer-row flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            if (disabled) return;
            const items = Array.from(event.clipboardData?.items || []);
            const imageItem = items.find((item) => item.kind === 'file');
            if (!imageItem) return;
            const file = imageItem.getAsFile?.();
            if (!file) return;
            event.preventDefault();
            onImageSelect(file);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
          rows={2}
          placeholder={disabled ? disabledText : placeholder}
          disabled={disabled}
          className="min-h-[52px] w-full resize-none rounded-2xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-cyan-400 focus:ring-4 focus:ring-cyan-200/50 disabled:bg-slate-100 disabled:text-slate-500"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => imageInputRef.current?.click()}
          disabled={disabled || sending}
          className="student-chat-attach-button h-[50px] min-w-[50px] rounded-2xl self-end px-0"
          title={`Добавить файл (до ${CHAT_FILE_SIZE_LABEL})`}
        >
          <Paperclip size={16} />
        </Button>
        <Button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="student-chat-send-button h-[50px] min-w-[132px] rounded-2xl self-end bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-500 shadow-lg shadow-purple-200/60"
        >
          <SendHorizontal size={16} />
          {sending ? 'Отправка...' : 'Отправить'}
        </Button>
      </div>
      {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
    </div>
  );
};

const StudentChatSection = ({
  user,
  pushSupported = false,
  pushPermission = 'default',
  pushEnabled = false,
  pushSyncing = false,
  pushBusy = false,
  pushReady = false,
  onTogglePush = null,
  onOpenDirectChat = null,
  openDirectChatRequest = null,
  onOpenDirectChatHandled = null,
  getLeagueByXp,
  getLeagueAuraStyle,
  isAbsoluteOrAboveLeague,
  ABSOLUTE_AURA_CROWN_STYLE,
  getLevelFromXp,
  getLevelProgressFromXp,
}) => {
  const [activeTab, setActiveTab] = useState('teacher');
  const [teacherChat, setTeacherChat] = useState(null);
  const [teacherMessages, setTeacherMessages] = useState([]);
  const [teacherMessagesPagination, setTeacherMessagesPagination] = useState(EMPTY_CHAT_MESSAGES_PAGINATION);
  const [teacherLoading, setTeacherLoading] = useState(true);
  const [teacherOlderLoading, setTeacherOlderLoading] = useState(false);
  const [teacherError, setTeacherError] = useState('');
  const [teacherText, setTeacherText] = useState('');
  const [teacherImageDataUrl, setTeacherImageDataUrl] = useState('');
  const [teacherImageName, setTeacherImageName] = useState('');
  const [teacherFileDataUrl, setTeacherFileDataUrl] = useState('');
  const [teacherFileName, setTeacherFileName] = useState('');
  const [teacherFileMimeType, setTeacherFileMimeType] = useState('');
  const [teacherFileSize, setTeacherFileSize] = useState(0);
  const [teacherSending, setTeacherSending] = useState(false);
  const [teacherReplyTo, setTeacherReplyTo] = useState(null);
  const [teacherReferenceRequest, setTeacherReferenceRequest] = useState(null);
  const [socialPayload, setSocialPayload] = useState(null);
  const [socialLoading, setSocialLoading] = useState(true);
  const [socialError, setSocialError] = useState('');
  const [selectedDirectChatId, setSelectedDirectChatId] = useState('');
  const [openedDirectChatDraft, setOpenedDirectChatDraft] = useState(null);
  const [socialChat, setSocialChat] = useState(null);
  const [socialMessages, setSocialMessages] = useState([]);
  const [socialMessagesPagination, setSocialMessagesPagination] = useState(EMPTY_CHAT_MESSAGES_PAGINATION);
  const [socialMessagesLoading, setSocialMessagesLoading] = useState(false);
  const [socialOlderMessagesLoading, setSocialOlderMessagesLoading] = useState(false);
  const [socialMessagesError, setSocialMessagesError] = useState('');
  const [socialText, setSocialText] = useState('');
  const [socialImageDataUrl, setSocialImageDataUrl] = useState('');
  const [socialImageName, setSocialImageName] = useState('');
  const [socialFileDataUrl, setSocialFileDataUrl] = useState('');
  const [socialFileName, setSocialFileName] = useState('');
  const [socialFileMimeType, setSocialFileMimeType] = useState('');
  const [socialFileSize, setSocialFileSize] = useState(0);
  const [socialSending, setSocialSending] = useState(false);
  const [socialReplyTo, setSocialReplyTo] = useState(null);
  const [socialReferenceRequest, setSocialReferenceRequest] = useState(null);
  const [forwardModal, setForwardModal] = useState(null);
  const [forwardBusyTarget, setForwardBusyTarget] = useState('');
  const [isDraggingChatFile, setIsDraggingChatFile] = useState(false);
  const [imageViewer, setImageViewer] = useState(null);
  const [chatProfileState, setChatProfileState] = useState({
    open: false,
    studentId: '',
    row: null,
    data: null,
    loading: false,
    error: '',
  });
  const [chatProfileDirectOpening, setChatProfileDirectOpening] = useState(false);
  const [chatProfileDirectError, setChatProfileDirectError] = useState('');
  const [notificationSettings, setNotificationSettings] = useState(null);
  const [notificationSettingsSavingKey, setNotificationSettingsSavingKey] = useState('');
  const [, setNotificationSettingsError] = useState('');
  const teacherListRef = useRef(null);
  const socialListRef = useRef(null);
  const teacherScrollBehaviorRef = useRef(null);
  const socialScrollBehaviorRef = useRef(null);
  const teacherMessagesRef = useRef([]);
  const socialMessagesRef = useRef([]);
  const teacherMessagesPaginationRef = useRef(EMPTY_CHAT_MESSAGES_PAGINATION);
  const socialMessagesPaginationRef = useRef(EMPTY_CHAT_MESSAGES_PAGINATION);
  const prevTeacherMessageCountRef = useRef(0);
  const prevSocialMessageCountRef = useRef(0);
  const dragDepthRef = useRef(0);
  const chatProfileRequestIdRef = useRef(0);

  useEffect(() => {
    teacherMessagesRef.current = teacherMessages;
  }, [teacherMessages]);

  useEffect(() => {
    socialMessagesRef.current = socialMessages;
  }, [socialMessages]);

  useEffect(() => {
    teacherMessagesPaginationRef.current = teacherMessagesPagination;
  }, [teacherMessagesPagination]);

  useEffect(() => {
    socialMessagesPaginationRef.current = socialMessagesPagination;
  }, [socialMessagesPagination]);

  const validateAndReadAttachment = useCallback(async (file) => {
    if (!file) return null;
    const mimeType = normalizeAttachmentMimeType(file.type || 'application/octet-stream');
    const isImage = CHAT_ALLOWED_IMAGE_TYPES.has(mimeType);
    if (isImage && Number(file.size) > CHAT_IMAGE_MAX_BYTES) {
      throw new Error('Изображение должно быть не больше 5 МБ.');
    }
    if (!isImage && Number(file.size) > CHAT_FILE_MAX_BYTES) {
      throw new Error(`Файл должен быть не больше ${CHAT_FILE_SIZE_LABEL}.`);
    }
    const dataUrl = await readFileAsDataUrl(file);
    return {
      dataUrl,
      name: String(file.name || '').trim(),
      mimeType: normalizeAttachmentMimeType(file.type || getDataUrlMimeType(dataUrl) || 'application/octet-stream'),
      size: Number(file.size) || 0,
      isImage,
    };
  }, []);

  const loadTeacherMessages = useCallback(async ({ silent = false, forceScroll = false } = {}) => {
    markChatScrollToBottom(teacherListRef, teacherScrollBehaviorRef, { force: !silent || forceScroll });
    if (!silent) setTeacherLoading(true);
    try {
      const payload = await api.getStudentChatMessages({ limit: CHAT_MESSAGE_PAGE_SIZE });
      const nextMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      setTeacherChat(payload?.chat || null);
      setTeacherMessages((prev) => (silent ? mergeChatMessages(prev, nextMessages) : nextMessages));
      if (!silent) {
        setTeacherMessagesPagination(getChatMessagesPagination(payload));
      }
      setTeacherError('');
    } catch (err) {
      if (!silent) setTeacherError(err?.message || String(err));
    } finally {
      if (!silent) setTeacherLoading(false);
    }
  }, []);

  const loadOlderTeacherMessages = useCallback(async () => {
    if (teacherOlderLoading || teacherLoading || !teacherMessagesPagination.hasMoreBefore || !teacherMessagesPagination.nextBefore) return;
    markChatScrollPreserve(teacherListRef, teacherScrollBehaviorRef);
    setTeacherOlderLoading(true);
    try {
      const payload = await api.getStudentChatMessages({
        limit: CHAT_MESSAGE_PAGE_SIZE,
        before: teacherMessagesPagination.nextBefore,
      });
      const olderMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      setTeacherChat(payload?.chat || null);
      setTeacherMessages((prev) => mergeChatMessages(olderMessages, prev));
      setTeacherMessagesPagination(getChatMessagesPagination(payload));
      setTeacherError('');
    } catch (err) {
      setTeacherError(err?.message || String(err));
    } finally {
      setTeacherOlderLoading(false);
    }
  }, [teacherLoading, teacherMessagesPagination, teacherOlderLoading]);

  const loadSocialChats = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setSocialLoading(true);
    try {
      const payload = await api.getStudentSocialChats();
      setSocialPayload(payload || null);
      if (payload?.notificationSettings) {
        setNotificationSettings(payload.notificationSettings);
      }
      setSocialError('');
    } catch (err) {
      if (!silent) setSocialError(err?.message || String(err));
    } finally {
      if (!silent) setSocialLoading(false);
    }
  }, []);

  const loadNotificationSettings = useCallback(async () => {
    try {
      const payload = await api.getStudentChatNotificationSettings();
      setNotificationSettings(payload?.settings || {});
      setNotificationSettingsError('');
      return payload?.settings || {};
    } catch (err) {
      setNotificationSettingsError(err?.message || String(err));
      return null;
    }
  }, []);

  const loadChatProfile = useCallback(async (studentId, row = {}) => {
    const normalizedStudentId = String(studentId || '').trim();
    if (!normalizedStudentId) return;
    const displayName = String(row?.displayName || row?.senderName || row?.name || 'Профиль ученика').trim() || 'Профиль ученика';
    const requestId = chatProfileRequestIdRef.current + 1;
    chatProfileRequestIdRef.current = requestId;
    setChatProfileDirectOpening(false);
    setChatProfileDirectError('');
    setChatProfileState({
      open: true,
      studentId: normalizedStudentId,
      row: {
        studentId: normalizedStudentId,
        displayName,
      },
      data: null,
      loading: true,
      error: '',
    });
    try {
      const profile = await api.getLeaderboardStudentProfile(normalizedStudentId);
      if (chatProfileRequestIdRef.current !== requestId) return;
      setChatProfileState((prev) => ({
        ...prev,
        data: profile,
        loading: false,
        error: '',
      }));
    } catch (err) {
      if (chatProfileRequestIdRef.current !== requestId) return;
      setChatProfileState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || 'Не удалось загрузить профиль.',
      }));
    }
  }, []);

  const handleOpenSenderProfile = useCallback((payload = {}) => {
    const studentId = String(payload?.studentId || '').trim();
    if (!studentId) return;
    void loadChatProfile(studentId, {
      displayName: payload?.displayName,
      senderName: payload?.message?.senderName,
    });
  }, [loadChatProfile]);

  const handleCloseChatProfile = useCallback(() => {
    chatProfileRequestIdRef.current += 1;
    setChatProfileDirectOpening(false);
    setChatProfileDirectError('');
    setChatProfileState((prev) => ({
      ...prev,
      open: false,
      loading: false,
      error: '',
    }));
  }, []);

  const handleRetryChatProfile = useCallback(() => {
    const studentId = String(chatProfileState.studentId || '').trim();
    if (!studentId) return;
    void loadChatProfile(studentId, chatProfileState.row || {});
  }, [chatProfileState.row, chatProfileState.studentId, loadChatProfile]);

  const handleOpenDirectChatFromProfile = useCallback(async (studentId) => {
    const normalizedStudentId = String(studentId || '').trim();
    if (!normalizedStudentId || typeof onOpenDirectChat !== 'function') return;
    setChatProfileDirectOpening(true);
    setChatProfileDirectError('');
    try {
      await onOpenDirectChat(normalizedStudentId);
      handleCloseChatProfile();
    } catch (err) {
      setChatProfileDirectError(err?.message || 'Не удалось открыть чат.');
    } finally {
      setChatProfileDirectOpening(false);
    }
  }, [handleCloseChatProfile, onOpenDirectChat]);

  useEffect(() => {
    loadTeacherMessages();
    const timerId = setInterval(() => {
      loadTeacherMessages({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timerId);
  }, [loadTeacherMessages]);

  useEffect(() => {
    loadSocialChats();
    const timerId = setInterval(() => {
      loadSocialChats({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timerId);
  }, [loadSocialChats]);

  useEffect(() => {
    void loadNotificationSettings();
  }, [loadNotificationSettings]);

  useEffect(() => {
    const savedDirectChats = Array.isArray(socialPayload?.directChats) ? socialPayload.directChats : [];
    const draftChat = openedDirectChatDraft?.type === 'direct' ? openedDirectChatDraft : null;
    const directChats = draftChat && !savedDirectChats.some((chat) => chat.id === draftChat.id)
      ? [draftChat, ...savedDirectChats]
      : savedDirectChats;
    if (directChats.length === 0) {
      setSelectedDirectChatId((prev) => (
        prev && (
          (socialChat?.type === 'direct' && socialChat.id === prev)
          || (draftChat?.id === prev)
        )
          ? prev
          : ''
      ));
      return;
    }
    setSelectedDirectChatId((prev) => (
      prev && (
        directChats.some((chat) => chat.id === prev)
        || (socialChat?.type === 'direct' && socialChat.id === prev)
        || draftChat?.id === prev
      )
        ? prev
        : directChats[0].id
    ));
  }, [openedDirectChatDraft, socialChat, socialPayload?.directChats]);

  useEffect(() => {
    const draftId = String(openedDirectChatDraft?.id || '').trim();
    if (!draftId) return;
    const savedDirectChats = Array.isArray(socialPayload?.directChats) ? socialPayload.directChats : [];
    if (savedDirectChats.some((chat) => chat.id === draftId)) {
      setOpenedDirectChatDraft(null);
    }
  }, [openedDirectChatDraft?.id, socialPayload?.directChats]);

  const socialSettings = useMemo(() => getSocialSettings(socialPayload), [socialPayload]);
  const groupChat = socialPayload?.groupChat || null;
  const savedDirectChats = Array.isArray(socialPayload?.directChats) ? socialPayload.directChats : [];
  const directChats = useMemo(() => {
    const draftChat = openedDirectChatDraft?.type === 'direct' ? openedDirectChatDraft : null;
    if (!draftChat || savedDirectChats.some((chat) => chat.id === draftChat.id)) {
      return savedDirectChats;
    }
    return [draftChat, ...savedDirectChats];
  }, [openedDirectChatDraft, savedDirectChats]);
  const socialPeers = Array.isArray(socialPayload?.students) ? socialPayload.students : [];
  const activeSocialChatId = activeTab === 'group' ? groupChat?.id : selectedDirectChatId;
  const isSocialTab = activeTab === 'group' || activeTab === 'direct';
  const isActiveSocialEnabled = activeTab === 'group'
    ? socialSettings.groupEnabled
    : socialSettings.directEnabled;
  const resolvedNotificationSettings = notificationSettings || socialPayload?.notificationSettings || {};
  const directNotificationSettings = resolvedNotificationSettings?.directByChatId || {};
  const teacherNotificationsEnabled = resolvedNotificationSettings?.teacherEnabled !== false;
  const groupNotificationsEnabled = resolvedNotificationSettings?.groupEnabled !== false;
  const isDirectNotificationsEnabled = useCallback((chatId) => (
    directNotificationSettings?.[String(chatId || '').trim()] !== false
  ), [directNotificationSettings]);

  const loadSocialMessages = useCallback(async (chatId, { silent = false, forceScroll = false } = {}) => {
    const id = String(chatId || '').trim();
    if (!id) {
      setSocialChat(null);
      setSocialMessages([]);
      setSocialMessagesPagination(EMPTY_CHAT_MESSAGES_PAGINATION);
      return;
    }
    markChatScrollToBottom(socialListRef, socialScrollBehaviorRef, { force: !silent || forceScroll });
    if (!silent) setSocialMessagesLoading(true);
    try {
      const payload = await api.getStudentSocialChatMessages(id, { limit: CHAT_MESSAGE_PAGE_SIZE });
      const nextMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      setSocialChat(payload?.chat || null);
      setSocialMessages((prev) => (silent ? mergeChatMessages(prev, nextMessages) : nextMessages));
      if (!silent) {
        setSocialMessagesPagination(getChatMessagesPagination(payload));
      }
      setSocialMessagesError('');
    } catch (err) {
      if (!silent) setSocialMessagesError(err?.message || String(err));
    } finally {
      if (!silent) setSocialMessagesLoading(false);
    }
  }, []);

  const loadOlderSocialMessages = useCallback(async () => {
    const id = String(activeSocialChatId || '').trim();
    if (!id || socialOlderMessagesLoading || socialMessagesLoading || !socialMessagesPagination.hasMoreBefore || !socialMessagesPagination.nextBefore) return;
    markChatScrollPreserve(socialListRef, socialScrollBehaviorRef);
    setSocialOlderMessagesLoading(true);
    try {
      const payload = await api.getStudentSocialChatMessages(id, {
        limit: CHAT_MESSAGE_PAGE_SIZE,
        before: socialMessagesPagination.nextBefore,
      });
      const olderMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      setSocialChat(payload?.chat || null);
      setSocialMessages((prev) => mergeChatMessages(olderMessages, prev));
      setSocialMessagesPagination(getChatMessagesPagination(payload));
      setSocialMessagesError('');
    } catch (err) {
      setSocialMessagesError(err?.message || String(err));
    } finally {
      setSocialOlderMessagesLoading(false);
    }
  }, [activeSocialChatId, socialMessagesLoading, socialMessagesPagination, socialOlderMessagesLoading]);

  const ensureTeacherMessageLoaded = useCallback(async (messageId) => {
    const targetId = String(messageId || '').trim();
    if (!targetId) return false;
    let currentMessages = Array.isArray(teacherMessagesRef.current) ? teacherMessagesRef.current : [];
    if (currentMessages.some((message) => String(message?.id || '').trim() === targetId)) return true;
    let pagination = teacherMessagesPaginationRef.current || EMPTY_CHAT_MESSAGES_PAGINATION;
    setTeacherOlderLoading(true);
    try {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (!pagination.hasMoreBefore || !pagination.nextBefore) break;
        const payload = await api.getStudentChatMessages({
          limit: CHAT_MESSAGE_PAGE_SIZE,
          before: pagination.nextBefore,
        });
        const olderMessages = Array.isArray(payload?.messages) ? payload.messages : [];
        currentMessages = mergeChatMessages(olderMessages, currentMessages);
        pagination = getChatMessagesPagination(payload);
        teacherMessagesRef.current = currentMessages;
        teacherMessagesPaginationRef.current = pagination;
        markChatScrollPreserve(teacherListRef, teacherScrollBehaviorRef);
        setTeacherChat(payload?.chat || null);
        setTeacherMessages(currentMessages);
        setTeacherMessagesPagination(pagination);
        setTeacherError('');
        if (currentMessages.some((message) => String(message?.id || '').trim() === targetId)) return true;
        if (olderMessages.length === 0) break;
      }
    } catch (err) {
      setTeacherError(err?.message || String(err));
    } finally {
      setTeacherOlderLoading(false);
    }
    return currentMessages.some((message) => String(message?.id || '').trim() === targetId);
  }, []);

  const ensureSocialMessageLoaded = useCallback(async (messageId) => {
    const targetId = String(messageId || '').trim();
    const chatId = String(activeSocialChatId || '').trim();
    if (!targetId || !chatId) return false;
    let currentMessages = Array.isArray(socialMessagesRef.current) ? socialMessagesRef.current : [];
    if (currentMessages.some((message) => String(message?.id || '').trim() === targetId)) return true;
    let pagination = socialMessagesPaginationRef.current || EMPTY_CHAT_MESSAGES_PAGINATION;
    setSocialOlderMessagesLoading(true);
    try {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (!pagination.hasMoreBefore || !pagination.nextBefore) break;
        const payload = await api.getStudentSocialChatMessages(chatId, {
          limit: CHAT_MESSAGE_PAGE_SIZE,
          before: pagination.nextBefore,
        });
        const olderMessages = Array.isArray(payload?.messages) ? payload.messages : [];
        currentMessages = mergeChatMessages(olderMessages, currentMessages);
        pagination = getChatMessagesPagination(payload);
        socialMessagesRef.current = currentMessages;
        socialMessagesPaginationRef.current = pagination;
        markChatScrollPreserve(socialListRef, socialScrollBehaviorRef);
        setSocialChat(payload?.chat || null);
        setSocialMessages(currentMessages);
        setSocialMessagesPagination(pagination);
        setSocialMessagesError('');
        if (currentMessages.some((message) => String(message?.id || '').trim() === targetId)) return true;
        if (olderMessages.length === 0) break;
      }
    } catch (err) {
      setSocialMessagesError(err?.message || String(err));
    } finally {
      setSocialOlderMessagesLoading(false);
    }
    return currentMessages.some((message) => String(message?.id || '').trim() === targetId);
  }, [activeSocialChatId]);

  const requestTeacherReferenceOpen = useCallback((reference) => {
    const messageId = String(reference?.messageId || reference?.id || '').trim();
    if (!messageId) return;
    setTeacherReferenceRequest({ ...reference, messageId, nonce: Date.now() });
  }, []);

  const requestSocialReferenceOpen = useCallback((reference) => {
    const messageId = String(reference?.messageId || reference?.id || '').trim();
    if (!messageId) return;
    setSocialReferenceRequest({ ...reference, messageId, nonce: Date.now() });
  }, []);

  useEffect(() => {
    const request = openDirectChatRequest && typeof openDirectChatRequest === 'object'
      ? openDirectChatRequest
      : null;
    const chatId = String(request?.chatId || request?.chat?.id || '').trim();
    if (!chatId) return;

    setActiveTab('direct');
    setSelectedDirectChatId(chatId);
    if (request.chat) {
      setOpenedDirectChatDraft(request.chat);
      setSocialChat(request.chat);
      setSocialMessages(Array.isArray(request.messages) ? request.messages : []);
      setSocialMessagesPagination(getChatMessagesPagination(request));
    }
    setSocialMessagesError('');
    void loadSocialMessages(chatId);
    void loadSocialChats({ silent: true });
    onOpenDirectChatHandled?.(request.token || chatId);
  }, [loadSocialChats, loadSocialMessages, onOpenDirectChatHandled, openDirectChatRequest]);

  useEffect(() => {
    if (!isSocialTab || !isActiveSocialEnabled || !activeSocialChatId) {
      setSocialChat(null);
      setSocialMessages([]);
      setSocialMessagesPagination(EMPTY_CHAT_MESSAGES_PAGINATION);
      setSocialMessagesError('');
      return undefined;
    }
    loadSocialMessages(activeSocialChatId);
    const timerId = setInterval(() => {
      loadSocialMessages(activeSocialChatId, { silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timerId);
  }, [activeSocialChatId, isActiveSocialEnabled, isSocialTab, loadSocialMessages]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleLiveChatEvent = (event) => {
      const detail = event?.detail || {};
      if (detail?.type !== 'student-chat-message-created') return;
      if (String(detail.senderId || '').trim() === String(user?.id || '').trim()) return;
      if (detail.chatKind === 'student-teacher') {
        if (activeTab === 'teacher') {
          if (detail.message) {
            markChatScrollToBottom(teacherListRef, teacherScrollBehaviorRef);
            setTeacherMessages((prev) => mergeChatMessages(prev, [detail.message]));
          }
          void loadTeacherMessages({ silent: true });
        }
        return;
      }
      if ((detail.chatKind === 'social-group' || detail.chatKind === 'social-direct')) {
        void loadSocialChats({ silent: true });
        if (
          isSocialTab
          && isActiveSocialEnabled
          && String(detail.chatId || '').trim() === String(activeSocialChatId || '').trim()
        ) {
          if (detail.message) {
            markChatScrollToBottom(socialListRef, socialScrollBehaviorRef);
            setSocialMessages((prev) => mergeChatMessages(prev, [detail.message]));
          }
          void loadSocialMessages(activeSocialChatId, { silent: true });
        }
      }
    };
    window.addEventListener('student-chat-live-event', handleLiveChatEvent);
    return () => window.removeEventListener('student-chat-live-event', handleLiveChatEvent);
  }, [
    activeSocialChatId,
    activeTab,
    isActiveSocialEnabled,
    isSocialTab,
    loadSocialChats,
    loadSocialMessages,
    loadTeacherMessages,
    user?.id,
  ]);

  useEffect(() => {
    applyChatScrollBehavior(teacherListRef, teacherScrollBehaviorRef);
    prevTeacherMessageCountRef.current = teacherMessages.length;
  }, [teacherMessages]);

  useEffect(() => {
    if (activeTab !== 'teacher') return;
    scrollChatNodeToBottom(teacherListRef.current);
  }, [activeTab]);

  useEffect(() => {
    applyChatScrollBehavior(socialListRef, socialScrollBehaviorRef);
    prevSocialMessageCountRef.current = socialMessages.length;
  }, [socialMessages]);

  const clearTeacherImage = useCallback(() => {
    setTeacherImageDataUrl('');
    setTeacherImageName('');
    setTeacherFileDataUrl('');
    setTeacherFileName('');
    setTeacherFileMimeType('');
    setTeacherFileSize(0);
  }, []);

  const clearSocialImage = useCallback(() => {
    setSocialImageDataUrl('');
    setSocialImageName('');
    setSocialFileDataUrl('');
    setSocialFileName('');
    setSocialFileMimeType('');
    setSocialFileSize(0);
  }, []);

  useEffect(() => {
    clearSocialImage();
    setSocialText('');
    setSocialReplyTo(null);
    setSocialReferenceRequest(null);
    setSocialMessagesPagination(EMPTY_CHAT_MESSAGES_PAGINATION);
    prevSocialMessageCountRef.current = 0;
  }, [activeSocialChatId, clearSocialImage]);

  useEffect(() => {
    if (activeTab === 'teacher') setSocialReferenceRequest(null);
    else setTeacherReferenceRequest(null);
  }, [activeTab]);

  useEffect(() => {
    setTeacherReplyTo(null);
    setSocialReplyTo(null);
    setForwardModal(null);
  }, [activeTab]);

  const handleTeacherImageSelect = useCallback(async (file) => {
    try {
      const attachment = await validateAndReadAttachment(file);
      if (!attachment) return;
      if (attachment.isImage) {
        setTeacherImageDataUrl(attachment.dataUrl);
        setTeacherImageName(attachment.name);
        setTeacherFileDataUrl('');
        setTeacherFileName('');
        setTeacherFileMimeType('');
        setTeacherFileSize(0);
      } else {
        setTeacherImageDataUrl('');
        setTeacherImageName('');
        setTeacherFileDataUrl(attachment.dataUrl);
        setTeacherFileName(attachment.name);
        setTeacherFileMimeType(attachment.mimeType);
        setTeacherFileSize(attachment.size);
      }
      setTeacherError('');
    } catch (err) {
      setTeacherError(err?.message || String(err));
    }
  }, [validateAndReadAttachment]);

  const handleSocialImageSelect = useCallback(async (file) => {
    try {
      const attachment = await validateAndReadAttachment(file);
      if (!attachment) return;
      if (attachment.isImage) {
        setSocialImageDataUrl(attachment.dataUrl);
        setSocialImageName(attachment.name);
        setSocialFileDataUrl('');
        setSocialFileName('');
        setSocialFileMimeType('');
        setSocialFileSize(0);
      } else {
        setSocialImageDataUrl('');
        setSocialImageName('');
        setSocialFileDataUrl(attachment.dataUrl);
        setSocialFileName(attachment.name);
        setSocialFileMimeType(attachment.mimeType);
        setSocialFileSize(attachment.size);
      }
      setSocialMessagesError('');
    } catch (err) {
      setSocialMessagesError(err?.message || String(err));
    }
  }, [validateAndReadAttachment]);

  const canAttachToActiveChat = activeTab === 'teacher'
    || (isSocialTab && isActiveSocialEnabled && Boolean(activeSocialChatId));

  const handleChatDragEnter = useCallback((event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    if (!canAttachToActiveChat) return;
    dragDepthRef.current += 1;
    setIsDraggingChatFile(true);
  }, [canAttachToActiveChat]);

  const handleChatDragOver = useCallback((event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = canAttachToActiveChat ? 'copy' : 'none';
    }
  }, [canAttachToActiveChat]);

  const handleChatDragLeave = useCallback((event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingChatFile(false);
  }, []);

  const handleChatDrop = useCallback((event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingChatFile(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!canAttachToActiveChat) {
      if (activeTab === 'teacher') setTeacherError('Сейчас сюда нельзя добавить файл.');
      else setSocialMessagesError('Сейчас сюда нельзя добавить файл.');
      return;
    }
    if (activeTab === 'teacher') {
      void handleTeacherImageSelect(file);
    } else {
      void handleSocialImageSelect(file);
    }
  }, [activeTab, canAttachToActiveChat, handleSocialImageSelect, handleTeacherImageSelect]);

  const handleSendTeacher = async () => {
    const nextText = teacherText.trim();
    const nextImageDataUrl = String(teacherImageDataUrl || '').trim();
    const nextImageName = String(teacherImageName || '').trim();
    const nextFileDataUrl = String(teacherFileDataUrl || '').trim();
    if ((!nextText && !nextImageDataUrl && !nextFileDataUrl) || teacherSending) return;
    setTeacherSending(true);
    setTeacherError('');
    try {
      const payload = await api.sendStudentChatMessage({
        text: nextText,
        imageDataUrl: nextImageDataUrl,
        imageName: nextImageName,
        fileDataUrl: nextFileDataUrl,
        fileName: teacherFileName,
        fileMimeType: teacherFileMimeType,
        fileSize: teacherFileSize,
        replyToMessageId: teacherReplyTo?.messageId || '',
      });
      setTeacherText('');
      setTeacherReplyTo(null);
      clearTeacherImage();
      if (payload?.chat) setTeacherChat(payload.chat);
      if (payload?.message) {
        markChatScrollToBottom(teacherListRef, teacherScrollBehaviorRef, { force: true });
        setTeacherMessages((prev) => mergeChatMessages(prev, [payload.message]));
      } else {
        void loadTeacherMessages({ silent: true, forceScroll: true });
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('student-chat-local-change'));
      }
    } catch (err) {
      setTeacherError(err?.message || String(err));
    } finally {
      setTeacherSending(false);
    }
  };

  const handleSendSocial = async () => {
    const chatId = String(activeSocialChatId || '').trim();
    const nextText = socialText.trim();
    const nextImageDataUrl = String(socialImageDataUrl || '').trim();
    const nextImageName = String(socialImageName || '').trim();
    const nextFileDataUrl = String(socialFileDataUrl || '').trim();
    if (!chatId || (!nextText && !nextImageDataUrl && !nextFileDataUrl) || socialSending || !isActiveSocialEnabled) return;
    setSocialSending(true);
    setSocialMessagesError('');
    try {
      const payload = await api.sendStudentSocialChatMessage(chatId, {
        text: nextText,
        imageDataUrl: nextImageDataUrl,
        imageName: nextImageName,
        fileDataUrl: nextFileDataUrl,
        fileName: socialFileName,
        fileMimeType: socialFileMimeType,
        fileSize: socialFileSize,
        replyToMessageId: socialReplyTo?.messageId || '',
      });
      setSocialText('');
      setSocialReplyTo(null);
      clearSocialImage();
      if (payload?.chat) {
        setSocialChat(payload.chat);
        setSocialPayload((prev) => {
          const current = prev || {};
          if (payload.chat.type === 'group') {
            return { ...current, groupChat: payload.chat };
          }
          if (payload.chat.type === 'direct') {
            return { ...current, directChats: upsertChatSummary(current.directChats, payload.chat) };
          }
          return current;
        });
      }
      if (payload?.message) {
        markChatScrollToBottom(socialListRef, socialScrollBehaviorRef, { force: true });
        setSocialMessages((prev) => mergeChatMessages(prev, [payload.message]));
      } else {
        void loadSocialMessages(chatId, { silent: true, forceScroll: true });
      }
      void loadSocialChats({ silent: true });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('student-chat-local-change'));
      }
    } catch (err) {
      setSocialMessagesError(err?.message || String(err));
    } finally {
      setSocialSending(false);
    }
  };

  const handleEditTeacherMessage = useCallback(async (message, text) => {
    const messageId = String(message?.id || '').trim();
    const nextText = String(text || '').trim();
    if (!messageId || !nextText) return;
    setTeacherError('');
    try {
      const payload = await api.updateStudentChatMessage(messageId, nextText);
      if (payload?.chat) setTeacherChat(payload.chat);
      if (payload?.message) {
        setTeacherMessages((prev) => prev.map((item) => (
          item?.id === payload.message.id ? payload.message : item
        )));
      }
      if (payload?.announcement) {
        setTeacherMessages((prev) => mergeChatMessages(prev, [payload.announcement]));
      }
    } catch (err) {
      setTeacherError(err?.message || String(err));
      throw err;
    }
  }, []);

  const handleDeleteTeacherMessage = useCallback(async (message) => {
    const messageId = String(message?.id || '').trim();
    if (!messageId) return;
    setTeacherError('');
    try {
      const payload = await api.deleteStudentChatMessage(messageId);
      if (payload?.chat) setTeacherChat(payload.chat);
      setTeacherMessages((prev) => prev.filter((item) => item?.id !== messageId));
    } catch (err) {
      setTeacherError(err?.message || String(err));
      throw err;
    }
  }, []);

  const handleReactTeacherMessage = useCallback(async (message, emoji) => {
    const messageId = String(message?.id || '').trim();
    const normalizedEmoji = String(emoji || '').trim();
    if (!messageId || !normalizedEmoji) return;
    setTeacherError('');
    try {
      const payload = await api.toggleStudentChatMessageReaction(messageId, normalizedEmoji);
      if (payload?.chat) setTeacherChat(payload.chat);
      if (payload?.message) {
        setTeacherMessages((prev) => prev.map((item) => (
          item?.id === payload.message.id ? payload.message : item
        )));
      }
    } catch (err) {
      setTeacherError(err?.message || String(err));
      throw err;
    }
  }, []);

  const handlePinTeacherMessage = useCallback(async (message) => {
    const messageId = String(message?.id || '').trim();
    if (!messageId) return;
    setTeacherError('');
    try {
      const payload = await api.pinStudentChatMessage(messageId);
      if (payload?.chat) setTeacherChat(payload.chat);
      if (payload?.message) {
        setTeacherMessages((prev) => prev.map((item) => (
          item?.id === payload.message.id ? payload.message : item
        )));
      }
      if (payload?.announcement) {
        setTeacherMessages((prev) => mergeChatMessages(prev, [payload.announcement]));
      }
    } catch (err) {
      setTeacherError(err?.message || String(err));
      throw err;
    }
  }, []);

  const handleUnpinTeacherMessage = useCallback((reference) => {
    const messageId = getPinnedReferenceMessageId(reference);
    if (!messageId || !confirmUnpinMessage()) return;
    void handlePinTeacherMessage({ id: messageId }).catch(() => {});
  }, [handlePinTeacherMessage]);

  const handleEditSocialMessage = useCallback(async (message, text) => {
    const chatId = String(activeSocialChatId || '').trim();
    const messageId = String(message?.id || '').trim();
    const nextText = String(text || '').trim();
    if (!chatId || !messageId || !nextText) return;
    setSocialMessagesError('');
    try {
      const payload = await api.updateStudentSocialChatMessage(chatId, messageId, nextText);
      if (payload?.chat) setSocialChat(payload.chat);
      if (payload?.message) {
        setSocialMessages((prev) => prev.map((item) => (
          item?.id === payload.message.id ? payload.message : item
        )));
      }
      if (payload?.announcement) {
        setSocialMessages((prev) => mergeChatMessages(prev, [payload.announcement]));
      }
      await loadSocialChats({ silent: true });
    } catch (err) {
      setSocialMessagesError(err?.message || String(err));
      throw err;
    }
  }, [activeSocialChatId, loadSocialChats]);

  const handleDeleteSocialMessage = useCallback(async (message) => {
    const chatId = String(activeSocialChatId || '').trim();
    const messageId = String(message?.id || '').trim();
    if (!chatId || !messageId) return;
    setSocialMessagesError('');
    try {
      const payload = await api.deleteStudentSocialChatMessage(chatId, messageId);
      if (payload?.chat) setSocialChat(payload.chat);
      setSocialMessages((prev) => prev.filter((item) => item?.id !== messageId));
      await loadSocialChats({ silent: true });
    } catch (err) {
      setSocialMessagesError(err?.message || String(err));
      throw err;
    }
  }, [activeSocialChatId, loadSocialChats]);

  const handlePinSocialMessage = useCallback(async (message) => {
    const chatId = String(activeSocialChatId || '').trim();
    const messageId = String(message?.id || '').trim();
    if (!chatId || !messageId) return;
    setSocialMessagesError('');
    try {
      const payload = await api.pinStudentSocialChatMessage(chatId, messageId);
      if (payload?.chat) setSocialChat(payload.chat);
      if (payload?.message) {
        setSocialMessages((prev) => prev.map((item) => (
          item?.id === payload.message.id ? payload.message : item
        )));
      }
      if (payload?.announcement) {
        setSocialMessages((prev) => mergeChatMessages(prev, [payload.announcement]));
      }
      await loadSocialChats({ silent: true });
    } catch (err) {
      setSocialMessagesError(err?.message || String(err));
      throw err;
    }
  }, [activeSocialChatId, loadSocialChats]);

  const handleUnpinSocialMessage = useCallback((reference) => {
    const messageId = getPinnedReferenceMessageId(reference);
    if (!messageId || !confirmUnpinMessage()) return;
    void handlePinSocialMessage({ id: messageId }).catch(() => {});
  }, [handlePinSocialMessage]);

  const handleReactSocialMessage = useCallback(async (message, emoji) => {
    const chatId = String(activeSocialChatId || '').trim();
    const messageId = String(message?.id || '').trim();
    const normalizedEmoji = String(emoji || '').trim();
    if (!chatId || !messageId || !normalizedEmoji) return;
    setSocialMessagesError('');
    try {
      const payload = await api.toggleStudentSocialChatMessageReaction(chatId, messageId, normalizedEmoji);
      if (payload?.chat) setSocialChat(payload.chat);
      if (payload?.message) {
        setSocialMessages((prev) => prev.map((item) => (
          item?.id === payload.message.id ? payload.message : item
        )));
      }
      await loadSocialChats({ silent: true });
    } catch (err) {
      setSocialMessagesError(err?.message || String(err));
      throw err;
    }
  }, [activeSocialChatId, loadSocialChats]);

  const updateNotificationSettings = useCallback(async (patch, savingKey) => {
    if (notificationSettingsSavingKey) return;
    setNotificationSettingsSavingKey(savingKey);
    setNotificationSettingsError('');
    try {
      const payload = await api.updateStudentChatNotificationSettings(patch);
      setNotificationSettings(payload?.settings || {});
      window.dispatchEvent(new Event('student-chat-notification-settings-updated'));
      await loadSocialChats({ silent: true });
    } catch (err) {
      setNotificationSettingsError(err?.message || String(err));
    } finally {
      setNotificationSettingsSavingKey('');
    }
  }, [loadSocialChats, notificationSettingsSavingKey]);

  const handleToggleTeacherNotifications = useCallback((event) => {
    event?.stopPropagation?.();
    void updateNotificationSettings({
      teacherEnabled: !teacherNotificationsEnabled,
    }, 'teacher');
  }, [teacherNotificationsEnabled, updateNotificationSettings]);

  const handleToggleGroupNotifications = useCallback((event) => {
    event?.stopPropagation?.();
    void updateNotificationSettings({
      groupEnabled: !groupNotificationsEnabled,
    }, 'group');
  }, [groupNotificationsEnabled, updateNotificationSettings]);

  const handleToggleDirectNotifications = useCallback((chatId, event) => {
    event?.stopPropagation?.();
    const id = String(chatId || '').trim();
    if (!id) return;
    void updateNotificationSettings({
      directChatId: id,
      directEnabled: !isDirectNotificationsEnabled(id),
    }, `direct:${id}`);
  }, [isDirectNotificationsEnabled, updateNotificationSettings]);

  const teacherName = useMemo(
    () => String(teacherChat?.teacherName || 'Преподаватель').trim() || 'Преподаватель',
    [teacherChat?.teacherName]
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
  const groupParticipantsCount = socialPeers.length + 1;
  const directUnreadTotal = directChats.reduce((sum, chat) => (
    isDirectNotificationsEnabled(chat?.id)
      ? sum + (Number(chat?.unreadForStudent) || 0)
      : sum
  ), 0);
  const groupUnread = Number(groupChat?.unreadForStudent) || 0;
  const tabs = [
    {
      id: 'teacher',
      label: 'Учитель',
      caption: '1:1',
      icon: GraduationCap,
      notificationsEnabled: teacherNotificationsEnabled,
      notificationSaving: notificationSettingsSavingKey === 'teacher',
      onToggleNotifications: handleToggleTeacherNotifications,
      activeClass: 'border-fuchsia-300 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 text-white shadow-fuchsia-500/25',
    },
    {
      id: 'group',
      label: 'Группа',
      caption: `${groupParticipantsCount} чел.`,
      icon: Users,
      disabled: !socialSettings.groupEnabled,
      badge: groupNotificationsEnabled ? groupUnread : 0,
      notificationsEnabled: groupNotificationsEnabled,
      notificationSaving: notificationSettingsSavingKey === 'group',
      onToggleNotifications: handleToggleGroupNotifications,
      activeClass: 'border-cyan-300 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 text-white shadow-cyan-500/25',
    },
    {
      id: 'direct',
      label: 'Личные',
      caption: `${directChats.length} диалогов`,
      icon: UserRound,
      disabled: !socialSettings.directEnabled,
      badge: directUnreadTotal,
      activeClass: 'border-emerald-300 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-emerald-500/25',
    },
  ];
  const selectedDirectChat = directChats.find((chat) => chat.id === selectedDirectChatId)
    || (socialChat?.type === 'direct' && socialChat.id === selectedDirectChatId ? socialChat : null);
  const hasOpenDirectChat = Boolean(selectedDirectChatId && selectedDirectChat);
  const socialTitle = activeTab === 'group'
    ? (socialChat?.title || groupChat?.title || 'Общий чат группы')
    : (selectedDirectChat?.title || (socialChat?.type === 'direct' ? socialChat.title : '') || 'Личный чат');
  const socialPinnedMessage = activeTab === 'group'
    ? (socialChat?.pinnedMessage || groupChat?.pinnedMessage || null)
    : (socialChat?.pinnedMessage || selectedDirectChat?.pinnedMessage || null);
  const socialPinnedMessageId = String(
    socialPinnedMessage?.messageId
      || socialChat?.pinnedMessageId
      || (activeTab === 'group' ? groupChat?.pinnedMessageId : selectedDirectChat?.pinnedMessageId)
      || ''
  ).trim();
  const directDisabled = activeTab === 'direct' && !socialSettings.directEnabled;
  const groupDisabled = activeTab === 'group' && !socialSettings.groupEnabled;
  const selectedDirectNotificationsEnabled = isDirectNotificationsEnabled(selectedDirectChatId);
  const selectedDirectNotificationSaving = notificationSettingsSavingKey === `direct:${selectedDirectChatId}`;
  const forwardDestinations = [
    teacherChat?.id ? {
      key: `teacher:${teacherChat.id}`,
      scope: 'teacher',
      chatId: teacherChat.id,
      title: 'Преподаватель',
      caption: '1:1',
      Icon: GraduationCap,
    } : null,
    groupChat?.id && socialSettings.groupEnabled ? {
      key: `social:${groupChat.id}`,
      scope: 'social',
      chatId: groupChat.id,
      title: socialPayload?.groupChat?.title || 'Общий чат группы',
      caption: `${groupParticipantsCount} чел.`,
      Icon: Users,
    } : null,
    ...directChats
      .filter((chat) => chat?.id)
      .map((chat) => ({
        key: `social:${chat.id}`,
        scope: 'social',
        chatId: chat.id,
        title: chat?.peer?.displayName || chat.title || 'Личный чат',
        caption: 'Личные',
        Icon: UserRound,
      })),
  ].filter(Boolean);
  const teacherChatMenuActions = useMemo(() => [{
    id: 'teacher-mute',
    label: teacherNotificationsEnabled ? 'Заглушить' : 'Включить звук',
    Icon: teacherNotificationsEnabled ? BellOff : Bell,
    onClick: handleToggleTeacherNotifications,
    disabled: notificationSettingsSavingKey === 'teacher',
  }], [handleToggleTeacherNotifications, notificationSettingsSavingKey, teacherNotificationsEnabled]);
  const groupChatMenuActions = useMemo(() => [{
    id: 'group-mute',
    label: groupNotificationsEnabled ? 'Заглушить' : 'Включить звук',
    Icon: groupNotificationsEnabled ? BellOff : Bell,
    onClick: handleToggleGroupNotifications,
    disabled: notificationSettingsSavingKey === 'group',
  }], [groupNotificationsEnabled, handleToggleGroupNotifications, notificationSettingsSavingKey]);
  const directChatMenuActions = useMemo(() => (selectedDirectChatId ? [{
    id: 'direct-mute',
    label: selectedDirectNotificationsEnabled ? 'Заглушить' : 'Включить звук',
    Icon: selectedDirectNotificationsEnabled ? BellOff : Bell,
    onClick: (event) => handleToggleDirectNotifications(selectedDirectChatId, event),
    disabled: selectedDirectNotificationSaving,
  }] : []), [handleToggleDirectNotifications, selectedDirectChatId, selectedDirectNotificationSaving, selectedDirectNotificationsEnabled]);

  const getStudentMessageSourceDescriptor = (message) => {
    const messageId = String(message?.id || '').trim();
    if (!messageId) return null;
    if (activeTab === 'teacher') {
      const chatId = String(teacherChat?.id || '').trim();
      return chatId ? { scope: 'teacher', chatId, messageId } : null;
    }
    const chatId = String(activeSocialChatId || '').trim();
    return chatId ? { scope: 'social', chatId, messageId } : null;
  };

  const buildStudentMessageReference = (message) => {
    const source = getStudentMessageSourceDescriptor(message);
    if (!source) return null;
    const isGroup = activeTab === 'group';
    return buildMessageReferencePayload(message, {
      chatId: source.chatId,
      chatKind: activeTab === 'teacher' ? 'teacher' : (isGroup ? 'group' : 'direct'),
      chatTitle: activeTab === 'teacher'
        ? teacherName
        : (isGroup ? (groupChat?.title || 'Общий чат группы') : socialTitle),
      fallbackSenderName: activeTab === 'teacher' ? teacherName : socialTitle,
    });
  };

  const handleReplyMessage = (message) => {
    const reference = buildStudentMessageReference(message);
    if (!reference) return;
    if (activeTab === 'teacher') setTeacherReplyTo(reference);
    else setSocialReplyTo(reference);
  };

  const handleForwardMessage = (messageOrMessages) => {
    const items = (Array.isArray(messageOrMessages) ? messageOrMessages : [messageOrMessages]).filter(Boolean);
    const entries = items
      .map((message) => ({
        source: getStudentMessageSourceDescriptor(message),
        preview: buildStudentMessageReference(message),
      }))
      .filter((entry) => entry.source && entry.preview);
    if (entries.length === 0) return;
    setForwardModal({
      source: entries[0].source,
      preview: entries[0].preview,
      sources: entries.map((entry) => entry.source),
      previews: entries.map((entry) => entry.preview),
    });
  };

  const handleForwardToDestination = async (destination) => {
    const forwardSources = Array.isArray(forwardModal?.sources) && forwardModal.sources.length > 0
      ? forwardModal.sources
      : (forwardModal?.source ? [forwardModal.source] : []);
    if (forwardSources.length === 0 || !destination?.chatId || forwardBusyTarget) return;
    setForwardBusyTarget(destination.key);
    setTeacherError('');
    setSocialMessagesError('');
    try {
      if (destination.scope === 'teacher') {
        for (const source of forwardSources) {
          await api.sendStudentChatMessage({ forwardFrom: source });
        }
        if (activeTab === 'teacher') {
          await loadTeacherMessages({ silent: true, forceScroll: true });
        }
      } else {
        for (const source of forwardSources) {
          await api.sendStudentSocialChatMessage(destination.chatId, { forwardFrom: source });
        }
        if (activeSocialChatId === destination.chatId) {
          await loadSocialMessages(destination.chatId, { silent: true, forceScroll: true });
        }
        await loadSocialChats({ silent: true });
      }
      setForwardModal(null);
    } catch (err) {
      const text = err?.message || String(err);
      if (destination.scope === 'teacher') setTeacherError(text);
      else setSocialMessagesError(text);
    } finally {
      setForwardBusyTarget('');
    }
  };

  return (
    <div
      className={`student-chat-shell relative flex min-h-0 flex-1 flex-col overflow-hidden animate-fadeIn ${isDraggingChatFile ? 'student-chat-shell--dragging-file' : ''}`}
      onDragEnter={handleChatDragEnter}
      onDragOver={handleChatDragOver}
      onDragLeave={handleChatDragLeave}
      onDrop={handleChatDrop}
    >
      {isDraggingChatFile && (
        <div className="student-chat-drop-overlay pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-[1.6rem]">
          <div className="student-chat-drop-card flex items-center gap-3 rounded-[1.35rem] border px-5 py-4 text-white shadow-2xl">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/16">
              <UploadCloud size={24} />
            </span>
            <span>
              <span className="block text-sm font-black">Отпустите файл</span>
              <span className="block text-xs font-bold text-white/72">до {CHAT_FILE_SIZE_LABEL}</span>
            </span>
          </div>
        </div>
      )}
      <ChatImageViewer image={imageViewer} onClose={() => setImageViewer(null)} />
      {forwardModal && (
        <div className="student-chat-forward-modal" role="dialog" aria-modal="true">
          <div className="student-chat-forward-modal__panel">
            <div className="student-chat-forward-modal__head">
              <div className="min-w-0">
                <p className="student-chat-forward-modal__kicker">Переслать</p>
                <h3 className="student-chat-forward-modal__title">Выберите чат</h3>
              </div>
              <button
                type="button"
                className="student-chat-forward-modal__close"
                onClick={() => setForwardModal(null)}
                aria-label="Закрыть"
                title="Закрыть"
              >
                <X size={16} />
              </button>
            </div>
            {(Array.isArray(forwardModal.previews) && forwardModal.previews.length > 0
              ? forwardModal.previews
              : [forwardModal.preview]
            ).filter(Boolean).slice(0, 3).map((preview, index) => (
              <MessageReferenceCard
                key={`${preview.messageId || preview.id || index}`}
                reference={preview}
                type="forward"
                compact
              />
            ))}
            {Array.isArray(forwardModal.previews) && forwardModal.previews.length > 3 && (
              <div className="student-chat-forward-more">
                +{forwardModal.previews.length - 3}
              </div>
            )}
            <div className="student-chat-forward-modal__targets">
              {forwardDestinations.map((destination) => {
                const Icon = destination.Icon;
                const busy = forwardBusyTarget === destination.key;
                return (
                  <button
                    key={destination.key}
                    type="button"
                    className="student-chat-forward-target"
                    onClick={() => {
                      void handleForwardToDestination(destination);
                    }}
                    disabled={Boolean(forwardBusyTarget)}
                  >
                    <span className="student-chat-forward-target__icon">
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="student-chat-forward-target__title">{destination.title}</span>
                      <span className="student-chat-forward-target__caption">{busy ? 'Отправляем...' : destination.caption}</span>
                    </span>
                    <Forward size={15} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <StudentLeaderboardProfileModal
        open={chatProfileState.open}
        row={chatProfileState.row}
        profile={chatProfileState.data}
        loading={chatProfileState.loading}
        error={chatProfileState.error}
        chatOpening={chatProfileDirectOpening}
        chatError={chatProfileDirectError}
        onClose={handleCloseChatProfile}
        onRetry={handleRetryChatProfile}
        onOpenDirectChat={handleOpenDirectChatFromProfile}
        getLeagueByXp={getLeagueByXp}
        getLeagueAuraStyle={getLeagueAuraStyle}
        isAbsoluteOrAboveLeague={isAbsoluteOrAboveLeague}
        ABSOLUTE_AURA_CROWN_STYLE={ABSOLUTE_AURA_CROWN_STYLE}
        getLevelFromXp={getLevelFromXp}
        getLevelProgressFromXp={getLevelProgressFromXp}
        getLeagueIconClassName={getChatProfileLeagueIconClassName}
      />
      <Card className="student-chat-hero mb-3 shrink-0 overflow-hidden p-0">
        <div className="relative z-10 flex flex-col gap-3 p-3 sm:p-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="student-chat-hero-heading flex min-w-0 items-center gap-3">
            <span className="student-chat-hero-icon grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/18 bg-white/12 text-cyan-100 shadow-xl shadow-cyan-950/20">
              <MessageSquare size={23} />
            </span>
            <div className="min-w-0">
              <h2 className="student-chat-hero-title truncate text-2xl font-black leading-tight text-white sm:text-3xl">Чаты</h2>
              <p className="student-chat-hero-subtitle truncate text-xs font-semibold text-cyan-50/72 sm:text-sm">
                Учитель, группа и личные диалоги курса
              </p>
            </div>
          </div>

          <div className="student-chat-hero-controls flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
            <div className="student-chat-tabs flex min-w-0 gap-2 overflow-x-auto pb-0.5" role="tablist" aria-label="Разделы чатов">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                const NotifyToggleIcon = tab.notificationsEnabled ? Bell : BellOff;
                return (
                  <div
                    key={tab.id}
                    className={`student-chat-tab group relative inline-flex min-w-[124px] shrink-0 items-stretch overflow-hidden rounded-2xl border text-left text-sm font-black transition-all ${
                      active
                        ? tab.activeClass
                        : 'border-white/14 bg-white/10 text-white/82 hover:border-white/26 hover:bg-white/16 hover:text-white'
                    } ${active ? 'student-chat-tab--active' : ''} ${tab.disabled && !active ? 'opacity-60' : ''}`}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveTab(tab.id)}
                      className="student-chat-tab-main inline-flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
                    >
                    <span className={`student-chat-tab-icon grid h-8 w-8 place-items-center rounded-xl border ${
                      active ? 'border-white/24 bg-white/18' : 'border-white/12 bg-white/8'
                    }`}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="student-chat-tab-label block leading-tight">{tab.label}</span>
                      <span className={`student-chat-tab-caption block text-[10px] font-bold leading-tight ${active ? 'text-white/75' : 'text-white/55'}`}>
                        {tab.caption}
                      </span>
                    </span>
                    </button>
                    {Number(tab.badge) > 0 && (
                      <span className="student-chat-tab-unread pointer-events-none absolute right-1.5 top-1.5">
                        {Number(tab.badge) > 99 ? '99+' : tab.badge}
                      </span>
                    )}
                    {tab.onToggleNotifications && (
                      <button
                        type="button"
                        className={`student-chat-tab-notify m-1 ml-0 grid h-8 w-8 shrink-0 place-items-center rounded-xl border transition-all ${
                          tab.notificationsEnabled
                            ? 'border-white/18 bg-white/12 text-white/82 hover:bg-white/20'
                            : 'border-rose-200/40 bg-rose-500/18 text-rose-100 hover:bg-rose-500/28'
                        }`}
                        onClick={tab.onToggleNotifications}
                        disabled={tab.notificationSaving}
                        title={tab.notificationsEnabled ? 'Уведомления включены' : 'Уведомления выключены'}
                        aria-label={tab.notificationsEnabled ? 'Отключить уведомления' : 'Включить уведомления'}
                      >
                        <NotifyToggleIcon size={14} />
                      </button>
                    )}
                    {tab.disabled && (
                      <span className={`pointer-events-none absolute bottom-1 right-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                        active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        выкл.
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant={pushEnabled ? 'secondary' : 'primary'}
              onClick={() => onTogglePush?.()}
              disabled={!canTogglePush || (!pushSupported && !pushEnabled)}
              className="student-chat-push-button h-12 shrink-0 rounded-2xl border-white/16 bg-white/14 px-3 text-white shadow-none hover:bg-white/20"
              title={pushStatusText}
            >
              <PushIcon size={16} />
              <span className="hidden sm:inline">
                {pushBusy || pushSyncing ? 'Сохраняем...' : (pushEnabled ? 'Push' : 'Push')}
              </span>
            </Button>
          </div>
        </div>
      </Card>

      {activeTab === 'teacher' && (
        <Card className="student-chat-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <ChatMessages
            key="teacher-chat"
            headerContent={(
              <div className="student-chat-inline-header">
                <div className="min-w-0">
                  <div className="student-chat-inline-kicker text-xs font-semibold uppercase tracking-[0.12em] text-purple-600">Диалог</div>
                  <h3 className="student-chat-inline-title text-lg font-bold text-slate-900">Чат с преподавателем</h3>
                </div>
                <span className="student-chat-inline-pill rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {teacherName}
                </span>
              </div>
            )}
            listRef={teacherListRef}
            messages={teacherMessages}
            loading={teacherLoading}
            hasMoreBefore={teacherMessagesPagination.hasMoreBefore}
            olderLoading={teacherOlderLoading}
            onLoadOlder={loadOlderTeacherMessages}
            emptyTitle="Можно начать первым"
            emptyText="Скиньте вопрос, фото решения или короткое уточнение."
            EmptyIcon={GraduationCap}
            fallbackSenderName={teacherName}
            onOpenImage={setImageViewer}
            onOpenSenderProfile={handleOpenSenderProfile}
            onEditMessage={handleEditTeacherMessage}
            onDeleteMessage={handleDeleteTeacherMessage}
            onReactMessage={handleReactTeacherMessage}
            onReplyMessage={handleReplyMessage}
            onForwardMessage={handleForwardMessage}
            onPinMessage={handlePinTeacherMessage}
            canDeleteSystemMessage={(message) => canDeletePinAnnouncementForActor(message, user)}
            onEnsureMessageLoaded={ensureTeacherMessageLoaded}
            openReferenceRequest={teacherReferenceRequest}
            pinnedMessageId={teacherChat?.pinnedMessage?.messageId || teacherChat?.pinnedMessageId || ''}
            pinnedMessage={teacherChat?.pinnedMessage || null}
            onPinnedCancel={handleUnpinTeacherMessage}
            onPinnedOpen={requestTeacherReferenceOpen}
            chatKind="teacher"
            menuActions={teacherChatMenuActions}
            drawerInfo={{
              title: teacherName,
              subtitle: 'Преподаватель',
              status: 'Диалог с преподавателем',
              avatarLabel: teacherName,
              avatarIcon: GraduationCap,
              kind: 'teacher',
            }}
            isMine={(message) => message?.senderRole === 'student' || message?.senderId === user?.id}
          />
          <ChatComposer
            text={teacherText}
            setText={setTeacherText}
            imageDataUrl={teacherImageDataUrl}
            imageName={teacherImageName}
            fileDataUrl={teacherFileDataUrl}
            fileName={teacherFileName}
            fileMimeType={teacherFileMimeType}
            fileSize={teacherFileSize}
            onImageSelect={handleTeacherImageSelect}
            onClearImage={clearTeacherImage}
            onSend={handleSendTeacher}
            sending={teacherSending}
            error={teacherError}
            replyTo={teacherReplyTo}
            onCancelReply={() => setTeacherReplyTo(null)}
          />
        </Card>
      )}

      {activeTab === 'group' && (
        <Card className="student-chat-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          {socialError && <div className="mb-2 text-xs text-red-500">{socialError}</div>}
          {socialLoading && !socialPayload ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-gray-500">
              Загружаем чаты...
            </div>
          ) : groupDisabled ? (
            <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-700">
              Чат отключён
            </div>
          ) : (
            <>
              <ChatMessages
                key={`social-chat:${activeSocialChatId || 'group'}`}
                headerContent={(
                  <div className="student-chat-inline-header">
                    <div className="min-w-0">
                      <div className="student-chat-inline-kicker text-xs font-semibold uppercase tracking-[0.12em] text-sky-600">Группа</div>
                      <h3 className="student-chat-inline-title text-lg font-bold text-slate-900">{socialTitle}</h3>
                    </div>
                    <span className="student-chat-inline-pill rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {groupChat?.messageCount || socialChat?.messageCount || 0} сообщений
                    </span>
                  </div>
                )}
                listRef={socialListRef}
                messages={socialMessages}
                loading={socialMessagesLoading}
                hasMoreBefore={socialMessagesPagination.hasMoreBefore}
                olderLoading={socialOlderMessagesLoading}
                onLoadOlder={loadOlderSocialMessages}
                emptyTitle="Группа ждёт старт"
                emptyText="Можно спросить по задаче или поделиться находкой."
                EmptyIcon={Hash}
                fallbackSenderName="Ученик"
                onOpenImage={setImageViewer}
                onOpenSenderProfile={handleOpenSenderProfile}
                onEditMessage={handleEditSocialMessage}
                onDeleteMessage={handleDeleteSocialMessage}
                onReactMessage={handleReactSocialMessage}
                onReplyMessage={handleReplyMessage}
                onForwardMessage={handleForwardMessage}
                onPinMessage={handlePinSocialMessage}
                canDeleteSystemMessage={(message) => canDeletePinAnnouncementForActor(message, user)}
                onEnsureMessageLoaded={ensureSocialMessageLoaded}
                openReferenceRequest={socialReferenceRequest}
                pinnedMessageId={socialPinnedMessageId}
                pinnedMessage={socialPinnedMessage}
                onPinnedCancel={handleUnpinSocialMessage}
                onPinnedOpen={requestSocialReferenceOpen}
                chatKind="group"
                menuActions={groupChatMenuActions}
                drawerInfo={{
                  title: socialTitle,
                  subtitle: `${groupParticipantsCount} чел.`,
                  status: `${groupChat?.messageCount || socialChat?.messageCount || 0} сообщений`,
                  avatarLabel: socialTitle,
                  avatarIcon: Users,
                  kind: 'group',
                }}
                isMine={(message) => message?.senderId === user?.id}
              />
              <ChatComposer
                text={socialText}
                setText={setSocialText}
                imageDataUrl={socialImageDataUrl}
                imageName={socialImageName}
                fileDataUrl={socialFileDataUrl}
                fileName={socialFileName}
                fileMimeType={socialFileMimeType}
                fileSize={socialFileSize}
                onImageSelect={handleSocialImageSelect}
                onClearImage={clearSocialImage}
                onSend={handleSendSocial}
                sending={socialSending}
                error={socialMessagesError}
                replyTo={socialReplyTo}
                onCancelReply={() => setSocialReplyTo(null)}
                placeholder="Написать в группу..."
              />
            </>
          )}
        </Card>
      )}

      {activeTab === 'direct' && (
        <Card className="student-chat-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="student-chat-panel-header mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-600">Личные</div>
              <h3 className="text-lg font-bold text-slate-900">Чаты с учениками курса</h3>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              {directChats.length} диалогов
            </span>
          </div>
          {socialError && <div className="mb-2 text-xs text-red-500">{socialError}</div>}
          {directDisabled ? (
            <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-700">
              Личные отключены
            </div>
          ) : socialLoading && !socialPayload && !hasOpenDirectChat ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-gray-500">
              Загружаем чаты...
            </div>
          ) : directChats.length === 0 && !hasOpenDirectChat ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-gray-500">
              Диалогов пока нет. Написать можно из профиля ученика в рейтинге.
            </div>
          ) : (
            <div className="student-direct-layout grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[280px_1fr]">
              <div className="student-direct-chat-list min-h-0 space-y-2 overflow-y-auto pr-1">
                {directChats.length === 0 && hasOpenDirectChat && (
                  <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-slate-50/75 px-3 py-4 text-xs font-semibold text-slate-500">
                    Диалог появится здесь после первого сообщения.
                  </div>
                )}
                {directChats.map((chat) => {
                  const active = chat.id === selectedDirectChatId;
                  const unread = Number(chat?.unreadForStudent) || 0;
                  const hasMessages = Number(chat?.messageCount) > 0;
                  const notificationsEnabled = isDirectNotificationsEnabled(chat.id);
                  const peerName = chat?.peer?.displayName || chat.title || 'Ученик';
                  const peerAvatarDataUrl = String(chat?.peer?.avatarDataUrl || '').trim();
                  const accent = getChatAccent(chat.id || peerName);
                  const directCardStyle = {
                    '--student-direct-accent': accent.rgb || '34 211 238',
                    '--student-direct-accent-2': accent.rgb2 || '168 85 247',
                  };
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => setSelectedDirectChatId(chat.id)}
                      style={directCardStyle}
                      className={`student-direct-chat-card group w-full overflow-hidden rounded-[1.2rem] border px-3 py-3 text-left transition-all hover:-translate-y-0.5 ${
                        active ? 'student-direct-chat-card--active' : 'student-direct-chat-card--idle'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br ${accent.avatar} text-sm font-black text-white shadow-md shadow-slate-300/40`}>
                          {peerAvatarDataUrl ? (
                            <img src={peerAvatarDataUrl} alt={peerName} className="h-full w-full object-cover" />
                          ) : getInitials(peerName)}
                        </span>
                        <div className="min-w-0">
                          <p className="student-direct-chat-title truncate text-sm font-semibold">
                            {peerName}
                          </p>
                          <p className="student-direct-chat-preview mt-0.5 line-clamp-2 text-xs">
                            {hasMessages ? (chat.lastMessagePreview || 'Без текста') : 'Диалог ещё не начат'}
                          </p>
                        </div>
                        <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
                          {!notificationsEnabled ? (
                            <span className="grid h-6 w-6 place-items-center rounded-full border border-rose-300/60 bg-rose-500/10 text-rose-400" title="Уведомления выключены">
                              <BellOff size={12} />
                            </span>
                          ) : unread > 0 ? (
                            <span className="student-chat-tab-unread student-direct-chat-unread">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          ) : (
                            <span className="student-direct-chat-badge rounded-full border px-2 py-0.5 text-[10px] font-black">
                              курс
                            </span>
                          )}
                        </span>
                      </div>
                      {hasMessages && (
                        <div className="student-direct-chat-time mt-2 pl-14 text-[11px] font-semibold">
                          {formatTime(chat.lastMessageAt || chat.updatedAt || chat.createdAt)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="student-direct-thread flex min-h-0 flex-col rounded-[1.35rem] border p-3">
                <ChatMessages
                  key={`social-chat:${activeSocialChatId || selectedDirectChatId || 'direct'}`}
                  headerContent={(
                    <div className="student-chat-inline-header student-chat-inline-header--direct">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br ${getChatAccent(selectedDirectChatId || socialTitle).avatar} text-sm font-black text-white shadow-md shadow-slate-300/40`}>
                        {String(selectedDirectChat?.peer?.avatarDataUrl || '').trim() ? (
                          <img src={selectedDirectChat.peer.avatarDataUrl} alt={socialTitle} className="h-full w-full object-cover" />
                        ) : getInitials(socialTitle)}
                      </span>
                      <div className="min-w-0">
                        <p className="student-chat-inline-title truncate text-sm font-extrabold text-slate-800">
                          {socialTitle}
                        </p>
                        <p className="student-chat-inline-subtitle text-[11px] font-semibold text-gray-500">
                          {(socialChat?.type === 'direct' ? socialChat.messageCount : 0) || selectedDirectChat?.messageCount || 0} сообщений
                        </p>
                      </div>
                      <button
                        type="button"
                        className={`student-chat-inline-notify ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-2xl border transition-all ${
                          selectedDirectNotificationsEnabled
                            ? 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                            : 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
                        }`}
                        onClick={(event) => handleToggleDirectNotifications(selectedDirectChatId, event)}
                        disabled={!selectedDirectChatId || selectedDirectNotificationSaving}
                        title={selectedDirectNotificationsEnabled ? 'Уведомления включены' : 'Уведомления выключены'}
                        aria-label={selectedDirectNotificationsEnabled ? 'Отключить уведомления этого диалога' : 'Включить уведомления этого диалога'}
                      >
                        {selectedDirectNotificationsEnabled ? <Bell size={16} /> : <BellOff size={16} />}
                      </button>
                    </div>
                  )}
                  listRef={socialListRef}
                  messages={socialMessages}
                  loading={socialMessagesLoading}
                  hasMoreBefore={socialMessagesPagination.hasMoreBefore}
                  olderLoading={socialOlderMessagesLoading}
                  onLoadOlder={loadOlderSocialMessages}
                  emptyTitle="Диалог чистый"
                  emptyText="Первое сообщение задаёт тон."
                  EmptyIcon={UserRound}
                  fallbackSenderName={selectedDirectChat?.peer?.displayName || 'Ученик'}
                  onOpenImage={setImageViewer}
                  onOpenSenderProfile={handleOpenSenderProfile}
                  onEditMessage={handleEditSocialMessage}
                  onDeleteMessage={handleDeleteSocialMessage}
                  onReactMessage={handleReactSocialMessage}
                  onReplyMessage={handleReplyMessage}
                  onForwardMessage={handleForwardMessage}
                  onPinMessage={handlePinSocialMessage}
                  canDeleteSystemMessage={(message) => canDeletePinAnnouncementForActor(message, user)}
                  onEnsureMessageLoaded={ensureSocialMessageLoaded}
                  openReferenceRequest={socialReferenceRequest}
                  pinnedMessageId={socialPinnedMessageId}
                  pinnedMessage={socialPinnedMessage}
                  onPinnedCancel={handleUnpinSocialMessage}
                  onPinnedOpen={requestSocialReferenceOpen}
                  chatKind="direct"
                  menuActions={directChatMenuActions}
                  drawerInfo={{
                    title: socialTitle,
                    subtitle: `${(socialChat?.type === 'direct' ? socialChat.messageCount : 0) || selectedDirectChat?.messageCount || 0} сообщений`,
                    status: 'Личный диалог',
                    avatarLabel: socialTitle,
                    avatarDataUrl: selectedDirectChat?.peer?.avatarDataUrl || '',
                    kind: 'direct',
                  }}
                  isMine={(message) => message?.senderId === user?.id}
                />
                <ChatComposer
                  text={socialText}
                  setText={setSocialText}
                  imageDataUrl={socialImageDataUrl}
                  imageName={socialImageName}
                  fileDataUrl={socialFileDataUrl}
                  fileName={socialFileName}
                  fileMimeType={socialFileMimeType}
                  fileSize={socialFileSize}
                  onImageSelect={handleSocialImageSelect}
                  onClearImage={clearSocialImage}
                  onSend={handleSendSocial}
                  sending={socialSending}
                  error={socialMessagesError}
                  replyTo={socialReplyTo}
                  onCancelReply={() => setSocialReplyTo(null)}
                  placeholder="Написать ученику..."
                />
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default StudentChatSection;
