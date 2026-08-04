import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { createPortal, flushSync } from 'react-dom';
import Editor from '@monaco-editor/react';
import ImageViewer from './ImageViewer';
import StudentSearchSelect from './StudentSearchSelect';
import { api, authenticatedUploadsFetch } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from '../utils/monacoTheme';
import {
  LESSON_SHARED_SCOPE,
  LESSON_SHARE_MODE_COMMON,
  LESSON_SHARE_MODE_PRIVATE,
  LESSON_SHARE_MODE_TEMPLATE,
  getNotesLessonShareMode,
  isNotesCommonSharedFile,
  isNotesLessonSharedFile,
  isNotesSharedTemplateFile,
} from '../utils/notesSharing';
import { PythonLogoIcon } from './Identity';
import { Button, Card } from './ui';

const mergeFolderLists = (lists) => {
  const merged = [];
  const seen = new Set();
  for (const list of lists || []) {
    for (const folder of list || []) {
      if (!folder?.id || seen.has(folder.id)) continue;
      seen.add(folder.id);
      merged.push(folder);
    }
  }
  return merged;
};
const AUTO_REFRESH_INTERVAL_MS = 5000;
const WORKBOOK_HELPER_TASK_NUMBERS = new Set([3, 9, 10, 12, 13, 18, 19, 20, 21, 22, 26]);
const DEFAULT_NOTES_CATEGORY = 'class';
const ROOT_FOLDER_LABEL = 'Материалы задания';
const NOTES_PREVIEW_CLOSE_MS = 200;
const NOTES_FOLDER_CREATOR_ID = 'notes-folder-creator-panel';
const NOTES_PYTHON_CREATOR_ID = 'notes-python-creator-panel';
const isLessonSharedFile = isNotesLessonSharedFile;
const isSharedTemplateFile = isNotesSharedTemplateFile;
const isCommonLessonSharedFile = isNotesCommonSharedFile;
const getLessonShareMode = getNotesLessonShareMode;
const NOTES_VIEW_TRANSITION_ENTRY_ANIMATIONS = new Set([
  'notesMotionViewIn',
  'notesMotionHeroIn',
  'notesMotionContentIn',
  'notesLandingCardIn',
  'notesProgressReveal',
  'notesProgressSheen',
  'notesWorkspaceIn',
  'notesHeroAccentIn',
  'notesInlinePanelIn',
  'notesLibraryIn',
  'notesResourceRowIn',
]);
const getNotesMotionDuration = (durationMs) => {
  if (typeof window === 'undefined' || !window.matchMedia) return durationMs;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : durationMs;
};

