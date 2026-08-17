import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import Editor from '@monaco-editor/react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Code2, Copy, Download, FileCode2, FileSpreadsheet, GraduationCap, History, Image, ListChecks, Maximize2, Minimize2, Moon, Music, PanelLeft, PanelTop, PictureInPicture2, PlayCircle, RefreshCcw, Send, Share2, Sun, Terminal, Volume2, VolumeX, X } from 'lucide-react';
import { api, authenticatedUploadsFetch } from '../services/api';
import useWorkbookHelper from '../hooks/useWorkbookHelper';
import useQuestionSolveTimer from '../hooks/useQuestionSolveTimer';
import { buildDownloadUrl } from '../utils/downloadUrl';
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from '../utils/monacoTheme';
import { getQuestionLabelStyle, normalizeQuestionLabel } from '../utils/questionLabel';
import { getAnswerPasteOrder, splitPastedAnswerValues } from '../utils/answerPaste';
import { normalizeTurtleScene, parseTurtleSceneJson } from '../utils/turtleScene';
import {
  QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE,
  hasEnoughQuestionDifficultyData,
} from '../utils/questionDifficulty';
import { getLatestUnsolvedDurationMs } from '../utils/questionSolveTimer';
import { getQuickHomeworkPlanPresentation } from '../utils/homeworkQuickPlanPresentation';
import {
  clearQuestionPictureInPictureWindow,
  reportQuestionPictureInPictureActivity,
  setQuestionPictureInPictureWindow,
} from '../utils/questionPictureInPicture';
import HEADLESS_TURTLE_SOURCE from '../python/headless_turtle.py?raw';
import { Button } from './ui';
import StudentTestWindowTour from './StudentTestWindowTour';
import TurtleCanvas from './TurtleCanvas';
import QuestionDifficultyBadge from './QuestionDifficultyBadge';

const STUDENT_TEST_ANSWER_DRAFT_PREFIX = 'student-test-answer-draft-v1';
const STUDENT_HELP_DRAFT_PREFIX = 'student-help-draft-v1';
const STUDENT_HELP_CHANNEL_PREF_KEY = 'student-help-channel-v1';
const STUDENT_CODE_WORKSPACE_PREFS_KEY = 'student-code-workspace-prefs-v1';
const STUDENT_CODE_LAYOUT_PREF_VERSION = 2;
const STUDENT_CODE_LAYOUT_STACKED = 'stacked';
const STUDENT_CODE_LAYOUT_SIDE = 'side';
const STUDENT_CODE_FONT_SIZE_MIN = 12;
const STUDENT_CODE_FONT_SIZE_MAX = 24;
const STUDENT_CODE_FONT_SIZE_DEFAULT = 15;
const STUDENT_CODE_LAYOUT_ANIMATION_MS = 720;
const STUDENT_CODE_CLOSE_ANIMATION_MS = 360;
const STUDENT_TEST_CLOSE_ANIMATION_MS = 340;
const STUDENT_HELP_CLOSE_ANIMATION_MS = 260;
const STUDENT_HELP_SOLUTION_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const STUDENT_HELP_SOLUTION_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const STUDENT_CODE_FOCUS_FULLSCREEN_DELAY_MS = 120;
const STUDENT_CODE_FOCUS_MUSIC_SRC = '/sounds/code-focus.mp3';
const STUDENT_CODE_FOCUS_MUSIC_VOLUME_DEFAULT = 0.42;
const STUDENT_CODE_COPY_FEEDBACK_MS = 1800;
const STUDENT_TEACHER_SHARE_FEEDBACK_MS = 2600;
const STUDENT_TELEGRAM_APP_FALLBACK_MS = 6000;
const STUDENT_TEACHER_SHARE_MAX_SCREENSHOTS = 8;
const STUDENT_TEACHER_SHARE_MAX_CODE_LENGTH = 16000;
const MOCK_EXAM_SOURCE_BADGE_COLOR = '#0f766e';
const TEST_WORKBOOK_EXTENSIONS = new Set(['xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'fods']);
const TEXT_TO_WORKBOOK_TASK_NUMBERS = new Set([26, 27]);
const TEXT_TO_WORKBOOK_EXTENSIONS = new Set(['txt', 'csv', 'tsv']);

const getTestAttachmentExtension = (file) => {
  const name = String(file?.name || file?.storageName || '').trim();
  const match = name.match(/\.([^.\\/]+)$/);
  return match ? match[1].toLowerCase() : '';
};

const getTestAttachmentId = (file) => String(file?.id || file?.storageName || '').trim();

const canSolveTestWorkbook = (taskNumber, file) => {
  const extension = getTestAttachmentExtension(file);
  return TEST_WORKBOOK_EXTENSIONS.has(extension)
    || (
      TEXT_TO_WORKBOOK_TASK_NUMBERS.has(Number(taskNumber))
      && TEXT_TO_WORKBOOK_EXTENSIONS.has(extension)
    );
};

const getStudentQuestionAnswerCount = (question, taskNumber, getAnswerCountForTask) => {
  const override = Math.trunc(Number(question?.answerCountOverride));
  if (Number.isFinite(override) && override > 0 && override <= 50) return override;
  return getAnswerCountForTask(taskNumber);
};

const getMockExamSourceBadge = (question) => {
  const source = question?.mockExamSource;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const label = String(source.label || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!label) return null;
  return {
    text: label,
    color: MOCK_EXAM_SOURCE_BADGE_COLOR,
  };
};

const STUDENT_TEST_WINDOW_TOUR_STEPS = [
  {
    target: '[data-student-test-tour="question-navigation"]',
    title: 'Цвет номера показывает статус',
    text: 'Фиолетовый отмечает текущий вопрос, отдельный цвет появляется у сохранённого черновика, а после проверки номер показывает правильный или ошибочный ответ.',
    accent: '#6366f1',
  },
  {
    target: '[data-student-test-tour="condition-media"]',
    fallback: '[data-student-test-tour="condition"]',
    title: 'Условие можно открыть крупнее',
    text: 'Нажмите на изображение задания, чтобы рассмотреть его в полноэкранном режиме.',
    accent: '#a855f7',
  },
  {
    target: '[data-student-test-tour="code-tools"]',
    fallback: '[data-student-test-tour="condition"]',
    title: 'Один код в двух режимах',
    text: '«Показать код» и «Решать в коде» открывают один и тот же solution.py. Вставленный или изменённый код сохраняется автоматически: правки под заданием сразу появятся в большом редакторе, и наоборот.',
    accent: '#0ea5e9',
  },
  {
    target: '[data-student-test-tour="teacher-help"]',
    fallback: '[data-student-test-tour="condition"]',
    title: 'Поделиться заданием',
    text: 'Здесь можно спросить учителя внутри платформы, отправить красивую карточку через Telegram или скопировать её для одного Ctrl+V.',
    accent: '#ec4899',
  },
  {
    target: '[data-student-test-tour="answer"]',
    title: 'Черновик ответа не потеряется',
    text: 'Введённый ответ сохраняется автоматически. В заданиях с большой таблицей можно вставить весь список целиком — значения сами распределятся по ячейкам.',
    accent: '#10b981',
  },
  {
    target: '[data-student-test-tour="history"]',
    fallback: '[data-student-test-tour="answer"]',
    title: 'История хранит все попытки',
    text: 'Здесь можно посмотреть отправленные ранее ответы, результат каждой проверки и время попытки.',
    accent: '#f59e0b',
  },
  {
    target: '[data-student-test-tour="replay"]',
    fallback: '[data-student-test-tour="header"]',
    title: 'Обучение можно открыть снова',
    text: 'Кнопка с академической шапочкой в заголовке повторно запускает эти подсказки в любой момент.',
    accent: '#06b6d4',
  },
];

const writeStudentCodeToClipboard = async (value) => {
  const code = String(value ?? '');
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(code);
      return;
    } catch {
      // Fall back to the legacy copy command when clipboard permissions are restricted.
    }
  }
  if (typeof document === 'undefined') throw new Error('Clipboard is unavailable');
  const textarea = document.createElement('textarea');
  textarea.value = code;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  let copied = false;
  try {
    textarea.select();
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
  }
  if (!copied) throw new Error('Copy failed');
};

const createStudentHelpRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `help-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const readStudentHelpSolutionImage = (file) => new Promise((resolve, reject) => {
  if (!file) {
    reject(new Error('Выберите изображение решения'));
    return;
  }
  const mime = String(file.type || '').trim().toLowerCase();
  if (!STUDENT_HELP_SOLUTION_IMAGE_TYPES.has(mime)) {
    reject(new Error('Можно прикрепить PNG, JPG или WebP'));
    return;
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > STUDENT_HELP_SOLUTION_IMAGE_MAX_BYTES) {
    reject(new Error('Изображение должно быть не больше 5 МБ'));
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = typeof reader.result === 'string' ? reader.result : '';
    if (!dataUrl) {
      reject(new Error('Не удалось прочитать изображение'));
      return;
    }
    resolve({
      dataUrl,
      name: String(file.name || 'student-solution.png').slice(0, 180),
      size: file.size,
    });
  };
  reader.onerror = () => reject(new Error('Не удалось прочитать изображение'));
  reader.readAsDataURL(file);
});

const formatStudentHelpImageSize = (value) => {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(size / 1024))} КБ`;
};

const getStudentHelpDraftKey = ({ studentId, taskNumber, levelId, questionId }) => [
  STUDENT_HELP_DRAFT_PREFIX,
  String(studentId || 'student'),
  String(taskNumber || 'task'),
  String(levelId || 'level'),
  String(questionId || 'question'),
].join(':');

const wrapStudentHelpCanvasText = (context, value, maxWidth) => {
  const source = String(value || '').replace(/\r\n?/g, '\n').trim();
  if (!source) return [];
  const lines = [];
  source.split('\n').forEach((paragraph, paragraphIndex, paragraphs) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = '';
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    if (!words.length) lines.push('');
    if (paragraphIndex < paragraphs.length - 1) lines.push('');
  });
  return lines;
};

const createStudentHelpTextSnapshot = ({ taskNumber, taskTitle, questionNumber, label, text }) => {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return '';
  const width = 1200;
  const horizontalPadding = 68;
  context.font = '500 27px Inter, Arial, sans-serif';
  const bodyLines = wrapStudentHelpCanvasText(context, String(text || '').slice(0, 2400), width - horizontalPadding * 2)
    .slice(0, 30);
  const height = Math.max(390, Math.min(1450, 250 + Math.max(1, bodyLines.length) * 39));
  canvas.width = width;
  canvas.height = height;

  context.fillStyle = '#f5f3ff';
  context.fillRect(0, 0, width, height);
  const surface = context.createLinearGradient(0, 0, width, height);
  surface.addColorStop(0, '#ffffff');
  surface.addColorStop(1, '#f8fafc');
  context.fillStyle = surface;
  context.beginPath();
  context.roundRect(28, 28, width - 56, height - 56, 30);
  context.fill();
  context.strokeStyle = '#ddd6fe';
  context.lineWidth = 2;
  context.stroke();

  const accent = context.createLinearGradient(0, 0, width, 0);
  accent.addColorStop(0, '#7c3aed');
  accent.addColorStop(1, '#c026d3');
  context.fillStyle = accent;
  context.beginPath();
  context.roundRect(28, 28, 12, height - 56, [30, 0, 0, 30]);
  context.fill();

  context.fillStyle = '#7c3aed';
  context.font = '800 20px Inter, Arial, sans-serif';
  context.fillText(`ЗАДАНИЕ №${taskNumber} · ВОПРОС №${questionNumber}`, horizontalPadding, 92);

  context.fillStyle = '#0f172a';
  context.font = '800 38px Inter, Arial, sans-serif';
  context.fillText(String(taskTitle || 'Условие задачи').slice(0, 52), horizontalPadding, 145);

  if (label) {
    context.fillStyle = '#64748b';
    context.font = '700 20px Inter, Arial, sans-serif';
    context.fillText(String(label).slice(0, 70), horizontalPadding, 187);
  }

  context.fillStyle = '#1e293b';
  context.font = '500 27px Inter, Arial, sans-serif';
  let y = label ? 238 : 210;
  if (bodyLines.length === 0) {
    context.fillStyle = '#64748b';
    context.fillText('Условие открыто в текущем задании.', horizontalPadding, y);
  } else {
    bodyLines.forEach((line) => {
      context.fillText(line, horizontalPadding, y);
      y += 39;
    });
  }

  context.fillStyle = '#94a3b8';
  context.font = '600 17px Inter, Arial, sans-serif';
  context.fillText('Снимок условия · платформа «Иван на сотку»', horizontalPadding, height - 66);
  return canvas.toDataURL('image/png');
};

const loadStudentHelpSnapshotImage = async (entry) => {
  const source = String(entry?.url || '').trim();
  if (!source || typeof window === 'undefined') return null;
  let objectUrl = '';
  let imageSource = source;
  if (source.startsWith('/uploads/')) {
    const response = await authenticatedUploadsFetch(source);
    if (!response.ok) throw new Error('Не удалось загрузить страницу условия');
    objectUrl = window.URL.createObjectURL(await response.blob());
    imageSource = objectUrl;
  }
  try {
    const image = await new Promise((resolve, reject) => {
      const nextImage = new window.Image();
      nextImage.decoding = 'async';
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Не удалось подготовить страницу условия'));
      nextImage.src = imageSource;
    });
    return { image, objectUrl };
  } catch (error) {
    if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

const createStudentHelpMultiImageSnapshot = async ({ screenshots, taskNumber, questionNumber }) => {
  if (typeof document === 'undefined' || !Array.isArray(screenshots) || screenshots.length < 2) return '';
  const loaded = [];
  try {
    for (const screenshot of screenshots.slice(0, 12)) {
      const entry = await loadStudentHelpSnapshotImage(screenshot);
      if (entry?.image?.naturalWidth > 0 && entry?.image?.naturalHeight > 0) loaded.push(entry);
    }
    if (loaded.length < 2) return '';

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return '';
    const width = 1280;
    const padding = 28;
    const headerHeight = 88;
    const gap = 22;
    const contentWidth = width - padding * 2;
    const heights = loaded.map(({ image }) => Math.max(
      1,
      Math.round(image.naturalHeight * (contentWidth / image.naturalWidth))
    ));
    const height = headerHeight + padding + heights.reduce((sum, value) => sum + value, 0) + gap * (loaded.length - 1) + padding;
    canvas.width = width;
    canvas.height = height;

    context.fillStyle = '#eef2ff';
    context.fillRect(0, 0, width, height);
    const headerGradient = context.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, '#6d28d9');
    headerGradient.addColorStop(1, '#c026d3');
    context.fillStyle = headerGradient;
    context.fillRect(0, 0, width, headerHeight);
    context.fillStyle = '#ffffff';
    context.font = '800 24px Inter, Arial, sans-serif';
    context.fillText(`ЗАДАНИЕ №${taskNumber} · ВОПРОС №${questionNumber}`, padding, 38);
    context.font = '600 17px Inter, Arial, sans-serif';
    context.fillText(`Условие из ${loaded.length} частей · собрано без пропусков`, padding, 66);

    let y = headerHeight + padding;
    loaded.forEach(({ image }, index) => {
      const pageHeight = heights[index];
      context.fillStyle = '#ffffff';
      context.fillRect(padding - 2, y - 2, contentWidth + 4, pageHeight + 4);
      context.strokeStyle = '#cbd5e1';
      context.lineWidth = 2;
      context.strokeRect(padding - 2, y - 2, contentWidth + 4, pageHeight + 4);
      context.drawImage(image, padding, y, contentWidth, pageHeight);
      context.fillStyle = 'rgba(15, 23, 42, 0.84)';
      context.beginPath();
      context.roundRect(padding + 14, y + 14, 92, 34, 17);
      context.fill();
      context.fillStyle = '#ffffff';
      context.font = '700 15px Inter, Arial, sans-serif';
      context.fillText(`Часть ${index + 1}`, padding + 29, y + 37);
      y += pageHeight + gap;
    });
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    loaded.forEach(({ objectUrl }) => {
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    });
  }
};

const STUDENT_TEACHER_SHARE_PYTHON_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'case', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'match', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with',
  'yield', 'False', 'None', 'True',
]);
const STUDENT_TEACHER_SHARE_PYTHON_BUILTINS = new Set([
  'abs', 'all', 'any', 'bool', 'dict', 'enumerate', 'filter', 'float', 'input', 'int', 'isinstance',
  'len', 'list', 'map', 'max', 'min', 'open', 'print', 'range', 'reversed', 'round', 'set', 'sorted',
  'str', 'sum', 'tuple', 'type', 'zip',
]);

const buildStudentTeacherShareText = ({
  taskNumber,
  taskTitle,
  questionNumber,
  label,
  conditionText,
  screenshotCount,
  code,
  answer,
}) => {
  const sections = [
    `Задание №${taskNumber} · вопрос №${questionNumber}`,
    String(taskTitle || '').trim(),
    String(label || '').trim(),
  ].filter(Boolean);
  const normalizedCondition = String(conditionText || '').trim();
  if (normalizedCondition) sections.push(`УСЛОВИЕ\n${normalizedCondition}`);
  if (screenshotCount > 0) {
    sections.push(`К условию приложено ${screenshotCount} ${screenshotCount === 1 ? 'изображение' : 'изображения'}.`);
  }
  const normalizedAnswer = String(answer || '').trim();
  if (normalizedAnswer) sections.push(`МОЙ ОТВЕТ\n${normalizedAnswer}`);
  const normalizedCode = String(code || '').trimEnd();
  sections.push(`МОЙ КОД · solution.py\n\`\`\`python\n${normalizedCode || '# Код пока не написан'}\n\`\`\``);
  return sections.join('\n\n');
};

const splitStudentTeacherShareCodeLines = (value, maxCharacters = 88, maxLines = 150) => {
  const source = String(value || '# Код пока не написан')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .slice(0, STUDENT_TEACHER_SHARE_MAX_CODE_LENGTH);
  const displayLines = [];
  const sourceLines = source.split('\n');
  sourceLines.forEach((line, sourceIndex) => {
    if (displayLines.length >= maxLines) return;
    if (!line) {
      displayLines.push({ text: '', number: sourceIndex + 1, continuation: false });
      return;
    }
    let remainder = line;
    let continuation = false;
    while (remainder.length > 0 && displayLines.length < maxLines) {
      displayLines.push({
        text: remainder.slice(0, maxCharacters),
        number: sourceIndex + 1,
        continuation,
      });
      remainder = remainder.slice(maxCharacters);
      continuation = true;
    }
  });
  const wasTruncated = source.length < String(value || '').replace(/\r\n?/g, '\n').length
    || sourceLines.some((_, index) => index + 1 > (displayLines.at(-1)?.number || 0));
  if (wasTruncated && displayLines.length < maxLines) {
    displayLines.push({ text: '# … часть кода не поместилась в карточку', number: null, continuation: true });
  }
  return displayLines.slice(0, maxLines);
};

const getStudentTeacherShareCodeTokens = (line) => {
  const source = String(line || '');
  const tokens = [];
  const pattern = /#[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b[A-Za-z_]\w*\b|\b\d+(?:\.\d+)?\b/g;
  let cursor = 0;
  let match = pattern.exec(source);
  while (match) {
    if (match.index > cursor) tokens.push({ text: source.slice(cursor, match.index), color: '#dbeafe' });
    const token = match[0];
    let color = '#dbeafe';
    if (token.startsWith('#')) color = '#7dd3a7';
    else if (token.startsWith("'") || token.startsWith('"')) color = '#fbbf8a';
    else if (/^\d/.test(token)) color = '#f9d67a';
    else if (STUDENT_TEACHER_SHARE_PYTHON_KEYWORDS.has(token)) color = '#c4a7ff';
    else if (STUDENT_TEACHER_SHARE_PYTHON_BUILTINS.has(token)) color = '#67e8f9';
    tokens.push({ text: token, color });
    cursor = match.index + token.length;
    match = pattern.exec(source);
  }
  if (cursor < source.length) tokens.push({ text: source.slice(cursor), color: '#dbeafe' });
  return tokens;
};

const studentTeacherShareCanvasToBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Не удалось подготовить карточку'));
  }, 'image/png');
});

const createStudentTeacherShareCard = async ({
  taskNumber,
  taskTitle,
  questionNumber,
  label,
  conditionText,
  screenshots,
  code,
  answer,
}) => {
  if (typeof document === 'undefined') throw new Error('Canvas is unavailable');
  const loadedScreenshots = [];
  try {
    for (const screenshot of (Array.isArray(screenshots) ? screenshots : []).slice(0, STUDENT_TEACHER_SHARE_MAX_SCREENSHOTS)) {
      try {
        const loaded = await loadStudentHelpSnapshotImage(screenshot);
        if (loaded?.image?.naturalWidth > 0 && loaded?.image?.naturalHeight > 0) loadedScreenshots.push(loaded);
      } catch {
        // A textual card is still useful when a single attachment cannot be loaded.
      }
    }

    const width = 1280;
    const outerPadding = 34;
    const contentX = 58;
    const contentWidth = width - contentX * 2;
    const headerHeight = 176;
    const sectionTitleHeight = 54;
    const sectionGap = 30;
    const imageGap = 18;
    const conditionTextSource = String(conditionText || '').trim();
    const measureCanvas = document.createElement('canvas');
    const measureContext = measureCanvas.getContext('2d');
    if (!measureContext) throw new Error('Canvas is unavailable');
    measureContext.font = '500 25px Inter, Arial, sans-serif';
    const conditionLines = wrapStudentHelpCanvasText(measureContext, conditionTextSource.slice(0, 4000), contentWidth - 56)
      .slice(0, 42);
    const conditionTextHeight = conditionLines.length > 0 ? 42 + conditionLines.length * 36 : 0;

    const naturalImageLayouts = loadedScreenshots.map(({ image }) => ({
      image,
      width: contentWidth,
      height: Math.max(1, Math.round(image.naturalHeight * (contentWidth / image.naturalWidth))),
    }));
    const naturalImagesHeight = naturalImageLayouts.reduce((sum, item) => sum + item.height, 0)
      + Math.max(0, naturalImageLayouts.length - 1) * imageGap;
    const maxImagesHeight = 6800;
    const imagesScale = naturalImagesHeight > maxImagesHeight
      ? (maxImagesHeight - Math.max(0, naturalImageLayouts.length - 1) * imageGap) / Math.max(1, naturalImagesHeight)
      : 1;
    const imageLayouts = naturalImageLayouts.map((item) => ({
      ...item,
      width: Math.round(item.width * imagesScale),
      height: Math.round(item.height * imagesScale),
    }));
    const imagesHeight = imageLayouts.reduce((sum, item) => sum + item.height, 0)
      + Math.max(0, imageLayouts.length - 1) * imageGap;
    const hasConditionContent = imageLayouts.length > 0 || conditionLines.length > 0;
    const conditionHeight = sectionTitleHeight
      + (hasConditionContent ? imagesHeight + conditionTextHeight + (imagesHeight > 0 && conditionTextHeight > 0 ? 22 : 0) : 100);

    const codeLines = splitStudentTeacherShareCodeLines(String(code || ''));
    const codeHeaderHeight = 70;
    const codeLineHeight = 31;
    const codeBodyPadding = 28;
    const codeBlockHeight = codeHeaderHeight + codeBodyPadding * 2 + Math.max(1, codeLines.length) * codeLineHeight;

    measureContext.font = '600 24px Inter, Arial, sans-serif';
    const answerLines = wrapStudentHelpCanvasText(measureContext, String(answer || '').slice(0, 1200), contentWidth - 68)
      .slice(0, 10);
    const answerHeight = answerLines.length > 0 ? 92 + answerLines.length * 35 : 0;
    const footerHeight = 78;
    const height = outerPadding + headerHeight + conditionHeight + sectionGap + sectionTitleHeight + codeBlockHeight
      + (answerHeight > 0 ? sectionGap + answerHeight : 0) + footerHeight + outerPadding;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');

    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#f4f1ff');
    background.addColorStop(0.48, '#f8fafc');
    background.addColorStop(1, '#eff6ff');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(255, 255, 255, 0.92)';
    context.beginPath();
    context.roundRect(outerPadding, outerPadding, width - outerPadding * 2, height - outerPadding * 2, 34);
    context.fill();
    context.strokeStyle = '#d8d2fe';
    context.lineWidth = 2;
    context.stroke();

    const accent = context.createLinearGradient(contentX, 0, width - contentX, 0);
    accent.addColorStop(0, '#7c3aed');
    accent.addColorStop(0.56, '#9333ea');
    accent.addColorStop(1, '#2563eb');
    context.fillStyle = accent;
    context.beginPath();
    context.roundRect(contentX, 66, 206, 40, 20);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = '800 17px Inter, Arial, sans-serif';
    context.fillText('ДЛЯ УЧИТЕЛЯ', contentX + 28, 92);
    context.fillStyle = '#0f172a';
    context.font = '850 36px Inter, Arial, sans-serif';
    context.fillText(`Задание №${taskNumber} · вопрос №${questionNumber}`, contentX, 142);
    const subtitle = [String(taskTitle || '').trim(), String(label || '').trim()].filter(Boolean).join(' · ');
    if (subtitle) {
      context.fillStyle = '#64748b';
      context.font = '650 20px Inter, Arial, sans-serif';
      context.fillText(subtitle.slice(0, 90), contentX, 174);
    }

    let y = outerPadding + headerHeight;
    context.fillStyle = '#7c3aed';
    context.font = '850 19px Inter, Arial, sans-serif';
    context.fillText('УСЛОВИЕ', contentX, y + 30);
    if (imageLayouts.length > 0) {
      context.fillStyle = '#94a3b8';
      context.font = '650 16px Inter, Arial, sans-serif';
      context.fillText(`${imageLayouts.length} ${imageLayouts.length === 1 ? 'изображение' : 'изображения'}`, contentX + 126, y + 30);
    }
    y += sectionTitleHeight;

    if (!hasConditionContent) {
      context.fillStyle = '#f8fafc';
      context.beginPath();
      context.roundRect(contentX, y, contentWidth, 82, 22);
      context.fill();
      context.fillStyle = '#64748b';
      context.font = '600 23px Inter, Arial, sans-serif';
      context.fillText('Условие находится в материалах задания.', contentX + 28, y + 50);
      y += 100;
    } else {
      imageLayouts.forEach((layout, index) => {
        const imageX = contentX + Math.round((contentWidth - layout.width) / 2);
        context.save();
        context.shadowColor = 'rgba(15, 23, 42, 0.13)';
        context.shadowBlur = 18;
        context.shadowOffsetY = 7;
        context.fillStyle = '#ffffff';
        context.beginPath();
        context.roundRect(imageX - 5, y - 5, layout.width + 10, layout.height + 10, 18);
        context.fill();
        context.restore();
        context.drawImage(layout.image, imageX, y, layout.width, layout.height);
        if (imageLayouts.length > 1) {
          context.fillStyle = 'rgba(15, 23, 42, 0.82)';
          context.beginPath();
          context.roundRect(imageX + 16, y + 16, 108, 34, 17);
          context.fill();
          context.fillStyle = '#ffffff';
          context.font = '750 15px Inter, Arial, sans-serif';
          context.fillText(`Часть ${index + 1}`, imageX + 35, y + 39);
        }
        y += layout.height + imageGap;
      });
      if (imageLayouts.length > 0) y -= imageGap;
      if (conditionLines.length > 0) {
        if (imageLayouts.length > 0) y += 22;
        context.fillStyle = '#f8fafc';
        context.beginPath();
        context.roundRect(contentX, y, contentWidth, conditionTextHeight, 22);
        context.fill();
        context.strokeStyle = '#e2e8f0';
        context.lineWidth = 1.5;
        context.stroke();
        context.fillStyle = '#1e293b';
        context.font = '500 25px Inter, Arial, sans-serif';
        let textY = y + 36;
        conditionLines.forEach((line) => {
          context.fillText(line, contentX + 28, textY);
          textY += 36;
        });
        y += conditionTextHeight;
      }
    }

    y += sectionGap;
    context.fillStyle = '#7c3aed';
    context.font = '850 19px Inter, Arial, sans-serif';
    context.fillText('МОЙ КОД', contentX, y + 30);
    context.fillStyle = '#94a3b8';
    context.font = '650 16px Inter, Arial, sans-serif';
    context.fillText('solution.py · текущая версия', contentX + 124, y + 30);
    y += sectionTitleHeight;

    const codeY = y;
    context.fillStyle = '#0b1020';
    context.beginPath();
    context.roundRect(contentX, codeY, contentWidth, codeBlockHeight, 24);
    context.fill();
    context.fillStyle = '#ef4444';
    context.beginPath();
    context.arc(contentX + 28, codeY + 29, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f59e0b';
    context.beginPath();
    context.arc(contentX + 52, codeY + 29, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#22c55e';
    context.beginPath();
    context.arc(contentX + 76, codeY + 29, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#94a3b8';
    context.font = '650 17px ui-monospace, SFMono-Regular, Consolas, monospace';
    context.fillText('solution.py', contentX + 104, codeY + 36);
    context.strokeStyle = '#1e293b';
    context.beginPath();
    context.moveTo(contentX, codeY + codeHeaderHeight);
    context.lineTo(contentX + contentWidth, codeY + codeHeaderHeight);
    context.stroke();

    context.font = '500 20px ui-monospace, SFMono-Regular, Consolas, monospace';
    let codeTextY = codeY + codeHeaderHeight + codeBodyPadding + 21;
    codeLines.forEach((line) => {
      context.fillStyle = '#64748b';
      context.textAlign = 'right';
      context.fillText(line.continuation ? '·' : String(line.number ?? ''), contentX + 61, codeTextY);
      context.textAlign = 'left';
      let codeX = contentX + 84;
      getStudentTeacherShareCodeTokens(line.text).forEach((token) => {
        context.fillStyle = token.color;
        context.fillText(token.text, codeX, codeTextY);
        codeX += context.measureText(token.text).width;
      });
      codeTextY += codeLineHeight;
    });
    y += codeBlockHeight;

    if (answerLines.length > 0) {
      y += sectionGap;
      context.fillStyle = '#ecfdf5';
      context.beginPath();
      context.roundRect(contentX, y, contentWidth, answerHeight, 22);
      context.fill();
      context.strokeStyle = '#a7f3d0';
      context.lineWidth = 1.5;
      context.stroke();
      context.fillStyle = '#047857';
      context.font = '850 17px Inter, Arial, sans-serif';
      context.fillText('МОЙ ОТВЕТ', contentX + 28, y + 34);
      context.fillStyle = '#064e3b';
      context.font = '650 24px Inter, Arial, sans-serif';
      let answerY = y + 73;
      answerLines.forEach((line) => {
        context.fillText(line, contentX + 28, answerY);
        answerY += 35;
      });
      y += answerHeight;
    }

    context.fillStyle = '#94a3b8';
    context.font = '650 16px Inter, Arial, sans-serif';
    context.fillText('Подготовлено для учителя · платформа «Иван на сотку»', contentX, height - outerPadding - 27);
    context.textAlign = 'right';
    context.fillText('Условие + текущий код в одном сообщении', width - contentX, height - outerPadding - 27);
    context.textAlign = 'left';
    return studentTeacherShareCanvasToBlob(canvas);
  } finally {
    loadedScreenshots.forEach(({ objectUrl }) => {
      if (objectUrl && typeof window !== 'undefined') window.URL.revokeObjectURL(objectUrl);
    });
  }
};

const writeStudentTeacherShareToClipboard = async ({ cardPromise, textPromise }) => {
  if (
    typeof navigator !== 'undefined'
    && navigator.clipboard?.write
    && typeof ClipboardItem !== 'undefined'
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': cardPromise,
          'text/plain': Promise.resolve(textPromise).then((value) => new Blob([value], { type: 'text/plain' })),
        }),
      ]);
      return 'image';
    } catch {
      // Some browsers only allow copying text; preserve a useful fallback.
    }
  }
  await writeStudentCodeToClipboard(await textPromise);
  return 'text';
};

