import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from './ui';
import TheoryRecordingPlayer from './TheoryRecordingPlayer';
import {
  formatRecordingDuration,
  normalizeTheoryRecording,
  THEORY_RECORDING_EVENT_CODE,
  THEORY_RECORDING_EVENT_RUN_OUTPUT,
  THEORY_RECORDING_EVENT_SELECTION,
  THEORY_RECORDING_MAX_EVENTS,
  THEORY_RECORDING_VERSION,
} from '../utils/theoryRecording';

const RECORDING_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  tabSize: 4,
  insertSpaces: true,
  wordWrap: 'on',
  automaticLayout: true,
  scrollBeyondLastLine: false,
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  autoIndent: 'advanced',
  formatOnType: true,
  formatOnPaste: true,
};

const CODE_SNAPSHOT_DEBOUNCE_MS = 120;
const SELECTION_SNAPSHOT_DEBOUNCE_MS = 90;

const getPreferredAudioMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
};

const normalizeSelectionListForEvent = (selections) => (
  (Array.isArray(selections) ? selections : [])
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      let startLineNumber = Math.max(1, Number(item.startLineNumber) || 1);
      let startColumn = Math.max(1, Number(item.startColumn) || 1);
      let endLineNumber = Math.max(1, Number(item.endLineNumber) || startLineNumber);
      let endColumn = Math.max(1, Number(item.endColumn) || startColumn);
      if (endLineNumber < startLineNumber || (endLineNumber === startLineNumber && endColumn < startColumn)) {
        const nextStartLineNumber = endLineNumber;
        const nextStartColumn = endColumn;
        endLineNumber = startLineNumber;
        endColumn = startColumn;
        startLineNumber = nextStartLineNumber;
        startColumn = nextStartColumn;
      }
      return { startLineNumber, startColumn, endLineNumber, endColumn };
    })
    .filter(Boolean)
    .slice(0, 10)
);

const selectionSignature = (selections) => {
  try {
    return JSON.stringify(selections || []);
  } catch {
    return '';
  }
};

