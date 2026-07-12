import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Code2,
  Download,
  FileText,
  FolderOpen,
  PlayCircle,
  RefreshCcw,
  RotateCcw,
  Sparkles,
  TestTube2,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { api } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import TheoryRecordingPlayer from './TheoryRecordingPlayer';
import { Button } from './ui';
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from '../utils/monacoTheme';
import { THEME_DARK, normalizeTheme } from '../utils/theme';
import {
  buildPythonSubsectionModel,
  getPythonTaskEntry,
  PYTHON_DEFAULT_SUBSECTION_ID,
} from '../utils/pythonSubsections';
import {
  formatRecordingDuration,
  normalizeTheoryRecording,
  THEORY_RECORDING_TYPE,
} from '../utils/theoryRecording';
import { getCollabWsUrl } from '../utils/runtimeUrls';

const QUESTION_CODE_SAVE_DEBOUNCE_MS = 250;
const COLLAB_SEED_DELAY_MS = 450;

const hashSeed = (value) => {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickCollabColor = (seed, fallback = '#7c3aed') => {
  const palette = ['#7c3aed', '#0ea5e9', '#f59e0b', '#ef4444', '#22c55e', '#ec4899', '#6366f1'];
  if (!seed) return fallback;
  return palette[hashSeed(seed) % palette.length] || fallback;
};

const getAwarenessPeerCount = (provider) => {
  const size = provider?.awareness?.getStates?.().size;
  if (!Number.isFinite(Number(size))) return 0;
  return Math.max(0, Number(size) - 1);
};

const normalizeCodeText = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '');
};

const collapseDuplicatedCode = (value) => {
  const text = normalizeCodeText(typeof value === 'string' ? value : String(value ?? ''));
  if (text.length < 40) return text;
  for (let parts = 2; parts <= 3; parts += 1) {
    if (text.length % parts !== 0) continue;
    const chunkLength = text.length / parts;
    if (chunkLength < 20) continue;
    const chunk = text.slice(0, chunkLength);
    let duplicated = true;
    for (let index = 1; index < parts; index += 1) {
      if (text.slice(index * chunkLength, (index + 1) * chunkLength) !== chunk) {
        duplicated = false;
        break;
      }
    }
    if (duplicated) return chunk;
  }
  return text;
};

const buildRealtimeStatusLabel = (status) => {
  if (status === 'connected') return 'Realtime: онлайн';
  if (status === 'connecting') return 'Realtime: подключение...';
  return 'Realtime: офлайн';
};

const normalizeTheorySubsectionId = (value) => {
  const id = String(value || '').trim();
  return id || PYTHON_DEFAULT_SUBSECTION_ID;
};

const getRuntimeViewportWidth = () => {
  if (typeof window === 'undefined') return 1440;
  const visualViewportWidth = Number(window.visualViewport?.width || 0);
  if (Number.isFinite(visualViewportWidth) && visualViewportWidth > 0) return visualViewportWidth;
  const innerWidth = Number(window.innerWidth || document?.documentElement?.clientWidth || 0);
  if (Number.isFinite(innerWidth) && innerWidth > 0) return innerWidth;
  return 1440;
};

const getRuntimeViewportHeight = () => {
  if (typeof window === 'undefined') return 900;
  const visualViewportHeight = Number(window.visualViewport?.height || 0);
  if (Number.isFinite(visualViewportHeight) && visualViewportHeight > 0) return visualViewportHeight;
  const innerHeight = Number(window.innerHeight || document?.documentElement?.clientHeight || 0);
  if (Number.isFinite(innerHeight) && innerHeight > 0) return innerHeight;
  return 900;
};

const THEORY_VARIANT_ORDER = [THEORY_RECORDING_TYPE, 'text', 'gdoc'];

const normalizeTheoryItem = (value, fallbackType = '') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const detectedType = String(value.type || fallbackType || '').trim();
  if (detectedType === THEORY_RECORDING_TYPE) {
    const recording = normalizeTheoryRecording(value.content);
    return recording ? { type: THEORY_RECORDING_TYPE, content: recording } : null;
  }
  if (detectedType === 'gdoc') {
    const content = String(value.content || '').trim();
    return content ? { type: 'gdoc', content } : null;
  }
  const content = String(value.content || '').trim();
  return content ? { type: 'text', content } : null;
};

const normalizeTheoryVariantMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const singleTheory = normalizeTheoryItem(value);
  if (singleTheory) {
    return { [singleTheory.type]: singleTheory };
  }
  const source = (
    value.variants
    && typeof value.variants === 'object'
    && !Array.isArray(value.variants)
  )
    ? value.variants
    : value;
  const variants = {};
  Object.entries(source).forEach(([rawType, rawTheory]) => {
    const normalizedType = String(rawType || '').trim();
    if (!normalizedType) return;
    const theoryLike = (
      rawTheory
      && typeof rawTheory === 'object'
      && !Array.isArray(rawTheory)
    )
      ? rawTheory
      : { type: normalizedType, content: rawTheory };
    const theory = normalizeTheoryItem(theoryLike, normalizedType);
    if (!theory) return;
    variants[theory.type] = theory;
  });
  return variants;
};

const normalizeTheoryBySubsectionMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = {};
  Object.entries(value).forEach(([rawId, theory]) => {
    const id = normalizeTheorySubsectionId(rawId);
    const variants = normalizeTheoryVariantMap(theory);
    if (!Object.keys(variants).length) return;
    entries[id] = variants;
  });
  return entries;
};

const pickTheoryVariantType = (variants, preferredType = '') => {
  if (!variants || typeof variants !== 'object') return '';
  const preferred = String(preferredType || '').trim();
  if (preferred && variants[preferred]) return preferred;
  return THEORY_VARIANT_ORDER.find((type) => Boolean(variants[type])) || '';
};

const getTheoryVariantList = (variants) => (
  THEORY_VARIANT_ORDER.filter((type) => Boolean(variants?.[type]))
);

const getTheoryTypeLabel = (type) => {
  if (type === THEORY_RECORDING_TYPE) return 'Видеоразбор';
  if (type === 'gdoc') return 'Google Docs';
  return 'Текст';
};

const getTheoryLauncherLabel = (type) => {
  if (type === THEORY_RECORDING_TYPE) return 'Видео';
  if (type === 'gdoc') return 'Google Docs';
  return 'Текст';
};

const resolveTheoryVariantsForSubsection = (taskEntry, subsectionId) => {
  const safeSubsectionId = normalizeTheorySubsectionId(subsectionId);
  const bySubsection = normalizeTheoryBySubsectionMap(taskEntry?.pythonTheoryBySubsection);
  if (bySubsection[safeSubsectionId]) return bySubsection[safeSubsectionId];
  if (safeSubsectionId !== PYTHON_DEFAULT_SUBSECTION_ID && bySubsection[PYTHON_DEFAULT_SUBSECTION_ID]) {
    return bySubsection[PYTHON_DEFAULT_SUBSECTION_ID];
  }
  return normalizeTheoryVariantMap(taskEntry?.pythonTheory);
};