const clampStudentCodeFontSize = (value) => {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return STUDENT_CODE_FONT_SIZE_DEFAULT;
  return Math.max(STUDENT_CODE_FONT_SIZE_MIN, Math.min(STUDENT_CODE_FONT_SIZE_MAX, numeric));
};

const clampStudentCodeFocusMusicVolume = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return STUDENT_CODE_FOCUS_MUSIC_VOLUME_DEFAULT;
  return Math.max(0, Math.min(1, numeric));
};

const prefersReducedStudentMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const buildStudentTestDraftKey = ({ studentId, taskNumber, levelId }) => {
  const normalizedStudentId = String(studentId || 'anonymous').trim() || 'anonymous';
  const normalizedTaskNumber = String(taskNumber || '').trim() || 'task';
  const normalizedLevelId = String(levelId || '').trim() || 'level';
  return `${STUDENT_TEST_ANSWER_DRAFT_PREFIX}:${normalizedStudentId}:${normalizedTaskNumber}:${normalizedLevelId}`;
};

const canUseStudentTestDraftStorage = () => (
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
);

const readStudentCodeWorkspacePrefs = () => {
  if (!canUseStudentTestDraftStorage()) {
    return {
      fontSize: STUDENT_CODE_FONT_SIZE_DEFAULT,
      layout: STUDENT_CODE_LAYOUT_SIDE,
      focusMusicEnabled: false,
      focusMusicVolume: STUDENT_CODE_FOCUS_MUSIC_VOLUME_DEFAULT,
    };
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STUDENT_CODE_WORKSPACE_PREFS_KEY) || 'null');
    const storedLayout = parsed?.layout === STUDENT_CODE_LAYOUT_STACKED
      ? STUDENT_CODE_LAYOUT_STACKED
      : STUDENT_CODE_LAYOUT_SIDE;
    return {
      fontSize: clampStudentCodeFontSize(parsed?.fontSize),
      layout: Number(parsed?.layoutPrefVersion) >= STUDENT_CODE_LAYOUT_PREF_VERSION
        ? storedLayout
        : STUDENT_CODE_LAYOUT_SIDE,
      focusMusicEnabled: parsed?.focusMusicEnabled === true,
      focusMusicVolume: clampStudentCodeFocusMusicVolume(parsed?.focusMusicVolume),
    };
  } catch {
    return {
      fontSize: STUDENT_CODE_FONT_SIZE_DEFAULT,
      layout: STUDENT_CODE_LAYOUT_SIDE,
      focusMusicEnabled: false,
      focusMusicVolume: STUDENT_CODE_FOCUS_MUSIC_VOLUME_DEFAULT,
    };
  }
};

const hasStudentTestDraftValue = (value) => {
  if (Array.isArray(value)) return value.some((entry) => String(entry ?? '').trim());
  return Boolean(String(value ?? '').trim());
};

const getStudentQuestionStateKey = (question, questionNumber, fallbackIndex) => {
  if (question?.id !== null && typeof question?.id !== 'undefined') {
    return String(question.id);
  }
  const normalizedNumber = Number(questionNumber);
  if (Number.isFinite(normalizedNumber) && normalizedNumber > 0) {
    return `number:${Math.trunc(normalizedNumber)}`;
  }
  return `index:${fallbackIndex}`;
};

const remapStudentQuestionIndexedState = ({
  source,
  fromQuestions = [],
  fromQuestionNumbers = [],
  toQuestions = [],
  toQuestionNumbers = [],
}) => {
  if (!source || typeof source !== 'object') return {};
  const byQuestionKey = new Map();
  fromQuestions.forEach((question, index) => {
    if (!Object.prototype.hasOwnProperty.call(source, index)) return;
    const key = getStudentQuestionStateKey(question, fromQuestionNumbers[index], index);
    byQuestionKey.set(key, source[index]);
  });
  const next = {};
  toQuestions.forEach((question, index) => {
    const key = getStudentQuestionStateKey(question, toQuestionNumbers[index], index);
    if (!byQuestionKey.has(key)) return;
    next[index] = byQuestionKey.get(key);
  });
  return next;
};

const readStudentTestAnswerDraft = ({ studentId, taskNumber, levelId, questions = [] }) => {
  if (!canUseStudentTestDraftStorage()) return { answersByIndex: {}, currentIndex: null };
  const key = buildStudentTestDraftKey({ studentId, taskNumber, levelId });
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    const answersByQuestionId = parsed?.answersByQuestionId && typeof parsed.answersByQuestionId === 'object'
      ? parsed.answersByQuestionId
      : {};
    const answersByIndex = {};
    questions.forEach((question, index) => {
      const questionId = String(question?.id ?? index);
      if (!Object.prototype.hasOwnProperty.call(answersByQuestionId, questionId)) return;
      const value = answersByQuestionId[questionId];
      if (hasStudentTestDraftValue(value)) answersByIndex[index] = value;
    });
    const currentQuestionId = String(parsed?.currentQuestionId || '').trim();
    const currentIndex = currentQuestionId
      ? questions.findIndex((question, index) => String(question?.id ?? index) === currentQuestionId)
      : null;
    return {
      answersByIndex,
      currentIndex: Number.isFinite(currentIndex) && currentIndex >= 0 ? currentIndex : null,
    };
  } catch {
    return { answersByIndex: {}, currentIndex: null };
  }
};

const writeStudentTestAnswerDraft = ({ studentId, taskNumber, levelId, questions = [], currentIndex = 0, answers = {}, solvedIds = new Set() }) => {
  if (!canUseStudentTestDraftStorage() || !levelId || !taskNumber) return;
  const key = buildStudentTestDraftKey({ studentId, taskNumber, levelId });
  const solvedSet = solvedIds instanceof Set ? solvedIds : new Set();
  const answersByQuestionId = {};
  Object.entries(answers || {}).forEach(([indexKey, value]) => {
    const index = Number(indexKey);
    if (!Number.isInteger(index) || index < 0 || index >= questions.length) return;
    if (!hasStudentTestDraftValue(value)) return;
    const questionId = String(questions[index]?.id ?? index);
    if (solvedSet.has(questionId)) return;
    answersByQuestionId[questionId] = Array.isArray(value)
      ? value.map((entry) => String(entry ?? ''))
      : String(value ?? '');
  });

  if (Object.keys(answersByQuestionId).length === 0) {
    window.localStorage.removeItem(key);
    return;
  }

  const safeCurrentIndex = Math.max(0, Math.min(questions.length - 1, Number(currentIndex) || 0));
  window.localStorage.setItem(key, JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    currentQuestionId: String(questions[safeCurrentIndex]?.id ?? safeCurrentIndex),
    answersByQuestionId,
  }));
};

const normalizeQuestionRuntimePath = (value) => {
  const text = String(value || '').replace(/\0/g, '').trim();
  if (!text) return '';
  const parts = text
    .split(/[\\/]+/)
    .map((part) => String(part || '').trim())
    .filter((part) => part && part !== '.' && part !== '..');
  return parts.join('/');
};

const getQuestionRuntimeFileName = (file) => {
  const normalizedPath = normalizeQuestionRuntimePath(file?.name || file?.storageName || file?.id);
  if (!normalizedPath) return '';
  const parts = normalizedPath.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
};

const getQuestionRuntimePathForFile = (file) => {
  const safeName = getQuestionRuntimeFileName(file);
  if (!safeName) return '';
  const folderPath = normalizeQuestionRuntimePath(file?.folderPath || file?.folderName);
  return folderPath ? `${folderPath}/${safeName}` : safeName;
};

const getQuestionRuntimePathVariantsForFile = (file) => {
  const primaryPath = getQuestionRuntimePathForFile(file);
  if (!primaryPath) return [];
  const parts = primaryPath.split('/').filter(Boolean);
  const variants = [];
  const seen = new Set();
  for (let start = 0; start < parts.length; start += 1) {
    const candidate = normalizeQuestionRuntimePath(parts.slice(start).join('/'));
    const key = candidate.toLowerCase();
    if (!candidate || seen.has(key)) continue;
    seen.add(key);
    variants.push(candidate);
  }
  return variants;
};

const getQuestionFileUrl = (file) => String(file?.url || '').trim();

const toQuestionRuntimeBytes = (bytesSource) => {
  if (bytesSource instanceof Uint8Array) return bytesSource;
  if (ArrayBuffer.isView(bytesSource)) {
    return new Uint8Array(bytesSource.buffer, bytesSource.byteOffset, bytesSource.byteLength);
  }
  if (bytesSource instanceof ArrayBuffer) return new Uint8Array(bytesSource);
  if (Array.isArray(bytesSource)) {
    return Uint8Array.from(bytesSource.map((item) => {
      const num = Number(item);
      if (!Number.isFinite(num)) return 0;
      return num & 255;
    }));
  }
  if (typeof bytesSource === 'string') {
    try {
      return new TextEncoder().encode(bytesSource);
    } catch {
      return new Uint8Array(0);
    }
  }
  return new Uint8Array(0);
};

const formatQuestionTerminalText = ({
  loading = false,
  output = '',
  error = '',
  attachedFiles = [],
  status = '',
} = {}) => {
  const lines = ['$ python solution.py'];
  const fileList = Array.isArray(attachedFiles)
    ? attachedFiles.map((fileName) => String(fileName || '').trim()).filter(Boolean)
    : [];
  if (fileList.length > 0) lines.push(`# files: ${fileList.join(', ')}`);
  if (status) lines.push(String(status));
  const safeOutput = String(output || '').replace(/\s+$/g, '');
  const safeError = String(error || '').replace(/\s+$/g, '');
  if (safeOutput) lines.push(safeOutput);
  if (safeError) lines.push(safeError);
  if (loading && !safeOutput && !safeError) lines.push('Running...');
  if (!loading && !safeOutput && !safeError && !status) {
    lines.push('Готово. Вывод появится здесь после запуска.');
  }
  return lines.join('\n');
};

const extractQuestionRuntimeFileError = async (response, fallback) => {
  try {
    const text = await response.text();
    if (text && text.length <= 220) return text;
  } catch {
    // Ignore unreadable response bodies and use the fallback.
  }
  return fallback;
};

