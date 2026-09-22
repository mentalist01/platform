const MAX_MESSAGE_LENGTH = 4000;
const MAX_POLL_QUESTION_LENGTH = 600;
const MAX_POLL_OPTION_LENGTH = 240;
const MAX_POLL_OPTIONS = 10;
const MAX_STORE_MESSAGES = 30000;

const cleanText = (value, maxLength = MAX_MESSAGE_LENGTH) => String(value ?? '')
  .replace(/\0/g, '')
  .trim()
  .slice(0, maxLength);

const normalizeIsoTimestamp = (value, fallback = '') => {
  const parsed = Date.parse(cleanText(value, 80));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
};

const normalizeIds = (value, limit = MAX_POLL_OPTIONS) => {
  const result = [];
  const seen = new Set();
  (Array.isArray(value) ? value : []).forEach((entry) => {
    const id = cleanText(entry, 180);
    if (!id || seen.has(id) || result.length >= limit) return;
    seen.add(id);
    result.push(id);
  });
  return result;
};

const normalizePoll = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const question = cleanText(value.question, MAX_POLL_QUESTION_LENGTH);
  const options = [];
  const optionIds = new Set();
  (Array.isArray(value.options) ? value.options : []).slice(0, MAX_POLL_OPTIONS).forEach((entry, index) => {
    const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : { text: entry };
    const id = cleanText(source.id, 180) || `option-${index + 1}`;
    const text = cleanText(source.text, MAX_POLL_OPTION_LENGTH);
    if (!text || optionIds.has(id)) return;
    optionIds.add(id);
    options.push({ id, text });
  });
  if (!question || options.length < 2) return null;
  const votesByUserId = {};
  const rawVotes = value.votesByUserId && typeof value.votesByUserId === 'object' && !Array.isArray(value.votesByUserId)
    ? value.votesByUserId
    : {};
  Object.entries(rawVotes).forEach(([userIdValue, selected]) => {
    const userId = cleanText(userIdValue, 180);
    let selectedIds = normalizeIds(selected).filter((id) => optionIds.has(id));
    if (!value.allowMultiple) selectedIds = selectedIds.slice(0, 1);
    if (userId && selectedIds.length) votesByUserId[userId] = selectedIds;
  });
  return {
    question,
    options,
    allowMultiple: Boolean(value.allowMultiple),
    closed: Boolean(value.closed),
    votesByUserId,
  };
};

export const normalizeLearningGroupChatMessage = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 180);
  const groupId = cleanText(value.groupId, 180);
  const senderId = cleanText(value.senderId, 180);
  const senderRole = cleanText(value.senderRole, 30).toLowerCase();
  const type = cleanText(value.type, 30).toLowerCase() === 'poll' ? 'poll' : 'text';
  const createdAt = normalizeIsoTimestamp(value.createdAt, new Date(0).toISOString());
  const updatedAt = normalizeIsoTimestamp(value.updatedAt, createdAt);
  if (!id || !groupId || !senderId || !['teacher', 'student'].includes(senderRole)) return null;
  const base = {
    id,
    groupId,
    type,
    senderId,
    senderRole,
    senderName: cleanText(value.senderName, 160) || (senderRole === 'teacher' ? 'Учитель' : 'Ученик'),
    createdAt,
    updatedAt,
  };
  if (type === 'poll') {
    const poll = normalizePoll(value.poll);
    return poll ? { ...base, poll } : null;
  }
  const text = cleanText(value.text);
  return text ? { ...base, text } : null;
};

export const normalizeLearningGroupChatMessages = (value) => {
  const byId = new Map();
  (Array.isArray(value) ? value : []).forEach((entry) => {
    const normalized = normalizeLearningGroupChatMessage(entry);
    if (normalized) byId.set(normalized.id, normalized);
  });
  return Array.from(byId.values())
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id))
    .slice(-MAX_STORE_MESSAGES);
};

export const createLearningGroupChatMessage = ({
  id,
  groupId,
  senderId,
  senderRole,
  senderName,
  type = 'text',
  text,
  poll,
  createdAt = new Date().toISOString(),
} = {}) => {
  const normalizedType = cleanText(type, 30).toLowerCase() === 'poll' ? 'poll' : 'text';
  const message = normalizeLearningGroupChatMessage({
    id,
    groupId,
    senderId,
    senderRole,
    senderName,
    type: normalizedType,
    text,
    poll,
    createdAt,
    updatedAt: createdAt,
  });
  if (!message) {
    throw new Error(normalizedType === 'poll'
      ? 'Добавьте вопрос и хотя бы два варианта ответа.'
      : 'Введите сообщение.');
  }
  return message;
};

export const voteInLearningGroupPoll = (message, userIdValue, selectedOptionIds, now = new Date().toISOString()) => {
  const normalized = normalizeLearningGroupChatMessage(message);
  const userId = cleanText(userIdValue, 180);
  if (!normalized || normalized.type !== 'poll') throw new Error('Опрос не найден.');
  if (normalized.poll.closed) throw new Error('Опрос уже завершён.');
  if (!userId) throw new Error('Не удалось определить участника.');
  const allowed = new Set(normalized.poll.options.map((option) => option.id));
  let selected = normalizeIds(selectedOptionIds).filter((id) => allowed.has(id));
  if (!normalized.poll.allowMultiple) selected = selected.slice(0, 1);
  const votesByUserId = { ...normalized.poll.votesByUserId };
  if (selected.length) votesByUserId[userId] = selected;
  else delete votesByUserId[userId];
  return normalizeLearningGroupChatMessage({
    ...normalized,
    poll: { ...normalized.poll, votesByUserId },
    updatedAt: now,
  });
};

export const setLearningGroupPollClosed = (message, closed, now = new Date().toISOString()) => {
  const normalized = normalizeLearningGroupChatMessage(message);
  if (!normalized || normalized.type !== 'poll') throw new Error('Опрос не найден.');
  return normalizeLearningGroupChatMessage({
    ...normalized,
    poll: { ...normalized.poll, closed: Boolean(closed) },
    updatedAt: now,
  });
};

export const serializeLearningGroupChatMessage = (message, viewerIdValue) => {
  const normalized = normalizeLearningGroupChatMessage(message);
  if (!normalized) return null;
  if (normalized.type !== 'poll') return normalized;
  const viewerId = cleanText(viewerIdValue, 180);
  const totals = Object.fromEntries(normalized.poll.options.map(({ id }) => [id, 0]));
  Object.values(normalized.poll.votesByUserId).forEach((ids) => {
    ids.forEach((id) => { if (Object.prototype.hasOwnProperty.call(totals, id)) totals[id] += 1; });
  });
  return {
    ...normalized,
    poll: {
      question: normalized.poll.question,
      allowMultiple: normalized.poll.allowMultiple,
      closed: normalized.poll.closed,
      totalVoters: Object.keys(normalized.poll.votesByUserId).length,
      myOptionIds: viewerId ? (normalized.poll.votesByUserId[viewerId] || []) : [],
      options: normalized.poll.options.map((option) => ({ ...option, voteCount: totals[option.id] || 0 })),
    },
  };
};

export const LEARNING_GROUP_CHAT_MESSAGE_MAX_LENGTH = MAX_MESSAGE_LENGTH;
