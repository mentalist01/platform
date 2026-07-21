import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  Code2,
  FileText,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  PlayCircle,
  Search,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { api } from '../services/api';

const SEARCH_CACHE_TTL_MS = 60_000;
const CONTENT_SEARCH_CACHE_TTL_MS = 45_000;
const CONTENT_SEARCH_CACHE_MAX_ENTRIES = 80;
const MAX_RESULTS = 30;
const searchCache = new Map();
const contentSearchCache = new Map();
const LESSON_SHARED_SCOPE = 'lesson-files';

const EMPTY_REMOTE_DATA = Object.freeze({
  studentId: '',
  files: [],
  lessonHistory: null,
  mockExams: [],
  studentData: {},
});

const VIEW_COMMANDS = [
  {
    id: 'join-lesson',
    view: 'lesson',
    targetKind: 'join-lesson',
    title: 'Открыть комнату урока',
    description: 'Созвон, общая доска и совместный код — всё занятие в одном месте.',
    cta: 'Присоединиться',
    keywords: 'урок занятие подключиться подключение комната созвон войти на урок',
    intents: ['урок', 'занятие', 'подключиться', 'подключение', 'комната урока', 'созвон'],
    icon: PlayCircle,
  },
  {
    id: 'testing',
    view: 'progress',
    targetKind: 'progress-section',
    progressSection: 'progress',
    title: 'Перейти к тестированию',
    description: 'Открыть задания и продолжить практику с сохранённого места.',
    cta: 'Открыть тесты',
    keywords: 'тестирование тесты тест практика задания решать задачи',
    intents: ['тестирование', 'тесты', 'тест', 'решать тесты'],
    icon: ListChecks,
  },
  {
    id: 'teacher-notes',
    view: 'progress',
    targetKind: 'progress-section',
    progressSection: 'notes',
    title: 'Заметки учителя',
    description: 'Комментарии преподавателя по заданиям: что исправить и на чём сосредоточиться.',
    cta: 'Смотреть заметки',
    keywords: 'заметки учителя комментарии преподавателя советы учителя обратная связь по заданиям',
    intents: ['заметки учителя', 'комментарии учителя', 'советы учителя', 'заметки преподавателя'],
    icon: FileText,
  },
  {
    id: 'mock-exams',
    view: 'progress',
    targetKind: 'progress-section',
    progressSection: 'mocks',
    title: 'Пробники',
    description: 'Доступные варианты, незавершённые попытки и результаты пробных экзаменов.',
    cta: 'Открыть пробники',
    keywords: 'пробники пробник пробные экзамены варианты баллы результаты попытки',
    intents: ['пробники', 'пробник', 'пробные экзамены', 'пробный экзамен'],
    icon: Trophy,
  },
  {
    id: 'schedule',
    view: 'schedule',
    title: 'Сегодня и расписание',
    description: 'Ближайшие занятия, темы уроков и история встреч.',
    cta: 'Открыть расписание',
    keywords: 'календарь график расписание сегодня ближайшие занятия',
    intents: ['расписание', 'календарь', 'сегодня'],
    icon: CalendarDays,
  },
  {
    id: 'progress',
    view: 'progress',
    targetKind: 'progress-section',
    progressSection: 'progress',
    title: 'Успеваемость и задания',
    description: 'Прогресс по заданиям, точность и следующая цель.',
    cta: 'Смотреть прогресс',
    keywords: 'успеваемость прогресс практика задания домашняя работа',
    intents: ['успеваемость', 'прогресс', 'задания'],
    icon: LayoutGrid,
  },
  {
    id: 'python',
    view: 'python',
    title: 'Изучение Python',
    description: 'Темы Python, практика и сохранённые решения.',
    cta: 'Открыть Python',
    keywords: 'python питон программирование код обучение',
    intents: ['python', 'питон', 'изучение python'],
    icon: Code2,
  },
  {
    id: 'notes',
    view: 'notes',
    title: 'Конспекты',
    description: 'Материалы уроков, шпаргалки, файлы и сохранённый код.',
    cta: 'Открыть конспекты',
    keywords: 'конспекты конспект заметки файлы материалы шпаргалки',
    intents: ['конспекты', 'конспект', 'шпаргалки', 'материалы'],
    icon: BookOpen,
  },
  {
    id: 'rating',
    view: 'rating',
    title: 'Рейтинг',
    description: 'Лига, уровень и место среди учеников.',
    cta: 'Открыть рейтинг',
    keywords: 'рейтинг лига уровень место прогресс xp',
    intents: ['рейтинг', 'лига'],
    icon: Trophy,
  },
  {
    id: 'collab',
    view: 'collab',
    title: 'Совместный код',
    description: 'Общий редактор кода для работы вместе с учителем.',
    cta: 'Открыть редактор',
    keywords: 'совместный код редактор программа писать код',
    intents: ['совместный код', 'редактор кода'],
    icon: Code2,
  },
  {
    id: 'board',
    view: 'board',
    title: 'Доска',
    description: 'Схемы, объяснения и общие записи с урока.',
    cta: 'Открыть доску',
    keywords: 'доска рисование схема урок',
    intents: ['доска'],
    icon: LayoutGrid,
  },
  {
    id: 'chat',
    view: 'chat',
    title: 'Чат с учителем',
    description: 'Задать вопрос и продолжить разговор с преподавателем.',
    cta: 'Открыть чат',
    keywords: 'чат сообщения помощь вопрос учителю',
    intents: ['чат', 'сообщения'],
    icon: Sparkles,
  },
];

const GROUPS = [
  { id: 'commands', label: 'Действия и разделы' },
  { id: 'tasks', label: 'Задания' },
  { id: 'lessons', label: 'Занятия' },
  { id: 'mocks', label: 'Пробники' },
  { id: 'notes', label: 'Конспекты и материалы' },
  { id: 'code', label: 'Сохранённый код' },
];

const GROUP_ORDER = new Map(GROUPS.map((group, index) => [group.id, index]));

const PRESENTATION_TIERS = new Set(['hero', 'feature', 'compact']);