const StudentTestModal = ({
  theme = '',
  task,
  onClose,
  onComplete,
  progress,
  studentId,
  testDb,
  initialLevel,
  targetQuestions,
  onLevelSelect,
  initialQuestionIndex,
  onQuestionChange,
  onStreakSaved,
  onXpGain,
  onPracticeAttempt,
  onThemeToggle,
  forceInitialLevelLaunch = false,
  reviewMode = false,
  quickHomeworkPlanProgress = null,
  LEVELS,
  LEVEL_WEIGHTS,
  GAME_THEORY_TASK,
  PYODIDE_RUN_TIMEOUT_MS,
  ALLOW_MAIN_THREAD_PYTHON_FALLBACK,
  getTaskLevelXpReward,
  getTaskDisplayNumber,
  getAnswerCountForTask,
  getExpectedAnswers,
  allowsPartialAnswers,
  ensurePyodideReady,
  mergeRuntimeErrorText,
  createPyodideWorker,
  getLocalDayKey,
  normalizeXpTotal,
  withStudentId,
}) => {
  const monacoTheme = resolveMonacoColorTheme(theme);
  const { workbookHelperState, launchWorkbookHelper } = useWorkbookHelper();
  const isQuestionCodeDarkTheme = String(theme || '').trim().toLowerCase() === 'dark';
  const [stage, setStage] = useState('select_level'); // select_level | testing
  const [level, setLevel] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [questionNumbers, setQuestionNumbers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); // { [idx]: string | { a: string, b: string } }
  const [results, setResults] = useState({}); // { [idx]: boolean }
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedAnswerById, setSolvedAnswerById] = useState({});
  const [answerHistoryById, setAnswerHistoryById] = useState({});
  const [answerHistoryLoading, setAnswerHistoryLoading] = useState(false);
  const [questionDifficultyById, setQuestionDifficultyById] = useState({});
  const [studentTestClosing, setStudentTestClosing] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);
  const [studentHelpOpen, setStudentHelpOpen] = useState(false);
  const [studentHelpClosing, setStudentHelpClosing] = useState(false);
  const [studentHelpQuestion, setStudentHelpQuestion] = useState('');
  const [studentHelpChannel, setStudentHelpChannel] = useState('platform');
  const [studentHelpChannels, setStudentHelpChannels] = useState(null);
  const [studentHelpChannelsLoading, setStudentHelpChannelsLoading] = useState(false);
  const [studentHelpSending, setStudentHelpSending] = useState(false);
  const [studentHelpPreparingCode, setStudentHelpPreparingCode] = useState(false);
  const [studentHelpError, setStudentHelpError] = useState('');
  const [studentHelpResult, setStudentHelpResult] = useState(null);
  const [studentHelpSolutionImage, setStudentHelpSolutionImage] = useState(null);
  const [questionImageStateByKey, setQuestionImageStateByKey] = useState({});
  const lastQuestionImageAspectRef = useRef(3.8);
  const questionImageFallbackAspectByKeyRef = useRef(new Map());
  const [questionCodeById, setQuestionCodeById] = useState({});
  const questionCodeByIdRef = useRef({});
  const [questionCodeOpen, setQuestionCodeOpen] = useState(false);
  const [questionCodePreviewOpen, setQuestionCodePreviewOpen] = useState(false);
  const questionCodePanelRef = useRef(null);
  const questionPanelRef = useRef(null);
  const questionPictureInPictureWindowRef = useRef(null);
  const questionPictureInPictureRootRef = useRef(null);
  const [questionPictureInPictureOpen, setQuestionPictureInPictureOpen] = useState(false);
  const [questionCodeCopyState, setQuestionCodeCopyState] = useState('idle');
  const [questionShareCopyState, setQuestionShareCopyState] = useState('idle');
  const [questionShareMenuAnchor, setQuestionShareMenuAnchor] = useState('');
  const [questionCodeClosing, setQuestionCodeClosing] = useState(false);
  const [questionCodeWorkspacePrefs, setQuestionCodeWorkspacePrefs] = useState(readStudentCodeWorkspacePrefs);
  const [questionCodeLayoutAnimating, setQuestionCodeLayoutAnimating] = useState(false);
  const [questionCodeLoadingById, setQuestionCodeLoadingById] = useState({});
  const [questionCodeSavingById, setQuestionCodeSavingById] = useState({});
  const [questionCodeAutoSavePendingById, setQuestionCodeAutoSavePendingById] = useState({});
  const [questionCodeErrorById, setQuestionCodeErrorById] = useState({});
  const [questionWorkbookSolutions, setQuestionWorkbookSolutions] = useState({});
  const [questionRunStateById, setQuestionRunStateById] = useState({});
  const [questionTerminalQuestionId, setQuestionTerminalQuestionId] = useState('');
  const [questionTurtleWindowQuestionId, setQuestionTurtleWindowQuestionId] = useState('');
  const [questionTurtleWindowFullscreen, setQuestionTurtleWindowFullscreen] = useState(false);
  const [studentTestTourRestartToken, setStudentTestTourRestartToken] = useState(0);
  const autoStartRef = useRef(false);
  const [autoStartFailed, setAutoStartFailed] = useState(false);
  const questionRunnerWorkerRef = useRef(null);
  const questionRunnerPendingRef = useRef(new Map());
  const questionCodeSavingRef = useRef(new Set());
  const questionCodePendingSaveRef = useRef(new Map());
  const questionCodeAutoSaveTimersRef = useRef(new Map());
  const studentHelpRequestIdRef = useRef('');
  const studentHelpTriggerRef = useRef(null);
  const questionShareToolbarRef = useRef(null);
  const questionShareFocusRef = useRef(null);
  const studentHelpSuccessActionRef = useRef(null);
  const studentHelpCloseTimerRef = useRef(null);
  const studentHelpSolutionInputRef = useRef(null);
  const studentTestCloseTimerRef = useRef(null);
  const questionCodeCloseTimerRef = useRef(null);
  const questionCodeLayoutAnimationTimerRef = useRef(null);
  const questionCodeLayoutAnimationFrameRef = useRef(null);
  const questionCodeLayoutAnimationsRef = useRef([]);
  const questionCodeFocusFullscreenTimerRef = useRef(null);
  const questionCodeCopyResetTimerRef = useRef(null);
  const questionShareCopyResetTimerRef = useRef(null);
  const questionCodeWorkspaceRef = useRef(null);
  const questionCodeHomeworkStripRef = useRef(null);
  const questionCodeLevelStripRef = useRef(null);
  const questionCodeAudioRef = useRef(null);
  const questionCodeTaskPanelRef = useRef(null);
  const questionCodeIdePanelRef = useRef(null);
  const questionCodeRunButtonRef = useRef(null);
  const questionTurtleWindowCloseRef = useRef(null);
  const activeQuestionIdRef = useRef('');
  const questionMainThreadRuntimeFilesRef = useRef([]);
  const [questionCodeFocusFullscreen, setQuestionCodeFocusFullscreen] = useState(false);
  const [questionCodeFullscreenPortalTarget, setQuestionCodeFullscreenPortalTarget] = useState(null);
  const [questionCodeMusicError, setQuestionCodeMusicError] = useState('');
  const autoStartLevel = ['basic', 'advanced', 'expert'].includes(initialLevel) ? initialLevel : null;

  const currentMastery = progress[task.id] || 0;
  const selectedLevelXpReward = getTaskLevelXpReward(task?.number, level);
  const selectedLevelXpRewardLabel = selectedLevelXpReward > 0
    ? `+${selectedLevelXpReward.toLocaleString('ru-RU')} XP`
    : '';
  const activeQuestion = questions[currentIndex];
  const activeQuestionId = activeQuestion ? String(activeQuestion?.id ?? currentIndex) : '';
  const activeQuestionNumber = questionNumbers[currentIndex] ?? (currentIndex + 1);
  const activeQuestionHistory = Array.isArray(answerHistoryById?.[activeQuestionId])
    ? answerHistoryById[activeQuestionId]
    : [];
  const activeQuestionAlreadySolved = solvedIds.has(activeQuestionId)
    || activeQuestionHistory.some((entry) => entry?.correct === true);
  const activeQuestionTimerKey = stage === 'testing' && level && activeQuestionId
    ? `${task?.number || task?.id}:${level}:${activeQuestionId}`
    : '';
  const getActiveQuestionSolveDurationMs = useQuestionSolveTimer({
    questionKey: activeQuestionTimerKey,
    studentId,
    taskNumber: task?.number || task?.id,
    levelId: level,
    questionId: activeQuestionId,
    initialDurationMs: getLatestUnsolvedDurationMs(activeQuestionHistory),
    baselineReady: !studentId || !answerHistoryLoading,
    enabled: Boolean(activeQuestionTimerKey) && !activeQuestionAlreadySolved,
  });

  const syncQuestionPictureInPicture = useCallback(() => {
    const target = questionPictureInPictureRootRef.current;
    const source = questionPanelRef.current;
    if (!target || !source) return;
    const heading = target.ownerDocument.querySelector('[data-question-picture-in-picture-title]');
    if (heading) {
      heading.textContent = `Задание ${getTaskDisplayNumber(task)} · вопрос №${activeQuestionNumber}`;
    }
    const clone = source.cloneNode(true);
    clone.removeAttribute('data-student-test-tour');
    clone.querySelectorAll('[data-student-test-tour]').forEach((node) => {
      node.removeAttribute('data-student-test-tour');
    });
    clone.querySelector('.student-test-question-panel__toolbar-actions')?.remove();
    clone.querySelectorAll('button').forEach((button) => button.remove());
    target.replaceChildren(clone);
  }, [activeQuestionNumber, getTaskDisplayNumber, task]);

  const closeQuestionPictureInPicture = useCallback(() => {
    const pictureWindow = questionPictureInPictureWindowRef.current;
    questionPictureInPictureWindowRef.current = null;
    questionPictureInPictureRootRef.current = null;
    clearQuestionPictureInPictureWindow(pictureWindow);
    setQuestionPictureInPictureOpen(false);
    if (pictureWindow && !pictureWindow.closed) pictureWindow.close();
  }, []);

  const openQuestionPictureInPicture = useCallback(async () => {
    const pictureInPictureApi = typeof window !== 'undefined'
      ? window.documentPictureInPicture
      : null;
    if (!pictureInPictureApi?.requestWindow || !questionPanelRef.current) return;
    if (questionPictureInPictureWindowRef.current) {
      questionPictureInPictureWindowRef.current.focus();
      return;
    }
    try {
      const pictureWindow = await pictureInPictureApi.requestWindow({ width: 560, height: 720 });
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        pictureWindow.document.head.appendChild(node.cloneNode(true));
      });
      pictureWindow.document.title = `Задание ${getTaskDisplayNumber(task)}`;
      const frameStyles = pictureWindow.document.createElement('style');
      frameStyles.textContent = `
        html, body { margin: 0; min-height: 100%; background: #f5f3ff; color: #111827; }
        body { box-sizing: border-box; padding: 14px; overflow: auto; font-family: Inter, system-ui, sans-serif; }
        .question-picture-in-picture__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 12px; padding: 2px 2px 10px; border-bottom: 1px solid rgba(124, 58, 237, .16); }
        .question-picture-in-picture__heading strong { font-size: 14px; }
        .question-picture-in-picture__heading span { color: #7c3aed; font-size: 12px; font-weight: 700; }
        .student-test-question-panel { margin: 0 !important; box-shadow: 0 12px 34px rgba(76, 29, 149, .12); }
        .student-test-question-panel__toolbar { justify-content: flex-start; }
        .student-test-screenshot { max-height: none !important; }
      `;
      pictureWindow.document.head.appendChild(frameStyles);
      const heading = pictureWindow.document.createElement('header');
      heading.className = 'question-picture-in-picture__heading';
      const title = pictureWindow.document.createElement('strong');
      title.dataset.questionPictureInPictureTitle = '';
      title.textContent = `Задание ${getTaskDisplayNumber(task)} · вопрос №${activeQuestionNumber}`;
      const status = pictureWindow.document.createElement('span');
      status.textContent = 'Поверх окон';
      heading.append(title, status);
      const root = pictureWindow.document.createElement('main');
      pictureWindow.document.body.append(heading, root);
      questionPictureInPictureWindowRef.current = pictureWindow;
      questionPictureInPictureRootRef.current = root;
      setQuestionPictureInPictureWindow(pictureWindow);
      setQuestionPictureInPictureOpen(true);
      ['keydown', 'pointerdown', 'touchstart', 'input', 'change', 'scroll'].forEach((eventName) => {
        pictureWindow.document.addEventListener(
          eventName,
          reportQuestionPictureInPictureActivity,
          { capture: true, passive: true }
        );
      });
      pictureWindow.addEventListener('pagehide', () => {
        questionPictureInPictureWindowRef.current = null;
        questionPictureInPictureRootRef.current = null;
        clearQuestionPictureInPictureWindow(pictureWindow);
        setQuestionPictureInPictureOpen(false);
      }, { once: true });
      syncQuestionPictureInPicture();
    } catch {
      closeQuestionPictureInPicture();
    }
  }, [activeQuestionNumber, closeQuestionPictureInPicture, getTaskDisplayNumber, syncQuestionPictureInPicture, task]);

  useEffect(() => {
    if (!questionPictureInPictureOpen) return undefined;
    const frameId = window.requestAnimationFrame(syncQuestionPictureInPicture);
    return () => window.cancelAnimationFrame(frameId);
  }, [activeQuestionId, questionImageStateByKey, questionPictureInPictureOpen, syncQuestionPictureInPicture]);

  useEffect(() => () => closeQuestionPictureInPicture(), [closeQuestionPictureInPicture]);

  useEffect(() => {
    if (stage !== 'testing' || !task?.number || !level) {
      setQuestionDifficultyById({});
      return undefined;
    }
    let cancelled = false;
    api.getQuestionDifficulties(task.number, level)
      .then((payload) => {
        if (cancelled) return;
        setQuestionDifficultyById(
          payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
        );
      })
      .catch(() => {
        if (!cancelled) setQuestionDifficultyById({});
      });
    return () => { cancelled = true; };
  }, [stage, task?.number, level]);

  useEffect(() => {
    if (!questionCodeOpen || !activeQuestionNumber || typeof window === 'undefined') return undefined;
    const frameId = window.requestAnimationFrame(() => {
      const behavior = prefersReducedStudentMotion() ? 'auto' : 'smooth';
      [questionCodeHomeworkStripRef.current, questionCodeLevelStripRef.current].forEach((strip) => {
        strip?.querySelector('[aria-current="step"]')?.scrollIntoView({
          behavior,
          block: 'nearest',
          inline: 'center',
        });
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeQuestionNumber, questionCodeOpen]);

  const closeQuestionTurtleWindow = useCallback((restoreFocus = true) => {
    setQuestionTurtleWindowFullscreen(false);
    setQuestionTurtleWindowQuestionId('');
    if (
      restoreFocus
      && typeof window !== 'undefined'
      && typeof window.requestAnimationFrame === 'function'
    ) {
      window.requestAnimationFrame(() => questionCodeRunButtonRef.current?.focus());
    }
  }, []);
  const questionCodeFontSize = clampStudentCodeFontSize(questionCodeWorkspacePrefs?.fontSize);
  const questionCodeLayout = questionCodeWorkspacePrefs?.layout === STUDENT_CODE_LAYOUT_SIDE
    ? STUDENT_CODE_LAYOUT_SIDE
    : STUDENT_CODE_LAYOUT_STACKED;
  const isQuestionCodeSideLayout = questionCodeLayout === STUDENT_CODE_LAYOUT_SIDE;
  const questionCodeFocusMusicEnabled = questionCodeWorkspacePrefs?.focusMusicEnabled === true;
  const questionCodeFocusMusicVolume = clampStudentCodeFocusMusicVolume(questionCodeWorkspacePrefs?.focusMusicVolume);
  const questionCodeEditorOptions = useMemo(() => ({
    minimap: { enabled: false },
    fontSize: questionCodeFontSize,
    fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
    fontLigatures: true,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    automaticLayout: true,
    padding: { top: 16, bottom: 16 },
    lineNumbersMinChars: 3,
  }), [questionCodeFontSize]);
  const questionCodePreviewEditorOptions = useMemo(() => ({
    ...questionCodeEditorOptions,
    folding: false,
    glyphMargin: false,
    lineDecorationsWidth: 8,
    overviewRulerLanes: 0,
    renderLineHighlight: 'line',
    padding: { top: 12, bottom: 12 },
  }), [questionCodeEditorOptions]);

  const getQuestionCodeEntry = (questionId, source = null) => {
    const key = String(questionId ?? '').trim();
    const cacheSource = source || questionCodeByIdRef.current || questionCodeById;
    const cached = cacheSource?.[key];
    if (!cached || typeof cached !== 'object') {
      return { code: '', input: '', updatedAt: '', loaded: false };
    }
    return {
      code: typeof cached.code === 'string' ? cached.code : '',
      input: typeof cached.input === 'string' ? cached.input : '',
      updatedAt: typeof cached.updatedAt === 'string' ? cached.updatedAt : '',
      loaded: Boolean(cached.loaded),
    };
  };

  const setQuestionCodeEntry = (questionId, patch) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeById((prev) => {
      const current = prev?.[key] && typeof prev[key] === 'object'
        ? prev[key]
        : { code: '', input: '', updatedAt: '', loaded: false };
      const nextEntry = {
        ...current,
        ...(patch || {}),
        loaded: true,
      };
      if (
        current.code === nextEntry.code
        && current.input === nextEntry.input
        && current.updatedAt === nextEntry.updatedAt
        && current.loaded === nextEntry.loaded
      ) {
        return prev;
      }
      const next = {
        ...(prev || {}),
        [key]: nextEntry,
      };
      questionCodeByIdRef.current = next;
      return next;
    });
  };

  const clearQuestionCodeError = (questionId) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeErrorById((prev) => {
      if (!prev?.[key]) return prev;
      const next = { ...(prev || {}) };
      delete next[key];
      return next;
    });
  };

  const setQuestionCodeError = (questionId, message) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeErrorById((prev) => ({ ...(prev || {}), [key]: message || '' }));
  };

  const resolveQuestionRunnerPending = (message) => {
    questionRunnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, turtleScene: null, done: true });
      }
      entry.resolve({ output, error, turtleScene: null });
    });
    questionRunnerPendingRef.current.clear();
  };

  const disposeQuestionRunnerWorker = (message = '') => {
    if (questionRunnerWorkerRef.current) {
      questionRunnerWorkerRef.current.terminate();
      questionRunnerWorkerRef.current = null;
    }
    if (message) resolveQuestionRunnerPending(message);
  };

  const ensureQuestionRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (questionRunnerWorkerRef.current) return questionRunnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = questionRunnerPendingRef.current.get(data.id);
        if (!pending) return;
        const messageType = typeof data.type === 'string' ? data.type : 'result';
        if (messageType === 'stdout' || messageType === 'stderr') {
          const chunk = typeof data.chunk === 'string' ? data.chunk : String(data.chunk ?? '');
          if (!chunk) return;
          if (messageType === 'stdout') {
            pending.output = `${pending.output || ''}${chunk}`;
          } else {
            pending.error = `${pending.error || ''}${chunk}`;
          }
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({
              output: pending.output || '',
              error: pending.error || '',
              done: false,
            });
          }
          return;
        }
        clearTimeout(pending.timer);
        questionRunnerPendingRef.current.delete(data.id);
        const output = typeof data.output === 'string'
          ? data.output
          : (data.output ? String(data.output) : (pending.output || ''));
        const error = typeof data.error === 'string'
          ? data.error
          : (data.error ? String(data.error) : (pending.error || ''));
        const turtleScene = normalizeTurtleScene(data.turtleScene);
        if (typeof pending.onProgress === 'function') {
          pending.onProgress({ output, error, turtleScene, done: true });
        }
        pending.resolve({ output, error, turtleScene });
      };
      worker.onerror = () => disposeQuestionRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposeQuestionRunnerWorker('Ошибка выполнения Python.');
      questionRunnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  const clearQuestionMainThreadRuntimeFiles = (pyodide) => {
    if (!pyodide?.FS) return;
    const mountedFiles = Array.isArray(questionMainThreadRuntimeFilesRef.current)
      ? questionMainThreadRuntimeFilesRef.current
      : [];
    mountedFiles.forEach((filePath) => {
      try {
        pyodide.FS.unlink(filePath);
      } catch {
        // Ignore files that are already gone.
      }
    });
    questionMainThreadRuntimeFilesRef.current = [];
  };

  const ensureQuestionRuntimeDir = (pyodide, dirPath) => {
    if (!pyodide?.FS || !dirPath) return;
    const parts = String(dirPath).split('/').filter(Boolean);
    let current = '';
    parts.forEach((part) => {
      current = current ? `${current}/${part}` : part;
      try {
        pyodide.FS.mkdir(current);
      } catch {
        // Existing folders are fine.
      }
    });
  };

  const mountQuestionRuntimeFilesInPyodide = (pyodide, runtimeFiles = []) => {
    clearQuestionMainThreadRuntimeFiles(pyodide);
    if (!pyodide?.FS || !Array.isArray(runtimeFiles) || runtimeFiles.length === 0) return;
    const seen = new Set();
    runtimeFiles.forEach((file) => {
      const safePath = normalizeQuestionRuntimePath(file?.name);
      if (!safePath) return;
      const dedupeKey = safePath.toLowerCase();
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      const dirPath = safePath.includes('/') ? safePath.slice(0, safePath.lastIndexOf('/')) : '';
      if (dirPath) ensureQuestionRuntimeDir(pyodide, dirPath);
      try {
        pyodide.FS.writeFile(safePath, toQuestionRuntimeBytes(file?.bytes));
        questionMainThreadRuntimeFilesRef.current.push(safePath);
      } catch {
        // The terminal will surface Python-side file errors if a mount fails.
      }
    });
  };

  const runQuestionCodeMainThread = async (source, inputValue, runtimeFiles = []) => {
    const pyodide = await ensurePyodideReady();
    mountQuestionRuntimeFilesInPyodide(pyodide, runtimeFiles);
    const wrapped = [
      HEADLESS_TURTLE_SOURCE,
      'import sys, io, traceback',
      `_input = ${JSON.stringify(String(inputValue ?? ''))}`,
      '_stdout = io.StringIO()',
      '_stderr = io.StringIO()',
      'sys.stdin = io.StringIO(_input)',
      'sys.stdout = _stdout',
      'sys.stderr = _stderr',
      '_globals = {}',
      'try:',
      `    exec(${JSON.stringify(String(source ?? ''))}, _globals, _globals)`,
      'except Exception:',
      '    traceback.print_exc()',
      'try:',
      '    __turtle_scene_json = _turtle_export_scene_json()',
      'except Exception:',
      '    __turtle_scene_json = ""',
      '__output = _stdout.getvalue()',
      '__error = _stderr.getvalue()',
    ].join('\n');
    await pyodide.runPythonAsync(wrapped);
    const output = pyodide.globals.get('__output') || '';
    const error = pyodide.globals.get('__error') || '';
    const sceneValue = pyodide.globals.get('__turtle_scene_json') || '';
    const sceneText = sceneValue && typeof sceneValue.toJs === 'function'
      ? sceneValue.toJs()
      : sceneValue;
    sceneValue?.destroy?.();
    const turtleScene = parseTurtleSceneJson(sceneText);
    pyodide.globals.delete('__output');
    pyodide.globals.delete('__error');
    pyodide.globals.delete('__turtle_scene_json');
    return { output: String(output), error: String(error), turtleScene };
  };

  const runQuestionCode = async (source, inputValue, onProgress = null, runtimeFiles = []) => {
    const worker = ensureQuestionRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = questionRunnerPendingRef.current.get(id);
          if (!pending) return;
          questionRunnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, turtleScene: null, done: true });
          }
          resolve({ output, error, turtleScene: null });
          disposeQuestionRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        questionRunnerPendingRef.current.set(id, {
          resolve,
          timer,
          output: '',
          error: '',
          onProgress: typeof onProgress === 'function' ? onProgress : null,
        });
        worker.postMessage({ id, source, input: inputValue, files: runtimeFiles, enableTurtle: true });
      });
    }
    if (!ALLOW_MAIN_THREAD_PYTHON_FALLBACK) {
      return {
        output: '',
        error: 'Не удалось запустить Python в изолированном режиме. Перезагрузите страницу.',
        turtleScene: null,
      };
    }
    return runQuestionCodeMainThread(source, inputValue, runtimeFiles);
  };

  const loadQuestionCode = async (questionId, force = false) => {
    if (!studentId || !task?.number || !level) return;
    const key = String(questionId ?? '').trim();
    if (!key) return;
    if (questionCodeLoadingById?.[key]) return;
    const cached = getQuestionCodeEntry(key);
    if (cached.loaded && !force) return;
    setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.getQuestionCode(studentId, task.number, level, key);
      setQuestionCodeEntry(key, {
        code: typeof payload?.code === 'string' ? payload.code : '',
        input: '',
        updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
      });
      clearQuestionCodeError(key);
    } catch (err) {
      setQuestionCodeError(key, err?.message || err);
    } finally {
      setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: false }));
    }
  };

  const saveQuestionCode = async (questionId, snapshot = null) => {
    if (!studentId || !task?.number || !level) return;
    const key = String(questionId ?? '').trim();
    if (!key) return;
    const entry = snapshot && typeof snapshot === 'object'
      ? {
          code: typeof snapshot.code === 'string' ? snapshot.code : '',
          input: '',
        }
      : getQuestionCodeEntry(key, questionCodeByIdRef.current);
    if (questionCodeSavingRef.current.has(key)) {
      questionCodePendingSaveRef.current.set(key, entry);
      setQuestionCodeAutoSavePendingById((prev) => ({ ...(prev || {}), [key]: true }));
      return;
    }
    questionCodeSavingRef.current.add(key);
    setQuestionCodeSavingById((prev) => ({ ...(prev || {}), [key]: true }));
    setQuestionCodeAutoSavePendingById((prev) => ({ ...(prev || {}), [key]: false }));
    try {
      const payload = await api.saveQuestionCode(studentId, task.number, level, key, {
        code: entry.code,
        input: '',
      });
      const currentEntry = getQuestionCodeEntry(key, questionCodeByIdRef.current);
      const changedDuringSave = currentEntry.code !== entry.code;
      if (!changedDuringSave) {
        setQuestionCodeEntry(key, {
          updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : currentEntry.updatedAt,
        });
      }
      clearQuestionCodeError(key);
    } catch (err) {
      setQuestionCodeError(key, err?.message || err);
    } finally {
      questionCodeSavingRef.current.delete(key);
      setQuestionCodeSavingById((prev) => ({ ...(prev || {}), [key]: false }));
      const pendingSnapshot = questionCodePendingSaveRef.current.get(key);
      if (pendingSnapshot) {
        questionCodePendingSaveRef.current.delete(key);
        saveQuestionCode(key, pendingSnapshot).catch(() => {});
      }
    }
  };

  const scheduleQuestionCodeAutoSave = (questionId, snapshot) => {
    const key = String(questionId ?? '').trim();
    if (!key || !studentId || !task?.number || !level) return;
    const currentTimer = questionCodeAutoSaveTimersRef.current.get(key);
    if (currentTimer) clearTimeout(currentTimer);
    setQuestionCodeAutoSavePendingById((prev) => ({ ...(prev || {}), [key]: true }));
    const nextTimer = setTimeout(() => {
      questionCodeAutoSaveTimersRef.current.delete(key);
      saveQuestionCode(key, snapshot).catch(() => {});
    }, 650);
    questionCodeAutoSaveTimersRef.current.set(key, nextTimer);
  };

  const clearQuestionCodeAutoSaveTimers = () => {
    questionCodeAutoSaveTimersRef.current.forEach((timer) => clearTimeout(timer));
    questionCodeAutoSaveTimersRef.current.clear();
    questionCodePendingSaveRef.current.clear();
    questionCodeSavingRef.current.clear();
  };

  const clearStudentTestCloseTimer = () => {
    if (!studentTestCloseTimerRef.current) return;
    clearTimeout(studentTestCloseTimerRef.current);
    studentTestCloseTimerRef.current = null;
  };

  const clearStudentHelpCloseTimer = useCallback(() => {
    if (!studentHelpCloseTimerRef.current) return;
    clearTimeout(studentHelpCloseTimerRef.current);
    studentHelpCloseTimerRef.current = null;
  }, []);

  const requestCloseStudentHelp = useCallback(() => {
    if (studentHelpSending || studentHelpClosing) return;
    clearStudentHelpCloseTimer();
    const trigger = studentHelpTriggerRef.current;

    const finishClose = () => {
      studentHelpCloseTimerRef.current = null;
      setStudentHelpClosing(false);
      setStudentHelpOpen(false);
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          if (trigger?.isConnected) trigger.focus();
        });
      }
    };

    if (prefersReducedStudentMotion()) {
      finishClose();
      return;
    }

    setStudentHelpClosing(true);
    studentHelpCloseTimerRef.current = setTimeout(finishClose, STUDENT_HELP_CLOSE_ANIMATION_MS);
  }, [clearStudentHelpCloseTimer, studentHelpClosing, studentHelpSending]);

  const requestCloseStudentTest = () => {
    if (studentTestClosing) return;
    clearStudentTestCloseTimer();
    clearStudentHelpCloseTimer();
    setStudentHelpClosing(false);
    setStudentHelpOpen(false);
    if (prefersReducedStudentMotion()) {
      setStudentTestClosing(false);
      onClose?.();
      return;
    }
    setStudentTestClosing(true);
    studentTestCloseTimerRef.current = setTimeout(() => {
      studentTestCloseTimerRef.current = null;
      onClose?.();
    }, STUDENT_TEST_CLOSE_ANIMATION_MS);
  };

  const clearQuestionCodeCloseTimer = () => {
    if (!questionCodeCloseTimerRef.current) return;
    clearTimeout(questionCodeCloseTimerRef.current);
    questionCodeCloseTimerRef.current = null;
  };

  const getQuestionCodeLayoutPanels = () => (
    [questionCodeTaskPanelRef.current, questionCodeIdePanelRef.current].filter(Boolean)
  );

  const clearQuestionCodeLayoutFlip = ({ cancelAnimations = true } = {}) => {
    if (cancelAnimations) {
      questionCodeLayoutAnimationsRef.current.forEach((animation) => {
        animation?.cancel?.();
      });
    }
    questionCodeLayoutAnimationsRef.current = [];
    getQuestionCodeLayoutPanels().forEach((node) => {
      node.style.removeProperty('--student-code-layout-flip-x');
      node.style.removeProperty('--student-code-layout-flip-y');
      node.style.removeProperty('transform');
      node.style.removeProperty('transition');
      node.style.removeProperty('will-change');
    });
  };

  const clearQuestionCodeLayoutAnimationTimer = () => {
    if (questionCodeLayoutAnimationTimerRef.current) {
      clearTimeout(questionCodeLayoutAnimationTimerRef.current);
      questionCodeLayoutAnimationTimerRef.current = null;
    }
    if (
      questionCodeLayoutAnimationFrameRef.current
      && typeof window !== 'undefined'
      && typeof window.cancelAnimationFrame === 'function'
    ) {
      window.cancelAnimationFrame(questionCodeLayoutAnimationFrameRef.current);
      questionCodeLayoutAnimationFrameRef.current = null;
    }
    clearQuestionCodeLayoutFlip();
  };

  const stopQuestionCodeFocusAudio = () => {
    const audio = questionCodeAudioRef.current;
    if (!audio) return;
    audio.pause();
  };

  const clearQuestionCodeFocusFullscreenTimer = useCallback(() => {
    if (!questionCodeFocusFullscreenTimerRef.current) return;
    clearTimeout(questionCodeFocusFullscreenTimerRef.current);
    questionCodeFocusFullscreenTimerRef.current = null;
  }, []);

  const requestQuestionCodeNativeFullscreen = useCallback(async () => {
    const workspace = questionCodeWorkspaceRef.current;
    if (
      !workspace
      || typeof document === 'undefined'
      || document.fullscreenElement
      || typeof workspace.requestFullscreen !== 'function'
    ) {
      return;
    }

    try {
      await workspace.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      setQuestionCodeFocusFullscreen(true);
    }
  }, []);

  const cancelQuestionCodeNativeFullscreen = useCallback(() => {
    clearQuestionCodeFocusFullscreenTimer();
    if (typeof document === 'undefined') return;
    const workspace = questionCodeWorkspaceRef.current;
    if (!workspace || document.fullscreenElement !== workspace) return;
    if (typeof document.exitFullscreen !== 'function') return;
    document.exitFullscreen().catch(() => {});
  }, [clearQuestionCodeFocusFullscreenTimer]);

  const playQuestionCodeFocusAudio = () => {
    const audio = questionCodeAudioRef.current;
    if (!audio) return;
    audio.loop = true;
    audio.volume = questionCodeFocusMusicVolume;
    const playPromise = audio.play();
    if (!playPromise || typeof playPromise.then !== 'function') {
      setQuestionCodeMusicError('');
      return;
    }
    playPromise
      .then(() => setQuestionCodeMusicError(''))
      .catch(() => {
        audio.pause();
        setQuestionCodeMusicError('Не удалось включить музыку. Добавьте public/sounds/code-focus.mp3.');
      });
  };

  const exitQuestionCodeFocusFullscreen = useCallback(({ updateState = true } = {}) => {
    if (updateState) setQuestionCodeFocusFullscreen(false);
    cancelQuestionCodeNativeFullscreen();
  }, [cancelQuestionCodeNativeFullscreen]);

  const startQuestionCodeLayoutAnimation = (duration = STUDENT_CODE_LAYOUT_ANIMATION_MS) => {
    clearQuestionCodeLayoutAnimationTimer();
    setQuestionCodeLayoutAnimating(true);
    questionCodeLayoutAnimationTimerRef.current = setTimeout(() => {
      clearQuestionCodeLayoutFlip();
      setQuestionCodeLayoutAnimating(false);
      questionCodeLayoutAnimationTimerRef.current = null;
    }, duration);
  };

  const runQuestionCodeLayoutFlip = (applyLayoutChange) => {
    clearQuestionCodeLayoutAnimationTimer();
    if (questionCodeLayoutAnimating) {
      flushSync(() => setQuestionCodeLayoutAnimating(false));
    }

    const panels = getQuestionCodeLayoutPanels();
    if (panels.length === 0) {
      startQuestionCodeLayoutAnimation();
      applyLayoutChange();
      return;
    }

    const firstRects = new Map();
    panels.forEach((node) => {
      firstRects.set(node, node.getBoundingClientRect());
    });

    flushSync(applyLayoutChange);

    const canUseElementAnimations = panels.every((node) => typeof node.animate === 'function');
    if (canUseElementAnimations) {
      const animations = panels
        .map((node) => {
          if (!node.isConnected) return null;
          const first = firstRects.get(node);
          const last = node.getBoundingClientRect();
          if (!first) return null;
          const deltaX = first.left - last.left;
          const deltaY = first.top - last.top;
          if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return null;
          return node.animate(
            [
              { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
              { transform: 'translate3d(0, 0, 0)' },
            ],
            {
              duration: STUDENT_CODE_LAYOUT_ANIMATION_MS,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              fill: 'none',
            }
          );
        })
        .filter(Boolean);

      if (animations.length === 0) {
        startQuestionCodeLayoutAnimation();
        return;
      }

      flushSync(() => setQuestionCodeLayoutAnimating(true));
      if (animations.length > 0) {
        questionCodeLayoutAnimationsRef.current = animations;
        Promise.allSettled(animations.map((animation) => animation.finished))
          .then(() => {
            if (questionCodeLayoutAnimationsRef.current !== animations) return;
            clearQuestionCodeLayoutFlip({ cancelAnimations: false });
            setQuestionCodeLayoutAnimating(false);
            questionCodeLayoutAnimationTimerRef.current = null;
          });
      }

      questionCodeLayoutAnimationTimerRef.current = setTimeout(() => {
        clearQuestionCodeLayoutFlip({ cancelAnimations: false });
        setQuestionCodeLayoutAnimating(false);
        questionCodeLayoutAnimationTimerRef.current = null;
      }, STUDENT_CODE_LAYOUT_ANIMATION_MS);
      return;
    }

    let hasMovement = false;
    panels.forEach((node) => {
      const first = firstRects.get(node);
      if (!first || !node.isConnected) return;
      const last = node.getBoundingClientRect();
      const deltaX = first.left - last.left;
      const deltaY = first.top - last.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
      node.style.transition = 'none';
      node.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
      node.style.willChange = 'transform';
      hasMovement = true;
    });

    if (!hasMovement) {
      startQuestionCodeLayoutAnimation();
      return;
    }

    flushSync(() => setQuestionCodeLayoutAnimating(true));

    panels.forEach((node) => {
      if (!node.isConnected) return;
      node.getBoundingClientRect();
    });

    const playLayoutTransition = () => {
      questionCodeLayoutAnimationFrameRef.current = null;
      panels.forEach((node) => {
        if (!node.isConnected) return;
        node.style.transition = `transform ${STUDENT_CODE_LAYOUT_ANIMATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
        node.style.transform = 'translate3d(0, 0, 0)';
      });
      questionCodeLayoutAnimationTimerRef.current = setTimeout(() => {
        clearQuestionCodeLayoutFlip();
        setQuestionCodeLayoutAnimating(false);
        questionCodeLayoutAnimationTimerRef.current = null;
      }, STUDENT_CODE_LAYOUT_ANIMATION_MS);
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      questionCodeLayoutAnimationFrameRef.current = window.requestAnimationFrame(() => {
        questionCodeLayoutAnimationFrameRef.current = window.requestAnimationFrame(playLayoutTransition);
      });
      return;
    }

    playLayoutTransition();
  };

  const normalizeAnswerHistoryPayload = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
    const normalized = {};
    Object.entries(payload).forEach(([questionId, entries]) => {
      const key = String(questionId ?? '').trim();
      if (!key || !Array.isArray(entries)) return;
      const list = entries
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const submittedAt = typeof entry.submittedAt === 'string' ? entry.submittedAt : '';
          const submittedAtMs = submittedAt ? Date.parse(submittedAt) : Number.NaN;
          if (!Number.isFinite(submittedAtMs)) return null;
          const answers = Array.isArray(entry.answers)
            ? entry.answers.map((value) => String(value ?? ''))
            : (typeof entry.answer !== 'undefined' ? [String(entry.answer ?? '')] : []);
          if (answers.length === 0) return null;
          return {
            id: typeof entry.id === 'string' && entry.id.trim()
              ? entry.id.trim()
              : `${key}:${submittedAt}:${answers.join('|')}`,
            submittedAt: new Date(submittedAtMs).toISOString(),
            correct: entry.correct === true,
            answers,
            solveDurationMs: Number.isFinite(Number(entry.solveDurationMs))
              ? Math.max(0, Math.round(Number(entry.solveDurationMs)))
              : 0,
          };
        })
        .filter(Boolean)
        .sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt));
      if (list.length > 0) normalized[key] = list;
    });
    return normalized;
  };

  const loadAnswerHistory = async (lvlId = level, options = {}) => {
    if (!studentId || !task?.number || !lvlId) return {};
    if (!options?.silent) setAnswerHistoryLoading(true);
    try {
      const payload = await api.getAnswerHistory(studentId, task.number, lvlId);
      const normalized = normalizeAnswerHistoryPayload(payload);
      setAnswerHistoryById(normalized);
      return normalized;
    } finally {
      if (!options?.silent) setAnswerHistoryLoading(false);
    }
  };

  const addLocalAnswerHistoryAttempt = (
    questionId,
    answers,
    correct,
    submittedAt = new Date().toISOString(),
    solveDurationMs = 0
  ) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    const values = (Array.isArray(answers) ? answers : [answers])
      .map((value) => String(value ?? ''));
    if (values.every((value) => !value.trim())) return;
    setAnswerHistoryById((prev) => {
      const current = Array.isArray(prev?.[key]) ? prev[key] : [];
      const nextEntry = {
        id: `${key}:${submittedAt}:${Math.random().toString(36).slice(2, 8)}`,
        submittedAt,
        correct: correct === true,
        answers: values,
        solveDurationMs: Math.max(0, Math.round(Number(solveDurationMs) || 0)),
      };
      return {
        ...(prev || {}),
        [key]: [...current, nextEntry].slice(-20),
      };
    });
  };

  const getQuestionFilesForCode = (questionId) => {
    const key = String(questionId ?? '').trim();
    if (!key) return [];
    const questionIndex = questions.findIndex((question, index) => String(question?.id ?? index) === key);
    const question = questionIndex >= 0 ? questions[questionIndex] : null;
    return (Array.isArray(question?.files) ? question.files : [])
      .map((file) => {
        const rawUrl = file?.url || (file?.storageName ? `/uploads/${file.storageName}` : '');
        return { ...file, url: withStudentId(rawUrl, studentId) };
      })
      .filter((file) => getQuestionRuntimePathForFile(file) && getQuestionFileUrl(file));
  };

  const resolveQuestionRuntimeFiles = async (questionId) => {
    const files = getQuestionFilesForCode(questionId);
    if (files.length === 0) return [];
    const selectedEntries = files.map((file) => ({
      file,
      primaryPath: getQuestionRuntimePathForFile(file),
      variants: getQuestionRuntimePathVariantsForFile(file),
    })).filter((entry) => entry.primaryPath);
    const pathCounts = new Map();
    selectedEntries.forEach((entry) => {
      entry.variants.forEach((candidate) => {
        const lowerCandidate = candidate.toLowerCase();
        pathCounts.set(lowerCandidate, (pathCounts.get(lowerCandidate) || 0) + 1);
      });
    });
    const mountedPaths = new Set();
    const payload = [];
    for (const entry of selectedEntries) {
      const { file, primaryPath, variants } = entry;
      const lowerPath = primaryPath.toLowerCase();
      if (mountedPaths.has(lowerPath)) {
        throw new Error(`В задании несколько файлов с путем ${primaryPath}. Оставьте один.`);
      }
      const fileUrl = getQuestionFileUrl(file);
      const response = await authenticatedUploadsFetch(buildDownloadUrl(fileUrl));
      if (!response.ok) {
        const reason = await extractQuestionRuntimeFileError(
          response,
          `Не удалось загрузить файл ${primaryPath}.`
        );
        throw new Error(reason.includes(primaryPath) ? reason : `${reason} (${primaryPath}).`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      mountedPaths.add(lowerPath);
      payload.push({ name: primaryPath, bytes });
      variants.forEach((candidate) => {
        const lowerCandidate = candidate.toLowerCase();
        if (lowerCandidate === lowerPath) return;
        if ((pathCounts.get(lowerCandidate) || 0) !== 1) return;
        if (mountedPaths.has(lowerCandidate)) return;
        mountedPaths.add(lowerCandidate);
        payload.push({ name: candidate, bytes });
      });
    }
    return payload;
  };

  const runQuestionCodeForQuestion = async (questionId) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    closeQuestionTurtleWindow(false);
    setQuestionTerminalQuestionId(key);
    const entry = getQuestionCodeEntry(key);
    setQuestionRunStateById((prev) => ({
      ...(prev || {}),
      [key]: { loading: true, output: '', error: '', status: 'Подготовка запуска...', turtleScene: null },
    }));
    try {
      const runtimeFiles = await resolveQuestionRuntimeFiles(key);
      const fileStatus = runtimeFiles.length > 0
        ? `Подключены файлы: ${runtimeFiles.map((file) => file.name).join(', ')}`
        : '';
      setQuestionRunStateById((prev) => ({
        ...(prev || {}),
        [key]: { loading: true, output: '', error: '', status: fileStatus, turtleScene: null },
      }));
      const result = await runQuestionCode(entry.code || '', '', (progress) => {
        setQuestionRunStateById((prev) => ({
          ...(prev || {}),
          [key]: {
            loading: !progress?.done,
            output: progress?.output || '',
            error: progress?.error || '',
            status: progress?.turtleScene
              ? [fileStatus, `Рисунок turtle открыт в отдельном окне (${progress.turtleScene.primitives.length} элементов).`].filter(Boolean).join('\n')
              : fileStatus,
            turtleScene: progress?.turtleScene || null,
          },
        }));
        if (progress?.turtleScene?.used && activeQuestionIdRef.current === key) {
          setQuestionTurtleWindowQuestionId(key);
        }
      }, runtimeFiles);
      setQuestionRunStateById((prev) => ({
        ...(prev || {}),
        [key]: {
          loading: false,
          output: result?.output || '',
          error: result?.error || '',
          status: result?.turtleScene
            ? [fileStatus, `Рисунок turtle открыт в отдельном окне (${result.turtleScene.primitives.length} элементов).`].filter(Boolean).join('\n')
            : fileStatus,
          turtleScene: result?.turtleScene || null,
        },
      }));
      if (result?.turtleScene?.used && activeQuestionIdRef.current === key) {
        setQuestionTurtleWindowQuestionId(key);
      }
    } catch (err) {
      setQuestionRunStateById((prev) => ({
        ...(prev || {}),
        [key]: {
          loading: false,
          output: '',
          error: err?.message || 'Ошибка выполнения Python',
          status: '',
          turtleScene: null,
        },
      }));
    }
  };

  const startTest = async (lvlId, options = {}) => {
    if (!testDb) {
      if (!options?.silent) {
        alert("База тестов еще загружается. Попробуйте чуть позже.");
      }
      return false;
    }

    const allQuestions = testDb[task.number]?.[lvlId] || [];
    const requestedQuestionNumbers = Array.from(new Set(
      (Array.isArray(targetQuestions) ? targetQuestions : [])
        .map((value) => Math.trunc(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0 && value <= allQuestions.length)
    )).sort((left, right) => left - right);
    const hasRequestedQuestions = Array.isArray(targetQuestions) && targetQuestions.length > 0;
    const selectedEntries = requestedQuestionNumbers
      .map((number) => ({ question: allQuestions[number - 1], number }))
      .filter((entry) => entry.question);
    const qs = hasRequestedQuestions
      ? selectedEntries.map((entry) => entry.question)
      : allQuestions;
    const nextQuestionNumbers = hasRequestedQuestions
      ? selectedEntries.map((entry) => entry.number)
      : allQuestions.map((_, index) => index + 1);
    
    if (qs.length === 0) {
      if (!options?.silent) {
        alert(hasRequestedQuestions
          ? 'Выбранные для домашки вопросы не найдены.'
          : 'Учитель еще не загрузил задания для этого уровня.');
      }
      return false;
    }

    setQuestions(qs);
    setQuestionNumbers(nextQuestionNumbers);
    setLevel(lvlId);
    clearStudentTestCloseTimer();
    setStudentTestClosing(false);
    const draft = readStudentTestAnswerDraft({
      studentId,
      taskNumber: task.number,
      levelId: lvlId,
      questions: qs,
    });
    const wantsStoredIndex = Number.isFinite(Number(options?.initialIndex));
    const rawIndex = wantsStoredIndex ? Number(options.initialIndex) : (draft.currentIndex ?? 0);
    const safeIndex = qs.length > 0
      ? Math.max(0, Math.min(qs.length - 1, Math.floor(rawIndex)))
      : 0;
    setCurrentIndex(safeIndex);
    setUserAnswers(draft.answersByIndex || {});
    setResults({});
    setSolvedIds(new Set());
    setSolvedAnswerById({});
    setAnswerHistoryById({});
    setAnswerHistoryLoading(Boolean(studentId));
    clearStudentHelpCloseTimer();
    setStudentHelpClosing(false);
    setStudentHelpOpen(false);
    setStudentHelpQuestion('');
    setStudentHelpError('');
    setStudentHelpResult(null);
    questionCodeByIdRef.current = {};
    clearQuestionCodeAutoSaveTimers();
    clearQuestionCodeCloseTimer();
    clearQuestionCodeLayoutAnimationTimer();
    setQuestionCodeById({});
    setQuestionCodeOpen(false);
    setQuestionCodePreviewOpen(false);
    setQuestionCodeClosing(false);
    setQuestionCodeLayoutAnimating(false);
    setQuestionCodeLoadingById({});
    setQuestionCodeSavingById({});
    setQuestionCodeAutoSavePendingById({});
    setQuestionCodeErrorById({});
    setQuestionRunStateById({});
    setQuestionTerminalQuestionId('');
    setQuestionTurtleWindowFullscreen(false);
    setQuestionTurtleWindowQuestionId('');
    questionMainThreadRuntimeFilesRef.current = [];
    disposeQuestionRunnerWorker();
    setStage('testing');
    onLevelSelect?.(lvlId);

    if (studentId) {
      try {
        const [solvedPayload, solvedAnswersPayload, answerHistoryPayload] = await Promise.all([
          api.getSolvedQuestions(studentId, task.number, lvlId).catch(() => []),
          api.getSolvedAnswers(studentId, task.number, lvlId).catch(() => ({})),
          api.getAnswerHistory(studentId, task.number, lvlId).catch(() => ({})),
        ]);
        const solvedIdsList = Array.isArray(solvedPayload) ? solvedPayload : [];
        setSolvedIds(new Set(solvedIdsList.map((id) => String(id))));
        setSolvedAnswerById(
          solvedAnswersPayload && typeof solvedAnswersPayload === 'object'
            ? solvedAnswersPayload
            : {}
        );
        setAnswerHistoryById(normalizeAnswerHistoryPayload(answerHistoryPayload));
      } catch (err) {
        console.error(err);
      } finally {
        setAnswerHistoryLoading(false);
      }
    }
    return true;
  };

  useEffect(() => {
    if (stage !== 'select_level') return;
    if (!autoStartLevel || autoStartRef.current || autoStartFailed) return;
    if (!testDb) return;
    let cancelled = false;
    autoStartRef.current = true;
    const forceLaunch = Boolean(forceInitialLevelLaunch && autoStartLevel);
    (async () => {
      try {
        const started = await startTest(autoStartLevel, { silent: !forceLaunch, initialIndex: initialQuestionIndex });
        if (!cancelled && !started) {
          if (forceLaunch) {
            onClose?.();
            return;
          }
          setAutoStartFailed(true);
        }
      } catch {
        if (!cancelled) {
          if (forceLaunch) {
            onClose?.();
            return;
          }
          setAutoStartFailed(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [stage, autoStartLevel, initialQuestionIndex, testDb, autoStartFailed, forceInitialLevelLaunch, onClose]);

  useEffect(() => {
    autoStartRef.current = false;
    setAutoStartFailed(false);
    clearStudentTestCloseTimer();
    setStudentTestClosing(false);
    clearQuestionCodeCloseTimer();
    clearQuestionCodeLayoutAnimationTimer();
    setQuestionCodeOpen(false);
    setQuestionCodePreviewOpen(false);
    setQuestionCodeClosing(false);
    setQuestionCodeLayoutAnimating(false);
    setQuestionCodeFocusFullscreen(false);
    setQuestionCodeMusicError('');
    stopQuestionCodeFocusAudio();
    exitQuestionCodeFocusFullscreen({ updateState: false });
    questionCodeByIdRef.current = {};
    clearQuestionCodeAutoSaveTimers();
    setQuestionCodeById({});
    setQuestionCodeLoadingById({});
    setQuestionCodeSavingById({});
    setQuestionCodeAutoSavePendingById({});
    setQuestionCodeErrorById({});
    setQuestionRunStateById({});
    setQuestionTerminalQuestionId('');
    setQuestionTurtleWindowFullscreen(false);
    setQuestionTurtleWindowQuestionId('');
    setSolvedAnswerById({});
    setAnswerHistoryById({});
    setAnswerHistoryLoading(false);
    clearStudentHelpCloseTimer();
    setStudentHelpClosing(false);
    setStudentHelpOpen(false);
    setStudentHelpQuestion('');
    setStudentHelpError('');
    setStudentHelpResult(null);
    questionMainThreadRuntimeFilesRef.current = [];
    disposeQuestionRunnerWorker();
  }, [exitQuestionCodeFocusFullscreen, task?.number]);

  useEffect(() => {
    if (!canUseStudentTestDraftStorage()) return;
    window.localStorage.setItem(STUDENT_CODE_WORKSPACE_PREFS_KEY, JSON.stringify({
      fontSize: questionCodeFontSize,
      layout: questionCodeLayout,
      layoutPrefVersion: STUDENT_CODE_LAYOUT_PREF_VERSION,
      focusMusicEnabled: questionCodeFocusMusicEnabled,
      focusMusicVolume: questionCodeFocusMusicVolume,
    }));
  }, [questionCodeFocusMusicEnabled, questionCodeFocusMusicVolume, questionCodeFontSize, questionCodeLayout]);

  useEffect(() => {
    if (!studentHelpOpen) return undefined;
    const handleStudentHelpKeyDown = (event) => {
      if (event.key !== 'Escape' || studentHelpSending || studentHelpClosing) return;
      event.preventDefault();
      requestCloseStudentHelp();
    };
    window.addEventListener('keydown', handleStudentHelpKeyDown);
    return () => window.removeEventListener('keydown', handleStudentHelpKeyDown);
  }, [requestCloseStudentHelp, studentHelpClosing, studentHelpOpen, studentHelpSending]);

  useEffect(() => {
    if (!studentHelpOpen || studentHelpClosing || !studentHelpResult) return undefined;
    const frameId = window.requestAnimationFrame(() => studentHelpSuccessActionRef.current?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [studentHelpClosing, studentHelpOpen, studentHelpResult]);

  useEffect(() => {
    activeQuestionIdRef.current = activeQuestionId;
    setQuestionTerminalQuestionId('');
    setQuestionTurtleWindowFullscreen(false);
    setQuestionTurtleWindowQuestionId('');
    setQuestionCodeCopyState('idle');
    setQuestionShareCopyState('idle');
    setQuestionShareMenuAnchor('');
    if (questionCodeCopyResetTimerRef.current) {
      clearTimeout(questionCodeCopyResetTimerRef.current);
      questionCodeCopyResetTimerRef.current = null;
    }
    if (questionShareCopyResetTimerRef.current) {
      clearTimeout(questionShareCopyResetTimerRef.current);
      questionShareCopyResetTimerRef.current = null;
    }
  }, [activeQuestionId]);

  useEffect(() => {
    if (!questionShareMenuAnchor || typeof document === 'undefined') return undefined;
    const handleShareMenuPointerDown = (event) => {
      if (questionShareToolbarRef.current?.contains(event.target)) return;
      if (questionShareFocusRef.current?.contains(event.target)) return;
      setQuestionShareMenuAnchor('');
    };
    const handleShareMenuKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setQuestionShareMenuAnchor('');
    };
    document.addEventListener('pointerdown', handleShareMenuPointerDown, true);
    document.addEventListener('keydown', handleShareMenuKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleShareMenuPointerDown, true);
      document.removeEventListener('keydown', handleShareMenuKeyDown);
    };
  }, [questionShareMenuAnchor]);

  useEffect(() => {
    if (!questionTurtleWindowQuestionId) return undefined;
    const frameId = window.requestAnimationFrame(() => questionTurtleWindowCloseRef.current?.focus());
    return () => window.cancelAnimationFrame(frameId);
  }, [questionTurtleWindowQuestionId]);

  useEffect(() => {
    if (stage !== 'testing') return;
    if (!Number.isFinite(currentIndex)) return;
    onQuestionChange?.(currentIndex);
  }, [currentIndex, stage, onQuestionChange]);

  useEffect(() => {
    if (stage !== 'testing') return;
    if (!level || !questions.length) return;
    writeStudentTestAnswerDraft({
      studentId,
      taskNumber: task.number,
      levelId: level,
      questions,
      currentIndex,
      answers: userAnswers,
      solvedIds,
    });
  }, [currentIndex, level, questions, solvedIds, stage, studentId, task.number, userAnswers]);

  useEffect(() => {
    if (stage !== 'testing' || (!questionCodeOpen && !questionCodePreviewOpen)) return;
    if (!activeQuestionId) return;
    loadQuestionCode(activeQuestionId);
  }, [stage, questionCodeOpen, questionCodePreviewOpen, activeQuestionId, studentId, task?.number, level]);

  useEffect(() => {
    const attachments = Array.isArray(activeQuestion?.files) ? activeQuestion.files : [];
    const hasWorkbook = attachments.some((file) => canSolveTestWorkbook(task?.number, file));
    if (stage !== 'testing' || !level || !activeQuestionId || !hasWorkbook) {
      setQuestionWorkbookSolutions({});
      return undefined;
    }
    let cancelled = false;
    const loadSolutions = async () => {
      try {
        const payload = await api.getQuestionWorkbookSolutions(
          studentId,
          task.number,
          level,
          activeQuestionId
        );
        if (cancelled) return;
        const next = {};
        (Array.isArray(payload?.solutions) ? payload.solutions : []).forEach((solution) => {
          const attachmentId = String(solution?.attachmentId || '').trim();
          if (!attachmentId) return;
          if (!next[attachmentId]) next[attachmentId] = [];
          next[attachmentId].push(solution);
        });
        setQuestionWorkbookSolutions(next);
      } catch {
        if (!cancelled) setQuestionWorkbookSolutions({});
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadSolutions();
    };
    void loadSolutions();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeQuestion, activeQuestionId, level, stage, studentId, task?.number]);

  const handleLaunchQuestionWorkbook = useCallback(async (
    file,
    { startFresh = false, solutionFileId = '' } = {}
  ) => {
    const attachmentId = getTestAttachmentId(file);
    if (!attachmentId || !activeQuestionId || !level) return { ok: false };
    const result = await launchWorkbookHelper({
      sourceFile: { id: attachmentId, name: file?.name || 'Таблица' },
      questionContext: {
        taskNumber: task.number,
        levelId: level,
        questionId: activeQuestionId,
        attachmentId,
        startFresh,
        solutionFileId,
      },
    });
    const solution = result?.payload?.solution;
    if (solution?.attachmentId) {
      setQuestionWorkbookSolutions((current) => {
        const existing = Array.isArray(current?.[solution.attachmentId])
          ? current[solution.attachmentId]
          : [];
        return {
          ...current,
          [solution.attachmentId]: [
            ...existing.filter((entry) => entry?.fileId !== solution.fileId),
            solution,
          ].sort((left, right) => Number(left?.slot || 0) - Number(right?.slot || 0)),
        };
      });
    }
    return result;
  }, [activeQuestionId, launchWorkbookHelper, level, task?.number]);

  useEffect(() => {
    if (!questionCodeOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (questionTurtleWindowQuestionId) {
        if (questionTurtleWindowFullscreen) {
          setQuestionTurtleWindowFullscreen(false);
          return;
        }
        closeQuestionTurtleWindow();
        return;
      }
      clearQuestionCodeCloseTimer();
      if (questionCodeFocusFullscreen) {
        stopQuestionCodeFocusAudio();
        setQuestionCodeMusicError('');
        exitQuestionCodeFocusFullscreen();
        return;
      }
      stopQuestionCodeFocusAudio();
      exitQuestionCodeFocusFullscreen();
      if (prefersReducedStudentMotion()) {
        setQuestionCodeClosing(false);
        setQuestionCodeOpen(false);
        return;
      }
      setQuestionCodeClosing(true);
      questionCodeCloseTimerRef.current = setTimeout(() => {
        setQuestionCodeOpen(false);
        setQuestionCodeClosing(false);
        questionCodeCloseTimerRef.current = null;
      }, STUDENT_CODE_CLOSE_ANIMATION_MS);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    closeQuestionTurtleWindow,
    exitQuestionCodeFocusFullscreen,
    questionCodeFocusFullscreen,
    questionCodeOpen,
    questionTurtleWindowFullscreen,
    questionTurtleWindowQuestionId,
  ]);

  useEffect(() => {
    const audio = questionCodeAudioRef.current;
    if (!audio) return;
    audio.loop = true;
    audio.volume = questionCodeFocusMusicVolume;
  }, [questionCodeFocusMusicVolume]);

  useEffect(() => {
    const audio = questionCodeAudioRef.current;
    if (!audio) return;
    if (!questionCodeOpen || !questionCodeFocusFullscreen || !questionCodeFocusMusicEnabled) {
      audio.pause();
      if (!questionCodeOpen || !questionCodeFocusFullscreen) {
        setQuestionCodeMusicError('');
      }
      return;
    }
    audio.loop = true;
    audio.volume = questionCodeFocusMusicVolume;
    const playPromise = audio.play();
    if (!playPromise || typeof playPromise.then !== 'function') {
      setQuestionCodeMusicError('');
      return;
    }
    playPromise
      .then(() => setQuestionCodeMusicError(''))
      .catch(() => {
        audio.pause();
        setQuestionCodeMusicError('Не удалось включить музыку. Добавьте public/sounds/code-focus.mp3.');
      });
  }, [questionCodeFocusFullscreen, questionCodeFocusMusicEnabled, questionCodeFocusMusicVolume, questionCodeOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleFullscreenChange = () => {
      const workspace = questionCodeWorkspaceRef.current;
      const isWorkspaceFullscreen = Boolean(workspace && document.fullscreenElement === workspace);
      setQuestionCodeFocusFullscreen(isWorkspaceFullscreen);
      setQuestionCodeFullscreenPortalTarget(isWorkspaceFullscreen ? workspace : null);
      if (!isWorkspaceFullscreen) {
        stopQuestionCodeFocusAudio();
        setQuestionCodeMusicError('');
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [exitQuestionCodeFocusFullscreen]);

  useEffect(() => () => {
    clearQuestionCodeAutoSaveTimers();
    clearStudentTestCloseTimer();
    clearStudentHelpCloseTimer();
    clearQuestionCodeCloseTimer();
    clearQuestionCodeLayoutAnimationTimer();
    if (questionCodeCopyResetTimerRef.current) {
      clearTimeout(questionCodeCopyResetTimerRef.current);
      questionCodeCopyResetTimerRef.current = null;
    }
    if (questionShareCopyResetTimerRef.current) {
      clearTimeout(questionShareCopyResetTimerRef.current);
      questionShareCopyResetTimerRef.current = null;
    }
    stopQuestionCodeFocusAudio();
    exitQuestionCodeFocusFullscreen({ updateState: false });
    disposeQuestionRunnerWorker('Python runner stopped.');
  }, []);

  const normalizeAnswer = (value) => {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  };

  const parseStoredSolvedAnswers = (raw, count) => {
    const safeCount = Number.isFinite(Number(count)) ? Math.max(1, Number(count)) : 1;
    if (typeof raw !== 'string') {
      return Array.from({ length: safeCount }, () => '');
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return Array.from({ length: safeCount }, () => '');
    }
    let values = null;
    const looksJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (looksJson) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) values = parsed;
        else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.answers)) values = parsed.answers;
          else if (typeof parsed.answer !== 'undefined') values = [parsed.answer];
        }
      } catch {
        // Ignore malformed stored answer payload.
      }
    }
    if (!Array.isArray(values)) values = [trimmed];
    return Array.from({ length: safeCount }, (_, index) => String(values[index] ?? ''));
  };

  const handleCheck = async (sourceRect = null) => {
    const currentQuestion = questions[currentIndex];
    const answerCount = getStudentQuestionAnswerCount(
      currentQuestion,
      task?.number,
      getAnswerCountForTask
    );
    const submittedAt = new Date().toISOString();
    let submittedAnswerValues = [];
    let fallbackCorrect = false;
    let answerPayload = null;
    if (answerCount > 1) {
      const answerEntry = Array.isArray(userAnswers[currentIndex]) ? userAnswers[currentIndex] : [];
      const provided = Array.from({ length: answerCount }, (_, i) => String(answerEntry[i] ?? ''));
      const allowPartial = allowsPartialAnswers(task?.number);
      if (!allowPartial && provided.some((val) => !val.trim())) return;
      if (allowPartial && provided.every((val) => !val.trim())) return;
      const trimmedProvided = provided.map((val) => String(val ?? '').trim());
      submittedAnswerValues = trimmedProvided;
      if (trimmedProvided.some((val) => val)) {
        answerPayload = JSON.stringify({ answers: trimmedProvided });
      }
      if (!studentId) {
        const expectedAnswers = getExpectedAnswers(currentQuestion, answerCount);
        fallbackCorrect = expectedAnswers.every((exp, i) => {
          const expectedNorm = normalizeAnswer(exp);
          const providedNorm = normalizeAnswer(provided[i]);
          if (!expectedNorm) return !providedNorm;
          return providedNorm === expectedNorm;
        });
      }
    } else {
      const answerValue = userAnswers[currentIndex];
      if (!String(answerValue ?? '').trim()) return;
      const trimmedAnswer = String(answerValue ?? '').trim();
      submittedAnswerValues = [trimmedAnswer];
      answerPayload = trimmedAnswer;
      if (!studentId) {
        const expectedAnswers = getExpectedAnswers(currentQuestion, answerCount);
        fallbackCorrect = normalizeAnswer(answerValue) === normalizeAnswer(expectedAnswers[0]);
      }
    }

    let correct = false;
    let serverProgressApplied = false;
    const solveDurationMs = getActiveQuestionSolveDurationMs.getElapsedMs();
    getActiveQuestionSolveDurationMs.acknowledge?.(solveDurationMs);
    const levelConfig = Object.values(LEVELS).find(l => l.id === level);
    if (studentId) {
      getActiveQuestionSolveDurationMs.pause?.();
      try {
        const resp = await api.solveQuestion({
          studentId,
          taskNumber: task.number,
          levelId: level,
          questionId: currentQuestion.id,
          ...(answerPayload ? { code: answerPayload } : {}),
          solveDurationMs,
          localDay: getLocalDayKey(),
        });
        correct = true;
        getActiveQuestionSolveDurationMs.clear?.();
        setSolvedIds((prev) => {
          const next = new Set(prev);
          next.add(String(currentQuestion.id));
          return next;
        });
        try {
          const solvedAnswersPayload = await api.getSolvedAnswers(studentId, task.number, level);
          if (solvedAnswersPayload && typeof solvedAnswersPayload === 'object') {
            setSolvedAnswerById((prev) => ({
              ...(prev || {}),
              ...solvedAnswersPayload,
            }));
          }
        } catch {
          // Keep solving flow even if loading solved answers fails.
        }
        if (typeof onStreakSaved === 'function') {
          if (resp?.streak) {
            onStreakSaved(resp.streak);
          } else {
            api.getStudentData(studentId)
              .then((data) => {
                if (data?.streak) onStreakSaved(data.streak);
              })
              .catch(() => {});
          }
        }
        if (typeof onXpGain === 'function' && Number.isFinite(Number(resp?.xpTotal))) {
          onXpGain({
            xpTotal: normalizeXpTotal(resp.xpTotal),
            xpGained: normalizeXpTotal(resp?.xpGained),
            coinsTotal: Number.isFinite(Number(resp?.coinsTotal)) ? Number(resp.coinsTotal) : undefined,
            coinsGained: Number.isFinite(Number(resp?.coinsGained)) ? Number(resp.coinsGained) : undefined,
            sourceRect: sourceRect && Number.isFinite(sourceRect.left) && Number.isFinite(sourceRect.top)
              ? sourceRect
              : null,
          });
        }
        if (typeof resp?.taskProgress === 'number') {
          onComplete(task.id, resp.taskProgress, {
            skipServer: true,
            quickQuestionSolved: true,
            taskNumber: task.number,
            levelId: level,
            solvedQuestionId: String(currentQuestion.id),
            solvedQuestionNumber: questionNumbers[currentIndex] ?? (currentIndex + 1),
          });
          serverProgressApplied = true;
        }
        try {
          await loadAnswerHistory(level, { silent: true });
        } catch {
          addLocalAnswerHistoryAttempt(currentQuestion.id, submittedAnswerValues, true, submittedAt, solveDurationMs);
        }
      } catch (err) {
        const message = String(err?.message || err || '');
        if (message !== 'Ответ неверный') {
          console.error(err);
          alert(message || 'Не удалось проверить ответ');
          return;
        }
        try {
          await loadAnswerHistory(level, { silent: true });
        } catch {
          addLocalAnswerHistoryAttempt(currentQuestion.id, submittedAnswerValues, false, submittedAt, solveDurationMs);
        }
      } finally {
        getActiveQuestionSolveDurationMs.resume?.();
        onPracticeAttempt?.();
      }
    } else {
      correct = fallbackCorrect;
      if (correct) getActiveQuestionSolveDurationMs.clear?.();
      addLocalAnswerHistoryAttempt(currentQuestion.id, submittedAnswerValues, correct, submittedAt, solveDurationMs);
    }
    setResults((prev) => ({ ...prev, [currentIndex]: correct }));
    if (correct && studentId) {
      api.getQuestionDifficulties(task.number, level)
        .then((payload) => {
          setQuestionDifficultyById(
            payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
          );
        })
        .catch(() => {});
    }
    
    // Если ответ верный, обновляем прогресс
    if (correct) {
      if (serverProgressApplied) return;
      const weight = LEVEL_WEIGHTS[level] ?? levelConfig?.maxScore ?? 100;
      const totalCount = questions.length;
      if (Number.isFinite(weight) && totalCount > 0) {
        const prevSolved = solvedIds.size;
        const nextSolved = solvedIds.has(String(currentQuestion.id)) ? prevSolved : prevSolved + 1;
        const prevContribution = (prevSolved / totalCount) * weight;
        const nextContribution = (nextSolved / totalCount) * weight;
        const nextProgress = Math.round(Math.max(0, currentMastery - prevContribution + nextContribution));
        onComplete(task.id, Math.min(100, nextProgress), {
          skipServer: true,
          quickQuestionSolved: true,
          taskNumber: task.number,
          levelId: level,
          solvedQuestionId: String(currentQuestion.id),
          solvedQuestionNumber: questionNumbers[currentIndex] ?? (currentIndex + 1),
        });
      } else if (levelConfig?.maxScore > currentMastery) {
        onComplete(task.id, levelConfig.maxScore, {
          skipServer: true,
          quickQuestionSolved: true,
          taskNumber: task.number,
          levelId: level,
          solvedQuestionId: String(currentQuestion.id),
          solvedQuestionNumber: questionNumbers[currentIndex] ?? (currentIndex + 1),
        });
      }
    }
  };

  const handlePreviousQuestion = () => {
    setCurrentIndex((index) => Math.max(0, index - 1));
  };

  const handleNextQuestion = () => {
    setCurrentIndex((index) => Math.min(Math.max(questions.length - 1, 0), index + 1));
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1);
    else requestCloseStudentTest();
  };

  const clearCurrentQuestionResult = () => {
    setResults((prev) => {
      const next = { ...prev };
      delete next[currentIndex];
      return next;
    });
  };

  const handleCheckCurrentQuestion = (eventOrElement = null) => {
    const element = eventOrElement?.currentTarget || eventOrElement;
    const rect = element?.getBoundingClientRect?.();
    handleCheck(rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)
      ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }
      : null);
  };


  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  if (stage === 'select_level') {
    if (autoStartLevel && !autoStartFailed) {
      const waitingTests = testDb === null || typeof testDb === 'undefined';
      const loadingModal = (
        <div
          className="student-level-modal-backdrop fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <div className="student-level-modal student-level-modal--loading modal-card relative w-full text-center">
            <button onClick={onClose} className="student-level-modal__close" type="button" aria-label="Закрыть"><X size={19}/></button>
            <div className="student-level-modal__loading-badge mx-auto">
              <RefreshCcw size={14} className="animate-spin" />
              {waitingTests ? 'Загрузка заданий...' : 'Открываем задания...'}
            </div>
            <p className="text-gray-500 mt-3 text-sm">
              {waitingTests
                ? 'Подождите немного, загружаем тесты для этого задания.'
                : 'Подготавливаем выбранный уровень.'}
            </p>
          </div>
        </div>
      );
      return typeof document !== 'undefined' ? createPortal(loadingModal, document.body) : null;
    }

    const levelChoices = Object.values(LEVELS).map((lvl) => {
      const questionCount = Array.isArray(testDb?.[task.number]?.[lvl.id])
        ? testDb[task.number][lvl.id].length
        : 0;
      return {
        ...lvl,
        questionCount,
        isAvailable: questionCount > 0,
        isCompleted: currentMastery >= lvl.maxScore,
        xpReward: getTaskLevelXpReward(task?.number, lvl.id),
      };
    });
    const recommendedLevelId = (
      levelChoices.find((lvl) => lvl.isAvailable && !lvl.isCompleted)
      || levelChoices.find((lvl) => lvl.isAvailable)
    )?.id || '';
    const availableQuestionCount = levelChoices.reduce((sum, lvl) => sum + lvl.questionCount, 0);
    const testsAreLoading = testDb === null || typeof testDb === 'undefined';

    const modal = (
      <div
        className="student-level-modal-backdrop fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-3 sm:p-4"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="student-level-modal modal-card relative w-full">
          <button onClick={onClose} className="student-level-modal__close" type="button" aria-label="Закрыть"><X size={19}/></button>

          <header className="student-level-modal__header">
            <span className="student-level-modal__task-chip">Задание №{getTaskDisplayNumber(task)}</span>
            <h2>Выберите уровень</h2>
            <p>{task.title}</p>
            <div className="student-level-modal__mastery">
              <div className="flex items-center justify-between gap-3">
                <span>Ваш прогресс</span>
                <strong>{Math.round(currentMastery)}%</strong>
              </div>
              <div><span style={{ width: `${Math.max(0, Math.min(100, currentMastery))}%` }} /></div>
            </div>
            <div className="student-level-modal__availability">
              {testsAreLoading
                ? 'Загружаем доступные уровни…'
                : `${availableQuestionCount} ${availableQuestionCount === 1 ? 'задание доступно' : 'заданий доступно'}`}
            </div>
          </header>

          <div className="student-level-modal__grid">
            {levelChoices.map((lvl) => {
              const isRecommended = lvl.id === recommendedLevelId;
              const isDisabled = testsAreLoading || !lvl.isAvailable;
              const levelXpRewardLabel = lvl.xpReward > 0
                ? `+${lvl.xpReward.toLocaleString('ru-RU')} XP`
                : '';

              return (
                <button
                  key={lvl.id}
                  type="button"
                  data-level={lvl.id}
                  data-completed={lvl.isCompleted ? 'true' : 'false'}
                  data-available={lvl.isAvailable ? 'true' : 'false'}
                  data-recommended={isRecommended ? 'true' : 'false'}
                  disabled={isDisabled}
                  onClick={() => {
                    const shouldRestoreIndex = initialLevel && initialLevel === lvl.id;
                    startTest(lvl.id, shouldRestoreIndex ? { initialIndex: initialQuestionIndex } : {});
                  }}
                  className="student-level-card"
                  aria-label={`${lvl.label}. ${lvl.questionCount} заданий${isRecommended ? '. Рекомендуемый уровень' : ''}`}
                >
                  <div className="student-level-card__topline">
                    <div className="student-level-card__icon">
                      {lvl.isCompleted ? <Check size={20} /> : <PlayCircle size={20} />}
                    </div>
                    <div className="student-level-card__badges">
                      {isRecommended && <span className="student-level-card__recommended">Рекомендуем</span>}
                      <span className="student-level-card__count">
                        {testsAreLoading
                          ? 'Загрузка…'
                          : (lvl.isCompleted
                              ? 'Пройдено'
                              : (lvl.isAvailable ? `${lvl.questionCount} заданий` : 'Пока пусто'))}
                      </span>
                    </div>
                  </div>
                  <div className="student-level-card__content">
                    <h3>{lvl.label}</h3>
                    <p>
                      {lvl.id === 'basic' && 'Прототипы ЕГЭ и задания из демоверсий.'}
                      {lvl.id === 'advanced' && 'Усложнённые условия и нестандартные формулировки.'}
                      {lvl.id === 'expert' && 'Статград и самые сложные задачи.'}
                    </p>
                  </div>
                  <div className="student-level-card__footer">
                    <span>Прогресс до {lvl.maxScore}%</span>
                    {lvl.isAvailable && lvl.xpReward > 0 && (
                      <span className="student-level-card__reward">
                        {levelXpRewardLabel}
                      </span>
                    )}
                    {!testsAreLoading && !lvl.isAvailable && (
                      <span className="student-level-card__unavailable">Нет заданий</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
  }

  if (stage === 'testing' && questions.length > 0) {
    const currentQuestion = questions[currentIndex];
    const currentQuestionNumber = questionNumbers[currentIndex] ?? (currentIndex + 1);
    const currentQuestionLabel = normalizeQuestionLabel(currentQuestion?.label);
    const currentMockExamSourceBadge = getMockExamSourceBadge(currentQuestion);
    const isChecked = results[currentIndex] !== undefined;
    const isCorrect = results[currentIndex];
    const answerCount = getStudentQuestionAnswerCount(
      currentQuestion,
      task?.number,
      getAnswerCountForTask
    );
    const expectedAnswers = getExpectedAnswers(currentQuestion, answerCount);
    const currentId = String(currentQuestion?.id ?? currentIndex);
    const wasSolved = solvedIds.has(currentId);
    const isSolved = wasSolved && !reviewMode;
    const solvedStoredAnswers = parseStoredSolvedAnswers(solvedAnswerById?.[currentId], answerCount);
    const solvedAnswerValues = Array.from({ length: answerCount }, (_, index) => {
      const expected = String(expectedAnswers[index] ?? '');
      if (expected.trim()) return expected;
      return String(solvedStoredAnswers[index] ?? '');
    });
    const storedAnswer = userAnswers[currentIndex];
    const answerValue = answerCount === 1
      ? (isSolved ? String(solvedAnswerValues[0] ?? '') : String(storedAnswer ?? ''))
      : '';
    const answerValues = answerCount > 1
      ? (
        isSolved
          ? solvedAnswerValues.map((val) => String(val ?? ''))
          : Array.from({ length: answerCount }, (_, i) => String((Array.isArray(storedAnswer) ? storedAnswer[i] : '') ?? ''))
      )
      : [];
    const sourceMockTaskNumber = Math.trunc(Number(currentQuestion?.mockExamSource?.taskNumber));
    const answerLabels = Number(task?.number) === GAME_THEORY_TASK && answerCount === 4
      ? ['19', '20.1', '20.2', '21']
      : (
          sourceMockTaskNumber === 20 && answerCount === 2
            ? ['20.1', '20.2']
            : Array.from(
                { length: answerCount },
                (_, idx) => (
                  answerCount === 1 && [19, 21].includes(sourceMockTaskNumber)
                    ? String(sourceMockTaskNumber)
                    : String(idx + 1)
                )
              )
        );
    const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
      .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
    const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
      .map((file) => {
        const rawUrl = file?.url || (file?.storageName ? `/uploads/${file.storageName}` : '');
        return { ...file, url: withStudentId(rawUrl, studentId) };
      });
    const isAnswerReady = isSolved
      ? true
      : (
        answerCount > 1
          ? (allowsPartialAnswers(task?.number)
              ? answerValues.some((val) => String(val ?? '').trim())
              : answerValues.every((val) => String(val ?? '').trim()))
          : Boolean(answerValue.trim())
      );
    const computedChecked = isSolved || isChecked;
    const computedCorrect = isSolved ? true : isCorrect;
    const rawTargets = Array.isArray(targetQuestions) ? targetQuestions : [];
    const levelQuestions = Array.isArray(testDb?.[task.number]?.[level]) && testDb[task.number][level].length > 0
      ? testDb[task.number][level]
      : questions;
    const levelQuestionNumbers = levelQuestions.map((_, index) => index + 1);
    const getQuestionStatusByNumber = (questionNumber) => {
      const number = Number(questionNumber);
      const localIndex = questionNumbers.findIndex((value) => Number(value) === number);
      const levelIndex = Number.isFinite(number) ? Math.trunc(number) - 1 : -1;
      const question = levelIndex >= 0 ? levelQuestions[levelIndex] : (localIndex >= 0 ? questions[localIndex] : null);
      if (!question && localIndex < 0) return 'pending';
      const key = getStudentQuestionStateKey(
        question || questions[localIndex],
        Number.isFinite(number) ? number : questionNumbers[localIndex],
        localIndex >= 0 ? localIndex : levelIndex
      );
      if (solvedIds.has(key) || (localIndex >= 0 && results[localIndex] === true)) return 'solved';
      if (localIndex >= 0 && results[localIndex] === false) return 'wrong';
      if (localIndex >= 0 && hasStudentTestDraftValue(userAnswers[localIndex])) return 'draft';
      return 'pending';
    };
    const targetNumbers = rawTargets.length > 0
      ? Array.from(new Set(
          rawTargets
            .map((num) => Math.trunc(Number(num)))
            .filter((num) => Number.isFinite(num) && num > 0 && num <= levelQuestions.length)
        )).sort((left, right) => left - right)
      : [];
    const targetNumberSet = new Set(targetNumbers);
    const targetStatus = targetNumbers.map((num) => ({
      num,
      solved: getQuestionStatusByNumber(num) === 'solved',
    }));
    const targetSolvedCount = targetStatus.filter((item) => item.solved).length;
    const homeworkRemainingCount = Math.max(0, targetStatus.length - targetSolvedCount);
    const homeworkProgressPercent = targetStatus.length > 0
      ? Math.round((targetSolvedCount / targetStatus.length) * 100)
      : 0;
    const currentLevelQuestionIndex = levelQuestionNumbers.findIndex((num) => Number(num) === Number(currentQuestionNumber));
    const previousLevelQuestionNumber = currentLevelQuestionIndex > 0
      ? levelQuestionNumbers[currentLevelQuestionIndex - 1]
      : null;
    const nextLevelQuestionNumber = currentLevelQuestionIndex >= 0 && currentLevelQuestionIndex < levelQuestionNumbers.length - 1
      ? levelQuestionNumbers[currentLevelQuestionIndex + 1]
      : null;
    const solvedQuestionCount = questions.reduce((count, question, index) => {
      const questionId = String(question?.id ?? index);
      return solvedIds.has(questionId) || results[index] === true ? count + 1 : count;
    }, 0);
    const levelSolvedCount = levelQuestionNumbers.reduce((count, questionNumber) => (
      getQuestionStatusByNumber(questionNumber) === 'solved' ? count + 1 : count
    ), 0);
    const levelProgressPercent = levelQuestionNumbers.length > 0
      ? Math.round((levelSolvedCount / levelQuestionNumbers.length) * 100)
      : 0;
    const completionPercent = questions.length > 0
      ? Math.round((solvedQuestionCount / questions.length) * 100)
      : 0;
    const questionCodeEntry = getQuestionCodeEntry(currentId);
    const questionCodeLoading = Boolean(questionCodeLoadingById?.[currentId]);
    const questionCodeSaving = Boolean(questionCodeSavingById?.[currentId]);
    const questionCodeAutoSavePending = Boolean(questionCodeAutoSavePendingById?.[currentId]);
    const questionCodeError = questionCodeErrorById?.[currentId] || '';
    const questionRunState = questionRunStateById?.[currentId] || {
      loading: false,
      output: '',
      error: '',
      status: '',
      turtleScene: null,
    };
    const isQuestionTerminalVisible = questionTerminalQuestionId === currentId;
    const hasQuestionTurtleScene = Boolean(
      questionRunState.turtleScene?.used
      && Array.isArray(questionRunState.turtleScene.primitives)
    );
    const turtleWindowQuestionId = String(questionTurtleWindowQuestionId || '').trim();
    const turtleWindowScene = questionRunStateById?.[turtleWindowQuestionId]?.turtleScene || null;
    const isQuestionTurtleWindowOpen = Boolean(
      turtleWindowQuestionId
      && turtleWindowScene?.used
      && Array.isArray(turtleWindowScene.primitives)
    );
    const attachedRuntimeFileNames = extraFiles
      .map((file) => getQuestionRuntimePathForFile(file))
      .filter(Boolean);
    const questionTerminalText = formatQuestionTerminalText({
      loading: questionRunState.loading,
      output: questionRunState.output,
      error: questionRunState.error,
      status: questionRunState.status,
      attachedFiles: attachedRuntimeFileNames,
    });
    const questionCodeUpdatedAtLabel = questionCodeEntry.updatedAt
      ? new Date(questionCodeEntry.updatedAt).toLocaleString('ru-RU')
      : '';
    const answerHistory = Array.isArray(answerHistoryById?.[currentId])
      ? answerHistoryById[currentId]
      : [];
    const answerHistoryLatestFirst = answerHistory.slice().reverse();
    const formatAnswerHistoryTime = (value) => {
      const parsed = Date.parse(String(value || ''));
      if (!Number.isFinite(parsed)) return '';
      return new Date(parsed).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    };
    const formatAnswerHistoryValues = (answers = []) => {
      const values = Array.isArray(answers) ? answers : [];
      if (answerCount <= 1) return String(values[0] ?? '').trim() || '—';
      return Array.from({ length: answerCount }, (_, index) => {
        const label = answerLabels[index] || String(index + 1);
        const value = String(values[index] ?? '').trim() || '—';
        return `${label}: ${value}`;
      }).join('; ');
    };
    const getQuestionSideNavState = (index) => {
      if (index < 0 || index >= questions.length) return 'unavailable';
      return getQuestionStatusByNumber(questionNumbers[index] ?? (index + 1));
    };
    const getQuestionSideNavLabel = (index) => {
      if (index < 0) return 'Предыдущего вопроса нет';
      if (index >= questions.length) return 'Следующего вопроса нет';
      const state = getQuestionSideNavState(index);
      const number = questionNumbers[index] ?? (index + 1);
      if (state === 'solved') return `Вопрос №${number} решён`;
      if (state === 'wrong') return `Вопрос №${number}: ответ неверный`;
      if (state === 'draft') return `Вопрос №${number}: ответ введён`;
      return `Вопрос №${number} не решён`;
    };
    const previousQuestionSideNavState = getQuestionSideNavState(currentIndex - 1);
    const nextQuestionSideNavState = getQuestionSideNavState(currentIndex + 1);
    const previousQuestionSideNavLabel = getQuestionSideNavLabel(currentIndex - 1);
    const nextQuestionSideNavLabel = getQuestionSideNavLabel(currentIndex + 1);
    const studentTestBackdropClassName = [
      'student-test-modal-backdrop fixed inset-0 z-50 modal-backdrop flex items-center justify-center p-0 sm:p-3 md:p-5',
      studentTestClosing ? 'is-closing' : '',
    ].filter(Boolean).join(' ');
    const studentTestWorkspaceClassName = [
      'student-test-workspace student-test-workspace--animated modal-card w-full max-w-6xl h-[100dvh] sm:h-auto sm:max-h-[94dvh] relative flex flex-col overflow-hidden',
      studentTestClosing ? 'is-closing' : '',
    ].filter(Boolean).join(' ');
    const quickHomeworkPlan = getQuickHomeworkPlanPresentation(quickHomeworkPlanProgress);
    const canPasteAnswerTable = answerCount === 20 && !computedChecked;
    const updateCurrentAnswerValue = (value) => {
      if (computedChecked) return;
      setUserAnswers((prev) => ({ ...prev, [currentIndex]: value }));
    };
    const updateCurrentAnswerPart = (answerIndex, value) => {
      if (computedChecked) return;
      setUserAnswers((prev) => {
        const next = { ...prev };
        const current = Array.isArray(next[currentIndex])
          ? [...next[currentIndex]]
          : Array.from({ length: answerCount }, () => '');
        current[answerIndex] = value;
        next[currentIndex] = current;
        return next;
      });
    };
    const handleAnswerInputPaste = (event, startIndex) => {
      if (computedChecked) return;
      const values = splitPastedAnswerValues(event.clipboardData?.getData('text/plain') || '');
      if (values.length <= 1) return;
      const pasteOrder = getAnswerPasteOrder(answerCount, startIndex);
      if (pasteOrder.length === 0) return;
      event.preventDefault();
      setUserAnswers((prev) => {
        const next = { ...prev };
        const current = Array.isArray(next[currentIndex])
          ? [...next[currentIndex]]
          : Array.from({ length: answerCount }, () => '');
        values.slice(0, pasteOrder.length).forEach((value, idx) => {
          current[pasteOrder[idx]] = value;
        });
        next[currentIndex] = current;
        return next;
      });
    };

    const studentHelpDraftKey = getStudentHelpDraftKey({
      studentId,
      taskNumber: task?.number,
      levelId: level,
      questionId: currentId,
    });

    const handleOpenStudentHelp = () => {
      clearStudentHelpCloseTimer();
      setStudentHelpClosing(false);
      let savedDraft = '';
      let savedChannel = 'platform';
      if (canUseStudentTestDraftStorage()) {
        try {
          savedDraft = window.localStorage.getItem(studentHelpDraftKey) || '';
          savedChannel = window.localStorage.getItem(STUDENT_HELP_CHANNEL_PREF_KEY) === 'telegram'
            ? 'telegram'
            : 'platform';
        } catch {
          savedDraft = '';
        }
      }
      setStudentHelpQuestion(savedDraft);
      // Keep the guaranteed channel selected until Telegram availability has
      // actually been confirmed for this teacher.
      setStudentHelpChannel('platform');
      setStudentHelpChannels(null);
      setStudentHelpError('');
      setStudentHelpResult(null);
      setStudentHelpSolutionImage(null);
      if (studentHelpSolutionInputRef.current) studentHelpSolutionInputRef.current.value = '';
      studentHelpRequestIdRef.current = '';
      setStudentHelpOpen(true);
      if (currentId) loadQuestionCode(currentId);

      setStudentHelpChannelsLoading(true);
      api.getStudentHelpChannels()
        .then((payload) => {
          const nextChannels = payload && typeof payload === 'object' ? payload : null;
          setStudentHelpChannels(nextChannels);
          setStudentHelpChannel(
            savedChannel === 'telegram' && nextChannels?.telegram?.available === true
              ? 'telegram'
              : 'platform'
          );
        })
        .catch(() => {
          setStudentHelpChannels({
            platform: { available: true },
            telegram: { available: false, reason: 'Не удалось проверить подключение Telegram' },
          });
          setStudentHelpChannel('platform');
        })
        .finally(() => setStudentHelpChannelsLoading(false));
    };

    const handleCloseStudentHelp = () => {
      requestCloseStudentHelp();
    };

    const handleStudentHelpQuestionChange = (event) => {
      const nextValue = String(event.target.value || '').slice(0, 1200);
      setStudentHelpQuestion(nextValue);
      setStudentHelpError('');
      if (canUseStudentTestDraftStorage()) {
        try {
          if (nextValue.trim()) window.localStorage.setItem(studentHelpDraftKey, nextValue);
          else window.localStorage.removeItem(studentHelpDraftKey);
        } catch {
          // Draft persistence is helpful but must not block the form.
        }
      }
    };

    const handleStudentHelpPrompt = (prompt) => {
      const current = String(studentHelpQuestion || '').trim();
      const next = current ? `${current}\n${prompt}` : prompt;
      handleStudentHelpQuestionChange({ target: { value: next } });
    };

    const handleStudentHelpChannelChange = (nextChannel) => {
      if (nextChannel === 'telegram' && studentHelpChannels?.telegram?.available !== true) return;
      const normalized = nextChannel === 'telegram' ? 'telegram' : 'platform';
      setStudentHelpChannel(normalized);
      setStudentHelpError('');
      if (canUseStudentTestDraftStorage()) {
        try {
          window.localStorage.setItem(STUDENT_HELP_CHANNEL_PREF_KEY, normalized);
        } catch {
          // Ignore storage restrictions.
        }
      }
    };

    const handleStudentHelpSolutionImageChange = async (event) => {
      const file = event?.target?.files?.[0] || null;
      if (!file) return;
      setStudentHelpError('');
      try {
        const image = await readStudentHelpSolutionImage(file);
        setStudentHelpSolutionImage(image);
      } catch (error) {
        setStudentHelpSolutionImage(null);
        if (studentHelpSolutionInputRef.current) studentHelpSolutionInputRef.current.value = '';
        setStudentHelpError(String(error?.message || error || 'Не удалось прикрепить изображение'));
      }
    };

    const handleRemoveStudentHelpSolutionImage = () => {
      setStudentHelpSolutionImage(null);
      if (studentHelpSolutionInputRef.current) studentHelpSolutionInputRef.current.value = '';
      setStudentHelpError('');
    };

    const handleSendStudentHelp = async (event) => {
      event?.preventDefault?.();
      if (studentHelpSending) return;
      if (studentHelpChannelsLoading && studentHelpChannel === 'telegram') {
        setStudentHelpError('Подождите секунду — проверяем доступные способы отправки.');
        return;
      }
      if (studentHelpChannel === 'telegram' && studentHelpChannels?.telegram?.available !== true) {
        setStudentHelpChannel('platform');
        setStudentHelpError('Telegram сейчас недоступен. Выберите чат платформы — вопрос всё равно дойдёт преподавателю.');
        return;
      }
      const normalizedQuestion = String(studentHelpQuestion || '').trim();
      if (normalizedQuestion.length < 3) {
        setStudentHelpError('Напишите хотя бы несколько слов, чтобы преподаватель понял вопрос.');
        return;
      }
      setStudentHelpSending(true);
      setStudentHelpError('');
      setStudentHelpResult(null);
      let code = getQuestionCodeEntry(currentId, questionCodeByIdRef.current).code;
      const codeEntry = getQuestionCodeEntry(currentId, questionCodeByIdRef.current);
      if (!codeEntry.loaded) {
        setStudentHelpPreparingCode(true);
        try {
          const payload = await api.getQuestionCode(studentId, task.number, level, currentId);
          code = typeof payload?.code === 'string' ? payload.code : '';
          setQuestionCodeEntry(currentId, {
            code,
            input: '',
            updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
          });
        } catch {
          code = codeEntry.code || '';
        } finally {
          setStudentHelpPreparingCode(false);
        }
      }

      let snapshotDataUrl = '';
      if (screenshots.length > 1) {
        try {
          snapshotDataUrl = await createStudentHelpMultiImageSnapshot({
            screenshots,
            taskNumber: getTaskDisplayNumber(task),
            questionNumber: currentQuestionNumber,
          });
        } catch {
          // The server will still attach the first original image if composing
          // a multi-page condition is unavailable in this browser.
          snapshotDataUrl = '';
        }
      } else if (screenshots.length === 0) {
        try {
          snapshotDataUrl = createStudentHelpTextSnapshot({
            taskNumber: getTaskDisplayNumber(task),
            taskTitle: task?.title,
            questionNumber: currentQuestionNumber,
            label: currentQuestionLabel?.text,
            text: currentQuestion?.question,
          });
        } catch {
          snapshotDataUrl = '';
        }
      }

      try {
        const requestId = studentHelpRequestIdRef.current || createStudentHelpRequestId();
        studentHelpRequestIdRef.current = requestId;
        const payload = await api.sendStudentHelpRequest({
          requestId,
          channel: studentHelpChannel,
          taskNumber: task?.number,
          taskTitle: task?.title,
          levelId: level,
          questionId: currentId,
          question: normalizedQuestion,
          code,
          snapshotDataUrl,
          solutionImageDataUrl: studentHelpSolutionImage?.dataUrl || '',
          solutionImageName: studentHelpSolutionImage?.name || '',
        });
        setStudentHelpResult(payload || { ok: true, platformDelivered: true });
        setStudentHelpSolutionImage(null);
        if (studentHelpSolutionInputRef.current) studentHelpSolutionInputRef.current.value = '';
        studentHelpRequestIdRef.current = '';
        if (canUseStudentTestDraftStorage()) {
          try {
            window.localStorage.removeItem(studentHelpDraftKey);
          } catch {
            // Ignore storage restrictions after a successful send.
          }
        }
      } catch (error) {
        setStudentHelpError(String(error?.message || error || 'Не удалось отправить вопрос'));
      } finally {
        setStudentHelpSending(false);
      }
    };

    const handleStudentHelpDialogKeyDown = (event) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(event.currentTarget.querySelectorAll(
        'button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
      )).filter((node) => node.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleOpenQuestionCodeFocus = () => {
      clearQuestionCodeCloseTimer();
      closeQuestionTurtleWindow(false);
      setQuestionTerminalQuestionId('');
      setQuestionCodeClosing(false);
      setQuestionCodeOpen(true);
      if (currentId) loadQuestionCode(currentId);
    };

    const handleQuestionCodeChange = (value) => {
      const nextCode = value ?? '';
      if (questionCodeCopyState !== 'idle') setQuestionCodeCopyState('idle');
      if (questionShareCopyState !== 'idle') setQuestionShareCopyState('idle');
      setQuestionCodeEntry(currentId, { code: nextCode, input: '' });
      clearQuestionCodeError(currentId);
      scheduleQuestionCodeAutoSave(currentId, { code: nextCode, input: '' });
    };

    const handleCopyQuestionCode = async () => {
      if (!questionCodeEntry.code) return;
      try {
        await writeStudentCodeToClipboard(questionCodeEntry.code);
        setQuestionCodeCopyState('copied');
      } catch {
        setQuestionCodeCopyState('error');
      }
      if (questionCodeCopyResetTimerRef.current) {
        clearTimeout(questionCodeCopyResetTimerRef.current);
      }
      questionCodeCopyResetTimerRef.current = setTimeout(() => {
        setQuestionCodeCopyState('idle');
        questionCodeCopyResetTimerRef.current = null;
      }, STUDENT_CODE_COPY_FEEDBACK_MS);
    };

    const prepareCurrentQuestionShare = () => {
      if (!currentId) return null;
      const requestedQuestionId = currentId;
      setQuestionShareCopyState('preparing');
      if (questionShareCopyResetTimerRef.current) {
        clearTimeout(questionShareCopyResetTimerRef.current);
        questionShareCopyResetTimerRef.current = null;
      }

      const codePromise = (async () => {
        const cached = getQuestionCodeEntry(requestedQuestionId, questionCodeByIdRef.current);
        if (cached.loaded) return cached.code;
        const payload = await api.getQuestionCode(studentId, task.number, level, requestedQuestionId);
        const loadedCode = typeof payload?.code === 'string' ? payload.code : '';
        const liveEntry = getQuestionCodeEntry(requestedQuestionId, questionCodeByIdRef.current);
        if (liveEntry.loaded) return liveEntry.code;
        setQuestionCodeEntry(requestedQuestionId, {
          code: loadedCode,
          input: '',
          updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : '',
        });
        return loadedCode;
      })();
      const shareAnswer = answerCount > 1
        ? answerValues
            .map((value, index) => ({ label: answerLabels[index] || String(index + 1), value: String(value || '').trim() }))
            .filter((entry) => entry.value)
            .map((entry) => `${entry.label}: ${entry.value}`)
            .join('\n')
        : String(answerValue || '').trim();
      const shareLabel = [currentMockExamSourceBadge?.text, currentQuestionLabel?.text]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' · ');
      const sharePayloadPromise = codePromise.then((currentCode) => ({
        taskNumber: getTaskDisplayNumber(task),
        taskTitle: task?.title,
        questionNumber: currentQuestionNumber,
        label: shareLabel,
        conditionText: currentQuestion?.question,
        screenshots,
        code: currentCode,
        answer: shareAnswer,
      }));
      const textPromise = sharePayloadPromise.then((payload) => buildStudentTeacherShareText({
        ...payload,
        screenshotCount: payload.screenshots.length,
      }));
      const cardPromise = sharePayloadPromise.then(createStudentTeacherShareCard);
      return {
        requestedQuestionId,
        cardPromise,
        textPromise,
        title: `Задание №${getTaskDisplayNumber(task)} · вопрос №${currentQuestionNumber}`,
      };
    };

    const finishCurrentQuestionShare = (requestedQuestionId, state) => {
      if (activeQuestionIdRef.current === requestedQuestionId) setQuestionShareCopyState(state);
      if (questionShareCopyResetTimerRef.current) clearTimeout(questionShareCopyResetTimerRef.current);
      questionShareCopyResetTimerRef.current = setTimeout(() => {
        if (activeQuestionIdRef.current === requestedQuestionId) setQuestionShareCopyState('idle');
        questionShareCopyResetTimerRef.current = null;
      }, STUDENT_TEACHER_SHARE_FEEDBACK_MS);
    };

    const handleCopyQuestionForTeacher = async () => {
      if (!currentId || ['preparing', 'sharing'].includes(questionShareCopyState)) return;
      setQuestionShareMenuAnchor('');
      const prepared = prepareCurrentQuestionShare();
      if (!prepared) return;

      try {
        const copyMode = await writeStudentTeacherShareToClipboard(prepared);
        finishCurrentQuestionShare(prepared.requestedQuestionId, copyMode === 'image' ? 'copied' : 'text');
      } catch {
        finishCurrentQuestionShare(prepared.requestedQuestionId, 'error');
      }
    };

    const handleShareQuestionToTelegram = async () => {
      if (!currentId || ['preparing', 'sharing'].includes(questionShareCopyState)) return;
      setQuestionShareMenuAnchor('');
      const prepared = prepareCurrentQuestionShare();
      if (!prepared) return;
      try {
        setQuestionShareCopyState('sharing');
        const cardBlob = await prepared.cardPromise;
        const result = await api.createStudentShareCard({ blob: cardBlob, title: prepared.title });
        const shareUrl = String(result?.shareUrl || '').trim();
        if (!/^https?:\/\//i.test(shareUrl)) throw new Error('Платформа не вернула ссылку на карточку');

        const telegramText = `${prepared.title}\nУсловие и мой текущий код — в карточке.`;
        const query = `url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(telegramText)}`;
        const nativeTelegramUrl = `tg://msg_url?${query}`;
        const webTelegramUrl = `https://t.me/share/url?${query}`;
        let telegramTookFocus = false;
        const markTelegramFocused = () => { telegramTookFocus = true; };
        const markTelegramHidden = () => {
          if (document.visibilityState === 'hidden') telegramTookFocus = true;
        };
        window.addEventListener('blur', markTelegramFocused, { once: true });
        document.addEventListener('visibilitychange', markTelegramHidden);
        window.location.href = nativeTelegramUrl;
        window.setTimeout(() => {
          window.removeEventListener('blur', markTelegramFocused);
          document.removeEventListener('visibilitychange', markTelegramHidden);
          if (!telegramTookFocus && document.visibilityState === 'visible') {
            window.location.href = webTelegramUrl;
          }
        }, STUDENT_TELEGRAM_APP_FALLBACK_MS);
        finishCurrentQuestionShare(prepared.requestedQuestionId, 'telegram');
      } catch {
        finishCurrentQuestionShare(prepared.requestedQuestionId, 'error');
      }
    };

    const handleOpenStudentHelpFromShare = (anchor) => {
      const shareRoot = anchor === 'focus'
        ? questionShareFocusRef.current
        : questionShareToolbarRef.current;
      studentHelpTriggerRef.current = shareRoot?.querySelector('[data-question-share-button="true"]') || null;
      setQuestionShareMenuAnchor('');
      handleOpenStudentHelp();
    };

    const toggleQuestionShareMenu = (anchor) => {
      setQuestionShareMenuAnchor((current) => (current === anchor ? '' : anchor));
    };

    const questionShareCopyLabel = ['preparing', 'sharing'].includes(questionShareCopyState)
      ? 'Готовим…'
      : questionShareCopyState === 'copied'
        ? 'Скопировано'
        : questionShareCopyState === 'telegram'
          ? 'Выберите получателя'
          : questionShareCopyState === 'shared'
            ? 'Отправлено'
            : questionShareCopyState === 'text'
              ? 'Скопирован текст'
              : questionShareCopyState === 'error'
                ? 'Не получилось'
                : 'Поделиться';
    const questionShareCopyTitle = questionShareCopyState === 'copied'
      ? 'Карточка скопирована — вставьте её в Telegram через Ctrl+V'
      : questionShareCopyState === 'telegram'
        ? 'Telegram открыт — выберите чат, карточка и текст уже подготовлены'
        : questionShareCopyState === 'shared'
          ? 'Карточка передана в выбранное приложение'
      : questionShareCopyState === 'text'
        ? 'Браузер скопировал запасной текстовый вариант'
        : questionShareCopyState === 'error'
          ? 'Не удалось подготовить отправку. Попробуйте ещё раз.'
          : 'Поделиться условием и текущим кодом';

    const renderQuestionShareMenu = (anchor, { focus = false } = {}) => {
      const isOpen = questionShareMenuAnchor === anchor;
      const isBusy = ['preparing', 'sharing'].includes(questionShareCopyState);
      const isSuccessful = ['copied', 'telegram', 'shared', 'text'].includes(questionShareCopyState);
      const rootRef = anchor === 'focus' ? questionShareFocusRef : questionShareToolbarRef;
      const triggerClassName = focus
        ? `student-test-code-focus__focus-button is-share is-${questionShareCopyState}`
        : `student-test-share-trigger is-${questionShareCopyState}`;
      return (
        <div
          ref={rootRef}
          className={`student-test-share-menu ${focus ? 'is-focus' : ''} ${isOpen ? 'is-open' : ''}`}
        >
          <button
            type="button"
            className={triggerClassName}
            onClick={() => toggleQuestionShareMenu(anchor)}
            disabled={isBusy}
            title={questionShareCopyTitle}
            aria-label={questionShareCopyTitle}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-live="polite"
            data-question-share-button="true"
            data-student-test-tour={focus ? undefined : 'teacher-help'}
          >
            {isBusy ? (
              <RefreshCcw className="student-test-share-trigger__spinner" size={focus ? 15 : 16} aria-hidden="true" />
            ) : isSuccessful ? (
              <Check size={focus ? 15 : 16} aria-hidden="true" />
            ) : (
              <Share2 size={focus ? 15 : 16} aria-hidden="true" />
            )}
            <span>{questionShareCopyLabel}</span>
            <ChevronDown className="student-test-share-trigger__chevron" size={14} aria-hidden="true" />
          </button>
          {isOpen && (
            <div className="student-test-share-popover" role="menu" aria-label="Поделиться заданием">
              <div className="student-test-share-popover__options">
                <button
                  type="button"
                  role="menuitem"
                  className="student-test-share-option is-platform"
                  onClick={() => handleOpenStudentHelpFromShare(anchor)}
                >
                  <span className="student-test-share-option__icon" aria-hidden="true"><CircleHelp size={19} /></span>
                  <span className="student-test-share-option__copy">
                    <strong>Спросить учителя</strong>
                    <small>Написать внутри платформы</small>
                  </span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="student-test-share-option is-telegram"
                  onClick={handleShareQuestionToTelegram}
                >
                  <span className="student-test-share-option__icon" aria-hidden="true"><Send size={19} /></span>
                  <span className="student-test-share-option__copy">
                    <strong>Отправить в Telegram</strong>
                    <small>Открыть приложение и выбрать получателя</small>
                  </span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="student-test-share-option is-copy"
                  onClick={handleCopyQuestionForTeacher}
                >
                  <span className="student-test-share-option__icon" aria-hidden="true"><Copy size={19} /></span>
                  <span className="student-test-share-option__copy">
                    <strong>Скопировать условие и код</strong>
                    <small>Потом вставить одним Ctrl+V</small>
                  </span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      );
    };

    const handleToggleQuestionCodePreview = () => {
      const nextOpen = !questionCodePreviewOpen;
      setQuestionCodePreviewOpen(nextOpen);
      if (nextOpen && currentId) {
        loadQuestionCode(currentId);
        window.requestAnimationFrame(() => {
          questionCodePanelRef.current?.scrollIntoView({
            behavior: prefersReducedStudentMotion() ? 'auto' : 'smooth',
            block: 'start',
          });
        });
      }
    };

    const handleCloseQuestionCodeFocus = () => {
      clearQuestionCodeCloseTimer();
      closeQuestionTurtleWindow(false);
      stopQuestionCodeFocusAudio();
      exitQuestionCodeFocusFullscreen();
      if (prefersReducedStudentMotion()) {
        setQuestionCodeClosing(false);
        setQuestionCodeOpen(false);
        return;
      }
      setQuestionCodeClosing(true);
      questionCodeCloseTimerRef.current = setTimeout(() => {
        setQuestionCodeOpen(false);
        setQuestionCodeClosing(false);
        questionCodeCloseTimerRef.current = null;
      }, STUDENT_CODE_CLOSE_ANIMATION_MS);
    };

    const updateQuestionCodeFocusMusicEnabled = (enabled) => {
      setQuestionCodeWorkspacePrefs((prev) => ({
        ...(prev || {}),
        focusMusicEnabled: Boolean(enabled),
      }));
    };

    const handleToggleQuestionCodeMusic = () => {
      const nextEnabled = !questionCodeFocusMusicEnabled;
      updateQuestionCodeFocusMusicEnabled(nextEnabled);
      if (nextEnabled) {
        playQuestionCodeFocusAudio();
        return;
      }
      stopQuestionCodeFocusAudio();
      setQuestionCodeMusicError('');
    };

    const handleQuestionCodeMusicVolumeChange = (event) => {
      const nextVolume = clampStudentCodeFocusMusicVolume(Number(event.target.value) / 100);
      setQuestionCodeWorkspacePrefs((prev) => ({
        ...(prev || {}),
        focusMusicVolume: nextVolume,
      }));
      const audio = questionCodeAudioRef.current;
      if (audio) audio.volume = nextVolume;
    };

    const handleToggleQuestionCodeTheme = () => {
      if (typeof onThemeToggle === 'function') {
        onThemeToggle();
      }
    };

    const handleToggleQuestionCodeFocusFullscreen = async () => {
      if (questionCodeFocusFullscreen) {
        stopQuestionCodeFocusAudio();
        setQuestionCodeMusicError('');
        exitQuestionCodeFocusFullscreen();
        return;
      }

      clearQuestionCodeFocusFullscreenTimer();
      flushSync(() => setQuestionCodeFocusFullscreen(true));
      if (prefersReducedStudentMotion()) {
        await requestQuestionCodeNativeFullscreen();
        return;
      }

      questionCodeFocusFullscreenTimerRef.current = setTimeout(() => {
        questionCodeFocusFullscreenTimerRef.current = null;
        requestQuestionCodeNativeFullscreen();
      }, STUDENT_CODE_FOCUS_FULLSCREEN_DELAY_MS);
    };

    const handleDecreaseQuestionCodeFontSize = () => {
      setQuestionCodeWorkspacePrefs((prev) => ({
        ...(prev || {}),
        fontSize: clampStudentCodeFontSize((prev?.fontSize ?? STUDENT_CODE_FONT_SIZE_DEFAULT) - 1),
      }));
    };

    const handleIncreaseQuestionCodeFontSize = () => {
      setQuestionCodeWorkspacePrefs((prev) => ({
        ...(prev || {}),
        fontSize: clampStudentCodeFontSize((prev?.fontSize ?? STUDENT_CODE_FONT_SIZE_DEFAULT) + 1),
      }));
    };

    const handleToggleQuestionCodeLayout = () => {
      const nextLayout = isQuestionCodeSideLayout
        ? STUDENT_CODE_LAYOUT_STACKED
        : STUDENT_CODE_LAYOUT_SIDE;
      const applyLayoutChange = () => {
        setQuestionCodeWorkspacePrefs((prev) => ({
          ...(prev || {}),
          layout: nextLayout,
        }));
      };

      if (prefersReducedStudentMotion()) {
        applyLayoutChange();
        return;
      }

      runQuestionCodeLayoutFlip(applyLayoutChange);
    };

    const handleSelectQuestionNumber = (questionNumber) => {
      const number = Math.trunc(Number(questionNumber));
      if (!Number.isFinite(number) || number < 1) return;
      const currentListIndex = questionNumbers.findIndex((value) => Number(value) === number);
      if (currentListIndex >= 0) {
        setCurrentIndex(currentListIndex);
        return;
      }

      const levelIndex = number - 1;
      const nextQuestion = levelQuestions[levelIndex];
      if (!nextQuestion) return;

      setUserAnswers((prev) => remapStudentQuestionIndexedState({
        source: prev,
        fromQuestions: questions,
        fromQuestionNumbers: questionNumbers,
        toQuestions: levelQuestions,
        toQuestionNumbers: levelQuestionNumbers,
      }));
      setResults((prev) => remapStudentQuestionIndexedState({
        source: prev,
        fromQuestions: questions,
        fromQuestionNumbers: questionNumbers,
        toQuestions: levelQuestions,
        toQuestionNumbers: levelQuestionNumbers,
      }));
      setQuestions(levelQuestions);
      setQuestionNumbers(levelQuestionNumbers);
      setCurrentIndex(levelIndex);
    };

    const focusQuestionText = String(currentQuestion?.question || '').trim();
    const codeFocusStatusLabel = questionCodeLoading
      ? 'Загружаем код...'
      : (questionCodeSaving
          ? 'Автосохранение...'
          : (questionCodeAutoSavePending
              ? 'Изменения скоро сохранятся...'
              : (questionCodeUpdatedAtLabel ? `Сохранено ${questionCodeUpdatedAtLabel}` : 'Код еще не сохранен')));
    const codeFocusSaveStateClassName = [
      'student-test-code-focus__save-state',
      questionCodeLoading ? 'is-loading' : '',
      !questionCodeLoading && (questionCodeSaving || questionCodeAutoSavePending) ? 'is-saving' : '',
      !questionCodeLoading && !questionCodeSaving && !questionCodeAutoSavePending && questionCodeUpdatedAtLabel ? 'is-saved' : '',
      !questionCodeLoading && !questionCodeSaving && !questionCodeAutoSavePending && !questionCodeUpdatedAtLabel ? 'is-idle' : '',
    ].filter(Boolean).join(' ');
    const codeFocusAnswerStatusLabel = computedChecked
      ? (computedCorrect ? 'Ответ засчитан' : 'Ответ не подошел')
      : (isAnswerReady ? 'Можно проверять' : 'Введите ответ');
    const codeFocusAnswerCardClassName = [
      'student-test-code-focus__answer-card',
      computedChecked ? (computedCorrect ? 'is-correct' : 'is-wrong') : '',
    ].filter(Boolean).join(' ');
    const codeFocusWorkspaceClassName = [
      'student-test-code-focus__workspace',
      isQuestionCodeSideLayout ? 'is-side-by-side' : '',
      questionCodeFocusFullscreen ? 'is-focus-fullscreen' : '',
      questionCodeLayoutAnimating ? 'is-layout-animating' : '',
    ].filter(Boolean).join(' ');
    const codeFocusBodyClassName = [
      'student-test-code-focus__body',
      isQuestionCodeSideLayout ? 'is-side-by-side' : '',
      questionCodeLayoutAnimating ? 'is-layout-animating' : '',
    ].filter(Boolean).join(' ');
    const codeFocusRootClassName = [
      'student-test-code-focus fixed inset-0 z-[70]',
      questionCodeFocusFullscreen ? 'is-focus-fullscreen' : '',
      questionCodeClosing ? 'is-closing' : '',
    ].filter(Boolean).join(' ');
    const shouldRenderQuestionCodeFocus = questionCodeOpen || questionCodeClosing;

    const codeFocusOverlay = shouldRenderQuestionCodeFocus ? (
      <div
        className={codeFocusRootClassName}
        role="dialog"
        aria-modal="true"
        aria-label={`Решение в коде для вопроса №${currentQuestionNumber}`}
      >
        <button
          type="button"
          className="student-test-code-focus__scrim"
          onClick={handleCloseQuestionCodeFocus}
          aria-label="Закрыть режим кода"
        />
        <div ref={questionCodeWorkspaceRef} className={codeFocusWorkspaceClassName}>
          <audio
            ref={questionCodeAudioRef}
            src={STUDENT_CODE_FOCUS_MUSIC_SRC}
            loop
            preload="none"
            onError={() => {
              if (questionCodeFocusMusicEnabled) {
                setQuestionCodeMusicError('Добавьте файл public/sounds/code-focus.mp3.');
              }
            }}
          />
          <header className="student-test-code-focus__header">
            <div className="student-test-code-focus__title">
              <span className="student-test-code-focus__title-icon" aria-hidden="true">
                <Code2 size={21} />
              </span>
              <div className="min-w-0">
                <div className="student-test-code-focus__eyebrow">
                  Вопрос №{currentQuestionNumber}
                </div>
                <h3>Решать в коде</h3>
              </div>
            </div>
            <div className="student-test-code-focus__header-actions">
              {renderQuestionShareMenu('focus', { focus: true })}
              <div className="student-test-code-focus__focus-tools" aria-label="Режим полной фокусировки">
                <button
                  type="button"
                  className={`student-test-code-focus__focus-button ${questionCodeFocusFullscreen ? 'is-active' : ''}`}
                  onClick={handleToggleQuestionCodeFocusFullscreen}
                  title={questionCodeFocusFullscreen ? 'Выйти из режима Фулл фокус' : 'Включить режим Фулл фокус'}
                  aria-label={questionCodeFocusFullscreen ? 'Выйти из режима Фулл фокус' : 'Включить режим Фулл фокус'}
                >
                  {questionCodeFocusFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  <span>Фокус</span>
                </button>
                {questionCodeFocusFullscreen && (
                  <>
                    {typeof onThemeToggle === 'function' && (
                      <button
                        type="button"
                        className="student-test-code-focus__focus-button is-theme"
                        onClick={handleToggleQuestionCodeTheme}
                        title={isQuestionCodeDarkTheme ? 'Включить светлую тему' : 'Включить тёмную тему'}
                        aria-label={isQuestionCodeDarkTheme ? 'Включить светлую тему' : 'Включить тёмную тему'}
                      >
                        {isQuestionCodeDarkTheme ? <Sun size={15} /> : <Moon size={15} />}
                        <span>{isQuestionCodeDarkTheme ? 'Светлая' : 'Тёмная'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className={`student-test-code-focus__focus-button is-music ${questionCodeFocusMusicEnabled ? 'is-active' : ''}`}
                      onClick={handleToggleQuestionCodeMusic}
                      title={questionCodeFocusMusicEnabled ? 'Выключить музыку' : 'Включить музыку фокуса'}
                      aria-label={questionCodeFocusMusicEnabled ? 'Выключить музыку' : 'Включить музыку фокуса'}
                    >
                      {questionCodeFocusMusicEnabled ? <Volume2 size={15} /> : <Music size={15} />}
                      <span>Музыка</span>
                    </button>
                    <label
                      className={`student-test-code-focus__volume ${questionCodeFocusMusicEnabled ? 'is-enabled' : ''}`}
                      title="Громкость музыки"
                    >
                      <VolumeX size={13} />
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={Math.round(questionCodeFocusMusicVolume * 100)}
                        onChange={handleQuestionCodeMusicVolumeChange}
                        disabled={!questionCodeFocusMusicEnabled}
                        aria-label="Громкость музыки"
                      />
                      <Volume2 size={13} />
                    </label>
                  </>
                )}
              </div>
              {questionCodeFocusFullscreen && questionCodeMusicError && (
                <span className="student-test-code-focus__music-error">
                  {questionCodeMusicError}
                </span>
              )}
              {!questionCodeFocusFullscreen && (
                <button
                  type="button"
                  className="student-test-code-focus__close"
                  onClick={handleCloseQuestionCodeFocus}
                  aria-label="Закрыть режим кода"
                >
                  <X size={19} />
                </button>
              )}
            </div>
          </header>

          <nav
            className={`student-test-code-focus__navigator ${targetStatus.length > 0 ? 'has-homework' : ''}`}
            aria-label="Навигация по вопросам уровня"
          >
            {targetStatus.length > 0 && (
              <div className="student-test-code-focus__homework-row">
                <div className="student-test-code-focus__nav-heading">
                  <span>Домашка</span>
                  <strong>{homeworkRemainingCount} осталось</strong>
                  <span className="student-test-code-focus__nav-progress" aria-hidden="true">
                    <i style={{ width: `${homeworkProgressPercent}%` }} />
                  </span>
                </div>
                <div ref={questionCodeHomeworkStripRef} className="student-test-code-focus__homework-strip" aria-label="Вопросы из домашки">
                  {targetStatus.map((item, index) => {
                    const status = getQuestionStatusByNumber(item.num);
                    const isCurrentTarget = Number(currentQuestionNumber) === Number(item.num);
                    return (
                      <button
                        key={`code-homework-${item.num}`}
                        type="button"
                        className={`student-test-code-focus__homework-chip is-${status} ${isCurrentTarget ? 'is-current' : ''}`}
                        style={{ '--student-test-item-index': index }}
                        onClick={() => handleSelectQuestionNumber(item.num)}
                        aria-current={isCurrentTarget ? 'step' : undefined}
                        title={item.solved ? `Вопрос №${item.num} решён` : `Открыть вопрос №${item.num}`}
                      >
                        <span>№{item.num}</span>
                        {item.solved && <Check size={13} strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="student-test-code-focus__level-row">
              <div className="student-test-code-focus__nav-heading">
                <span>Прогресс</span>
                <strong>{levelSolvedCount} из {levelQuestionNumbers.length}</strong>
                <span className="student-test-code-focus__nav-progress" aria-hidden="true">
                  <i style={{ width: `${levelProgressPercent}%` }} />
                </span>
              </div>
              <div className="student-test-code-focus__level-controls">
                <button
                  type="button"
                  className="student-test-code-focus__nav-arrow"
                  onClick={() => handleSelectQuestionNumber(previousLevelQuestionNumber)}
                  disabled={!previousLevelQuestionNumber}
                  aria-label="Предыдущий вопрос"
                >
                  <ChevronLeft size={16} />
                </button>
                <div ref={questionCodeLevelStripRef} className="student-test-code-focus__level-strip" aria-label="Все вопросы уровня">
                  {levelQuestionNumbers.map((num, index) => {
                    const status = getQuestionStatusByNumber(num);
                    const isCurrentLevelQuestion = Number(currentQuestionNumber) === Number(num);
                    const isHomeworkQuestion = targetNumberSet.has(Number(num));
                    return (
                      <button
                        key={`code-level-${num}`}
                        type="button"
                        className={[
                          'student-test-code-focus__level-dot',
                          `is-${status}`,
                          isCurrentLevelQuestion ? 'is-current' : '',
                          isHomeworkQuestion ? 'is-homework' : '',
                        ].filter(Boolean).join(' ')}
                        style={{ '--student-test-item-index': index }}
                        onClick={() => handleSelectQuestionNumber(num)}
                        aria-current={isCurrentLevelQuestion ? 'step' : undefined}
                        aria-label={`Вопрос №${num}${status === 'solved' ? ' решён' : ''}${isHomeworkQuestion ? ' · из домашки' : ''}`}
                        title={`Вопрос №${num}${isHomeworkQuestion ? ' из домашки' : ''}`}
                      >
                        <span className="student-test-code-focus__level-number">{num}</span>
                        {status === 'solved' && (
                          <Check className="student-test-code-focus__level-check" size={10} strokeWidth={3.2} aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="student-test-code-focus__nav-arrow"
                  onClick={() => handleSelectQuestionNumber(nextLevelQuestionNumber)}
                  disabled={!nextLevelQuestionNumber}
                  aria-label="Следующий вопрос"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </nav>

          <main className={codeFocusBodyClassName}>
            <section
              ref={questionCodeTaskPanelRef}
              className="student-test-code-focus__task"
              aria-label="Условие задания"
            >
              <div className="student-test-code-focus__task-head">
                {currentMockExamSourceBadge && (
                  <span
                    className="student-test-code-focus__label"
                    style={getQuestionLabelStyle(currentMockExamSourceBadge)}
                    title={currentMockExamSourceBadge.text}
                  >
                    {currentMockExamSourceBadge.text}
                  </span>
                )}
                {currentQuestionLabel && (
                  <span
                    className="student-test-code-focus__label"
                    style={getQuestionLabelStyle(currentQuestionLabel)}
                  >
                    {currentQuestionLabel.text}
                  </span>
                )}
                <QuestionDifficultyBadge
                  difficulty={questionDifficultyById?.[currentId]}
                  theme={theme}
                  minimumSampleSize={QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE}
                />
                <span className="student-test-code-focus__task-meta">
                  Задание {getTaskDisplayNumber(task)}
                </span>
              </div>

              {screenshots.length > 0 ? (
                <div className={`student-test-code-focus__media ${screenshots.length > 1 ? 'is-gallery' : ''}`}>
                  {screenshots.map((img, imageIndex) => (
                    <button
                      key={img.id || img.storageName || img.url || imageIndex}
                      type="button"
                      className="student-test-code-focus__image-button"
                      onClick={() => setExpandedImage(img)}
                      aria-label="Открыть изображение задания"
                    >
                      <img
                        src={img.url}
                        alt={img.name || 'Скриншот задания'}
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="student-test-code-focus__text-only">
                  {focusQuestionText || 'Условие находится в материалах задания.'}
                </div>
              )}

              {focusQuestionText && screenshots.length > 0 && (
                <p className="student-test-code-focus__question-text">{focusQuestionText}</p>
              )}

              {extraFiles.length > 0 && (
                <div className="student-test-code-focus__files">
                  {extraFiles.map((file) => {
                    const attachmentId = getTestAttachmentId(file);
                    const canSolve = canSolveTestWorkbook(task?.number, file);
                    const workbookSolutions = Array.isArray(questionWorkbookSolutions?.[attachmentId])
                      ? questionWorkbookSolutions[attachmentId]
                      : [];
                    const hasSolution = workbookSolutions.length > 0;
                    const isOpening = workbookHelperState.sourceFileId === attachmentId
                      && ['launching', 'opening'].includes(workbookHelperState.status);
                    return (
                      <div key={attachmentId || file.url} className="inline-flex shrink-0 items-center gap-1">
                        <a
                          href={buildDownloadUrl(file.url)}
                          download={file?.name || undefined}
                        >
                          <Download size={14} />
                          <span>{file.name}</span>
                        </a>
                        {canSolve && (
                          <div className="inline-flex shrink-0 flex-wrap items-center gap-1">
                            {workbookSolutions.map((solution) => (
                              <button
                                key={solution.fileId}
                                type="button"
                                onClick={() => void handleLaunchQuestionWorkbook(file, {
                                  solutionFileId: solution.fileId,
                                })}
                                disabled={isOpening}
                                className={`inline-flex min-h-[30px] items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                                  isQuestionCodeDarkTheme
                                    ? 'border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20'
                                    : 'border-violet-200 bg-violet-50/80 text-violet-700 hover:bg-violet-100'
                                }`}
                              >
                                <FileSpreadsheet size={14} />
                                {isOpening && workbookHelperState.solutionFileId === solution.fileId
                                  ? 'Открываем…'
                                  : (workbookSolutions.length === 1 ? 'Продолжить' : `Решение ${solution.slot}`)}
                              </button>
                            ))}
                            {workbookSolutions.length < 3 && (
                              <button
                                type="button"
                                onClick={() => void handleLaunchQuestionWorkbook(file, { startFresh: true })}
                                disabled={isOpening}
                                title="Открыть чистый исходник и сохранить отдельным решением"
                                className={`inline-flex min-h-[30px] items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
                                  isQuestionCodeDarkTheme
                                    ? 'border-slate-600 bg-slate-900 text-slate-300 hover:border-violet-500 hover:text-violet-200'
                                    : 'border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-700'
                                }`}
                              >
                                <RefreshCcw size={13} />
                                {isOpening && workbookHelperState.launchMode === 'fresh'
                                  ? 'Открываем…'
                                  : (hasSolution ? 'Решить заново' : 'Решать')}
                              </button>
                            )}
                            {workbookSolutions.length >= 3 && (
                              <span className="px-1 text-[10px] font-semibold text-slate-400">3 из 3</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section
              ref={questionCodeIdePanelRef}
              className="student-test-code-focus__ide"
              aria-label="Редактор кода"
            >
              <div className="student-test-code-focus__ide-topbar">
                <div className="student-test-code-focus__tab">
                  <Code2 size={15} />
                  <span>solution.py</span>
                </div>
                <span className={codeFocusSaveStateClassName}>{codeFocusStatusLabel}</span>
                <div className="student-test-code-focus__tools">
                  <div className="student-test-code-focus__control-group" aria-label="Размер шрифта кода">
                    <button
                      type="button"
                      onClick={handleDecreaseQuestionCodeFontSize}
                      disabled={questionCodeFontSize <= STUDENT_CODE_FONT_SIZE_MIN}
                      className="student-test-code-focus__font-button"
                      title="Уменьшить шрифт кода"
                      aria-label="Уменьшить шрифт кода"
                    >
                      A-
                    </button>
                    <span className="student-test-code-focus__font-size-label">
                      {questionCodeFontSize}px
                    </span>
                    <button
                      type="button"
                      onClick={handleIncreaseQuestionCodeFontSize}
                      disabled={questionCodeFontSize >= STUDENT_CODE_FONT_SIZE_MAX}
                      className="student-test-code-focus__font-button"
                      title="Увеличить шрифт кода"
                      aria-label="Увеличить шрифт кода"
                    >
                      A+
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleQuestionCodeLayout}
                    className="student-test-code-focus__tool-button is-layout"
                    title={isQuestionCodeSideLayout ? 'Расположить условие сверху' : 'Расположить условие слева'}
                    aria-label={isQuestionCodeSideLayout ? 'Расположить условие сверху' : 'Расположить условие слева'}
                  >
                    {isQuestionCodeSideLayout ? <PanelTop size={15} /> : <PanelLeft size={15} />}
                    <span>{isQuestionCodeSideLayout ? 'Условие сверху' : 'Условие слева'}</span>
                  </button>
                  <button
                    ref={questionCodeRunButtonRef}
                    type="button"
                    onClick={() => runQuestionCodeForQuestion(currentId)}
                    disabled={questionRunState.loading || questionCodeLoading}
                    className="student-test-code-focus__tool-button is-run"
                  >
                    <PlayCircle size={16} />
                    <span>{questionRunState.loading ? 'Запуск...' : 'Запустить'}</span>
                  </button>
                </div>
              </div>

              {questionCodeLoading ? (
                <div className="student-test-code-focus__loading">
                  <RefreshCcw size={18} />
                  <span>Загружаем рабочее пространство...</span>
                </div>
              ) : (
                <>
                  <div className={`student-test-code-focus__ide-grid ${isQuestionTerminalVisible ? 'is-terminal-visible' : ''}`}>
                    <div className="student-test-code-focus__editor-pane">
                      <Editor
                        height="100%"
                        language="python"
                        theme={monacoTheme}
                        beforeMount={ensureMonacoColorTheme}
                        value={questionCodeEntry.code}
                        onChange={handleQuestionCodeChange}
                        options={questionCodeEditorOptions}
                        loading={<div className="student-test-code-focus__editor-loading">Загрузка редактора...</div>}
                      />
                    </div>

                    {isQuestionTerminalVisible && (
                      <aside className="student-test-code-focus__console-pane" aria-live="polite">
                        <div className="student-test-code-focus__console-head">
                          <span><Terminal size={15} /> Terminal</span>
                          <div className="student-test-code-focus__console-actions">
                            {hasQuestionTurtleScene && (
                              <button
                                type="button"
                                className="student-test-code-focus__open-turtle"
                                onClick={() => setQuestionTurtleWindowQuestionId(currentId)}
                                title="Открыть рисунок Turtle"
                              >
                                <Maximize2 size={13} />
                                <span>Рисунок</span>
                              </button>
                            )}
                            {questionRunState.loading && <strong>running</strong>}
                            <button
                              type="button"
                              className="student-test-code-focus__console-close"
                              onClick={() => setQuestionTerminalQuestionId('')}
                              title="Закрыть терминал"
                              aria-label="Закрыть терминал"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                        <pre className="student-test-code-focus__terminal-output">
                          {questionTerminalText}
                        </pre>
                        {questionCodeError && <div className="student-test-code-focus__error">{questionCodeError}</div>}
                      </aside>
                    )}
                  </div>

                  <div className={codeFocusAnswerCardClassName}>
                    <div className="student-test-code-focus__answer-head">
                      <span>
                        {computedChecked && computedCorrect ? <Check size={15} /> : <ListChecks size={15} />}
                        Ответ
                      </span>
                      {computedChecked && <strong>{codeFocusAnswerStatusLabel}</strong>}
                    </div>
                    <div className="student-test-code-focus__answer-body">
                      {answerCount > 1 ? (
                        <div className="student-test-code-focus__answer-grid">
                          {Array.from({ length: answerCount }).map((_, idx) => (
                            <input
                              key={`code-focus-answer-${idx}`}
                              type="text"
                              value={answerValues[idx] ?? ''}
                              onPaste={(event) => handleAnswerInputPaste(event, idx)}
                              onChange={(event) => updateCurrentAnswerPart(idx, event.target.value)}
                              placeholder={answerLabels[idx] ? `Ответ ${answerLabels[idx]}` : `Ответ ${idx + 1}`}
                              disabled={computedChecked}
                            />
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={answerValue}
                          onChange={(event) => updateCurrentAnswerValue(event.target.value)}
                          placeholder="Введите ответ..."
                          disabled={computedChecked}
                        />
                      )}
                    </div>
                    <div className="student-test-code-focus__answer-actions">
                      {computedChecked && (
                        <span className="student-test-code-focus__answer-result">
                          {computedCorrect ? 'Верно, вопрос отмечен решенным.' : 'Неверно, попробуйте другой ответ.'}
                        </span>
                      )}
                      {!computedChecked ? (
                        <button
                          type="button"
                          onClick={handleCheckCurrentQuestion}
                          disabled={!isAnswerReady}
                        >
                          Проверить
                        </button>
                      ) : computedCorrect ? (
                        <button type="button" disabled>
                          Засчитано
                        </button>
                      ) : (
                        <button type="button" onClick={clearCurrentQuestionResult}>
                          Попробовать еще
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          </main>
          {isQuestionTurtleWindowOpen && (
            <div
              className={`student-test-turtle-window${questionTurtleWindowFullscreen ? ' is-fullscreen' : ''}`}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeQuestionTurtleWindow();
              }}
            >
              <section
                className="student-test-turtle-window__dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="student-test-turtle-window-title"
                onKeyDown={(event) => {
                  if (event.key !== 'Tab') return;
                  event.preventDefault();
                  questionTurtleWindowCloseRef.current?.focus();
                }}
              >
                <header className="student-test-turtle-window__header">
                  <div className="student-test-turtle-window__title">
                    <span className="student-test-turtle-window__icon" aria-hidden="true">🐢</span>
                    <div>
                      <strong id="student-test-turtle-window-title">Turtle Graphics</strong>
                      <small>Рисунок из solution.py</small>
                    </div>
                  </div>
                  <div className="student-test-turtle-window__actions">
                    <button
                      type="button"
                      className="student-test-turtle-window__close student-test-turtle-window__fullscreen"
                      onClick={() => setQuestionTurtleWindowFullscreen((current) => !current)}
                      aria-pressed={questionTurtleWindowFullscreen}
                      aria-label={questionTurtleWindowFullscreen
                        ? 'Выйти из полноэкранного режима Turtle'
                        : 'Развернуть окно Turtle на весь экран'}
                      title={questionTurtleWindowFullscreen ? 'Свернуть окно' : 'На весь экран'}
                    >
                      {questionTurtleWindowFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                    <button
                      ref={questionTurtleWindowCloseRef}
                      type="button"
                      className="student-test-turtle-window__close"
                      onClick={() => closeQuestionTurtleWindow()}
                      aria-label="Закрыть окно Turtle"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </header>
                <div className="student-test-turtle-window__body">
                  <TurtleCanvas drawing={turtleWindowScene} />
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    ) : null;

    const modal = (
      <div className={studentTestBackdropClassName}>
        <div className={studentTestWorkspaceClassName} data-level={level} data-student-test-tour="workspace">
          <header className="student-test-header shrink-0" data-student-test-tour="header">
            <div className="flex min-w-0 items-center gap-3">
              <div className="student-test-header-icon hidden sm:flex">
                <ListChecks size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold uppercase ${LEVELS[level.toUpperCase()].color}`}>
                    {LEVELS[level.toUpperCase()].label}
                  </span>
                  {selectedLevelXpReward > 0 && (
                    <span className="student-test-xp-badge">
                      {selectedLevelXpRewardLabel}
                    </span>
                  )}
                </div>
                <h2 className="student-test-title mt-1.5 truncate">
                  Задание {getTaskDisplayNumber(task)}: {task.title}
                </h2>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <div className="student-test-progress-summary hidden sm:block">
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span>{quickHomeworkPlan.active ? quickHomeworkPlan.label : 'Выполнено'}</span>
                  <strong>{quickHomeworkPlan.active
                    ? `${quickHomeworkPlan.completed}/${quickHomeworkPlan.total}`
                    : `${solvedQuestionCount}/${questions.length}`}</strong>
                </div>
                <div className="student-test-progress-track mt-1.5">
                  <div
                    className="student-test-progress-fill"
                    style={{
                      width: `${quickHomeworkPlan.active
                        ? quickHomeworkPlan.percent
                        : completionPercent}%`,
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                className="student-test-tour-replay"
                onClick={() => setStudentTestTourRestartToken((current) => current + 1)}
                data-student-test-tour="replay"
                aria-label="Показать обучение по окну задания"
                title="Обучение по окну"
              >
                <GraduationCap size={18} aria-hidden="true" />
              </button>
              <button onClick={requestCloseStudentTest} className="student-test-close" type="button" aria-label="Закрыть">
                <X size={19}/>
              </button>
            </div>
          </header>

          <div className="student-test-navigation shrink-0" data-student-test-tour="question-navigation">
            <div className="flex items-center justify-between gap-3">
              <span className="student-test-question-caption">
                {quickHomeworkPlan.active
                  ? `Сейчас · вопрос №${currentQuestionNumber}`
                  : (targetNumbers.length > 0
                      ? `Вопрос №${currentQuestionNumber} · ${currentIndex + 1} из ${questions.length}`
                      : `Вопрос ${currentIndex + 1} из ${questions.length}`)}
              </span>
              {targetStatus.length > 0 ? (
                <span className="text-right text-[10px] font-semibold text-purple-600 sm:text-xs">
                  {quickHomeworkPlan.active
                    ? quickHomeworkPlan.progressLabel
                    : `Цель — решить выбранные задания · ${targetSolvedCount}/${targetStatus.length}`}
                </span>
              ) : (
                <span className="student-test-mobile-progress sm:hidden">
                  {solvedQuestionCount}/{questions.length} решено
                </span>
              )}
            </div>

            <div className="student-test-question-list mt-2 flex gap-2 overflow-x-auto">
              {questions.map((q, idx) => {
                const qId = String(q?.id ?? idx);
                const solved = solvedIds.has(qId);
                const status = results[idx];
                const isCurrent = idx === currentIndex;
                const hasDraft = hasStudentTestDraftValue(userAnswers[idx]);
                let btnClass = 'student-test-question-button ';

                if (isCurrent && (solved || status === true)) {
                  btnClass += 'is-current is-correct';
                } else if (isCurrent && status === false) {
                  btnClass += 'is-current is-wrong';
                } else if (isCurrent && hasDraft) {
                  btnClass += 'is-current is-draft';
                } else if (isCurrent) {
                  btnClass += 'is-current';
                } else if (solved || status === true) {
                  btnClass += 'is-correct';
                } else if (status === false) {
                  btnClass += 'is-wrong';
                } else if (hasDraft) {
                  btnClass += 'is-draft';
                }

                return (
                  <button
                    key={qId}
                    onClick={() => setCurrentIndex(idx)}
                    className={btnClass}
                    style={{ '--student-test-item-index': idx }}
                    title={
                      solved || status === true
                        ? `Вопрос №${questionNumbers[idx] ?? (idx + 1)} решён`
                        : hasDraft
                          ? `Вопрос №${questionNumbers[idx] ?? (idx + 1)}: ответ введён`
                          : `Вопрос №${questionNumbers[idx] ?? (idx + 1)}`
                    }
                    type="button"
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {solved || status === true
                      ? <Check size={14} strokeWidth={3} />
                      : (questionNumbers[idx] ?? (idx + 1))}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handlePreviousQuestion}
            disabled={currentIndex === 0}
            className={`student-test-side-nav student-test-side-nav--prev is-${previousQuestionSideNavState}`}
            aria-label={`Предыдущее задание. ${previousQuestionSideNavLabel}`}
            title={previousQuestionSideNavLabel}
          >
            <span className="student-test-side-nav__glow" aria-hidden="true" />
            <span className="student-test-side-nav__sheen" aria-hidden="true" />
            <ChevronLeft size={24} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={handleNextQuestion}
            disabled={currentIndex >= questions.length - 1}
            className={`student-test-side-nav student-test-side-nav--next is-${nextQuestionSideNavState}`}
            data-student-test-tour="side-navigation"
            aria-label={`Следующее задание. ${nextQuestionSideNavLabel}`}
            title={nextQuestionSideNavLabel}
          >
            <span className="student-test-side-nav__glow" aria-hidden="true" />
            <span className="student-test-side-nav__sheen" aria-hidden="true" />
            <ChevronRight size={24} strokeWidth={2.5} />
          </button>

          <div className="student-test-scroll flex-1 overflow-y-auto">
            <div key={`${level}:${currentId}`} className="student-test-content student-test-content--question-enter mx-auto w-full max-w-5xl">
            <section ref={questionPanelRef} className="student-test-question-panel student-test-panel-enter" data-student-test-tour="condition">
            <div className="student-test-question-panel__toolbar">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {currentMockExamSourceBadge && (
                  <span
                    className="inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-bold shadow-sm"
                    style={getQuestionLabelStyle(currentMockExamSourceBadge)}
                    title={currentMockExamSourceBadge.text}
                  >
                    <span className="truncate">{currentMockExamSourceBadge.text}</span>
                  </span>
                )}
                {currentQuestionLabel && (
                  <span
                    className="inline-flex max-w-full items-center rounded-full border px-3 py-1 text-xs font-bold shadow-sm"
                    style={getQuestionLabelStyle(currentQuestionLabel)}
                  >
                    <span className="truncate">{currentQuestionLabel.text}</span>
                  </span>
                )}
                <QuestionDifficultyBadge
                  difficulty={questionDifficultyById?.[currentId]}
                  theme={theme}
                  minimumSampleSize={QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE}
                />
                {!currentMockExamSourceBadge
                  && !currentQuestionLabel
                  && !hasEnoughQuestionDifficultyData(
                    questionDifficultyById?.[currentId],
                    QUESTION_DIFFICULTY_MIN_SAMPLE_SIZE
                  )
                  && <span aria-hidden="true" />}
              </div>
              <div className="student-test-question-panel__toolbar-actions" data-student-test-tour="code-tools">
                {typeof window !== 'undefined' && 'documentPictureInPicture' in window && (
                  <button
                    type="button"
                    className={`student-test-code-preview-trigger ${questionPictureInPictureOpen ? 'is-active' : ''}`}
                    onClick={questionPictureInPictureOpen
                      ? () => questionPictureInPictureWindowRef.current?.focus()
                      : openQuestionPictureInPicture}
                    aria-label={questionPictureInPictureOpen ? 'Задание уже открыто поверх окон' : 'Открыть задание поверх окон'}
                    title={questionPictureInPictureOpen ? 'Задание открыто поверх окон' : 'Открыть поверх окон'}
                  >
                    <PictureInPicture2 size={16} aria-hidden="true" />
                    <span>{questionPictureInPictureOpen ? 'Открыто поверх окон' : 'Поверх окон'}</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`student-test-code-preview-trigger ${questionCodePreviewOpen ? 'is-active' : ''}`}
                  onClick={handleToggleQuestionCodePreview}
                  data-student-test-tour="code-preview"
                  aria-expanded={questionCodePreviewOpen}
                  aria-controls="student-test-saved-code-preview"
                  aria-label={questionCodePreviewOpen ? 'Скрыть код решения' : 'Показать код решения'}
                  title={questionCodePreviewOpen ? 'Скрыть код' : 'Показать код'}
                >
                  <FileCode2 size={16} aria-hidden="true" />
                  <span>{questionCodePreviewOpen ? 'Скрыть код' : 'Показать код'}</span>
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="student-test-code-primary-trigger"
                  onClick={handleOpenQuestionCodeFocus}
                  data-student-test-tour="code-workspace"
                >
                  <Code2 size={16} aria-hidden="true" />
                  <span>Решать в коде</span>
                  <Maximize2 size={15} aria-hidden="true" />
                </button>
                {renderQuestionShareMenu('toolbar')}
              </div>
            </div>
            {screenshots.length > 0 && (
              <div className="space-y-2.5 md:space-y-3 mb-5 md:mb-6">
                {screenshots.map((img, imageIndex) => {
                  const imageKey = String(img.id || img.storageName || img.url || imageIndex);
                  const imageState = questionImageStateByKey[imageKey] || {};
                  const storedWidth = Number(img.width);
                  const storedHeight = Number(img.height);
                  const storedAspectRatio = storedWidth > 0 && storedHeight > 0
                    ? storedWidth / storedHeight
                    : null;
                  const measuredAspectRatio = Number(imageState.aspectRatio);
                  if (!questionImageFallbackAspectByKeyRef.current.has(imageKey)) {
                    questionImageFallbackAspectByKeyRef.current.set(
                      imageKey,
                      storedAspectRatio || lastQuestionImageAspectRef.current || 3.8
                    );
                  }
                  const fallbackAspectRatio = questionImageFallbackAspectByKeyRef.current.get(imageKey);
                  const rawAspectRatio = measuredAspectRatio > 0
                    ? measuredAspectRatio
                    : (storedAspectRatio || fallbackAspectRatio || 3.8);
                  const aspectRatio = Math.max(1.6, Math.min(5.8, rawAspectRatio));
                  return (
                    <div
                      key={imageKey}
                      className={`student-test-screenshot ${imageState.loaded ? 'is-loaded' : 'is-loading'} border rounded-2xl overflow-hidden max-h-[42vh] sm:max-h-[55vh] md:max-h-[65vh]`}
                      data-student-test-tour="condition-media"
                      style={{
                        '--student-test-item-index': imageIndex,
                        '--student-test-image-aspect': aspectRatio,
                      }}
                      aria-busy={!imageState.loaded}
                    >
                      <div
                        className="student-test-screenshot__loader"
                        aria-live="polite"
                        aria-hidden={Boolean(imageState.loaded)}
                      >
                        <RefreshCcw size={18} aria-hidden="true" />
                        <span>Загрузка изображения задания…</span>
                      </div>
                      <img
                        src={img.url}
                        alt={img.name || 'Скриншот'}
                        className="w-full object-contain cursor-zoom-in"
                        onLoad={(event) => {
                          const naturalWidth = Number(event.currentTarget.naturalWidth);
                          const naturalHeight = Number(event.currentTarget.naturalHeight);
                          const naturalAspectRatio = naturalWidth > 0 && naturalHeight > 0
                            ? Math.max(1.6, Math.min(5.8, naturalWidth / naturalHeight))
                            : aspectRatio;
                          lastQuestionImageAspectRef.current = naturalAspectRatio;
                          questionImageFallbackAspectByKeyRef.current.set(imageKey, naturalAspectRatio);
                          setQuestionImageStateByKey((prev) => ({
                            ...prev,
                            [imageKey]: {
                              loaded: true,
                              aspectRatio: naturalAspectRatio,
                            },
                          }));
                        }}
                        onError={() => {
                          setQuestionImageStateByKey((prev) => ({
                            ...prev,
                            [imageKey]: {
                              ...(prev?.[imageKey] || {}),
                              loaded: true,
                            },
                          }));
                        }}
                        onClick={() => setExpandedImage(img)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {extraFiles.length > 0 && (
              <div className="mb-5 md:mb-6">
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Доп. файлы</p>
                <div className="space-y-2">
                  {extraFiles.map((file, fileIndex) => {
                    const attachmentId = getTestAttachmentId(file);
                    const canSolve = canSolveTestWorkbook(task?.number, file);
                    const workbookSolutions = Array.isArray(questionWorkbookSolutions?.[attachmentId])
                      ? questionWorkbookSolutions[attachmentId]
                      : [];
                    const hasSolution = workbookSolutions.length > 0;
                    const isOpening = workbookHelperState.sourceFileId === attachmentId
                      && ['launching', 'opening'].includes(workbookHelperState.status);
                    return (
                      <div
                        key={attachmentId || file.url}
                        style={{ '--student-test-item-index': fileIndex }}
                        className={`student-test-file flex items-center gap-2 rounded-xl border px-2 py-2 text-sm ${
                          isQuestionCodeDarkTheme
                            ? 'border-slate-700 bg-slate-900 text-slate-100 hover:border-violet-500 hover:bg-slate-800'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-purple-300 hover:bg-purple-50'
                        }`}
                      >
                        <a
                          href={buildDownloadUrl(file.url)}
                          download={file?.name || undefined}
                          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1 py-1"
                        >
                          <span className="truncate">{file.name}</span>
                          <Download size={16} className="shrink-0 text-purple-600" />
                        </a>
                        {canSolve && (
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                            {workbookSolutions.map((solution) => (
                              <button
                                key={solution.fileId}
                                type="button"
                                onClick={() => void handleLaunchQuestionWorkbook(file, {
                                  solutionFileId: solution.fileId,
                                })}
                                disabled={isOpening}
                                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                                  isQuestionCodeDarkTheme
                                    ? 'border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20'
                                    : 'border-violet-200 bg-violet-50/80 text-violet-700 hover:bg-violet-100'
                                }`}
                              >
                                <FileSpreadsheet size={16} />
                                {isOpening && workbookHelperState.solutionFileId === solution.fileId
                                  ? 'Открываем…'
                                  : (workbookSolutions.length === 1 ? 'Продолжить' : `Решение ${solution.slot}`)}
                              </button>
                            ))}
                            {workbookSolutions.length < 3 && (
                              <button
                                type="button"
                                onClick={() => void handleLaunchQuestionWorkbook(file, { startFresh: true })}
                                disabled={isOpening}
                                title="Открыть чистый исходник и сохранить отдельным решением"
                                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
                                  isQuestionCodeDarkTheme
                                    ? 'border-slate-600 bg-slate-900 text-slate-300 hover:border-violet-500 hover:text-violet-200'
                                    : 'border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-700'
                                }`}
                              >
                                <RefreshCcw size={15} />
                                {isOpening && workbookHelperState.launchMode === 'fresh'
                                  ? 'Открываем…'
                                  : (hasSolution ? 'Решить заново' : 'Решать')}
                              </button>
                            )}
                            {workbookSolutions.length >= 3 && (
                              <span className="px-1 text-xs font-semibold text-slate-400">3 из 3</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {['fallback', 'error'].includes(workbookHelperState.status)
                  && extraFiles.some((file) => getTestAttachmentId(file) === workbookHelperState.sourceFileId) && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      Помощник не открылся?{' '}
                      <a className="underline underline-offset-2" href="/downloads/IvanEgeWorkbookHelper.exe" download>
                        Скачайте или обновите его
                      </a>
                      .
                    </div>
                  )}
              </div>
            )}

            {isSolved && (
              <div className="student-test-solved-label mb-2 text-xs font-semibold text-green-600 uppercase tracking-wide">Решено ранее</div>
            )}
            {currentQuestion.question && (
              <p className="student-test-question-text text-[15px] md:text-lg font-medium leading-relaxed text-gray-900 mb-5 md:mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
            )}
            </section>

            <section data-student-test-tour="answer" className={`student-test-answer-panel student-test-panel-enter space-y-3 ${
              computedChecked
                ? (computedCorrect ? 'student-test-answer-panel--correct' : 'student-test-answer-panel--wrong')
                : 'student-test-answer-panel--pending'
            }`}>
              <label className="block text-xs font-bold text-gray-400 uppercase">
                {isSolved ? 'Правильный ответ' : 'Ответ'}
              </label>
              {canPasteAnswerTable && (
                <div className="student-test-answer-paste-hint">
                  <strong>Можно вставить весь список сразу</strong>
                  <span>Скопируйте пары чисел, нажмите первую ячейку и вставьте через Ctrl+V. Каждая строка заполнит одну строку таблицы.</span>
                  <code>
                    1104293251 16691
                    <br />
                    1104315547 1669
                  </code>
                </div>
              )}
              {isSolved ? (
                answerCount > 1 ? (
                  answerCount === 20 ? (
                    <div className="grid grid-cols-[26px_1fr_1fr] md:grid-cols-[32px_1fr_1fr] gap-1.5 md:gap-2">
                      <div aria-hidden="true" />
                      <div className="px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Ответ 1</div>
                      <div className="px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Ответ 2</div>
                      {Array.from({ length: 10 }).map((_, rowIdx) => {
                        const leftIdx = rowIdx;
                        const rightIdx = rowIdx + 10;
                        return (
                          <React.Fragment key={`solved-answer-row-${rowIdx}`}>
                            <div className="flex items-center justify-center text-xs font-bold text-gray-500">
                              {rowIdx + 1}
                            </div>
                            <div
                              className="student-test-solved-answer w-full rounded-lg border border-green-200 bg-green-50 px-2.5 py-2 text-sm text-gray-800 md:px-3"
                              style={{ '--student-test-item-index': rowIdx * 2 }}
                            >
                              {answerValues[leftIdx] || '—'}
                            </div>
                            <div
                              className="student-test-solved-answer w-full rounded-lg border border-green-200 bg-green-50 px-2.5 py-2 text-sm text-gray-800 md:px-3"
                              style={{ '--student-test-item-index': (rowIdx * 2) + 1 }}
                            >
                              {answerValues[rightIdx] || '—'}
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Array.from({ length: answerCount }).map((_, idx) => (
                        <div key={`solved-answer-${idx}`} className="student-test-solved-answer space-y-1" style={{ '--student-test-item-index': idx }}>
                          <div className="text-xs font-semibold text-gray-500">Ответ {answerLabels[idx]}</div>
                          <div className="w-full px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-gray-800">
                            {answerValues[idx] ? answerValues[idx] : '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="student-test-solved-answer w-full px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-gray-800">
                    {answerValue ? answerValue : '—'}
                  </div>
                )
              ) : (
                answerCount > 1 ? (
                  Number(task?.number) === GAME_THEORY_TASK ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">19</label>
                        <input
                          type="text"
                          value={answerValues[0] ?? ''}
                          onPaste={(e) => handleAnswerInputPaste(e, 0)}
                          onChange={(e) => {
                            if (computedChecked) return;
                            const value = e.target.value;
                            setUserAnswers((prev) => {
                              const next = { ...prev };
                              const current = Array.isArray(next[currentIndex])
                                ? [...next[currentIndex]]
                                : Array.from({ length: answerCount }, () => '');
                              current[0] = value;
                              next[currentIndex] = current;
                              return next;
                            });
                          }}
                          placeholder="Ответ 19"
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                          disabled={computedChecked}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">20.1</label>
                          <input
                            type="text"
                            value={answerValues[1] ?? ''}
                            onPaste={(e) => handleAnswerInputPaste(e, 1)}
                            onChange={(e) => {
                              if (computedChecked) return;
                              const value = e.target.value;
                              setUserAnswers((prev) => {
                                const next = { ...prev };
                                const current = Array.isArray(next[currentIndex])
                                  ? [...next[currentIndex]]
                                  : Array.from({ length: answerCount }, () => '');
                                current[1] = value;
                                next[currentIndex] = current;
                                return next;
                              });
                            }}
                            placeholder="Ответ 20.1"
                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                            disabled={computedChecked}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">20.2</label>
                          <input
                            type="text"
                            value={answerValues[2] ?? ''}
                            onPaste={(e) => handleAnswerInputPaste(e, 2)}
                            onChange={(e) => {
                              if (computedChecked) return;
                              const value = e.target.value;
                              setUserAnswers((prev) => {
                                const next = { ...prev };
                                const current = Array.isArray(next[currentIndex])
                                  ? [...next[currentIndex]]
                                  : Array.from({ length: answerCount }, () => '');
                                current[2] = value;
                                next[currentIndex] = current;
                                return next;
                              });
                            }}
                            placeholder="Ответ 20.2"
                            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                            disabled={computedChecked}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">21</label>
                        <input
                          type="text"
                          value={answerValues[3] ?? ''}
                          onPaste={(e) => handleAnswerInputPaste(e, 3)}
                          onChange={(e) => {
                            if (computedChecked) return;
                            const value = e.target.value;
                            setUserAnswers((prev) => {
                              const next = { ...prev };
                              const current = Array.isArray(next[currentIndex])
                                ? [...next[currentIndex]]
                                : Array.from({ length: answerCount }, () => '');
                              current[3] = value;
                              next[currentIndex] = current;
                              return next;
                            });
                          }}
                          placeholder="Ответ 21"
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                          disabled={computedChecked}
                        />
                      </div>
                    </div>
                  ) : answerCount === 20 ? (
                    <div className="grid grid-cols-[26px_1fr_1fr] md:grid-cols-[32px_1fr_1fr] gap-1.5 md:gap-2">
                      {Array.from({ length: 10 }).map((_, rowIdx) => {
                        const leftIdx = rowIdx;
                        const rightIdx = rowIdx + 10;
                        return (
                          <React.Fragment key={rowIdx}>
                            <div className="flex items-center justify-center text-xs font-bold text-gray-500">
                              {rowIdx + 1}
                            </div>
                            <input
                              type="text"
                              value={answerValues[leftIdx] ?? ''}
                              onPaste={(e) => handleAnswerInputPaste(e, leftIdx)}
                              onChange={(e) => {
                                if (computedChecked) return;
                                const value = e.target.value;
                                setUserAnswers((prev) => {
                                  const next = { ...prev };
                                  const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                                  current[leftIdx] = value;
                                  next[currentIndex] = current;
                                  return next;
                                });
                              }}
                              placeholder="Ответ 1"
                              className="w-full px-2.5 md:px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                              disabled={computedChecked}
                            />
                            <input
                              type="text"
                              value={answerValues[rightIdx] ?? ''}
                              onPaste={(e) => handleAnswerInputPaste(e, rightIdx)}
                              onChange={(e) => {
                                if (computedChecked) return;
                                const value = e.target.value;
                                setUserAnswers((prev) => {
                                  const next = { ...prev };
                                  const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                                  current[rightIdx] = value;
                                  next[currentIndex] = current;
                                  return next;
                                });
                              }}
                              placeholder="Ответ 2"
                              className="w-full px-2.5 md:px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                              disabled={computedChecked}
                            />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Array.from({ length: answerCount }).map((_, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={answerValues[idx] ?? ''}
                          onPaste={(e) => handleAnswerInputPaste(e, idx)}
                          onChange={(e) => {
                            if (computedChecked) return;
                            const value = e.target.value;
                            setUserAnswers((prev) => {
                              const next = { ...prev };
                              const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                              current[idx] = value;
                              next[currentIndex] = current;
                              return next;
                            });
                          }}
                          placeholder={`Ответ ${idx + 1}`}
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                          disabled={computedChecked}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <input
                    type="text"
                    value={answerValue}
                    onChange={(e) => {
                      if (computedChecked) return;
                      setUserAnswers({ ...userAnswers, [currentIndex]: e.target.value });
                    }}
                    placeholder="Введите ответ..."
                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                    disabled={computedChecked}
                  />
                )
              )}
            <div className="student-test-answer-meta">
              {computedChecked && (
                <div className={`student-test-result-feedback text-sm ${computedCorrect ? 'is-correct text-green-600' : 'is-wrong text-red-600'}`}>
                  {computedCorrect ? 'Верно!' : 'Неверно'}
                </div>
              )}
              <details className="student-test-history" data-student-test-tour="history">
                <summary className="student-test-history-summary" aria-label="История ответов" title="История ответов">
                  <span className="student-test-history-summary__label">
                    <History size={14} className="student-test-history-icon" />
                    <span>История</span>
                  </span>
                  <span className="student-test-history-summary__count">
                    {answerHistoryLoading ? '...' : answerHistory.length}
                  </span>
                  <ChevronDown size={14} className="student-test-history-summary__chevron" aria-hidden="true" />
                </summary>
                <div className="student-test-history__content space-y-2">
                  {answerHistoryLoading ? (
                    <div className="text-xs text-gray-500">Загрузка...</div>
                  ) : answerHistoryLatestFirst.length > 0 ? (
                    answerHistoryLatestFirst.map((entry, idx) => {
                      const timeLabel = formatAnswerHistoryTime(entry.submittedAt);
                      return (
                        <div
                          key={entry.id || `${entry.submittedAt}-${idx}`}
                          className="student-test-history-entry rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs"
                          style={{ '--student-test-item-index': idx }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={`font-bold ${entry.correct ? 'text-green-600' : 'text-red-600'}`}>
                              {entry.correct ? 'Верно' : 'Неверно'}
                            </span>
                            {timeLabel && <span className="text-gray-400">{timeLabel}</span>}
                          </div>
                          <div className="mt-1 break-words font-mono text-[11px] leading-5 text-gray-700">
                            {formatAnswerHistoryValues(entry.answers)}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-gray-500">Попыток пока нет</div>
                  )}
                </div>
              </details>
            </div>
            </section>

            {questionCodePreviewOpen && (
              <div ref={questionCodePanelRef} className="student-test-code-panel student-test-panel-enter">
              <div className={`student-test-code-launch-card ${questionCodePreviewOpen ? 'is-preview-open' : ''}`}>
                <div className="student-test-code-launch-card__main">
                  <span className="student-test-code-launch-card__icon" aria-hidden="true">
                    <Code2 size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="student-test-code-launch-card__title">
                      Python workspace
                    </div>
                    <div className="student-test-code-launch-card__meta">
                      Вопрос №{currentQuestionNumber} · редактор и консоль
                    </div>
                  </div>
                </div>
                <div className="student-test-code-launch-card__actions">
                  <button
                    type="button"
                    onClick={handleToggleQuestionCodePreview}
                    className="student-test-code-launch-card__preview-toggle"
                    aria-expanded={questionCodePreviewOpen}
                    aria-controls="student-test-saved-code-preview"
                  >
                    <FileCode2 size={15} />
                    <span>{questionCodePreviewOpen ? 'Скрыть код' : 'Показать код'}</span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenQuestionCodeFocus}
                    className="student-test-code-launch-card__button"
                  >
                    <span>Решать в коде</span>
                    <Maximize2 size={16} />
                  </button>
                </div>
                {questionCodePreviewOpen && (
                  <div
                    id="student-test-saved-code-preview"
                    className="student-test-code-preview"
                    aria-label={`Сохранённый код для вопроса №${currentQuestionNumber}`}
                  >
                    <div className="student-test-code-preview__head">
                      <span className="student-test-code-preview__file">
                        <FileCode2 size={14} />
                        solution.py
                      </span>
                      <span className="student-test-code-preview__head-actions">
                        <span className="student-test-code-preview__status">
                          {questionCodeLoading
                            ? 'Загружаем…'
                            : (questionCodeSaving
                                ? 'Автосохранение…'
                                : (questionCodeAutoSavePending
                                    ? 'Сохраняем изменения…'
                                    : (questionCodeUpdatedAtLabel ? `Сохранено ${questionCodeUpdatedAtLabel}` : 'Новый черновик')))}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyQuestionCode}
                          className={`student-test-code-preview__copy ${questionCodeCopyState === 'copied' ? 'is-copied' : ''} ${questionCodeCopyState === 'error' ? 'is-error' : ''}`}
                          disabled={questionCodeLoading || !questionCodeEntry.code}
                          aria-label={questionCodeCopyState === 'copied' ? 'Код скопирован' : 'Скопировать код'}
                          title={questionCodeCopyState === 'copied' ? 'Скопировано' : 'Скопировать код'}
                        >
                          {questionCodeCopyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
                          <span>{questionCodeCopyState === 'copied' ? 'Скопировано' : (questionCodeCopyState === 'error' ? 'Не удалось' : 'Копировать')}</span>
                        </button>
                      </span>
                    </div>
                    {questionCodeLoading ? (
                      <div className="student-test-code-preview__message" role="status">
                        <RefreshCcw size={16} className="animate-spin" />
                        Загружаем сохранённый код…
                      </div>
                    ) : questionCodeError ? (
                      <div className="student-test-code-preview__message is-error" role="alert">
                        <AlertTriangle size={16} />
                        <span>{questionCodeError}</span>
                        <button type="button" onClick={() => loadQuestionCode(currentId, true)}>Повторить</button>
                      </div>
                    ) : (
                      <div className="student-test-code-preview__editor">
                        <Editor
                          height="clamp(360px, 48dvh, 520px)"
                          language="python"
                          theme={monacoTheme}
                          beforeMount={ensureMonacoColorTheme}
                          value={questionCodeEntry.code}
                          onChange={handleQuestionCodeChange}
                          options={questionCodePreviewEditorOptions}
                          loading={<div className="student-test-code-preview__message">Загрузка редактора…</div>}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>
            )}
          </div>
          </div>

          <footer className="student-test-footer shrink-0">
            <Button 
              onClick={(event) => {
                if (!computedChecked) {
                  handleCheckCurrentQuestion(event);
                  return;
                }
                if (!computedCorrect) {
                  clearCurrentQuestionResult();
                  return;
                }
                handleNext();
              }} 
              disabled={!computedChecked && !isAnswerReady} 
              data-student-test-tour="check"
              className={`student-test-primary-action h-11 flex-1 sm:flex-none sm:min-w-56 ${
                computedChecked
                  ? (computedCorrect ? 'is-correct' : 'is-wrong')
                  : (isAnswerReady ? 'is-ready' : 'is-disabled')
              }`}
              variant={computedChecked ? (computedCorrect ? 'success' : 'danger') : 'primary'}
            >
              {!computedChecked ? 'Проверить' : (
                currentIndex < questions.length - 1 
                  ? (computedCorrect ? 'Верно! Следующий вопрос' : 'Попробовать снова')
                  : 'Закрыть'
              )}
            </Button>
          </footer>
        </div>
        {codeFocusOverlay}
        <StudentTestWindowTour
          studentId={studentId}
          enabled={
            stage === 'testing'
            && Boolean(activeQuestion)
            && !studentTestClosing
            && !questionCodeOpen
            && !studentHelpOpen
            && !expandedImage
          }
          steps={STUDENT_TEST_WINDOW_TOUR_STEPS}
          restartToken={studentTestTourRestartToken}
        />
        {studentHelpOpen && (
          <div
            className={`student-help-modal${studentHelpClosing ? ' is-closing' : ' is-open'}`}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) handleCloseStudentHelp();
            }}
          >
            <form
              className={`student-help-modal__dialog${studentHelpResult ? ' is-success' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="student-help-title"
              onSubmit={handleSendStudentHelp}
              onKeyDown={handleStudentHelpDialogKeyDown}
            >
              <header className="student-help-modal__header">
                <div className="student-help-modal__heading">
                  <span className="student-help-modal__icon" aria-hidden="true">
                    <CircleHelp size={22} />
                  </span>
                  <div className="student-help-modal__heading-copy">
                    <p className="student-help-modal__eyebrow">Вопрос учителю</p>
                    <h2 id="student-help-title">Спросить учителя</h2>
                    {!studentHelpResult && (
                      <p className="student-help-modal__subtitle">
                        Опишите, где застряли — условие и текущий код приложатся сами.
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="student-help-modal__close"
                  onClick={handleCloseStudentHelp}
                  disabled={studentHelpSending}
                  aria-label="Закрыть"
                >
                  <X size={19} />
                </button>
              </header>

              {studentHelpResult ? (
                <div className="student-help-success" role="status">
                  <span className="student-help-success__icon" aria-hidden="true">
                    <CheckCircle2 size={30} />
                  </span>
                  <div className="student-help-success__copy">
                    <p className="student-help-success__eyebrow">Отправлено</p>
                    <h3>
                      {studentHelpResult.telegramDelivered
                        ? 'Вопрос уже в чате и Telegram'
                        : 'Вопрос уже в чате преподавателя'}
                    </h3>
                    <p>
                      {studentHelpResult.warning
                        || 'Преподаватель увидит условие, ваш вопрос и актуальный код. Ответ появится в разделе «Чаты».'}
                    </p>
                  </div>
                  {studentHelpResult.warning && (
                    <div className="student-help-success__warning">
                      <AlertTriangle size={16} aria-hidden="true" />
                      <span>История сохранена на платформе — вопрос не потерян.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="student-help-modal__body">
                  <div className="student-help-context">
                    <span className="student-help-context__icon" aria-hidden="true">
                      <ListChecks size={17} />
                    </span>
                    <div className="student-help-context__main">
                      <strong>Задание №{getTaskDisplayNumber(task)} · Вопрос №{currentQuestionNumber}</strong>
                      <small>{task?.title || currentQuestionLabel?.text || 'Задание'}</small>
                    </div>
                    <span className="student-help-context__badge">Текущий вопрос</span>
                  </div>

                  <div className="student-help-composer">
                    <label className="student-help-field">
                      <span className="student-help-field__label">
                        <strong>Что именно не получается?</strong>
                        <small>{studentHelpQuestion.length ? `${studentHelpQuestion.length}/1200` : 'Можно коротко'}</small>
                      </span>
                      <textarea
                        autoFocus
                        value={studentHelpQuestion}
                        onChange={handleStudentHelpQuestionChange}
                        maxLength={1200}
                        rows={6}
                        placeholder="Опишите, где запутались. Например: не понимаю, как сопоставить вершины графа с таблицей."
                        disabled={studentHelpSending}
                      />
                    </label>

                    <div className="student-help-prompts" aria-label="Быстрые подсказки">
                      <span className="student-help-prompts__label">Быстрый старт</span>
                      {['Не понимаю условие.', 'Не сходится ответ.', 'Не могу найти ошибку в коде.'].map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => handleStudentHelpPrompt(prompt)}
                          disabled={studentHelpSending}
                        >
                          {prompt.replace(/\.$/, '')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <section className={`student-help-solution${studentHelpSolutionImage ? ' has-image' : ''}`}>
                    <input
                      ref={studentHelpSolutionInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="student-help-solution__input"
                      onChange={handleStudentHelpSolutionImageChange}
                      disabled={studentHelpSending}
                      tabIndex={-1}
                      aria-hidden="true"
                    />
                    {studentHelpSolutionImage ? (
                      <>
                        <button
                          type="button"
                          className="student-help-solution__preview"
                          onClick={() => setExpandedImage(studentHelpSolutionImage.dataUrl)}
                          aria-label="Открыть прикреплённое решение"
                        >
                          <img src={studentHelpSolutionImage.dataUrl} alt="Решение ученика" />
                        </button>
                        <span className="student-help-solution__copy">
                          <strong>Ваше решение приложено</strong>
                          <small>
                            {[studentHelpSolutionImage.name, formatStudentHelpImageSize(studentHelpSolutionImage.size)]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </span>
                        <span className="student-help-solution__actions">
                          <button
                            type="button"
                            onClick={() => studentHelpSolutionInputRef.current?.click()}
                            disabled={studentHelpSending}
                          >
                            Заменить
                          </button>
                          <button
                            type="button"
                            className="is-remove"
                            onClick={handleRemoveStudentHelpSolutionImage}
                            disabled={studentHelpSending}
                            aria-label="Удалить изображение решения"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="student-help-solution__empty"
                        onClick={() => studentHelpSolutionInputRef.current?.click()}
                        disabled={studentHelpSending}
                      >
                        <span className="student-help-solution__icon"><Image size={17} /></span>
                        <span>
                          <strong>Прикрепить своё решение</strong>
                          <small>Необязательно · PNG, JPG или WebP до 5 МБ</small>
                        </span>
                        <span className="student-help-solution__add">Добавить</span>
                      </button>
                    )}
                  </section>

                  <div className="student-help-route-summary">
                    <div className="student-help-bundle" aria-label="Что приложится к вопросу">
                      <span className="student-help-bundle__label">Учитель увидит</span>
                      <span className="student-help-bundle__chip">
                        <Image size={14} aria-hidden="true" />
                        {screenshots.length > 1 ? `Условие · ${screenshots.length} части` : 'Условие'}
                      </span>
                      {(questionCodeLoading || studentHelpPreparingCode) && (
                        <span className="student-help-bundle__chip is-loading">
                          <RefreshCcw size={13} className="student-help-spin" aria-hidden="true" />
                          Код загружается
                        </span>
                      )}
                      {!questionCodeLoading && !studentHelpPreparingCode && questionCodeEntry.code.trim() && (
                        <span className="student-help-bundle__chip">
                          <FileCode2 size={14} aria-hidden="true" />
                          Код
                        </span>
                      )}
                      {studentHelpSolutionImage && (
                        <span className="student-help-bundle__chip is-solution">
                          <Image size={14} aria-hidden="true" />
                          Решение
                        </span>
                      )}
                    </div>

                    <div className="student-help-delivery">
                      <span className="student-help-delivery__icon"><Send size={15} aria-hidden="true" /></span>
                      <span>
                        <strong>
                          {studentHelpChannel === 'telegram' && studentHelpChannels?.telegram?.available === true
                            ? 'Чат платформы + Telegram'
                            : 'Ответ придёт в «Чаты»'}
                        </strong>
                        <small>Учитель получит уведомление о вопросе</small>
                      </span>
                      {studentHelpChannelsLoading && (
                        <RefreshCcw size={14} className="student-help-spin" aria-label="Проверяем Telegram" />
                      )}
                    </div>
                  </div>

                  {studentHelpChannels?.telegram?.available === true ? (
                    <section className="student-help-channels" aria-label="Способ отправки">
                      <div className="student-help-section-title">
                        <span>Отправить через</span>
                        <small>Вопрос в любом случае сохранится в чате</small>
                      </div>
                      <div className="student-help-channel-switch">
                        <button
                          type="button"
                          className={studentHelpChannel === 'platform' ? 'is-selected' : ''}
                          onClick={() => handleStudentHelpChannelChange('platform')}
                          disabled={studentHelpSending}
                          aria-pressed={studentHelpChannel === 'platform'}
                        >
                          Чат платформы
                        </button>
                        <button
                          type="button"
                          className={studentHelpChannel === 'telegram' ? 'is-selected' : ''}
                          onClick={() => handleStudentHelpChannelChange('telegram')}
                          disabled={studentHelpSending}
                          aria-pressed={studentHelpChannel === 'telegram'}
                        >
                          Чат + Telegram
                        </button>
                      </div>
                    </section>
                  ) : null}

                  {studentHelpError && (
                    <div className="student-help-error" role="alert">
                      <AlertTriangle size={17} aria-hidden="true" />
                      <span>{studentHelpError}</span>
                    </div>
                  )}
                </div>
              )}

              <footer className="student-help-modal__footer">
                {studentHelpResult ? (
                  <button
                    ref={studentHelpSuccessActionRef}
                    type="button"
                    className="student-help-submit"
                    onClick={handleCloseStudentHelp}
                  >
                    <Check size={18} aria-hidden="true" />
                    Продолжить решать
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="student-help-cancel"
                      onClick={handleCloseStudentHelp}
                      disabled={studentHelpSending}
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="student-help-submit"
                      disabled={studentHelpSending || (studentHelpChannel === 'telegram' && studentHelpChannelsLoading) || studentHelpQuestion.trim().length < 3}
                    >
                      {studentHelpSending ? (
                        <RefreshCcw size={17} className="student-help-spin" aria-hidden="true" />
                      ) : (
                        <Send size={17} aria-hidden="true" />
                      )}
                      {studentHelpSending
                        ? 'Собираем и отправляем…'
                        : (studentHelpChannel === 'telegram' ? 'Отправить в чат + Telegram' : 'Отправить вопрос')}
                    </button>
                  </>
                )}
              </footer>
            </form>
          </div>
        )}
        {expandedImage && typeof document !== 'undefined' && createPortal((
          <div
            className="student-test-image-lightbox fixed inset-0 z-[80] bg-black/80 modal-backdrop flex items-center justify-center p-4"
            onClick={() => setExpandedImage(null)}
          >
            <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
              <img
                src={expandedImage.url}
                alt={expandedImage.name || 'Скриншот'}
                className="student-test-image-lightbox__image w-full h-full object-contain rounded-2xl shadow-2xl"
                style={{ maxHeight: '95vh' }}
              />
              <button
                onClick={() => setExpandedImage(null)}
                className="absolute top-3 right-3 p-2 rounded-full bg-white/90 hover:bg-white"
                type="button"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        ), questionCodeFullscreenPortalTarget || document.body)}
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
  }
  
  return null;
};

/**
 * PAGE COMPONENTS (Updated Login & Progress)
 */



export default StudentTestModal;

