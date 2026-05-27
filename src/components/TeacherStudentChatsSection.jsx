import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, FileText, MessageSquare, Paperclip, SendHorizontal, UploadCloud, Users, X } from 'lucide-react';
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
  const merged = [];
  groups.forEach((group) => {
    (Array.isArray(group) ? group : []).forEach((message) => {
      const key = getChatMessageKey(message);
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(message);
    });
  });
  return merged;
};

const isChatScrolledNearBottom = (node) => (
  !node || (node.scrollHeight - node.scrollTop - node.clientHeight) < 160
);

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
  const messagesScrollBehaviorRef = useRef(null);
  const prevChatsSnapshotRef = useRef(new Map());
  const chatOrderRef = useRef(new Map());
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

  const handleMessageImageSelect = useCallback(async (file) => {
    if (!file) return;
    const mimeType = String(file.type || '').toLowerCase();
    if (!mimeType || !CHAT_ALLOWED_IMAGE_TYPES.has(mimeType)) {
      setMessagesError('Можно отправлять только изображения: PNG, JPG, WEBP, GIF.');
      return;
    }
    if (Number(file.size) > CHAT_IMAGE_MAX_BYTES) {
      setMessagesError('Изображение должно быть не больше 5 МБ.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setMessageImageDataUrl(dataUrl);
      setMessageImageName(String(file.name || '').trim());
      setMessagesError('');
    } catch (err) {
      setMessagesError(err?.message || String(err));
    } finally {
      if (messageImageInputRef.current) messageImageInputRef.current.value = '';
    }
  }, []);

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
  }, [clearMessageImage, selectedChatId]);

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
        });
      }
      setMessageText('');
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
    const nextValue = !Boolean(resolvedSocialSettings?.[key]);
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

                <div
                  ref={messagesRef}
                  onScroll={(event) => {
                    if (event.currentTarget.scrollTop <= 96) loadOlderMessages();
                  }}
                  className="teacher-chat-messages mt-3 max-h-[430px] min-h-[320px] space-y-2 overflow-y-auto rounded-xl border p-3"
                >
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
                  ) : (
                    messages.map((message) => {
                      const isTeacherMessage = message?.senderRole === 'teacher';
                      const messageText = String(message?.text || '');
                      const messageImageDataUrl = String(message?.imageDataUrl || '').trim();
                      const messageImageName = String(message?.imageName || '').trim();
                      const messageFileDataUrl = String(message?.fileDataUrl || '').trim();
                      const messageFileName = String(message?.fileName || '').trim();
                      const messageFileMimeType = normalizeAttachmentMimeType(message?.fileMimeType || getDataUrlMimeType(messageFileDataUrl));
                      const messageFileSizeText = formatFileSize(message?.fileSize);
                      const renderedImageDataUrl = messageImageDataUrl || (messageFileMimeType.startsWith('image/') ? messageFileDataUrl : '');
                      const renderedImageName = messageImageDataUrl ? messageImageName : messageFileName;
                      const renderedFileDataUrl = renderedImageDataUrl === messageFileDataUrl ? '' : messageFileDataUrl;
                      const senderLabel = message?.senderName || selectedChat?.studentName || 'Ученик';
                      return (
                        <div key={message.id} className={`teacher-chat-message-row flex ${isTeacherMessage ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`teacher-chat-bubble max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                              isTeacherMessage ? 'teacher-chat-bubble--teacher text-white' : 'teacher-chat-bubble--student'
                            }`}
                          >
                            {!isTeacherMessage && (
                              <div className="teacher-chat-message-author mb-1 text-[11px] font-black">
                                {senderLabel}
                              </div>
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
                            {messageText && (
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
                        </div>
                      );
                    })
                  )}
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