const getPresentationTier = (item) => {
  const explicitTier = String(item?.presentationTier || '').trim().toLowerCase();
  if (PRESENTATION_TIERS.has(explicitTier)) return explicitTier;
  if (['commands', 'tasks', 'lessons', 'mocks'].includes(item?.group)) return 'feature';
  return 'compact';
};

const normalizeSearchText = (value) => String(value ?? '')
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/g, 'е')
  .replace(/\s+/g, ' ')
  .trim();

const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const asArray = (value) => (Array.isArray(value) ? value : []);

const parseTimestamp = (value) => {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value) => {
  const timestamp = parseTimestamp(value);
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp)).replace('.', '');
};

const formatLessonDate = (lesson) => {
  const dateLabel = lesson?.dayKey
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
      .format(new Date(`${lesson.dayKey}T12:00:00`))
    : formatDate(lesson?.startMs);
  return [dateLabel, String(lesson?.time || '').trim()].filter(Boolean).join(' · ');
};

const getTaskNumber = (task) => {
  const value = Number(task?.number ?? task?.id);
  return Number.isFinite(value) ? value : null;
};

const getTaskDisplayNumber = (task, fallback) => (
  String(task?.displayNumber ?? fallback ?? '').trim()
);

const firstMeaningfulLine = (value) => String(value || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find(Boolean) || '';

const clampExcerpt = (value, limit = 150) => {
  const text = firstMeaningfulLine(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
};

const getLevelLabel = (levelId) => {
  const normalized = String(levelId || '').trim().toLowerCase();
  if (normalized === 'python') return 'Python';
  if (normalized === 'basic') return 'Базовый уровень';
  if (normalized === 'advanced') return 'Продвинутый уровень';
  return normalized ? `Уровень: ${normalized}` : '';
};

const createSearchText = (...values) => normalizeSearchText(
  values.flat(Infinity).filter((value) => value !== null && typeof value !== 'undefined').join(' ')
);

const getNotesTargetFolderId = (file, taskNumber) => {
  const storedFolderId = String(file?.folderId || '').trim();
  if (storedFolderId) return storedFolderId;
  const isLessonShared = file?.sharedScope === LESSON_SHARED_SCOPE || file?.isLessonShared === true;
  if (!isLessonShared || !Number.isFinite(taskNumber)) return null;
  const teacherId = String(file?.teacherId || '').trim();
  if (teacherId) return `lesson-shared:${teacherId}:${taskNumber}`;
  const sharedStudentId = String(file?.studentId || '').trim();
  return sharedStudentId.startsWith('lesson-shared:')
    ? `${sharedStudentId}:${taskNumber}`
    : null;
};

const getServerResultIcon = (result) => {
  if (result?.kind === 'cheatsheet') return Code2;
  if (result?.kind === 'saved-code' || result?.kind === 'solved-code') return Code2;
  if (result?.kind === 'question' || result?.kind === 'theory' || result?.kind === 'homework') return ListChecks;
  if (result?.group === 'mocks') return Clock3;
  if (result?.group === 'lessons') return CalendarDays;
  if (result?.group === 'code') return Code2;
  return FileText;
};

const buildServerSearchItems = (results, query) => asArray(results).map((result, index) => {
  const target = isRecord(result?.target) ? { ...result.target } : null;
  if (target?.kind === 'notes' && isRecord(target.location)) {
    target.location = {
      ...target.location,
      searchQuery: String(query || '').trim(),
    };
  }
  const group = GROUP_ORDER.has(result?.group) ? result.group : 'notes';
  const targetFileId = target?.kind === 'notes' ? String(target?.location?.fileId || '').trim() : '';
  const targetExamId = target?.kind === 'mock' ? String(target?.examId || '').trim() : '';
  const serverResultId = String(result?.id || index);
  const canonicalContentId = serverResultId.startsWith('saved-code:task:')
    ? serverResultId.replace(/^saved-code:/, 'code:')
    : (serverResultId.startsWith('saved-code:question:')
      ? serverResultId.replace(/^saved-code:/, 'code:')
      : `server:${serverResultId}`);
  const id = targetFileId
    ? `note:${targetFileId}`
    : (targetExamId && result?.kind === 'mock' ? `mock:${targetExamId}` : canonicalContentId);
  return {
    id,
    group,
    title: String(result?.title || 'Результат поиска').trim(),
    subtitle: String(result?.subtitle || '').trim(),
    excerpt: String(result?.snippet || '').trim(),
    sourceLabel: String(result?.sourceLabel || 'По содержимому').trim(),
    Icon: getServerResultIcon(result),
    timestamp: parseTimestamp(result?.timestamp),
    serverScore: Number(result?.score) || 0,
    presentationTier: ['tasks', 'lessons', 'mocks'].includes(group) ? 'feature' : 'compact',
    searchText: createSearchText(
      result?.title,
      result?.subtitle,
      result?.snippet,
      result?.sourceLabel,
      result?.kind,
      query
    ),
    target,
  };
}).filter((item) => item.target && item.title);

const buildSearchItems = ({ tasks, pythonTasks, remoteData, studentId }) => {
  const items = [];
  const allTasks = [
    ...asArray(tasks).map((task) => ({ task, python: false })),
    ...asArray(pythonTasks).map((task) => ({ task, python: true })),
  ];
  const taskTitleByNumber = new Map();

  VIEW_COMMANDS.forEach((command, index) => {
    items.push({
      id: `command:${command.id || command.view}`,
      group: 'commands',
      title: command.title,
      subtitle: 'Перейти в раздел',
      description: command.description,
      cta: command.cta,
      intentPhrases: command.intents,
      sourceLabel: command.targetKind ? 'Быстрое действие' : 'Раздел',
      Icon: command.icon,
      timestamp: Number.MAX_SAFE_INTEGER - index,
      searchText: createSearchText(command.title, command.description, command.keywords, command.intents, command.view),
      target: {
        kind: command.targetKind || 'navigate',
        view: command.view,
        progressSection: command.progressSection,
      },
    });
  });

  allTasks.forEach(({ task, python }, index) => {
    const taskNumber = getTaskNumber(task);
    if (!Number.isFinite(taskNumber)) return;
    const displayNumber = getTaskDisplayNumber(task, taskNumber);
    const title = String(task?.title || `Задание ${displayNumber}`).trim();
    const sourceLabel = python ? 'Python' : 'ЕГЭ';
    const levelId = python ? 'python' : (String(task?.levelId || '').trim() || undefined);
    taskTitleByNumber.set(String(taskNumber), { title, displayNumber, python });
    items.push({
      id: `task:${python ? 'python' : 'ege'}:${taskNumber}`,
      group: 'tasks',
      title: `№${displayNumber} · ${title}`,
      subtitle: python ? 'Курс Python' : 'Задание ЕГЭ',
      sourceLabel,
      Icon: python ? Code2 : LayoutGrid,
      timestamp: -index,
      searchText: createSearchText(displayNumber, taskNumber, title, task?.topic, sourceLabel, 'задание задача'),
      target: { kind: 'task', taskNumber, levelId, targetQuestions: null },
    });
  });

  asArray(remoteData?.files).forEach((file) => {
    const fileId = String(file?.id || '').trim();
    if (!fileId) return;
    const memory = isRecord(file?.memory) ? file.memory : {};
    const taskNumber = Number(file?.taskNumber ?? memory?.taskNumber);
    const taskInfo = taskTitleByNumber.get(String(taskNumber));
    const fileName = String(file?.name || memory?.title || 'Материал').trim();
    const memoryTitle = String(memory?.title || '').trim();
    const folderPath = String(file?.folderPath || file?.folderName || '').trim();
    const boardSnapshotName = String(memory?.boardSnapshot?.name || '').trim();
    const taskLabel = taskInfo
      ? `№${taskInfo.displayNumber} · ${taskInfo.title}`
      : (Number.isFinite(taskNumber) ? `Задание №${taskNumber}` : 'Конспекты');
    const subtitle = [taskLabel, folderPath, memoryTitle && memoryTitle !== fileName ? memoryTitle : '']
      .filter(Boolean)
      .join(' · ');
    items.push({
      id: `note:${fileId}`,
      group: 'notes',
      title: fileName,
      subtitle,
      excerpt: clampExcerpt(memory?.description || memory?.codePreview || memory?.lastRunOutput),
      sourceLabel: boardSnapshotName ? 'Доска / конспект' : 'Конспект',
      Icon: boardSnapshotName ? LayoutGrid : FileText,
      timestamp: parseTimestamp(file?.updatedAt || memory?.createdAt || file?.createdAt),
      searchText: createSearchText(
        fileName,
        file?.type,
        file?.category,
        folderPath,
        memoryTitle,
        memory?.description,
        memory?.codePreview,
        memory?.lastRunOutput,
        memory?.kind,
        memory?.source,
        memory?.savedBy?.name,
        memory?.tags,
        boardSnapshotName,
        taskLabel
      ),
      target: {
        kind: 'notes',
        location: {
          studentId,
          taskNumber: Number.isFinite(taskNumber) ? taskNumber : null,
          category: file?.category || 'class',
          folderId: getNotesTargetFolderId(file, taskNumber),
          fileId,
        },
      },
    });
  });

  const lessonItems = Array.isArray(remoteData?.lessonHistory)
    ? remoteData.lessonHistory
    : asArray(remoteData?.lessonHistory?.items);
  lessonItems.forEach((lesson) => {
    const lessonKey = String(lesson?.key || '').trim();
    if (!lessonKey) return;
    const topic = isRecord(lesson?.topic) ? lesson.topic : {};
    const topicText = String(topic?.text || '').trim();
    const subject = String(lesson?.subject || '').trim();
    const title = topicText || subject || 'Прошедшее занятие';
    const taskLabels = asArray(topic?.taskNumbers).map((number) => {
      const taskInfo = taskTitleByNumber.get(String(number));
      return taskInfo ? `№${taskInfo.displayNumber} ${taskInfo.title}` : `№${number}`;
    });
    items.push({
      id: `lesson:${lessonKey}`,
      group: 'lessons',
      title,
      subtitle: [formatLessonDate(lesson), taskLabels.join(', ')].filter(Boolean).join(' · '),
      sourceLabel: topic?.source === 'teacher' ? 'Тема учителя' : 'Занятие',
      Icon: CalendarDays,
      timestamp: parseTimestamp(lesson?.startMs || topic?.updatedAt),
      searchText: createSearchText(title, subject, topicText, taskLabels, lesson?.dayKey, lesson?.time, 'занятие урок тема'),
      target: { kind: 'lesson', lessonKey },
    });
  });

  const mockIds = new Set();
  asArray(remoteData?.mockExams).forEach((exam) => {
    const examId = String(exam?.id || '').trim();
    if (!examId) return;
    mockIds.add(examId);
    const badges = asArray(exam?.badges).map((badge) => String(badge?.label || badge || '').trim()).filter(Boolean);
    const taskNumbers = isRecord(exam?.tasks) ? Object.keys(exam.tasks) : [];
    items.push({
      id: `mock:${examId}`,
      group: 'mocks',
      title: String(exam?.title || 'Пробник').trim(),
      subtitle: badges.join(' · ') || (taskNumbers.length ? `${taskNumbers.length} заданий` : 'Пробник'),
      sourceLabel: 'Пробник',
      Icon: Clock3,
      timestamp: parseTimestamp(exam?.updatedAt || exam?.createdAt),
      searchText: createSearchText(exam?.title, badges, taskNumbers, exam?.source, 'пробник экзамен вариант'),
      target: { kind: 'mock', examId },
    });
  });

  asArray(remoteData?.studentData?.mocks).forEach((exam) => {
    const historyId = String(exam?.id || exam?.examId || '').trim();
    const linkedExamId = String(exam?.examId || '').trim();
    if (!historyId || (linkedExamId && mockIds.has(linkedExamId))) return;
    const score = Number(exam?.score);
    const dateLabel = formatDate(exam?.date || exam?.createdAt);
    items.push({
      id: `mock-history:${historyId}`,
      group: 'mocks',
      title: `Пробник${dateLabel ? ` · ${dateLabel}` : ''}`,
      subtitle: [Number.isFinite(score) ? `${score} баллов` : '', exam?.comment].filter(Boolean).join(' · '),
      sourceLabel: 'Результат',
      Icon: Trophy,
      timestamp: parseTimestamp(exam?.date || exam?.createdAt),
      searchText: createSearchText(dateLabel, score, exam?.comment, 'пробник результат баллы'),
      target: linkedExamId
        ? { kind: 'mock', examId: linkedExamId }
        : { kind: 'progress-section', progressSection: 'mocks' },
    });
  });

  const solvedByTask = isRecord(remoteData?.studentData?.solvedByTask)
    ? remoteData.studentData.solvedByTask
    : {};
  Object.entries(solvedByTask).forEach(([taskKey, taskEntry]) => {
    if (!isRecord(taskEntry)) return;
    const taskNumber = Number(taskKey);
    if (!Number.isFinite(taskNumber)) return;
    const taskInfo = taskTitleByNumber.get(String(taskNumber));
    const taskLabel = taskInfo
      ? `№${taskInfo.displayNumber} · ${taskInfo.title}`
      : `Задание №${taskNumber}`;
    const taskCode = isRecord(taskEntry?._taskCode) ? taskEntry._taskCode : null;
    if (taskCode && (String(taskCode.code || '').trim() || String(taskCode.input || '').trim())) {
      items.push({
        id: `code:task:${taskNumber}`,
        group: 'code',
        title: taskLabel,
        subtitle: 'Общий код задания',
        excerpt: clampExcerpt(taskCode.code || taskCode.input),
        sourceLabel: 'Код',
        Icon: Code2,
        timestamp: parseTimestamp(taskCode.updatedAt),
        searchText: createSearchText(taskLabel, taskCode.code, taskCode.input, 'сохраненный код программа'),
        target: {
          kind: 'task',
          taskNumber,
          levelId: taskInfo?.python ? 'python' : undefined,
          targetQuestions: null,
        },
      });
    }

    Object.entries(taskEntry).forEach(([levelId, levelEntry]) => {
      if (levelId.startsWith('_') || !isRecord(levelEntry)) return;
      const byQuestionId = isRecord(levelEntry?._questionCodeById) ? levelEntry._questionCodeById : {};
      Object.entries(byQuestionId).forEach(([questionId, savedCode]) => {
        if (!isRecord(savedCode)) return;
        const code = String(savedCode?.code || '');
        const input = String(savedCode?.input || '');
        if (!code.trim() && !input.trim()) return;
        items.push({
          id: `code:question:${taskNumber}:${levelId}:${questionId}`,
          group: 'code',
          title: `${taskLabel} · задача ${questionId}`,
          subtitle: getLevelLabel(levelId) || 'Сохранённое решение',
          excerpt: clampExcerpt(code || input),
          sourceLabel: 'Код задачи',
          Icon: Code2,
          timestamp: parseTimestamp(savedCode?.updatedAt),
          searchText: createSearchText(taskLabel, questionId, levelId, code, input, 'сохраненный код решение программа'),
          target: {
            kind: 'task',
            taskNumber,
            levelId,
            targetQuestions: [questionId],
          },
        });
      });
    });
  });

  return items;
};

const getResultScore = (item, normalizedQuery) => {
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (!tokens.length || !tokens.every((token) => item.searchText.includes(token))) return -1;
  const title = normalizeSearchText(item.title);
  const subtitle = normalizeSearchText(item.subtitle);
  let score = 100;
  if (title === normalizedQuery) score += 1000;
  else if (title.startsWith(normalizedQuery)) score += 700;
  else if (title.includes(normalizedQuery)) score += 450;
  if (subtitle.includes(normalizedQuery)) score += 180;
  if (item.group === 'commands') score += 80;
  if (Number.isFinite(Number(item.serverScore))) {
    score += Math.min(520, Math.max(0, Number(item.serverScore)) * 0.32);
  }
  score += Math.min(50, tokens.reduce((sum, token) => sum + (title.includes(token) ? 10 : 0), 0));
  return score;
};

const getIntentMatchStrength = (item, normalizedQuery) => {
  if (!normalizedQuery || item?.group !== 'commands') return 0;
  return asArray(item?.intentPhrases).reduce((score, phrase) => {
    const normalizedPhrase = normalizeSearchText(phrase);
    if (!normalizedPhrase || !normalizedQuery.includes(normalizedPhrase)) return score;
    const exactBonus = normalizedQuery === normalizedPhrase ? 1000 : 0;
    return Math.max(score, 100 + exactBonus + normalizedPhrase.length);
  }, 0);
};

const StudentGlobalSearch = ({
  studentId,
  theme = 'light',
  tasks = [],
  pythonTasks = [],
  onNavigate,
  onOpenTask,
  onOpenMock,
  onOpenNotes,
  onOpenLesson,
  onJoinLesson,
  onOpenProgressSection,
}) => {
  const normalizedStudentId = String(studentId || '').trim();
  const isDarkTheme = String(theme || '').trim().toLowerCase() === 'dark';
  const dialogTitleId = useId();
  const listboxId = useId();
  const inputRef = useRef(null);
  const requestIdRef = useRef(0);
  const contentRequestIdRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [remoteData, setRemoteData] = useState(EMPTY_REMOTE_DATA);
  const [loadState, setLoadState] = useState({ studentId: '', loading: false, error: '' });
  const [contentSearchState, setContentSearchState] = useState({
    studentId: '',
    query: '',
    results: [],
    loading: false,
    error: '',
    hasMoreResults: false,
    skippedFiles: 0,
  });

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery('');
    setDebouncedQuery('');
    setActiveIndex(0);
  }, []);

  const loadRemoteData = useCallback(async () => {
    if (!normalizedStudentId) return;
    const cached = searchCache.get(normalizedStudentId);
    if (cached && Date.now() - cached.loadedAt < SEARCH_CACHE_TTL_MS) {
      setRemoteData(cached.data);
      setLoadState({ studentId: normalizedStudentId, loading: false, error: '' });
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadState({ studentId: normalizedStudentId, loading: true, error: '' });
    const settled = await Promise.allSettled([
      api.getFiles(normalizedStudentId),
      api.getLessonHistory(normalizedStudentId, { limit: 50, offset: 0 }),
      api.getMockExams(normalizedStudentId),
      api.getStudentData(normalizedStudentId),
    ]);
    if (requestIdRef.current !== requestId) return;

    const nextData = {
      studentId: normalizedStudentId,
      files: settled[0].status === 'fulfilled' ? asArray(settled[0].value) : [],
      lessonHistory: settled[1].status === 'fulfilled' ? settled[1].value : null,
      mockExams: settled[2].status === 'fulfilled' ? asArray(settled[2].value) : [],
      studentData: settled[3].status === 'fulfilled' && isRecord(settled[3].value) ? settled[3].value : {},
    };
    const failedCount = settled.filter((entry) => entry.status === 'rejected').length;
    if (!failedCount) searchCache.set(normalizedStudentId, { loadedAt: Date.now(), data: nextData });
    setRemoteData(nextData);
    setLoadState({
      studentId: normalizedStudentId,
      loading: false,
      error: failedCount ? 'Часть результатов сейчас недоступна' : '',
    });
  }, [normalizedStudentId]);

  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      const shortcutPressed = (event.ctrlKey || event.metaKey)
        && !event.altKey
        && String(event.key || '').toLowerCase() === 'k';
      if (shortcutPressed) {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (open && event.key === 'Escape') {
        event.preventDefault();
        closePalette();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [closePalette, open]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  useEffect(() => {
    const rawQuery = String(debouncedQuery || '').trim();
    const normalizedContentQuery = normalizeSearchText(rawQuery);
    const requestId = contentRequestIdRef.current + 1;
    contentRequestIdRef.current = requestId;
    if (!open || !normalizedStudentId || normalizedContentQuery.length < 2) {
      setContentSearchState({
        studentId: normalizedStudentId,
        query: normalizedContentQuery,
        results: [],
        loading: false,
        error: '',
        hasMoreResults: false,
        skippedFiles: 0,
      });
      return undefined;
    }

    const cacheKey = `${normalizedStudentId}:${normalizedContentQuery}`;
    const cached = contentSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.loadedAt < CONTENT_SEARCH_CACHE_TTL_MS) {
      setContentSearchState({
        studentId: normalizedStudentId,
        query: normalizedContentQuery,
        results: asArray(cached.payload?.results),
        loading: false,
        error: '',
        hasMoreResults: Number(cached.payload?.total) > asArray(cached.payload?.results).length,
        skippedFiles: Math.max(0, Number(cached.payload?.scan?.skippedTextFiles) || 0),
      });
      return undefined;
    }

    let cancelled = false;
    setContentSearchState((current) => ({
      studentId: normalizedStudentId,
      query: normalizedContentQuery,
      results: current.query === normalizedContentQuery ? current.results : [],
      loading: true,
      error: '',
      hasMoreResults: false,
      skippedFiles: 0,
    }));
    api.searchStudentContent(rawQuery, normalizedStudentId, { limit: 40 })
      .then((payload) => {
        if (cancelled || contentRequestIdRef.current !== requestId) return;
        contentSearchCache.set(cacheKey, { loadedAt: Date.now(), payload });
        while (contentSearchCache.size > CONTENT_SEARCH_CACHE_MAX_ENTRIES) {
          const oldestKey = contentSearchCache.keys().next().value;
          if (!oldestKey) break;
          contentSearchCache.delete(oldestKey);
        }
        setContentSearchState({
          studentId: normalizedStudentId,
          query: normalizedContentQuery,
          results: asArray(payload?.results),
          loading: false,
          error: '',
          hasMoreResults: Number(payload?.total) > asArray(payload?.results).length,
          skippedFiles: Math.max(0, Number(payload?.scan?.skippedTextFiles) || 0),
        });
      })
      .catch((error) => {
        if (cancelled || contentRequestIdRef.current !== requestId) return;
        setContentSearchState({
          studentId: normalizedStudentId,
          query: normalizedContentQuery,
          results: [],
          loading: false,
          error: error?.message || 'Не удалось поискать внутри материалов',
          hasMoreResults: false,
          skippedFiles: 0,
        });
      });
    return () => { cancelled = true; };
  }, [debouncedQuery, normalizedStudentId, open]);

  useEffect(() => {
    if (!open) return undefined;
    const loadTimer = window.setTimeout(() => {
      void loadRemoteData();
    }, 0);
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.clearTimeout(loadTimer);
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
    };
  }, [loadRemoteData, open]);

  const effectiveRemoteData = remoteData.studentId === normalizedStudentId
    ? remoteData
    : EMPTY_REMOTE_DATA;
  const normalizedQuery = normalizeSearchText(debouncedQuery);
  const baseItems = useMemo(() => buildSearchItems({
    tasks,
    pythonTasks,
    remoteData: effectiveRemoteData,
    studentId: normalizedStudentId,
  }), [effectiveRemoteData, normalizedStudentId, pythonTasks, tasks]);
  const effectiveContentResults = contentSearchState.studentId === normalizedStudentId
    && contentSearchState.query === normalizedQuery
    ? contentSearchState.results
    : [];
  const contentItems = useMemo(
    () => buildServerSearchItems(effectiveContentResults, debouncedQuery),
    [debouncedQuery, effectiveContentResults]
  );
  const allItems = useMemo(() => {
    const byId = new Map(baseItems.map((item) => [item.id, item]));
    contentItems.forEach((item) => {
      const previous = byId.get(item.id);
      byId.set(item.id, previous ? {
        ...previous,
        ...item,
        target: item.target || previous.target,
      } : item);
    });
    return Array.from(byId.values());
  }, [baseItems, contentItems]);
  const selectedItems = useMemo(() => {
    if (!normalizedQuery) {
      const commands = allItems.filter((item) => item.group === 'commands');
      const recent = allItems
        .filter((item) => ['lessons', 'notes', 'code', 'mocks'].includes(item.group))
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, 14);
      const taskSuggestions = allItems.filter((item) => item.group === 'tasks').slice(0, 6);
      return [...commands, ...recent, ...taskSuggestions].slice(0, MAX_RESULTS);
    }
    const scoredResults = allItems
      .map((item) => ({ item, score: getResultScore(item, normalizedQuery) }))
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => (
        (right.score - left.score)
        || (right.item.timestamp - left.item.timestamp)
        || left.item.title.localeCompare(right.item.title, 'ru')
      ));
    const intentHeroes = allItems
      .map((item) => ({ item, strength: getIntentMatchStrength(item, normalizedQuery) }))
      .filter((entry) => entry.strength > 0)
      .sort((left, right) => (
        (right.strength - left.strength)
        || (right.item.timestamp - left.item.timestamp)
      ))
      .slice(0, 2)
      .map(({ item }) => ({ ...item, presentationTier: 'hero' }));
    const heroIds = new Set(intentHeroes.map((item) => item.id));
    const regularResults = scoredResults
      .map((entry) => entry.item)
      .filter((item) => !heroIds.has(item.id))
      .slice(0, Math.max(0, MAX_RESULTS - intentHeroes.length));
    return [...intentHeroes, ...regularResults];
  }, [allItems, normalizedQuery]);

  const visibleResults = useMemo(() => [...selectedItems].sort((left, right) => {
    const groupDiff = (GROUP_ORDER.get(left.group) ?? 99) - (GROUP_ORDER.get(right.group) ?? 99);
    if (groupDiff) return groupDiff;
    return selectedItems.indexOf(left) - selectedItems.indexOf(right);
  }), [selectedItems]);
  const safeActiveIndex = visibleResults.length
    ? Math.min(Math.max(0, activeIndex), visibleResults.length - 1)
    : 0;

  const activateResult = useCallback((result) => {
    const target = result?.target;
    if (!target) return;
    closePalette();
    if (target.kind === 'navigate') onNavigate?.(target.view, target);
    if (target.kind === 'join-lesson') {
      if (onJoinLesson) onJoinLesson();
      else onNavigate?.('lesson', target);
    }
    if (target.kind === 'progress-section') {
      if (onOpenProgressSection) onOpenProgressSection(target.progressSection, target);
      else onNavigate?.('progress', target);
    }
    if (target.kind === 'task') {
      onOpenTask?.(target.taskNumber, target.levelId, target.targetQuestions, target);
    }
    if (target.kind === 'mock') onOpenMock?.(target.examId, target.taskNumber);
    if (target.kind === 'notes') onOpenNotes?.(target.location);
    if (target.kind === 'lesson') onOpenLesson?.(target.lessonKey);
  }, [closePalette, onJoinLesson, onNavigate, onOpenLesson, onOpenMock, onOpenNotes, onOpenProgressSection, onOpenTask]);

  const handleInputKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => visibleResults.length ? (current + 1) % visibleResults.length : 0);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => visibleResults.length
        ? (current - 1 + visibleResults.length) % visibleResults.length
        : 0);
      return;
    }
    if (event.key === 'Enter' && visibleResults[safeActiveIndex]) {
      event.preventDefault();
      activateResult(visibleResults[safeActiveIndex]);
    }
  };

  const isMetadataLoading = loadState.studentId === normalizedStudentId && loadState.loading;
  const isContentLoading = contentSearchState.studentId === normalizedStudentId
    && contentSearchState.query === normalizedQuery
    && contentSearchState.loading;
  const isLoading = isMetadataLoading || isContentLoading;
  const metadataLoadError = loadState.studentId === normalizedStudentId ? loadState.error : '';
  const contentLoadError = contentSearchState.studentId === normalizedStudentId
    && contentSearchState.query === normalizedQuery
    ? contentSearchState.error
    : '';
  const loadError = contentLoadError || metadataLoadError;
  const hasMoreContentResults = contentSearchState.studentId === normalizedStudentId
    && contentSearchState.query === normalizedQuery
    && contentSearchState.hasMoreResults;
  const skippedContentFiles = contentSearchState.studentId === normalizedStudentId
    && contentSearchState.query === normalizedQuery
    ? Math.max(0, Number(contentSearchState.skippedFiles) || 0)
    : 0;
  const activeOptionId = visibleResults.length ? `${listboxId}-option-${safeActiveIndex}` : undefined;

  const palette = open && typeof document !== 'undefined' ? createPortal(
    <div
      className={`fixed inset-0 z-[1400] flex items-start justify-center px-3 pb-6 pt-[max(4.5rem,10vh)] backdrop-blur-md sm:px-6 ${
        isDarkTheme ? 'bg-slate-950/65' : 'bg-slate-900/25'
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePalette();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        className={`flex max-h-[min(760px,82vh)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border ring-1 ring-violet-400/20 ${
          isDarkTheme
            ? 'border-white/15 bg-slate-950/95 text-slate-100 shadow-[0_32px_100px_rgba(2,6,23,0.72)]'
            : 'border-white/90 bg-white/95 text-slate-900 shadow-[0_32px_100px_rgba(64,45,120,0.22)]'
        }`}
      >
        <div className={`border-b bg-gradient-to-r from-violet-500/10 via-transparent to-cyan-500/10 p-3 sm:p-4 ${
          isDarkTheme ? 'border-white/10' : 'border-slate-200/80'
        }`}>
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <div>
              <h2 id={dialogTitleId} className={`text-sm font-extrabold tracking-tight sm:text-base ${isDarkTheme ? 'text-white' : 'text-slate-950'}`}>
                Найти на платформе
              </h2>
              <p className={`mt-0.5 text-[11px] font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                Задания, занятия, конспекты, код и пробники
              </p>
            </div>
            <button
              type="button"
              onClick={closePalette}
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                isDarkTheme
                  ? 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                  : 'border-slate-200 bg-white/80 text-slate-500 shadow-sm hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700'
              }`}
              aria-label="Закрыть поиск"
            >
              <X size={17} />
            </button>
          </div>
          <label className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-inner transition focus-within:border-violet-400/55 focus-within:ring-4 focus-within:ring-violet-500/10 ${
            isDarkTheme
              ? 'border-violet-300/25 bg-white/[0.07] focus-within:bg-white/[0.09]'
              : 'border-violet-200/80 bg-white/90 shadow-violet-100/40 focus-within:bg-white'
          }`}>
            {isLoading
              ? <LoaderCircle className={`shrink-0 animate-spin ${isDarkTheme ? 'text-violet-300' : 'text-violet-600'}`} size={20} />
              : <Search className={`shrink-0 ${isDarkTheme ? 'text-violet-300' : 'text-violet-600'}`} size={20} />}
            <span className="sr-only">Поиск по платформе</span>
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Например: Черепаха, циклы, урок 19 июля…"
              className={`min-w-0 flex-1 bg-transparent text-base font-semibold outline-none ${
                isDarkTheme
                  ? 'text-white caret-violet-300 placeholder:text-slate-500'
                  : 'text-slate-950 caret-violet-600 placeholder:text-slate-400'
              }`}
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setDebouncedQuery('');
                  setActiveIndex(0);
                  inputRef.current?.focus();
                }}
                className={`rounded-lg p-1 transition ${
                  isDarkTheme
                    ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                    : 'text-slate-400 hover:bg-violet-100 hover:text-violet-700'
                }`}
                aria-label="Очистить поиск"
              >
                <X size={16} />
              </button>
            ) : (
              <kbd className={`hidden rounded-lg border px-2 py-1 text-[10px] font-bold sm:inline-flex ${
                isDarkTheme
                  ? 'border-white/10 bg-white/5 text-slate-400'
                  : 'border-slate-200 bg-slate-50 text-slate-500 shadow-sm'
              }`}>
                Ctrl K
              </kbd>
            )}
          </label>
        </div>

        <div
          id={listboxId}
          role="listbox"
          aria-label="Результаты поиска"
          aria-busy={isLoading}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 sm:px-3 sm:py-3"
        >
          {visibleResults.length ? GROUPS.map((group) => {
            const groupItems = visibleResults
              .map((item, index) => ({ item, index }))
              .filter((entry) => entry.item.group === group.id);
            if (!groupItems.length) return null;
            return (
              <div key={group.id} className="mb-3 last:mb-0">
                <div className={`sticky top-0 z-[1] flex items-center justify-between px-2 py-1.5 backdrop-blur-sm ${
                  isDarkTheme ? 'bg-slate-950/95' : 'bg-white/95'
                }`}>
                  <h3 className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-500' : 'text-slate-400'}`}>
                    {group.label}
                  </h3>
                  <span className={`text-[10px] font-bold ${isDarkTheme ? 'text-slate-600' : 'text-slate-400'}`}>{groupItems.length}</span>
                </div>
                <div className="space-y-1">
                  {groupItems.map(({ item, index }) => {
                    const Icon = item.Icon || Search;
                    const active = index === safeActiveIndex;
                    const presentationTier = getPresentationTier(item);
                    const isHero = presentationTier === 'hero';
                    const isCompact = presentationTier === 'compact';
                    const layoutClass = isHero
                      ? 'min-h-[104px] items-start gap-3.5 px-4 py-4 sm:items-center sm:gap-4 sm:px-5'
                      : (isCompact ? 'gap-2.5 px-2.5 py-2' : 'gap-3 px-3 py-2.5');
                    const surfaceClass = isHero
                      ? (active
                        ? (isDarkTheme
                          ? 'border-violet-300/55 bg-gradient-to-r from-violet-500/30 via-fuchsia-500/15 to-cyan-500/15 shadow-[0_18px_44px_rgba(76,29,149,0.30)]'
                          : 'border-violet-300 bg-gradient-to-r from-violet-100 via-white to-cyan-50 shadow-[0_18px_44px_rgba(109,40,217,0.16)]')
                        : (isDarkTheme
                          ? 'border-violet-400/30 bg-gradient-to-r from-violet-500/20 via-fuchsia-500/10 to-cyan-500/10 shadow-[0_14px_36px_rgba(76,29,149,0.20)] hover:border-violet-300/50 hover:from-violet-500/25'
                          : 'border-violet-200/90 bg-gradient-to-r from-violet-50 via-white to-cyan-50/80 shadow-[0_14px_36px_rgba(109,40,217,0.11)] hover:border-violet-300 hover:from-violet-100/80'))
                      : (active
                        ? (isDarkTheme
                          ? 'border-violet-400/35 bg-gradient-to-r from-violet-500/20 to-cyan-500/10 shadow-[0_10px_28px_rgba(76,29,149,0.18)]'
                          : 'border-violet-300/70 bg-gradient-to-r from-violet-100/90 to-cyan-50/80 shadow-[0_10px_28px_rgba(109,40,217,0.10)]')
                        : (isDarkTheme
                          ? 'border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.055]'
                          : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-slate-50/90'));
                    const iconSizeClass = isHero
                      ? 'h-12 w-12 rounded-2xl sm:h-14 sm:w-14'
                      : (isCompact ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-xl');
                    const iconToneClass = isHero
                      ? (isDarkTheme
                        ? 'border-violet-300/35 bg-gradient-to-br from-violet-400/30 to-cyan-400/15 text-violet-100 shadow-[0_8px_24px_rgba(124,58,237,0.24)]'
                        : 'border-violet-200 bg-white/90 text-violet-700 shadow-[0_8px_24px_rgba(109,40,217,0.13)]')
                      : (active
                        ? (isDarkTheme
                          ? 'border-violet-300/30 bg-violet-400/20 text-violet-200'
                          : 'border-violet-300 bg-white/80 text-violet-700 shadow-sm')
                        : (isDarkTheme
                          ? 'border-white/10 bg-white/5 text-slate-400 group-hover:text-slate-200'
                          : 'border-slate-200 bg-white text-slate-500 shadow-sm group-hover:border-violet-200 group-hover:text-violet-700'));
                    return (
                      <button
                        key={item.id}
                        id={`${listboxId}-option-${index}`}
                        type="button"
                        role="option"
                        data-presentation-tier={presentationTier}
                        aria-selected={active}
                        onMouseMove={() => setActiveIndex(index)}
                        onFocus={() => setActiveIndex(index)}
                        onClick={() => activateResult(item)}
                        className={`group flex w-full rounded-2xl border text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${layoutClass} ${surfaceClass}`}
                      >
                        <span className={`inline-flex shrink-0 items-center justify-center border transition ${iconSizeClass} ${iconToneClass}`}>
                          <Icon size={isHero ? 24 : (isCompact ? 15 : 18)} />
                        </span>
                        <span className="min-w-0 flex-1">
                          {isHero && (
                            <span className={`mb-1 block text-[9px] font-extrabold uppercase tracking-[0.16em] ${
                              isDarkTheme ? 'text-violet-300' : 'text-violet-600'
                            }`}>
                              {item.sourceLabel || 'Быстрое действие'}
                            </span>
                          )}
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`${isHero ? 'text-base sm:text-lg' : (isCompact ? 'text-[13px]' : 'text-sm')} min-w-0 truncate font-bold ${isDarkTheme ? 'text-slate-100' : 'text-slate-900'}`}>{item.title}</span>
                            {!isHero && <span className={`hidden shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide sm:inline-flex ${
                              isDarkTheme
                                ? 'border-white/10 bg-white/5 text-slate-500'
                                : 'border-slate-200 bg-white/80 text-slate-500'
                            }`}>
                              {item.sourceLabel}
                            </span>}
                          </span>
                          {(isHero ? (item.description || item.subtitle) : (item.subtitle || item.excerpt)) && (
                            <span className={`${isHero ? 'mt-1 line-clamp-2 max-w-xl text-xs leading-relaxed sm:text-[13px]' : 'mt-0.5 block truncate text-xs'} font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                              {isHero
                                ? (item.description || item.subtitle)
                                : [item.subtitle, item.excerpt].filter(Boolean).join(' — ')}
                            </span>
                          )}
                        </span>
                        {isHero ? (
                          <span className={`mt-0.5 hidden shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-extrabold sm:inline-flex ${
                            isDarkTheme
                              ? 'border-violet-300/25 bg-violet-400/15 text-violet-200'
                              : 'border-violet-200 bg-white/85 text-violet-700 shadow-sm'
                          }`}>
                            {item.cta || 'Открыть'}
                            <ChevronRight className="transition-transform group-hover:translate-x-0.5" size={15} />
                          </span>
                        ) : (
                          <ChevronRight className={`shrink-0 transition ${active
                            ? `translate-x-0 ${isDarkTheme ? 'text-violet-300' : 'text-violet-600'}`
                            : `-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 ${isDarkTheme ? 'text-slate-600' : 'text-slate-400'}`
                          }`} size={isCompact ? 15 : 17} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <span className={`mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${
                isDarkTheme
                  ? 'border-white/10 bg-white/5 text-slate-500'
                  : 'border-violet-100 bg-violet-50 text-violet-500'
              }`}>
                <Search size={21} />
              </span>
              <p className={`text-sm font-bold ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>Ничего не нашлось</p>
              <p className="mt-1 max-w-sm text-xs font-medium leading-relaxed text-slate-500">
                Попробуйте номер задания, тему урока, название файла или фрагмент сохранённого кода.
              </p>
            </div>
          )}
        </div>

        <footer className={`flex min-h-11 items-center justify-between gap-3 border-t px-4 py-2 text-[10px] font-semibold ${
          isDarkTheme
            ? 'border-white/10 bg-white/[0.025] text-slate-500'
            : 'border-slate-200/80 bg-slate-50/70 text-slate-500'
        }`}>
          <span aria-live="polite">
            {isContentLoading
              ? 'Ищем внутри материалов и кода…'
              : (isMetadataLoading
                ? 'Обновляем личные результаты…'
                : (loadError || `Найдено: ${visibleResults.length}${hasMoreContentResults ? '+' : ''}${skippedContentFiles > 0 ? ` · не проиндексировано файлов: ${skippedContentFiles}` : ''}`))}
          </span>
          <span className="hidden items-center gap-2 sm:flex">
            <span><kbd className={`rounded border px-1.5 py-0.5 ${isDarkTheme ? 'border-white/10' : 'border-slate-200 bg-white'}`}>↑↓</kbd> выбрать</span>
            <span><kbd className={`rounded border px-1.5 py-0.5 ${isDarkTheme ? 'border-white/10' : 'border-slate-200 bg-white'}`}>Enter</kbd> открыть</span>
            <span><kbd className={`rounded border px-1.5 py-0.5 ${isDarkTheme ? 'border-white/10' : 'border-slate-200 bg-white'}`}>Esc</kbd> закрыть</span>
          </span>
        </footer>
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 ${
          isDarkTheme
            ? 'border-slate-700/70 bg-slate-900/90 text-slate-100 shadow-[0_8px_22px_rgba(15,23,42,0.2)] hover:border-violet-400/60 hover:bg-slate-900 hover:shadow-[0_12px_28px_rgba(76,29,149,0.2)]'
            : 'border-violet-200/80 bg-white/85 text-slate-700 shadow-[0_8px_22px_rgba(76,29,149,0.10)] backdrop-blur-sm hover:border-violet-300 hover:bg-white hover:text-violet-800 hover:shadow-[0_12px_28px_rgba(76,29,149,0.16)]'
        }`}
        title="Глобальный поиск (Ctrl/⌘ K)"
      >
        <Search size={16} className={isDarkTheme ? 'text-violet-300' : 'text-violet-600'} />
        <span>Поиск</span>
        <kbd className={`hidden rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold sm:inline-flex ${
          isDarkTheme
            ? 'border-white/10 bg-white/5 text-slate-400'
            : 'border-slate-200 bg-slate-50 text-slate-500'
        }`}>
          Ctrl K
        </kbd>
      </button>
      {palette}
    </>
  );
};

export default StudentGlobalSearch;