const TheoryRecordingEditor = ({
  initialRecording,
  disabled = false,
  onDraftChange,
  ensurePyodideReady = null,
}) => {
  const normalizedInitial = useMemo(() => normalizeTheoryRecording(initialRecording), [initialRecording]);
  const initialDraft = useMemo(() => (
    normalizedInitial
      ? {
          ...normalizedInitial,
          audio: normalizedInitial.audio
            ? { ...normalizedInitial.audio, isNew: false, file: null }
            : null,
        }
      : null
  ), [normalizedInitial]);
  const [draft, setDraft] = useState(() => initialDraft);
  const [code, setCode] = useState(() => initialDraft?.initialCode || '');
  const [recordingError, setRecordingError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(() => initialDraft?.durationMs || 0);
  const [eventCount, setEventCount] = useState(() => (
    Array.isArray(initialDraft?.events) ? initialDraft.events.length : 0
  ));
  const [runInput, setRunInput] = useState('');
  const [runOutput, setRunOutput] = useState('');
  const [runError, setRunError] = useState('');
  const [isRunningCode, setIsRunningCode] = useState(false);

  const editorRef = useRef(null);
  const contentDisposableRef = useRef(null);
  const selectionDisposableRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const eventsRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const isRecordingRef = useRef(false);
  const elapsedTimerRef = useRef(null);
  const codeDebounceTimerRef = useRef(null);
  const selectionDebounceTimerRef = useRef(null);
  const lastCodeRef = useRef('');
  const lastSelectionSignatureRef = useRef('');
  const initialCodeAtStartRef = useRef('');
  const createdAtRef = useRef(initialDraft?.createdAt || '');
  const localAudioUrlRef = useRef('');
  const runRequestSeqRef = useRef(0);
  const editorId = useId();
  const editorPath = useMemo(() => (
    `inmemory://theory-recording/editor-${String(editorId).replace(/[^0-9a-zA-Z_-]/g, '_')}`
  ), [editorId]);

  const stopMediaStream = useCallback(() => {
    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch { /* no-op */ }
      });
    }
  }, []);

  const clearRecordTimers = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (codeDebounceTimerRef.current) {
      clearTimeout(codeDebounceTimerRef.current);
      codeDebounceTimerRef.current = null;
    }
    if (selectionDebounceTimerRef.current) {
      clearTimeout(selectionDebounceTimerRef.current);
      selectionDebounceTimerRef.current = null;
    }
  }, []);

  const revokeLocalAudioUrl = useCallback(() => {
    if (localAudioUrlRef.current) {
      URL.revokeObjectURL(localAudioUrlRef.current);
      localAudioUrlRef.current = '';
    }
  }, []);

  const getNowMs = useCallback(
    () => Math.max(0, Math.round(performance.now() - recordingStartedAtRef.current)),
    []
  );

  const getEditorSelections = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || typeof editor.getSelections !== 'function') return [];
    return normalizeSelectionListForEvent(editor.getSelections());
  }, []);

  const appendCodeEvent = useCallback((timestampMs, value, force = false) => {
    const nextCode = typeof value === 'string'
      ? value
      : (editorRef.current?.getValue?.() || '');
    if (!force && nextCode === lastCodeRef.current) return;
    if (eventsRef.current.length >= THEORY_RECORDING_MAX_EVENTS) return;
    lastCodeRef.current = nextCode;
    eventsRef.current.push({
      t: Math.max(0, Math.round(timestampMs)),
      type: THEORY_RECORDING_EVENT_CODE,
      code: nextCode,
    });
    setEventCount(eventsRef.current.length);
  }, []);

  const appendSelectionEvent = useCallback((timestampMs, selections, force = false) => {
    const normalizedSelections = normalizeSelectionListForEvent(selections);
    const signature = selectionSignature(normalizedSelections);
    if (!force && signature === lastSelectionSignatureRef.current) return;
    if (eventsRef.current.length >= THEORY_RECORDING_MAX_EVENTS) return;
    lastSelectionSignatureRef.current = signature;
    eventsRef.current.push({
      t: Math.max(0, Math.round(timestampMs)),
      type: THEORY_RECORDING_EVENT_SELECTION,
      selections: normalizedSelections,
    });
    setEventCount(eventsRef.current.length);
  }, []);

  const appendRunOutputEvent = useCallback((timestampMs, payload = {}) => {
    if (eventsRef.current.length >= THEORY_RECORDING_MAX_EVENTS) return;
    eventsRef.current.push({
      t: Math.max(0, Math.round(timestampMs)),
      type: THEORY_RECORDING_EVENT_RUN_OUTPUT,
      input: String(payload.input ?? ''),
      output: String(payload.output ?? ''),
      error: String(payload.error ?? ''),
    });
    setEventCount(eventsRef.current.length);
  }, []);

  const flushScheduledSnapshots = useCallback(() => {
    if (codeDebounceTimerRef.current) {
      clearTimeout(codeDebounceTimerRef.current);
      codeDebounceTimerRef.current = null;
      appendCodeEvent(getNowMs(), editorRef.current?.getValue?.() || '', true);
    }
    if (selectionDebounceTimerRef.current) {
      clearTimeout(selectionDebounceTimerRef.current);
      selectionDebounceTimerRef.current = null;
      appendSelectionEvent(getNowMs(), getEditorSelections(), true);
    }
  }, [appendCodeEvent, appendSelectionEvent, getEditorSelections, getNowMs]);

  const finalizeRecording = useCallback((durationMs, mimeType = '') => {
    const chunks = Array.isArray(chunksRef.current) ? chunksRef.current : [];
    const resolvedMime = chunks[0]?.type || mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: resolvedMime });
    stopMediaStream();
    if (!blob.size) {
      setRecordingError('Аудио не записалось. Попробуйте еще раз.');
      return;
    }
    revokeLocalAudioUrl();
    const localAudioUrl = URL.createObjectURL(blob);
    localAudioUrlRef.current = localAudioUrl;
    const extension = resolvedMime.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `theory-recording-${Date.now()}.${extension}`, { type: resolvedMime });
    const events = (Array.isArray(eventsRef.current) ? eventsRef.current : [])
      .map((event) => ({ ...event }))
      .sort((left, right) => {
        const delta = left.t - right.t;
        if (delta !== 0) return delta;
        if (left.type === right.type) return 0;
        if (left.type === THEORY_RECORDING_EVENT_CODE) return -1;
        if (right.type === THEORY_RECORDING_EVENT_CODE) return 1;
        return 0;
      })
      .slice(0, THEORY_RECORDING_MAX_EVENTS);
    const safeDuration = Math.max(
      0,
      Math.round(durationMs || 0),
      events.length > 0 ? Number(events[events.length - 1].t || 0) : 0
    );
    const updatedAt = new Date().toISOString();
    if (!createdAtRef.current) createdAtRef.current = updatedAt;
    setDraft({
      version: THEORY_RECORDING_VERSION,
      initialCode: initialCodeAtStartRef.current,
      durationMs: safeDuration,
      events,
      audio: {
        url: localAudioUrl,
        storageName: '',
        name: file.name,
        sizeBytes: file.size,
        isNew: true,
        file,
      },
      createdAt: createdAtRef.current,
      updatedAt,
    });
    setElapsedMs(safeDuration);
    setEventCount(events.length);
    if (events.length >= THEORY_RECORDING_MAX_EVENTS) {
      setRecordingError('Запись достигла лимита событий. Сократите длительность или количество действий.');
    } else {
      setRecordingError('');
    }
  }, [revokeLocalAudioUrl, stopMediaStream]);

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    const stopMs = getNowMs();
    clearRecordTimers();
    flushScheduledSnapshots();
    appendCodeEvent(stopMs, editorRef.current?.getValue?.() || '', true);
    appendSelectionEvent(stopMs, getEditorSelections(), true);
    setElapsedMs(stopMs);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        finalizeRecording(stopMs, recorder?.mimeType || '');
      }
    } else {
      finalizeRecording(stopMs, recorder?.mimeType || '');
    }
  }, [
    appendCodeEvent,
    appendSelectionEvent,
    clearRecordTimers,
    finalizeRecording,
    flushScheduledSnapshots,
    getEditorSelections,
    getNowMs,
  ]);

  const startRecording = useCallback(async () => {
    if (disabled || isRecordingRef.current) return;
    setRecordingError('');
    const editor = editorRef.current;
    if (!editor) {
      setRecordingError('Редактор еще не готов. Попробуйте через секунду.');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setRecordingError('Браузер не поддерживает запись микрофона.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setRecordingError('В этом браузере недоступна запись аудио.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      mediaStreamRef.current = stream;
      chunksRef.current = [];
      eventsRef.current = [];
      lastCodeRef.current = '';
      lastSelectionSignatureRef.current = '';
      const mimeType = getPreferredAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event?.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setRecordingError('Произошла ошибка во время записи аудио.');
      };
      recorder.onstop = () => {
        finalizeRecording(getNowMs(), recorder.mimeType || mimeType);
      };

      initialCodeAtStartRef.current = editor.getValue() || '';
      recordingStartedAtRef.current = performance.now();
      isRecordingRef.current = true;
      setIsRecording(true);
      setElapsedMs(0);
      setEventCount(0);
      appendCodeEvent(0, initialCodeAtStartRef.current, true);
      appendSelectionEvent(0, getEditorSelections(), true);
      recorder.start(250);

      elapsedTimerRef.current = setInterval(() => {
        setElapsedMs(getNowMs());
      }, 100);
    } catch (error) {
      stopMediaStream();
      setRecordingError(error?.message || 'Не удалось получить доступ к микрофону.');
    }
  }, [
    appendCodeEvent,
    appendSelectionEvent,
    disabled,
    finalizeRecording,
    getEditorSelections,
    getNowMs,
    stopMediaStream,
  ]);

  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;
    const model = editor.getModel();
    if (model && model.getValue() !== code) {
      model.setValue(code || '');
    }

    if (contentDisposableRef.current) {
      contentDisposableRef.current.dispose();
      contentDisposableRef.current = null;
    }
    if (selectionDisposableRef.current) {
      selectionDisposableRef.current.dispose();
      selectionDisposableRef.current = null;
    }

    if (model) {
      contentDisposableRef.current = model.onDidChangeContent(() => {
        const nextCode = model.getValue();
        setCode(nextCode);
        if (!isRecordingRef.current) return;
        if (!codeDebounceTimerRef.current) {
          codeDebounceTimerRef.current = setTimeout(() => {
            codeDebounceTimerRef.current = null;
            appendCodeEvent(getNowMs(), model.getValue());
          }, CODE_SNAPSHOT_DEBOUNCE_MS);
        }
      });
    }

    selectionDisposableRef.current = editor.onDidChangeCursorSelection(() => {
      if (!isRecordingRef.current) return;
      if (!selectionDebounceTimerRef.current) {
        selectionDebounceTimerRef.current = setTimeout(() => {
          selectionDebounceTimerRef.current = null;
          appendSelectionEvent(getNowMs(), getEditorSelections());
        }, SELECTION_SNAPSHOT_DEBOUNCE_MS);
      }
    });
  }, [appendCodeEvent, appendSelectionEvent, code, getEditorSelections, getNowMs]);

  const runPythonInMainThread = useCallback(async (source, inputValue) => {
    if (typeof ensurePyodideReady !== 'function') {
      return {
        output: '',
        error: 'Запуск Python недоступен: движок не инициализирован.',
      };
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
  }, [ensurePyodideReady]);

  const handleRunCode = useCallback(async () => {
    if (disabled || isRunningCode) return;
    const editorCode = editorRef.current?.getValue?.() || code || '';
    if (!String(editorCode).trim()) {
      setRunOutput('');
      setRunError('Добавьте код перед запуском.');
      return;
    }
    const runSeq = runRequestSeqRef.current + 1;
    runRequestSeqRef.current = runSeq;
    setIsRunningCode(true);
    setRunError('');

    if (isRecordingRef.current) {
      flushScheduledSnapshots();
      const stampMs = getNowMs();
      appendCodeEvent(stampMs, editorCode, true);
      appendSelectionEvent(stampMs, getEditorSelections(), true);
    }

    try {
      const result = await runPythonInMainThread(editorCode, runInput);
      if (runRequestSeqRef.current !== runSeq) return;
      const nextOutput = String(result?.output ?? '');
      const nextError = String(result?.error ?? '');
      setRunOutput(nextOutput);
      setRunError(nextError);
      if (isRecordingRef.current) {
        appendRunOutputEvent(getNowMs(), {
          input: runInput,
          output: nextOutput,
          error: nextError,
        });
      }
    } catch (error) {
      if (runRequestSeqRef.current !== runSeq) return;
      const message = error?.message || 'Не удалось выполнить код.';
      setRunOutput('');
      setRunError(String(message));
      if (isRecordingRef.current) {
        appendRunOutputEvent(getNowMs(), {
          input: runInput,
          output: '',
          error: String(message),
        });
      }
    } finally {
      if (runRequestSeqRef.current === runSeq) {
        setIsRunningCode(false);
      }
    }
  }, [
    appendCodeEvent,
    appendRunOutputEvent,
    appendSelectionEvent,
    code,
    disabled,
    flushScheduledSnapshots,
    getEditorSelections,
    getNowMs,
    isRunningCode,
    runInput,
    runPythonInMainThread,
  ]);

  const handleResetDraft = useCallback(() => {
    if (isRecordingRef.current) return;
    setDraft(null);
    setEventCount(0);
    setElapsedMs(0);
    setRunOutput('');
    setRunError('');
    setRecordingError('');
    revokeLocalAudioUrl();
  }, [revokeLocalAudioUrl]);

  useEffect(() => {
    if (typeof onDraftChange === 'function') {
      onDraftChange(draft);
    }
  }, [draft, onDraftChange]);

  useEffect(() => () => {
    runRequestSeqRef.current += 1;
    isRecordingRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.onstop = null;
        recorder.stop();
      } catch {
        /* no-op */
      }
    }
    clearRecordTimers();
    stopMediaStream();
    revokeLocalAudioUrl();
    if (contentDisposableRef.current) contentDisposableRef.current.dispose();
    if (selectionDisposableRef.current) selectionDisposableRef.current.dispose();
  }, [clearRecordTimers, revokeLocalAudioUrl, stopMediaStream]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {!isRecording ? (
            <Button onClick={startRecording} disabled={disabled}>
              Запись теории
            </Button>
          ) : (
            <Button onClick={stopRecording} disabled={disabled}>
              Остановить запись
            </Button>
          )}
          <Button variant="secondary" onClick={handleResetDraft} disabled={disabled || isRecording}>
            Сбросить черновик
          </Button>
          <div className="text-xs text-slate-500">
            {isRecording ? 'Идет запись...' : 'Запись остановлена'}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>{`Длительность: ${formatRecordingDuration(elapsedMs)}`}</span>
          <span>{`Событий: ${eventCount}`}</span>
        </div>
        {recordingError && (
          <div className="mt-2 text-xs text-red-600">{recordingError}</div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-800">
        <Editor
          height="260px"
          language="python"
          theme="vs-dark"
          defaultValue={code}
          path={editorPath}
          saveViewState={false}
          onMount={handleEditorMount}
          options={RECORDING_EDITOR_OPTIONS}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ввод для запуска (stdin)</div>
            <textarea
              value={runInput}
              onChange={(event) => setRunInput(event.target.value)}
              placeholder="Необязательно. Можно оставить пустым."
              spellCheck={false}
              className="mt-1 w-full min-h-[72px] resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-purple-400"
            />
          </div>
          <div className="sm:pl-2">
            <Button
              onClick={handleRunCode}
              disabled={disabled || isRunningCode}
              variant="secondary"
            >
              {isRunningCode ? 'Запуск...' : 'Запустить код'}
            </Button>
          </div>
        </div>
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-950 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Вывод</div>
          <pre className="mt-1 max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-100">{runOutput || 'Вывод появится после запуска кода.'}</pre>
          {runError && (
            <div className="mt-2 border-t border-slate-800 pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-300">Ошибки</div>
              <pre className="mt-1 max-h-[120px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-rose-200">{runError}</pre>
            </div>
          )}
        </div>
      </div>

      <div className="text-[11px] text-slate-500">
        Во время записи сохраняются аудио с микрофона, изменения кода, выделения в редакторе и результаты запусков (stdin/stdout/stderr).
      </div>

      {draft && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Предпросмотр видеоразбора</div>
          <TheoryRecordingPlayer recording={draft} className="mt-2" />
        </div>
      )}
    </div>
  );
};

export default TheoryRecordingEditor;
