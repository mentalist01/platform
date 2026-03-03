import { clearStoredSession } from '../utils/theme';

const parseApiError = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      if (data?.error) return data.error;
    } catch {}
  }
  try {
    const text = await res.text();
    if (text && text.length <= 200) return text;
  } catch {}
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
      throw new Error('Сервер не отвечает (HTML вместо JSON). Перезапустите backend.');
    }
    throw new Error('Некорректный ответ сервера');
  }
  return res.json();
};

let unauthorizedHandler = null;

export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
};

const apiFetch = async (input, init = {}) => {
  const method = String(init?.method || 'GET').toUpperCase();
  const requestInit = { ...init };
  if (method === 'GET' && !Object.prototype.hasOwnProperty.call(requestInit, 'cache')) {
    requestInit.cache = 'no-store';
  }
  const res = await fetch(input, requestInit);
  if (res.status === 401) {
    clearStoredSession();
    try {
      unauthorizedHandler?.();
    } catch {}
  }
  return res;
};

const normalizeStudentChatMessagePayload = (payloadOrText) => {
  if (payloadOrText && typeof payloadOrText === 'object' && !Array.isArray(payloadOrText)) {
    return {
      text: typeof payloadOrText.text === 'string' ? payloadOrText.text : '',
      imageDataUrl: typeof payloadOrText.imageDataUrl === 'string' ? payloadOrText.imageDataUrl : '',
      imageName: typeof payloadOrText.imageName === 'string' ? payloadOrText.imageName : '',
    };
  }
  return {
    text: typeof payloadOrText === 'string' ? payloadOrText : '',
    imageDataUrl: '',
    imageName: '',
  };
};

export const api = {
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
  getStudentChatMessages: async () => {
    const res = await apiFetch('/api/student-chat/messages');
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
  getStudentChats: async () => {
    const res = await apiFetch('/api/student-chats');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentChatMessagesForTeacher: async (chatId) => {
    const id = typeof chatId === 'string' ? chatId.trim() : String(chatId || '').trim();
    if (!id) return { chat: null, messages: [] };
    const res = await apiFetch(`/api/student-chats/${encodeURIComponent(id)}/messages`);
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
  savePushSubscription: async (subscription) => {
    const payload = subscription && typeof subscription === 'object'
      ? { subscription }
      : {};
    const res = await apiFetch('/api/push/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deletePushSubscription: async (endpoint = '') => {
    const normalizedEndpoint = String(endpoint || '').trim();
    const body = normalizedEndpoint ? { endpoint: normalizedEndpoint } : {};
    const res = await apiFetch('/api/push/subscription', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
  getStudentsLeaderboard: async (teacherId) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/students/leaderboard?${qs}` : '/api/students/leaderboard');
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
  createStudent: async (name, teacherId) => {
    const res = await apiFetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, teacherId }),
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
  resetStudentCode: async (id) => {
    const res = await apiFetch(`/api/students/${id}/reset-code`, { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
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
  getTests: async () => {
    const res = await apiFetch('/api/tests');
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
  getStudentSchedule: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await apiFetch(qs ? `/api/student-schedule?${qs}` : '/api/student-schedule');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
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
  createFolder: async (taskNumber, category, name, studentId) => {
    const res = await apiFetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskNumber, category, name, studentId }),
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
  uploadFile: async (file, taskNumber, category, folderId, studentId) => {
    const form = new FormData();
    form.append('file', file);
    form.append('taskNumber', String(taskNumber));
    form.append('category', category);
    form.append('studentId', studentId);
    if (folderId) form.append('folderId', folderId);

    const res = await apiFetch('/api/files', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
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
  }
};