const PythonTestModal = ({
  theme = '',
  task,
  onClose,
  onComplete,
  progress,
  studentId,
  testDb,
  initialQuestionIndex,
  onQuestionChange,
  onStreakSaved,
  onXpGain,
  PYTHON_LEVEL_ID,
  ensurePyodideReady,
  mergeRuntimeErrorText,
  createPyodideWorker,
  withStudentId,
  isGoogleDocEmbedUrl,
  normalizeOutput,
  PYODIDE_RUN_TIMEOUT_MS,
  ALLOW_MAIN_THREAD_PYTHON_FALLBACK,
  normalizeOutputForComparison,
  normalizeRuntimeErrorForCheck,
  getLocalDayKey,
  normalizeXpTotal,
  buildGoogleDocFullUrl,
  codeSyncRoomId = '',
}) => {
  const monacoTheme = resolveMonacoColorTheme(theme);
  const documentTheme = typeof document !== 'undefined'
    ? document.documentElement?.getAttribute('data-theme')
    : '';
  const isDarkTheme = normalizeTheme(theme || documentTheme) === THEME_DARK;
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedSubsectionId, setSelectedSubsectionId] = useState(PYTHON_DEFAULT_SUBSECTION_ID);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedCodeById, setSolvedCodeById] = useState({});
  const [questionCodeById, setQuestionCodeById] = useState({});
  const [questionCodeLoadingById, setQuestionCodeLoadingById] = useState({});
  const [questionCodeSavingById, setQuestionCodeSavingById] = useState({});
  const [questionCodeErrorById, setQuestionCodeErrorById] = useState({});
  const [questionCodeDirtyById, setQuestionCodeDirtyById] = useState({});
  const [expandedImage, setExpandedImage] = useState(null);
  const [runnerLoading, setRunnerLoading] = useState(false);
  const [runnerError, setRunnerError] = useState('');
  const [testResults, setTestResults] = useState([]);
  const [viewportWidth, setViewportWidth] = useState(() => getRuntimeViewportWidth());
  const [viewportHeight, setViewportHeight] = useState(() => getRuntimeViewportHeight());
  const [workspaceSplitRatio, setWorkspaceSplitRatio] = useState(0.62);
  const [isResizingWorkspace, setIsResizingWorkspace] = useState(false);
  const isMobileViewport = viewportWidth < 700;
  const [showTheory, setShowTheory] = useState(false);
  const [questionScrollState, setQuestionScrollState] = useState({ hasOverflow: false, atEnd: true });
  const [activeTheoryType, setActiveTheoryType] = useState('');
  const [editorReady, setEditorReady] = useState(false);
  const [editorMountVersion, setEditorMountVersion] = useState(0);
  const [realtimeStatus, setRealtimeStatus] = useState('disconnected');
  const [realtimePeerCount, setRealtimePeerCount] = useState(0);
  const [sharedRunState, setSharedRunState] = useState({
    status: 'idle',
    author: '',
    summary: '',
    ts: null,
  });

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const collabDocRef = useRef(null);
  const collabProviderRef = useRef(null);
  const collabAwarenessRef = useRef(null);
  const collabBindingRef = useRef(null);
  const collabYTextRef = useRef(null);
  const collabStateMapRef = useRef(null);
  const collabRunMapRef = useRef(null);

  const runnerWorkerRef = useRef(null);
  const runnerPendingRef = useRef(new Map());
  const runnerWarmupStartedRef = useRef(false);
  const runnerReadyRef = useRef(false);
  const runnerWarmupPromiseRef = useRef(null);
  const questionCodeByIdRef = useRef({});
  const questionCodeLoadingByIdRef = useRef({});
  const questionCodeSavingByIdRef = useRef({});
  const questionCodeRetrySaveByIdRef = useRef({});
  const questionCodeDirtyByIdRef = useRef({});
  const questionCodeLocalVersionRef = useRef({});
  const pendingSaveQuestionIdRef = useRef('');
  const saveTimerRef = useRef(null);
  const workspaceGridRef = useRef(null);
  const questionScrollBodyRef = useRef(null);
  const workspaceResizePointerIdRef = useRef(null);
  const runnerWarmupTimeoutMs = Math.max(PYODIDE_RUN_TIMEOUT_MS * 2, 20000);

  const currentMastery = progress[task.id] || 0;
  const taskEntry = useMemo(() => getPythonTaskEntry(testDb, task?.number), [testDb, task?.number]);
  const subsectionModel = useMemo(() => buildPythonSubsectionModel(taskEntry, PYTHON_LEVEL_ID), [taskEntry, PYTHON_LEVEL_ID]);
  const collabBaseRoomId = String(codeSyncRoomId || '').trim();
  const collabWsUrl = useMemo(() => getCollabWsUrl(), []);
  const localCollabName = useMemo(() => 'Ученик', []);
  const localCollabColor = useMemo(
    () => pickCollabColor(`student-${studentId || 'anon'}`, '#0ea5e9'),
    [studentId]
  );
  const activeQuestionId = useMemo(
    () => String(questions[currentIndex]?.id ?? '').trim(),
    [questions, currentIndex]
  );
  const currentQuestionScrollText = typeof questions[currentIndex]?.question === 'string'
    ? questions[currentIndex].question
    : '';
  const activeQuestionCodeLoaded = Boolean(questionCodeById?.[activeQuestionId]?.loaded);
  const refreshQuestionScrollState = useCallback(() => {
    const node = questionScrollBodyRef.current;
    if (!node) {
      setQuestionScrollState((prev) => (
        prev.hasOverflow || !prev.atEnd ? { hasOverflow: false, atEnd: true } : prev
      ));
      return;
    }
    const hasOverflow = node.scrollHeight - node.clientHeight > 8;
    const atEnd = !hasOverflow || node.scrollTop + node.clientHeight >= node.scrollHeight - 10;
    setQuestionScrollState((prev) => (
      prev.hasOverflow === hasOverflow && prev.atEnd === atEnd
        ? prev
        : { hasOverflow, atEnd }
    ));
  }, []);
  const collabRoomId = useMemo(() => {
    if (!collabBaseRoomId || !task?.number || !activeQuestionId) return '';
    return `py-collab:${collabBaseRoomId}:${task.number}:${PYTHON_LEVEL_ID}:${activeQuestionId}`;
  }, [collabBaseRoomId, task?.number, PYTHON_LEVEL_ID, activeQuestionId]);
  const theoryVariantsForVisibility = useMemo(
    () => resolveTheoryVariantsForSubsection(taskEntry, selectedSubsectionId || PYTHON_DEFAULT_SUBSECTION_ID),
    [taskEntry, selectedSubsectionId]
  );
  useEffect(() => {
    setActiveTheoryType((prevType) => {
      const nextType = pickTheoryVariantType(theoryVariantsForVisibility, prevType);
      return nextType === prevType ? prevType : nextType;
    });
  }, [task?.number, selectedSubsectionId, theoryVariantsForVisibility]);

  useEffect(() => {
    setShowTheory(false);
  }, [task?.number, selectedSubsectionId]);

  useEffect(() => {
    refreshQuestionScrollState();
    const node = questionScrollBodyRef.current;
    if (!node) return undefined;
    const frameId = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(refreshQuestionScrollState)
      : null;
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(refreshQuestionScrollState);
      resizeObserver.observe(node);
    }
    return () => {
      if (frameId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
    };
  }, [
    currentQuestionScrollText,
    currentIndex,
    refreshQuestionScrollState,
    viewportHeight,
    viewportWidth,
    workspaceSplitRatio,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncViewportSize = () => {
      setViewportWidth(getRuntimeViewportWidth());
      setViewportHeight(getRuntimeViewportHeight());
    };
    syncViewportSize();
    window.addEventListener('resize', syncViewportSize);
    window.visualViewport?.addEventListener?.('resize', syncViewportSize);
    return () => {
      window.removeEventListener('resize', syncViewportSize);
      window.visualViewport?.removeEventListener?.('resize', syncViewportSize);
    };
  }, []);

  const updateWorkspaceSplitFromClientX = useCallback((clientX) => {
    const grid = workspaceGridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const safeWidth = Math.max(1, rect.width);
    const dividerWidth = 14;
    const minLeftWidth = Math.min(360, Math.max(220, safeWidth * 0.18));
    const maxLeftWidth = Math.min(760, Math.max(420, safeWidth * 0.62));
    const nextLeftWidth = Math.max(
      minLeftWidth,
      Math.min(maxLeftWidth, clientX - rect.left - dividerWidth / 2)
    );
    setWorkspaceSplitRatio(nextLeftWidth / safeWidth);
  }, []);

  useEffect(() => {
    if (!isResizingWorkspace || typeof window === 'undefined') return undefined;
    const handlePointerMove = (event) => {
      updateWorkspaceSplitFromClientX(event.clientX);
    };
    const stopResize = () => {
      workspaceResizePointerIdRef.current = null;
      setIsResizingWorkspace(false);
    };
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };
  }, [isResizingWorkspace, updateWorkspaceSplitFromClientX]);

  const getQuestionIndexKey = () => {
    const safeStudentId = studentId || 'anon';
    const taskNum = task?.number || 'task';
    return `py_last_q_${safeStudentId}_${taskNum}`;
  };

  const getQuestionCodeEntry = (questionId, source = null) => {
    const key = String(questionId ?? '').trim();
    const store = source && typeof source === 'object'
      ? source
      : questionCodeByIdRef.current;
    const cached = store?.[key];
    if (!cached || typeof cached !== 'object') {
      return { code: '', input: '', updatedAt: '', starterCode: '', loaded: false };
    }
    return {
      code: normalizeCodeText(typeof cached.code === 'string' ? cached.code : ''),
      input: typeof cached.input === 'string' ? cached.input : '',
      updatedAt: typeof cached.updatedAt === 'string' ? cached.updatedAt : '',
      starterCode: normalizeCodeText(typeof cached.starterCode === 'string' ? cached.starterCode : ''),
      loaded: Boolean(cached.loaded),
    };
  };

  const setQuestionCodeEntry = (questionId, patch) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeById((prev) => {
      const current = prev?.[key] && typeof prev[key] === 'object'
        ? prev[key]
        : { code: '', input: '', updatedAt: '', starterCode: '', loaded: false };
      const rawPatch = patch && typeof patch === 'object' ? patch : {};
      const nextPatch = { ...rawPatch };
      if (Object.prototype.hasOwnProperty.call(rawPatch, 'code')) {
        const normalized = normalizeCodeText(typeof rawPatch.code === 'string' ? rawPatch.code : '');
        nextPatch.code = collapseDuplicatedCode(normalized);
      }
      if (Object.prototype.hasOwnProperty.call(rawPatch, 'starterCode')) {
        nextPatch.starterCode = normalizeCodeText(
          typeof rawPatch.starterCode === 'string' ? rawPatch.starterCode : ''
        );
      }
      return {
        ...(prev || {}),
        [key]: {
          ...current,
          ...nextPatch,
          loaded: true,
        },
      };
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

  const setQuestionCodeDirty = (questionId, dirty) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeDirtyById((prev) => ({ ...(prev || {}), [key]: Boolean(dirty) }));
  };

  const getFallbackCodeForQuestion = (question, questionId, serverStarterCode = '') => {
    const key = String(questionId ?? '').trim();
    const solvedCode = solvedCodeById?.[key];
    if (typeof solvedCode === 'string' && solvedCode.length > 0) return normalizeCodeText(solvedCode);
    if (typeof serverStarterCode === 'string' && serverStarterCode.length > 0) return normalizeCodeText(serverStarterCode);
    if (typeof question?.starterCode === 'string') return normalizeCodeText(question.starterCode);
    return '';
  };

  const getQuestionCodeVersion = (questionId) => {
    const key = String(questionId ?? '').trim();
    if (!key) return 0;
    return Number(questionCodeLocalVersionRef.current?.[key] || 0);
  };

  const bumpQuestionCodeVersion = (questionId) => {
    const key = String(questionId ?? '').trim();
    if (!key) return 0;
    const nextVersion = getQuestionCodeVersion(key) + 1;
    questionCodeLocalVersionRef.current = {
      ...(questionCodeLocalVersionRef.current || {}),
      [key]: nextVersion,
    };
    return nextVersion;
  };

  const loadQuestionCode = async (question, questionId, force = false) => {
    if (!studentId || !task?.number) return;
    const key = String(questionId ?? '').trim();
    if (!key) return;
    if (questionCodeLoadingByIdRef.current?.[key]) return;
    const cached = getQuestionCodeEntry(key);
    if (cached.loaded && !force) {
      const hasSavedSnapshot = Boolean(String(cached.updatedAt || '').trim());
      const isDirty = Boolean(questionCodeDirtyByIdRef.current?.[key]);
      const isSaving = Boolean(questionCodeSavingByIdRef.current?.[key]);
      if (hasSavedSnapshot || isDirty || isSaving) return;
      // Unsaved snapshot: refetch so teacher/student always receive latest starterCode from server.
    }
    setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.getQuestionCode(studentId, task.number, PYTHON_LEVEL_ID, key);
      const remoteCodeRaw = typeof payload?.code === 'string' ? payload.code : '';
      const remoteCode = collapseDuplicatedCode(remoteCodeRaw);
      const remoteInput = typeof payload?.input === 'string' ? payload.input : '';
      const remoteUpdatedAt = typeof payload?.updatedAt === 'string' ? payload.updatedAt : '';
      const remoteStarterCode = typeof payload?.starterCode === 'string' ? payload.starterCode : '';
      const fallbackCode = getFallbackCodeForQuestion(question, key, remoteStarterCode);
      const nextCode = remoteCode.length > 0
        ? remoteCode
        : fallbackCode;
      const isActiveCollabQuestion = (
        key === activeQuestionId
        && collabProviderRef.current?.synced
        && collabDocRef.current
        && collabYTextRef.current
        && collabStateMapRef.current
      );
      const doc = isActiveCollabQuestion ? collabDocRef.current : null;
      const ytext = isActiveCollabQuestion ? collabYTextRef.current : null;
      const stateMap = isActiveCollabQuestion ? collabStateMapRef.current : null;
      const liveCode = ytext ? ytext.toString() : '';
      const liveInput = stateMap
        ? (typeof stateMap.get('input') === 'string'
            ? stateMap.get('input')
            : String(stateMap.get('input') ?? ''))
        : '';
      const hasLiveSnapshot = Boolean(liveCode || liveInput);

      setQuestionCodeEntry(key, {
        code: hasLiveSnapshot ? liveCode : nextCode,
        input: hasLiveSnapshot ? liveInput : remoteInput,
        updatedAt: remoteUpdatedAt,
        starterCode: remoteStarterCode,
      });

      const collabPeerCount = getAwarenessPeerCount(collabProviderRef.current);
      const canHydrateCollabFromApi = collabPeerCount === 0;
      if (
        doc
        && ytext
        && stateMap
        && canHydrateCollabFromApi
        && !hasLiveSnapshot
        && (nextCode || remoteInput)
      ) {
        doc.transact(() => {
          if (!ytext.toString() && nextCode) {
            ytext.insert(0, nextCode);
          }
          const mapInput = typeof stateMap.get('input') === 'string'
            ? stateMap.get('input')
            : String(stateMap.get('input') ?? '');
          if (!mapInput && remoteInput) {
            stateMap.set('input', remoteInput);
          }
        });
      }
      setQuestionCodeDirty(key, false);
      questionCodeLocalVersionRef.current = {
        ...(questionCodeLocalVersionRef.current || {}),
        [key]: 0,
      };
      clearQuestionCodeError(key);
    } catch (err) {
      if (!cached.loaded) {
        const fallbackCode = getFallbackCodeForQuestion(question, key);
        setQuestionCodeEntry(key, {
          code: fallbackCode,
          input: '',
          updatedAt: '',
          starterCode: typeof question?.starterCode === 'string' ? question.starterCode : '',
        });
        setQuestionCodeDirty(key, false);
        questionCodeLocalVersionRef.current = {
          ...(questionCodeLocalVersionRef.current || {}),
          [key]: 0,
        };
      }
      setQuestionCodeError(key, err?.message || err);
    } finally {
      setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: false }));
    }
  };

  const saveQuestionCode = async (questionId, options = {}) => {
    if (!studentId || !task?.number) return false;
    const key = String(questionId ?? '').trim();
    if (!key) return false;
    const force = Boolean(options?.force);
    const isDirty = Boolean(questionCodeDirtyByIdRef.current?.[key]);
    if (!force && !isDirty) return true;
    if (questionCodeSavingByIdRef.current?.[key]) {
      questionCodeRetrySaveByIdRef.current = {
        ...(questionCodeRetrySaveByIdRef.current || {}),
        [key]: true,
      };
      return false;
    }
    const entry = getQuestionCodeEntry(key);
    const sentVersion = getQuestionCodeVersion(key);
    setQuestionCodeSavingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.saveQuestionCode(studentId, task.number, PYTHON_LEVEL_ID, key, {
        code: entry.code,
        input: entry.input,
      });
      const savedCode = typeof payload?.code === 'string' ? payload.code : '';
      const savedInput = typeof payload?.input === 'string' ? payload.input : '';
      const savedUpdatedAt = typeof payload?.updatedAt === 'string' ? payload.updatedAt : '';
      const changedDuringSave = getQuestionCodeVersion(key) !== sentVersion;
      if (!changedDuringSave) {
        setQuestionCodeEntry(key, {
          code: savedCode,
          input: savedInput,
          updatedAt: savedUpdatedAt,
        });
        setQuestionCodeDirty(key, false);
      } else {
        questionCodeRetrySaveByIdRef.current = {
          ...(questionCodeRetrySaveByIdRef.current || {}),
          [key]: true,
        };
        setQuestionCodeEntry(key, { updatedAt: savedUpdatedAt });
      }
      clearQuestionCodeError(key);
      return !changedDuringSave;
    } catch (err) {
      setQuestionCodeError(key, err?.message || err);
      return false;
    } finally {
      setQuestionCodeSavingById((prev) => ({ ...(prev || {}), [key]: false }));
      const shouldRetry = Boolean(questionCodeRetrySaveByIdRef.current?.[key]);
      if (shouldRetry) {
        questionCodeRetrySaveByIdRef.current = {
          ...(questionCodeRetrySaveByIdRef.current || {}),
          [key]: false,
        };
        setTimeout(() => {
          saveQuestionCode(key).catch(() => {});
        }, 0);
      }
    }
  };

  const flushScheduledQuestionSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pendingQuestionId = String(pendingSaveQuestionIdRef.current || '').trim();
    pendingSaveQuestionIdRef.current = '';
    if (pendingQuestionId) {
      saveQuestionCode(pendingQuestionId, { force: true }).catch(() => {});
    }
  };

  const scheduleQuestionSave = (questionId) => {
    const key = String(questionId ?? '').trim();
    if (!key || !studentId || !task?.number) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingSaveQuestionIdRef.current = key;
    saveTimerRef.current = setTimeout(() => {
      const pendingQuestionId = String(pendingSaveQuestionIdRef.current || '').trim();
      pendingSaveQuestionIdRef.current = '';
      saveTimerRef.current = null;
      if (!pendingQuestionId) return;
      saveQuestionCode(pendingQuestionId).catch(() => {});
    }, QUESTION_CODE_SAVE_DEBOUNCE_MS);
  };

  const resolveCurrentQuestionCode = (question, index, source = null) => {
    const key = String(question?.id ?? index).trim();
    if (!key) return '';
    const entry = getQuestionCodeEntry(key, source);
    if (entry.loaded) return entry.code;
    return getFallbackCodeForQuestion(question, key);
  };

  const updateSharedRunStateFromMap = useCallback((runMap) => {
    if (!runMap) {
      setSharedRunState({
        status: 'idle',
        author: '',
        summary: '',
        ts: null,
      });
      return;
    }
    const status = typeof runMap.get('status') === 'string' ? runMap.get('status') : 'idle';
    const author = typeof runMap.get('author') === 'string' ? runMap.get('author') : '';
    const summary = typeof runMap.get('summary') === 'string' ? runMap.get('summary') : '';
    const tsRaw = runMap.get('ts');
    const ts = Number.isFinite(Number(tsRaw)) ? Number(tsRaw) : null;
    setSharedRunState({
      status: status || 'idle',
      author,
      summary,
      ts,
    });
  }, []);

  const publishSharedRunState = useCallback((payload) => {
    const runMap = collabRunMapRef.current;
    const doc = collabDocRef.current;
    if (!runMap || !doc) {
      setSharedRunState((prev) => ({
        status: Object.prototype.hasOwnProperty.call(payload, 'status') ? String(payload.status || 'idle') : prev.status,
        author: Object.prototype.hasOwnProperty.call(payload, 'author') ? String(payload.author || '') : prev.author,
        summary: Object.prototype.hasOwnProperty.call(payload, 'summary') ? String(payload.summary || '') : prev.summary,
        ts: Object.prototype.hasOwnProperty.call(payload, 'ts')
          ? (Number.isFinite(Number(payload.ts)) ? Number(payload.ts) : null)
          : prev.ts,
      }));
      return;
    }
    doc.transact(() => {
      if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
        runMap.set('status', String(payload.status || 'idle'));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'author')) {
        runMap.set('author', String(payload.author || ''));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'summary')) {
        runMap.set('summary', String(payload.summary || ''));
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'ts')) {
        runMap.set('ts', Number.isFinite(Number(payload.ts)) ? Number(payload.ts) : null);
      }
    });
  }, []);

  const replaceCodeInCollab = useCallback((nextCode) => {
    const ytext = collabYTextRef.current;
    const doc = collabDocRef.current;
    if (!ytext || !doc) return false;
    const safeCode = normalizeCodeText(typeof nextCode === 'string' ? nextCode : '');
    doc.transact(() => {
      const currentLength = ytext.length;
      if (currentLength > 0) ytext.delete(0, currentLength);
      if (safeCode) ytext.insert(0, safeCode);
    });
    return true;
  }, []);

  const handleEditorMount = useCallback((editor, monaco) => {
    try {
      const model = editor?.getModel?.();
      const lf = monaco?.editor?.EndOfLineSequence?.LF;
      if (model && Number.isFinite(Number(lf)) && typeof model.setEOL === 'function') {
        model.setEOL(lf);
      }
    } catch (error) {
      void error;
    }
    editorRef.current = editor;
    monacoRef.current = monaco;
    setEditorReady(true);
    setEditorMountVersion((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const list = Array.isArray(subsectionModel.questions) ? subsectionModel.questions : [];
    let rawIndex = Number(initialQuestionIndex);
    if (!Number.isFinite(rawIndex) && typeof window !== 'undefined') {
      try {
        rawIndex = Number(window.localStorage.getItem(getQuestionIndexKey()));
      } catch (error) {
        void error;
      }
    }
    const safeIndex = Number.isFinite(rawIndex) && list.length > 0
      ? Math.max(0, Math.min(list.length - 1, Math.floor(rawIndex)))
      : 0;
    setQuestions(list);
    if (list.length > 0) {
      setCurrentIndex(safeIndex);
      setSelectedSubsectionId(
        subsectionModel.questionSectionByIndex.get(safeIndex)
        || subsectionModel.subsections.find((section) => section.count > 0)?.id
        || PYTHON_DEFAULT_SUBSECTION_ID
      );
    } else {
      setSelectedSubsectionId(PYTHON_DEFAULT_SUBSECTION_ID);
    }
    setSolvedIds(new Set());
    setSolvedCodeById({});
    setQuestionCodeById({});
    setQuestionCodeLoadingById({});
    setQuestionCodeSavingById({});
    setQuestionCodeErrorById({});
    setQuestionCodeDirtyById({});
    questionCodeByIdRef.current = {};
    questionCodeLoadingByIdRef.current = {};
    questionCodeSavingByIdRef.current = {};
    questionCodeRetrySaveByIdRef.current = {};
    questionCodeDirtyByIdRef.current = {};
    questionCodeLocalVersionRef.current = {};
    pendingSaveQuestionIdRef.current = '';
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setTestResults([]);
    setRunnerError('');
    if (studentId) {
      api.getSolvedQuestions(studentId, task.number, PYTHON_LEVEL_ID, { includeCode: true })
        .then((payload) => {
          if (Array.isArray(payload)) {
            setSolvedIds(new Set(payload.map((id) => String(id))));
            setSolvedCodeById({});
          } else {
            const ids = Array.isArray(payload?.ids) ? payload.ids : [];
            const codeById = payload?.codeById && typeof payload.codeById === 'object' ? payload.codeById : {};
            setSolvedIds(new Set(ids.map((id) => String(id))));
            setSolvedCodeById(codeById);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [task?.number, subsectionModel, studentId, initialQuestionIndex]);

  useEffect(() => {
    if (!questions.length) return;
    const nextSubsectionId = subsectionModel.questionSectionByIndex.get(currentIndex) || PYTHON_DEFAULT_SUBSECTION_ID;
    if (nextSubsectionId !== selectedSubsectionId) {
      setSelectedSubsectionId(nextSubsectionId);
    }
  }, [currentIndex, questions.length, selectedSubsectionId, subsectionModel]);

  useEffect(() => {
    if (!Number.isFinite(currentIndex)) return;
    if (!questions.length) return;
    onQuestionChange?.(currentIndex);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(getQuestionIndexKey(), String(currentIndex));
    } catch (error) {
      void error;
    }
  }, [currentIndex, questions.length, onQuestionChange]);

  useEffect(() => {
    setEditorReady(false);
  }, [collabRoomId]);

  useEffect(() => {
    flushScheduledQuestionSave();
    const current = questions[currentIndex];
    const currentId = String(current?.id ?? '').trim();
    if (currentId) {
      loadQuestionCode(current, currentId).catch(() => {});
    }
    setTestResults([]);
    setRunnerError('');
  }, [questions, currentIndex, studentId, task?.number, solvedCodeById]);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => {
      flushScheduledQuestionSave();
      document.body.classList.remove('overflow-hidden');
    };
  }, []);

  useEffect(() => {
    questionCodeByIdRef.current = questionCodeById && typeof questionCodeById === 'object'
      ? questionCodeById
      : {};
  }, [questionCodeById]);

  useEffect(() => {
    questionCodeLoadingByIdRef.current = questionCodeLoadingById && typeof questionCodeLoadingById === 'object'
      ? questionCodeLoadingById
      : {};
  }, [questionCodeLoadingById]);

  useEffect(() => {
    questionCodeSavingByIdRef.current = questionCodeSavingById && typeof questionCodeSavingById === 'object'
      ? questionCodeSavingById
      : {};
  }, [questionCodeSavingById]);

  useEffect(() => {
    questionCodeDirtyByIdRef.current = questionCodeDirtyById && typeof questionCodeDirtyById === 'object'
      ? questionCodeDirtyById
      : {};
  }, [questionCodeDirtyById]);

  useEffect(() => {
    if (!collabRoomId || !editorReady || !collabWsUrl || !activeQuestionId || !activeQuestionCodeLoaded) {
      setRealtimeStatus('disconnected');
      setRealtimePeerCount(0);
      collabDocRef.current = null;
      collabProviderRef.current = null;
      collabAwarenessRef.current = null;
      collabBindingRef.current = null;
      collabYTextRef.current = null;
      collabStateMapRef.current = null;
      collabRunMapRef.current = null;
      updateSharedRunStateFromMap(null);
      return undefined;
    }

    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!editor || !model) return undefined;
    const currentQuestion = questions[currentIndex];
    const seedCode = resolveCurrentQuestionCode(currentQuestion, currentIndex, questionCodeByIdRef.current);
    const seedEntry = getQuestionCodeEntry(activeQuestionId, questionCodeByIdRef.current);
    const seedInput = typeof seedEntry.input === 'string' ? seedEntry.input : '';

    setRealtimeStatus('connecting');
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(collabWsUrl, collabRoomId, doc);
    const ytext = doc.getText('monaco');
    const stateMap = doc.getMap('pythonState');
    const runMap = doc.getMap('pythonRun');
    const binding = new MonacoBinding(ytext, model, new Set([editor]), provider.awareness);

    collabDocRef.current = doc;
    collabProviderRef.current = provider;
    collabAwarenessRef.current = provider.awareness;
    collabBindingRef.current = binding;
    collabYTextRef.current = ytext;
    collabStateMapRef.current = stateMap;
    collabRunMapRef.current = runMap;

    let seeded = false;
    let seedTimer = null;
    const normalizeDocCodeIfNeeded = () => {
      const rawCode = ytext.toString();
      const normalizedCode = collapseDuplicatedCode(rawCode);
      if (normalizedCode !== rawCode) {
        doc.transact(() => {
          if (ytext.length > 0) ytext.delete(0, ytext.length);
          if (normalizedCode) ytext.insert(0, normalizedCode);
        });
      }
      return normalizedCode;
    };
    const trySeedDocState = () => {
      if (seeded) return;
      if (!provider.synced) return;
      const codeInDoc = normalizeDocCodeIfNeeded();
      const inputInDoc = typeof stateMap.get('input') === 'string'
        ? stateMap.get('input')
        : String(stateMap.get('input') ?? '');
      if (codeInDoc || inputInDoc) {
        seeded = true;
        return;
      }
      const hasPeers = getAwarenessPeerCount(provider) > 0;
      if (hasPeers) {
        return;
      }
      const shouldSeedCode = Boolean(seedCode);
      const shouldSeedInput = Boolean(seedInput);
      if (!shouldSeedCode && !shouldSeedInput) {
        seeded = true;
        return;
      }
      if (shouldSeedCode || shouldSeedInput) {
        doc.transact(() => {
          if (!ytext.toString() && shouldSeedCode) ytext.insert(0, seedCode);
          const nextInputInDoc = typeof stateMap.get('input') === 'string'
            ? stateMap.get('input')
            : String(stateMap.get('input') ?? '');
          if (!nextInputInDoc && shouldSeedInput) stateMap.set('input', seedInput);
        });
      }
      seeded = true;
    };
    const scheduleSeedDocState = () => {
      if (seeded) return;
      if (seedTimer) clearTimeout(seedTimer);
      seedTimer = setTimeout(() => {
        seedTimer = null;
        trySeedDocState();
      }, COLLAB_SEED_DELAY_MS);
    };

    const handleProviderStatus = (event) => {
      if (event?.status) setRealtimeStatus(event.status);
    };
    const handleProviderSync = (isSynced) => {
      if (!isSynced) return;
      scheduleSeedDocState();
    };
    const handleAwareness = () => {
      const states = provider.awareness.getStates();
      setRealtimePeerCount(Math.max(0, states.size - 1));
      trySeedDocState();
    };
    const handleCodeChange = (event) => {
      const rawCode = ytext.toString();
      const nextCode = collapseDuplicatedCode(rawCode);
      if (nextCode !== rawCode) {
        doc.transact(() => {
          if (ytext.length > 0) ytext.delete(0, ytext.length);
          if (nextCode) ytext.insert(0, nextCode);
        });
      }
      setQuestionCodeEntry(activeQuestionId, { code: nextCode });
      clearQuestionCodeError(activeQuestionId);
      setTestResults((prev) => (prev.length > 0 ? [] : prev));
      if (event?.transaction?.local) {
        bumpQuestionCodeVersion(activeQuestionId);
        setQuestionCodeDirty(activeQuestionId, true);
        scheduleQuestionSave(activeQuestionId);
      }
    };
    const handleStateChange = (event) => {
      if (!event?.keysChanged?.has('input')) return;
      const nextInput = typeof stateMap.get('input') === 'string'
        ? stateMap.get('input')
        : String(stateMap.get('input') ?? '');
      setQuestionCodeEntry(activeQuestionId, { input: nextInput });
      clearQuestionCodeError(activeQuestionId);
      if (event?.transaction?.local) {
        bumpQuestionCodeVersion(activeQuestionId);
        setQuestionCodeDirty(activeQuestionId, true);
        scheduleQuestionSave(activeQuestionId);
      }
    };
    const handleRunState = () => {
      updateSharedRunStateFromMap(runMap);
    };

    ytext.observe(handleCodeChange);
    stateMap.observe(handleStateChange);
    runMap.observe(handleRunState);
    handleRunState();

    provider.on('status', handleProviderStatus);
    provider.on('sync', handleProviderSync);
    provider.awareness.on('change', handleAwareness);
    provider.awareness.setLocalStateField('user', {
      name: localCollabName,
      color: localCollabColor,
      role: 'student',
    });

    handleAwareness();
    if (provider.synced) {
      scheduleSeedDocState();
    }

    return () => {
      if (seedTimer) {
        clearTimeout(seedTimer);
        seedTimer = null;
      }
      provider.awareness.off('change', handleAwareness);
      provider.off('sync', handleProviderSync);
      provider.off('status', handleProviderStatus);
      ytext.unobserve(handleCodeChange);
      stateMap.unobserve(handleStateChange);
      runMap.unobserve(handleRunState);
      binding.destroy();
      provider.destroy();
      doc.destroy();
      if (collabProviderRef.current === provider) {
        collabProviderRef.current = null;
        collabDocRef.current = null;
        collabAwarenessRef.current = null;
        collabBindingRef.current = null;
        collabYTextRef.current = null;
        collabStateMapRef.current = null;
        collabRunMapRef.current = null;
      }
      setRealtimeStatus('disconnected');
      setRealtimePeerCount(0);
      updateSharedRunStateFromMap(null);
    };
  }, [
    collabRoomId,
    editorReady,
    editorMountVersion,
    collabWsUrl,
    activeQuestionId,
    activeQuestionCodeLoaded,
    questions,
    currentIndex,
    localCollabName,
    localCollabColor,
    updateSharedRunStateFromMap,
  ]);

  const resolvePendingRuns = (message) => {
    runnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({ output, error });
    });
    runnerPendingRef.current.clear();
  };

  const disposeRunnerWorker = (message) => {
    runnerReadyRef.current = false;
    runnerWarmupPromiseRef.current = null;
    if (runnerWorkerRef.current) {
      runnerWorkerRef.current.terminate();
      runnerWorkerRef.current = null;
    }
    if (message) resolvePendingRuns(message);
  };

  const ensureRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (runnerWorkerRef.current) return runnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const messageType = typeof data.type === 'string' ? data.type : 'result';
        if (!data.id) {
          if (messageType === 'ready') runnerReadyRef.current = true;
          return;
        }
        const pending = runnerPendingRef.current.get(data.id);
        if (!pending) return;
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
        if (messageType === 'ready') runnerReadyRef.current = true;
        clearTimeout(pending.timer);
        runnerPendingRef.current.delete(data.id);
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
      worker.onerror = () => disposeRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposeRunnerWorker('Ошибка выполнения Python.');
      runnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  const warmupRunnerWorker = async () => {
    if (runnerReadyRef.current) return true;
    if (runnerWarmupPromiseRef.current) return runnerWarmupPromiseRef.current;
    const worker = ensureRunnerWorker();
    if (!worker) return false;
    const id = `warmup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const warmupTimeoutMessage = '\u041f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0430 Python \u0437\u0430\u043d\u044f\u043b\u0430 \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u043c\u043d\u043e\u0433\u043e \u0432\u0440\u0435\u043c\u0435\u043d\u0438. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.';
    const promise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        const pending = runnerPendingRef.current.get(id);
        if (!pending) return;
        runnerPendingRef.current.delete(id);
        resolve(false);
        disposeRunnerWorker(warmupTimeoutMessage);
      }, runnerWarmupTimeoutMs);
      runnerPendingRef.current.set(id, {
        resolve: ({ error }) => {
          resolve(!String(error || '').trim());
        },
        timer,
        output: '',
        error: '',
        onProgress: null,
      });
      worker.postMessage({ id, type: 'warmup' });
    });
    runnerWarmupPromiseRef.current = promise.finally(() => {
      if (!runnerReadyRef.current) {
        runnerWarmupPromiseRef.current = null;
      }
    });
    return runnerWarmupPromiseRef.current;
  };

  useEffect(() => () => disposeRunnerWorker('Python runner stopped.'), []);

  const runPythonInMainThread = async (source, inputValue) => {
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

  const runPythonCode = async (source, inputValue, onProgress = null) => {
    const warmedUp = await warmupRunnerWorker();
    const worker = warmedUp ? runnerWorkerRef.current : null;
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = runnerPendingRef.current.get(id);
          if (!pending) return;
          runnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error });
          disposeRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        runnerPendingRef.current.set(id, {
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
    return runPythonInMainThread(source, inputValue);
  };

  useEffect(() => {
    if (runnerWarmupStartedRef.current) return;
    runnerWarmupStartedRef.current = true;
    warmupRunnerWorker().catch(() => {});
  }, []);

  const handleRunTests = async (sourceRect = null) => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;
    const currentId = String(currentQuestion?.id ?? '').trim();
    const editorModel = editorRef.current?.getModel?.();
    const liveEditorCode = typeof editorModel?.getValue === 'function'
      ? editorModel.getValue()
      : null;
    const currentCode = typeof liveEditorCode === 'string'
      ? liveEditorCode
      : resolveCurrentQuestionCode(currentQuestion, currentIndex, questionCodeById);
    if (!String(currentCode || '').trim()) return;
    flushScheduledQuestionSave();
    if (studentId && currentId) {
      await saveQuestionCode(currentId).catch(() => {});
    }
    setRunnerLoading(true);
    setRunnerError('');
    publishSharedRunState({
      status: 'running',
      author: localCollabName,
      summary: 'Запуск тестов...',
      ts: Date.now(),
    });
    const rawTests = Array.isArray(currentQuestion.tests)
      ? currentQuestion.tests
      : (currentQuestion.answer ? [{ input: '', output: currentQuestion.answer }] : []);
    const hasExpectedOutputs = rawTests.every((test) => (
      Object.prototype.hasOwnProperty.call(test || {}, 'output')
    ));
    const sanitizedTests = rawTests.map((test) => ({
      input: String(test?.input ?? ''),
      output: hasExpectedOutputs ? String(test?.output ?? '') : '',
    }));
    if (sanitizedTests.length === 0) {
      setRunnerLoading(false);
      setRunnerError('Для этой задачи пока нет тестов.');
      setTestResults([]);
      publishSharedRunState({
        status: 'error',
        author: localCollabName,
        summary: 'Тесты для задачи не настроены.',
        ts: Date.now(),
      });
      return;
    }
    try {
      const resultsList = [];
      for (const test of sanitizedTests) {
        const res = await runPythonCode(currentCode, test.input);
        const normalizedOut = normalizeOutputForComparison(res.output);
        const normalizedExpected = normalizeOutputForComparison(test.output);
        const runtimeErrorText = normalizeRuntimeErrorForCheck(res.error);
        const hasRuntimeError = runtimeErrorText.length > 0;
        const failReason = hasRuntimeError
          ? 'runtime'
          : (normalizedOut === normalizedExpected ? '' : 'mismatch');
        const passed = hasExpectedOutputs
          ? failReason === ''
          : undefined;
        resultsList.push({
          input: test.input,
          expected: test.output,
          output: res.output,
          error: runtimeErrorText,
          passed,
          failReason,
        });
      }
      setTestResults(resultsList);
      const passedCount = resultsList.filter((item) => item.passed === true).length;
      const runtimeErrorCount = resultsList.filter((item) => String(item.error || '').trim().length > 0).length;
      const baseSummary = hasExpectedOutputs
        ? `${passedCount}/${resultsList.length} тестов пройдено`
        : `Запуск завершен (${resultsList.length} проверок)`;
      const runSummary = runtimeErrorCount > 0
        ? `${baseSummary}, ошибок выполнения: ${runtimeErrorCount}`
        : baseSummary;
      publishSharedRunState({
        status: 'done',
        author: localCollabName,
        summary: runSummary,
        ts: Date.now(),
      });

      const allPassed = hasExpectedOutputs
        && resultsList.length > 0
        && resultsList.every((item) => item.passed === true);
      const canSubmitWithoutExpected = !hasExpectedOutputs
        && resultsList.length > 0
        && resultsList.every((item) => !String(item.error ?? '').trim());
      const shouldSubmit = allPassed || canSubmitWithoutExpected;

      if (shouldSubmit) {
        if (studentId) {
          try {
            const resp = await api.solveQuestion({
              studentId,
              taskNumber: task.number,
              levelId: PYTHON_LEVEL_ID,
              questionId: currentQuestion.id,
              totalQuestions: questions.length,
              levelMax: 100,
              levelTotals: { [PYTHON_LEVEL_ID]: questions.length },
              code: currentCode,
              localDay: getLocalDayKey(),
              pythonResults: resultsList.map((item) => ({
                input: String(item?.input ?? ''),
                output: String(item?.output ?? ''),
                error: String(item?.error ?? ''),
              })),
            });
            setSolvedIds((prev) => {
              const next = new Set(prev);
              next.add(currentId);
              return next;
            });
            setSolvedCodeById((prev) => ({ ...prev, [currentId]: currentCode }));
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
              onComplete(task.id, resp.taskProgress, { skipServer: true });
              setRunnerLoading(false);
              return;
            }
          } catch (err) {
            const message = String(err?.message || err || '');
            setRunnerError(message || 'Не удалось сохранить результат');
            publishSharedRunState({
              status: 'error',
              author: localCollabName,
              summary: message || 'Не удалось сохранить результат',
              ts: Date.now(),
            });
            return;
          }
        } else if (!allPassed) {
          setRunnerError('Проверка без эталонных ответов доступна только для ученика.');
          return;
        }
        const totalCount = questions.length;
        if (totalCount > 0) {
          const prevSolved = solvedIds.size;
          const nextSolved = solvedIds.has(currentId) ? prevSolved : prevSolved + 1;
          const nextProgress = Math.round((nextSolved / totalCount) * 100);
          onComplete(task.id, Math.min(100, nextProgress), { skipServer: true });
        }
      }
    } catch (err) {
      setRunnerError(err?.message || err);
      publishSharedRunState({
        status: 'error',
        author: localCollabName,
        summary: String(err?.message || err || 'Ошибка запуска'),
        ts: Date.now(),
      });
    } finally {
      setRunnerLoading(false);
    }
  };

  const handleNext = () => {
    if (Number.isFinite(nextQuestionIndex)) {
      const nextSubsection = visibleSubsections.find((section) => section.questionIndexes.includes(nextQuestionIndex));
      if (nextSubsection?.id) setSelectedSubsectionId(nextSubsection.id);
      setCurrentIndex(nextQuestionIndex);
      return;
    }
    onClose();
  };

  if (!task) return null;
  const testsLoading = testDb === null || typeof testDb === 'undefined';

  if (testsLoading) {
    const loadingModal = (
      <div className="python-runtime-modal-overlay fixed inset-0 bg-slate-900/45 z-50 modal-backdrop flex items-center justify-center p-4">
        <div data-runtime-theme={isDarkTheme ? 'dark' : 'light'} className="python-runtime-modal-shell python-runtime-modal-shell--solve python-runtime-state-card surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="python-runtime-state-close absolute top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl border" aria-label="Закрыть"><X size={18}/></button>
          <span className="python-runtime-state-icon mx-auto inline-flex h-14 w-14 items-center justify-center rounded-[20px] border">
            <RefreshCcw size={22} className="animate-spin" />
          </span>
          <h2 className="mt-4 text-xl font-bold">Загружаем рабочую зону</h2>
          <p className="mt-2 text-sm">Подготавливаем задания, тесты и ваш сохранённый код.</p>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(loadingModal, document.body) : null;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    const emptyModal = (
      <div className="python-runtime-modal-overlay fixed inset-0 bg-slate-900/45 z-50 modal-backdrop flex items-center justify-center p-4">
        <div data-runtime-theme={isDarkTheme ? 'dark' : 'light'} className="python-runtime-modal-shell python-runtime-modal-shell--solve python-runtime-state-card surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="python-runtime-state-close absolute top-4 right-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl border" aria-label="Закрыть"><X size={18}/></button>
          <span className="python-runtime-state-icon mx-auto inline-flex h-14 w-14 items-center justify-center rounded-[20px] border">
            <FileText size={22} />
          </span>
          <h2 className="mt-4 text-2xl font-bold">Заданий пока нет</h2>
          <p className="mt-2">Учитель ещё не добавил задания для этой темы.</p>
          <div className="mt-6">
            <Button onClick={onClose}>Закрыть</Button>
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(emptyModal, document.body) : null;
  }

  const visibleSubsections = subsectionModel.subsections.filter((section) => section.count > 0);
  const activeSubsection = visibleSubsections.find((section) => section.id === selectedSubsectionId)
    || visibleSubsections[0]
    || null;
  const visibleQuestionItems = activeSubsection?.items || [];
  const currentQuestionPosition = visibleQuestionItems.findIndex((item) => item.questionIndex === currentIndex);
  const nextQuestionIndex = (() => {
    if (currentQuestionPosition >= 0 && currentQuestionPosition < visibleQuestionItems.length - 1) {
      return visibleQuestionItems[currentQuestionPosition + 1].questionIndex;
    }
    const activeSectionIndex = visibleSubsections.findIndex((section) => section.id === activeSubsection?.id);
    if (activeSectionIndex >= 0) {
      for (let index = activeSectionIndex + 1; index < visibleSubsections.length; index += 1) {
        if (visibleSubsections[index]?.items?.length) {
          return visibleSubsections[index].items[0].questionIndex;
        }
      }
    }
    return null;
  })();
  const showSubsectionNav = visibleSubsections.length > 1 || subsectionModel.hasCustomSubsections;
  const currentQuestion = questions[currentIndex];
  const currentId = String(currentQuestion?.id ?? '').trim();
  const isSolved = solvedIds.has(currentId);
  const questionCodeEntry = getQuestionCodeEntry(currentId, questionCodeById);
  const resolvedCode = resolveCurrentQuestionCode(currentQuestion, currentIndex, questionCodeById);
  const questionCodeLoading = Boolean(questionCodeLoadingById?.[currentId]);
  const questionCodeSaving = Boolean(questionCodeSavingById?.[currentId]);
  const questionCodeDirty = Boolean(questionCodeDirtyById?.[currentId]);
  const questionCodeError = questionCodeErrorById?.[currentId] || '';
  const questionCodeUpdatedAtLabel = questionCodeEntry.updatedAt
    ? new Date(questionCodeEntry.updatedAt).toLocaleString('ru-RU')
    : '';
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
  const rawTests = Array.isArray(currentQuestion?.tests)
    ? currentQuestion.tests
    : (currentQuestion?.answer ? [{ input: '', output: currentQuestion.answer }] : []);
  const testsToShow = rawTests.map((test) => ({
    input: String(test?.input ?? ''),
    output: String(test?.output ?? '')
  }));
  const currentQuestionDisplayIndex = Math.max(1, currentQuestionPosition + 1);
  const totalVisibleQuestions = Math.max(visibleQuestionItems.length, 1);
  const solvedVisibleCount = visibleQuestionItems.reduce((count, item) => (
    solvedIds.has(String(item.question?.id ?? item.questionIndex)) ? count + 1 : count
  ), 0);
  const visibleCompletion = visibleQuestionItems.length
    ? Math.round((solvedVisibleCount / visibleQuestionItems.length) * 100)
    : 0;
  const solvedAllTests = isSolved && testResults.length === 0;
  const activeTheorySubsectionId = activeSubsection?.id || PYTHON_DEFAULT_SUBSECTION_ID;
  const theoryVariants = resolveTheoryVariantsForSubsection(taskEntry, activeTheorySubsectionId);
  const availableTheoryTypes = getTheoryVariantList(theoryVariants);
  const theoryType = pickTheoryVariantType(theoryVariants, activeTheoryType);
  const theory = theoryType ? theoryVariants[theoryType] : null;
  const theoryFullUrl = theoryType === 'gdoc' ? buildGoogleDocFullUrl(theory?.content) : '';
  const theoryRecording = theoryType === THEORY_RECORDING_TYPE
    ? normalizeTheoryRecording(theory?.content)
    : null;
  const isRecordingTheory = theoryType === THEORY_RECORDING_TYPE && Boolean(theoryRecording);
  const openableTheoryTypes = availableTheoryTypes.filter((type) => {
    const item = theoryVariants[type];
    if (!item?.content) return false;
    if (type === THEORY_RECORDING_TYPE) return Boolean(normalizeTheoryRecording(item.content));
    return true;
  });
  const canOpenTheory = openableTheoryTypes.length > 0;
  const theoryLauncherLabel = isRecordingTheory ? 'Видео-теория' : 'Теория';
  const openTheory = (type = theoryType) => {
    const nextType = openableTheoryTypes.includes(type)
      ? type
      : openableTheoryTypes[0] || theoryType;
    if (nextType) {
      setActiveTheoryType(nextType);
      setShowTheory(true);
    }
  };
  const theoryProgressStorageKey = (() => {
    if (theoryType !== THEORY_RECORDING_TYPE || !studentId) return '';
    const subsectionKey = String(activeTheorySubsectionId || PYTHON_DEFAULT_SUBSECTION_ID)
      .replace(/[^0-9a-zA-Z_-]/g, '_');
    const recordingStamp = String(
      theoryRecording?.updatedAt
      || theoryRecording?.createdAt
      || theoryRecording?.audio?.storageName
      || theoryRecording?.audio?.url
      || theoryRecording?.durationMs
      || 'recording'
    ).replace(/[^0-9a-zA-Z_.:-]/g, '_');
    return [
      'py-theory-video-progress-v1',
      String(studentId),
      String(task?.number || ''),
      String(PYTHON_LEVEL_ID || ''),
      subsectionKey,
      recordingStamp,
    ].join(':');
  })();
  const theoryRecordingDurationLabel = isRecordingTheory
    ? formatRecordingDuration(Math.max(0, Number(theoryRecording?.durationMs) || 0))
    : '';
  const editorOptions = {
    minimap: { enabled: false },
    fontSize: isMobileViewport ? 15 : 16,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true,
    mouseWheelZoom: true,
    scrollBeyondLastLine: false,
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoIndent: 'advanced',
    formatOnType: true,
    formatOnPaste: true
  };
  const codeEditorHeight = isMobileViewport ? '320px' : '100%';
  const realtimeStatusLabel = buildRealtimeStatusLabel(realtimeStatus);
  const RealtimeStatusIcon = realtimeStatus === 'connected'
    ? Wifi
    : (realtimeStatus === 'connecting' ? CircleDashed : WifiOff);
  const saveStateLabel = questionCodeLoading
    ? 'Загружаем код'
    : (questionCodeSaving
        ? 'Сохраняем'
        : (questionCodeDirty
            ? 'Есть несохранённые изменения'
            : (questionCodeUpdatedAtLabel ? `Сохранено ${questionCodeUpdatedAtLabel}` : 'Автосохранение включено')));
  const saveStateClass = questionCodeDirty
    ? (isDarkTheme
        ? 'border-amber-400/30 bg-amber-500/12 text-amber-200'
        : 'border-amber-200 bg-amber-50 text-amber-700')
    : ((questionCodeSaving || questionCodeLoading)
        ? (isDarkTheme
            ? 'border-sky-400/30 bg-sky-500/12 text-sky-200'
            : 'border-sky-200 bg-sky-50 text-sky-700')
        : (questionCodeUpdatedAtLabel
            ? (isDarkTheme
                ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700')
            : (isDarkTheme
                ? 'border-slate-700/70 bg-slate-800/55 text-slate-300'
                : 'border-slate-200 bg-white text-slate-600')));
  const realtimeStateClass = realtimeStatus === 'connected'
    ? (isDarkTheme
        ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700')
    : (realtimeStatus === 'connecting'
        ? (isDarkTheme
            ? 'border-sky-400/30 bg-sky-500/12 text-sky-200'
            : 'border-sky-200 bg-sky-50 text-sky-700')
        : (isDarkTheme
            ? 'border-slate-700/70 bg-slate-800/55 text-slate-300'
            : 'border-slate-200 bg-white text-slate-600'));
  const solvedStateClass = isSolved
    ? (isDarkTheme
        ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700')
    : (isDarkTheme
        ? 'border-amber-400/20 bg-amber-500/10 text-amber-200'
        : 'border-amber-200 bg-amber-50 text-amber-700');
  const participantsLabel = realtimePeerCount > 0 ? `${realtimePeerCount + 1} в комнате` : 'Только вы';
  const sharedRunTimeLabel = sharedRunState.ts
    ? new Date(sharedRunState.ts).toLocaleTimeString('ru-RU')
    : '';
  const sharedRunLabel = (() => {
    const author = String(sharedRunState.author || '').trim() || 'Собеседник';
    const summary = String(sharedRunState.summary || '').trim();
    if (sharedRunState.status === 'running') return `${author} запускает тесты...`;
    if ((sharedRunState.status === 'done' || sharedRunState.status === 'error') && summary) {
      return `${author}: ${summary}`;
    }
    return '';
  })();
  const primaryTextClass = isDarkTheme ? 'text-slate-50' : 'text-slate-900';
  const secondaryTextClass = isDarkTheme ? 'text-slate-300' : 'text-slate-600';
  const mutedTextClass = isDarkTheme ? 'text-slate-400' : 'text-slate-500';
  const overlineTextClass = isDarkTheme ? 'text-violet-200' : 'text-purple-600';
  const modalShellThemeClass = isDarkTheme
    ? '!bg-[linear-gradient(145deg,#08101f_0%,#0d1428_48%,#10132b_100%)]'
    : '!bg-[linear-gradient(145deg,#f8f8ff_0%,#f2f7ff_48%,#f7f5ff_100%)]';
  const elevatedCardClass = isDarkTheme
    ? 'border-slate-700/80 bg-[linear-gradient(145deg,#121d33,#11162b)] shadow-[0_16px_36px_rgba(2,6,23,0.42)]'
    : 'border-slate-200/90 bg-white shadow-[0_14px_34px_rgba(71,85,105,0.11)]';
  const softCardClass = isDarkTheme
    ? 'border-slate-700/80 bg-[#111c31] shadow-[0_8px_20px_rgba(2,6,23,0.26)]'
    : 'border-slate-200/90 bg-white shadow-[0_8px_20px_rgba(71,85,105,0.08)]';
  const mutedStripClass = isDarkTheme
    ? 'border-indigo-400/20 bg-[#111b31]'
    : 'border-indigo-100 bg-[#f4f5ff]';
  const subtleButtonClass = isDarkTheme
    ? 'border-slate-600/80 bg-[#172238] text-slate-200 shadow-[0_8px_18px_rgba(2,6,23,0.30)] hover:border-violet-400/60 hover:bg-[#202b46] hover:text-white'
    : 'border-slate-200/90 bg-white text-slate-700 shadow-[0_8px_18px_rgba(71,85,105,0.10)] hover:border-violet-300 hover:bg-violet-50 hover:text-slate-900';
  const footerClass = isDarkTheme
    ? 'border-violet-400/25 bg-[linear-gradient(100deg,#111c31,#21153b,#10243a)] shadow-[0_-12px_30px_rgba(2,6,23,0.38)]'
    : 'border-violet-200 bg-[linear-gradient(100deg,#f5f3ff,#fff7fe,#eff9ff)] shadow-[0_-10px_26px_rgba(91,75,138,0.12)]';
  const questionCardClass = isDarkTheme
    ? 'border-violet-400/30 bg-[linear-gradient(150deg,#1c1634,#111d33)] shadow-[0_16px_38px_rgba(49,24,92,0.38)]'
    : 'border-violet-200 bg-[linear-gradient(145deg,#ffffff,#faf8ff)] shadow-[0_14px_34px_rgba(124,58,237,0.12)]';
  const editorFrameClass = isDarkTheme
    ? 'border-sky-400/20 bg-[#0b1426] shadow-[0_10px_24px_rgba(2,6,23,0.34)]'
    : 'border-sky-100 bg-white shadow-[0_10px_24px_rgba(14,116,144,0.08)]';
  const editorHeaderClass = isDarkTheme
    ? 'border-sky-400/15 bg-[#0f1b30] text-sky-200'
    : 'border-sky-100 bg-[#f2f8ff] text-slate-500';
  const hasSupportSidebarContent = Boolean(screenshots.length || extraFiles.length);
  const showPresenceChip = realtimePeerCount > 0;
  const workspaceTitle = showPresenceChip ? 'Совместный редактор Python' : 'Редактор Python';
  const workspaceDescription = showPresenceChip
    ? 'Код синхронизируется в realtime и виден всем участникам комнаты.'
    : 'Пишите решение, затем запускайте тесты и сразу проверяйте результат.';
  const isWideWorkspace = viewportWidth >= 700;
  const isCompactRuntimeViewport = viewportWidth < 1500 || viewportHeight < 820;
  const isVeryCompactRuntimeViewport = viewportWidth < 1200 || viewportHeight < 760;
  const isDenseQuestionNav = visibleQuestionItems.length >= 10;
  const useDenseTaskChips = isDenseQuestionNav || isCompactRuntimeViewport;
  const denseQuestionNavClass = isCompactRuntimeViewport
    ? 'grid min-w-0 w-full max-w-[calc(100vw-1.5rem)] grid-cols-[repeat(auto-fit,minmax(92px,1fr))] gap-1 max-h-[88px] overflow-y-auto overflow-x-hidden pr-1 [scrollbar-width:thin]'
    : 'grid min-w-0 w-full max-w-[calc(100vw-1.5rem)] grid-cols-[repeat(auto-fit,minmax(112px,1fr))] gap-1.5 max-h-[112px] overflow-y-auto overflow-x-hidden pr-1 [scrollbar-width:thin]';
  const questionNavLayoutClass = isDenseQuestionNav
    ? denseQuestionNavClass
    : `flex min-w-0 max-w-[calc(100vw-1.5rem)] flex-nowrap ${isCompactRuntimeViewport ? 'gap-1 pb-1 pr-6' : 'gap-1 pb-1.5 pr-10'} overflow-x-auto overflow-y-visible [scrollbar-width:thin]`;
  const subsectionChipSizeClass = isCompactRuntimeViewport
    ? 'min-w-[178px] px-2.5 py-1.5'
    : 'min-w-[220px] px-3 py-2';
  const workspaceGridClass = hasSupportSidebarContent
    ? (
        isCompactRuntimeViewport
          ? 'min-[700px]:grid-rows-[minmax(0,0.62fr)_minmax(118px,0.38fr)]'
          : 'min-[700px]:grid-rows-[minmax(390px,0.68fr)_minmax(150px,0.32fr)]'
      )
    : (
        isCompactRuntimeViewport
          ? 'min-[700px]:grid-rows-[minmax(0,0.56fr)_minmax(128px,0.44fr)]'
          : 'min-[700px]:grid-rows-[minmax(340px,0.64fr)_minmax(140px,0.36fr)]'
      );
  const workspaceGridStyle = isWideWorkspace
    ? {
        gridTemplateColumns: `clamp(220px, ${(workspaceSplitRatio * 100).toFixed(2)}%, 760px) 14px minmax(0, 1fr)`,
      }
    : undefined;
  const handleSelectSubsection = (subsectionId) => {
    const nextSubsection = visibleSubsections.find((section) => section.id === subsectionId);
    if (!nextSubsection) return;
    setSelectedSubsectionId(nextSubsection.id);
    if (!nextSubsection.questionIndexes.includes(currentIndex) && nextSubsection.items[0]) {
      setCurrentIndex(nextSubsection.items[0].questionIndex);
    }
  };
  const handleHorizontalWheelScroll = (event) => {
    const element = event.currentTarget;
    if (!element || element.scrollWidth <= element.clientWidth) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    element.scrollLeft += event.deltaY;
  };

  const modal = (
    <div className="python-runtime-modal-overlay fixed inset-0 bg-slate-900/45 z-50 modal-backdrop flex items-stretch justify-stretch p-0">
      <div data-runtime-theme={isDarkTheme ? 'dark' : 'light'} className={`python-runtime-modal-shell python-runtime-modal-shell--solve surface-card modal-card modal-card--fullscreen rounded-none w-screen h-[100dvh] max-w-none max-h-none p-0 shadow-2xl relative overflow-hidden ${modalShellThemeClass}`}>
        <div className="h-full w-full overflow-hidden">
          <div
            className={`flex h-full flex-col overflow-hidden ${
              isVeryCompactRuntimeViewport
                ? 'p-1 sm:p-1.5 md:p-2'
                : 'p-1.5 sm:p-2 md:p-2.5 lg:p-3'
            }`}
          >
        <div className="python-runtime-modal-header mb-0.5 flex flex-col gap-1 md:mb-1">
          <div className={`python-runtime-header-card rounded-[22px] border ${
            isCompactRuntimeViewport ? 'px-2.5 py-1.5 md:px-3 md:py-2' : 'px-3 py-2 md:px-3.5 md:py-2.5'
          } ${elevatedCardClass}`}>
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex min-w-0 items-start gap-2.5">
                <div className={`inline-flex shrink-0 items-center justify-center border ${
                  isCompactRuntimeViewport ? 'h-8 w-8 rounded-[16px]' : 'h-9 w-9 rounded-[18px]'
                } ${isDarkTheme ? 'border-violet-400/20 bg-violet-500/10 text-violet-200' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>
                  <BookOpen size={16} />
                </div>
                <div className="min-w-0">
                  <div className={`text-[11px] font-bold uppercase tracking-[0.28em] ${overlineTextClass}`}>Тема</div>
                  <h2 className={`mt-0.5 font-semibold leading-tight ${
                    isCompactRuntimeViewport ? 'text-[1.02rem] md:text-[1.08rem]' : 'text-[1.12rem] md:text-[1.18rem]'
                  } ${primaryTextClass}`}>{task.title}</h2>
                  <div className="mt-1.5 hidden flex-wrap gap-1">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${softCardClass} ${secondaryTextClass}`}>
                      <Sparkles size={11} />
                      {activeSubsection ? activeSubsection.title : 'Все задачи'}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${softCardClass} ${secondaryTextClass}`}>
                      <FileText size={11} />
                      {`Задача ${currentQuestionDisplayIndex} из ${totalVisibleQuestions}`}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${solvedStateClass}`}>
                      <CheckCircle2 size={11} />
                      {isSolved ? 'Решено' : `${solvedIds.size}/${questions.length} решено`}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] border transition ${subtleButtonClass}`}
                aria-label="Закрыть"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-1 grid gap-1 min-[700px]:grid-cols-[minmax(0,1fr)_minmax(170px,210px)]">
              <div className={`python-runtime-progress-card rounded-[18px] border px-2.5 ${isCompactRuntimeViewport ? 'py-1' : 'py-1.5'} ${mutedStripClass}`}>
                <div className="flex items-center justify-between gap-2.5">
                  <div>
                    <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>Прогресс темы</div>
                    <div className={`mt-0.5 text-xs ${secondaryTextClass}`}>Текущий набор заданий</div>
                  </div>
                  <div className={`text-lg font-semibold ${primaryTextClass}`}>{currentMastery}%</div>
                </div>
                <div className={`${isCompactRuntimeViewport ? 'mt-1 h-1' : 'mt-1.5 h-1.5'} overflow-hidden rounded-full ${isDarkTheme ? 'bg-slate-700/70' : 'bg-slate-200/80'}`}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-sky-400 transition-all duration-500"
                    style={{ width: `${Math.max(0, Math.min(100, currentMastery))}%` }}
                  />
                </div>
              </div>
              <div className={`python-runtime-overview-card grid grid-cols-2 gap-1.5 rounded-[18px] border px-2.5 ${isCompactRuntimeViewport ? 'py-1' : 'py-1.5'} ${mutedStripClass}`}>
                <div>
                  <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>В разделе</div>
                  <div className={`mt-1 text-base font-semibold ${primaryTextClass}`}>{visibleCompletion}%</div>
                  <div className={`text-xs ${mutedTextClass}`}>{`${solvedVisibleCount}/${visibleQuestionItems.length || 0} решено`}</div>
                </div>
                <div>
                  <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>Сейчас</div>
                  <div className={`mt-1 text-base font-semibold ${primaryTextClass}`}>{`${currentQuestionDisplayIndex}/${totalVisibleQuestions}`}</div>
                  <div className={`text-xs ${mutedTextClass}`}>{activeSubsection ? activeSubsection.title : 'Все задачи'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-1">
            {showSubsectionNav && (
              <div className={`python-runtime-subsection-strip rounded-[18px] border ${isCompactRuntimeViewport ? 'p-1' : 'p-1.5'} ${softCardClass}`}>
                <div className="flex min-w-0 items-center gap-2">
                  <div className={`shrink-0 text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>Подраздел</div>
                  <div className={`python-runtime-scrollbar flex min-w-0 flex-1 flex-nowrap ${isCompactRuntimeViewport ? 'gap-1.5 pb-0.5' : 'gap-2 pb-1'} overflow-x-auto pr-1 [scrollbar-width:thin]`} onWheel={handleHorizontalWheelScroll}>
                  {visibleSubsections.map((section) => (
                    <button
                      key={`py-subsection-${section.id}`}
                      type="button"
                      onClick={() => handleSelectSubsection(section.id)}
                      className={`python-runtime-chip ${subsectionChipSizeClass} shrink-0 rounded-[16px] border text-left text-[11px] font-semibold transition-all ${
                        section.id === activeSubsection?.id
                          ? (isDarkTheme
                              ? 'border-violet-400/40 bg-violet-500/14 text-white shadow-[0_14px_28px_rgba(76,29,149,0.28)]'
                              : 'border-violet-500 bg-violet-600 text-white shadow-[0_14px_28px_rgba(124,58,237,0.22)]')
                          : `${softCardClass} ${secondaryTextClass} hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-700`
                      }`}
                    >
                      <div className="whitespace-nowrap">{section.title}</div>
                      <div className={`${isCompactRuntimeViewport ? 'mt-0' : 'mt-0.5'} text-[10px] opacity-75`}>{`${section.count} задач`}</div>
                    </button>
                  ))}
                  </div>
                </div>
              </div>
            )}

              <div className={`python-runtime-task-strip rounded-[18px] border ${isCompactRuntimeViewport ? 'p-1' : 'p-1.5'} ${softCardClass}`}>
              <div className="hidden">
                <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>
                  {activeSubsection ? `Раздел: ${activeSubsection.title}` : 'Раздел'}
                </div>
              </div>
              <div
                className={`python-runtime-scrollbar ${questionNavLayoutClass}`}
                onWheel={handleHorizontalWheelScroll}
              >
                {visibleQuestionItems.map((item) => {
                  const qId = String(item.question?.id ?? item.questionIndex);
                  const solved = solvedIds.has(qId);
                  const isCurrent = item.questionIndex === currentIndex;
                  const buttonClass = isCurrent
                    ? (solved
                        ? (isDarkTheme
                            ? 'border-emerald-400/40 bg-emerald-500/14 text-emerald-50 shadow-[0_16px_28px_rgba(5,150,105,0.22)]'
                            : 'border-emerald-400 bg-emerald-100 text-emerald-700 shadow-[0_14px_28px_rgba(16,185,129,0.18)]')
                        : (isDarkTheme
                            ? 'border-violet-400/50 bg-violet-500/16 text-white shadow-[0_16px_28px_rgba(76,29,149,0.26)]'
                            : 'border-violet-400 bg-violet-50 text-violet-700 shadow-[0_14px_28px_rgba(124,58,237,0.16)]'))
                    : (solved
                        ? (isDarkTheme
                            ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-100 hover:border-emerald-400/40'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300')
                        : (isDarkTheme
                            ? 'border-slate-700/65 bg-slate-800/45 text-slate-200 hover:border-violet-300/35 hover:bg-violet-500/10'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700'));
                  const label = item.question?.title || `Вопрос ${item.localNumber}`;
                  return (
                    <button
                      key={`py-question-${qId}`}
                      type="button"
                      onClick={() => setCurrentIndex(item.questionIndex)}
                      className={`python-runtime-chip rounded-[16px] border text-left transition-all ${
                        isDenseQuestionNav ? 'w-full min-w-0 px-1.5 py-1' : 'shrink-0 min-w-[136px] px-2 py-1.5'
                      } ${buttonClass}`}
                      title={label}
                    >
                      <div className={`flex ${useDenseTaskChips ? 'items-center gap-1.5' : 'items-start gap-2'}`}>
                        <div className={`inline-flex shrink-0 items-center justify-center border font-bold ${
                          solved
                            ? (isDarkTheme
                                ? 'border-emerald-400/30 bg-emerald-500/14 text-emerald-100'
                                : 'border-emerald-200 bg-emerald-100 text-emerald-700')
                            : (isDarkTheme
                                ? 'border-slate-600/70 bg-slate-700/55 text-slate-300'
                                : 'border-slate-200 bg-slate-50 text-slate-600')
                        } ${useDenseTaskChips ? 'h-6 w-6 rounded-[9px] text-[9px]' : 'mt-0.5 h-7 w-7 rounded-[10px] text-[10px]'}`}>
                          {solved ? <CheckCircle2 size={14} /> : item.localNumber}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`${isDenseQuestionNav ? 'text-[9px] tracking-[0.16em]' : 'text-[10px] tracking-[0.2em]'} font-bold uppercase opacity-70`}>{`Задача ${item.localNumber}`}</div>
                          <div className={`${isDenseQuestionNav ? 'mt-0 text-[12px]' : 'mt-0.5 text-[13px]'} truncate font-semibold`}>{label}</div>
                        </div>
                        {!isDenseQuestionNav && <ChevronRight size={14} className="mt-0.5 shrink-0 opacity-55" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="python-runtime-workspace flex-1 min-h-0 overflow-hidden pr-0 md:pr-1">
          <div
            ref={workspaceGridRef}
            className={`python-runtime-workspace-grid grid h-full min-h-0 ${isCompactRuntimeViewport ? 'gap-2' : 'gap-3'} ${workspaceGridClass}`}
            style={workspaceGridStyle}
          >
            <div className={`min-h-0 flex flex-col ${isCompactRuntimeViewport ? 'gap-2' : 'gap-2.5'} overflow-hidden min-[700px]:col-start-1 min-[700px]:row-start-1`}>
          <div className={`python-runtime-question-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border ${isCompactRuntimeViewport ? 'p-2.5 md:p-3' : 'p-3 md:p-3.5'} ${questionCardClass}`}>
            <div className="flex items-start justify-between gap-3">
              <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${overlineTextClass}`}>Условие задачи</div>
              {canOpenTheory && (
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {openableTheoryTypes.length > 1 ? (
                    openableTheoryTypes.map((type) => {
                      const isActive = type === theoryType;
                      const Icon = type === THEORY_RECORDING_TYPE ? PlayCircle : BookOpen;
                      return (
                        <button
                          key={`python-theory-launcher-${type}`}
                          type="button"
                          onClick={() => openTheory(type)}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                            type === THEORY_RECORDING_TYPE
                              ? (isDarkTheme
                                  ? 'border-cyan-300/70 bg-[linear-gradient(135deg,rgba(34,211,238,0.24),rgba(168,85,247,0.20))] text-cyan-50 shadow-[0_0_0_1px_rgba(103,232,249,0.16),0_10px_24px_rgba(34,211,238,0.18)] hover:border-cyan-200 hover:bg-cyan-400/22'
                                  : 'border-cyan-400 bg-cyan-50 text-cyan-800 shadow-[0_10px_22px_rgba(14,165,233,0.18)] hover:border-cyan-500 hover:bg-cyan-100')
                              : isActive
                              ? (isDarkTheme
                                  ? 'border-violet-400/45 bg-violet-500/18 text-white shadow-[0_8px_22px_rgba(124,58,237,0.22)]'
                                  : 'border-violet-400 bg-violet-50 text-violet-700 shadow-[0_8px_18px_rgba(124,58,237,0.14)]')
                              : (isDarkTheme
                                  ? 'border-slate-700/70 bg-slate-800/55 text-slate-300 hover:border-violet-300/40 hover:bg-violet-500/12 hover:text-violet-100'
                                  : 'border-slate-200 bg-white/90 text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700')
                          }`}
                        >
                          {type === THEORY_RECORDING_TYPE ? (
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                              isDarkTheme ? 'bg-cyan-300 text-slate-950 shadow-[0_0_16px_rgba(103,232,249,0.42)]' : 'bg-cyan-600 text-white'
                            }`}>
                              <Icon size={13} />
                            </span>
                          ) : (
                            <Icon size={12} />
                          )}
                          {getTheoryLauncherLabel(type)}
                        </button>
                      );
                    })
                  ) : (
                    <button
                      type="button"
                      onClick={() => openTheory()}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                        isRecordingTheory
                          ? (isDarkTheme
                              ? 'border-cyan-300/70 bg-[linear-gradient(135deg,rgba(34,211,238,0.24),rgba(168,85,247,0.20))] text-cyan-50 shadow-[0_0_0_1px_rgba(103,232,249,0.16),0_10px_24px_rgba(34,211,238,0.18)] hover:border-cyan-200 hover:bg-cyan-400/22'
                              : 'border-cyan-400 bg-cyan-50 text-cyan-800 shadow-[0_10px_22px_rgba(14,165,233,0.18)] hover:border-cyan-500 hover:bg-cyan-100')
                          : (isDarkTheme
                              ? 'border-violet-400/35 bg-violet-500/12 text-violet-100 hover:bg-violet-500/20'
                              : 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100')
                      }`}
                    >
                      {isRecordingTheory ? (
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                          isDarkTheme ? 'bg-cyan-300 text-slate-950 shadow-[0_0_16px_rgba(103,232,249,0.42)]' : 'bg-cyan-600 text-white'
                        }`}>
                          <PlayCircle size={13} />
                        </span>
                      ) : (
                        <BookOpen size={12} />
                      )}
                      {theoryLauncherLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${softCardClass} ${secondaryTextClass}`}>
                <FileText size={12} />
                {`Задача ${currentQuestionDisplayIndex}`}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${solvedStateClass}`}>
                <CheckCircle2 size={12} />
                {isSolved ? 'Решено ранее' : 'Ожидает решения'}
              </span>
            </div>
            {currentQuestion?.question ? (
              <div className="relative mt-2.5 min-h-0 flex-1 overflow-hidden">
                <div
                  ref={questionScrollBodyRef}
                  onScroll={refreshQuestionScrollState}
                  className={`python-runtime-scrollbar h-full min-h-0 overflow-y-auto whitespace-pre-wrap pb-10 pr-1 text-[14px] font-medium leading-6 md:text-[16px] md:leading-6 ${primaryTextClass}`}
                >
                  {currentQuestion.question}
                </div>
                {questionScrollState.hasOverflow && !questionScrollState.atEnd && (
                  <div
                    className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2 pt-12 ${
                      isDarkTheme
                        ? 'bg-gradient-to-t from-slate-900/95 via-slate-900/76 to-transparent'
                        : 'bg-gradient-to-t from-white/96 via-white/74 to-transparent'
                    }`}
                    aria-hidden="true"
                  >
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] shadow-lg ${
                      isDarkTheme
                        ? 'border-cyan-300/45 bg-cyan-300/14 text-cyan-100 shadow-cyan-950/35'
                        : 'border-cyan-300 bg-cyan-50 text-cyan-800 shadow-cyan-100/70'
                    }`}>
                      ниже
                      <ChevronDown size={14} className="animate-bounce" />
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className={`mt-4 text-sm ${mutedTextClass}`}>Условие задачи пока пустое.</div>
            )}
          </div>

          {isRecordingTheory && theory && (
            <div className={`hidden rounded-[22px] border p-2 md:p-2.5 ${softCardClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-[10px] font-bold uppercase tracking-[0.24em] ${overlineTextClass}`}>Видео-теория</div>
                  <div className={`mt-0.5 text-[13px] font-semibold leading-5 ${primaryTextClass}`}>Материал по текущей задаче</div>
                  <div className={`mt-0.5 text-[11px] leading-4 ${secondaryTextClass}`}>Открывается отдельно в широком окне, чтобы видео и код были хорошо видны.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTheory(true)}
                  className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    isDarkTheme
                      ? 'border-violet-400/40 bg-violet-500/14 text-white hover:bg-violet-500/22'
                      : 'border-violet-500 bg-violet-600 text-white hover:bg-violet-500'
                  }`}
                >
                  Открыть
                </button>
              </div>
            </div>
          )}

          {hasSupportSidebarContent && (
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
          {!canOpenTheory && theory?.content && !isRecordingTheory && (
            <div className={`python-runtime-theory-card rounded-[28px] border p-3.5 md:p-4 ${isDarkTheme ? 'border-violet-300/24 bg-[linear-gradient(180deg,rgba(45,42,82,0.42),rgba(20,29,48,0.86))] shadow-[0_14px_30px_rgba(15,23,42,0.24)]' : 'border-violet-200/70 bg-gradient-to-br from-white via-violet-50/70 to-fuchsia-50/45 shadow-[0_14px_34px_rgba(124,58,237,0.12)]'}`}>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className={`text-xs font-bold uppercase tracking-widest ${overlineTextClass}`}>
                    {theoryType === THEORY_RECORDING_TYPE ? 'Видео-теория' : 'Теория'}
                  </div>
                  <div className={`text-sm font-semibold ${primaryTextClass}`}>Материал по текущей задаче</div>
                  {theoryType === THEORY_RECORDING_TYPE && (
                    <div className={`text-[11px] ${mutedTextClass}`}>
                      Если код не помещается целиком, его можно прокручивать.
                    </div>
                  )}
                  {availableTheoryTypes.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {availableTheoryTypes.map((type) => (
                        <button
                          key={`theory-type-${type}`}
                          type="button"
                          onClick={() => setActiveTheoryType(type)}
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] sm:text-xs font-semibold transition ${
                            type === theoryType
                              ? (isDarkTheme
                                  ? 'border-violet-400/40 bg-violet-500/16 text-white'
                                  : 'border-violet-500 bg-violet-600 text-white')
                              : `${softCardClass} ${secondaryTextClass} hover:border-violet-300 hover:text-violet-700`
                          }`}
                        >
                          {getTheoryTypeLabel(type)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs">
                  {theoryType === 'gdoc' && theoryFullUrl && (
                    <a
                      href={theoryFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold transition ${softCardClass} ${secondaryTextClass} hover:border-violet-300 hover:text-violet-700`}
                    >
                      Открыть полностью
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTheory((prev) => !prev)}
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold transition ${
                      showTheory
                        ? `${softCardClass} ${secondaryTextClass} hover:border-violet-300 hover:text-violet-700`
                        : 'border-violet-500/70 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500'
                    }`}
                  >
                    {showTheory ? 'Свернуть' : 'Показать'}
                  </button>
                </div>
              </div>
              {showTheory && theory && !isRecordingTheory && (
                theoryType === THEORY_RECORDING_TYPE ? (
                  <div className="python-runtime-theory-body">
                    <TheoryRecordingPlayer
                      recording={theoryRecording}
                      progressStorageKey={theoryProgressStorageKey}
                      theme={theme}
                      compact
                    />
                  </div>
                ) : theoryType === 'gdoc' ? (
                  isGoogleDocEmbedUrl(theory.content) ? (
                    <div className={`python-runtime-theory-body mt-3 overflow-hidden rounded-2xl border ${isDarkTheme ? 'border-slate-700/70 bg-slate-800/50' : 'border-purple-100 bg-white'}`}>
                      <iframe
                        title={`theory-${task.number}`}
                        src={theory.content}
                        className="w-full h-[220px] md:h-[300px]"
                      />
                    </div>
                  ) : (
                    <div className="python-runtime-theory-body mt-3 text-sm text-red-500">
                      Нужна ссылка для встраивания Google Docs (Файл → Опубликовать в интернете → Встроить).
                    </div>
                  )
                  ) : (
                  <div className={`python-runtime-theory-body mt-3 max-h-[26svh] overflow-y-auto whitespace-pre-wrap pr-1 text-sm leading-relaxed min-[700px]:max-h-[34svh] ${secondaryTextClass}`}>
                    {theory.content}
                  </div>
                )
              )}
            </div>
          )}
          {screenshots.length > 0 && (
            <div className={`rounded-[28px] border p-3.5 md:p-4 ${elevatedCardClass}`}>
              <div className="mb-3 flex items-center gap-2">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl border ${isDarkTheme ? 'border-sky-400/20 bg-sky-500/10 text-sky-200' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
                  <FolderOpen size={16} />
                </span>
                <div>
                  <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>Материалы</div>
                  <div className={`text-sm font-semibold ${primaryTextClass}`}>Скриншоты к задаче</div>
                </div>
              </div>
              <div className="space-y-2.5 md:space-y-3">
              {screenshots.map((img) => (
                <div
                  key={img.id || img.url}
                  className={`overflow-hidden rounded-[24px] border ${isDarkTheme ? 'border-slate-700/70 bg-slate-800/50' : 'border-slate-200 bg-slate-50/80'}`}
                >
                  <img
                    src={img.url}
                    alt={img.name || 'Скриншот'}
                    className="w-full object-contain cursor-zoom-in"
                    style={{ maxHeight: isMobileViewport ? '42vh' : '65vh' }}
                    onClick={() => setExpandedImage(img)}
                  />
                </div>
              ))}
              </div>
            </div>
          )}

          {extraFiles.length > 0 && (
            <div className={`rounded-[28px] border p-3.5 md:p-4 ${elevatedCardClass}`}>
              <div className="mb-3 flex items-center gap-2">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl border ${isDarkTheme ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                  <FolderOpen size={16} />
                </span>
                <div>
                  <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>Файлы</div>
                  <div className={`text-sm font-semibold ${primaryTextClass}`}>Дополнительные материалы</div>
                </div>
              </div>
              <div className="space-y-2">
                {extraFiles.map((file) => (
                  <a
                    key={file.id || file.url}
                    href={buildDownloadUrl(file.url)}
                    download={file?.name || undefined}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-sm transition ${softCardClass} ${secondaryTextClass} hover:border-violet-300 hover:text-violet-700`}
                  >
                    <span className="truncate">{file.name}</span>
                    <Download size={16} className={isDarkTheme ? 'text-violet-300' : 'text-purple-600'} />
                  </a>
                ))}
              </div>
            </div>
          )}
            </div>
          )}

          </div>

            {isWideWorkspace && (
              <div className="python-runtime-resizer relative hidden min-[700px]:block min-[700px]:col-start-2 min-[700px]:row-span-2">
                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    workspaceResizePointerIdRef.current = event.pointerId;
                    setIsResizingWorkspace(true);
                    updateWorkspaceSplitFromClientX(event.clientX);
                  }}
                  className="group absolute inset-y-0 left-1/2 z-20 w-4 -translate-x-1/2 cursor-col-resize touch-none"
                  aria-label="Изменить ширину панели"
                >
                  <span className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition ${
                    isDarkTheme ? 'bg-slate-700/90 group-hover:bg-violet-400/80' : 'bg-slate-300 group-hover:bg-violet-500/70'
                  } ${isResizingWorkspace ? (isDarkTheme ? 'bg-violet-300' : 'bg-violet-600') : ''}`} />
                  <span className={`absolute left-1/2 top-1/2 flex h-12 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur-sm transition ${
                    isDarkTheme
                      ? 'border-slate-700/80 bg-slate-800/85 text-slate-400 group-hover:border-violet-400/50 group-hover:text-violet-200'
                      : 'border-slate-200 bg-white/96 text-slate-400 group-hover:border-violet-300 group-hover:text-violet-600'
                  } ${isResizingWorkspace ? (isDarkTheme ? 'border-violet-400/60 text-violet-200' : 'border-violet-400 text-violet-600') : ''}`}>
                    <span className="h-5 w-[3px] rounded-full bg-current/80 shadow-[0_7px_0_currentColor,0_-7px_0_currentColor]" />
                  </span>
                </button>
              </div>
            )}

            <div className="min-h-0 min-[700px]:col-start-3 min-[700px]:row-span-2">
          <div className={`python-runtime-editor-panel h-full rounded-[30px] border p-3.5 md:p-4 ${elevatedCardClass} min-h-0 flex flex-col`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>Рабочая зона</div>
                <div className={`mt-1 flex items-center gap-2 text-sm font-semibold md:text-base ${primaryTextClass}`}>
                  <Code2 size={17} className={isDarkTheme ? 'text-violet-300' : 'text-violet-600'} />
                  {workspaceTitle}
                </div>
                <div className={`mt-1 text-sm min-[700px]:hidden ${secondaryTextClass}`}>{workspaceDescription}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const starterCode = typeof questionCodeEntry.starterCode === 'string'
                    ? questionCodeEntry.starterCode
                    : (typeof currentQuestion?.starterCode === 'string' ? currentQuestion.starterCode : '');
                  const updatedInCollab = replaceCodeInCollab(starterCode);
                  clearQuestionCodeError(currentId);
                  if (testResults.length > 0) setTestResults([]);
                  if (!updatedInCollab) {
                    setQuestionCodeEntry(currentId, { code: starterCode });
                    bumpQuestionCodeVersion(currentId);
                    setQuestionCodeDirty(currentId, true);
                    scheduleQuestionSave(currentId);
                  }
                }}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${subtleButtonClass}`}
              >
                <RotateCcw size={15} />
                Сбросить код
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${realtimeStateClass}`}>
                <RealtimeStatusIcon size={12} className={realtimeStatus === 'connecting' ? 'animate-spin' : ''} />
                {realtimeStatusLabel}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${saveStateClass}`}>
                <CheckCircle2 size={12} />
                {saveStateLabel}
              </span>
              {showPresenceChip && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${softCardClass} ${secondaryTextClass}`}>
                  <Users size={12} />
                  {participantsLabel}
                </span>
              )}
            </div>
            {sharedRunLabel && (
              <div className={`mt-3 rounded-2xl border px-3 py-2 text-xs ${isDarkTheme ? 'border-sky-400/20 bg-sky-500/10 text-sky-100' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
                {sharedRunLabel}
                {sharedRunTimeLabel ? ` • ${sharedRunTimeLabel}` : ''}
              </div>
            )}
            <div className={`python-runtime-editor-frame mt-3 min-h-0 flex-1 overflow-hidden rounded-[24px] border ${editorFrameClass}`}>
              <div className={`flex items-center justify-between gap-3 border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${editorHeaderClass}`}>
                <span>main.py</span>
                <span>{questionCodeDirty ? 'Изменения ждут сохранения' : 'Автосохранение'}</span>
              </div>
              <div className="h-full min-h-0">
                <Editor
                  key={`py-test-editor-${collabRoomId || currentId}`}
                  height={codeEditorHeight}
                  language="python"
                  theme={monacoTheme}
                  beforeMount={ensureMonacoColorTheme}
                  defaultValue={collabRoomId ? '' : resolvedCode}
                  onMount={handleEditorMount}
                  options={editorOptions}
                  loading={<div className={`p-4 text-sm ${mutedTextClass}`}>Загрузка редактора...</div>}
                />
              </div>
            </div>
            {questionCodeError && (
              <div className="mt-3 rounded-2xl border border-red-200/80 bg-red-50 px-3 py-2 text-xs text-red-600">{questionCodeError}</div>
            )}
          </div>
            </div>

            <div className="min-h-0 min-[700px]:col-start-1 min-[700px]:row-start-2">
          <div className={`python-runtime-tests-panel h-full rounded-[30px] border p-3.5 md:p-4 ${elevatedCardClass} min-h-0 flex flex-col`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>Проверка</div>
                <div className={`mt-1 flex items-center gap-2 text-sm font-semibold md:text-base ${primaryTextClass}`}>
                  <TestTube2 size={17} className={isDarkTheme ? 'text-violet-300' : 'text-violet-600'} />
                  Тесты задачи
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${softCardClass} ${secondaryTextClass}`}>
                  <PlayCircle size={12} />
                  {`${testsToShow.length} тестов`}
                </span>
                {runnerLoading && (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${isDarkTheme ? 'border-violet-400/30 bg-violet-500/12 text-violet-100' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>
                    <CircleDashed size={12} className="animate-spin" />
                    Запуск...
                  </span>
                )}
              </div>
            </div>
            {runnerError && (
              <div className="mt-3 rounded-2xl border border-red-200/80 bg-red-50 px-3 py-2 text-sm text-red-600">{runnerError}</div>
            )}
            {testsToShow.length === 0 ? (
              <div className={`mt-4 rounded-2xl border px-3 py-3 text-sm ${softCardClass} ${secondaryTextClass}`}>Учитель еще не добавил тесты.</div>
            ) : (
              <div className="python-runtime-scrollbar mt-2.5 min-h-0 space-y-2 overflow-y-auto pr-1">
                {testsToShow.map((item, idx) => {
                  const result = testResults[idx];
                  const passed = result?.passed ?? (solvedAllTests ? true : undefined);
                  const testCardClass = passed === undefined
                    ? (isDarkTheme ? 'border-slate-700/60 bg-slate-800/35' : 'border-slate-200 bg-slate-50')
                    : (passed
                        ? (isDarkTheme ? 'border-emerald-400/25 bg-emerald-500/10' : 'border-emerald-200 bg-emerald-50')
                        : (isDarkTheme ? 'border-red-400/25 bg-red-500/10' : 'border-red-200 bg-red-50'));
                  const statusTextClass = passed === undefined
                    ? mutedTextClass
                    : (passed
                        ? (isDarkTheme ? 'text-emerald-200' : 'text-emerald-700')
                        : (isDarkTheme ? 'text-red-200' : 'text-red-600'));
                  const inputPreview = item.input || '—';
                  const expectedPreview = item.output || '—';
                  const actualPreview = result
                    ? (result.error ? `Ошибка: ${result.error}` : (normalizeOutput(result.output) || '—'))
                    : '—';
                  const rowTitle = [
                    `Вход: ${inputPreview}`,
                    `Ожидалось: ${expectedPreview}`,
                    `Вывод: ${actualPreview}`,
                  ].join('\n');
                  return (
                    <div
                      key={`${idx}-${item.input}`}
                      style={{ '--python-test-i': `${idx}` }}
                      className={`python-runtime-test-card rounded-[18px] border px-2.5 py-2 text-[11px] md:text-xs ${testCardClass}`}
                      title={rowTitle}
                    >
                      <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pr-1">
                        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold ${softCardClass} ${secondaryTextClass}`}>
                          {idx + 1}
                        </span>
                        <span className={`shrink-0 font-semibold ${primaryTextClass}`}>{`Тест ${idx + 1}`}</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTextClass} ${passed === undefined ? softCardClass : ''}`}>
                          {passed === undefined ? 'Не запускался' : (passed ? 'OK' : 'Ошибка')}
                        </span>
                        <span className={`shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] ${mutedTextClass}`}>Вход</span>
                        <span className={`max-w-[110px] shrink-0 truncate font-mono ${secondaryTextClass}`}>{inputPreview}</span>
                        <span className={`shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] ${mutedTextClass}`}>Ожидалось</span>
                        <span className={`max-w-[110px] shrink-0 truncate font-mono ${secondaryTextClass}`}>{expectedPreview}</span>
                        <span className={`shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] ${mutedTextClass}`}>Вывод</span>
                        <span className={`max-w-[120px] shrink-0 truncate font-mono ${secondaryTextClass}`}>{actualPreview}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            </div>
          </div>
        </div>

        <div className={`python-runtime-footer mt-1 rounded-[24px] border px-3 ${
          isCompactRuntimeViewport ? 'py-2 md:px-3' : 'py-2.5 md:px-3.5 md:py-3'
        } pb-[calc(env(safe-area-inset-bottom)+0.25rem)] ${footerClass}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="python-runtime-footer-status flex flex-wrap items-center gap-2 text-xs sm:text-sm">
              <span className={isDarkTheme ? 'text-slate-300' : 'text-slate-600'}>
                Прогресс темы: <span className={`font-semibold ${isDarkTheme ? 'text-violet-200' : 'text-purple-700'}`}>{currentMastery}%</span>
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${softCardClass} ${secondaryTextClass}`}>
                {`${currentQuestionDisplayIndex}/${totalVisibleQuestions}`}
              </span>
              <span className={`python-runtime-footer-note ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                {isSolved ? 'Задача решена, можно идти дальше.' : 'Сначала запусти тесты и проверь решение.'}
              </span>
            </div>
            <div className="python-runtime-footer-actions flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                variant="secondary"
                onClick={onClose}
                className={`python-runtime-action python-runtime-action--secondary w-full sm:w-auto ${isDarkTheme ? '!border-slate-700 !bg-slate-800/70 !text-slate-200 hover:!bg-slate-700' : ''}`}
              >
                Закрыть
              </Button>
            <Button
              onClick={(event) => {
                const rect = event?.currentTarget?.getBoundingClientRect?.();
                handleRunTests(rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)
                  ? {
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                    }
                  : null);
              }}
              disabled={runnerLoading || questionCodeLoading || !resolvedCode.trim()}
              className="python-runtime-action python-runtime-action--primary w-full sm:w-auto"
            >
              <PlayCircle size={16} />
              {runnerLoading ? '\u0417\u0430\u043f\u0443\u0441\u043a...' : '\u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0442\u0435\u0441\u0442\u044b'}
            </Button>
            <Button
              variant={isSolved ? 'success' : 'secondary'}
              onClick={handleNext}
              className={`python-runtime-action python-runtime-action--next w-full sm:w-auto ${isDarkTheme && !isSolved ? '!border-slate-700 !bg-slate-800/70 !text-slate-200 hover:!bg-slate-700' : ''}`}
            >
              <ChevronRight size={16} />
              {Number.isFinite(nextQuestionIndex) ? 'Дальше' : 'Готово'}
            </Button>
            </div>
          </div>
        </div>
          </div>
        </div>
      </div>
      {showTheory && canOpenTheory && theory && (
        <div className="python-theory-modal-overlay absolute inset-0 z-[55] flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm md:p-5">
          <div className={`python-theory-modal-shell flex h-[min(82vh,860px)] w-full max-w-[min(1180px,96vw)] flex-col overflow-hidden rounded-[32px] border p-3 md:p-4 ${elevatedCardClass}`}>
            <div className="python-theory-modal-header mb-3 flex items-start justify-between gap-3">
              <div className="python-theory-modal-copy min-w-0">
                <div className={`python-theory-modal-kicker text-[11px] font-bold uppercase tracking-[0.28em] ${overlineTextClass}`}>{theoryLauncherLabel}</div>
                <div className={`python-theory-modal-title mt-1 text-base font-semibold ${primaryTextClass}`}>Материал по текущей задаче</div>
                <div className={`python-theory-modal-subtitle mt-1 text-sm ${secondaryTextClass}`}>
                  {isRecordingTheory
                    ? 'Открыта в широком режиме, чтобы плеер не сжимался в боковой колонке.'
                    : 'Открыта отдельно, чтобы условие, тесты и редактор оставались на месте.'}
                </div>
                <div className="python-theory-modal-meta">
                  <span>{`Задача ${currentQuestionDisplayIndex}/${totalVisibleQuestions}`}</span>
                  {theoryRecordingDurationLabel && <span>{theoryRecordingDurationLabel}</span>}
                </div>
                {availableTheoryTypes.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {availableTheoryTypes.map((type) => (
                      <button
                        key={`theory-modal-type-${type}`}
                        type="button"
                        onClick={() => setActiveTheoryType(type)}
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                          type === theoryType
                            ? (isDarkTheme
                                ? 'border-violet-400/40 bg-violet-500/16 text-white'
                                : 'border-violet-500 bg-violet-600 text-white')
                            : `${softCardClass} ${secondaryTextClass} hover:border-violet-300 hover:text-violet-700`
                        }`}
                      >
                        {getTheoryTypeLabel(type)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowTheory(false)}
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition ${subtleButtonClass}`}
                aria-label="Закрыть теорию"
              >
                <X size={18} />
              </button>
            </div>
            <div className="python-theory-modal-player min-h-0 flex-1 overflow-hidden">
              {isRecordingTheory && theoryRecording ? (
                <TheoryRecordingPlayer
                  recording={theoryRecording}
                  progressStorageKey={theoryProgressStorageKey}
                  theme={theme}
                  className="!mt-0 h-full"
                />
              ) : theoryType === 'gdoc' ? (
                isGoogleDocEmbedUrl(theory.content) ? (
                  <iframe
                    title={`theory-${task.number}`}
                    src={theory.content}
                    className={`h-full w-full rounded-[24px] border ${isDarkTheme ? 'border-slate-700/70 bg-slate-800/50' : 'border-purple-100 bg-white'}`}
                  />
                ) : (
                  <div className="rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-600">
                    Нужна ссылка для встраивания Google Docs (Файл → Опубликовать в интернете → Встроить).
                  </div>
                )
              ) : (
                <div className={`h-full overflow-y-auto whitespace-pre-wrap rounded-[24px] border p-4 text-sm leading-relaxed md:p-5 md:text-base ${softCardClass} ${secondaryTextClass}`}>
                  {theory.content}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {expandedImage && (
        <div
          className="python-runtime-modal-overlay fixed inset-0 z-[60] bg-black/80 modal-backdrop flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={expandedImage.url}
              alt={expandedImage.name || 'Скриншот'}
              className="w-full h-full object-contain rounded-2xl shadow-2xl"
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
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};



export default PythonTestModal;


