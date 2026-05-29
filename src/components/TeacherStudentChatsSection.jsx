import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, Check, Copy, FileText, Forward, Image as ImageIcon, Link, MessageSquare, MoreVertical, Paperclip, Pencil, Pin, Reply, Search, SendHorizontal, SmilePlus, Trash2, UploadCloud, Users, X } from 'lucide-react';
import { api } from '../services/api';
import { Button, Card } from './ui';
import LinkifiedText from './LinkifiedText';

const CHATS_POLL_MS = 6000;
const MESSAGES_POLL_MS = 5000;
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const CHAT_FILE_SIZE_LABEL = '10 МБ';
const CHAT_MESSAGE_PAGE_SIZE = 15;
const CHAT_DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CHAT_TARGET_HIGHLIGHT_DELAY_MS = 320;
const CHAT_TARGET_HIGHLIGHT_DURATION_MS = 2600;
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
const TEACHER_GROUP_CHAT_ITEM_ID = '__teacher_group_social_chat__';

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

const scrollChatMessageIntoView = (element) => {
  if (!element) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
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
    senderName: String(message?.senderName || '').trim() || (message?.senderRole === 'teacher' ? 'Преподаватель' : String(options.fallbackSenderName || 'Ученик')),
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
  <div className="student-chat-message-tools teacher-chat-message-tools">
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

const ChatMessageTopTools = ({
  searchQuery,
  onSearchQueryChange,
  contentFilter,
  onContentFilterChange,
  counts,
  menuActions = [],
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
    <div className={`student-chat-message-tools student-chat-message-tools--compact teacher-chat-message-tools ${searchOpen ? 'student-chat-message-tools--search-open' : ''}`} data-message-menu-ignore="true">
      {searchOpen && (
        <label className="student-chat-message-search">
          <Search size={14} />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Поиск"
            autoFocus
          />
          <button
            type="button"
            className="student-chat-tool-icon"
            onClick={() => {
              onSearchQueryChange('');
              setSearchOpen(false);
            }}
            aria-label="Закрыть поиск"
            title="Закрыть"
          >
            <X size={14} />
          </button>
        </label>
      )}
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

const getTeacherChatInitials = (value = '') => {
  const words = String(value || 'Ученик')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const chars = words.length >= 2
    ? [words[0]?.[0], words[1]?.[0]]
    : [words[0]?.[0], words[0]?.[1]];
  return chars.filter(Boolean).join('').toUpperCase() || 'У';
};

const getTeacherChatAccentIndex = (value = '') => {
  const source = String(value || '');
  return source.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
};

const TeacherStudentChatsSection = ({
  role,
  teacherId = '',
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
  const [messagesPagination, setMessagesPagination] = useState(EMPTY_CHAT_MESSAGES_PAGINATION);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [messageText, setMessageText] = useState('');
  const [messageImageDataUrl, setMessageImageDataUrl] = useState('');
  const [messageImageName, setMessageImageName] = useState('');
  const [messageFileDataUrl, setMessageFileDataUrl] = useState('');
  const [messageFileName, setMessageFileName] = useState('');
  const [messageFileMimeType, setMessageFileMimeType] = useState('');
  const [messageFileSize, setMessageFileSize] = useState(0);
  const [messageSending, setMessageSending] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [forwardModal, setForwardModal] = useState(null);
  const [forwardBusyTarget, setForwardBusyTarget] = useState('');
  const [editingMessageId, setEditingMessageId] = useState('');
  const [editingMessageText, setEditingMessageText] = useState('');
  const [messageActionBusy, setMessageActionBusy] = useState('');
  const [confirmingDeleteMessageId, setConfirmingDeleteMessageId] = useState('');
  const [messageContextMenu, setMessageContextMenu] = useState(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState('');
  const [busyReactionKey, setBusyReactionKey] = useState('');
  const [reactionBurst, setReactionBurst] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [contentFilter, setContentFilter] = useState('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [selectionDeleteConfirm, setSelectionDeleteConfirm] = useState(false);
  const [selectionActionBusy, setSelectionActionBusy] = useState('');
  const [referenceRequest, setReferenceRequest] = useState(null);
  const [isDraggingChatFile, setIsDraggingChatFile] = useState(false);
  const [imageViewer, setImageViewer] = useState(null);
  const [socialSettings, setSocialSettings] = useState(null);
  const [socialSettingsLoading, setSocialSettingsLoading] = useState(false);
  const [socialSettingsSaving, setSocialSettingsSaving] = useState(false);
  const [socialSettingsError, setSocialSettingsError] = useState('');
  const [groupChatSummary, setGroupChatSummary] = useState(null);
  const [groupParticipantsCount, setGroupParticipantsCount] = useState(0);
  const [groupChatError, setGroupChatError] = useState('');
  const messagesRef = useRef(null);
  const messageImageInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const reactionBurstTimerRef = useRef(null);
  const messagesScrollBehaviorRef = useRef(null);
  const prevChatsSnapshotRef = useRef(new Map());
  const chatOrderRef = useRef(new Map());
  const messagesDataRef = useRef([]);
  const messagesPaginationRef = useRef(EMPTY_CHAT_MESSAGES_PAGINATION);
  const highlightTimerRef = useRef(null);
  const highlightFrameRef = useRef(null);
  const highlightDelayTimerRef = useRef(null);
  const normalizedTeacherId = String(teacherId || '').trim();
  const canManageSocialChats = (role === 'teacher' || role === 'admin') && normalizedTeacherId;

  const clearMessageImage = useCallback(() => {
    setMessageImageDataUrl('');
    setMessageImageName('');
    setMessageFileDataUrl('');
    setMessageFileName('');
    setMessageFileMimeType('');
    setMessageFileSize(0);
    if (messageImageInputRef.current) messageImageInputRef.current.value = '';
  }, []);

  const contentCounts = useMemo(() => getChatContentCounts(messages), [messages]);
  const visibleMessages = useMemo(
    () => getVisibleChatMessages(messages, searchQuery, contentFilter),
    [contentFilter, messages, searchQuery]
  );
  const selectedMessageIdSet = useMemo(() => new Set(selectedMessageIds), [selectedMessageIds]);

  useEffect(() => {
    messagesDataRef.current = messages;
  }, [messages]);

  useEffect(() => {
    messagesPaginationRef.current = messagesPagination;
  }, [messagesPagination]);

  const handleMessageAttachmentSelect = useCallback(async (file) => {
    if (!file) return;
    const mimeType = normalizeAttachmentMimeType(file.type || 'application/octet-stream');
    const isImage = CHAT_ALLOWED_IMAGE_TYPES.has(mimeType);
    if (isImage && Number(file.size) > CHAT_IMAGE_MAX_BYTES) {
      setMessagesError('Изображение должно быть не больше 5 МБ.');
      return;
    }
    if (!isImage && Number(file.size) > CHAT_FILE_MAX_BYTES) {
      setMessagesError(`Файл должен быть не больше ${CHAT_FILE_SIZE_LABEL}.`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (isImage) {
        setMessageImageDataUrl(dataUrl);
        setMessageImageName(String(file.name || '').trim());
        setMessageFileDataUrl('');
        setMessageFileName('');
        setMessageFileMimeType('');
        setMessageFileSize(0);
      } else {
        setMessageImageDataUrl('');
        setMessageImageName('');
        setMessageFileDataUrl(dataUrl);
        setMessageFileName(String(file.name || '').trim());
        setMessageFileMimeType(mimeType || getDataUrlMimeType(dataUrl) || 'application/octet-stream');
        setMessageFileSize(Number(file.size) || 0);
      }
      setMessagesError('');
    } catch (err) {
      setMessagesError(err?.message || String(err));
    } finally {
      if (messageImageInputRef.current) messageImageInputRef.current.value = '';
    }
  }, []);

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
    setSelectedChatId((prev) => (prev === normalized ? prev : normalized));
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
    const { silent = false, before = '', prepend = false, forceScroll = false } = options;
    const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
    if (!normalizedChatId) {
      setChatDetails(null);
      setMessages([]);
      setMessagesPagination(EMPTY_CHAT_MESSAGES_PAGINATION);
      setMessagesError('');
      return null;
    }
    if (prepend) {
      markChatScrollPreserve(messagesRef, messagesScrollBehaviorRef);
      setOlderMessagesLoading(true);
    } else {
      markChatScrollToBottom(messagesRef, messagesScrollBehaviorRef, { force: !silent || forceScroll });
    }
    if (!silent) setMessagesLoading(true);
    try {
      if (normalizedChatId === TEACHER_GROUP_CHAT_ITEM_ID) {
        if (!canManageSocialChats) throw new Error('teacherId required');
        const payload = await api.getTeacherSocialGroupChat(normalizedTeacherId, {
          markRead: true,
          limit: CHAT_MESSAGE_PAGE_SIZE,
          before,
        });
        const nextGroupChat = payload?.groupChat || null;
        const nextMessages = Array.isArray(payload?.messages) ? payload.messages : [];
        setGroupChatSummary(nextGroupChat);
        setGroupParticipantsCount(Array.isArray(payload?.students) ? payload.students.length : 0);
        setChatDetails(nextGroupChat);
        setMessages((prev) => {
          if (prepend) return mergeChatMessages(nextMessages, prev);
          return silent ? mergeChatMessages(prev, nextMessages) : nextMessages;
        });
        if (!silent || prepend) {
          setMessagesPagination(getChatMessagesPagination(payload));
        }
        setMessagesError('');
        setGroupChatError('');
        return payload;
      }
      const payload = await api.getStudentChatMessagesForTeacher(normalizedChatId, {
        limit: CHAT_MESSAGE_PAGE_SIZE,
        before,
      });
      const nextMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      setChatDetails(payload?.chat || null);
      setMessages((prev) => {
        if (prepend) return mergeChatMessages(nextMessages, prev);
        return silent ? mergeChatMessages(prev, nextMessages) : nextMessages;
      });
      if (!silent || prepend) {
        setMessagesPagination(getChatMessagesPagination(payload));
      }
      setMessagesError('');
      return payload;
    } catch (err) {
      if (!silent) {
        setMessagesError(err?.message || String(err));
      }
      return null;
    } finally {
      if (!silent) setMessagesLoading(false);
      if (prepend) setOlderMessagesLoading(false);
    }
  }, [canManageSocialChats, normalizedTeacherId]);

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
          if (prev === TEACHER_GROUP_CHAT_ITEM_ID && canManageSocialChats) return prev;
          if (prev && list.some((item) => item.id === prev)) return prev;
          return canManageSocialChats ? TEACHER_GROUP_CHAT_ITEM_ID : (list[0]?.id || '');
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
  }, [canManageSocialChats, prioritizeIncomingStudentMessages, role, sortChats]);

  useEffect(() => {
    if (!canManageSocialChats) return undefined;
    let cancelled = false;
    const loadGroupSummary = async () => {
      try {
        const payload = await api.getTeacherSocialGroupChat(normalizedTeacherId);
        if (cancelled) return;
        setGroupChatSummary(payload?.groupChat || null);
        setGroupParticipantsCount(Array.isArray(payload?.students) ? payload.students.length : 0);
        setGroupChatError('');
      } catch (err) {
        if (!cancelled) setGroupChatError(err?.message || String(err));
      }
    };
    loadGroupSummary();
    const timerId = setInterval(loadGroupSummary, CHATS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [canManageSocialChats, normalizedTeacherId]);

  useEffect(() => {
    if (!selectedChatId) {
      setChatDetails(null);
      setMessages([]);
      setMessagesPagination(EMPTY_CHAT_MESSAGES_PAGINATION);
      setMessagesError('');
      return undefined;
    }
    setMessagesPagination(EMPTY_CHAT_MESSAGES_PAGINATION);
    setOlderMessagesLoading(false);
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

  const loadOlderMessages = useCallback(() => {
    if (!selectedChatId || messagesLoading || olderMessagesLoading || !messagesPagination.hasMoreBefore || !messagesPagination.nextBefore) return;
    void fetchMessages(selectedChatId, {
      silent: true,
      prepend: true,
      before: messagesPagination.nextBefore,
    });
  }, [fetchMessages, messagesLoading, messagesPagination, olderMessagesLoading, selectedChatId]);

  useEffect(() => {
    applyChatScrollBehavior(messagesRef, messagesScrollBehaviorRef);
  }, [messages]);

  useEffect(() => {
    clearMessageImage();
    setEditingMessageId('');
    setEditingMessageText('');
    setMessageActionBusy('');
    setConfirmingDeleteMessageId('');
    setMessageContextMenu(null);
    setReactionPickerMessageId('');
    setBusyReactionKey('');
    setReplyToMessage(null);
    setReferenceRequest(null);
    setForwardModal(null);
    setSearchQuery('');
    setContentFilter('all');
  }, [clearMessageImage, selectedChatId]);

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
      setHighlightedMessageId(id);
      highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(''), CHAT_TARGET_HIGHLIGHT_DURATION_MS);
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
  }, []);

  const highlightMessageAfterScroll = useCallback((messageId) => {
    const id = String(messageId || '').trim();
    if (!id) return;
    if (highlightDelayTimerRef.current) clearTimeout(highlightDelayTimerRef.current);
    highlightDelayTimerRef.current = setTimeout(() => {
      highlightDelayTimerRef.current = null;
      highlightMessage(id);
    }, CHAT_TARGET_HIGHLIGHT_DELAY_MS);
  }, [highlightMessage]);

  const ensureMessageLoaded = useCallback(async (messageId) => {
    const targetId = String(messageId || '').trim();
    if (!targetId || !selectedChatId) return false;
    let currentMessages = Array.isArray(messagesDataRef.current) ? messagesDataRef.current : [];
    if (currentMessages.some((message) => String(message?.id || '').trim() === targetId)) return true;
    let pagination = messagesPaginationRef.current || EMPTY_CHAT_MESSAGES_PAGINATION;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (!pagination.hasMoreBefore || !pagination.nextBefore) break;
      const payload = await fetchMessages(selectedChatId, {
        silent: true,
        prepend: true,
        before: pagination.nextBefore,
      });
      if (!payload) break;
      const olderMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      currentMessages = mergeChatMessages(olderMessages, currentMessages);
      pagination = getChatMessagesPagination(payload);
      messagesDataRef.current = currentMessages;
      messagesPaginationRef.current = pagination;
      if (currentMessages.some((message) => String(message?.id || '').trim() === targetId)) return true;
      if (olderMessages.length === 0) break;
    }
    return currentMessages.some((message) => String(message?.id || '').trim() === targetId);
  }, [fetchMessages, selectedChatId]);

  const openReferencedMessage = useCallback(async (reference) => {
    const targetId = String(reference?.messageId || reference?.id || '').trim();
    if (!targetId) return;
    setMessageContextMenu(null);
    setReactionPickerMessageId('');
    setConfirmingDeleteMessageId('');
    setSearchQuery('');
    setContentFilter('all');

    await waitForChatPaint();
    let element = getChatMessageElement(messagesRef.current, targetId);
    if (!element) {
      await ensureMessageLoaded(targetId);
      await waitForChatPaint();
      element = getChatMessageElement(messagesRef.current, targetId);
    }
    if (!element) {
      await waitForChatPaint();
      element = getChatMessageElement(messagesRef.current, targetId);
    }
    if (!element) return;
    scrollChatMessageIntoView(element);
    highlightMessageAfterScroll(targetId);
  }, [ensureMessageLoaded, highlightMessageAfterScroll]);

  useEffect(() => {
    if (!referenceRequest?.messageId) return;
    void openReferencedMessage(referenceRequest);
  }, [openReferencedMessage, referenceRequest]);

  const triggerReactionBurst = useCallback((messageId, emoji) => {
    if (reactionBurstTimerRef.current) clearTimeout(reactionBurstTimerRef.current);
    setReactionBurst({ messageId, emoji, key: `${messageId}:${emoji}:${Date.now()}` });
    reactionBurstTimerRef.current = setTimeout(() => setReactionBurst(null), 900);
  }, []);

  const handleSendMessage = async () => {
    const text = messageText.trim();
    const imageDataUrl = String(messageImageDataUrl || '').trim();
    const imageName = String(messageImageName || '').trim();
    const fileDataUrl = String(messageFileDataUrl || '').trim();
    if (!selectedChatId || (!text && !imageDataUrl && !fileDataUrl) || messageSending) return;
    if (selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID && resolvedSocialSettings.groupEnabled === false) {
      setMessagesError('Общий чат группы отключён.');
      return;
    }
    setMessageSending(true);
    try {
      if (selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID) {
        await api.sendTeacherSocialGroupChatMessage({
          text,
          imageDataUrl,
          imageName,
          fileDataUrl,
          fileName: messageFileName,
          fileMimeType: messageFileMimeType,
          fileSize: messageFileSize,
          replyToMessageId: replyToMessage?.messageId || '',
        }, normalizedTeacherId);
      } else {
        await api.sendStudentChatMessageForTeacher(selectedChatId, {
          text,
          imageDataUrl,
          imageName,
          fileDataUrl,
          fileName: messageFileName,
          fileMimeType: messageFileMimeType,
          fileSize: messageFileSize,
          replyToMessageId: replyToMessage?.messageId || '',
        });
      }
      setMessageText('');
      setReplyToMessage(null);
      clearMessageImage();
      await fetchMessages(selectedChatId, { silent: true, forceScroll: true });
      if (selectedChatId !== TEACHER_GROUP_CHAT_ITEM_ID) {
        await refreshChats();
      }
      setMessagesError('');
    } catch (err) {
      setMessagesError(err?.message || String(err));
    } finally {
      setMessageSending(false);
    }
  };

  const startEditMessage = useCallback((message) => {
    const messageId = String(message?.id || '').trim();
    if (!messageId) return;
    setConfirmingDeleteMessageId('');
    setMessageContextMenu(null);
    setReactionPickerMessageId('');
    setEditingMessageId(messageId);
    setEditingMessageText(String(message?.text || ''));
  }, []);

  const cancelEditMessage = useCallback(() => {
    setEditingMessageId('');
    setEditingMessageText('');
  }, []);

  const handleEditMessage = useCallback(async (message) => {
    const messageId = String(message?.id || '').trim();
    const nextText = editingMessageText.trim();
    if (!selectedChatId || !messageId || !nextText) return;
    if (nextText === String(message?.text || '').trim()) {
      cancelEditMessage();
      return;
    }
    setMessageActionBusy(`edit:${messageId}`);
    setMessagesError('');
    try {
      const payload = selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID
        ? await api.updateTeacherSocialGroupChatMessage(messageId, nextText, normalizedTeacherId)
        : await api.updateStudentChatMessageForTeacher(selectedChatId, messageId, nextText);
      if (payload?.chat) {
        if (selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID) setGroupChatSummary(payload.chat);
        setChatDetails(payload.chat);
      }
      if (payload?.message) {
        setMessages((prev) => prev.map((item) => (
          item?.id === payload.message.id ? payload.message : item
        )));
      }
      cancelEditMessage();
      setConfirmingDeleteMessageId('');
      setMessageContextMenu(null);
      if (selectedChatId !== TEACHER_GROUP_CHAT_ITEM_ID) {
        await refreshChats();
      }
    } catch (err) {
      setMessagesError(err?.message || String(err));
    } finally {
      setMessageActionBusy('');
    }
  }, [cancelEditMessage, editingMessageText, normalizedTeacherId, refreshChats, selectedChatId]);

  const handleDeleteMessage = useCallback(async (message) => {
    const messageId = String(message?.id || '').trim();
    if (!selectedChatId || !messageId || !isMessageDeleteAllowed(message)) return;
    setMessageActionBusy(`delete:${messageId}`);
    setMessagesError('');
    try {
      const payload = selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID
        ? await api.deleteTeacherSocialGroupChatMessage(messageId, normalizedTeacherId)
        : await api.deleteStudentChatMessageForTeacher(selectedChatId, messageId);
      if (payload?.chat) {
        if (selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID) setGroupChatSummary(payload.chat);
        setChatDetails(payload.chat);
      }
      setMessages((prev) => prev.filter((item) => item?.id !== messageId));
      if (editingMessageId === messageId) cancelEditMessage();
      setConfirmingDeleteMessageId('');
      setMessageContextMenu(null);
      if (selectedChatId !== TEACHER_GROUP_CHAT_ITEM_ID) {
        await refreshChats();
      }
    } catch (err) {
      setMessagesError(err?.message || String(err));
    } finally {
      setMessageActionBusy('');
    }
  }, [cancelEditMessage, editingMessageId, normalizedTeacherId, refreshChats, selectedChatId]);

  const handlePinMessage = useCallback(async (message) => {
    const messageId = String(message?.id || '').trim();
    if (!selectedChatId || !messageId) return;
    setMessageActionBusy(`pin:${messageId}`);
    setMessagesError('');
    try {
      const payload = selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID
        ? await api.pinTeacherSocialGroupChatMessage(messageId, normalizedTeacherId)
        : await api.pinStudentChatMessageForTeacher(selectedChatId, messageId);
      if (payload?.chat) {
        if (selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID) setGroupChatSummary(payload.chat);
        setChatDetails(payload.chat);
      }
      if (payload?.message) {
        setMessages((prev) => prev.map((item) => (
          item?.id === payload.message.id ? payload.message : item
        )));
      }
      if (payload?.announcement) {
        setMessages((prev) => mergeChatMessages(prev, [payload.announcement]));
      }
      if (selectedChatId !== TEACHER_GROUP_CHAT_ITEM_ID) {
        await refreshChats();
      }
    } catch (err) {
      setMessagesError(err?.message || String(err));
      throw err;
    } finally {
      setMessageActionBusy('');
    }
  }, [normalizedTeacherId, refreshChats, selectedChatId]);

  const handleUnpinPinnedMessage = useCallback((reference) => {
    const messageId = getPinnedReferenceMessageId(reference);
    if (!messageId || !confirmUnpinMessage()) return;
    void handlePinMessage({ id: messageId }).catch(() => {});
  }, [handlePinMessage]);

  const requestDeleteMessage = useCallback((message) => {
    const messageId = String(message?.id || '').trim();
    if (!messageId || !isMessageDeleteAllowed(message)) return;
    setEditingMessageId('');
    setEditingMessageText('');
    setMessageContextMenu(null);
    setReactionPickerMessageId('');
    setConfirmingDeleteMessageId(messageId);
  }, []);

  const handleReactMessage = useCallback(async (message, emoji) => {
    const messageId = String(message?.id || '').trim();
    const normalizedEmoji = String(emoji || '').trim();
    if (message?.senderRole === 'teacher') return;
    if (!selectedChatId || !messageId || !normalizedEmoji) return;
    const busyKey = `${messageId}:${normalizedEmoji}`;
    setBusyReactionKey(busyKey);
    setMessagesError('');
    setConfirmingDeleteMessageId('');
    setEditingMessageId('');
    setEditingMessageText('');
    setMessageContextMenu(null);
    try {
      const payload = selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID
        ? await api.toggleTeacherSocialGroupChatMessageReaction(messageId, normalizedEmoji, normalizedTeacherId)
        : await api.toggleStudentChatMessageReactionForTeacher(selectedChatId, messageId, normalizedEmoji);
      if (payload?.chat) {
        if (selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID) setGroupChatSummary(payload.chat);
        setChatDetails(payload.chat);
      }
      if (payload?.message) {
        setMessages((prev) => prev.map((item) => (
          item?.id === payload.message.id ? payload.message : item
        )));
      }
      triggerReactionBurst(messageId, normalizedEmoji);
      setReactionPickerMessageId('');
      if (selectedChatId !== TEACHER_GROUP_CHAT_ITEM_ID) {
        await refreshChats();
      }
    } catch (err) {
      setMessagesError(err?.message || String(err));
    } finally {
      setBusyReactionKey('');
    }
  }, [normalizedTeacherId, refreshChats, selectedChatId, triggerReactionBurst]);

  const openMessageContextMenu = useCallback((event, message) => {
    event.preventDefault();
    event.stopPropagation();
    const messageId = String(message?.id || '').trim();
    if (!messageId) return;
    const position = getMessageContextMenuPosition(event);
    setEditingMessageId('');
    setEditingMessageText('');
    setConfirmingDeleteMessageId('');
    setReactionPickerMessageId('');
    setMessageContextMenu({
      messageId,
      x: position.x,
      y: position.y,
    });
  }, []);

  const selectedSummary = chats.find((chat) => chat.id === selectedChatId) || null;
  const selectedChat = selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID
    ? (chatDetails?.type === 'group' ? chatDetails : groupChatSummary)
    : (chatDetails?.id === selectedChatId ? chatDetails : selectedSummary);
  const canToggleNotify = typeof onToggleNotify === 'function'
    && !notifyBusy
    && !notifySyncing
    && notifyReady;
  const resolvedNotifyText = notifyStatusText
    || (notifyPermission === 'denied'
      ? 'Уведомления заблокированы в настройках браузера.'
      : 'Включите уведомления, чтобы не пропускать новые сообщения.');
  const NotifyIcon = notifyEnabled ? BellOff : Bell;
  const resolvedSocialSettings = socialSettings || { directEnabled: true, groupEnabled: true };
  const isGroupChatSelected = selectedChatId === TEACHER_GROUP_CHAT_ITEM_ID;
  const isGroupChatDisabled = isGroupChatSelected && resolvedSocialSettings.groupEnabled === false;
  const canAttachToSelectedChat = Boolean(selectedChatId) && !isGroupChatDisabled;
  const contextMenuMessage = messageContextMenu
    ? messages.find((message) => String(message?.id || '').trim() === messageContextMenu.messageId)
    : null;
  const contextMenuOwn = Boolean(
    contextMenuMessage
      && role === 'teacher'
      && contextMenuMessage?.senderRole === 'teacher'
      && String(contextMenuMessage?.senderId || '').trim() === normalizedTeacherId
  );
  const selectedPinnedMessageId = String(
    selectedChat?.pinnedMessage?.messageId || selectedChat?.pinnedMessageId || ''
  ).trim();
  const closeContextMenu = () => setMessageContextMenu(null);
  const selectedMessages = selectedMessageIds
    .map((id) => messages.find((message) => String(message?.id || '').trim() === id))
    .filter(Boolean);
  const selectedDeletableMessages = selectedMessages.filter((message) => (
    role === 'teacher'
      && message?.senderRole === 'teacher'
      && String(message?.senderId || '').trim() === normalizedTeacherId
      && isMessageDeleteAllowed(message)
  ));
  const canDeleteSelectedMessages = selectedMessages.length > 0
    && selectedDeletableMessages.length === selectedMessages.length
    && !selectionActionBusy;
  const canForwardSelectedMessages = selectedMessages.length > 0 && !selectionActionBusy;

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
    setEditingMessageText('');
    setSelectionMode(true);
    setSelectionDeleteConfirm(false);
    setSelectedMessageIds([id]);
  }, []);

  const deleteSelectedMessages = useCallback(async () => {
    if (!canDeleteSelectedMessages) return;
    setSelectionActionBusy('delete');
    try {
      for (const message of selectedDeletableMessages) {
        await handleDeleteMessage(message);
      }
      clearMessageSelection();
    } catch {
      setSelectionActionBusy('');
    }
  }, [canDeleteSelectedMessages, clearMessageSelection, handleDeleteMessage, selectedDeletableMessages]);

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

  const handleChatDragEnter = useCallback((event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    if (!canAttachToSelectedChat) return;
    dragDepthRef.current += 1;
    setIsDraggingChatFile(true);
  }, [canAttachToSelectedChat]);

  const handleChatDragOver = useCallback((event) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = canAttachToSelectedChat ? 'copy' : 'none';
    }
  }, [canAttachToSelectedChat]);

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
    if (!canAttachToSelectedChat) {
      setMessagesError('Сейчас сюда нельзя добавить файл.');
      return;
    }
    void handleMessageAttachmentSelect(file);
  }, [canAttachToSelectedChat, handleMessageAttachmentSelect]);

  useEffect(() => {
    if (!canManageSocialChats) return undefined;
    let cancelled = false;
    const loadSettings = async () => {
      setSocialSettingsLoading(true);
      try {
        const payload = await api.getStudentSocialChatSettings(normalizedTeacherId);
        if (cancelled) return;
        setSocialSettings(payload?.settings || { directEnabled: true, groupEnabled: true });
        setSocialSettingsError('');
      } catch (err) {
        if (!cancelled) setSocialSettingsError(err?.message || String(err));
      } finally {
        if (!cancelled) setSocialSettingsLoading(false);
      }
    };
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [canManageSocialChats, normalizedTeacherId]);

  const handleSocialSettingToggle = async (key) => {
    if (!canManageSocialChats || socialSettingsSaving) return;
    const nextValue = !resolvedSocialSettings?.[key];
    setSocialSettingsSaving(true);
    try {
      const payload = await api.updateStudentSocialChatSettings({ [key]: nextValue }, normalizedTeacherId);
      setSocialSettings(payload?.settings || { ...resolvedSocialSettings, [key]: nextValue });
      setSocialSettingsError('');
    } catch (err) {
      setSocialSettingsError(err?.message || String(err));
    } finally {
      setSocialSettingsSaving(false);
    }
  };

  const groupUnread = Number(groupChatSummary?.unreadForTeacher) || 0;
  const groupHasMessages = Number(groupChatSummary?.messageCount) > 0;
  const groupLastTime = formatDateTime(groupChatSummary?.lastMessageAt || groupChatSummary?.updatedAt || groupChatSummary?.createdAt);
  const selectedTitle = isGroupChatSelected
    ? 'Общий чат группы'
    : (selectedChat?.studentName || 'Ученик');
  const selectedSubtitle = isGroupChatSelected
    ? `${groupParticipantsCount} учеников · ${selectedChat?.messageCount || 0} сообщений`
    : `${selectedChat?.messageCount || 0} сообщений`;
  const composerPlaceholder = isGroupChatSelected
    ? 'Написать в общий чат группы...'
    : 'Ответить ученику...';

  const selectedChatMenuActions = useMemo(() => {
    const actions = [];
    if (canToggleNotify) {
      actions.push({
        id: 'teacher-chat-push',
        label: notifyEnabled ? 'Заглушить push' : 'Включить push',
        Icon: NotifyIcon,
        onClick: onToggleNotify,
        disabled: !canToggleNotify,
      });
    }
    if (canManageSocialChats) {
      if (isGroupChatSelected) {
        actions.push({
          id: 'teacher-chat-group-lock',
          label: resolvedSocialSettings.groupEnabled ? 'Заблокировать группу' : 'Включить группу',
          Icon: Users,
          onClick: () => {
            void handleSocialSettingToggle('groupEnabled');
          },
          disabled: socialSettingsSaving,
          danger: resolvedSocialSettings.groupEnabled,
        });
      } else {
        actions.push({
          id: 'teacher-chat-direct-lock',
          label: resolvedSocialSettings.directEnabled ? 'Заблокировать личные' : 'Включить личные',
          Icon: Users,
          onClick: () => {
            void handleSocialSettingToggle('directEnabled');
          },
          disabled: socialSettingsSaving,
          danger: resolvedSocialSettings.directEnabled,
        });
      }
    }
    return actions;
  }, [
    NotifyIcon,
    canManageSocialChats,
    canToggleNotify,
    handleSocialSettingToggle,
    isGroupChatSelected,
    notifyEnabled,
    onToggleNotify,
    resolvedSocialSettings.directEnabled,
    resolvedSocialSettings.groupEnabled,
    socialSettingsSaving,
  ]);

  const forwardDestinations = [
    canManageSocialChats && resolvedSocialSettings.groupEnabled !== false && groupChatSummary?.id ? {
      key: `group:${groupChatSummary.id}`,
      scope: 'social',
      chatId: groupChatSummary.id,
      title: 'Общий чат группы',
      caption: `${groupParticipantsCount} учеников`,
      Icon: Users,
    } : null,
    ...chats
      .filter((chat) => chat?.id)
      .map((chat) => ({
        key: `teacher:${chat.id}`,
        scope: 'teacher',
        chatId: chat.id,
        title: chat.studentName || 'Ученик',
        caption: '1:1',
        Icon: MessageSquare,
      })),
  ].filter(Boolean);

  const getTeacherMessageSourceDescriptor = (message) => {
    const messageId = String(message?.id || '').trim();
    if (!messageId) return null;
    if (isGroupChatSelected) {
      const chatId = String((selectedChat?.type === 'group' ? selectedChat?.id : '') || groupChatSummary?.id || '').trim();
      return chatId ? { scope: 'social', chatId, messageId } : null;
    }
    const chatId = String(selectedChatId || '').trim();
    return chatId ? { scope: 'teacher', chatId, messageId } : null;
  };

  const buildTeacherMessageReference = (message) => {
    const source = getTeacherMessageSourceDescriptor(message);
    if (!source) return null;
    return buildMessageReferencePayload(message, {
      chatId: source.chatId,
      chatKind: isGroupChatSelected ? 'group' : 'teacher',
      chatTitle: selectedTitle,
      fallbackSenderName: selectedTitle,
    });
  };

  const handleReplyMessage = (message) => {
    const reference = buildTeacherMessageReference(message);
    if (!reference) return;
    setReplyToMessage(reference);
    setEditingMessageId('');
    setEditingMessageText('');
    setConfirmingDeleteMessageId('');
    setReactionPickerMessageId('');
    setMessageContextMenu(null);
  };

  const handleForwardMessage = (messageOrMessages) => {
    const items = (Array.isArray(messageOrMessages) ? messageOrMessages : [messageOrMessages]).filter(Boolean);
    const entries = items
      .map((message) => ({
        source: getTeacherMessageSourceDescriptor(message),
        preview: buildTeacherMessageReference(message),
      }))
      .filter((entry) => entry.source && entry.preview);
    if (entries.length === 0) return;
    setForwardModal({
      source: entries[0].source,
      preview: entries[0].preview,
      sources: entries.map((entry) => entry.source),
      previews: entries.map((entry) => entry.preview),
    });
    setConfirmingDeleteMessageId('');
    setReactionPickerMessageId('');
    setMessageContextMenu(null);
  };

  const handleForwardToDestination = async (destination) => {
    const forwardSources = Array.isArray(forwardModal?.sources) && forwardModal.sources.length > 0
      ? forwardModal.sources
      : (forwardModal?.source ? [forwardModal.source] : []);
    if (forwardSources.length === 0 || !destination?.chatId || forwardBusyTarget) return;
    setForwardBusyTarget(destination.key);
    setMessagesError('');
    try {
      if (destination.scope === 'social') {
        for (const source of forwardSources) {
          await api.sendTeacherSocialGroupChatMessage({ forwardFrom: source }, normalizedTeacherId);
        }
        if (isGroupChatSelected) {
          await fetchMessages(TEACHER_GROUP_CHAT_ITEM_ID, { silent: true, forceScroll: true });
        }
      } else {
        for (const source of forwardSources) {
          await api.sendStudentChatMessageForTeacher(destination.chatId, { forwardFrom: source });
        }
        if (selectedChatId === destination.chatId) {
          await fetchMessages(destination.chatId, { silent: true, forceScroll: true });
        }
        await refreshChats();
      }
      setForwardModal(null);
    } catch (err) {
      setMessagesError(err?.message || String(err));
    } finally {
      setForwardBusyTarget('');
    }
  };

  const forwardSelectedMessages = () => {
    if (!canForwardSelectedMessages) return;
    handleForwardMessage(selectedMessages);
    clearMessageSelection();
  };

  return (
    <div
      className={`teacher-chat-section relative animate-fadeIn pb-10 ${isDraggingChatFile ? 'student-chat-shell--dragging-file' : ''}`}
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
      <div className="teacher-chat-heading mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="teacher-chat-kicker">центр сообщений</div>
          <h2 className="flex items-center gap-2 text-2xl font-black tracking-[-0.01em]">
            <span className="teacher-chat-heading-icon grid h-11 w-11 place-items-center rounded-2xl">
              <MessageSquare size={22} />
            </span>
            Чаты с учениками
          </h2>
          <p>Группа, личные диалоги и быстрые ответы в одном рабочем окне.</p>
        </div>
        <span className="teacher-chat-heading-pill">
          {chats.length + (canManageSocialChats ? 1 : 0)} диалогов
        </span>
      </div>

      <Card className="teacher-chat-notify-card mb-5">
        <div className="teacher-chat-status-strip teacher-chat-status-strip--notify">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="teacher-chat-strip-label">
                Уведомления
              </div>
              <div className="teacher-chat-strip-text mt-1">
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
              className="teacher-chat-control-button sm:ml-3"
            >
              <NotifyIcon size={16} />
              {notifyBusy || notifySyncing
                ? 'Сохраняем...'
                : (notifyEnabled ? 'Отключить уведомления' : 'Включить уведомления')}
            </Button>
          </div>
        </div>
      </Card>

      {canManageSocialChats && (
        <Card className="teacher-chat-course-card mb-5">
          <div className="teacher-chat-status-strip teacher-chat-status-strip--course flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="teacher-chat-strip-label flex items-center gap-2">
                <Users size={14} />
                Чаты курса
              </div>
              <div className="teacher-chat-strip-text mt-1">
                Общий чат группы и личные диалоги между учениками своего курса.
              </div>
              {socialSettingsError && (
                <div className="mt-1 text-xs text-red-500">{socialSettingsError}</div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={resolvedSocialSettings.groupEnabled ? 'success' : 'secondary'}
                onClick={() => handleSocialSettingToggle('groupEnabled')}
                disabled={socialSettingsLoading || socialSettingsSaving}
                className="teacher-chat-control-button min-w-[150px]"
              >
                {resolvedSocialSettings.groupEnabled ? 'Группа включена' : 'Группа выкл.'}
              </Button>
              <Button
                type="button"
                variant={resolvedSocialSettings.directEnabled ? 'success' : 'secondary'}
                onClick={() => handleSocialSettingToggle('directEnabled')}
                disabled={socialSettingsLoading || socialSettingsSaving}
                className="teacher-chat-control-button min-w-[150px]"
              >
                {resolvedSocialSettings.directEnabled ? 'Личные включены' : 'Личные выкл.'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="teacher-chat-shell">
        {chatsError && <p className="mb-3 text-xs text-red-500">{chatsError}</p>}
        {groupChatError && <p className="mb-3 text-xs text-red-500">{groupChatError}</p>}
        <div className="teacher-chat-layout grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
          <div className="teacher-chat-sidebar max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {canManageSocialChats && (
              <button
                type="button"
                onClick={() => setSelectedChatId(TEACHER_GROUP_CHAT_ITEM_ID)}
                className={`teacher-chat-list-item teacher-chat-list-item--group w-full text-left ${
                  isGroupChatSelected ? 'teacher-chat-list-item--active' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 gap-2">
                    <span className="teacher-chat-list-avatar teacher-chat-list-avatar--group">
                      <Users size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="teacher-chat-list-title truncate text-sm font-black">
                        Общий чат группы
                      </p>
                      <p className="teacher-chat-list-preview mt-0.5 line-clamp-2 text-xs">
                        {groupHasMessages
                          ? (groupChatSummary?.lastMessagePreview || 'Без текста')
                          : 'Сообщения для всей группы'}
                      </p>
                    </div>
                  </div>
                  {groupUnread > 0 && (
                    <span className="teacher-chat-unread">
                      {groupUnread > 99 ? '99+' : groupUnread}
                    </span>
                  )}
                </div>
                <div className="teacher-chat-list-meta mt-2 flex items-center justify-between gap-2 pl-10 text-[11px]">
                  <span>{groupParticipantsCount} учеников</span>
                  <span>{groupLastTime}</span>
                </div>
              </button>
            )}

            {chatsLoading && chats.length === 0 ? (
              <div className="teacher-chat-empty-card rounded-xl border px-3 py-2 text-sm">
                Загружаем чаты...
              </div>
            ) : chats.length === 0 ? (
              <div className="teacher-chat-empty-card rounded-xl border border-dashed px-3 py-2 text-sm">
                {canManageSocialChats ? 'Пока нет личных чатов с учениками.' : 'Пока нет учеников для переписки.'}
              </div>
            ) : (
              chats.map((chat) => {
                const isActive = chat.id === selectedChatId;
                const unread = Number(chat?.unreadForTeacher) || 0;
                const hasMessages = Number(chat?.messageCount) > 0;
                const studentName = chat.studentName || 'Ученик';
                const accentIndex = getTeacherChatAccentIndex(chat.id || studentName);
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => setSelectedChatId(chat.id)}
                    className={`teacher-chat-list-item w-full text-left ${
                      isActive ? 'teacher-chat-list-item--active' : ''
                    }`}
                    style={{ '--teacher-chat-accent-index': accentIndex }}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`teacher-chat-list-avatar teacher-chat-list-avatar--${accentIndex}`}>
                        {getTeacherChatInitials(studentName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <p className="teacher-chat-list-title truncate text-sm font-black">
                            {studentName}
                          </p>
                          {unread > 0 && (
                            <span className="teacher-chat-unread">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                        </div>
                        <p className="teacher-chat-list-preview mt-0.5 line-clamp-2 text-xs">
                          {hasMessages
                            ? (chat.lastMessagePreview || 'Без текста')
                            : 'Диалог ещё не начат'}
                        </p>
                        <p className="teacher-chat-list-meta mt-2 text-[11px]">
                          {formatDateTime(chat.lastMessageAt || chat.updatedAt || chat.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="teacher-chat-thread rounded-2xl border p-3">
            {!selectedChatId ? (
              <div className="teacher-chat-empty-state flex min-h-[320px] items-center justify-center rounded-xl border border-dashed text-sm">
                Выберите чат слева.
              </div>
            ) : (
              <>
                <div className="teacher-chat-thread-header flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`teacher-chat-thread-avatar ${isGroupChatSelected ? 'teacher-chat-thread-avatar--group' : ''}`}>
                      {isGroupChatSelected ? <Users size={18} /> : getTeacherChatInitials(selectedTitle)}
                    </span>
                    <div className="min-w-0">
                      <p className="teacher-chat-thread-title truncate text-sm font-black">
                        {selectedTitle}
                      </p>
                      <p className="teacher-chat-thread-subtitle text-[11px] font-bold">
                        {selectedSubtitle}
                      </p>
                    </div>
                  </div>
                  {isGroupChatDisabled && (
                    <span className="teacher-chat-disabled-pill rounded-full border px-2.5 py-1 text-[11px] font-black">
                      Группа выключена
                    </span>
                  )}
                </div>
                <ChatMessageTopTools
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  contentFilter={contentFilter}
                  onContentFilterChange={setContentFilter}
                  counts={contentCounts}
                  menuActions={selectedChatMenuActions}
                />
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

                <div
                  ref={messagesRef}
                  onScroll={(event) => {
                    setMessageContextMenu(null);
                    setReactionPickerMessageId('');
                    if (event.currentTarget.scrollTop <= 96) loadOlderMessages();
                  }}
                  className="teacher-chat-messages mt-3 max-h-[430px] min-h-[320px] space-y-2 overflow-y-auto rounded-xl border p-3"
                >
                  {selectedChat?.pinnedMessage && (
                    <div className="student-chat-pinned-message-row" data-message-menu-ignore="true">
                      <MessageReferenceCard
                        reference={selectedChat.pinnedMessage}
                        type="pin"
                        compact
                        onCancel={() => handleUnpinPinnedMessage(selectedChat.pinnedMessage)}
                        onOpenTarget={(reference) => {
                          const messageId = String(reference?.messageId || reference?.id || '').trim();
                          if (messageId) setReferenceRequest({ ...reference, messageId, nonce: Date.now() });
                        }}
                      />
                    </div>
                  )}
                  {olderMessagesLoading && !messagesLoading && (
                    <div className="teacher-chat-loading-pill mx-auto flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
                      Загрузка...
                    </div>
                  )}
                  {messagesLoading ? (
                    <div className="teacher-chat-empty-state flex min-h-[260px] items-center justify-center text-sm">Загружаем переписку...</div>
                  ) : messages.length === 0 ? (
                    <div className="teacher-chat-empty-state flex min-h-[260px] items-center justify-center text-sm">
                      {isGroupChatSelected ? 'В общем чате пока сообщений нет.' : 'Пока сообщений нет.'}
                    </div>
                  ) : visibleMessages.length === 0 ? (
                    <div className="teacher-chat-empty-state flex min-h-[260px] items-center justify-center text-sm">
                      Ничего не найдено
                    </div>
                  ) : (
                    visibleMessages.map((message) => {
                      const messageId = String(message?.id || '').trim();
                      if (message?.senderRole === 'system' || message?.systemType) {
                        return (
                          <div
                            key={message.id}
                            data-chat-message-id={messageId}
                            className="student-message-system-row teacher-chat-message-system-row"
                          >
                            <span className="student-message-system-pill">{String(message?.text || '')}</span>
                          </div>
                        );
                      }
                      const isTeacherMessage = message?.senderRole === 'teacher';
                      const isOwnTeacherMessage = Boolean(isTeacherMessage && role === 'teacher' && String(message?.senderId || '').trim() === normalizedTeacherId);
                      const messageText = String(message?.text || '');
                      const canEditMessage = Boolean(isOwnTeacherMessage && messageId && messageText.trim());
                      const canDeleteMessage = Boolean(isOwnTeacherMessage && messageId && isMessageDeleteAllowed(message));
                      const isEditingMessage = editingMessageId === messageId;
                      const editBusy = messageActionBusy === `edit:${messageId}`;
                      const deleteBusy = messageActionBusy === `delete:${messageId}`;
                      const isConfirmingDelete = confirmingDeleteMessageId === messageId;
                      const reactions = normalizeMessageReactions(message);
                      const canReactMessage = Boolean(!isTeacherMessage && messageId);
                      const canReplyMessage = Boolean(messageId);
                      const canForwardMessage = Boolean(messageId);
                      const selected = selectedMessageIdSet.has(messageId);
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
                      const senderLabel = message?.senderName || selectedChat?.studentName || 'Ученик';
                      return (
                        <div
                          key={message.id}
                          data-chat-message-id={messageId}
                          className={`teacher-chat-message-row flex items-start gap-2 ${isTeacherMessage ? 'justify-end' : 'justify-start'} ${highlightedMessageId === messageId ? 'teacher-chat-message-row--highlighted' : ''} ${selectionMode ? 'student-message-row--selecting' : ''} ${selected ? 'student-message-row--selected' : ''}`}
                          onContextMenu={(event) => openMessageContextMenu(event, message)}
                        >
                          <div className={`teacher-chat-message-stack flex max-w-[88%] flex-col ${isTeacherMessage ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`teacher-chat-bubble max-w-full rounded-2xl px-3 py-2 text-sm shadow-sm ${isEditingMessage ? 'student-message-bubble--editing' : ''} ${selected ? 'student-message-bubble--selected' : ''} ${
                              isTeacherMessage ? 'teacher-chat-bubble--teacher text-white' : 'teacher-chat-bubble--student'
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
                            {!isTeacherMessage && (
                              <div className="teacher-chat-message-author mb-1 text-[11px] font-black">
                                {senderLabel}
                              </div>
                            )}
                            {message?.forwardFrom && (
                              <MessageReferenceCard reference={message.forwardFrom} type="forward" mine={isTeacherMessage} />
                            )}
                            {message?.replyTo && (
                              <MessageReferenceCard reference={message.replyTo} type="reply" mine={isTeacherMessage} onOpenTarget={openReferencedMessage} />
                            )}
                            {renderedImageDataUrl && (
                              <button
                                type="button"
                                onClick={() => setImageViewer({
                                  src: renderedImageDataUrl,
                                  name: renderedImageName || messageImageName || 'Изображение',
                                })}
                                className="student-message-image-trigger mb-2 block w-full overflow-hidden rounded-lg border border-white/20 text-left"
                                title={renderedImageName || 'Открыть изображение'}
                              >
                                <img
                                  src={renderedImageDataUrl}
                                  alt={renderedImageName || 'Изображение'}
                                  className="max-h-[260px] w-full object-contain bg-black/10"
                                  loading="lazy"
                                />
                                {renderedImageName && (
                                  <span className={`block truncate px-3 py-2 text-[11px] font-bold ${isTeacherMessage ? 'text-white/80' : 'text-gray-500'}`}>
                                    {renderedImageName}
                                  </span>
                                )}
                              </button>
                            )}
                            {renderedFileDataUrl && (
                              <a
                                href={renderedFileDataUrl}
                                download={messageFileName || undefined}
                                className={`teacher-chat-file-link mb-2 flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                                  isTeacherMessage
                                    ? 'teacher-chat-file-link--teacher text-white'
                                    : 'teacher-chat-file-link--student'
                                }`}
                                title={messageFileName || 'Скачать файл'}
                              >
                                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                                  isTeacherMessage ? 'bg-white/10 text-white' : 'bg-cyan-50 text-cyan-600'
                                }`}>
                                  <FileText size={17} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-black">
                                    {messageFileName || 'Файл'}
                                  </span>
                                  {(messageFileSizeText || messageFileMimeType) && (
                                    <span className={`mt-0.5 block truncate text-[10.5px] font-bold ${isTeacherMessage ? 'text-white/72' : 'teacher-chat-file-meta'}`}>
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
                                  void handleEditMessage(message);
                                }}
                              >
                                <textarea
                                  value={editingMessageText}
                                  onChange={(event) => setEditingMessageText(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Escape') {
                                      event.preventDefault();
                                      cancelEditMessage();
                                    }
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                      event.preventDefault();
                                      void handleEditMessage(message);
                                    }
                                  }}
                                  className="student-message-edit-textarea"
                                  rows={Math.min(5, Math.max(2, editingMessageText.split('\n').length))}
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
                                      void handleEditMessage(message);
                                    }}
                                    disabled={editBusy || !editingMessageText.trim()}
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
                                linkClassName={isTeacherMessage ? 'underline decoration-white/70 underline-offset-2' : 'text-purple-700 underline decoration-purple-400 underline-offset-2'}
                              />
                            )}
                            <div className={`teacher-chat-message-time mt-1 text-[10px] ${isTeacherMessage ? 'teacher-chat-message-time--teacher' : 'teacher-chat-message-time--student'}`}>
                              {formatDateTime(message?.createdAt)}
                            </div>
                          </div>
                          {showMessageToolbar && (
                            <div className={`student-message-toolbar ${isTeacherMessage ? 'student-message-toolbar--mine' : 'student-message-toolbar--other'}`}>
                              <div className={`student-message-reaction-strip ${isTeacherMessage ? 'student-message-reaction-strip--mine' : 'student-message-reaction-strip--other'}`}>
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
                                    onClick={canReactMessage ? () => handleReactMessage(message, reaction.emoji) : undefined}
                                    disabled={!canReactMessage || Boolean(busyReactionKey)}
                                    title={reaction.names.join(', ') || reaction.emoji}
                                    aria-label={`Reaction ${reaction.emoji}`}
                                  >
                                    <span>{reaction.emoji}</span>
                                    <strong>{reaction.count}</strong>
                                  </button>
                                ))}
                                {canReactMessage && (
                                  <span className={`student-message-reaction-wrap ${isTeacherMessage ? 'student-message-reaction-wrap--mine' : 'student-message-reaction-wrap--other'}`}>
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
                                              onClick={() => handleReactMessage(message, emoji)}
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
                                    onClick={() => handleDeleteMessage(message)}
                                    disabled={Boolean(messageActionBusy)}
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
                                      onClick={() => handleReplyMessage(message)}
                                      disabled={Boolean(messageActionBusy)}
                                      aria-label="Ответить"
                                      title="Ответить"
                                    >
                                      <Reply size={11} />
                                    </button>
                                  )}
                                  {canForwardMessage && (
                                    <button
                                      type="button"
                                      className="student-message-action-button"
                                      onClick={() => handleForwardMessage(message)}
                                      disabled={Boolean(messageActionBusy)}
                                      aria-label="Переслать"
                                      title="Переслать"
                                    >
                                      <Forward size={11} />
                                    </button>
                                  )}
                                  {canEditMessage && (
                                    <button
                                      type="button"
                                      className="student-message-action-button"
                                      onClick={() => startEditMessage(message)}
                                      disabled={Boolean(messageActionBusy)}
                                      aria-label="Редактировать"
                                      title="Редактировать"
                                    >
                                      <Pencil size={11} />
                                    </button>
                                  )}
                                  {canDeleteMessage && (
                                    <button
                                      type="button"
                                      className="student-message-action-button student-message-action-button--danger"
                                      onClick={() => requestDeleteMessage(message)}
                                      disabled={Boolean(messageActionBusy)}
                                      aria-label="Удалить"
                                      title="Удалить"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
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
                      <button
                        type="button"
                        className="student-message-context-menu__button"
                        onClick={() => {
                          closeContextMenu();
                          handleReplyMessage(contextMenuMessage);
                        }}
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
                          handleForwardMessage(contextMenuMessage);
                        }}
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
                          void handlePinMessage(contextMenuMessage);
                        }}
                        disabled={Boolean(messageActionBusy)}
                        role="menuitem"
                      >
                        <Pin size={14} />
                        <span>{selectedPinnedMessageId === String(contextMenuMessage?.id || '') ? 'Открепить' : 'Закрепить'}</span>
                      </button>
                      {contextMenuOwn && (
                      <button
                        type="button"
                        className="student-message-context-menu__button"
                        onClick={() => {
                          closeContextMenu();
                          startEditMessage(contextMenuMessage);
                        }}
                        disabled={!String(contextMenuMessage?.text || '').trim() || Boolean(messageActionBusy)}
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
                        disabled={!isMessageDeleteAllowed(contextMenuMessage) || Boolean(messageActionBusy)}
                        role="menuitem"
                      >
                        <Trash2 size={14} />
                        <span>Удалить</span>
                      </button>
                      )}
                    </div>
                  ), document.body)}
                </div>

                <div className="teacher-chat-composer mt-3">
                  <input
                    ref={messageImageInputRef}
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleMessageAttachmentSelect(file);
                    }}
                  />
                  {replyToMessage && (
                    <MessageReferenceCard
                      reference={replyToMessage}
                      type="reply"
                      compact
                      onCancel={() => setReplyToMessage(null)}
                    />
                  )}
                  {messageImageDataUrl && (
                    <div className="teacher-chat-attachment-preview mb-2 flex items-start gap-2 rounded-xl border px-2 py-2">
                      <img
                        src={messageImageDataUrl}
                        alt={messageImageName || 'Изображение'}
                        className="h-12 w-12 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="teacher-chat-attachment-title truncate text-xs">{messageImageName || 'Изображение'}</p>
                        <p className="teacher-chat-attachment-meta text-[11px]">До 5 МБ</p>
                      </div>
                      <button
                        type="button"
                        className="teacher-chat-clear-button inline-flex h-7 w-7 items-center justify-center rounded-md border"
                        onClick={clearMessageImage}
                        aria-label="Убрать изображение"
                        title="Убрать изображение"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {messageFileDataUrl && (
                    <div className="teacher-chat-attachment-preview mb-2 flex items-start gap-2 rounded-xl border px-2 py-2">
                      <span className="teacher-chat-attachment-icon grid h-12 w-12 shrink-0 place-items-center rounded-md">
                        <FileText size={20} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="teacher-chat-attachment-title truncate text-xs">{messageFileName || 'Файл'}</p>
                        <p className="teacher-chat-attachment-meta text-[11px]">
                          {[formatFileSize(messageFileSize), messageFileMimeType].filter(Boolean).join(' · ') || `До ${CHAT_FILE_SIZE_LABEL}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="teacher-chat-clear-button inline-flex h-7 w-7 items-center justify-center rounded-md border"
                        onClick={clearMessageImage}
                        aria-label="Убрать файл"
                        title="Убрать файл"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {isGroupChatDisabled && (
                    <div className="teacher-chat-disabled-note mb-2 rounded-xl border px-3 py-2 text-xs font-black">
                      Включите общий чат группы, чтобы писать ученикам.
                    </div>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <textarea
                      value={messageText}
                      onChange={(event) => setMessageText(event.target.value)}
                      disabled={messageSending || isGroupChatDisabled}
                      onPaste={(event) => {
                        const items = Array.from(event.clipboardData?.items || []);
                        const imageItem = items.find((item) => item.kind === 'file');
                        if (!imageItem) return;
                        const file = imageItem.getAsFile?.();
                        if (!file) return;
                        event.preventDefault();
                        handleMessageAttachmentSelect(file);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      rows={3}
                      placeholder={composerPlaceholder}
                      className="teacher-chat-textarea w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => messageImageInputRef.current?.click()}
                      disabled={messageSending || !selectedChatId || isGroupChatDisabled}
                      className="teacher-chat-attach-button h-[46px] min-w-[48px] self-end px-0 sm:self-stretch"
                      title={`Добавить файл (до ${CHAT_FILE_SIZE_LABEL})`}
                    >
                      <Paperclip size={16} />
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={messageSending || (!messageText.trim() && !messageImageDataUrl && !messageFileDataUrl) || !selectedChatId || isGroupChatDisabled}
                      className="teacher-chat-send-button h-[46px] min-w-[136px] self-end sm:self-stretch"
                    >
                      <SendHorizontal size={16} />
                      {messageSending ? 'Отправка...' : 'Отправить'}
                    </Button>
                  </div>
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
