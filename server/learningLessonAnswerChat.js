const MAX_MESSAGE_LENGTH = 1200;
const MAX_STORE_MESSAGES = 20000;

const cleanText = (value, maxLength = MAX_MESSAGE_LENGTH) => String(value || '').trim().slice(0, maxLength);

export const normalizeLearningLessonAnswerMessage = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 180);
  const groupId = cleanText(value.groupId, 180);
  const lessonId = cleanText(value.lessonId, 180);
  const senderId = cleanText(value.senderId, 180);
  const senderRole = cleanText(value.senderRole, 30).toLowerCase();
  const text = cleanText(value.text);
  const createdAtMs = Date.parse(String(value.createdAt || '').trim());
  if (!id || !groupId || !lessonId || !senderId || !['teacher', 'student'].includes(senderRole) || !text) return null;
  return {
    id,
    groupId,
    lessonId,
    senderId,
    senderRole,
    senderName: cleanText(value.senderName, 160) || (senderRole === 'teacher' ? 'Учитель' : 'Ученик'),
    text,
    createdAt: Number.isFinite(createdAtMs) ? new Date(createdAtMs).toISOString() : new Date(0).toISOString(),
  };
};

export const normalizeLearningLessonAnswerMessages = (value) => {
  const source = Array.isArray(value) ? value : [];
  const byId = new Map();
  source.forEach((entry) => {
    const normalized = normalizeLearningLessonAnswerMessage(entry);
    if (normalized) byId.set(normalized.id, normalized);
  });
  return Array.from(byId.values())
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id))
    .slice(-MAX_STORE_MESSAGES);
};

export const createLearningLessonAnswerMessage = ({
  id,
  groupId,
  lessonId,
  senderId,
  senderRole,
  senderName,
  text,
  createdAt = new Date().toISOString(),
} = {}) => {
  const normalizedText = cleanText(text);
  if (!normalizedText) throw new Error('Введите ответ.');
  const message = normalizeLearningLessonAnswerMessage({
    id,
    groupId,
    lessonId,
    senderId,
    senderRole,
    senderName,
    text: normalizedText,
    createdAt,
  });
  if (!message) throw new Error('Не удалось сохранить ответ.');
  return message;
};

export const filterLearningLessonAnswerMessages = (messages, viewer) => {
  const normalized = normalizeLearningLessonAnswerMessages(messages);
  const role = cleanText(viewer?.role, 30).toLowerCase();
  const viewerId = cleanText(viewer?.id, 180);
  if (role === 'teacher' || role === 'admin') return normalized;
  if (role !== 'student' || !viewerId) return [];
  return normalized.filter((message) => (
    message.senderRole === 'teacher' || message.senderId === viewerId
  ));
};

export const LEARNING_LESSON_ANSWER_MESSAGE_MAX_LENGTH = MAX_MESSAGE_LENGTH;
