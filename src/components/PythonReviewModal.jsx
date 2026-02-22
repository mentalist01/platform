import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Editor from '@monaco-editor/react';
import { RefreshCcw, X } from 'lucide-react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { api } from '../services/api';
import { Button } from './ui';

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

const PythonReviewModal = ({
  task,
  onClose,
  studentId,
  testDb,
  PYTHON_LEVEL_ID,
  isGoogleDocEmbedUrl,
  buildGoogleDocFullUrl,
  codeSyncRoomId = '',
}) => {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
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

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const collabDocRef = useRef(null);
  const collabProviderRef = useRef(null);
  const collabAwarenessRef = useRef(null);
  const collabBindingRef = useRef(null);
  const collabYTextRef = useRef(null);
  const collabStateMapRef = useRef(null);
  const collabRunMapRef = useRef(null);

  const questionCodeByIdRef = useRef({});
  const questionCodeLoadingByIdRef = useRef({});
  const questionCodeSavingByIdRef = useRef({});
  const questionCodeRetrySaveByIdRef = useRef({});
  const questionCodeDirtyByIdRef = useRef({});
  const questionCodeLocalVersionRef = useRef({});
  const pendingSaveQuestionIdRef = useRef('');
  const saveTimerRef = useRef(null);
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
    const qs = testDb?.[task.number]?.[PYTHON_LEVEL_ID] || [];
    setQuestions(Array.isArray(qs) ? qs : []);
    setCurrentIndex(0);
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
  }, [task?.number, testDb, studentId, PYTHON_LEVEL_ID]);

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
  }, [studentId, task?.number, questions, currentIndex, solvedCodeById]);

  useEffect(() => {
    setEditorReady(false);
  }, [collabRoomId]);


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
  const theory = testDb?.[task.number]?.pythonTheory || null;
  const theoryFullUrl = theory?.type === 'gdoc' ? buildGoogleDocFullUrl(theory.content) : '';
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

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 modal-backdrop flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="surface-card modal-card rounded-3xl w-full max-w-5xl max-h-[90vh] p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">{'\u0422\u0435\u043c\u0430'}</div>
              <div className="text-lg font-bold text-gray-900">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          </div>

          <div className="flex flex-wrap gap-2">
            {questions.map((q, idx) => {
              const qId = String(q?.id ?? idx);
              const solved = solvedIds.has(qId);
              const isCurrent = idx === currentIndex;
              let btnClass = 'w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ';

              if (isCurrent && solved) {
                btnClass += 'border-green-400 ring-2 ring-green-100 bg-green-100 text-green-700';
              } else if (isCurrent) {
                btnClass += 'border-purple-600 ring-2 ring-purple-200 text-purple-600 bg-white';
              } else if (solved) {
                btnClass += 'border-green-200 bg-green-100 text-green-600';
              } else {
                btnClass += 'border-gray-300 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700';
              }

              return (
                <button
                  key={qId}
                  onClick={() => setCurrentIndex(idx)}
                  className={btnClass}
                  title={solved ? '\u0420\u0435\u0448\u0435\u043d\u043e' : '\u041d\u0435 \u0440\u0435\u0448\u0435\u043d\u043e'}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {theory?.content && (
            <div className="mb-6 rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-widest text-purple-600">{'\u0422\u0435\u043e\u0440\u0438\u044f'}</div>
                <div className="flex items-center gap-3">
                  {theoryFullUrl && (
                    <a
                      href={theoryFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-600 hover:text-purple-700"
                    >
                      {'\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e'}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTheory((prev) => !prev)}
                    className="text-xs text-purple-600 hover:text-purple-700"
                  >
                    {showTheory ? '\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c' : '\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c'}
                  </button>
                </div>
              </div>
              {showTheory && (
                theory.type === 'gdoc' ? (
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
          </div>

          {!isSolved && (
            <div className="mt-3 text-sm text-gray-500">{'\u0423\u0447\u0435\u043d\u0438\u043a \u0435\u0449\u0435 \u043d\u0435 \u0440\u0435\u0448\u0438\u043b \u044d\u0442\u0443 \u0437\u0430\u0434\u0430\u0447\u0443.'}</div>
          )}
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {'\u0420\u0435\u0448\u0435\u043d\u043e'}: {Array.from(solvedIds).length}/{questions.length}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>{'\u0417\u0430\u043a\u0440\u044b\u0442\u044c'}</Button>
            <Button
              onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1))}
              disabled={currentIndex >= questions.length - 1}
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
