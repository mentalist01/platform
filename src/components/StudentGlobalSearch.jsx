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
  RefreshCcw,
  Search,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import {
  normalizeStudentSearchText as normalizeSearchText,
  rankStudentSearch,
} from './studentGlobalSearchRanking.js';

const SEARCH_CACHE_TTL_MS = 60_000;
const CONTENT_SEARCH_CACHE_TTL_MS = 45_000;
const CONTENT_SEARCH_CACHE_MAX_ENTRIES = 80;
const CONTENT_SEARCH_MIN_QUERY_LENGTH = 3;
const MAX_RESULTS = 30;
const SEARCH_PANEL_EXIT_MS = 180;
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
    title: 'Подключиться к уроку',
    description: 'Войти в комнату: звонок, общая доска и совместный код.',
    cta: 'Войти в урок',
    keywords: 'урок онлайн урок занятие подключиться подключение комната созвон созвониться звонок звонка видеозвонок позвонить войти зайти преподаватель учитель',
    intents: [
      'урок', 'занятие', 'подключиться', 'подключение', 'комната урока', 'созвон',
      'звонок', 'звонка', 'видеозвонок', 'позвонить', 'звонок с учителем',
      'войти на урок', 'войти в урок', 'зайти на урок', 'перейти к уроку', 'открыть урок',
      'начать урок', 'войти в звонок', 'присоединиться к звонку', 'учитель звонит', 'в комнату урока',
      'созвониться', 'подключение к уроку', 'онлайн урок',
    ],
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
    keywords: 'тестирование тесты тест практика задание задания задача задачи домашка решать',
    intents: ['тестирование', 'тесты', 'тест', 'решать тесты', 'решать задания', 'порешать', 'практика', 'тренировка'],
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
    intents: ['заметки учителя', 'комментарии учителя', 'комментарий учителя', 'советы учителя', 'заметки преподавателя', 'обратная связь', 'что исправить'],
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
    intents: ['пробники', 'пробник', 'пробные экзамены', 'пробный экзамен', 'вариант егэ', 'экзамен', 'баллы за пробник'],
    icon: Trophy,
  },
  {
    id: 'schedule',
    view: 'schedule',
    title: 'Сегодня и расписание',
    description: 'Ближайшие занятия, темы уроков и история встреч.',
    cta: 'Открыть расписание',
    keywords: 'календарь график расписание сегодня ближайшие занятия',
    intents: ['расписание', 'календарь', 'сегодня', 'график', 'когда урок', 'во сколько урок', 'следующий урок', 'ближайший урок', 'мои занятия'],
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
    keywords: 'успеваемость прогресс практика задание задания задача задачи домашняя работа домашка дз результаты',
    intents: ['успеваемость', 'прогресс', 'задание', 'задания', 'домашнее задание', 'домашка', 'дз', 'что задано', 'мои задания', 'результаты', 'статистика', 'сколько решил'],
    icon: LayoutGrid,
  },
  {
    id: 'review',
    view: 'review',
    title: 'Повторение ошибок',
    description: 'Вернуться к сложным заданиям, исправить ошибки и закрепить темы.',
    cta: 'Открыть повторение',
    keywords: 'повторение повторить ошибки работа над ошибками закрепить сложные задания',
    intents: ['повторение', 'повторить', 'ошибки', 'работа над ошибками', 'закрепить тему', 'сложные задания', 'разобрать ошибки'],
    icon: RefreshCcw,
  },
  {
    id: 'python',
    view: 'python',
    title: 'Изучение Python',
    description: 'Темы Python, практика и сохранённые решения.',
    cta: 'Открыть Python',
    keywords: 'python питон программирование код обучение',
    intents: ['python', 'питон', 'пайтон', 'изучение python', 'учить python', 'курс python', 'задачи python', 'программирование'],
    icon: Code2,
  },
  {
    id: 'notes',
    view: 'notes',
    title: 'Конспекты',
    description: 'Материалы уроков, шпаргалки, файлы и сохранённый код.',
    cta: 'Открыть конспекты',
    keywords: 'конспекты конспект заметки файлы материалы шпаргалки',
    intents: ['конспекты', 'конспект', 'шпаргалки', 'шпора', 'материалы', 'файлы', 'папка', 'теория', 'записи с урока'],
    icon: BookOpen,
  },
  {
    id: 'rating',
    view: 'rating',
    title: 'Рейтинг',
    description: 'Лига, уровень и место среди учеников.',
    cta: 'Открыть рейтинг',
    keywords: 'рейтинг лига уровень место прогресс xp',
    intents: ['рейтинг', 'лига', 'место в рейтинге', 'таблица лидеров', 'топ учеников'],
    icon: Trophy,
  },
  {
    id: 'collab',
    view: 'collab',
    title: 'Совместный код',
    description: 'Общий редактор кода для работы вместе с учителем.',
    cta: 'Открыть редактор',
    keywords: 'совместный код редактор программа писать код программировать ide',
    intents: ['совместный код', 'редактор кода', 'открыть код', 'перейти в код', 'кодить', 'писать код', 'написать код', 'редактор', 'ide'],
    icon: Code2,
  },
  {
    id: 'board',
    view: 'board',
    title: 'Доска',
    description: 'Схемы, объяснения и общие записи с урока.',
    cta: 'Открыть доску',
    keywords: 'доска рисование схема урок',
    intents: ['доска', 'открыть доску', 'перейти на доску', 'рисовать', 'схема', 'записи с доски', 'whiteboard', 'вайтборд'],
    icon: LayoutGrid,
  },
  {
    id: 'chat',
    view: 'chat',
    title: 'Чат с учителем',
    description: 'Задать вопрос и продолжить разговор с преподавателем.',
    cta: 'Открыть чат',
    keywords: 'чат сообщения помощь вопрос учителю',
    intents: ['чат', 'сообщения', 'сообщение', 'переписка', 'личка', 'написать учителю', 'спросить учителя', 'задать вопрос', 'вопрос учителю'],
    icon: Sparkles,
  },
];

