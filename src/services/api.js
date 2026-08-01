import { clearStoredSession } from '../utils/theme';

import { hasConfiguredApiBaseUrl, isNativeAppRuntime, resolveApiUrl, resolveUploadsUrl } from '../utils/runtimeUrls';
import { USER_SESSION_KEY } from '../utils/theme';

const getStoredAuthToken = () => {
  if (typeof localStorage === 'undefined') return '';
  try {
    const raw = localStorage.getItem(USER_SESSION_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return typeof parsed?.authToken === 'string' ? parsed.authToken.trim() : '';
  } catch {
    return '';
  }
};

const appendAuthTokenToUrl = (value, authToken) => {
  const token = typeof authToken === 'string' ? authToken.trim() : '';
  if (!token) return value;
  const raw = String(value || '').trim();
  if (!raw) return value;
  try {
    const url = new URL(raw);
    if (!url.searchParams.get('_auth')) {
      url.searchParams.set('_auth', token);
    }
    return url.toString();
  } catch {
    const separator = raw.includes('?') ? '&' : '?';
    return `${raw}${separator}_auth=${encodeURIComponent(token)}`;
  }
};

const parseApiError = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      if (data?.error) return data.error;
    } catch {
      // Ignore invalid JSON and fall back to text parsing.
    }
  }
  try {
    const text = await res.text();
    if (text && text.length <= 200) return text;
  } catch {
    // Ignore unreadable bodies and fall back to the generic message.
  }
  if (res.status === 413) {
    return '\u0421\u043b\u0438\u0448\u043a\u043e\u043c \u0431\u043e\u043b\u044c\u0448\u043e\u0439 \u0437\u0430\u043f\u0440\u043e\u0441. \u0423\u043c\u0435\u043d\u044c\u0448\u0438\u0442\u0435 \u0440\u0430\u0437\u043c\u0435\u0440 \u0434\u0430\u043d\u043d\u044b\u0445.';
  }
  return `Ошибка запроса (${res.status} ${res.statusText})`;
};

const parseJsonResponse = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    if (text?.trim().startsWith('<!doctype')) {
      if (isNativeAppRuntime() && !hasConfiguredApiBaseUrl()) {
        throw new Error('Для APK не задан адрес сервера. Укажи адрес сайта на Timeweb в блоке "Адрес сервера для APK".');
      }
      throw new Error('Сервер не отвечает (HTML вместо JSON). Проверьте адрес сервера для APK или перезапустите backend.');
    }
    throw new Error('Некорректный ответ сервера');
  }
  return res.json();
};

let unauthorizedHandler = null;

export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
};

const resolveAuthenticatedUrl = (input, options = {}) => {
  const resolver = options.uploads ? resolveUploadsUrl : resolveApiUrl;
  const requestUrl = typeof input === 'string' ? resolver(input) : input;
  const authToken = getStoredAuthToken();
  if (!authToken || !isNativeAppRuntime()) return requestUrl;
  if (typeof requestUrl === 'string') {
    return appendAuthTokenToUrl(requestUrl, authToken);
  }
  if (requestUrl instanceof URL) {
    return new URL(appendAuthTokenToUrl(requestUrl.toString(), authToken));
  }
  return requestUrl;
};

export const resolveAuthenticatedApiUrl = (input) => resolveAuthenticatedUrl(input);

export const resolveAuthenticatedUploadsUrl = (input) => resolveAuthenticatedUrl(input, { uploads: true });

export const withStoredAuthToken = (input) => {
  const authToken = getStoredAuthToken();
  if (!authToken) return input;
  if (typeof input === 'string') {
    return appendAuthTokenToUrl(input, authToken);
  }
  if (input instanceof URL) {
    return new URL(appendAuthTokenToUrl(input.toString(), authToken));
  }
  return input;
};

const buildAuthenticatedRequestInit = (init = {}) => {
  const requestInit = { ...init };
  const headers = new Headers(requestInit.headers || {});
  const authToken = getStoredAuthToken();
  if (authToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }
  if (authToken && !headers.has('X-Ege-Auth-Token')) {
    headers.set('X-Ege-Auth-Token', authToken);
  }
  requestInit.headers = headers;
  if (!Object.prototype.hasOwnProperty.call(requestInit, 'credentials')) {
    requestInit.credentials = 'include';
  }
  return requestInit;
};

export const authenticatedUploadsFetch = (input, init = {}) => {
  const requestUrl = resolveAuthenticatedUploadsUrl(input);
  const requestInit = buildAuthenticatedRequestInit(init);
  return fetch(requestUrl, requestInit);
};

const apiFetch = async (input, init = {}) => {
  const method = String(init?.method || 'GET').toUpperCase();
  const requestInit = { ...init };
  const requestTimeoutMs = Number(requestInit.requestTimeoutMs);
  const timeoutErrorMessage = typeof requestInit.timeoutErrorMessage === 'string'
    ? requestInit.timeoutErrorMessage.trim()
    : '';
  delete requestInit.requestTimeoutMs;
  delete requestInit.timeoutErrorMessage;
  const authenticatedRequestInit = buildAuthenticatedRequestInit(requestInit);
  if (method === 'GET' && !Object.prototype.hasOwnProperty.call(requestInit, 'cache')) {
    authenticatedRequestInit.cache = 'no-store';
  }
  const requestUrl = resolveAuthenticatedApiUrl(input);
  let controller = null;
  let timeoutId = null;
  let timedOut = false;
  let abortListener = null;
  if (Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0) {
    controller = new AbortController();
    const sourceSignal = authenticatedRequestInit.signal;
    if (sourceSignal) {
      if (sourceSignal.aborted) {
        controller.abort(sourceSignal.reason);
      } else {
        abortListener = () => controller.abort(sourceSignal.reason);
        sourceSignal.addEventListener('abort', abortListener, { once: true });
      }
    }
    authenticatedRequestInit.signal = controller.signal;
    timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);
  }
  try {
    const res = await fetch(requestUrl, authenticatedRequestInit);
    if (res.status === 401) {
      clearStoredSession();
      try {
        unauthorizedHandler?.();
      } catch {
        // Ignore errors inside the user-provided unauthorized handler.
      }
    }
    return res;
  } catch (error) {
    if (timedOut) {
      throw new Error(timeoutErrorMessage || 'Превышено время ожидания ответа сервера.');
    }
    throw error;
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    if (abortListener && init?.signal) {
      init.signal.removeEventListener('abort', abortListener);
    }
  }
};

