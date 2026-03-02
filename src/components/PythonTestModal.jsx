import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import { Download, RefreshCcw, X } from 'lucide-react';
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

const QUESTION_CODE_SAVE_DEBOUNCE_MS = 250;
const COLLAB_SEED_DELAY_MS = 450;

const getCollabWsUrl = () => {
  if (typeof window === 'undefined') return '';
  const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_COLLAB_WS_URL : '';
  const normalizedEnvUrl = typeof envUrl === 'string' ? envUrl.trim() : '';
  if (normalizedEnvUrl) return normalizedEnvUrl;

  const { protocol, hostname, port, host } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss' : 'ws';
  if ((import.meta?.env?.DEV || port === '5173') && port === '5173') {
    return `${wsProtocol}://${hostname}:5175/collab`;
  }
  return `${wsProtocol}://${host}/collab`;
};

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
  const isMobileViewport = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 767px)').matches
    : false;
  const [showTheory, setShowTheory] = useState(false);
  const [activeTheoryType, setActiveTheoryType] = useState('');
  const [expandedTestIndex, setExpandedTestIndex] = useState(null);
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
  const questionCodeByIdRef = useRef({});
  const questionCodeLoadingByIdRef = useRef({});
  const questionCodeSavingByIdRef = useRef({});
  const questionCodeRetrySaveByIdRef = useRef({});
  const questionCodeDirtyByIdRef = useRef({});
  const questionCodeLocalVersionRef = useRef({});
  const pendingSaveQuestionIdRef = useRef('');
  const saveTimerRef = useRef(null);

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
    setExpandedTestIndex(null);
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
        const pending = runnerPendingRef.current.get(data.id);
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
    runPythonCode('pass', '').catch(() => {});
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
      <div className="python-runtime-modal-overlay fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4">
        <div className="python-runtime-modal-shell surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <div className="mx-auto inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700">
            <RefreshCcw size={14} className="animate-spin" />
            Загрузка заданий...
          </div>
          <p className="text-gray-500 mt-3 text-sm">Подождите немного, загружаем задания и тесты.</p>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(loadingModal, document.body) : null;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    const emptyModal = (
      <div className="python-runtime-modal-overlay fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4">
        <div className="python-runtime-modal-shell surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <h2 className="text-2xl font-bold text-gray-900">Заданий пока нет</h2>
          <p className="text-gray-500 mt-2">Учитель еще не добавил задания для этой темы.</p>
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
  const editorOptions = {
    minimap: { enabled: false },
    fontSize: 18,
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
  const codeEditorHeight = isMobileViewport ? '425px' : '650px';
  const realtimeStatusLabel = buildRealtimeStatusLabel(realtimeStatus);
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
  const handleSelectSubsection = (subsectionId) => {
    const nextSubsection = visibleSubsections.find((section) => section.id === subsectionId);
    if (!nextSubsection) return;
    setSelectedSubsectionId(nextSubsection.id);
    if (!nextSubsection.questionIndexes.includes(currentIndex) && nextSubsection.items[0]) {
      setCurrentIndex(nextSubsection.items[0].questionIndex);
    }
  };

  const modal = (
    <div className="python-runtime-modal-overlay fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-stretch justify-stretch p-0">
      <div className="python-runtime-modal-shell surface-card modal-card modal-card--fullscreen rounded-none w-screen h-[100dvh] max-w-none max-h-none p-3.5 sm:p-4 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="python-runtime-modal-header flex flex-col gap-3 md:gap-4 mb-3 md:mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Тема</div>
              <div className="text-base md:text-lg font-bold text-gray-900 leading-tight">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={18}/></button>
          </div>

          {showSubsectionNav && (
            <div className="space-y-2">
              <div className="text-[11px] md:text-xs font-bold uppercase tracking-wide text-slate-400">Подразделы</div>
              <div className="flex flex-wrap gap-2">
                {visibleSubsections.map((section) => (
                  <button
                    key={`py-subsection-${section.id}`}
                    type="button"
                    onClick={() => handleSelectSubsection(section.id)}
                    className={`python-runtime-chip rounded-xl border px-3 py-2 text-xs md:text-sm font-semibold transition-colors ${
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
            <div className="text-[11px] md:text-xs font-bold uppercase tracking-wide text-slate-400">
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
                    key={`py-question-${qId}`}
                    type="button"
                    onClick={() => setCurrentIndex(item.questionIndex)}
                    className={`python-runtime-chip min-w-[132px] rounded-2xl border px-3 py-2 text-left transition-all ${buttonClass}`}
                    title={label}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{`Задача ${item.localNumber}`}</div>
                    <div className="mt-1 truncate text-xs md:text-sm font-semibold">{label}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] md:text-xs text-slate-500">
            <span>
              {activeSubsection
                ? `Вопрос ${Math.max(1, currentQuestionPosition + 1)} из ${visibleQuestionItems.length} в подразделе`
                : `Задача ${currentIndex + 1} из ${questions.length}`}
            </span>
            {isSolved ? (
              <span className="font-semibold text-emerald-600">Решено</span>
            ) : (
              <span className="font-medium text-slate-400">Не решено</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-0 md:pr-1">
          {theory?.content && (
            <div className="python-runtime-theory-card mb-4 md:mb-6 rounded-3xl border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/70 to-fuchsia-50/45 p-3.5 md:p-4 shadow-[0_14px_34px_rgba(124,58,237,0.12)]">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Теория</div>
                  {availableTheoryTypes.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {availableTheoryTypes.map((type) => (
                        <button
                          key={`theory-type-${type}`}
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
                <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs">
                  {theoryType === 'gdoc' && theoryFullUrl && (
                    <a
                      href={theoryFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-full border border-violet-200/70 bg-white/75 px-2.5 py-1 font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-white"
                    >
                      Открыть полностью
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTheory((prev) => !prev)}
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold transition ${
                      showTheory
                        ? 'border-violet-300/80 bg-white/75 text-violet-700 hover:border-violet-400 hover:bg-white'
                        : 'border-violet-500/70 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500'
                    }`}
                  >
                    {showTheory ? 'Свернуть' : 'Показать'}
                  </button>
                </div>
              </div>
              {showTheory && theory && (
                theoryType === THEORY_RECORDING_TYPE ? (
                  <div className="python-runtime-theory-body">
                    <TheoryRecordingPlayer
                      recording={theoryRecording}
                      progressStorageKey={theoryProgressStorageKey}
                      theme={theme}
                    />
                  </div>
                ) : theoryType === 'gdoc' ? (
                  isGoogleDocEmbedUrl(theory.content) ? (
                    <div className="python-runtime-theory-body mt-3 overflow-hidden rounded-xl border border-purple-100 bg-white">
                      <iframe
                        title={`theory-${task.number}`}
                        src={theory.content}
                        className="w-full h-[240px] md:h-[360px]"
                      />
                    </div>
                  ) : (
                    <div className="python-runtime-theory-body mt-3 text-sm text-red-500">
                      Нужна ссылка для встраивания Google Docs (Файл → Опубликовать в интернете → Встроить).
                    </div>
                  )
                ) : (
                  <div className="python-runtime-theory-body mt-3 whitespace-pre-wrap text-sm text-gray-700 leading-relaxed max-h-[34svh] overflow-y-auto pr-1 md:max-h-none md:overflow-visible md:pr-0">
                    {theory.content}
                  </div>
                )
              )}
            </div>
          )}
          {screenshots.length > 0 && (
            <div className="space-y-2.5 md:space-y-3 mb-5 md:mb-6">
              {screenshots.map((img) => (
                <div
                  key={img.id || img.url}
                  className="border rounded-2xl overflow-hidden bg-gray-900/5 max-h-[42vh] sm:max-h-[55vh] md:max-h-[65vh]"
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
          )}

          {extraFiles.length > 0 && (
            <div className="mb-5 md:mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase mb-2">Доп. файлы</p>
              <div className="space-y-2">
                {extraFiles.map((file) => (
                  <a
                    key={file.id || file.url}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                  >
                    <span className="truncate">{file.name}</span>
                    <Download size={16} className="text-purple-600" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {isSolved && (
            <div className="mb-2 text-xs font-semibold text-green-600 uppercase tracking-wide">Решено ранее</div>
          )}
          {currentQuestion?.question && (
            <p className="text-[15px] md:text-lg font-medium leading-relaxed text-gray-900 mb-5 md:mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
          )}

          <div className="space-y-3 mb-5 md:mb-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase">Код</label>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  {realtimeStatusLabel}
                  {realtimePeerCount > 0 ? ` • участников: ${realtimePeerCount + 1}` : ''}
                </div>
                {sharedRunLabel && (
                  <div className="text-[11px] text-sky-700">
                    {sharedRunLabel}
                    {sharedRunTimeLabel ? ` • ${sharedRunTimeLabel}` : ''}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[11px] text-gray-500">
                  {questionCodeLoading
                    ? 'Загрузка...'
                    : (questionCodeSaving
                      ? 'Сохранение...'
                      : (questionCodeUpdatedAtLabel
                        ? `Сохранено: ${questionCodeUpdatedAtLabel}`
                        : (questionCodeDirty ? 'Не сохранено' : '')))}
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
                  className="text-xs text-purple-600 hover:text-purple-700"
                >
                  Сбросить
                </button>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden border border-gray-800">
              <Editor
                key={`py-test-editor-${collabRoomId || currentId}`}
                height={codeEditorHeight}
                language="python"
                theme={monacoTheme}
                beforeMount={ensureMonacoColorTheme}
                defaultValue={collabRoomId ? '' : resolvedCode}
                onMount={handleEditorMount}
                options={editorOptions}
                loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
              />
            </div>
            {questionCodeError && (
              <div className="text-xs text-red-500">{questionCodeError}</div>
            )}
          </div>

          {runnerError && (
            <div className="mb-4 text-sm text-red-500">{runnerError}</div>
          )}

          <div className="space-y-3 mb-5 md:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-xs font-bold text-gray-400 uppercase">Тесты</div>
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
                className="w-full sm:w-auto"
              >
                {runnerLoading ? 'Запуск...' : 'Запустить тесты'}
              </Button>
            </div>
            {testsToShow.length === 0 ? (
              <div className="text-sm text-gray-500">Учитель еще не добавил тесты.</div>
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
                      className={`python-runtime-test-card rounded-2xl border p-2.5 md:p-3 text-xs md:text-sm ${
                        passed === undefined
                          ? 'border-gray-200 bg-gray-50'
                          : (passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50')
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">Тест {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] md:text-xs font-bold ${
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
                        <div className="mt-1.5 text-[11px] md:text-xs text-gray-600">
                          <div>
                            <span className="font-semibold">Вход:</span>
                            <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] md:text-xs">{item.input || '—'}</pre>
                          </div>
                          <div>
                            <span className="font-semibold">Ожидалось:</span>
                            <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] md:text-xs">{item.output || '—'}</pre>
                          </div>
                          {result && (
                            <>
                              <div>
                                <span className="font-semibold">Вывод:</span>
                                <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] md:text-xs">{normalizeOutput(result.output) || '—'}</pre>
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

        <div className="python-runtime-footer mt-1 rounded-2xl border border-purple-200/80 bg-gradient-to-r from-violet-100/95 via-fuchsia-100/90 to-purple-100/95 px-3 py-3 md:py-3.5 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
          <div className="text-xs sm:text-sm text-gray-500">
            Прогресс темы: <span className="font-semibold text-purple-700">{currentMastery}%</span>
            <span className="text-gray-400"> • {Math.max(1, currentQuestionPosition + 1)}/{Math.max(visibleQuestionItems.length, 1)}</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">Закрыть</Button>
            <Button onClick={handleNext} className="w-full sm:w-auto">
              {Number.isFinite(nextQuestionIndex) ? 'Дальше' : 'Готово'}
            </Button>
          </div>
        </div>
      </div>
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