const formatFileAddedAt = (file) => {
  const createdAt = String(file?.createdAt || '').trim();
  if (createdAt) {
    const date = new Date(createdAt);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
  return String(file?.date || '').trim();
};

const getFileMemorySourceLabel = (source) => {
  const normalized = String(source || '').trim();
  if (normalized === 'collab-code') return 'Совместный код';
  if (normalized === 'notes-python') return 'Python-файл';
  if (normalized === 'notes-cheatsheet') return 'Шпаргалка';
  if (normalized === 'board-save') return 'Доска';
  if (normalized === 'notes-upload') return 'Загрузка';
  return normalized || 'Файл';
};

const getFileMemoryRunLabel = (memory) => {
  if (!memory || typeof memory?.lastRunHadError !== 'boolean') return '';
  return memory.lastRunHadError ? 'Был запуск с ошибкой' : 'Запуск без ошибок';
};

const getSavedSolutionTitle = (file, memory) => {
  const memoryTitle = String(memory?.title || '').trim();
  const rawName = memoryTitle || String(file?.name || '').trim();
  const withoutExtension = rawName.replace(/\.[^.\\/]+$/i, '').trim();
  const withoutPrefix = withoutExtension.replace(/^(конспект|шпаргалка)[-_\s]*/i, '').trim();
  return withoutPrefix || withoutExtension || rawName || 'Задание и решение';
};

const getCodePreviewText = (value, loading = false) => {
  const code = String(value || '').trim();
  if (code) return code.split(/\r?\n/).slice(0, 8).join('\n');
  return loading ? 'Загрузка кода...' : 'Код появится после раскрытия.';
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getHighlightedPythonLines = (value, highlighter) => {
  const code = String(value ?? '');
  const highlighted = typeof highlighter === 'function' ? highlighter(code) : escapeHtml(code);
  return highlighted.split(/\r?\n/);
};

const buildCodeMemoryPreview = (value) => {
  const code = String(value || '').trim();
  if (!code) return '';
  const hints = [];
  const addHint = (hint) => {
    if (hint && !hints.includes(hint)) hints.push(hint);
  };
  const forRangeMatch = code.match(/\bfor\s+([A-Za-z_]\w*)\s+in\s+range\s*\(/);
  if (forRangeMatch) addHint(`Перебор ${forRangeMatch[1]}`);
  else if (/^\s*for\s+/m.test(code)) addHint('Перебор');
  else if (/^\s*while\s+/m.test(code)) addHint('Цикл while');
  const binMatch = code.match(/\bbin\s*\(\s*([^)]+?)\s*\)\s*\[\s*2\s*:\s*\]/);
  if (binMatch) addHint(`bin(${binMatch[1].trim()})[2:]`);
  if (/\bcount\s*\(/.test(code)) addHint('count(...)');
  const intBaseTwoMatch = code.match(/\bint\s*\(\s*([^,\n]+?)\s*,\s*2\s*\)/);
  if (intBaseTwoMatch) addHint(`int(${intBaseTwoMatch[1].trim()}, 2)`);
  if (/^\s*if\s+.+:\s*$/m.test(code)) addHint('проверка условия');
  if (/^\s*break\b/m.test(code)) addHint('поиск минимального N');
  else if (/\bprint\s*\(/.test(code)) addHint('вывод ответа');
  if (hints.length >= 3) return hints.slice(0, 5).join(' + ');

  const lines = code
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !line.startsWith('#'));
  if (!lines.length) return '';
  const picks = [];
  const addFirst = (matcher) => {
    const found = lines.find((line) => matcher.test(line));
    if (found && !picks.includes(found)) picks.push(found);
  };
  addFirst(/\bopen\s*\(/);
  addFirst(/^(for|while)\s+/);
  addFirst(/^if\s+/);
  addFirst(/\b(print|return)\s*\(?/);
  if (!picks.length) picks.push(...lines.slice(0, 3));
  const preview = picks.slice(0, 4).join(' · ');
  return preview.length > 220 ? `${preview.slice(0, 217).trimEnd()}...` : preview;
};

const getCodeInlinePreviewText = (value, loading = false) => (
  buildCodeMemoryPreview(value) || (loading ? 'Готовлю выжимку кода...' : 'Выжимка кода появится через секунду')
);

const isFileMemoryPinned = (memory) => Boolean(
  memory?.isPinned || memory?.pinned || memory?.favorite || memory?.starred
);

const isPythonFileName = (name) => /\.py$/i.test(String(name || ''));

const getFileMemoryPinnedAt = (memory) => {
  const raw = String(memory?.pinnedAt || '').trim();
  if (!raw) return 0;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const formatRussianCountLabel = (count, one, few, many) => {
  const value = Math.abs(Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
};

const CodeCopyButton = ({
  copied = false,
  disabled = false,
  onCopy,
  className = '',
  compact = false,
}) => (
  <Button
    variant="secondary"
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      onCopy?.();
    }}
    disabled={disabled}
    className={`notes-code-copy-button ${copied ? 'is-copied' : ''} ${compact ? 'is-compact' : ''} ${className}`}
    title={copied ? 'Код скопирован' : 'Скопировать код'}
    aria-label={copied ? 'Код скопирован' : 'Скопировать код'}
  >
    {copied ? (
      <Check size={14} strokeWidth={2.6} />
    ) : (
      <Copy size={14} strokeWidth={2.3} />
    )}
    {!compact && <span>{copied ? 'Скопировано' : 'Скопировать код'}</span>}
  </Button>
);

const NotesSection = ({
  theme = '',
  role,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  initialLocation,
  initialLocationKey = 0,
  onLocationChange,
  withStudentId,
  MOCK_TASKS,
  normalizeTaskNumber,
  GAME_THEORY_TASK,
  getEntrySizeBytes,
  MAX_TASK_BYTES,
  MAX_LESSON_SHARED_TASK_BYTES,
  mergeRuntimeErrorText,
  createPyodideWorker,
  ensurePyodideReady,
  PYODIDE_RUN_TIMEOUT_MS,
  ALLOW_MAIN_THREAD_PYTHON_FALLBACK,
  getTaskDisplayNumber,
  formatTaskNumber,
  buildIdleConsoleText,
  formatBytes,
  PY_IDLE_STDIN_HEADER,
  parseIdleConsoleInput,
  highlightPython,
  workbookAutoSyncState = null,
  onStartWorkbookAutoSync = null,
  workbookHelperState = null,
  onLaunchWorkbookHelper = null,
}) => {
  const [currentTask, setCurrentTask] = useState(null);
  const [transitionTaskNumber, setTransitionTaskNumber] = useState(null);
  const monacoTheme = resolveMonacoColorTheme(theme);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [files, setFiles] = useState([]);
  const [filesError, setFilesError] = useState('');
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [workbookAutoSyncStartingId, setWorkbookAutoSyncStartingId] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [folders, setFolders] = useState([]);
  const [foldersError, setFoldersError] = useState('');
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [pressingFolderId, setPressingFolderId] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState({});
  const [renamingId, setRenamingId] = useState(null);
  const [renameBase, setRenameBase] = useState('');
  const [renameExt, setRenameExt] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [_draggingFileId, setDraggingFileId] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [selectedFileIds, setSelectedFileIds] = useState({});
  const [expandedPyIds, setExpandedPyIds] = useState({});
  const [expandedPdfIds, setExpandedPdfIds] = useState({});
  const [expandedImageIds, setExpandedImageIds] = useState({});
  const [expandedTextIds, setExpandedTextIds] = useState({});
  const [collapsingSolutionIds, setCollapsingSolutionIds] = useState({});
  const [pinningFileIds, setPinningFileIds] = useState({});
  const [favoriteMotionIds, setFavoriteMotionIds] = useState({});
  const [favoriteFlightTick, setFavoriteFlightTick] = useState(0);
  const [pyContent, setPyContent] = useState({});
  const [pyError, setPyError] = useState({});
  const [pyLoadingId, setPyLoadingId] = useState(null);
  const [editingPyId, setEditingPyId] = useState(null);
  const [pyEditDraft, setPyEditDraft] = useState('');
  const [pyEditSaving, setPyEditSaving] = useState(false);
  const [pyEditError, setPyEditError] = useState('');
  const [pyRunInput, setPyRunInput] = useState('');
  const [pyRunOutput, setPyRunOutput] = useState('');
  const [pyRunError, setPyRunError] = useState('');
  const [pyRunLoading, setPyRunLoading] = useState(false);
  const [codeCopyFeedback, setCodeCopyFeedback] = useState(null);
  const [solutionHoverPreview, setSolutionHoverPreview] = useState(null);
  const [showPyCreator, setShowPyCreator] = useState(false);
  const [pyDraftName, setPyDraftName] = useState('');
  const [pyDraftCode, setPyDraftCode] = useState('');
  const [pyDraftError, setPyDraftError] = useState('');
  const [pyDraftSaving, setPyDraftSaving] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [contentSearchFocus, setContentSearchFocus] = useState(null);
  const [_showMobileFolderTools, setShowMobileFolderTools] = useState(false);
  const restoringRef = useRef(false);
  const skipNullSaveRef = useRef(true);
  const pendingFolderIdRef = useRef(null);
  const pendingFileIdRef = useRef(null);
  const pendingContentQueryRef = useRef('');
  const folderRestoreTargetRef = useRef(null);
  const initializedStudentKeyRef = useRef('');
  const dragDepthRef = useRef(0);
  const folderPressTimeoutRef = useRef(null);
  const solutionCollapseTimersRef = useRef(new Map());
  const favoriteMotionTimersRef = useRef(new Map());
  const fileRowRefs = useRef(new Map());
  const lastFileRowRectsRef = useRef(new Map());
  const favoriteFlightIdsRef = useRef(new Set());
  const taskBackButtonRef = useRef(null);
  const fileRef = useRef(null);
  const pyRunnerWorkerRef = useRef(null);
  const pyRunnerPendingRef = useRef(new Map());
  const editingPyIdRef = useRef(null);
  const copyFeedbackTimerRef = useRef(null);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const getFileUrl = (file) => withStudentId(file?.url, effectiveStudentId);
  const getMemorySnapshotUrl = (file) => withStudentId(file?.memory?.boardSnapshot?.url, effectiveStudentId);
  const runNotesViewTransition = useCallback((update) => {
    if (typeof update !== 'function') return null;
    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
      update();
      return null;
    }
    try {
      const transition = document.startViewTransition(() => {
        flushSync(update);
        const notesRoot = document.querySelector('[data-tour="notes"]');
        notesRoot?.getAnimations?.({ subtree: true }).forEach((animation) => {
          if (!NOTES_VIEW_TRANSITION_ENTRY_ANIMATIONS.has(animation.animationName)) return;
          try {
            animation.finish();
          } catch {
            // An animation can already be idle when the browser captures the new state.
          }
        });
      });
      transition?.finished?.catch?.(() => {});
      return transition;
    } catch {
      update();
      return null;
    }
  }, []);
  const restoreNotesFocus = useCallback((transition, getTarget) => {
    const focusTarget = () => {
      const schedule = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? (callback) => window.requestAnimationFrame(callback)
        : (callback) => setTimeout(callback, 0);
      schedule(() => {
        const target = typeof getTarget === 'function' ? getTarget() : getTarget?.current;
        target?.focus?.({ preventScroll: true });
      });
    };
    const updateDone = transition?.updateCallbackDone;
    if (updateDone?.then) updateDone.then(focusTarget, focusTarget);
    else focusTarget();
  }, []);
  const clearFolderMotionTimers = () => {
    if (folderPressTimeoutRef.current) {
      clearTimeout(folderPressTimeoutRef.current);
      folderPressTimeoutRef.current = null;
    }
  };
  const clearSolutionCollapseTimer = (fileId) => {
    const key = String(fileId || '').trim();
    if (!key) return;
    const timer = solutionCollapseTimersRef.current.get(key);
    if (timer) clearTimeout(timer);
    solutionCollapseTimersRef.current.delete(key);
  };
  const clearAllSolutionCollapseTimers = () => {
    solutionCollapseTimersRef.current.forEach((timer) => clearTimeout(timer));
    solutionCollapseTimersRef.current.clear();
  };
  const clearFavoriteMotionTimer = (fileId) => {
    const key = String(fileId || '').trim();
    if (!key) return;
    const timer = favoriteMotionTimersRef.current.get(key);
    if (timer) clearTimeout(timer);
    favoriteMotionTimersRef.current.delete(key);
  };
  const clearAllFavoriteMotionTimers = () => {
    favoriteMotionTimersRef.current.forEach((timer) => clearTimeout(timer));
    favoriteMotionTimersRef.current.clear();
  };
  const clearCopyFeedbackTimer = () => {
    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
  };
  const writeTextToClipboard = async (text) => {
    const value = String(text || '');
    if (!value) return false;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (err) {
        console.warn('[notes] clipboard api failed, using fallback', err);
      }
    }
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  };
  const showCodeCopyFeedback = (fileId, status, message) => {
    const key = String(fileId || '').trim();
    clearCopyFeedbackTimer();
    setCodeCopyFeedback({ fileId: key, status, message });
    copyFeedbackTimerRef.current = setTimeout(() => {
      copyFeedbackTimerRef.current = null;
      setCodeCopyFeedback((current) => (current?.fileId === key ? null : current));
    }, 1800);
  };
  const handleCopyCode = async (file, suppliedCode) => {
    const key = String(file?.id || '').trim();
    if (!key) return;
    try {
      const loadedCode = suppliedCode === undefined
        ? await loadPyFileContent(file)
        : suppliedCode;
      const text = String(loadedCode ?? '');
      if (!text.trim()) {
        showCodeCopyFeedback(key, 'error', 'В файле нет кода');
        return;
      }
      const copied = await writeTextToClipboard(text);
      if (!copied) throw new Error('copy failed');
      showCodeCopyFeedback(key, 'success', 'Код скопирован');
    } catch (err) {
      console.error(err);
      showCodeCopyFeedback(key, 'error', 'Не удалось скопировать код');
    }
  };
  const triggerFavoriteMotion = (fileId, motion) => {
    const key = String(fileId || '').trim();
    if (!key) return;
    clearFavoriteMotionTimer(key);
    setFavoriteMotionIds((prev) => ({ ...(prev || {}), [key]: motion }));
    const timer = setTimeout(() => {
      favoriteMotionTimersRef.current.delete(key);
      setFavoriteMotionIds((prev) => {
        if (!prev?.[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 780);
    favoriteMotionTimersRef.current.set(key, timer);
  };
  const setFileRowRef = (fileId, node) => {
    const key = String(fileId || '').trim();
    if (!key) return;
    if (node) fileRowRefs.current.set(key, node);
    else fileRowRefs.current.delete(key);
  };
  const captureFileRowRects = () => {
    const rects = new Map();
    fileRowRefs.current.forEach((node, key) => {
      if (!node?.isConnected) return;
      rects.set(key, node.getBoundingClientRect());
    });
    lastFileRowRectsRef.current = rects;
  };
  const selectFolder = (folderId) => {
    clearFolderMotionTimers();
    setSelectedFolderId(null);
    setPressingFolderId(null);
    pendingFolderIdRef.current = null;
    folderRestoreTargetRef.current = null;
    restoringRef.current = false;
    setCurrentFolderId(folderId || null);
  };
  const startFolderPressFeedback = (folderId) => {
    if (!folderId) return;
    if (folderPressTimeoutRef.current) clearTimeout(folderPressTimeoutRef.current);
    setPressingFolderId(folderId);
    folderPressTimeoutRef.current = setTimeout(() => {
      setPressingFolderId((current) => (current === folderId ? null : current));
      folderPressTimeoutRef.current = null;
    }, getNotesMotionDuration(90));
  };
  const openFolderWithAnimation = (folderId) => {
    selectFolder(folderId || null);
  };

  const taskOptions = MOCK_TASKS;
  const normalizedCurrentTask = normalizeTaskNumber(currentTask);
  const LESSON_SHARED_FOLDER_NAME = 'файлы к уроку';
  const getNotesTaskNumber = (value) => normalizeTaskNumber(value);
  const getNotesTaskNumbers = (value) => {
    const normalized = normalizeTaskNumber(value);
    if (!Number.isFinite(normalized)) return [];
    if (normalized === GAME_THEORY_TASK) return [19, 20, 21];
    return [normalized];
  };
  const isLessonSharedFolder = (entry) => {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.isLessonShared === true) return true;
    return String(entry.name || '').trim().toLowerCase() === LESSON_SHARED_FOLDER_NAME;
  };
  const isSavedSolutionBundleFile = (file) => {
    const memory = file?.memory && typeof file.memory === 'object' ? file.memory : null;
    const sourceRaw = String(memory?.source || file?.source || '').trim();
    return isPythonFileName(file?.name) && (sourceRaw === 'collab-code' || Boolean(memory?.boardSnapshot?.url));
  };
  const isCheatsheetFile = (file) => {
    const memory = file?.memory && typeof file.memory === 'object' ? file.memory : null;
    const sourceRaw = String(memory?.source || file?.source || '').trim();
    const kindRaw = String(memory?.kind || '').trim();
    return isPythonFileName(file?.name) && (sourceRaw === 'notes-cheatsheet' || kindRaw === 'cheatsheet');
  };
  const isImportantFile = (file) => (
    !isLessonSharedFile(file) && isFileMemoryPinned(file?.memory)
  );
  const normalizeParentFolderId = (value) => {
    const id = typeof value === 'string' ? value.trim() : '';
    return id || null;
  };

  useEffect(() => {
    editingPyIdRef.current = editingPyId;
  }, [editingPyId]);

  useEffect(() => () => {
    clearFolderMotionTimers();
    clearCopyFeedbackTimer();
  }, []);

  useEffect(() => {
    const studentKey = effectiveStudentId ? String(effectiveStudentId) : '';
    const restoreKey = `${studentKey}:${String(initialLocationKey)}`;
    if (initializedStudentKeyRef.current === restoreKey) return;
    initializedStudentKeyRef.current = restoreKey;

    const entry = initialLocation && typeof initialLocation === 'object' ? initialLocation : null;
    const canUseSavedLocation = Boolean(studentKey)
      && (!entry?.studentId || String(entry.studentId) === studentKey);
    const normalizedTask = canUseSavedLocation ? normalizeTaskNumber(entry?.taskNumber) : null;
    const nextTask = Number.isFinite(normalizedTask) ? normalizedTask : null;
    const nextCategory = nextTask ? (entry?.category || DEFAULT_NOTES_CATEGORY) : null;
    const nextFolderId = nextTask ? (entry?.folderId || null) : null;
    const nextFileId = nextTask ? String(entry?.fileId || '').trim() : '';
    const nextContentQuery = nextFileId ? String(entry?.searchQuery || '').trim() : '';

    restoringRef.current = Boolean(nextFolderId);
    pendingFolderIdRef.current = nextFolderId;
    pendingFileIdRef.current = nextFileId || null;
    pendingContentQueryRef.current = nextContentQuery;
    folderRestoreTargetRef.current = null;
    skipNullSaveRef.current = true;
    setCurrentTask(nextTask);
    setCurrentCategory(nextCategory);
    setCurrentFolderId(null);
    setFolders([]);
    setFoldersLoaded(false);
    setFiles([]);
    setContentSearchFocus(null);
    setSelectedFolderId(null);
    setPressingFolderId(null);
    setSelectedFileIds({});
    setExpandedPyIds({});
    setExpandedPdfIds({});
    setExpandedImageIds({});
    setExpandedTextIds({});
    setPinningFileIds({});
    setDeletingFolderId(null);
    setEditingPyId(null);
    setPyEditDraft('');
    setPyEditSaving(false);
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
    setShowPyCreator(false);
    setPyDraftName('');
    setPyDraftCode('');
    setPyDraftError('');
    setPyDraftSaving(false);
    setShowMobileFolderTools(false);
  }, [effectiveStudentId, initialLocation, initialLocationKey, normalizeTaskNumber]);
  const taskCounts = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      const normalizedTask = getNotesTaskNumber(f?.taskNumber);
      if (!Number.isFinite(normalizedTask)) continue;
      map.set(normalizedTask, (map.get(normalizedTask) || 0) + 1);
    }
    return map;
  }, [files]);

  const taskUsageByNumber = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      if (isLessonSharedFile(f)) continue;
      const taskNum = Number(f?.taskNumber);
      if (!Number.isFinite(taskNum)) continue;
      map.set(taskNum, (map.get(taskNum) || 0) + getEntrySizeBytes(f));
    }
    return map;
  }, [files]);

  const sharedTaskUsageByNumber = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      if (!isLessonSharedFile(f)) continue;
      const taskNum = Number(f?.taskNumber);
      if (!Number.isFinite(taskNum)) continue;
      map.set(taskNum, (map.get(taskNum) || 0) + getEntrySizeBytes(f));
    }
    return map;
  }, [files]);

  const getFolderTaskNumber = (folderId) => {
    if (!folderId) return null;
    const folder = folders.find((item) => item.id === folderId);
    const taskNum = Number(folder?.taskNumber);
    return Number.isFinite(taskNum) ? taskNum : null;
  };

  const getUploadCandidates = (folderIdOverride) => {
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory) return [];
    const folderId = typeof folderIdOverride === 'undefined' ? currentFolderId : folderIdOverride;
    const folderTaskNumber = getFolderTaskNumber(folderId);
    if (Number.isFinite(folderTaskNumber)) return [folderTaskNumber];
    return getNotesTaskNumbers(normalizedCurrentTask);
  };

  const selectUploadTaskNumber = (sizeBytes, usageMap, folderIdOverride) => {
    const candidates = getUploadCandidates(folderIdOverride);
    if (!candidates.length) return null;
    const taskLimitBytes = getTaskLimitBytesForFolder(folderIdOverride);
    let chosen = null;
    let bestRemaining = -1;
    for (const taskNumber of candidates) {
      const used = usageMap.get(taskNumber) || 0;
      const remaining = taskLimitBytes - used;
      if (remaining >= sizeBytes && remaining > bestRemaining) {
        chosen = taskNumber;
        bestRemaining = remaining;
      }
    }
    return chosen;
  };

  const folderCounts = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory) return { root: 0, map: new Map() };
    const map = new Map();
    const sharedRootByTask = new Map();
    folders.forEach((folder) => {
      if (!isLessonSharedFolder(folder) || normalizeParentFolderId(folder?.parentFolderId)) return;
      const taskNumber = getNotesTaskNumber(folder?.taskNumber);
      if (!Number.isFinite(taskNumber)) return;
      const sharedRootKey = `${taskNumber}:${String(folder?.category || '')}`;
      if (!sharedRootByTask.has(sharedRootKey)) {
        sharedRootByTask.set(sharedRootKey, String(folder?.id || '').trim());
      }
    });
    let root = 0;
    for (const f of files) {
      if (getNotesTaskNumber(f?.taskNumber) !== normalizedCurrentTask || f?.category !== currentCategory) continue;
      if (isSharedTemplateFile(f)) continue;
      const sharedRootId = !f?.folderId && isLessonSharedFile(f)
        ? sharedRootByTask.get(`${normalizedCurrentTask}:${String(currentCategory)}`)
        : '';
      const folderId = String(f?.folderId || sharedRootId || '').trim();
      if (folderId) map.set(folderId, (map.get(folderId) || 0) + 1);
      else root += 1;
    }
    return { root, map };
  }, [files, folders, normalizedCurrentTask, currentCategory]);

  const normalizedFolders = useMemo(() => {
    const ids = new Set((folders || []).map((folder) => String(folder?.id || '').trim()).filter(Boolean));
    return (folders || []).map((folder) => {
      const folderId = String(folder?.id || '').trim();
      let parentFolderId = normalizeParentFolderId(folder?.parentFolderId);
      if (parentFolderId === folderId) parentFolderId = null;
      if (parentFolderId && !ids.has(parentFolderId)) parentFolderId = null;
      return { ...folder, parentFolderId };
    });
  }, [folders]);

  const foldersById = useMemo(() => {
    const map = new Map();
    normalizedFolders.forEach((folder) => {
      const folderId = String(folder?.id || '').trim();
      if (!folderId || map.has(folderId)) return;
      map.set(folderId, folder);
    });
    return map;
  }, [normalizedFolders]);

  const folderChildrenByParent = useMemo(() => {
    const childrenByParent = new Map();
    const addChild = (parentId, folder) => {
      const key = parentId || '__root__';
      const list = childrenByParent.get(key) || [];
      list.push(folder);
      childrenByParent.set(key, list);
    };
    normalizedFolders.forEach((folder) => {
      addChild(normalizeParentFolderId(folder?.parentFolderId), folder);
    });
    const sortFolders = (left, right) => {
      const leftShared = isLessonSharedFolder(left);
      const rightShared = isLessonSharedFolder(right);
      if (leftShared !== rightShared) return leftShared ? -1 : 1;
      return String(left?.name || '').localeCompare(String(right?.name || ''), 'ru');
    };
    childrenByParent.forEach((list, key) => {
      childrenByParent.set(key, [...list].sort(sortFolders));
    });
    return childrenByParent;
  }, [normalizedFolders]);

  const _folderTreeEntries = useMemo(() => {
    const result = [];
    const walk = (parentId, depth, chain) => {
      const key = parentId || '__root__';
      const children = folderChildrenByParent.get(key) || [];
      children.forEach((folder) => {
        const folderId = String(folder?.id || '').trim();
        if (!folderId || chain.has(folderId)) return;
        const childrenCount = (folderChildrenByParent.get(folderId) || []).length;
        const isExpanded = Boolean(expandedFolderIds[folderId]);
        result.push({
          folder,
          depth,
          hasChildren: childrenCount > 0,
          isExpanded
        });
        if (!childrenCount || !isExpanded) return;
        const nextChain = new Set(chain);
        nextChain.add(folderId);
        walk(folderId, depth + 1, nextChain);
      });
    };
    walk(null, 0, new Set());
    return result;
  }, [folderChildrenByParent, expandedFolderIds]);

  const allExpandableFolderIds = useMemo(() => {
    const ids = [];
    folderChildrenByParent.forEach((children, key) => {
      if (key === '__root__') return;
      if (!Array.isArray(children) || children.length === 0) return;
      ids.push(key);
    });
    return ids;
  }, [folderChildrenByParent]);

  const currentFolder = useMemo(() => (
    currentFolderId ? (foldersById.get(currentFolderId) || null) : null
  ), [foldersById, currentFolderId]);

  const isFolderInLessonSharedTree = useCallback((folderId) => {
    if (!folderId) return false;
    const visited = new Set();
    let cursor = foldersById.get(folderId) || null;
    while (cursor && typeof cursor === 'object') {
      const cursorId = String(cursor?.id || '').trim();
      if (!cursorId || visited.has(cursorId)) break;
      visited.add(cursorId);
      if (isLessonSharedFolder(cursor)) return true;
      const parentId = normalizeParentFolderId(cursor?.parentFolderId);
      if (!parentId) break;
      cursor = foldersById.get(parentId) || null;
    }
    return false;
  }, [foldersById]);

  const isCurrentFolderLessonShared = isFolderInLessonSharedTree(currentFolderId);
  const currentFolderParentId = normalizeParentFolderId(currentFolder?.parentFolderId);
  const canUploadToCurrentFolder = !(role === 'student' && isCurrentFolderLessonShared);
  const canManageFile = (file) => !(role === 'student' && isLessonSharedFile(file));
  const activeUsageByNumber = isCurrentFolderLessonShared ? sharedTaskUsageByNumber : taskUsageByNumber;
  function getTaskLimitBytesForFolder(folderIdOverride) {
    const folderId = typeof folderIdOverride === 'undefined' ? currentFolderId : folderIdOverride;
    return isFolderInLessonSharedTree(folderId) ? MAX_LESSON_SHARED_TASK_BYTES : MAX_TASK_BYTES;
  }
  const formatLimitLabel = (bytes) => `${Math.round(bytes / (1024 * 1024))} МБ`;
  const currentTaskLimitBytes = isCurrentFolderLessonShared ? MAX_LESSON_SHARED_TASK_BYTES : MAX_TASK_BYTES;

  useEffect(() => {
    if (!allExpandableFolderIds.length) return;
    setExpandedFolderIds((prev) => {
      const next = { ...(prev || {}) };
      let changed = false;
      allExpandableFolderIds.forEach((folderId) => {
        if (next[folderId]) return;
        next[folderId] = true;
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [allExpandableFolderIds]);

  useEffect(() => {
    setFileSearch('');
  }, [effectiveStudentId, normalizedCurrentTask, currentCategory]);

  useEffect(() => {
    setExpandedFolderIds((prev) => {
      const next = {};
      let changed = false;
      Object.entries(prev || {}).forEach(([folderId, isExpanded]) => {
        if (!isExpanded) return;
        if (!foldersById.has(folderId)) {
          changed = true;
          return;
        }
        next[folderId] = true;
      });
      const prevExpanded = Object.keys(prev || {}).filter((folderId) => prev[folderId]);
      if (!changed && prevExpanded.length === Object.keys(next).length) return prev;
      return next;
    });
  }, [foldersById]);

  useEffect(() => {
    if (!currentFolderId) return;
    const idsToExpand = [];
    const visited = new Set();
    let cursor = foldersById.get(currentFolderId) || null;
    while (cursor && typeof cursor === 'object') {
      const cursorId = String(cursor?.id || '').trim();
      if (!cursorId || visited.has(cursorId)) break;
      visited.add(cursorId);
      const parentId = normalizeParentFolderId(cursor?.parentFolderId);
      if (!parentId) break;
      idsToExpand.push(parentId);
      cursor = foldersById.get(parentId) || null;
    }
    if (!idsToExpand.length) return;
    setExpandedFolderIds((prev) => {
      const next = { ...(prev || {}) };
      let changed = false;
      idsToExpand.forEach((folderId) => {
        if (next[folderId]) return;
        next[folderId] = true;
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [currentFolderId, foldersById]);

  const taskUsageBytes = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask)) return 0;
    const folderTaskNumber = getFolderTaskNumber(currentFolderId);
    if (Number.isFinite(folderTaskNumber)) {
      return activeUsageByNumber.get(folderTaskNumber) || 0;
    }
    if (normalizedCurrentTask === GAME_THEORY_TASK) {
      return getNotesTaskNumbers(normalizedCurrentTask)
        .reduce((sum, taskNumber) => sum + (activeUsageByNumber.get(taskNumber) || 0), 0);
    }
    return activeUsageByNumber.get(normalizedCurrentTask) || 0;
  }, [normalizedCurrentTask, currentFolderId, activeUsageByNumber, folders]);

  const totalLimitBytes = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask)) return currentTaskLimitBytes;
    const folderTaskNumber = getFolderTaskNumber(currentFolderId);
    if (Number.isFinite(folderTaskNumber)) return currentTaskLimitBytes;
    if (normalizedCurrentTask === GAME_THEORY_TASK) {
      return currentTaskLimitBytes * getNotesTaskNumbers(normalizedCurrentTask).length;
    }
    return currentTaskLimitBytes;
  }, [normalizedCurrentTask, currentFolderId, folders, currentTaskLimitBytes]);

  const remainingBytes = Math.max(0, totalLimitBytes - taskUsageBytes);

  useEffect(() => {
    if (!effectiveStudentId) {
      setFiles([]);
      setFilesError('');
      return;
    }
    let cancelled = false;
    api.getFiles(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setFiles(data);
        setFilesError('');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setFilesError('Не удалось загрузить файлы. Проверьте, что сервер запущен.');
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId, initialLocationKey]);

  useEffect(() => {
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory || !effectiveStudentId) {
      setFolders([]);
      setFoldersError('');
      setFoldersLoaded(false);
      return;
    }
    let cancelled = false;
    setFoldersLoaded(false);
    const taskNumbers = getNotesTaskNumbers(normalizedCurrentTask);
    Promise.all(taskNumbers.map((taskNumber) => api.getFolders(taskNumber, currentCategory, effectiveStudentId)))
      .then((lists) => {
        if (cancelled) return;
        setFolders(mergeFolderLists(lists));
        setFoldersError('');
        setFoldersLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setFoldersError('Не удалось загрузить папки.');
        setFoldersLoaded(true);
      });
    return () => { cancelled = true; };
  }, [normalizedCurrentTask, currentCategory, effectiveStudentId, initialLocationKey]);

  useEffect(() => {
    if (!pendingFolderIdRef.current) return;
    if (!foldersLoaded) return;
    const targetId = pendingFolderIdRef.current;
    pendingFolderIdRef.current = null;
    if (targetId && folders.some((item) => item.id === targetId)) {
      folderRestoreTargetRef.current = targetId;
      setCurrentFolderId(targetId);
    } else {
      folderRestoreTargetRef.current = null;
      restoringRef.current = false;
      setCurrentFolderId(null);
    }
  }, [folders, foldersLoaded]);

  useEffect(() => {
    const targetId = folderRestoreTargetRef.current;
    if (!targetId) return;
    if (currentFolderId !== targetId) return;
    folderRestoreTargetRef.current = null;
    restoringRef.current = false;
  }, [currentFolderId]);

  useEffect(() => {
    const preserveFolder = restoringRef.current;
    if (!preserveFolder) {
      setCurrentFolderId(null);
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
    setRenamingFolderId(null);
    setRenameFolderValue('');
    setIsRenamingFolder(false);
    setDeletingFolderId(null);
    setRenamingId(null);
    setRenameBase('');
    setRenameExt('');
    setIsRenaming(false);
    setDraggingFileId(null);
    setDragOverFolderId(null);
    setSelectedFileIds({});
    setExpandedPyIds({});
    setExpandedPdfIds({});
    setExpandedImageIds({});
    setExpandedTextIds({});
    clearAllSolutionCollapseTimers();
    clearAllFavoriteMotionTimers();
    setCollapsingSolutionIds({});
    setFavoriteMotionIds({});
    setEditingPyId(null);
    setPyEditDraft('');
    setPyEditSaving(false);
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
    setShowPyCreator(false);
    setPyDraftName('');
    setPyDraftCode('');
    setPyDraftError('');
    setPyDraftSaving(false);
    setSolutionHoverPreview(null);
    clearCopyFeedbackTimer();
    setCodeCopyFeedback(null);
    setShowMobileFolderTools(false);
  }, [currentTask, currentCategory]);

  useEffect(() => () => {
    clearAllSolutionCollapseTimers();
    clearAllFavoriteMotionTimers();
  }, []);

  useEffect(() => {
    if (!solutionHoverPreview) return undefined;
    const closePreview = () => setSolutionHoverPreview(null);
    window.addEventListener('scroll', closePreview, true);
    window.addEventListener('resize', closePreview);
    return () => {
      window.removeEventListener('scroll', closePreview, true);
      window.removeEventListener('resize', closePreview);
    };
  }, [solutionHoverPreview]);

  useEffect(() => {
    if (!effectiveStudentId) return;
    if (restoringRef.current) return;
    if (skipNullSaveRef.current && !currentTask && !currentCategory && !currentFolderId) {
      skipNullSaveRef.current = false;
      return;
    }
    skipNullSaveRef.current = false;
    onLocationChange?.({
      studentId: effectiveStudentId,
      taskNumber: currentTask,
      category: currentCategory,
      folderId: currentFolderId
    });
  }, [effectiveStudentId, currentTask, currentCategory, currentFolderId, onLocationChange]);

  useEffect(() => {
    if (!currentTask || currentCategory) return;
    setCurrentCategory(DEFAULT_NOTES_CATEGORY);
  }, [currentTask, currentCategory]);

  useEffect(() => {
    setSelectedFileIds((prev) => {
      const validIds = new Set((files || []).map((entry) => String(entry?.id || '').trim()).filter(Boolean));
      const next = {};
      let changed = false;
      Object.keys(prev || {}).forEach((id) => {
        if (!prev[id]) return;
        if (!validIds.has(id)) {
          changed = true;
          return;
        }
        next[id] = true;
      });
      const prevKeys = Object.keys(prev || {}).filter((id) => prev[id]);
      if (!changed && prevKeys.length === Object.keys(next).length) return prev;
      return next;
    });
  }, [files]);

  useEffect(() => {
    setSelectedFileIds({});
  }, [currentFolderId]);

  const isImageMimeType = (value) => String(value || '').toLowerCase().startsWith('image/');
  const isImageFileName = (name) => /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|heic|heif)$/i.test(String(name || ''));
  const getImageExtensionFromMime = (mime) => {
    const normalized = String(mime || '').toLowerCase();
    if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
    if (normalized === 'image/png') return 'png';
    if (normalized === 'image/gif') return 'gif';
    if (normalized === 'image/webp') return 'webp';
    if (normalized === 'image/bmp') return 'bmp';
    if (normalized === 'image/svg+xml') return 'svg';
    if (normalized === 'image/avif') return 'avif';
    if (normalized === 'image/heic') return 'heic';
    if (normalized === 'image/heif') return 'heif';
    if (normalized === 'image/x-icon' || normalized === 'image/vnd.microsoft.icon') return 'ico';
    return 'png';
  };

  const ensureFileName = (file, prefix = 'upload', index = 0) => {
    if (!file) return null;
    const trimmedName = String(file.name || '').trim();
    if (trimmedName) return file;
    const ext = getImageExtensionFromMime(file.type);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return new File([file], `${prefix}-${stamp}-${index + 1}.${ext}`, { type: file.type || 'application/octet-stream' });
  };

  const getDataTransferFiles = (dataTransfer) => {
    const list = Array.from(dataTransfer?.files || []).filter(Boolean);
    if (list.length > 0) return list;
    const items = Array.from(dataTransfer?.items || []);
    const fromItems = [];
    for (const item of items) {
      if (item?.kind !== 'file') continue;
      const file = item.getAsFile?.();
      if (file) fromItems.push(file);
    }
    return fromItems;
  };

  const getClipboardImageFiles = (clipboardData) => {
    const files = [];
    const fromFiles = Array.from(clipboardData?.files || []);
    fromFiles.forEach((file) => {
      if (!file) return;
      if (!isImageMimeType(file.type) && !isImageFileName(file.name)) return;
      const normalized = ensureFileName(file, 'clipboard', files.length);
      if (normalized) files.push(normalized);
    });
    if (files.length > 0) return files;

    const items = Array.from(clipboardData?.items || []);
    items.forEach((item) => {
      if (item?.kind !== 'file') return;
      const file = item.getAsFile?.();
      if (!file) return;
      if (!isImageMimeType(file.type) && !isImageFileName(file.name)) return;
      const normalized = ensureFileName(file, 'clipboard', files.length);
      if (normalized) files.push(normalized);
    });
    return files;
  };

  const handleUploadFiles = async (fileList) => {
    const filesToUpload = Array.from(fileList || []).filter(Boolean);
    if (filesToUpload.length === 0) return;
    if (!effectiveStudentId) {
      alert('Сначала выберите ученика.');
      return;
    }
    if (!canUploadToCurrentFolder) {
      alert(`В папку "${LESSON_SHARED_FOLDER_NAME}" может загружать только учитель.`);
      return;
    }
    const candidates = getUploadCandidates();
    if (!candidates.length) {
      alert('Сначала выберите задание и категорию.');
      return;
    }
    if (isUploading) return;
    setIsUploading(true);
    const usageByTask = new Map(activeUsageByNumber);
    let skipped = 0;

    for (const file of filesToUpload) {
      const targetTaskNumber = selectUploadTaskNumber(file.size, usageByTask);
      if (!Number.isFinite(targetTaskNumber)) {
        skipped += 1;
        continue;
      }
      try {
        const newF = await api.uploadFile(file, targetTaskNumber, currentCategory, currentFolderId || null, effectiveStudentId);
        setFiles(prev => [newF, ...prev]);
        usageByTask.set(targetTaskNumber, (usageByTask.get(targetTaskNumber) || 0) + file.size);
      } catch(err) {
        alert(err?.message || err);
      }
    }

    setIsUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (skipped > 0) {
      const taskLimitLabel = formatLimitLabel(getTaskLimitBytesForFolder());
      const limitNote = normalizedCurrentTask === GAME_THEORY_TASK && !currentFolderId
        ? `Лимит ${taskLimitLabel} на каждое из заданий 19-21.`
        : `Лимит ${taskLimitLabel} на задание.`;
      alert(`Не хватило места для ${skipped} файла(ов). ${limitNote}`);
    }
  };

  const handleUpload = (e) => {
    handleUploadFiles(e.target.files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const dropped = getDataTransferFiles(e.dataTransfer);
    handleUploadFiles(dropped);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (!isDragging) setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPaste = (event) => {
      if (!effectiveStudentId || !Number.isFinite(normalizedCurrentTask) || !currentCategory) return;
      if (isUploading) return;
      if (!canUploadToCurrentFolder) return;
      const imageFiles = getClipboardImageFiles(event.clipboardData);
      if (!imageFiles.length) return;
      event.preventDefault();
      event.stopPropagation();
      handleUploadFiles(imageFiles);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [
    effectiveStudentId,
    normalizedCurrentTask,
    currentCategory,
    isUploading,
    canUploadToCurrentFolder,
    handleUploadFiles
  ]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setFoldersError('Введите название папки.');
      return;
    }
    const uploadTaskNumber = normalizedCurrentTask;
    if (!Number.isFinite(uploadTaskNumber) || !currentCategory || !effectiveStudentId) return;
    if (!canUploadToCurrentFolder) {
      setFoldersError(`В папке "${LESSON_SHARED_FOLDER_NAME}" может создавать подпапки только учитель.`);
      return;
    }
    try {
      const created = await api.createFolder(
        uploadTaskNumber,
        currentCategory,
        name,
        effectiveStudentId,
        currentFolderId || null
      );
      const transition = runNotesViewTransition(() => {
        setFolders(prev => [created, ...prev]);
        setNewFolderName('');
        setIsCreatingFolder(false);
        setFoldersError('');
        selectFolder(created.id);
      });
      restoreNotesFocus(transition, () => (
        typeof document === 'undefined'
          ? null
          : document.querySelector('[data-notes-folder-creator-trigger]')
      ));
    } catch (err) {
      setFoldersError(err?.message || err);
    }
  };

  const startRenameFolder = (folder) => {
    if (isLessonSharedFolder(folder)) return;
    setRenamingFolderId(folder.id);
    setRenameFolderValue(folder.name || '');
  };

  const cancelRenameFolder = () => {
    setRenamingFolderId(null);
    setRenameFolderValue('');
    setIsRenamingFolder(false);
  };

  const saveRenameFolder = async (folder, nameOverride) => {
    if (!folder?.id) return;
    if (isLessonSharedFolder(folder)) {
      cancelRenameFolder();
      return;
    }
    const name = (nameOverride ?? renameFolderValue).trim();
    if (!name || name === folder.name) {
      cancelRenameFolder();
      return;
    }
    setIsRenamingFolder(true);
    try {
      const updated = await api.renameFolder(folder.id, name);
      setFolders((prev) => prev.map((f) => (f.id === updated.id ? { ...f, name: updated.name } : f)));
      setFiles((prev) => prev.map((f) => (f.folderId === updated.id ? { ...f, folderName: updated.name } : f)));
      cancelRenameFolder();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setIsRenamingFolder(false);
    }
  };

  const canDeleteFolder = (folder) => {
    if (!folder?.id) return false;
    if (role !== 'teacher') return false;
    if (folder?.isSystem) return false;
    if (isLessonSharedFolder(folder) && String(folder?.name || '').trim().toLowerCase() === LESSON_SHARED_FOLDER_NAME) {
      return false;
    }
    return true;
  };

  const handleDeleteFolder = async (folder) => {
    if (!canDeleteFolder(folder)) return;
    const folderName = String(folder?.name || 'Папка').trim() || 'Папка';
    const confirmed = window.confirm(`Удалить папку "${folderName}" и всё внутри?`);
    if (!confirmed) return;
    setDeletingFolderId(folder.id);
    try {
      const response = await api.deleteFolder(folder.id);
      const deletedFolderIds = Array.isArray(response?.deletedFolderIds)
        ? response.deletedFolderIds.map((item) => String(item || '').trim()).filter(Boolean)
        : [String(folder.id || '').trim()];
      const deletedFolderIdSet = new Set(deletedFolderIds);
      const deletedFileIdSet = new Set(
        Array.isArray(response?.deletedFileIds)
          ? response.deletedFileIds.map((item) => String(item || '').trim()).filter(Boolean)
          : []
      );

      setFolders((prev) => prev.filter((entry) => !deletedFolderIdSet.has(String(entry?.id || '').trim())));
      setFiles((prev) => prev.filter((entry) => {
        const fileId = String(entry?.id || '').trim();
        const fileFolderId = String(entry?.folderId || '').trim();
        if (deletedFileIdSet.has(fileId)) return false;
        if (fileFolderId && deletedFolderIdSet.has(fileFolderId)) return false;
        return true;
      }));
      setExpandedFolderIds((prev) => {
        const next = { ...(prev || {}) };
        let changed = false;
        Object.keys(next).forEach((folderKey) => {
          if (!deletedFolderIdSet.has(String(folderKey || '').trim())) return;
          delete next[folderKey];
          changed = true;
        });
        return changed ? next : prev;
      });
      setSelectedFileIds((prev) => {
        if (!prev || !Object.keys(prev).length) return prev;
        const next = { ...prev };
        let changed = false;
        deletedFileIdSet.forEach((fileId) => {
          if (!next[fileId]) return;
          delete next[fileId];
          changed = true;
        });
        return changed ? next : prev;
      });
      setCurrentFolderId((prev) => {
        const currentId = String(prev || '').trim();
        if (!currentId) return prev;
        if (deletedFolderIdSet.has(currentId)) return null;
        return prev;
      });
      if (renamingFolderId && deletedFolderIdSet.has(String(renamingFolderId || '').trim())) {
        cancelRenameFolder();
      }
      setFoldersError('');
    } catch (err) {
      setFoldersError(err?.message || err);
    } finally {
      setDeletingFolderId(null);
    }
  };

  const handleDragStartFile = (e, file) => {
    if (renamingId === file.id) return;
    const selectedIds = Object.keys(selectedFileIds || {}).filter((id) => selectedFileIds[id]);
    const isDraggingSelected = Boolean(selectedFileIds?.[file.id]);
    const dragIds = isDraggingSelected && selectedIds.length ? selectedIds : [file.id];
    if (!isDraggingSelected) {
      setSelectedFileIds({ [file.id]: true });
    }
    setDraggingFileId(file.id);
    e.dataTransfer.setData('text/plain', file.id);
    e.dataTransfer.setData('application/x-notes-file-ids', JSON.stringify(dragIds));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEndFile = () => {
    setDraggingFileId(null);
    setDragOverFolderId(null);
  };

  const handleFolderDragOver = (e, folderId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  };

  const handleFolderDragLeave = (e, folderId) => {
    e.preventDefault();
    if (dragOverFolderId === folderId) setDragOverFolderId(null);
  };

  const handleFolderDrop = async (e, folderId) => {
    e.preventDefault();
    let fileIds = [];
    const rawMulti = e.dataTransfer.getData('application/x-notes-file-ids');
    if (rawMulti) {
      try {
        const parsed = JSON.parse(rawMulti);
        if (Array.isArray(parsed)) {
          fileIds = parsed.map((id) => String(id || '').trim()).filter(Boolean);
        }
      } catch {
        fileIds = [];
      }
    }
    if (!fileIds.length) {
      const fallbackId = String(e.dataTransfer.getData('text/plain') || '').trim();
      if (fallbackId) fileIds = [fallbackId];
    }
    const uniqueFileIds = Array.from(new Set(fileIds));
    if (!uniqueFileIds.length) return;
    const draggedFiles = uniqueFileIds
      .map((fileId) => files.find((item) => item.id === fileId))
      .filter(Boolean);
    if (!draggedFiles.length) return;
    const unmanageableFile = draggedFiles.find((file) => !canManageFile(file));
    if (unmanageableFile) {
      alert('Недостаточно прав для изменения одного или нескольких файлов.');
      setDragOverFolderId(null);
      return;
    }
    const destinationFolderId = folderId || null;
    if (folderId) {
      const folder = folders.find((item) => item.id === folderId);
      const destinationIsLessonShared = folder ? isFolderInLessonSharedTree(folder.id) : false;
      if (destinationIsLessonShared) {
        if (role === 'student') {
          alert(`В папку "${LESSON_SHARED_FOLDER_NAME}" может перемещать файлы только учитель.`);
          setDragOverFolderId(null);
          return;
        }
      }
      const mismatchedTaskFile = draggedFiles.find((file) => {
        const fileTask = Number(file?.taskNumber);
        const folderTask = Number(folder?.taskNumber);
        return Number.isFinite(fileTask) && Number.isFinite(folderTask) && fileTask !== folderTask;
      });
      if (mismatchedTaskFile) {
        alert('Нельзя переместить файл в папку другого задания.');
        setDragOverFolderId(null);
        return;
      }
    }
    const filesToMove = draggedFiles.filter((file) => (
      (file?.folderId || null) !== destinationFolderId
    ));
    if (!filesToMove.length) {
      setDragOverFolderId(null);
      setDraggingFileId(null);
      return;
    }
    try {
      const movedFiles = [];
      const errors = [];
      for (const file of filesToMove) {
        try {
          const updated = await api.moveFile(file.id, folderId);
          movedFiles.push(updated);
        } catch (err) {
          errors.push(`${file.name}: ${err?.message || err}`);
        }
      }
      if (movedFiles.length) {
        const movedById = new Map(movedFiles.map((entry) => [entry.id, entry]));
        setFiles((prev) => prev.map((f) => (
          movedById.has(f.id) ? { ...f, ...movedById.get(f.id) } : f
        )));
        setSelectedFileIds({});
      }
      if (errors.length) {
        const details = errors.slice(0, 3).join('\n');
        const suffix = errors.length > 3 ? `\nи ещё ${errors.length - 3}` : '';
        alert(`Не удалось переместить часть файлов:\n${details}${suffix}`);
      }
      setDraggingFileId(null);
    } finally {
      setDragOverFolderId(null);
    }
  };

  const isPyFile = (name) => name?.toLowerCase().endsWith('.py');
  const isPdfFile = (name) => name?.toLowerCase().endsWith('.pdf');
  const isTextFile = (name) => /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|scss|js|jsx|ts|tsx|log|sql|ya?ml|toml|ini|cfg|ipynb|pyw|c|cpp|h|hpp|java|kt|go|rs|php|rb|sh|ps1|bat)$/i.test(String(name || ''));
  const isImageFile = (value) => {
    const name = typeof value === 'string' ? value : value?.name;
    const mime = typeof value === 'string' ? '' : value?.type;
    return isImageFileName(name) || isImageMimeType(mime);
  };
  const isExcelFile = (name) => {
    const lower = name?.toLowerCase() || '';
    return (
      lower.endsWith('.xls') ||
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xlsm') ||
      lower.endsWith('.xlsb') ||
      lower.endsWith('.ods') ||
      lower.endsWith('.fods')
    );
  };

  const normalizePyFileName = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.py') ? trimmed : `${trimmed}.py`;
  };

  const getPyDraftSize = (code) => new Blob([code ?? ''], { type: 'text/x-python' }).size;

  const handleCreatePyFile = async () => {
    if (!effectiveStudentId) {
      setPyDraftError('Сначала выберите ученика.');
      return;
    }
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory) {
      setPyDraftError('Сначала выберите задание и категорию.');
      return;
    }
    const normalizedName = normalizePyFileName(pyDraftName);
    if (!normalizedName) {
      setPyDraftError('Введите название файла.');
      return;
    }
    const code = String(pyDraftCode ?? '');
    const sizeBytes = getPyDraftSize(code);
    if (!canUploadToCurrentFolder) {
      setPyDraftError(`В папку "${LESSON_SHARED_FOLDER_NAME}" может загружать только учитель.`);
      return;
    }
    const usageByTask = new Map(activeUsageByNumber);
    const uploadTaskNumber = selectUploadTaskNumber(sizeBytes, usageByTask);
    if (!Number.isFinite(uploadTaskNumber)) {
      setPyDraftError('Недостаточно места для сохранения файла в этом задании.');
      return;
    }
    if (pyDraftSaving) return;
    setPyDraftSaving(true);
    setPyDraftError('');
    try {
      const file = new File([code], normalizedName, { type: 'text/x-python' });
      const created = await api.uploadFile(
        file,
        uploadTaskNumber,
        currentCategory,
        currentFolderId || null,
        effectiveStudentId,
        {
          source: 'notes-python',
          memory: {
            taskNumber: uploadTaskNumber,
            source: 'notes-python',
            description: 'Python-файл из конспектов',
          },
        }
      );
      const transition = runNotesViewTransition(() => {
        setFiles((prev) => [created, ...prev]);
        setPyDraftName('');
        setPyDraftCode('');
        setShowPyCreator(false);
      });
      restoreNotesFocus(transition, () => (
        typeof document === 'undefined'
          ? null
          : document.querySelector('[data-notes-python-creator-trigger]')
      ));
    } catch (err) {
      setPyDraftError(err?.message || err);
    } finally {
      setPyDraftSaving(false);
    }
  };

  const PdfLogo = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
      <rect x="3" y="2" width="18" height="20" rx="3" fill="#E53E3E" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="7"
        fontFamily="Arial, sans-serif"
        fill="#FFFFFF"
      >
        PDF
      </text>
    </svg>
  );

  const PyLogo = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
      <path
        fill="#3776AB"
        d="M12 2c-4 0-4 2-4 2v3h8v1H6c-2.2 0-4 1.8-4 4v2c0 2.2 1.8 4 4 4h2v-3c0-2.2 1.8-4 4-4h4c2.2 0 4-1.8 4-4V6c0-2.2-1.8-4-4-4h-4z"
      />
      <circle cx="10" cy="4.5" r="0.9" fill="#FFFFFF" />
      <path
        fill="#FFD43B"
        d="M12 22c4 0 4-2 4-2v-3h-8v-1h10c2.2 0 4-1.8 4-4v-2c0-2.2-1.8-4-4-4h-2v3c0 2.2-1.8 4-4 4h-4c-2.2 0-4 1.8-4 4v3c0 2.2 1.8 4 4 4h4z"
      />
      <circle cx="14" cy="19.5" r="0.9" fill="#FFFFFF" />
    </svg>
  );

  const ExcelLogo = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
      <rect x="3" y="2" width="18" height="20" rx="3" fill="#1F7A3E" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="7"
        fontFamily="Arial, sans-serif"
        fill="#FFFFFF"
      >
        XLS
      </text>
    </svg>
  );

  const FileIcon = ({ name, compact = false }) => {
    const config = isImageFile(name)
      ? { Icon: ImageIcon, label: 'IMG', className: 'notes-file-icon--image' }
      : isPdfFile(name)
        ? { Icon: FileText, label: 'PDF', className: 'notes-file-icon--pdf' }
        : isExcelFile(name)
          ? { Icon: FileSpreadsheet, label: 'XLS', className: 'notes-file-icon--excel' }
          : isPyFile(name)
            ? { Icon: PythonLogoIcon, iconProps: { colored: true }, label: 'PYTHON', className: 'notes-file-icon--python' }
            : { Icon: FileText, label: 'FILE', className: 'notes-file-icon--default' };
    const iconSize = compact ? 16 : 18;
    const renderedIconSize = isPyFile(name) ? (compact ? 22 : 24) : iconSize;
    return (
      <span className={`notes-file-icon ${compact ? 'is-compact' : ''} ${config.className}`}>
        <span className="notes-file-icon__tile">
          <config.Icon size={renderedIconSize} strokeWidth={1.9} {...(config.iconProps || {})} />
        </span>
        {!compact && <span className="notes-file-icon__label">{config.label}</span>}
      </span>
    );
  };

  const handleDownload = (file) => {
    const url = buildDownloadUrl(getFileUrl(file));
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    if (file?.name) link.download = file.name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleStartWorkbookAutoSync = async (file) => {
    const fileId = String(file?.id || '').trim();
    if (
      role !== 'student'
      || !fileId
      || typeof onStartWorkbookAutoSync !== 'function'
      || workbookAutoSyncStartingId
    ) return;
    setWorkbookAutoSyncStartingId(fileId);
    try {
      await onStartWorkbookAutoSync({
        sourceFile: file,
        sourceUrl: getFileUrl(file),
        studentId: effectiveStudentId,
        taskNumber: file?.taskNumber,
        category: file?.category || currentCategory || DEFAULT_NOTES_CATEGORY,
      });
    } finally {
      setWorkbookAutoSyncStartingId('');
    }
  };

  const handleLaunchWorkbookHelper = async (file) => {
    const fileId = String(file?.id || '').trim();
    if (
      role !== 'student'
      || !fileId
      || typeof onLaunchWorkbookHelper !== 'function'
      || workbookHelperState?.status === 'launching'
      || workbookHelperState?.status === 'opening'
    ) return;
    if (
      Number(normalizedCurrentTask) === 26
      && /\.(txt|csv|tsv)$/i.test(String(file?.name || ''))
      && typeof window !== 'undefined'
    ) {
      const sourceWindow = window.open(getFileUrl(file), '_blank', 'noopener,noreferrer');
      if (sourceWindow) sourceWindow.opener = null;
    }
    await onLaunchWorkbookHelper({ sourceFile: file });
  };

  const getPyFileSize = (code) => new Blob([code ?? ''], { type: 'text/x-python' }).size;

  const resolvePyRunnerPending = (message) => {
    pyRunnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({ output, error });
    });
    pyRunnerPendingRef.current.clear();
  };

  const disposePyRunnerWorker = (message = '') => {
    if (pyRunnerWorkerRef.current) {
      pyRunnerWorkerRef.current.terminate();
      pyRunnerWorkerRef.current = null;
    }
    if (message) resolvePyRunnerPending(message);
  };

  const ensurePyRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (pyRunnerWorkerRef.current) return pyRunnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = pyRunnerPendingRef.current.get(data.id);
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
        pyRunnerPendingRef.current.delete(data.id);
        const output = typeof data.output === 'string'
          ? data.output
          : (data.output ? String(data.output) : (pending.output || ''));
        const error = typeof data.error === 'string'
          ? data.error
          : (data.error ? String(data.error) : (pending.error || ''));
        if (typeof pending.onProgress === 'function') {
          pending.onProgress({ output, error, done: true });
        }
        pending.resolve({ output, error });
      };
      worker.onerror = () => disposePyRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposePyRunnerWorker('Ошибка выполнения Python.');
      pyRunnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  useEffect(() => () => disposePyRunnerWorker('Python runner stopped.'), []);

  const runPyInMainThread = async (source, inputValue) => {
    const pyodide = await ensurePyodideReady();
    const wrapped = [
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
      '__output = _stdout.getvalue()',
      '__error = _stderr.getvalue()',
    ].join('\n');
    await pyodide.runPythonAsync(wrapped);
    const output = pyodide.globals.get('__output') || '';
    const error = pyodide.globals.get('__error') || '';
    pyodide.globals.delete('__output');
    pyodide.globals.delete('__error');
    return { output: String(output), error: String(error) };
  };

  const runPyCode = async (source, inputValue, onProgress = null) => {
    const worker = ensurePyRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = pyRunnerPendingRef.current.get(id);
          if (!pending) return;
          pyRunnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error });
          disposePyRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        pyRunnerPendingRef.current.set(id, {
          resolve,
          timer,
          output: '',
          error: '',
          onProgress: typeof onProgress === 'function' ? onProgress : null,
        });
        worker.postMessage({ id, source, input: inputValue });
      });
    }
    if (!ALLOW_MAIN_THREAD_PYTHON_FALLBACK) {
      return {
        output: '',
        error: 'Не удалось запустить Python в изолированном режиме. Перезагрузите страницу.'
      };
    }
    return runPyInMainThread(source, inputValue);
  };

  const handleRunEditedPyFile = async () => {
    if (!editingPyId) return;
    if (pyRunLoading) return;
    const targetId = editingPyId;
    setPyRunLoading(true);
    setPyRunError('');
    setPyRunOutput('');
    try {
      const result = await runPyCode(pyEditDraft, pyRunInput, (progress) => {
        if (editingPyIdRef.current !== targetId) return;
        setPyRunOutput(progress?.output || '');
        setPyRunError(progress?.error || '');
      });
      if (editingPyIdRef.current !== targetId) return;
      setPyRunOutput(result.output || '');
      setPyRunError(result.error || '');
    } catch (err) {
      if (editingPyIdRef.current !== targetId) return;
      setPyRunOutput('');
      setPyRunError(err?.message || 'Ошибка выполнения Python');
    } finally {
      const activeEditorId = editingPyIdRef.current;
      if (activeEditorId === targetId || activeEditorId === null) {
        setPyRunLoading(false);
      }
    }
  };

  const loadPyFileContent = async (file) => {
    const url = getFileUrl(file);
    if (!url || !isPyFile(file?.name)) return null;
    if (Object.prototype.hasOwnProperty.call(pyContent, file.id)) {
      return pyContent[file.id] ?? '';
    }
    if (pyError[file.id]) return null;

    setPyLoadingId(file.id);
    try {
      const res = await authenticatedUploadsFetch(url);
      if (!res.ok) throw new Error('Не удалось загрузить файл');
      const text = await res.text();
      setPyContent((prev) => ({ ...prev, [file.id]: text }));
      return text;
    } catch (err) {
      setPyError((prev) => ({ ...prev, [file.id]: err?.message || 'Ошибка загрузки' }));
      return null;
    } finally {
      setPyLoadingId(null);
    }
  };

  const togglePyPreview = async (file) => {
    if (!isPyFile(file?.name)) return;
    setSolutionHoverPreview(null);
    const fileId = String(file.id || '').trim();
    if (!fileId) return;
    if (collapsingSolutionIds[fileId]) {
      clearSolutionCollapseTimer(fileId);
      setCollapsingSolutionIds((prev) => {
        if (!prev[fileId]) return prev;
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      await loadPyFileContent(file);
      return;
    }
    const willOpen = !expandedPyIds[fileId];
    if (!willOpen) {
      setCollapsingSolutionIds((prev) => ({ ...prev, [fileId]: true }));
      if (editingPyId === file.id) {
        setEditingPyId(null);
        setPyEditDraft('');
        setPyEditSaving(false);
        setPyEditError('');
        setPyRunInput('');
        setPyRunOutput('');
        setPyRunError('');
        setPyRunLoading(false);
      }
      clearSolutionCollapseTimer(fileId);
      const timer = setTimeout(() => {
        solutionCollapseTimersRef.current.delete(fileId);
        setExpandedPyIds((prev) => {
          if (!prev[fileId]) return prev;
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
        setCollapsingSolutionIds((prev) => {
          if (!prev[fileId]) return prev;
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      }, getNotesMotionDuration(NOTES_PREVIEW_CLOSE_MS));
      solutionCollapseTimersRef.current.set(fileId, timer);
      return;
    }
    setExpandedPyIds((prev) => ({ ...prev, [fileId]: true }));
    await loadPyFileContent(file);
  };

  const startEditingPyFile = async (file) => {
    if (!isPyFile(file?.name)) return;
    if (!canManageFile(file)) {
      alert('Недостаточно прав для изменения этого файла.');
      return;
    }
    if (pyEditSaving) return;
    if (!expandedPyIds[file.id]) {
      setExpandedPyIds((prev) => ({ ...prev, [file.id]: true }));
    }
    let content = Object.prototype.hasOwnProperty.call(pyContent, file.id) ? (pyContent[file.id] ?? '') : null;
    if (content === null) {
      content = await loadPyFileContent(file);
    }
    if (content === null) return;
    setEditingPyId(file.id);
    setPyEditDraft(String(content ?? ''));
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
  };

  const cancelEditingPyFile = () => {
    setEditingPyId(null);
    setPyEditDraft('');
    setPyEditSaving(false);
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
  };

  const saveEditingPyFile = async (file) => {
    if (!isPyFile(file?.name) || !file?.id) return;
    if (!canManageFile(file)) return;
    if (editingPyId !== file.id || pyEditSaving) return;
    setPyEditSaving(true);
    setPyEditError('');
    try {
      const content = String(pyEditDraft ?? '');
      const updated = await api.updateFileContent(file.id, content);
      const shouldRefreshMemoryPreview = isSavedSolutionBundleFile(file) || isCheatsheetFile(file);
      let nextFile = updated;
      if (shouldRefreshMemoryPreview) {
        const nextCodePreview = buildCodeMemoryPreview(content);
        const nextMemory = {
          ...(updated?.memory || file?.memory || {}),
          ...(nextCodePreview ? { codePreview: nextCodePreview } : { codePreview: '' }),
        };
        try {
          nextFile = await api.updateFileMemory(file.id, nextMemory);
        } catch (err) {
          console.warn('[notes] failed to refresh code memory preview', err);
          nextFile = { ...updated, memory: nextMemory };
        }
      }
      setFiles((prev) => prev.map((entry) => (entry.id === nextFile.id ? { ...entry, ...nextFile } : entry)));
      setPyContent((prev) => ({ ...prev, [file.id]: content }));
      cancelEditingPyFile();
    } catch (err) {
      setPyEditError(err?.message || 'Не удалось сохранить файл');
    } finally {
      setPyEditSaving(false);
    }
  };

  const togglePinnedFile = async (file) => {
    if (!file?.id || !canManageFile(file)) return;
    const fileId = String(file.id);
    if (pinningFileIds[fileId]) return;
    const currentMemory = file?.memory && typeof file.memory === 'object' ? file.memory : {};
    const nextPinned = !isFileMemoryPinned(currentMemory);
    captureFileRowRects();
    favoriteFlightIdsRef.current.add(fileId);
    setFavoriteFlightTick((tick) => tick + 1);
    triggerFavoriteMotion(fileId, nextPinned ? 'adding' : 'removing');
    const nextMemory = {
      ...currentMemory,
      isPinned: nextPinned,
      pinnedAt: nextPinned ? new Date().toISOString() : '',
    };
    setPinningFileIds((prev) => ({ ...(prev || {}), [fileId]: true }));
    setFiles((prev) => prev.map((entry) => (
      entry.id === file.id ? { ...entry, memory: nextMemory } : entry
    )));
    try {
      const updated = await api.updateFileMemory(file.id, nextMemory);
      setFiles((prev) => prev.map((entry) => (
        entry.id === updated.id ? { ...entry, ...updated } : entry
      )));
    } catch (err) {
      console.error(err);
      captureFileRowRects();
      favoriteFlightIdsRef.current.add(fileId);
      setFavoriteFlightTick((tick) => tick + 1);
      triggerFavoriteMotion(fileId, isFileMemoryPinned(currentMemory) ? 'adding' : 'removing');
      setFiles((prev) => prev.map((entry) => (
        entry.id === file.id ? { ...entry, memory: currentMemory } : entry
      )));
    } finally {
      setPinningFileIds((prev) => {
        const next = { ...(prev || {}) };
        delete next[fileId];
        return next;
      });
    }
  };

  const updateLessonShareMode = async (file, nextMode) => {
    if (role !== 'teacher' || !file?.id || !canManageFile(file)) return;
    const fileId = String(file.id);
    const currentMode = getLessonShareMode(file);
    const normalizedNextMode = [
      LESSON_SHARE_MODE_PRIVATE,
      LESSON_SHARE_MODE_COMMON,
      LESSON_SHARE_MODE_TEMPLATE,
    ].includes(nextMode) ? nextMode : LESSON_SHARE_MODE_PRIVATE;
    if (currentMode === normalizedNextMode) return;
    const currentShared = currentMode !== LESSON_SHARE_MODE_PRIVATE;
    const nextShared = normalizedNextMode !== LESSON_SHARE_MODE_PRIVATE;
    if (!nextShared && currentShared) {
      const originalStudent = studentsList.find((student) => (
        String(student?.id || student?.studentId || '') === String(file?.originalStudentId || '')
      ));
      const originalStudentName = String(
        originalStudent?.name || originalStudent?.displayName || originalStudent?.username || ''
      ).trim();
      const sharedSectionName = isSharedTemplateFile(file) ? 'раздела «Шаблоны»' : 'раздела «Общее»';
      const destination = originalStudentName
        ? ` и вернётся в материалы ученика «${originalStudentName}»`
        : ' и вернётся в исходные материалы';
      const confirmed = window.confirm(
        `Вернуть «${getSavedSolutionTitle(file, file?.memory)}» в личные материалы?\n\n`
        + `Файл исчезнет из ${sharedSectionName} у всех учеников${destination}. Сам файл не удалится.`
      );
      if (!confirmed) return;
    }
    captureFileRowRects();
    favoriteFlightIdsRef.current.add(fileId);
    setFavoriteFlightTick((tick) => tick + 1);
    triggerFavoriteMotion(fileId, nextShared ? 'adding' : 'removing');
    setFiles((prev) => prev.map((entry) => (
      entry.id === file.id
        ? (() => {
          const nextEntry = {
            ...entry,
            memory: {
              ...(entry.memory || {}),
              isPinned: nextShared,
              pinnedAt: nextShared ? ((entry.memory || {}).pinnedAt || new Date().toISOString()) : '',
            },
          };
          if (nextShared) {
            if (!currentShared) {
              nextEntry.originalStudentId = entry.studentId || null;
              nextEntry.originalFolderId = entry.folderId || null;
              nextEntry.originalFolderName = entry.folderName || null;
            }
            nextEntry.isLessonShared = true;
            nextEntry.sharedScope = LESSON_SHARED_SCOPE;
            nextEntry.lessonShareMode = normalizedNextMode;
            nextEntry.notesShared = true;
            nextEntry.folderId = null;
            nextEntry.folderName = null;
          } else {
            nextEntry.studentId = entry.originalStudentId || entry.studentId;
            nextEntry.folderId = entry.originalFolderId || null;
            nextEntry.folderName = entry.originalFolderName || null;
            nextEntry.isLessonShared = false;
            delete nextEntry.sharedScope;
            delete nextEntry.lessonShareMode;
            delete nextEntry.notesShared;
            delete nextEntry.originalStudentId;
            delete nextEntry.originalFolderId;
            delete nextEntry.originalFolderName;
          }
          return nextEntry;
        })()
        : entry
    )));
    try {
      const updated = await api.updateFileLessonShareMode(file.id, normalizedNextMode);
      setFiles((prev) => prev.map((entry) => (
        entry.id === updated.id ? { ...entry, ...updated } : entry
      )));
    } catch (err) {
      console.error(err);
      captureFileRowRects();
      favoriteFlightIdsRef.current.add(fileId);
      setFavoriteFlightTick((tick) => tick + 1);
      triggerFavoriteMotion(fileId, nextShared ? 'removing' : 'adding');
      setFiles((prev) => prev.map((entry) => (
        entry.id === file.id ? file : entry
      )));
      alert(err?.message || 'Не удалось изменить тип материала');
    }
  };

  const toggleLessonSharedFile = (file) => {
    const currentMode = getLessonShareMode(file);
    const nextMode = currentMode === LESSON_SHARE_MODE_COMMON
      ? LESSON_SHARE_MODE_PRIVATE
      : LESSON_SHARE_MODE_COMMON;
    return updateLessonShareMode(file, nextMode);
  };

  const toggleLessonTemplateFile = (file) => {
    const currentMode = getLessonShareMode(file);
    const nextMode = currentMode === LESSON_SHARE_MODE_TEMPLATE
      ? LESSON_SHARE_MODE_PRIVATE
      : LESSON_SHARE_MODE_TEMPLATE;
    return updateLessonShareMode(file, nextMode);
  };

  const toggleSimplePreview = (file, expandedMap, setExpandedMap) => {
    const fileId = String(file?.id || '').trim();
    if (!fileId) return;
    if (collapsingSolutionIds[fileId]) {
      clearSolutionCollapseTimer(fileId);
      setCollapsingSolutionIds((prev) => {
        if (!prev[fileId]) return prev;
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      setExpandedMap((prev) => ({ ...prev, [fileId]: true }));
      return;
    }
    if (!expandedMap[fileId]) {
      setExpandedMap((prev) => ({ ...prev, [fileId]: true }));
      return;
    }
    setCollapsingSolutionIds((prev) => ({ ...prev, [fileId]: true }));
    clearSolutionCollapseTimer(fileId);
    const timer = setTimeout(() => {
      solutionCollapseTimersRef.current.delete(fileId);
      setExpandedMap((prev) => {
        if (!prev[fileId]) return prev;
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      setCollapsingSolutionIds((prev) => {
        if (!prev[fileId]) return prev;
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    }, getNotesMotionDuration(NOTES_PREVIEW_CLOSE_MS));
    solutionCollapseTimersRef.current.set(fileId, timer);
  };

  const togglePdfPreview = (file) => {
    const url = getFileUrl(file);
    if (!url || !isPdfFile(file.name)) return;
    toggleSimplePreview(file, expandedPdfIds, setExpandedPdfIds);
  };

  const toggleImagePreview = (file) => {
    const url = getFileUrl(file);
    if (!url || !isImageFile(file)) return;
    toggleSimplePreview(file, expandedImageIds, setExpandedImageIds);
  };

  const toggleTextPreview = (file) => {
    const url = getFileUrl(file);
    if (!url || !isTextFile(file?.name)) return;
    toggleSimplePreview(file, expandedTextIds, setExpandedTextIds);
  };

  const toggleFilePreview = (file) => {
    if (isPyFile(file.name)) return togglePyPreview(file);
    if (isPdfFile(file.name)) return togglePdfPreview(file);
    if (isImageFile(file)) return toggleImagePreview(file);
    if (isTextFile(file.name)) return toggleTextPreview(file);
    return null;
  };

  useEffect(() => {
    const fileId = String(pendingFileIdRef.current || '').trim();
    if (!fileId || !Number.isFinite(normalizedCurrentTask) || !currentCategory) return;
    const file = files.find((entry) => String(entry?.id || '') === fileId);
    if (!file) return;
    if (getNotesTaskNumber(file?.taskNumber) !== normalizedCurrentTask) return;
    if (String(file?.category || '') !== String(currentCategory)) return;
    const storedFolderId = String(file?.folderId || '').trim();
    const storedFolder = storedFolderId
      ? folders.find((folder) => String(folder?.id || '').trim() === storedFolderId)
      : null;
    const belongsToSharedRoot = Boolean(
      isLessonSharedFile(file)
      && (
        !storedFolderId
        || (isLessonSharedFolder(storedFolder) && !normalizeParentFolderId(storedFolder?.parentFolderId))
      )
    );
    const expectedFolderId = belongsToSharedRoot
      ? ''
      : storedFolderId;
    const activeFolderId = String(currentFolderId || '').trim();
    if (expectedFolderId !== activeFolderId) {
      if (expectedFolderId && folders.some((folder) => String(folder?.id || '').trim() === expectedFolderId)) {
        setCurrentFolderId(expectedFolderId);
      }
      return;
    }

    pendingFileIdRef.current = null;
    const contentQuery = String(pendingContentQueryRef.current || '').trim();
    pendingContentQueryRef.current = '';
    setFileSearch('');
    setSelectedFileIds({ [fileId]: true });
    if (contentQuery && isPyFile(file?.name)) {
      setContentSearchFocus({ fileId, query: contentQuery });
      setExpandedPyIds((current) => ({ ...current, [fileId]: true }));
      void loadPyFileContent(file);
    } else if (contentQuery && isTextFile(file?.name)) {
      setContentSearchFocus({ fileId, query: contentQuery });
      setExpandedTextIds((current) => ({ ...current, [fileId]: true }));
    } else {
      setContentSearchFocus(null);
    }
    let attempts = 0;
    const reveal = () => {
      const row = fileRowRefs.current.get(fileId);
      if (!row && attempts < 8) {
        attempts += 1;
        window.requestAnimationFrame(reveal);
        return;
      }
      row?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      row?.focus?.({ preventScroll: true });
    };
    window.requestAnimationFrame(reveal);
    window.setTimeout(() => {
      setSelectedFileIds((current) => {
        if (!current?.[fileId]) return current;
        const next = { ...current };
        delete next[fileId];
        return next;
      });
    }, 2200);
  }, [currentCategory, currentFolderId, files, folders, normalizedCurrentTask]);

  useEffect(() => {
    const fileId = String(contentSearchFocus?.fileId || '').trim();
    const query = String(contentSearchFocus?.query || '').trim().toLocaleLowerCase('ru-RU');
    const isPythonPreview = Boolean(expandedPyIds[fileId]);
    const isTextPreview = Boolean(expandedTextIds[fileId]);
    if (!fileId || !query || (!isPythonPreview && !isTextPreview)) return undefined;
    if (isPythonPreview && !Object.prototype.hasOwnProperty.call(pyContent, fileId)) return undefined;

    let cancelled = false;
    let attempts = 0;
    const revealMatch = () => {
      if (cancelled) return;
      const previewId = `notes-preview-${fileId.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      const preview = document.getElementById(previewId);
      const lines = isPythonPreview && preview
        ? Array.from(preview.querySelectorAll('.notes-python-code__line'))
        : [];
      const matchedLine = lines.find((line) => String(line?.textContent || '').toLocaleLowerCase('ru-RU').includes(query));
      const target = matchedLine || preview;
      if (!target && attempts < 10) {
        attempts += 1;
        window.requestAnimationFrame(revealMatch);
        return;
      }
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    };
    window.requestAnimationFrame(revealMatch);
    return () => { cancelled = true; };
  }, [contentSearchFocus, expandedPyIds, expandedTextIds, pyContent]);

  const handleDelete = async (file) => {
    if (!canManageFile(file)) {
      alert('Недостаточно прав для удаления этого файла.');
      return;
    }
    if (!confirm('Удалить файл?')) return;
    try {
      await api.deleteFile(file.id);
      setFiles(prev => prev.filter(x => x.id !== file.id));
      setSelectedFileIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      setExpandedPyIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      setExpandedPdfIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      setExpandedImageIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      setExpandedTextIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      if (renamingId === file.id) {
        cancelRename();
      }
      if (editingPyId === file.id) {
        cancelEditingPyFile();
      }
    } catch(err) {
      alert(err?.message || err);
    }
  };

  const splitFileName = (name = '') => {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === name.length - 1) {
      return { base: name, ext: '' };
    }
    return { base: name.slice(0, lastDot), ext: name.slice(lastDot + 1) };
  };

  const startRename = (file) => {
    if (!canManageFile(file)) return;
    setRenamingId(file.id);
    if (isSavedSolutionBundleFile(file) || isCheatsheetFile(file)) {
      const memory = file?.memory && typeof file.memory === 'object' ? file.memory : null;
      setRenameBase(getSavedSolutionTitle(file, memory));
      setRenameExt('');
      return;
    }
    const { base, ext } = splitFileName(file?.name || '');
    setRenameBase(base);
    setRenameExt(ext);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameBase('');
    setRenameExt('');
    setIsRenaming(false);
  };

  const saveRename = async (file, nameOverride) => {
    if (!file?.id) return;
    if (!canManageFile(file)) return;
    const base = (nameOverride ?? renameBase).trim();
    if (!base) {
      cancelRename();
      return;
    }
    const renamesMemoryTitle = isSavedSolutionBundleFile(file) || isCheatsheetFile(file);
    if (renamesMemoryTitle) {
      const memory = file?.memory && typeof file.memory === 'object' ? file.memory : {};
      const currentTitle = getSavedSolutionTitle(file, memory);
      if (base === currentTitle) {
        cancelRename();
        return;
      }
      setIsRenaming(true);
      try {
        const updated = await api.updateFileMemory(file.id, {
          ...memory,
          title: base,
        });
        setFiles((prev) => prev.map((entry) => (
          entry.id === updated.id ? { ...entry, ...updated } : entry
        )));
        cancelRename();
      } catch (err) {
        alert(err?.message || err);
      } finally {
        setIsRenaming(false);
      }
      return;
    }
    const ext = renameExt ? `.${renameExt}` : '';
    const name = `${base}${ext}`;
    if (name === file.name) {
      cancelRename();
      return;
    }
    setIsRenaming(true);
    try {
      const updated = await api.renameFile(file.id, name);
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? { ...f, name: updated.name } : f)));
      if (!isPyFile(updated.name)) {
        setExpandedPyIds((prev) => {
          if (!prev[file.id]) return prev;
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
        if (editingPyId === file.id) {
          cancelEditingPyFile();
        }
      }
      if (!isPdfFile(updated.name)) {
        setExpandedPdfIds((prev) => {
          if (!prev[file.id]) return prev;
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
      }
      if (!isImageFile(updated)) {
        setExpandedImageIds((prev) => {
          if (!prev[file.id]) return prev;
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
      }
      if (!isTextFile(updated.name)) {
        setExpandedTextIds((prev) => {
          if (!prev[file.id]) return prev;
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
      }
      cancelRename();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleRefreshData = useCallback(async () => {
    if (!effectiveStudentId || isRefreshingData) return;
    setIsRefreshingData(true);
    try {
      const taskNumbers = Number.isFinite(normalizedCurrentTask)
        ? (normalizedCurrentTask === GAME_THEORY_TASK ? [19, 20, 21] : [normalizedCurrentTask])
        : [];
      const [filesData, folderLists] = await Promise.all([
        api.getFiles(effectiveStudentId),
        (taskNumbers.length > 0 && currentCategory)
          ? Promise.all(taskNumbers.map((taskNumber) => api.getFolders(taskNumber, currentCategory, effectiveStudentId)))
          : Promise.resolve(null),
      ]);
      setFiles(Array.isArray(filesData) ? filesData : []);
      setFilesError('');
      if (folderLists) {
        setFolders(mergeFolderLists(folderLists));
        setFoldersError('');
      }
    } catch (err) {
      console.error(err);
      setFilesError('Не удалось обновить файлы. Проверьте, что сервер запущен.');
      if (Number.isFinite(normalizedCurrentTask) && currentCategory) {
        setFoldersError('Не удалось обновить папки.');
      }
    } finally {
      setIsRefreshingData(false);
    }
  }, [
    currentCategory,
    effectiveStudentId,
    isRefreshingData,
    normalizedCurrentTask,
    GAME_THEORY_TASK,
  ]);

  useEffect(() => {
    if (!effectiveStudentId) return;
    const poll = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      handleRefreshData();
    };
    const intervalId = setInterval(poll, AUTO_REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        handleRefreshData();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    return () => {
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [effectiveStudentId, handleRefreshData]);

  React.useLayoutEffect(() => {
    const previousRects = lastFileRowRectsRef.current;
    const flightIds = favoriteFlightIdsRef.current;
    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (previousRects.size && flightIds.size && !reduceMotion) {
      fileRowRefs.current.forEach((node, key) => {
        if (!node?.isConnected) return;
        const previousRect = previousRects.get(key);
        if (!previousRect) return;
        const nextRect = node.getBoundingClientRect();
        const deltaY = previousRect.top - nextRect.top;
        const deltaX = previousRect.left - nextRect.left;
        if (Math.abs(deltaY) < 1 && Math.abs(deltaX) < 1) return;
        const isMainFlight = flightIds.has(key);
        if (isMainFlight) node.classList.add('is-favorite-flight');
        const animation = node.animate(
          [
            {
              transform: `translate(${deltaX}px, ${deltaY}px)`,
              filter: isMainFlight ? 'drop-shadow(0 18px 30px rgba(217, 119, 6, 0.18))' : 'none',
            },
            {
              transform: 'translate(0, 0)',
              filter: 'none',
            },
          ],
          {
            duration: isMainFlight ? 680 : 440,
            easing: isMainFlight ? 'cubic-bezier(0.18, 0.88, 0.2, 1)' : 'cubic-bezier(0.2, 0.8, 0.2, 1)',
          }
        );
        animation.finished
          .catch(() => {})
          .finally(() => {
            node.classList.remove('is-favorite-flight');
          });
      });
    }
    favoriteFlightIdsRef.current = new Set();
    const nextRects = new Map();
    fileRowRefs.current.forEach((node, key) => {
      if (!node?.isConnected) return;
      nextRects.set(key, node.getBoundingClientRect());
    });
    lastFileRowRectsRef.current = nextRects;
  }, [currentCategory, currentFolderId, currentTask, favoriteFlightTick, fileSearch, files]);

  useEffect(() => {
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory) return undefined;
    const normalizedSearch = fileSearch.trim().toLowerCase();
    const candidates = files
      .filter((file) => (
        getNotesTaskNumber(file?.taskNumber) === normalizedCurrentTask
        && file?.category === currentCategory
      ))
      .filter((file) => {
        if (!normalizedSearch) {
          return currentFolderId ? file?.folderId === currentFolderId : !file?.folderId;
        }
        const memory = file?.memory && typeof file.memory === 'object' ? file.memory : null;
        const haystack = [
          file?.name,
          file?.folderPath,
          file?.folderName,
          memory?.title,
          memory?.description,
          memory?.codePreview,
          Array.isArray(memory?.tags) ? memory.tags.join(' ') : '',
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return haystack.includes(normalizedSearch);
      })
      .filter((file) => {
        const memory = file?.memory && typeof file.memory === 'object' ? file.memory : null;
        if (!isSavedSolutionBundleFile(file) && !isCheatsheetFile(file)) return false;
        if (String(memory?.codePreview || '').trim()) return false;
        if (Object.prototype.hasOwnProperty.call(pyContent, file.id)) return false;
        if (pyError[file.id]) return false;
        return true;
      })
      .slice(0, 8);
    if (!candidates.length) return undefined;
    let cancelled = false;
    const preload = async () => {
      for (const file of candidates) {
        if (cancelled) break;
        await loadPyFileContent(file);
      }
    };
    void preload();
    return () => {
      cancelled = true;
    };
  }, [
    currentCategory,
    currentFolderId,
    fileSearch,
    files,
    normalizedCurrentTask,
    pyContent,
    pyError,
  ]);

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="notes-explorer-student-picker notes-student-picker inline-flex w-full sm:w-auto items-center gap-2">
        <span className="notes-student-picker__label">Ученик</span>
        <StudentSearchSelect
          students={studentsList}
          value={activeStudentId || ''}
          onChange={(value) => onSelectStudent?.(value || null)}
          disabled={studentsLoading || studentsList.length === 0}
          className="notes-explorer-student-picker-select notes-student-picker__select w-full min-w-0 sm:min-w-[180px] outline-none disabled:opacity-70"
          dark={String(theme || '').trim().toLowerCase() === 'dark'}
        />
      </div>
    );
  };

  const tasksWithFilesCount = taskOptions.reduce((sum, task) => {
    return sum + ((taskCounts.get(task.number) || 0) > 0 ? 1 : 0);
  }, 0);
  const tasksCompletionRatio = taskOptions.length > 0
    ? Math.min(1, Math.max(0, tasksWithFilesCount / taskOptions.length))
    : 0;
  const totalFilesLabel = `${files.length} ${formatRussianCountLabel(
    files.length,
    'файл',
    'файла',
    'файлов'
  )}`;

  const openTaskExplorer = (taskNumber) => {
    const normalized = normalizeTaskNumber(taskNumber);
    if (!Number.isFinite(normalized)) return;
    if (transitionTaskNumber !== normalized) {
      flushSync(() => setTransitionTaskNumber(normalized));
    }
    flushSync(() => {
      pendingFolderIdRef.current = null;
      folderRestoreTargetRef.current = null;
      restoringRef.current = false;
      setCurrentTask(normalized);
      setCurrentCategory(DEFAULT_NOTES_CATEGORY);
      setCurrentFolderId(null);
    });
    restoreNotesFocus(null, () => taskBackButtonRef.current);
  };

  const closeTaskExplorer = () => {
    const taskToRestore = normalizedCurrentTask;
    if (Number.isFinite(taskToRestore) && transitionTaskNumber !== taskToRestore) {
      flushSync(() => setTransitionTaskNumber(taskToRestore));
    }
    flushSync(() => {
      pendingFolderIdRef.current = null;
      folderRestoreTargetRef.current = null;
      restoringRef.current = false;
      setCurrentTask(null);
      setCurrentCategory(null);
      setCurrentFolderId(null);
    });
    restoreNotesFocus(null, () => (
      typeof document === 'undefined'
        ? null
        : document.querySelector(`[data-notes-task-number="${taskToRestore}"]`)
    ));
  };

  const closeFolderCreator = () => {
    const transition = runNotesViewTransition(() => setIsCreatingFolder(false));
    restoreNotesFocus(transition, () => (
      typeof document === 'undefined'
        ? null
        : document.querySelector('[data-notes-folder-creator-trigger]')
    ));
  };

  const toggleFolderCreator = () => {
    if (isCreatingFolder) {
      closeFolderCreator();
      return;
    }
    runNotesViewTransition(() => setIsCreatingFolder(true));
  };

  const closePythonCreator = () => {
    const transition = runNotesViewTransition(() => setShowPyCreator(false));
    restoreNotesFocus(transition, () => (
      typeof document === 'undefined'
        ? null
        : document.querySelector('[data-notes-python-creator-trigger]')
    ));
  };

  const togglePythonCreator = () => {
    if (showPyCreator) {
      closePythonCreator();
      return;
    }
    runNotesViewTransition(() => setShowPyCreator(true));
  };

  const getFileTypeLabel = (file) => {
    if (isPyFile(file?.name)) return 'Python';
    if (isPdfFile(file?.name)) return 'PDF';
    if (isImageFile(file)) return 'Изображение';
    if (isTextFile(file?.name)) return 'Текст';
    if (isExcelFile(file?.name)) return 'Таблица';
    return 'Файл';
  };

  const renderNotesIntro = (message) => (
    <div className="animate-fadeIn space-y-4">
      <div className="notes-empty-state notes-landing-hero rounded-2xl border p-4 md:p-5">
        <div className="notes-landing-hero__body space-y-3">
          <div className="notes-landing-hero__header flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="notes-landing-title text-xl font-bold md:text-2xl">Конспекты</h2>
              <p className="notes-landing-subtitle hidden text-sm md:block">Материалы по заданиям, папкам и категориям</p>
            </div>
            {renderStudentPicker()}
          </div>
          <div className="notes-landing-message rounded-xl border border-dashed px-3 py-2.5 text-[13px] md:text-sm">
            {message}
          </div>
        </div>
      </div>
    </div>
  );

  if (role === 'teacher' && studentsList.length === 0) {
    return renderNotesIntro(
      studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return renderNotesIntro('Выберите ученика, чтобы открыть его материалы.');
  }

  if (!currentTask) return (
    <div className="notes-motion-view notes-motion-view--landing space-y-4 md:space-y-5" data-tour="notes">
      <div className="notes-landing-hero rounded-2xl border p-4 md:p-5">
        <div className="notes-landing-hero__body flex flex-col gap-3">
          <div className="notes-landing-hero__header flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="notes-landing-title text-xl font-bold md:text-2xl">Конспекты</h2>
              <p className="notes-landing-subtitle text-xs md:text-sm">Выберите задание, чтобы открыть материалы</p>
            </div>
            {renderStudentPicker()}
          </div>
          <div className="notes-landing-stats flex flex-wrap gap-2 text-[11px] font-semibold md:text-xs">
            <span className="notes-summary-pill notes-summary-pill--total">
              {`Всего: ${totalFilesLabel}`}
            </span>
            <span className="notes-summary-pill notes-summary-pill--filled">
              <span className="sm:hidden">{`Заполнено: ${tasksWithFilesCount}/${taskOptions.length}`}</span>
              <span className="hidden sm:inline">{`Заполнено заданий: ${tasksWithFilesCount}/${taskOptions.length}`}</span>
            </span>
          </div>
          <div className="notes-landing-progress" aria-hidden="true">
            <span
              className="notes-landing-progress__fill"
              style={{
                width: `${tasksWithFilesCount === 0 ? 0 : Math.max(10, tasksCompletionRatio * 100)}%`,
                minWidth: tasksWithFilesCount === 0 ? 0 : '0.75rem'
              }}
            />
          </div>
        </div>
      </div>

      <div className="notes-landing-grid grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {taskOptions.map((task, taskIndex) => {
          const taskFilesCount = taskCounts.get(task.number) || 0;
          const hasFiles = taskFilesCount > 0;
          const taskFilesLabel = `${taskFilesCount} ${formatRussianCountLabel(
            taskFilesCount,
            'файл',
            'файла',
            'файлов'
          )}`;
          return (
            <Card
              key={task.number}
              data-notes-task-number={task.number}
              onClick={() => openTaskExplorer(task.number)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                openTaskExplorer(task.number);
              }}
              role="button"
              tabIndex={0}
              aria-label={`Открыть конспекты задания №${getTaskDisplayNumber(task)}`}
              data-filled={hasFiles ? 'true' : 'false'}
              style={{
                '--notes-stagger-index': Math.min(taskIndex, 16),
                viewTransitionName: transitionTaskNumber === task.number ? 'notes-active-task' : undefined,
              }}
              className={`notes-card notes-landing-card group p-3 sm:p-3.5 ${
                hasFiles
                  ? 'notes-card--filled notes-landing-card--filled'
                  : 'notes-card--empty notes-landing-card--empty'
              }`}
            >
              <svg
                className="notes-folder-shape"
                viewBox="0 0 320 128"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  className="notes-folder-shape__fill"
                  d="M1 16C1 9 7 3 16 3H73C80.2 3 84.8 5.1 88.5 9.8L93.2 15.5C94.8 17.4 96.9 18.2 99.6 18.2H301C310.9 18.2 319 26.3 319 36.2V108C319 118.5 310.5 127 300 127H20C9.5 127 1 118.5 1 108V16Z"
                />
                <path
                  className="notes-folder-shape__stroke"
                  d="M1 16C1 9 7 3 16 3H73C80.2 3 84.8 5.1 88.5 9.8L93.2 15.5C94.8 17.4 96.9 18.2 99.6 18.2H301C310.9 18.2 319 26.3 319 36.2V108C319 118.5 310.5 127 300 127H20C9.5 127 1 118.5 1 108V16Z"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="notes-landing-card__top flex items-center justify-between gap-2">
                <span className={`notes-task-badge notes-landing-card__badge inline-flex items-center rounded-xl border px-2.5 py-1 text-[11px] font-bold md:text-xs ${
                  hasFiles ? 'notes-task-badge--filled' : ''
                }`}>
                  №{getTaskDisplayNumber(task)}
                </span>
                <span
                  className={`notes-summary-pill notes-landing-card__status text-[10px] md:text-[11px] ${
                    hasFiles
                      ? 'notes-summary-pill--filled'
                      : 'notes-summary-pill--empty'
                  }`}
                >
                  {hasFiles ? taskFilesLabel : 'Пусто'}
                </span>
              </div>
              <div className="notes-landing-card__body flex items-center gap-3">
                <span className={`notes-landing-card__icon inline-flex items-center justify-center rounded-2xl border ${
                  hasFiles ? 'is-filled' : ''
                }`}>
                  {hasFiles ? <FolderOpen size={16} /> : <Folder size={16} />}
                </span>
                <p className="notes-landing-card__text text-[11px] sm:text-xs">
                  {hasFiles ? 'Открыть' : 'Добавить'}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const effectiveCategory = currentCategory || DEFAULT_NOTES_CATEGORY;
  const taskFiles = files.filter((f) =>
    getNotesTaskNumber(f?.taskNumber) === normalizedCurrentTask &&
    f.category === effectiveCategory
  );
  const templateFiles = taskFiles.filter(isSharedTemplateFile);
  const lessonSharedRootFolders = normalizedFolders.filter((folder) => (
    !normalizeParentFolderId(folder?.parentFolderId)
    && isLessonSharedFolder(folder)
    && getNotesTaskNumber(folder?.taskNumber) === normalizedCurrentTask
    && String(folder?.category || '') === String(effectiveCategory)
  ));
  const lessonSharedRootFolderIds = new Set(
    lessonSharedRootFolders.map((folder) => String(folder?.id || '').trim()).filter(Boolean)
  );
  const isRootLessonSharedFile = (file) => {
    if (!isLessonSharedFile(file)) return false;
    const fileFolderId = String(file?.folderId || '').trim();
    return !fileFolderId || lessonSharedRootFolderIds.has(fileFolderId);
  };
  const commonFiles = taskFiles.filter((file) => (
    isCommonLessonSharedFile(file) && isRootLessonSharedFile(file)
  ));
  const activeFolder = currentFolderId ? foldersById.get(currentFolderId) : null;
  const filtered = taskFiles.filter((file) => {
    const fileFolderId = String(file?.folderId || '').trim();
    if (!currentFolderId) return !fileFolderId && !isLessonSharedFile(file);
    if (lessonSharedRootFolderIds.has(String(currentFolderId)) && isSharedTemplateFile(file)) return false;
    if (fileFolderId === currentFolderId) {
      return !(isCurrentFolderLessonShared && isRootLessonSharedFile(file));
    }
    if (lessonSharedRootFolderIds.has(String(currentFolderId))) {
      return false;
    }
    return !fileFolderId
      && isLessonSharedFile(file)
      && !isRootLessonSharedFile(file)
      && isLessonSharedFolder(activeFolder);
  });
  const uploadBlockedByRole = !canUploadToCurrentFolder;
  const getFolderPathSegments = (folderId) => {
    if (!folderId) return [];
    const labels = [];
    const visited = new Set();
    let cursorId = folderId;
    while (cursorId && !visited.has(cursorId)) {
      visited.add(cursorId);
      const folder = foldersById.get(cursorId);
      if (!folder) break;
      labels.push(folder.name || 'Папка');
      cursorId = normalizeParentFolderId(folder.parentFolderId);
    }
    return labels.reverse();
  };
  const getFolderPathLabel = (folder) => {
    const segments = getFolderPathSegments(folder?.id);
    return segments.length ? segments.join(' / ') : ROOT_FOLDER_LABEL;
  };
  const _formatExplorerDate = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed).replace(',', '');
  };
  const currentFolderPath = getFolderPathSegments(currentFolderId);
  const currentFolderLabel = currentFolderPath.length
    ? currentFolderPath[currentFolderPath.length - 1]
    : ROOT_FOLDER_LABEL;
  const normalizedFileSearch = fileSearch.trim().toLowerCase();
  const isSearchMode = Boolean(normalizedFileSearch);
  const visibleFiles = isSearchMode
    ? taskFiles.filter((file) => {
      const haystack = [
        file?.name,
        getFileTypeLabel(file),
        file?.folderPath,
        file?.folderName,
        file?.memory?.title,
        file?.memory?.description,
        file?.memory?.codePreview,
        Array.isArray(file?.memory?.tags) ? file.memory.tags.join(' ') : '',
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(normalizedFileSearch);
    })
    : filtered;
  const currentChildFolders = lessonSharedRootFolderIds.has(String(currentFolderId || ''))
    ? lessonSharedRootFolders.flatMap((folder) => folderChildrenByParent.get(folder.id) || [])
    : (folderChildrenByParent.get(currentFolderId || '__root__') || []);
  const visibleFolders = isSearchMode
    ? normalizedFolders.filter((folder) => {
      const haystack = [
        folder?.name,
        getFolderPathLabel(folder),
        isLessonSharedFolder(folder) ? 'файлы к уроку' : 'папка',
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(normalizedFileSearch);
    })
    : currentChildFolders;
  const sortedVisibleFolders = [...visibleFolders].sort((left, right) => {
    const leftShared = isLessonSharedFolder(left);
    const rightShared = isLessonSharedFolder(right);
    if (leftShared !== rightShared) return leftShared ? -1 : 1;
    return String(left?.name || '').localeCompare(String(right?.name || ''), 'ru');
  });
  const visibleTemplateFiles = isSearchMode
    ? visibleFiles.filter(isSharedTemplateFile)
    : (!currentFolderId ? templateFiles : []);
  const visibleCommonFiles = isSearchMode
    ? visibleFiles.filter((file) => isCommonLessonSharedFile(file) && isRootLessonSharedFile(file))
    : (!currentFolderId ? commonFiles : []);
  const visibleRegularFiles = visibleFiles.filter((file) => (
    !isSharedTemplateFile(file)
    && !(isCommonLessonSharedFile(file) && isRootLessonSharedFile(file))
  ));
  const sortedTemplateFiles = [...visibleTemplateFiles].sort((left, right) => (
    String(left?.name || '').localeCompare(String(right?.name || ''), 'ru')
  ));
  const sortedCommonFiles = [...visibleCommonFiles].sort((left, right) => (
    String(left?.name || '').localeCompare(String(right?.name || ''), 'ru')
  ));
  const sortedVisibleFiles = [...visibleRegularFiles].sort((left, right) => {
    const leftPinned = isImportantFile(left);
    const rightPinned = isImportantFile(right);
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
    if (leftPinned && rightPinned) {
      const pinnedDiff = getFileMemoryPinnedAt(right?.memory) - getFileMemoryPinnedAt(left?.memory);
      if (pinnedDiff) return pinnedDiff;
    }
    return String(left?.name || '').localeCompare(String(right?.name || ''), 'ru');
  });
  const allMainVisibleFolders = sortedVisibleFolders.filter((folder) => (
    !normalizeParentFolderId(folder?.parentFolderId) && isLessonSharedFolder(folder)
  ));
  const sharedLessonChildFolderCount = lessonSharedRootFolders.reduce(
    (count, folder) => count + (folderChildrenByParent.get(folder.id) || []).length,
    0
  );
  const mainVisibleFolders = allMainVisibleFolders.length && sharedLessonChildFolderCount > 0
    ? [allMainVisibleFolders[0]]
    : [];
  const regularVisibleFolders = sortedVisibleFolders.filter((folder) => !allMainVisibleFolders.includes(folder));
  const sharedLessonFilesCount = taskFiles.filter((file) => {
    const fileFolderId = String(file?.folderId || '').trim();
    return isLessonSharedFile(file)
      && !isRootLessonSharedFile(file)
      && Boolean(fileFolderId);
  }).length;
  const visibleExplorerItems = [
    ...mainVisibleFolders.map((folder) => ({ kind: 'folder', section: 'main', id: `folder-${folder.id}`, folder })),
    ...sortedCommonFiles.map((file) => ({ kind: 'file', section: 'shared', id: `shared-${file.id}`, file })),
    ...sortedTemplateFiles.map((file) => ({ kind: 'file', section: 'templates', id: `template-${file.id}`, file })),
    ...regularVisibleFolders.map((folder) => ({ kind: 'folder', section: 'folders', id: `folder-${folder.id}`, folder })),
    ...sortedVisibleFiles.map((file) => ({
      kind: 'file',
      section: isImportantFile(file) ? 'important' : 'materials',
      id: `file-${file.id}`,
      file,
    })),
  ];
  const mainSectionItemsCount = mainVisibleFolders.length;
  const sharedSectionItemsCount = sortedCommonFiles.length;
  const foldersSectionItemsCount = regularVisibleFolders.length;
  const currentFolderFilesCount = filtered.length + (!currentFolderId ? templateFiles.length + commonFiles.length : 0);
  const currentFolderFilesLabel = `${currentFolderFilesCount} ${formatRussianCountLabel(
    currentFolderFilesCount,
    'файл',
    'файла',
    'файлов'
  )}`;
  const currentFolderFoldersCount = currentFolderId
    ? currentChildFolders.length
    : mainVisibleFolders.length + regularVisibleFolders.length;
  const currentFolderFoldersLabel = `${currentFolderFoldersCount} ${formatRussianCountLabel(
    currentFolderFoldersCount,
    'папка',
    'папки',
    'папок'
  )}`;
  const currentFolderItemsLabel = `${currentFolderFoldersLabel}, ${currentFolderFilesLabel}`;
  const searchResultsLabel = `${visibleExplorerItems.length} ${formatRussianCountLabel(
    visibleExplorerItems.length,
    'совпадение',
    'совпадения',
    'совпадений'
  )}`;
  const emptyStateTitle = filesError
    ? 'Не удалось показать файлы'
    : isSearchMode
      ? 'Ничего не найдено'
      : visibleExplorerItems.length === 0
        ? 'Папка пока пустая'
        : '';
  const emptyStateText = filesError
    ? filesError
    : isSearchMode
      ? `По запросу "${fileSearch.trim()}" ничего не найдено.`
      : currentFolderId
        ? `В папке "${currentFolderLabel}" пока нет папок и файлов.`
        : 'Здесь пока нет папок и файлов.';
  const pyEditorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true
  };
  const isMobileViewport = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 767px)').matches
    : false;
  const pyDraftEditorHeight = isMobileViewport ? '180px' : '220px';
  const pyFileEditorHeight = isMobileViewport ? '220px' : '340px';
  const solutionPyEditorHeight = isMobileViewport ? '360px' : '520px';
  const pyIdleConsoleText = buildIdleConsoleText(pyRunInput, pyRunOutput, pyRunError);
  const pdfPreviewHeight = isMobileViewport ? '48vh' : '60vh';
  const imagePreviewMaxHeight = isMobileViewport ? '56vh' : '72vh';
  const currentTaskLabel = formatTaskNumber(currentTask) || currentTask;
  const uploadButtonLabel = isUploading
    ? 'Загрузка...'
    : (uploadBlockedByRole ? 'Только учитель' : 'Загрузить');
  const explorerOverviewLabel = isSearchMode
    ? `Найдено: ${searchResultsLabel}`
    : currentFolderItemsLabel;
  const remainingSpaceLabel = `Свободно ${formatBytes(remainingBytes)}`;
  const handleExplorerBack = () => {
    if (currentFolderId) {
      selectFolder(currentFolderParentId);
      return;
    }
    closeTaskExplorer();
  };
  const openSolutionHoverPreview = (event, file, details) => {
    if (!file?.id || typeof window === 'undefined') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 720;
    const width = Math.min(620, Math.max(320, viewportWidth - 32));
    const height = 220;
    let left = rect.left + 52;
    if (left + width > viewportWidth - 16) left = viewportWidth - width - 16;
    left = Math.max(16, left);
    let top = rect.bottom + 8;
    if (top + height > viewportHeight - 16) top = Math.max(16, rect.top - height - 8);
    setSolutionHoverPreview({
      fileId: file.id,
      title: details?.title || getSavedSolutionTitle(file, details?.memory),
      taskLabel: details?.taskLabel || 'Задание',
      snapshotUrl: details?.snapshotUrl || '',
      left,
      top,
      width,
    });
  };
  const solutionHoverCode = solutionHoverPreview
    ? getCodePreviewText(pyContent[solutionHoverPreview.fileId], pyLoadingId === solutionHoverPreview.fileId)
    : '';

  return (
    <div className="notes-explorer-shell notes-explorer-shell--workspace-v2 notes-motion-view notes-motion-view--workspace" data-tour="notes">
      <section
        className="notes-task-workspace"
        style={{ viewTransitionName: 'notes-active-task' }}
      >
        <header className="notes-task-hero">
          <div className="notes-task-hero__main">
            <button
              ref={taskBackButtonRef}
              type="button"
              onClick={handleExplorerBack}
              className="notes-task-back"
              title={currentFolderId ? 'Вернуться на уровень выше' : 'Вернуться к заданиям'}
              aria-label={currentFolderId ? 'Вернуться на уровень выше' : 'Вернуться к заданиям'}
            >
              <ArrowLeft size={18} />
              <span>Назад</span>
            </button>
            <div className="notes-task-hero__identity">
              <span className="notes-task-hero__icon" aria-hidden="true">
                <BookOpen size={23} strokeWidth={2.1} />
              </span>
              <div className="min-w-0">
                <span className="notes-task-hero__eyebrow">Материалы задания</span>
                <h3 className="notes-explorer-title notes-task-hero__title">
                  {`Задание ${currentTaskLabel}`}
                </h3>
                <p className="notes-explorer-toolbar-subtitle notes-task-hero__summary">
                  {explorerOverviewLabel}
                </p>
              </div>
            </div>
            <div className="notes-task-hero__side">
              {renderStudentPicker()}
              {role !== 'student' && (
                <span className={`notes-explorer-stat notes-explorer-stat-remaining ${
                  remainingBytes <= 10 * 1024 * 1024 ? 'is-low' : ''
                }`}>
                  {remainingSpaceLabel}
                </span>
              )}
            </div>
          </div>

          {(currentFolderPath.length > 0 || uploadBlockedByRole) && (
            <div className="notes-task-hero__lower">
              {currentFolderPath.length > 0 && (
                <nav className="notes-explorer-address notes-task-breadcrumb" aria-label="Текущая папка">
                  <Folder size={15} className="shrink-0" aria-hidden="true" />
                  <span className="shrink-0">Все материалы</span>
                  {currentFolderPath.map((segment, index) => (
                    <React.Fragment key={`address-path-segment-${index}`}>
                      <ChevronRight size={13} className="shrink-0" aria-hidden="true" />
                      <span className={index === currentFolderPath.length - 1 ? 'notes-explorer-address-current shrink-0' : 'shrink-0'}>
                        {segment}
                      </span>
                    </React.Fragment>
                  ))}
                </nav>
              )}
              {uploadBlockedByRole && (
                <p className="notes-explorer-toolbar-note">
                  Добавлять материалы в эту папку может только учитель
                </p>
              )}
            </div>
          )}
          {foldersError && <p className="notes-task-hero__error">{foldersError}</p>}
        </header>

        {role === 'student' && WORKBOOK_HELPER_TASK_NUMBERS.has(normalizedCurrentTask) && (
          <aside className="mx-3 mt-3 flex flex-col gap-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm shadow-violet-200">
                <FileSpreadsheet size={20} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900">Помощник для Excel и LibreOffice</p>
                <p className="mt-0.5 text-xs font-medium leading-5 text-slate-600">
                  Скачайте один раз — затем «Решать» сразу откроет таблицу. При первом сохранении помощник спросит название и сам добавит работу в конспекты.
                </p>
                {workbookHelperState?.status && workbookHelperState.status !== 'idle' && (
                  <p className={`mt-1 text-xs font-semibold ${
                    workbookHelperState.status === 'error' ? 'text-rose-600' : 'text-violet-700'
                  }`} role={workbookHelperState.status === 'error' ? 'alert' : 'status'}>
                    {workbookHelperState.message}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <a
                href="/downloads/IvanEgeWorkbookHelper.exe"
                download
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 text-xs font-extrabold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
              >
                <Download size={15} aria-hidden="true" />
                Скачать для Windows
              </a>
              <p className="max-w-[230px] text-center text-[10px] font-medium leading-4 text-slate-500">
                При первом запуске Windows может попросить подтверждение.
              </p>
            </div>
          </aside>
        )}

        <div
          key={`notes-library-${currentFolderId || 'root'}`}
          onDrop={uploadBlockedByRole ? undefined : handleDrop}
          onDragEnter={uploadBlockedByRole ? undefined : handleDragEnter}
          onDragOver={uploadBlockedByRole ? undefined : handleDragOver}
          onDragLeave={uploadBlockedByRole ? undefined : handleDragLeave}
          data-tour="files"
          className={`notes-explorer-files notes-library transition-all ${
            isDragging ? 'is-dragging' : ''
          } ${
            uploadBlockedByRole
              ? 'border-slate-200 bg-slate-50/70'
              : isDragging
              ? 'border-purple-400 bg-gradient-to-br from-purple-50 via-white to-fuchsia-50/40'
              : 'border-slate-200 bg-gradient-to-br from-white via-white to-slate-50/70'
          }`}
        >
        <input type="file" ref={fileRef} className="hidden" onChange={handleUpload} multiple disabled={uploadBlockedByRole} />
        <div className="notes-explorer-command-stack">
          <div className="notes-commandbar">
            <label className="notes-explorer-search-input-wrap notes-commandbar__search">
                <Search size={16} className="notes-explorer-search-icon shrink-0" />
                <input
                  type="text"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  placeholder="Найти папку или материал"
                  className="notes-explorer-search-input min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
                {fileSearch.trim() && (
                  <button
                    type="button"
                    onClick={() => setFileSearch('')}
                    className="notes-commandbar__clear"
                    aria-label="Очистить поиск"
                    title="Очистить поиск"
                  >
                    <X size={15} />
                  </button>
                )}
            </label>
            <div className="notes-explorer-quick-actions notes-commandbar__actions">
              {fileSearch.trim() && (
                <span className="notes-commandbar__result-count">{searchResultsLabel}</span>
              )}
              <Button
                data-notes-folder-creator-trigger
                variant="secondary"
                onClick={toggleFolderCreator}
                disabled={uploadBlockedByRole}
                aria-expanded={isCreatingFolder}
                aria-controls={NOTES_FOLDER_CREATOR_ID}
                className="notes-explorer-folder-add-btn notes-commandbar__secondary"
              >
                <FolderPlus size={16} /> {isCreatingFolder ? 'Скрыть' : 'Новая папка'}
              </Button>
              <Button
                data-notes-python-creator-trigger
                variant="secondary"
                onClick={togglePythonCreator}
                disabled={uploadBlockedByRole}
                aria-expanded={showPyCreator}
                aria-controls={NOTES_PYTHON_CREATOR_ID}
                className="notes-explorer-python-toggle notes-explorer-python-quick-btn notes-commandbar__secondary"
              >
                <Code2 size={16} /> {showPyCreator ? 'Скрыть' : 'Python-файл'}
              </Button>
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={isUploading || uploadBlockedByRole}
                className="notes-explorer-upload-btn notes-commandbar__primary"
              >
                <Upload size={18} /> {uploadButtonLabel}
              </Button>
            </div>
          </div>

          {isCreatingFolder && (
            <div
              id={NOTES_FOLDER_CREATOR_ID}
              className="notes-explorer-create-folder notes-inline-panel notes-inline-panel--folder mt-3 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/85 p-2.5 md:flex-row"
              style={{ viewTransitionName: 'notes-create-folder' }}
            >
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => { setNewFolderName(e.target.value); setFoldersError(''); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') closeFolderCreator();
                }}
                placeholder={currentFolderId ? 'Название подпапки' : 'Название папки'}
                className="notes-explorer-folder-input flex-1 rounded-xl border border-purple-100 bg-white px-4 py-2 outline-none focus:border-purple-500"
                autoFocus
              />
              <Button
                variant="secondary"
                onClick={closeFolderCreator}
                className="w-full md:w-auto"
              >
                Отмена
              </Button>
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || uploadBlockedByRole} className="notes-explorer-folder-create-submit w-full md:w-auto">
                Создать
              </Button>
            </div>
          )}

          {showPyCreator && (
          <div
            id={NOTES_PYTHON_CREATOR_ID}
            className="notes-explorer-python-card notes-inline-panel notes-inline-panel--python is-expanded rounded-2xl border border-slate-200/80 bg-white/85 p-3 md:p-4"
            style={{ viewTransitionName: 'notes-python-creator' }}
          >
            <div className="notes-explorer-python-summary flex flex-wrap items-center justify-between gap-2.5">
              <div className="notes-explorer-python-copy">
                <h3 className="notes-explorer-python-title text-sm font-bold text-gray-800">Новый Python-файл</h3>
                <p className="notes-explorer-python-subtitle text-xs text-slate-500">{currentFolderLabel}</p>
              </div>
              <Button variant="secondary" onClick={closePythonCreator} disabled={uploadBlockedByRole} className="notes-explorer-python-toggle w-full sm:w-auto">
                Скрыть
              </Button>
            </div>
            <div className="mt-3 space-y-3">
              <div className="flex flex-col md:flex-row gap-2">
                <input
                  type="text"
                  value={pyDraftName}
                  onChange={(e) => { setPyDraftName(e.target.value); setPyDraftError(''); }}
                  placeholder="Название файла (без .py)"
                  className="notes-explorer-python-input flex-1 min-w-0 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
                  autoFocus
                />
                <Button onClick={handleCreatePyFile} disabled={pyDraftSaving || !pyDraftName.trim() || uploadBlockedByRole} className="notes-explorer-python-save-btn w-full md:w-auto">
                  {pyDraftSaving ? 'Сохранение...' : 'Сохранить файл'}
                </Button>
              </div>
              <div className="rounded-2xl overflow-hidden border border-gray-800">
                <Editor
                  height={pyDraftEditorHeight}
                  language="python"
                  theme={monacoTheme}
                  beforeMount={ensureMonacoColorTheme}
                  value={pyDraftCode}
                  onChange={(value) => {
                    setPyDraftCode(value ?? '');
                    if (pyDraftError) setPyDraftError('');
                  }}
                  options={pyEditorOptions}
                  loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                />
              </div>
              <div className="notes-explorer-python-meta flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                <span>{`Размер: ${formatBytes(getPyDraftSize(pyDraftCode))}`}</span>
              </div>
              {pyDraftError && <p className="text-xs text-red-500">{pyDraftError}</p>}
            </div>
          </div>
          )}
        </div>

        {isSearchMode && (
          <div className="notes-library__heading">
            <h4 className="notes-library__title">{`Результаты по запросу «${fileSearch.trim()}»`}</h4>
            <span className="notes-library__count">{searchResultsLabel}</span>
          </div>
        )}

        {visibleExplorerItems.length === 0 ? (
          <div className="notes-explorer-empty-state rounded-2xl border border-dashed border-slate-200 bg-white/80 p-6 text-center md:p-10">
            <h4 className="notes-explorer-empty-title text-sm font-semibold">{emptyStateTitle}</h4>
            <p className="notes-explorer-empty-text mt-2 text-sm">{emptyStateText}</p>
          </div>
        ) : (
          <div className="notes-explorer-table overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="notes-explorer-table-scroll overflow-x-auto">
              <table className="notes-resource-table min-w-full text-sm">
                <thead className="notes-resource-table__head bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Имя</th>
                    <th className="px-3 py-2 text-left">Сведения</th>
                    <th className="px-3 py-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleExplorerItems.map((item, itemIndex) => {
                    const previousExplorerItem = itemIndex > 0 ? visibleExplorerItems[itemIndex - 1] : null;
                    const showSectionHeader = itemIndex === 0 || previousExplorerItem?.section !== item.section;
                    const sectionLabel = {
                      main: 'Главное',
                      shared: 'Общее',
                      templates: 'Шаблоны',
                      folders: 'Папки',
                      important: 'Важное',
                      materials: 'Материалы',
                    }[item.section] || 'Материалы';
                    const sectionCount = item.section === 'main'
                      ? mainSectionItemsCount
                      : item.section === 'shared'
                        ? sharedSectionItemsCount
                      : item.section === 'templates'
                        ? sortedTemplateFiles.length
                        : item.section === 'folders'
                          ? foldersSectionItemsCount
                          : sortedVisibleFiles.filter((file) => (
                            item.section === 'important' ? isImportantFile(file) : !isImportantFile(file)
                          )).length;
                    if (item.kind === 'folder') {
                      const folder = item.folder;
                      const sharedFolder = isLessonSharedFolder(folder);
                      const sharedRootFolder = sharedFolder && !normalizeParentFolderId(folder?.parentFolderId);
                      const folderDisplayName = sharedRootFolder ? 'Файлы к уроку' : folder.name;
                      const folderFileCount = sharedRootFolder
                        ? sharedLessonFilesCount
                        : (folderCounts.map.get(folder.id) || 0);
                      const childFolderCount = sharedRootFolder
                        ? sharedLessonChildFolderCount
                        : (folderChildrenByParent.get(folder.id) || []).length;
                      const canDeleteCurrentFolder = canDeleteFolder(folder);
                      const isDropTarget = dragOverFolderId === folder.id;
                      const isSelectedFolder = selectedFolderId === folder.id;
                      const isPressingFolder = pressingFolderId === folder.id;
                      const folderItemsLabel = `${childFolderCount} ${formatRussianCountLabel(
                        childFolderCount,
                        'папка',
                        'папки',
                        'папок'
                      )}, ${folderFileCount} ${formatRussianCountLabel(folderFileCount, 'файл', 'файла', 'файлов')}`;
                      return (
                        <React.Fragment key={item.id}>
                          {showSectionHeader && (
                            <tr className="notes-library-group-row">
                              <td colSpan={3}>
                                <span className={`notes-library-group-label ${item.section === 'main' ? 'notes-library-group-label--main' : ''}`}>
                                  {item.section === 'main'
                                    ? <BookOpen size={14} aria-hidden="true" />
                                    : <Folder size={14} aria-hidden="true" />}
                                  {sectionLabel}
                                  <span>{sectionCount}</span>
                                </span>
                              </td>
                            </tr>
                          )}
                          <tr
                          key={item.id}
                          className={`notes-explorer-folder-file-row notes-resource-card notes-resource-card--folder ${sharedFolder ? 'notes-resource-card--system-lesson' : ''} border-t border-slate-100 hover:bg-slate-50 ${
                            isDropTarget ? 'is-drop-target' : ''
                          } ${isSelectedFolder ? 'is-selected' : ''} ${
                            isPressingFolder ? 'is-pressing' : ''
                          }`}
                          style={{ '--notes-row-index': Math.min(itemIndex, 12) }}
                          onMouseDown={(e) => {
                            if (e.button !== 0 || renamingFolderId === folder.id) return;
                            startFolderPressFeedback(folder.id);
                          }}
                          onClick={(e) => {
                            if (renamingFolderId === folder.id) return;
                            if (e.ctrlKey || e.metaKey) {
                              setSelectedFolderId(folder.id);
                              setSelectedFileIds({});
                              return;
                            }
                            openFolderWithAnimation(folder.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              openFolderWithAnimation(folder.id);
                              return;
                            }
                            if (e.key === ' ') {
                              e.preventDefault();
                              setSelectedFolderId(folder.id);
                              setSelectedFileIds({});
                            }
                          }}
                          onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                          onDragLeave={(e) => handleFolderDragLeave(e, folder.id)}
                          onDrop={(e) => handleFolderDrop(e, folder.id)}
                          role="button"
                          tabIndex={renamingFolderId === folder.id ? -1 : 0}
                          title="Один клик — открыть папку"
                        >
                          <td className="notes-explorer-folder-name-cell notes-resource-card__identity px-3 py-2.5">
                            <div className="flex min-w-[220px] items-center gap-3">
                              <span className="notes-explorer-inline-folder-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                                <FolderOpen size={18} />
                              </span>
                              <div className="min-w-0">
                                {renamingFolderId === folder.id && !sharedFolder ? (
                                  <input
                                    value={renameFolderValue}
                                    onChange={(e) => setRenameFolderValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveRenameFolder(folder);
                                      if (e.key === 'Escape') cancelRenameFolder();
                                    }}
                                    onBlur={() => {
                                      if (!isRenamingFolder) saveRenameFolder(folder);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    className="notes-explorer-folder-rename-input w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500"
                                    autoFocus
                                  />
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <span className="notes-explorer-folder-name notes-explorer-file-name block truncate font-medium text-slate-800">
                                        {folderDisplayName}
                                      </span>
                                      {sharedFolder && (
                                        <span className="notes-explorer-folder-shared-badge">Урок</span>
                                      )}
                                    </div>
                                    {sharedFolder && !isSearchMode && (
                                      <span className="notes-collection-description block truncate text-xs">
                                        Общие материалы для учеников
                                      </span>
                                    )}
                                    {isSearchMode && (
                                      <span className="notes-explorer-file-path block truncate text-xs">
                                        {getFolderPathLabel(folder)}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="notes-resource-card__meta px-3 py-2.5 text-slate-600">{folderItemsLabel}</td>
                          <td className="px-3 py-2.5">
                            <div className="notes-explorer-row-actions notes-resource-card__actions flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openFolderWithAnimation(folder.id);
                                }}
                                className="notes-explorer-file-action-btn notes-explorer-folder-open-btn notes-explorer-open-action rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                title="Открыть папку"
                              >
                                <span className="notes-explorer-open-action__label">Открыть</span>
                                <ChevronRight className="notes-explorer-folder-open-chevron" size={16} />
                              </button>
                              {!sharedFolder && (
                                <button
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startRenameFolder(folder);
                                  }}
                                  className="notes-explorer-file-action-btn rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                  title="Переименовать папку"
                                  type="button"
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                              {canDeleteCurrentFolder && (
                                <button
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFolder(folder);
                                  }}
                                  disabled={deletingFolderId === folder.id}
                                  className="notes-explorer-file-action-btn notes-explorer-file-action-btn-danger rounded-md p-1.5 text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                                  title="Удалить папку"
                                  type="button"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                          </tr>
                        </React.Fragment>
                      );
                    }
                    const f = item.file;
                    const manageable = canManageFile(f);
                    const isPreviewable = isPyFile(f.name) || isPdfFile(f.name) || isImageFile(f) || isTextFile(f.name);
                    const isExpanded = Boolean(
                      expandedPyIds[f.id] || expandedPdfIds[f.id] || expandedImageIds[f.id] || expandedTextIds[f.id]
                    );
                    const isSelected = Boolean(selectedFileIds[f.id]);
                    const addedAtLabel = formatFileAddedAt(f);
                    const memory = f?.memory && typeof f.memory === 'object' ? f.memory : null;
                    const sourceRaw = String(memory?.source || f?.source || '').trim();
                    const sourceLabel = sourceRaw ? getFileMemorySourceLabel(sourceRaw) : '';
                    const runLabel = getFileMemoryRunLabel(memory);
                    const hasBoardSnapshot = Boolean(memory?.boardSnapshot?.url);
                    const memorySnapshotUrl = hasBoardSnapshot ? getMemorySnapshotUrl(f) : '';
                    const isSharedFile = isLessonSharedFile(f);
                    const isWorkbookAutoSyncActive = Boolean(
                      workbookAutoSyncState?.active
                      && String(workbookAutoSyncState?.sourceFileId || '') === String(f.id)
                    );
                    const isWorkbookAutoSyncStarting = workbookAutoSyncStartingId === String(f.id);
                    const isWorkbookHelperCurrent = String(workbookHelperState?.sourceFileId || '') === String(f.id);
                    const isWorkbookHelperBusy = Boolean(
                      workbookHelperState?.status === 'launching' || workbookHelperState?.status === 'opening'
                    );
                    const isWorkbookHelperOpening = Boolean(
                      isWorkbookHelperCurrent
                      && isWorkbookHelperBusy
                    );
                    const isWorkbookSolution = Boolean(
                      f?.workbookSourceFileId
                      || f?.workbookSolutionKey
                      || memory?.kind === 'workbook-solution'
                      || sourceRaw === 'workbook-auto-sync'
                    );
                    const isTask26TextWorkbook = Number(normalizedCurrentTask) === 26
                      && /\.(txt|csv|tsv)$/i.test(String(f?.name || ''));
                    const isSharedTemplate = isSharedTemplateFile(f);
                    const isCommonShared = isSharedFile && !isSharedTemplate;
                    const isCheatsheet = isCheatsheetFile(f);
                    const isSolutionBundle = isPyFile(f.name) && !isCheatsheet && (sourceRaw === 'collab-code' || hasBoardSnapshot);
                    const isMemoryCodeCard = isSolutionBundle || isCheatsheet;
                    const isCollapsingSolution = isSolutionBundle && Boolean(collapsingSolutionIds[f.id]);
                    const isCollapsingCheatsheet = isCheatsheet && Boolean(collapsingSolutionIds[f.id]);
                    const isCollapsingPreview = Boolean(collapsingSolutionIds[f.id]);
                    const isPreviewPresent = isExpanded;
                    const isPreviewVisuallyOpen = isExpanded && !isCollapsingPreview;
                    const solutionTaskNumber = memory?.taskNumber ?? f?.taskNumber;
                    const solutionTaskDisplay = formatTaskNumber(solutionTaskNumber) || solutionTaskNumber;
                    const solutionTitle = getSavedSolutionTitle(f, memory);
                    const solutionTaskLabel = solutionTaskDisplay ? `Задание ${solutionTaskDisplay}` : 'Задание';
                    const solutionActionTitle = isCheatsheet
                      ? (isPreviewVisuallyOpen ? 'Скрыть шпаргалку' : 'Открыть шпаргалку')
                      : (isPreviewVisuallyOpen ? 'Скрыть условие и решение' : 'Открыть условие и решение');
                    const isEditingCurrentPy = editingPyId === f.id;
                    const isPinned = isImportantFile(f);
                    const isPinning = Boolean(pinningFileIds[f.id]);
                    const favoriteMotion = favoriteMotionIds[f.id] || '';
                    const showFavoriteBadge = isPinned || favoriteMotion === 'removing';
                    const showFavoriteButton = !isSharedFile;
                    const canToggleTeacherShared = role === 'teacher' && manageable;
                    const canReturnSharedFileToPersonal = !isSharedFile || Boolean(f?.notesShared || f?.originalStudentId);
                    const hasLoadedPyContent = Object.prototype.hasOwnProperty.call(pyContent, f.id);
                    const inlineCodeSource = hasLoadedPyContent ? pyContent[f.id] : (memory?.codePreview || '');
                    const inlineCodePreview = isMemoryCodeCard
                      ? getCodeInlinePreviewText(inlineCodeSource, pyLoadingId === f.id)
                      : '';
                    const loadedSourceCode = hasLoadedPyContent ? String(pyContent[f.id] ?? '') : '';
                    const cheatsheetSourceCode = isCheatsheet ? loadedSourceCode : '';
                    const contentMatchQuery = String(
                      contentSearchFocus?.fileId === String(f.id) ? contentSearchFocus?.query : ''
                    ).trim();
                    const normalizedContentMatchQuery = contentMatchQuery.toLocaleLowerCase('ru-RU');
                    const isContentSearchTarget = Boolean(contentMatchQuery);
                    const textPreviewBaseUrl = isTextFile(f.name) ? getFileUrl(f) : '';
                    const textPreviewUrl = textPreviewBaseUrl && isContentSearchTarget
                      ? `${textPreviewBaseUrl}#:~:text=${encodeURIComponent(contentMatchQuery)}`
                      : textPreviewBaseUrl;
                    const cheatsheetSourceLines = cheatsheetSourceCode ? cheatsheetSourceCode.split(/\r?\n/) : [];
                    const cheatsheetLineCount = cheatsheetSourceLines.length;
                    const canCopyLoadedCode = Boolean(
                      !isEditingCurrentPy
                        && pyLoadingId !== f.id
                        && !pyError[f.id]
                        && loadedSourceCode.trim()
                    );
                    const previewElementId = `notes-preview-${String(f.id).replace(/[^A-Za-z0-9_-]/g, '-')}`;
                    const isCodeCopied = codeCopyFeedback?.status === 'success'
                      && codeCopyFeedback?.fileId === String(f.id);
                    const cheatsheetMetaTitle = [
                      solutionTaskLabel,
                      sourceLabel,
                      memory?.savedBy?.name,
                      addedAtLabel,
                    ].filter(Boolean).join(' · ');
                    return (
                      <React.Fragment key={f.id}>
                        {showSectionHeader && (
                          <tr className="notes-library-group-row">
                            <td colSpan={3}>
                              <span className={`notes-library-group-label ${item.section === 'important' ? 'is-favorite' : ''} ${item.section === 'shared' ? 'is-shared' : ''} ${item.section === 'templates' ? 'is-templates' : ''}`}>
                                {item.section === 'templates'
                                  ? <Sparkles size={14} aria-hidden="true" />
                                  : item.section === 'shared'
                                    ? <Users size={14} aria-hidden="true" />
                                  : item.section === 'important'
                                    ? <Star size={14} fill="currentColor" aria-hidden="true" />
                                    : <FileText size={14} aria-hidden="true" />}
                                {sectionLabel}
                                <span>{sectionCount}</span>
                              </span>
                            </td>
                          </tr>
                        )}
                        <tr
                          ref={(node) => setFileRowRef(f.id, node)}
                          className={`notes-explorer-file-row notes-resource-card ${isPinned ? 'notes-resource-card--favorite' : ''} ${isCommonShared ? 'notes-resource-card--shared-common' : ''} ${isSharedTemplate ? 'notes-resource-card--shared-template' : ''} ${isSolutionBundle ? 'notes-resource-card--solution' : ''} ${isCheatsheet ? 'notes-resource-card--cheatsheet' : ''} border-t border-slate-100 ${
                            isSelected ? 'is-selected' : ''
                          } ${
                            isPreviewPresent ? 'is-preview-open' : ''
                          } ${
                            isPreviewable ? 'is-previewable' : ''
                          } ${
                            isSolutionBundle ? 'is-solution-bundle' : ''
                          } ${
                            isCheatsheet ? 'is-cheatsheet' : ''
                          } ${
                            isPinned ? 'is-pinned' : ''
                          } ${
                            favoriteMotion === 'adding' ? 'is-favorite-adding' : ''
                          } ${
                            favoriteMotion === 'removing' ? 'is-favorite-removing' : ''
                          }`}
                          style={{ '--notes-row-index': Math.min(itemIndex, 12) }}
                          draggable={renamingId !== f.id && manageable}
                          onDragStart={(e) => {
                            if (e.target.closest?.('.notes-code-selectable')) {
                              e.preventDefault();
                              return;
                            }
                            if (!manageable) return;
                            handleDragStartFile(e, f);
                          }}
                          onDragEnd={handleDragEndFile}
                          onMouseEnter={(e) => {
                            if (!isSolutionBundle || isExpanded || isCollapsingSolution) return;
                            void loadPyFileContent(f);
                            openSolutionHoverPreview(e, f, {
                              title: solutionTitle,
                              taskLabel: solutionTaskLabel,
                              snapshotUrl: memorySnapshotUrl,
                              memory,
                            });
                          }}
                          onMouseLeave={() => {
                            if (isSolutionBundle) setSolutionHoverPreview(null);
                          }}
                          onFocus={(e) => {
                            if (!isSolutionBundle || isExpanded || isCollapsingSolution) return;
                            void loadPyFileContent(f);
                            openSolutionHoverPreview(e, f, {
                              title: solutionTitle,
                              taskLabel: solutionTaskLabel,
                              snapshotUrl: memorySnapshotUrl,
                              memory,
                            });
                          }}
                          onBlur={() => {
                            if (isSolutionBundle) setSolutionHoverPreview(null);
                          }}
                          onClick={(e) => {
                            const selection = typeof window !== 'undefined' ? window.getSelection?.() : null;
                            if (e.target.closest?.('.notes-code-selectable') && selection && !selection.isCollapsed) {
                              return;
                            }
                            setSelectedFolderId(null);
                            setPressingFolderId(null);
                            if (e.ctrlKey || e.metaKey) {
                              if (!manageable) return;
                              setSelectedFileIds((prev) => {
                                const next = { ...(prev || {}) };
                                if (next[f.id]) delete next[f.id];
                                else next[f.id] = true;
                                return next;
                              });
                              return;
                            }
                            setSelectedFileIds({ [f.id]: true });
                            if (isPreviewable) toggleFilePreview(f);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && isPreviewable) {
                              e.preventDefault();
                              toggleFilePreview(f);
                              return;
                            }
                            if (e.key === ' ') {
                              e.preventDefault();
                              setSelectedFolderId(null);
                              setPressingFolderId(null);
                              setSelectedFileIds({ [f.id]: true });
                            }
                          }}
                          role="button"
                          tabIndex={renamingId === f.id ? -1 : 0}
                          aria-expanded={isPreviewable ? isPreviewVisuallyOpen : undefined}
                          aria-controls={isPreviewable ? previewElementId : undefined}
                          title={isMemoryCodeCard ? solutionActionTitle : (isPreviewable ? 'Один клик — открыть файл' : 'Выделить файл')}
                        >
                          <td className="notes-resource-card__identity px-3 py-2.5">
                            <div className="flex min-w-[260px] items-center gap-3">
                              {isCheatsheet ? (
                                <span className={`notes-cheatsheet-icon ${isPreviewVisuallyOpen ? 'is-open' : ''}`}>
                                  <PythonLogoIcon size={23} colored />
                                </span>
                              ) : isSolutionBundle ? (
                                <span className={`notes-solution-bundle-icon ${isPreviewVisuallyOpen ? 'is-open' : ''}`}>
                                  <span className="relative flex h-7 w-7 items-center justify-center">
                                    <BookOpen size={22} strokeWidth={2.1} />
                                    <Code2 size={15} strokeWidth={2.3} className="absolute -bottom-1 -right-1 rounded-md bg-white p-0.5 text-blue-600 shadow-sm" />
                                  </span>
                                  <span className="notes-solution-bundle-icon__state" aria-hidden="true" />
                                </span>
                              ) : (
                                <FileIcon name={f.name} compact />
                              )}
                              <div className="min-w-0">
                                {renamingId === f.id ? (
                                  <div className="flex items-center gap-1 w-full">
                                    <input
                                      value={renameBase}
                                      onChange={(e) => setRenameBase(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveRename(f);
                                        if (e.key === 'Escape') cancelRename();
                                      }}
                                      onBlur={() => {
                                        if (!isRenaming) saveRename(f);
                                      }}
                                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500"
                                      autoFocus
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    {renameExt ? (
                                      <span className="text-sm text-gray-500 select-none">.{renameExt}</span>
                                    ) : null}
                                  </div>
                                ) : (
                                  <>
                                    {isCheatsheet ? (
                                      <div className="notes-cheatsheet-row-title min-w-0 space-y-1">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                          <span className="notes-explorer-file-name block truncate text-base font-extrabold text-slate-900">
                                            {solutionTitle}
                                          </span>
                                          <span className="notes-cheatsheet-row-badge">
                                            Шпаргалка
                                          </span>
                                          {showFavoriteBadge && (
                                            <span className={`notes-favorite-row-badge ${favoriteMotion === 'removing' ? 'is-leaving' : ''}`}>
                                              <Star size={12} fill="currentColor" strokeWidth={2.2} />
                                              Важное
                                            </span>
                                          )}
                                          {isSharedFile && (
                                            <span className={`notes-shared-row-badge ${isSharedTemplate ? 'is-template' : ''}`}>
                                              {isSharedTemplate
                                                ? <Sparkles size={12} strokeWidth={2.2} />
                                                : <Users size={12} strokeWidth={2.2} />}
                                              {isSharedTemplate ? 'Шаблон' : 'Общее'}
                                            </span>
                                          )}
                                        </div>
                                        {inlineCodePreview && (
                                          <span
                                            className="notes-code-inline-preview notes-code-selectable"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Code2 size={12} strokeWidth={2.3} />
                                            <span>{inlineCodePreview}</span>
                                          </span>
                                        )}
                                      </div>
                                    ) : isSolutionBundle ? (
                                      <div className="notes-solution-row-title min-w-0 space-y-1">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                          <span className="notes-explorer-file-name block truncate text-base font-extrabold text-slate-900">
                                            {solutionTitle}
                                          </span>
                                          <span
                                             className={`notes-solution-row-state ${isPreviewVisuallyOpen ? 'is-open' : ''}`}
                                            aria-hidden="true"
                                          >
                                            <ChevronRight size={14} className="notes-solution-row-state__chevron" />
                                            <span className="notes-solution-row-state__track">
                                              <span />
                                              <span />
                                            </span>
                                          </span>
                                          {showFavoriteBadge && (
                                            <span className={`notes-favorite-row-badge ${favoriteMotion === 'removing' ? 'is-leaving' : ''}`}>
                                              <Star size={12} fill="currentColor" strokeWidth={2.2} />
                                              Важное
                                            </span>
                                          )}
                                          {isSharedFile && (
                                            <span className={`notes-shared-row-badge ${isSharedTemplate ? 'is-template' : ''}`}>
                                              {isSharedTemplate
                                                ? <Sparkles size={12} strokeWidth={2.2} />
                                                : <Users size={12} strokeWidth={2.2} />}
                                              {isSharedTemplate ? 'Шаблон' : 'Общее'}
                                            </span>
                                          )}
                                        </div>
                                        {inlineCodePreview && (
                                          <span
                                            className="notes-code-inline-preview notes-code-selectable"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Code2 size={12} strokeWidth={2.3} />
                                            <span>{inlineCodePreview}</span>
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="notes-explorer-file-name block truncate font-medium text-slate-800">{f.name}</span>
                                    )}
                                    {addedAtLabel && (
                                      <span className="notes-explorer-file-added-at block truncate text-xs text-slate-400">
                                        Добавлен: {addedAtLabel}
                                      </span>
                                    )}
                                    {!isSolutionBundle && !isCheatsheet && (isSharedFile || sourceLabel || runLabel || hasBoardSnapshot) && (
                                      <span className="mt-1 flex flex-wrap gap-1">
                                        {isSharedFile && (
                                          <span className={`notes-shared-row-badge ${isSharedTemplate ? 'is-template' : ''}`}>
                                            {isSharedTemplate
                                              ? <Sparkles size={12} strokeWidth={2.2} />
                                              : <Users size={12} strokeWidth={2.2} />}
                                            {isSharedTemplate ? 'Шаблон' : 'Общее'}
                                          </span>
                                        )}
                                        {sourceLabel && (
                                          <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                            {sourceLabel}
                                          </span>
                                        )}
                                        {hasBoardSnapshot && (
                                          <span className="rounded-full border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">
                                            Снимок доски
                                          </span>
                                        )}
                                        {runLabel && (
                                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
                                            memory?.lastRunHadError
                                              ? 'border-rose-200 bg-rose-50 text-rose-600'
                                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                          }`}>
                                            {runLabel}
                                          </span>
                                        )}
                                      </span>
                                    )}
                                    {isSearchMode && (
                                      <span className="notes-explorer-file-path block truncate text-xs">
                                        {f.folderPath ? `Папка: ${f.folderPath}` : ROOT_FOLDER_LABEL}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="notes-resource-card__meta px-3 py-2.5 text-slate-600">
                            <div className="flex flex-col gap-0.5">
                              <span className={isSolutionBundle || isCheatsheet ? 'font-bold text-slate-700' : ''}>
                                {isSolutionBundle ? 'Задание + решение' : (isCheatsheet ? 'Python' : f.size)}
                              </span>
                              {!isSearchMode && (
                                <span className="text-xs text-slate-400">
                                  {isCheatsheet && cheatsheetLineCount > 0
                                    ? `${cheatsheetLineCount} строк · ${f.size}`
                                    : (isSolutionBundle || isCheatsheet ? f.size : getFileTypeLabel(f))}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="notes-explorer-row-actions notes-resource-card__actions flex items-center justify-end gap-1.5">
                              {showFavoriteButton && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePinnedFile(f);
                                  }}
                                  className={`notes-explorer-file-action-btn notes-explorer-pin-btn rounded-md p-1.5 ${isPinned ? 'is-active' : ''} ${
                                    favoriteMotion === 'adding' ? 'is-adding' : ''
                                  } ${
                                    favoriteMotion === 'removing' ? 'is-removing' : ''
                                  }`}
                                  disabled={!manageable || isPinning}
                                  title={isPinned ? 'Убрать из важного' : 'Добавить в важное'}
                                  aria-pressed={isPinned}
                                  type="button"
                                >
                                  <Star size={16} fill={isPinned ? 'currentColor' : 'none'} />
                                </button>
                              )}
                              {canToggleTeacherShared && (
                                <div className="notes-explorer-share-mode-actions" role="group" aria-label="Тип материала">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleLessonSharedFile(f);
                                    }}
                                    className={`notes-explorer-file-action-btn notes-explorer-share-btn rounded-md p-1.5 ${isCommonShared ? 'is-active' : ''}`}
                                    title={isCommonShared
                                      ? 'Вернуть в личные материалы'
                                      : (isSharedTemplate ? 'Перенести в «Общее»' : 'Сделать общим для всех учеников')}
                                    aria-label={isCommonShared
                                      ? 'Вернуть в личные материалы'
                                      : (isSharedTemplate ? 'Перенести в Общее' : 'Сделать общим для всех учеников')}
                                    aria-pressed={isCommonShared}
                                    disabled={isCommonShared && !canReturnSharedFileToPersonal}
                                    type="button"
                                  >
                                    <Users size={16} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleLessonTemplateFile(f);
                                    }}
                                    className={`notes-explorer-file-action-btn notes-explorer-template-btn rounded-md p-1.5 ${isSharedTemplate ? 'is-active' : ''}`}
                                    title={isSharedTemplate
                                      ? 'Вернуть в личные материалы'
                                      : (isCommonShared ? 'Перенести в «Шаблоны»' : 'Сделать шаблоном')}
                                    aria-label={isSharedTemplate
                                      ? 'Вернуть в личные материалы'
                                      : (isCommonShared ? 'Перенести в Шаблоны' : 'Сделать шаблоном')}
                                    aria-pressed={isSharedTemplate}
                                    disabled={isSharedTemplate && !canReturnSharedFileToPersonal}
                                    type="button"
                                  >
                                    <Sparkles size={16} />
                                  </button>
                                </div>
                              )}
                              {isPyFile(f.name) && (
                                <CodeCopyButton
                                  copied={isCodeCopied}
                                  disabled={pyLoadingId === f.id || isEditingCurrentPy}
                                  onCopy={() => handleCopyCode(f, hasLoadedPyContent ? loadedSourceCode : undefined)}
                                  className="notes-explorer-code-copy-btn"
                                  compact
                                />
                              )}
                              {isPreviewable && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFilePreview(f);
                                  }}
                                  className={`notes-explorer-file-action-btn notes-explorer-folder-open-btn notes-explorer-open-action rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 ${isCheatsheet ? 'notes-cheatsheet-open-btn' : ''}`}
                                  title={isSolutionBundle || isCheatsheet ? solutionActionTitle : (isPreviewVisuallyOpen ? 'Скрыть предпросмотр' : 'Открыть предпросмотр')}
                                  aria-label={isSolutionBundle || isCheatsheet ? solutionActionTitle : (isPreviewVisuallyOpen ? 'Скрыть предпросмотр' : 'Открыть предпросмотр')}
                                  aria-expanded={isPreviewVisuallyOpen}
                                  aria-controls={previewElementId}
                                  type="button"
                                >
                                  <span className="notes-explorer-open-action__label">
                                    {isPreviewVisuallyOpen ? 'Скрыть' : 'Открыть'}
                                  </span>
                                  <ChevronRight
                                    className="notes-explorer-folder-open-chevron"
                                    size={16}
                                    style={{ transform: isPreviewVisuallyOpen ? 'rotate(90deg)' : undefined }}
                                  />
                                </button>
                              )}
                              {!isPyFile(f.name) && !(role === 'student' && isExcelFile(f.name)) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(f);
                                  }}
                                  className="notes-explorer-file-action-btn rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                  title="Скачать файл"
                                  type="button"
                                >
                                  <Download size={16} />
                                </button>
                              )}
                              {role === 'student' && (isExcelFile(f.name) || isTask26TextWorkbook) && (
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleLaunchWorkbookHelper(f);
                                    }}
                                    className="notes-explorer-file-action-btn notes-explorer-open-action !h-9 !w-auto !min-w-[104px] !gap-1.5 !rounded-xl !border !px-3 !py-1.5 !text-xs !font-extrabold !opacity-100 !shadow-sm transition disabled:!cursor-wait disabled:!opacity-70"
                                    disabled={isWorkbookHelperBusy}
                                    title="Открыть таблицу в Excel или LibreOffice через помощник"
                                    type="button"
                                  >
                                    <FileSpreadsheet size={15} className={isWorkbookHelperOpening ? 'animate-pulse' : ''} />
                                    <span>{isWorkbookHelperOpening ? 'Открываем…' : (isWorkbookSolution ? 'Продолжить' : 'Решать')}</span>
                                  </button>
                                  {isExcelFile(f.name) && <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleStartWorkbookAutoSync(f);
                                    }}
                                    className={`notes-explorer-file-action-btn !h-9 !w-auto !min-w-[104px] !gap-1.5 !rounded-xl !border !px-3 !py-1.5 !text-xs !font-bold !opacity-100 transition ${
                                      isWorkbookAutoSyncActive
                                        ? '!border-emerald-200 !bg-emerald-50 !text-emerald-700'
                                        : '!border-slate-200 !bg-white !text-slate-600 hover:!border-violet-200 hover:!text-violet-700'
                                    }`}
                                    disabled={Boolean(workbookAutoSyncStartingId) || isWorkbookAutoSyncActive}
                                    title={isWorkbookAutoSyncActive
                                      ? 'Платформа следит за сохранениями этого файла'
                                      : 'Открыть и отслеживать файл средствами браузера'}
                                    type="button"
                                  >
                                    {isWorkbookAutoSyncActive
                                      ? <Check size={15} />
                                      : <Download size={15} className={isWorkbookAutoSyncStarting ? 'animate-pulse' : ''} />}
                                    <span>{isWorkbookAutoSyncActive ? 'Подключён' : 'Через браузер'}</span>
                                  </button>}
                                </div>
                              )}
                              {manageable && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startRename(f);
                                  }}
                                  className="notes-explorer-file-action-btn rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                  title="Переименовать"
                                  type="button"
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                              {manageable && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(f);
                                  }}
                                  className="notes-explorer-file-action-btn notes-explorer-file-action-btn-danger rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                                  title="Удалить файл"
                                  type="button"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isPyFile(f.name) && (
                          <tr
                            id={previewElementId}
                            className={`${expandedPyIds[f.id] ? 'notes-generic-preview-row' : 'hidden'} ${isCollapsingPreview ? 'is-closing' : ''} ${isSolutionBundle ? `notes-solution-preview-row ${isCollapsingSolution ? 'is-closing' : ''}` : ''} ${isCheatsheet ? `notes-cheatsheet-preview-row ${isCollapsingCheatsheet ? 'is-closing' : ''}` : ''}`}
                            aria-hidden={isCollapsingPreview || undefined}
                            inert={isCollapsingPreview}
                          >
                            <td colSpan={3} className={`notes-explorer-preview-cell notes-generic-preview-cell border-t border-slate-100 bg-white px-3 py-3 ${isCollapsingPreview ? 'is-closing' : ''} ${isSolutionBundle ? `notes-solution-preview-cell ${isCollapsingSolution ? 'is-closing' : ''}` : ''} ${isCheatsheet ? `notes-cheatsheet-preview-cell ${isCollapsingCheatsheet ? 'is-closing' : ''}` : ''}`}>
                              <div className={`notes-generic-preview-reveal ${isCollapsingPreview ? 'is-closing' : ''}`}>
                                <div className="notes-generic-preview-reveal__content">
                                  <div className={`notes-explorer-preview-panel notes-generic-preview-panel ${isCollapsingPreview ? 'is-closing' : ''} ${isSolutionBundle ? `notes-solution-preview-panel ${isCollapsingSolution ? 'is-closing' : ''}` : (isCheatsheet ? `notes-cheatsheet-preview-panel ${isCollapsingCheatsheet ? 'is-closing' : ''}` : 'space-y-3 rounded-xl border border-slate-200 bg-white p-2')}`}>
                                {isContentSearchTarget && (
                                  <div className="notes-content-search-match" role="status">
                                    <Search size={14} aria-hidden="true" />
                                    <span>Найдено в содержимом:</span>
                                    <code>{contentMatchQuery}</code>
                                  </div>
                                )}
                                {!isSolutionBundle && !isCheatsheet && (
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                                      {isEditingCurrentPy ? `Размер: ${formatBytes(getPyFileSize(pyEditDraft))}` : 'Просмотр Python'}
                                    </span>
                                    {isEditingCurrentPy ? (
                                      <div className="flex w-full sm:w-auto items-center gap-2">
                                        <Button
                                          variant="secondary"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            cancelEditingPyFile();
                                          }}
                                          disabled={pyEditSaving}
                                          className="w-full sm:w-auto"
                                        >
                                          Отмена
                                        </Button>
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            saveEditingPyFile(f);
                                          }}
                                          disabled={pyEditSaving}
                                          className="w-full sm:w-auto"
                                        >
                                          {pyEditSaving ? 'Сохранение...' : 'Сохранить'}
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        variant="secondary"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          startEditingPyFile(f);
                                        }}
                                        disabled={pyLoadingId === f.id || Boolean(pyError[f.id]) || !manageable}
                                        className="w-full sm:w-auto"
                                      >
                                        Редактировать
                                      </Button>
                                    )}
                                  </div>
                                )}
                                {!isSolutionBundle && !isCheatsheet && (
                                  <div className={`notes-explorer-memory-card grid gap-3 rounded-xl border p-3 ${
                                    memory
                                      ? 'border-teal-100 bg-teal-50/60 md:grid-cols-[minmax(0,1fr)_220px]'
                                      : 'border-slate-200 bg-slate-50'
                                  }`}>
                                      <div className="min-w-0 space-y-2">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className={`rounded-full border bg-white px-2 py-1 text-[11px] font-bold ${
                                            memory ? 'border-teal-200 text-teal-700' : 'border-slate-200 text-slate-600'
                                          }`}>
                                            Карточка-память
                                          </span>
                                          {sourceLabel && (
                                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                                              {sourceLabel}
                                            </span>
                                          )}
                                          {memory?.savedBy?.name && (
                                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                                              Сохранил: {memory.savedBy.name}
                                            </span>
                                          )}
                                          {runLabel && (
                                            <span className={`rounded-full border bg-white px-2 py-1 text-[11px] font-semibold ${
                                              memory?.lastRunHadError
                                                ? 'border-rose-200 text-rose-600'
                                                : 'border-emerald-200 text-emerald-700'
                                            }`}>
                                              {runLabel}
                                            </span>
                                          )}
                                        </div>
                                        {!memory && (
                                          <p className="text-sm font-medium text-slate-500">
                                            Для этого файла пока сохранён только код.
                                          </p>
                                        )}
                                        {memory?.description && (
                                          <p className="text-sm font-medium text-slate-700">{memory.description}</p>
                                        )}
                                        {memory?.lastRunOutput && (
                                          <div className="rounded-lg border border-slate-200 bg-white">
                                            <div className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                              Последний вывод
                                            </div>
                                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap px-3 py-2 text-xs leading-5 text-slate-700">{memory.lastRunOutput}</pre>
                                          </div>
                                        )}
                                      </div>
                                      {memorySnapshotUrl && (
                                        <a
                                          href={memorySnapshotUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="group block overflow-hidden rounded-xl border border-teal-100 bg-white"
                                          onClick={(e) => e.stopPropagation()}
                                          title="Открыть снимок доски"
                                        >
                                          <img
                                            src={memorySnapshotUrl}
                                            alt="Снимок видимой области доски"
                                            className="h-36 w-full object-cover transition group-hover:scale-[1.02]"
                                          />
                                          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-teal-700">
                                            Видимая область доски
                                          </div>
                                        </a>
                                      )}
                                    </div>
                                )}
                                {!isSolutionBundle && !isCheatsheet && isEditingCurrentPy ? (
                                  <div className="space-y-2">
                                    <div className="overflow-hidden rounded-xl border border-gray-800">
                                      <Editor
                                        height={pyFileEditorHeight}
                                        language="python"
                                        theme={monacoTheme}
                                        beforeMount={ensureMonacoColorTheme}
                                        value={pyEditDraft}
                                        onChange={(value) => {
                                          setPyEditDraft(value ?? '');
                                          if (pyEditError) setPyEditError('');
                                          if (pyRunOutput) setPyRunOutput('');
                                          if (pyRunError) setPyRunError('');
                                        }}
                                        options={pyEditorOptions}
                                        loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                                      />
                                    </div>
                                    <div className="notes-explorer-console-panel space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <span className="text-xs font-semibold text-gray-600">
                                          Консоль (IDLE): редактируйте секцию `{PY_IDLE_STDIN_HEADER}`
                                        </span>
                                        <Button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRunEditedPyFile();
                                          }}
                                          disabled={pyRunLoading || pyEditSaving}
                                          className="w-full sm:w-auto"
                                        >
                                          {pyRunLoading ? 'Запуск...' : 'Запустить'}
                                        </Button>
                                      </div>
                                      <textarea
                                        value={pyIdleConsoleText}
                                        onChange={(e) => {
                                          setPyRunInput(parseIdleConsoleInput(e.target.value, pyRunInput));
                                        }}
                                        readOnly={pyRunLoading}
                                        spellCheck={false}
                                        className="notes-explorer-console-input min-h-[220px] w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-purple-500"
                                      />
                                    </div>
                                  </div>
                                ) : isSolutionBundle ? (
                                  <div className={`notes-solution-workspace ${memorySnapshotUrl ? 'has-task' : ''}`}>
                                    {memorySnapshotUrl ? (
                                      <section className="notes-solution-pane notes-solution-pane--task">
                                        <div className="notes-solution-pane__bar">
                                          <div className="notes-solution-pane__title">
                                            <BookOpen size={16} className="text-blue-600" />
                                            Условие
                                          </div>
                                          <a
                                            href={memorySnapshotUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="notes-solution-pane__link"
                                          >
                                            Открыть отдельно
                                          </a>
                                        </div>
                                        <div onClick={(e) => e.stopPropagation()}>
                                          <ImageViewer
                                            src={memorySnapshotUrl}
                                            alt="Условие задания"
                                            maxHeight="clamp(430px, 58vh, 660px)"
                                            fitScaleMultiplier={1.22}
                                          />
                                        </div>
                                      </section>
                                    ) : (
                                      <section className="notes-solution-pane notes-solution-pane--empty">
                                        <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                                          <BookOpen size={16} />
                                          Условие не прикреплено
                                        </div>
                                      </section>
                                    )}
                                    <section className="notes-solution-pane notes-solution-pane--code">
                                      <div className="notes-solution-pane__bar">
                                        <div className="notes-solution-pane__title">
                                          <Code2 size={16} className="text-violet-600" />
                                          Решение
                                        </div>
                                        {isEditingCurrentPy ? (
                                          <div className="notes-solution-pane__actions">
                                            <Button
                                              variant="secondary"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                cancelEditingPyFile();
                                              }}
                                              disabled={pyEditSaving}
                                              className="notes-solution-pane__button"
                                            >
                                              Отмена
                                            </Button>
                                            <Button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                saveEditingPyFile(f);
                                              }}
                                              disabled={pyEditSaving}
                                              className="notes-solution-pane__button"
                                            >
                                              {pyEditSaving ? 'Сохранение...' : 'Сохранить'}
                                            </Button>
                                          </div>
                                        ) : (
                                          <div className="notes-solution-pane__actions">
                                            <span className="notes-solution-pane__pill">
                                              Python
                                            </span>
                                            <CodeCopyButton
                                              copied={isCodeCopied}
                                              disabled={!canCopyLoadedCode}
                                              onCopy={() => handleCopyCode(f, loadedSourceCode)}
                                              className="notes-solution-pane__button"
                                            />
                                            <Button
                                              variant="secondary"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                startEditingPyFile(f);
                                              }}
                                              disabled={pyLoadingId === f.id || Boolean(pyError[f.id]) || !manageable}
                                              className="notes-solution-pane__button notes-solution-pane__edit-action"
                                            >
                                              Редактировать код
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                      <div className={`notes-solution-code-body ${isEditingCurrentPy ? 'is-editing' : 'is-viewing'}`}>
                                        {isEditingCurrentPy ? (
                                          <div className="notes-solution-editor-wrap" onClick={(e) => e.stopPropagation()}>
                                            <Editor
                                              height={solutionPyEditorHeight}
                                              language="python"
                                              theme={monacoTheme}
                                              beforeMount={ensureMonacoColorTheme}
                                              value={pyEditDraft}
                                              onChange={(value) => {
                                                setPyEditDraft(value ?? '');
                                                if (pyEditError) setPyEditError('');
                                              }}
                                              options={{
                                                ...pyEditorOptions,
                                                fontSize: 15,
                                                lineHeight: 24,
                                              }}
                                              loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                                            />
                                            {pyEditError && (
                                              <p className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                                                {pyEditError}
                                              </p>
                                            )}
                                          </div>
                                        ) : (
                                          <>
                                            {pyLoadingId === f.id && (
                                              <pre className="notes-python-code notes-code-selectable language-python m-0 p-4 text-sm"><code>Загрузка...</code></pre>
                                            )}
                                            {pyLoadingId !== f.id && pyError[f.id] && (
                                              <pre className="notes-python-code notes-code-selectable language-python m-0 p-4 text-sm"><code>{pyError[f.id]}</code></pre>
                                            )}
                                            {pyLoadingId !== f.id && !pyError[f.id] && (
                                              pyContent[f.id]
                                                ? (
                                                  <pre className="notes-python-code notes-code-selectable language-python m-0 p-4 text-sm leading-6">
                                                    <code dangerouslySetInnerHTML={{ __html: highlightPython(pyContent[f.id]) }} />
                                                  </pre>
                                                )
                                                : (
                                                  <pre className="notes-python-code notes-code-selectable language-python m-0 p-4 text-sm"><code># Пустой файл</code></pre>
                                                )
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </section>
                                  </div>
                                ) : isCheatsheet ? (
                                  <section className="notes-cheatsheet-card">
                                    <div className="notes-cheatsheet-card__header">
                                      <div className="notes-cheatsheet-card__identity" title={cheatsheetMetaTitle}>
                                        <span className="notes-cheatsheet-card__icon" aria-hidden="true">
                                          <PythonLogoIcon size={22} colored />
                                        </span>
                                        <div className="notes-cheatsheet-card__body">
                                          <div className="notes-cheatsheet-card__title-line">
                                            <h4 className="notes-cheatsheet-card__title">{solutionTitle}</h4>
                                            {solutionTaskDisplay && (
                                              <span className="notes-cheatsheet-card__task-chip" title={solutionTaskLabel}>
                                                <BookOpen size={12} strokeWidth={2.4} />
                                                №{solutionTaskDisplay}
                                              </span>
                                            )}
                                          </div>
                                          <div className="notes-cheatsheet-card__meta-line">
                                            <span className="notes-cheatsheet-card__mode-badge">Шпаргалка</span>
                                            {sourceLabel && sourceLabel !== 'Шпаргалка' && (
                                              <span className="notes-cheatsheet-card__meta-item">{sourceLabel}</span>
                                            )}
                                            {addedAtLabel && (
                                              <span className="notes-cheatsheet-card__meta-item">Сохранено {addedAtLabel}</span>
                                            )}
                                            {cheatsheetLineCount > 0 && (
                                              <span className="notes-cheatsheet-card__meta-item">Строк: {cheatsheetLineCount}</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      {isEditingCurrentPy ? (
                                        <div className="notes-cheatsheet-card__actions">
                                          <Button
                                            variant="secondary"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              cancelEditingPyFile();
                                            }}
                                            disabled={pyEditSaving}
                                            className="notes-cheatsheet-card__button notes-cheatsheet-card__action-button"
                                            title="Отмена"
                                            aria-label="Отмена"
                                          >
                                            <X size={15} strokeWidth={2.4} />
                                            <span>Отмена</span>
                                          </Button>
                                          <Button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              saveEditingPyFile(f);
                                            }}
                                            disabled={pyEditSaving}
                                            className="notes-cheatsheet-card__button notes-cheatsheet-card__action-button notes-cheatsheet-card__save"
                                            title={pyEditSaving ? 'Сохранение...' : 'Сохранить'}
                                            aria-label={pyEditSaving ? 'Сохранение...' : 'Сохранить'}
                                          >
                                            <Check size={15} strokeWidth={2.5} />
                                            <span>{pyEditSaving ? 'Сохраняем...' : 'Сохранить'}</span>
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="notes-cheatsheet-card__actions">
                                          <CodeCopyButton
                                            copied={isCodeCopied}
                                            disabled={!canCopyLoadedCode}
                                            onCopy={() => handleCopyCode(f, cheatsheetSourceCode)}
                                            className="notes-cheatsheet-card__button notes-cheatsheet-card__action-button notes-cheatsheet-card__copy"
                                          />
                                          <Button
                                            variant="secondary"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              startEditingPyFile(f);
                                            }}
                                            disabled={pyLoadingId === f.id || Boolean(pyError[f.id]) || !manageable}
                                            className="notes-cheatsheet-card__button notes-cheatsheet-card__action-button notes-cheatsheet-card__edit"
                                            title="Редактировать код"
                                            aria-label="Редактировать код"
                                          >
                                            <Pencil size={14} strokeWidth={2.3} />
                                            <span>Редактировать</span>
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                    <div className={`notes-cheatsheet-code ${isEditingCurrentPy ? 'is-editing' : 'is-viewing'}`}>
                                      <div className="notes-cheatsheet-code__toolbar">
                                        <span className="notes-cheatsheet-code__language">
                                          <PythonLogoIcon size={16} colored />
                                          Python
                                        </span>
                                        <span className="notes-cheatsheet-code__status">
                                          {isEditingCurrentPy
                                            ? 'Режим редактирования'
                                            : (cheatsheetLineCount > 0 ? `${cheatsheetLineCount} строк` : 'Пустая шпаргалка')}
                                        </span>
                                      </div>
                                      {isEditingCurrentPy ? (
                                        <div className="notes-cheatsheet-editor" onClick={(e) => e.stopPropagation()}>
                                          <Editor
                                            height={solutionPyEditorHeight}
                                            language="python"
                                            theme={monacoTheme}
                                            beforeMount={ensureMonacoColorTheme}
                                            value={pyEditDraft}
                                            onChange={(value) => {
                                              setPyEditDraft(value ?? '');
                                              if (pyEditError) setPyEditError('');
                                            }}
                                            options={{
                                              ...pyEditorOptions,
                                              fontSize: 15,
                                              lineHeight: 24,
                                            }}
                                            loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                                          />
                                          {pyEditError && (
                                            <p className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                                              {pyEditError}
                                            </p>
                                          )}
                                        </div>
                                      ) : (
                                        <>
                                          {pyLoadingId === f.id && (
                                            <pre className="notes-python-code notes-code-selectable language-python m-0 p-4 text-sm"><code>Загрузка...</code></pre>
                                          )}
                                          {pyLoadingId !== f.id && pyError[f.id] && (
                                            <pre className="notes-python-code notes-code-selectable language-python m-0 p-4 text-sm"><code>{pyError[f.id]}</code></pre>
                                          )}
                                          {pyLoadingId !== f.id && !pyError[f.id] && (
                                            cheatsheetSourceCode.trim()
                                              ? (
                                                <pre className="notes-python-code notes-python-code--numbered notes-code-selectable language-python m-0 p-4 text-sm leading-6">
                                                  <code>
                                                    {getHighlightedPythonLines(cheatsheetSourceCode, highlightPython).map((lineHtml, index) => {
                                                      const rawLine = cheatsheetSourceLines[index] || '';
                                                      const isMatchedLine = normalizedContentMatchQuery
                                                        && rawLine.toLocaleLowerCase('ru-RU').includes(normalizedContentMatchQuery);
                                                      return (
                                                      <span className={`notes-python-code__line ${isMatchedLine ? 'is-search-match' : ''}`} key={`cheatsheet-line-${index}`}>
                                                        <span className="notes-python-code__line-number">{index + 1}</span>
                                                        <span
                                                          className="notes-python-code__line-content"
                                                          dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
                                                        />
                                                      </span>
                                                      );
                                                    })}
                                                  </code>
                                                </pre>
                                              )
                                              : (
                                                <pre className="notes-python-code notes-code-selectable language-python m-0 p-4 text-sm"><code># Пустая шпаргалка</code></pre>
                                              )
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </section>
                                ) : (
                                  <div className="notes-code-preview-card">
                                    <div className="notes-code-preview-toolbar">
                                      <span className="notes-code-preview-language">
                                        <PythonLogoIcon size={16} colored />
                                        Python
                                      </span>
                                      <CodeCopyButton
                                        copied={isCodeCopied}
                                        disabled={!canCopyLoadedCode}
                                        onCopy={() => handleCopyCode(f, loadedSourceCode)}
                                      />
                                    </div>
                                    <div className="max-h-[55vh] overflow-auto">
                                      {pyLoadingId === f.id && (
                                        <pre className="notes-python-code notes-code-selectable language-python m-0 p-4 text-sm"><code>Загрузка...</code></pre>
                                      )}
                                      {pyLoadingId !== f.id && pyError[f.id] && (
                                        <pre className="notes-python-code notes-code-selectable language-python m-0 p-4 text-sm"><code>{pyError[f.id]}</code></pre>
                                      )}
                                      {pyLoadingId !== f.id && !pyError[f.id] && (
                                        pyContent[f.id]
                                          ? (
                                            <pre className="notes-python-code notes-code-selectable language-python m-0 p-4 text-sm">
                                              <code dangerouslySetInnerHTML={{ __html: highlightPython(pyContent[f.id]) }} />
                                            </pre>
                                          )
                                          : (
                                            <pre className="notes-python-code notes-code-selectable language-python m-0 p-4 text-sm"><code># Пустой файл</code></pre>
                                          )
                                      )}
                                    </div>
                                  </div>
                                )}
                                {!isSolutionBundle && !isCheatsheet && editingPyId === f.id && pyEditError && (
                                  <p className="text-xs text-red-500">{pyEditError}</p>
                                )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        {isPdfFile(f.name) && (
                          <tr
                            id={previewElementId}
                            className={`${expandedPdfIds[f.id] ? 'notes-generic-preview-row' : 'hidden'} ${isCollapsingPreview ? 'is-closing' : ''}`}
                            aria-hidden={isCollapsingPreview || undefined}
                            inert={isCollapsingPreview}
                          >
                            <td colSpan={3} className={`notes-explorer-preview-cell notes-generic-preview-cell border-t border-slate-100 bg-white px-3 py-3 ${isCollapsingPreview ? 'is-closing' : ''}`}>
                              <div className={`notes-generic-preview-reveal ${isCollapsingPreview ? 'is-closing' : ''}`}>
                                <div className="notes-generic-preview-reveal__content">
                                  <div className={`notes-explorer-preview-panel notes-generic-preview-panel overflow-hidden rounded-xl border border-slate-200 bg-white ${isCollapsingPreview ? 'is-closing' : ''}`}>
                                    {isContentSearchTarget && (
                                      <div className="notes-content-search-match" role="status">
                                        <Search size={14} aria-hidden="true" />
                                        <span>Найдено в содержимом:</span>
                                        <code>{contentMatchQuery}</code>
                                      </div>
                                    )}
                                    <iframe
                                      title={f.name}
                                      src={getFileUrl(f)}
                                      className="w-full"
                                      style={{ height: pdfPreviewHeight }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        {isImageFile(f) && (
                          <tr
                            id={previewElementId}
                            className={`${expandedImageIds[f.id] ? 'notes-generic-preview-row' : 'hidden'} ${isCollapsingPreview ? 'is-closing' : ''}`}
                            aria-hidden={isCollapsingPreview || undefined}
                            inert={isCollapsingPreview}
                          >
                            <td colSpan={3} className={`notes-explorer-preview-cell notes-generic-preview-cell border-t border-slate-100 bg-white px-3 py-3 ${isCollapsingPreview ? 'is-closing' : ''}`}>
                              <div className={`notes-generic-preview-reveal ${isCollapsingPreview ? 'is-closing' : ''}`}>
                                <div className="notes-generic-preview-reveal__content">
                                  <div className={`notes-generic-preview-panel ${isCollapsingPreview ? 'is-closing' : ''}`}>
                                    <ImageViewer
                                      src={getFileUrl(f)}
                                      alt={f.name || 'Изображение'}
                                      maxHeight={imagePreviewMaxHeight}
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        {isTextFile(f.name) && (
                          <tr
                            id={previewElementId}
                            className={`${expandedTextIds[f.id] ? 'notes-generic-preview-row' : 'hidden'} ${isCollapsingPreview ? 'is-closing' : ''}`}
                            aria-hidden={isCollapsingPreview || undefined}
                            inert={isCollapsingPreview}
                          >
                            <td colSpan={3} className={`notes-explorer-preview-cell notes-generic-preview-cell border-t border-slate-100 bg-white px-3 py-3 ${isCollapsingPreview ? 'is-closing' : ''}`}>
                              <div className={`notes-generic-preview-reveal ${isCollapsingPreview ? 'is-closing' : ''}`}>
                                <div className="notes-generic-preview-reveal__content">
                                  <div className={`notes-explorer-preview-panel notes-generic-preview-panel overflow-hidden rounded-xl border border-slate-200 bg-white ${isCollapsingPreview ? 'is-closing' : ''}`}>
                                    <iframe
                                      title={f.name}
                                      src={getFileUrl(f)}
                                      className="w-full bg-white"
                                      style={{ height: pdfPreviewHeight }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      </section>
      {solutionHoverPreview && !expandedPyIds[solutionHoverPreview.fileId] && !collapsingSolutionIds[solutionHoverPreview.fileId] && typeof document !== 'undefined' && createPortal(
        <div
          className="notes-solution-hover-preview"
          aria-hidden="true"
          style={{
            left: `${solutionHoverPreview.left}px`,
            top: `${solutionHoverPreview.top}px`,
            width: `${solutionHoverPreview.width}px`,
          }}
        >
          <div className="notes-solution-hover-preview__header">
            <span>{solutionHoverPreview.title}</span>
            <span>{solutionHoverPreview.taskLabel}</span>
          </div>
          <div className="notes-solution-hover-preview__body">
            <div className="notes-solution-hover-preview__task">
              {solutionHoverPreview.snapshotUrl ? (
                <img src={solutionHoverPreview.snapshotUrl} alt="" loading="lazy" />
              ) : (
                <span>Условие не прикреплено</span>
              )}
            </div>
            <pre className="notes-solution-hover-preview__code">{solutionHoverCode}</pre>
          </div>
        </div>,
        document.body
      )}
      {codeCopyFeedback && typeof document !== 'undefined' && createPortal(
        <div
          className={`notes-code-copy-toast ${codeCopyFeedback.status === 'error' ? 'is-error' : 'is-success'}`}
          role="status"
          aria-live="polite"
        >
          {codeCopyFeedback.status === 'error' ? (
            <X size={17} strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <Check size={17} strokeWidth={2.7} aria-hidden="true" />
          )}
          <span>{codeCopyFeedback.message}</span>
        </div>,
        document.body
      )}
    </div>
  );
};

export default NotesSection;