const normalizeStudentChatMessagePayload = (payloadOrText) => {
  if (payloadOrText && typeof payloadOrText === 'object' && !Array.isArray(payloadOrText)) {
    return {
      text: typeof payloadOrText.text === 'string' ? payloadOrText.text : '',
      imageDataUrl: typeof payloadOrText.imageDataUrl === 'string' ? payloadOrText.imageDataUrl : '',
      imageName: typeof payloadOrText.imageName === 'string' ? payloadOrText.imageName : '',
      fileDataUrl: typeof payloadOrText.fileDataUrl === 'string' ? payloadOrText.fileDataUrl : '',
      fileName: typeof payloadOrText.fileName === 'string' ? payloadOrText.fileName : '',
      fileMimeType: typeof payloadOrText.fileMimeType === 'string' ? payloadOrText.fileMimeType : '',
      fileSize: Number.isFinite(Number(payloadOrText.fileSize)) ? Number(payloadOrText.fileSize) : 0,
      replyToMessageId: typeof payloadOrText.replyToMessageId === 'string' ? payloadOrText.replyToMessageId : '',
      forwardFrom: payloadOrText.forwardFrom && typeof payloadOrText.forwardFrom === 'object' && !Array.isArray(payloadOrText.forwardFrom)
        ? payloadOrText.forwardFrom
        : null,
    };
  }
  return {
    text: typeof payloadOrText === 'string' ? payloadOrText : '',
    imageDataUrl: '',
    imageName: '',
    fileDataUrl: '',
    fileName: '',
    fileMimeType: '',
    fileSize: 0,
    replyToMessageId: '',
    forwardFrom: null,
  };
};

