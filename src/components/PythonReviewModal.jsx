import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import { RefreshCcw, X } from 'lucide-react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { api } from '../services/api';
import TheoryRecordingPlayer from './TheoryRecordingPlayer';
import { Button } from './ui';
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

const buildRealtimeStatusLabel = (status) => {
  if (status === 'connected') return 'Realtime: онлайн';
  if (status === 'connecting') return 'Realtime: подключение...';
  return 'Realtime: офлайн';
};

const normalizeTheorySubsectionId = (value) => {
  const id = String(value || '').trim();
  return id || PYTHON_DEFAULT_SUBSECTION_ID;
};

const normalizeTheoryBySubsectionMap = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = {};
  Object.entries(value).forEach(([rawId, theory]) => {
    const id = normalizeTheorySubsectionId(rawId);
    if (!theory || typeof theory !== 'object' || Array.isArray(theory)) return;
    const type = String(theory.type || '').trim();
    if (type === THEORY_RECORDING_TYPE) {
      const recording = normalizeTheoryRecording(theory.content);
      if (!recording) return;
      entries[id] = { type: THEORY_RECORDING_TYPE, content: recording };
      return;
    }
    if (type === 'gdoc') {
      const content = String(theory.content || '').trim();
      if (!content) return;
      entries[id] = { type: 'gdoc', content };
      return;
    }
    const content = String(theory.content || '').trim();
    if (!content) return;
    entries[id] = { type: 'text', content };
  });
  return entries;
};

const resolveTheoryForSubsection = (taskEntry, subsectionId) => {
  const safeSubsectionId = normalizeTheorySubsectionId(subsectionId);
  const bySubsection = normalizeTheoryBySubsectionMap(taskEntry?.pythonTheoryBySubsection);
  if (bySubsection[safeSubsectionId]) return bySubsection[safeSubsectionId];
  if (safeSubsectionId !== PYTHON_DEFAULT_SUBSECTION_ID && bySubsection[PYTHON_DEFAULT_SUBSECTION_ID]) {
    return bySubsection[PYTHON_DEFAULT_SUBSECTION_ID];
  }
  const legacy = taskEntry?.pythonTheory;
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return null;
  const type = String(legacy.type || '').trim();
  if (type === THEORY_RECORDING_TYPE) {
    const recording = normalizeTheoryRecording(legacy.content);
    return recording ? { type: THEORY_RECORDING_TYPE, content: recording } : null;
  }
  if (type === 'gdoc') {
    const content = String(legacy.content || '').trim();
    return content ? { type: 'gdoc', content } : null;
  }
  const content = String(legacy.content || '').trim();
  return content ? { type: 'text', content } : null;
};