const GROUPS = [
  { id: 'commands', label: 'Основные действия' },
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
  if (item?.group === 'commands') return 'feature';
  return 'compact';
};

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
    serverResult: true,
    presentationTier: ['tasks', 'lessons', 'mocks'].includes(group) ? 'feature' : 'compact',
    searchText: createSearchText(
      result?.title,
      result?.subtitle,
      result?.snippet,
      result?.sourceLabel,
      result?.kind,
    ),
    target,
  };
}).filter((item) => item.target && item.title);

const buildSearchItems = ({ tasks, pythonTasks, remoteData, studentId, availableViews }) => {
  const items = [];
  const allTasks = [
    ...asArray(tasks).map((task) => ({ task, python: false })),
    ...asArray(pythonTasks).map((task) => ({ task, python: true })),
  ];
  const taskTitleByNumber = new Map();

  const availableViewSet = new Set(
    asArray(availableViews).map((view) => String(view || '').trim()).filter(Boolean)
  );
  VIEW_COMMANDS
    .filter((command) => !availableViewSet.size || availableViewSet.has(command.view))
    .forEach((command, index) => {
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
        searchText: createSearchText(command.title, command.description, command.cta, command.keywords, command.intents, command.view),
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

const StudentGlobalSearch = ({
  studentId,
  theme = 'light',
  tasks = [],
  pythonTasks = [],
  availableViews = [],
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
  const panelId = useId();
  const panelTitleId = useId();
  const listboxId = useId();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const listboxRef = useRef(null);
  const requestIdRef = useRef(0);
  const contentRequestIdRef = useRef(0);
  const closeTimerRef = useRef(null);
  const focusOnOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelMotion, setPanelMotion] = useState('closed');
  const [panelPlacement, setPanelPlacement] = useState('bottom');
  const [panelStyle, setPanelStyle] = useState(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeResultId, setActiveResultId] = useState('');
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

  const openPalette = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    focusOnOpenRef.current = true;
    setPanelMounted(true);
    setPanelMotion('entering');
    setOpen(true);
  }, []);

  const focusNextControlAfterTrigger = useCallback(() => {
    if (typeof document === 'undefined' || !triggerRef.current) return;
    const focusableElements = Array.from(document.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => (
      !panelRef.current?.contains(element)
      && element.getClientRects().length > 0
      && element.getAttribute('aria-hidden') !== 'true'
    ));
    const triggerIndex = focusableElements.indexOf(triggerRef.current);
    focusableElements[triggerIndex + 1]?.focus({ preventScroll: true });
  }, []);

  const closePalette = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setOpen(false);
    setPanelMotion('closing');
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setPanelMounted(false);
      setPanelMotion('closed');
      setPanelStyle(null);
      setQuery('');
      setDebouncedQuery('');
      setActiveResultId('');
    }, SEARCH_PANEL_EXIT_MS);
  }, []);

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
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
        if (open) {
          closePalette();
          window.requestAnimationFrame(() => triggerRef.current?.focus());
        } else {
          openPalette();
        }
        return;
      }
      if (open && event.key === 'Escape') {
        event.preventDefault();
        closePalette();
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [closePalette, open, openPalette]);

  useEffect(() => {
    if (!open) return undefined;
    const handleDocumentMouseDown = (event) => {
      const target = event.target;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        closePalette();
      }
    };
    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, [closePalette, open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;

    const updatePanelPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const margin = 12;
      const gap = 8;
      const width = Math.max(0, Math.min(640, viewportWidth - margin * 2));
      const left = Math.max(
        margin,
        Math.min(rect.right - width, viewportWidth - margin - width)
      );
      const availableBelow = Math.max(0, viewportHeight - rect.bottom - gap - margin);
      const availableAbove = Math.max(0, rect.top - gap - margin);
      const openAbove = availableBelow < 280 && availableAbove > availableBelow;
      const availableHeight = openAbove ? availableAbove : availableBelow;
      const maxHeight = Math.min(
        520,
        Math.max(160, Math.min(availableHeight, viewportHeight * 0.62))
      );

      setPanelPlacement(openAbove ? 'top' : 'bottom');
      setPanelStyle({
        left: `${left}px`,
        width: `${width}px`,
        maxHeight: `${maxHeight}px`,
        ...(openAbove
          ? { bottom: `${viewportHeight - rect.top + gap}px`, top: 'auto' }
          : { top: `${rect.bottom + gap}px`, bottom: 'auto' }),
      });
    };

    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !panelMounted || !panelStyle) return undefined;
    const frame = window.requestAnimationFrame(() => {
      setPanelMotion('open');
      if (focusOnOpenRef.current) {
        focusOnOpenRef.current = false;
        inputRef.current?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, panelMounted, panelStyle]);

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
    if (!open || !normalizedStudentId || normalizedContentQuery.length < CONTENT_SEARCH_MIN_QUERY_LENGTH) {
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
    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [loadRemoteData, open]);

  const effectiveRemoteData = remoteData.studentId === normalizedStudentId
    ? remoteData
    : EMPTY_REMOTE_DATA;
  const normalizedQuery = normalizeSearchText(query);
  const baseItems = useMemo(() => buildSearchItems({
    tasks,
    pythonTasks,
    remoteData: effectiveRemoteData,
    studentId: normalizedStudentId,
    availableViews,
  }), [availableViews, effectiveRemoteData, normalizedStudentId, pythonTasks, tasks]);
  const effectiveContentResults = contentSearchState.studentId === normalizedStudentId
    && contentSearchState.query === normalizedQuery
    ? contentSearchState.results
    : [];
  const contentItems = useMemo(
    () => buildServerSearchItems(effectiveContentResults, query),
    [effectiveContentResults, query]
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
    return rankStudentSearch({
      query: normalizedQuery,
      actionItems: baseItems.filter((item) => item.group === 'commands'),
      materialItems: allItems.filter((item) => item.group !== 'commands'),
      actionLimit: 5,
      materialLimit: 25,
    }).ordered;
  }, [allItems, baseItems, normalizedQuery]);

  const visibleResults = useMemo(() => [...selectedItems].sort((left, right) => {
    const groupDiff = (GROUP_ORDER.get(left.group) ?? 99) - (GROUP_ORDER.get(right.group) ?? 99);
    if (groupDiff) return groupDiff;
    return selectedItems.indexOf(left) - selectedItems.indexOf(right);
  }), [selectedItems]);
  const selectedResultIndex = activeResultId
    ? visibleResults.findIndex((item) => item.id === activeResultId)
    : -1;
  const safeActiveIndex = selectedResultIndex >= 0 ? selectedResultIndex : 0;

  const activateResult = useCallback((result) => {
    const target = result?.target;
    if (!target) return;
    closePalette();
    triggerRef.current?.focus({ preventScroll: true });
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
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      closePalette();
      triggerRef.current?.focus({ preventScroll: true });
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (visibleResults.length) {
        const nextIndex = (safeActiveIndex + 1) % visibleResults.length;
        setActiveResultId(visibleResults[nextIndex].id);
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (visibleResults.length) {
        const nextIndex = (safeActiveIndex - 1 + visibleResults.length) % visibleResults.length;
        setActiveResultId(visibleResults[nextIndex].id);
      }
      return;
    }
    if (event.key === 'Enter' && visibleResults[safeActiveIndex]) {
      event.preventDefault();
      activateResult(visibleResults[safeActiveIndex]);
    }
  };

  const isMetadataLoading = loadState.studentId === normalizedStudentId && loadState.loading;
  const isWaitingForContentSearch = open
    && normalizedQuery.length >= CONTENT_SEARCH_MIN_QUERY_LENGTH
    && normalizeSearchText(debouncedQuery) !== normalizedQuery;
  const isContentLoading = isWaitingForContentSearch || (contentSearchState.studentId === normalizedStudentId
    && contentSearchState.query === normalizedQuery
    && contentSearchState.loading);
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

  useEffect(() => {
    if (!open || !activeOptionId) return;
    const activeOption = listboxRef.current?.querySelector(`[id="${activeOptionId}"]`);
    activeOption?.scrollIntoView({ block: 'nearest' });
  }, [activeOptionId, open]);

  const palette = panelMounted && typeof document !== 'undefined' ? createPortal(
    <section
      ref={panelRef}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget && (event.currentTarget.contains(nextTarget) || nextTarget === triggerRef.current)) return;
        window.requestAnimationFrame(() => {
          const activeElement = document.activeElement;
          if (panelRef.current?.contains(activeElement) || activeElement === triggerRef.current) return;
          closePalette();
        });
      }}
      id={panelId}
      aria-labelledby={panelTitleId}
      aria-hidden={!open}
      data-motion={panelMotion}
      data-placement={panelPlacement}
      style={panelStyle || { visibility: 'hidden' }}
      className={`student-global-search-popover fixed z-[1400] flex flex-col overflow-hidden rounded-[1.4rem] border ring-1 ring-violet-400/15 ${
        isDarkTheme
          ? 'border-white/15 bg-slate-950/[0.94] text-slate-100 shadow-[0_28px_80px_rgba(2,6,23,0.66)] backdrop-blur-2xl'
          : 'border-white/90 bg-white/[0.92] text-slate-900 shadow-[0_28px_80px_rgba(64,45,120,0.2)] backdrop-blur-2xl'
      }`}
    >
      <div className="pointer-events-none absolute -right-12 -top-20 h-44 w-44 rounded-full bg-violet-500/15 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-16 top-10 h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" aria-hidden="true" />
      <div className={`relative z-[1] border-b bg-gradient-to-r from-violet-500/[0.08] via-transparent to-cyan-500/[0.07] p-2.5 sm:p-3 ${
        isDarkTheme ? 'border-white/10' : 'border-slate-200/75'
      }`}>
        <h2 id={panelTitleId} className="sr-only">Найти на платформе</h2>
        <div className="flex items-center gap-2">
          <label className={`student-global-search-field flex min-w-0 flex-1 items-center gap-2 rounded-[1rem] border p-1.5 pr-2 transition-all duration-200 focus-within:border-violet-400/55 focus-within:ring-4 focus-within:ring-violet-500/10 ${
            isDarkTheme
              ? 'border-white/10 bg-white/[0.055] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] focus-within:bg-white/[0.08]'
              : 'border-violet-200/70 bg-white/80 shadow-[0_8px_24px_rgba(91,33,182,0.06),inset_0_1px_0_rgba(255,255,255,0.8)] focus-within:bg-white'
          }`}>
            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
              isDarkTheme
                ? 'border-violet-300/20 bg-gradient-to-br from-violet-500/25 to-cyan-400/10 text-violet-200'
                : 'border-violet-200/80 bg-gradient-to-br from-violet-100 to-cyan-50 text-violet-600 shadow-sm'
            }`}>
              {isLoading
                ? <LoaderCircle className="animate-spin" size={16} />
                : <Search size={16} />}
            </span>
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
                setActiveResultId('');
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Например: урок, доска, задание 19, Черепаха…"
              className={`student-global-search-input min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none sm:text-[15px] ${
                isDarkTheme
                  ? 'text-white caret-violet-300 placeholder:text-slate-500'
                  : 'text-slate-950 caret-violet-600 placeholder:text-slate-400'
              }`}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setDebouncedQuery('');
                  setActiveResultId('');
                  inputRef.current?.focus();
                }}
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${
                  isDarkTheme
                    ? 'text-slate-400 hover:bg-white/10 hover:text-white'
                    : 'text-slate-400 hover:bg-violet-100 hover:text-violet-700'
                }`}
                aria-label="Очистить поиск"
              >
                <X size={16} />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => {
              closePalette();
              window.requestAnimationFrame(() => triggerRef.current?.focus());
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Tab' || event.shiftKey) return;
              event.preventDefault();
              closePalette();
              focusNextControlAfterTrigger();
            }}
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-transparent transition-all duration-200 hover:rotate-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
              isDarkTheme
                ? 'bg-white/[0.04] text-slate-400 hover:bg-white/10 hover:text-white'
                : 'bg-white/55 text-slate-400 hover:bg-violet-100 hover:text-violet-700'
            }`}
            aria-label="Закрыть поиск"
          >
            <X size={17} />
          </button>
        </div>
      </div>

        <div
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label="Результаты поиска"
          aria-busy={isLoading}
          className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5 sm:px-2.5 sm:py-2"
        >
          {visibleResults.length ? GROUPS.map((group) => {
            const groupItems = visibleResults
              .map((item, index) => ({ item, index }))
              .filter((entry) => entry.item.group === group.id);
            if (!groupItems.length) return null;
            return (
              <div key={group.id} className="mb-2 last:mb-0">
                <div className={`sticky top-0 z-[1] flex items-center justify-between px-2 py-1 backdrop-blur-sm ${
                  isDarkTheme ? 'bg-slate-950/95' : 'bg-white/95'
                }`}>
                  <h3 className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${isDarkTheme ? 'text-slate-500' : 'text-slate-400'}`}>
                    {group.label}
                  </h3>
                  <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${
                    isDarkTheme ? 'bg-white/5 text-slate-500' : 'bg-violet-50 text-violet-500'
                  }`}>{groupItems.length}</span>
                </div>
                <div className="space-y-1">
                  {groupItems.map(({ item, index }) => {
                    const Icon = item.Icon || Search;
                    const active = index === safeActiveIndex;
                    const presentationTier = getPresentationTier(item);
                    const isHero = presentationTier === 'hero';
                    const isCompact = presentationTier === 'compact';
                    const layoutClass = isHero
                      ? 'min-h-[64px] items-center gap-3 px-3 py-2.5'
                      : (isCompact ? 'gap-2.5 px-2.5 py-1.5' : 'gap-3 px-3 py-2');
                    const surfaceClass = isHero
                      ? (active
                        ? (isDarkTheme
                          ? 'border-violet-300/45 bg-gradient-to-r from-violet-500/25 via-fuchsia-500/10 to-cyan-500/10 shadow-[0_12px_32px_rgba(76,29,149,0.22)]'
                          : 'border-violet-300/80 bg-gradient-to-r from-violet-100/90 via-white/90 to-cyan-50/80 shadow-[0_12px_32px_rgba(109,40,217,0.12)]')
                        : (isDarkTheme
                          ? 'border-violet-400/20 bg-gradient-to-r from-violet-500/14 via-fuchsia-500/[0.06] to-cyan-500/[0.06] hover:border-violet-300/40 hover:from-violet-500/20'
                          : 'border-violet-200/70 bg-gradient-to-r from-violet-50/90 via-white/75 to-cyan-50/65 shadow-[0_6px_20px_rgba(109,40,217,0.06)] hover:border-violet-300/80 hover:from-violet-100/70'))
                      : (active
                        ? (isDarkTheme
                          ? 'border-violet-400/30 bg-gradient-to-r from-violet-500/18 to-cyan-500/[0.08] shadow-[0_8px_24px_rgba(76,29,149,0.15)]'
                          : 'border-violet-300/65 bg-gradient-to-r from-violet-100/80 to-cyan-50/70 shadow-[0_8px_24px_rgba(109,40,217,0.08)]')
                        : (isDarkTheme
                          ? 'border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.055]'
                          : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-slate-50/90'));
                    const iconSizeClass = isHero
                      ? 'h-10 w-10 rounded-xl'
                      : (isCompact ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl');
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
                        tabIndex={-1}
                        style={{ '--search-result-index': Math.min(index, 8) }}
                        onMouseEnter={() => setActiveResultId(item.id)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => activateResult(item)}
                        className={`student-global-search-result group flex w-full rounded-xl border text-left transition duration-200 ${layoutClass} ${surfaceClass}`}
                      >
                        <span className={`inline-flex shrink-0 items-center justify-center border transition ${iconSizeClass} ${iconToneClass}`}>
                          <Icon size={isHero ? 19 : (isCompact ? 15 : 17)} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`${isHero ? 'text-[15px]' : (isCompact ? 'text-[13px]' : 'text-sm')} min-w-0 truncate font-bold ${isDarkTheme ? 'text-slate-100' : 'text-slate-900'}`}>{item.title}</span>
                            <span className={`hidden shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide sm:inline-flex ${
                              isDarkTheme
                                ? 'border-white/10 bg-white/5 text-slate-500'
                                : 'border-slate-200 bg-white/80 text-slate-500'
                            }`}>
                              {item.sourceLabel || (isHero ? 'Быстрое действие' : '')}
                            </span>
                          </span>
                          {(item.description || item.subtitle || item.excerpt) && (
                            <span className={`mt-0.5 block truncate text-xs font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                              {item.group === 'commands'
                                ? (item.description || item.subtitle || item.excerpt)
                                : [item.subtitle, item.excerpt].filter(Boolean).join(' — ')}
                            </span>
                          )}
                        </span>
                        <ChevronRight className={`shrink-0 transition ${active
                          ? `translate-x-0 ${isDarkTheme ? 'text-violet-300' : 'text-violet-600'}`
                          : `-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 ${isDarkTheme ? 'text-slate-600' : 'text-slate-400'}`
                        }`} size={isCompact ? 15 : 17} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }) : (
            <div className="flex min-h-40 flex-col items-center justify-center px-6 py-6 text-center">
              <span className={`mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border ${
                isDarkTheme
                  ? 'border-white/10 bg-white/5 text-slate-500'
                  : 'border-violet-100 bg-violet-50 text-violet-500'
              }`}>
                <Search size={21} />
              </span>
              <p className={`text-sm font-bold ${isDarkTheme ? 'text-slate-200' : 'text-slate-800'}`}>Ничего не нашлось</p>
              <p className="mt-1 max-w-sm text-xs font-medium leading-relaxed text-slate-500">
                Попробуйте «урок», «доска», номер задания, тему или фрагмент сохранённого кода.
              </p>
            </div>
          )}
        </div>

        <footer className={`relative z-[1] flex min-h-10 items-center justify-between gap-3 border-t px-3 py-2 text-[10px] font-semibold ${
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
    </section>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) closePalette();
          else openPalette();
        }}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={`student-global-search-trigger group relative isolate inline-flex h-10 items-center gap-2 overflow-hidden rounded-[0.95rem] border px-2.5 text-xs font-extrabold transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 sm:px-3 ${
          isDarkTheme
            ? `${open ? 'border-violet-300/55 bg-gradient-to-r from-violet-500/22 to-cyan-500/10' : 'border-white/10 bg-slate-900/75'} text-slate-100 shadow-[0_10px_28px_rgba(2,6,23,0.26)] backdrop-blur-xl hover:border-violet-400/55 hover:shadow-[0_14px_34px_rgba(76,29,149,0.22)]`
            : `${open ? 'border-violet-300/90 bg-gradient-to-r from-violet-100/90 via-white/90 to-cyan-50/80 text-violet-800' : 'border-violet-200/70 bg-white/70 text-slate-700'} shadow-[0_10px_28px_rgba(76,29,149,0.10)] backdrop-blur-xl hover:border-violet-300 hover:bg-white/90 hover:text-violet-800 hover:shadow-[0_14px_34px_rgba(76,29,149,0.16)]`
        }`}
        title="Глобальный поиск (Ctrl/⌘ K)"
      >
        <span className="student-global-search-trigger__shine pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent opacity-0" aria-hidden="true" />
        <span className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.65rem] border transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105 ${
          open ? '-rotate-6 scale-105' : ''
        } ${
          isDarkTheme
            ? 'border-violet-300/20 bg-gradient-to-br from-violet-400/25 to-cyan-400/10 text-violet-200'
            : 'border-violet-200/80 bg-gradient-to-br from-violet-100 to-cyan-50 text-violet-600 shadow-sm'
        }`}>
          <Search size={14} strokeWidth={2.4} />
          <span className={`absolute right-1 top-1 h-1 w-1 rounded-full transition ${
            open ? 'scale-125 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-violet-400/70'
          }`} aria-hidden="true" />
        </span>
        <span className="relative">Поиск</span>
        <span className={`relative hidden text-[9px] font-bold tracking-wide sm:inline ${
          isDarkTheme ? 'text-slate-500' : 'text-slate-400'
        }`} aria-hidden="true">Ctrl K</span>
      </button>
      {palette}
    </>
  );
};

export default StudentGlobalSearch;
