import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Code2,
  FileText,
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
import TheoryRecordingPlayer from './TheoryRecordingPlayer';
import { Button } from './ui';
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from '../utils/monacoTheme';
import {
  buildPythonSubsectionModel,
  getPythonTaskEntry,
  PYTHON_DEFAULT_SUBSECTION_ID,
} from '../utils/pythonSubsections';
import {
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

const supportsCssZoom = () => {
  if (typeof window === 'undefined' || typeof window.CSS?.supports !== 'function') return false;
  try {
    return window.CSS.supports('zoom', '0.9');
  } catch {
    return false;
  }
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

const resolveTheoryVariantsForSubsection = (taskEntry, subsectionId) => {
  const safeSubsectionId = normalizeTheorySubsectionId(subsectionId);
  const bySubsection = normalizeTheoryBySubsectionMap(taskEntry?.pythonTheoryBySubsection);
  if (bySubsection[safeSubsectionId]) return bySubsection[safeSubsectionId];
  if (safeSubsectionId !== PYTHON_DEFAULT_SUBSECTION_ID && bySubsection[PYTHON_DEFAULT_SUBSECTION_ID]) {
    return bySubsection[PYTHON_DEFAULT_SUBSECTION_ID];
  }
  return normalizeTheoryVariantMap(taskEntry?.pythonTheory);
};

const PythonReviewModal = ({
  theme = '',
  task,
  onClose,
  studentId,
  testDb,
  PYTHON_LEVEL_ID,
  ensurePyodideReady,
  mergeRuntimeErrorText,
  createPyodideWorker,
  normalizeOutput,
  normalizeOutputForComparison,
  normalizeRuntimeErrorForCheck,
  PYODIDE_RUN_TIMEOUT_MS,
  ALLOW_MAIN_THREAD_PYTHON_FALLBACK,
  getLocalDayKey,
  isGoogleDocEmbedUrl,
  buildGoogleDocFullUrl,
  codeSyncRoomId = '',
}) => {
  const monacoTheme = resolveMonacoColorTheme(theme);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedSubsectionId, setSelectedSubsectionId] = useState(PYTHON_DEFAULT_SUBSECTION_ID);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedCodeById, setSolvedCodeById] = useState({});
  const [showTheory, setShowTheory] = useState(false);
  const [activeTheoryType, setActiveTheoryType] = useState('');
  const [questionCodeById, setQuestionCodeById] = useState({});
  const [questionCodeLoadingById, setQuestionCodeLoadingById] = useState({});
  const [questionCodeSavingById, setQuestionCodeSavingById] = useState({});
  const [questionCodeErrorById, setQuestionCodeErrorById] = useState({});
  const [questionCodeDirtyById, setQuestionCodeDirtyById] = useState({});
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
  const [runnerLoading, setRunnerLoading] = useState(false);
  const [runnerError, setRunnerError] = useState('');
  const [testResults, setTestResults] = useState([]);
  const [expandedTestIndex, setExpandedTestIndex] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(() => getRuntimeViewportWidth());
  const [workspaceSplitRatio, setWorkspaceSplitRatio] = useState(0.62);
  const [isResizingWorkspace, setIsResizingWorkspace] = useState(false);
  const isMobileViewport = viewportWidth < 700;

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
  const workspaceGridRef = useRef(null);
  const workspaceResizePointerIdRef = useRef(null);

  const questionCodeByIdRef = useRef({});
  const questionCodeLoadingByIdRef = useRef({});
  const questionCodeSavingByIdRef = useRef({});
  const questionCodeRetrySaveByIdRef = useRef({});
  const questionCodeDirtyByIdRef = useRef({});
  const questionCodeLocalVersionRef = useRef({});
  const pendingSaveQuestionIdRef = useRef('');
  const saveTimerRef = useRef(null);
  const taskEntry = useMemo(() => getPythonTaskEntry(testDb, task?.number), [testDb, task?.number]);
  const subsectionModel = useMemo(() => buildPythonSubsectionModel(taskEntry, PYTHON_LEVEL_ID), [taskEntry, PYTHON_LEVEL_ID]);
  const collabBaseRoomId = String(codeSyncRoomId || '').trim();
  const collabWsUrl = useMemo(() => getCollabWsUrl(), []);
  const localCollabName = useMemo(() => 'Преподаватель', []);
  const localCollabColor = useMemo(
    () => pickCollabColor(`teacher-${studentId || 'anon'}`, '#7c3aed'),
    [studentId]
  );
  const activeQuestionId = useMemo(
    () => String(questions[currentIndex]?.id ?? '').trim(),
    [questions, currentIndex]
  );
  const activeQuestionCodeLoaded = Boolean(questionCodeById?.[activeQuestionId]?.loaded);
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

  const theoryTypeForVisibility = String(activeTheoryType || '').trim();
  useEffect(() => {
    setShowTheory(theoryTypeForVisibility === THEORY_RECORDING_TYPE);
  }, [task?.number, selectedSubsectionId, theoryTypeForVisibility]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncViewportWidth = () => setViewportWidth(getRuntimeViewportWidth());
    syncViewportWidth();
    window.addEventListener('resize', syncViewportWidth);
    window.visualViewport?.addEventListener?.('resize', syncViewportWidth);
    return () => {
      window.removeEventListener('resize', syncViewportWidth);
      window.visualViewport?.removeEventListener?.('resize', syncViewportWidth);
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
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };
  }, [isResizingWorkspace, updateWorkspaceSplitFromClientX]);

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

  const setQuestionCodeError = (questionId, message) => {
    const key = String(questionId ?? '').trim();
    if (!key) return;
    setQuestionCodeErrorById((prev) => ({ ...(prev || {}), [key]: message || '' }));
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

  const setInputInCollab = useCallback((nextInput) => {
    const stateMap = collabStateMapRef.current;
    const doc = collabDocRef.current;
    if (!stateMap || !doc) return false;
    doc.transact(() => {
      stateMap.set('input', typeof nextInput === 'string' ? nextInput : '');
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
    setQuestions(list);
    setCurrentIndex(0);
    setSelectedSubsectionId(
      subsectionModel.questionSectionByIndex.get(0)
      || subsectionModel.subsections.find((section) => section.count > 0)?.id
      || PYTHON_DEFAULT_SUBSECTION_ID
    );
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
    setExpandedTestIndex(null);
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
  }, [task?.number, subsectionModel, studentId, PYTHON_LEVEL_ID]);

  useEffect(() => {
    if (!questions.length) return;
    const nextSubsectionId = subsectionModel.questionSectionByIndex.get(currentIndex) || PYTHON_DEFAULT_SUBSECTION_ID;
    if (nextSubsectionId !== selectedSubsectionId) {
      setSelectedSubsectionId(nextSubsectionId);
    }
  }, [currentIndex, questions.length, selectedSubsectionId, subsectionModel]);

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
    const seedCode = getQuestionCodeEntry(activeQuestionId, questionCodeByIdRef.current).loaded
      ? getQuestionCodeEntry(activeQuestionId, questionCodeByIdRef.current).code
      : getFallbackCodeForQuestion(currentQuestion, activeQuestionId);
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
      role: 'teacher',
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

  useEffect(() => {
    if (!studentId || !task?.number) return;
    flushScheduledQuestionSave();
    const currentQuestion = questions[currentIndex];
    const currentId = String(currentQuestion?.id ?? '').trim();
    if (!currentId) return;
    loadQuestionCode(currentQuestion, currentId).catch(() => {});
    setTestResults([]);
    setRunnerError('');
    setExpandedTestIndex(null);
  }, [studentId, task?.number, questions, currentIndex, solvedCodeById]);

  useEffect(() => {
    setEditorReady(false);
  }, [collabRoomId]);

  const mergeRuntimeErrors = useCallback((primary, secondary) => {
    if (typeof mergeRuntimeErrorText === 'function') {
      return mergeRuntimeErrorText(primary, secondary);
    }
    const head = String(primary || '').trim();
    const tail = String(secondary || '').trim();
    if (!head) return tail;
    if (!tail) return head;
    return `${head}\n${tail}`;
  }, [mergeRuntimeErrorText]);

  const resolvePendingRuns = (message) => {
    runnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrors(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({ output, error });
    });
    runnerPendingRef.current.clear();
  };

  const disposeRunnerWorker = (message) => {
    if (runnerWorkerRef.current) {
      runnerWorkerRef.current.terminate();
      runnerWorkerRef.current = null;
    }
    if (message) resolvePendingRuns(message);
  };

  const ensureRunnerWorker = () => {
    if (typeof Worker === 'undefined' || typeof createPyodideWorker !== 'function') return null;
    if (runnerWorkerRef.current) return runnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = runnerPendingRef.current.get(data.id);
        if (!pending) return;
        const messageType = typeof data.type === 'string' ? data.type : 'result';
        if (messageType === 'stdout' || messageType === 'stderr') {
          const chunk = typeof data.chunk === 'string' ? data.chunk : String(data.chunk ?? '');
          if (!chunk) return;
          if (messageType === 'stdout') pending.output = `${pending.output || ''}${chunk}`;
          else pending.error = `${pending.error || ''}${chunk}`;
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

  useEffect(() => () => disposeRunnerWorker('Python runner stopped.'), []);

  const runPythonInMainThread = async (source, inputValue) => {
    if (typeof ensurePyodideReady !== 'function') {
      return { output: '', error: 'Pyodide недоступен.' };
    }
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
    const worker = ensureRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timeoutMs = Number(PYODIDE_RUN_TIMEOUT_MS) || 15000;
        const timer = setTimeout(() => {
          const pending = runnerPendingRef.current.get(id);
          if (!pending) return;
          runnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(timeoutMs / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrors(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error });
          disposeRunnerWorker('Превышено время выполнения.');
        }, timeoutMs);
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
    runPythonCode('pass', '').catch(() => {});
  }, []);

  const handleRunTests = async () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;
    const currentId = String(currentQuestion?.id ?? '').trim();
    const entry = getQuestionCodeEntry(currentId, questionCodeById);
    const fallbackSolvedCode = typeof solvedCodeById?.[currentId] === 'string' ? solvedCodeById[currentId] : '';
    const fallbackStarterCode = typeof currentQuestion?.starterCode === 'string' ? currentQuestion.starterCode : '';
    const editorModel = editorRef.current?.getModel?.();
    const liveEditorCode = typeof editorModel?.getValue === 'function'
      ? editorModel.getValue()
      : null;
    const currentCode = typeof liveEditorCode === 'string'
      ? liveEditorCode
      : (entry.loaded ? entry.code : (fallbackSolvedCode || fallbackStarterCode));
    if (!String(currentCode || '').trim()) return;

    flushScheduledQuestionSave();
    if (currentId) {
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

    const normalizeOutputForComparisonSafe = typeof normalizeOutputForComparison === 'function'
      ? normalizeOutputForComparison
      : (value) => String(value ?? '').replace(/\r\n/g, '\n').trim();
    const normalizeRuntimeErrorForCheckSafe = typeof normalizeRuntimeErrorForCheck === 'function'
      ? normalizeRuntimeErrorForCheck
      : (value) => String(value ?? '').trim();

    try {
      const resultsList = [];
      for (const test of sanitizedTests) {
        const res = await runPythonCode(currentCode, test.input);
        const normalizedOut = normalizeOutputForComparisonSafe(res.output);
        const normalizedExpected = normalizeOutputForComparisonSafe(test.output);
        const runtimeErrorText = normalizeRuntimeErrorForCheckSafe(res.error);
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

      if (shouldSubmit && studentId) {
        try {
          await api.solveQuestion({
            studentId,
            taskNumber: task.number,
            levelId: PYTHON_LEVEL_ID,
            questionId: currentQuestion.id,
            totalQuestions: questions.length,
            levelMax: 100,
            levelTotals: { [PYTHON_LEVEL_ID]: questions.length },
            code: currentCode,
            localDay: typeof getLocalDayKey === 'function' ? getLocalDayKey() : undefined,
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
        } catch (err) {
          const message = String(err?.message || err || 'Не удалось сохранить результат');
          setRunnerError(message);
          publishSharedRunState({
            status: 'error',
            author: localCollabName,
            summary: message,
            ts: Date.now(),
          });
          return;
        }
      }
    } catch (err) {
      const message = String(err?.message || err || 'Ошибка запуска');
      setRunnerError(message);
      publishSharedRunState({
        status: 'error',
        author: localCollabName,
        summary: message,
        ts: Date.now(),
      });
    } finally {
      setRunnerLoading(false);
    }
  };


  if (!task) return null;
  const testsLoading = testDb === null || typeof testDb === 'undefined';

  if (testsLoading) {
    const loadingModal = (
      <div className="python-runtime-modal-overlay fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="python-runtime-modal-shell surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <div className="mx-auto inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700">
            <RefreshCcw size={14} className="animate-spin" />
            {'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0437\u0430\u0434\u0430\u043d\u0438\u0439...'}
          </div>
          <p className="text-gray-500 mt-3 text-sm">{'\u041f\u043e\u0434\u043e\u0436\u0434\u0438\u0442\u0435 \u043d\u0435\u043c\u043d\u043e\u0433\u043e, \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0437\u0430\u0434\u0430\u043d\u0438\u044f \u0438 \u0442\u0435\u0441\u0442\u044b.'}</p>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(loadingModal, document.body) : null;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    const emptyModal = (
      <div className="python-runtime-modal-overlay fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="python-runtime-modal-shell surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <h2 className="text-2xl font-bold text-gray-900">{'\u0417\u0430\u0434\u0430\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442'}</h2>
          <p className="text-gray-500 mt-2">{'\u0414\u043b\u044f \u044d\u0442\u043e\u0439 \u0442\u0435\u043c\u044b \u043d\u0435\u0442 \u0437\u0430\u0434\u0430\u0447.'}</p>
          <div className="mt-6">
            <Button onClick={onClose}>{'\u0417\u0430\u043a\u0440\u044b\u0442\u044c'}</Button>
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
  const fallbackSolvedCode = typeof solvedCodeById?.[currentId] === 'string' ? solvedCodeById[currentId] : '';
  const fallbackStarterCode = typeof currentQuestion?.starterCode === 'string' ? currentQuestion.starterCode : '';
  const code = questionCodeEntry.loaded ? questionCodeEntry.code : (fallbackSolvedCode || fallbackStarterCode);
  const questionCodeLoading = Boolean(questionCodeLoadingById?.[currentId]);
  const questionCodeSaving = Boolean(questionCodeSavingById?.[currentId]);
  const questionCodeDirty = Boolean(questionCodeDirtyById?.[currentId]);
  const questionCodeError = questionCodeErrorById?.[currentId] || '';
  const updatedAtLabel = questionCodeEntry.updatedAt
    ? new Date(questionCodeEntry.updatedAt).toLocaleString('ru-RU')
    : '';
  const rawTests = Array.isArray(currentQuestion?.tests)
    ? currentQuestion.tests
    : (currentQuestion?.answer ? [{ input: '', output: currentQuestion.answer }] : []);
  const testsToShow = rawTests.map((test) => ({
    input: String(test?.input ?? ''),
    output: String(test?.output ?? ''),
  }));
  const solvedAllTests = isSolved && testResults.length === 0;
  const formatOutput = typeof normalizeOutput === 'function'
    ? normalizeOutput
    : (value) => String(value ?? '');
  const activeTheorySubsectionId = activeSubsection?.id || PYTHON_DEFAULT_SUBSECTION_ID;
  const theoryVariants = resolveTheoryVariantsForSubsection(taskEntry, activeTheorySubsectionId);
  const availableTheoryTypes = getTheoryVariantList(theoryVariants);
  const theoryType = pickTheoryVariantType(theoryVariants, activeTheoryType);
  const theory = theoryType ? theoryVariants[theoryType] : null;
  const theoryFullUrl = theoryType === 'gdoc' ? buildGoogleDocFullUrl(theory?.content) : '';
  const theoryRecording = theoryType === THEORY_RECORDING_TYPE
    ? normalizeTheoryRecording(theory?.content)
    : null;
  const isDarkTheme = theme === 'dark';
  const currentQuestionDisplayIndex = Math.max(1, currentQuestionPosition + 1);
  const totalVisibleQuestions = Math.max(visibleQuestionItems.length, 1);
  const solvedVisibleCount = visibleQuestionItems.reduce((count, item) => (
    solvedIds.has(String(item.question?.id ?? item.questionIndex)) ? count + 1 : count
  ), 0);
  const visibleCompletion = visibleQuestionItems.length
    ? Math.round((solvedVisibleCount / visibleQuestionItems.length) * 100)
    : 0;
  const currentMastery = questions.length
    ? Math.round((solvedIds.size / questions.length) * 100)
    : 0;
  const isRecordingTheory = theoryType === THEORY_RECORDING_TYPE && Boolean(theoryRecording);
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
    formatOnPaste: true,
  };
  const reviewEditorHeight = isMobileViewport ? '320px' : '100%';
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
            : (updatedAtLabel ? `Сохранено ${updatedAtLabel}` : 'Автосохранение включено')));
  const saveStateClass = questionCodeDirty
    ? (isDarkTheme
        ? 'border-amber-400/30 bg-amber-500/12 text-amber-200'
        : 'border-amber-200 bg-amber-50 text-amber-700')
    : ((questionCodeSaving || questionCodeLoading)
        ? (isDarkTheme
            ? 'border-sky-400/30 bg-sky-500/12 text-sky-200'
            : 'border-sky-200 bg-sky-50 text-sky-700')
        : (updatedAtLabel
            ? (isDarkTheme
                ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700')
            : (isDarkTheme
                ? 'border-slate-700 bg-slate-900/70 text-slate-300'
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
            ? 'border-slate-700 bg-slate-900/70 text-slate-300'
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
  const primaryTextClass = isDarkTheme ? 'text-white' : 'text-slate-900';
  const secondaryTextClass = isDarkTheme ? 'text-slate-300' : 'text-slate-600';
  const mutedTextClass = isDarkTheme ? 'text-slate-400' : 'text-slate-500';
  const overlineTextClass = isDarkTheme ? 'text-violet-300' : 'text-purple-600';
  const modalShellThemeClass = isDarkTheme
    ? ''
    : 'bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.98),rgba(248,250,252,0.95)_42%,rgba(237,233,254,0.62)_100%)]';
  const elevatedCardClass = isDarkTheme
    ? 'border-slate-800/90 bg-[linear-gradient(180deg,rgba(8,12,24,0.985),rgba(4,8,20,0.99))] shadow-[0_24px_56px_rgba(2,6,23,0.52)]'
    : 'border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(244,247,255,0.97))] shadow-[0_18px_42px_rgba(148,163,184,0.14),inset_0_1px_0_rgba(255,255,255,0.88)]';
  const softCardClass = isDarkTheme
    ? 'border-slate-800/85 bg-slate-950/80 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)]'
    : 'border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,247,255,0.90))] shadow-[0_10px_24px_rgba(148,163,184,0.08),inset_0_1px_0_rgba(255,255,255,0.82)]';
  const mutedStripClass = isDarkTheme
    ? 'border-slate-800/80 bg-slate-950/72'
    : 'border-slate-200/90 bg-[linear-gradient(180deg,rgba(246,248,255,0.94),rgba(238,242,255,0.90))]';
  const subtleButtonClass = isDarkTheme
    ? 'border-slate-800/80 bg-slate-950/60 text-slate-300 hover:border-violet-400/30 hover:bg-slate-900 hover:text-white'
    : 'border-slate-200/90 bg-white/92 text-slate-700 shadow-[0_8px_18px_rgba(148,163,184,0.10)] hover:border-violet-200 hover:bg-violet-50/90 hover:text-slate-900';
  const footerClass = isDarkTheme
    ? 'border-slate-800/90 bg-[linear-gradient(90deg,rgba(8,12,24,0.98),rgba(35,30,72,0.96),rgba(8,12,24,0.98))] shadow-[0_-18px_38px_rgba(2,6,23,0.34)]'
    : 'border-violet-200/90 bg-[linear-gradient(90deg,rgba(245,243,255,0.96),rgba(250,245,255,0.96),rgba(240,249,255,0.96))] shadow-[0_-12px_28px_rgba(148,163,184,0.14),inset_0_1px_0_rgba(255,255,255,0.88)]';
  const questionCardClass = isDarkTheme
    ? 'border-slate-800/90 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.14),transparent_24%),linear-gradient(180deg,rgba(10,14,30,0.99),rgba(4,8,20,0.99))] shadow-[0_24px_56px_rgba(2,6,23,0.52),inset_0_1px_0_rgba(148,163,184,0.04)]'
    : 'border-violet-200/90 bg-[radial-gradient(circle_at_top_left,rgba(196,181,253,0.42),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(245,247,255,0.97))] shadow-[0_18px_42px_rgba(139,92,246,0.12)]';
  const editorFrameClass = isDarkTheme
    ? 'border-slate-800 bg-slate-950/80'
    : 'border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(244,247,255,0.96))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]';
  const editorHeaderClass = isDarkTheme
    ? 'border-slate-800 bg-slate-950/70 text-slate-400'
    : 'border-slate-200/90 bg-[linear-gradient(180deg,rgba(247,248,252,0.96),rgba(241,245,249,0.92))] text-slate-500';
  const workspaceTitle = realtimePeerCount > 0 ? 'Совместный редактор Python' : 'Редактор Python';
  const workspaceDescription = realtimePeerCount > 0
    ? 'Код синхронизируется в realtime и виден всем участникам комнаты.'
    : 'Просматривайте решение ученика, запускайте тесты и сразу проверяйте результат.';
  const isWideWorkspace = viewportWidth >= 700;
  const workspaceGridClass = 'min-[700px]:grid-rows-[minmax(180px,0.26fr)_minmax(0,1fr)]';
  const workspaceGridStyle = isWideWorkspace
    ? {
        gridTemplateColumns: `clamp(220px, ${(workspaceSplitRatio * 100).toFixed(2)}%, 760px) 14px minmax(0, 1fr)`,
      }
    : undefined;
  const responsiveLayoutScale = viewportWidth >= 1340
    ? 1
    : Math.max(700 / 1340, viewportWidth / 1340);
  const canUseCssZoom = supportsCssZoom();
  const responsiveLayoutStyle = responsiveLayoutScale < 0.999
    ? (
        canUseCssZoom
          ? {
              width: `${100 / responsiveLayoutScale}%`,
              height: `${100 / responsiveLayoutScale}%`,
              zoom: responsiveLayoutScale,
            }
          : {
              width: `${100 / responsiveLayoutScale}%`,
              height: `${100 / responsiveLayoutScale}%`,
              transform: `scale(${responsiveLayoutScale})`,
              transformOrigin: 'top left',
            }
      )
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
  const showPresenceChip = realtimePeerCount > 0;
  const handleNext = () => {
    if (!Number.isFinite(nextQuestionIndex)) return;
    const nextSubsection = visibleSubsections.find((section) => section.questionIndexes.includes(nextQuestionIndex));
    if (nextSubsection?.id) setSelectedSubsectionId(nextSubsection.id);
    setCurrentIndex(nextQuestionIndex);
  };

  if (globalThis.__PYTHON_REVIEW_LEGACY__ === true) {
    const legacyModal = (
    <div className="python-runtime-modal-overlay fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-stretch justify-stretch p-0 backdrop-blur-sm">
      <div className="python-runtime-modal-shell surface-card modal-card modal-card--fullscreen rounded-none w-screen h-[100dvh] max-w-none max-h-none p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="python-runtime-modal-header flex flex-col gap-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">{'\u0422\u0435\u043c\u0430'}</div>
              <div className="text-lg font-bold text-gray-900">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          </div>

          {showSubsectionNav && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Подразделы</div>
              <div className="flex flex-wrap gap-2">
                {visibleSubsections.map((section) => (
                  <button
                    key={`review-subsection-${section.id}`}
                    type="button"
                    onClick={() => handleSelectSubsection(section.id)}
                    className={`python-runtime-chip rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      section.id === activeSubsection?.id
                        ? 'border-purple-500 bg-purple-600 text-white'
                        : 'border-purple-100 bg-white text-slate-600 hover:border-purple-300 hover:text-purple-700'
                    }`}
                  >
                    {`${section.title} · ${section.count}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {activeSubsection ? `Раздел: ${activeSubsection.title}` : 'Раздел'}
            </div>
            <div className="flex flex-wrap gap-2">
              {visibleQuestionItems.map((item) => {
                const qId = String(item.question?.id ?? item.questionIndex);
                const solved = solvedIds.has(qId);
                const isCurrent = item.questionIndex === currentIndex;
                const buttonClass = isCurrent && solved
                  ? 'border-green-400 ring-2 ring-green-100 bg-green-100 text-green-700'
                  : (isCurrent
                      ? 'border-purple-600 ring-2 ring-purple-200 text-purple-600 bg-white'
                      : (solved
                          ? 'border-green-200 bg-green-100 text-green-600'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700'));
                const label = item.question?.title || `Вопрос ${item.localNumber}`;
                return (
                  <button
                    key={`review-question-${qId}`}
                    type="button"
                    onClick={() => setCurrentIndex(item.questionIndex)}
                    className={`python-runtime-chip min-w-[132px] rounded-2xl border px-3 py-2 text-left transition-all ${buttonClass}`}
                    title={label}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{`Задача ${item.localNumber}`}</div>
                    <div className="mt-1 truncate text-xs font-semibold">{label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {theory?.content && (
            <div className="python-runtime-theory-card mb-6 rounded-3xl border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/70 to-fuchsia-50/45 p-4 shadow-[0_14px_34px_rgba(124,58,237,0.12)]">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-bold uppercase tracking-widest text-purple-700">
                    {theoryType === THEORY_RECORDING_TYPE ? 'Видео-теория' : 'Теория'}
                  </div>
                  {theoryType === THEORY_RECORDING_TYPE && (
                    <div className="text-[11px] text-slate-500">
                      Если код не помещается целиком, его можно прокручивать.
                    </div>
                  )}
                  {availableTheoryTypes.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {availableTheoryTypes.map((type) => (
                        <button
                          key={`review-theory-type-${type}`}
                          type="button"
                          onClick={() => setActiveTheoryType(type)}
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] sm:text-xs font-semibold transition ${
                            type === theoryType
                              ? 'border-violet-500 bg-violet-600 text-white'
                              : 'border-violet-200/80 bg-white/80 text-violet-700 hover:border-violet-300 hover:bg-white'
                          }`}
                        >
                          {getTheoryTypeLabel(type)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {theoryType === 'gdoc' && theoryFullUrl && (
                    <a
                      href={theoryFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-full border border-violet-200/70 bg-white/75 px-2.5 py-1 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-white"
                    >
                      {'\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e'}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTheory((prev) => !prev)}
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                      showTheory
                        ? 'border-violet-300/80 bg-white/75 text-violet-700 hover:border-violet-400 hover:bg-white'
                        : 'border-violet-500/70 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500'
                    }`}
                  >
                    {showTheory ? '\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c' : '\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c'}
                  </button>
                </div>
              </div>
              {showTheory && theory && (
                theoryType === THEORY_RECORDING_TYPE ? (
                  <div className="python-runtime-theory-body"><TheoryRecordingPlayer recording={theoryRecording} theme={theme} /></div>
                ) : theoryType === 'gdoc' ? (
                  isGoogleDocEmbedUrl(theory.content) ? (
                    <div className="python-runtime-theory-body mt-3 overflow-hidden rounded-xl border border-purple-100 bg-white">
                      <iframe
                        title={`theory-review-${task.number}`}
                        src={theory.content}
                        className="w-full h-[300px]"
                      />
                    </div>
                  ) : (
                    <div className="python-runtime-theory-body mt-3 text-sm text-red-500">{'\u041d\u0443\u0436\u043d\u0430 \u0441\u0441\u044b\u043b\u043a\u0430 \u0434\u043b\u044f \u0432\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u043d\u0438\u044f Google Docs (\u0424\u0430\u0439\u043b \u2192 \u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c \u0432 \u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442\u0435 \u2192 \u0412\u0441\u0442\u0440\u043e\u0438\u0442\u044c).'}</div>
                  )
                ) : (
                  <div className="python-runtime-theory-body mt-3 whitespace-pre-wrap text-sm text-gray-700">
                    {theory.content}
                  </div>
                )
              )}
            </div>
          )}

          {currentQuestion?.question && (
            <p className="text-lg font-medium text-gray-900 mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
          )}

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase">{'\u0421\u043e\u0432\u043c\u0435\u0441\u0442\u043d\u044b\u0439 \u043a\u043e\u0434'}</div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  {realtimeStatusLabel}
                  {realtimePeerCount > 0 ? (' \u2022 ' + '\u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432: ' + (realtimePeerCount + 1)) : ''}
                </div>
                {sharedRunLabel && (
                  <div className="text-[11px] text-sky-700">
                    {sharedRunLabel}
                    {sharedRunTimeLabel ? (' \u2022 ' + sharedRunTimeLabel) : ''}
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {questionCodeLoading
                  ? '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...'
                  : (questionCodeSaving
                    ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...'
                    : (updatedAtLabel
                      ? ('\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e: ' + updatedAtLabel)
                      : (questionCodeDirty ? '\u041d\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e' : '\u041a\u043e\u0434 \u043d\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d')))}
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border border-gray-800">
              <Editor
                key={'py-review-editor-' + (collabRoomId || currentId)}
                height={reviewEditorHeight}
                language="python"
                theme={monacoTheme}
                beforeMount={ensureMonacoColorTheme}
                defaultValue={collabRoomId ? '' : code}
                onMount={handleEditorMount}
                options={editorOptions}
                loading={<div className="p-4 text-sm text-gray-400">{'\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0440\u0435\u0434\u0430\u043a\u0442\u043e\u0440\u0430...'}</div>}
              />
            </div>

            <div className="rounded-xl border p-2 bg-gray-50 space-y-2">
              <div className="text-xs font-semibold text-gray-600">{'\u0412\u0432\u043e\u0434 (stdin)'}</div>
              <textarea
                value={questionCodeEntry.input}
                onChange={(event) => {
                  const nextInput = event.target.value ?? '';
                  const updatedInCollab = setInputInCollab(nextInput);
                  clearQuestionCodeError(currentId);
                  if (!updatedInCollab) {
                    setQuestionCodeEntry(currentId, { input: nextInput });
                    bumpQuestionCodeVersion(currentId);
                    setQuestionCodeDirty(currentId, true);
                    scheduleQuestionSave(currentId);
                  }
                }}
                spellCheck={false}
                className="w-full min-h-[120px] text-xs font-mono leading-5 px-3 py-2 rounded-lg border border-gray-200 bg-white outline-none focus:border-purple-500 resize-y"
              />
            </div>

            {questionCodeError && <div className="text-xs text-red-500">{questionCodeError}</div>}

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs font-bold text-gray-400 uppercase">{'Тесты'}</div>
                <Button
                  onClick={handleRunTests}
                  disabled={runnerLoading || questionCodeLoading || !String(code || '').trim()}
                  className="w-full sm:w-auto"
                >
                  {runnerLoading ? 'Запуск...' : 'Запустить тесты'}
                </Button>
              </div>

              {runnerError && (
                <div className="text-sm text-red-500">{runnerError}</div>
              )}

              {testsToShow.length === 0 ? (
                <div className="text-sm text-gray-500">Тесты для этой задачи не добавлены.</div>
              ) : (
                <div className="space-y-2">
                  {testsToShow.map((item, idx) => {
                    const result = testResults[idx];
                    const passed = result?.passed ?? (solvedAllTests ? true : undefined);
                    const showDetails = !isMobileViewport || Boolean(result) || expandedTestIndex === idx;
                    return (
                      <div
                        key={`${idx}-${item.input}`}
                        style={{ '--python-test-i': `${idx}` }}
                        className={`python-runtime-test-card rounded-2xl border p-2.5 text-xs sm:text-sm ${
                          passed === undefined
                            ? 'border-gray-200 bg-gray-50'
                            : (passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50')
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">Тест {idx + 1}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-bold ${
                              passed === undefined ? 'text-gray-400' : (passed ? 'text-emerald-700' : 'text-red-600')
                            }`}>
                              {passed === undefined ? '—' : (passed ? 'OK' : 'Ошибка')}
                            </span>
                            {isMobileViewport && !result && (
                              <button
                                type="button"
                                onClick={() => setExpandedTestIndex((prev) => (prev === idx ? null : idx))}
                                className="text-[11px] font-semibold text-purple-600"
                              >
                                {showDetails ? 'Скрыть' : 'Детали'}
                              </button>
                            )}
                          </div>
                        </div>
                        {showDetails && (
                          <div className="mt-1.5 text-[11px] text-gray-600">
                            <div>
                              <span className="font-semibold">Вход:</span>
                              <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px]">{item.input || '—'}</pre>
                            </div>
                            <div>
                              <span className="font-semibold">Ожидалось:</span>
                              <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px]">{item.output || '—'}</pre>
                            </div>
                            {result && (
                              <>
                                <div>
                                  <span className="font-semibold">Вывод:</span>
                                  <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px]">{formatOutput(result.output) || '—'}</pre>
                                </div>
                                {result.error && <div className="text-red-600 mt-1">{result.error}</div>}
                                {!result.error && result.passed === false && result.failReason === 'mismatch' && (
                                  <div className="text-red-600 mt-1">Вывод отличается от ожидаемого из-за скрытых символов/форматирования.</div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {!isSolved && (
            <div className="mt-3 text-sm text-gray-500">{'\u0423\u0447\u0435\u043d\u0438\u043a \u0435\u0449\u0435 \u043d\u0435 \u0440\u0435\u0448\u0438\u043b \u044d\u0442\u0443 \u0437\u0430\u0434\u0430\u0447\u0443.'}</div>
          )}
        </div>

        <div className="python-runtime-footer pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {'\u0420\u0435\u0448\u0435\u043d\u043e'}: {Array.from(solvedIds).length}/{questions.length}
            <span className="text-gray-400">{` • ${Math.max(1, currentQuestionPosition + 1)}/${Math.max(visibleQuestionItems.length, 1)}`}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>{'\u0417\u0430\u043a\u0440\u044b\u0442\u044c'}</Button>
            <Button
              onClick={() => {
                if (!Number.isFinite(nextQuestionIndex)) return;
                const nextSubsection = visibleSubsections.find((section) => section.questionIndexes.includes(nextQuestionIndex));
                if (nextSubsection?.id) setSelectedSubsectionId(nextSubsection.id);
                setCurrentIndex(nextQuestionIndex);
              }}
              disabled={!Number.isFinite(nextQuestionIndex)}
            >
              {'\u0414\u0430\u043b\u044c\u0448\u0435'}
            </Button>
          </div>
        </div>
      </div>
    </div>
    );
    void legacyModal;
  }

  const modal = (
    <div className="python-runtime-modal-overlay fixed inset-0 z-50 flex items-stretch justify-stretch bg-black/60 p-0">
      <div className={`python-runtime-modal-shell surface-card modal-card modal-card--fullscreen relative h-[100dvh] w-screen max-h-none max-w-none overflow-hidden rounded-none p-0 shadow-2xl ${modalShellThemeClass}`}>
        <div className="h-full w-full overflow-hidden">
          <div
            className="flex h-full flex-col overflow-hidden p-1.5 sm:p-2 md:p-2.5 lg:p-3"
            style={responsiveLayoutStyle}
          >
            <div className="python-runtime-modal-header mb-0.5 flex flex-col gap-1 md:mb-1">
              <div className={`rounded-[22px] border px-3 py-2 md:px-3.5 md:py-2.5 ${elevatedCardClass}`}>
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] border ${isDarkTheme ? 'border-violet-400/20 bg-violet-500/10 text-violet-200' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>
                      <BookOpen size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-[11px] font-bold uppercase tracking-[0.28em] ${overlineTextClass}`}>Тема</div>
                      <h2 className={`mt-0.5 text-[1.12rem] font-semibold leading-tight md:text-[1.18rem] ${primaryTextClass}`}>{task.title}</h2>
                      <div className="mt-1.5 flex flex-wrap gap-1">
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
                          {isSolved ? 'Ученик решил' : `${solvedIds.size}/${questions.length} решено`}
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
                <div className="mt-1 grid gap-1 min-[700px]:grid-cols-[minmax(0,1fr)_minmax(180px,220px)]">
                  <div className={`rounded-[18px] border px-2.5 py-1.5 ${mutedStripClass}`}>
                    <div className="flex items-center justify-between gap-2.5">
                      <div>
                        <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>Прогресс темы</div>
                        <div className={`mt-0.5 text-xs ${secondaryTextClass}`}>Текущий набор заданий</div>
                      </div>
                      <div className={`text-lg font-semibold ${primaryTextClass}`}>{currentMastery}%</div>
                    </div>
                    <div className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${isDarkTheme ? 'bg-slate-800/90' : 'bg-slate-200/80'}`}>
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-sky-400 transition-all duration-500"
                        style={{ width: `${Math.max(0, Math.min(100, currentMastery))}%` }}
                      />
                    </div>
                  </div>
                  <div className={`grid grid-cols-2 gap-1.5 rounded-[18px] border px-2.5 py-1.5 ${mutedStripClass}`}>
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

              <div className={`grid gap-1 ${showSubsectionNav ? 'min-[700px]:grid-cols-[minmax(0,180px)_minmax(0,1fr)]' : ''}`}>
                {showSubsectionNav && (
                  <div className={`rounded-[18px] border p-1.5 ${softCardClass}`}>
                    <div className="mb-1">
                      <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>Подраздел</div>
                    </div>
                    <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 pr-0.5" onWheel={handleHorizontalWheelScroll}>
                      {visibleSubsections.map((section) => (
                        <button
                          key={`review-subsection-${section.id}`}
                          type="button"
                          onClick={() => handleSelectSubsection(section.id)}
                          className={`python-runtime-chip shrink-0 rounded-[16px] border px-2.5 py-1 text-left text-[11px] font-semibold transition-all ${
                            section.id === activeSubsection?.id
                              ? (isDarkTheme
                                  ? 'border-violet-400/40 bg-violet-500/14 text-white shadow-[0_14px_28px_rgba(76,29,149,0.28)]'
                                  : 'border-violet-500 bg-violet-600 text-white shadow-[0_14px_28px_rgba(124,58,237,0.22)]')
                              : `${softCardClass} ${secondaryTextClass} hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-700`
                          }`}
                        >
                          <div className="whitespace-nowrap">{section.title}</div>
                          <div className="mt-0.5 text-[10px] opacity-75">{`${section.count} задач`}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`rounded-[18px] border p-1.5 ${softCardClass}`}>
                  <div className="mb-1">
                    <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>
                      {activeSubsection ? `Раздел: ${activeSubsection.title}` : 'Раздел'}
                    </div>
                  </div>
                  <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 pr-0.5" onWheel={handleHorizontalWheelScroll}>
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
                                ? 'border-slate-800/80 bg-slate-950/65 text-slate-200 hover:border-violet-400/30 hover:bg-violet-500/10'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700'));
                      const label = item.question?.title || `Вопрос ${item.localNumber}`;
                      return (
                        <button
                          key={`review-question-${qId}`}
                          type="button"
                          onClick={() => setCurrentIndex(item.questionIndex)}
                          className={`python-runtime-chip min-w-[136px] shrink-0 rounded-[16px] border px-2 py-1.5 text-left transition-all ${buttonClass}`}
                          title={label}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border text-[10px] font-bold ${
                              solved
                                ? (isDarkTheme
                                    ? 'border-emerald-400/30 bg-emerald-500/14 text-emerald-100'
                                    : 'border-emerald-200 bg-emerald-100 text-emerald-700')
                                : (isDarkTheme
                                    ? 'border-slate-700 bg-slate-900/80 text-slate-300'
                                    : 'border-slate-200 bg-slate-50 text-slate-600')
                            }`}>
                              {solved ? <CheckCircle2 size={14} /> : item.localNumber}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">{`Задача ${item.localNumber}`}</div>
                              <div className="mt-0.5 truncate text-[13px] font-semibold">{label}</div>
                            </div>
                            <ChevronRight size={14} className="mt-0.5 shrink-0 opacity-55" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden pr-0 md:pr-1">
              <div
                ref={workspaceGridRef}
                className={`grid h-full min-h-0 gap-3 ${workspaceGridClass}`}
                style={workspaceGridStyle}
              >
                <div className="min-h-0 flex flex-col gap-3 min-[700px]:col-start-1 min-[700px]:row-start-1">
                  <div className={`min-h-[250px] rounded-[28px] border p-3 md:min-h-[320px] md:p-3.5 ${questionCardClass}`}>
                    <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${overlineTextClass}`}>Условие задачи</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${softCardClass} ${secondaryTextClass}`}>
                        <FileText size={12} />
                        {`Задача ${currentQuestionDisplayIndex}`}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${solvedStateClass}`}>
                        <CheckCircle2 size={12} />
                        {isSolved ? 'Ученик решил' : 'Ожидает решения'}
                      </span>
                    </div>
                    {currentQuestion?.question ? (
                      <div className={`mt-3 max-w-[72ch] overflow-y-auto whitespace-pre-wrap text-[14px] font-medium leading-6 md:text-[16px] md:leading-7 min-[700px]:max-h-[36vh] ${primaryTextClass}`}>
                        {currentQuestion.question}
                      </div>
                    ) : (
                      <div className={`mt-4 text-sm ${mutedTextClass}`}>Условие задачи пока пустое.</div>
                    )}
                  </div>

                  {isRecordingTheory && theory && (
                    <div className={`rounded-[20px] border p-2.5 ${softCardClass}`}>
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

                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    {theory?.content && !isRecordingTheory && (
                      <div className={`python-runtime-theory-card rounded-[28px] border p-3.5 md:p-4 ${isDarkTheme ? 'border-violet-400/20 bg-[linear-gradient(180deg,rgba(30,27,75,0.40),rgba(2,6,23,0.92))] shadow-[0_18px_40px_rgba(15,23,42,0.32)]' : 'border-violet-200/70 bg-gradient-to-br from-white via-violet-50/70 to-fuchsia-50/45 shadow-[0_14px_34px_rgba(124,58,237,0.12)]'}`}>
                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-col gap-1.5">
                            <div className={`text-xs font-bold uppercase tracking-widest ${overlineTextClass}`}>
                              {theoryType === THEORY_RECORDING_TYPE ? 'Видео-теория' : 'Теория'}
                            </div>
                            <div className={`text-sm font-semibold ${primaryTextClass}`}>Материал по текущей задаче</div>
                            {availableTheoryTypes.length > 1 && (
                              <div className="flex flex-wrap gap-1.5">
                                {availableTheoryTypes.map((type) => (
                                  <button
                                    key={`review-theory-type-${type}`}
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
                          theoryType === 'gdoc' ? (
                            isGoogleDocEmbedUrl(theory.content) ? (
                              <div className={`mt-3 overflow-hidden rounded-2xl border ${isDarkTheme ? 'border-slate-800 bg-slate-950/75' : 'border-purple-100 bg-white'}`}>
                                <iframe
                                  title={`theory-review-${task.number}`}
                                  src={theory.content}
                                  className="h-[220px] w-full md:h-[300px]"
                                />
                              </div>
                            ) : (
                              <div className="mt-3 text-sm text-red-500">
                                Нужна ссылка для встраивания Google Docs (Файл → Опубликовать в интернете → Встроить).
                              </div>
                            )
                          ) : (
                            <div className={`mt-3 max-h-[24svh] overflow-y-auto whitespace-pre-wrap pr-1 text-sm leading-relaxed min-[700px]:max-h-[32svh] ${secondaryTextClass}`}>
                              {theory.content}
                            </div>
                          )
                        )}
                      </div>
                    )}

                    <div className={`rounded-[24px] border p-3 ${softCardClass}`}>
                      <div className={`text-[11px] font-bold uppercase tracking-[0.24em] ${mutedTextClass}`}>Ввод</div>
                      <div className={`mt-1 text-sm font-semibold ${primaryTextClass}`}>stdin для ручной проверки</div>
                      <div className={`mt-1 text-xs ${secondaryTextClass}`}>Можно быстро подставить пользовательский ввод и тут же прогнать код.</div>
                      <textarea
                        value={questionCodeEntry.input}
                        onChange={(event) => {
                          const nextInput = event.target.value ?? '';
                          const updatedInCollab = setInputInCollab(nextInput);
                          clearQuestionCodeError(currentId);
                          if (!updatedInCollab) {
                            setQuestionCodeEntry(currentId, { input: nextInput });
                            bumpQuestionCodeVersion(currentId);
                            setQuestionCodeDirty(currentId, true);
                            scheduleQuestionSave(currentId);
                          }
                        }}
                        spellCheck={false}
                        className={`mt-3 min-h-[88px] w-full resize-y rounded-2xl border px-3 py-2 text-xs font-mono leading-5 outline-none transition ${
                          isDarkTheme
                            ? 'border-slate-800 bg-slate-950/75 text-slate-100 placeholder:text-slate-500 focus:border-violet-400/50'
                            : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-violet-400'
                        }`}
                        placeholder="Введите stdin для ручного запуска"
                      />
                    </div>
                  </div>
                </div>

                {isWideWorkspace && (
                  <div className="relative hidden min-[700px]:col-start-2 min-[700px]:row-span-2 min-[700px]:block">
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
                          ? 'border-slate-700 bg-slate-950/92 text-slate-400 group-hover:border-violet-400/50 group-hover:text-violet-200'
                          : 'border-slate-200 bg-white/96 text-slate-400 group-hover:border-violet-300 group-hover:text-violet-600'
                      } ${isResizingWorkspace ? (isDarkTheme ? 'border-violet-400/60 text-violet-200' : 'border-violet-400 text-violet-600') : ''}`}>
                        <span className="h-5 w-[3px] rounded-full bg-current/80 shadow-[0_7px_0_currentColor,0_-7px_0_currentColor]" />
                      </span>
                    </button>
                  </div>
                )}

                <div className="min-h-0 min-[700px]:col-start-3 min-[700px]:row-span-2">
                  <div className={`flex h-full min-h-0 flex-col rounded-[30px] border p-3.5 md:p-4 ${elevatedCardClass}`}>
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

                    <div className={`mt-3 min-h-0 flex-1 overflow-hidden rounded-[24px] border ${editorFrameClass}`}>
                      <div className={`flex items-center justify-between gap-3 border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${editorHeaderClass}`}>
                        <span>main.py</span>
                        <span>{questionCodeDirty ? 'Изменения ждут сохранения' : 'Автосохранение'}</span>
                      </div>
                      <div className="h-full min-h-0">
                        <Editor
                          key={`py-review-editor-${collabRoomId || currentId}`}
                          height={reviewEditorHeight}
                          language="python"
                          theme={monacoTheme}
                          beforeMount={ensureMonacoColorTheme}
                          defaultValue={collabRoomId ? '' : code}
                          onMount={handleEditorMount}
                          options={editorOptions}
                          loading={<div className={`p-4 text-sm ${mutedTextClass}`}>Загрузка редактора...</div>}
                        />
                      </div>
                    </div>

                    {questionCodeError && (
                      <div className={`mt-3 rounded-2xl border px-3 py-2 text-xs ${isDarkTheme ? 'border-red-400/25 bg-red-500/10 text-red-200' : 'border-red-200/80 bg-red-50 text-red-600'}`}>
                        {questionCodeError}
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-h-0 min-[700px]:col-start-1 min-[700px]:row-start-2">
                  <div className={`flex h-full min-h-0 flex-col rounded-[30px] border p-3.5 md:p-4 ${elevatedCardClass}`}>
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
                      <div className={`mt-3 rounded-2xl border px-3 py-2 text-sm ${isDarkTheme ? 'border-red-400/25 bg-red-500/10 text-red-200' : 'border-red-200/80 bg-red-50 text-red-600'}`}>
                        {runnerError}
                      </div>
                    )}

                    {testsToShow.length === 0 ? (
                      <div className={`mt-4 rounded-2xl border px-3 py-3 text-sm ${softCardClass} ${secondaryTextClass}`}>Учитель ещё не добавил тесты.</div>
                    ) : (
                      <div className="mt-3 min-h-0 space-y-2.5 overflow-y-auto pr-1">
                        {testsToShow.map((item, idx) => {
                          const result = testResults[idx];
                          const passed = result?.passed ?? (solvedAllTests ? true : undefined);
                          const testCardClass = passed === undefined
                            ? (isDarkTheme ? 'border-slate-800/80 bg-slate-950/55' : 'border-slate-200 bg-slate-50')
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
                            ? (result.error ? `Ошибка: ${result.error}` : (formatOutput(result.output) || '—'))
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
                              <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pr-1">
                                <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold ${softCardClass} ${secondaryTextClass}`}>
                                  {idx + 1}
                                </span>
                                <span className={`shrink-0 font-semibold ${primaryTextClass}`}>{`Тест ${idx + 1}`}</span>
                                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTextClass} ${passed === undefined ? softCardClass : ''}`}>
                                  {passed === undefined ? 'Не запускался' : (passed ? 'OK' : 'Ошибка')}
                                </span>
                                <span className={`shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] ${mutedTextClass}`}>Вход</span>
                                <span className={`max-w-[140px] shrink-0 truncate font-mono ${secondaryTextClass}`}>{inputPreview}</span>
                                <span className={`shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] ${mutedTextClass}`}>Ожидалось</span>
                                <span className={`max-w-[140px] shrink-0 truncate font-mono ${secondaryTextClass}`}>{expectedPreview}</span>
                                <span className={`shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] ${mutedTextClass}`}>Вывод</span>
                                <span className={`max-w-[170px] shrink-0 truncate font-mono ${secondaryTextClass}`}>{actualPreview}</span>
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
            <div className={`python-runtime-footer mt-1 rounded-[24px] border px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] md:px-3.5 md:py-3 ${footerClass}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <span className={isDarkTheme ? 'text-slate-300' : 'text-slate-600'}>
                    Прогресс темы: <span className={`font-semibold ${isDarkTheme ? 'text-violet-200' : 'text-purple-700'}`}>{currentMastery}%</span>
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${softCardClass} ${secondaryTextClass}`}>
                    {`${currentQuestionDisplayIndex}/${totalVisibleQuestions}`}
                  </span>
                  <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>
                    {isSolved ? 'Ученик уже решил эту задачу, можно идти дальше.' : 'Сначала запусти тесты и проверь решение.'}
                  </span>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button
                    variant="secondary"
                    onClick={onClose}
                    className={`w-full sm:w-auto ${isDarkTheme ? '!border-slate-700 !bg-slate-950/70 !text-slate-200 hover:!bg-slate-900' : ''}`}
                  >
                    Закрыть
                  </Button>
                  <Button
                    onClick={handleRunTests}
                    disabled={runnerLoading || questionCodeLoading || !String(code || '').trim()}
                    className={`w-full sm:w-auto ${isDarkTheme ? '!shadow-none' : ''}`}
                  >
                    <PlayCircle size={16} />
                    {runnerLoading ? 'Запуск...' : 'Запустить тесты'}
                  </Button>
                  <Button
                    variant={isSolved ? 'success' : 'secondary'}
                    onClick={handleNext}
                    disabled={!Number.isFinite(nextQuestionIndex)}
                    className={`w-full sm:w-auto ${isDarkTheme && !isSolved ? '!border-slate-700 !bg-slate-950/70 !text-slate-200 hover:!bg-slate-900' : ''} ${isDarkTheme && isSolved ? '!shadow-none' : ''}`}
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
      {showTheory && isRecordingTheory && theoryRecording && (
        <div className="absolute inset-0 z-[55] flex items-center justify-center bg-slate-950/62 p-3 backdrop-blur-sm md:p-5">
          <div className={`flex h-[min(82vh,860px)] w-full max-w-[min(1180px,96vw)] flex-col overflow-hidden rounded-[32px] border p-3 md:p-4 ${elevatedCardClass}`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className={`text-[11px] font-bold uppercase tracking-[0.28em] ${overlineTextClass}`}>Видео-теория</div>
                <div className={`mt-1 text-base font-semibold ${primaryTextClass}`}>Материал по текущей задаче</div>
                <div className={`mt-1 text-sm ${secondaryTextClass}`}>Открыта в широком режиме, чтобы плеер не сжимался в боковой колонке.</div>
              </div>
              <button
                type="button"
                onClick={() => setShowTheory(false)}
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition ${subtleButtonClass}`}
                aria-label="Закрыть видео-теорию"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <TheoryRecordingPlayer
                recording={theoryRecording}
                theme={theme}
                className="mt-0 h-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

export default PythonReviewModal;