const PythonReviewModal = ({
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
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedSubsectionId, setSelectedSubsectionId] = useState(PYTHON_DEFAULT_SUBSECTION_ID);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedCodeById, setSolvedCodeById] = useState({});
  const [showTheory, setShowTheory] = useState(false);
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
  const isMobileViewport = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 767px)').matches
    : false;

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
    () => String(questions[currentIndex]?.id ?? currentIndex).trim(),
    [questions, currentIndex]
  );
  const collabRoomId = useMemo(() => {
    if (!collabBaseRoomId || !task?.number || !activeQuestionId) return '';
    return `py-collab:${collabBaseRoomId}:${task.number}:${PYTHON_LEVEL_ID}:${activeQuestionId}`;
  }, [collabBaseRoomId, task?.number, PYTHON_LEVEL_ID, activeQuestionId]);

  const getQuestionCodeEntry = (questionId, source = null) => {
    const key = String(questionId ?? '').trim();
    const store = source && typeof source === 'object'
      ? source
      : questionCodeByIdRef.current;
    const cached = store?.[key];
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
      return {
        ...(prev || {}),
        [key]: {
          ...current,
          ...(patch || {}),
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

  const getFallbackCodeForQuestion = (question, questionId) => {
    const key = String(questionId ?? '').trim();
    const solvedCode = solvedCodeById?.[key];
    if (typeof solvedCode === 'string' && solvedCode.length > 0) return solvedCode;
    if (typeof question?.starterCode === 'string') return question.starterCode;
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
      const hasRemoteSnapshot = Boolean(
        String(cached.updatedAt || '').trim()
        || String(cached.code || '').trim()
        || String(cached.input || '').trim()
      );
      const isDirty = Boolean(questionCodeDirtyByIdRef.current?.[key]);
      const isSaving = Boolean(questionCodeSavingByIdRef.current?.[key]);
      if (hasRemoteSnapshot || isDirty || isSaving) return;
      const fallbackCode = getFallbackCodeForQuestion(question, key);
      if (cached.code !== fallbackCode) {
        setQuestionCodeEntry(key, { code: fallbackCode });
      }
      return;
    }
    setQuestionCodeLoadingById((prev) => ({ ...(prev || {}), [key]: true }));
    try {
      const payload = await api.getQuestionCode(studentId, task.number, PYTHON_LEVEL_ID, key);
      const remoteCode = typeof payload?.code === 'string' ? payload.code : '';
      const remoteInput = typeof payload?.input === 'string' ? payload.input : '';
      const remoteUpdatedAt = typeof payload?.updatedAt === 'string' ? payload.updatedAt : '';
      const fallbackCode = getFallbackCodeForQuestion(question, key);
      const nextCode = remoteCode.length > 0
        ? remoteCode
        : (remoteUpdatedAt ? '' : fallbackCode);
      setQuestionCodeEntry(key, {
        code: nextCode,
        input: remoteInput,
        updatedAt: remoteUpdatedAt,
      });
      if (key === activeQuestionId && collabDocRef.current && collabYTextRef.current && collabStateMapRef.current) {
        const doc = collabDocRef.current;
        const ytext = collabYTextRef.current;
        const stateMap = collabStateMapRef.current;
        const currentCode = ytext.toString();
        const currentInput = typeof stateMap.get('input') === 'string'
          ? stateMap.get('input')
          : String(stateMap.get('input') ?? '');
        if ((!currentCode && nextCode) || (!currentInput && remoteInput)) {
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
      }
      setQuestionCodeDirty(key, false);
      questionCodeLocalVersionRef.current = {
        ...(questionCodeLocalVersionRef.current || {}),
        [key]: 0,
      };
      clearQuestionCodeError(key);
    } catch (err) {
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
    if (!collabRoomId || !editorReady || !collabWsUrl || !activeQuestionId) {
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
    const seedDocState = () => {
      if (seeded) return;
      const codeInDoc = ytext.toString();
      const inputInDoc = typeof stateMap.get('input') === 'string'
        ? stateMap.get('input')
        : String(stateMap.get('input') ?? '');
      const shouldSeedCode = !codeInDoc && seedCode;
      const shouldSeedInput = !inputInDoc && seedInput;
      if (shouldSeedCode || shouldSeedInput) {
        doc.transact(() => {
          if (shouldSeedCode) ytext.insert(0, seedCode);
          if (shouldSeedInput) stateMap.set('input', seedInput);
        });
      }
      seeded = true;
    };

    const handleProviderStatus = (event) => {
      if (event?.status) setRealtimeStatus(event.status);
    };
    const handleProviderSync = (isSynced) => {
      if (!isSynced) return;
      seedDocState();
    };
    const handleAwareness = () => {
      const states = provider.awareness.getStates();
      setRealtimePeerCount(Math.max(0, states.size - 1));
    };
    const handleCodeChange = (event) => {
      const nextCode = ytext.toString();
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
      seedDocState();
    }

    return () => {
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
    const currentId = String(currentQuestion?.id ?? currentIndex).trim();
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
    const currentId = String(currentQuestion?.id ?? currentIndex).trim();
    const entry = getQuestionCodeEntry(currentId, questionCodeById);
    const fallbackSolvedCode = typeof solvedCodeById?.[currentId] === 'string' ? solvedCodeById[currentId] : '';
    const fallbackStarterCode = typeof currentQuestion?.starterCode === 'string' ? currentQuestion.starterCode : '';
    const currentCode = entry.loaded ? entry.code : (fallbackSolvedCode || fallbackStarterCode);
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
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
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
      <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="surface-card modal-card rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative text-center">
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
  const currentId = String(currentQuestion?.id ?? currentIndex).trim();
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
  const theory = resolveTheoryForSubsection(taskEntry, activeTheorySubsectionId);
  const theoryFullUrl = theory?.type === 'gdoc' ? buildGoogleDocFullUrl(theory.content) : '';
  const theoryRecording = theory?.type === THEORY_RECORDING_TYPE
    ? normalizeTheoryRecording(theory?.content)
    : null;
  const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true,
  };
  const realtimeStatusLabel = buildRealtimeStatusLabel(realtimeStatus);
  const sharedRunTimeLabel = sharedRunState.ts
    ? new Date(sharedRunState.ts).toLocaleTimeString('ru-RU')
    : '';
  const sharedRunLabel = (() => {
    const author = String(sharedRunState.author || '').trim() || '\u0421\u043e\u0431\u0435\u0441\u0435\u0434\u043d\u0438\u043a';
    const summary = String(sharedRunState.summary || '').trim();
    if (sharedRunState.status === 'running') return `${author} \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0435\u0442 \u0442\u0435\u0441\u0442\u044b...`;
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
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-stretch justify-stretch p-0 backdrop-blur-sm">
      <div className="surface-card modal-card modal-card--fullscreen rounded-none w-screen h-[100dvh] max-w-none max-h-none p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex flex-col gap-4 mb-4">
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
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
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
                    className={`min-w-[132px] rounded-2xl border px-3 py-2 text-left transition-all ${buttonClass}`}
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
            <div className="mb-6 rounded-3xl border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/70 to-fuchsia-50/45 p-4 shadow-[0_14px_34px_rgba(124,58,237,0.12)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-bold uppercase tracking-widest text-purple-700">{'\u0422\u0435\u043e\u0440\u0438\u044f'}</div>
                  {theory?.type === THEORY_RECORDING_TYPE && (
                    <span className="inline-flex items-center rounded-full border border-violet-200/80 bg-violet-100/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                      {'\u0412\u0438\u0434\u0435\u043e + \u043a\u043e\u0434'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {theory?.type === 'gdoc' && theoryFullUrl && (
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
              {showTheory && (
                theory.type === THEORY_RECORDING_TYPE ? (
                  <TheoryRecordingPlayer recording={theoryRecording} />
                ) : theory.type === 'gdoc' ? (
                  isGoogleDocEmbedUrl(theory.content) ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-purple-100 bg-white">
                      <iframe
                        title={`theory-review-${task.number}`}
                        src={theory.content}
                        className="w-full h-[300px]"
                      />
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-red-500">{'\u041d\u0443\u0436\u043d\u0430 \u0441\u0441\u044b\u043b\u043a\u0430 \u0434\u043b\u044f \u0432\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u043d\u0438\u044f Google Docs (\u0424\u0430\u0439\u043b \u2192 \u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u0442\u044c \u0432 \u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442\u0435 \u2192 \u0412\u0441\u0442\u0440\u043e\u0438\u0442\u044c).'}</div>
                  )
                ) : (
                  <div className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
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
                height="280px"
                language="python"
                theme="vs-dark"
                defaultValue={code}
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
                        className={`rounded-2xl border p-2.5 text-xs sm:text-sm ${
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

        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
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

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

export default PythonReviewModal;