const buildChatMessagesQuery = (options = {}) => {
  const params = new URLSearchParams();
  const limit = Number(options?.limit);
  if (Number.isFinite(limit) && limit > 0) {
    params.set('limit', String(Math.round(limit)));
  }
  const before = String(options?.before || options?.beforeId || '').trim();
  if (before) params.set('before', before);
  if (options?.markRead) params.set('markRead', '1');
  const teacherId = String(options?.teacherId || '').trim();
  if (teacherId) params.set('teacherId', teacherId);
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const uploadFileMemorySnapshot = async (id, file, itemCount = 0) => {
  const form = new FormData();
  form.append('file', file);
  form.append('itemCount', String(itemCount || 0));
  const res = await apiFetch(`/api/files/${id}/memory-snapshot`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
};

export const api = {
  getCurrentSession: async () => {
    const res = await apiFetch('/api/session');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentAvatar: async (avatarDataUrl) => {
    const res = await apiFetch('/api/students/avatar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarDataUrl }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateTeacherAvatar: async (avatarDataUrl) => {
    const res = await apiFetch('/api/teachers/avatar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarDataUrl }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  login: async (code) => {
    const res = await apiFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  signupLogin: async (name, teacherId = '', guestKey = '') => {
    const payload = { name };
    const normalizedTeacherId = typeof teacherId === 'string' ? teacherId.trim() : '';
    if (normalizedTeacherId) payload.teacherId = normalizedTeacherId;
    const normalizedGuestKey = typeof guestKey === 'string' ? guestKey.trim() : '';
    if (normalizedGuestKey) payload.guestKey = normalizedGuestKey;
    const res = await apiFetch('/api/signup/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  logout: async () => {
    const res = await apiFetch('/api/logout', { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getSignupChatMessages: async () => {
    const res = await apiFetch('/api/signup-chat/messages');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  sendSignupChatMessage: async (text) => {
    const res = await apiFetch('/api/signup-chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getSignupChats: async () => {
    const res = await apiFetch('/api/signup-chats');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getSignupChatMessagesForTeacher: async (chatId) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    if (!id) return { chat: null, messages: [] };
    const res = await apiFetch(`/api/signup-chats/${encodeURIComponent(id)}/messages`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  sendSignupChatMessageForTeacher: async (chatId, text) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    if (!id) throw new Error('chatId required');
    const res = await apiFetch(`/api/signup-chats/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateSignupChatMessageForTeacher: async (chatId, messageId, text) => {
    const chat = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    const message = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!chat) throw new Error('chatId required');
    if (!message) throw new Error('messageId required');
    const res = await apiFetch(`/api/signup-chats/${encodeURIComponent(chat)}/messages/${encodeURIComponent(message)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteSignupChatMessageForTeacher: async (chatId, messageId) => {
    const chat = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    const message = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!chat) throw new Error('chatId required');
    if (!message) throw new Error('messageId required');
    const res = await apiFetch(`/api/signup-chats/${encodeURIComponent(chat)}/messages/${encodeURIComponent(message)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteSignupChat: async (chatId) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    if (!id) throw new Error('chatId required');
    const res = await apiFetch(`/api/signup-chats/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentChatMessages: async (options = {}) => {
    const res = await apiFetch(`/api/student-chat/messages${buildChatMessagesQuery(options)}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentChatSummary: async () => {
    const res = await apiFetch('/api/student-chat/summary');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentChatNotificationSettings: async () => {
    const res = await apiFetch('/api/student-chat-notification-settings');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentChatNotificationSettings: async (patch = {}) => {
    const res = await apiFetch('/api/student-chat-notification-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentNavNewSummary: async () => {
    const res = await apiFetch('/api/student-nav-new-summary');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  markStudentNavSectionsRead: async (sections) => {
    const list = Array.isArray(sections) ? sections : [sections];
    const res = await apiFetch('/api/student-nav-new-summary/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections: list }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentHelpChannels: async () => {
    const res = await apiFetch('/api/student-help/channels');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  sendStudentHelpRequest: async (payload) => {
    const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const res = await apiFetch('/api/student-help-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: typeof source.requestId === 'string' ? source.requestId : '',
        channel: source.channel === 'telegram' ? 'telegram' : 'platform',
        taskNumber: source.taskNumber,
        taskTitle: typeof source.taskTitle === 'string' ? source.taskTitle : '',
        levelId: typeof source.levelId === 'string' ? source.levelId : '',
        questionId: typeof source.questionId === 'string' ? source.questionId : String(source.questionId ?? ''),
        question: typeof source.question === 'string' ? source.question : '',
        code: typeof source.code === 'string' ? source.code : '',
        snapshotDataUrl: typeof source.snapshotDataUrl === 'string' ? source.snapshotDataUrl : '',
        solutionImageDataUrl: typeof source.solutionImageDataUrl === 'string' ? source.solutionImageDataUrl : '',
        solutionImageName: typeof source.solutionImageName === 'string' ? source.solutionImageName : '',
      }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  sendStudentChatMessage: async (payloadOrText) => {
    const payload = normalizeStudentChatMessagePayload(payloadOrText);
    const res = await apiFetch('/api/student-chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentChatMessage: async (messageId, text) => {
    const id = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-chat/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteStudentChatMessage: async (messageId) => {
    const id = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-chat/messages/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  toggleStudentChatMessageReaction: async (messageId, emoji) => {
    const id = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-chat/messages/${encodeURIComponent(id)}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  pinStudentChatMessage: async (messageId) => {
    const id = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-chat/messages/${encodeURIComponent(id)}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentChats: async () => {
    const res = await apiFetch('/api/student-chats');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentChatMessagesForTeacher: async (chatId, options = {}) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    if (!id) return { chat: null, messages: [] };
    const res = await apiFetch(`/api/student-chats/${encodeURIComponent(id)}/messages${buildChatMessagesQuery(options)}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  sendStudentChatMessageForTeacher: async (chatId, payloadOrText) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    if (!id) throw new Error('chatId required');
    const payload = normalizeStudentChatMessagePayload(payloadOrText);
    const res = await apiFetch(`/api/student-chats/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentChatMessageForTeacher: async (chatId, messageId, text) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    const msgId = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('chatId required');
    if (!msgId) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-chats/${encodeURIComponent(id)}/messages/${encodeURIComponent(msgId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteStudentChatMessageForTeacher: async (chatId, messageId) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    const msgId = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('chatId required');
    if (!msgId) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-chats/${encodeURIComponent(id)}/messages/${encodeURIComponent(msgId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  toggleStudentChatMessageReactionForTeacher: async (chatId, messageId, emoji) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    const msgId = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('chatId required');
    if (!msgId) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-chats/${encodeURIComponent(id)}/messages/${encodeURIComponent(msgId)}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  pinStudentChatMessageForTeacher: async (chatId, messageId) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    const msgId = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('chatId required');
    if (!msgId) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-chats/${encodeURIComponent(id)}/messages/${encodeURIComponent(msgId)}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentSocialChatSettings: async (teacherId = '') => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    const qs = params.toString();
    const res = await apiFetch(`/api/student-social-chat-settings${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentSocialChatSettings: async (settings = {}, teacherId = '') => {
    const payload = { ...settings };
    if (teacherId) payload.teacherId = String(teacherId);
    const res = await apiFetch('/api/student-social-chat-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTeacherSocialGroupChat: async (teacherId = '', options = {}) => {
    const res = await apiFetch(`/api/teacher-social-group-chat${buildChatMessagesQuery({
      ...options,
      teacherId,
    })}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  sendTeacherSocialGroupChatMessage: async (payloadOrText, teacherId = '') => {
    const payload = normalizeStudentChatMessagePayload(payloadOrText);
    if (teacherId) payload.teacherId = String(teacherId);
    const res = await apiFetch('/api/teacher-social-group-chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateTeacherSocialGroupChatMessage: async (messageId, text, teacherId = '') => {
    const id = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('messageId required');
    const payload = { text };
    if (teacherId) payload.teacherId = String(teacherId);
    const res = await apiFetch(`/api/teacher-social-group-chat/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteTeacherSocialGroupChatMessage: async (messageId, teacherId = '') => {
    const id = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('messageId required');
    const qs = teacherId ? `?teacherId=${encodeURIComponent(String(teacherId))}` : '';
    const res = await apiFetch(`/api/teacher-social-group-chat/messages/${encodeURIComponent(id)}${qs}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  toggleTeacherSocialGroupChatMessageReaction: async (messageId, emoji, teacherId = '') => {
    const id = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('messageId required');
    const payload = { emoji };
    if (teacherId) payload.teacherId = String(teacherId);
    const res = await apiFetch(`/api/teacher-social-group-chat/messages/${encodeURIComponent(id)}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  pinTeacherSocialGroupChatMessage: async (messageId, teacherId = '') => {
    const id = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('messageId required');
    const payload = {};
    if (teacherId) payload.teacherId = String(teacherId);
    const res = await apiFetch(`/api/teacher-social-group-chat/messages/${encodeURIComponent(id)}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentSocialChats: async () => {
    const res = await apiFetch('/api/student-social-chats');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  openStudentSocialDirectChat: async (peerStudentId, options = {}) => {
    const id = typeof peerStudentId === 'string' ? peerStudentId.trim() : String(peerStudentId || '').trim();
    if (!id) throw new Error('peerStudentId required');
    const res = await apiFetch(`/api/student-social-chats/direct${buildChatMessagesQuery(options)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerStudentId: id }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentSocialChatMessages: async (chatId, options = {}) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    if (!id) return { chat: null, messages: [] };
    const res = await apiFetch(`/api/student-social-chats/${encodeURIComponent(id)}/messages${buildChatMessagesQuery(options)}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  sendStudentSocialChatMessage: async (chatId, payloadOrText) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    if (!id) throw new Error('chatId required');
    const payload = normalizeStudentChatMessagePayload(payloadOrText);
    const res = await apiFetch(`/api/student-social-chats/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentSocialChatMessage: async (chatId, messageId, text) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    const msgId = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('chatId required');
    if (!msgId) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-social-chats/${encodeURIComponent(id)}/messages/${encodeURIComponent(msgId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteStudentSocialChatMessage: async (chatId, messageId) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    const msgId = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('chatId required');
    if (!msgId) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-social-chats/${encodeURIComponent(id)}/messages/${encodeURIComponent(msgId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  toggleStudentSocialChatMessageReaction: async (chatId, messageId, emoji) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    const msgId = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('chatId required');
    if (!msgId) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-social-chats/${encodeURIComponent(id)}/messages/${encodeURIComponent(msgId)}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  pinStudentSocialChatMessage: async (chatId, messageId) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    const msgId = typeof messageId === 'string' ? messageId.trim() : String(messageId || '').trim();
    if (!id) throw new Error('chatId required');
    if (!msgId) throw new Error('messageId required');
    const res = await apiFetch(`/api/student-social-chats/${encodeURIComponent(id)}/messages/${encodeURIComponent(msgId)}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getPushPublicKey: async () => {
    const res = await apiFetch('/api/push/public-key');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getPushSubscriptionStatus: async () => {
    const res = await apiFetch('/api/push/subscription');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  sendPushTestNotification: async () => {
    const res = await apiFetch('/api/push/test', {
      method: 'POST',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getPushLessonReminderSetting: async (studentId = '') => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/push/lesson-reminder?${qs}` : '/api/push/lesson-reminder');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updatePushLessonReminderSetting: async (enabled, studentId = '') => {
    const payload = { enabled: Boolean(enabled) };
    if (studentId) payload.studentId = String(studentId);
    const res = await apiFetch('/api/push/lesson-reminder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getPushTeacherCalendarReminderSetting: async (teacherId = '') => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/push/teacher-calendar-reminder?${qs}` : '/api/push/teacher-calendar-reminder');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updatePushTeacherCalendarReminderSetting: async (enabled, teacherId = '') => {
    const payload = { enabled: Boolean(enabled) };
    if (teacherId) payload.teacherId = String(teacherId);
    const res = await apiFetch('/api/push/teacher-calendar-reminder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  savePushSubscription: async (subscriptionOrPayload) => {
    let payload = {};
    if (subscriptionOrPayload && typeof subscriptionOrPayload === 'object') {
      if (typeof subscriptionOrPayload.provider === 'string') {
        payload = { ...subscriptionOrPayload };
      } else {
        payload = { subscription: subscriptionOrPayload };
      }
    }
    const res = await apiFetch('/api/push/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      requestTimeoutMs: 12000,
      timeoutErrorMessage: 'Сервер слишком долго сохраняет push-токен. Попробуйте ещё раз.',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deletePushSubscription: async (endpointOrPayload = '') => {
    let body = {};
    if (endpointOrPayload && typeof endpointOrPayload === 'object') {
      body = { ...endpointOrPayload };
      if (typeof body.endpoint === 'string') body.endpoint = body.endpoint.trim();
      if (typeof body.token === 'string') body.token = body.token.trim();
      if (typeof body.provider === 'string') body.provider = body.provider.trim();
    } else {
      const normalizedEndpoint = String(endpointOrPayload || '').trim();
      body = normalizedEndpoint ? { endpoint: normalizedEndpoint } : {};
    }
    const res = await apiFetch('/api/push/subscription', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      requestTimeoutMs: 12000,
      timeoutErrorMessage: 'Сервер слишком долго отключает push-подписку. Попробуйте ещё раз.',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudents: async (teacherId, options = {}) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', teacherId);
    if (options?.includeDeleted) params.append('includeDeleted', '1');
    if (options?.deletedOnly) params.append('deletedOnly', '1');
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/students?${qs}` : '/api/students');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getStudentsLeaderboard: async (teacherIdOrOptions = '', maybeOptions = {}) => {
    const options = teacherIdOrOptions && typeof teacherIdOrOptions === 'object'
      ? teacherIdOrOptions
      : { ...maybeOptions, teacherId: teacherIdOrOptions };
    const params = new URLSearchParams();
    if (options?.teacherId) params.append('teacherId', String(options.teacherId));
    if (options?.studentId) params.append('studentId', String(options.studentId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/students/leaderboard?${qs}` : '/api/students/leaderboard');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getLeaderboardStudentProfile: async (studentId) => {
    const normalizedStudentId = String(studentId || '').trim();
    if (!normalizedStudentId) throw new Error('studentId required');
    const qs = new URLSearchParams({ studentId: normalizedStudentId }).toString();
    const res = await apiFetch(`/api/students/leaderboard-profile?${qs}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  setLeaderboardAlias: async (payload) => {
    const bodyPayload = typeof payload === 'string'
      ? { alias: payload }
      : (payload && typeof payload === 'object' ? payload : {});
    const res = await apiFetch('/api/students/leaderboard-alias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  setProfileTheme: async (themeId) => {
    const res = await apiFetch('/api/students/profile-theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeId: String(themeId || '').trim() }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  startMockTimerChestOpening: async (chestId) => {
    const normalizedChestId = String(chestId || '').trim();
    if (!normalizedChestId) throw new Error('chestId required');
    const res = await apiFetch(`/api/students/mock-timer-chests/${encodeURIComponent(normalizedChestId)}/start`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  prepareMockTimerChestOpening: async (chestId) => {
    const normalizedChestId = String(chestId || '').trim();
    if (!normalizedChestId) throw new Error('chestId required');
    const res = await apiFetch(`/api/students/mock-timer-chests/${encodeURIComponent(normalizedChestId)}/prepare`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  claimMockTimerChest: async (chestId) => {
    const normalizedChestId = String(chestId || '').trim();
    if (!normalizedChestId) throw new Error('chestId required');
    const res = await apiFetch(`/api/students/mock-timer-chests/${encodeURIComponent(normalizedChestId)}/claim`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  spinArtifactAltar: async () => {
    const res = await apiFetch('/api/students/altar/spin', {
      method: 'POST',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  upgradeArtifact: async (artifactId) => {
    const res = await apiFetch('/api/students/altar/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactId }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  createStudent: async (name, teacherId, options = {}) => {
    const payload = options && typeof options === 'object' && !Array.isArray(options)
      ? { ...options }
      : { grade: options };
    const res = await apiFetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, teacherId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteStudent: async (id) => {
    const res = await apiFetch(`/api/students/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  restoreStudent: async (id) => {
    const res = await apiFetch(`/api/students/${id}/restore`, { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateStudent: async (id, payload) => {
    const res = await apiFetch(`/api/students/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getTelemostSettings: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.set('studentId', String(studentId));
    params.set('_ts', String(Date.now()));
    const res = await apiFetch(`/api/telemost?${params.toString()}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  notifyTelemostJoin: async (options = {}) => {
    const occurrenceKey = String(options?.occurrenceKey || '').trim();
    const res = await apiFetch('/api/telemost/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occurrenceKey }),
      keepalive: true,
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  activateTelemostLesson: async (studentId, occurrenceKey = '') => {
    const res = await apiFetch('/api/telemost/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: String(studentId || '').trim(),
        occurrenceKey: String(occurrenceKey || '').trim(),
      }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  acceptTelemostJoin: async (studentId, requestId) => {
    const res = await apiFetch('/api/telemost/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: String(studentId || '').trim(),
        requestId: String(requestId || '').trim(),
      }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  resetStudentCode: async (id) => {
    const res = await apiFetch(`/api/students/${id}/reset-code`, { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  resetStudentBoard: async (studentId) => {
    const normalizedStudentId = typeof studentId === 'string'
      ? studentId.trim()
      : String(studentId || '').trim();
    if (!normalizedStudentId) throw new Error('studentId required');
    const res = await apiFetch('/api/board/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: normalizedStudentId }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTeachers: async () => {
    const res = await apiFetch('/api/teachers');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  createTeacher: async (name) => {
    const res = await apiFetch('/api/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateTeacherName: async (id, name) => {
    const res = await apiFetch(`/api/teachers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteTeacher: async (id) => {
    const res = await apiFetch(`/api/teachers/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  resetTeacherCode: async (id) => {
    const res = await apiFetch(`/api/teachers/${id}/reset-code`, { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateTeacherCode: async (teacherId, currentCode, newCode) => {
    const res = await apiFetch('/api/teacher-code', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId, currentCode, newCode }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getTests: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/tests?${qs}` : '/api/tests');
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = await parseJsonResponse(res);
    return data && typeof data === 'object' ? data : {};
  },
  saveTests: async (newDb) => {
    const res = await apiFetch('/api/tests', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDb),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getMockExams: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/mock-exams?${qs}` : '/api/mock-exams');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  createRandomMockExam: async (requestId, options = {}) => {
    const levelId = String(options?.levelId || 'basic').trim().toLowerCase();
    const res = await apiFetch('/api/mock-exams/random', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: String(requestId || '').trim(),
        levelId,
      }),
      signal: options?.signal,
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  createMockExam: async (title) => {
    const res = await apiFetch('/api/mock-exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateMockExam: async (id, payload) => {
    const res = await apiFetch(`/api/mock-exams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteMockExamDefinition: async (id) => {
    const res = await apiFetch(`/api/mock-exams/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getMockAttempt: async (studentId, examId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    if (examId) params.append('examId', String(examId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/mock-exams/attempt?${qs}` : '/api/mock-exams/attempt');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  saveMockAttempt: async (studentId, examId, payload) => {
    const res = await apiFetch('/api/mock-exams/attempt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, examId, ...(payload || {}) }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  startMockAttempt: async (studentId, examId, payload) => {
    const res = await apiFetch('/api/mock-exams/attempt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, examId, startOnly: true, ...(payload || {}) }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  pauseMockAttempt: async (studentId, examId, payload) => {
    const res = await apiFetch('/api/mock-exams/attempt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, examId, pauseTimerExam: true, ...(payload || {}) }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  resumeMockAttempt: async (studentId, examId, payload) => {
    const res = await apiFetch('/api/mock-exams/attempt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, examId, startOnly: true, resumeTimerExam: true, ...(payload || {}) }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  restoreMockTimerRewards: async (studentId, examId) => {
    const res = await apiFetch('/api/mock-exams/attempt/timer-rewards', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, examId }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  continueMockTimerAttempt: async (studentId, examId) => {
    const res = await apiFetch('/api/mock-exams/attempt/continue-timer', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, examId }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTaskTitles: async () => {
    const res = await apiFetch('/api/task-titles');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateTaskTitle: async (number, title) => {
    const res = await apiFetch('/api/task-titles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, title }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentProgress: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/progress?${qs}` : '/api/progress');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateStudentProgress: async (studentId, taskId, value) => {
    const res = await apiFetch('/api/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, taskId, value }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getStudentData: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/student-data?${qs}` : '/api/student-data');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentNotes: async (studentId, payload) => {
    const res = await apiFetch('/api/student-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTeacherSolvedEvents: async (teacherId, since, limit) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    if (since) params.append('since', String(since));
    if (limit) params.append('limit', String(limit));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/teacher-solved-events?${qs}` : '/api/teacher-solved-events');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  markTeacherSolvedEventsRead: async (teacherId, eventIds = []) => {
    const ids = Array.isArray(eventIds)
      ? eventIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)
      : [];
    if (!teacherId || ids.length === 0) return { ok: true };
    const res = await apiFetch('/api/teacher-solved-events/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: String(teacherId), eventIds: ids }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  markAllTeacherSolvedEventsRead: async (teacherId, before = null) => {
    const id = typeof teacherId === 'string' ? teacherId.trim() : String(teacherId || '').trim();
    if (!id) return { ok: true };
    const payload = { teacherId: id, markAll: true };
    if (before !== null && typeof before !== 'undefined') {
      payload.before = before;
    }
    const res = await apiFetch('/api/teacher-solved-events/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentHomework: async (studentId, homeworkId, payload) => {
    const res = await apiFetch(`/api/student-next-lesson/${homeworkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentHomeworkDraft: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    params.append('_ts', String(Date.now()));
    const res = await apiFetch(`/api/homework-composer-draft?${params.toString()}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  saveStudentHomeworkDraft: async (studentId, draft) => {
    const res = await apiFetch('/api/homework-composer-draft', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, draft }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteStudentHomeworkDraft: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    const res = await apiFetch(`/api/homework-composer-draft?${params.toString()}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentHomeworkChecklistItem: async (homeworkId, itemId, completed) => {
    const res = await apiFetch(`/api/student-next-lesson/${encodeURIComponent(homeworkId)}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, completed: Boolean(completed) }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteStudentHomework: async (studentId, homeworkId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(
      qs ? `/api/student-next-lesson/${homeworkId}?${qs}` : `/api/student-next-lesson/${homeworkId}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  solveQuestion: async (payload) => {
    const res = await apiFetch('/api/progress/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getSolvedQuestions: async (studentId, taskNumber, levelId, options = {}) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (levelId) params.append('levelId', String(levelId));
    if (options?.includeCode) params.append('includeCode', '1');
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/progress/solved?${qs}` : '/api/progress/solved');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getSolvedAnswers: async (studentId, taskNumber, levelId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (levelId) params.append('levelId', String(levelId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/progress/solved-answers?${qs}` : '/api/progress/solved-answers');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getAnswerHistory: async (studentId, taskNumber, levelId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (levelId) params.append('levelId', String(levelId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/progress/answer-history?${qs}` : '/api/progress/answer-history');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTaskCode: async (studentId, taskNumber) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/progress/task-code?${qs}` : '/api/progress/task-code');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  saveTaskCode: async (studentId, taskNumber, payload = {}) => {
    const res = await apiFetch('/api/progress/task-code', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, taskNumber, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getQuestionCode: async (studentId, taskNumber, levelId, questionId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (levelId) params.append('levelId', String(levelId));
    if (questionId !== undefined && questionId !== null) params.append('questionId', String(questionId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/progress/question-code?${qs}` : '/api/progress/question-code');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  saveQuestionCode: async (studentId, taskNumber, levelId, questionId, payload = {}) => {
    const res = await apiFetch('/api/progress/question-code', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, taskNumber, levelId, questionId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  addMockExam: async (studentId, payload) => {
    const res = await apiFetch('/api/mocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteMockExam: async (studentId, id) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/mocks/${id}?${qs}` : `/api/mocks/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  uploadTestFile: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await apiFetch('/api/test-files', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteTestFile: async (storageName) => {
    if (!storageName) return { ok: true };
    const res = await apiFetch(`/api/test-files/${encodeURIComponent(storageName)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getBroadcastNotifications: async () => {
    const res = await apiFetch('/api/broadcast-notifications');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  createBroadcastNotification: async (payload) => {
    const body = payload && typeof payload === 'object' ? payload : {};
    const res = await apiFetch('/api/broadcast-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  markBroadcastNotificationSeen: async (id) => {
    const targetId = encodeURIComponent(String(id || '').trim());
    const res = await apiFetch(`/api/broadcast-notifications/${targetId}/seen`, {
      method: 'PATCH',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  claimBroadcastNotificationGift: async (id) => {
    const targetId = encodeURIComponent(String(id || '').trim());
    const res = await apiFetch(`/api/broadcast-notifications/${targetId}/claim-gift`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteBroadcastNotification: async (id) => {
    const targetId = encodeURIComponent(String(id || '').trim());
    const res = await apiFetch(`/api/broadcast-notifications/${targetId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  uploadBroadcastNotificationAsset: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await apiFetch('/api/test-files', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteBroadcastNotificationAsset: async (storageName) => {
    if (!storageName) return { ok: true };
    const res = await apiFetch(`/api/test-files/${encodeURIComponent(storageName)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getFinalReviewVideos: async () => {
    const res = await apiFetch('/api/final-review-videos');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateFinalReviewVideo: async (sessionId, youtubeUrl) => {
    const targetId = encodeURIComponent(String(sessionId || '').trim());
    if (!targetId) throw new Error('sessionId required');
    const res = await apiFetch(`/api/final-review-videos/${targetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtubeUrl }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getFinalReviewNotes: async (studentId = '') => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/final-review-notes?${qs}` : '/api/final-review-notes');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateFinalReviewNotes: async (notes = {}) => {
    const res = await apiFetch('/api/final-review-notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentSchedule: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/student-schedule?${qs}` : '/api/student-schedule');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getLessonTopics: async (studentId, options = {}) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    if (options?.from) params.append('from', String(options.from));
    if (options?.to) params.append('to', String(options.to));
    params.append('_ts', String(Date.now()));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/lesson-topics?${qs}` : '/api/lesson-topics');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getLessonHistory: async (studentId, options = {}) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    if (Number.isFinite(Number(options?.offset))) params.append('offset', String(Math.max(0, Math.floor(Number(options.offset)))));
    if (Number.isFinite(Number(options?.limit))) params.append('limit', String(Math.max(1, Math.floor(Number(options.limit)))));
    params.append('_ts', String(Date.now()));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/lesson-history?${qs}` : '/api/lesson-history');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getLessonHistoryDetail: async (studentId, occurrenceKey) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', String(studentId));
    if (occurrenceKey) params.append('occurrenceKey', String(occurrenceKey));
    params.append('_ts', String(Date.now()));
    const res = await apiFetch(`/api/lesson-history/detail?${params.toString()}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getLessonReplayActivity: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.set('studentId', String(studentId));
    params.set('_ts', String(Date.now()));
    const res = await apiFetch(`/api/lesson-replay/activity?${params.toString()}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  finishLessonReplayLesson: async (studentId, occurrenceKey = '') => {
    const res = await apiFetch('/api/lesson-replay/lesson/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: String(studentId || '').trim(),
        occurrenceKey: String(occurrenceKey || '').trim(),
      }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  startLessonReplaySession: async (studentId, options = {}) => {
    const via = options?.via === 'telemost' ? 'telemost' : 'platform';
    const occurrenceKey = String(options?.occurrenceKey || '').trim();
    const res = await apiFetch('/api/lesson-replay/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, via, occurrenceKey }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  switchLessonReplaySession: async (sessionId, via) => {
    const res = await apiFetch('/api/lesson-replay/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: String(sessionId || '').trim(),
        via: via === 'telemost' ? 'telemost' : 'platform',
      }),
    });
    if (!res.ok) {
      const error = new Error(await parseApiError(res));
      error.status = res.status;
      throw error;
    }
    return parseJsonResponse(res);
  },
  appendLessonReplayEvents: async (sessionId, events = [], options = {}) => {
    const res = await apiFetch('/api/lesson-replay/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, events }),
      keepalive: Boolean(options.keepalive),
    });
    if (!res.ok) {
      const error = new Error(await parseApiError(res));
      error.status = res.status;
      throw error;
    }
    return parseJsonResponse(res);
  },
  finishLessonReplaySession: async (sessionId, options = {}) => {
    const res = await apiFetch('/api/lesson-replay/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, events: Array.isArray(options.events) ? options.events : [] }),
      keepalive: Boolean(options.keepalive),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateLessonTopic: async (studentId, occurrence = {}, text = '') => {
    const res = await apiFetch('/api/lesson-topics', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId,
        dayKey: occurrence?.dayKey,
        time: occurrence?.time,
        durationMinutes: occurrence?.durationMinutes,
        text,
      }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTeacherSchedule: async (teacherId) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/teacher-schedule?${qs}` : '/api/teacher-schedule');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTeacherCalendarMarks: async (teacherId) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/teacher-calendar-marks?${qs}` : '/api/teacher-calendar-marks');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateTeacherCalendarMarks: async (payload = {}, teacherId) => {
    const body = payload && typeof payload === 'object' ? { ...payload } : {};
    if (teacherId) body.teacherId = String(teacherId);
    const res = await apiFetch('/api/teacher-calendar-marks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getPaymentNotifications: async (teacherId = '') => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/payment-notifications?${qs}` : '/api/payment-notifications');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getPaymentSenderLinks: async (teacherId = '') => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/payment-sender-links?${qs}` : '/api/payment-sender-links');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updatePaymentSenderLink: async (payload = {}, teacherId = '') => {
    const body = payload && typeof payload === 'object' ? { ...payload } : {};
    if (teacherId) body.teacherId = String(teacherId);
    const res = await apiFetch('/api/payment-sender-links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTeacherCalendarSync: async (teacherId) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/teacher-calendar-sync?${qs}` : '/api/teacher-calendar-sync');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateTeacherCalendarSync: async (payload = {}, teacherId) => {
    const body = payload && typeof payload === 'object' ? { ...payload } : {};
    if (teacherId) body.teacherId = String(teacherId);
    const res = await apiFetch('/api/teacher-calendar-sync', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  refreshTeacherCalendarSync: async (teacherId) => {
    const body = {};
    if (teacherId) body.teacherId = String(teacherId);
    const res = await apiFetch('/api/teacher-calendar-sync/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  syncStudentScheduleFromGoogle: async (studentId) => {
    const body = {};
    if (studentId) body.studentId = String(studentId);
    const res = await apiFetch('/api/student-schedule/google-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  addTeacherScheduleEntry: async (payload, teacherId) => {
    const body = payload && typeof payload === 'object' ? { ...payload } : {};
    if (teacherId) body.teacherId = String(teacherId);
    const res = await apiFetch('/api/teacher-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateTeacherScheduleEntry: async (id, payload, teacherId) => {
    const body = payload && typeof payload === 'object' ? { ...payload } : {};
    if (teacherId) body.teacherId = String(teacherId);
    const targetId = encodeURIComponent(String(id || '').trim());
    const res = await apiFetch(`/api/teacher-schedule/${targetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteTeacherScheduleEntry: async (id, teacherId) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    const qs = params.toString();
    const targetId = encodeURIComponent(String(id || '').trim());
    const res = await apiFetch(
      qs ? `/api/teacher-schedule/${targetId}?${qs}` : `/api/teacher-schedule/${targetId}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTeacherFinance: async (month, teacherId = '') => {
    const params = new URLSearchParams();
    if (month) params.append('month', String(month));
    if (teacherId) params.append('teacherId', String(teacherId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/teacher-finance?${qs}` : '/api/teacher-finance');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateTeacherFinanceMonth: async (payload, teacherId = '') => {
    const body = payload && typeof payload === 'object' ? { ...payload } : {};
    if (teacherId) body.teacherId = String(teacherId);
    const res = await apiFetch('/api/teacher-finance/month', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateTeacherFinanceStudent: async (studentId, payload, teacherId = '') => {
    const targetId = encodeURIComponent(String(studentId || '').trim());
    const body = payload && typeof payload === 'object' ? { ...payload } : {};
    if (teacherId) body.teacherId = String(teacherId);
    const res = await apiFetch(`/api/teacher-finance/students/${targetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentScheduleRequests: async (params = {}) => {
    const search = new URLSearchParams();
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([key, value]) => {
        const normalized = typeof value === 'string' ? value.trim() : String(value || '').trim();
        if (normalized) search.append(key, normalized);
      });
    }
    const qs = search.toString();
    const res = await apiFetch(qs ? `/api/student-schedule-requests?${qs}` : '/api/student-schedule-requests');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  createStudentScheduleRequest: async (payload) => {
    const body = payload && typeof payload === 'object' ? payload : {};
    const res = await apiFetch('/api/student-schedule-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  resolveStudentScheduleRequest: async (id, action, resolutionNote = '') => {
    const requestId = encodeURIComponent(String(id || '').trim());
    const res = await apiFetch(`/api/student-schedule-requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, resolutionNote }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  addScheduleEntry: async (studentId, payload) => {
    const res = await apiFetch('/api/student-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateScheduleEntry: async (studentId, id, payload) => {
    const res = await apiFetch(`/api/student-schedule/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteScheduleEntry: async (studentId, id) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/student-schedule/${id}?${qs}` : `/api/student-schedule/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getStudentNextLesson: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    params.append('_ts', String(Date.now()));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/student-next-lesson?${qs}` : '/api/student-next-lesson');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentNextLesson: async (studentId, payload) => {
    const res = await apiFetch('/api/student-next-lesson', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getFiles: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    params.append('_ts', String(Date.now()));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/files?${qs}` : '/api/files');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  searchStudentContent: async (query, studentId, options = {}) => {
    const params = new URLSearchParams();
    params.append('q', String(query || '').trim());
    if (studentId) params.append('studentId', String(studentId));
    if (Number.isFinite(Number(options?.limit))) {
      params.append('limit', String(Math.max(1, Math.min(50, Math.floor(Number(options.limit))))));
    }
    params.append('_ts', String(Date.now()));
    const res = await apiFetch(`/api/student-search?${params.toString()}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getFolders: async (taskNumber, category, studentId) => {
    const params = new URLSearchParams();
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (category) params.append('category', category);
    if (studentId) params.append('studentId', studentId);
    params.append('_ts', String(Date.now()));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/folders?${qs}` : '/api/folders');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  createFolder: async (taskNumber, category, name, studentId, parentFolderId = null) => {
    const payload = { taskNumber, category, name, studentId };
    if (parentFolderId) payload.parentFolderId = String(parentFolderId);
    const res = await apiFetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  renameFolder: async (id, name) => {
    const res = await apiFetch(`/api/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteFolder: async (id) => {
    const res = await apiFetch(`/api/folders/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  uploadFile: async (file, taskNumber, category, folderId, studentId, options = {}) => {
    const form = new FormData();
    form.append('file', file);
    form.append('taskNumber', String(taskNumber));
    form.append('category', category);
    form.append('studentId', studentId);
    if (folderId) form.append('folderId', folderId);
    if (options?.source) form.append('source', String(options.source));
    if (options?.memory && typeof options.memory === 'object') {
      form.append('memory', JSON.stringify(options.memory));
    }

    const res = await apiFetch('/api/files', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  uploadBoardAsset: async (file, studentId) => {
    const form = new FormData();
    form.append('file', file);
    if (studentId) form.append('studentId', String(studentId));
    const res = await apiFetch('/api/board-assets', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteFile: async (id) => {
    const res = await apiFetch(`/api/files/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  renameFile: async (id, name) => {
    const res = await apiFetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  moveFile: async (id, folderId) => {
    const res = await apiFetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateFileContent: async (id, content) => {
    const res = await apiFetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateFileMemory: async (id, memory) => {
    const res = await apiFetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateFileLessonShared: async (id, lessonShared) => {
    const res = await apiFetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonShared: Boolean(lessonShared) }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateFileLessonShareMode: async (id, lessonShareMode) => {
    const res = await apiFetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonShareMode: String(lessonShareMode || '').trim() }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  uploadFileMemorySnapshot,
};


